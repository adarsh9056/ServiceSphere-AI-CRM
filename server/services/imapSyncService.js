const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { log } = require('../middleware/logger');

function envBool(name, defaultValue) {
  const raw = process.env[name];
  if (raw == null || raw === '') return defaultValue;
  return !['false', '0', 'no', 'off'].includes(String(raw).trim().toLowerCase());
}

function normalizeAddr(s) {
  if (!s) return null;
  const m = String(s).match(/<([^>]+)>/);
  const raw = m ? m[1] : s;
  return raw.trim().toLowerCase();
}

async function findLeadForAddress(prisma, address) {
  const a = normalizeAddr(address);
  if (!a) return null;
  const lead = await prisma.lead.findFirst({
    where: { email: { equals: a, mode: 'insensitive' } },
  });
  if (lead) return lead;
  const contact = await prisma.contact.findFirst({
    where: { email: { equals: a, mode: 'insensitive' } },
    include: { lead: true },
  });
  if (contact?.leadId) {
    return prisma.lead.findUnique({ where: { id: contact.leadId } });
  }
  return null;
}

/**
 * Persist one inbound message (used by IMAP sync and integration tests).
 * Returns whether a new row was created (false if duplicate messageId).
 */
async function importInboundFromParsed(prisma, { parsed, uid, mailbox }) {
  const from = parsed.from?.value?.[0]?.address || parsed.from?.text;
  const subject = parsed.subject || '';
  const text = parsed.text || parsed.html || '';
  const messageId = parsed.messageId || null;
  const inReplyTo = parsed.inReplyTo || null;

  if (messageId) {
    const existing = await prisma.email.findFirst({ where: { messageId } });
    if (existing) {
      return { imported: false, duplicate: true, leadId: existing.leadId };
    }
  }

  const lead = await findLeadForAddress(prisma, from);
  const threadKey =
    inReplyTo ||
    messageId ||
    `thread-${subject.slice(0, 40)}-${normalizeAddr(from) || 'na'}`;

  await prisma.email.create({
    data: {
      direction: 'INBOUND',
      subject,
      body: text.slice(0, 50000),
      messageId: messageId || undefined,
      inReplyTo: inReplyTo || undefined,
      threadKey,
      fromAddress: from || undefined,
      toAddress: parsed.to?.text || undefined,
      leadId: lead?.id,
      imapUid: uid || undefined,
      mailbox,
      syncedAt: new Date(),
    },
  });

  if (lead?.id) {
    await prisma.lead.update({
      where: { id: lead.id },
      data: { repliedEmail: true },
    });
  }

  return { imported: true, duplicate: false, leadId: lead?.id || null };
}

/**
 * Incremental IMAP sync using UID range (not UNSEEN), so messages already read
 * elsewhere still import. Batches with IMAP_SYNC_BATCH_SIZE to avoid huge catch-ups.
 */
async function syncInboundEmails(prisma) {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
    log('info', 'imap_sync_skipped', { reason: 'missing_env' });
    return { skipped: true, imported: 0 };
  }

  const port = Number(process.env.IMAP_PORT || 993);
  const tls = envBool('IMAP_TLS', true);
  const rejectUnauthorized = envBool('IMAP_TLS_REJECT_UNAUTHORIZED', true);
  const batchSize = Math.max(1, Math.min(2000, Number(process.env.IMAP_SYNC_BATCH_SIZE || 200)));

  const config = {
    imap: {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASS,
      host: process.env.IMAP_HOST,
      port,
      tls,
      tlsOptions: tls ? { rejectUnauthorized } : undefined,
      authTimeout: 15000,
    },
  };

  const mailbox = process.env.IMAP_MAILBOX || 'INBOX';
  let connection;
  try {
    connection = await imaps.connect(config);
    await connection.openBox(mailbox);
  } catch (err) {
    log('error', 'imap_connect_failed', { message: err.message });
    return { skipped: true, imported: 0, error: err.message };
  }

  const state = await prisma.imapSyncState.upsert({
    where: { id: 'default' },
    create: { id: 'default', lastUid: 0 },
    update: {},
  });

  const fetchFrom = Math.max(1, state.lastUid + 1);
  const searchCriteria = [['UID', `${fetchFrom}:*`]];

  let messages = [];
  try {
    messages = await connection.search(searchCriteria, {
      bodies: [''],
      struct: true,
    });
  } catch (err) {
    log('error', 'imap_search_failed', { message: err.message, fetchFrom });
    await connection.end();
    return { skipped: true, imported: 0, error: err.message };
  }

  messages.sort((a, b) => (a.attributes?.uid || 0) - (b.attributes?.uid || 0));
  if (messages.length > batchSize) {
    messages = messages.slice(0, batchSize);
  }

  if (messages.length === 0) {
    try {
      await connection.end();
    } catch {
      /* ignore */
    }
    log('info', 'imap_sync_complete', { imported: 0, lastUid: state.lastUid, fetchFrom, note: 'no_uids' });
    return { skipped: false, imported: 0, lastUid: state.lastUid, fetchFrom };
  }

  let batchMaxUid = state.lastUid;
  let imported = 0;

  for (const item of messages) {
    const uid = item.attributes?.uid;
    if (uid != null) batchMaxUid = Math.max(batchMaxUid, uid);

    const part = item.parts?.find((p) => p.which === '');
    if (!part?.body) continue;

    let parsed;
    try {
      parsed = await simpleParser(part.body);
    } catch {
      continue;
    }

    const result = await importInboundFromParsed(prisma, { parsed, uid, mailbox });
    if (result.imported) imported += 1;
  }

  await prisma.imapSyncState.update({
    where: { id: 'default' },
    data: { lastUid: batchMaxUid },
  });

  try {
    await connection.end();
  } catch {
    /* ignore */
  }

  log('info', 'imap_sync_complete', {
    imported,
    lastUid: batchMaxUid,
    fetchFrom,
    batchSize: messages.length,
  });
  return { skipped: false, imported, lastUid: batchMaxUid, fetchFrom };
}

module.exports = {
  syncInboundEmails,
  findLeadForAddress,
  importInboundFromParsed,
  normalizeAddr,
  envBool,
};
