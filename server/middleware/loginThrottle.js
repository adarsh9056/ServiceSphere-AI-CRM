const crypto = require('crypto');
const { ensureRedisConnected, getRedis } = require('../services/redisClient');

const WINDOW_MS = 15 * 60 * 1000;
const WINDOW_SEC = Math.ceil(WINDOW_MS / 1000);
const MAX_FAILS = Number(process.env.LOGIN_MAX_ATTEMPTS_PER_WINDOW || 8);
const LOCKOUT_MS = Number(process.env.LOGIN_LOCKOUT_MS || 15 * 60 * 1000);
const LOCKOUT_SEC = Math.ceil(LOCKOUT_MS / 1000);

/** @type {Map<string, { fails: number; lockUntil: number; windowStart: number }>} */
const memBuckets = new Map();

function bucketKey(email, ip) {
  const norm = String(email || '').toLowerCase().trim();
  return crypto.createHash('sha256').update(`${norm}|${ip || 'unknown'}`).digest('hex');
}

function getClientIp(req) {
  const xf = req.headers['x-forwarded-for'];
  if (typeof xf === 'string' && xf.length) return xf.split(',')[0].trim();
  return req.socket?.remoteAddress || req.ip || 'unknown';
}

function memAssertLoginAllowed(email, req) {
  const ip = getClientIp(req);
  const key = bucketKey(email, ip);
  const now = Date.now();
  let b = memBuckets.get(key);
  if (!b) {
    b = { fails: 0, lockUntil: 0, windowStart: now };
    memBuckets.set(key, b);
  }
  if (now - b.windowStart > WINDOW_MS) {
    b.fails = 0;
    b.windowStart = now;
  }
  if (b.lockUntil > now) {
    const err = new Error('Too many login attempts. Try again later.');
    err.extensions = { code: 'TOO_MANY_ATTEMPTS' };
    throw err;
  }
  if (now - b.windowStart > WINDOW_MS) {
    b.fails = 0;
    b.windowStart = now;
  }
}

async function assertLoginAllowed(email, req) {
  const r = await ensureRedisConnected();
  const key = bucketKey(email, getClientIp(req));
  if (!r) {
    memAssertLoginAllowed(email, req);
    return;
  }
  const exists = await r.exists(`login:lock:${key}`);
  if (exists) {
    const err = new Error('Too many login attempts. Try again later.');
    err.extensions = { code: 'TOO_MANY_ATTEMPTS' };
    throw err;
  }
}

function memRecordLoginFailure(email, req) {
  const ip = getClientIp(req);
  const key = bucketKey(email, ip);
  const now = Date.now();
  let b = memBuckets.get(key);
  if (!b) {
    b = { fails: 0, lockUntil: 0, windowStart: now };
    memBuckets.set(key, b);
  }
  b.fails += 1;
  if (b.fails >= MAX_FAILS) {
    b.lockUntil = now + LOCKOUT_MS;
    b.fails = 0;
  }
}

async function recordLoginFailure(email, req) {
  const r = await ensureRedisConnected();
  const key = bucketKey(email, getClientIp(req));
  if (!r) {
    memRecordLoginFailure(email, req);
    return;
  }
  const n = await r.incr(`login:fail:${key}`);
  if (n === 1) await r.expire(`login:fail:${key}`, WINDOW_SEC);
  if (n >= MAX_FAILS) {
    await r.set(`login:lock:${key}`, '1', 'EX', LOCKOUT_SEC);
    await r.del(`login:fail:${key}`);
  }
}

function memClearLoginFailures(email, req) {
  const ip = getClientIp(req);
  const key = bucketKey(email, ip);
  memBuckets.delete(key);
}

async function clearLoginFailures(email, req) {
  const r = await ensureRedisConnected();
  const key = bucketKey(email, getClientIp(req));
  if (!r) {
    memClearLoginFailures(email, req);
    return;
  }
  await r.del(`login:fail:${key}`, `login:lock:${key}`);
}

module.exports = {
  assertLoginAllowed,
  recordLoginFailure,
  clearLoginFailures,
  getClientIp,
};
