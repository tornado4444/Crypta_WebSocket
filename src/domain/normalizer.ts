import type { MarketTick, SourceKind } from "./types";

const KNOWN_QUOTES = ["USDT", "USDC", "USD", "BTC", "ETH", "EUR", "UAH", "BNB", "GBP", "PLN", "JPY", "TRY"];
const EXCHANGE_RE = /^[a-z0-9._-]{2,24}$/;
const SYMBOL_RE = /^[A-Z0-9]{4,20}$/;

const MAX_PRICE = 10_000_000_000;
const MAX_VOLUME = 1_000_000_000_000_000;
const MAX_TS_DRIFT_MS = 2 * 24 * 60 * 60 * 1000;

interface NormalizeTickInput {
  exchange: string;
  symbol: string;
  lastPrice: number | string;
  bid: number | string;
  ask: number | string;
  volume24h: number | string;
  tsExchange?: number | string;
  source: SourceKind;
}

function toNumber(value: number | string | undefined): number {
  if (value === undefined) {
    return Number.NaN;
  }

  return typeof value === "number" ? value : Number(value);
}

function splitSymbol(symbol: string): { baseAsset: string; quoteAsset: string } {
  const upper = symbol.toUpperCase();

  for (const quote of KNOWN_QUOTES) {
    if (upper.endsWith(quote) && upper.length > quote.length) {
      return {
        baseAsset: upper.slice(0, upper.length - quote.length),
        quoteAsset: quote
      };
    }
  }

  return {
    baseAsset: upper,
    quoteAsset: "UNKNOWN"
  };
}

export function normalizeTick(input: NormalizeTickInput): MarketTick | null {
  const exchange = String(input.exchange || "").trim().toLowerCase();
  const symbol = String(input.symbol || "").toUpperCase().trim();

  if (!exchange || !EXCHANGE_RE.test(exchange)) {
    return null;
  }

  if (!symbol || !SYMBOL_RE.test(symbol)) {
    return null;
  }

  const lastPrice = toNumber(input.lastPrice);
  const bid = toNumber(input.bid);
  const ask = toNumber(input.ask);
  const volume24h = toNumber(input.volume24h);
  const parsedTsExchange = toNumber(input.tsExchange);

  const hasInvalidNumbers = [lastPrice, bid, ask, volume24h].some(
    (value) => !Number.isFinite(value) || value < 0
  );

  if (hasInvalidNumbers) {
    return null;
  }

  if (lastPrice <= 0 || lastPrice > MAX_PRICE) {
    return null;
  }

  if (bid > MAX_PRICE || ask > MAX_PRICE || volume24h > MAX_VOLUME) {
    return null;
  }

  if (bid > 0 && ask > 0 && ask < bid) {
    return null;
  }

  const { baseAsset, quoteAsset } = splitSymbol(symbol);

  if (!baseAsset || quoteAsset === "UNKNOWN") {
    return null;
  }

  const now = Date.now();
  const tsExchange = Number.isFinite(parsedTsExchange) ? parsedTsExchange : now;
  const normalizedTsExchange = Math.abs(tsExchange - now) > MAX_TS_DRIFT_MS ? now : tsExchange;

  return {
    exchange,
    symbol,
    baseAsset,
    quoteAsset,
    lastPrice,
    bid,
    ask,
    volume24h,
    tsExchange: normalizedTsExchange,
    tsIngested: now,
    source: input.source
  };
}
