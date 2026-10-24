# Family OS — пошаговая инструкция запуска

Инструкция для человека, который делает это впервые. Займёт около часа.
Везде, где написано `family.example.com`, подставляйте **свой** домен.

---

## Шаг 0. Что понадобится

1. **Сервер (VPS)** с Ubuntu 24.04, минимум 1 ядро и **2 ГБ памяти** (подойдёт самый дешёвый
   тариф у Hetzner, OVH, DigitalOcean и т. п.).
2. **Домен** (например, `family.example.com` или свой `.pl`/`.com`). Нужен для HTTPS —
   без HTTPS Telegram не откроет Mini App.
3. **Аккаунт Telegram** (ваш) и аккаунт партнёра.
4. **Доступ к GitHub** с этим репозиторием.
5. Компьютер с терминалом: на Windows — PowerShell, на macOS — «Терминал».
6. (Необязательно) **ключ OpenAI** для AI-ассистента — всё остальное работает без него.

---

## Шаг 1. Купить сервер

1. Зарегистрируйтесь у хостинг-провайдера и создайте сервер:
   - Образ: **Ubuntu 24.04**.
   - Тариф: 2 ГБ RAM или больше.
   - Регион: ближайший к вам (например, Германия/Польша).
   - Если предлагают добавить **SSH-ключ** — добавьте (см. ниже). Если нет — запомните пароль root,
     который пришлют.
2. Запишите **IP-адрес** сервера (вида `203.0.113.10`).
3. Если у провайдера есть отдельный «Firewall» в панели (например, Hetzner Cloud Firewall) —
   разрешите входящие порты **22, 80, 443 (TCP)** и **443 (UDP)**.

**Как сделать SSH-ключ (один раз, на своём компьютере):**
```
ssh-keygen -t ed25519
```
Нажимайте Enter на все вопросы. Публичный ключ лежит в файле
`C:\Users\ВАШЕ_ИМЯ\.ssh\id_ed25519.pub` (Windows) или `~/.ssh/id_ed25519.pub` (macOS).
Откройте его блокнотом и вставьте содержимое в панели хостинга при создании сервера.

---

## Шаг 2. Купить домен и направить его на сервер

1. Купите домен у любого регистратора.
2. В панели управления доменом откройте **DNS-записи** и добавьте:
   - Тип: **A**
   - Имя (Host): `family` (тогда адрес будет `family.ваш-домен`) или `@` (сам домен)
   - Значение: **IP вашего сервера**
   - TTL: по умолчанию
3. Подождите 5–30 минут. Проверить на своём компьютере:
   ```
   ping family.example.com
   ```
   Должен отвечать IP вашего сервера.

---

## Шаг 3. Подключиться к серверу

На своём компьютере:
```
ssh root@203.0.113.10
```
(подставьте свой IP). На вопрос `Are you sure you want to continue connecting` напишите `yes`.
Если вход по паролю — введите пароль root (символы при вводе не видны, это нормально).

Дальше все команды выполняются **на сервере**.

---

## Шаг 4. Подготовить сервер

### 4.1. Обновить систему
```
apt update && apt upgrade -y
```
Если появится розовое окно с вопросом о конфигурации — нажмите Enter (оставить по умолчанию).

### 4.2. Создать отдельного пользователя `deploy`
```
adduser deploy
```
Придумайте пароль, остальные вопросы — Enter.
```
usermod -aG sudo deploy
mkdir -p /home/deploy/.ssh
cp /root/.ssh/authorized_keys /home/deploy/.ssh/ 2>/dev/null
chown -R deploy:deploy /home/deploy/.ssh
```

### 4.3. Включить firewall
```
ufw allow OpenSSH
ufw allow 80/tcp
ufw allow 443/tcp
ufw allow 443/udp
ufw enable
```
На вопрос ответьте `y`.

### 4.4. Добавить файл подкачки (защита от нехватки памяти при сборке)
```
fallocate -l 2G /swapfile
chmod 600 /swapfile
mkswap /swapfile
swapon /swapfile
echo '/swapfile none swap sw 0 0' >> /etc/fstab
```

### 4.5. Установить Docker (официальный скрипт Docker)
```
curl -fsSL https://get.docker.com | sh
usermod -aG docker deploy
```
Проверка:
```
docker --version
docker compose version
```
Обе команды должны вывести версии.

### 4.6. Перейти в пользователя deploy
```
exit
```
и снова подключитесь, уже как deploy:
```
ssh deploy@203.0.113.10
```

---

## Шаг 5. Создать Telegram-бота

Делается в Telegram на телефоне или компьютере.

1. Найдите в поиске **@BotFather** (с синей галочкой) и нажмите «Start».
2. Отправьте `/newbot`.
3. Введите **имя** бота (как его будут видеть), например `Family OS`.
4. Введите **username** — латиницей, должен заканчиваться на `bot`, например `myfamily_family_bot`.
5. BotFather пришлёт **токен** вида `1234567890:AAH...`. Это пароль от бота:
   - сохраните его в менеджер паролей;
   - никому не отправляйте и не публикуйте.
6. Создайте Mini App: отправьте `/newapp`.
   - Выберите своего бота.
   - Название (title): `Family OS`.
   - Описание: любое, например «Наш семейный бюджет и дела».
   - Картинку: отправьте любое изображение **640×360** (если BotFather разрешит пропустить — `/empty`).
   - GIF: `/empty`.
   - **URL**: `https://family.example.com` (ваш домен, обязательно `https://`).
   - **Short name**: короткое имя латиницей, например `app`.
   - BotFather покажет ссылку `https://t.me/myfamily_family_bot/app` — сохраните её.

Запишите себе три значения:
- токен бота;
- username бота (без `@`);
- short name Mini App.

---

## Шаг 6. Скачать код на сервер

На сервере (вы зашли как `deploy`):
```
cd ~
git clone -b claude/family-os-telegram-app-hpkcnl https://github.com/yurypatsko-ctrl/Pohui.git familyos
cd familyos
```

**Если репозиторий приватный**, git спросит логин и пароль:
- Username: ваш логин GitHub.
- Password: **не пароль от GitHub**, а токен. Создать его:
  GitHub → аватар справа вверху → **Settings** → **Developer settings** →
  **Personal access tokens** → **Fine-grained tokens** → **Generate new token** →
  в «Repository access» выберите только этот репозиторий → в «Permissions» →
  **Contents: Read-only** → «Generate». Скопируйте токен и вставьте как пароль.

Проверка:
```
ls
```
Должны быть видны папки `backend`, `frontend`, `infra` и файл `compose.yaml`.

---

## Шаг 7. Создать файл настроек `.env`

### 7.1. Сгенерировать три секрета
Выполните **три раза** и каждый результат сохраните:
```
openssl rand -hex 32
```
- 1-й — для `APP_SECRET_KEY`;
- 2-й — для `POSTGRES_PASSWORD`;
- 3-й — для `TELEGRAM_WEBHOOK_SECRET`.

### 7.2. Создать файл
```
nano .env
```
Откроется редактор. Вставьте текст ниже (правый клик или `Ctrl+Shift+V`) и **замените всё,
что в угловых скобках**, на свои значения (угловые скобки тоже удалите):

```
APP_ENV=production
APP_SECRET_KEY=<секрет_1>
LOG_LEVEL=INFO
DEFAULT_TIMEZONE=Europe/Warsaw
DEFAULT_CURRENCY=PLN

FRONTEND_URL=https://<ваш_домен>
BACKEND_URL=https://<ваш_домен>
CORS_ORIGINS=https://<ваш_домен>
DEV_AUTH_ENABLED=false

POSTGRES_USER=familyos
POSTGRES_PASSWORD=<секрет_2>
POSTGRES_DB=familyos

TELEGRAM_BOT_TOKEN=<токен_бота>
TELEGRAM_BOT_USERNAME=<username_бота_без_собаки>
TELEGRAM_MINI_APP_SHORT_NAME=<short_name>
BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://<ваш_домен>/tg/webhook
TELEGRAM_WEBHOOK_SECRET=<секрет_3>
COMPOSE_PROFILES=bot

AI_PROVIDER=openai
OPENAI_API_KEY=
AI_MODEL=

STORAGE_BACKEND=local
MAX_UPLOAD_MB=15

SITE_ADDRESS=<ваш_домен>
ACME_EMAIL=<ваш_email>

BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=14
RCLONE_REMOTE=
```

Важно:
- `SITE_ADDRESS` — **только** домен, без `https://` (например, `family.example.com`).
- В остальных адресах `https://` нужен.
- Пробелов вокруг `=` быть не должно.

Сохранить: `Ctrl+O`, затем Enter. Выйти: `Ctrl+X`.

### 7.3. Закрыть файл от посторонних
```
chmod 600 .env
```

---

## Шаг 8. Запустить приложение

### 8.1. Собрать (первый раз 5–15 минут)
```
docker compose build
```
В конце не должно быть строк `ERROR`.

### 8.2. Запустить
```
docker compose up -d
```

### 8.3. Проверить, что всё работает
```
docker compose ps
```
Должны быть строки `postgres`, `redis`, `api`, `worker`, `bot`, `web` со статусом `Up`
(у части — `(healthy)`). Строка `migrate` со статусом `Exited (0)` — это нормально:
она один раз создаёт таблицы и завершается.

Подождите 1–2 минуты (Caddy получает HTTPS-сертификат) и проверьте:
```
curl https://<ваш_домен>/health/ready
```
Ответ должен быть: `{"status":"ok"}`.

Проверка бота:
```
curl https://api.telegram.org/bot<токен_бота>/getWebhookInfo
```
В ответе должен быть `"url":"https://<ваш_домен>/tg/webhook"` и **не должно** быть
`last_error_message`.

---

## Шаг 9. Первый вход

### Вы
1. Откройте в Telegram своего бота (по username) и нажмите **Start** (или отправьте `/start`).
   Это обязательно — иначе бот не сможет присылать вам напоминания.
2. Нажмите кнопку **«Открыть Family OS»** (или кнопку меню слева от поля ввода).
3. Введите название семьи, валюту и часовой пояс → **Создать**.
4. Перейдите во вкладку **Профиль** → **Пригласить участника** → **Отправить** и пришлите
   ссылку партнёру. Ссылка одноразовая и действует 72 часа.

### Партнёр
1. Открывает ссылку-приглашение → в Telegram откроется Mini App → **Присоединиться**.
2. Открывает чат с ботом и нажимает **Start** (чтобы получать уведомления).

Готово: общие расходы, покупки, события и задачи видны обоим. Всё, что отмечено как
«Только мне» (личный счёт, заметки и т. п.), видно только автору.

---

## Шаг 10 (по желанию). Подключить AI-ассистента

1. Зайдите на https://platform.openai.com → войдите → раздел **API keys** →
   **Create new secret key**. Скопируйте ключ (`sk-...`). Пополните баланс в разделе Billing.
2. Выберите модель на странице документации OpenAI «Models» — подойдёт любая актуальная
   модель, которая поддерживает function calling (tool calling). Скопируйте её точный идентификатор.
3. На сервере:
   ```
   cd ~/familyos
   nano .env
   ```
   Заполните:
   ```
   OPENAI_API_KEY=<ваш_ключ>
   AI_MODEL=<идентификатор_модели>
   ```
   Сохраните (`Ctrl+O`, Enter, `Ctrl+X`).
4. Перезапустите:
   ```
   docker compose up -d --force-recreate api worker bot
   ```
5. Проверка: в приложении нажмите кнопку с искрами (✨) и спросите «Сколько мы потратили в этом месяце?».
   Или просто напишите это сообщение боту.

Лимиты по умолчанию: 100 запросов в день на человека. Изменить можно в `.env`
(`AI_DAILY_REQUESTS_PER_USER`, `AI_DAILY_TOKENS_PER_FAMILY`).

---

## Шаг 11. Настроить резервные копии (обязательно)

### 11.1. Проверить ручной бэкап
```
cd ~/familyos
mkdir -p backups
./infra/scripts/backup.sh
```
В конце будет `[backup] done`. Файлы появятся в папке `backups/`.

Проверить, что копия восстанавливается:
```
./infra/scripts/restore-check.sh
```
В конце должно быть `OK — dump is restorable`.

### 11.2. Отправка копий за пределы сервера (rclone)
Копия на том же сервере пропадёт вместе с ним, поэтому нужна внешняя.

1. Установите rclone:
   ```
   curl https://rclone.org/install.sh | sudo bash
   ```
2. Заведите хранилище (например, Backblaze B2 — бесплатно до 10 ГБ, или любое S3-совместимое):
   создайте bucket `familyos-backups` и ключ доступа в панели провайдера.
3. Настройте rclone:
   ```
   rclone config
   ```
   - `n` (новый remote) → имя `backup` → выберите тип хранилища из списка (например, `b2` или `s3`)
     → введите ключи → на остальные вопросы Enter → `q` для выхода.
4. Проверка:
   ```
   rclone lsd backup:
   ```
   Должен показаться bucket `familyos-backups`.
5. В `.env` впишите:
   ```
   RCLONE_REMOTE=backup:familyos-backups
   ```
6. Запустите `./infra/scripts/backup.sh` ещё раз — предупреждения `RCLONE_REMOTE is not set`
   быть не должно.

### 11.3. Автоматический ежедневный бэкап
```
crontab -e
```
(если спросит редактор — выберите `1`, nano). В конец файла добавьте две строки:
```
17 3 * * * cd /home/deploy/familyos && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
40 3 * * 0 cd /home/deploy/familyos && ./infra/scripts/restore-check.sh >> backups/restore-check.log 2>&1
```
Сохраните. Бэкап будет каждый день в 03:17, проверка восстановления — по воскресеньям.

---

## Шаг 12. Как обновлять приложение

```
cd ~/familyos
./infra/scripts/backup.sh
git pull
docker compose build
docker compose up -d
docker compose ps
```
Миграции базы применятся автоматически перед запуском.

---

## Шаг 13. Как восстановиться после сбоя

1. Подготовьте новый сервер по шагам 1–6 (шаг 2 — поменяйте IP в DNS-записи).
2. Верните **тот же** `.env` (храните его копию в менеджере паролей).
3. Настройте rclone (шаг 11.2) и скачайте копии:
   ```
   mkdir -p backups
   rclone copy backup:familyos-backups ./backups
   ls backups
   ```
4. Соберите образы и запустите только базу:
   ```
   docker compose build
   docker compose up -d postgres
   ```
5. Восстановите (подставьте имена самых свежих файлов):
   ```
   ./infra/scripts/restore.sh backups/familyos-db-<дата>.dump backups/familyos-files-<дата>.tar.gz
   ```
   Скрипт попросит ввести имя базы — напишите `familyos`.
6. Проверьте `https://<ваш_домен>/health/ready` и вход через бота.

---

## Если что-то не работает

| Признак | Что сделать |
|--------|-------------|
| `docker compose ps` показывает, что `api` перезапускается | `docker compose logs api --tail=50`. Обычно там понятная ошибка: короткий `APP_SECRET_KEY`, пустой `TELEGRAM_BOT_TOKEN`, опечатка в `.env`. Исправьте `.env` и выполните `docker compose up -d --force-recreate` |
| Сайт не открывается по HTTPS | `docker compose logs web --tail=50`. Проверьте, что `ping <домен>` даёт IP сервера, что порты 80 и 443 открыты (и в ufw, и в firewall панели хостинга), что в `SITE_ADDRESS` нет `https://` |
| Бот не отвечает | `docker compose logs bot --tail=50` и `getWebhookInfo` (шаг 8.3). Проверьте токен и `TELEGRAM_WEBHOOK_URL` |
| В браузере «Откройте приложение в Telegram» | Это нормально: приложение работает только внутри Telegram |
| «Данные авторизации устарели» | Закройте Mini App и откройте заново из бота |
| Не приходят напоминания | Нажмите **Start** в чате с ботом; проверьте **Профиль → Уведомления** (категории, тихие часы); `docker compose logs worker --tail=50` |
| AI пишет «недоступен» | Проверьте `OPENAI_API_KEY`, `AI_MODEL`, баланс OpenAI; после правки `.env` — `docker compose up -d --force-recreate api worker bot` |
| Сборка падает с нехваткой памяти | Проверьте, что swap включён (`free -h`), шаг 4.4 |
| Изменили `.env`, но ничего не поменялось | `docker compose up -d --force-recreate` |

## Полезные команды

```
cd ~/familyos
docker compose ps                    # состояние сервисов
docker compose logs -f api worker    # логи (выход — Ctrl+C)
docker compose restart               # перезапуск
docker compose down                  # остановить (данные сохраняются)
docker compose up -d                 # запустить
df -h                                # свободное место на диске
```

**Никогда** не выполняйте `docker compose down -v` на рабочем сервере — флаг `-v` удаляет
базу данных и файлы.

---

## Вариант: Cloudflare Tunnel (без открытия портов, подходит для домашнего компьютера)

Туннель нужен, если сервер стоит дома или вы не хотите открывать порты 80/443.
HTTPS тогда обеспечивает Cloudflare. Нужен **свой домен, подключённый к Cloudflare**.

1. **Подключить домен к Cloudflare.** dash.cloudflare.com → «Add a domain» → введите домен →
   тариф **Free** → Cloudflare покажет два адреса NS-серверов (вида `xxx.ns.cloudflare.com`).
   У регистратора домена замените NS-серверы на эти два. Дождитесь письма «domain is active»
   (от минут до суток). Если домен покупаете прямо в Cloudflare — этот шаг делается сам.
2. **Создать туннель.** dash.cloudflare.com → **Zero Trust** → **Networks** → **Tunnels** →
   **Create a tunnel** → тип **Cloudflared** → имя `familyos` → Save.
   На экране установки выберите Docker и скопируйте **токен** — длинную строку после `--token`
   (начинается с `eyJ`). Сам предложенный `docker run` выполнять не нужно.
3. **Указать адрес.** В том же туннеле → вкладка **Public Hostname** (или «Routes») →
   **Add a public hostname**:
   - Subdomain: `family`, Domain: ваш домен;
   - Service: Type **HTTP**, URL **`web:80`**.
   Сохраните.
4. **В `.env` на сервере** измените/добавьте:
   ```
   SITE_ADDRESS=:80
   COMPOSE_PROFILES=bot,tunnel
   CLOUDFLARE_TUNNEL_TOKEN=<токен_из_шага_2>
   ```
   Адреса `FRONTEND_URL`, `BACKEND_URL`, `CORS_ORIGINS`, `TELEGRAM_WEBHOOK_URL` остаются
   `https://family.<ваш_домен>`.
5. Шаг 4.3 (открытие портов 80/443) не нужен. Запуск как обычно:
   ```
   docker compose up -d
   docker compose logs tunnel --tail=20
   ```
   В логах должно быть `Registered tunnel connection` (обычно 4 раза).
6. Проверка: `curl https://family.<ваш_домен>/health/ready` → `{"status":"ok"}`.
