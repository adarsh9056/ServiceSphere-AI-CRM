# EC2 deployment (reverse proxy, HTTPS, process manager, database)

This complements [RUNBOOK.md](./RUNBOOK.md) with a typical **single-region EC2 + RDS** layout.

## Repo templates (copy — don’t edit in place on the server)

| Path | Purpose |
|------|---------|
| [deploy/nginx/crm-api.conf](../deploy/nginx/crm-api.conf) | nginx TLS + `/graphql` + `/api/` proxy |
| [deploy/pm2/ecosystem.config.cjs](../deploy/pm2/ecosystem.config.cjs) | PM2 API + worker |
| [deploy/systemd/crm-api.service](../deploy/systemd/crm-api.service) | systemd API unit |
| [deploy/systemd/crm-worker.service](../deploy/systemd/crm-worker.service) | systemd worker unit |
| [server/scripts/backup-db.sh](../server/scripts/backup-db.sh) | Scheduled `pg_dump` (cron) |
| [server/scripts/restore-db.sh](../server/scripts/restore-db.sh) | Interactive restore |

## Architecture

- **EC2** (e.g. `t3.small` or larger): Node API (`node server.js`), optional **worker** (`node worker.js`), **nginx** as reverse proxy.
- **RDS PostgreSQL** (or self-managed Postgres on a second instance): `DATABASE_URL` with TLS.
- **S3** (optional): attachment files instead of local disk — would replace `UPLOAD_DIR` usage in code.
- **Secrets**: AWS Secrets Manager or SSM Parameter Store for `JWT_SECRET`, DB password, `SENTRY_DSN`, etc.

## nginx (TLS termination)

Example server block (Certbot-managed certs):

```nginx
server {
    listen 443 ssl http2;
    server_name api.example.com;
    ssl_certificate     /etc/letsencrypt/live/api.example.com/fullchain.pem;
    ssl_certificate_key /etc/letsencrypt/live/api.example.com/privkey.pem;

    location / {
        proxy_pass http://127.0.0.1:4000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
    }
}
```

Set `TRUST_PROXY_HOPS=1` (or `2` behind another LB) on the API so rate limits and IP logging use `X-Forwarded-For`.

## HTTPS (Let’s Encrypt)

```bash
sudo apt install certbot python3-certbot-nginx
sudo certbot --nginx -d api.example.com
```

Renewals are usually via cron/systemd timer.

## PM2 (API + worker)

```bash
cd /opt/servicesphere/server
npm ci --omit=dev
npx prisma migrate deploy

pm2 start server.js --name crm-api
pm2 start worker.js --name crm-worker
pm2 save
pm2 startup
```

Environment: use `ecosystem.config.cjs` or systemd drop-ins for `DATABASE_URL`, `JWT_SECRET`, `CLIENT_ORIGIN`, `SENTRY_DSN`, `IMAP_*`, `PUBLIC_API_URL=https://api.example.com`.

## systemd (alternative)

Two `service` units: `crm-api.service` and `crm-worker.service`, both `WorkingDirectory=/opt/servicesphere/server`, `ExecStart=/usr/bin/node server.js` (or `worker.js`), `EnvironmentFile=/etc/crm.env`.

## Managed Postgres (RDS)

- Enable automated backups and a **multi-AZ** instance for HA.
- Use **parameter groups** tuned for your load; enable `sslmode=require` in `DATABASE_URL`.
- **Hardening**: security group only from EC2 SG; no public RDS endpoint unless required.

## Backup plan (if not on RDS)

- Nightly `pg_dump` to S3 (cron + `aws s3 cp`).
- Test restores quarterly.
- Application uploads: snapshot EBS volume or sync `uploads/` to S3.

## Frontend

Build the Vite app (`client/`) with `VITE_GRAPHQL_URL=https://api.example.com/graphql` and host `dist/` on S3+CloudFront or the same nginx server under `/`.
