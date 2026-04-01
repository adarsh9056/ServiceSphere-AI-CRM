# Operations runbook — ServiceSphere CRM

## Environments

| Variable        | API | Web |
|-----------------|-----|-----|
| `DATABASE_URL`  | Required | — |
| `JWT_SECRET`    | Required in production | — |
| `CLIENT_ORIGIN` / CORS | Set to SPA origin | — |
| `VITE_GRAPHQL_URL` | — | Required at build time |

Optional: `SMTP_*`, `OPENAI_*`, `TWILIO_*`, `IMAP_*`, `LOG_FORMAT=json`, `LOG_REDACT=true`, `SENTRY_DSN`, `PUBLIC_API_URL` (public base URL for attachment links), `UPLOAD_DIR`, `TRUST_PROXY_HOPS`.

**Background worker (required for IMAP + stale-deal automation)** — the API **no longer** runs `setInterval` jobs. Run a second process:

```bash
cd server && node worker.js
# or: npm run worker
```

Use the same `DATABASE_URL`, `JWT_SECRET` (validated in production), and `IMAP_*` variables as the API. See [EC2_DEPLOY.md](./EC2_DEPLOY.md) for PM2/systemd examples.

## Deploy / upgrade (API)

1. Set `DATABASE_URL` and `JWT_SECRET` (and other secrets) on the host.
2. Run migrations before or at process start:

   ```bash
   npx prisma migrate deploy
   ```

3. Start the API (example):

   ```bash
   node server.js
   ```

4. Smoke-check:

   ```bash
   curl -sf http://localhost:4000/health
   ```

5. **Seed** (`npx prisma db seed`) is for **non-production** demos and local E2E only; do not run destructive seeds against production without a reviewed procedure.

## Deploy / upgrade (web)

1. Set `VITE_GRAPHQL_URL` to the production GraphQL endpoint.
2. Build: `npm run build` (from `client/`).
3. Serve static `dist/` (Vercel, S3+CloudFront, nginx, etc.).

## Rollback

- **API**: redeploy the previous image/commit; DB rollback is a separate DBA action (restore snapshot or forward-fix migration). Prisma does not auto-downgrade schema.
- **Web**: redeploy previous `dist` or use host-specific “previous deployment” controls.

## Background jobs & IMAP

- **Worker process** runs IMAP sync on an interval (`IMAP_SYNC_INTERVAL_MS`) and hourly stale-deal automation. The API only exposes `/graphql` and REST upload/file routes.
- Boot IMAP sync can be disabled with `IMAP_SKIP_BOOT_SYNC=true` on the **worker** for debugging.
- If “Imported 0” appears after a restart, pending mail may already have been imported; see README **IMAP troubleshooting**.

## Monitoring & alerts

- **Sentry** (optional): set `SENTRY_DSN` on the API. GraphQL errors are reported via `captureException` when Sentry is initialized.
- **Worker**: emits `worker_heartbeat` logs on an interval (`WORKER_HEARTBEAT_INTERVAL_MS`, default 60s). On IMAP failure it logs `imap_sync_*` and reports to Sentry when configured. Alert if heartbeats stop (log-based alert) or if `lastImapSuccessAt` in structured logs goes stale. Set `WORKER_SENTRY_HEARTBEAT=1` to emit a Sentry message each heartbeat (can be noisy — prefer log alerts).
- **Uptime checks**: configure an external monitor (e.g. UptimeRobot, Pingdom, Route 53 health checks, Better Stack) against `GET /health` (expect HTTP 200 and JSON `{ ok: true }`). **Worker has no HTTP port** — monitor it via process supervision (systemd/PM2 restart policies) and log/heartbeat alerts.
- **Log shipping**: run the API as a systemd unit or under PM2 and ship stdout/stderr to CloudWatch, Datadog, Loki, or ELK; keep `LOG_FORMAT=json` in production.
- **Redis**: production API requires `REDIS_URL` for shared rate limits and login throttling across processes.
- **DB backups**: use provider snapshots (RDS) **or** automate `pg_dump` — run [server/scripts/backup-db.sh](../server/scripts/backup-db.sh) from cron, store artifacts on durable storage, and **periodically test** [server/scripts/restore-db.sh](../server/scripts/restore-db.sh) against a disposable database. See [EC2_DEPLOY.md](./EC2_DEPLOY.md).

## Security controls (production)

- Set `NODE_ENV=production` and a strong `JWT_SECRET` (≥32 characters, not a placeholder) — `server/config/bootstrap.js` enforces this.
- Access tokens default to **15m** in production (`JWT_ACCESS_EXPIRES_IN` overrides); **refresh tokens** are returned from `login` / `signup` and rotated via `refreshSession`.
- **Rate limits**: `express-rate-limit` on `/graphql` (see `RATE_LIMIT_GRAPHQL_MAX`, `RATE_LIMIT_AUTH_MAX`). Login attempts are throttled per IP/email (`LOGIN_MAX_ATTEMPTS_PER_WINDOW`, `LOGIN_LOCKOUT_MS`).
- **Helmet** adds security-related HTTP headers.

## E2E (CI / staging)

From repo root, after Postgres + `prisma migrate deploy` + `prisma db seed`:

```bash
npm install
npx playwright install chromium
npm run test:e2e
```

Specs assume seeded users and the **Jordan Lee** lead. Override credentials with `E2E_*` env vars documented in the README.

## Incidents (quick checks)

| Symptom | Check |
|---------|--------|
| 401 / “Unauthorized” on GraphQL | Client token storage, `JWT_SECRET` unchanged between deploys, clock skew |
| 403 on lead/deal | Role + `assignedToId` / `ownerId` rules for sales users |
| DB connection errors | `DATABASE_URL`, pool limits, network/security groups |
| IMAP not importing | Host, credentials, TLS flags, UID cursor (`ImapSyncState`), sender↔lead email match |
