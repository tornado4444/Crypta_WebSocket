import WebSocket from "ws";

import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const BYBIT_REST_BASE = "https://api.bybit.com";
const BYBIT_WS_URL = "wss://stream.bybit.com/v5/public/spot";

interface BybitRestResponse {
  retCode: number;
  retMsg: string;
  result?: {
    list?: Array<{
      symbol?: string;
      lastPrice?: string;
      bid1Price?: string;
      ask1Price?: string;
      volume24h?: string;
    }>;
  };
  time?: number;
}

interface BybitWsPayload {
  op?: string;
  topic?: string;
  ts?: number;
  data?: Record<string, unknown> | Array<Record<string, unknown>>;
}

export class BybitAdapter implements ExchangeAdapter {
  public readonly id = "bybit";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const payload = await fetchJson<BybitRestResponse>(
          `${BYBIT_REST_BASE}/v5/market/tickers?category=spot&symbol=${symbol}`
        );

        const ticker = payload.result?.list?.[0];

        if (!ticker?.symbol) {
          return null;
        }

        return normalizeTick({
          exchange: this.id,
          symbol: ticker.symbol,
          lastPrice: ticker.lastPrice ?? 0,
          bid: ticker.bid1Price ?? 0,
          ask: ticker.ask1Price ?? 0,
          volume24h: ticker.volume24h ?? 0,
          tsExchange: payload.time,
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[bybit][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(symbols: string[], onTick: (tick: MarketTick) => void): Promise<() => void> {
    if (!symbols.length) {
      return () => {
        logger.info("[bybit][ws] No symbols provided, skip startup");
      };
    }

    const topics = symbols.map((symbol) => `tickers.${symbol.toUpperCase()}`);

    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) {
        return;
      }

      socket = new WebSocket(BYBIT_WS_URL);

      socket.on("open", () => {
        logger.info(`[bybit][ws] Connected: ${BYBIT_WS_URL}`);
        socket?.send(JSON.stringify({ op: "subscribe", args: topics }));
      });

      socket.on("message", (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as BybitWsPayload;

          if (payload.op === "ping") {
            socket?.send(JSON.stringify({ op: "pong" }));
            return;
          }

          if (!payload.topic?.startsWith("tickers.")) {
            return;
          }

          const row = Array.isArray(payload.data) ? payload.data[0] : payload.data;
          const symbolFromTopic = payload.topic.split(".")[1];
          const symbol = String(row?.symbol ?? symbolFromTopic ?? "");

          if (!symbol) {
            return;
          }

          const normalized = normalizeTick({
            exchange: this.id,
            symbol,
            lastPrice: Number(row?.lastPrice ?? 0),
            bid: Number(row?.bid1Price ?? 0),
            ask: Number(row?.ask1Price ?? 0),
            volume24h: Number(row?.volume24h ?? 0),
            tsExchange: Number(payload.ts ?? Date.now()),
            source: "ws"
          });

          if (normalized) {
            onTick(normalized);
          }
        } catch (error) {
          logger.warn("[bybit][ws] Failed to parse message:", error);
        }
      });

      socket.on("error", (error) => {
        logger.warn("[bybit][ws] Socket error:", error);
      });

      socket.on("close", () => {
        logger.warn("[bybit][ws] Closed, reconnect in 3s");

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
      logger.info("[bybit][ws] Stopped");
    };
  }
}
