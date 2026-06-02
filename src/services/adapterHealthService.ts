import type { SourceKind } from "../domain/types";

export type ExchangeHealthStatus = "online" | "degraded" | "offline";

export interface ExchangeHealthSnapshot {
  exchange: string;
  status: ExchangeHealthStatus;
  lastSuccessAt: number | null;
  lastRestSuccessAt: number | null;
  lastErrorAt: number | null;
  errorCount: number;
  successCount: number;
  restConsecutiveErrors: number;
  averageLatencyMs: number | null;
  lastLatencyMs: number | null;
  staleForMs: number | null;
  qualityScore: number;
}

interface AdapterHealthServiceOptions {
  pollIntervalMs?: number;
  degradedAfterMs?: number;
  offlineAfterMs?: number;
  degradedLatencyMs?: number;
}

interface MutableExchangeHealth {
  exchange: string;
  lastSuccessAt: number | null;
  lastRestSuccessAt: number | null;
  lastErrorAt: number | null;
  errorCount: number;
  successCount: number;
  restConsecutiveErrors: number;
  averageLatencyMs: number | null;
  lastLatencyMs: number | null;
  restLatencySamples: number;
}

const DEFAULT_POLL_INTERVAL_MS = 15_000;
const DEFAULT_DEGRADED_LATENCY_MS = 1_800;

function toPositiveNumberOr(input: unknown, fallback: number): number {
  const numeric = Number(input);
  return Number.isFinite(numeric) && numeric > 0 ? numeric : fallback;
}

export class AdapterHealthService {
  private readonly byExchange = new Map<string, MutableExchangeHealth>();
  private readonly degradedAfterMs: number;
  private readonly offlineAfterMs: number;
  private readonly degradedLatencyMs: number;

  constructor(exchangeIds: readonly string[], options: AdapterHealthServiceOptions = {}) {
    const pollIntervalMs = toPositiveNumberOr(options.pollIntervalMs, DEFAULT_POLL_INTERVAL_MS);
    this.degradedAfterMs = toPositiveNumberOr(options.degradedAfterMs, Math.max(15_000, Math.round(pollIntervalMs * 2.5)));
    this.offlineAfterMs = toPositiveNumberOr(
      options.offlineAfterMs,
      Math.max(this.degradedAfterMs + 5_000, Math.round(pollIntervalMs * 6))
    );
    this.degradedLatencyMs = toPositiveNumberOr(options.degradedLatencyMs, DEFAULT_DEGRADED_LATENCY_MS);

    for (const exchangeId of exchangeIds) {
      this.ensureEntry(exchangeId);
    }
  }

  public registerExchange(exchange: string): void {
    this.ensureEntry(exchange);
  }

  public markSuccess(exchange: string, source: SourceKind, latencyMs?: number): void {
    const entry = this.ensureEntry(exchange);
    const now = Date.now();

    entry.lastSuccessAt = now;
    entry.successCount += 1;

    if (source === "rest") {
      entry.lastRestSuccessAt = now;
      entry.restConsecutiveErrors = 0;

      const latency = Number(latencyMs);

      if (Number.isFinite(latency) && latency >= 0) {
        entry.lastLatencyMs = latency;
        entry.restLatencySamples += 1;

        if (entry.averageLatencyMs === null) {
          entry.averageLatencyMs = latency;
        } else {
          entry.averageLatencyMs += (latency - entry.averageLatencyMs) / entry.restLatencySamples;
        }
      }
    }
  }

  public markError(exchange: string): void {
    const entry = this.ensureEntry(exchange);
    entry.lastErrorAt = Date.now();
    entry.errorCount += 1;
    entry.restConsecutiveErrors += 1;
  }

  public getSnapshot(exchange: string, nowTs = Date.now()): ExchangeHealthSnapshot {
    const entry = this.ensureEntry(exchange);
    const staleForMs = entry.lastSuccessAt === null ? null : Math.max(0, nowTs - entry.lastSuccessAt);
    const status = this.resolveStatus(entry, staleForMs);

    return {
      exchange: entry.exchange,
      status,
      lastSuccessAt: entry.lastSuccessAt,
      lastRestSuccessAt: entry.lastRestSuccessAt,
      lastErrorAt: entry.lastErrorAt,
      errorCount: entry.errorCount,
      successCount: entry.successCount,
      restConsecutiveErrors: entry.restConsecutiveErrors,
      averageLatencyMs: entry.averageLatencyMs,
      lastLatencyMs: entry.lastLatencyMs,
      staleForMs,
      qualityScore: this.computeQualityScore(entry, status, staleForMs)
    };
  }

  public list(nowTs = Date.now()): ExchangeHealthSnapshot[] {
    return Array.from(this.byExchange.keys())
      .sort((a, b) => a.localeCompare(b))
      .map((exchange) => this.getSnapshot(exchange, nowTs));
  }

  private resolveStatus(entry: MutableExchangeHealth, staleForMs: number | null): ExchangeHealthStatus {
    if (entry.lastSuccessAt === null || staleForMs === null || staleForMs >= this.offlineAfterMs) {
      return "offline";
    }

    if (
      staleForMs >= this.degradedAfterMs ||
      entry.restConsecutiveErrors >= 2 ||
      (entry.averageLatencyMs !== null && entry.averageLatencyMs >= this.degradedLatencyMs)
    ) {
      return "degraded";
    }

    return "online";
  }

  private computeQualityScore(
    entry: MutableExchangeHealth,
    status: ExchangeHealthStatus,
    staleForMs: number | null
  ): number {
    let score = 100;

    if (status === "degraded") {
      score -= 24;
    } else if (status === "offline") {
      score -= 66;
    }

    if (entry.averageLatencyMs !== null) {
      const latencyPenalty = Math.max(0, (entry.averageLatencyMs - 250) / 90);
      score -= Math.min(22, latencyPenalty);
    }

    if (staleForMs === null) {
      score -= 12;
    } else {
      const stalePenalty = (staleForMs / this.offlineAfterMs) * 18;
      score -= Math.min(18, stalePenalty);
    }

    score -= Math.min(24, entry.restConsecutiveErrors * 7);

    const attempts = entry.successCount + entry.errorCount;

    if (attempts >= 3) {
      const errorRate = entry.errorCount / attempts;
      score -= Math.min(24, errorRate * 40);
    }

    const bounded = Math.max(0, Math.min(100, Math.round(score)));
    return bounded;
  }

  private ensureEntry(exchangeInput: string): MutableExchangeHealth {
    const exchange = String(exchangeInput || "").trim().toLowerCase();

    if (!exchange) {
      throw new Error("Exchange id is required");
    }

    const existing = this.byExchange.get(exchange);

    if (existing) {
      return existing;
    }

    const created: MutableExchangeHealth = {
      exchange,
      lastSuccessAt: null,
      lastRestSuccessAt: null,
      lastErrorAt: null,
      errorCount: 0,
      successCount: 0,
      restConsecutiveErrors: 0,
      averageLatencyMs: null,
      lastLatencyMs: null,
      restLatencySamples: 0
    };

    this.byExchange.set(exchange, created);
    return created;
  }
}