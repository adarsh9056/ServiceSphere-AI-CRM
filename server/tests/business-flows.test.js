const { test, before, after } = require('node:test');
const assert = require('node:assert');
const bcrypt = require('bcrypt');
const { PrismaClient, UserRole, DealStage } = require('@prisma/client');
const { findLeadForAddress, importInboundFromParsed } = require('../services/imapSyncService');
const automation = require('../services/automationEngine');

const prisma = new PrismaClient();
const suffix = () => `bf${Date.now()}_${Math.floor(Math.random() * 10000)}`;

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for integration tests');
  }
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test('findLeadForAddress matches lead email (case-insensitive)', async () => {
  const id = suffix();
  const email = `lead-${id}@import-test.dev`;
  const lead = await prisma.lead.create({
    data: {
      name: 'Import Test Lead',
      email,
      status: 'NEW',
      score: 50,
    },
  });
  try {
    const found = await findLeadForAddress(prisma, `Some Name <${email.toUpperCase()}>`);
    assert.ok(found);
    assert.equal(found.id, lead.id);
  } finally {
    await prisma.lead.delete({ where: { id: lead.id } });
  }
});

test('findLeadForAddress matches contact email to parent lead', async () => {
  const id = suffix();
  const cEmail = `contact-${id}@import-test.dev`;
  const lead = await prisma.lead.create({
    data: {
      name: 'Parent',
      email: `parent-${id}@import-test.dev`,
      status: 'NEW',
      score: 50,
    },
  });
  await prisma.contact.create({
    data: {
      leadId: lead.id,
      firstName: 'C',
      lastName: 'Person',
      email: cEmail,
    },
  });
  try {
    const found = await findLeadForAddress(prisma, cEmail);
    assert.ok(found);
    assert.equal(found.id, lead.id);
  } finally {
    await prisma.contact.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
  }
});

test('importInboundFromParsed creates Email and dedupes by messageId', async () => {
  const id = suffix();
  const fromAddr = `sender-${id}@external.dev`;
  const lead = await prisma.lead.create({
    data: {
      name: 'Match Lead',
      email: fromAddr,
      status: 'NEW',
      score: 50,
    },
  });
  const mid = `<msg-${id}@test.message.id>`;
  const parsed = {
    from: { value: [{ address: fromAddr }] },
    subject: 'Hello',
    text: 'Body text',
    messageId: mid,
  };
  try {
    const r1 = await importInboundFromParsed(prisma, { parsed, uid: 42, mailbox: 'INBOX' });
    assert.equal(r1.imported, true);
    assert.equal(r1.leadId, lead.id);

    const rows = await prisma.email.findMany({ where: { leadId: lead.id, messageId: mid } });
    assert.equal(rows.length, 1);

    const r2 = await importInboundFromParsed(prisma, { parsed, uid: 43, mailbox: 'INBOX' });
    assert.equal(r2.imported, false);
    assert.equal(r2.duplicate, true);
  } finally {
    await prisma.email.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
  }
});

test('afterDealStageChange logs automation for QUALIFIED transition (WhatsApp rule)', async () => {
  const id = suffix();
  const hash = await bcrypt.hash('x', 10);
  const rep = await prisma.user.create({
    data: {
      name: `Rep ${id}`,
      email: `rep-${id}@test.dev`,
      password: hash,
      role: UserRole.SALESPERSON,
    },
  });
  const rule = await prisma.automationRule.create({
    data: {
      name: `Rule ${id}`,
      trigger: 'DEAL_STAGE_CHANGED',
      action: 'SEND_WHATSAPP_QUALIFIED',
      config: { toStage: 'QUALIFIED' },
      enabled: true,
    },
  });
  const lead = await prisma.lead.create({
    data: {
      name: 'Auto Lead',
      email: `l-${id}@test.dev`,
      phone: '+15555550199',
      status: 'QUALIFIED',
      score: 50,
      assignedToId: rep.id,
    },
  });
  const deal = await prisma.deal.create({
    data: {
      leadId: lead.id,
      stage: DealStage.NEW,
      ownerId: rep.id,
      lastStageChangeAt: new Date(),
    },
  });
  try {
    await prisma.deal.update({
      where: { id: deal.id },
      data: { stage: DealStage.QUALIFIED, lastStageChangeAt: new Date() },
    });
    const updated = await prisma.deal.findUnique({
      where: { id: deal.id },
      include: { lead: true },
    });

    await automation.afterDealStageChange(prisma, {
      deal: updated,
      previousStage: 'NEW',
      lead: updated.lead,
    });

    const execs = await prisma.automationExecution.findMany({
      where: { ruleId: rule.id, triggerKey: 'DEAL_STAGE_CHANGED' },
      orderBy: { createdAt: 'desc' },
    });
    assert.ok(execs.length >= 1, 'expected at least one automation execution');
    assert.ok(['SUCCESS', 'SKIPPED'].includes(execs[0].status), `got ${execs[0].status}`);
  } finally {
    await prisma.automationExecution.deleteMany({ where: { ruleId: rule.id } });
    await prisma.deal.deleteMany({ where: { leadId: lead.id } });
    await prisma.lead.delete({ where: { id: lead.id } });
    await prisma.automationRule.delete({ where: { id: rule.id } });
    await prisma.user.delete({ where: { id: rep.id } });
  }
});
