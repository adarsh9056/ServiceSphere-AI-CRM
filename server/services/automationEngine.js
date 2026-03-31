const { sendMail } = require('./emailService');
const { sendWhatsApp } = require('./whatsappService');
const { Prisma } = require('@prisma/client');

async function logExecution(prisma, { ruleId, triggerKey, status, lastError, payload, context }) {
  return prisma.automationExecution.create({
    data: {
      ruleId: ruleId || null,
      triggerKey,
      status,
      lastError: lastError || null,
      payload: payload === undefined ? Prisma.JsonNull : payload,
      context: context === undefined ? Prisma.JsonNull : context,
    },
  });
}

/**
 * Deterministic round-robin: order salespeople by id asc, advance pointer stored in RoundRobinState.
 */
async function assignRoundRobin(prisma, lead, rule) {
  const salespeople = await prisma.user.findMany({
    where: { role: 'SALESPERSON' },
    select: { id: true },
    orderBy: { id: 'asc' },
  });
  if (!salespeople.length) {
    await logExecution(prisma, {
      ruleId: rule?.id,
      triggerKey: 'LEAD_CREATED',
      status: 'SKIPPED',
      lastError: 'No salespeople to assign',
      context: { leadId: lead.id },
    });
    return;
  }
  const ids = salespeople.map((s) => s.id);
  const state = await prisma.roundRobinState.upsert({
    where: { id: 'global' },
    create: { id: 'global' },
    update: {},
  });
  let nextIdx = 0;
  if (state.lastAssignedUserId) {
    const i = ids.indexOf(state.lastAssignedUserId);
    if (i >= 0) nextIdx = (i + 1) % ids.length;
  }
  const chosenId = ids[nextIdx];
  await prisma.lead.update({
    where: { id: lead.id },
    data: { assignedToId: chosenId },
  });
  await prisma.roundRobinState.update({
    where: { id: 'global' },
    data: { lastAssignedUserId: chosenId },
  });
  await logExecution(prisma, {
    ruleId: rule?.id,
    triggerKey: 'LEAD_CREATED',
    status: 'SUCCESS',
    context: { leadId: lead.id, assignedToId: chosenId, orderIndex: nextIdx },
  });
}

async function runRulesForTrigger(prisma, triggerKey, handler) {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, trigger: triggerKey },
  });
  for (const rule of rules) {
    try {
      await handler(rule);
    } catch (err) {
      await logExecution(prisma, {
        ruleId: rule.id,
        triggerKey,
        status: 'FAILED',
        lastError: err.message || String(err),
        attempts: 1,
      });
    }
  }
}

async function afterLeadCreated(prisma, lead) {
  await runRulesForTrigger(prisma, 'LEAD_CREATED', async (rule) => {
    if (!lead.assignedToId && rule.action === 'ASSIGN_ROUND_ROBIN') {
      await assignRoundRobin(prisma, lead, rule);
    } else {
      await logExecution(prisma, {
        ruleId: rule.id,
        triggerKey: 'LEAD_CREATED',
        status: 'SKIPPED',
        context: { leadId: lead.id, reason: 'already_assigned_or_wrong_action' },
      });
    }
  });
}

async function afterDealStageChange(prisma, { deal, previousStage, lead }) {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, trigger: 'DEAL_STAGE_CHANGED' },
  });
  for (const rule of rules) {
    const cfg = (rule.config && typeof rule.config === 'object' ? rule.config : {}) || {};

    try {
      if (rule.action === 'SEND_WHATSAPP_QUALIFIED') {
        const want = cfg.toStage || 'QUALIFIED';
        if (deal.stage !== want || previousStage === want) {
          await logExecution(prisma, {
            ruleId: rule.id,
            triggerKey: 'DEAL_STAGE_CHANGED',
            status: 'SKIPPED',
            context: { dealId: deal.id, reason: 'stage_gate', want },
          });
          continue;
        }
        if (!lead.phone) {
          await logExecution(prisma, {
            ruleId: rule.id,
            triggerKey: 'DEAL_STAGE_CHANGED',
            status: 'SKIPPED',
            context: { dealId: deal.id, reason: 'no_phone' },
          });
          continue;
        }
        const body =
          (cfg.bodyTemplate && String(cfg.bodyTemplate)) ||
          `Hi ${lead.name}, thanks for moving forward with us at ServiceSphere. We're excited to support your CRM rollout.`;
        const result = await sendWhatsApp({ to: lead.phone, body });
        await prisma.whatsappMessage.create({
          data: {
            leadId: lead.id,
            phone: lead.phone,
            direction: 'OUTBOUND',
            body: result.skipped ? '[Auto] WhatsApp skipped (Twilio not configured)' : body,
          },
        });
        await logExecution(prisma, {
          ruleId: rule.id,
          triggerKey: 'DEAL_STAGE_CHANGED',
          status: result.skipped ? 'SKIPPED' : 'SUCCESS',
          payload: { skipped: result.skipped },
          context: { dealId: deal.id, leadId: lead.id },
        });
      }
    } catch (err) {
      await logExecution(prisma, {
        ruleId: rule.id,
        triggerKey: 'DEAL_STAGE_CHANGED',
        status: 'FAILED',
        lastError: err.message || String(err),
        context: { dealId: deal.id },
      });
    }
  }
}

async function runStaleDealReminders(prisma) {
  const rules = await prisma.automationRule.findMany({
    where: { enabled: true, trigger: 'STALE_DEAL_7D' },
  });
  if (!rules.length) return;

  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - 7);

  const stale = await prisma.deal.findMany({
    where: {
      stage: { notIn: ['WON', 'LOST'] },
      lastStageChangeAt: { lt: cutoff },
    },
    include: { lead: true, owner: true },
    take: 50,
  });

  for (const deal of stale) {
    for (const rule of rules) {
      if (rule.action !== 'EMAIL_REMINDER') continue;
      try {
        const email = deal.owner?.email || deal.lead?.email;
        if (!email) {
          await logExecution(prisma, {
            ruleId: rule.id,
            triggerKey: 'STALE_DEAL_7D',
            status: 'SKIPPED',
            context: { dealId: deal.id, reason: 'no_email' },
          });
          continue;
        }
        await sendMail({
          to: email,
          subject: `Reminder: deal needs attention — ${deal.lead?.name}`,
          text: `The deal for ${deal.lead?.name} has not been updated in 7+ days. Current stage: ${deal.stage}.`,
        });
        await logExecution(prisma, {
          ruleId: rule.id,
          triggerKey: 'STALE_DEAL_7D',
          status: 'SUCCESS',
          context: { dealId: deal.id, to: email },
        });
      } catch (err) {
        await logExecution(prisma, {
          ruleId: rule.id,
          triggerKey: 'STALE_DEAL_7D',
          status: 'FAILED',
          lastError: err.message || String(err),
          context: { dealId: deal.id },
        });
      }
    }
  }
}

async function notifyManagerNegativeSentiment(prisma, lead, managers, rule) {
  for (const m of managers) {
    try {
      await sendMail({
        to: m.email,
        subject: `Negative sentiment alert: ${lead.name}`,
        text: `Lead ${lead.name} (${lead.company || 'n/a'}) has negative sentiment. Please review.`,
      });
      await logExecution(prisma, {
        ruleId: rule?.id,
        triggerKey: 'SENTIMENT_NEGATIVE',
        status: 'SUCCESS',
        context: { leadId: lead.id, managerId: m.id },
      });
    } catch (err) {
      await logExecution(prisma, {
        ruleId: rule?.id,
        triggerKey: 'SENTIMENT_NEGATIVE',
        status: 'FAILED',
        lastError: err.message || String(err),
        context: { leadId: lead.id },
      });
    }
  }
}

module.exports = {
  afterLeadCreated,
  afterDealStageChange,
  runStaleDealReminders,
  notifyManagerNegativeSentiment,
  logExecution,
};
