# Family OS — notes for Claude

Read `docs/HANDOFF.md` first: it says what the app is, where it runs, what is done and how to
continue. The owner writes in Russian and is not a developer: answer in Russian, plainly.

## Rules from the owner (always)

- Never print, copy or commit secrets, tokens or `.env` contents (DB password, bot token,
  Apple Pay keys `fos_…`, S3 keys) — not even ones seen in screenshots.
- Never invent real values or data (routes, stops, times, addresses, logos): only real
  sources, and say honestly when something is unavailable.
- Never weaken Telegram init data checks or open private family data to anyone else.
- Never remove existing features. Do not claim something is fixed before the checks pass.
- No pull requests unless asked. Work on the branch `claude/family-os-telegram-app-hpkcnl`;
  every push to it deploys (Render: `backend/**`; Cloudflare Pages: the frontend).

## Checks before every push (CI runs the same)

```bash
cd backend
uv run ruff check app tests scripts && uv run ruff format --check app tests scripts
uv run mypy app
uv run pytest -q                       # needs PostgreSQL: familyos/familyos@localhost:5432/familyos_test
DATABASE_URL=postgresql+asyncpg://familyos:familyos@localhost:5432/familyos_test uv run alembic check

cd ../frontend
npx tsc -b && npm test && npm run build
npx playwright test                    # e2e: real backend + familyos_e2e database
```

Models and migrations must match (`alembic check`); a new table needs a migration in
`backend/migrations/versions/` with names from the naming convention in `app/db/base.py`.

## Conventions

- Backend: FastAPI modules in `backend/app/modules/<feature>/` (router, service, schemas);
  personal data under `/me/…`, family data under `/families/{id}/…`; background jobs in
  `app/workers/jobs.py` with an advisory lock each; notifications go through the outbox
  (`Notification`) and the dispatcher (Web Push first, Telegram as fallback).
- Frontend: React 19 + TanStack Query, UI kit in `src/components/ui`, features in
  `src/features/<feature>/`, routes in `src/app/routes.tsx`, Russian UI texts, cream /
  mint / peach Family OS style (`docs/DESIGN.md`), mobile first (390 px), safe areas.
- Tests next to the feature: `backend/tests/test_<feature>.py`,
  `frontend/tests/unit/<feature>.test.tsx`.
- Commit messages in English, imperative, with a short body; update `CHANGELOG.md` (Russian).
