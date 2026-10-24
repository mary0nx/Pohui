# Бесплатный backend: Render + Supabase (frontend остаётся на Cloudflare Pages)

Итоговая схема:

| Часть | Где | Стоимость |
|---|---|---|
| Mini App (интерфейс) | Cloudflare Pages, `https://pohui.pages.dev` | 0 |
| API + фоновые задачи + Telegram-бот (один процесс) | Render, бесплатный Web Service | 0 |
| База данных PostgreSQL | Supabase, бесплатный проект | 0 |
| «Будильник», чтобы Render не засыпал | cron-job.org | 0 |

Всё, что нужно в коде, уже сделано: `render.yaml` (настройки Render),
`backend/scripts/start-single-service.sh` (миграции + API + фоновые задачи + бот в одном процессе).

## Честно об ограничениях

- **Засыпание.** Бесплатный сервис Render засыпает после 15 минут без запросов, а просыпается около
  минуты. Шаг 6 (cron-job.org) будит его каждые 10 минут — тогда напоминания приходят вовремя.
  Бесплатных часов Render (750 в месяц) хватает ровно на один постоянно работающий сервис.
- **Файлы документов.** Диск Render стирается при каждом перезапуске и обновлении. Записи о
  документах хранятся в базе, но **загруженные файлы пропадут**. Пока не подключено внешнее
  хранилище (раздел «Хранилище файлов» внизу), не загружайте в Family OS важные файлы.
- **База 500 МБ.** Для семьи этого хватает надолго. Supabase приостанавливает проект после недели
  без активности; фоновые задачи Family OS обращаются к базе постоянно, так что при работающем
  Render этого не случится. Если придёт письмо о паузе — откройте проект и нажмите **Restore**.
- **Почему не Neon.** На бесплатном тарифе Neon 100 часов вычислений в месяц, а фоновым задачам
  нужна база круглосуточно — лимит закончится примерно к середине месяца.
- Если захотите надёжнее без засыпания: платный тариф Render или VPS (`docs/SETUP_GUIDE.md`).

## Что приготовить

- Аккаунт GitHub, в котором лежит репозиторий `Pohui` (у вас уже есть).
- Telegram-бот: **токен**, **username** (без `@`) и **short name** Mini App.
  Если бота ещё нет — `docs/SETUP_GUIDE.md`, «Шаг 5»; в пункте URL укажите
  `https://pohui.pages.dev`.

---

## Шаг 1. База данных в Supabase

1. Откройте https://supabase.com → **Start your project** → **Continue with GitHub**.
2. Если попросит создать организацию: Name — любое, Type — **Personal**, Plan — **Free** →
   **Create organization**.
3. **New project**:
   - **Project name**: `familyos`.
   - **Database Password**: нажмите **Generate a password**, затем **Copy** и сохраните в
     менеджер паролей. Лучше, чтобы в пароле были только латинские буквы и цифры: если там есть
     символы вроде `@ # / ?`, придумайте пароль сами без них.
   - **Region**: **Central EU (Frankfurt)** — рядом с сервером Render.
   - Если есть блок **Security / Data API** с выбором «Data API + Connection String» или
     «Only Connection String» — выберите **Only Connection String** (Family OS не использует
     Data API Supabase).
   - **Create new project**. Подождите 1–2 минуты, пока проект создаётся.
4. Вверху страницы проекта нажмите **Connect**.
5. Вкладка **Connection String** → тип **URI**, способ подключения **Session pooler**
   (не «Direct connection» и не «Transaction pooler»).
6. Скопируйте строку. Она выглядит так:
   `postgresql://postgres.<код_проекта>:[YOUR-PASSWORD]@aws-0-eu-central-1.pooler.supabase.com:5432/postgres`
7. В блокноте замените `[YOUR-PASSWORD]` (вместе со скобками) на пароль из пункта 3.
   Это значение `DATABASE_URL` — оно секретное, никому его не отправляйте.

Если при создании проекта не было выбора «Only Connection String»: **Project Settings** →
**Data API** → выключите **Enable Data API** → **Save**. Даже если забыть этот шаг, сервер
Family OS при каждом запуске отзывает у Data API доступ к своим таблицам.

## Шаг 2. Сервер в Render

1. Откройте https://render.com → **Get Started** → **GitHub** (войти через GitHub).
2. В панели https://dashboard.render.com нажмите **+ New** → **Blueprint**.
3. **Connect a repository**: если репозитория `Pohui` нет в списке — **Configure GitHub** /
   **Connect GitHub**, разрешите доступ к репозиторию `yurypatsko-ctrl/Pohui` → вернитесь и
   выберите его → **Connect**.
4. **Branch**: `claude/family-os-telegram-app-hpkcnl`. **Blueprint Name**: `familyos`.
5. Render прочитает `render.yaml` и покажет сервис **familyos-api** (план Free) и поля,
   которые надо заполнить:

   | Поле | Что вписать |
   |---|---|
   | `DATABASE_URL` | строка из шага 1 (с вашим паролем) |
   | `TELEGRAM_BOT_TOKEN` | токен бота от BotFather |
   | `TELEGRAM_BOT_USERNAME` | username бота без `@` |
   | `TELEGRAM_MINI_APP_SHORT_NAME` | short name Mini App, например `app` |

   Остальное (секретный ключ, адреса, CORS) уже задано в `render.yaml` — не меняйте.
6. Нажмите **Deploy Blueprint** (или **Apply**). Первая сборка идёт 5–10 минут.
7. Откройте сервис **familyos-api** → вкладка **Logs**. Должны появиться строки
   `Running upgrade` (создание таблиц), `worker started`, `bot webhook registered`,
   `Application startup complete`.
8. Вверху страницы сервиса — его адрес вида `https://familyos-api-xxxx.onrender.com`.
   Скопируйте его: это **адрес backend**.

## Шаг 3. Проверить, что backend отвечает

Откройте в браузере (подставьте свой адрес):

1. `https://<адрес_backend>/health/ready` → должно быть `{"status":"ok"}`.
   Если там `"status":"unavailable"`, поле `problem` называет причину:

   | `problem` | Что исправить в Render → **Environment** → `DATABASE_URL` |
   |---|---|
   | `database_password_wrong` | пароль не тот, что в Supabase (или остались `[` `]`) |
   | `database_user_wrong` | часть `postgres.<код_проекта>` скопирована неверно |
   | `database_host_not_found` / `database_unreachable` | адрес: нужен Session pooler, `...pooler.supabase.com:5432` |
   | `database_name_wrong` | в конце строки должно быть `/postgres` |
   | `database_url_invalid` | строка обрезана или в ней пробелы/переносы |
   | `database_not_migrated` | база доступна, но таблицы не созданы: **Manual Deploy** → **Deploy latest commit** |

   Сервер запускается даже при ошибке базы, чтобы причину было видно здесь, без логов.
2. `https://<адрес_backend>/api/v1/meta` → JSON, в котором `"env":"production"`,
   `"dev_auth":false` и `"bot_username"` — ваш бот.

Только когда оба адреса отвечают так, переходите дальше.

## Шаг 4. Подключить frontend в Cloudflare Pages

1. https://dash.cloudflare.com → **Workers & Pages** → проект **pohui** → **Settings** →
   **Variables and Secrets** → **Add**.
2. **Type**: Text. **Variable name**: `VITE_API_URL`.
   **Value**: адрес backend из шага 2, без `/` в конце, например
   `https://familyos-api-xxxx.onrender.com`. Окружение — **Production**. **Save**.
3. **Deployments** → у верхней (последней) строки **⋯** → **Retry deployment**.
   Переменная попадает в сайт только при сборке, поэтому пересобрать обязательно.
4. Откройте `https://pohui.pages.dev` в обычном браузере. Правильный результат:
   «**Откройте приложение в Telegram**» (вход только через Telegram — так и задумано).
   - «Сервер Family OS не подключён» — переменная не задана или сайт не пересобран.
   - «Сервер Family OS недоступен» — backend спит (подождите минуту и нажмите «Повторить»)
     или адрес указан неверно.

## Шаг 5. Telegram

1. В BotFather: `/myapps` (или `/mybots` → ваш бот → **Bot Settings** → **Configure Mini App**)
   → проверьте, что URL Mini App — `https://pohui.pages.dev`.
   Используйте именно этот адрес, а не адрес вида `https://06c41622.pohui.pages.dev`:
   такой адрес относится к одной сборке и меняется.
2. Кнопку меню «Family OS» и команды бот настраивает сам при запуске сервера.
3. Напишите боту `/start` → нажмите кнопку **Открыть** → должно предложить создать семью.

## Шаг 6. Не давать Render засыпать (cron-job.org)

1. https://cron-job.org → **Sign up** (бесплатно) → подтвердите e-mail → войдите.
2. **Create cronjob**:
   - **Title**: `Family OS`.
   - **URL**: `https://<адрес_backend>/health`.
   - **Execution schedule**: **Every 10 minutes**.
   - **Create**.
3. Через 10–20 минут во вкладке **History** должны быть успешные запуски (статус 200).

Альтернатива — UptimeRobot (https://uptimerobot.com, монитор HTTP(s) раз в 5 минут): он
заодно пришлёт письмо, если сервер упадёт.

## Если что-то не работает

| Что видно | Что сделать |
|---|---|
| Сборка в Render упала | **Logs** → последняя ошибка. Проверьте, что выбрана ветка `claude/family-os-telegram-app-hpkcnl` |
| `password authentication failed` в логах | Неверный пароль в `DATABASE_URL`: Render → сервис → **Environment** → исправьте → **Save, rebuild and deploy** |
| `/health/ready` → `unavailable` | Та же проверка `DATABASE_URL`; в Supabase проект не на паузе |
| `embedded bot failed to start` в логах | Неверный `TELEGRAM_BOT_TOKEN`. API при этом работает, сервер сам повторит попытку; исправьте токен в **Environment** |
| Бот молчит | В логах должно быть `bot webhook registered`. Сервер мог спать — проверьте cron-job.org |
| В Mini App «Подпись Telegram недействительна» | Токен в Render не от того бота, через которого открыто приложение |

## Хранилище файлов (по желанию)

Чтобы загруженные документы не пропадали, подключите бесплатное S3-хранилище, например
Backblaze B2 (10 ГБ бесплатно, как создать bucket и ключ — `docs/FREE_SETUP_GUIDE.md`,
шаг 14). Затем в Render → **familyos-api** → **Environment** добавьте:
`STORAGE_BACKEND=s3`, `STORAGE_ENDPOINT` (Endpoint bucket'а с `https://`),
`STORAGE_REGION` (например `eu-central-003`), `STORAGE_BUCKET`, `STORAGE_ACCESS_KEY` (keyID),
`STORAGE_SECRET_KEY` (applicationKey) → **Save, rebuild and deploy**.

## AI-ассистент (по желанию)

Render → **familyos-api** → **Environment**: `OPENAI_API_KEY` и `AI_MODEL` → **Save, rebuild and
deploy**. Без них всё остальное работает, ассистент просто отключён.

## Что делает сервер в этом режиме

- При каждом запуске: `alembic upgrade head` (таблицы), закрытие Data API Supabase
  (`python -m app.db.lockdown`), затем API.
- `EMBEDDED_WORKER=true`: напоминания, регулярные платежи и отправка уведомлений идут внутри
  процесса API (те же задачи, что у отдельного worker в `compose.yaml`).
- `EMBEDDED_BOT=true`: Telegram присылает сообщения на `https://<адрес_backend>/tg/webhook`.
  Каждый запрос проверяется по секретному заголовку; секрет вычисляется из `APP_SECRET_KEY`.
- `CORS_ORIGINS=https://pohui.pages.dev` и `CORS_ORIGIN_REGEX` для адресов сборок
  `https://<hash>.pohui.pages.dev`. Вход только по токену после проверки подписи Telegram,
  cookies не используются.
