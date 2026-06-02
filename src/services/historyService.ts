import type { AggregateSnapshot } from "../domain/types";
import { logger } from "../infrastructure/logger";
import { getPrismaClient } from "../infrastructure/prismaClient";

export interface AggregateHistoryRecord {
  id: string;
  symbol: string;
  bestBid: number | null;
  bestAsk: number | null;
  midPrice: number | null;
  spread: number | null;
  exchanges: string[];
  updatedAt: number;
  createdAt: string;
}

export class HistoryService {
  private readonly lastSavedAtBySymbol = new Map<string, number>();
  private warnedDbError = false;

  constructor(
    private readonly enabled: boolean,
    private readonly snapshotIntervalMs: number
  ) {}

  public isEnabled(): boolean {
    return this.enabled && getPrismaClient() !== null;
  }

  public async recordAggregateSnapshot(snapshot: AggregateSnapshot): Promise<void> {
    if (!this.enabled) {
      return;
    }

    const now = Date.now();
    const lastSavedAt = this.lastSavedAtBySymbol.get(snapshot.symbol) ?? 0;

    if (now - lastSavedAt < this.snapshotIntervalMs) {
      return;
    }

    const prisma = getPrismaClient();

    if (!prisma) {
      return;
    }

    try {
      await prisma.marketAggregateSnapshot.create({
        data: {
          symbol: snapshot.symbol,
          bestBid: snapshot.bestBid,
          bestAsk: snapshot.bestAsk,
          midPrice: snapshot.midPrice,
          spread: snapshot.spread,
          exchanges: snapshot.exchanges,
          updatedAt: BigInt(snapshot.updatedAt)
        }
      });

      this.lastSavedAtBySymbol.set(snapshot.symbol, now);
    } catch (error) {
      if (!this.warnedDbError) {
        logger.warn("[db] Failed to persist snapshot. Check DATABASE_URL / prisma schema:", error);
        this.warnedDbError = true;
      }
    }
  }

  public async getSymbolHistory(symbol: string, limit: number): Promise<AggregateHistoryRecord[]> {
    if (!this.enabled) {
      return [];
    }

    const prisma = getPrismaClient();

    if (!prisma) {
      return [];
    }

    try {
      const rows = await prisma.marketAggregateSnapshot.findMany({
        where: { symbol: symbol.toUpperCase() },
        orderBy: { createdAt: "desc" },
        take: limit
      });

      return rows.map((row) => {
        const rawExchanges = row.exchanges;
        const exchanges = Array.isArray(rawExchanges)
          ? rawExchanges.map((item) => String(item))
          : [];

        return {
          id: row.id.toString(),
          symbol: row.symbol,
          bestBid: row.bestBid,
          bestAsk: row.bestAsk,
          midPrice: row.midPrice,
          spread: row.spread,
          exchanges,
          updatedAt: Number(row.updatedAt),
          createdAt: row.createdAt.toISOString()
        };
      });
    } catch (error) {
      logger.warn("[db] Failed to read history:", error);
      return [];
    }
  }
}
