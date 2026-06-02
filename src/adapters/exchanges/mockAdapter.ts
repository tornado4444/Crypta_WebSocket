import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick, SourceKind } from "../../domain/types";

const SYMBOL_BASELINES: Record<string, number> = {
  BTCUSDT: 65000,
  ETHUSDT: 3200,
  SOLUSDT: 145,
  BNBUSDT: 620,
  XRPUSDT: 1.4,
  DOGEUSDT: 0.12,
  ADAUSDT: 0.65,
  LTCUSDT: 85,
  AVAXUSDT: 35,
  TRXUSDT: 0.14,
  DOTUSDT: 9,
  ETCUSDT: 32,
  LINKUSDT: 18,
  UNIUSDT: 9,
  ATOMUSDT: 13,
  BCHUSDT: 450,
  XLMUSDT: 0.16,
  SUIUSDT: 1.2,
  TONUSDT: 6.5,
  SHIBUSDT: 0.000025
};

export class MockAdapter implements ExchangeAdapter {
  private readonly state = new Map<string, number>();

  constructor(
    public readonly id: string,
    private readonly spreadBps: number,
    private readonly wsIntervalMs = 1200
  ) {}

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    return symbols
      .map((symbol) => this.generateTick(symbol, "rest"))
      .filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(symbols: string[], onTick: (tick: MarketTick) => void): Promise<() => void> {
    const timer = setInterval(() => {
      for (const symbol of symbols) {
        const tick = this.generateTick(symbol, "ws");

        if (tick) {
          onTick(tick);
        }
      }
    }, this.wsIntervalMs);

    return () => {
      clearInterval(timer);
    };
  }

  private generateTick(symbol: string, source: SourceKind): MarketTick | null {
    const upper = symbol.toUpperCase();
    const previous = this.state.get(upper) ?? SYMBOL_BASELINES[upper] ?? 100;

    const drift = 1 + (Math.random() - 0.5) * 0.0025;
    const nextPrice = previous * drift;
    this.state.set(upper, nextPrice);

    const halfSpread = nextPrice * this.spreadBps;
    const bid = nextPrice - halfSpread;
    const ask = nextPrice + halfSpread;
    const volume24h = nextPrice * (250 + Math.random() * 1200);

    return normalizeTick({
      exchange: this.id,
      symbol: upper,
      lastPrice: nextPrice,
      bid,
      ask,
      volume24h,
      tsExchange: Date.now(),
      source
    });
  }
}

