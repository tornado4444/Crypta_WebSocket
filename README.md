# CryptoAggregator Diploma MVP

Тема: **Розробка сервісу агрегації та нормалізації криптовалютних ринкових даних з REST/WebSocket інтерфейсом**.

## Что реализовано

- Backend на `TypeScript + Node.js + Express`
- Интеграция с 6 биржами: `Binance`, `Bybit`, `OKX`, `MEXC`, `KuCoin`, `Gate.io` + `mock` режим
- Нормализация данных в единый формат
- Агрегация (`bestBid`, `bestAsk`, `midPrice`, `spread`)
- REST API + WebSocket API
- Swagger документация (`/api-docs`)
- Сохранение истории агрегатов в PostgreSQL (через Prisma)
- Регистрация/логин клиентов (JWT) + file fallback при недоступной БД
- Owner-only просмотр зарегистрированных пользователей (`x-admin-key`)
- UI Dashboard с вкладками `Криптовалюти / Ринок / Біржі`
- Переключение тем (`dark/light`)
- Переключение валют отображения (`USD`, `EUR`, `UAH` и др.)
- Графики в реальном времени (canvas + WS)
- Иконки монет и бирж, улучшенная биржевая аналитика

## Запуск

```bash
npm install
npm run build
npm run dev
```

## PostgreSQL (нужен для history/auth/users)

Быстрый локальный запуск через Docker:

```bash
docker compose up -d
```

Переменные в `.env` (можно скопировать из `.env.example`):

- `DATABASE_URL="postgresql://postgres:postgres@localhost:5432/crypta_db?schema=public"`
- `ENABLE_DB_PERSISTENCE=true`
- `JWT_SECRET="super_secret_change_me"`
- `ADMIN_VIEW_KEY="owner_secret_2026"`
- `AUTH_FALLBACK_FILE="./data/auth_fallback_users.json"` (опционально, для сохранения пользователей при недоступной БД)

Создание таблиц для истории:

```bash
npm run prisma:push
```

## Куда заходить

- Dashboard: `http://localhost:8080/`
- Swagger: `http://localhost:8080/api-docs`
- Health: `http://localhost:8080/health`
- WS: `ws://localhost:8080/ws`

## Основные API

- `GET /api/v1/markets`
- `GET /api/v1/aggregates`
- `GET /api/v1/markets/:symbol/aggregate`
- `GET /api/v1/history/:symbol?limit=120`
- `GET /api/v1/fx/rates?base=USD`
- `POST /api/v1/auth/register`
- `POST /api/v1/auth/login`
- `GET /api/v1/auth/me`
- `GET /api/v1/admin/users?limit=200` (+ header `x-admin-key`)

## Для стабильной демо-защиты без внешних API

```bash
$env:USE_MOCK_DATA="true"
$env:ENABLE_DB_PERSISTENCE="false"
$env:JWT_SECRET="demo_secret"
npm run dev
```



