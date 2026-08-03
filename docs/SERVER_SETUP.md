# Разовая настройка VPS под реальный бэкенд (Postgres + NestJS + Groq)

Это нужно выполнить **один раз** вручную на сервере. После этого обычный
`git push` в `main` будет автоматически деплоить и фронтенд, и бэкенд
(см. `.github/workflows/deploy.yml`).

## 1. Postgres

```bash
sudo apt update
sudo apt install -y postgresql postgresql-contrib
sudo -u postgres psql -c "CREATE USER voidcode WITH PASSWORD 'придумай-надёжный-пароль';"
sudo -u postgres psql -c "CREATE DATABASE voidcode OWNER voidcode;"
```

## 2. PM2 (менеджер процессов для Node — держит API живым и перезапускает при падении)

```bash
sudo npm install -g pm2
pm2 startup   # выполни команду, которую pm2 покажет в ответ — это добавит автозапуск после reboot
```

## 3. `.env` для бэкенда

```bash
nano /var/www/void-code-ai-clean/apps/api/.env
```

Содержимое:

```
DATABASE_URL="postgresql://voidcode:придумай-надёжный-пароль@localhost:5432/voidcode?schema=public"
JWT_SECRET="сгенерируй длинную случайную строку, например: openssl rand -hex 32"
JWT_EXPIRES_IN="7d"
GROQ_API_KEY="твой ключ Groq"
PROVIDER_KEY_SECRET="openssl rand -hex 32"
PORT=3000
```

## 4. Первая миграция базы и первый запуск API

```bash
cd /var/www/void-code-ai-clean/apps/api
npm install
npx prisma migrate deploy
npm run build
pm2 start ecosystem.config.js
pm2 save
```

## 5. Nginx — проксируем /api/ на бэкенд

В конфиге сайта (обычно `/etc/nginx/sites-available/void-code-ai` или похожий)
добавь ВНУТРИ существующего `server { ... }` блока (рядом с тем местом, где
отдаётся статика фронтенда):

```nginx
    location /api/ {
        proxy_pass http://127.0.0.1:3000;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;
        # ВАЖНО: LLM-модели на кодовых задачах могут думать до 60-90 секунд.
        # Дефолтный proxy_read_timeout=60 обрывает такие запросы с HTTP 504.
        # Синхронизировано с таймаутом в openrouter.provider.ts (90с).
        proxy_read_timeout 180s;
        proxy_send_timeout 180s;
        proxy_connect_timeout 30s;
    }
```

Затем:

```bash
sudo nginx -t   # проверка синтаксиса
sudo systemctl restart nginx
```

## 6. Права для деплоя по SSH

Пользователь, под которым идёт деплой (`SSH_USER` из GitHub Secrets), должен
уметь без пароля выполнять:
- `pm2 restart void-code-api` / `pm2 start ecosystem.config.js`
- `systemctl restart nginx`

Если деплой идёт не от root — добавь через `sudo visudo`:

```
имя_пользователя ALL=(ALL) NOPASSWD: /bin/systemctl restart nginx
```

(pm2, если установлен для этого же пользователя, sudo не требует).

## Проверка, что всё работает

```bash
curl -X POST http://127.0.0.1:3000/api/v1/auth/register \
  -H "Content-Type: application/json" \
  -d '{"email":"test@voidops.com","password":"testpass123"}'
```

Должен вернуться JSON вида `{"accessToken":"..."}`. Если ошибка про
`DATABASE_URL` — проверь `.env` и что Postgres запущен (`sudo systemctl status postgresql`).
