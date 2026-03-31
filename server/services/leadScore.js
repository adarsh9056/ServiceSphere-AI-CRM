const { Sentiment } = require('@prisma/client');

function computeLeadScore({
  openedEmail = false,
  repliedEmail = false,
  companySize = 0,
  sentiment = null,
  base = 50,
}) {
  let score = base;
  if (openedEmail) score += 10;
  if (repliedEmail) score += 20;
  if (companySize && companySize > 100) score += 30;
  if (sentiment === Sentiment.NEGATIVE) score -= 10;
  return Math.max(0, Math.min(100, score));
}

function scoreTier(score) {
  if (score >= 80) return 'HOT';
  if (score >= 50) return 'WARM';
  return 'COLD';
}

module.exports = { computeLeadScore, scoreTier };
