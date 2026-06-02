(() => {
  "use strict";

  const TEXT = {
    title: "Нестабільний інтернет",
    message: "Для оновлення даних потрібно перевірити з'єднання.",
    action: "Дія недоступна без стабільного з'єднання. Перевірте інтернет і спробуйте ще раз.",
    chart: "Графік не оновлюється в реальному часі. Перевірте з'єднання.",
    retry: "Перевірити ще раз",
    browserOffline: "Браузер повідомляє, що інтернет вимкнено.",
    fetchFailed: "Запити до сервера або бірж не проходять стабільно.",
    realtimeStale: "Потік цін давно не оновлювався.",
    exchangesOffline: "Біржі не відповідають або всі джерела недоступні.",
    security: "Для безпеки платіжні дані очищено під час нестабільного з'єднання."
  };

  const STALE_REALTIME_MS = 45000;
  const WS_GRACE_MS = 14000;
  const STATUS_POLL_MS = 15000;

  const ACTION_SELECTORS = [
    "#registerForm button[type='submit']",
    "#loginForm button[type='submit']",
    "#forgotRequestCodeBtn",
    "#forgotVerifyCodeBtn",
    "#forgotPasswordForm button[type='submit']",
    "#authActionBtn",
    "#guestUnlockBtn",
    "#adminBtn",
    "#adminRefreshBtn",
    "#openWalletTopupBtn",
    "#openWalletTopupBtnSecondary",
    "#walletTopupSubmitBtn",
    "#profileInvestBtn",
    "#profileForm button[type='submit']",
    "[data-topup-preset]",
    "#featureCandlesRefresh",
    "#featureArbitrageRefresh",
    "#featureWatchAdd",
    "#featurePnlRefresh",
    "#featureAlertCreate",
    "#featureWebhookCreate",
    "#featureAdminWsRefresh",
    "[data-alert-delete]",
    "[data-webhook-delete]",
    "[data-watch-remove]"
  ];

  const GUARDED_FORMS = [
    "#registerForm",
    "#loginForm",
    "#forgotPasswordForm",
    "#walletTopupForm",
    "#profileForm"
  ];

  const BLOCKED_API_PREFIXES = [
    "/api/v1/auth",
    "/api/v1/admin",
    "/api/v1/alerts",
    "/api/v1/webhooks",
    "/api/v1/watchlist",
    "/api/v1/portfolio",
    "/api/v1/candles",
    "/api/v1/arbitrage",
    "/api/v1/history",
    "/api/v1/markets",
    "/api/v1/aggregates",
    "/api/v1/fx"
  ];

  const guard = {
    forcedOffline: false,
    fetchFailures: 0,
    serverMarketOffline: false,
    lastAggregateAt: 0,
    lastApiSuccessAt: 0,
    socket: null,
    active: false,
    uiReady: false,
    rawFetch: window.fetch ? window.fetch.bind(window) : null
  };

  function S() {
    try {
      return typeof state !== "undefined" ? state : null;
    } catch {
      return null;
    }
  }

  function R() {
    try {
      return typeof refs !== "undefined" ? refs : {};
    } catch {
      return {};
    }
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function callGlobal(name, ...args) {
    try {
      if (typeof window[name] === "function") {
        window[name](...args);
        return true;
      }
    } catch {
      return false;
    }
    return false;
  }

  function normalizePath(input) {
    try {
      if (typeof input === "string") return new URL(input, window.location.href).pathname;
      if (input && typeof input.url === "string") return new URL(input.url, window.location.href).pathname;
    } catch {
      return "";
    }
    return "";
  }

  function isNetworkError(error) {
    const text = `${error?.name || ""} ${error?.message || ""}`.toLowerCase();
    return text.includes("network") || text.includes("failed to fetch") || text.includes("load failed") || text.includes("internet") || text.includes("offline");
  }

  function shouldBlockRequest(input) {
    const path = normalizePath(input);
    return BLOCKED_API_PREFIXES.some((prefix) => path === prefix || path.startsWith(`${prefix}/`) || path.startsWith(`${prefix}?`));
  }

  function updateAggregateFreshnessFromPayload(path, body) {
    if (path === "/api/v1/aggregates" && Array.isArray(body?.data) && body.data.length > 0) {
      guard.lastAggregateAt = Date.now();
    }

    if (path === "/api/v1/exchanges/status" && Array.isArray(body?.data)) {
      const rows = body.data;
      const onlineCount = rows.filter((item) => String(item?.status || "").toLowerCase() === "online").length;
      guard.serverMarketOffline = rows.length > 0 && onlineCount === 0;
    }
  }

  function computeOfflineLike() {
    const browserOffline = typeof navigator !== "undefined" && navigator.onLine === false;
    const realtimeStale = guard.lastAggregateAt > 0 && Date.now() - guard.lastAggregateAt > STALE_REALTIME_MS;
    const socket = S()?.ws;
    const wsStale = Boolean(socket && !socket.ok && guard.lastAggregateAt > 0 && Date.now() - guard.lastAggregateAt > WS_GRACE_MS);
    return Boolean(guard.forcedOffline || browserOffline || guard.fetchFailures >= 2 || guard.serverMarketOffline || realtimeStale || wsStale);
  }

  function getOfflineReason() {
    if (guard.forcedOffline || (typeof navigator !== "undefined" && navigator.onLine === false)) return TEXT.browserOffline;
    if (guard.serverMarketOffline) return TEXT.exchangesOffline;
    if (guard.lastAggregateAt > 0 && Date.now() - guard.lastAggregateAt > STALE_REALTIME_MS) return TEXT.realtimeStale;
    if (guard.fetchFailures >= 2) return TEXT.fetchFailed;
    return TEXT.message;
  }

  function ensureBanner() {
    if (byId("networkGuardBanner")) return;

    const banner = document.createElement("div");
    banner.id = "networkGuardBanner";
    banner.className = "networkGuardBanner";
    banner.setAttribute("role", "alert");
    banner.setAttribute("aria-live", "assertive");
    banner.innerHTML = `
      <div class="networkGuardIcon">!</div>
      <div class="networkGuardCopy">
        <strong>${TEXT.title}</strong>
        <span id="networkGuardMessage">${TEXT.message}</span>
        <small id="networkGuardReason"></small>
      </div>
      <button id="networkGuardRetry" class="ghostBtn" type="button">${TEXT.retry}</button>
    `;

    const anchor = byId("guestUnlockBanner") || document.querySelector(".topbar");
    if (anchor) {
      anchor.insertAdjacentElement("afterend", banner);
    } else {
      document.body.prepend(banner);
    }

    byId("networkGuardRetry")?.addEventListener("click", () => {
      guard.forcedOffline = false;
      guard.fetchFailures = 0;
      guard.serverMarketOffline = false;
      void pollExchangeStatus(true);
      applyNetworkState();
    });
  }

  function ensureChartNotice(canvasSelector, id) {
    const canvas = document.querySelector(canvasSelector);
    if (!canvas || byId(id)) return;

    const host = canvas.closest(".chartArea") || canvas.parentElement;
    if (!host) return;

    host.classList.add("networkGuardChartBox");
    const notice = document.createElement("div");
    notice.id = id;
    notice.className = "networkGuardChartNotice";
    notice.textContent = TEXT.chart;
    host.appendChild(notice);
  }

  function syncGridScrollFix() {
    document.querySelectorAll(".marketGrid, .exchangeGrid").forEach((grid) => {
      grid.classList.toggle("networkGuardStaticSidebar", Boolean(grid.querySelector(".featureFullSpan")));
    });
  }

  function protectSensitiveInputs() {
    const card = byId("topupCardNumber");
    const holder = byId("topupCardHolder");
    const expiry = byId("topupExpiry");
    const cvv = byId("topupCvv");

    if (card) {
      card.setAttribute("autocomplete", "cc-number");
      card.setAttribute("inputmode", "numeric");
      card.setAttribute("spellcheck", "false");
    }

    if (holder) {
      holder.setAttribute("autocomplete", "cc-name");
      holder.setAttribute("spellcheck", "false");
      holder.setAttribute("autocapitalize", "characters");
    }

    if (expiry) {
      expiry.setAttribute("autocomplete", "cc-exp");
      expiry.setAttribute("inputmode", "numeric");
    }

    if (cvv) {
      cvv.setAttribute("autocomplete", "cc-csc");
      cvv.setAttribute("inputmode", "numeric");
      cvv.setAttribute("maxlength", "3");
    }
  }

  function clearSensitivePaymentFields() {
    [byId("topupCardNumber"), byId("topupExpiry"), byId("topupCvv")].forEach((field) => {
      if (field) field.value = "";
    });

    if (!callGlobal("setWalletTopupStatus", TEXT.security, true)) {
      const status = byId("walletTopupStatus");
      if (status) {
        status.textContent = TEXT.security;
        status.style.color = "#ff6f78";
      }
    }
  }

  function ensureUi() {
    ensureBanner();
    ensureChartNotice("#marketChart", "networkGuardMarketChartNotice");
    ensureChartNotice("#sparkline", "networkGuardSparklineNotice");
    syncGridScrollFix();
    protectSensitiveInputs();
    guard.uiReady = true;
  }

  function setControlBlocked(control, blocked) {
    if (!control) return;

    if (blocked) {
      if (!control.disabled) {
        control.disabled = true;
        control.dataset.networkGuardDisabled = "true";
      }
      control.setAttribute("title", TEXT.action);
      return;
    }

    if (control.dataset.networkGuardDisabled === "true") {
      control.disabled = false;
      delete control.dataset.networkGuardDisabled;
      control.removeAttribute("title");
    }
  }

  function setProtectedControls(blocked) {
    const nodes = new Set();
    ACTION_SELECTORS.forEach((selector) => document.querySelectorAll(selector).forEach((node) => nodes.add(node)));
    nodes.forEach((node) => setControlBlocked(node, blocked));
  }

  function showBlockedStatus(target) {
    const form = target?.closest?.("form");

    if (form?.id === "registerForm" || form?.id === "loginForm" || form?.id === "forgotPasswordForm" || target?.closest?.("#authModal")) {
      if (callGlobal("setAuthStatus", TEXT.action, true)) return;
      const status = byId("authStatus");
      if (status) status.textContent = TEXT.action;
      return;
    }

    if (form?.id === "walletTopupForm" || target?.closest?.("#walletTopupModal")) {
      if (callGlobal("setWalletTopupStatus", TEXT.action, true)) return;
      const status = byId("walletTopupStatus");
      if (status) status.textContent = TEXT.action;
      return;
    }

    if (target?.closest?.("#profileModal")) {
      if (callGlobal("setProfileStatus", TEXT.action, true)) return;
      const status = byId("profileStatus");
      if (status) status.textContent = TEXT.action;
      return;
    }

    if (target?.closest?.("#adminModal")) {
      const status = byId("adminStatus");
      if (status) status.textContent = TEXT.action;
    }
  }

  function applyNetworkState() {
    ensureUi();
    const offlineLike = computeOfflineLike();
    const changed = guard.active !== offlineLike;
    guard.active = offlineLike;

    document.body.classList.toggle("network-offline", offlineLike);
    document.documentElement.dataset.networkGuardState = offlineLike ? "offline" : "online";
    setProtectedControls(offlineLike);

    const banner = byId("networkGuardBanner");
    if (banner) {
      banner.hidden = !offlineLike;
      const reason = byId("networkGuardReason");
      if (reason) reason.textContent = offlineLike ? getOfflineReason() : "";
    }

    const badge = R().wsBadge || byId("wsBadge");
    if (offlineLike && badge) {
      badge.textContent = "WS: нестабільне з'єднання";
      badge.classList.add("warn");
    }

    if (offlineLike && changed) {
      clearSensitivePaymentFields();
    }
  }

  function attachSocket() {
    const socket = S()?.ws?.socket;
    if (!socket || socket === guard.socket) return;
    guard.socket = socket;

    socket.addEventListener("open", () => {
      guard.fetchFailures = 0;
      applyNetworkState();
    });

    socket.addEventListener("message", (event) => {
      try {
        const msg = JSON.parse(event.data);
        if (msg?.type === "aggregate") {
          const browserOffline = typeof navigator !== "undefined" && navigator.onLine === false;

          if (!guard.forcedOffline && !browserOffline && !guard.serverMarketOffline) {
            guard.lastAggregateAt = Date.now();
            guard.fetchFailures = Math.max(0, guard.fetchFailures - 1);
          }

          applyNetworkState();
        }
      } catch {
        // ignore frames that are not JSON market updates
      }
    });

    socket.addEventListener("close", () => setTimeout(applyNetworkState, 250));
    socket.addEventListener("error", () => {
      guard.fetchFailures = Math.max(guard.fetchFailures, 1);
      applyNetworkState();
    });
  }

  function wrapFetch() {
    if (!guard.rawFetch || window.__networkGuardFetchWrapped) return;
    window.__networkGuardFetchWrapped = true;

    window.fetch = async (input, init) => {
      if (shouldBlockRequest(input) && computeOfflineLike()) {
        applyNetworkState();
        throw new TypeError(TEXT.action);
      }

      const path = normalizePath(input);

      try {
        const response = await guard.rawFetch(input, init);

        if (response.ok) {
          guard.lastApiSuccessAt = Date.now();
          guard.fetchFailures = Math.max(0, guard.fetchFailures - 1);

          if (path === "/api/v1/aggregates" || path === "/api/v1/exchanges/status") {
            response.clone().json().then((body) => {
              updateAggregateFreshnessFromPayload(path, body);
              applyNetworkState();
            }).catch(() => undefined);
          }
        } else if (response.status === 0 || response.status >= 502) {
          guard.fetchFailures += 1;
        }

        applyNetworkState();
        return response;
      } catch (error) {
        if (isNetworkError(error)) {
          guard.fetchFailures += 1;
          applyNetworkState();
        }
        throw error;
      }
    };
  }

  async function pollExchangeStatus(force = false) {
    if (!guard.rawFetch || (!force && computeOfflineLike() && guard.fetchFailures >= 2)) {
      applyNetworkState();
      return;
    }

    try {
      const response = await guard.rawFetch("/api/v1/exchanges/status", { cache: "no-store" });
      const body = await response.clone().json().catch(() => ({}));
      if (response.ok) {
        updateAggregateFreshnessFromPayload("/api/v1/exchanges/status", body);
        guard.fetchFailures = Math.max(0, guard.fetchFailures - 1);
      } else if (response.status >= 502) {
        guard.fetchFailures += 1;
      }
    } catch (error) {
      if (isNetworkError(error)) guard.fetchFailures += 1;
    }

    applyNetworkState();
  }

  function bindGuards() {
    document.addEventListener("click", (event) => {
      if (!computeOfflineLike()) return;
      const target = event.target instanceof Element ? event.target : null;
      if (!target) return;
      const blocked = target.closest(ACTION_SELECTORS.join(","));
      if (!blocked) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlockedStatus(target);
      applyNetworkState();
    }, true);

    document.addEventListener("submit", (event) => {
      if (!computeOfflineLike()) return;
      const form = event.target instanceof Element ? event.target : null;
      if (!form || !GUARDED_FORMS.some((selector) => form.matches(selector))) return;
      event.preventDefault();
      event.stopImmediatePropagation();
      showBlockedStatus(form);
      applyNetworkState();
    }, true);

    window.addEventListener("offline", () => {
      guard.forcedOffline = true;
      applyNetworkState();
    });

    window.addEventListener("online", () => {
      guard.forcedOffline = false;
      guard.fetchFailures = 0;
      void pollExchangeStatus(true);
      applyNetworkState();
    });

    document.addEventListener("visibilitychange", () => {
      if (document.hidden || computeOfflineLike()) {
        const cvv = byId("topupCvv");
        if (cvv) cvv.value = "";
      }
    });
  }

  function wrapRenderHooks() {
    const hooks = ["renderAll", "renderMarketTab", "renderExchangesTab", "showProfileModal", "showAdminModal"];
    hooks.forEach((name) => {
      const original = window[name];
      if (typeof original !== "function" || original.__networkGuardWrapped) return;
      const wrapped = function wrappedNetworkGuardHook(...args) {
        const result = original.apply(this, args);
        setTimeout(() => {
          syncGridScrollFix();
          ensureChartNotice("#marketChart", "networkGuardMarketChartNotice");
          ensureChartNotice("#sparkline", "networkGuardSparklineNotice");
          applyNetworkState();
        }, 0);
        return result;
      };
      wrapped.__networkGuardWrapped = true;
      window[name] = wrapped;
    });
  }

  function init() {
    ensureUi();
    wrapFetch();
    bindGuards();
    wrapRenderHooks();
    attachSocket();
    applyNetworkState();

    setInterval(() => {
      attachSocket();
      syncGridScrollFix();
      applyNetworkState();
    }, 3000);

    setInterval(() => void pollExchangeStatus(false), STATUS_POLL_MS);

    document.documentElement.dataset.networkGuardReady = "true";
    window.__networkGuard = {
      getState: () => ({
        active: guard.active,
        forcedOffline: guard.forcedOffline,
        fetchFailures: guard.fetchFailures,
        serverMarketOffline: guard.serverMarketOffline,
        lastAggregateAt: guard.lastAggregateAt
      }),
      forceOffline(value) {
        guard.forcedOffline = Boolean(value);
        applyNetworkState();
      }
    };
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init, { once: true });
  } else {
    init();
  }
})();
