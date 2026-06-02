import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import type { AggregateSnapshot, AlertDirection, WebhookSubscriptionRecord } from "../domain/types";
import { logger } from "../infrastructure/logger";

const DEFAULT_STORAGE_PATH =
  (process.env.WEBHOOK_SUBSCRIPTION_STORAGE_FILE ?? "").trim() ||
  path.resolve(process.cwd(), "data", "webhook_subscriptions.json");

interface PersistedWebhookSubscriptionRecord extends WebhookSubscriptionRecord {
  lastConditionMet?: boolean;
}

interface PersistedWebhookPayload {
  entries: PersistedWebhookSubscriptionRecord[];
}

interface CreateWebhookSubscriptionInput {
  url: string;
  symbol: string;
  direction: AlertDirection;
  targetPrice: number;
  secret?: string | null;
  enabled?: boolean;
}

function normalizeSymbol(input: string): string {
  return String(input || "").trim().toUpperCase();
}

function normalizeUrl(input: string): string {
  return String(input || "").trim();
}

function isAllowedWebhookUrl(input: string): boolean {
  try {
    const parsed = new URL(input);
    return parsed.protocol === "https:" || parsed.protocol === "http:";
  } catch {
    return false;
  }
}

export class WebhookSubscriptionService {
  private readonly storagePath: string;
  private readonly subscriptions = new Map<string, PersistedWebhookSubscriptionRecord>();

  constructor(storagePath = DEFAULT_STORAGE_PATH) {
    this.storagePath = storagePath;
    this.load();
  }

  public listByUser(userId: string): WebhookSubscriptionRecord[] {
    return Array.from(this.subscriptions.values())
      .filter((item) => item.userId === userId)
      .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
      .map((item) => this.toPublicRecord(item));
  }

  public createForUser(userId: string, input: CreateWebhookSubscriptionInput): WebhookSubscriptionRecord {
    const url = normalizeUrl(input.url);

    if (!isAllowedWebhookUrl(url)) {
      throw new Error("Webhook URL must be a valid http/https address");
    }

    const record: PersistedWebhookSubscriptionRecord = {
      id: crypto.randomUUID(),
      userId,
      url,
      symbol: normalizeSymbol(input.symbol),
      direction: input.direction === "below" ? "below" : "above",
      targetPrice: Math.max(0, Number(input.targetPrice)),
      secret: String(input.secret ?? "").trim() || null,
      enabled: input.enabled !== false,
      createdAt: new Date().toISOString(),
      lastTriggeredAt: null,
      lastConditionMet: false
    };

    this.subscriptions.set(record.id, record);
    this.persist();
    return this.toPublicRecord(record);
  }

  public deleteForUser(userId: string, subscriptionId: string): boolean {
    const current = this.subscriptions.get(subscriptionId);

    if (!current || current.userId !== userId) {
      return false;
    }

    this.subscriptions.delete(subscriptionId);
    this.persist();
    return true;
  }

  public async evaluate(snapshot: AggregateSnapshot): Promise<void> {
    const price = this.extractPrice(snapshot);

    if (price === null) {
      return;
    }

    let mutated = false;

    for (const subscription of this.subscriptions.values()) {
      if (!subscription.enabled || subscription.symbol !== snapshot.symbol) {
        continue;
      }

      const conditionMet =
        subscription.direction === "above" ? price >= subscription.targetPrice : price <= subscription.targetPrice;

      if (conditionMet && !subscription.lastConditionMet) {
        const firedAt = new Date().toISOString();
        const payload = {
          event: "price.trigger",
          subscription: {
            id: subscription.id,
            symbol: subscription.symbol,
            direction: subscription.direction,
            targetPrice: subscription.targetPrice
          },
          aggregate: snapshot,
          trigger: {
            price,
            firedAt
          }
        };

        try {
          await this.deliverWebhook(subscription, payload);
        } catch (error) {
          logger.warn("[webhooks] Failed to deliver webhook:", error);
        }

        subscription.lastTriggeredAt = firedAt;
        mutated = true;
      }

      if (subscription.lastConditionMet !== conditionMet) {
        subscription.lastConditionMet = conditionMet;
        mutated = true;
      }
    }

    if (mutated) {
      this.persist();
    }
  }

  private async deliverWebhook(
    subscription: PersistedWebhookSubscriptionRecord,
    payload: Record<string, unknown>
  ): Promise<void> {
    const body = JSON.stringify(payload);
    const headers: Record<string, string> = {
      "Content-Type": "application/json",
      "User-Agent": "CryptoAggregator/1.0 webhook"
    };

    if (subscription.secret) {
      const signature = crypto.createHmac("sha256", subscription.secret).update(body).digest("hex");
      headers["x-cryptoaggregator-signature"] = `sha256=${signature}`;
    }

    const response = await fetch(subscription.url, {
      method: "POST",
      headers,
      body
    });

    if (!response.ok) {
      throw new Error(`Webhook responded with ${response.status}`);
    }
  }

  private extractPrice(snapshot: AggregateSnapshot): number | null {
    const candidates = [snapshot.midPrice, snapshot.bestBid, snapshot.bestAsk].filter(
      (value): value is number => Number.isFinite(value as number) && Number(value) > 0
    );

    return candidates.length ? candidates[0] : null;
  }

  private toPublicRecord(record: PersistedWebhookSubscriptionRecord): WebhookSubscriptionRecord {
    return {
      id: record.id,
      userId: record.userId,
      url: record.url,
      symbol: record.symbol,
      direction: record.direction,
      targetPrice: record.targetPrice,
      secret: record.secret,
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

      const parsed = JSON.parse(raw) as PersistedWebhookPayload;

      for (const item of parsed.entries ?? []) {
        if (!item?.id || !item?.userId || !item?.symbol || !item?.url) {
          continue;
        }

        const url = normalizeUrl(item.url);

        if (!isAllowedWebhookUrl(url)) {
          continue;
        }

        this.subscriptions.set(item.id, {
          ...item,
          url,
          symbol: normalizeSymbol(item.symbol),
          direction: item.direction === "below" ? "below" : "above",
          secret: String(item.secret ?? "").trim() || null,
          enabled: item.enabled !== false,
          lastConditionMet: Boolean(item.lastConditionMet)
        });
      }
    } catch {
      // ignore malformed persisted state
    }
  }

  private persist(): void {
    try {
      fs.mkdirSync(path.dirname(this.storagePath), { recursive: true });
      const payload: PersistedWebhookPayload = {
        entries: Array.from(this.subscriptions.values())
      };
      fs.writeFileSync(this.storagePath, JSON.stringify(payload, null, 2), "utf8");
    } catch {
      // ignore local persistence errors
    }
  }
}
