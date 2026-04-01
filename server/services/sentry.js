/**
 * Optional Sentry for API errors. Set SENTRY_DSN to enable.
 */
function initSentry() {
  const dsn = process.env.SENTRY_DSN;
  if (!dsn) return null;
  try {
    const Sentry = require('@sentry/node');
    Sentry.init({
      dsn,
      environment: process.env.SENTRY_ENVIRONMENT || process.env.NODE_ENV || 'development',
      tracesSampleRate: Number(process.env.SENTRY_TRACES_SAMPLE_RATE || 0),
    });
    return Sentry;
  } catch {
    return null;
  }
}

module.exports = { initSentry };
