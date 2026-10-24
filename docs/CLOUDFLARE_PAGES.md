# Frontend на Cloudflare Pages + отдельный backend

Cloudflare Pages хостит **только статический frontend** (папку `frontend/dist`). Он не может
запустить FastAPI, PostgreSQL, worker напоминаний и Telegram-бота. Эти части должны работать на
сервере (см. раздел «Где запустить backend»), а frontend обращается к ним по адресу из
переменной сборки `VITE_API_URL`.

## Почему без backend появлялась ошибка `V.dev_auth`

1. Frontend по умолчанию обращается к API на **своём же** домене: `https://pohui.pages.dev/api/v1/meta`.
2. Backend там нет, а Pages для любых неизвестных путей отдаёт `index.html` со статусом **200**
   (режим одностраничного приложения).
3. Раньше клиент API не проверял тип ответа: HTML не разбирался как JSON, и вместо ошибки
   возвращалось `undefined`. Код запуска читал `undefined.dev_auth` → TypeError.

Теперь клиент распознаёт HTML/пустой/битый ответ, ответы `/meta`, `/me`, `/auth/*` проверяются
по схеме, а приложение показывает экран **«Сервер Family OS недоступен»** с адресом API и кнопкой
«Повторить». Это не исправляет отсутствие backend — его нужно развернуть.

## Настройки проекта в Cloudflare Pages

Cloudflare Dashboard → **Workers & Pages** → проект **pohui** → **Settings**.

### Build (Сборка) — оставить как есть
| Поле | Значение |
|---|---|
| Framework preset | None |
| Build command | `npm run build` |
| Build output directory | `dist` |
| Root directory | `frontend` |

### Branch control
| Поле | Значение |
|---|---|
| Production branch | `claude/family-os-telegram-app-hpkcnl` (имя ветки целиком, без сокращений) |

### Variables and Secrets (переменные сборки)
Добавьте **после того, как backend будет доступен по HTTPS**:

| Тип | Имя | Значение | Среда |
|---|---|---|---|
| Text | `VITE_API_URL` | адрес вашего backend без пути и без `/` в конце, например `https://api.ваш-домен` | Production (и Preview, если нужно) |

Важно:
- Переменная подставляется **при сборке**. После её изменения: **Deployments** → у последнего
  деплоя **⋯** → **Retry deployment** (или новый коммит).
- Это не секрет — адрес API виден в JavaScript. Никаких токенов во frontend-переменные не кладите.
- Секреты (`TELEGRAM_BOT_TOKEN`, ключи OpenAI и т. п.) задаются **только на сервере backend**
  в его `.env`. Pages их не видит и не должен видеть.

### Адрес Mini App
Используйте **постоянный адрес проекта** `https://pohui.pages.dev` (или свой домен в
**Custom domains**), а не адрес конкретного деплоя вида `https://7627086c.pohui.pages.dev` —
он меняется при каждой сборке.

## Настройки backend для такой схемы

В `.env` на сервере backend:
```
FRONTEND_URL=https://pohui.pages.dev
CORS_ORIGINS=https://pohui.pages.dev
BACKEND_URL=https://<адрес_backend>
TELEGRAM_WEBHOOK_URL=https://<адрес_backend>/tg/webhook
SITE_ADDRESS=<адрес_backend_без_https>
```
- `CORS_ORIGINS` разрешает браузеру обращаться к API с домена Pages (несколько адресов —
  через запятую, например вместе со своим доменом).
- В BotFather (`/newapp` или настройки Mini App) URL — `https://pohui.pages.dev`.
- Caddy из `compose.yaml` по-прежнему нужен: он даёт HTTPS для API и вебхука бота.

## Где запустить backend

Нужны постоянно работающие: API (FastAPI), PostgreSQL, Redis, worker (напоминания,
регулярные платежи, отправка уведомлений) и бот. Всё это уже описано в `compose.yaml`.

| Вариант | Стоимость | Комментарий |
|---|---|---|
| **Недорогой VPS** (Hetzner, OVH, Netcup и т. п., 2 ГБ RAM) | несколько € в месяц | Самый надёжный путь. Инструкция: `docs/SETUP_GUIDE.md`. Frontend можно оставить на Pages или отдавать тем же Caddy |
| **Oracle Cloud Always Free** | 0 | Регистрация может не пройти (антифрод). Инструкция: `docs/FREE_SETUP_GUIDE.md` |
| **Домашний компьютер + Cloudflare Tunnel** | 0 за сервер, нужен свой домен в Cloudflare | Компьютер должен работать круглосуточно. Профиль `tunnel` в `compose.yaml`, инструкция в конце `docs/SETUP_GUIDE.md` |
| Google Cloud e2-micro (Free Tier) | 0 | 1 ГБ памяти — впритык, нужен swap; регионы только в США |

Бесплатные PaaS (Render, Railway, Koyeb и т. п.) в бесплатных тарифах обычно усыпляют сервис
и не дают фоновых процессов — напоминания и бот работать не будут без изменения архитектуры.

## Проверка после развёртывания backend

1. `https://<адрес_backend>/health/ready` → `{"status":"ok"}`.
2. `https://<адрес_backend>/api/v1/meta` → JSON с полями `env`, `dev_auth`, `ai_available`,
   `bot_username`, `storage`, `max_upload_mb`; `dev_auth` должен быть `false`.
3. Задать `VITE_API_URL` в Pages и пересобрать.
4. Открыть `https://pohui.pages.dev` в браузере: должно появиться «Откройте приложение в
   Telegram» (это правильно — вход только через Telegram).
5. Открыть Mini App из бота в Telegram: должно предложить создать семью.
