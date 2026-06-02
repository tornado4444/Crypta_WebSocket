import crypto from "node:crypto";
import fs from "node:fs";
import PDFDocument from "pdfkit";
import { sendSystemEmail } from "../infrastructure/mailDelivery";
import type { AggregateQuality } from "../domain/types";
import type { ExchangeHealthSnapshot } from "./adapterHealthService";
import { AdapterHealthService } from "./adapterHealthService";
import { AggregationService } from "./aggregationService";
import type { AuthPublicUser } from "./authService";
import { PortfolioPnlService } from "./portfolioPnlService";
import { PriceAlertService } from "./priceAlertService";
import { WatchlistService } from "./watchlistService";
import { WebhookSubscriptionService } from "./webhookSubscriptionService";

interface ReportServiceDeps {
  aggregationService: AggregationService;
  adapterHealthService: AdapterHealthService;
  portfolioPnlService: PortfolioPnlService;
  watchlistService: WatchlistService;
  priceAlertService: PriceAlertService;
  webhookSubscriptionService: WebhookSubscriptionService;
}

export type ReportKind = "full" | "profile" | "portfolio" | "market" | "security";
export type ReportLanguage = "uk" | "en" | "de" | "fr" | "it" | "pt" | "es" | "pl" | "bg" | "el" | "tr" | "ko" | "ja" | "ar" | "zh";
export type ReportTheme = "dark" | "light";

const REPORT_KINDS: readonly ReportKind[] = ["full", "profile", "portfolio", "market", "security"];
const REPORT_LANGUAGES: readonly ReportLanguage[] = ["uk", "en", "de", "fr", "it", "pt", "es", "pl", "bg", "el", "tr", "ko", "ja", "ar", "zh"];
const REPORT_THEMES: readonly ReportTheme[] = ["dark", "light"];

export function normalizeReportKind(input: unknown): ReportKind {
  const normalized = String(input || "").trim().toLowerCase();
  return (REPORT_KINDS as readonly string[]).includes(normalized) ? (normalized as ReportKind) : "full";
}

export function normalizeReportLanguage(input: unknown): ReportLanguage {
  const normalized = String(input || "").trim().toLowerCase();
  const aliases: Record<string, ReportLanguage> = {
    ua: "uk",
    jp: "ja",
    cn: "zh"
  };
  const value = aliases[normalized] ?? normalized;
  return (REPORT_LANGUAGES as readonly string[]).includes(value) ? (value as ReportLanguage) : "uk";
}

export function normalizeReportTheme(input: unknown): ReportTheme {
  const normalized = String(input || "").trim().toLowerCase();
  return (REPORT_THEMES as readonly string[]).includes(normalized) ? (normalized as ReportTheme) : "dark";
}

interface ReportBuildOptions {
  kind?: unknown;
  includeProfile?: boolean;
}

interface ReportSectionSummary {
  key: string;
  title: string;
  summary: string;
  items: string[];
}

interface ReportMarketSymbol {
  symbol: string;
  priceUsd: number | null;
  spreadUsd: number | null;
  quality: AggregateQuality;
  activeSources: number;
  staleSources: number;
  updatedAt: string | null;
}

interface ReportMarketSummary {
  symbolsTracked: number;
  activeExchanges: number;
  averageSpreadUsd: number | null;
  qualityCounts: Record<AggregateQuality, number>;
  topSymbols: ReportMarketSymbol[];
}

interface ReportAccountSummary {
  userId: string;
  email: string;
  displayName: string;
  createdAt: string;
  isOwner: boolean;
  wallet: AuthPublicUser["wallet"];
}

export interface UserAnalyticsReport {
  generatedAt: string;
  kind: ReportKind;
  includeProfile: boolean;
  account: ReportAccountSummary;
  market: ReportMarketSummary;
  portfolio: ReturnType<PortfolioPnlService["build"]>;
  watchlist: string[];
  alerts: ReturnType<PriceAlertService["listByUser"]>;
  webhooks: ReturnType<WebhookSubscriptionService["listByUser"]>;
  exchanges: ExchangeHealthSnapshot[];
  sections: ReportSectionSummary[];
  recommendations: string[];
  score: {
    value: number;
    label: "starter" | "active" | "advanced";
    reasons: string[];
  };
}

export interface SharedReportSnapshot {
  token: string;
  report: UserAnalyticsReport;
  language: ReportLanguage;
  owner: Pick<ReportAccountSummary, "userId" | "email" | "displayName">;
  createdAt: string;
  expiresAt: string;
}

interface ReportRenderCopy {
  documentTitle: string;
  generated: string;
  reportType: string;
  qualityScore: string;
  wallet: string;
  openPositions: string;
  alerts: string;
  webhooks: string;
  watchlist: string;
  activeExchanges: string;
  recommendations: string;
  sections: string;
  topMarketSymbols: string;
  portfolioPositions: string;
  exchangeHealth: string;
  priceAlerts: string;
  webhookSubscriptions: string;
  noData: string;
  forwardedNote: string;
  emailSubject: string;
  user: string;
  ownerAccess: string;
  enabled: string;
  disabled: string;
  trackedSymbols: string;
  averageSpread: string;
  qualityHighMediumLow: string;
  invested: string;
  currentValue: string;
  unrealizedPnl: string;
  symbol: string;
  price: string;
  spread: string;
  quality: string;
  activeSources: string;
  staleSources: string;
  amount: string;
  entryPrice: string;
  exchange: string;
  status: string;
  lastSuccess: string;
  avgLatency: string;
  errors: string;
  condition: string;
  target: string;
  channels: string;
  lastTrigger: string;
  url: string;
  yes: string;
  no: string;
  kind: Record<ReportKind, string>;
  sectionCopy: Record<string, { title: string; summary: string }>;
  recommendationsCopy: Record<string, string>;
}

const EN_REPORT_COPY: ReportRenderCopy = {
  documentTitle: "CryptoAggregator analytics report",
  generated: "Generated",
  reportType: "Report type",
  qualityScore: "Quality score",
  wallet: "Wallet",
  openPositions: "Open positions",
  alerts: "Alerts",
  webhooks: "Webhooks",
  watchlist: "Watchlist",
  activeExchanges: "Active exchanges",
  recommendations: "Recommendations",
  sections: "Report sections",
  topMarketSymbols: "Top market symbols",
  portfolioPositions: "Portfolio positions",
  exchangeHealth: "Exchange source health",
  priceAlerts: "Price alerts",
  webhookSubscriptions: "Webhook subscriptions",
  noData: "No data",
  forwardedNote: "This report can be forwarded to teachers, teammates, or any external email recipient.",
  emailSubject: "CryptoAggregator report",
  user: "User",
  ownerAccess: "Owner access",
  enabled: "enabled",
  disabled: "disabled",
  trackedSymbols: "Tracked symbols",
  averageSpread: "Average spread",
  qualityHighMediumLow: "Quality high/medium/low",
  invested: "Invested",
  currentValue: "Current value",
  unrealizedPnl: "Unrealized P&L",
  symbol: "Symbol",
  price: "Price",
  spread: "Spread",
  quality: "Quality",
  activeSources: "Active sources",
  staleSources: "Stale sources",
  amount: "Amount",
  entryPrice: "Entry price",
  exchange: "Exchange",
  status: "Status",
  lastSuccess: "Last success",
  avgLatency: "Avg latency",
  errors: "Errors",
  condition: "Condition",
  target: "Target",
  channels: "Channels",
  lastTrigger: "Last trigger",
  url: "URL",
  yes: "yes",
  no: "no",
  kind: {
    full: "Full report",
    profile: "Client profile",
    portfolio: "Portfolio and P&L",
    market: "Market quality",
    security: "Alerts and automations"
  },
  sectionCopy: {
    profile: {
      title: "Client profile",
      summary: "Identity, wallet, owner status and account readiness snapshot."
    },
    portfolio: {
      title: "Portfolio and P&L",
      summary: "Current investment exposure, portfolio value, realized and unrealized performance."
    },
    market: {
      title: "Market quality",
      summary: "Coverage, exchange availability, spread quality and stale-source monitoring."
    },
    automation: {
      title: "Alerts and webhooks",
      summary: "Automation readiness for price triggers, email notifications and bot integrations."
    },
    summary: {
      title: "Account summary",
      summary: "Compact overview of account, market coverage and automation readiness."
    }
  },
  recommendationsCopy: {
    watchlist: "Add key symbols to the watchlist so WebSocket auto-subscription is personalized.",
    portfolio: "Open a small test position to unlock portfolio P&L analytics.",
    alerts: "Create at least one price alert to show real-time notification logic.",
    webhooks: "Register a webhook URL to demonstrate bot-ready trigger delivery.",
    exchanges: "Review degraded/offline exchange adapters before relying on source quality.",
    healthy: "Configuration looks healthy. Keep monitoring stale ticks and exchange latency."
  }
};

type ReportCopyOverride = Partial<Omit<ReportRenderCopy, "kind" | "sectionCopy" | "recommendationsCopy">> & {
  kind?: Partial<Record<ReportKind, string>>;
  sectionCopy?: Partial<Record<string, { title: string; summary: string }>>;
  recommendationsCopy?: Partial<Record<string, string>>;
};

const REPORT_COPY_OVERRIDES: Partial<Record<ReportLanguage, ReportCopyOverride>> = {
  uk: {
    documentTitle: "Аналітичний звіт CryptoAggregator",
    generated: "Згенеровано",
    reportType: "Тип звіту",
    qualityScore: "Показник якості",
    wallet: "Гаманець",
    openPositions: "Відкриті позиції",
    alerts: "Сповіщення",
    webhooks: "Webhook-и",
    watchlist: "Watchlist",
    activeExchanges: "Активні біржі",
    recommendations: "Рекомендації",
    sections: "Розділи звіту",
    topMarketSymbols: "Топ ринкових символів",
    portfolioPositions: "Позиції портфеля",
    exchangeHealth: "Стан джерел бірж",
    priceAlerts: "Цінові сповіщення",
    webhookSubscriptions: "Webhook-підписки",
    noData: "Даних поки немає",
    forwardedNote: "Цей звіт можна переслати викладачу, команді або будь-якому зовнішньому email-отримувачу.",
    emailSubject: "Звіт CryptoAggregator",
    user: "Користувач",
    ownerAccess: "Доступ власника",
    enabled: "увімкнено",
    disabled: "вимкнено",
    trackedSymbols: "Відстежувані символи",
    averageSpread: "Середній спред",
    qualityHighMediumLow: "Якість висока/середня/низька",
    invested: "Інвестовано",
    currentValue: "Поточна вартість",
    unrealizedPnl: "Нереалізований P&L",
    symbol: "Символ",
    price: "Ціна",
    spread: "Спред",
    quality: "Якість",
    activeSources: "Активні джерела",
    staleSources: "Застарілі джерела",
    amount: "Кількість",
    entryPrice: "Ціна входу",
    exchange: "Біржа",
    status: "Статус",
    lastSuccess: "Останній успіх",
    avgLatency: "Середня затримка",
    errors: "Помилки",
    condition: "Умова",
    target: "Ціль",
    channels: "Канали",
    lastTrigger: "Останній тригер",
    yes: "так",
    no: "ні",
    kind: {
      full: "Повний звіт",
      profile: "Профіль клієнта",
      portfolio: "Портфель і P&L",
      market: "Якість ринку",
      security: "Сповіщення й автоматизація"
    },
    sectionCopy: {
      profile: { title: "Профіль клієнта", summary: "Ідентифікація, гаманець, статус власника та готовність акаунта." },
      portfolio: { title: "Портфель і P&L", summary: "Поточна експозиція, вартість портфеля, реалізований і нереалізований результат." },
      market: { title: "Якість ринку", summary: "Покриття, доступність бірж, якість спреду та моніторинг stale-джерел." },
      automation: { title: "Сповіщення й webhook-и", summary: "Готовність автоматизації для цінових тригерів, email і бот-інтеграцій." },
      summary: { title: "Підсумок акаунта", summary: "Стислий огляд акаунта, ринку та автоматизації." }
    },
    recommendationsCopy: {
      watchlist: "Додайте ключові символи у watchlist, щоб WebSocket-підписка була персоналізованою.",
      portfolio: "Відкрийте невелику тестову позицію, щоб показати P&L-аналітику портфеля.",
      alerts: "Створіть хоча б одне цінове сповіщення для демонстрації real-time логіки.",
      webhooks: "Зареєструйте webhook URL, щоб показати доставку тригерів для ботів.",
      exchanges: "Перевірте degraded/offline адаптери бірж перед використанням показника якості.",
      healthy: "Конфігурація виглядає стабільною. Продовжуйте моніторинг stale-тиків і затримки бірж."
    }
  },
  de: {
    documentTitle: "CryptoAggregator Analysebericht",
    generated: "Erstellt",
    reportType: "Berichtstyp",
    qualityScore: "Qualitaetswert",
    wallet: "Wallet",
    openPositions: "Offene Positionen",
    alerts: "Alerts",
    webhooks: "Webhooks",
    watchlist: "Watchlist",
    activeExchanges: "Aktive Boersen",
    recommendations: "Empfehlungen",
    sections: "Berichtsabschnitte",
    topMarketSymbols: "Top-Marktsymbole",
    portfolioPositions: "Portfolio-Positionen",
    exchangeHealth: "Boersenquellen-Status",
    priceAlerts: "Preisalerts",
    webhookSubscriptions: "Webhook-Abos",
    noData: "Keine Daten",
    forwardedNote: "Dieser Bericht kann an Lehrkraefte, Teamkollegen oder externe Empfaenger weitergeleitet werden.",
    emailSubject: "CryptoAggregator Bericht",
    user: "Benutzer",
    ownerAccess: "Owner-Zugriff",
    enabled: "aktiviert",
    disabled: "deaktiviert",
    trackedSymbols: "Verfolgte Symbole",
    averageSpread: "Durchschnittlicher Spread",
    qualityHighMediumLow: "Qualitaet hoch/mittel/niedrig",
    invested: "Investiert",
    currentValue: "Aktueller Wert",
    unrealizedPnl: "Nicht realisierter P&L",
    kind: {
      full: "Vollbericht",
      profile: "Kundenprofil",
      portfolio: "Portfolio und P&L",
      market: "Marktqualitaet",
      security: "Alerts und Automatisierung"
    },
    sectionCopy: {
      profile: { title: "Kundenprofil", summary: "Identitaet, Wallet, Owner-Status und Konto-Snapshot." },
      portfolio: { title: "Portfolio und P&L", summary: "Aktuelle Exponierung, Portfoliowert und Performance." },
      market: { title: "Marktqualitaet", summary: "Abdeckung, Boersenverfuegbarkeit, Spread-Qualitaet und stale Quellen." },
      automation: { title: "Alerts und Webhooks", summary: "Automationsbereitschaft fuer Preis-Trigger, E-Mail und Bot-Integrationen." }
    }
  },
  ja: {
    documentTitle: "CryptoAggregator 分析レポート",
    generated: "生成日時",
    reportType: "レポート種別",
    qualityScore: "品質スコア",
    wallet: "ウォレット",
    openPositions: "未決済ポジション",
    alerts: "アラート",
    webhooks: "Webhook",
    watchlist: "ウォッチリスト",
    activeExchanges: "稼働取引所",
    recommendations: "推奨事項",
    sections: "レポート項目",
    topMarketSymbols: "主要マーケット銘柄",
    portfolioPositions: "ポートフォリオポジション",
    exchangeHealth: "取引所ソース品質",
    priceAlerts: "価格アラート",
    webhookSubscriptions: "Webhook購読",
    noData: "データはまだありません",
    forwardedNote: "このレポートは教師、チームメイト、または外部メール受信者へ転送できます。",
    emailSubject: "CryptoAggregator レポート",
    user: "ユーザー",
    ownerAccess: "オーナー権限",
    enabled: "有効",
    disabled: "無効",
    trackedSymbols: "監視銘柄",
    averageSpread: "平均スプレッド",
    qualityHighMediumLow: "品質 高/中/低",
    invested: "投資額",
    currentValue: "現在価値",
    unrealizedPnl: "未実現P&L",
    symbol: "銘柄",
    price: "価格",
    spread: "スプレッド",
    quality: "品質",
    activeSources: "有効ソース",
    staleSources: "古いソース",
    amount: "数量",
    entryPrice: "エントリー価格",
    exchange: "取引所",
    status: "状態",
    lastSuccess: "最終成功",
    avgLatency: "平均遅延",
    errors: "エラー",
    condition: "条件",
    target: "目標",
    channels: "チャンネル",
    lastTrigger: "最終トリガー",
    yes: "はい",
    no: "いいえ",
    kind: {
      full: "完全レポート",
      profile: "クライアントプロフィール",
      portfolio: "ポートフォリオとP&L",
      market: "市場品質",
      security: "アラートと自動化"
    },
    sectionCopy: {
      profile: { title: "クライアントプロフィール", summary: "本人情報、ウォレット、オーナー状態、アカウント準備状況のスナップショット。" },
      portfolio: { title: "ポートフォリオとP&L", summary: "投資状況、ポートフォリオ価値、実現/未実現パフォーマンス。" },
      market: { title: "市場品質", summary: "カバレッジ、取引所稼働状況、スプレッド品質、古いソース監視。" },
      automation: { title: "アラートとWebhook", summary: "価格トリガー、メール通知、ボット連携の自動化準備状況。" },
      summary: { title: "アカウント概要", summary: "アカウント、市場カバレッジ、自動化準備状況の概要。" }
    },
    recommendationsCopy: {
      watchlist: "重要な銘柄をウォッチリストに追加し、WebSocket自動購読をパーソナライズしましょう。",
      portfolio: "小さなテストポジションを開き、ポートフォリオP&L分析を表示しましょう。",
      alerts: "リアルタイム通知ロジックを示すため、価格アラートを1つ以上作成しましょう。",
      webhooks: "ボット向けトリガー配信を示すため、Webhook URLを登録しましょう。",
      exchanges: "品質指標を利用する前に、degraded/offlineの取引所アダプターを確認しましょう。",
      healthy: "設定は正常です。古いティックと取引所レイテンシの監視を続けましょう。"
    }
  }
};

function getReportCopy(language: ReportLanguage): ReportRenderCopy {
  const override = REPORT_COPY_OVERRIDES[language] ?? {};
  const sectionCopy: ReportRenderCopy["sectionCopy"] = { ...EN_REPORT_COPY.sectionCopy };
  const recommendationsCopy: ReportRenderCopy["recommendationsCopy"] = { ...EN_REPORT_COPY.recommendationsCopy };

  for (const [key, value] of Object.entries(override.sectionCopy ?? {})) {
    if (value) {
      sectionCopy[key] = value;
    }
  }

  for (const [key, value] of Object.entries(override.recommendationsCopy ?? {})) {
    if (value) {
      recommendationsCopy[key] = value;
    }
  }

  return {
    ...EN_REPORT_COPY,
    ...override,
    kind: { ...EN_REPORT_COPY.kind, ...(override.kind ?? {}) },
    sectionCopy,
    recommendationsCopy
  };
}

function roundMoney(value: number | null | undefined): number | null {
  if (!Number.isFinite(value as number)) {
    return null;
  }

  return Math.round(Number(value) * 100) / 100;
}

function formatNumber(value: number | null | undefined, suffix = ""): string {
  if (!Number.isFinite(value as number)) {
    return "-";
  }

  return `${new Intl.NumberFormat("uk-UA", { maximumFractionDigits: 2 }).format(Number(value))}${suffix}`;
}

function formatDate(value: number | string | null | undefined): string {
  if (value === null || value === undefined || value === "") {
    return "-";
  }

  const date = typeof value === "number" ? new Date(value) : new Date(value);

  if (Number.isNaN(date.getTime())) {
    return "-";
  }

  return date.toLocaleString("uk-UA");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function getReportHtmlPalette(theme: ReportTheme) {
  return theme === "light"
    ? {
        pageBg: "#f4f8ff",
        cardBg: "#ffffff",
        sectionBg: "#ffffff",
        subtleBg: "#eef5ff",
        text: "#06142b",
        muted: "#36557c",
        border: "#c9dcf8",
        line: "#d9e6f8",
        header: "#174d8f",
        accent: "#047857",
        shadow: "0 16px 40px rgba(71,104,160,0.14)"
      }
    : {
        pageBg: "#071225",
        cardBg: "#10244a",
        sectionBg: "#0b1832",
        subtleBg: "#0f2446",
        text: "#f7fbff",
        muted: "#b8c8e8",
        border: "#2c5da8",
        line: "#203f70",
        header: "#9cc2ff",
        accent: "#38d996",
        shadow: "0 16px 44px rgba(0,0,0,0.24)"
      };
}

function getPublicReportUiCopy(language: ReportLanguage) {
  const labels: Record<ReportLanguage, { language: string; theme: string; dark: string; light: string }> = {
    uk: { language: "Мова", theme: "Тема", dark: "Темна", light: "Світла" },
    en: { language: "Language", theme: "Theme", dark: "Dark", light: "Light" },
    de: { language: "Sprache", theme: "Thema", dark: "Dunkel", light: "Hell" },
    fr: { language: "Langue", theme: "Theme", dark: "Sombre", light: "Clair" },
    it: { language: "Lingua", theme: "Tema", dark: "Scuro", light: "Chiaro" },
    pt: { language: "Idioma", theme: "Tema", dark: "Escuro", light: "Claro" },
    es: { language: "Idioma", theme: "Tema", dark: "Oscuro", light: "Claro" },
    pl: { language: "Jezyk", theme: "Motyw", dark: "Ciemny", light: "Jasny" },
    bg: { language: "Език", theme: "Тема", dark: "Тъмна", light: "Светла" },
    el: { language: "Γλώσσα", theme: "Θέμα", dark: "Σκούρο", light: "Ανοιχτό" },
    tr: { language: "Dil", theme: "Tema", dark: "Koyu", light: "Acik" },
    ko: { language: "언어", theme: "테마", dark: "어두움", light: "밝음" },
    ja: { language: "言語", theme: "テーマ", dark: "ダーク", light: "ライト" },
    ar: { language: "اللغة", theme: "السمة", dark: "داكن", light: "فاتح" },
    zh: { language: "语言", theme: "主题", dark: "深色", light: "浅色" }
  };

  return labels[language] ?? labels.uk;
}

const REPORT_LANGUAGE_LABELS: Record<ReportLanguage, string> = {
  uk: "Українська",
  en: "English",
  de: "Deutsch",
  fr: "Français",
  it: "Italiano",
  pt: "Português",
  es: "Español",
  pl: "Polski",
  bg: "Български",
  el: "Ελληνικά",
  tr: "Türkçe",
  ko: "한국어",
  ja: "日本語",
  ar: "العربية",
  zh: "中文"
};

export class ReportService {
  private readonly sharedReports = new Map<string, SharedReportSnapshot>();

  constructor(private readonly deps: ReportServiceDeps) {}

  public createSharedReport(
    user: AuthPublicUser,
    report = this.buildUserReport(user),
    language: ReportLanguage = "uk"
  ): SharedReportSnapshot {
    this.cleanupSharedReports();
    const createdAt = new Date();
    const expiresAt = new Date(createdAt.getTime() + 7 * 24 * 60 * 60 * 1000);
    const snapshot: SharedReportSnapshot = {
      token: crypto.randomBytes(9).toString("base64url"),
      report,
      language,
      owner: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName
      },
      createdAt: createdAt.toISOString(),
      expiresAt: expiresAt.toISOString()
    };

    this.sharedReports.set(snapshot.token, snapshot);
    return snapshot;
  }

  public getSharedReport(tokenInput: string): SharedReportSnapshot | null {
    this.cleanupSharedReports();
    const token = String(tokenInput || "").trim();
    const snapshot = this.sharedReports.get(token);

    if (!snapshot || Date.parse(snapshot.expiresAt) <= Date.now()) {
      if (snapshot) {
        this.sharedReports.delete(token);
      }
      return null;
    }

    return snapshot;
  }

  public renderPublicReportHtml(
    report: UserAnalyticsReport,
    language: ReportLanguage = "uk",
    theme: ReportTheme = "dark"
  ): string {
    return this.renderStandaloneReportHtml(report, language, theme);
  }

  public renderWordReportHtml(report: UserAnalyticsReport, language: ReportLanguage = "uk"): string {
    return "\ufeff" + this.renderOfficeReportHtml(report, language);
  }

  public renderPdfAttachment(report: UserAnalyticsReport, language: ReportLanguage = "uk"): Promise<Buffer> {
    return this.renderPdfReport(report, language);
  }

  public getReportAttachmentFileName(report: UserAnalyticsReport, extension: string): string {
    const safeExtension = extension.replace(/^\.+/, "") || "txt";
    return "cryptoaggregator-report-" + this.getReportFileStamp(report) + "." + safeExtension;
  }

  private cleanupSharedReports(now = Date.now()): void {
    for (const [token, snapshot] of this.sharedReports) {
      if (Date.parse(snapshot.expiresAt) <= now) {
        this.sharedReports.delete(token);
      }
    }
  }

  public buildUserReport(user: AuthPublicUser, options: ReportBuildOptions = {}): UserAnalyticsReport {
    const nowTs = Date.now();
    const kind = normalizeReportKind(options.kind);
    const includeProfile = options.includeProfile !== false;
    const aggregates = this.deps.aggregationService.buildAll(nowTs);
    const exchanges = this.deps.adapterHealthService.list(nowTs);
    const portfolio = this.deps.portfolioPnlService.build(user);
    const watchlist = this.deps.watchlistService.list(user.id);
    const alerts = this.deps.priceAlertService.listByUser(user.id);
    const webhooks = this.deps.webhookSubscriptionService.listByUser(user.id);
    const activeExchanges = new Set(aggregates.flatMap((item) => item.exchanges)).size;
    const spreads = aggregates
      .map((item) => Math.abs(Number(item.spread)))
      .filter((value) => Number.isFinite(value));
    const qualityCounts = aggregates.reduce<Record<AggregateQuality, number>>(
      (acc, item) => {
        acc[item.quality] += 1;
        return acc;
      },
      { high: 0, medium: 0, low: 0 }
    );

    const topSymbols = [...aggregates]
      .sort((a, b) => Number(b.midPrice ?? 0) - Number(a.midPrice ?? 0))
      .slice(0, 10)
      .map((item) => ({
        symbol: item.symbol,
        priceUsd: roundMoney(item.midPrice),
        spreadUsd: roundMoney(item.spread),
        quality: item.quality,
        activeSources: item.activeSources,
        staleSources: item.staleSources,
        updatedAt: item.updatedAt ? new Date(item.updatedAt).toISOString() : null
      }));

    const report: UserAnalyticsReport = {
      generatedAt: new Date(nowTs).toISOString(),
      kind,
      includeProfile,
      account: {
        userId: user.id,
        email: user.email,
        displayName: user.displayName,
        createdAt: user.createdAt,
        isOwner: user.isOwner,
        wallet: user.wallet
      },
      market: {
        symbolsTracked: aggregates.length,
        activeExchanges,
        averageSpreadUsd: spreads.length ? roundMoney(spreads.reduce((acc, value) => acc + value, 0) / spreads.length) : null,
        qualityCounts,
        topSymbols
      },
      portfolio,
      watchlist,
      alerts,
      webhooks,
      exchanges,
      sections: [],
      recommendations: [],
      score: this.computeScore({ portfolio, watchlist, alerts, webhooks, exchanges, symbolsTracked: aggregates.length })
    };

    report.sections = this.buildSections(report);
    report.recommendations = this.buildRecommendations(report);
    return report;
  }


  private getReportFileStamp(report: UserAnalyticsReport): string {
    return new Date(report.generatedAt).toISOString().replace(/[:.]/g, "-");
  }

  private resolvePdfFontPath(): string | null {
    const candidates = [
      process.env.REPORT_PDF_FONT_PATH,
      "C:\\Windows\\Fonts\\arial.ttf",
      "C:\\Windows\\Fonts\\segoeui.ttf",
      "C:\\Windows\\Fonts\\tahoma.ttf",
      "/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf",
      "/usr/share/fonts/truetype/liberation2/LiberationSans-Regular.ttf"
    ].filter((value): value is string => Boolean(value));

    for (const candidate of candidates) {
      try {
        if (fs.existsSync(candidate) && fs.statSync(candidate).isFile()) {
          return candidate;
        }
      } catch {
        // Try the next font path. A missing font must not break report generation.
      }
    }

    return null;
  }

  private encodePdfUtf16Hex(value: string): string {
    let hex = "FEFF";

    for (let i = 0; i < value.length; i += 1) {
      hex += value.charCodeAt(i).toString(16).padStart(4, "0").toUpperCase();
    }

    return "<" + hex + ">";
  }

  private wrapPdfLine(line: string, maxChars = 92): string[] {
    const value = String(line || "").replace(/\s+/g, " ").trim();

    if (!value) {
      return [""];
    }

    const rows: string[] = [];
    const words = value.split(" ");
    let current = "";

    for (const word of words) {
      const next = current ? current + " " + word : word;

      if (next.length > maxChars && current) {
        rows.push(current);
        current = word;
      } else {
        current = next;
      }
    }

    if (current) {
      rows.push(current);
    }

    return rows;
  }

  private localizeSection(
    report: UserAnalyticsReport,
    section: ReportSectionSummary,
    copy: ReportRenderCopy
  ): ReportSectionSummary {
    const translated = copy.sectionCopy[section.key] ?? { title: section.title, summary: section.summary };

    return {
      key: section.key,
      title: translated.title,
      summary: translated.summary,
      items: this.buildLocalizedSectionItems(report, section.key, copy, section.items)
    };
  }

  private buildLocalizedSectionItems(
    report: UserAnalyticsReport,
    key: string,
    copy: ReportRenderCopy,
    fallback: string[]
  ): string[] {
    if (key === "profile") {
      return [
        copy.user + ": " + report.account.displayName + " <" + report.account.email + ">",
        copy.wallet + ": " + formatNumber(report.account.wallet.usd, " USD") + ", " + formatNumber(report.account.wallet.btc, " BTC") + ", " + formatNumber(report.account.wallet.eth, " ETH"),
        copy.ownerAccess + ": " + (report.account.isOwner ? copy.enabled : copy.disabled)
      ];
    }

    if (key === "portfolio") {
      return [
        copy.openPositions + ": " + report.portfolio.summary.trackedPositions,
        copy.invested + ": " + formatNumber(report.portfolio.summary.investedUsd, " USD"),
        copy.currentValue + ": " + formatNumber(report.portfolio.summary.currentValueUsd, " USD"),
        copy.unrealizedPnl + ": " + formatNumber(report.portfolio.summary.unrealizedPnlUsd, " USD")
      ];
    }

    if (key === "market") {
      return [
        copy.trackedSymbols + ": " + report.market.symbolsTracked,
        copy.activeExchanges + ": " + report.market.activeExchanges,
        copy.averageSpread + ": " + formatNumber(report.market.averageSpreadUsd, " USD"),
        copy.qualityHighMediumLow + ": " + report.market.qualityCounts.high + "/" + report.market.qualityCounts.medium + "/" + report.market.qualityCounts.low
      ];
    }

    if (key === "automation") {
      return [
        copy.alerts + ": " + report.alerts.length,
        copy.webhookSubscriptions + ": " + report.webhooks.length,
        copy.watchlist + ": " + report.watchlist.length
      ];
    }

    if (key === "summary") {
      return [copy.qualityScore + ": " + report.score.value + "/100", copy.trackedSymbols + ": " + report.market.symbolsTracked];
    }

    return fallback;
  }

  private localizeRecommendation(value: string, copy: ReportRenderCopy): string {
    if (value.includes("watchlist")) return copy.recommendationsCopy.watchlist;
    if (value.includes("P&L")) return copy.recommendationsCopy.portfolio;
    if (value.includes("price alert")) return copy.recommendationsCopy.alerts;
    if (value.includes("webhook")) return copy.recommendationsCopy.webhooks;
    if (value.includes("degraded") || value.includes("offline")) return copy.recommendationsCopy.exchanges;
    if (value.includes("Configuration looks healthy")) return copy.recommendationsCopy.healthy;
    return value;
  }

  private buildPdfLines(report: UserAnalyticsReport, language: ReportLanguage): string[] {
    const copy = getReportCopy(language);
    const localizedSections = report.sections.map((section) => this.localizeSection(report, section, copy));
    const localizedRecommendations = report.recommendations.map((item) => this.localizeRecommendation(item, copy));
    const lines: string[] = [
      copy.documentTitle,
      copy.generated + ": " + formatDate(report.generatedAt),
      copy.reportType + ": " + copy.kind[report.kind],
      "",
      copy.qualityScore + ": " + report.score.value + "/100 (" + report.score.label + ")",
      copy.user + ": " + report.account.displayName + " <" + report.account.email + ">",
      copy.wallet + ": " + formatNumber(report.account.wallet.usd, " USD") + ", " + formatNumber(report.account.wallet.btc, " BTC") + ", " + formatNumber(report.account.wallet.eth, " ETH"),
      copy.openPositions + ": " + report.portfolio.summary.trackedPositions,
      copy.unrealizedPnl + ": " + formatNumber(report.portfolio.summary.unrealizedPnlUsd, " USD"),
      copy.alerts + ": " + report.alerts.length,
      copy.webhooks + ": " + report.webhooks.length,
      copy.watchlist + ": " + report.watchlist.join(", "),
      ""
    ];

    lines.push(copy.sections);
    for (const section of localizedSections) {
      lines.push("- " + section.title);
      lines.push("  " + section.summary);
      for (const item of section.items) {
        lines.push("  * " + item);
      }
    }

    lines.push("", copy.recommendations);
    for (const item of localizedRecommendations.length ? localizedRecommendations : [copy.noData]) {
      lines.push("- " + item);
    }

    lines.push("", copy.topMarketSymbols);
    for (const item of report.market.topSymbols.slice(0, 12)) {
      lines.push("- " + item.symbol + " | " + copy.price + " " + formatNumber(item.priceUsd, " USD") + " | " + copy.spread + " " + formatNumber(item.spreadUsd, " USD") + " | " + copy.quality + " " + item.quality + " | " + copy.activeSources + " " + item.activeSources);
    }

    lines.push("", copy.portfolioPositions);
    if (report.portfolio.positions.length) {
      for (const item of report.portfolio.positions) {
        lines.push("- " + item.symbol + " | " + copy.amount + " " + formatNumber(item.amount, " " + item.assetCode) + " | " + copy.invested + " " + formatNumber(item.investedUsd, " USD") + " | " + copy.currentValue + " " + formatNumber(item.currentValueUsd, " USD") + " | " + copy.unrealizedPnl + " " + formatNumber(item.unrealizedPnlUsd, " USD"));
      }
    } else {
      lines.push("- " + copy.noData);
    }

    lines.push("", copy.exchangeHealth);
    for (const item of report.exchanges.slice(0, 16)) {
      lines.push("- " + item.exchange + " | " + item.status + " | " + item.qualityScore + "/100 | " + formatNumber(item.averageLatencyMs, " ms") + " | " + copy.errors + " " + item.errorCount);
    }

    lines.push("", copy.priceAlerts);
    if (report.alerts.length) {
      for (const item of report.alerts) {
        lines.push("- " + item.symbol + " | " + item.direction + " | " + formatNumber(item.targetPrice, " USD") + " | " + item.channels.join(", "));
      }
    } else {
      lines.push("- " + copy.noData);
    }

    lines.push("", copy.webhookSubscriptions);
    if (report.webhooks.length) {
      for (const item of report.webhooks) {
        lines.push("- " + item.url + " | " + item.symbol + " | " + item.direction + " | " + formatNumber(item.targetPrice, " USD"));
      }
    } else {
      lines.push("- " + copy.noData);
    }

    return lines;
  }

  private renderPdfReport(report: UserAnalyticsReport, language: ReportLanguage): Promise<Buffer> {
    const copy = getReportCopy(language);
    const localizedSections = report.sections.map((section) => this.localizeSection(report, section, copy));
    const localizedRecommendations = report.recommendations.map((item) => this.localizeRecommendation(item, copy));

    return new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    const doc = new PDFDocument({
      size: "A4",
      margin: 42,
      bufferPages: false,
      info: {
        Title: copy.documentTitle,
        Author: "CryptoAggregator",
        Subject: copy.emailSubject
      }
    });
    const fontPath = this.resolvePdfFontPath();
    const fontName = fontPath ? "ReportRegular" : "Helvetica";
    const marginX = 42;
    const contentWidth = doc.page.width - marginX * 2;
    const pageBottom = doc.page.height - 52;
    const colors = {
      ink: "#0f172a",
      muted: "#475569",
      accent: "#2563eb",
      accentSoft: "#dbeafe",
      card: "#f8fafc",
      border: "#bfdbfe",
      header: "#10244a",
      success: "#059669"
    };

    doc.on("data", (chunk: Buffer | Uint8Array) => {
      chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
    });
    doc.on("error", reject);
    doc.on("end", () => resolve(Buffer.concat(chunks)));

    if (fontPath) {
      doc.registerFont(fontName, fontPath);
    }

    const useRegularFont = (): PDFKit.PDFDocument => doc.font(fontName);
    const ensureSpace = (height: number): void => {
      if (doc.y + height > pageBottom) {
        doc.addPage();
        useRegularFont();
      }
    };
    const drawText = (text: string, size: number, color = colors.ink, options: PDFKit.Mixins.TextOptions = {}): PDFKit.PDFDocument => {
      doc.x = marginX;
      return useRegularFont()
        .fontSize(size)
        .fillColor(color)
        .text(text, marginX, doc.y, { width: contentWidth, continued: false, ...options });
    };
    const addDivider = (): void => {
      doc.moveDown(0.45);
      doc.strokeColor(colors.border).lineWidth(0.8).moveTo(marginX, doc.y).lineTo(marginX + contentWidth, doc.y).stroke();
      doc.moveDown(0.65);
    };
    const addMetricGrid = (metrics: Array<[string, string]>): void => {
      const columns = 3;
      const gap = 10;
      const cardHeight = 58;
      const cardWidth = (contentWidth - gap * (columns - 1)) / columns;

      for (let i = 0; i < metrics.length; i += columns) {
        ensureSpace(cardHeight + 12);
        const row = metrics.slice(i, i + columns);
        const y = doc.y;

        row.forEach(([label, value], index) => {
          const x = marginX + index * (cardWidth + gap);
          doc.roundedRect(x, y, cardWidth, cardHeight, 8).fillAndStroke(colors.card, colors.border);
          useRegularFont().fontSize(8).fillColor(colors.muted).text(label, x + 10, y + 9, { width: cardWidth - 20 });
          useRegularFont().fontSize(13).fillColor(colors.ink).text(value, x + 10, y + 27, { width: cardWidth - 20, lineBreak: false });
        });

        doc.y = y + cardHeight + 12;
        doc.x = marginX;
      }
    };
    const addSection = (title: string, summary: string, items: string[] = []): void => {
      ensureSpace(92);
      doc.x = marginX;
      doc.roundedRect(marginX, doc.y, contentWidth, 1, 0).fill(colors.accentSoft);
      doc.moveDown(0.75);
      drawText(title, 15, colors.ink);
      if (summary) {
        drawText(summary, 9, colors.muted, { width: contentWidth });
      }
      doc.moveDown(0.35);

      for (const item of items) {
        ensureSpace(24);
        drawText("- " + item, 9, colors.ink, { width: contentWidth - 14, indent: 10, continued: false });
      }

      doc.moveDown(0.75);
    };

    if (fontPath) {
      useRegularFont();
    }

    doc.rect(0, 0, doc.page.width, 98).fill(colors.header);
    useRegularFont().fontSize(22).fillColor("#ffffff").text(copy.documentTitle, marginX, 28, { width: contentWidth });
    useRegularFont()
      .fontSize(9)
      .fillColor("#bfdbfe")
      .text(copy.generated + ": " + formatDate(report.generatedAt) + "   " + copy.reportType + ": " + copy.kind[report.kind], marginX, 62, { width: contentWidth });
    doc.y = 120;

    addMetricGrid([
      [copy.qualityScore, report.score.value + "/100 (" + report.score.label + ")"],
      [copy.wallet, formatNumber(report.account.wallet.usd, " USD")],
      [copy.openPositions, String(report.portfolio.summary.trackedPositions)],
      [copy.unrealizedPnl, formatNumber(report.portfolio.summary.unrealizedPnlUsd, " USD")],
      [copy.alerts, String(report.alerts.length)],
      [copy.webhooks, String(report.webhooks.length)],
      [copy.watchlist, report.watchlist.length ? report.watchlist.join(", ") : copy.noData],
      [copy.activeExchanges, String(report.market.activeExchanges)],
      [copy.trackedSymbols, String(report.market.symbolsTracked)]
    ]);

    addDivider();
    addSection(copy.sections, copy.forwardedNote, localizedSections.flatMap((section) => [
      section.title + ": " + section.summary,
      ...section.items
    ]));
    addSection(copy.recommendations, "", localizedRecommendations.length ? localizedRecommendations : [copy.noData]);
    addSection(
      copy.topMarketSymbols,
      copy.sectionCopy.market.summary,
      report.market.topSymbols.slice(0, 12).map((item) =>
        item.symbol +
        " | " +
        copy.price +
        ": " +
        formatNumber(item.priceUsd, " USD") +
        " | " +
        copy.spread +
        ": " +
        formatNumber(item.spreadUsd, " USD") +
        " | " +
        copy.quality +
        ": " +
        item.quality +
        " | " +
        copy.activeSources +
        ": " +
        item.activeSources
      )
    );
    addSection(
      copy.portfolioPositions,
      copy.sectionCopy.portfolio.summary,
      report.portfolio.positions.length
        ? report.portfolio.positions.map((item) =>
            item.symbol +
            " | " +
            copy.amount +
            ": " +
            formatNumber(item.amount, " " + item.assetCode) +
            " | " +
            copy.invested +
            ": " +
            formatNumber(item.investedUsd, " USD") +
            " | " +
            copy.currentValue +
            ": " +
            formatNumber(item.currentValueUsd, " USD") +
            " | " +
            copy.unrealizedPnl +
            ": " +
            formatNumber(item.unrealizedPnlUsd, " USD")
          )
        : [copy.noData]
    );
    addSection(
      copy.exchangeHealth,
      copy.sectionCopy.market.summary,
      report.exchanges.slice(0, 16).map((item) =>
        item.exchange +
        " | " +
        item.status +
        " | " +
        item.qualityScore +
        "/100 | " +
        formatNumber(item.averageLatencyMs, " ms") +
        " | " +
        copy.errors +
        ": " +
        item.errorCount
      )
    );
    addSection(
      copy.priceAlerts,
      copy.sectionCopy.automation.summary,
      report.alerts.length
        ? report.alerts.map((item) => item.symbol + " | " + item.direction + " | " + formatNumber(item.targetPrice, " USD") + " | " + item.channels.join(", "))
        : [copy.noData]
    );
    addSection(
      copy.webhookSubscriptions,
      copy.sectionCopy.automation.summary,
      report.webhooks.length
        ? report.webhooks.map((item) => item.url + " | " + item.symbol + " | " + item.direction + " | " + formatNumber(item.targetPrice, " USD"))
        : [copy.noData]
    );

    doc.moveDown(0.5);
    drawText("CryptoAggregator - " + copy.emailSubject, 8, colors.muted, { align: "center", width: contentWidth });
    doc.end();
    });
  }

  public async sendUserReportEmail(
    user: AuthPublicUser,
    report = this.buildUserReport(user),
    recipientEmail: string | string[] = user.email,
    language: ReportLanguage = "uk"
  ): Promise<void> {
    const copy = getReportCopy(language);
    const recipient = Array.isArray(recipientEmail)
      ? recipientEmail.map((item) => String(item || "").trim().toLowerCase()).filter(Boolean).join(", ")
      : String(recipientEmail || user.email).trim().toLowerCase();

    const pdfAttachment = await this.renderPdfReport(report, language);

    await sendSystemEmail({
      to: recipient,
      subject: copy.emailSubject + ": " + formatDate(report.generatedAt),
      text: this.renderTextReport(report, language),
      html: this.renderHtmlReport(report, language),
      attachments: [
        {
          filename: "cryptoaggregator-report-" + this.getReportFileStamp(report) + ".pdf",
          content: pdfAttachment,
          contentType: "application/pdf"
        }
      ]
    });
  }

  private buildSections(report: UserAnalyticsReport): ReportSectionSummary[] {
    const sections: ReportSectionSummary[] = [];
    const wants = (kind: ReportKind): boolean => report.kind === "full" || report.kind === kind;

    if (report.includeProfile && (wants("profile") || report.kind === "full")) {
      sections.push({
        key: "profile",
        title: "Client profile",
        summary: "Identity, wallet, owner status and account readiness snapshot.",
        items: [
          "User: " + report.account.displayName + " <" + report.account.email + ">",
          "Wallet: " + formatNumber(report.account.wallet.usd, " USD") + ", " + formatNumber(report.account.wallet.btc, " BTC") + ", " + formatNumber(report.account.wallet.eth, " ETH"),
          "Owner access: " + (report.account.isOwner ? "enabled" : "disabled")
        ]
      });
    }

    if (wants("portfolio")) {
      sections.push({
        key: "portfolio",
        title: "Portfolio and P&L",
        summary: "Current investment exposure, portfolio value, realized and unrealized performance.",
        items: [
          "Open positions: " + report.portfolio.summary.trackedPositions,
          "Invested: " + formatNumber(report.portfolio.summary.investedUsd, " USD"),
          "Current value: " + formatNumber(report.portfolio.summary.currentValueUsd, " USD"),
          "Unrealized P&L: " + formatNumber(report.portfolio.summary.unrealizedPnlUsd, " USD")
        ]
      });
    }

    if (wants("market")) {
      sections.push({
        key: "market",
        title: "Market quality",
        summary: "Coverage, exchange availability, spread quality and stale-source monitoring.",
        items: [
          "Tracked symbols: " + report.market.symbolsTracked,
          "Active exchanges: " + report.market.activeExchanges,
          "Average spread: " + formatNumber(report.market.averageSpreadUsd, " USD"),
          "Quality high/medium/low: " + report.market.qualityCounts.high + "/" + report.market.qualityCounts.medium + "/" + report.market.qualityCounts.low
        ]
      });
    }

    if (wants("security")) {
      sections.push({
        key: "automation",
        title: "Alerts and webhooks",
        summary: "Automation readiness for price triggers, email notifications and bot integrations.",
        items: [
          "Alerts configured: " + report.alerts.length,
          "Webhook subscriptions: " + report.webhooks.length,
          "Watchlist symbols: " + report.watchlist.length
        ]
      });
    }

    return sections.length ? sections : [
      {
        key: "summary",
        title: "Account summary",
        summary: "Compact overview of account, market coverage and automation readiness.",
        items: ["Quality score: " + report.score.value + "/100", "Tracked symbols: " + report.market.symbolsTracked]
      }
    ];
  }

  private buildRecommendations(report: UserAnalyticsReport): string[] {
    const recommendations: string[] = [];
    const offlineOrDegraded = report.exchanges.filter((item) => item.status !== "online").length;

    if (report.watchlist.length === 0) {
      recommendations.push("Add key symbols to the watchlist so WebSocket auto-subscription is personalized.");
    }

    if (report.portfolio.summary.trackedPositions === 0) {
      recommendations.push("Open a small test position to unlock portfolio P&L analytics.");
    }

    if (report.alerts.length === 0) {
      recommendations.push("Create at least one price alert to show real-time notification logic.");
    }

    if (report.webhooks.length === 0) {
      recommendations.push("Register a webhook URL to demonstrate bot-ready trigger delivery.");
    }

    if (offlineOrDegraded > 0) {
      recommendations.push("Review degraded/offline exchange adapters before relying on source quality.");
    }

    return recommendations.length ? recommendations.slice(0, 6) : ["Configuration looks healthy. Keep monitoring stale ticks and exchange latency."];
  }

  private computeScore(input: {
    portfolio: ReturnType<PortfolioPnlService["build"]>;
    watchlist: string[];
    alerts: ReturnType<PriceAlertService["listByUser"]>;
    webhooks: ReturnType<WebhookSubscriptionService["listByUser"]>;
    exchanges: ExchangeHealthSnapshot[];
    symbolsTracked: number;
  }): UserAnalyticsReport["score"] {
    const reasons: string[] = [];
    let score = 20;

    if (input.symbolsTracked >= 10) {
      score += 15;
      reasons.push("Market coverage is active");
    }

    const onlineExchanges = input.exchanges.filter((item) => item.status === "online").length;
    if (onlineExchanges >= 5) {
      score += 18;
      reasons.push("Multiple exchanges are online");
    }

    if (input.watchlist.length > 0) {
      score += 12;
      reasons.push("Watchlist is configured");
    }

    if (input.portfolio.summary.trackedPositions > 0) {
      score += 20;
      reasons.push("Portfolio contains open positions");
    }

    if (input.alerts.length > 0) {
      score += 8;
      reasons.push("Price alerts are configured");
    }

    if (input.webhooks.length > 0) {
      score += 7;
      reasons.push("Webhook automation is configured");
    }

    const bounded = Math.max(0, Math.min(100, Math.round(score)));
    return {
      value: bounded,
      label: bounded >= 75 ? "advanced" : bounded >= 45 ? "active" : "starter",
      reasons: reasons.length ? reasons : ["Account is ready for first setup"]
    };
  }

  private renderTextReport(report: UserAnalyticsReport, language: ReportLanguage): string {
    const copy = getReportCopy(language);
    const localizedSections = report.sections.map((section) => this.localizeSection(report, section, copy));
    const sectionLines = localizedSections.flatMap((section) => [
      section.title,
      section.summary,
      ...section.items.map((item) => "- " + item),
      ""
    ]);
    const recommendations = report.recommendations.map((item) => this.localizeRecommendation(item, copy));

    const lines = [
      copy.documentTitle,
      copy.generated + ": " + formatDate(report.generatedAt),
      copy.reportType + ": " + copy.kind[report.kind],
      "",
      copy.qualityScore + ": " + report.score.value + "/100 (" + report.score.label + ")",
      copy.user + ": " + report.account.displayName + " <" + report.account.email + ">",
      "",
      ...sectionLines,
      copy.recommendations + ":",
      ...recommendations.map((item) => "- " + item),
      "",
      copy.topMarketSymbols + ":",
      ...report.market.topSymbols.map(
        (item) => "- " + item.symbol + ": " + formatNumber(item.priceUsd, " USD") + ", " + copy.quality + " " + item.quality + ", " + copy.activeSources + " " + item.activeSources
      )
    ];

    return lines.join("\n");
  }

  private renderHtmlTable(
    title: string,
    headers: string[],
    rows: string[][],
    copy: ReportRenderCopy,
    theme: ReportTheme
  ): string {
    const palette = getReportHtmlPalette(theme);
    const body = rows.length
      ? rows
          .map((row) => "<tr>" + row.map((cell) => "<td>" + escapeHtml(cell) + "</td>").join("") + "</tr>")
          .join("")
      : '<tr><td colspan="' + headers.length + '">' + escapeHtml(copy.noData) + '</td></tr>';

    return [
      '<section style="margin-top:18px;padding:16px;border:1px solid ' + palette.border + ';border-radius:14px;background:' + palette.sectionBg + ';color:' + palette.text + '">',
      '<h2 style="margin:0 0 8px;color:' + palette.text + '">' + escapeHtml(title) + '</h2>',
      '<table style="width:100%;border-collapse:collapse;margin-top:12px">',
      '<thead><tr>' + headers.map((header) => '<th style="padding:9px;border-bottom:1px solid ' + palette.line + ';text-align:left;color:' + palette.header + '">' + escapeHtml(header) + '</th>').join("") + '</tr></thead>',
      '<tbody>' + body.replaceAll('<td>', '<td style="padding:9px;border-bottom:1px solid ' + palette.line + ';vertical-align:top;color:' + palette.text + '">') + '</tbody>',
      '</table></section>'
    ].join("");
  }

  private renderHtmlReport(report: UserAnalyticsReport, language: ReportLanguage, theme: ReportTheme = "dark"): string {
    const copy = getReportCopy(language);
    const palette = getReportHtmlPalette(theme);
    const metricCards = [
      [copy.qualityScore, report.score.value + "/100"],
      [copy.reportType, copy.kind[report.kind]],
      [copy.wallet, formatNumber(report.account.wallet.usd, " USD")],
      [copy.openPositions, String(report.portfolio.summary.trackedPositions)],
      [copy.alerts, String(report.alerts.length)],
      [copy.webhooks, String(report.webhooks.length)],
      [copy.watchlist, String(report.watchlist.length)],
      [copy.activeExchanges, String(report.market.activeExchanges)]
    ]
      .map(
        ([label, value]) =>
          '<div style="padding:14px;border-radius:14px;background:' + palette.sectionBg + ';border:1px solid ' + palette.line + ';color:' + palette.text + '"><b style="color:' + palette.text + '">' +
          escapeHtml(label) +
          '</b><br><span style="font-size:22px;color:' + palette.accent + '">' +
          escapeHtml(value) +
          '</span></div>'
      )
      .join("");

    const sections = report.sections
      .map((section) => this.localizeSection(report, section, copy))
      .map(
        (section) =>
          '<section style="margin-top:18px;padding:16px;border:1px solid ' + palette.border + ';border-radius:14px;background:' + palette.sectionBg + ';color:' + palette.text + '"><h2 style="margin:0 0 8px;color:' + palette.text + '">' +
          escapeHtml(section.title) +
          '</h2><p style="color:' + palette.muted + ';margin:0 0 10px">' +
          escapeHtml(section.summary) +
          '</p><ul style="color:' + palette.text + '">' +
          section.items.map((item) => '<li style="color:' + palette.text + '">' + escapeHtml(item) + '</li>').join("") +
          '</ul></section>'
      )
      .join("");

    const recommendations = (report.recommendations.length ? report.recommendations : [copy.noData])
      .map((item) => '<li style="color:' + palette.text + '">' + escapeHtml(this.localizeRecommendation(item, copy)) + '</li>')
      .join("");
    const topSymbols = this.renderHtmlTable(
      copy.topMarketSymbols,
      [copy.symbol, copy.price, copy.spread, copy.quality, copy.activeSources, copy.staleSources],
      report.market.topSymbols.map((item) => [
        item.symbol,
        formatNumber(item.priceUsd, " USD"),
        formatNumber(item.spreadUsd, " USD"),
        item.quality,
        String(item.activeSources),
        String(item.staleSources)
      ]),
      copy,
      theme
    );
    const portfolio = this.renderHtmlTable(
      copy.portfolioPositions,
      [copy.symbol, copy.amount, copy.invested, copy.currentValue, copy.unrealizedPnl, copy.entryPrice],
      report.portfolio.positions.map((item) => [
        item.symbol,
        formatNumber(item.amount, " " + item.assetCode),
        formatNumber(item.investedUsd, " USD"),
        formatNumber(item.currentValueUsd, " USD"),
        formatNumber(item.unrealizedPnlUsd, " USD"),
        formatNumber(item.averageBuyPriceUsd, " USD")
      ]),
      copy,
      theme
    );
    const exchangeHealth = this.renderHtmlTable(
      copy.exchangeHealth,
      [copy.exchange, copy.status, copy.quality, copy.lastSuccess, copy.avgLatency, copy.errors],
      report.exchanges.slice(0, 20).map((item) => [
        item.exchange,
        item.status,
        item.qualityScore + "/100",
        formatDate(item.lastSuccessAt),
        formatNumber(item.averageLatencyMs, " ms"),
        String(item.errorCount)
      ]),
      copy,
      theme
    );
    const alerts = this.renderHtmlTable(
      copy.priceAlerts,
      [copy.symbol, copy.condition, copy.target, copy.channels, copy.enabled, copy.lastTrigger],
      report.alerts.map((item) => [
        item.symbol,
        item.direction,
        formatNumber(item.targetPrice, " USD"),
        item.channels.join(", "),
        item.enabled ? copy.yes : copy.no,
        formatDate(item.lastTriggeredAt)
      ]),
      copy,
      theme
    );
    const webhooks = this.renderHtmlTable(
      copy.webhookSubscriptions,
      [copy.url, copy.symbol, copy.condition, copy.target, copy.enabled, copy.lastTrigger],
      report.webhooks.map((item) => [
        item.url,
        item.symbol,
        item.direction,
        formatNumber(item.targetPrice, " USD"),
        item.enabled ? copy.yes : copy.no,
        formatDate(item.lastTriggeredAt)
      ]),
      copy,
      theme
    );

    return [
      '<div style="font-family:Arial,Segoe UI,sans-serif;background:' + palette.pageBg + ';color:' + palette.text + ';padding:24px">',
      '<div style="max-width:1040px;margin:auto;background:' + palette.cardBg + ';border:1px solid ' + palette.border + ';border-radius:18px;padding:22px;box-shadow:' + palette.shadow + '">',
      '<h1 style="margin:0 0 8px;color:' + palette.text + '">' + escapeHtml(copy.documentTitle) + '</h1>',
      '<p style="margin:0 0 18px;color:' + palette.muted + '">' + escapeHtml(copy.generated) + ': ' + escapeHtml(formatDate(report.generatedAt)) + '</p>',
      '<div style="display:grid;gap:10px;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));margin-bottom:18px">' + metricCards + '</div>',
      sections,
      '<section style="margin-top:18px;padding:16px;border:1px solid ' + palette.border + ';border-radius:14px;background:' + palette.sectionBg + ';color:' + palette.text + '"><h2 style="margin:0 0 8px;color:' + palette.text + '">' + escapeHtml(copy.recommendations) + '</h2><ul style="color:' + palette.text + '">' + recommendations + '</ul></section>',
      topSymbols,
      portfolio,
      exchangeHealth,
      alerts,
      webhooks,
      '<p style="margin-top:22px;color:' + palette.muted + ';font-size:12px">' + escapeHtml(copy.forwardedNote) + '</p>',
      '</div></div>'
    ].join("");
  }

  private renderStandaloneReportHtml(
    report: UserAnalyticsReport,
    language: ReportLanguage,
    theme: ReportTheme
  ): string {
    const copy = getReportCopy(language);
    const ui = getPublicReportUiCopy(language);
    const palette = getReportHtmlPalette(theme);
    const dir = language === "ar" ? "rtl" : "ltr";
    const languageOptions = REPORT_LANGUAGES.map(
      (item) =>
        '<option value="' +
        escapeHtml(item) +
        '"' +
        (item === language ? " selected" : "") +
        ">" +
        escapeHtml(REPORT_LANGUAGE_LABELS[item]) +
        "</option>"
    ).join("");
    const themeOptions = REPORT_THEMES.map(
      (item) =>
        '<option value="' +
        escapeHtml(item) +
        '"' +
        (item === theme ? " selected" : "") +
        ">" +
        escapeHtml(item === "dark" ? ui.dark : ui.light) +
        "</option>"
    ).join("");

    return [
      "<!doctype html>",
      '<html lang="' + escapeHtml(language) + '" dir="' + dir + '" data-theme="' + theme + '">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width, initial-scale=1">',
      "<title>" + escapeHtml(copy.documentTitle) + "</title>",
      "<style>",
      ":root{color-scheme:" + (theme === "light" ? "light" : "dark") + "}",
      "body{margin:0;background:" + palette.pageBg + ";color:" + palette.text + ";font-family:Arial,Segoe UI,sans-serif}",
      ".reportTopbar{position:sticky;top:0;z-index:10;display:flex;align-items:center;justify-content:space-between;gap:12px;padding:12px 24px;background:" +
        palette.cardBg +
        ";border-bottom:1px solid " +
        palette.border +
        ";box-shadow:" +
        palette.shadow +
        "}",
      ".reportBrand{font-weight:800;color:" + palette.text + "}",
      ".reportControls{display:flex;flex-wrap:wrap;gap:10px;align-items:center}",
      ".reportControls label{display:flex;align-items:center;gap:8px;color:" + palette.muted + ";font-size:13px}",
      ".reportControls select{min-width:150px;border:1px solid " +
        palette.border +
        ";border-radius:10px;background:" +
        palette.subtleBg +
        ";color:" +
        palette.text +
        ";padding:9px 10px;font:inherit}",
      "a{color:" + palette.header + "}",
      "@media(max-width:720px){.reportTopbar{position:static;align-items:flex-start;flex-direction:column}.reportControls,.reportControls label,.reportControls select{width:100%}}",
      "</style>",
      "</head>",
      "<body>",
      '<header class="reportTopbar">',
      '<div class="reportBrand">CryptoAggregator</div>',
      '<div class="reportControls">',
      '<label>' + escapeHtml(ui.language) + '<select id="reportLanguageControl" autocomplete="off">' + languageOptions + "</select></label>",
      '<label>' + escapeHtml(ui.theme) + '<select id="reportThemeControl" autocomplete="off">' + themeOptions + "</select></label>",
      "</div>",
      "</header>",
      this.renderHtmlReport(report, language, theme),
      "<script>",
      "const lang=document.getElementById('reportLanguageControl');",
      "const theme=document.getElementById('reportThemeControl');",
      "const activeLang=" + JSON.stringify(language) + ";",
      "const activeTheme=" + JSON.stringify(theme) + ";",
      "lang.value=activeLang;theme.value=activeTheme;document.documentElement.setAttribute('lang',activeLang);document.documentElement.setAttribute('data-theme',activeTheme);",
      "function updateReportQuery(){const params=new URLSearchParams(location.search);params.set('lang',lang.value);params.set('theme',theme.value);location.href=location.pathname+'?'+params.toString()+location.hash;}",
      "lang.addEventListener('change',updateReportQuery);theme.addEventListener('change',updateReportQuery);",
      "</script>",
      "</body></html>"
    ].join("");
  }

  private renderOfficeReportHtml(report: UserAnalyticsReport, language: ReportLanguage): string {
    const copy = getReportCopy(language);

    return [
      "<!doctype html>",
      '<html lang="' + escapeHtml(language) + '" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">',
      "<head>",
      '<meta charset="utf-8">',
      '<meta http-equiv="Content-Type" content="text/html; charset=utf-8">',
      "<title>" + escapeHtml(copy.documentTitle) + "</title>",
      "<style>",
      "body{margin:0;background:#ffffff;color:#06142b;font-family:Arial,Segoe UI,sans-serif}",
      "h1,h2,h3,p,li,td,th,span,b,strong{color:#06142b}",
      "table{width:100%;border-collapse:collapse}th,td{padding:8px;border-bottom:1px solid #d9e6f8;text-align:left;vertical-align:top}",
      "th{color:#174d8f;font-weight:700}",
      "</style>",
      '<!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View><w:Zoom>100</w:Zoom><w:DoNotOptimizeForBrowser/></w:WordDocument></xml><![endif]-->',
      "</head>",
      "<body>",
      this.renderHtmlReport(report, language, "light"),
      "</body></html>"
    ].join("");
  }

}

