import WebSocket from "ws";

import { normalizeTick } from "../../domain/normalizer";
import type { ExchangeAdapter, MarketTick } from "../../domain/types";
import { fetchJson } from "../../infrastructure/http";
import { logger } from "../../infrastructure/logger";

const OKX_REST_BASE = "https://www.okx.com";
const OKX_WS_URL = "wss://ws.okx.com:8443/ws/v5/public";

interface OkxRestResponse {
  code: string;
  msg: string;
  data?: Array<{
    instId?: string;
    last?: string;
    bidPx?: string;
    askPx?: string;
    vol24h?: string;
    ts?: string;
  }>;
}

interface OkxWsMessage {
  event?: string;
  arg?: {
    channel?: string;
    instId?: string;
  };
  data?: Array<{
    instId?: string;
    last?: string;
    bidPx?: string;
    askPx?: string;
    vol24h?: string;
    ts?: string;
  }>;
}

function toOkxInstId(symbol: string): string {
  const upper = symbol.toUpperCase();

  if (upper.endsWith("USDT")) {
    return `${upper.slice(0, -4)}-USDT`;
  }

  if (upper.endsWith("USD")) {
    return `${upper.slice(0, -3)}-USD`;
  }

  return upper;
}

function fromOkxInstId(instId: string): string {
  return instId.replace(/-/g, "");
}

export class OkxAdapter implements ExchangeAdapter {
  public readonly id = "okx";

  public async fetchTickers(symbols: string[]): Promise<MarketTick[]> {
    const tasks = symbols.map(async (symbol) => {
      try {
        const instId = toOkxInstId(symbol);
        const payload = await fetchJson<OkxRestResponse>(
          `${OKX_REST_BASE}/api/v5/market/ticker?instId=${instId}`
        );

        const row = payload.data?.[0];

        if (!row?.instId) {
          return null;
        }

        return normalizeTick({
          exchange: this.id,
          symbol: fromOkxInstId(row.instId),
          lastPrice: row.last ?? 0,
          bid: row.bidPx ?? 0,
          ask: row.askPx ?? 0,
          volume24h: row.vol24h ?? 0,
          tsExchange: row.ts ? Number(row.ts) : Date.now(),
          source: "rest"
        });
      } catch (error) {
        logger.warn(`[okx][rest] Failed to fetch ${symbol}:`, error);
        return null;
      }
    });

    const result = await Promise.all(tasks);
    return result.filter((tick): tick is MarketTick => tick !== null);
  }

  public async startWs(symbols: string[], onTick: (tick: MarketTick) => void): Promise<() => void> {
    if (!symbols.length) {
      return () => {
        logger.info("[okx][ws] No symbols provided, skip startup");
      };
    }

    const args = symbols.map((symbol) => ({
      channel: "tickers",
      instId: toOkxInstId(symbol)
    }));

    let socket: WebSocket | null = null;
    let reconnectTimer: NodeJS.Timeout | null = null;
    let stopped = false;

    const connect = () => {
      if (stopped) {
        return;
      }

      socket = new WebSocket(OKX_WS_URL);

      socket.on("open", () => {
        logger.info(`[okx][ws] Connected: ${OKX_WS_URL}`);
        socket?.send(JSON.stringify({ op: "subscribe", args }));
      });

      socket.on("message", (raw) => {
        try {
          const payload = JSON.parse(raw.toString()) as OkxWsMessage;

          if (!payload.arg?.channel || payload.arg.channel !== "tickers") {
            return;
          }

          const row = payload.data?.[0];

          if (!row?.instId) {
            return;
          }

          const normalized = normalizeTick({
            exchange: this.id,
            symbol: fromOkxInstId(row.instId),
            lastPrice: row.last ?? 0,
            bid: row.bidPx ?? 0,
            ask: row.askPx ?? 0,
            volume24h: row.vol24h ?? 0,
            tsExchange: row.ts ? Number(row.ts) : Date.now(),
            source: "ws"
          });

          if (normalized) {
            onTick(normalized);
          }
        } catch (error) {
          logger.warn("[okx][ws] Failed to parse message:", error);
        }
      });

      socket.on("error", (error) => {
        logger.warn("[okx][ws] Socket error:", error);
      });

      socket.on("close", () => {
        logger.warn("[okx][ws] Closed, reconnect in 3s");

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
      logger.info("[okx][ws] Stopped");
    };
  }
}
