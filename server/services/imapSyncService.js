const imaps = require('imap-simple');
const { simpleParser } = require('mailparser');
const { log } = require('../middleware/logger');

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
 * Fetch new messages since lastUid, parse, match to leads/contacts, persist Email rows.
 */
async function syncInboundEmails(prisma) {
  if (!process.env.IMAP_HOST || !process.env.IMAP_USER || !process.env.IMAP_PASS) {
    log('info', 'imap_sync_skipped', { reason: 'missing_env' });
    return { skipped: true, imported: 0 };
  }

  const port = Number(process.env.IMAP_PORT || 993);
  const tls = process.env.IMAP_TLS !== 'false';

  const config = {
    imap: {
      user: process.env.IMAP_USER,
      password: process.env.IMAP_PASS,
      host: process.env.IMAP_HOST,
      port,
      tls,
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

  let messages = [];
  try {
    messages = await connection.search(['UNSEEN'], {
      bodies: [''],
      struct: true,
    });
  } catch (err) {
    log('error', 'imap_search_failed', { message: err.message });
    await connection.end();
    return { skipped: true, imported: 0, error: err.message };
  }

  let maxUid = state.lastUid;
  let imported = 0;

  for (const item of messages) {
    const uid = item.attributes?.uid;
    if (uid != null && uid > maxUid) maxUid = uid;
    const part = item.parts?.find((p) => p.which === '');
    if (!part?.body) continue;
    let parsed;
    try {
      parsed = await simpleParser(part.body);
    } catch {
      continue;
    }
    const from = parsed.from?.value?.[0]?.address || parsed.from?.text;
    const subject = parsed.subject || '';
    const text = parsed.text || parsed.html || '';
    const messageId = parsed.messageId || null;
    const inReplyTo = parsed.inReplyTo || null;

    const existing = messageId
      ? await prisma.email.findFirst({ where: { messageId } })
      : null;
    if (existing) continue;

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
    imported += 1;
  }

  await prisma.imapSyncState.update({
    where: { id: 'default' },
    data: { lastUid: maxUid },
  });

  try {
    await connection.end();
  } catch {
    /* ignore */
  }

  log('info', 'imap_sync_complete', { imported, lastUid: maxUid });
  return { skipped: false, imported, lastUid: maxUid };
}

module.exports = { syncInboundEmails, findLeadForAddress };
