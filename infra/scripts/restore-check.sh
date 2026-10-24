#!/usr/bin/env bash
# Verifies that a database dump can actually be restored: restores it into a throwaway
# database inside the postgres container, runs sanity queries and drops the database.
# Usage: infra/scripts/restore-check.sh [backups/familyos-db-<stamp>.dump]
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a
USER_NAME="${POSTGRES_USER:-familyos}"
DUMP="${1:-$(ls -1t "${BACKUP_DIR:-./backups}"/familyos-db-*.dump | head -n1)}"
CHECK_DB="familyos_restore_check_$(date +%s)"
[ -f "$DUMP" ] || { echo "dump not found: $DUMP" >&2; exit 1; }

echo "[restore-check] using $DUMP"
psql() { docker compose exec -T postgres psql -U "$USER_NAME" -v ON_ERROR_STOP=1 "$@"; }
psql -d postgres -c "CREATE DATABASE $CHECK_DB" >/dev/null
trap 'psql -d postgres -c "DROP DATABASE IF EXISTS $CHECK_DB" >/dev/null' EXIT
docker compose exec -T postgres pg_restore -U "$USER_NAME" -d "$CHECK_DB" --no-owner --exit-on-error < "$DUMP"

psql -d "$CHECK_DB" -At -c "SELECT 'alembic revision: ' || version_num FROM alembic_version"
for t in users families family_members transactions calendar_events shopping_items tasks documents notifications; do
  psql -d "$CHECK_DB" -At -c "SELECT '$t: ' || count(*) FROM $t"
done
echo "[restore-check] OK — dump is restorable"
