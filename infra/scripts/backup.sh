#!/usr/bin/env bash
# Family OS backup: PostgreSQL dump (custom format) + uploaded files.
# Run from the repository root on the VPS (cron example in README).
# A copy is pushed off-site with rclone when RCLONE_REMOTE is set — keep at least one
# copy outside this server: a backup on the same disk does not survive a disk failure.
set -euo pipefail
cd "$(dirname "$0")/../.."
[ -f .env ] && set -a && . ./.env && set +a

BACKUP_DIR="${BACKUP_DIR:-./backups}"
KEEP_DAYS="${BACKUP_KEEP_DAYS:-14}"
STAMP="$(date -u +%Y%m%dT%H%M%SZ)"
mkdir -p "$BACKUP_DIR"
umask 077

DB_FILE="$BACKUP_DIR/familyos-db-$STAMP.dump"
FILES_FILE="$BACKUP_DIR/familyos-files-$STAMP.tar.gz"

echo "[backup] dumping database -> $DB_FILE"
docker compose exec -T postgres pg_dump -U "${POSTGRES_USER:-familyos}" -d "${POSTGRES_DB:-familyos}" -Fc --no-owner > "$DB_FILE.part"
mv "$DB_FILE.part" "$DB_FILE"

echo "[backup] archiving uploaded files -> $FILES_FILE"
docker compose exec -T api tar -czf - -C /data files > "$FILES_FILE.part"
mv "$FILES_FILE.part" "$FILES_FILE"

sha256sum "$DB_FILE" "$FILES_FILE" > "$BACKUP_DIR/familyos-$STAMP.sha256"

if [ -n "${RCLONE_REMOTE:-}" ]; then
  echo "[backup] uploading to $RCLONE_REMOTE"
  rclone copy "$BACKUP_DIR" "$RCLONE_REMOTE" --include "familyos-*$STAMP*"
else
  echo "[backup] WARNING: RCLONE_REMOTE is not set — backups exist only on this server" >&2
fi

find "$BACKUP_DIR" -name 'familyos-*' -type f -mtime "+$KEEP_DAYS" -delete
echo "[backup] done: $STAMP"
