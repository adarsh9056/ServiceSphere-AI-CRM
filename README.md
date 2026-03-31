# ServiceSphere CRM

Industry-style CRM stack: **React (Vite)**, **Node/Express**, **Apollo GraphQL**, **Prisma**, **PostgreSQL**, with Kanban pipeline, dashboards (Recharts), email/WhatsApp/AI hooks, automation rule models, **Docker Compose**, and **GitHub Actions** CI.

## Quick start (local)

1. **Database** — from repo root:

   ```bash
   docker compose up -d postgres
   ```

   Or point `server/.env` `DATABASE_URL` at any PostgreSQL instance.

2. **Backend**

   ```bash
   cd server
   cp .env.example .env
   npm install
   npx prisma migrate deploy
   npx prisma db seed
   npm run dev
   ```

   API: `http://localhost:4000/graphql` · Health: `http://localhost:4000/health`

3. **Frontend**

   ```bash
   cd client
   npm install
   echo 'VITE_GRAPHQL_URL=http://localhost:4000/graphql' > .env.local
   npm run dev
   ```

4. **Demo logins** (after seed)

   - `admin@servicesphere.dev` / `admin123`
   - `manager@servicesphere.dev` / `manager123`
   - `sales@servicesphere.dev` / `sales123`

## Docker (API + Postgres)

```bash
docker compose up --build
```

Set `JWT_SECRET` in the environment for production.

## Features implemented

- JWT auth (signup creates **salesperson** only; admins/managers from seed)
- Role-based GraphQL access (**Admin**, **Manager**, **Salesperson**)
- **Accounts, contacts, tasks, notes, attachments model**; **deal stage history** on every move
- **Lead detail** (`/leads/:id`): timeline, email thread, AI sentiment + draft + **approve-then-send**
- Leads list, search/filters, **Kanban** (`@dnd-kit`), dashboard (Recharts)
- **DB-driven automation** (`automationEngine.js`): rules from `AutomationRule`, **execution log** (`AutomationExecution`), **deterministic round-robin** via `RoundRobinState`
- Outbound email (Nodemailer), **password reset email** when `SMTP_*` + `PUBLIC_APP_URL` are set (no token logging)
- **Inbound IMAP sync** by **UID range** (`UID lastUid+1:*`), not only `UNSEEN`, so mail read on other clients still imports; **batched** via `IMAP_SYNC_BATCH_SIZE`. `runInboundEmailSync` mutation + tests for import matching and deal-stage automation
- WhatsApp (Twilio) on qualified-stage rule; sentiment + scoring (OpenAI)
- Structured **JSON logs** in production (`LOG_FORMAT=json`), `LOG_REDACT` for extra caution
- Server **integration tests** (`npm test` in `server/`) against PostgreSQL

## Git

Repository is initialized locally. Rename branch and push:

```bash
git branch -m main
git remote add origin https://github.com/YOUR_ORG/servicesphere-crm.git
git push -u origin main
```

## Deploy

- **Vercel (frontend)**: Project root `client`, build `npm run build`, output `dist`, env `VITE_GRAPHQL_URL=https://your-api/graphql`
- **Render / Railway (API)**: Root `server`, start command `npx prisma migrate deploy && node server.js`, env `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SMTP_*`, `OPENAI_API_KEY`, optional `IMAP_*`

## CI

`.github/workflows/ci.yml` runs two jobs on `main`: **server** (Postgres service → `prisma migrate deploy` → `npm test`) and **client** (`npm ci` → `npm run build`). Forks need Actions enabled.

## Manual checklist (production)

- Set strong `JWT_SECRET`, never commit `.env`
- Configure SMTP for real password resets; set `PUBLIC_APP_URL` to the SPA origin
- Schedule DB backups (provider snapshots or `pg_dump`)
- Add monitoring (health: `GET /health`) and log aggregation
