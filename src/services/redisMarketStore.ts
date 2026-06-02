import crypto from "node:crypto";

import type { MarketTick } from "../domain/types";
import { logger } from "../infrastructure/logger";
import { MarketStore, type ReplicatedTickListener } from "./marketStore";

interface RedisMarketStoreOptions {
  redisUrl: string;
  keyPrefix?: string;
  tickTtlMs?: number;
}

function tryRequireRedis(): any {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    return require("redis");
  } catch {
    return null;
  }
}

function normalizeTickTtlMs(input: number | undefined): number {
  return Number.isFinite(input) && Number(input) > 0 ? Math.trunc(Number(input)) : 60_000;
}

export class RedisMarketStore extends MarketStore {
  private readonly redisUrl: string;
  private readonly keyPrefix: string;
  private readonly tickTtlMs: number;
  private readonly instanceId = crypto.randomUUID();
  private readonly channelName: string;
  private replicationListener: ReplicatedTickListener | null = null;
  private dataClient: any = null;
  private pubClient: any = null;
  private subClient: any = null;

  constructor(options: RedisMarketStoreOptions) {
    super();
    this.redisUrl = options.redisUrl;
    this.keyPrefix = (options.keyPrefix ?? "crypta").trim() || "crypta";
    this.tickTtlMs = normalizeTickTtlMs(options.tickTtlMs);
    this.channelName = `${this.keyPrefix}:ticks:pubsub`;
  }

  public override async start(): Promise<void> {
    const redis = tryRequireRedis();

    if (!redis?.createClient) {
      throw new Error("Redis driver selected, but 'redis' package is not installed");
    }

    this.dataClient = redis.createClient({ url: this.redisUrl });
    this.pubClient = redis.createClient({ url: this.redisUrl });
    this.subClient = redis.createClient({ url: this.redisUrl });

    await Promise.all([this.dataClient.connect(), this.pubClient.connect(), this.subClient.connect()]);
    await this.hydrateFromRedis();
    await this.subClient.subscribe(this.channelName, (message: string) => {
      void this.handleReplicationMessage(message);
    });

    logger.info(`[redis-market-store] Connected to ${this.redisUrl}`);
  }

  public override async close(): Promise<void> {
    await Promise.allSettled([
      this.subClient?.quit?.(),
      this.pubClient?.quit?.(),
      this.dataClient?.quit?.()
    ]);
  }

  public override setReplicationListener(listener: ReplicatedTickListener | null): void {
    this.replicationListener = listener;
  }

  public override upsert(tick: MarketTick): void {
    this.upsertLocal(tick);
    void this.persistAndPublish(tick);
  }

  public override getBySymbol(symbol: string): MarketTick[] {
    this.pruneExpiredLocal();
    return super.getBySymbol(symbol);
  }

  public override getAllTicks(): MarketTick[] {
    this.pruneExpiredLocal();
    return super.getAllTicks();
  }

  public override listSymbols(): string[] {
    this.pruneExpiredLocal();
    return super.listSymbols();
  }

  private async hydrateFromRedis(): Promise<void> {
    if (!this.dataClient) {
      return;
    }

    const match = `${this.keyPrefix}:tick:*`;
    let cursor = "0";

    do {
      const scanResult = await this.dataClient.scan(cursor, {
        MATCH: match,
        COUNT: 200
      });

      cursor = scanResult.cursor;
      const keys = Array.isArray(scanResult.keys) ? scanResult.keys : [];

      if (!keys.length) {
        continue;
      }

      const payloads = await this.dataClient.mGet(keys);

      for (const raw of payloads ?? []) {
        if (!raw) {
          continue;
        }

        try {
          const tick = JSON.parse(String(raw)) as MarketTick;
          this.upsertLocal(tick);
        } catch {
          // ignore malformed cache items
        }
      }
    } while (cursor !== "0");
  }

  private async persistAndPublish(tick: MarketTick): Promise<void> {
    if (!this.dataClient || !this.pubClient) {
      return;
    }

    const key = `${this.keyPrefix}:tick:${tick.symbol.toUpperCase()}:${tick.exchange}`;
    await this.dataClient.set(key, JSON.stringify(tick), { PX: this.tickTtlMs });
    await this.pubClient.publish(
      this.channelName,
      JSON.stringify({
        source: this.instanceId,
        tick
      })
    );
  }

  private async handleReplicationMessage(message: string): Promise<void> {
    try {
      const parsed = JSON.parse(message) as { source?: string; tick?: MarketTick };

      if (!parsed?.tick || parsed.source === this.instanceId) {
        return;
      }

      this.upsertLocal(parsed.tick);
      this.replicationListener?.(parsed.tick);
    } catch {
      // ignore malformed replication frames
    }
  }

  private pruneExpiredLocal(): void {
    const threshold = Date.now() - this.tickTtlMs;

    for (const [symbol, bucket] of this.bySymbol.entries()) {
      for (const [exchange, tick] of bucket.entries()) {
        if (tick.tsIngested < threshold) {
          bucket.delete(exchange);
        }
      }

      if (bucket.size === 0) {
        this.bySymbol.delete(symbol);
      }
    }
  }
}
