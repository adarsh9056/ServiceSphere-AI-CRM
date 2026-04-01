const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '.env') });

const { PrismaClient, UserRole, LeadStatus, DealStage } = require('@prisma/client');
const bcrypt = require('bcrypt');

const prisma = new PrismaClient();

async function main() {
  const admin = await prisma.user.upsert({
    where: { email: 'admin@servicesphere.dev' },
    update: {},
    create: {
      name: 'Alex Admin',
      email: 'admin@servicesphere.dev',
      password: await bcrypt.hash('admin123', 10),
      role: UserRole.ADMIN,
    },
  });

  const manager = await prisma.user.upsert({
    where: { email: 'manager@servicesphere.dev' },
    update: {},
    create: {
      name: 'Morgan Manager',
      email: 'manager@servicesphere.dev',
      password: await bcrypt.hash('manager123', 10),
      role: UserRole.MANAGER,
    },
  });

  const rep = await prisma.user.upsert({
    where: { email: 'sales@servicesphere.dev' },
    update: {},
    create: {
      name: 'Sam Sales',
      email: 'sales@servicesphere.dev',
      password: await bcrypt.hash('sales123', 10),
      role: UserRole.SALESPERSON,
    },
  });

  await prisma.roundRobinState.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  });

  const ruleCount = await prisma.automationRule.count();
  if (ruleCount === 0) {
    await prisma.automationRule.createMany({
      data: [
        {
          name: 'Auto-assign new leads (round-robin)',
          trigger: 'LEAD_CREATED',
          action: 'ASSIGN_ROUND_ROBIN',
          enabled: true,
        },
        {
          name: 'Stale deal reminder',
          trigger: 'STALE_DEAL_7D',
          action: 'EMAIL_REMINDER',
          enabled: true,
        },
        {
          name: 'Qualified → WhatsApp',
          trigger: 'DEAL_STAGE_CHANGED',
          action: 'SEND_WHATSAPP_QUALIFIED',
          config: { toStage: 'QUALIFIED' },
          enabled: true,
        },
        {
          name: 'Negative sentiment → manager',
          trigger: 'SENTIMENT_NEGATIVE',
          action: 'NOTIFY_MANAGER',
          enabled: true,
        },
      ],
    });
  }

  if ((await prisma.lead.count()) > 0) {
    console.log('Seed OK — users ensured; demo data already exists');
    return;
  }

  const account = await prisma.account.create({
    data: {
      name: 'Northwind Labs',
      website: 'https://northwind.example',
      industry: 'Software',
      ownerId: rep.id,
    },
  });

  const leadA = await prisma.lead.create({
    data: {
      name: 'Jordan Lee',
      company: 'Northwind Labs',
      email: 'jordan@northwind.example',
      phone: '+15550001111',
      status: LeadStatus.QUALIFIED,
      source: 'Website',
      score: 72,
      assignedToId: rep.id,
      notes: 'Interested in enterprise rollout',
      companySize: 120,
      accountId: account.id,
    },
  });

  await prisma.contact.create({
    data: {
      accountId: account.id,
      leadId: leadA.id,
      firstName: 'Jordan',
      lastName: 'Lee',
      email: 'jordan@northwind.example',
      isPrimary: true,
      title: 'VP Sales',
    },
  });

  const dealA = await prisma.deal.create({
    data: {
      leadId: leadA.id,
      stage: DealStage.QUALIFIED,
      value: 45000,
      expectedCloseDate: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000),
      ownerId: rep.id,
    },
  });

  await prisma.dealStageHistory.create({
    data: {
      dealId: dealA.id,
      fromStage: null,
      toStage: DealStage.QUALIFIED,
      changedById: rep.id,
      reason: 'Initial (seed)',
    },
  });

  await prisma.task.createMany({
    data: [
      {
        leadId: leadA.id,
        dealId: dealA.id,
        title: 'Send pricing PDF',
        status: 'OPEN',
        priority: 'HIGH',
        assignedToId: rep.id,
        createdById: rep.id,
        dueAt: new Date(Date.now() + 2 * 24 * 60 * 60 * 1000),
      },
      {
        leadId: leadA.id,
        title: 'Discovery call follow-up',
        status: 'DONE',
        priority: 'NORMAL',
        assignedToId: rep.id,
        createdById: rep.id,
      },
    ],
  });

  await prisma.note.createMany({
    data: [
      {
        leadId: leadA.id,
        body: 'Strong product fit; wants SSO and audit logs in phase 1.',
        createdById: rep.id,
      },
      {
        accountId: account.id,
        body: 'Parent account note: multi-year potential.',
        createdById: manager.id,
      },
    ],
  });

  await prisma.email.create({
    data: {
      leadId: leadA.id,
      direction: 'OUTBOUND',
      subject: 'Thanks for the call',
      body: 'Great speaking today — next steps attached.',
      fromAddress: 'sam@sales.example',
      toAddress: 'jordan@northwind.example',
      threadKey: 'seed-thread-1',
    },
  });

  const leadB = await prisma.lead.create({
    data: {
      name: 'Riley Chen',
      company: 'Acme Co',
      email: 'riley@acme.example',
      status: LeadStatus.NEW,
      source: 'Referral',
      score: 55,
      assignedToId: rep.id,
      companySize: 40,
    },
  });

  const dealB = await prisma.deal.create({
    data: {
      leadId: leadB.id,
      stage: DealStage.NEW,
      value: 12000,
      ownerId: rep.id,
    },
  });

  await prisma.dealStageHistory.create({
    data: {
      dealId: dealB.id,
      fromStage: null,
      toStage: DealStage.NEW,
      changedById: rep.id,
      reason: 'Deal created',
    },
  });

  await prisma.task.create({
    data: {
      leadId: leadB.id,
      dealId: dealB.id,
      title: 'Qualify budget & timeline',
      status: 'OPEN',
      assignedToId: rep.id,
      createdById: rep.id,
    },
  });

  console.log('Seed OK —', { admin: admin.email, manager: manager.email, rep: rep.email });
}

main()
  .then(() => prisma.$disconnect())
  .catch((e) => {
    console.error(e);
    prisma.$disconnect();
    process.exit(1);
  });
