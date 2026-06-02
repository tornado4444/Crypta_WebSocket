import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const MEXC_REST_BASE = "https://api.mexc.com";

interface MexcRestTicker {
  symbol?: string;
  lastPrice?: string;
  bidPrice?: string;
  askPrice?: string;
  volume?: string;
  closeTime?: number;
}

export class MexcAdapter implements ExchangeAdapter {
  public readonly id = "mexc";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const payload = await fetchJson<MexcRestTicker>(
          `${MEXC_REST_BASE}/api/v3/ticker/24hr?symbol=${symbol}`
        );

        if (!payload.symbol) {
          return null;
        }

        return normalizeTick({
          exchange: this.id,
          symbol: payload.symbol,
          lastPrice: payload.lastPrice ?? 0,
          bid: payload.bidPrice ?? 0,
          ask: payload.askPrice ?? 0,
          volume24h: payload.volume ?? 0,
          tsExchange: payload.closeTime ?? Date.now(),
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[mexc][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(_symbols: string[], _onTick: (tick: MarketTick) => void): Promise<() => void> {
    logger.info("[mexc][ws] WS is not enabled in this MVP. REST polling only.");

    return () => {
      logger.info("[mexc][ws] Stopped");
    };
  }
}
