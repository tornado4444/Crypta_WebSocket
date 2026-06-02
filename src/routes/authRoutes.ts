import type { Express, Request, Response } from "express";

import type { AlertChannel, AlertDirection } from "../domain/types";
import {
  type AuthPublicUser,
  AuthService,
  authAdminResultIsSuccess,
  authListResultIsSuccess,
  authOperationResultIsSuccess,
  authOwnerAccessResultIsSuccess,
  authResultIsSuccess
} from "../services/authService";
import { AggregationService } from "../services/aggregationService";
import { PortfolioPnlService } from "../services/portfolioPnlService";
import { PriceAlertService } from "../services/priceAlertService";
import { ReportService, normalizeReportKind, normalizeReportLanguage, normalizeReportTheme } from "../services/reportService";
import { WatchlistService } from "../services/watchlistService";
import { WebhookSubscriptionService } from "../services/webhookSubscriptionService";
import { ClientHub } from "../ws/clientHub";

interface AuthRoutesDeps {
  authService: AuthService;
  aggregationService: AggregationService;
  watchlistService: WatchlistService;
  priceAlertService: PriceAlertService;
  webhookSubscriptionService: WebhookSubscriptionService;
  portfolioPnlService: PortfolioPnlService;
  reportService: ReportService;
  clientHub: ClientHub;
}

const QUOTE_ASSETS = ["USDT", "USDC", "USD", "BTC", "ETH", "EUR", "UAH", "BNB"];
const SYMBOL_RE = /^[A-Z0-9]{4,20}$/;
const REPORT_EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;


function normalizePublicBaseUrl(input: unknown): string | null {
  const value = String(input || "").trim().replace(/\/+$/, "");

  if (!value) {
    return null;
  }

  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString().replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

interface ReportShareBaseUrl {
  baseUrl: string;
  isPublic: boolean;
  source: "configured" | "request-host" | "local";
}

function resolveReportShareBaseUrl(req: Request): ReportShareBaseUrl {
  const configured =
    normalizePublicBaseUrl(process.env.PUBLIC_BASE_URL) ??
    normalizePublicBaseUrl(process.env.REPORT_PUBLIC_BASE_URL) ??
    normalizePublicBaseUrl(process.env.APP_PUBLIC_URL);

  if (configured) {
    return { baseUrl: configured, isPublic: true, source: "configured" };
  }

  const hostHeader = String(req.get("host") || "").trim();
  const protocol = String(req.headers["x-forwarded-proto"] || req.protocol || "http").split(",")[0].trim();
  const [hostname, portFromHost] = hostHeader.replace(/^\[/, "").replace(/\]$/, "").split(":");
  const isLocalHost = /^(localhost|127\.0\.0\.1|0\.0\.0\.0|::1)$/i.test(hostname || "");

  if (hostHeader && !isLocalHost) {
    return { baseUrl: protocol + "://" + hostHeader, isPublic: true, source: "request-host" };
  }

  const port = portFromHost || process.env.PORT || "8080";
  return {
    baseUrl: protocol + "://" + (hostHeader || "localhost:" + port),
    isPublic: false,
    source: "local"
  };
}

function buildSharedReportUrls(baseUrl: string, token: string) {
  const safeToken = encodeURIComponent(token);

  return {
    shortUrl: baseUrl + "/r/" + safeToken,
    legacyUrl: baseUrl + "/reports/shared/" + safeToken
  };
}

function parsePositiveAmount(input: unknown): number {
  const numeric = Number(input);
  return Number.isFinite(numeric) ? numeric : Number.NaN;
}

function resolveAssetCode(symbolInput: string): string {
  const symbol = String(symbolInput || "").trim().toUpperCase();

  for (const quote of QUOTE_ASSETS) {
    if (symbol.endsWith(quote) && symbol.length > quote.length) {
      return symbol.slice(0, symbol.length - quote.length);
    }
  }

  return symbol;
}

function parseLimit(input: unknown, fallback = 200, max = 1000): number {
  if (typeof input !== "string") {
    return fallback;
  }

  const parsed = Number.parseInt(input, 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.min(parsed, max);
}

function parseSymbol(input: unknown): string | null {
  const normalized = String(input || "").trim().toUpperCase();
  return SYMBOL_RE.test(normalized) ? normalized : null;
}

function normalizeReportIncludeProfile(input: unknown): boolean {
  return !(input === false || input === "false" || input === "0" || input === 0);
}

function normalizeRecipientEmails(input: unknown, fallback: string): string[] | null {
  const source = Array.isArray(input) ? input : String(input || fallback || "").split(/[;,]/);
  const emails = Array.from(
    new Set(
      source
        .map((item) => String(item || "").trim().toLowerCase())
        .filter(Boolean)
    )
  );

  if (!emails.length || emails.length > 8 || emails.some((email) => !REPORT_EMAIL_RE.test(email))) {
    return null;
  }

  return emails;
}

function normalizeAlertDirection(input: unknown): AlertDirection | null {
  return input === "below" ? "below" : input === "above" ? "above" : null;
}

function normalizeAlertChannels(input: unknown): AlertChannel[] {
  if (!Array.isArray(input)) {
    return ["ws"];
  }

  const channels = Array.from(
    new Set(
      input
        .map((item) => String(item || "").trim().toLowerCase())
        .filter((item) => item === "ws" || item === "email")
    )
  ) as AlertChannel[];

  return channels.length ? channels : ["ws"];
}

async function checkOwnerAccess(req: Request, res: Response, deps: AuthRoutesDeps): Promise<boolean> {
  const result = await deps.authService.requireOwnerAccess(req.headers.authorization);

  if (!authOwnerAccessResultIsSuccess(result)) {
    res.status(result.status).json({ error: result.error });
    return false;
  }

  return true;
}

async function resolveCurrentUser(
  req: Request,
  res: Response,
  deps: AuthRoutesDeps
): Promise<AuthPublicUser | null> {
  const result = await deps.authService.me(req.headers.authorization);

  if (!authResultIsSuccess(result)) {
    res.status(result.status).json({ error: result.error });
    return null;
  }

  return result.user;
}

export function registerAuthRoutes(app: Express, deps: AuthRoutesDeps): void {
  app.post("/api/v1/auth/register", async (req: Request, res: Response) => {
    const { email = "", password = "", displayName = "" } = (req.body ?? {}) as {
      email?: string;
      password?: string;
      displayName?: string;
    };

    const result = await deps.authService.register(String(email), String(password), String(displayName));

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.status(201).json(result);
  });

  app.post("/api/v1/auth/login", async (req: Request, res: Response) => {
    const { email = "", password = "" } = (req.body ?? {}) as {
      email?: string;
      password?: string;
    };

    const result = await deps.authService.login(String(email), String(password));

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/forgot-password/request-code", async (req: Request, res: Response) => {
    const { email = "" } = (req.body ?? {}) as { email?: string };
    const result = await deps.authService.requestPasswordResetCode(String(email));

    if (!authOperationResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/forgot-password/verify-code", async (req: Request, res: Response) => {
    const { email = "", code = "" } = (req.body ?? {}) as { email?: string; code?: string };
    const result = await deps.authService.verifyPasswordResetCode(String(email), String(code));

    if (!authOperationResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/forgot-password/confirm-code", async (req: Request, res: Response) => {
    const { email = "", code = "", newPassword = "" } = (req.body ?? {}) as {
      email?: string;
      code?: string;
      newPassword?: string;
    };

    const result = await deps.authService.confirmPasswordResetCode(
      String(email),
      String(code),
      String(newPassword)
    );

    if (!authOperationResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/owner/activate", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { setupKey = "" } = (req.body ?? {}) as { setupKey?: string };
    const result = await deps.authService.activateOwnerAccess(authHeader, String(setupKey));

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.get("/api/v1/auth/me", async (req: Request, res: Response) => {
    const result = await deps.authService.me(req.headers.authorization);

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ user: result.user });
  });

  app.patch("/api/v1/auth/profile", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { displayName, avatarUrl } = (req.body ?? {}) as {
      displayName?: string;
      avatarUrl?: string | null;
    };

    const result = await deps.authService.updateProfile(authHeader, {
      displayName: displayName !== undefined ? String(displayName) : undefined,
      avatarUrl: avatarUrl === undefined ? undefined : avatarUrl
    });

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/wallet/deposit", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { amountUsd } = (req.body ?? {}) as { amountUsd?: number };
    const result = await deps.authService.depositWallet(authHeader, {
      amountUsd: parsePositiveAmount(amountUsd)
    });

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json(result);
  });

  app.post("/api/v1/auth/portfolio/buy", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { symbol = "", amountUsd } = (req.body ?? {}) as {
      symbol?: string;
      amountUsd?: number;
    };
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    const normalizedAmountUsd = parsePositiveAmount(amountUsd);

    if (!normalizedSymbol) {
      res.status(400).json({ error: "Asset symbol is required" });
      return;
    }

    if (!Number.isFinite(normalizedAmountUsd) || normalizedAmountUsd <= 0) {
      res.status(400).json({ error: "Investment amount must be greater than 0" });
      return;
    }

    const aggregate = deps.aggregationService.buildForSymbol(normalizedSymbol, Date.now());
    const midPrice = Number(aggregate?.midPrice);

    if (!aggregate || !Number.isFinite(midPrice) || midPrice <= 0) {
      res.status(409).json({ error: "Market price is unavailable for this symbol" });
      return;
    }

    const assetCode = resolveAssetCode(normalizedSymbol);
    const assetUnits = normalizedAmountUsd / midPrice;
    const result = await deps.authService.buyAsset(authHeader, {
      symbol: normalizedSymbol,
      assetCode,
      amountUsd: normalizedAmountUsd,
      assetUnits
    });

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      ...result,
      trade: {
        symbol: normalizedSymbol,
        assetCode,
        amountUsd: normalizedAmountUsd,
        assetUnits,
        priceUsd: midPrice
      }
    });
  });

  app.post("/api/v1/auth/portfolio/sell", async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const { symbol = "", amountUsd, assetUnits, sellAll = false } = (req.body ?? {}) as {
      symbol?: string;
      amountUsd?: number;
      assetUnits?: number;
      sellAll?: boolean;
    };
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    let normalizedAmountUsd = parsePositiveAmount(amountUsd);
    const requestedAssetUnits = parsePositiveAmount(assetUnits);
    const hasRequestedAssetUnits = Number.isFinite(requestedAssetUnits) && requestedAssetUnits > 0;

    if (!normalizedSymbol) {
      res.status(400).json({ error: "Asset symbol is required" });
      return;
    }

    if ((!Number.isFinite(normalizedAmountUsd) || normalizedAmountUsd <= 0) && !hasRequestedAssetUnits) {
      res.status(400).json({ error: "Trade amount must be greater than 0" });
      return;
    }

    const aggregate = deps.aggregationService.buildForSymbol(normalizedSymbol, Date.now());
    const midPrice = Number(aggregate?.midPrice);

    if (!aggregate || !Number.isFinite(midPrice) || midPrice <= 0) {
      res.status(409).json({ error: "Market price is unavailable for this symbol" });
      return;
    }

    const assetCode = resolveAssetCode(normalizedSymbol);
    const sellAssetUnits = hasRequestedAssetUnits && sellAll ? requestedAssetUnits : normalizedAmountUsd / midPrice;

    if (hasRequestedAssetUnits && sellAll) {
      normalizedAmountUsd = Math.round(sellAssetUnits * midPrice * 100) / 100;
    }

    const result = await deps.authService.sellAsset(authHeader, {
      symbol: normalizedSymbol,
      assetCode,
      amountUsd: normalizedAmountUsd,
      assetUnits: sellAssetUnits,
      sellAll
    });

    if (!authResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      ...result,
      trade: {
        symbol: normalizedSymbol,
        assetCode,
        amountUsd: normalizedAmountUsd,
        assetUnits: sellAssetUnits,
        priceUsd: midPrice
      }
    });
  });

  app.get("/api/v1/auth/portfolio/pnl", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const payload = deps.portfolioPnlService.build(user);

    res.json(payload);
  });

  app.get("/api/v1/auth/reports/overview", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const data = deps.reportService.buildUserReport(user, {
      kind: normalizeReportKind(req.query.type ?? req.query.reportType),
      includeProfile: normalizeReportIncludeProfile(req.query.includeProfile)
    });
    res.json({ data });
  });

  app.post("/api/v1/auth/reports/email", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const recipientEmails = normalizeRecipientEmails(body.recipientEmail, user.email);
    const language = normalizeReportLanguage(body.language ?? body.lang);

    if (!recipientEmails) {
      res.status(400).json({ error: "Invalid report recipient email" });
      return;
    }

    try {
      const data = deps.reportService.buildUserReport(user, {
        kind: normalizeReportKind(body.reportType ?? body.type),
        includeProfile: normalizeReportIncludeProfile(body.includeProfile)
      });
      await deps.reportService.sendUserReportEmail(user, data, recipientEmails, language);
      res.json({ ok: true, sentTo: recipientEmails.join(", "), recipients: recipientEmails, generatedAt: data.generatedAt });
    } catch (error) {
      res.status(503).json({
        error: error instanceof Error ? error.message : "Report email service is unavailable"
      });
    }
  });

  app.post("/api/v1/auth/reports/pdf", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const language = normalizeReportLanguage(body.language ?? body.lang);
    const data = deps.reportService.buildUserReport(user, {
      kind: normalizeReportKind(body.reportType ?? body.type),
      includeProfile: normalizeReportIncludeProfile(body.includeProfile)
    });
    const fileName = deps.reportService.getReportAttachmentFileName(data, "pdf");

    res.setHeader("Content-Type", "application/pdf");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fileName + '"');
    res.send(await deps.reportService.renderPdfAttachment(data, language));
  });

  app.post("/api/v1/auth/reports/word", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const body = (req.body ?? {}) as Record<string, unknown>;
    const language = normalizeReportLanguage(body.language ?? body.lang);
    const data = deps.reportService.buildUserReport(user, {
      kind: normalizeReportKind(body.reportType ?? body.type),
      includeProfile: normalizeReportIncludeProfile(body.includeProfile)
    });
    const fileName = deps.reportService.getReportAttachmentFileName(data, "doc");
    const html = deps.reportService.renderWordReportHtml(data, language);

    res.setHeader("Content-Type", "application/msword; charset=utf-8");
    res.setHeader("Content-Disposition", 'attachment; filename="' + fileName + '"');
    res.send(Buffer.from(html, "utf8"));
  });

  app.post("/api/v1/auth/reports/share", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const body = (req.body ?? {}) as { type?: unknown; reportType?: unknown; includeProfile?: unknown; language?: unknown; lang?: unknown };
    const language = normalizeReportLanguage(body.language ?? body.lang);
    const data = deps.reportService.buildUserReport(user, {
      kind: normalizeReportKind(body.reportType ?? body.type),
      includeProfile: normalizeReportIncludeProfile(body.includeProfile)
    });
    const shared = deps.reportService.createSharedReport(user, data, language);
    const shareBase = resolveReportShareBaseUrl(req);
    const urls = buildSharedReportUrls(shareBase.baseUrl, shared.token);

    res.json({
      ok: true,
      token: shared.token,
      url: urls.shortUrl,
      shortUrl: urls.shortUrl,
      legacyUrl: urls.legacyUrl,
      public: shareBase.isPublic,
      source: shareBase.source,
      warning: shareBase.isPublic
        ? null
        : "Public report link is local only. Open the app through a real deployed domain or set PUBLIC_BASE_URL to a working domain/tunnel.",
      expiresAt: shared.expiresAt,
      generatedAt: data.generatedAt
    });
  });

  app.get("/api/v1/reports/shared/:token", (req: Request, res: Response) => {
    const shared = deps.reportService.getSharedReport(String(req.params.token || ""));

    if (!shared) {
      res.status(404).json({ error: "Shared report not found or expired" });
      return;
    }

    res.json({ ok: true, data: shared.report, language: shared.language, owner: shared.owner, expiresAt: shared.expiresAt });
  });

  const sendSharedReportHtml = (req: Request, res: Response) => {
    const shared = deps.reportService.getSharedReport(String(req.params.token || ""));

    if (!shared) {
      res.status(404).send("Shared report not found or expired");
      return;
    }

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Cache-Control", "no-store, max-age=0");
    res.send(deps.reportService.renderPublicReportHtml(
      shared.report,
      normalizeReportLanguage(req.query.lang ?? req.query.language ?? shared.language),
      normalizeReportTheme(req.query.theme)
    ));
  };

  app.get("/r/:token", sendSharedReportHtml);
  app.get("/reports/shared/:token", sendSharedReportHtml);

  app.get("/api/v1/auth/watchlist", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const data = deps.watchlistService.list(user.id);
    res.json({ count: data.length, data });
  });

  app.put("/api/v1/auth/watchlist", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const symbols = Array.isArray((req.body ?? {}).symbols) ? (req.body ?? {}).symbols : [];
    const data = deps.watchlistService.replace(
      user.id,
      symbols.map((item: unknown) => String(item || ""))
    );

    res.json({ count: data.length, data });
  });

  app.post("/api/v1/auth/watchlist", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const symbol = parseSymbol((req.body ?? {}).symbol);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    const data = deps.watchlistService.add(user.id, symbol);
    res.status(201).json({ count: data.length, data });
  });

  app.delete("/api/v1/auth/watchlist/:symbol", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const symbol = parseSymbol(req.params.symbol);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    const data = deps.watchlistService.remove(user.id, symbol);
    res.json({ count: data.length, data });
  });

  app.get("/api/v1/auth/alerts", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const data = deps.priceAlertService.listByUser(user.id);
    res.json({ count: data.length, data });
  });

  app.post("/api/v1/auth/alerts", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const symbol = parseSymbol((req.body ?? {}).symbol);
    const direction = normalizeAlertDirection((req.body ?? {}).direction);
    const targetPrice = parsePositiveAmount((req.body ?? {}).targetPrice);

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    if (!direction) {
      res.status(400).json({ error: "Invalid alert direction" });
      return;
    }

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      res.status(400).json({ error: "Target price must be greater than 0" });
      return;
    }

    const record = deps.priceAlertService.createForUser(user.id, {
      symbol,
      direction,
      targetPrice,
      channels: normalizeAlertChannels((req.body ?? {}).channels),
      enabled: (req.body ?? {}).enabled !== false
    });

    res.status(201).json({ data: record });
  });

  app.delete("/api/v1/auth/alerts/:id", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const ok = deps.priceAlertService.deleteForUser(user.id, String(req.params.id || ""));

    if (!ok) {
      res.status(404).json({ error: "Alert not found" });
      return;
    }

    res.json({ ok: true });
  });

  app.get("/api/v1/auth/webhooks/subscriptions", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const data = deps.webhookSubscriptionService.listByUser(user.id);
    res.json({ count: data.length, data });
  });

  app.post("/api/v1/auth/webhooks/subscriptions", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const symbol = parseSymbol((req.body ?? {}).symbol);
    const direction = normalizeAlertDirection((req.body ?? {}).direction);
    const targetPrice = parsePositiveAmount((req.body ?? {}).targetPrice);
    const url = String((req.body ?? {}).url || "").trim();

    if (!symbol) {
      res.status(400).json({ error: "Invalid symbol" });
      return;
    }

    if (!direction) {
      res.status(400).json({ error: "Invalid webhook direction" });
      return;
    }

    if (!Number.isFinite(targetPrice) || targetPrice <= 0) {
      res.status(400).json({ error: "Target price must be greater than 0" });
      return;
    }

    try {
      const record = deps.webhookSubscriptionService.createForUser(user.id, {
        url,
        symbol,
        direction,
        targetPrice,
        secret: (req.body ?? {}).secret,
        enabled: (req.body ?? {}).enabled !== false
      });

      res.status(201).json({ data: record });
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : "Failed to create webhook subscription" });
    }
  });

  app.delete("/api/v1/auth/webhooks/subscriptions/:id", async (req: Request, res: Response) => {
    const user = await resolveCurrentUser(req, res, deps);

    if (!user) {
      return;
    }

    const ok = deps.webhookSubscriptionService.deleteForUser(user.id, String(req.params.id || ""));

    if (!ok) {
      res.status(404).json({ error: "Webhook subscription not found" });
      return;
    }

    res.json({ ok: true });
  });

  app.get("/api/v1/admin/users", async (req: Request, res: Response) => {
    if (!(await checkOwnerAccess(req, res, deps))) {
      return;
    }

    const limit = parseLimit(req.query.limit, 200, 1000);
    const result = await deps.authService.listUsers(limit);

    if (!authListResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({
      count: result.users.length,
      data: result.users
    });
  });

  app.get("/api/v1/admin/ws/connections", async (req: Request, res: Response) => {
    if (!(await checkOwnerAccess(req, res, deps))) {
      return;
    }

    const data = deps.clientHub.listConnections();
    res.json({ count: data.length, data });
  });

  app.post("/api/v1/admin/users/:id/ban", async (req: Request, res: Response) => {
    if (!(await checkOwnerAccess(req, res, deps))) {
      return;
    }

    const result = await deps.authService.adminBanUser(String(req.params.id || ""));

    if (!authAdminResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ ok: true });
  });

  app.post("/api/v1/admin/users/:id/unban", async (req: Request, res: Response) => {
    if (!(await checkOwnerAccess(req, res, deps))) {
      return;
    }

    const result = await deps.authService.adminUnbanUser(String(req.params.id || ""));

    if (!authAdminResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ ok: true });
  });

  app.delete("/api/v1/admin/users/:id", async (req: Request, res: Response) => {
    if (!(await checkOwnerAccess(req, res, deps))) {
      return;
    }

    const result = await deps.authService.adminBanUser(String(req.params.id || ""));

    if (!authAdminResultIsSuccess(result)) {
      res.status(result.status).json({ error: result.error });
      return;
    }

    res.json({ ok: true });
  });
}


