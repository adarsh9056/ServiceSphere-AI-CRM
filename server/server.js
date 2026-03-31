require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { ApolloServer } = require('apollo-server-express');
const typeDefs = require('./graphql/typeDefs');
const { resolvers, prisma } = require('./graphql/resolvers');
const { authMiddleware } = require('./middleware/auth');
const { log } = require('./middleware/logger');
const { runStaleDealReminders } = require('./services/automationEngine');
const { syncInboundEmails } = require('./services/imapSyncService');

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

async function main() {
  const app = express();
  app.use(
    cors({
      origin: CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(express.json());

  app.get('/health', (_, res) => res.json({ ok: true, service: 'servicesphere-api' }));

  const getUser = authMiddleware(prisma);
  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req }) => {
      const { user } = await getUser(req);
      return { user };
    },
    formatError: (err) => {
      log('error', 'graphql_error', { message: err.message });
      return err;
    },
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql', cors: false });

  app.listen(PORT, () => {
    log('info', 'server_started', { port: PORT, path: server.graphqlPath });
  });

  const HOUR = 60 * 60 * 1000;
  const imapInterval = Number(process.env.IMAP_SYNC_INTERVAL_MS || 5 * 60 * 1000);

  setInterval(() => {
    runStaleDealReminders(prisma).catch((e) => log('error', 'cron_stale_deals', { message: e.message }));
  }, HOUR);

  if (process.env.IMAP_HOST && process.env.IMAP_USER) {
    syncInboundEmails(prisma).catch((e) => log('error', 'imap_sync_boot', { message: e.message }));
    setInterval(() => {
      syncInboundEmails(prisma).catch((e) => log('error', 'imap_sync_cron', { message: e.message }));
    }, imapInterval);
  }
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
