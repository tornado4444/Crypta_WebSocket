import WebSocket from "ws";

import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const BINANCE_REST_BASE = "https://api.binance.com";
const BINANCE_WS_BASE = "wss://stream.binance.com:9443";

interface BinanceRestTicker {
  symbol: string;
  lastPrice: string;
  bidPrice: string;
  askPrice: string;
  volume: string;
  closeTime: number;
}

interface BinanceWsEnvelope {
  stream?: string;
  data?: {
    s?: string;
    c?: string;
    b?: string;
    a?: string;
    v?: string;
    E?: number;
  };
}

export class BinanceAdapter implements ExchangeAdapter {
  public readonly id = "binance";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const payload = await fetchJson<BinanceRestTicker>(
          `${BINANCE_REST_BASE}/api/v3/ticker/24hr?symbol=${symbol}`
        );

        return normalizeTick({
          exchange: this.id,
          symbol: payload.symbol,
          lastPrice: payload.lastPrice,
          bid: payload.bidPrice,
          ask: payload.askPrice,
          volume24h: payload.volume,
          tsExchange: payload.closeTime,
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[binance][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(symbols: string[], onTick: (tick: MarketTick) => void): Promise<() => void> {
    if (!symbols.length) {
      return () => {
        logger.info("[binance][ws] No symbols provided, skip startup");
      };
    }

    const streamNames = symbols.map((symbol) => `${symbol.toLowerCase()}@ticker`).join("/");
    const wsUrl = `${BINANCE_WS_BASE}/stream?streams=${streamNames}`;

    let socket: WebSocket | null = null;
    let stopped = false;
    let reconnectTimer: NodeJS.Timeout | null = null;

    const connect = () => {
      if (stopped) {
        return;
      }

      socket = new WebSocket(wsUrl);

      socket.on("open", () => {
        logger.info(`[binance][ws] Connected: ${wsUrl}`);
      });

      socket.on("message", (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as BinanceWsEnvelope;
          const data = payload.data;

          if (!data?.s) {
            return;
          }

          const normalized = normalizeTick({
            exchange: this.id,
            symbol: data.s,
            lastPrice: data.c ?? 0,
            bid: data.b ?? 0,
            ask: data.a ?? 0,
            volume24h: data.v ?? 0,
            tsExchange: data.E,
            source: "ws"
          });

          if (normalized) {
            onTick(normalized);
          }
        } catch (error) {
          logger.warn("[binance][ws] Failed to parse message:", error);
        }
      });

      socket.on("error", (error) => {
        logger.warn("[binance][ws] Socket error:", error);
      });

      socket.on("close", () => {
        logger.warn("[binance][ws] Closed, reconnect in 3s");

        if (!stopped) {
          reconnectTimer = setTimeout(connect, 3000);
        }
      });
    };

    connect();

    return () => {
      stopped = true;

      if (reconnectTimer) {
        clearTimeout(reconnectTimer);
      }

      socket?.close();
      logger.info("[binance][ws] Stopped");
    };
  }
}
