# Family OS

[Русская версия](README.ru.md)

A private digital space for a couple: budget and finances, calendar and reminders, shopping,
household chores, groceries and meal plans, goals, documents and an AI assistant. It runs as a
**Telegram Mini App** plus a **Telegram bot** for commands, notifications and AI requests.
The user interface is in Russian.

* **Step-by-step setup guide for beginners (Russian) — [`docs/SETUP_GUIDE.md`](docs/SETUP_GUIDE.md)**
* **Frontend on Cloudflare Pages + separate backend — [`docs/CLOUDFLARE_PAGES.md`](docs/CLOUDFLARE_PAGES.md)**
* **Completely free option (Oracle Always Free + DuckDNS + Backblaze B2) — [`docs/FREE_SETUP_GUIDE.md`](docs/FREE_SETUP_GUIDE.md)**
* Requirements and features — [`PROJECT_SPEC.md`](PROJECT_SPEC.md)
* Architecture and data flows — [`ARCHITECTURE.md`](ARCHITECTURE.md)
* Threat model and protections — [`SECURITY.md`](SECURITY.md)
* Task status — [`TASKS.md`](TASKS.md), changelog — [`CHANGELOG.md`](CHANGELOG.md)
* Continuing development on a new device or Claude account — [`docs/HANDOFF.md`](docs/HANDOFF.md) (rules for Claude — [`CLAUDE.md`](CLAUDE.md))

Most detailed documents in `docs/` are written in Russian.

## Components

| Part | Technologies |
|------|-------------|
| `backend/` | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2 (async), Alembic, PostgreSQL 16, aiogram 3, OpenAI SDK, Redis (rate limiting) |
| `frontend/` | React 19, TypeScript (strict), Vite 7, Tailwind CSS 4, TanStack Query, React Hook Form + Zod, Recharts |
| `infra/` | Caddy (HTTPS + static files + reverse proxy), backup scripts |
| Processes | `api` (HTTP API), `worker` (reminders, recurring payments, notification delivery), `bot` (Telegram), `migrate` (runs once per deploy) |

## Requirements

* Development: Python 3.12, [uv](https://docs.astral.sh/uv/) 0.11+, Node.js 22, PostgreSQL 16 (or Docker), optionally Redis.
* Server: a Linux VPS (1 vCPU / 1–2 GB RAM is enough for a family), Docker 24+ with Compose v2, a domain with an A record pointing to the server.

## Quick start for development (app without Docker)

```bash
# 1. Infrastructure: PostgreSQL + Redis on localhost (or use your own)
docker compose -f compose.dev.yaml up -d

# 2. Backend
cd backend
uv sync                                   # creates .venv from uv.lock
cat > .env <<'EOF'
APP_ENV=development
DEV_AUTH_ENABLED=true
DATABASE_URL=postgresql+asyncpg://familyos:familyos@localhost:5432/familyos
REDIS_URL=redis://localhost:6379/0
FRONTEND_URL=http://localhost:5173
BACKEND_URL=http://localhost:5173
CORS_ORIGINS=http://localhost:5173
EOF
.venv/bin/alembic upgrade head
.venv/bin/uvicorn app.main:app --reload --port 8000     # API
.venv/bin/python -m app.workers                          # worker, in another terminal

# 3. Frontend
cd ../frontend
npm ci
npm run dev        # http://localhost:5173, /api is proxied to :8000
```

Outside Telegram, with `DEV_AUTH_ENABLED=true`, a **"Development mode"** screen offers a test
sign-in (for example "Анна" and "Павел", two partners). This mode is clearly labelled: in
production (`APP_ENV=production`) the app refuses to start with dev sign-in enabled, and
`/api/v1/auth/dev` returns 404.

The same with `make`: `make install`, `make dev-infra`, `make migrate`, `make dev-api`,
`make dev-worker`, `make dev-web`.

## Configuring `.env`

A commented template is in [`.env.example`](.env.example). Copy it to `.env` in the repository
root (for Docker Compose) and fill it in. The essentials:

| Variable | Purpose |
|---------|---------|
| `APP_ENV` | `production` on the server |
| `APP_SECRET_KEY` | ≥ 32 random characters; signs temporary file links |
| `POSTGRES_PASSWORD` | database password (use `secrets.token_urlsafe`, without `@:/`) |
| `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS` | `https://your-domain` |
| `SITE_ADDRESS`, `ACME_EMAIL` | domain for Caddy and e-mail for Let's Encrypt |
| `TELEGRAM_BOT_TOKEN` | token from @BotFather (required in production) |
| `TELEGRAM_BOT_USERNAME` | for invite links `t.me/<bot>?start=inv_…` (they go through the bot; BotFather `/newapp` is not required) |
| `BOT_MODE`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET` | `webhook` + `https://domain/tg/webhook` + a random secret |
| `OPENAI_API_KEY`, `AI_MODEL` | enable AI; without them AI is off and everything else works |
| `STORAGE_BACKEND` | `local` (Docker volume) or `s3` + `STORAGE_*` |

Secrets never go into Git (`.env` is in `.gitignore`), the frontend or the logs. Do not paste them into chats.

## Telegram: bot and Mini App

1. In [@BotFather](https://t.me/BotFather): `/newbot` → name and username → get the token
   (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
2. Optional: `/newapp` → choose the bot → set the URL `https://your-domain` and a short name
   (`TELEGRAM_MINI_APP_SHORT_NAME`). This gives you a `https://t.me/<bot>/<name>` link.
   Invitations do not depend on it: they go through the bot (`?start=inv_…`), the bot remembers
   the invitation, and the app offers to join however it was opened.
3. On start-up the bot sets its commands (`/app`, `/help`, `/settings`, `/cancel`) and the
   "Family OS" menu button, and in `webhook` mode registers the webhook with its secret.
4. Every member must open the chat with the bot once and press **Start**: Telegram does not
   let bots write first. Until then notifications are only visible in the app's inbox.
5. Inviting: Profile → "Invite a member" → send the link to your partner. The link is
   single-use, valid for 72 hours and can be revoked.

Authentication: the Mini App sends `Telegram.WebApp.initData`; the backend verifies its HMAC
signature with the bot token and the `auth_date` freshness. The server never trusts `initDataUnsafe`.

## AI assistant

Set `OPENAI_API_KEY` and `AI_MODEL` (the ID of a current model with tool calling from the
OpenAI documentation). `OPENAI_BASE_URL` can point to a compatible provider.
Limits: `AI_DAILY_REQUESTS_PER_USER`, `AI_DAILY_TOKENS_PER_FAMILY`. Family settings can turn
AI off or disable automatic execution of simple commands. Deletions and changes with
consequences always require a confirmation button (in the Mini App or in the bot).

## Running with Docker Compose

```bash
cp .env.example .env && nano .env      # fill in the values
docker compose build
docker compose up -d                   # postgres, redis, migrate → api, worker, (bot), web
docker compose ps
docker compose logs -f api worker
```

* `migrate` runs `alembic upgrade head` once before `api/worker/bot` start;
  repeated runs are protected by an advisory lock, so migrations never run in parallel.
* The bot starts when `COMPOSE_PROFILES=bot` is set in `.env` (a token is required).
* Only Caddy (80/443) is exposed. PostgreSQL and Redis are reachable only on the internal network.
* Locally without TLS: `SITE_ADDRESS=:80`, `HTTP_PORT=8080` → `http://localhost:8080`.

## Migrations

```bash
cd backend
.venv/bin/alembic upgrade head          # apply
.venv/bin/alembic revision --autogenerate -m "description"   # new migration after changing models
.venv/bin/alembic check                 # models and migrations match
```

In Docker: `docker compose run --rm migrate`.

## Tests

```bash
make test-backend    # pytest: integration tests against a real familyos_test database
make test-frontend   # Vitest + React Testing Library
make e2e             # Playwright: backend + built frontend + familyos_e2e database
make lint            # ruff, mypy, tsc
```

Backend tests use `postgresql+asyncpg://familyos:familyos@localhost:5432/familyos_test` by default
(`TEST_DATABASE_URL`). Before a run the schema is recreated and migrations go up, down and up
again. Telegram and the LLM are replaced with test doubles; the database is real.
The 15 mandatory scenarios from the specification are in `backend/tests/test_scenarios.py`.
Frontend tests run on Node.js 22 (as in CI); newer Node versions may fail fetch-based tests.

## Free hosting (Cloudflare Pages + Render + Supabase)

The frontend runs on Cloudflare Pages, the backend as a single free Render service (API,
background jobs and the bot in one process, `render.yaml`), the database is a free Supabase
project. Step by step: [`docs/RENDER_SUPABASE.md`](docs/RENDER_SUPABASE.md); Pages settings:
[`docs/CLOUDFLARE_PAGES.md`](docs/CLOUDFLARE_PAGES.md). Limits: without an external "alarm
clock" the service falls asleep, and uploaded files are not kept without S3.
`render.yaml` and `.github/workflows/keepalive.yml` contain the addresses of the original
deployment: replace them with your own.

## Deploying to a VPS

1. **Server.** Ubuntu 24.04, a separate sudo user, SSH key login. Install Docker Engine and
   the Compose plugin following Docker's official instructions.
2. **Firewall.** Open only 22, 80, 443: `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`.
3. **DNS.** A record `family.example.com` → server IP.
4. **Code and configuration.**
   ```bash
   git clone <repo> familyos && cd familyos
   cp .env.example .env && chmod 600 .env && nano .env
   ```
   Example: `SITE_ADDRESS=family.example.com`, `FRONTEND_URL=BACKEND_URL=CORS_ORIGINS=https://family.example.com`,
   `TELEGRAM_WEBHOOK_URL=https://family.example.com/tg/webhook`, `BOT_MODE=webhook`, `COMPOSE_PROFILES=bot`.
5. **Start.** `docker compose build && docker compose up -d`. Caddy obtains a Let's Encrypt
   certificate by itself (port 80 must be reachable from the internet).
6. **Check.** `curl https://family.example.com/health/ready` → `{"status":"ok"}`;
   open the bot in Telegram → `/start` → "Open Family OS".
7. **Backups.** Set up cron and external storage (see below) and run `make restore-check` right away.

## Updating

```bash
cd familyos
./infra/scripts/backup.sh               # back up first
git pull
docker compose build
docker compose up -d                    # migrate applies new migrations before api starts
docker compose ps && docker compose logs --tail=50 api worker
```

Rollback: `git checkout <previous-tag> && docker compose build && docker compose up -d`.
If the new version already changed the database schema, restore a backup (see below).

## Backups

`infra/scripts/backup.sh` makes a `pg_dump` (custom format) and an archive of uploaded files in
`BACKUP_DIR`, writes checksums, deletes copies older than `BACKUP_KEEP_DAYS` and, if
`RCLONE_REMOTE` is set, sends a copy to external storage with [rclone](https://rclone.org/).
**Do** configure external storage: a copy on the same disk will not survive its failure.

```cron
# crontab -e  (daily at 03:17)
17 3 * * * cd /home/deploy/familyos && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
# weekly check that the backup can be restored
40 3 * * 0 cd /home/deploy/familyos && ./infra/scripts/restore-check.sh >> backups/restore-check.log 2>&1
```

`infra/scripts/restore-check.sh [dump]` restores a dump into a temporary database, runs check
queries (migration version, row counts) and drops the temporary database.

## Disaster recovery

1. New server: steps 1–4 of "Deploying" (the same `.env` from your password manager).
2. Download the latest copies: `rclone copy "$RCLONE_REMOTE" ./backups --include "familyos-*<date>*"`.
3. Start only the database: `docker compose up -d postgres`.
4. `./infra/scripts/restore.sh backups/familyos-db-<stamp>.dump backups/familyos-files-<stamp>.tar.gz`
   (the script asks for the database name as confirmation, then starts the whole stack).
5. Check `/health/ready`, Telegram sign-in and the latest operations.

## Known limitations

* No bank connections: transactions are entered manually or imported from CSV.
* Summaries are in the family's main currency; exchange rates are not used.
* Receipt OCR and image recognition are not implemented.
* Partner sync is periodic polling (5 s in the shopping list), no WebSocket.
* The English and Polish UI translations are partial (navigation and common elements).
* In the calendar a single occurrence can be cancelled, but not edited separately from the series.
* PostgreSQL Row-Level Security is not enabled: isolation is a single authorization layer in the
  app, covered by tests (see `SECURITY.md`).
* Notification delivery is at-least-once: if the worker crashes after sending but before
  recording the status, a message may arrive twice.
* What is verified in this repository and what needs your keys — see `TASKS.md`.

## Repository layout

```
backend/    FastAPI app, bot, worker, migrations, tests
frontend/   Telegram Mini App (React), unit and e2e tests
infra/      Caddyfile, backup and restore scripts
compose.yaml        production stack
compose.dev.yaml    PostgreSQL + Redis for development
Makefile            common commands
```

## License

The code and documentation are released under the [MIT License](LICENSE).
Third-party content keeps its own license: brand logos from Simple Icons (CC0) and Wikimedia Commons (public domain; the logos are trademarks of
their owners, `frontend/public/assets/brands/`), and Wrocław GTFS timetable data (CC0). Details: [`THIRD_PARTY_NOTICES.md`](THIRD_PARTY_NOTICES.md).
