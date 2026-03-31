const { test, before, after } = require('node:test');
const assert = require('node:assert');
const { PrismaClient } = require('@prisma/client');

const prisma = new PrismaClient();

before(async () => {
  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required for integration tests');
  }
  await prisma.$connect();
});

after(async () => {
  await prisma.$disconnect();
});

test('database connectivity', async () => {
  const rows = await prisma.$queryRaw`SELECT 1 as ok`;
  assert.equal(rows[0].ok, 1);
});

test('graphql health module loads', async () => {
  const { resolvers } = require('../graphql/resolvers');
  assert.ok(typeof resolvers.Query.getDashboardStats === 'function');
});
