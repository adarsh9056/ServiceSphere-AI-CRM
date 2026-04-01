const rateLimit = require('express-rate-limit');
const { RedisStore } = require('rate-limit-redis');
const { getRedis, ensureRedisConnected } = require('../services/redisClient');

async function createRateLimiters() {
  await ensureRedisConnected();
  const redis = getRedis();

  const storeOpts = redis
    ? {
        sendCommand: (...args) => redis.call(...args),
      }
    : undefined;

  const graphqlLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_GRAPHQL_MAX || 2000),
    standardHeaders: true,
    legacyHeaders: false,
    message: { error: 'Too many requests, try again later.' },
    ...(storeOpts
      ? {
          store: new RedisStore({
            ...storeOpts,
            prefix: 'rl:graphql:',
          }),
        }
      : {}),
  });

  const graphqlUnauthLimiter = rateLimit({
    windowMs: 15 * 60 * 1000,
    max: Number(process.env.RATE_LIMIT_AUTH_MAX || 60),
    standardHeaders: true,
    legacyHeaders: false,
    skip: (req) => {
      const auth = req.headers.authorization || '';
      return auth.startsWith('Bearer ');
    },
    message: { error: 'Too many unauthenticated requests.' },
    ...(storeOpts
      ? {
          store: new RedisStore({
            ...storeOpts,
            prefix: 'rl:unauth:',
          }),
        }
      : {}),
  });

  return { graphqlLimiter, graphqlUnauthLimiter };
}

module.exports = { createRateLimiters };
