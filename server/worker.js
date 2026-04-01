/**
 * Background jobs (IMAP sync, stale-deal automation). Run as a separate process from the API.
 *   node worker.js
 *   npm run worker
 */
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');
const { log } = require('./middleware/logger');
const { runStaleDealReminders } = require('./services/automationEngine');
const { syncInboundEmails } = require('./services/imapSyncService');
const { validateProductionWorker } = require('./config/bootstrap');
const { initSentry } = require('./services/sentry');

const Sentry = initSentry();

try {
  validateProductionWorker();
} catch (e) {
  console.error(e.message);
  process.exit(1);
}

const prisma = new PrismaClient();
const HOUR = 60 * 60 * 1000;
const HEARTBEAT_MS = Number(process.env.WORKER_HEARTBEAT_INTERVAL_MS || 60_000);
const imapInterval = Number(process.env.IMAP_SYNC_INTERVAL_MS || 5 * 60 * 1000);

let lastImapSuccessAt = null;
let lastImapImported = 0;

log('info', 'worker_started', {
  imapIntervalMs: imapInterval,
  imapEnabled: !!(process.env.IMAP_HOST && process.env.IMAP_USER),
  heartbeatMs: HEARTBEAT_MS,
});

setInterval(() => {
  log('info', 'worker_heartbeat', {
    pid: process.pid,
    lastImapSuccessAt,
    lastImapImported,
    imapConfigured: !!(process.env.IMAP_HOST && process.env.IMAP_USER),
  });
  if (Sentry?.captureMessage && process.env.WORKER_SENTRY_HEARTBEAT === '1') {
    Sentry.captureMessage('worker_heartbeat', 'info');
  }
}, HEARTBEAT_MS);

setInterval(() => {
  runStaleDealReminders(prisma).catch((e) => {
    log('error', 'cron_stale_deals', { message: e.message });
    if (Sentry?.captureException) Sentry.captureException(e);
  });
}, HOUR);

async function runImapJob(label) {
  try {
    const result = await syncInboundEmails(prisma);
    lastImapSuccessAt = new Date().toISOString();
    lastImapImported =
      typeof result?.imported === 'number' ? result.imported : lastImapImported;
    log('info', 'imap_sync_complete', {
      label,
      imported: result?.imported ?? 0,
      skipped: !!result?.skipped,
    });
  } catch (e) {
    log('error', label, { message: e.message });
    if (Sentry?.captureException) Sentry.captureException(e);
    lastImapSuccessAt = null;
  }
}

if (process.env.IMAP_HOST && process.env.IMAP_USER) {
  const skipBoot = ['1', 'true', 'yes'].includes(
    String(process.env.IMAP_SKIP_BOOT_SYNC || '').toLowerCase(),
  );
  if (!skipBoot) {
    runImapJob('imap_sync_boot');
  } else {
    log('info', 'imap_sync_boot_skipped', { reason: 'IMAP_SKIP_BOOT_SYNC' });
  }
  setInterval(() => runImapJob('imap_sync_cron'), imapInterval);
}

process.on('unhandledRejection', (reason) => {
  log('error', 'worker_unhandled_rejection', { message: String(reason) });
  if (Sentry?.captureException && reason instanceof Error) Sentry.captureException(reason);
});
