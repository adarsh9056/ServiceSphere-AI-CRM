const bcrypt = require('bcrypt');
const crypto = require('crypto');
const { PrismaClient, UserRole, Prisma } = require('@prisma/client');
const { requireAuth, requireRole } = require('../middleware/auth');
const {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
} = require('../middleware/loginThrottle');
const { signAccessToken, createRefreshToken, consumeRefreshToken } = require('../auth/tokens');
const {
  setRefreshTokenCookie,
  clearRefreshTokenCookie,
  getRefreshTokenFromRequest,
} = require('../auth/cookies');
const { log } = require('../middleware/logger');
const { parseLeadsCsv, leadsToCsv } = require('../services/csvLeadsService');
const { sendMail, sendPasswordResetEmail } = require('../services/emailService');
const { generateFollowUpEmail, analyzeSentiment } = require('../services/aiService');
const { computeLeadScore } = require('../services/leadScore');
const automation = require('../services/automationEngine');
const { syncInboundEmails } = require('../services/imapSyncService');

const prisma = new PrismaClient();

const includeLeadList = {
  assignedTo: true,
  deals: { include: { owner: true } },
};

const includeLeadDetail = {
  assignedTo: true,
  account: true,
  contacts: true,
  deals: {
    orderBy: { updatedAt: 'desc' },
    include: {
      owner: true,
      stageHistory: { include: { changedBy: true }, orderBy: { createdAt: 'desc' } },
    },
  },
  tasks: { include: { assignedTo: true, createdBy: true }, orderBy: { dueAt: 'asc' } },
  leadNotes: { include: { createdBy: true }, orderBy: { createdAt: 'desc' } },
  attachments: { orderBy: { createdAt: 'desc' }, take: 100 },
  emails: { orderBy: { createdAt: 'desc' }, take: 100 },
  whatsappMessages: { orderBy: { createdAt: 'desc' }, take: 50 },
  activities: {
    orderBy: { createdAt: 'desc' },
    take: 80,
    include: { user: true },
  },
};

const includeDeal = {
  lead: { include: includeLeadList },
  owner: true,
  stageHistory: { include: { changedBy: true }, orderBy: { createdAt: 'desc' } },
};

function canAccessLead(user, lead) {
  if (!lead) return false;
  if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) return false;
  return true;
}

async function buildTimeline(leadId) {
  const lead = await prisma.lead.findUnique({
    where: { id: leadId },
    include: {
      emails: { orderBy: { createdAt: 'desc' }, take: 50 },
      whatsappMessages: { orderBy: { createdAt: 'desc' }, take: 30 },
      activities: { orderBy: { createdAt: 'desc' }, take: 50, include: { user: true } },
      leadNotes: { orderBy: { createdAt: 'desc' }, take: 30, include: { createdBy: true } },
      deals: {
        include: {
          stageHistory: {
            orderBy: { createdAt: 'desc' },
            include: { changedBy: true },
          },
        },
      },
    },
  });
  if (!lead) return [];

  const events = [];

  for (const e of lead.emails) {
    events.push({
      id: `email-${e.id}`,
      kind: 'email',
      at: e.createdAt.toISOString(),
      title: e.direction === 'INBOUND' ? 'Inbound email' : 'Outbound email',
      subtitle: e.subject || '(no subject)',
      meta: e.fromAddress || e.toAddress || '',
    });
  }
  for (const w of lead.whatsappMessages) {
    events.push({
      id: `wa-${w.id}`,
      kind: 'whatsapp',
      at: w.createdAt.toISOString(),
      title: 'WhatsApp',
      subtitle: w.direction,
      meta: w.phone,
    });
  }
  for (const a of lead.activities) {
    events.push({
      id: `act-${a.id}`,
      kind: 'activity',
      at: a.createdAt.toISOString(),
      title: a.type,
      subtitle: a.description,
      meta: a.user?.name || '',
    });
  }
  for (const n of lead.leadNotes) {
    events.push({
      id: `note-${n.id}`,
      kind: 'note',
      at: n.createdAt.toISOString(),
      title: 'Note',
      subtitle: n.body.slice(0, 120),
      meta: n.createdBy?.name || '',
    });
  }
  for (const d of lead.deals) {
    for (const h of d.stageHistory) {
      events.push({
        id: `stage-${h.id}`,
        kind: 'stage',
        at: h.createdAt.toISOString(),
        title: 'Deal stage',
        subtitle: `${h.fromStage || '—'} → ${h.toStage}`,
        meta: h.changedBy?.name || '',
      });
    }
  }

  events.sort((a, b) => new Date(b.at) - new Date(a.at));
  return events;
}

const resolvers = {
  Query: {
    me: async (_, __, { user }) => user || null,

    getLeads: async (_, { search, status }, { user }) => {
      requireAuth(user);
      const where = {};
      if (status) where.status = status;
      if (search) {
        where.OR = [
          { name: { contains: search, mode: 'insensitive' } },
          { company: { contains: search, mode: 'insensitive' } },
          { email: { contains: search, mode: 'insensitive' } },
        ];
      }
      if (user.role === UserRole.SALESPERSON) {
        where.assignedToId = user.id;
      }
      return prisma.lead.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: includeLeadList,
      });
    },

    getLead: async (_, { id }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({
        where: { id },
        include: includeLeadDetail,
      });
      if (!lead) return null;
      if (!canAccessLead(user, lead)) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return lead;
    },

    getLeadTimeline: async (_, { leadId }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return [];
      if (!canAccessLead(user, lead)) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return buildTimeline(leadId);
    },

    getDeals: async (_, __, { user }) => {
      requireAuth(user);
      const where = {};
      if (user.role === UserRole.SALESPERSON) {
        where.OR = [{ ownerId: user.id }, { lead: { assignedToId: user.id } }];
      }
      return prisma.deal.findMany({
        where,
        orderBy: { updatedAt: 'desc' },
        include: includeDeal,
      });
    },

    getDeal: async (_, { id }, { user }) => {
      requireAuth(user);
      const deal = await prisma.deal.findUnique({
        where: { id },
        include: includeDeal,
      });
      if (!deal) return null;
      if (
        user.role === UserRole.SALESPERSON &&
        deal.ownerId !== user.id &&
        deal.lead.assignedToId !== user.id
      ) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return deal;
    },

    getDashboardStats: async (_, __, { user }) => {
      requireAuth(user);
      const baseLeadWhere =
        user.role === UserRole.SALESPERSON ? { assignedToId: user.id } : {};

      const totalLeads = await prisma.lead.count({ where: baseLeadWhere });

      const openDealsWhere = {
        stage: { notIn: ['WON', 'LOST'] },
        ...(user.role === UserRole.SALESPERSON
          ? { OR: [{ ownerId: user.id }, { lead: { assignedToId: user.id } }] }
          : {}),
      };
      const openDeals = await prisma.deal.count({ where: openDealsWhere });

      const wonWhere = {
        stage: 'WON',
        ...(user.role === UserRole.SALESPERSON
          ? { OR: [{ ownerId: user.id }, { lead: { assignedToId: user.id } }] }
          : {}),
      };
      const wonAgg = await prisma.deal.aggregate({
        where: wonWhere,
        _sum: { value: true },
      });
      const revenueWon = wonAgg._sum.value ? String(wonAgg._sum.value) : '0';

      const totalDeals = await prisma.deal.count({
        where:
          user.role === UserRole.SALESPERSON
            ? { OR: [{ ownerId: user.id }, { lead: { assignedToId: user.id } }] }
            : {},
      });
      const wonCount = await prisma.deal.count({ where: wonWhere });
      const conversionRate =
        totalDeals > 0 ? Math.round((wonCount / totalDeals) * 1000) / 10 : 0;

      const byUser = await prisma.deal.groupBy({
        by: ['ownerId'],
        where: { stage: 'WON', ownerId: { not: null } },
        _sum: { value: true },
      });
      let topSalesperson = null;
      if (byUser.length) {
        const top = [...byUser].sort(
          (a, b) => Number(b._sum.value || 0) - Number(a._sum.value || 0),
        )[0];
        if (top?.ownerId) {
          topSalesperson = await prisma.user.findUnique({
            where: { id: top.ownerId },
            select: { id: true, name: true, email: true, role: true },
          });
        }
      }

      const statusGroups = await prisma.lead.groupBy({
        by: ['status'],
        where: baseLeadWhere,
        _count: { id: true },
      });
      const leadsByStatus = statusGroups.map((g) => ({
        status: g.status,
        count: g._count.id,
      }));

      const thirtyDaysAgo = new Date();
      thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
      const recentDeals = await prisma.deal.findMany({
        where: {
          createdAt: { gte: thirtyDaysAgo },
          ...(user.role === UserRole.SALESPERSON
            ? { OR: [{ ownerId: user.id }, { lead: { assignedToId: user.id } }] }
            : {}),
        },
        select: { createdAt: true },
      });
      const buckets = {};
      for (let i = 6; i >= 0; i--) {
        const d = new Date();
        d.setDate(d.getDate() - i * 4);
        const key = d.toISOString().slice(0, 10);
        buckets[key] = 0;
      }
      recentDeals.forEach((d) => {
        const key = d.createdAt.toISOString().slice(0, 10);
        if (buckets[key] !== undefined) buckets[key] += 1;
      });
      const dealsTrend = Object.entries(buckets).map(([label, value]) => ({
        label,
        value,
      }));

      return {
        totalLeads,
        openDeals,
        revenueWon,
        conversionRate,
        topSalesperson,
        leadsByStatus,
        dealsTrend,
      };
    },

    getActivities: async (_, { limit = 50 }, { user }) => {
      requireAuth(user);
      const where =
        user.role === UserRole.SALESPERSON
          ? { OR: [{ userId: user.id }, { lead: { assignedToId: user.id } }] }
          : {};
      return prisma.activity.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { lead: true, user: true },
      });
    },

    getEmailsForLead: async (_, { leadId }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return [];
      if (!canAccessLead(user, lead)) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return prisma.email.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });
    },

    getWhatsappForLead: async (_, { leadId }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) return [];
      if (!canAccessLead(user, lead)) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return prisma.whatsappMessage.findMany({
        where: { leadId },
        orderBy: { createdAt: 'desc' },
      });
    },

    getAutomationRules: async (_, __, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      return prisma.automationRule.findMany({ orderBy: { createdAt: 'desc' } });
    },

    exportLeadsCsv: async (_, __, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      const leads = await prisma.lead.findMany({
        orderBy: { updatedAt: 'desc' },
        include: { assignedTo: true },
      });
      return leadsToCsv(leads);
    },

    getAutomationExecutions: async (_, { limit = 50 }, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      return prisma.automationExecution.findMany({
        orderBy: { createdAt: 'desc' },
        take: limit,
        include: { rule: true },
      });
    },
  },

  Mutation: {
    signup: async (_, { name, email, password }, ctx) => {
      const existing = await prisma.user.findUnique({ where: { email } });
      if (existing) throw new Error('Email already registered');

      const role = UserRole.SALESPERSON;
      const hash = await bcrypt.hash(password, 10);
      const user = await prisma.user.create({
        data: { name, email, password: hash, role },
        select: { id: true, name: true, email: true, role: true },
      });
      const refreshToken = await createRefreshToken(prisma, user.id);
      setRefreshTokenCookie(ctx.res, refreshToken);
      return { token: signAccessToken(user), refreshToken: null, user };
    },

    login: async (_, { email, password }, ctx) => {
      await assertLoginAllowed(email, ctx.req);
      const userRecord = await prisma.user.findUnique({ where: { email } });
      if (!userRecord) {
        await recordLoginFailure(email, ctx.req);
        throw new Error('Invalid credentials');
      }
      const ok = await bcrypt.compare(password, userRecord.password);
      if (!ok) {
        await recordLoginFailure(email, ctx.req);
        throw new Error('Invalid credentials');
      }
      await clearLoginFailures(email, ctx.req);
      const user = {
        id: userRecord.id,
        name: userRecord.name,
        email: userRecord.email,
        role: userRecord.role,
      };
      const refreshToken = await createRefreshToken(prisma, user.id);
      setRefreshTokenCookie(ctx.res, refreshToken);
      return { token: signAccessToken(user), refreshToken: null, user };
    },

    refreshSession: async (_, { refreshToken: bodyToken }, ctx) => {
      const raw = bodyToken || getRefreshTokenFromRequest(ctx.req);
      if (!raw) throw new Error('Missing refresh token');
      const user = await consumeRefreshToken(prisma, raw);
      if (!user) throw new Error('Invalid or expired refresh token');
      const nextRefresh = await createRefreshToken(prisma, user.id);
      setRefreshTokenCookie(ctx.res, nextRefresh);
      return { token: signAccessToken(user), refreshToken: null, user };
    },

    logout: async (_, __, ctx) => {
      clearRefreshTokenCookie(ctx.res);
      return true;
    },

    requestPasswordReset: async (_, { email }) => {
      const user = await prisma.user.findUnique({ where: { email } });
      if (!user) return true;
      const token = crypto.randomBytes(32).toString('hex');
      const expiry = new Date(Date.now() + 60 * 60 * 1000);
      await prisma.user.update({
        where: { id: user.id },
        data: { resetToken: token, resetTokenExpiry: expiry },
      });

      const mail = await sendPasswordResetEmail({ to: email, token });
      if (mail.skipped && process.env.NODE_ENV !== 'production') {
        log('warn', 'password_reset_email_skipped_dev', {
          email,
          hint: 'Configure SMTP or set PUBLIC_APP_URL; token not printed for security.',
        });
      } else {
        log('info', 'password_reset_requested', { email, sent: !mail.skipped });
      }
      return true;
    },

    resetPassword: async (_, { token, password }) => {
      const user = await prisma.user.findFirst({
        where: {
          resetToken: token,
          resetTokenExpiry: { gt: new Date() },
        },
      });
      if (!user) throw new Error('Invalid or expired token');
      const hash = await bcrypt.hash(password, 10);
      await prisma.user.update({
        where: { id: user.id },
        data: {
          password: hash,
          resetToken: null,
          resetTokenExpiry: null,
        },
      });
      return true;
    },

    createLead: async (_, args, { user }) => {
      requireAuth(user);
      const data = {
        name: args.name,
        company: args.company,
        email: args.email,
        phone: args.phone,
        status: args.status || 'NEW',
        source: args.source,
        notes: args.notes,
        companySize: args.companySize,
        accountId: args.accountId || undefined,
        assignedToId:
          args.assignedToId ||
          (user.role === UserRole.SALESPERSON ? user.id : undefined),
        score: computeLeadScore({
          companySize: args.companySize || 0,
          openedEmail: false,
          repliedEmail: false,
        }),
      };
      const lead = await prisma.lead.create({
        data,
        include: includeLeadList,
      });
      await prisma.activity.create({
        data: {
          type: 'LEAD_CREATED',
          description: `Lead ${lead.name} created`,
          leadId: lead.id,
          userId: user.id,
        },
      });
      await automation.afterLeadCreated(prisma, lead);
      return prisma.lead.findUnique({
        where: { id: lead.id },
        include: includeLeadDetail,
      });
    },

    updateLead: async (_, { id, ...patch }, { user }) => {
      requireAuth(user);
      const existing = await prisma.lead.findUnique({ where: { id } });
      if (!existing) throw new Error('Lead not found');
      if (user.role === UserRole.SALESPERSON && existing.assignedToId !== user.id) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      const data = { ...patch };
      delete data.id;
      const updated = await prisma.lead.update({
        where: { id },
        data,
        include: includeLeadList,
      });
      const reopen = computeLeadScore({
        openedEmail: updated.openedEmail,
        repliedEmail: updated.repliedEmail,
        companySize: updated.companySize || 0,
        sentiment: updated.sentiment,
        base: patch.score != null ? patch.score : updated.score,
      });
      if (patch.score == null) {
        await prisma.lead.update({ where: { id }, data: { score: reopen } });
      }
      return prisma.lead.findUnique({
        where: { id },
        include: includeLeadDetail,
      });
    },

    createDeal: async (_, { leadId, stage, value, expectedCloseDate }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error('Lead not found');
      if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      const st = stage || 'NEW';
      const deal = await prisma.deal.create({
        data: {
          leadId,
          stage: st,
          value: value != null ? value : undefined,
          expectedCloseDate: expectedCloseDate ? new Date(expectedCloseDate) : undefined,
          ownerId: user.id,
          lastStageChangeAt: new Date(),
        },
        include: includeDeal,
      });
      await prisma.dealStageHistory.create({
        data: {
          dealId: deal.id,
          fromStage: null,
          toStage: st,
          changedById: user.id,
          reason: 'Deal created',
        },
      });
      return prisma.deal.findUnique({
        where: { id: deal.id },
        include: includeDeal,
      });
    },

    moveDeal: async (_, { id, stage, reason }, { user }) => {
      requireAuth(user);
      const deal = await prisma.deal.findUnique({
        where: { id },
        include: { lead: true },
      });
      if (!deal) throw new Error('Deal not found');
      if (
        user.role === UserRole.SALESPERSON &&
        deal.ownerId !== user.id &&
        deal.lead.assignedToId !== user.id
      ) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      const previousStage = deal.stage;
      const updated = await prisma.deal.update({
        where: { id },
        data: {
          stage,
          lastStageChangeAt: new Date(),
        },
        include: includeDeal,
      });
      await prisma.dealStageHistory.create({
        data: {
          dealId: id,
          fromStage: previousStage,
          toStage: stage,
          changedById: user.id,
          reason: reason || null,
        },
      });
      await prisma.activity.create({
        data: {
          type: 'DEAL_MOVED',
          description: `Deal moved from ${previousStage} to ${stage}`,
          leadId: deal.leadId,
          userId: user.id,
        },
      });
      await automation.afterDealStageChange(prisma, {
        deal: { ...updated, lead: deal.lead },
        previousStage,
        lead: deal.lead,
      });
      return prisma.deal.findUnique({
        where: { id },
        include: includeDeal,
      });
    },

    sendEmail: async (_, { leadId, to, subject, body }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error('Lead not found');
      if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      await sendMail({ to, subject, text: body });
      const row = await prisma.email.create({
        data: {
          leadId,
          direction: 'OUTBOUND',
          subject,
          body,
          toAddress: to,
          fromAddress: process.env.SMTP_FROM || 'crm',
        },
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { openedEmail: true },
      });
      return row;
    },

    generateAIReply: async (_, { leadId }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error('Lead not found');
      if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      const body = await generateFollowUpEmail({
        leadName: lead.name,
        company: lead.company,
        notes: lead.notes,
      });
      return { body };
    },

    analyzeEmailSentiment: async (_, { leadId, emailBody }, { user }) => {
      requireAuth(user);
      const lead = await prisma.lead.findUnique({ where: { id: leadId } });
      if (!lead) throw new Error('Lead not found');
      if (user.role === UserRole.SALESPERSON && lead.assignedToId !== user.id) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      const { sentiment } = await analyzeSentiment(emailBody);
      const enumSentiment = sentiment;
      await prisma.lead.update({
        where: { id: leadId },
        data: { sentiment: enumSentiment, repliedEmail: true },
      });
      const newScore = computeLeadScore({
        openedEmail: lead.openedEmail,
        repliedEmail: true,
        companySize: lead.companySize || 0,
        sentiment: enumSentiment,
      });
      await prisma.lead.update({
        where: { id: leadId },
        data: { score: newScore },
      });
      if (enumSentiment === 'NEGATIVE') {
        const managers = await prisma.user.findMany({
          where: { role: UserRole.MANAGER },
        });
        const rule = await prisma.automationRule.findFirst({
          where: { enabled: true, trigger: 'SENTIMENT_NEGATIVE' },
        });
        await automation.notifyManagerNegativeSentiment(prisma, lead, managers, rule);
      }
      return { sentiment: enumSentiment };
    },

    createActivity: async (_, { leadId, type, description }, { user }) => {
      requireAuth(user);
      return prisma.activity.create({
        data: { leadId, type, description, userId: user.id },
        include: { lead: true, user: true },
      });
    },

    createTask: async (_, args, { user }) => {
      requireAuth(user);
      if (args.leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: args.leadId } });
        if (!lead) throw new Error('Lead not found');
        if (!canAccessLead(user, lead)) {
          const err = new Error('Forbidden');
          err.extensions = { code: 'FORBIDDEN' };
          throw err;
        }
      }
      if (args.dealId) {
        const deal = await prisma.deal.findUnique({
          where: { id: args.dealId },
          include: { lead: true },
        });
        if (!deal) throw new Error('Deal not found');
        if (!canAccessLead(user, deal.lead)) {
          const err = new Error('Forbidden');
          err.extensions = { code: 'FORBIDDEN' };
          throw err;
        }
      }
      return prisma.task.create({
        data: {
          title: args.title,
          description: args.description,
          dueAt: args.dueAt ? new Date(args.dueAt) : null,
          priority: args.priority || 'NORMAL',
          leadId: args.leadId || null,
          dealId: args.dealId || null,
          assignedToId: args.assignedToId || user.id,
          createdById: user.id,
        },
        include: { assignedTo: true, createdBy: true },
      });
    },

    updateTaskStatus: async (_, { id, status }, { user }) => {
      requireAuth(user);
      const task = await prisma.task.findUnique({
        where: { id },
        include: { lead: true },
      });
      if (!task) throw new Error('Task not found');
      if (task.lead && !canAccessLead(user, task.lead)) {
        const err = new Error('Forbidden');
        err.extensions = { code: 'FORBIDDEN' };
        throw err;
      }
      return prisma.task.update({
        where: { id },
        data: { status },
        include: { assignedTo: true, createdBy: true },
      });
    },

    createNote: async (_, { leadId, dealId, body }, { user }) => {
      requireAuth(user);
      if (leadId) {
        const lead = await prisma.lead.findUnique({ where: { id: leadId } });
        if (!lead) throw new Error('Lead not found');
        if (!canAccessLead(user, lead)) {
          const err = new Error('Forbidden');
          err.extensions = { code: 'FORBIDDEN' };
          throw err;
        }
      }
      if (dealId) {
        const deal = await prisma.deal.findUnique({
          where: { id: dealId },
          include: { lead: true },
        });
        if (!deal) throw new Error('Deal not found');
        if (!canAccessLead(user, deal.lead)) {
          const err = new Error('Forbidden');
          err.extensions = { code: 'FORBIDDEN' };
          throw err;
        }
      }
      return prisma.note.create({
        data: {
          body,
          leadId: leadId || null,
          dealId: dealId || null,
          createdById: user.id,
        },
        include: { createdBy: true },
      });
    },

    upsertAutomationRule: async (_, args, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      let config = {};
      if (args.config) {
        try {
          config = JSON.parse(args.config);
        } catch {
          config = {};
        }
      }
      if (args.id) {
        return prisma.automationRule.update({
          where: { id: args.id },
          data: {
            name: args.name,
            trigger: args.trigger,
            action: args.action,
            config: Object.keys(config).length ? config : undefined,
            enabled: args.enabled ?? true,
          },
        });
      }
      return prisma.automationRule.create({
        data: {
          name: args.name,
          trigger: args.trigger,
          action: args.action,
          config: Object.keys(config).length ? config : Prisma.JsonNull,
          enabled: args.enabled ?? true,
        },
      });
    },

    runInboundEmailSync: async (_, __, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      const result = await syncInboundEmails(prisma);
      return {
        skipped: !!result.skipped,
        imported: result.imported || 0,
        error: result.error || null,
      };
    },

    importLeadsCsv: async (_, { csvText }, { user }) => {
      requireRole(user, UserRole.ADMIN, UserRole.MANAGER);
      const rows = parseLeadsCsv(csvText);
      let created = 0;
      let skipped = 0;
      const errors = [];
      for (const row of rows) {
        if (!row.name || !String(row.name).trim()) {
          skipped += 1;
          continue;
        }
        try {
          await prisma.lead.create({
            data: {
              name: String(row.name).trim(),
              company: row.company || null,
              email: row.email || null,
              phone: row.phone || null,
              source: row.source || 'csv_import',
              status: 'NEW',
              score: computeLeadScore({
                companySize: row.companySize ? Number(row.companySize) : 0,
                openedEmail: false,
                repliedEmail: false,
              }),
            },
          });
          created += 1;
        } catch (e) {
          errors.push(e.message || String(e));
        }
      }
      return { created, skipped, errors };
    },
  },

  Lead: {
    createdAt: (p) => p.createdAt.toISOString(),
    updatedAt: (p) => p.updatedAt.toISOString(),
    attachments: (p) => p.attachments || [],
  },

  Attachment: {
    downloadUrl: (a) => {
      const base = (process.env.PUBLIC_API_URL || '').replace(/\/$/, '');
      return base ? `${base}/api/files/${a.id}` : `/api/files/${a.id}`;
    },
    createdAt: (a) => a.createdAt.toISOString(),
  },
  Deal: {
    value: (p) => (p.value != null ? String(p.value) : null),
    expectedCloseDate: (p) =>
      p.expectedCloseDate ? p.expectedCloseDate.toISOString() : null,
    lastStageChangeAt: (p) => p.lastStageChangeAt.toISOString(),
    createdAt: (p) => p.createdAt.toISOString(),
    updatedAt: (p) => p.updatedAt.toISOString(),
  },
  Activity: {
    createdAt: (p) => p.createdAt.toISOString(),
  },
  EmailRecord: {
    createdAt: (p) => p.createdAt.toISOString(),
  },
  WhatsappRecord: {
    createdAt: (p) => p.createdAt.toISOString(),
  },
  Task: {
    dueAt: (p) => (p.dueAt ? p.dueAt.toISOString() : null),
    createdAt: (p) => p.createdAt.toISOString(),
    updatedAt: (p) => p.updatedAt.toISOString(),
  },
  Note: {
    createdAt: (p) => p.createdAt.toISOString(),
    updatedAt: (p) => p.updatedAt.toISOString(),
  },
  DealStageHistoryEntry: {
    createdAt: (p) => p.createdAt.toISOString(),
  },
  AutomationExecutionEntry: {
    createdAt: (p) => p.createdAt.toISOString(),
  },
  AutomationRule: {
    config: (r) => {
      if (r.config == null) return null;
      return typeof r.config === 'string' ? r.config : JSON.stringify(r.config);
    },
  },
};

module.exports = { resolvers, prisma };
