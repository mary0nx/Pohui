#!/usr/bin/env bash
# DESTRUCTIVE: replaces the live database (and optionally files) with a backup.
# Usage: infra/scripts/restore.sh backups/familyos-db-<stamp>.dump [backups/familyos-files-<stamp>.tar.gz]
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a
DUMP="${1:?path to .dump file}"
FILES="${2:-}"
USER_NAME="${POSTGRES_USER:-familyos}"
DB="${POSTGRES_DB:-familyos}"

echo "This will REPLACE database '$DB' with $DUMP."
read -r -p "Type the database name to continue: " answer
[ "$answer" = "$DB" ] || { echo "aborted"; exit 1; }

docker compose stop api worker bot web || true
docker compose exec -T postgres psql -U "$USER_NAME" -d postgres -v ON_ERROR_STOP=1 \
  -c "DROP DATABASE IF EXISTS \"$DB\" WITH (FORCE)" -c "CREATE DATABASE \"$DB\" OWNER \"$USER_NAME\""
docker compose exec -T postgres pg_restore -U "$USER_NAME" -d "$DB" --no-owner --exit-on-error < "$DUMP"

if [ -n "$FILES" ]; then
  docker compose run --rm --no-deps -T --entrypoint sh api -c "rm -rf /data/files/* && tar -xzf - -C /data" < "$FILES"
fi

docker compose up -d
echo "Restore finished. Check the app and run: docker compose logs -f api"
