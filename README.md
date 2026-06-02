# CryptoAggregator WebSocket/RestAPI

## What is implemented

- Backend on `TypeScript + Node.js + Express`
- Integration with 6 exchanges: `Binance`, `Bybit`, `OKX`, `MEXC`, `KuCoin`, `Gate.io` + `mock` mode
- Data normalization into a single format
- Aggregation (`bestBid`, `bestAsk`, `midPrice`, `spread`)
- REST API + WebSocket API
- Swagger documentation (`/api-docs`)
- Saving the history of aggregates in PostgreSQL (via Prisma)
- Customer registration/login (JWT) + backup file when the database is unavailable
- Viewing registered users only for the owner (`x-admin-key`)
- UI Dashboard with `Cryptocurrencies / Market / Exchanges` tabs
- Theme switching (`dark/light`)
- Currency display transition (`USD`, `EUR`, `UAH`, etc.)
- Charts in real-time (canvas + WS)
- Coin and exchange icons, improved exchange analytics

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



