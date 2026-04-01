/**
 * Fail fast on unsafe production configuration.
 */

function assertHttpsOrLocal(urlString, label) {
  let u;
  try {
    u = new URL(urlString);
  } catch {
    throw new Error(`${label} must be a valid URL`);
  }
  const host = u.hostname;
  const isLocal =
    host === 'localhost' || host === '127.0.0.1' || host === '[::1]' || host.endsWith('.local');
  if (u.protocol === 'https:') return;
  if (u.protocol === 'http:' && isLocal) return;
  throw new Error(
    `${label} must use https in production (http is allowed only for localhost / 127.0.0.1).`,
  );
}

function validateProductionApi() {
  if (process.env.NODE_ENV !== 'production') return;

  const secret = process.env.JWT_SECRET || '';
  if (secret.length < 32) {
    throw new Error(
      'JWT_SECRET must be at least 32 characters in production (set a strong random value).',
    );
  }
  if (/^(change-me|dev-secret|secret|test)/i.test(secret)) {
    throw new Error('JWT_SECRET must not use a default or placeholder value in production.');
  }

  if (!process.env.REDIS_URL?.trim()) {
    throw new Error(
      'REDIS_URL is required in production so rate limits and login throttling are shared across processes.',
    );
  }

  const co = process.env.CLIENT_ORIGIN || '';
  if (!co.trim()) throw new Error('CLIENT_ORIGIN is required in production (browser origin for CORS).');
  assertHttpsOrLocal(co, 'CLIENT_ORIGIN');

  const pau = process.env.PUBLIC_API_URL;
  if (pau && pau.trim()) {
    assertHttpsOrLocal(pau.trim(), 'PUBLIC_API_URL');
  }

  const hasSmtp =
    (process.env.SMTP_HOST && process.env.SMTP_HOST.trim() !== '') ||
    (process.env.SMTP_USER && process.env.SMTP_USER.trim() !== '') ||
    (process.env.SMTP_PASS && process.env.SMTP_PASS.trim() !== '') ||
    (process.env.SMTP_FROM && process.env.SMTP_FROM.trim() !== '');

  if (hasSmtp) {
    if (!process.env.SMTP_HOST?.trim()) {
      throw new Error('SMTP_HOST is required when any SMTP_* variable is set.');
    }
    const port = Number(process.env.SMTP_PORT || 587);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('SMTP_PORT must be a valid TCP port when SMTP is configured.');
    }
    if (!process.env.SMTP_FROM?.trim()) {
      throw new Error('SMTP_FROM is required when SMTP is configured.');
    }
  }

  if (process.env.IMAP_HOST?.trim()) {
    if (!process.env.IMAP_USER?.trim()) {
      throw new Error('IMAP_USER is required when IMAP_HOST is set (manual sync on API).');
    }
    const port = Number(process.env.IMAP_PORT || 993);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('IMAP_PORT must be valid when IMAP_HOST is set.');
    }
  }
}

function validateProductionWorker() {
  if (process.env.NODE_ENV !== 'production') return;

  if (!process.env.DATABASE_URL?.trim()) {
    throw new Error('DATABASE_URL is required in production for the worker.');
  }

  if (process.env.IMAP_HOST?.trim()) {
    if (!process.env.IMAP_USER?.trim()) {
      throw new Error('IMAP_USER is required when IMAP_HOST is set on the worker.');
    }
    const port = Number(process.env.IMAP_PORT || 993);
    if (!Number.isFinite(port) || port < 1 || port > 65535) {
      throw new Error('IMAP_PORT must be valid when IMAP_HOST is set.');
    }
  }
}

module.exports = {
  validateProductionConfig: validateProductionApi,
  validateProductionApi,
  validateProductionWorker,
};
