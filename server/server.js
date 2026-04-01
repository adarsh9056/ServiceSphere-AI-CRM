require('dotenv').config();
const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const cookieParser = require('cookie-parser');
const { ApolloServer } = require('apollo-server-express');
const typeDefs = require('./graphql/typeDefs');
const { resolvers, prisma } = require('./graphql/resolvers');
const { authMiddleware } = require('./middleware/auth');
const { log } = require('./middleware/logger');
const { validateProductionConfig } = require('./config/bootstrap');
const { createRateLimiters } = require('./middleware/rateLimit');
const { registerUploadRoutes } = require('./routes/uploadRoutes');
const { initSentry } = require('./services/sentry');

const Sentry = initSentry();

try {
  validateProductionConfig();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const PORT = Number(process.env.PORT || 4000);
const CLIENT_ORIGIN = process.env.CLIENT_ORIGIN || 'http://localhost:5173';

async function main() {
  const { graphqlLimiter, graphqlUnauthLimiter } = await createRateLimiters();

  const app = express();
  app.set('trust proxy', Number(process.env.TRUST_PROXY_HOPS || 1));

  app.use(
    helmet({
      crossOriginResourcePolicy: { policy: 'cross-origin' },
      contentSecurityPolicy: false,
    }),
  );
  app.use(
    cors({
      origin: CLIENT_ORIGIN,
      credentials: true,
    }),
  );
  app.use(cookieParser());
  app.use(express.json({ limit: '2mb' }));

  registerUploadRoutes(app);

  app.get('/health', (_, res) =>
    res.json({
      ok: true,
      service: 'servicesphere-api',
      workerMode: false,
    }),
  );

  const getUser = authMiddleware(prisma);
  app.use('/graphql', graphqlUnauthLimiter);
  app.use('/graphql', graphqlLimiter);

  const server = new ApolloServer({
    typeDefs,
    resolvers,
    context: async ({ req, res }) => {
      const { user } = await getUser(req);
      return { user, req, res };
    },
    formatError: (err) => {
      if (Sentry?.captureException) {
        Sentry.captureException(err.originalError || err);
      }
      log('error', 'graphql_error', { message: err.message });
      return err;
    },
  });

  await server.start();
  server.applyMiddleware({ app, path: '/graphql', cors: false });

  app.listen(PORT, () => {
    log('info', 'server_started', {
      port: PORT,
      path: server.graphqlPath,
      backgroundJobs: 'disabled (use worker process)',
    });
  });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
