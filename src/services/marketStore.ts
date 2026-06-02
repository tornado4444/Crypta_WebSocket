import type { MarketTick } from "../domain/types";

export interface TickPartition {
  freshTicks: MarketTick[];
  staleTicks: MarketTick[];
}

export type ReplicatedTickListener = (tick: MarketTick) => void;

function normalizeStaleAfterMs(input: number): number {
  return Number.isFinite(input) && input > 0 ? Math.trunc(input) : 25_000;
}

export class MarketStore {
  protected readonly bySymbol = new Map<string, Map<string, MarketTick>>();

  public upsert(tick: MarketTick): void {
    this.upsertLocal(tick);
  }

  protected upsertLocal(tick: MarketTick): void {
    const symbol = tick.symbol.toUpperCase();
    let symbolBucket = this.bySymbol.get(symbol);

    if (!symbolBucket) {
      symbolBucket = new Map<string, MarketTick>();
      this.bySymbol.set(symbol, symbolBucket);
    }

    symbolBucket.set(tick.exchange, tick);
  }

  public getBySymbol(symbol: string): MarketTick[] {
    return Array.from(this.bySymbol.get(symbol.toUpperCase())?.values() ?? []);
  }

  public getBySymbolPartitioned(symbol: string, staleAfterMs: number, nowTs = Date.now()): TickPartition {
    const ticks = this.getBySymbol(symbol);
    return this.partitionTicks(ticks, staleAfterMs, nowTs);
  }

  public getAllTicks(): MarketTick[] {
    const result: MarketTick[] = [];

    for (const symbolBucket of this.bySymbol.values()) {
      result.push(...symbolBucket.values());
    }

    return result;
  }

  public getAllTicksPartitioned(staleAfterMs: number, nowTs = Date.now()): TickPartition {
    return this.partitionTicks(this.getAllTicks(), staleAfterMs, nowTs);
  }

  public listSymbols(): string[] {
    return Array.from(this.bySymbol.keys()).sort();
  }

  public async start(): Promise<void> {
    return Promise.resolve();
  }

  public async close(): Promise<void> {
    return Promise.resolve();
  }

  public setReplicationListener(_listener: ReplicatedTickListener | null): void {
    // memory store does not replicate
  }

  private partitionTicks(ticks: readonly MarketTick[], staleAfterMsInput: number, nowTs: number): TickPartition {
    const staleAfterMs = normalizeStaleAfterMs(staleAfterMsInput);
    const freshTicks: MarketTick[] = [];
    const staleTicks: MarketTick[] = [];

    for (const tick of ticks) {
      const ageMs = Math.max(0, nowTs - tick.tsIngested);

      if (ageMs > staleAfterMs) {
        staleTicks.push(tick);
      } else {
        freshTicks.push(tick);
      }
    }

    return {
      freshTicks,
      staleTicks
    };
  }
}
