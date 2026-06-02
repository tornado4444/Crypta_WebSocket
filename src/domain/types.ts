export type SourceKind = "rest" | "ws";
export type AlertDirection = "above" | "below";
export type AlertChannel = "ws" | "email";
export type CandleInterval = "1m" | "5m" | "1h";

export interface MarketTick {
  exchange: string;
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  lastPrice: number;
  bid: number;
  ask: number;
  volume24h: number;
  tsExchange: number;
  tsIngested: number;
  source: SourceKind;
}

export type AggregateQuality = "low" | "medium" | "high";

export interface AggregateSnapshot {
  symbol: string;
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
  exchanges: string[];
  updatedAt: number;
  ageMs: number;
  staleAfterMs: number;
  activeSources: number;
  staleSources: number;
  quality: AggregateQuality;
}

export interface ExchangeAdapter {
  readonly id: string;
  fetchTickers(symbols: string[]): Promise<MarketTick[]>;
  startWs(symbols: string[], onTick: (tick: MarketTick) => void): Promise<() => void>;
}

export interface ArbitrageQuote {
  exchange: string;
  bid: number;
  ask: number;
  updatedAt: number;
  ageMs: number;
  isStale: boolean;
}

export interface ArbitrageSnapshot {
  symbol: string;
  exchangeCount: number;
  staleExchangeCount: number;
  updatedAt: number | null;
  bestBid: { exchange: string; price: number } | null;
  bestAsk: { exchange: string; price: number } | null;
  arbitrage: {
    buy: { exchange: string; price: number } | null;
    sell: { exchange: string; price: number } | null;
    spread: number | null;
    spreadPct: number | null;
    profitable: boolean;
  };
  quotes: ArbitrageQuote[];
}

export interface CandleRecord {
  symbol: string;
  interval: CandleInterval;
  openTime: number;
  closeTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  quoteVolume: number;
  sampleCount: number;
  exchangeCount: number;
  updatedAt: number;
}

export interface PriceAlertRecord {
  id: string;
  userId: string;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  channels: AlertChannel[];
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
}

export interface WebhookSubscriptionRecord {
  id: string;
  userId: string;
  url: string;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  secret: string | null;
  enabled: boolean;
  createdAt: string;
  lastTriggeredAt: string | null;
}

export interface PortfolioPnlPosition {
  symbol: string;
  assetCode: string;
  amount: number;
  investedUsd: number;
  averageBuyPriceUsd: number;
  currentPriceUsd: number | null;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number | null;
  realizedPnlUsd: number;
  lastBuyAt: string;
}

export interface PortfolioPnlSummary {
  trackedPositions: number;
  investedUsd: number;
  currentValueUsd: number;
  unrealizedPnlUsd: number;
  unrealizedPnlPct: number | null;
  realizedPnlUsd: number;
}
