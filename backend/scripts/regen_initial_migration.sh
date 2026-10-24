#!/usr/bin/env bash
# Development helper (pre-release only): rebuild the single initial migration from models.
set -euo pipefail
cd "$(dirname "$0")/.."
.venv/bin/alembic downgrade base >/dev/null 2>&1 || true
rm -f migrations/versions/*initial_schema.py
.venv/bin/alembic revision --autogenerate -m "initial schema" >/dev/null 2>&1
f=$(ls migrations/versions/*initial_schema.py)
.venv/bin/python scripts/patch_cyclic_fks.py "$f"
.venv/bin/ruff format -q "$f" || true
.venv/bin/alembic upgrade head >/dev/null 2>&1
.venv/bin/alembic check 2>&1 | tail -1
