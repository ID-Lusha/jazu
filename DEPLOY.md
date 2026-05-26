# Развёртывание Jazu в production

Полная инструкция: всё работает в Docker, https через Caddy + Let's Encrypt, два домена (`app.*` + `api.*`), без шагов «руками на сервере поставить Node».

## Содержание

- [Архитектура](#архитектура)
- [Что должно быть на сервере](#что-должно-быть-на-сервере)
- [Шаг 1. Подготовка домена и DNS](#шаг-1-подготовка-домена-и-dns)
- [Шаг 2. OAuth-клиент Google](#шаг-2-oauth-клиент-google)
- [Шаг 3. Деплой на сервер](#шаг-3-деплой-на-сервер)
- [Шаг 4. Первый запуск](#шаг-4-первый-запуск)
- [Эксплуатация](#эксплуатация)
- [Обновление кода](#обновление-кода)
- [Бэкапы Postgres](#бэкапы-postgres)
- [Что в каких контейнерах](#что-в-каких-контейнерах)
- [Troubleshooting](#troubleshooting)

---

## Архитектура

```
                ┌─────────────────────┐
                │   Caddy (80/443)    │  Let's Encrypt + reverse proxy
                └──────┬──────────────┘
       app.jazu.io     │      api.jazu.io
           ┌───────────┴───────────┐
           ▼                       ▼
    ┌────────────┐         ┌────────────┐
    │  web:3000  │         │  api:3001  │  ──► Fastify, prisma migrate deploy
    └────────────┘         └─────┬──────┘
                                 │
                       ┌─────────┼──────────┐
                       ▼         ▼          ▼
                ┌────────────┐ ┌────────┐ ┌──────────────┐
                │ postgres   │ │ redis  │ │ wa-worker    │  ──► Baileys
                │ :5432 (in) │ │ :6379  │ │ :4001 (in)   │
                └────────────┘ └────────┘ └──────────────┘
```

Все контейнеры — в одной Docker network (`jazu_default`). Наружу торчат только `caddy:80/443`. Postgres, Redis, API, web, wa-worker недоступны с интернета напрямую.

---

## Что должно быть на сервере

- **Linux** (Ubuntu 22.04+, Debian 12+ — оба подходят), минимум 2 vCPU и 4 GB RAM.
- **Docker Engine 24+** и **Docker Compose v2** (входит в Docker Desktop / `docker-compose-plugin`).
- **Свободные порты 80 и 443** на хосте.
- Открытые наружу порты: только `80` и `443`. Всё остальное за firewall (`ufw allow 22,80,443/tcp`).

Установка Docker на Ubuntu:

```bash
curl -fsSL https://get.docker.com | sudo sh
sudo usermod -aG docker $USER  # перезайдите в SSH
docker compose version
```

---

## Шаг 1. Подготовка домена и DNS

Заведите два A-record (или CNAME) у своего DNS-провайдера:

| Поддомен        | Тип | Значение           | Назначение |
|-----------------|-----|--------------------|------------|
| `app.jazu.io`   | A   | IP вашего сервера  | Веб-приложение (Next.js) |
| `api.jazu.io`   | A   | IP вашего сервера  | API (Fastify) |

Подождите 5-30 минут, пока DNS пропагируется (`dig app.jazu.io +short` должен вернуть IP).

> Без работающих доменов Let's Encrypt не выдаст сертификат — Caddy будет циклически перезапускаться. Сначала DNS, потом всё остальное.

---

## Шаг 2. OAuth-клиент Google

Если планируете кнопку «Войти через Google» — создайте OAuth client для прода **отдельный** от локального. Шаги в `README.md → Google OAuth setup`, ключевая разница:

- **Authorized redirect URIs:** `https://api.jazu.io/api/auth/google/callback` (https + прод-домен).
- Запишите `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` — пригодятся ниже.

Если Google пока не нужен — оставьте три переменные пустыми, кнопка просто не покажется.

---

## Шаг 3. Деплой на сервер

### 3.1. Загрузить код

```bash
ssh user@your-server
git clone https://github.com/yourorg/jazu.git
cd jazu
```

### 3.2. Заполнить `.env`

```bash
cp .env.prod.example .env
nano .env
```

Сгенерируйте секреты:

```bash
openssl rand -hex 32   # → MAGIC_LINK_SECRET
openssl rand -hex 32   # → API_INTERNAL_TOKEN
openssl rand -hex 24   # → POSTGRES_PASSWORD
```

Минимальный набор обязательных переменных в `.env`:

```
WEB_DOMAIN=app.jazu.io
API_DOMAIN=api.jazu.io
WEB_ORIGIN=https://app.jazu.io
API_ORIGIN=https://api.jazu.io
NEXT_PUBLIC_API_BASE_URL=https://api.jazu.io/api
ACME_EMAIL=admin@jazu.io

POSTGRES_PASSWORD=<openssl rand -hex 24>
MAGIC_LINK_SECRET=<openssl rand -hex 32>
API_INTERNAL_TOKEN=<openssl rand -hex 32>

OPENAI_API_KEY=sk-...
RESEND_API_KEY=re_...
FROM_EMAIL=noreply@jazu.io

# Если Google нужен:
GOOGLE_CLIENT_ID=...
GOOGLE_CLIENT_SECRET=...
GOOGLE_REDIRECT_URI=https://api.jazu.io/api/auth/google/callback
```

### 3.3. Собрать образы

```bash
pnpm docker:prod:build
# либо: docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env build
```

Первая сборка 3-7 минут (зависит от CPU). При повторных билдах сильно быстрее благодаря layer cache.

> `NEXT_PUBLIC_API_BASE_URL` зашивается в JS-бандл на этапе билда. Если меняете `API_DOMAIN` — обязательно пересоберите образ web.

### 3.4. Запустить

```bash
pnpm docker:prod:up
# либо: docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d
```

Проверьте, что всё поднялось:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml ps
```

Должно быть 6 контейнеров в статусе `Up (healthy)`:
- `jazu-postgres-1` healthy
- `jazu-redis-1` healthy
- `jazu-api-1` healthy
- `jazu-web-1` started
- `jazu-wa-worker-1` healthy
- `jazu-caddy-1` started

---

## Шаг 4. Первый запуск

### 4.1. Логи Caddy

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs -f caddy
```

Должны увидеть:

```
certificate obtained successfully {... "identifiers": ["app.jazu.io", "api.jazu.io"]}
```

Если получаете `dial tcp: lookup app.jazu.io: no such host` или `unable to obtain certificate` — DNS ещё не пропагировался или указывает не на этот сервер.

### 4.2. Открыть в браузере

- `https://app.jazu.io` — должна открыться лендинг-страница Jazu.
- `https://api.jazu.io/api/health` — должен вернуть `{"status":"ok"}`.

### 4.3. Зарегистрироваться

1. На `/auth` введите email + номер `+7XXXXXXXXXX`.
2. Получите ссылку на почту (через Resend) — кликните.
3. Попадёте в `/dashboard`.

Если Resend ещё не подтвердил домен — magic link придёт только на email, с которого подтверждался Resend account.

---

## Эксплуатация

Все команды от корня репо (`cd /home/user/jazu`):

| Команда | Назначение |
|---------|-----------|
| `pnpm docker:prod:up`      | Поднять / обновить контейнеры (после `pull` или новой сборки) |
| `pnpm docker:prod:down`    | Остановить всё, контейнеры удалить, **volume сохраняются** |
| `pnpm docker:prod:logs`    | `tail -f` логи всех сервисов |
| `pnpm docker:prod:logs api`| Логи только API |
| `pnpm docker:prod:migrate` | Применить новые Prisma-миграции в работающем контейнере |
| `pnpm docker:prod:psql`    | Открыть `psql` к Postgres |

Перезапустить один сервис:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env restart api
```

Войти в shell контейнера:

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env exec api sh
```

---

## Обновление кода

### Через `git pull` + rebuild на сервере (простой путь)

```bash
cd /home/user/jazu
git pull
pnpm docker:prod:build
pnpm docker:prod:up
```

Compose автоматически пересоздаст только те контейнеры, у которых поменялся образ. Downtime — секунды (для web нулевой при rolling-настройке, но для одного хоста — 5-15 сек на сервис).

Миграции БД применятся автоматически: `apps/api/Dockerfile` запускает `prisma migrate deploy` перед стартом API.

### Через CI/CD (правильный путь)

1. В GitHub Actions при push в `main`:
   - `docker build` всех трёх образов.
   - `docker push` в registry (GHCR, Docker Hub, ECR).
2. На сервере:
   ```bash
   # в .env: JAZU_API_IMAGE=ghcr.io/yourorg/jazu-api:sha-abc123
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env pull
   docker compose -f docker-compose.yml -f docker-compose.prod.yml --env-file .env up -d
   ```
3. Можно автоматизировать через webhook + [Watchtower](https://github.com/containrrr/watchtower) или [Diun](https://crazymax.dev/diun/).

---

## Бэкапы Postgres

**Обязательно настройте бэкапы до того, как у вас появятся реальные пользователи.**

### Простой вариант: cron + `pg_dump` + S3

`/etc/cron.daily/jazu-backup`:

```bash
#!/bin/sh
set -e
TS=$(date +%Y%m%d-%H%M%S)
cd /home/user/jazu
docker compose -f docker-compose.yml --env-file .env exec -T postgres \
  pg_dump -U "$(grep ^POSTGRES_USER .env | cut -d= -f2)" \
          -d "$(grep ^POSTGRES_DB .env | cut -d= -f2)" \
  | gzip > /var/backups/jazu/jazu-$TS.sql.gz

# Загрузить в S3 (опционально)
# aws s3 cp /var/backups/jazu/jazu-$TS.sql.gz s3://your-bucket/jazu/

# Удалить локальные старше 14 дней
find /var/backups/jazu/ -name 'jazu-*.sql.gz' -mtime +14 -delete
```

```bash
sudo mkdir -p /var/backups/jazu
sudo chmod +x /etc/cron.daily/jazu-backup
```

### Восстановление

```bash
gunzip < /var/backups/jazu/jazu-20260601-030000.sql.gz \
  | docker compose -f docker-compose.yml --env-file .env exec -T postgres \
    psql -U "$POSTGRES_USER" -d "$POSTGRES_DB"
```

---

## Что в каких контейнерах

| Сервис | Образ | Внутренний порт | Снаружи |
|--------|-------|-----------------|---------|
| `caddy`     | `caddy:2-alpine`               | 80, 443         | **да** (80/443) |
| `web`       | `jazu-web` (Next.js standalone)| 3000            | нет (только через caddy) |
| `api`       | `jazu-api` (Fastify + tsx)     | 3001            | нет |
| `wa-worker` | `jazu-wa-worker` (Baileys)     | 4001            | нет |
| `postgres`  | `postgres:16-alpine`           | 5432            | нет |
| `redis`     | `redis:7-alpine`               | 6379            | нет |

Volumes:
- `pgdata` — данные Postgres. **Не удаляйте**.
- `redisdata` — данные Redis (для будущих очередей BullMQ).
- `caddy_data` — сертификаты Let's Encrypt. **Не удаляйте** (иначе rate-limit на повторное получение).
- `caddy_config` — сгенерированный конфиг Caddy.

WhatsApp auth state живёт в БД (`WaConnection.authState`), **не** в файлах. Volume для wa-worker не нужен — можно пересоздавать без потери сессии.

---

## Troubleshooting

### Caddy не получает сертификат

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs caddy
```

Возможные причины:
- DNS не указывает на этот сервер → `dig app.jazu.io +short`.
- Порт 80 закрыт firewall'ом → `sudo ufw allow 80,443/tcp`.
- Превышен rate-limit Let's Encrypt (5 неудач/час) → раскомментируйте `acme_ca` в `Caddyfile` на staging.

### API падает с `Production env is missing required secrets`

`apps/api/src/env.ts` fail-fast не пропустил старт. Проверьте, что в `.env` заданы и НЕ равны dev-дефолтам:

- `MAGIC_LINK_SECRET` (не `jazu-dev-magic-secret`)
- `API_INTERNAL_TOKEN` (не `jazu-internal-token`)
- `OPENAI_API_KEY`, `RESEND_API_KEY`, `FROM_EMAIL`, `WA_WORKER_URL`

### Миграция упала

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs api | grep -i prisma
```

Подключитесь к БД и посмотрите состояние:

```bash
pnpm docker:prod:psql
\dt
SELECT * FROM "_prisma_migrations" ORDER BY started_at DESC LIMIT 5;
```

### WhatsApp QR не появляется

```bash
docker compose -f docker-compose.yml -f docker-compose.prod.yml logs wa-worker
```

Если ошибки `wa-auth GET failed: ...` — проблема в связи worker → API. Проверьте, что `API_ORIGIN=http://api:3001` (внутреннее имя), а не localhost.

### Web показывает «Network Error» / CORS

Если в браузере DevTools видите ошибку CORS на `api.jazu.io`:

- Убедитесь, что `WEB_ORIGIN` в `.env` ровно совпадает с тем, что в адресной строке (`https://app.jazu.io`, без trailing slash).
- Пересоберите образ web с правильным `NEXT_PUBLIC_API_BASE_URL`.

### Уменьшить downtime при обновлениях

- `docker compose up -d --no-deps api` — пересоздаст только api без трогания зависимостей.
- Для zero-downtime web — используйте две реплики и health-aware reverse proxy (это уже выходит за рамки одиночного сервера; см. Swarm / k8s).

---

## Что **не** входит в этот деплой

Сознательно опущено, чтобы не перегружать минимальный прод-стек:

- **CDN** для статики Next.js (Cloudflare перед Caddy — добавляется отдельно).
- **Внешний Postgres** (RDS, Supabase). Сейчас БД в Docker — для бэкапа `pg_dump` + S3 хватит на старте.
- **Метрики/мониторинг** (Prometheus, Grafana, Sentry). Рекомендую как минимум подключить Sentry для backend ошибок.
- **Multi-host / k8s.** Один сервер + Docker Compose — оптимум до ~10k запросов/час.
- **BullMQ-очереди.** Сейчас вызовы LLM синхронные. См. Level 2 roadmap.
