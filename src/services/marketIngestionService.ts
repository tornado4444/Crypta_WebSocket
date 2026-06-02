import type { ExchangeAdapter, MarketTick } from "../domain/types";
import { AuthService } from "./authService";
import { logger } from "../infrastructure/logger";
import { AdapterHealthService } from "./adapterHealthService";
import { AggregationService } from "./aggregationService";
import { CandleAggregationService } from "./candleAggregationService";
import { HistoryService } from "./historyService";
import { MarketStore } from "./marketStore";
import { PriceAlertService } from "./priceAlertService";
import { WebhookSubscriptionService } from "./webhookSubscriptionService";
import { ClientHub } from "../ws/clientHub";

export class MarketIngestionService {
  private wsStopHandlers: Array<() => void> = [];
  private pollTimer: NodeJS.Timeout | null = null;
  private restCycleInFlight = false;
  private isStopped = false;

  constructor(
    private readonly adapters: ExchangeAdapter[],
    private readonly symbols: string[],
    private readonly marketStore: MarketStore,
    private readonly aggregationService: AggregationService,
    private readonly historyService: HistoryService,
    private readonly clientHub: ClientHub,
    private readonly adapterHealthService: AdapterHealthService,
    private readonly pollIntervalMs: number,
    private readonly candleAggregationService: CandleAggregationService,
    private readonly priceAlertService: PriceAlertService | null,
    private readonly webhookSubscriptionService: WebhookSubscriptionService | null,
    private readonly authService: AuthService
  ) {
    for (const adapter of adapters) {
      this.adapterHealthService.registerExchange(adapter.id);
    }
  }

  public async start(): Promise<void> {
    await this.runRestCycle();

    this.pollTimer = setInterval(() => {
      void this.runRestCycle();
    }, this.pollIntervalMs);

    for (const adapter of this.adapters) {
      const stopHandler = await adapter.startWs(this.symbols, (tick) => {
        this.processTick(tick);
      });

      this.wsStopHandlers.push(stopHandler);
    }

    logger.info(
      `[ingestion] Started. Symbols=${this.symbols.join(",")} pollIntervalMs=${this.pollIntervalMs}`
    );
  }

  public async stop(): Promise<void> {
    this.isStopped = true;

    if (this.pollTimer) {
      clearInterval(this.pollTimer);
      this.pollTimer = null;
    }

    for (const stopHandler of this.wsStopHandlers) {
      try {
        stopHandler();
      } catch (error) {
        logger.warn("[ingestion] Failed to stop WS handler:", error);
      }
    }

    this.wsStopHandlers = [];
    logger.info("[ingestion] Stopped");
  }

  private processTick(tick: MarketTick): void {
    if (tick.source === "ws") {
      this.adapterHealthService.markSuccess(tick.exchange, "ws");
    }

    this.marketStore.upsert(tick);
    this.candleAggregationService.recordTick(tick);
    this.clientHub.broadcastTick(tick);

    const aggregate = this.aggregationService.buildForSymbol(tick.symbol);

    if (aggregate) {
      this.clientHub.broadcastAggregate(aggregate);
      void this.historyService.recordAggregateSnapshot(aggregate);
      if (this.priceAlertService) {
        void this.priceAlertService.evaluate(aggregate, {
          resolveUserById: (userId) => this.authService.getUserById(userId),
          sendWsEvent: (userId, payload) => this.clientHub.sendUserEvent(userId, payload)
        });
      }

      if (this.webhookSubscriptionService) {
        void this.webhookSubscriptionService.evaluate(aggregate);
      }
    }
  }

  public processReplicatedTick(tick: MarketTick): void {
    this.candleAggregationService.recordTick(tick);
    this.clientHub.broadcastTick(tick);

    const aggregate = this.aggregationService.buildForSymbol(tick.symbol);

    if (aggregate) {
      this.clientHub.broadcastAggregate(aggregate);
    }
  }

  private async runRestCycle(): Promise<void> {
    if (this.isStopped || this.restCycleInFlight) {
      return;
    }

    this.restCycleInFlight = true;

    try {
      const results = await Promise.all(
        this.adapters.map(async (adapter) => {
          const startedAt = Date.now();

          try {
            const ticks = await adapter.fetchTickers(this.symbols);
            const latencyMs = Date.now() - startedAt;

            return {
              ok: true as const,
              adapterId: adapter.id,
              latencyMs,
              ticks
            };
          } catch (error) {
            return {
              ok: false as const,
              adapterId: adapter.id,
              error
            };
          }
        })
      );

      for (const result of results) {
        if (result.ok) {
          if (result.ticks.length > 0) {
            this.adapterHealthService.markSuccess(result.adapterId, "rest", result.latencyMs);
          } else {
            this.adapterHealthService.markError(result.adapterId);
            logger.warn(`[ingestion] REST cycle empty response from ${result.adapterId}`);
          }

          for (const tick of result.ticks) {
            this.processTick(tick);
          }

          continue;
        }

        this.adapterHealthService.markError(result.adapterId);
        logger.warn(`[ingestion] REST cycle adapter error (${result.adapterId}):`, result.error);
      }
    } finally {
      this.restCycleInFlight = false;
    }
  }
}
