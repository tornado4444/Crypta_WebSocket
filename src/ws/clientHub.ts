import crypto from "node:crypto";

import WebSocket, { WebSocketServer } from "ws";

import type { AggregateSnapshot, MarketTick } from "../domain/types";
import { logger } from "../infrastructure/logger";
import { authResultIsSuccess, AuthService } from "../services/authService";
import { WatchlistService } from "../services/watchlistService";

interface IncomingClientMessage {
  type?: string;
  symbols?: string[];
  token?: string;
}

interface ConnectedClient {
  id: string;
  subscriptions: Set<string>;
  connectedAt: string;
  remoteAddress: string | null;
  userAgent: string | null;
  user: {
    id: string;
    email: string;
    isOwner: boolean;
  } | null;
}

interface PublicConnectionSnapshot {
  id: string;
  connectedAt: string;
  remoteAddress: string | null;
  userAgent: string | null;
  user: {
    id: string;
    email: string;
    isOwner: boolean;
  } | null;
  subscriptions: string[];
  subscriptionsCount: number;
}

function normalizeSymbols(symbols: string[] | undefined): string[] {
  return Array.from(
    new Set(
      (Array.isArray(symbols) ? symbols : [])
        .map((symbol) => String(symbol || "").trim().toUpperCase())
        .filter((symbol) => /^[A-Z0-9]{4,20}$/.test(symbol))
    )
  );
}

export class ClientHub {
  private readonly clients = new Map<WebSocket, ConnectedClient>();

  constructor(
    private readonly wsServer: WebSocketServer,
    private readonly authService: AuthService,
    private readonly watchlistService: WatchlistService
  ) {}

  public start(): void {
    this.wsServer.on("connection", (socket, request) => {
      const client: ConnectedClient = {
        id: crypto.randomUUID(),
        subscriptions: new Set<string>(),
        connectedAt: new Date().toISOString(),
        remoteAddress: request.socket.remoteAddress ?? null,
        userAgent: request.headers["user-agent"] ?? null,
        user: null
      };

      this.clients.set(socket, client);

      this.safeSend(socket, {
        type: "connected",
        message: "Connected to market data stream. Use subscribe/unsubscribe/auth messages to filter symbols."
      });

      const token = this.extractTokenFromRequest(request.url ?? "");

      if (token) {
        void this.authenticateSocket(socket, token);
      }

      socket.on("message", (raw) => {
        void this.handleMessage(socket, raw.toString());
      });

      socket.on("close", () => {
        this.clients.delete(socket);
      });

      socket.on("error", (error) => {
        logger.warn("[client-hub] Client socket error:", error);
      });
    });
  }

  public broadcastTick(tick: MarketTick): void {
    const payload = {
      type: "tick",
      data: tick
    };

    for (const [socket, client] of this.clients.entries()) {
      if (client.subscriptions.size > 0 && !client.subscriptions.has(tick.symbol)) {
        continue;
      }

      this.safeSend(socket, payload);
    }
  }

  public broadcastAggregate(snapshot: AggregateSnapshot): void {
    const payload = {
      type: "aggregate",
      data: snapshot
    };

    for (const [socket, client] of this.clients.entries()) {
      if (client.subscriptions.size > 0 && !client.subscriptions.has(snapshot.symbol)) {
        continue;
      }

      this.safeSend(socket, payload);
    }
  }

  public sendUserEvent(userId: string, payload: unknown): void {
    for (const [socket, client] of this.clients.entries()) {
      if (client.user?.id !== userId) {
        continue;
      }

      this.safeSend(socket, payload);
    }
  }

  public listConnections(): PublicConnectionSnapshot[] {
    return Array.from(this.clients.values()).map((client) => ({
      id: client.id,
      connectedAt: client.connectedAt,
      remoteAddress: client.remoteAddress,
      userAgent: client.userAgent,
      user: client.user,
      subscriptions: Array.from(client.subscriptions).sort(),
      subscriptionsCount: client.subscriptions.size
    }));
  }

  public close(): void {
    for (const socket of this.clients.keys()) {
      socket.close();
    }

    this.clients.clear();
    this.wsServer.close();
  }

  private async handleMessage(socket: WebSocket, rawMessage: string): Promise<void> {
    try {
      const parsed = JSON.parse(rawMessage) as IncomingClientMessage;
      const client = this.clients.get(socket);

      if (!client) {
        return;
      }

      if (parsed.type === "auth") {
        const token = String(parsed.token || "").trim();

        if (!token) {
          client.user = null;
          client.subscriptions.clear();
          this.safeSend(socket, { type: "auth_cleared" });
          return;
        }

        await this.authenticateSocket(socket, token);
        return;
      }

      if (parsed.type === "subscribe") {
        const symbols = normalizeSymbols(parsed.symbols);

        for (const symbol of symbols) {
          client.subscriptions.add(symbol);
        }

        if (client.user) {
          for (const symbol of symbols) {
            this.watchlistService.add(client.user.id, symbol);
          }
        }

        this.safeSend(socket, {
          type: "subscribed",
          symbols: Array.from(client.subscriptions)
        });

        return;
      }

      if (parsed.type === "unsubscribe") {
        const symbols = normalizeSymbols(parsed.symbols);

        for (const symbol of symbols) {
          client.subscriptions.delete(symbol);
        }

        if (client.user) {
          for (const symbol of symbols) {
            this.watchlistService.remove(client.user.id, symbol);
          }
        }

        this.safeSend(socket, {
          type: "unsubscribed",
          symbols: Array.from(client.subscriptions)
        });

        return;
      }

      if (parsed.type === "ping") {
        this.safeSend(socket, { type: "pong", ts: Date.now() });
      }
    } catch {
      this.safeSend(socket, {
        type: "error",
        message: "Invalid message format. Expected JSON with type=subscribe/unsubscribe/auth/ping."
      });
    }
  }

  private async authenticateSocket(socket: WebSocket, token: string): Promise<void> {
    const client = this.clients.get(socket);

    if (!client) {
      return;
    }

    try {
      const authResult = await this.authService.me(`Bearer ${token}`);

      if (!authResultIsSuccess(authResult)) {
        this.safeSend(socket, {
          type: "auth_error",
          message: authResult.error
        });
        return;
      }

      client.user = {
        id: authResult.user.id,
        email: authResult.user.email,
        isOwner: authResult.user.isOwner
      };

      client.subscriptions = new Set(this.watchlistService.list(authResult.user.id));

      this.safeSend(socket, {
        type: "authenticated",
        user: client.user,
        subscriptions: Array.from(client.subscriptions)
      });
    } catch (error) {
      logger.warn("[client-hub] Failed to authenticate websocket client:", error);
      this.safeSend(socket, {
        type: "auth_error",
        message: "Failed to authenticate websocket client"
      });
    }
  }

  private extractTokenFromRequest(rawUrl: string): string {
    try {
      const parsed = new URL(rawUrl, "ws://localhost");
      return String(parsed.searchParams.get("token") || "").trim();
    } catch {
      return "";
    }
  }

  private safeSend(socket: WebSocket, payload: unknown): void {
    if (socket.readyState !== WebSocket.OPEN) {
      return;
    }

    socket.send(JSON.stringify(payload));
  }
}
