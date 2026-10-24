# Family OS

Частное цифровое пространство семейной пары: бюджет и финансы, календарь и напоминания,
покупки, домашние задачи, продукты и меню, цели, документы и AI-ассистент. Работает как
**Telegram Mini App** плюс **Telegram-бот** для команд, уведомлений и AI-запросов.

* Требования и функциональность — [`PROJECT_SPEC.md`](PROJECT_SPEC.md)
* Архитектура и потоки данных — [`ARCHITECTURE.md`](ARCHITECTURE.md)
* Модель угроз и защита — [`SECURITY.md`](SECURITY.md)
* Статус задач — [`TASKS.md`](TASKS.md), история изменений — [`CHANGELOG.md`](CHANGELOG.md)

## Состав

| Часть | Технологии |
|-------|-----------|
| `backend/` | Python 3.12, FastAPI, Pydantic 2, SQLAlchemy 2 (async), Alembic, PostgreSQL 16, aiogram 3, OpenAI SDK, Redis (rate limit) |
| `frontend/` | React 19, TypeScript (strict), Vite 7, Tailwind CSS 4, TanStack Query, React Hook Form + Zod, Recharts |
| `infra/` | Caddy (HTTPS + статика + reverse proxy), скрипты резервного копирования |
| Процессы | `api` (HTTP API), `worker` (напоминания, регулярные платежи, отправка уведомлений), `bot` (Telegram), `migrate` (однократно при деплое) |

## Требования

* Для разработки: Python 3.12, [uv](https://docs.astral.sh/uv/) 0.11+, Node.js 22, PostgreSQL 16 (или Docker), опционально Redis.
* Для сервера: Linux VPS (1 vCPU / 1–2 ГБ RAM достаточно для семьи), Docker 24+ с Compose v2, домен с A-записью на сервер.

## Быстрый старт для разработки (без Docker для приложения)

```bash
# 1. Инфраструктура: PostgreSQL + Redis на localhost (или используйте свои)
docker compose -f compose.dev.yaml up -d

# 2. Backend
cd backend
uv sync                                   # создаёт .venv по uv.lock
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
.venv/bin/python -m app.workers                          # в другом терминале: worker

# 3. Frontend
cd ../frontend
npm ci
npm run dev        # http://localhost:5173, /api проксируется на :8000
```

Вне Telegram при `DEV_AUTH_ENABLED=true` появляется экран **«Режим разработки»** с
тестовым входом (например, «Анна» и «Павел» — два партнёра). Это явно помеченный
режим: в production (`APP_ENV=production`) приложение отказывается стартовать с включённым
dev-входом, а маршрут `/api/v1/auth/dev` отвечает 404.

То же через `make`: `make install`, `make dev-infra`, `make migrate`, `make dev-api`,
`make dev-worker`, `make dev-web`.

## Настройка `.env`

Шаблон с комментариями — [`.env.example`](.env.example). Скопируйте его в `.env` в корне
репозитория (для Docker Compose) и заполните. Главное:

| Переменная | Назначение |
|-----------|-----------|
| `APP_ENV` | `production` на сервере |
| `APP_SECRET_KEY` | ≥ 32 случайных символа; подписывает временные ссылки на файлы |
| `POSTGRES_PASSWORD` | пароль БД (используйте `secrets.token_urlsafe` — без символов `@:/`) |
| `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS` | `https://ваш-домен` |
| `SITE_ADDRESS`, `ACME_EMAIL` | домен для Caddy и e-mail для Let's Encrypt |
| `TELEGRAM_BOT_TOKEN` | токен от @BotFather (обязателен в production) |
| `TELEGRAM_BOT_USERNAME`, `TELEGRAM_MINI_APP_SHORT_NAME` | для ссылок-приглашений `t.me/<бот>/<app>?startapp=…` |
| `BOT_MODE`, `TELEGRAM_WEBHOOK_URL`, `TELEGRAM_WEBHOOK_SECRET` | `webhook` + `https://домен/tg/webhook` + случайный секрет |
| `OPENAI_API_KEY`, `AI_MODEL` | включают AI; без них AI выключен, остальное работает |
| `STORAGE_BACKEND` | `local` (том Docker) или `s3` + `STORAGE_*` |

Секреты не попадают в Git (`.env` в `.gitignore`), во фронтенд и в логи. Не отправляйте их в чаты.

## Telegram: бот и Mini App

1. В [@BotFather](https://t.me/BotFather): `/newbot` → имя и username → получите токен
   (`TELEGRAM_BOT_TOKEN`, `TELEGRAM_BOT_USERNAME`).
2. `/newapp` → выберите бота → укажите URL `https://ваш-домен` и короткое имя
   (`TELEGRAM_MINI_APP_SHORT_NAME`). Так появится ссылка `https://t.me/<бот>/<имя>`.
3. Бот при запуске сам устанавливает команды (`/app`, `/help`, `/settings`, `/cancel`) и
   кнопку меню «Family OS», а в режиме `webhook` — вебхук с секретом.
4. Каждый участник должен один раз открыть чат с ботом и нажать **Старт**: Telegram не
   позволяет ботам писать первыми. До этого уведомления видны только во входящих приложения.
5. Приглашение: Профиль → «Пригласить участника» → отправьте ссылку партнёру. Ссылка
   одноразовая и действует 72 часа; её можно отозвать.

Проверка подлинности: Mini App отправляет `Telegram.WebApp.initData`, backend проверяет
HMAC-подпись токеном бота и срок `auth_date`; `initDataUnsafe` сервер не использует.

## AI-ассистент

Задайте `OPENAI_API_KEY` и `AI_MODEL` (идентификатор актуальной модели из документации
OpenAI с поддержкой tool calling). Можно указать `OPENAI_BASE_URL` для совместимого провайдера.
Лимиты: `AI_DAILY_REQUESTS_PER_USER`, `AI_DAILY_TOKENS_PER_FAMILY`. В настройках семьи
можно выключить AI или автоматическое выполнение простых команд. Удаление и изменения с
последствиями всегда требуют подтверждения кнопкой (в Mini App или в боте).

## Запуск через Docker Compose

```bash
cp .env.example .env && nano .env      # заполните значения
docker compose build
docker compose up -d                   # postgres, redis, migrate → api, worker, (bot), web
docker compose ps
docker compose logs -f api worker
```

* `migrate` выполняет `alembic upgrade head` один раз перед стартом `api/worker/bot`;
  повторные запуски защищены advisory-lock, миграции не идут параллельно.
* Бот запускается при `COMPOSE_PROFILES=bot` в `.env` (нужен токен).
* Наружу публикуется только Caddy (80/443). PostgreSQL и Redis доступны лишь во внутренней сети.
* Локально без TLS: `SITE_ADDRESS=:80`, `HTTP_PORT=8080` → `http://localhost:8080`.

## Миграции

```bash
cd backend
.venv/bin/alembic upgrade head          # применить
.venv/bin/alembic revision --autogenerate -m "описание"   # новая миграция после изменения моделей
.venv/bin/alembic check                 # модели и миграции совпадают
```

В Docker: `docker compose run --rm migrate`.

## Тесты

```bash
make test-backend    # pytest: 73 интеграционных теста на реальной БД familyos_test
make test-frontend   # Vitest + React Testing Library
make e2e             # Playwright: backend + собранный фронтенд + БД familyos_e2e
make lint            # ruff, mypy, tsc
```

Backend-тесты по умолчанию используют
`postgresql+asyncpg://familyos:familyos@localhost:5432/familyos_test` (переменная
`TEST_DATABASE_URL`). Перед прогоном схема пересоздаётся, миграции проходят вверх, вниз и
снова вверх. Telegram и LLM в тестах заменены тестовыми двойниками; база данных — настоящая.
Сценарий из 15 обязательных пунктов ТЗ — `backend/tests/test_scenarios.py`.

## Развёртывание на VPS

1. **Сервер.** Ubuntu 24.04, отдельный пользователь с sudo, вход по SSH-ключу. Установите
   Docker Engine и Compose plugin по официальной инструкции Docker.
2. **Firewall.** Откройте только 22, 80, 443: `ufw allow OpenSSH && ufw allow 80,443/tcp && ufw allow 443/udp && ufw enable`.
3. **DNS.** A-запись `family.example.com` → IP сервера.
4. **Код и конфигурация.**
   ```bash
   git clone <repo> familyos && cd familyos
   cp .env.example .env && chmod 600 .env && nano .env
   ```
   Пример домена: `SITE_ADDRESS=family.example.com`, `FRONTEND_URL=BACKEND_URL=CORS_ORIGINS=https://family.example.com`,
   `TELEGRAM_WEBHOOK_URL=https://family.example.com/tg/webhook`, `BOT_MODE=webhook`, `COMPOSE_PROFILES=bot`.
5. **Запуск.** `docker compose build && docker compose up -d`. Caddy сам получит сертификат
   Let's Encrypt (порт 80 должен быть доступен из интернета).
6. **Проверка.** `curl https://family.example.com/health/ready` → `{"status":"ok"}`;
   откройте бота в Telegram → `/start` → «Открыть Family OS».
7. **Бэкапы.** Настройте cron и внешнее хранилище (см. ниже) и сразу выполните `make restore-check`.

## Обновление

```bash
cd familyos
./infra/scripts/backup.sh               # сначала резервная копия
git pull
docker compose build
docker compose up -d                    # migrate применит новые миграции до старта api
docker compose ps && docker compose logs --tail=50 api worker
```

Откат: `git checkout <предыдущий-тег> && docker compose build && docker compose up -d`.
Если новая версия уже изменила схему БД, восстановите резервную копию (см. ниже).

## Резервное копирование

`infra/scripts/backup.sh` делает `pg_dump` (custom format) и архив загруженных файлов в
`BACKUP_DIR`, пишет контрольные суммы, удаляет копии старше `BACKUP_KEEP_DAYS` и, если задан
`RCLONE_REMOTE`, отправляет копию во внешнее хранилище через [rclone](https://rclone.org/).
**Обязательно** настройте внешнее хранилище: копия на том же диске не спасёт при его отказе.

```cron
# crontab -e  (ежедневно в 03:17)
17 3 * * * cd /home/deploy/familyos && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
# еженедельная проверка, что копия восстанавливается
40 3 * * 0 cd /home/deploy/familyos && ./infra/scripts/restore-check.sh >> backups/restore-check.log 2>&1
```

`infra/scripts/restore-check.sh [dump]` восстанавливает дамп во временную БД, выполняет
проверочные запросы (версия миграции, количество записей) и удаляет временную БД.

## Восстановление после сбоя

1. Новый сервер: шаги 1–4 из «Развёртывания» (тот же `.env` из менеджера паролей).
2. Скачайте последние копии: `rclone copy "$RCLONE_REMOTE" ./backups --include "familyos-*<дата>*"`.
3. Поднимите только БД: `docker compose up -d postgres`.
4. `./infra/scripts/restore.sh backups/familyos-db-<stamp>.dump backups/familyos-files-<stamp>.tar.gz`
   (скрипт попросит ввести имя БД для подтверждения, затем запустит весь стек).
5. Проверьте `/health/ready`, вход через Telegram и последние операции.

## Известные ограничения

* Подключения к банкам нет: операции вводятся вручную или импортируются из CSV.
* Сводки считаются в основной валюте семьи; курсы валют не используются.
* OCR чеков и распознавание изображений не реализованы.
* Синхронизация между партнёрами — периодический опрос (5 с в списке покупок), без WebSocket.
* Перевод интерфейса на английский и польский частичный (навигация и общие элементы).
* В календаре можно отменить отдельное повторение, но не изменить его отдельно от серии.
* PostgreSQL Row-Level Security не включена: изоляция реализована единым слоем авторизации
  в приложении и покрыта тестами (см. `SECURITY.md`).
* Доставка уведомлений — «как минимум один раз»: при падении worker после отправки, но до
  записи статуса, сообщение может прийти повторно.
* Что проверено в этом репозитории и что требует ваших ключей — см. `TASKS.md`.

## Структура репозитория

```
backend/    FastAPI-приложение, бот, worker, миграции, тесты
frontend/   Telegram Mini App (React), unit- и e2e-тесты
infra/      Caddyfile, скрипты резервного копирования и восстановления
compose.yaml        production-стек
compose.dev.yaml    PostgreSQL + Redis для разработки
Makefile            частые команды
```
