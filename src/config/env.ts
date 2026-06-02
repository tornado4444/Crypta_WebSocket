export interface AppConfig {
  port: number;
  symbols: string[];
  restPollIntervalMs: number;
  useMockData: boolean;
  enableDbPersistence: boolean;
  snapshotIntervalMs: number;
  tickStaleAfterMs: number;
  marketStoreDriver: "memory" | "redis";
  redisUrl: string;
  redisKeyPrefix: string;
  redisTickTtlMs: number;
  enableMarketIngestion: boolean;
}

function parseIntWithDefault(value: string | undefined, fallback: number): number {
  if (!value) {
    return fallback;
  }

  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function parseBoolean(value: string | undefined, fallback: boolean): boolean {
  if (value === undefined) {
    return fallback;
  }

  const normalized = value.trim().toLowerCase();
  return normalized === "1" || normalized === "true" || normalized === "yes";
}

export function loadConfig(): AppConfig {
  const defaultSymbols = [
    "BTCUSDT",
    "ETHUSDT",
    "SOLUSDT",
    "BNBUSDT",
    "XRPUSDT",
    "DOGEUSDT",
    "ADAUSDT",
    "LTCUSDT",
    "AVAXUSDT",
    "TRXUSDT",
    "DOTUSDT",
    "ETCUSDT",
    "LINKUSDT",
    "UNIUSDT",
    "ATOMUSDT",
    "BCHUSDT",
    "XLMUSDT",
    "SUIUSDT",
    "TONUSDT",
    "SHIBUSDT"
  ];

  const symbols = (process.env.SYMBOLS ?? defaultSymbols.join(","))
    .split(",")
    .map((symbol) => symbol.trim().toUpperCase())
    .filter(Boolean);

  return {
    port: parseIntWithDefault(process.env.PORT, 8080),
    symbols: symbols.length ? symbols : defaultSymbols,
    restPollIntervalMs: parseIntWithDefault(process.env.REST_POLL_INTERVAL_MS, 15_000),
    useMockData: parseBoolean(process.env.USE_MOCK_DATA, false),
    enableDbPersistence: parseBoolean(process.env.ENABLE_DB_PERSISTENCE, true),
    snapshotIntervalMs: parseIntWithDefault(process.env.SNAPSHOT_INTERVAL_MS, 5_000),
    tickStaleAfterMs: parseIntWithDefault(process.env.TICK_STALE_AFTER_MS, 25_000),
    marketStoreDriver:
      String(process.env.MARKET_STORE_DRIVER || "memory").trim().toLowerCase() === "redis" ? "redis" : "memory",
    redisUrl: String(process.env.REDIS_URL || "redis://localhost:6379").trim(),
    redisKeyPrefix: String(process.env.REDIS_KEY_PREFIX || "crypta").trim() || "crypta",
    redisTickTtlMs: parseIntWithDefault(process.env.REDIS_TICK_TTL_MS, 60_000),
    enableMarketIngestion: parseBoolean(process.env.ENABLE_MARKET_INGESTION, true)
  };
}
