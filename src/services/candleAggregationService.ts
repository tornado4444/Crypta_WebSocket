import type { CandleInterval, CandleRecord, MarketTick } from "../domain/types";

interface TickSample {
  ts: number;
  price: number;
  volume: number;
  quoteVolume: number;
  exchange: string;
}

const INTERVAL_MS: Record<CandleInterval, number> = {
  "1m": 60_000,
  "5m": 5 * 60_000,
  "1h": 60 * 60_000
};

const RETENTION_MS = 48 * 60 * 60_000;

function normalizeInterval(input: string | undefined): CandleInterval {
  return input === "5m" || input === "1h" ? input : "1m";
}

export class CandleAggregationService {
  private readonly samplesBySymbol = new Map<string, TickSample[]>();
  private readonly lastVolumeByExchangeSymbol = new Map<string, number>();

  public recordTick(tick: MarketTick): void {
    const symbol = tick.symbol.toUpperCase();
    const price = Number(tick.lastPrice);

    if (!Number.isFinite(price) || price <= 0) {
      return;
    }

    const volumeKey = `${tick.exchange}:${symbol}`;
    const lastVolume24h = this.lastVolumeByExchangeSymbol.get(volumeKey);
    const currentVolume24h = Number(tick.volume24h);
    const volumeDelta =
      Number.isFinite(currentVolume24h) && currentVolume24h >= 0 && lastVolume24h !== undefined
        ? Math.max(0, currentVolume24h - lastVolume24h)
        : 0;

    this.lastVolumeByExchangeSymbol.set(volumeKey, Number.isFinite(currentVolume24h) ? currentVolume24h : 0);

    const sample: TickSample = {
      ts: tick.tsIngested,
      price,
      volume: volumeDelta,
      quoteVolume: volumeDelta * price,
      exchange: tick.exchange
    };

    const bucket = this.samplesBySymbol.get(symbol) ?? [];
    bucket.push(sample);
    this.samplesBySymbol.set(symbol, bucket);
    this.pruneSymbolSamples(symbol, tick.tsIngested);
  }

  public getCandles(symbolInput: string, intervalInput: string | undefined, limitInput: number): CandleRecord[] {
    const symbol = String(symbolInput || "").trim().toUpperCase();
    const interval = normalizeInterval(intervalInput);
    const limit = Number.isFinite(limitInput) && limitInput > 0 ? Math.min(Math.trunc(limitInput), 2000) : 200;
    const intervalMs = INTERVAL_MS[interval];
    const samples = this.samplesBySymbol.get(symbol) ?? [];

    if (!samples.length) {
      return [];
    }

    const buckets = new Map<number, CandleRecord & { exchanges: Set<string> }>();

    for (const sample of samples) {
      const openTime = Math.floor(sample.ts / intervalMs) * intervalMs;
      const closeTime = openTime + intervalMs;
      const existing = buckets.get(openTime);

      if (!existing) {
        buckets.set(openTime, {
          symbol,
          interval,
          openTime,
          closeTime,
          open: sample.price,
          high: sample.price,
          low: sample.price,
          close: sample.price,
          volume: sample.volume,
          quoteVolume: sample.quoteVolume,
          sampleCount: 1,
          exchangeCount: 1,
          updatedAt: sample.ts,
          exchanges: new Set([sample.exchange])
        });
        continue;
      }

      existing.high = Math.max(existing.high, sample.price);
      existing.low = Math.min(existing.low, sample.price);
      existing.close = sample.price;
      existing.volume += sample.volume;
      existing.quoteVolume += sample.quoteVolume;
      existing.sampleCount += 1;
      existing.updatedAt = Math.max(existing.updatedAt, sample.ts);
      existing.exchanges.add(sample.exchange);
      existing.exchangeCount = existing.exchanges.size;
    }

    return Array.from(buckets.values())
      .sort((a, b) => a.openTime - b.openTime)
      .slice(-limit)
      .map(({ exchanges: _exchanges, ...candle }) => candle);
  }

  public getSupportedIntervals(): CandleInterval[] {
    return ["1m", "5m", "1h"];
  }

  private pruneSymbolSamples(symbol: string, nowTs: number): void {
    const threshold = nowTs - RETENTION_MS;
    const current = this.samplesBySymbol.get(symbol);

    if (!current || !current.length) {
      return;
    }

    const next = current.filter((sample) => sample.ts >= threshold);
    this.samplesBySymbol.set(symbol, next);
  }
}
