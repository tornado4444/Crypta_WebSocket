import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const GATE_REST_BASE = "https://api.gateio.ws";

interface GateRestTicker {
  currency_pair?: string;
  last?: string;
  lowest_ask?: string;
  highest_bid?: string;
  base_volume?: string;
  quote_volume?: string;
  create_time_ms?: string;
}

function toGatePair(symbol: string): string {
  const upper = symbol.toUpperCase();

  if (upper.endsWith("USDT")) {
    return `${upper.slice(0, -4)}_USDT`;
  }

  if (upper.endsWith("USDC")) {
    return `${upper.slice(0, -4)}_USDC`;
  }

  if (upper.endsWith("USD")) {
    return `${upper.slice(0, -3)}_USD`;
  }

  if (upper.endsWith("BTC")) {
    return `${upper.slice(0, -3)}_BTC`;
  }

  if (upper.endsWith("ETH")) {
    return `${upper.slice(0, -3)}_ETH`;
  }

  return upper;
}

function fromGatePair(pair: string): string {
  return pair.replace(/_/g, "");
}

export class GateAdapter implements ExchangeAdapter {
  public readonly id = "gate";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const pair = toGatePair(symbol);
        const payload = await fetchJson<GateRestTicker[]>(
          `${GATE_REST_BASE}/api/v4/spot/tickers?currency_pair=${pair}`
        );

        const row = payload[0];

        if (!row?.currency_pair) {
          return null;
        }

        return normalizeTick({
          exchange: this.id,
          symbol: fromGatePair(row.currency_pair),
          lastPrice: row.last ?? 0,
          bid: row.highest_bid ?? 0,
          ask: row.lowest_ask ?? 0,
          volume24h: row.quote_volume ?? row.base_volume ?? 0,
          tsExchange: row.create_time_ms ? Number(row.create_time_ms) : Date.now(),
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[gate][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(_symbols: string[], _onTick: (tick: MarketTick) => void): Promise<() => void> {
    logger.info("[gate][ws] WS is not enabled in this MVP. REST polling only.");

    return () => {
      logger.info("[gate][ws] Stopped");
    };
  }
}
