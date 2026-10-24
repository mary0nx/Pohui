# Family OS полностью бесплатно — пошаговая инструкция

Схема: **сервер Oracle Cloud Always Free** + **бесплатный адрес DuckDNS** + **бесплатный
HTTPS Let's Encrypt** + **бот Telegram** + **бэкапы в Backblaze B2 (10 ГБ бесплатно)**.
AI-ассистент не подключаем — он платный, всё остальное работает без него.

Всё можно сделать **даже с одного iPhone** (через приложение Termius), но с компьютером проще.
Время: 1,5–2 часа. Названия кнопок в панелях иногда меняются — ищите похожие.

В тексте:
- `ВАШ_IP` — IP-адрес сервера (получите в шаге 3);
- `ВАШЕ_ИМЯ` — имя адреса DuckDNS (шаг 6), полный адрес будет `ВАШЕ_ИМЯ.duckdns.org`.

---

## Шаг 1. Подготовить SSH-ключ (ключ для входа на сервер)

### Вариант А: с iPhone (приложение Termius)
1. Установите из App Store приложение **Termius** (бесплатное).
2. Откройте его, пропустите/закройте предложения подписки (бесплатной версии достаточно).
3. Внизу/в меню откройте **Keychain** → **+** → **Generate Key**.
4. Name: `oracle`, тип: **ED25519** → **Save**.
5. Нажмите на созданный ключ → **Export public key** / **Copy public key** — публичный ключ
   (строка начинается с `ssh-ed25519`) скопируется. Вставьте его в «Заметки», он понадобится в шаге 3.

### Вариант Б: с компьютера
1. Откройте **PowerShell** (Windows) или **Терминал** (macOS).
2. Выполните:
   ```
   ssh-keygen -t ed25519
   ```
   На все вопросы нажимайте Enter.
3. Покажите публичный ключ:
   - Windows: `type $env:USERPROFILE\.ssh\id_ed25519.pub`
   - macOS: `cat ~/.ssh/id_ed25519.pub`
4. Скопируйте всю строку (начинается с `ssh-ed25519`).

---

## Шаг 2. Зарегистрироваться в Oracle Cloud

1. Откройте https://www.oracle.com/cloud/free/ → **Start for free**.
2. Заполните: страна, имя, фамилия, e-mail → подтвердите e-mail по ссылке из письма.
3. Придумайте пароль и **Cloud Account Name** (латиницей, например `myfamily`). Запишите его —
   он нужен для входа.
4. **Home Region** — выберите один из европейских (например, Germany Central (Frankfurt),
   Netherlands Northwest (Amsterdam), Sweden Central (Stockholm)). **Сменить его потом нельзя.**
   Бесплатный сервер можно создать только в домашнем регионе.
5. Адрес и телефон — реальные.
6. Банковская карта: нужна только для проверки личности. Oracle может временно
   заблокировать небольшую сумму и вернуть её. Пока вы на тарифе **Free Tier**, денег не списывают.
7. Нажмите **Start my free trial** и дождитесь письма о готовности аккаунта (обычно 5–30 минут).

> Первые 30 дней дают ещё и пробный кредит — его не трогайте; всё, что мы создаём, входит в
> **Always Free** и бесплатно навсегда.

---

## Шаг 3. Создать бесплатный сервер

1. Войдите на https://cloud.oracle.com (Cloud Account Name → e-mail → пароль).
2. Меню **☰** (слева вверху) → **Compute** → **Instances** → **Create instance**.
3. **Name**: `familyos`.
4. **Image and shape** → **Edit**:
   - **Change image** → **Ubuntu** → **Canonical Ubuntu 24.04** → **Select image**.
   - **Change shape** → **Ampere** → отметьте **VM.Standard.A1.Flex** →
     **Number of OCPUs: 2**, **Amount of memory (GB): 12** → **Select shape**.
     Возле shape должна быть пометка **Always Free-eligible**.
5. **Networking**: оставьте «Create new virtual cloud network» и «Create new public subnet»;
   убедитесь, что включено **Automatically assign public IPv4 address**.
6. **Add SSH keys** → **Paste public keys** → вставьте ключ из шага 1.
7. **Boot volume**: оставьте по умолчанию (≈47 ГБ — входит в бесплатные 200 ГБ).
8. Нажмите **Create**.
9. Через 1–3 минуты статус станет **RUNNING**. На странице сервера найдите **Public IP address**
   — это `ВАШ_IP`. Запишите.

**Если ошибка «Out of capacity for shape VM.Standard.A1.Flex»** — бесплатных ARM-серверов
сейчас нет в этой зоне. Что делать:
- в разделе **Placement** выберите другой **Availability domain** (AD-2, AD-3) и повторите;
- или уменьшите до **1 OCPU / 6 GB** — этого тоже хватит;
- или повторите через несколько часов (лучше рано утром).

---

## Шаг 4. Открыть порты 80 и 443 в облаке Oracle

1. На странице сервера → блок **Instance details** → ссылка рядом с **Virtual cloud network**
   (или **Primary VNIC** → **Subnet**).
2. Откройте **Security Lists** → **Default Security List for …**.
3. **Add Ingress Rules**:
   - Source CIDR: `0.0.0.0/0`
   - IP Protocol: **TCP**
   - Destination Port Range: `80`
   - **Add Ingress Rules**.
4. Ещё раз **Add Ingress Rules** — то же самое, но порт `443`.

---

## Шаг 5. Защитить сервер от удаления за простой (рекомендуется)

Oracle может отключить бесплатный сервер, который почти не нагружен 7 дней подряд, — а наше
приложение нагружает его очень мало. Это правило не действует для аккаунтов **Pay As You Go**,
при этом всё из Always Free остаётся бесплатным.

1. Сначала поставьте ограничитель трат: меню **☰** → **Billing & Cost Management** →
   **Budgets** → **Create Budget**: сумма `1`, оповещение на e-mail при 1 % (пункт **Threshold**).
   Так вы сразу узнаете о любой случайной трате.
2. Меню **☰** → **Billing & Cost Management** → **Upgrade and Manage Payment** →
   **Upgrade your account** → **Pay As You Go**.
3. После этого **ничего платного не создавайте**. Пока у вас один сервер A1 (до 4 OCPU / 24 ГБ)
   и диски в сумме до 200 ГБ — плата 0.

Если не хотите давать Oracle возможность списывать деньги — пропустите этот шаг, но тогда
особенно важны бэкапы (шаг 14): при удалении сервера всё восстановится из них.

---

## Шаг 6. Получить бесплатный адрес в DuckDNS

1. Откройте https://www.duckdns.org → войдите через **Google** или **GitHub**.
2. В поле **sub domain** впишите имя латиницей, например `myfamily` → **add domain**.
3. В строке появившегося адреса в поле **current ip** впишите `ВАШ_IP` → **update ip**.
4. Ваш адрес: `ВАШЕ_ИМЯ.duckdns.org`. Запишите.

---

## Шаг 7. Подключиться к серверу

### С iPhone (Termius)
1. Termius → **Hosts** → **+** → **New Host**.
2. **Address**: `ВАШ_IP`; **Username**: `ubuntu`; **Key**: выберите ключ `oracle`.
3. Сохраните и нажмите на хост. На вопрос о fingerprint — **Continue**/**Yes**.
4. Над клавиатурой Termius есть панель с клавишами **Ctrl**, **Esc**, стрелками — они понадобятся
   в редакторе.

### С компьютера
```
ssh ubuntu@ВАШ_IP
```
На вопрос ответьте `yes`.

Дальше все команды вводятся **на сервере**. Копируйте их целиком.

---

## Шаг 8. Подготовить сервер

### 8.1. Обновить систему
```
sudo apt update && sudo apt upgrade -y
```
Если появится окно с вопросом — нажмите Enter.

### 8.2. Открыть порты 80 и 443 на самом сервере
В образах Oracle закрыто всё, кроме SSH. **Не используйте ufw** — выполните:
```
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 80 -j ACCEPT
sudo iptables -I INPUT 6 -m state --state NEW -p tcp --dport 443 -j ACCEPT
sudo netfilter-persistent save
```
Если последняя команда пишет `command not found`, выполните
`sudo apt install -y iptables-persistent` (на вопросы ответьте Yes) и повторите её.

### 8.3. Установить Docker
```
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker ubuntu
```

### 8.4. Переподключиться
```
exit
```
Подключитесь снова (шаг 7) и проверьте:
```
docker --version
docker compose version
```
Должны показаться версии без ошибок.

---

## Шаг 9. Создать Telegram-бота

1. В Telegram найдите **@BotFather** (с синей галочкой) → **Start**.
2. `/newbot` → имя (например `Family OS`) → username латиницей, оканчивается на `bot`
   (например `myfamily_family_bot`).
3. Скопируйте **токен** (`1234567890:AA...`) в «Заметки». Никому его не показывайте.
4. `/newapp` → выберите бота →
   - Title: `Family OS`;
   - Description: любое;
   - Photo: любая картинка 640×360 (можно скриншот, обрезанный до этого размера);
   - GIF: `/empty`;
   - **URL**: `https://ВАШЕ_ИМЯ.duckdns.org`;
   - **Short name**: `app`.
5. Запишите: **токен**, **username бота** (без @), **short name** (`app`).

---

## Шаг 10. Скачать код на сервер

```
cd ~
git clone -b claude/family-os-telegram-app-hpkcnl https://github.com/yurypatsko-ctrl/Pohui.git familyos
cd familyos
ls
```
Должны появиться `backend`, `frontend`, `infra`, `compose.yaml`.

Если git спрашивает логин/пароль (репозиторий приватный):
- **Username** — логин GitHub;
- **Password** — токен: GitHub → аватар → **Settings** → **Developer settings** →
  **Personal access tokens** → **Fine-grained tokens** → **Generate new token** →
  Repository access: только этот репозиторий → Permissions: **Contents — Read-only** →
  **Generate token** → скопируйте и вставьте вместо пароля.

---

## Шаг 11. Создать файл настроек `.env`

### 11.1. Сгенерировать три секрета
Выполните три раза, каждый результат скопируйте в «Заметки»:
```
openssl rand -hex 32
```

### 11.2. Подготовить текст
В «Заметках» (или блокноте) подготовьте текст ниже, заменив всё в `< >` (скобки удалить):

```
APP_ENV=production
APP_SECRET_KEY=<секрет_1>
LOG_LEVEL=INFO
DEFAULT_TIMEZONE=Europe/Warsaw
DEFAULT_CURRENCY=PLN
FRONTEND_URL=https://<ВАШЕ_ИМЯ>.duckdns.org
BACKEND_URL=https://<ВАШЕ_ИМЯ>.duckdns.org
CORS_ORIGINS=https://<ВАШЕ_ИМЯ>.duckdns.org
DEV_AUTH_ENABLED=false
POSTGRES_USER=familyos
POSTGRES_PASSWORD=<секрет_2>
POSTGRES_DB=familyos
TELEGRAM_BOT_TOKEN=<токен_бота>
TELEGRAM_BOT_USERNAME=<username_бота>
TELEGRAM_MINI_APP_SHORT_NAME=app
BOT_MODE=webhook
TELEGRAM_WEBHOOK_URL=https://<ВАШЕ_ИМЯ>.duckdns.org/tg/webhook
TELEGRAM_WEBHOOK_SECRET=<секрет_3>
COMPOSE_PROFILES=bot
AI_PROVIDER=disabled
STORAGE_BACKEND=local
MAX_UPLOAD_MB=15
SITE_ADDRESS=<ВАШЕ_ИМЯ>.duckdns.org
ACME_EMAIL=<ваш_email>
BACKUP_DIR=./backups
BACKUP_KEEP_DAYS=14
RCLONE_REMOTE=
```

Проверьте:
- в `SITE_ADDRESS` **нет** `https://`;
- пробелов вокруг `=` нет.

### 11.3. Создать файл на сервере
```
nano .env
```
Вставьте подготовленный текст (в Termius — долгое нажатие → **Paste**).
Сохранить: **Ctrl+O**, потом **Enter**. Выйти: **Ctrl+X**.

```
chmod 600 .env
```

---

## Шаг 12. Запустить

```
docker compose build
```
Первый раз 5–15 минут. В конце не должно быть `ERROR`.

```
docker compose up -d
docker compose ps
```
Должны быть `postgres`, `redis`, `api`, `worker`, `bot`, `web` в состоянии **Up**.
`migrate` с **Exited (0)** — это нормально.

Через 1–2 минуты (сервер получает HTTPS-сертификат):
```
curl https://ВАШЕ_ИМЯ.duckdns.org/health/ready
```
Ответ: `{"status":"ok"}`.

Проверить бота (подставьте токен):
```
curl https://api.telegram.org/bot<токен>/getWebhookInfo
```
В ответе — ваш адрес `.../tg/webhook`, и нет `last_error_message`.

---

## Шаг 13. Первый вход

**Вы:**
1. Откройте своего бота в Telegram → **Start** (обязательно — иначе он не сможет присылать напоминания).
2. **Открыть Family OS** → введите название семьи → **Создать**.
3. **Профиль** → **Пригласить участника** → **Отправить** → пришлите ссылку партнёру
   (одноразовая, 72 часа).

**Партнёр:**
1. Открывает ссылку → **Присоединиться**.
2. Открывает чат с ботом → **Start**.

---

## Шаг 14. Бесплатные бэкапы в Backblaze B2

### 14.1. Создать хранилище
1. https://www.backblaze.com → **Sign Up** → выберите **B2 Cloud Storage** → e-mail и пароль.
   Первые 10 ГБ бесплатны.
2. **Buckets** → **Create a Bucket**:
   - Bucket name: уникальное, например `familyos-backups-myfamily`;
   - Files in Bucket are: **Private** → **Create a Bucket**.
3. **Application Keys** → **Add a New Application Key**:
   - Name: `familyos`;
   - Allow access to Bucket: ваш bucket;
   - **Create New Key**.
4. Сразу скопируйте **keyID** и **applicationKey** — второй показывают только один раз.

### 14.2. Подключить на сервере
```
curl https://rclone.org/install.sh | sudo bash
rclone config
```
Отвечайте:
1. `n` (New remote)
2. name: `backup`
3. Storage: введите `b2`
4. account: вставьте **keyID**
5. key: вставьте **applicationKey**
6. hard_delete: Enter
7. Edit advanced config: `n`
8. Keep this remote: `y`
9. `q` (выход)

Проверка:
```
rclone lsd backup:
```
Должен показаться ваш bucket.

### 14.3. Включить в приложении
```
cd ~/familyos
nano .env
```
Измените строку (имя bucket — своё):
```
RCLONE_REMOTE=backup:familyos-backups-myfamily
```
Сохраните (**Ctrl+O**, **Enter**, **Ctrl+X**). Проверьте:
```
mkdir -p backups
./infra/scripts/backup.sh
./infra/scripts/restore-check.sh
```
В конце: `[backup] done` (без предупреждения о RCLONE_REMOTE) и `OK — dump is restorable`.

### 14.4. Ежедневно автоматически
```
crontab -e
```
Если спросит редактор — `1` (nano). В конец добавьте:
```
17 3 * * * cd /home/ubuntu/familyos && ./infra/scripts/backup.sh >> backups/backup.log 2>&1
40 3 * * 0 cd /home/ubuntu/familyos && ./infra/scripts/restore-check.sh >> backups/restore-check.log 2>&1
```
Сохраните и выйдите.

---

## Шаг 15. Обновление приложения

```
cd ~/familyos
./infra/scripts/backup.sh
git pull
docker compose build
docker compose up -d
```

## Если Oracle удалил сервер или он сломался

1. Шаги 3, 4, 7, 8 — новый сервер.
2. В DuckDNS впишите новый IP (шаг 6, кнопка **update ip**).
3. Шаг 10 (код) и тот же `.env` (держите копию в менеджере паролей!).
4. Настройте rclone (шаг 14.2) и скачайте бэкапы:
   ```
   cd ~/familyos && mkdir -p backups
   rclone copy backup:familyos-backups-myfamily ./backups
   ls backups
   ```
5. ```
   docker compose build
   docker compose up -d postgres
   ./infra/scripts/restore.sh backups/familyos-db-<дата>.dump backups/familyos-files-<дата>.tar.gz
   ```
   На вопрос введите `familyos`.

## Если что-то не работает

| Признак | Что делать |
|---|---|
| `curl` по адресу не отвечает | Проверьте шаг 4 (правила 80/443 в Security List) и шаг 8.2; в DuckDNS указан правильный IP; `docker compose logs web --tail=50` |
| `api` перезапускается | `docker compose logs api --tail=50` — там понятная ошибка в `.env`; исправьте и `docker compose up -d --force-recreate` |
| Бот не отвечает | `docker compose logs bot --tail=50` и `getWebhookInfo` (шаг 12) |
| Не приходят напоминания | Нажмите **Start** у бота; **Профиль → Уведомления** |
| «Данные авторизации устарели» | Закройте и снова откройте Mini App |
| Изменили `.env`, ничего не поменялось | `docker compose up -d --force-recreate` |

**Никогда** не запускайте `docker compose down -v` — это удалит базу данных и файлы.
