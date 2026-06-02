import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const KUCOIN_REST_BASE = "https://api.kucoin.com";

interface KucoinRestResponse {
  code?: string;
  data?: {
    symbol?: string;
    buy?: string;
    sell?: string;
    last?: string;
    vol?: string;
    volValue?: string;
    time?: number;
  };
}

function toKucoinSymbol(symbol: string): string {
  const upper = symbol.toUpperCase();

  if (upper.endsWith("USDT")) {
    return `${upper.slice(0, -4)}-USDT`;
  }

  if (upper.endsWith("USDC")) {
    return `${upper.slice(0, -4)}-USDC`;
  }

  if (upper.endsWith("USD")) {
    return `${upper.slice(0, -3)}-USD`;
  }

  if (upper.endsWith("BTC")) {
    return `${upper.slice(0, -3)}-BTC`;
  }

  if (upper.endsWith("ETH")) {
    return `${upper.slice(0, -3)}-ETH`;
  }

  return upper;
}

function fromKucoinSymbol(symbol: string): string {
  return symbol.replace(/-/g, "");
}

export class KucoinAdapter implements ExchangeAdapter {
  public readonly id = "kucoin";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const pair = toKucoinSymbol(symbol);
        const payload = await fetchJson<KucoinRestResponse>(
          `${KUCOIN_REST_BASE}/api/v1/market/stats?symbol=${pair}`
        );

        if (payload.code !== "200000" || !payload.data?.symbol) {
          return null;
        }

        return normalizeTick({
          exchange: this.id,
          symbol: fromKucoinSymbol(payload.data.symbol),
          lastPrice: payload.data.last ?? 0,
          bid: payload.data.buy ?? 0,
          ask: payload.data.sell ?? 0,
          volume24h: payload.data.volValue ?? payload.data.vol ?? 0,
          tsExchange: payload.data.time ?? Date.now(),
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[kucoin][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(_symbols: string[], _onTick: (tick: MarketTick) => void): Promise<() => void> {
    logger.info("[kucoin][ws] WS is not enabled in this MVP. REST polling only.");

    return () => {
      logger.info("[kucoin][ws] Stopped");
    };
  }
}
