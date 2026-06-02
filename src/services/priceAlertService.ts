import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AggregateSnapshot, AlertChannel, AlertDirection, PriceAlertRecord } from "../domain/types";
import type { AuthPublicUser } from "./authService";
import { sendSystemEmail } from "../infrastructure/mailDelivery";
import { logger } from "../infrastructure/logger";

const DEFAULT_STORAGE_PATH =
  (process.env.PRICE_ALERT_STORAGE_FILE ?? "").trim() ||
  path.resolve(process.cwd(), "data", "price_alerts.json");

interface PersistedAlertRecord extends PriceAlertRecord {
  lastConditionMet?: boolean;
}

interface PersistedAlertsPayload {
  entries: PersistedAlertRecord[];
}

interface CreatePriceAlertInput {
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  channels?: AlertChannel[];
  enabled?: boolean;
}

interface EvaluatePriceAlertsDeps {
  resolveUserById: (userId: string) => Promise<AuthPublicUser | null>;
  sendWsEvent: (userId: string, payload: unknown) => void;
}

function normalizeSymbol(input: string): string {
  return String(input || "").trim().toUpperCase();
}

function normalizeChannels(channels: AlertChannel[] | undefined): AlertChannel[] {
  const current = Array.isArray(channels) ? channels : ["ws"];
  const allowed: AlertChannel[] = [];

  for (const channel of current) {
    if ((channel === "ws" || channel === "email") && !allowed.includes(channel)) {
      allowed.push(channel);
    }
  }

  return allowed.length ? allowed : ["ws"];
}

export class PriceAlertService {
  private readonly storagePath: string;
  private readonly alerts = new Map<string, PersistedAlertRecord>();

  constructor(storagePath = DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
    this.load();
  }

  public listByUser(userId: string): PriceAlertRecord[] {
    return Array.from(this.alerts.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((item) => this.toPublicRecord(item));
  }

  public createForUser(userId: string, input: CreatePriceAlertInput): PriceAlertRecord {
    const record: PersistedAlertRecord = {
      id: crypto.randomUUID(),
      userId,
      symbol: normalizeSymbol(input.symbol),
      direction: input.direction === "below" ? "below" : "above",
      targetPrice: Math.max(0, Number(input.targetPrice)),
      channels: normalizeChannels(input.channels),
      enabled: input.enabled !== false,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      lastConditionMet: false
    };

    this.alerts.set(record.id, record);
    this.persist();
    return this.toPublicRecord(record);
  }

  public deleteForUser(userId: string, alertId: string): boolean {
    const current = this.alerts.get(alertId);

    if (!current || current.userId !== userId) {
      return false;
    }

    this.alerts.delete(alertId);
    this.persist();
    return true;
  }

  public async evaluate(snapshot: AggregateSnapshot, deps: EvaluatePriceAlertsDeps): Promise<void> {
    const price = this.extractPrice(snapshot);

    if (price === null) {
      return;
    }

    let mutated = false;

    for (const alert of this.alerts.values()) {
      if (!alert.enabled || alert.symbol !== snapshot.symbol) {
        continue;
      }

      const conditionMet = alert.direction === "above" ? price >= alert.targetPrice : price <= alert.targetPrice;

      if (conditionMet && !alert.lastConditionMet) {
        const payload = {
          type: "price_alert",
          event: "price.trigger",
          data: {
            id: alert.id,
            symbol: alert.symbol,
            direction: alert.direction,
            targetPrice: alert.targetPrice,
            price,
            triggeredAt: new Date().toISOString(),
            aggregate: snapshot
          }
        };

        if (alert.channels.includes("ws")) {
          deps.sendWsEvent(alert.userId, payload);
        }

        if (alert.channels.includes("email")) {
          try {
            const user = await deps.resolveUserById(alert.userId);

            if (user?.email) {
              await sendSystemEmail({
                to: user.email,
                subject: `Price alert: ${alert.symbol} ${alert.direction === "above" ? "above" : "below"} ${alert.targetPrice}`,
                text: [
                  `Price alert fired for ${alert.symbol}.`,
                  `Direction: ${alert.direction}`,
                  `Target price: ${alert.targetPrice}`,
                  `Current price: ${price}`
                ].join("\n")
              });
            }
          } catch (error) {
            logger.warn("[alerts] Failed to deliver email alert:", error);
          }
        }

        alert.lastTriggeredAt = new Date().toISOString();
        mutated = true;
      }

      if (alert.lastConditionMet !== conditionMet) {
        alert.lastConditionMet = conditionMet;
        mutated = true;
      }
    }

    if (mutated) {
      this.persist();
    }
  }

  private extractPrice(snapshot: AggregateSnapshot): number | null {
    const candidates = [snapshot.midPrice, snapshot.bestBid, snapshot.bestAsk].filter(
      (value): value is number => Number.isFinite(value as number) && Number(value) > 0
    );

    return candidates.length ? candidates[0] : null;
  }

  private toPublicRecord(record: PersistedAlertRecord): PriceAlertRecord {
    return {
      id: record.id,
      userId: record.userId,
      symbol: record.symbol,
      direction: record.direction,
      targetPrice: record.targetPrice,
      channels: [...record.channels],
      enabled: record.enabled,
      createdAt: record.createdAt,
      lastTriggeredAt: record.lastTriggeredAt
    };
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

      const parsed = JSON.parse(raw) as PersistedAlertsPayload;

      for (const item of parsed.entries ?? []) {
        if (!item?.id || !item?.userId || !item?.symbol) {
          continue;
        }

        this.alerts.set(item.id, {
          ...item,
          symbol: normalizeSymbol(item.symbol),
          direction: item.direction === "below" ? "below" : "above",
          channels: normalizeChannels(item.channels),
          enabled: item.enabled !== false,
          lastConditionMet: Boolean(item.lastConditionMet)
        });
      }
    } catch {
      // ignore malformed local state
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      const payload: PersistedAlertsPayload = {
        entries: Array.from(this.alerts.values())
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // ignore local persistence errors
    }
  }
}
