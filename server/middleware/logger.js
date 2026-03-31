const isProd = process.env.NODE_ENV === 'production';

function redact(obj) {
  if (!obj || typeof obj !== 'object') return obj;
  const out = { ...obj };
  const keys = ['password', 'token', 'authorization', 'resetToken'];
  for (const k of keys) {
    if (k in out) out[k] = '[REDACTED]';
  }
  return out;
}

function log(level, event, meta = {}) {
  const payload = {
    ts: new Date().toISOString(),
    level,
    event,
    ...(isProd ? redact(meta) : meta),
  };
  if (process.env.LOG_FORMAT === 'json' || isProd) {
    console.log(JSON.stringify(payload));
  } else {
    console[level === 'error' ? 'error' : 'log'](`[${level}]`, event, meta);
  }
}

module.exports = { log, redact };
