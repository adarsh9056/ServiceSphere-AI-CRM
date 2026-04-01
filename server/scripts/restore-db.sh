#!/usr/bin/env bash
set -euo pipefail
# Restore from a gzip SQL dump. DANGEROUS: drops data on target DB.
# Usage: DATABASE_URL=... ./scripts/restore-db.sh /path/to/crmdb-*.sql.gz

if [[ $# -lt 1 ]]; then
  echo "Usage: $0 /path/to/backup.sql.gz" >&2
  exit 1
fi

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

FILE="$1"
if [[ ! -f "$FILE" ]]; then
  echo "File not found: $FILE" >&2
  exit 1
fi

echo "Restoring $FILE into DATABASE_URL target (ensure this is a disposable database)."
read -r -p "Type RESTORE to continue: " confirm
if [[ "$confirm" != "RESTORE" ]]; then
  echo "Aborted."
  exit 1
fi

gunzip -c "$FILE" | psql "$DATABASE_URL" -v ON_ERROR_STOP=1
echo "Restore finished."
