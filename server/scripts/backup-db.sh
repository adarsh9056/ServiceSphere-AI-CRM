#!/usr/bin/env bash
set -euo pipefail
# Scheduled database backup (cron). Requires pg_dump and DATABASE_URL or PG* vars.
# Example cron (daily 2:30 UTC): 30 2 * * * /opt/servicesphere/server/scripts/backup-db.sh >> /var/log/crm-backup.log 2>&1

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT"

if [[ -f .env ]]; then
  set -a
  # shellcheck disable=SC1091
  source .env
  set +a
fi

if [[ -z "${DATABASE_URL:-}" ]]; then
  echo "DATABASE_URL is required" >&2
  exit 1
fi

BACKUP_ROOT="${BACKUP_DIR:-${ROOT}/backups}"
mkdir -p "$BACKUP_ROOT"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
OUT="$BACKUP_ROOT/crmdb-${STAMP}.sql.gz"

pg_dump "$DATABASE_URL" --no-owner --format=plain | gzip -9 > "$OUT"
echo "Wrote $OUT"

# Optional: sync to S3 (uncomment and configure)
# aws s3 cp "$OUT" "s3://${S3_BACKUP_BUCKET}/crm/$(basename "$OUT")"

# Optional: prune local copies older than RETAIN_DAYS
RETAIN_DAYS="${BACKUP_RETAIN_DAYS:-14}"
find "$BACKUP_ROOT" -name 'crmdb-*.sql.gz' -mtime "+${RETAIN_DAYS}" -delete 2>/dev/null || true
