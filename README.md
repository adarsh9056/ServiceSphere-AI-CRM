# ServiceSphere CRM

ServiceSphere CRM is a production-minded CRM platform built with **React**, **Node.js**, **GraphQL**, **Prisma**, and **PostgreSQL**.

It is designed to feel like a real sales workspace, not a CRUD demo: leads and deals move through a Kanban pipeline, communication is tracked on a unified timeline, IMAP can pull inbound mail into the CRM, AI helps with follow-ups and sentiment, and a separate worker process handles background automation.

## Overview

This project covers:

- authentication with access tokens and refresh-token rotation
- role-based access for **Admin**, **Manager**, and **Salesperson**
- lead, account, contact, deal, task, note, attachment, and activity management
- drag-and-drop pipeline movement with deal stage history
- lead detail workspace with overview, communication thread, attachments, and unified timeline
- AI follow-up drafting and sentiment analysis
- outbound email, inbound IMAP sync, and WhatsApp automation hooks
- CSV lead import/export
- background jobs through a dedicated worker process
- CI with server tests, client build validation, and Playwright E2E
- deployment and ops documentation for Docker, cloud platforms, and EC2

## Tech Stack

**Frontend**

- React 19
- Vite
- Tailwind CSS v4
- React Router
- Apollo Client
- Recharts
- `@dnd-kit`

**Backend**

- Node.js
- Express 4
- Apollo Server / GraphQL
- Prisma ORM
- PostgreSQL
- JWT auth
- Nodemailer
- `imap-simple`
- Twilio
- OpenAI

**Ops / Quality**

- Docker Compose
- GitHub Actions
- Playwright
- Structured logging
- Optional Sentry integration

## Product Flow

1. Users log in and land in the CRM workspace.
2. Leads are created, assigned, scored, and worked through the sales process.
3. Deals move across a Kanban pipeline from new opportunity to won or lost.
4. Every lead has a detailed workspace with:
   - account and contact context
   - tasks and notes
   - attachments
   - email thread
   - stage history
   - unified timeline
5. AI can draft follow-ups and analyze message sentiment.
6. Background automations handle assignment, stale-deal reminders, and messaging hooks.
7. Managers and admins can review dashboards, activity, automation rules, and execution logs.

## Core Features

### CRM and Sales Workflow

- Leads list with search and status filters
- Lead scoring
- Accounts and contacts
- Deal pipeline with drag-and-drop movement
- Deal stage audit history
- Tasks and notes
- Activity feed and unified lead timeline

### Communication

- Outbound email logging
- Password reset email flow
- Inbound IMAP sync using **UID-based incremental import**
- WhatsApp automation trigger on qualified-stage transitions

### AI

- AI-generated follow-up drafts
- Email sentiment analysis
- Sentiment-aware lead updates and manager notification hooks

### Production-Minded Additions

- Helmet security headers
- GraphQL rate limiting
- Login throttling
- Refresh-session flow
- Background jobs moved into `worker.js`
- CSV import/export
- Attachment upload/download support
- Playwright E2E coverage
- CI for server, client, and browser flows

## Project Structure

```text
.
├── client/                     # React application
├── server/                     # Express + GraphQL + Prisma API
├── e2e/                        # Playwright tests and helpers
├── docs/                       # Runbook and deployment guides
├── docker-compose.yml
├── playwright.config.js
└── README.md
```

## Local Development

### 1. Start PostgreSQL

If Docker is available:

```bash
docker compose up -d postgres
```

Or point `server/.env` `DATABASE_URL` at any PostgreSQL instance.

### 2. Start the backend API

```bash
cd server
cp .env.example .env
npm install
npx prisma migrate deploy
npm run db:seed
npm run dev
```

API endpoints:

- GraphQL: `http://localhost:4000/graphql`
- Health: `http://localhost:4000/health`

### 3. Start the frontend

```bash
cd client
npm install
echo 'VITE_GRAPHQL_URL=http://localhost:4000/graphql' > .env.local
npm run dev
```

Optional:

- use `VITE_GRAPHQL_URL=/graphql` with the Vite proxy for a single-origin local setup
- use a full deployed API URL when the frontend and backend live on different domains

### 4. Start the worker

The worker is responsible for IMAP polling and stale-deal automation.

```bash
cd server
npm run worker
```

## Demo Accounts

After seeding:

- `admin@servicesphere.dev` / `admin123`
- `manager@servicesphere.dev` / `manager123`
- `sales@servicesphere.dev` / `sales123`

## Environment Notes

Main API variables:

- `DATABASE_URL`
- `JWT_SECRET`
- `CLIENT_ORIGIN`
- `PUBLIC_APP_URL`
- `PUBLIC_API_URL`

Optional integrations:

- `SMTP_*`
- `OPENAI_API_KEY`
- `TWILIO_*`
- `IMAP_*`
- `SENTRY_DSN`

## IMAP Notes

Inbound sync is **UID-based**, not just `UNSEEN`-based. Each sync advances the stored cursor and only asks the mailbox for newer messages.

That means **Imported 0** is often correct: there may simply be no new UID after the last successful sync.

Useful debugging tips:

- match the email **From** address to a lead or contact email if you want the message attached to a lead
- use `IMAP_SKIP_BOOT_SYNC=true` when you want more predictable manual testing
- increase `IMAP_SYNC_INTERVAL_MS` during local debugging if background sync is consuming mail before manual sync
- for local TLS interception issues only, set `IMAP_TLS_REJECT_UNAUTHORIZED="false"`

## Testing

### Server tests

```bash
cd server
npm test
```

### Playwright E2E

Run from the repo root:

```bash
npm install
npx playwright install chromium
cd server && npx prisma migrate deploy && npm run db:seed && cd ..
npm run test:e2e
```

Current browser coverage includes:

- login flow
- lead detail task and note flow
- pipeline stage movement
- manager dashboard and lead filtering
- lead communication UI flow with seeded inbound-email data

## CI

GitHub Actions in [.github/workflows/ci.yml](.github/workflows/ci.yml) runs:

- server tests against PostgreSQL
- client build validation
- Playwright E2E with seeded data

## Deployment

### Render (recommended for this repo)

The root [`render.yaml`](render.yaml) defines **PostgreSQL**, **Redis** (required by the API in production), the **Docker API**, a **static Vite frontend**, and a **Node worker**.

**Fastest path (log in with GitHub when prompted):**  
[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/adarsh9056/ServiceSphere-AI-CRM)

Or open: `https://render.com/deploy?repo=https://github.com/adarsh9056/ServiceSphere-AI-CRM`

1. Push this repo to GitHub (already set up for [ServiceSphere-AI-CRM](https://github.com/adarsh9056/ServiceSphere-AI-CRM)).
2. Use the button above, or in [Render](https://dashboard.render.com): **New** → **Blueprint** → connect the repo → select branch `main` → **Apply**.
3. Default URLs are derived from service names in `render.yaml`:
   - API: `https://servicesphere-ai-crm-api.onrender.com`
   - Web: `https://servicesphere-ai-crm-web.onrender.com`
   If Render assigns different hostnames, update **`CLIENT_ORIGIN`**, **`PUBLIC_APP_URL`**, **`PUBLIC_API_URL`** on the API service, set **`VITE_GRAPHQL_URL`** on the static site to `https://<your-api-host>/graphql`, and redeploy the web service.
4. After the first successful API deploy, open **Shell** on the API service (or run locally against production `DATABASE_URL`) and run: `npx prisma db seed` for demo users and sample data.
5. Optional: set **`OPENAI_API_KEY`** and **`SMTP_*`** in the API service **Environment** tab for AI drafts and email.

### Frontend (other hosts)

- Vercel or any static host
- build from `client/`
- set `VITE_GRAPHQL_URL` to the deployed API (`…/graphql`)

### API (other hosts)

- Railway, Docker host, or EC2
- run Prisma migrations before startup
- set production secrets (`JWT_SECRET` ≥ 32 chars, `REDIS_URL`, `CLIENT_ORIGIN` HTTPS, etc.)

### Worker

Run `node worker.js` alongside the API in production (included as a Render worker in `render.yaml`).

### EC2

See:

- [docs/EC2_DEPLOY.md](docs/EC2_DEPLOY.md)
- [docs/RUNBOOK.md](docs/RUNBOOK.md)

The docs cover:

- nginx reverse proxy guidance
- HTTPS / Certbot setup
- PM2 / systemd examples
- RDS and backup notes
- monitoring and incident checks

## Why This Project Matters

This project is intended to demonstrate more than frontend screens. It shows how to design and connect:

- a real sales workflow
- a structured relational data model
- background jobs
- third-party integrations
- AI-assisted product features
- CI and E2E testing
- deployment and operations documentation

In short, it is a strong full-stack CRM foundation with real product thinking behind it.

## Production Checklist

Before a public deployment:

- use a strong `JWT_SECRET`
- configure SMTP for real outbound mail and password resets
- run the worker in production
- configure backups
- add monitoring and uptime checks
- review upload restrictions and storage strategy
- review auth and rate-limit settings for your deployment topology

## Additional Docs

- [docs/RUNBOOK.md](docs/RUNBOOK.md)
- [docs/EC2_DEPLOY.md](docs/EC2_DEPLOY.md)
