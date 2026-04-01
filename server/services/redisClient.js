const Redis = require('ioredis');

let client = null;

function getRedis() {
  const url = process.env.REDIS_URL;
  if (!url) return null;
  if (!client) {
    client = new Redis(url, {
      maxRetriesPerRequest: 3,
      lazyConnect: true,
    });
    client.on('error', (e) => console.error('redis_error', e.message));
  }
  return client;
}

async function ensureRedisConnected() {
  const r = getRedis();
  if (!r) return null;
  if (r.status === 'wait' || r.status === 'end') {
    await r.connect();
  }
  return r;
}

function requireRedisInProduction() {
  if (process.env.NODE_ENV === 'production' && !process.env.REDIS_URL) {
    throw new Error('REDIS_URL is required in production for shared rate limits and login throttling.');
  }
}

module.exports = { getRedis, ensureRedisConnected, requireRedisInProduction };
