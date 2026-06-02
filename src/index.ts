import "dotenv/config";

import http from "node:http";
import os from "node:os";

import { WebSocketServer } from "ws";

import { BinanceAdapter } from "./adapters/exchanges/binanceAdapter";
import { BybitAdapter } from "./adapters/exchanges/bybitAdapter";
import { GateAdapter } from "./adapters/exchanges/gateAdapter";
import { KucoinAdapter } from "./adapters/exchanges/kucoinAdapter";
import { MexcAdapter } from "./adapters/exchanges/mexcAdapter";
import { MockAdapter } from "./adapters/exchanges/mockAdapter";
import { OkxAdapter } from "./adapters/exchanges/okxAdapter";
import { createApp } from "./app";
import { loadConfig } from "./config/env";
import type { ExchangeAdapter } from "./domain/types";
import { logger } from "./infrastructure/logger";
import { disconnectPrisma } from "./infrastructure/prismaClient";
import { AdapterHealthService } from "./services/adapterHealthService";
import { AggregationService } from "./services/aggregationService";
import { AuthService } from "./services/authService";
import { CandleAggregationService } from "./services/candleAggregationService";
import { FxService } from "./services/fxService";
import { HistoryService } from "./services/historyService";
import { MarketIngestionService } from "./services/marketIngestionService";
import { MarketStore } from "./services/marketStore";
import { PortfolioPnlService } from "./services/portfolioPnlService";
import { PriceAlertService } from "./services/priceAlertService";
import { RedisMarketStore } from "./services/redisMarketStore";
import { ReportService } from "./services/reportService";
import { WatchlistService } from "./services/watchlistService";
import { WebhookSubscriptionService } from "./services/webhookSubscriptionService";
import { ClientHub } from "./ws/clientHub";

const REAL_EXCHANGE_ADAPTERS = [
  () => new BinanceAdapter(),
  () => new BybitAdapter(),
  () => new OkxAdapter(),
  () => new MexcAdapter(),
  () => new KucoinAdapter(),
  () => new GateAdapter()
] as const;

const SYNTHETIC_EXCHANGE_IDS = [
  "kraken",
  "bitstamp",
  "coinbase",
  "bitfinex",
  "huobi",
  "upbit",
  "bitget",
  "bingx",
  "whitebit",
  "lbank",
  "phemex",
  "xt",
  "poloniex",
  "crypto_com"
] as const;

const DEMO_EXCHANGE_IDS = [
  "binance",
  "bybit",
  "okx",
  "mexc",
  "kucoin",
  "gate",
  ...SYNTHETIC_EXCHANGE_IDS
] as const;

function buildSyntheticAdapters(exchangeIds: readonly string[], seedOffset = 0): ExchangeAdapter[] {
  return exchangeIds.map((exchangeId, idx) => {
    const spread = 0.00045 + ((idx + seedOffset) % 11) * 0.00006;
    const wsInterval = 900 + ((idx + seedOffset) % 7) * 170;

    return new MockAdapter(exchangeId, spread, wsInterval);
  });
}

function createAdapters(useMockData: boolean): ExchangeAdapter[] {
  if (useMockData) {
    return buildSyntheticAdapters(DEMO_EXCHANGE_IDS);
  }

  const realAdapters = REAL_EXCHANGE_ADAPTERS.map((factory) => factory());
  const syntheticAdapters = buildSyntheticAdapters(SYNTHETIC_EXCHANGE_IDS, realAdapters.length);

  return [...realAdapters, ...syntheticAdapters];
}

function getLanDashboardUrls(port: number): string[] {
  const urls: string[] = [];
  const interfaces = os.networkInterfaces();

  for (const entries of Object.values(interfaces)) {
    for (const entry of entries ?? []) {
      if (entry.family === "IPv4" && !entry.internal && !entry.address.startsWith("169.254.")) {
        urls.push("http://" + entry.address + ":" + port + "/");
      }
    }
  }

  return urls;
}

async function bootstrap(): Promise<void> {
  const config = loadConfig();

  const marketStore =
    config.marketStoreDriver === "redis"
      ? new RedisMarketStore({
          redisUrl: config.redisUrl,
          keyPrefix: config.redisKeyPrefix,
          tickTtlMs: config.redisTickTtlMs
        })
      : new MarketStore();

  await marketStore.start();

  const aggregationService = new AggregationService(marketStore, {
    staleAfterMs: config.tickStaleAfterMs
  });
  const historyService = new HistoryService(config.enableDbPersistence, config.snapshotIntervalMs);
  const authService = new AuthService(process.env.JWT_SECRET ?? "");
  const watchlistService = new WatchlistService();
  const priceAlertService = new PriceAlertService();
  const webhookSubscriptionService = new WebhookSubscriptionService();
  const candleAggregationService = new CandleAggregationService();
  const portfolioPnlService = new PortfolioPnlService(aggregationService);
  const fxService = new FxService();
  const adapters = createAdapters(config.useMockData);
  const adapterHealthService = new AdapterHealthService(adapters.map((adapter) => adapter.id), {
    pollIntervalMs: config.restPollIntervalMs
  });
  const reportService = new ReportService({
    aggregationService,
    adapterHealthService,
    portfolioPnlService,
    watchlistService,
    priceAlertService,
    webhookSubscriptionService
  });
  const wsServer = new WebSocketServer({ noServer: true });
  const clientHub = new ClientHub(wsServer, authService, watchlistService);

  const app = createApp({
    marketStore,
    aggregationService,
    historyService,
    candleAggregationService,
    authService,
    watchlistService,
    priceAlertService,
    webhookSubscriptionService,
    portfolioPnlService,
    reportService,
    fxService,
    clientHub,
    adapterHealthService,
    adapters,
    configuredSymbols: config.symbols,
    tickStaleAfterMs: config.tickStaleAfterMs
  });

  const server = http.createServer(app);

  server.on("upgrade", (request, socket, head) => {
    const pathname = request.url ? new URL(request.url, "http://localhost").pathname : "";

    if (pathname !== "/ws") {
      socket.destroy();
      return;
    }

    wsServer.handleUpgrade(request, socket, head, (ws) => {
      wsServer.emit("connection", ws, request);
    });
  });

  clientHub.start();

  const ingestionService = new MarketIngestionService(
    adapters,
    config.symbols,
    marketStore,
    aggregationService,
    historyService,
    clientHub,
    adapterHealthService,
    config.restPollIntervalMs,
    candleAggregationService,
    priceAlertService,
    webhookSubscriptionService,
    authService
  );

  marketStore.setReplicationListener((tick) => {
    ingestionService.processReplicatedTick(tick);
  });

  if (config.enableMarketIngestion) {
    await ingestionService.start();
  } else {
    logger.info("[ingestion] Disabled for this instance. Waiting for replicated ticks.");
  }

  server.listen(config.port, "0.0.0.0", () => {
    logger.info(`Service started on http://localhost:${config.port}`);
    logger.info(`Dashboard: http://localhost:${config.port}/`);
    for (const url of getLanDashboardUrls(config.port)) {
      logger.info(`Network dashboard: ${url}`);
    }
    logger.info(`Swagger docs: http://localhost:${config.port}/api-docs`);
    logger.info(`WS endpoint: ws://localhost:${config.port}/ws`);
    logger.info(`Mode: ${config.useMockData ? "MOCK" : "LIVE"}`);
    logger.info(`Adapters: ${adapters.map((adapter) => adapter.id).join(", ")}`);
    logger.info(`Tracked symbols: ${config.symbols.join(", ")}`);
    logger.info(`Tick stale threshold: ${config.tickStaleAfterMs} ms`);
    logger.info(`Market store: ${config.marketStoreDriver}`);
    logger.info(`Market ingestion: ${config.enableMarketIngestion ? "enabled" : "disabled"}`);
    logger.info(`DB persistence: ${historyService.isEnabled() ? "enabled" : "disabled"}`);
    logger.info(`Client auth: ${authService.isEnabled() ? "enabled" : "disabled"}`);
  });

  const shutdown = async (signal: string): Promise<void> => {
    logger.info(`Received ${signal}. Shutting down...`);

    await ingestionService.stop();
    await marketStore.close();
    clientHub.close();
    await disconnectPrisma();

    server.close(() => {
      logger.info("HTTP server closed");
      process.exit(0);
    });

    setTimeout(() => process.exit(1), 5000).unref();
  };

  process.on("SIGINT", () => {
    void shutdown("SIGINT");
  });

  process.on("SIGTERM", () => {
    void shutdown("SIGTERM");
  });
}

bootstrap().catch((error) => {
  logger.error("Failed to start application:", error);
  process.exit(1);
});

