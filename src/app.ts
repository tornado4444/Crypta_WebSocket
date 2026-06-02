import path from "node:path";

import express, { type Express } from "express";
import swaggerUi from "swagger-ui-express";

import type { ExchangeAdapter } from "./domain/types";
import { registerAuthRoutes } from "./routes/authRoutes";
import { registerMarketRoutes } from "./routes/marketRoutes";
import { AdapterHealthService } from "./services/adapterHealthService";
import { AggregationService } from "./services/aggregationService";
import { AuthService } from "./services/authService";
import { CandleAggregationService } from "./services/candleAggregationService";
import { FxService } from "./services/fxService";
import { HistoryService } from "./services/historyService";
import { MarketStore } from "./services/marketStore";
import { PortfolioPnlService } from "./services/portfolioPnlService";
import { PriceAlertService } from "./services/priceAlertService";
import { ReportService } from "./services/reportService";
import { WatchlistService } from "./services/watchlistService";
import { WebhookSubscriptionService } from "./services/webhookSubscriptionService";
import { openApiSpec } from "./swagger/openApi";
import { ClientHub } from "./ws/clientHub";

interface CreateAppDeps {
  marketStore: MarketStore;
  aggregationService: AggregationService;
  historyService: HistoryService;
  candleAggregationService: CandleAggregationService;
  authService: AuthService;
  watchlistService: WatchlistService;
  priceAlertService: PriceAlertService;
  webhookSubscriptionService: WebhookSubscriptionService;
  portfolioPnlService: PortfolioPnlService;
  reportService: ReportService;
  fxService: FxService;
  clientHub: ClientHub;
  adapterHealthService: AdapterHealthService;
  adapters: ExchangeAdapter[];
  configuredSymbols: string[];
  tickStaleAfterMs: number;
}

export function createApp(deps: CreateAppDeps): Express {
  const app = express();
  const publicDir = path.join(process.cwd(), "public");

  app.disable("x-powered-by");

  const contentSecurityPolicy = [
    "default-src 'self'",
    "script-src 'self'",
    "style-src 'self' 'unsafe-inline'",
    "img-src 'self' data: blob: https://cdn.jsdelivr.net https://cdn.simpleicons.org https://cryptologos.cc",
    "font-src 'self' data:",
    "connect-src 'self' ws: wss:",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'self'"
  ].join("; ");

  app.use((req, res, next) => {
    res.setHeader("X-Content-Type-Options", "nosniff");
    res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
    res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
    res.setHeader("Cross-Origin-Resource-Policy", "same-origin");

    if (req.path === "/" || req.path.startsWith("/api/")) {
      res.setHeader("Cache-Control", "no-store");
    }

    if (!req.path.startsWith("/api-docs")) {
      res.setHeader("Content-Security-Policy", contentSecurityPolicy);
    }

    next();
  });
  app.use(express.json({ limit: "3mb" }));
  app.use(express.static(publicDir));

  app.get("/", (_req, res) => {
    res.sendFile(path.join(publicDir, "index.html"));
  });

  app.get("/health", (_req, res) => {
    res.json({
      status: "ok",
      service: "crypto-market-aggregation-service",
      now: new Date().toISOString()
    });
  });

  app.get("/api-docs.json", (_req, res) => {
    res.json(openApiSpec);
  });

  app.use("/api-docs", swaggerUi.serve, swaggerUi.setup(openApiSpec));

  registerAuthRoutes(app, deps);
  registerMarketRoutes(app, deps);

  app.use((_req, res) => {
    res.status(404).json({
      error: "Not found"
    });
  });

  return app;
}
