(() => {
  "use strict";

  const TRADE_STATE = {
    side: "buy",
    symbol: "",
    amount: "",
    fiat: "",
    payment: "all",
    sort: "price",
    statusText: "",
    statusKind: "",
    sellAll: false
  };

  function flagEmoji(countryCode) {
    return String(countryCode || "")
      .toUpperCase()
      .replace(/[A-Z]/g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));
  }

  const LANGUAGE_OPTIONS = [
    { code: "uk", country: "UA", label: `${flagEmoji("UA")} UA`, locale: "uk-UA" },
    { code: "en", country: "GB", label: `${flagEmoji("GB")} EN`, locale: "en-GB" },
    { code: "de", country: "DE", label: `${flagEmoji("DE")} DE`, locale: "de-DE" },
    { code: "fr", country: "FR", label: `${flagEmoji("FR")} FR`, locale: "fr-FR" },
    { code: "it", country: "IT", label: `${flagEmoji("IT")} IT`, locale: "it-IT" },
    { code: "pt", country: "PT", label: `${flagEmoji("PT")} PT`, locale: "pt-PT" },
    { code: "es", country: "ES", label: `${flagEmoji("ES")} ES`, locale: "es-ES" },
    { code: "pl", country: "PL", label: `${flagEmoji("PL")} PL`, locale: "pl-PL" },
    { code: "bg", country: "BG", label: `${flagEmoji("BG")} BG`, locale: "bg-BG" },
    { code: "el", country: "GR", label: `${flagEmoji("GR")} EL`, locale: "el-GR" },
    { code: "tr", country: "TR", label: `${flagEmoji("TR")} TR`, locale: "tr-TR" },
    { code: "ko", country: "KR", label: `${flagEmoji("KR")} KO`, locale: "ko-KR" },
    { code: "ja", country: "JP", label: `${flagEmoji("JP")} JA`, locale: "ja-JP" },
    { code: "ar", country: "SA", label: `${flagEmoji("SA")} AR`, locale: "ar-SA" },
    { code: "zh", country: "CN", label: `${flagEmoji("CN")} ZH`, locale: "zh-CN" }
  ];

  const TRADE_I18N = {
    uk: {
      "brand.tagline": "Хаб ринкових даних",
      "menu.crypto": "Криптовалюти",
      "menu.market": "Ринок",
      "menu.exchanges": "Біржі",
      "menu.trade": "Торгівля",
      "toolbar.searchPlaceholder": "Пошук монети (BTC, ETH...)",
      "toolbar.languageTitle": "Мова інтерфейсу",
      "toolbar.currencyTitle": "Валюта відображення",
      "toolbar.ownerPanel": "Панель власника",
      "auth.actionOpen": "Вхід / Реєстрація",
      "theme.current.dark": "Тема: Темна",
      "theme.current.light": "Тема: Світла",
      "summary.trackedPairs": "Відстежувані пари",
      "summary.avgSpread": "Середній спред",
      "summary.totalVolume": "Сумарний 24h обсяг",
      "summary.activeExchanges": "Активні біржі",
      "crypto.title": "Топ криптовалют (агреговані дані)",
      "crypto.subtitle": "Нормалізація + агрегація даних із зовнішніх бірж через REST/WS",
      "table.rank": "#",
      "table.coin": "Монета",
      "table.ticker": "Тікер",
      "table.price": "Ціна",
      "table.bestBid": "Bid (купівля)",
      "table.bestAsk": "Ask (продаж)",
      "table.spread": "Спред",
      "table.quality": "Якість",
      "table.updated": "Оновлено",
      "table.action": "Дія",
      "trade.eyebrow": "Original exchange desk",
      "trade.title": "TradeFlow P2P",
      "trade.subtitle": "Логіка як у сучасної біржі: фільтри, мерчанти, ліміти, спосіб оплати та виконання угоди через баланс профілю. Візуально це окремий стиль CryptoAggregator.",
      "trade.activeOffers": "Активні пропозиції",
      "trade.avgSettlement": "Середній час",
      "trade.protected": "Захист угоди",
      "trade.marketRoutes": "Режими торгівлі",
      "trade.spot": "Спот-міст",
      "trade.p2p": "P2P майданчик",
      "trade.bots": "Боти",
      "trade.api": "API канали",
      "trade.buy": "Купити",
      "trade.sell": "Продати",
      "trade.asset": "Актив",
      "trade.amount": "Сума",
      "trade.fiat": "Фіат",
      "trade.payment": "Оплата",
      "trade.sort": "Сортування",
      "trade.priceSort": "За ціною",
      "trade.trustSort": "За довірою",
      "trade.allPayments": "Усі способи",
      "trade.bankTransfer": "Банківський переказ",
      "trade.cardToCard": "Картка на картку",
      "trade.digitalWallet": "Е-гаманець",
      "trade.offers": "Пропозиції мерчантів",
      "trade.maker": "Мерчант",
      "trade.price": "Ціна",
      "trade.limits": "Ліміти",
      "trade.paymentMethod": "Спосіб оплати",
      "trade.action": "Угода",
      "trade.buyAsset": "Купити {asset}",
      "trade.sellAsset": "Продати {asset}",
      "trade.orders": "{count} ордерів",
      "trade.completion": "{value}% виконано",
      "trade.settlement": "{minutes} хв",
      "trade.requiresLogin": "Спочатку увійдіть або створіть акаунт, щоб виконати угоду.",
      "trade.orderReady": "Угоду виконано: баланс і портфель оновлено.",
      "trade.executing": "Виконуємо угоду через баланс профілю...",
      "trade.amountRequired": "Введіть коректну суму угоди.",
      "trade.buySuccess": "Купівлю виконано: кошти списано, актив додано в портфель.",
      "trade.sellSuccess": "Продаж виконано: актив списано, кошти повернено на баланс.",
      "trade.insufficientBalance": "Недостатньо коштів на балансі. Поповніть гаманець.",
      "trade.insufficientAsset": "Недостатньо монет у портфелі для продажу.",
      "trade.availableToSell": "Доступно до продажу",
      "trade.maxSellAmount": "Максимальна сума продажу",
      "trade.sellAll": "Продати все",
      "trade.sellLimitHint": "Можна продати максимум {amount}.",
      "trade.noAssetToSell": "У портфелі немає цього активу для продажу.",
      "trade.priceUnavailable": "Поточна ціна для цього активу недоступна.",
      "trade.executeFailed": "Не вдалося виконати угоду. Спробуйте ще раз.",
      "trade.protectionValue": "Escrow",
      "trade.p2pDesc": "Orderbook + резерв балансу",
      "trade.spotDesc": "Спот-міст з агрегованих цін",
      "trade.botsDesc": "Alert-боти та webhook-и",
      "trade.apiDesc": "API-канали для власника",
      "trade.safetyTitle": "Антифрод і довіра",
      "trade.safetyText": "Кожна пропозиція має рейтинг, кількість ордерів, ліміти й час розрахунку. Це показує контроль ризиків без копіювання Binance.",
      "trade.watchlistTitle": "Автопідписка Watchlist",
      "trade.watchlistText": "Обраний актив можна підключити до WS-підписок, alerts і webhook-ботів.",
      "trade.empty": "Ринкових даних ще немає. Зачекайте підключення WebSocket.",
      "trade.statusLine": "Поточний ринок: {symbol}, джерел: {sources}"
    },
    en: {
      "brand.tagline": "Market Data Hub",
      "menu.crypto": "Cryptocurrencies",
      "menu.market": "Market",
      "menu.exchanges": "Exchanges",
      "menu.trade": "Trade",
      "toolbar.searchPlaceholder": "Search coin (BTC, ETH...)",
      "toolbar.languageTitle": "Interface language",
      "toolbar.currencyTitle": "Display currency",
      "toolbar.ownerPanel": "Owner panel",
      "auth.actionOpen": "Login / Register",
      "theme.current.dark": "Theme: Dark",
      "theme.current.light": "Theme: Light",
      "summary.trackedPairs": "Tracked pairs",
      "summary.avgSpread": "Average spread",
      "summary.totalVolume": "Total 24h volume",
      "summary.activeExchanges": "Active exchanges",
      "crypto.title": "Top cryptocurrencies (aggregated)",
      "crypto.subtitle": "Normalization + aggregation from external exchanges via REST/WS",
      "table.rank": "#",
      "table.coin": "Coin",
      "table.ticker": "Ticker",
      "table.price": "Price",
      "table.bestBid": "Best Bid",
      "table.bestAsk": "Best Ask",
      "table.spread": "Spread",
      "table.quality": "Quality",
      "table.updated": "Updated",
      "table.action": "Action",
      "trade.eyebrow": "Original exchange desk",
      "trade.title": "TradeFlow P2P without cloning another brand",
      "trade.subtitle": "Modern exchange logic: filters, makers, limits, payment methods and wallet-backed order execution. The visual identity stays CryptoAggregator.",
      "trade.activeOffers": "Active offers",
      "trade.avgSettlement": "Average settlement",
      "trade.protected": "Protected flow",
      "trade.marketRoutes": "Trading modes",
      "trade.spot": "Spot bridge",
      "trade.p2p": "P2P desk",
      "trade.bots": "Bots",
      "trade.api": "API channels",
      "trade.buy": "Buy",
      "trade.sell": "Sell",
      "trade.asset": "Asset",
      "trade.amount": "Amount",
      "trade.fiat": "Fiat",
      "trade.payment": "Payment",
      "trade.sort": "Sort",
      "trade.priceSort": "By price",
      "trade.trustSort": "By trust",
      "trade.allPayments": "All methods",
      "trade.bankTransfer": "Bank transfer",
      "trade.cardToCard": "Card to card",
      "trade.digitalWallet": "Digital wallet",
      "trade.offers": "Merchant offers",
      "trade.maker": "Maker",
      "trade.price": "Price",
      "trade.limits": "Limits",
      "trade.paymentMethod": "Payment method",
      "trade.action": "Trade",
      "trade.buyAsset": "Buy {asset}",
      "trade.sellAsset": "Sell {asset}",
      "trade.orders": "{count} orders",
      "trade.completion": "{value}% completed",
      "trade.settlement": "{minutes} min",
      "trade.requiresLogin": "Log in or create an account first to execute a trade.",
      "trade.orderReady": "Trade executed: balance and portfolio updated.",
      "trade.executing": "Executing the trade through your profile balance...",
      "trade.amountRequired": "Enter a valid trade amount.",
      "trade.buySuccess": "Buy completed: cash was debited and the asset was added to the portfolio.",
      "trade.sellSuccess": "Sell completed: asset was debited and cash returned to the balance.",
      "trade.insufficientBalance": "Insufficient balance. Top up your wallet first.",
      "trade.insufficientAsset": "Insufficient asset balance for this sale.",
      "trade.availableToSell": "Available to sell",
      "trade.maxSellAmount": "Maximum sell amount",
      "trade.sellAll": "Sell all",
      "trade.sellLimitHint": "You can sell up to {amount}.",
      "trade.noAssetToSell": "This asset is not available in your portfolio.",
      "trade.priceUnavailable": "Current price is unavailable for this asset.",
      "trade.executeFailed": "Could not execute the trade. Try again.",
      "trade.protectionValue": "Escrow",
      "trade.p2pDesc": "Orderbook + balance reserve",
      "trade.spotDesc": "Spot bridge from aggregated prices",
      "trade.botsDesc": "Alert bots and webhooks",
      "trade.apiDesc": "Owner-only API channels",
      "trade.safetyTitle": "Anti-fraud and trust",
      "trade.safetyText": "Every offer has a rating, order count, limits and settlement time to show risk control without copying Binance.",
      "trade.watchlistTitle": "Watchlist auto-subscription",
      "trade.watchlistText": "The selected asset can feed WS subscriptions, alerts and webhook bots.",
      "trade.empty": "No market data yet. Wait for WebSocket connection.",
      "trade.statusLine": "Current market: {symbol}, sources: {sources}"
    },
    de: {
      "brand.tagline": "Hub für Marktdaten",
      "menu.crypto": "Kryptowährungen",
      "menu.market": "Markt",
      "menu.exchanges": "Börsen",
      "menu.trade": "Handel",
      "toolbar.searchPlaceholder": "Coin suchen (BTC, ETH...)",
      "toolbar.ownerPanel": "Owner-Panel",
      "auth.actionOpen": "Login / Registrierung",
      "theme.current.dark": "Theme: Dunkel",
      "theme.current.light": "Theme: Hell",
      "summary.trackedPairs": "Beobachtete Paare",
      "summary.avgSpread": "Durchschnittlicher Spread",
      "summary.totalVolume": "24h Gesamtvolumen",
      "summary.activeExchanges": "Aktive Börsen",
      "crypto.title": "Top-Kryptowährungen (aggregiert)",
      "table.coin": "Coin",
      "table.price": "Preis",
      "table.quality": "Qualität",
      "table.action": "Aktion",
      "trade.title": "TradeFlow P2P ohne Marken-Kopie",
      "trade.subtitle": "Börsenlogik mit Filtern, Händlern, Limits und Wallet-Ausführung im eigenen CryptoAggregator-Stil.",
      "trade.buy": "Kaufen",
      "trade.sell": "Verkaufen",
      "trade.asset": "Asset",
      "trade.amount": "Betrag",
      "trade.fiat": "Fiat",
      "trade.payment": "Zahlung",
      "trade.sort": "Sortieren",
      "trade.offers": "Händlerangebote",
      "trade.maker": "Händler",
      "trade.price": "Preis",
      "trade.limits": "Limits",
      "trade.paymentMethod": "Zahlungsart",
      "trade.action": "Handel",
      "trade.buyAsset": "{asset} kaufen",
      "trade.sellAsset": "{asset} verkaufen",
      "trade.safetyTitle": "Betrugsschutz und Vertrauen",
      "trade.watchlistTitle": "Watchlist-Abo",
      "trade.requiresLogin": "Melden Sie sich an, um eine Transaktion auszuführen."
    },
    fr: {
      "brand.tagline": "Hub de données de marché",
      "menu.crypto": "Cryptomonnaies",
      "menu.market": "Marché",
      "menu.exchanges": "Bourses",
      "menu.trade": "Trading",
      "toolbar.searchPlaceholder": "Rechercher une monnaie (BTC, ETH...)",
      "toolbar.ownerPanel": "Panneau propriétaire",
      "auth.actionOpen": "Connexion / Inscription",
      "theme.current.dark": "Thème : sombre",
      "theme.current.light": "Thème : clair",
      "summary.trackedPairs": "Paires suivies",
      "summary.avgSpread": "Spread moyen",
      "summary.totalVolume": "Volume 24h total",
      "summary.activeExchanges": "Bourses actives",
      "crypto.title": "Top cryptomonnaies (agrégé)",
      "table.coin": "Monnaie",
      "table.price": "Prix",
      "table.quality": "Qualité",
      "table.action": "Action",
      "trade.title": "TradeFlow P2P sans copie de marque",
      "trade.subtitle": "Logique d'échange moderne avec filtres, marchands, limites et ordre démo dans un style CryptoAggregator distinct.",
      "trade.buy": "Acheter",
      "trade.sell": "Vendre",
      "trade.asset": "Actif",
      "trade.amount": "Montant",
      "trade.fiat": "Fiat",
      "trade.payment": "Paiement",
      "trade.sort": "Tri",
      "trade.offers": "Offres marchands",
      "trade.maker": "Marchand",
      "trade.price": "Prix",
      "trade.limits": "Limites",
      "trade.paymentMethod": "Paiement",
      "trade.action": "Trade",
      "trade.buyAsset": "Acheter {asset}",
      "trade.sellAsset": "Vendre {asset}",
      "trade.safetyTitle": "Anti-fraude et confiance",
      "trade.watchlistTitle": "Abonnement Watchlist",
      "trade.requiresLogin": "Connectez-vous pour ouvrir une transaction démo."
    },
    it: {
      "brand.tagline": "Hub dati di mercato",
      "menu.crypto": "Criptovalute",
      "menu.market": "Mercato",
      "menu.exchanges": "Exchange",
      "menu.trade": "Trading",
      "toolbar.searchPlaceholder": "Cerca moneta (BTC, ETH...)",
      "auth.actionOpen": "Accedi / Registrati",
      "theme.current.dark": "Tema: scuro",
      "theme.current.light": "Tema: chiaro",
      "summary.trackedPairs": "Coppie seguite",
      "summary.avgSpread": "Spread medio",
      "summary.totalVolume": "Volume 24h totale",
      "summary.activeExchanges": "Exchange attivi",
      "crypto.title": "Top criptovalute (aggregate)",
      "trade.title": "TradeFlow P2P senza copiare altri brand",
      "trade.subtitle": "Filtri, maker, limiti, pagamenti ed esecuzione tramite wallet con identità CryptoAggregator.",
      "trade.buy": "Compra",
      "trade.sell": "Vendi",
      "trade.asset": "Asset",
      "trade.amount": "Importo",
      "trade.fiat": "Fiat",
      "trade.payment": "Pagamento",
      "trade.sort": "Ordina",
      "trade.offers": "Offerte merchant",
      "trade.maker": "Merchant",
      "trade.price": "Prezzo",
      "trade.limits": "Limiti",
      "trade.paymentMethod": "Pagamento",
      "trade.action": "Trade",
      "trade.buyAsset": "Compra {asset}",
      "trade.sellAsset": "Vendi {asset}",
      "trade.requiresLogin": "Accedi per eseguire una transazione."
    },
    pt: {
      "brand.tagline": "Hub de dados de mercado",
      "menu.crypto": "Criptomoedas",
      "menu.market": "Mercado",
      "menu.exchanges": "Bolsas",
      "menu.trade": "Trading",
      "toolbar.searchPlaceholder": "Buscar moeda (BTC, ETH...)",
      "auth.actionOpen": "Entrar / Registrar",
      "theme.current.dark": "Tema: escuro",
      "theme.current.light": "Tema: claro",
      "summary.trackedPairs": "Pares monitorados",
      "summary.avgSpread": "Spread médio",
      "summary.totalVolume": "Volume 24h total",
      "summary.activeExchanges": "Bolsas ativas",
      "crypto.title": "Principais criptomoedas (agregado)",
      "trade.title": "TradeFlow P2P sem copiar outra marca",
      "trade.subtitle": "Filtros, makers, limites, pagamentos e execução via carteira no estilo CryptoAggregator.",
      "trade.buy": "Comprar",
      "trade.sell": "Vender",
      "trade.asset": "Ativo",
      "trade.amount": "Valor",
      "trade.fiat": "Fiat",
      "trade.payment": "Pagamento",
      "trade.sort": "Ordenar",
      "trade.offers": "Ofertas",
      "trade.maker": "Maker",
      "trade.price": "Preço",
      "trade.limits": "Limites",
      "trade.paymentMethod": "Pagamento",
      "trade.action": "Trade",
      "trade.buyAsset": "Comprar {asset}",
      "trade.sellAsset": "Vender {asset}",
      "trade.requiresLogin": "Entre para executar uma operação."
    },
    es: {
      "brand.tagline": "Hub de datos de mercado",
      "menu.crypto": "Criptomonedas",
      "menu.market": "Mercado",
      "menu.exchanges": "Bolsas",
      "menu.trade": "Trading",
      "toolbar.searchPlaceholder": "Buscar moneda (BTC, ETH...)",
      "auth.actionOpen": "Entrar / Registro",
      "theme.current.dark": "Tema: oscuro",
      "theme.current.light": "Tema: claro",
      "summary.trackedPairs": "Pares seguidos",
      "summary.avgSpread": "Spread medio",
      "summary.totalVolume": "Volumen 24h total",
      "summary.activeExchanges": "Bolsas activas",
      "crypto.title": "Top criptomonedas (agregado)",
      "trade.title": "TradeFlow P2P sin copiar otra marca",
      "trade.subtitle": "Filtros, makers, límites, pagos y ejecución desde wallet con identidad CryptoAggregator.",
      "trade.buy": "Comprar",
      "trade.sell": "Vender",
      "trade.asset": "Activo",
      "trade.amount": "Importe",
      "trade.fiat": "Fiat",
      "trade.payment": "Pago",
      "trade.sort": "Ordenar",
      "trade.offers": "Ofertas",
      "trade.maker": "Maker",
      "trade.price": "Precio",
      "trade.limits": "Límites",
      "trade.paymentMethod": "Pago",
      "trade.action": "Trade",
      "trade.buyAsset": "Comprar {asset}",
      "trade.sellAsset": "Vender {asset}",
      "trade.requiresLogin": "Inicia sesión para ejecutar una operación."
    },
    pl: {
      "brand.tagline": "Centrum danych rynkowych",
      "menu.crypto": "Kryptowaluty",
      "menu.market": "Rynek",
      "menu.exchanges": "Giełdy",
      "menu.trade": "Handel",
      "toolbar.searchPlaceholder": "Szukaj monety (BTC, ETH...)",
      "auth.actionOpen": "Logowanie / Rejestracja",
      "theme.current.dark": "Motyw: ciemny",
      "theme.current.light": "Motyw: jasny",
      "summary.trackedPairs": "Śledzone pary",
      "summary.avgSpread": "Średni spread",
      "summary.totalVolume": "Łączny wolumen 24h",
      "summary.activeExchanges": "Aktywne giełdy",
      "crypto.title": "Top kryptowaluty (agregacja)",
      "trade.title": "TradeFlow P2P bez kopiowania marki",
      "trade.subtitle": "Filtry, makerzy, limity, płatności i wykonanie z portfela w stylu CryptoAggregator.",
      "trade.buy": "Kup",
      "trade.sell": "Sprzedaj",
      "trade.asset": "Aktyw",
      "trade.amount": "Kwota",
      "trade.fiat": "Fiat",
      "trade.payment": "Płatność",
      "trade.sort": "Sortuj",
      "trade.offers": "Oferty",
      "trade.maker": "Maker",
      "trade.price": "Cena",
      "trade.limits": "Limity",
      "trade.paymentMethod": "Płatność",
      "trade.action": "Handel",
      "trade.buyAsset": "Kup {asset}",
      "trade.sellAsset": "Sprzedaj {asset}",
      "trade.requiresLogin": "Zaloguj się, aby wykonać transakcję."
    },
    bg: {
      "brand.tagline": "Хъб за пазарни данни",
      "menu.crypto": "Криптовалути",
      "menu.market": "Пазар",
      "menu.exchanges": "Борси",
      "menu.trade": "Търговия",
      "toolbar.searchPlaceholder": "Търсене на монета (BTC, ETH...)",
      "auth.actionOpen": "Вход / Регистрация",
      "theme.current.dark": "Тема: тъмна",
      "theme.current.light": "Тема: светла",
      "summary.trackedPairs": "Следени двойки",
      "summary.avgSpread": "Среден спред",
      "summary.totalVolume": "Общ 24h обем",
      "summary.activeExchanges": "Активни борси",
      "crypto.title": "Топ криптовалути (агрегирани)",
      "trade.title": "TradeFlow P2P без копиране на марка",
      "trade.subtitle": "Филтри, търговци, лимити, плащания и изпълнение през портфейл със собствен стил.",
      "trade.buy": "Купи",
      "trade.sell": "Продай",
      "trade.asset": "Актив",
      "trade.amount": "Сума",
      "trade.fiat": "Фиат",
      "trade.payment": "Плащане",
      "trade.sort": "Сортиране",
      "trade.offers": "Оферти",
      "trade.maker": "Търговец",
      "trade.price": "Цена",
      "trade.limits": "Лимити",
      "trade.paymentMethod": "Плащане",
      "trade.action": "Сделка",
      "trade.buyAsset": "Купи {asset}",
      "trade.sellAsset": "Продай {asset}",
      "trade.requiresLogin": "Влезте, за да изпълните сделка."
    },
    el: {
      "brand.tagline": "Κέντρο δεδομένων αγοράς",
      "menu.crypto": "Κρυπτονομίσματα",
      "menu.market": "Αγορά",
      "menu.exchanges": "Ανταλλακτήρια",
      "menu.trade": "Συναλλαγές",
      "toolbar.searchPlaceholder": "Αναζήτηση νομίσματος (BTC, ETH...)",
      "auth.actionOpen": "Σύνδεση / Εγγραφή",
      "theme.current.dark": "Θέμα: σκοτεινό",
      "theme.current.light": "Θέμα: φωτεινό",
      "summary.trackedPairs": "Ζεύγη",
      "summary.avgSpread": "Μέσο spread",
      "summary.totalVolume": "Συνολικός όγκος 24h",
      "summary.activeExchanges": "Ενεργά ανταλλακτήρια",
      "crypto.title": "Κορυφαία crypto (συγκεντρωτικά)",
      "trade.title": "TradeFlow P2P χωρίς αντιγραφή brand",
      "trade.subtitle": "Φίλτρα, makers, όρια, πληρωμές και εκτέλεση μέσω πορτοφολιού με δικό του στυλ.",
      "trade.buy": "Αγορά",
      "trade.sell": "Πώληση",
      "trade.asset": "Περιουσιακό",
      "trade.amount": "Ποσό",
      "trade.fiat": "Fiat",
      "trade.payment": "Πληρωμή",
      "trade.sort": "Ταξινόμηση",
      "trade.offers": "Προσφορές",
      "trade.maker": "Maker",
      "trade.price": "Τιμή",
      "trade.limits": "Όρια",
      "trade.paymentMethod": "Πληρωμή",
      "trade.action": "Trade",
      "trade.buyAsset": "Αγορά {asset}",
      "trade.sellAsset": "Πώληση {asset}",
      "trade.requiresLogin": "Συνδεθείτε για να εκτελέσετε συναλλαγή."
    },
    tr: {
      "brand.tagline": "Piyasa Veri Merkezi",
      "menu.crypto": "Kripto paralar",
      "menu.market": "Piyasa",
      "menu.exchanges": "Borsalar",
      "menu.trade": "Al-sat",
      "toolbar.searchPlaceholder": "Coin ara (BTC, ETH...)",
      "auth.actionOpen": "Giriş / Kayıt",
      "theme.current.dark": "Tema: koyu",
      "theme.current.light": "Tema: açık",
      "summary.trackedPairs": "İzlenen çiftler",
      "summary.avgSpread": "Ortalama spread",
      "summary.totalVolume": "Toplam 24s hacim",
      "summary.activeExchanges": "Aktif borsalar",
      "crypto.title": "En iyi kriptolar (agregasyon)",
      "trade.title": "Marka kopyalamadan TradeFlow P2P",
      "trade.subtitle": "Filtreler, makerlar, limitler, ödeme yöntemleri ve cüzdan üzerinden emir akışı.",
      "trade.buy": "Al",
      "trade.sell": "Sat",
      "trade.asset": "Varlık",
      "trade.amount": "Tutar",
      "trade.fiat": "Fiat",
      "trade.payment": "Ödeme",
      "trade.sort": "Sırala",
      "trade.offers": "Teklifler",
      "trade.maker": "Maker",
      "trade.price": "Fiyat",
      "trade.limits": "Limitler",
      "trade.paymentMethod": "Ödeme",
      "trade.action": "Trade",
      "trade.buyAsset": "{asset} al",
      "trade.sellAsset": "{asset} sat",
      "trade.requiresLogin": "İşlem yapmak için giriş yapın."
    },
    ko: {
      "brand.tagline": "시장 데이터 허브",
      "menu.crypto": "암호화폐",
      "menu.market": "시장",
      "menu.exchanges": "거래소",
      "menu.trade": "거래",
      "toolbar.searchPlaceholder": "코인 검색 (BTC, ETH...)",
      "auth.actionOpen": "로그인 / 가입",
      "theme.current.dark": "테마: 다크",
      "theme.current.light": "테마: 라이트",
      "summary.trackedPairs": "추적 페어",
      "summary.avgSpread": "평균 스프레드",
      "summary.totalVolume": "24시간 총 거래량",
      "summary.activeExchanges": "활성 거래소",
      "crypto.title": "상위 암호화폐 (집계)",
      "trade.title": "브랜드 복제 없는 TradeFlow P2P",
      "trade.subtitle": "필터, 메이커, 한도, 결제수단, 지갑 기반 주문 실행을 CryptoAggregator 스타일로 제공합니다.",
      "trade.buy": "구매",
      "trade.sell": "판매",
      "trade.asset": "자산",
      "trade.amount": "금액",
      "trade.fiat": "법정화폐",
      "trade.payment": "결제",
      "trade.sort": "정렬",
      "trade.offers": "오퍼",
      "trade.maker": "메이커",
      "trade.price": "가격",
      "trade.limits": "한도",
      "trade.paymentMethod": "결제수단",
      "trade.action": "거래",
      "trade.buyAsset": "{asset} 구매",
      "trade.sellAsset": "{asset} 판매",
      "trade.requiresLogin": "거래를 실행하려면 로그인하세요."
    },
    ja: {
      "brand.tagline": "市場データハブ",
      "menu.crypto": "暗号資産",
      "menu.market": "マーケット",
      "menu.exchanges": "取引所",
      "menu.trade": "取引",
      "toolbar.searchPlaceholder": "コイン検索 (BTC, ETH...)",
      "auth.actionOpen": "ログイン / 登録",
      "theme.current.dark": "テーマ: ダーク",
      "theme.current.light": "テーマ: ライト",
      "summary.trackedPairs": "追跡ペア",
      "summary.avgSpread": "平均スプレッド",
      "summary.totalVolume": "24h 総出来高",
      "summary.activeExchanges": "稼働取引所",
      "crypto.title": "主要暗号資産 (集計)",
      "trade.title": "ブランドをコピーしない TradeFlow P2P",
      "trade.subtitle": "フィルター、メーカー、上限、支払い、ウォレット連動の注文実行を独自のCryptoAggregatorスタイルで表示します。",
      "trade.buy": "買う",
      "trade.sell": "売る",
      "trade.asset": "資産",
      "trade.amount": "金額",
      "trade.fiat": "法定通貨",
      "trade.payment": "支払い",
      "trade.sort": "並び替え",
      "trade.offers": "オファー",
      "trade.maker": "メーカー",
      "trade.price": "価格",
      "trade.limits": "上限",
      "trade.paymentMethod": "支払い",
      "trade.action": "取引",
      "trade.buyAsset": "{asset}を買う",
      "trade.sellAsset": "{asset}を売る",
      "trade.requiresLogin": "取引を実行するにはログインが必要です。"
    },
    ar: {
      "brand.tagline": "مركز بيانات السوق",
      "menu.crypto": "العملات الرقمية",
      "menu.market": "السوق",
      "menu.exchanges": "المنصات",
      "menu.trade": "التداول",
      "toolbar.searchPlaceholder": "ابحث عن عملة (BTC, ETH...)",
      "auth.actionOpen": "دخول / تسجيل",
      "theme.current.dark": "السمة: داكنة",
      "theme.current.light": "السمة: فاتحة",
      "summary.trackedPairs": "الأزواج المتابعة",
      "summary.avgSpread": "متوسط السبريد",
      "summary.totalVolume": "حجم 24 ساعة",
      "summary.activeExchanges": "منصات نشطة",
      "crypto.title": "أفضل العملات الرقمية (مجمعة)",
      "trade.title": "TradeFlow P2P بدون نسخ علامة أخرى",
      "trade.subtitle": "منطق منصة حديثة: فلاتر، تجار، حدود، طرق دفع وتنفيذ عبر المحفظة بهوية CryptoAggregator.",
      "trade.buy": "شراء",
      "trade.sell": "بيع",
      "trade.asset": "الأصل",
      "trade.amount": "المبلغ",
      "trade.fiat": "فيات",
      "trade.payment": "الدفع",
      "trade.sort": "ترتيب",
      "trade.offers": "العروض",
      "trade.maker": "التاجر",
      "trade.price": "السعر",
      "trade.limits": "الحدود",
      "trade.paymentMethod": "طريقة الدفع",
      "trade.action": "تداول",
      "trade.buyAsset": "شراء {asset}",
      "trade.sellAsset": "بيع {asset}",
      "trade.requiresLogin": "سجل الدخول لتنفيذ الصفقة."
    },
    zh: {
      "brand.tagline": "市场数据中心",
      "menu.crypto": "加密货币",
      "menu.market": "市场",
      "menu.exchanges": "交易所",
      "menu.trade": "交易",
      "toolbar.searchPlaceholder": "搜索币种 (BTC, ETH...)",
      "auth.actionOpen": "登录 / 注册",
      "theme.current.dark": "主题：深色",
      "theme.current.light": "主题：浅色",
      "summary.trackedPairs": "跟踪交易对",
      "summary.avgSpread": "平均价差",
      "summary.totalVolume": "24小时总量",
      "summary.activeExchanges": "活跃交易所",
      "crypto.title": "热门加密货币（聚合）",
      "trade.title": "不复制品牌的 TradeFlow P2P",
      "trade.subtitle": "过滤器、商家、限额、支付方式和钱包联动下单，保持 CryptoAggregator 自有风格。",
      "trade.buy": "买入",
      "trade.sell": "卖出",
      "trade.asset": "资产",
      "trade.amount": "金额",
      "trade.fiat": "法币",
      "trade.payment": "支付",
      "trade.sort": "排序",
      "trade.offers": "报价",
      "trade.maker": "商家",
      "trade.price": "价格",
      "trade.limits": "限额",
      "trade.paymentMethod": "支付方式",
      "trade.action": "交易",
      "trade.buyAsset": "买入 {asset}",
      "trade.sellAsset": "卖出 {asset}",
      "trade.requiresLogin": "请先登录以执行交易。"
    }
  };

  const PAYMENT_LABELS = ["allPayments", "bankTransfer", "cardToCard", "digitalWallet"];
  const FIAT_CODES = ["UAH", "USD", "EUR", "GBP", "PLN", "JPY", "CNY", "TRY"];
  const FALLBACK_RATES = {
    USD: 1,
    EUR: 0.92,
    UAH: 41,
    GBP: 0.79,
    PLN: 3.95,
    JPY: 157,
    CNY: 7.24,
    TRY: 32.4
  };

  const MAKERS = [
    { name: "NovaBridge Desk", initials: "NB", trust: 99.1, orders: 1842, speed: 12, spread: 0.0018, min: 100, max: 22000, payments: ["bankTransfer", "cardToCard"] },
    { name: "OrbitPay Reserve", initials: "OP", trust: 98.7, orders: 1280, speed: 9, spread: 0.0024, min: 50, max: 12500, payments: ["digitalWallet", "cardToCard"] },
    { name: "LimeRoute Capital", initials: "LR", trust: 97.9, orders: 976, speed: 15, spread: 0.0032, min: 200, max: 45000, payments: ["bankTransfer"] },
    { name: "SkyVault Market", initials: "SV", trust: 96.8, orders: 720, speed: 18, spread: 0.0041, min: 25, max: 9000, payments: ["bankTransfer", "digitalWallet"] }
  ];

  function S() {
    return typeof state !== "undefined" ? state : null;
  }

  function normalizeLang(value) {
    const next = String(value || "uk").trim().toLowerCase();
    return LANGUAGE_OPTIONS.some((item) => item.code === next) ? next : "uk";
  }

  function getLang() {
    return normalizeLang(S()?.lang || localStorage.getItem("crypta_lang") || document.documentElement.lang || "uk");
  }

  function getLocaleSafe() {
    const lang = getLang();
    return LANGUAGE_OPTIONS.find((item) => item.code === lang)?.locale || "uk-UA";
  }

  function tx(key, params = {}) {
    const lang = getLang();
    const source = TRADE_I18N[lang] || TRADE_I18N.uk;
    const fallback = TRADE_I18N.uk[key] || TRADE_I18N.en[key] || key;
    const template = source[key] || (typeof t === "function" ? t(key, params) : fallback) || fallback;

    return String(template).replace(/\{(\w+)\}/g, (_match, token) =>
      params[token] !== undefined ? String(params[token]) : `{${token}}`
    );
  }

  function patchTranslations() {
    if (typeof I18N !== "object" || !I18N) {
      return;
    }

    for (const [lang, messages] of Object.entries(TRADE_I18N)) {
      I18N[lang] = { ...(I18N[lang] || {}), ...messages };
    }
  }

  function syncDocumentLanguage() {
    const lang = getLang();
    document.documentElement.lang = lang;
    document.documentElement.dir = lang === "ar" ? "rtl" : "ltr";
  }

  function getRows() {
    try {
      const rows = typeof getAggregateRowsSorted === "function" ? getAggregateRowsSorted() : [];
      if (Array.isArray(rows) && rows.length) {
        return rows;
      }
    } catch {
      // Fallback below keeps the trading tab visible while WS is still connecting.
    }

    const map = S()?.aggregatesBySymbol;
    if (map instanceof Map && map.size) {
      return Array.from(map.values()).sort((a, b) => Number(b.midPrice || 0) - Number(a.midPrice || 0));
    }

    return [];
  }

  function pair(symbol) {
    try {
      return typeof formatSymbolPair === "function" ? formatSymbolPair(symbol) : String(symbol || "").replace(/USDT$/, "/USDT");
    } catch {
      return String(symbol || "");
    }
  }

  function base(symbol) {
    try {
      return typeof getBaseSymbol === "function" ? getBaseSymbol(symbol) : String(symbol || "").replace(/USDT$/, "");
    } catch {
      return String(symbol || "").replace(/USDT$/, "");
    }
  }

  function coinName(symbol) {
    try {
      return typeof getDisplayName === "function" ? getDisplayName(symbol) : base(symbol);
    } catch {
      return base(symbol);
    }
  }

  function coinIcon(symbol) {
    try {
      return typeof getCoinIcon === "function" ? getCoinIcon(symbol) : "";
    } catch {
      return "";
    }
  }

  function escapeHtml(value) {
    return String(value ?? "").replace(/[&<>"']/g, (char) => {
      const map = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#039;" };
      return map[char] || char;
    });
  }

  function rateFor(code) {
    const normalized = String(code || "USD").toUpperCase();
    const live = Number(S()?.fx?.rates?.[normalized]);
    return Number.isFinite(live) && live > 0 ? live : FALLBACK_RATES[normalized] || 1;
  }

  function formatFiatFromUsd(valueUsd, fiat) {
    const code = String(fiat || "USD").toUpperCase();
    const numeric = Number(valueUsd);
    const converted = Number.isFinite(numeric) ? numeric * rateFor(code) : Number.NaN;

    if (!Number.isFinite(converted)) {
      return "-";
    }

    try {
      return new Intl.NumberFormat(getLocaleSafe(), {
        style: "currency",
        currency: code,
        minimumFractionDigits: converted >= 100 ? 2 : 4,
        maximumFractionDigits: converted >= 100 ? 2 : 6
      }).format(converted);
    } catch {
      return `${converted.toFixed(converted >= 100 ? 2 : 6)} ${code}`;
    }
  }

  function formatNumber(value, digits = 2) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric)) {
      return "-";
    }

    return new Intl.NumberFormat(getLocaleSafe(), {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits
    }).format(numeric);
  }

  function toFinite(value, fallback = 0) {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : fallback;
  }

  function getCurrentUser() {
    return S()?.auth?.user || null;
  }

  function getPortfolioPosition(symbol) {
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    const positions = Array.isArray(getCurrentUser()?.portfolio) ? getCurrentUser().portfolio : [];
    return positions.find((item) => String(item?.symbol || "").toUpperCase() === normalizedSymbol) || null;
  }

  function getWalletAssetUnits(symbol) {
    const asset = base(symbol).toLowerCase();
    const wallet = getCurrentUser()?.wallet || {};

    if (asset === "btc") {
      return Math.max(0, toFinite(wallet.btc, 0));
    }

    if (asset === "eth") {
      return Math.max(0, toFinite(wallet.eth, 0));
    }

    return 0;
  }

  function getSellableAssetUnits(symbol) {
    const position = getPortfolioPosition(symbol);
    const portfolioUnits = Math.max(0, toFinite(position?.amount, 0));

    if (portfolioUnits > 0) {
      return portfolioUnits;
    }

    return getWalletAssetUnits(symbol);
  }

  function formatAssetAmount(value, assetCode) {
    const numeric = Number(value);

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return `0 ${assetCode}`;
    }

    const digits = numeric >= 1 ? 4 : 8;
    return `${formatNumber(numeric, digits)} ${assetCode}`;
  }

  function formatTradeAmountInputFromUsd(valueUsd, fiat) {
    const converted = Number(valueUsd) * rateFor(fiat);

    if (!Number.isFinite(converted) || converted <= 0) {
      return "";
    }

    return converted >= 100 ? converted.toFixed(2) : converted.toFixed(6);
  }

  function getTradeState(rows) {
    const app = S();
    const defaultSymbol = app?.selectedSymbol || rows[0]?.symbol || "BTCUSDT";

    if (!TRADE_STATE.symbol || !rows.some((row) => row.symbol === TRADE_STATE.symbol)) {
      TRADE_STATE.symbol = defaultSymbol;
    }

    if (!TRADE_STATE.fiat) {
      TRADE_STATE.fiat = String(app?.currency || "USD").toUpperCase();
    }

    return TRADE_STATE;
  }

  function buildOffers(row, side, payment, sort) {
    const basePrice = Number(row?.midPrice ?? row?.price ?? row?.bestBid ?? row?.bestAsk ?? 0);

    if (!Number.isFinite(basePrice) || basePrice <= 0) {
      return [];
    }

    const offers = MAKERS.filter((maker) => payment === "all" || maker.payments.includes(payment)).map((maker, index) => {
      const sideFactor = side === "buy" ? 1 + maker.spread + index * 0.0007 : 1 - maker.spread - index * 0.0005;
      return {
        ...maker,
        priceUsd: basePrice * sideFactor
      };
    });

    if (sort === "trust") {
      offers.sort((a, b) => b.trust - a.trust);
    } else {
      offers.sort((a, b) => (side === "buy" ? a.priceUsd - b.priceUsd : b.priceUsd - a.priceUsd));
    }

    return offers;
  }

  function parseTradeAmountUsd(value, fiat) {
    const numeric = Number(String(value || "").replace(",", "."));

    if (!Number.isFinite(numeric) || numeric <= 0) {
      return Number.NaN;
    }

    const rate = rateFor(fiat);
    return rate > 0 ? numeric / rate : numeric;
  }

  function setTradeStatus(text, kind = "") {
    TRADE_STATE.statusText = String(text || "");
    TRADE_STATE.statusKind = kind;
    renderTradeExperience();
  }

  async function tradeFetchJson(url, options = {}) {
    if (typeof fetchJson === "function") {
      return fetchJson(url, options);
    }

    const response = await fetch(url, options);
    const payload = await response.json().catch(() => ({}));

    if (!response.ok) {
      throw new Error(payload?.error || `HTTP ${response.status}`);
    }

    return payload;
  }

  function localizeTradeError(error) {
    const message = String(error?.message || error || "");

    if (/Insufficient USD balance/i.test(message)) {
      return tx("trade.insufficientBalance");
    }

    if (/Insufficient asset balance/i.test(message)) {
      return tx("trade.insufficientAsset");
    }

    if (/Market price is unavailable/i.test(message)) {
      return tx("trade.priceUnavailable");
    }

    if (/amount/i.test(message)) {
      return tx("trade.amountRequired");
    }

    return message || tx("trade.executeFailed");
  }

  function renderOptions(values, selected, labeler = (value) => value) {
    return values
      .map((value) => {
        const isSelected = String(value) === String(selected) ? " selected" : "";
        return `<option value="${escapeHtml(value)}"${isSelected}>${escapeHtml(labeler(value))}</option>`;
      })
      .join("");
  }

  function renderAssetRail(rows, selectedSymbol) {
    return rows
      .slice(0, 14)
      .map((row) => {
        const active = row.symbol === selectedSymbol ? " active" : "";
        return `
          <button class="assetPill${active}" type="button" data-trade-action="symbol" data-symbol="${escapeHtml(row.symbol)}">
            <img src="${escapeHtml(coinIcon(row.symbol))}" alt="" loading="lazy" />
            <span>${escapeHtml(base(row.symbol))}</span>
          </button>
        `;
      })
      .join("");
  }

  function paymentText(key) {
    return tx(`trade.${key}`);
  }

  function renderOfferList(offers, selectedRow, side, fiat) {
    const asset = base(selectedRow?.symbol || "BTCUSDT");
    const buttonKey = side === "buy" ? "trade.buyAsset" : "trade.sellAsset";

    if (!offers.length) {
      return `<div class="tradeStatus warn">${tx("trade.empty")}</div>`;
    }

    return offers
      .map((offer, index) => {
        const methods = offer.payments.map((method) => `<span class="paymentTag">${escapeHtml(paymentText(method))}</span>`).join("");
        const actionClass = side === "sell" ? " sell" : "";

        return `
          <article class="tradeOfferCard">
            <div class="tradeOfferMaker">
              <span class="makerAvatar">${escapeHtml(offer.initials)}</span>
              <div>
                <strong>${escapeHtml(offer.name)}</strong>
                <div class="offerMetaLine">${tx("trade.orders", { count: offer.orders })} · ${tx("trade.completion", { value: formatNumber(offer.trust, 1) })}</div>
              </div>
            </div>
            <div>
              <div class="tradePrice">${formatFiatFromUsd(offer.priceUsd, fiat)}</div>
              <div class="offerMetaLine">${tx("trade.settlement", { minutes: offer.speed })}</div>
            </div>
            <div>
              <strong>${formatFiatFromUsd(offer.min, fiat)} - ${formatFiatFromUsd(offer.max, fiat)}</strong>
              <div class="offerMetaLine">${escapeHtml(asset)} / ${escapeHtml(fiat)}</div>
            </div>
            <div class="paymentTags">${methods}</div>
            <button class="tradeOfferBtn${actionClass}" type="button" data-trade-action="order" data-offer-index="${index}">
              ${escapeHtml(tx(buttonKey, { asset }))}
            </button>
          </article>
        `;
      })
      .join("");
  }

  function renderTradeExperience() {
    const root = document.getElementById("exchangeExperienceRoot");

    if (!root) {
      return;
    }

    syncDocumentLanguage();

    const rows = getRows();
    const trade = getTradeState(rows);
    const selectedRow = rows.find((row) => row.symbol === trade.symbol) || rows[0] || { symbol: trade.symbol || "BTCUSDT" };
    const selectedPair = pair(selectedRow.symbol);
    const selectedBase = base(selectedRow.symbol);
    const selectedIcon = coinIcon(selectedRow.symbol);
    const sources = Number(selectedRow.sourceCount ?? selectedRow.exchanges?.length ?? selectedRow.exchangeCount ?? 0) || 0;
    const offers = buildOffers(selectedRow, trade.side, trade.payment, trade.sort);
    const bestOffer = offers[0];
    const marketPrice = Number(selectedRow.midPrice ?? selectedRow.price ?? bestOffer?.priceUsd ?? 0);
    const activeOffers = rows.length ? Math.min(rows.length * MAKERS.length, 80) : 0;
    const selectedAmountUsd = parseTradeAmountUsd(trade.amount, trade.fiat);
    const estimatedAsset = Number.isFinite(selectedAmountUsd) && selectedAmountUsd > 0 && marketPrice > 0
      ? selectedAmountUsd / marketPrice
      : 0;
    const sellableUnits = getSellableAssetUnits(selectedRow.symbol);
    const maxSellUsd = marketPrice > 0 ? sellableUnits * marketPrice : 0;
    const sellInfoHtml = trade.side === "sell"
      ? `
        <div class="tradeSellInfo">
          <div class="tradeSellMetric">
            <span>${escapeHtml(tx("trade.availableToSell"))}</span>
            <strong>${escapeHtml(formatAssetAmount(sellableUnits, selectedBase))}</strong>
          </div>
          <div class="tradeSellMetric">
            <span>${escapeHtml(tx("trade.maxSellAmount"))}</span>
            <strong>${escapeHtml(formatFiatFromUsd(maxSellUsd, trade.fiat))}</strong>
          </div>
          <button class="tradeSellAllBtn" type="button" data-trade-action="sell-max" ${sellableUnits > 0 && maxSellUsd > 0 ? "" : "disabled"}>
            ${escapeHtml(tx("trade.sellAll"))}
          </button>
        </div>
      `
      : "";

    root.innerHTML = `
      <div class="tradeDesk">
        <section class="tradeHero">
          <div>
            <span class="tradeEyebrow">${escapeHtml(tx("trade.eyebrow"))}</span>
            <h2>${escapeHtml(tx("trade.title"))}</h2>
            <p>${escapeHtml(tx("trade.subtitle"))}</p>
            <div class="tradeHeroStats">
              <div class="tradeHeroStat">
                <span>${escapeHtml(tx("trade.activeOffers"))}</span>
                <strong>${activeOffers || "-"}</strong>
              </div>
              <div class="tradeHeroStat">
                <span>${escapeHtml(tx("trade.avgSettlement"))}</span>
                <strong>12-18 min</strong>
              </div>
              <div class="tradeHeroStat">
                <span>${escapeHtml(tx("trade.protected"))}</span>
                <strong>${escapeHtml(tx("trade.protectionValue"))}</strong>
              </div>
            </div>
          </div>
          <aside class="tradeMarketPulse">
            <div class="tradePulseTop">
              <div class="tradePulseCoin">
                <img src="${escapeHtml(selectedIcon)}" alt="" loading="lazy" />
                <div>
                  <strong>${escapeHtml(coinName(selectedRow.symbol))}</strong>
                  <span>${escapeHtml(selectedPair)}</span>
                </div>
              </div>
              <div class="tradePulsePrice">${formatFiatFromUsd(marketPrice, trade.fiat)}</div>
            </div>
            <div class="tradePulseBar"><span style="width:${Math.max(18, Math.min(96, 58 + sources * 2))}%"></span></div>
            <div class="tradeStatus">${escapeHtml(tx("trade.statusLine", { symbol: selectedPair, sources: sources || "-" }))}</div>
          </aside>
        </section>

        <section class="tradeLayout">
          <article class="tradeControlPanel">
            <div class="tradeRouteGrid" aria-label="${escapeHtml(tx("trade.marketRoutes"))}">
              <div class="tradeRouteCard active"><strong>${escapeHtml(tx("trade.p2p"))}</strong><span>${escapeHtml(tx("trade.p2pDesc"))}</span></div>
              <div class="tradeRouteCard"><strong>${escapeHtml(tx("trade.spot"))}</strong><span>${escapeHtml(tx("trade.spotDesc"))}</span></div>
              <div class="tradeRouteCard"><strong>${escapeHtml(tx("trade.bots"))}</strong><span>${escapeHtml(tx("trade.botsDesc"))}</span></div>
              <div class="tradeRouteCard"><strong>${escapeHtml(tx("trade.api"))}</strong><span>${escapeHtml(tx("trade.apiDesc"))}</span></div>
            </div>

            <div class="tradeFilters">
              <div class="tradeSwitch">
                <button class="${trade.side === "buy" ? "active" : ""}" type="button" data-trade-action="side" data-side="buy">${escapeHtml(tx("trade.buy"))}</button>
                <button class="${trade.side === "sell" ? "active" : ""}" type="button" data-trade-action="side" data-side="sell">${escapeHtml(tx("trade.sell"))}</button>
              </div>
              <label class="tradeField">
                <span>${escapeHtml(tx("trade.asset"))}</span>
                <select id="tradeDeskSymbol">${renderOptions(rows.map((row) => row.symbol), selectedRow.symbol, (symbol) => `${coinName(symbol)} · ${pair(symbol)}`)}</select>
              </label>
              <label class="tradeField">
                <span>${escapeHtml(tx("trade.amount"))}</span>
                <input id="tradeDeskAmount" inputmode="decimal" placeholder="150.00" value="${escapeHtml(trade.amount)}" />
              </label>
              <label class="tradeField">
                <span>${escapeHtml(tx("trade.fiat"))}</span>
                <select id="tradeDeskFiat">${renderOptions(FIAT_CODES, trade.fiat)}</select>
              </label>
              <label class="tradeField">
                <span>${escapeHtml(tx("trade.payment"))}</span>
                <select id="tradeDeskPayment">${renderOptions(PAYMENT_LABELS, trade.payment, (key) => paymentText(key))}</select>
              </label>
              <label class="tradeField">
                <span>${escapeHtml(tx("trade.sort"))}</span>
                <select id="tradeDeskSort">
                  <option value="price"${trade.sort === "price" ? " selected" : ""}>${escapeHtml(tx("trade.priceSort"))}</option>
                  <option value="trust"${trade.sort === "trust" ? " selected" : ""}>${escapeHtml(tx("trade.trustSort"))}</option>
                </select>
              </label>
            </div>

            ${sellInfoHtml}

            <div class="assetRail">${renderAssetRail(rows, selectedRow.symbol)}</div>

            <div class="tradeOfferHeader">
              <span>${escapeHtml(tx("trade.maker"))}</span>
              <span>${escapeHtml(tx("trade.price"))}</span>
              <span>${escapeHtml(tx("trade.limits"))}</span>
              <span>${escapeHtml(tx("trade.paymentMethod"))}</span>
              <span>${escapeHtml(tx("trade.action"))}</span>
            </div>
            <div class="tradeOfferList">${renderOfferList(offers, selectedRow, trade.side, trade.fiat)}</div>
          </article>

          <aside class="tradeSidePanel">
            <div class="tradeSafetyCard">
              <h3>${escapeHtml(tx("trade.safetyTitle"))}</h3>
              <p>${escapeHtml(tx("trade.safetyText"))}</p>
              <div class="tradeSafetyMeter">
                <span class="tradeSafetyRing">92%</span>
                <div>
                  <strong>${escapeHtml(selectedBase)} ${escapeHtml(tx("trade.protected"))}</strong>
                  <p>${escapeHtml(tx("trade.statusLine", { symbol: selectedPair, sources: sources || "-" }))}</p>
                </div>
              </div>
            </div>
            <div class="tradeSafetyCard">
              <h3>${escapeHtml(tx("trade.watchlistTitle"))}</h3>
              <p>${escapeHtml(tx("trade.watchlistText"))}</p>
            </div>
            <div id="tradeDeskStatus" class="tradeStatus ${escapeHtml(trade.statusKind || "")}">
              ${escapeHtml(trade.statusText || (estimatedAsset > 0 ? `${formatNumber(estimatedAsset, 6)} ${selectedBase}` : ""))}
            </div>
          </aside>
        </section>
      </div>
    `;
  }

  async function executeTradeOrder(offerIndex) {
    const app = S();
    const rows = getRows();
    const trade = getTradeState(rows);
    const selectedRow = rows.find((row) => row.symbol === trade.symbol) || rows[0];
    const offers = selectedRow ? buildOffers(selectedRow, trade.side, trade.payment, trade.sort) : [];
    const offer = offers[Number(offerIndex)] || offers[0];
    const symbol = String(selectedRow?.symbol || trade.symbol || "").trim().toUpperCase();
    const assetCode = base(symbol);
    const marketPrice = Number(selectedRow?.midPrice ?? selectedRow?.price ?? offer?.priceUsd ?? 0);
    let amountUsd = parseTradeAmountUsd(trade.amount, trade.fiat);

    if (!app?.auth?.user || !app?.auth?.token) {
      setTradeStatus(tx("trade.requiresLogin"), "warn");

      if (typeof showAuthModal === "function") {
        setTimeout(() => showAuthModal("register"), 350);
      }

      return;
    }

    if (!symbol || !Number.isFinite(amountUsd) || amountUsd <= 0) {
      setTradeStatus(tx("trade.amountRequired"), "warn");
      return;
    }

    let requestedAssetUnits = null;

    if (trade.side === "sell") {
      if (!Number.isFinite(marketPrice) || marketPrice <= 0) {
        setTradeStatus(tx("trade.priceUnavailable"), "warn");
        return;
      }

      const sellableUnits = getSellableAssetUnits(symbol);
      const maxSellUsd = sellableUnits * marketPrice;

      if (!Number.isFinite(sellableUnits) || sellableUnits <= 0 || maxSellUsd <= 0) {
        setTradeStatus(tx("trade.noAssetToSell"), "warn");
        return;
      }

      if (trade.sellAll) {
        requestedAssetUnits = sellableUnits;
        amountUsd = maxSellUsd;
      } else if (amountUsd > maxSellUsd + Math.max(0.01, maxSellUsd * 0.002)) {
        setTradeStatus(`${tx("trade.insufficientAsset")} ${tx("trade.sellLimitHint", { amount: formatFiatFromUsd(maxSellUsd, trade.fiat) })}`, "warn");
        return;
      }
    }

    setTradeStatus(tx("trade.executing"), "");

    try {
      const endpoint = trade.side === "sell" ? "/api/v1/auth/portfolio/sell" : "/api/v1/auth/portfolio/buy";
      const requestBody = {
        symbol,
        amountUsd
      };

      if (trade.side === "sell" && requestedAssetUnits) {
        requestBody.assetUnits = requestedAssetUnits;
        requestBody.sellAll = true;
      }

      const payload = await tradeFetchJson(endpoint, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${app.auth.token}`
        },
        body: JSON.stringify(requestBody)
      });

      if (typeof saveAuth === "function") {
        saveAuth(payload.token || app.auth.token, payload.user);
      } else if (app.auth) {
        app.auth.token = payload.token || app.auth.token;
        app.auth.user = payload.user || app.auth.user;
      }

      if (typeof appendProfileActivity === "function") {
        appendProfileActivity({
          type: trade.side === "sell" ? "sell" : "buy",
          createdAt: new Date().toISOString(),
          amountUsd: payload.trade?.amountUsd ?? amountUsd,
          currency: String(app.currency || trade.fiat || "USD").toUpperCase(),
          symbol: payload.trade?.symbol || symbol,
          assetCode: payload.trade?.assetCode || assetCode,
          assetUnits: payload.trade?.assetUnits,
          priceUsd: payload.trade?.priceUsd || offer?.priceUsd
        });
      }

      TRADE_STATE.amount = "";
      TRADE_STATE.sellAll = false;
      setTradeStatus(trade.side === "sell" ? tx("trade.sellSuccess") : tx("trade.buySuccess"), "ok");

      if (typeof renderProfileModal === "function") {
        renderProfileModal();
      }
    } catch (error) {
      setTradeStatus(localizeTradeError(error), "warn");
    }
  }

  async function handleTradeClick(event) {
    const actionTarget = event.target.closest("[data-trade-action]");

    if (!actionTarget) {
      return;
    }

    const action = actionTarget.dataset.tradeAction;

    if (action === "side") {
      TRADE_STATE.side = actionTarget.dataset.side === "sell" ? "sell" : "buy";
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      TRADE_STATE.sellAll = false;
      renderTradeExperience();
      return;
    }

    if (action === "symbol") {
      TRADE_STATE.symbol = String(actionTarget.dataset.symbol || "").toUpperCase();
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      TRADE_STATE.sellAll = false;
      renderTradeExperience();
      return;
    }

    if (action === "sell-max") {
      const rows = getRows();
      const trade = getTradeState(rows);
      const selectedRow = rows.find((row) => row.symbol === trade.symbol) || rows[0];
      const symbol = String(selectedRow?.symbol || trade.symbol || "").trim().toUpperCase();
      const marketPrice = Number(selectedRow?.midPrice ?? selectedRow?.price ?? 0);
      const sellableUnits = getSellableAssetUnits(symbol);
      const maxSellUsd = sellableUnits * marketPrice;

      if (!Number.isFinite(sellableUnits) || sellableUnits <= 0 || !Number.isFinite(maxSellUsd) || maxSellUsd <= 0) {
        setTradeStatus(tx("trade.noAssetToSell"), "warn");
        return;
      }

      TRADE_STATE.amount = formatTradeAmountInputFromUsd(maxSellUsd, trade.fiat);
      TRADE_STATE.sellAll = true;
      TRADE_STATE.statusText = tx("trade.sellLimitHint", { amount: formatFiatFromUsd(maxSellUsd, trade.fiat) });
      TRADE_STATE.statusKind = "";
      renderTradeExperience();
      return;
    }

    if (action === "order") {
      await executeTradeOrder(actionTarget.dataset.offerIndex);
    }
  }

  function handleTradeInput(event) {
    const target = event.target;

    if (!(target instanceof HTMLInputElement) && !(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.id === "tradeDeskAmount") {
      TRADE_STATE.amount = target.value.replace(/[^\d.,]/g, "");
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      TRADE_STATE.sellAll = false;
      target.value = TRADE_STATE.amount;
    }
  }

  function handleTradeChange(event) {
    const target = event.target;

    if (!(target instanceof HTMLSelectElement)) {
      return;
    }

    if (target.id === "tradeDeskSymbol") {
      TRADE_STATE.symbol = String(target.value || "").toUpperCase();
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      TRADE_STATE.sellAll = false;
      renderTradeExperience();
    }

    if (target.id === "tradeDeskFiat") {
      TRADE_STATE.fiat = String(target.value || "USD").toUpperCase();
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      TRADE_STATE.sellAll = false;
      renderTradeExperience();
    }

    if (target.id === "tradeDeskPayment") {
      TRADE_STATE.payment = String(target.value || "all");
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      renderTradeExperience();
    }

    if (target.id === "tradeDeskSort") {
      TRADE_STATE.sort = target.value === "trust" ? "trust" : "price";
      TRADE_STATE.statusText = "";
      TRADE_STATE.statusKind = "";
      renderTradeExperience();
    }
  }

  function enhanceLanguageSelect() {
    const select = document.getElementById("languageSelect");

    if (!select) {
      return;
    }

    const current = normalizeLang(select.value || S()?.lang || "uk");
    const existingCodes = new Set(Array.from(select.options).map((option) => option.value));

    for (const item of LANGUAGE_OPTIONS) {
      if (!existingCodes.has(item.code)) {
        const option = document.createElement("option");
        option.value = item.code;
        option.textContent = item.label;
        select.append(option);
      }
    }

    for (const option of Array.from(select.options)) {
      const meta = LANGUAGE_OPTIONS.find((item) => item.code === option.value);
      if (meta) {
        option.textContent = meta.label;
      }
    }

    select.value = current;
    select.dataset.lang = current;
  }

  function boot() {
    patchTranslations();
    enhanceLanguageSelect();
    syncDocumentLanguage();

    if (typeof applyI18nToDom === "function") {
      applyI18nToDom();
      enhanceLanguageSelect();
    }

    renderTradeExperience();
    document.addEventListener("click", handleTradeClick);
    document.addEventListener("input", handleTradeInput);
    document.addEventListener("change", (event) => {
      handleTradeChange(event);
      if (event.target?.id === "languageSelect") {
        setTimeout(() => {
          enhanceLanguageSelect();
          syncDocumentLanguage();
          renderTradeExperience();
        }, 0);
      }
    });

    setInterval(renderTradeExperience, 5000);
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot, { once: true });
  } else {
    boot();
  }
})();
