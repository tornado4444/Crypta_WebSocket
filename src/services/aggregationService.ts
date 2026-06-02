import type { AggregateQuality, AggregateSnapshot } from "../domain/types";

import { MarketStore } from "./marketStore";

interface AggregationServiceOptions {
  staleAfterMs?: number;
}

const DEFAULT_STALE_AFTER_MS = 25_000;

function normalizeStaleAfterMs(input: number | undefined): number {
  return Number.isFinite(input) && Number(input) > 0 ? Math.trunc(Number(input)) : DEFAULT_STALE_AFTER_MS;
}

function resolveAggregateQuality(activeSources: number): AggregateQuality {
  if (activeSources < 2) {
    return "low";
  }

  if (activeSources < 4) {
    return "medium";
  }

  return "high";
}

export class AggregationService {
  private readonly staleAfterMs: number;

  constructor(
    private readonly marketStore: MarketStore,
    options: AggregationServiceOptions = {}
  ) {
    this.staleAfterMs = normalizeStaleAfterMs(options.staleAfterMs);
  }

  public buildForSymbol(symbol: string, nowTs = Date.now()): AggregateSnapshot | null {
    const upperSymbol = symbol.toUpperCase();
    const { freshTicks, staleTicks } = this.marketStore.getBySymbolPartitioned(upperSymbol, this.staleAfterMs, nowTs);
    const hasAnyTicks = freshTicks.length + staleTicks.length > 0;

    if (!hasAnyTicks) {
      return null;
    }

    const ageSourceTicks = freshTicks.length ? freshTicks : staleTicks;
    const updatedAt = Math.max(...ageSourceTicks.map((tick) => tick.tsIngested));
    const ageMs = Math.max(0, nowTs - updatedAt);

    if (!freshTicks.length) {
      return {
        symbol: upperSymbol,
        bestBid: null,
        bestAsk: null,
        midPrice: null,
        spread: null,
        exchanges: [],
        updatedAt,
        ageMs,
        staleAfterMs: this.staleAfterMs,
        activeSources: 0,
        staleSources: staleTicks.length,
        quality: "low"
      };
    }

    let bestBid: number | null = null;
    let bestAsk: number | null = null;

    for (const tick of freshTicks) {
      if (tick.bid > 0 && (bestBid === null || tick.bid > bestBid)) {
        bestBid = tick.bid;
      }

      if (tick.ask > 0 && (bestAsk === null || tick.ask < bestAsk)) {
        bestAsk = tick.ask;
      }
    }

    const midPrice = bestBid !== null && bestAsk !== null ? (bestBid + bestAsk) / 2 : null;
    const spread = bestBid !== null && bestAsk !== null ? bestAsk - bestBid : null;
    const exchanges = Array.from(new Set(freshTicks.map((tick) => tick.exchange)));
    const activeSources = exchanges.length;
    const staleSources = staleTicks.length;

    return {
      symbol: upperSymbol,
      bestBid,
      bestAsk,
      midPrice,
      spread,
      exchanges,
      updatedAt,
      ageMs,
      staleAfterMs: this.staleAfterMs,
      activeSources,
      staleSources,
      quality: resolveAggregateQuality(activeSources)
    };
  }

  public buildAll(nowTs = Date.now()): AggregateSnapshot[] {
    return this.marketStore
      .listSymbols()
      .map((symbol) => this.buildForSymbol(symbol, nowTs))
      .filter((snapshot): snapshot is AggregateSnapshot => snapshot !== null);
  }
}