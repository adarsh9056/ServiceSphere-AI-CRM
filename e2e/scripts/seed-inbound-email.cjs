/**
 * Creates one INBOUND Email row for E2E / Playwright (simulates a successful IMAP import).
 * Run from repo root with DATABASE_URL (via server/.env). Prints one JSON line to stdout.
 *
 * Env:
 *   E2E_LEAD_EMAIL — lead to attach to (default: jordan@northwind.example after seed)
 *   E2E_INBOUND_SUBJECT — email subject line
 *   E2E_MESSAGE_ID — optional RFC Message-ID (must be unique)
 */
const path = require('path');

const serverRoot = path.join(__dirname, '..', '..', 'server');
process.chdir(serverRoot);
require('dotenv').config({ path: path.join(serverRoot, '.env') });

const { PrismaClient } = require('@prisma/client');

async function main() {
  const prisma = new PrismaClient();
  const leadEmail = process.env.E2E_LEAD_EMAIL || 'jordan@northwind.example';
  const subject =
    process.env.E2E_INBOUND_SUBJECT || `E2E inbound ${Date.now()}`;
  const messageId =
    process.env.E2E_MESSAGE_ID || `<e2e-${Date.now()}-${Math.random().toString(36).slice(2)}@playwright.local>`;

  try {
    const lead = await prisma.lead.findFirst({
      where: { email: { equals: leadEmail, mode: 'insensitive' } },
    });
    if (!lead) {
      throw new Error(
        `No lead with email ${leadEmail}. Run: cd server && npx prisma db seed`,
      );
    }

    const existing = await prisma.email.findFirst({ where: { messageId } });
    if (existing) {
      const payload = {
        leadId: lead.id,
        subject: existing.subject,
        messageId: existing.messageId,
        skipped: true,
      };
      process.stderr.write(`[seed-inbound] duplicate messageId, skipping\n`);
      process.stdout.write(`${JSON.stringify(payload)}\n`);
      return;
    }

    await prisma.email.create({
      data: {
        direction: 'INBOUND',
        subject,
        body: 'E2E seeded inbound body',
        messageId,
        leadId: lead.id,
        fromAddress: leadEmail,
        toAddress: 'crm@servicesphere.local',
        threadKey: messageId,
        mailbox: 'E2E',
        syncedAt: new Date(),
      },
    });

    const payload = { leadId: lead.id, subject, messageId };
    process.stdout.write(`${JSON.stringify(payload)}\n`);
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((err) => {
  process.stderr.write(`${err.stack || err.message}\n`);
  process.exit(1);
});
