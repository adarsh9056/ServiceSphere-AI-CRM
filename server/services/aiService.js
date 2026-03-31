const OpenAI = require('openai');

function getClient() {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  return new OpenAI({ apiKey: key });
}

async function analyzeSentiment(text) {
  const client = getClient();
  if (!client || !text) {
    return { sentiment: 'NEUTRAL', raw: 'no-api' };
  }

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      {
        role: 'system',
        content:
          'Classify the customer email sentiment as exactly one word: POSITIVE, NEUTRAL, or NEGATIVE.',
      },
      { role: 'user', content: text.slice(0, 8000) },
    ],
    temperature: 0.2,
    max_tokens: 5,
  });

  const word = (completion.choices[0]?.message?.content || 'NEUTRAL')
    .trim()
    .toUpperCase();
  if (word.includes('NEG')) return { sentiment: 'NEGATIVE', raw: word };
  if (word.includes('POS')) return { sentiment: 'POSITIVE', raw: word };
  return { sentiment: 'NEUTRAL', raw: word };
}

async function generateFollowUpEmail(context) {
  const client = getClient();
  const prompt = `Generate a professional follow-up email for a customer interested in CRM software.
Lead name: ${context.leadName || 'there'}
Company: ${context.company || 'their company'}
Notes: ${context.notes || 'none'}
Return only the email body text, no subject line.`;

  if (!client) {
    return `Hi ${context.leadName || 'there'},\n\nThanks for your interest in ServiceSphere CRM. I'd love to schedule a quick call this week to align on next steps.\n\nBest regards`;
  }

  const completion = await client.chat.completions.create({
    model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
    messages: [
      { role: 'system', content: 'You write concise B2B sales emails.' },
      { role: 'user', content: prompt },
    ],
    temperature: 0.7,
    max_tokens: 400,
  });

  return (completion.choices[0]?.message?.content || '').trim();
}

module.exports = { analyzeSentiment, generateFollowUpEmail, getClient };
