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

## To run

```bash
npm install
npm run build
npm run dev
```

## PostgreSQL (needed for history/auth/users)

Quick local launch via Docker:

```bash
docker compose up -d
```

Creating tables for history:

```bash
npm run prisma:push
```

# ENJOY


