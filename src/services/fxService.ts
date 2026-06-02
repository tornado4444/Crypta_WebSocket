import { fetchJson } from "../infrastructure/http";
import { logger } from "../infrastructure/logger";

interface FrankfurterPayload {
  base?: string;
  date?: string;
  rates?: Record<string, number>;
}

interface OpenErApiPayload {
  result?: string;
  base_code?: string;
  time_last_update_utc?: string;
  rates?: Record<string, number>;
}

export interface FxRatesSnapshot {
  base: string;
  rates: Record<string, number>;
  updatedAt: string;
  source: string;
}

const CACHE_TTL_MS = 30 * 60 * 1000;

const FALLBACK_USD_RATES: Record<string, number> = {
  USD: 1,
  EUR: 0.92,
  UAH: 40.6,
  GBP: 0.78,
  PLN: 3.93,
  CZK: 23.3,
  CHF: 0.89,
  JPY: 153.1,
  CNY: 7.25,
  CAD: 1.38,
  AUD: 1.52,
  NZD: 1.67,
  SEK: 10.58,
  NOK: 10.83,
  DKK: 6.87,
  TRY: 37.4,
  INR: 85.2,
  BRL: 5.26,
  MXN: 16.7,
  SGD: 1.35,
  HKD: 7.82,
  AED: 3.67,
  ZAR: 18.4
};

function normalizeBase(baseInput: string): string {
  const upper = String(baseInput || "USD").trim().toUpperCase();
  return upper && upper.length <= 8 ? upper : "USD";
}

function normalizeRates(input: Record<string, number> | undefined, base: string): Record<string, number> {
  const rates: Record<string, number> = {};

  for (const [code, value] of Object.entries(input ?? {})) {
    const normalizedCode = code.toUpperCase();
    const numeric = Number(value);

    if (!normalizedCode || !Number.isFinite(numeric) || numeric <= 0) {
      continue;
    }

    rates[normalizedCode] = numeric;
  }

  rates[base] = 1;
  return rates;
}

function convertFallbackToBase(base: string): Record<string, number> {
  const baseRate = FALLBACK_USD_RATES[base];

  if (!baseRate || !Number.isFinite(baseRate) || baseRate <= 0) {
    return { ...FALLBACK_USD_RATES };
  }

  const converted: Record<string, number> = {};

  for (const [code, usdRate] of Object.entries(FALLBACK_USD_RATES)) {
    const rate = usdRate / baseRate;

    if (Number.isFinite(rate) && rate > 0) {
      converted[code] = rate;
    }
  }

  converted[base] = 1;
  return converted;
}

function mergeWithFallback(base: string, rates: Record<string, number>): Record<string, number> {
  const fallbackRates = convertFallbackToBase(base);

  return {
    ...fallbackRates,
    ...rates,
    [base]: 1
  };
}

export class FxService {
  private readonly cacheByBase = new Map<string, { expiresAt: number; snapshot: FxRatesSnapshot }>();

  public async getRates(baseInput = "USD"): Promise<FxRatesSnapshot> {
    const base = normalizeBase(baseInput);
    const cached = this.cacheByBase.get(base);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.snapshot;
    }

    const fromFrankfurter = await this.fetchFromFrankfurter(base);

    if (fromFrankfurter) {
      this.cacheByBase.set(base, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        snapshot: fromFrankfurter
      });
      return fromFrankfurter;
    }

    const fromOpenErApi = await this.fetchFromOpenErApi(base);

    if (fromOpenErApi) {
      this.cacheByBase.set(base, {
        expiresAt: Date.now() + CACHE_TTL_MS,
        snapshot: fromOpenErApi
      });
      return fromOpenErApi;
    }

    const fallback: FxRatesSnapshot = {
      base,
      rates: convertFallbackToBase(base),
      updatedAt: new Date().toISOString(),
      source: "fallback"
    };

    this.cacheByBase.set(base, {
      expiresAt: Date.now() + CACHE_TTL_MS,
      snapshot: fallback
    });

    return fallback;
  }

  private async fetchFromFrankfurter(base: string): Promise<FxRatesSnapshot | null> {
    try {
      const payload = await fetchJson<FrankfurterPayload>(
        `https://api.frankfurter.app/latest?from=${base}`
      );
      const rates = mergeWithFallback(base, normalizeRates(payload.rates, base));

      if (Object.keys(rates).length <= 1) {
        return null;
      }

      return {
        base: (payload.base || base).toUpperCase(),
        rates,
        updatedAt: payload.date
          ? new Date(`${payload.date}T00:00:00Z`).toISOString()
          : new Date().toISOString(),
        source: "frankfurter.app"
      };
    } catch (error) {
      logger.warn(`[fx] Frankfurter fetch failed for base=${base}:`, error);
      return null;
    }
  }

  private async fetchFromOpenErApi(base: string): Promise<FxRatesSnapshot | null> {
    try {
      const payload = await fetchJson<OpenErApiPayload>(`https://open.er-api.com/v6/latest/${base}`);

      if (payload.result !== "success") {
        return null;
      }

      const rates = mergeWithFallback(base, normalizeRates(payload.rates, base));

      if (Object.keys(rates).length <= 1) {
        return null;
      }

      return {
        base: (payload.base_code || base).toUpperCase(),
        rates,
        updatedAt: payload.time_last_update_utc
          ? new Date(payload.time_last_update_utc).toISOString()
          : new Date().toISOString(),
        source: "open.er-api.com"
      };
    } catch (error) {
      logger.warn(`[fx] open.er-api fetch failed for base=${base}:`, error);
      return null;
    }
  }
}

