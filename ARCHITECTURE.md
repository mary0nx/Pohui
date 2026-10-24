# Family OS — архитектура

## 1. Обзор

Модульный монолит + отдельные процессы для бота и фоновых задач. Все процессы
используют один и тот же Python-пакет `app` и одну базу PostgreSQL.

```
 Telegram client ──► Mini App (React, статика) ──HTTPS──► Caddy ──► api (FastAPI)
        │                                                  │            │
        └──► Bot API ◄── bot (aiogram, webhook/polling) ◄──┘            │
                    ▲                                                    ▼
                    └──────── worker (планировщик + отправка) ◄──► PostgreSQL
                                                                   Redis (rate limit)
                                                                   Storage (volume / S3)
                                                                   LLM API (OpenAI)
```

| Процесс | Команда | Назначение |
|---------|---------|------------|
| `api` | `uvicorn app.main:app` | REST API `/api/v1`, проверка initData, бизнес-логика, AI-чат |
| `bot` | `python -m app.bot` | Команды, AI-ответы в чате, кнопки подтверждения |
| `worker` | `python -m app.workers` | Повторяющиеся платежи, напоминания, отправка уведомлений, очистка |
| `migrate` | `alembic upgrade head` | Однократный запуск миграций перед стартом api/bot/worker |
| `caddy` | — | HTTPS, статика фронтенда, reverse proxy на api и webhook бота |

## 2. Backend (`backend/app`)

```
app/
  main.py            фабрика FastAPI, middleware, обработчики ошибок
  config.py          Settings (pydantic-settings), проверка конфигурации при старте
  core/              ошибки, логирование, время/часовые пояса, деньги, rate limit, идемпотентность
  db/                engine/session, Base, миксины
  models/            ORM-модели SQLAlchemy 2 (типизированные, async)
  security/          Telegram initData, сессии, политика доступа (visibility, roles)
  api/               зависимости (current user, family context), сборка роутеров v1
  modules/<module>/  router.py (HTTP) + schemas.py (DTO) + service.py (логика)
  ai/                провайдеры LLM, реестр инструментов, ассистент, подтверждения, память
  integrations/      Telegram-отправитель, файловое хранилище
  bot/               aiogram-бот
  workers/           планировщик и задания
migrations/          Alembic
tests/               pytest (реальная тестовая БД PostgreSQL)
```

### 2.1 Слои
* **Router** — только HTTP: схемы запроса/ответа, зависимости, коды.
* **Service** — бизнес-логика и транзакции; принимает `FamilyContext`
  (пользователь + членство + роль), поэтому вызывается одинаково из API, бота и AI.
* **Models** — ORM; DTO (Pydantic) отделены от моделей.

### 2.2 Авторизация (единый слой)
`security/access.py`:
* `get_family_context(family_id)` — зависимость FastAPI: проверяет сессию, членство,
  возвращает `FamilyContext(user, family, member, role)`. Не участник → `404`
  (не раскрываем существование семьи).
* `require_role(ctx, ...)` — проверка роли.
* `visible_filter(Model, ctx)` — SQL-условие `family_id = :fid AND (visibility='family'
  OR created_by = :uid)`. Используется всеми списками, сводками, поиском, AI-инструментами.
* `get_visible_or_404(session, Model, id, ctx)` — загрузка объекта с тем же условием
  (защита от IDOR: чужой ID → 404).
* `ensure_can_edit(obj, ctx)` — изменять приватную запись может только автор.

### 2.3 Аутентификация
1. Mini App отправляет `Telegram.WebApp.initData` на `POST /api/v1/auth/telegram`.
2. Backend проверяет HMAC-SHA256 подпись (`secret = HMAC("WebAppData", bot_token)`),
   `auth_date` (не старше `TELEGRAM_INIT_DATA_MAX_AGE`), разбирает `user`.
3. Создаётся запись `user_sessions` с SHA-256 хешем случайного токена; клиенту
   возвращается сам токен. Повторный обмен того же initData отзывает предыдущую
   сессию, выданную по нему.
4. Клиент передаёт `Authorization: Bearer <token>` (хранение — `sessionStorage`).
5. Dev-режим: `POST /api/v1/auth/dev` доступен только при `APP_ENV=development`
   и `DEV_AUTH_ENABLED=true`; сессия помечается `auth_method=dev`. В production
   приложение отказывается стартовать с включённым dev-входом.

### 2.4 Фоновые задачи
Очередь хранится в PostgreSQL — состояние любой задачи переживает перезапуск.

* **Планировщик** (`workers/scheduler.py`) — цикл с интервалом `WORKER_TICK_SECONDS`;
  каждое задание защищено advisory lock, поэтому несколько воркеров не дублируют работу.
  * `materialize_scheduled_payments` — создаёт `scheduled_payments` на горизонт
    вперёд (`INSERT … ON CONFLICT DO NOTHING`), автосоздание операций для правил
    с `auto_create`.
  * `schedule_reminders` — для событий/задач/платежей/документов создаёт строки
    `notifications` с уникальным `dedupe_key`.
  * `dispatch_notifications` — забирает `pending` с `FOR UPDATE SKIP LOCKED`,
    ставит аренду (`locked_until`), отправляет в Telegram, фиксирует `sent`/ошибку.
    Временные ошибки → экспоненциальный backoff, `RetryAfter` → ожидание, `Forbidden`
    (бот заблокирован) → `failed` без повторов + флаг у пользователя.
  * `cleanup` — истёкшие сессии, предложения AI, ключи идемпотентности.
* Гарантия — at-least-once: если процесс упал после отправки, но до фиксации,
  уведомление может прийти повторно (не теряется). `sent` ставится только после
  ответа Telegram с `message_id`.

### 2.5 AI-модуль (`app/ai`)
```
assistant.py   цикл: сообщение → LLM → tool calls → выполнение/предложение → ответ
providers/     LLMProvider (интерфейс), OpenAIProvider, ScriptedProvider (тесты)
tools/         реестр: имя, Pydantic-схема аргументов, режим (read / auto / confirm), обработчик
proposals.py   создание/подтверждение/отмена предложений
memory.py      сводки диалогов, долгосрочные предпочтения
limits.py      дневные лимиты запросов/токенов на пользователя и семью
```
* Модель получает только схемы инструментов и минимальный контекст (имя, дата,
  часовой пояс, валюта, сохранённые предпочтения, видимые пользователю).
* Аргументы инструмента валидируются Pydantic; `family_id`/`user_id` никогда не
  берутся из аргументов — только из `FamilyContext`.
* Режимы: `read` — сразу; `auto` — сразу, если семья разрешила автодействия, иначе
  как `confirm`; `confirm` — создаётся `ai_action_proposals` (preview, срок жизни,
  `status`), выполняется только `POST /ai/proposals/{id}/confirm` автором
  (атомарный переход `pending → executing`, повтор возвращает тот же результат).
* Результаты инструментов возвращаются модели как данные в JSON; текст из базы
  (описания, документы) помечается как недоверенный.

### 2.6 Бот
aiogram 3, режим `polling` (разработка) или `webhook` (production, проверка
`X-Telegram-Bot-Api-Secret-Token`). Связь «Telegram-пользователь ↔ семья» — по
`users.telegram_id`, который приходит от Telegram в update (доверенный источник).
Использует те же сервисы и тот же AI-ассистент, что и API.

## 3. Frontend (`frontend/src`)

```
app/         корневой компонент, роутинг, провайдеры (Query, Theme, Auth, i18n)
components/  UI-кит (Button, Card, Sheet, Field, EmptyState, …) и layout
features/    dashboard, finance, calendar, shopping, tasks, pantry, recipes, goals,
             documents, assistant, settings, onboarding
lib/         api-клиент, telegram-обёртка, форматирование денег/дат, утилиты
i18n/        словари (ru — основной; en, pl — с откатом на ru)
```
* Серверное состояние — TanStack Query; формы — React Hook Form + Zod.
* Тема: Telegram `colorScheme` + ручной выбор; CSS-переменные, Tailwind v4.
* Навигация: нижняя панель из 5 разделов + кнопка AI; Telegram BackButton на
  вложенных экранах; учёт `safeAreaInset` / `contentSafeAreaInset`.
* Синхронизация — `refetchInterval` на экранах совместного редактирования.

## 4. Данные

Основные таблицы (UUID, `created_at`/`updated_at`, внешние ключи, индексы по
`family_id`):

* Идентичность: `users`, `user_sessions`, `families`, `family_members`,
  `family_invitations`.
* Финансы: `accounts`, `categories`, `transactions`, `budgets`, `recurring_rules`,
  `scheduled_payments`, `savings_goals`, `savings_contributions`.
* Календарь: `calendar_events`, `event_exceptions`, `event_attendees`, `reminders`.
* Дом: `shopping_lists`, `shopping_items`, `tasks`, `task_comments`, `pantry_items`,
  `recipes`, `recipe_ingredients`, `meal_plan_entries`.
* Совместная жизнь: `life_items` (цели, желания, идеи, журнал, заметки), `habits`,
  `habit_checkins`.
* Документы: `documents`.
* Уведомления: `notifications`, `notification_preferences`, `notification_settings`.
* AI: `ai_conversations`, `ai_messages`, `ai_action_proposals`, `ai_memories`,
  `ai_usage_daily`.
* Служебные: `audit_log`, `idempotency_keys`.

Таблица `integrations` не создана: в v1 нет внешних интеграций, кроме Telegram,
связь с которым хранится в `users`.

Политика удаления: данные семьи удаляются каскадно при удалении семьи
(`ON DELETE CASCADE` от `families`); удаление пользователя из семьи не удаляет
созданные им общие записи (`created_by` → `SET NULL` не применяется: участник
остаётся пользователем системы); приватные записи ушедшего участника удаляются
сервисом при выходе из семьи.
