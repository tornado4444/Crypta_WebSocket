(() => {
  "use strict";

  const fx = {
    scaffolded: false,
    bound: false,
    socket: null,
    watchlist: [],
    alerts: [],
    webhooks: [],
    pnl: null,
    adminWs: [],
    candles: { symbol: "", interval: "1m", rows: [], loadedAt: 0, loading: false },
    arbitrage: { symbol: "all", rows: [], loadedAt: 0, loading: false, profitableOnly: false },
    userLoadedAt: 0,
    adminLoadedAt: 0,
    liveRefreshAt: 0
  };

  const featureTextDefaults = {
    empty: "Поки немає даних.",
    loginNeeded: "Увійдіть в акаунт, щоб користуватися цією секцією.",
    saved: "Збережено",
    deleted: "Видалено",
    refresh: "Оновити",
    add: "Додати",
    remove: "Видалити",
    allSymbols: "Усі символи",
    invalidPrice: "Вкажіть коректну ціну більше 0.",
    invalidUrl: "Вкажіть коректний https:// URL.",
    candlesTitle: "Свічкова агрегація OHLCV",
    candlesHint: "Сервер формує 1m, 5m та 1h свічки з історії тікiв.",
    arbitrageTitle: "Арбітраж між біржами",
    arbitrageHint: "Різниця bid/ask між біржами для кожного символу.",
    profitableOnly: "Тільки прибуткові",
    buyOn: "Купити на",
    sellOn: "Продати на",
    spread: "Різниця",
    watchTitle: "Watchlist",
    watchHint: "Обрані символи автоматично підписуються у WebSocket.",
    pnlTitle: "P&L портфеля",
    pnlHint: "Реальний P&L за поточними цінами.",
    invested: "Вкладено",
    currentValue: "Поточна вартість",
    unrealized: "Нереалізований P&L",
    realized: "Реалізований P&L",
    positions: "Позиції",
    alertsTitle: "Alerts / сповіщення",
    alertsHint: "Юзер ставить ціновий alert, сервер пушить через WS або email.",
    above: "вище",
    below: "нижче",
    targetPrice: "Ціна тригера",
    createAlert: "Створити alert",
    webhookTitle: "Webhook підписки",
    webhookHint: "Сервер POST-ить на URL при ціновому тригері.",
    createWebhook: "Створити webhook",
    adminWsTitle: "Активні WS-з'єднання",
    adminWsHint: "Owner бачить live-підключення клієнтів.",
    ban: "Забанити",
    unban: "Розбанити",
    active: "Активний",
    banned: "Заблокований",
    self: "Це ви",
    alertToastTitle: "Ціновий alert",
    alertToastText: "спрацював за ціною"
  };

  const uk = new Proxy(featureTextDefaults, {
    get(target, prop) {
      if (typeof prop !== "string") return target[prop];
      const key = "features." + prop;
      if (typeof t === "function") {
        const translated = t(key);
        if (translated && translated !== key) return translated;
      }
      return target[prop];
    }
  });

  function S() {
    return typeof state !== "undefined" ? state : null;
  }

  function R() {
    return typeof refs !== "undefined" ? refs : {};
  }

  function byId(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => ({
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      "\"": "&quot;",
      "'": "&#039;"
    })[char]);
  }

  function headers(json = false) {
    const result = {};
    if (S()?.auth?.token) result.Authorization = `Bearer ${S().auth.token}`;
    if (json) result["Content-Type"] = "application/json";
    return result;
  }

  async function api(url, options = {}) {
    if (typeof fetchJson === "function") return fetchJson(url, options);
    const response = await fetch(url, options);
    const body = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(body.error || `HTTP ${response.status}`);
    return body;
  }

  function arr(payload) {
    if (Array.isArray(payload)) return payload;
    if (Array.isArray(payload?.data)) return payload.data;
    if (Array.isArray(payload?.items)) return payload.items;
    if (Array.isArray(payload?.connections)) return payload.connections;
    return [];
  }

  function rows() {
    if (typeof getAggregateRowsSorted === "function") return getAggregateRowsSorted();
    return Array.from(S()?.aggregatesBySymbol?.values?.() || []);
  }

  function selectedSymbol() {
    return S()?.selectedSymbol || rows()[0]?.symbol || "BTCUSDT";
  }

  function displayName(symbol) {
    return typeof getDisplayName === "function" ? getDisplayName(symbol) : symbol;
  }

  function pair(symbol) {
    return typeof formatSymbolPair === "function" ? formatSymbolPair(symbol) : String(symbol || "").replace(/USDT$/, "/USDT");
  }

  function money(value) {
    return typeof formatCurrency === "function" ? formatCurrency(Number(value) || 0) : `${(Number(value) || 0).toFixed(2)} USD`;
  }

  function crypto(value, code) {
    return typeof formatCryptoAmount === "function" ? formatCryptoAmount(Number(value) || 0, code || "UNIT") : `${(Number(value) || 0).toFixed(6)} ${code || "UNIT"}`;
  }

  function dateTime(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "-";
    return date.toLocaleString(typeof getLocale === "function" ? getLocale() : "uk-UA");
  }

  function timeOnly(value) {
    const date = value ? new Date(value) : null;
    if (!date || Number.isNaN(date.getTime())) return "-";
    return typeof formatClock === "function" ? formatClock(date.getTime()) : date.toLocaleTimeString();
  }

  function price(value) {
    const parsed = Number(String(value || "").replace(/\s/g, "").replace(",", "."));
    return Number.isFinite(parsed) && parsed > 0 ? parsed : 0;
  }

  function fillSymbols(select, withAll = false) {
    if (!select) return;
    const current = select.value;
    const symbols = Array.from(new Set((rows().length ? rows().map((row) => row.symbol) : [selectedSymbol()]).filter(Boolean)));
    select.innerHTML = `${withAll ? `<option value="all">${uk.allSymbols}</option>` : ""}${symbols
      .map((symbol) => `<option value="${esc(symbol)}">${esc(displayName(symbol))} · ${esc(pair(symbol))}</option>`)
      .join("")}`;
    if (current && Array.from(select.options).some((option) => option.value === current)) select.value = current;
    else select.value = withAll ? "all" : selectedSymbol();
  }

  function setText(selector, text) {
    const node = document.querySelector(selector);
    if (node) node.textContent = text;
  }

  function setHeads(selector, labels) {
    const heads = document.querySelectorAll(selector + " thead th");
    labels.forEach((label, index) => {
      if (heads[index]) heads[index].textContent = label;
    });
  }

  function setOptionText(selectId, value, text) {
    const option = byId(selectId)?.querySelector("option[value='" + value + "']");
    if (option) option.textContent = text;
  }

  function translateFeatureScaffold() {
    setText("#featureCandlesPanel .featureSectionHead h2", uk.candlesTitle);
    setText("#featureCandlesPanel .featureSectionHead p", uk.candlesHint);
    setText("#featureCandlesRefresh", uk.refresh);
    setHeads("#featureCandlesPanel", [uk.candleTime, uk.candleOpen, uk.candleHigh, uk.candleLow, uk.candleClose, uk.candleVolume, uk.candleTicks]);

    setText("#featureArbitragePanel .featureSectionHead h2", uk.arbitrageTitle);
    setText("#featureArbitragePanel .featureSectionHead p", uk.arbitrageHint);
    setText("#featureArbitrageRefresh", uk.refresh);
    const profitable = document.querySelector("#featureArbitragePanel .featureBooleanRow");
    if (profitable) {
      const input = profitable.querySelector("input");
      profitable.textContent = " " + uk.profitableOnly;
      if (input) profitable.prepend(input);
    }
    setHeads("#featureArbitragePanel", [uk.symbol, uk.buyOn, uk.sellOn, uk.spread, "%", uk.updated]);

    setText("#featureWatchlistSection h3", uk.watchTitle);
    setText("#featureWatchlistSection p", uk.watchHint);
    setText("#featureWatchAdd", uk.add);

    setText("#featurePnlSection h3", uk.pnlTitle);
    setText("#featurePnlSection p", uk.pnlHint);
    setText("#featurePnlRefresh", uk.refresh);

    setText("#featureAlertsSection h3", uk.alertsTitle);
    setText("#featureAlertsSection p", uk.alertsHint);
    setText("#featureAlertCreate", uk.createAlert);
    setText("#featureAlertsSection label:nth-of-type(1) span", uk.symbol);
    setText("#featureAlertsSection label:nth-of-type(2) span", uk.condition);
    setText("#featureAlertsSection label:nth-of-type(3) span", uk.targetPrice);
    setText("#featureAlertsSection .featureCheckRow > span", uk.channels);
    setOptionText("featureAlertDirection", "above", uk.above);
    setOptionText("featureAlertDirection", "below", uk.below);

    setText("#featureWebhooksSection h3", uk.webhookTitle);
    setText("#featureWebhooksSection p", uk.webhookHint);
    setText("#featureWebhookCreate", uk.createWebhook);
    setText("#featureWebhooksSection label:nth-of-type(1) span", uk.webhookUrl);
    setText("#featureWebhooksSection label:nth-of-type(2) span", uk.symbol);
    setText("#featureWebhooksSection label:nth-of-type(3) span", uk.condition);
    setText("#featureWebhooksSection label:nth-of-type(4) span", uk.targetPrice);
    setText("#featureWebhooksSection label:nth-of-type(5) span", uk.secretOptional);
    setOptionText("featureWebhookDirection", "above", uk.above);
    setOptionText("featureWebhookDirection", "below", uk.below);

    setText("#featureAdminWsSection h3", uk.adminWsTitle);
    setText("#featureAdminWsSection p", uk.adminWsHint);
    setText("#featureAdminWsRefresh", uk.refresh);
  }

  function ensureScaffold() {
    if (fx.scaffolded) return;

    const marketGrid = document.querySelector(".marketGrid");
    if (marketGrid && !byId("featureCandlesPanel")) {
      marketGrid.insertAdjacentHTML("beforeend", `
        <article id="featureCandlesPanel" class="panel featurePanel featureFullSpan" data-guest-lock="candles">
          <div class="featureSectionHead">
            <div><h2>${uk.candlesTitle}</h2><p class="muted">${uk.candlesHint}</p></div>
            <div class="featureToolbar">
              <select id="featureCandleSymbol" class="featureSelect"></select>
              <select id="featureCandleInterval" class="featureSelect"><option value="1m">1m</option><option value="5m">5m</option><option value="1h">1h</option></select>
              <button id="featureCandlesRefresh" type="button" class="featureMiniButton">${uk.refresh}</button>
            </div>
          </div>
          <div id="featureCandleMetrics" class="featureMiniMetricGrid"></div>
          <div class="featureTableWrap"><table class="featureTable"><thead><tr><th>Час</th><th>Open</th><th>High</th><th>Low</th><th>Close</th><th>Volume</th><th>Ticks</th></tr></thead><tbody id="featureCandlesBody"><tr><td colspan="7" class="loading">${uk.empty}</td></tr></tbody></table></div>
        </article>
      `);
    }

    const exchangeGrid = document.querySelector(".exchangeGrid");
    if (exchangeGrid && !byId("featureArbitragePanel")) {
      exchangeGrid.insertAdjacentHTML("beforeend", `
        <article id="featureArbitragePanel" class="panel featurePanel featureFullSpan" data-guest-lock="arbitrage">
          <div class="featureSectionHead">
            <div><h2>${uk.arbitrageTitle}</h2><p class="muted">${uk.arbitrageHint}</p></div>
            <div class="featureToolbar">
              <select id="featureArbitrageSymbol" class="featureSelect"></select>
              <label class="featureBooleanRow"><input id="featureArbitrageProfitableOnly" type="checkbox" /> ${uk.profitableOnly}</label>
              <button id="featureArbitrageRefresh" type="button" class="featureMiniButton">${uk.refresh}</button>
            </div>
          </div>
          <div class="featureTableWrap"><table class="featureTable"><thead><tr><th>Symbol</th><th>${uk.buyOn}</th><th>${uk.sellOn}</th><th>${uk.spread}</th><th>%</th><th>Updated</th></tr></thead><tbody id="featureArbitrageBody"><tr><td colspan="6" class="loading">${uk.empty}</td></tr></tbody></table></div>
        </article>
      `);
    }

    const sidebar = document.querySelector(".profileWorkspaceSidebar");
    if (sidebar && !byId("featureWatchlistSection")) {
      sidebar.insertAdjacentHTML("beforeend", `
        <section id="featureWatchlistSection" class="featureSection">
          <div class="featureSectionHead"><div><h3>${uk.watchTitle}</h3><p class="muted">${uk.watchHint}</p></div></div>
          <div class="featureToolbarRow"><select id="featureWatchSymbol" class="featureSelect"></select><button id="featureWatchAdd" type="button" class="featureMiniButton">${uk.add}</button></div>
          <div id="featureWatchlistList" class="featureChipList"></div><p id="featureWatchStatus" class="featureInlineStatus"></p>
        </section>
      `);
    }

    const main = document.querySelector(".profileWorkspaceMain");
    const firstProfileSection = main?.querySelector(".profileActionSection");
    if (main && firstProfileSection && !byId("featurePnlSection")) {
      firstProfileSection.insertAdjacentHTML("beforebegin", `
        <section id="featurePnlSection" class="featureSection">
          <div class="featureSectionHead"><div><h3>${uk.pnlTitle}</h3><p class="muted">${uk.pnlHint}</p></div><button id="featurePnlRefresh" type="button" class="featureMiniButton">${uk.refresh}</button></div>
          <div id="featurePnlMetrics" class="featureMiniMetricGrid"></div><div id="featurePnlPositions" class="featureList"></div>
        </section>
      `);
    }

    const historySection = document.querySelector(".profileHistorySection");
    if (historySection && !byId("featureAlertsSection")) {
      historySection.insertAdjacentHTML("afterend", `
        <section id="featureAlertsSection" class="featureSection">
          <div class="featureSectionHead"><div><h3>${uk.alertsTitle}</h3><p class="muted">${uk.alertsHint}</p></div></div>
          <div class="featureFormGrid">
            <label><span>Symbol</span><select id="featureAlertSymbol" class="featureSelect"></select></label>
            <label><span>Умова</span><select id="featureAlertDirection" class="featureSelect"><option value="above">${uk.above}</option><option value="below">${uk.below}</option></select></label>
            <label><span>${uk.targetPrice}</span><input id="featureAlertPrice" class="featureInput" type="text" inputmode="decimal" placeholder="70000" /></label>
            <div class="featureCheckRow"><span>Канали</span><label class="featureBooleanRow"><input id="featureAlertWs" type="checkbox" checked /> WS</label><label class="featureBooleanRow"><input id="featureAlertEmail" type="checkbox" /> Email</label><button id="featureAlertCreate" type="button" class="successBtn">${uk.createAlert}</button></div>
          </div>
          <p id="featureAlertStatus" class="featureInlineStatus"></p><div id="featureAlertsList" class="featureList"></div>
        </section>
      `);
    }

    const alerts = byId("featureAlertsSection");
    if (alerts && !byId("featureWebhooksSection")) {
      alerts.insertAdjacentHTML("afterend", `
        <section id="featureWebhooksSection" class="featureSection">
          <div class="featureSectionHead"><div><h3>${uk.webhookTitle}</h3><p class="muted">${uk.webhookHint}</p></div></div>
          <div class="featureFormGrid">
            <label class="featureFieldWide"><span>Webhook URL</span><input id="featureWebhookUrl" class="featureInput" type="url" placeholder="https://example.com/crypto-alert" /></label>
            <label><span>Symbol</span><select id="featureWebhookSymbol" class="featureSelect"></select></label>
            <label><span>Умова</span><select id="featureWebhookDirection" class="featureSelect"><option value="above">${uk.above}</option><option value="below">${uk.below}</option></select></label>
            <label><span>${uk.targetPrice}</span><input id="featureWebhookPrice" class="featureInput" type="text" inputmode="decimal" placeholder="70000" /></label>
            <label class="featureFieldWide"><span>Секрет (необов'язково)</span><input id="featureWebhookSecret" class="featureInput" type="text" /></label>
            <div class="featureActionRow"><button id="featureWebhookCreate" type="button" class="successBtn">${uk.createWebhook}</button></div>
          </div>
          <p id="featureWebhookStatus" class="featureInlineStatus"></p><div id="featureWebhooksList" class="featureList"></div>
        </section>
      `);
    }

    const adminWrap = document.querySelector(".adminUsersWrap");
    if (adminWrap && !byId("featureAdminWsSection")) {
      adminWrap.insertAdjacentHTML("afterend", `
        <section id="featureAdminWsSection" class="adminWsSection">
          <div class="featureSectionHead"><div><h3>${uk.adminWsTitle}</h3><p class="muted">${uk.adminWsHint}</p></div><button id="featureAdminWsRefresh" type="button" class="featureMiniButton">${uk.refresh}</button></div>
          <div id="featureAdminWsList" class="adminWsList featureList"></div>
        </section>
      `);
    }

    if (!byId("featureToastStack")) document.body.insertAdjacentHTML("beforeend", `<div id="featureToastStack" class="featureToastStack" aria-live="polite"></div>`);
    fx.scaffolded = true;
    bindEvents();
  }

  function syncUi() {
    ensureScaffold();
    translateFeatureScaffold();
    fillSymbols(byId("featureCandleSymbol"));
    fillSymbols(byId("featureArbitrageSymbol"), true);
    fillSymbols(byId("featureWatchSymbol"));
    fillSymbols(byId("featureAlertSymbol"));
    fillSymbols(byId("featureWebhookSymbol"));
    const swagger = byId("swaggerLink");
    if (swagger) swagger.classList.toggle("hidden", !S()?.auth?.user?.isOwner);
    patchLooseLabels();
    renderWatchlist();
    renderAlerts();
    renderWebhooks();
    renderPnl();
    renderAdminUsersBetter();
    renderAdminWs();
    attachSocket();
    void loadCandles(false);
    void loadArbitrage(false);
  }

  function patchLooseLabels() {
    const labels = {
      "table.quality": "table.quality",
      "history.viewerTitle": "history.viewerTitle",
      "admin.avatar": "admin.avatar",
      "admin.status": "admin.status",
      "admin.actions": "admin.actions"
    };
    Object.entries(labels).forEach(([key, valueKey]) => {
      document.querySelectorAll(`[data-i18n="${key}"]`).forEach((node) => {
        node.textContent = typeof t === "function" ? t(valueKey) : valueKey;
      });
    });
  }

  function bindEvents() {
    if (fx.bound) return;
    fx.bound = true;
    document.addEventListener("click", (event) => {
      const button = event.target.closest("button");
      if (!button) return;
      if (button.id === "featureCandlesRefresh") void loadCandles(true);
      if (button.id === "featureArbitrageRefresh") void loadArbitrage(true);
      if (button.id === "featurePnlRefresh") void loadPnl(true);
      if (button.id === "featureWatchAdd") void addWatch();
      if (button.id === "featureAlertCreate") void addAlert();
      if (button.id === "featureWebhookCreate") void addWebhook();
      if (button.id === "featureAdminWsRefresh") void loadAdminWs(true);
      if (button.dataset.watchRemove) void removeWatch(button.dataset.watchRemove);
      if (button.dataset.alertDelete) void removeAlert(button.dataset.alertDelete);
      if (button.dataset.webhookDelete) void removeWebhook(button.dataset.webhookDelete);
      if (button.dataset.adminBan) void setBan(button.dataset.adminBan, true);
      if (button.dataset.adminUnban) void setBan(button.dataset.adminUnban, false);
    });
    document.addEventListener("change", (event) => {
      if (event.target.id === "featureCandleSymbol" || event.target.id === "featureCandleInterval") void loadCandles(true);
      if (event.target.id === "featureArbitrageSymbol" || event.target.id === "featureArbitrageProfitableOnly") void loadArbitrage(true);
    });
  }

  async function loadCandles(force = false) {
    const symbol = byId("featureCandleSymbol")?.value || selectedSymbol();
    const interval = byId("featureCandleInterval")?.value || "1m";
    if (!force && (fx.candles.loading || (Date.now() - fx.candles.loadedAt < 8000 && fx.candles.symbol === symbol && fx.candles.interval === interval))) {
      renderCandles();
      return;
    }
    fx.candles = { ...fx.candles, symbol, interval, loading: true };
    renderCandles(true);
    try {
      const payload = await api(`/api/v1/candles/${encodeURIComponent(symbol)}?interval=${encodeURIComponent(interval)}&limit=40`);
      fx.candles.rows = Array.isArray(payload?.data?.data) ? payload.data.data : arr(payload);
      fx.candles.error = "";
      fx.candles.loadedAt = Date.now();
    } catch (error) {
      fx.candles.error = error.message;
    } finally {
      fx.candles.loading = false;
      renderCandles();
    }
  }

  function renderCandles(loading = false) {
    const body = byId("featureCandlesBody");
    const metrics = byId("featureCandleMetrics");
    if (!body || !metrics) return;
    if (loading) {
      body.innerHTML = `<tr><td colspan="7" class="loading">${esc(typeof t === "function" ? t("common.loading") : "Loading...")}</td></tr>`;
      return;
    }
    const list = fx.candles.rows || [];
    const last = list[list.length - 1];
    metrics.innerHTML = [
      [uk.candleOpen, last ? money(last.open) : "-"],
      [uk.candleHigh, last ? money(last.high) : "-"],
      [uk.candleLow, last ? money(last.low) : "-"],
      [uk.candleClose, last ? money(last.close) : "-"],
      [uk.candleTicks, last ? String(last.sampleCount || 0) : "-"]
    ].map(([label, value]) => `<article class="featureMiniMetricCard"><span>${label}</span><strong>${esc(value)}</strong></article>`).join("");
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="7" class="loading">${esc(fx.candles.error || uk.empty)}</td></tr>`;
      return;
    }
    body.innerHTML = list.slice(-20).reverse().map((row) => `
      <tr><td>${esc(dateTime(row.openTime || row.updatedAt))}</td><td>${esc(money(row.open))}</td><td>${esc(money(row.high))}</td><td>${esc(money(row.low))}</td><td>${esc(money(row.close))}</td><td>${esc(row.volume ?? "-")}</td><td>${esc(row.sampleCount ?? "-")}</td></tr>
    `).join("");
  }

  async function loadArbitrage(force = false) {
    const symbol = byId("featureArbitrageSymbol")?.value || "all";
    const profitableOnly = Boolean(byId("featureArbitrageProfitableOnly")?.checked);
    if (!force && (fx.arbitrage.loading || (Date.now() - fx.arbitrage.loadedAt < 8000 && fx.arbitrage.symbol === symbol && fx.arbitrage.profitableOnly === profitableOnly))) {
      renderArbitrage();
      return;
    }
    fx.arbitrage = { ...fx.arbitrage, symbol, profitableOnly, loading: true };
    renderArbitrage(true);
    try {
      const params = new URLSearchParams();
      if (symbol !== "all") params.set("symbol", symbol);
      if (profitableOnly) params.set("profitableOnly", "true");
      const payload = await api(`/api/v1/arbitrage${params.toString() ? `?${params}` : ""}`);
      fx.arbitrage.rows = arr(payload);
      fx.arbitrage.error = "";
      fx.arbitrage.loadedAt = Date.now();
    } catch (error) {
      fx.arbitrage.error = error.message;
    } finally {
      fx.arbitrage.loading = false;
      renderArbitrage();
    }
  }

  function renderArbitrage(loading = false) {
    const body = byId("featureArbitrageBody");
    if (!body) return;
    if (loading) {
      body.innerHTML = `<tr><td colspan="6" class="loading">${esc(typeof t === "function" ? t("common.loading") : "Loading...")}</td></tr>`;
      return;
    }
    const list = fx.arbitrage.rows || [];
    if (!list.length) {
      body.innerHTML = `<tr><td colspan="6" class="loading">${esc(fx.arbitrage.error || uk.empty)}</td></tr>`;
      return;
    }
    body.innerHTML = list.slice(0, 40).map((row) => {
      const arb = row.arbitrage || {};
      const spread = Number(arb.spread || 0);
      return `<tr><td><strong>${esc(pair(row.symbol))}</strong><br><span class="muted">${esc(row.exchangeCount || 0)} ${uk.exchangeCount}</span></td><td>${esc(arb.buy?.exchange || "-")}<br><strong>${esc(money(arb.buy?.ask))}</strong></td><td>${esc(arb.sell?.exchange || "-")}<br><strong>${esc(money(arb.sell?.bid))}</strong></td><td><span class="featureBadge ${spread >= 0 ? "positive" : "negative"}">${esc(money(spread))}</span></td><td>${(Number(arb.spreadPct) || 0).toFixed(2)}%</td><td>${esc(timeOnly(row.updatedAt))}</td></tr>`;
    }).join("");
  }

  async function loadUser(force = false) {
    if (!S()?.auth?.token) {
      fx.watchlist = [];
      fx.alerts = [];
      fx.webhooks = [];
      fx.pnl = null;
      syncUi();
      return;
    }
    if (!force && Date.now() - fx.userLoadedAt < 6000) return;
    fx.userLoadedAt = Date.now();
    await Promise.allSettled([loadWatch(), loadAlerts(), loadWebhooks(), loadPnl()]);
  }

  async function loadWatch() {
    const payload = await api("/api/v1/auth/watchlist", { headers: headers() });
    fx.watchlist = arr(payload).map((item) => typeof item === "string" ? item : item?.symbol).filter(Boolean);
    renderWatchlist();
  }

  async function addWatch() {
    const status = byId("featureWatchStatus");
    if (!S()?.auth?.token) return statusLine(status, uk.loginNeeded, true);
    const symbol = byId("featureWatchSymbol")?.value || selectedSymbol();
    try {
      const payload = await api("/api/v1/auth/watchlist", { method: "POST", headers: headers(true), body: JSON.stringify({ symbol }) });
      fx.watchlist = arr(payload).map((item) => typeof item === "string" ? item : item?.symbol).filter(Boolean);
      sendWs({ type: "subscribe", symbol });
      statusLine(status, uk.saved);
      renderWatchlist();
    } catch (error) {
      statusLine(status, error.message, true);
    }
  }

  async function removeWatch(symbol) {
    const payload = await api(`/api/v1/auth/watchlist/${encodeURIComponent(symbol)}`, { method: "DELETE", headers: headers() });
    fx.watchlist = arr(payload).map((item) => typeof item === "string" ? item : item?.symbol).filter(Boolean);
    sendWs({ type: "unsubscribe", symbol });
    renderWatchlist();
  }

  function renderWatchlist() {
    const list = byId("featureWatchlistList");
    if (!list) return;
    if (!S()?.auth?.token) {
      list.innerHTML = `<div class="featureEmpty">${uk.loginNeeded}</div>`;
      return;
    }
    list.innerHTML = fx.watchlist.length ? fx.watchlist.map((symbol) => `<span class="featureChip"><strong>${esc(pair(symbol))}</strong><button type="button" class="featureChipRemove" data-watch-remove="${esc(symbol)}">${uk.remove}</button></span>`).join("") : `<div class="featureEmpty">${uk.empty}</div>`;
  }

  async function loadAlerts() {
    const payload = await api("/api/v1/auth/alerts", { headers: headers() });
    fx.alerts = arr(payload);
    renderAlerts();
  }

  async function addAlert() {
    const status = byId("featureAlertStatus");
    if (!S()?.auth?.token) return statusLine(status, uk.loginNeeded, true);
    const targetPrice = price(byId("featureAlertPrice")?.value);
    if (!targetPrice) return statusLine(status, uk.invalidPrice, true);
    const channels = [];
    if (byId("featureAlertWs")?.checked) channels.push("ws");
    if (byId("featureAlertEmail")?.checked) channels.push("email");
    try {
      const payload = await api("/api/v1/auth/alerts", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ symbol: byId("featureAlertSymbol")?.value || selectedSymbol(), direction: byId("featureAlertDirection")?.value || "above", targetPrice, channels, enabled: true })
      });
      fx.alerts = arr(payload);
      byId("featureAlertPrice").value = "";
      statusLine(status, uk.saved);
      renderAlerts();
    } catch (error) {
      statusLine(status, error.message, true);
    }
  }

  async function removeAlert(id) {
    const payload = await api(`/api/v1/auth/alerts/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    fx.alerts = arr(payload);
    renderAlerts();
  }

  function renderAlerts() {
    const list = byId("featureAlertsList");
    if (!list) return;
    if (!S()?.auth?.token) {
      list.innerHTML = `<div class="featureEmpty">${uk.loginNeeded}</div>`;
      return;
    }
    list.innerHTML = fx.alerts.length ? fx.alerts.map((item) => `<article class="featureRecordCard"><div class="featureRecordTop"><div><div class="featureRecordTitle">${esc(pair(item.symbol))} ${esc(item.direction === "below" ? uk.below : uk.above)} ${esc(money(item.targetPrice))}</div><div class="featureRecordSubtitle">${esc((item.channels || []).join(" + ") || "WS")}</div></div><button type="button" class="featureMiniButton" data-alert-delete="${esc(item.id)}">${uk.remove}</button></div></article>`).join("") : `<div class="featureEmpty">${uk.empty}</div>`;
  }

  async function loadWebhooks() {
    const payload = await api("/api/v1/auth/webhooks/subscriptions", { headers: headers() });
    fx.webhooks = arr(payload);
    renderWebhooks();
  }

  async function addWebhook() {
    const status = byId("featureWebhookStatus");
    if (!S()?.auth?.token) return statusLine(status, uk.loginNeeded, true);
    const url = String(byId("featureWebhookUrl")?.value || "").trim();
    const targetPrice = price(byId("featureWebhookPrice")?.value);
    if (!/^https:\/\//i.test(url)) return statusLine(status, uk.invalidUrl, true);
    if (!targetPrice) return statusLine(status, uk.invalidPrice, true);
    try {
      const payload = await api("/api/v1/auth/webhooks/subscriptions", {
        method: "POST",
        headers: headers(true),
        body: JSON.stringify({ url, symbol: byId("featureWebhookSymbol")?.value || selectedSymbol(), direction: byId("featureWebhookDirection")?.value || "above", targetPrice, secret: byId("featureWebhookSecret")?.value || "", enabled: true })
      });
      fx.webhooks = arr(payload);
      byId("featureWebhookUrl").value = "";
      byId("featureWebhookPrice").value = "";
      byId("featureWebhookSecret").value = "";
      statusLine(status, uk.saved);
      renderWebhooks();
    } catch (error) {
      statusLine(status, error.message, true);
    }
  }

  async function removeWebhook(id) {
    const payload = await api(`/api/v1/auth/webhooks/subscriptions/${encodeURIComponent(id)}`, { method: "DELETE", headers: headers() });
    fx.webhooks = arr(payload);
    renderWebhooks();
  }

  function renderWebhooks() {
    const list = byId("featureWebhooksList");
    if (!list) return;
    if (!S()?.auth?.token) {
      list.innerHTML = `<div class="featureEmpty">${uk.loginNeeded}</div>`;
      return;
    }
    list.innerHTML = fx.webhooks.length ? fx.webhooks.map((item) => `<article class="featureRecordCard"><div class="featureRecordTop"><div><div class="featureRecordTitle">${esc(pair(item.symbol))} ${esc(item.direction === "below" ? uk.below : uk.above)} ${esc(money(item.targetPrice))}</div><div class="featureRecordSubtitle">${esc(item.url)}</div></div><button type="button" class="featureMiniButton" data-webhook-delete="${esc(item.id)}">${uk.remove}</button></div></article>`).join("") : `<div class="featureEmpty">${uk.empty}</div>`;
  }

  async function loadPnl(force = false) {
    if (!S()?.auth?.token) return;
    if (!force && fx.pnlLoadedAt && Date.now() - fx.pnlLoadedAt < 7000) return renderPnl();
    try {
      const payload = await api("/api/v1/auth/portfolio/pnl", { headers: headers() });
      fx.pnl = payload.data || payload;
      fx.pnlLoadedAt = Date.now();
      fx.pnlError = "";
    } catch (error) {
      fx.pnlError = error.message;
    }
    renderPnl();
  }

  function renderPnl() {
    const metrics = byId("featurePnlMetrics");
    const list = byId("featurePnlPositions");
    if (!metrics || !list) return;
    if (!S()?.auth?.token) {
      metrics.innerHTML = "";
      list.innerHTML = `<div class="featureEmpty">${uk.loginNeeded}</div>`;
      return;
    }
    const summary = fx.pnl?.summary || {};
    metrics.innerHTML = [[uk.invested, money(summary.investedUsd)], [uk.currentValue, money(summary.currentValueUsd)], [uk.unrealized, `${money(summary.unrealizedPnlUsd)} · ${(Number(summary.unrealizedPnlPct) || 0).toFixed(2)}%`], [uk.realized, money(summary.realizedPnlUsd)], [uk.positions, String(summary.trackedPositions || 0)]].map(([label, value]) => `<article class="featureMiniMetricCard"><span>${esc(label)}</span><strong>${esc(value)}</strong></article>`).join("");
    const positions = fx.pnl?.positions || [];
    list.innerHTML = positions.length ? positions.map((item) => {
      const pnl = Number(item.unrealizedPnlUsd || 0);
      return `<article class="featureRecordCard"><div class="featureRecordTop"><div><div class="featureRecordTitle">${esc(displayName(item.symbol))}</div><div class="featureRecordSubtitle">${esc(pair(item.symbol))}</div></div><span class="featureBadge ${pnl >= 0 ? "positive" : "negative"}">${esc(money(pnl))}</span></div><div class="featureFactsGrid"><div class="featureFact"><span>${uk.positions}</span><strong>${esc(crypto(item.amount, item.assetCode || "UNIT"))}</strong></div><div class="featureFact"><span>${uk.invested}</span><strong>${esc(money(item.investedUsd))}</strong></div><div class="featureFact"><span>${uk.currentValue}</span><strong>${esc(money(item.currentValueUsd))}</strong></div><div class="featureFact"><span>P&L %</span><strong>${(Number(item.unrealizedPnlPct) || 0).toFixed(2)}%</strong></div></div></article>`;
    }).join("") : `<div class="featureEmpty">${esc(fx.pnlError || uk.empty)}</div>`;
  }

  async function loadAdminWs(force = false) {
    if (!S()?.auth?.user?.isOwner) return;
    if (!force && Date.now() - fx.adminLoadedAt < 5000) return renderAdminWs();
    try {
      const payload = await api("/api/v1/admin/ws/connections", { headers: headers() });
      fx.adminWs = arr(payload);
      fx.adminError = "";
      fx.adminLoadedAt = Date.now();
    } catch (error) {
      fx.adminError = error.message;
    }
    renderAdminWs();
  }

  function renderAdminWs() {
    const list = byId("featureAdminWsList");
    if (!list) return;
    if (!S()?.auth?.user?.isOwner) {
      list.innerHTML = `<div class="featureEmpty">${uk.loginNeeded}</div>`;
      return;
    }
    list.innerHTML = fx.adminWs.length ? fx.adminWs.map((item) => `<article class="featureRecordCard"><div class="featureRecordTop"><div><div class="featureRecordTitle">${esc(item.email || item.userEmail || item.userId || item.id || "WS")}</div><div class="featureRecordSubtitle">${esc(item.ip || item.remoteAddress || "-")}</div></div><span class="featureBadge positive">${esc(uk.online)}</span></div><div class="adminWsMeta"><div class="featureFact"><span>${esc(uk.connected)}</span><strong>${esc(dateTime(item.connectedAt || item.createdAt))}</strong></div><div class="featureFact"><span>${esc(uk.subscriptions)}</span><strong>${esc((item.subscriptions || item.symbols || []).join(", ") || "-")}</strong></div></div></article>`).join("") : `<div class="featureEmpty">${esc(fx.adminError || uk.empty)}</div>`;
  }

  async function setBan(userId, ban) {
    try {
      await api(`/api/v1/admin/users/${encodeURIComponent(userId)}/${ban ? "ban" : "unban"}`, { method: "POST", headers: headers() });
      if (typeof loadAdminUsers === "function") await loadAdminUsers();
      renderAdminUsersBetter();
      void loadAdminWs(true);
    } catch (error) {
      if (typeof setAdminStatus === "function") setAdminStatus(error.message, true);
    }
  }

  function renderAdminUsersBetter() {
    const body = R().adminUsersBody || byId("adminUsersBody");
    const users = S()?.admin?.users || [];
    if (!body || !users.length) return;
    body.innerHTML = users.map((user) => {
      const banned = Boolean(user.isBanned);
      const self = user.id === S()?.auth?.user?.id;
      const avatar = typeof getUserAvatarUrl === "function" ? getUserAvatarUrl(user) : (user.avatarUrl || "");
      return `<tr><td>${esc(user.id)}</td><td><img class="adminAvatar" src="${esc(avatar)}" alt="${esc(user.displayName || user.email || "user")}" loading="lazy" /></td><td>${esc(user.displayName || "-")}</td><td>${esc(user.email || "-")}</td><td><span class="statusPill ${banned ? "banned" : "active"}">${esc(banned ? uk.banned : uk.active)}</span></td><td>${esc(dateTime(user.createdAt))}</td><td><div class="adminActionGroup"><button class="dangerBtn" type="button" data-admin-ban="${esc(user.id)}" ${banned || self ? "disabled" : ""}>${esc(self ? uk.self : uk.ban)}</button><button class="successBtn" type="button" data-admin-unban="${esc(user.id)}" ${!banned || self ? "disabled" : ""}>${uk.unban}</button></div></td></tr>`;
    }).join("");
  }

  function statusLine(node, text, error = false) {
    if (!node) return;
    node.textContent = text || "";
    node.classList.toggle("error", Boolean(error));
    node.classList.toggle("success", Boolean(text && !error));
  }

  function isRealtimeUpdatePaused() {
    try {
      const guardState = window.__networkGuard?.getState?.();

      if (guardState?.active || guardState?.forcedOffline || guardState?.serverMarketOffline) {
        return true;
      }
    } catch {
      // features can keep working when the network guard is not loaded
    }

    if (document.documentElement?.dataset?.networkGuardState === "offline") {
      return true;
    }

    if (document.body?.classList?.contains("network-offline")) {
      return true;
    }

    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return true;
    }

    return false;
  }

  function sendWs(message) {
    const socket = S()?.ws?.socket;
    if (socket && socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message));
  }

  function attachSocket() {
    const socket = S()?.ws?.socket;
    if (!socket || socket === fx.socket) return;
    fx.socket = socket;
    socket.addEventListener("message", (event) => {
      let msg;
      try {
        msg = JSON.parse(event.data);
      } catch {
        return;
      }
      if ((msg.type === "aggregate" || msg.type === "tick" || msg.type === "price_alert") && isRealtimeUpdatePaused()) {
        return;
      }

      if (msg.type === "price_alert") {
        const data = msg.data || {};
        toast(uk.alertToastTitle, `${pair(data.symbol)} ${data.direction === "below" ? uk.below : uk.above} ${money(data.targetPrice)} ${uk.alertToastText} ${money(data.price)}`);
        void loadAlerts();
      }
      if (msg.type === "authenticated" && Array.isArray(msg.subscriptions)) {
        fx.watchlist = msg.subscriptions;
        renderWatchlist();
      }
      if (msg.type === "aggregate" && Date.now() - fx.liveRefreshAt > 10000) {
        fx.liveRefreshAt = Date.now();
        void loadCandles(false);
        void loadArbitrage(false);
        void loadPnl(false);
      }
    });
  }

  function toast(title, message) {
    const stack = byId("featureToastStack");
    if (!stack) return;
    const node = document.createElement("div");
    node.className = "featureToast featureToast--success";
    node.innerHTML = `<strong>${esc(title)}</strong><p>${esc(message)}</p>`;
    stack.appendChild(node);
    setTimeout(() => node.remove(), 5600);
  }

  function wrap(name, after) {
    const original = window[name];
    if (typeof original !== "function") return;
    window[name] = function wrappedFeatureOverlay(...args) {
      const result = original.apply(this, args);
      try {
        after(result, args);
      } catch (error) {
        console.warn("features overlay hook failed", name, error);
      }
      return result;
    };
  }

  wrap("renderAll", () => syncUi());
  wrap("renderAdminUsers", () => renderAdminUsersBetter());
  wrap("showProfileModal", () => { syncUi(); void loadUser(true); });
  wrap("showAdminModal", () => { syncUi(); renderAdminUsersBetter(); void loadAdminWs(true); });
  wrap("saveAuth", () => { syncUi(); void loadUser(true); });
  wrap("clearAuth", () => { fx.watchlist = []; fx.alerts = []; fx.webhooks = []; fx.pnl = null; syncUi(); });
  wrap("connectWs", () => setTimeout(attachSocket, 50));

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", syncUi, { once: true });
  } else {
    syncUi();
  }
})();
