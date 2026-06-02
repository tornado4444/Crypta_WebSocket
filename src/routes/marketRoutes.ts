import type { Express, Request, Response } from "express";

import type { ArbitrageQuote, ArbitrageSnapshot, CandleInterval, ExchangeAdapter, MarketTick } from "../domain/types";
import { AggregationService } from "../services/aggregationService";
import { AdapterHealthService } from "../services/adapterHealthService";
import { CandleAggregationService } from "../services/candleAggregationService";
import { FxService } from "../services/fxService";
import { HistoryService } from "../services/historyService";
import { MarketStore } from "../services/marketStore";

interface MarketRoutesDeps {
  marketStore: MarketStore;
  aggregationService: AggregationService;
  historyService: HistoryService;
  candleAggregationService: CandleAggregationService;
  fxService: FxService;
  adapterHealthService: AdapterHealthService;
  adapters: ExchangeAdapter[];
  configuredSymbols: string[];
  tickStaleAfterMs: number;
}

const SYMBOL_RE = /^[A-Z0-9]{4,20}$/;
const EXCHANGE_RE = /^[a-z0-9._-]{2,24}$/;

function parseLimit(input: unknown, fallback = 100, max = 500): number {
  if (typeof input !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(input, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseCurrencyBase(input: unknown): string {
  if (typeof input !== "string") {
    return "USD";
  }

  const normalized = input.trim().toUpperCase();

  if (!normalized || normalized.length > 8 || !/^[A-Z]{3,8}$/.test(normalized)) {
    return "USD";
  }

  return normalized;
}

function parseSymbol(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toUpperCase();

  if (!SYMBOL_RE.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseExchange(input: unknown): string | null {
  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toLowerCase();

  if (!EXCHANGE_RE.test(normalized)) {
    return null;
  }

  return normalized;
}

function parseInterval(input: unknown): CandleInterval {
  return input === "5m" || input === "1h" ? input : "1m";
}

function normalizeStaleAfterMs(input: number): number {
  return Number.isFinite(input) && input > 0 ? Math.trunc(input) : 25_000;
}

function toTickResponse(tick: MarketTick, nowTs: number, staleAfterMs: number): MarketTick & { ageMs: number; isStale: boolean } {
  const ageMs = Math.max(0, nowTs - tick.tsIngested);

  return {
    ...tick,
    ageMs,
    isStale: ageMs > staleAfterMs
  };
}

function buildArbitrageSnapshot(
  symbol: string,
  ticks: MarketTick[],
  nowTs: number,
  staleAfterMs: number
): ArbitrageSnapshot {
  const quotes: ArbitrageQuote[] = ticks
    .map((tick) => {
      const ageMs = Math.max(0, nowTs - tick.tsIngested);

      return {
        exchange: tick.exchange,
        bid: Number(tick.bid),
        ask: Number(tick.ask),
        updatedAt: tick.tsIngested,
        ageMs,
        isStale: ageMs > staleAfterMs
      };
    })
    .filter((quote) => Number.isFinite(quote.bid) && Number.isFinite(quote.ask))
    .sort((a, b) => a.exchange.localeCompare(b.exchange));

  const freshQuotes = quotes.filter((quote) => !quote.isStale);
  const bestBidQuote = freshQuotes
    .filter((quote) => quote.bid > 0)
    .sort((a, b) => b.bid - a.bid)[0] ?? null;
  const bestAskQuote = freshQuotes
    .filter((quote) => quote.ask > 0)
    .sort((a, b) => a.ask - b.ask)[0] ?? null;
  const spread =
    bestBidQuote && bestAskQuote && bestBidQuote.exchange !== bestAskQuote.exchange
      ? bestBidQuote.bid - bestAskQuote.ask
      : null;
  const spreadPct =
    spread !== null && bestAskQuote && bestAskQuote.ask > 0 ? (spread / bestAskQuote.ask) * 100 : null;
  const updatedAt = quotes.length ? Math.max(...quotes.map((quote) => quote.updatedAt)) : null;

  return {
    symbol,
    exchangeCount: freshQuotes.length,
    staleExchangeCount: quotes.length - freshQuotes.length,
    updatedAt,
    bestBid: bestBidQuote ? { exchange: bestBidQuote.exchange, price: bestBidQuote.bid } : null,
    bestAsk: bestAskQuote ? { exchange: bestAskQuote.exchange, price: bestAskQuote.ask } : null,
    arbitrage: {
      buy: bestAskQuote ? { exchange: bestAskQuote.exchange, price: bestAskQuote.ask } : null,
      sell: bestBidQuote ? { exchange: bestBidQuote.exchange, price: bestBidQuote.bid } : null,
      spread,
      spreadPct,
      profitable: spread !== null && spread > 0
    },
    quotes
  };
}

export function registerMarketRoutes(app: Express, deps: MarketRoutesDeps): void {
  const staleAfterMs = normalizeStaleAfterMs(deps.tickStaleAfterMs);

  app.get("/api/v1/exchanges", (_req: Request, res: Response) => {
    res.json({
      data: deps.adapters.map((adapter) => adapter.id)
    });
  });

  app.get("/api/v1/exchanges/status", (_req: Request, res: Response) => {
    const data = deps.adapterHealthService.list();

    res.json({
      count: data.length,
      updatedAt: Date.now(),
      data
    });
  });

  app.get("/api/v1/symbols", (_req: Request, res: Response) => {
    const discoveredSymbols = deps.marketStore.listSymbols();

    res.json({
      configured: deps.configuredSymbols,
      discovered: discoveredSymbols
    });
  });

  app.get("/api/v1/fx/rates", async (req: Request, res: Response) => {
    const base = parseCurrencyBase(req.query.base);
    const payload = await deps.fxService.getRates(base);

    res.json(payload);
  });

  app.get("/api/v1/markets", (req: Request, res: Response) => {
    const symbolFilterRaw = req.query.symbol;
    const exchangeFilterRaw = req.query.exchange;

    const symbolFilter = symbolFilterRaw === undefined ? undefined : parseSymbol(symbolFilterRaw);
    const exchangeFilter = exchangeFilterRaw === undefined ? undefined : parseExchange(exchangeFilterRaw);

    if (symbolFilterRaw !== undefined && !symbolFilter) {
      res.status(400).json({ error: "Invalid symbol filter" });
      return;
    }

    if (exchangeFilterRaw !== undefined && !exchangeFilter) {
      res.status(400).json({ error: "Invalid exchange filter" });
      return;
    }

    let ticks = symbolFilter ? deps.marketStore.getBySymbol(symbolFilter) : deps.marketStore.getAllTicks();

    if (exchangeFilter) {
      ticks = ticks.filter((tick) => tick.exchange === exchangeFilter);
    }

    const nowTs = Date.now();
    const data = ticks.map((tick) => toTickResponse(tick, nowTs, staleAfterMs));
    const staleCount = data.reduce((acc, tick) => acc + (tick.isStale ? 1 : 0), 0);

    res.json({
      count: data.length,
      freshCount: data.length - staleCount,
      staleCount,
      staleAfterMs,
      data
    });
  });

  app.get("/api/v1/markets/:symbol/aggregate", (req: Request, res: Response) => {
    const rawSymbol = Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol;
    const symbol = parseSymbol(rawSymbol);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    const aggregate = deps.aggregationService.buildForSymbol(symbol, Date.now());

    if (!aggregate) {
      res.status(404).json({
        error: `No data for symbol ${symbol}`
      });
      return;
    }

    res.json({ data: aggregate });
  });

  app.get("/api/v1/aggregates", (_req: Request, res: Response) => {
    const aggregates = deps.aggregationService.buildAll(Date.now());

    res.json({
      count: aggregates.length,
      staleAfterMs,
      data: aggregates
    });
  });

  app.get("/api/v1/arbitrage", (req: Request, res: Response) => {
    const symbolFilterRaw = req.query.symbol;
    const symbolFilter = symbolFilterRaw === undefined ? null : parseSymbol(symbolFilterRaw);

    if (symbolFilterRaw !== undefined && !symbolFilter) {
      res.status(400).json({ error: "Invalid symbol filter" });
      return;
    }

    const nowTs = Date.now();
    const symbols = symbolFilter ? [symbolFilter] : deps.marketStore.listSymbols();
    const data = symbols
      .map((symbol) => buildArbitrageSnapshot(symbol, deps.marketStore.getBySymbol(symbol), nowTs, staleAfterMs))
      .filter((snapshot) => snapshot.quotes.length > 0);

    res.json({
      count: data.length,
      profitableCount: data.filter((snapshot) => snapshot.arbitrage.profitable).length,
      staleAfterMs,
      data
    });
  });

  app.get("/api/v1/candles/:symbol", (req: Request, res: Response) => {
    const rawSymbol = Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol;
    const symbol = parseSymbol(rawSymbol);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    const interval = parseInterval(req.query.interval);
    const limit = parseLimit(req.query.limit, 200, 2000);
    const data = deps.candleAggregationService.getCandles(symbol, interval, limit);

    res.json({
      symbol,
      interval,
      count: data.length,
      source: "server-tick-history",
      supportedIntervals: deps.candleAggregationService.getSupportedIntervals(),
      data
    });
  });

  app.get("/api/v1/history/:symbol", async (req: Request, res: Response) => {
    const rawSymbol = Array.isArray(req.params.symbol) ? req.params.symbol[0] : req.params.symbol;
    const symbol = parseSymbol(rawSymbol);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    const limit = parseLimit(req.query.limit, 120, 1000);
    const history = await deps.historyService.getSymbolHistory(symbol, limit);

    res.json({
      symbol,
      count: history.length,
      persistenceEnabled: deps.historyService.isEnabled(),
      data: history
    });
  });
}
