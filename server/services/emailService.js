const nodemailer = require('nodemailer');
const { log } = require('../middleware/logger');

function getTransport() {
  if (!process.env.SMTP_HOST || !process.env.SMTP_USER) {
    return null;
  }
  return nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: Number(process.env.SMTP_PORT || 587),
    secure: false,
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });
}

async function sendMail({ to, subject, text, html }) {
  const transport = getTransport();
  const from = process.env.SMTP_FROM || 'ServiceSphere <noreply@localhost>';

  if (!transport) {
    log('warn', 'email_skipped_no_smtp', { to, subject });
    return { skipped: true, messageId: null };
  }

  const result = await transport.sendMail({
    from,
    to,
    subject,
    text,
    html: html || text,
  });
  return { skipped: false, messageId: result.messageId };
}

async function sendPasswordResetEmail({ to, token }) {
  const base = (process.env.PUBLIC_APP_URL || 'http://localhost:5173').replace(/\/$/, '');
  const link = `${base}/reset?token=${encodeURIComponent(token)}`;
  return sendMail({
    to,
    subject: 'Reset your ServiceSphere password',
    text: `We received a password reset request. Open this link to choose a new password (expires in 1 hour):\n\n${link}\n\nIf you did not request this, you can ignore this email.`,
    html: `<p>We received a password reset request.</p><p><a href="${link}">Reset your password</a></p><p>This link expires in one hour.</p>`,
  });
}

module.exports = { sendMail, getTransport, sendPasswordResetEmail };
