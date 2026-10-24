#!/bin/sh
# Single-container mode for hosts that run one web service (e.g. a free Render web service):
# apply migrations, then serve the API with the worker loop and the Telegram webhook inside it.
# The host's proxy is the only way in, so forwarded headers are trusted (like Caddy in compose).
#
# A database problem (wrong password, unreachable host) must not keep the service from starting:
# the API then reports the cause at /health/ready instead of the deploy failing silently.
set -u
export EMBEDDED_WORKER="${EMBEDDED_WORKER:-true}"
export EMBEDDED_BOT="${EMBEDDED_BOT:-true}"

migrated=no
for attempt in 1 2 3; do
  if alembic upgrade head; then
    migrated=yes
    break
  fi
  echo "migrations failed (attempt $attempt/3)" >&2
  [ "$attempt" -lt 3 ] && sleep 10
done
if [ "$migrated" = yes ]; then
  # Supabase: keep its auto-generated Data API away from family data.
  python -m app.db.lockdown || echo "lockdown failed: disable the Data API in Supabase" >&2
else
  echo "starting without migrations; see /health/ready for the database problem" >&2
fi

exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips '*' --no-server-header
