import fs from "node:fs";
import path from "node:path";

const DEFAULT_STORAGE_PATH =
  (process.env.WATCHLIST_STORAGE_FILE ?? "").trim() ||
  path.resolve(process.cwd(), "data", "watchlists.json");

interface PersistedWatchlists {
  entries: Record<string, string[]>;
}

function normalizeSymbol(input: string): string {
  return String(input || "").trim().toUpperCase();
}

export class WatchlistService {
  private readonly storagePath: string;
  private readonly byUser = new Map<string, string[]>();

  constructor(storagePath = DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
    this.load();
  }

  public list(userId: string): string[] {
    return [...(this.byUser.get(String(userId).trim()) ?? [])];
  }

  public replace(userId: string, symbols: string[]): string[] {
    const normalizedUserId = String(userId || "").trim();
    const nextSymbols = this.normalizeSymbols(symbols);

    if (!normalizedUserId) {
      return [];
    }

    this.byUser.set(normalizedUserId, nextSymbols);
    this.persist();
    return [...nextSymbols];
  }

  public add(userId: string, symbol: string): string[] {
    const normalizedUserId = String(userId || "").trim();
    const normalizedSymbol = normalizeSymbol(symbol);

    if (!normalizedUserId || !normalizedSymbol) {
      return this.list(normalizedUserId);
    }

    const current = new Set(this.list(normalizedUserId));
    current.add(normalizedSymbol);
    return this.replace(normalizedUserId, [...current]);
  }

  public remove(userId: string, symbol: string): string[] {
    const normalizedUserId = String(userId || "").trim();
    const normalizedSymbol = normalizeSymbol(symbol);
    const next = this.list(normalizedUserId).filter((item) => item !== normalizedSymbol);
    return this.replace(normalizedUserId, next);
  }

  private normalizeSymbols(symbols: string[]): string[] {
    return Array.from(
      new Set(
        (Array.isArray(symbols) ? symbols : [])
          .map((item) => normalizeSymbol(item))
          .filter((item) => /^[A-Z0-9]{4,20}$/.test(item))
      )
    ).sort();
  }

  private load(): void {
    try {
      if (!fs.existsSync(this.storagePath)) {
        return;
      }

      const raw = fs.readFileSync(this.storagePath, "utf8");

      if (!raw.trim()) {
        return;
      }

      const parsed = JSON.parse(raw) as PersistedWatchlists;
      const entries = parsed?.entries ?? {};

      for (const [userId, symbols] of Object.entries(entries)) {
        this.byUser.set(userId, this.normalizeSymbols(Array.isArray(symbols) ? symbols : []));
      }
    } catch {
      // ignore malformed persisted data and continue with empty state
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });

      const payload: PersistedWatchlists = {
        entries: Object.fromEntries(this.byUser.entries())
      };

      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // ignore persistence errors for local fallback state
    }
  }
}
