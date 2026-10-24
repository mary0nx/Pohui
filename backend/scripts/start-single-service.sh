#!/bin/sh
# Single-container mode for hosts that run one web service (e.g. a free Render web service):
# apply migrations, then serve the API with the worker loop and the Telegram webhook inside it.
# The host's proxy is the only way in, so forwarded headers are trusted (like Caddy in compose).
set -eu
export EMBEDDED_WORKER="${EMBEDDED_WORKER:-true}"
export EMBEDDED_BOT="${EMBEDDED_BOT:-true}"
alembic upgrade head
python -m app.db.lockdown  # Supabase: keep its auto-generated Data API away from family data
exec uvicorn app.main:app --host 0.0.0.0 --port "${PORT:-8000}" \
  --proxy-headers --forwarded-allow-ips '*' --no-server-header
