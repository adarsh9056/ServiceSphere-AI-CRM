const twilio = require('twilio');

function getClient() {
  const sid = process.env.TWILIO_ACCOUNT_SID;
  const token = process.env.TWILIO_AUTH_TOKEN;
  if (!sid || !token) return null;
  return twilio(sid, token);
}

async function sendWhatsApp({ to, body }) {
  const client = getClient();
  const from = process.env.TWILIO_WHATSAPP_FROM;

  if (!client || !from) {
    console.warn('[whatsapp] Twilio not configured; skipping send to', to);
    return { skipped: true, sid: null };
  }

  const normalizedTo = to.startsWith('whatsapp:') ? to : `whatsapp:${to}`;
  const msg = await client.messages.create({
    from,
    to: normalizedTo,
    body,
  });
  return { skipped: false, sid: msg.sid };
}

module.exports = { sendWhatsApp, getClient };
