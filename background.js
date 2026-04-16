let blockedTabs = new Map();

// Восстанавливаем состояние ограниченных вкладок из session storage при старте сервис-воркера
chrome.storage.session.get('blockedTabsData', (res) => {
  if (res.blockedTabsData) blockedTabs = new Map(res.blockedTabsData);
});

// Если после рестарта service worker остались забаненные товары — возобновляем быструю проверку
chrome.storage.local.get('monitoredItems', (res) => {
  if ((res.monitoredItems || []).some(i => i.lastStatus === 'banned')) scheduleBanCheck();
});

function saveBlockedTabs() {
  chrome.storage.session.set({ blockedTabsData: [...blockedTabs] });
}

// === МОНИТОРИНГ: инициализация alarm ===
chrome.runtime.onInstalled.addListener(() => { initMonitorAlarm(); checkForUpdate(); });
chrome.runtime.onStartup.addListener(() => { initMonitorAlarm(); checkForUpdate(); });

function initMonitorAlarm() {
  chrome.storage.local.get('monitorInterval', (res) => {
    const minutes = res.monitorInterval || 5;
    chrome.alarms.create('priceCheckAlarm', { periodInMinutes: minutes });
  });
  chrome.alarms.create('updateCheckAlarm', { periodInMinutes: 360 }); // раз в 6 часов
}

// === ПРОВЕРКА ОБНОВЛЕНИЙ ===
const UPDATE_URL = 'https://raw.githubusercontent.com/VibeCodeCrew/sku-master/master/manifest.json';

async function checkForUpdate() {
  try {
    const resp = await fetch(UPDATE_URL, { cache: 'no-store' });
    if (!resp.ok) return;
    const remote = await resp.json();
    const local = chrome.runtime.getManifest();
    if (remote.version !== local.version && isNewerVersion(remote.version, local.version)) {
      chrome.notifications.create('sku-update-available', {
        type: 'basic',
        iconUrl: 'icon.png',
        title: 'SKU Master — доступно обновление',
        message: `Новая версия ${remote.version} (у вас ${local.version}). Нажмите, чтобы скачать.`,
        priority: 2
      });
    }
  } catch (e) {}
}

function isNewerVersion(remote, local) {
  const r = remote.split('.').map(Number);
  const l = local.split('.').map(Number);
  for (let i = 0; i < Math.max(r.length, l.length); i++) {
    if ((r[i] || 0) > (l[i] || 0)) return true;
    if ((r[i] || 0) < (l[i] || 0)) return false;
  }
  return false;
}

chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'priceCheckAlarm') runMonitorCheck();
  if (alarm.name === 'banQuickCheck') runBanQuickCheck();
  if (alarm.name === 'updateCheckAlarm') checkForUpdate();
});

// Клик по уведомлению — найти существующую вкладку или открыть виджет
chrome.notifications.onClicked.addListener((notifId) => {
  chrome.notifications.clear(notifId);
  chrome.action.setBadgeText({ text: '' });

  // Уведомление об обновлении — открываем страницу релизов
  if (notifId === 'sku-update-available') {
    chrome.tabs.create({ url: 'https://github.com/VibeCodeCrew/sku-master/releases', active: true });
    return;
  }

  // Батчевые уведомления — открываем вкладки разбаненных/обновлённых товаров
  if (notifId === 'ban-check-batch' || notifId === 'monitor-batch') {
    const key = notifId === 'ban-check-batch' ? 'notifUrls_banCheck' : 'notifUrls_monitor';
    chrome.storage.session.get(key, (res) => {
      const urls = res[key] || [];
      if (urls.length > 0) {
        urls.forEach(url => chrome.tabs.create({ url, active: false }));
        chrome.storage.session.remove(key);
      } else {
        chrome.tabs.query({ active: true, currentWindow: true }, ([activeTab]) => {
          if (activeTab) chrome.tabs.sendMessage(activeTab.id, { action: 'toggleWidget' }).catch(() => {});
        });
      }
    });
    return;
  }

  // Индивидуальное уведомление (ban-detected-SKU) — ищем вкладку с этим товаром
  const sku = notifId.replace('ban-detected-', '');
  chrome.storage.local.get('monitoredItems', (res) => {
    const item = (res.monitoredItems || []).find(i => i.sku === sku);
    if (!item) return;
    // Ищем уже открытую вкладку с этим товаром
    chrome.tabs.query({ url: ["*://www.mvideo.ru/*", "*://www.eldorado.ru/*"] }, (tabs) => {
      const existing = tabs.find(t => t.url && t.url.includes(sku));
      if (existing) {
        chrome.tabs.update(existing.id, { active: true });
        chrome.windows.update(existing.windowId, { focused: true });
      } else {
        chrome.tabs.create({ url: item.url, active: true });
      }
    });
  });
});

// 1. ДЕТЕКТОР ОГРАНИЧЕНИЙ ЗАПРОСОВ
const BFF_PATHS = ['/bff/products/prices', '/bff/product-details', '/bff/products/listing'];

chrome.webRequest.onHeadersReceived.addListener(
  (details) => {
    if ((details.statusCode === 400 || details.statusCode === 403 || details.statusCode === 429) && details.tabId !== -1) {
      const now = new Date().toLocaleTimeString();
      const isNewBan = !blockedTabs.has(details.tabId);

      if (isNewBan) {
        blockedTabs.set(details.tabId, now);
        saveBlockedTabs();
      }

      chrome.tabs.sendMessage(details.tabId, {
        action: "requestBlocked",
        timestamp: blockedTabs.get(details.tabId)
      }).catch(() => {});

      // Авто-мониторинг: только для BFF-запросов и только при первом бане вкладки
      const isBff = BFF_PATHS.some(p => details.url.includes(p));
      if (isNewBan && isBff) {
        chrome.tabs.get(details.tabId, (tab) => {
          if (chrome.runtime.lastError || !tab || !isProductUrl(tab.url)) return;
          const skuMatch = tab.url.match(/(\d+)(\/?)$/);
          const sku = skuMatch ? skuMatch[1] : null;
          if (!sku) return;

          const store = tab.url.includes('mvideo') ? 'mvideo' : 'eldorado';

          // Уведомление, если пользователь находится на другой вкладке того же окна
          chrome.tabs.query({ active: true, windowId: tab.windowId }, ([activeTab]) => {
            if (activeTab && activeTab.id !== details.tabId) {
              chrome.notifications.create(`ban-detected-${sku}`, {
                type: 'basic',
                iconUrl: 'icon.png',
                title: '⛔ Мягкий бан — SKU Master',
                message: `Товар ${sku} попал в мягкий бан.\nДобавлен в список отслеживания.`,
                priority: 2
              });
            }
          });

          // Авто-добавление в мониторинг
          chrome.storage.local.get('monitoredItems', (res) => {
            const items = res.monitoredItems || [];
            if (!items.find(i => i.sku === sku)) {
              items.push({ sku, url: tab.url, store, lastStatus: 'banned', afterNotify: 'keep', addedAt: Date.now(), bannedAt: Date.now() });
              chrome.storage.local.set({ monitoredItems: items });
            }
            scheduleBanCheck();
          });
        });
      }
    }
  },
  { urls: ["*://www.mvideo.ru/*", "*://www.eldorado.ru/*"] }
);

chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === 'loading') {
    blockedTabs.delete(tabId);
    saveBlockedTabs();
  }
});

function isProductUrl(url) {
  return url.includes('/products/') || url.includes('/cat/detail/');
}

// === ИЗВЛЕЧЕНИЕ ДАННЫХ СО СТРАНИЦЫ ===
function readProductInfo() {
  const host = window.location.hostname;
  let sku = null;
  let problemType = null;
  let regionError = false; 

  if (document.body.getAttribute('data-request-blocked') === 'true') {
      const match = window.location.href.match(/(\d+)(\/?)$/);
      if (match) sku = match[1];
      return { sku, problemType: 'banned', regionError: false };
  }

  try {
    const normalize = (str) => (str || '').toLowerCase();

    if (host.includes('mvideo.ru')) {
        const locNode = document.querySelector('.location-text');
        if (locNode && !normalize(locNode.textContent).includes('москва')) regionError = true;
    } 
    else if (host.includes('eldorado.ru')) {
        let isMoscow = false;
        const elNode = document.querySelector('.elme');
        if (elNode && normalize(elNode.textContent).includes('москва')) isMoscow = true;
        else {
            const header = document.querySelector('header');
            if (header && normalize(header.textContent).includes('москва')) isMoscow = true;
        }
        if (!isMoscow) regionError = true;
    }

    const processedLink = document.querySelector('.ext-link');
    if (processedLink) {
      sku = processedLink.innerText.replace(/\s/g, '');
    } else if (host.includes('eldorado.ru')) {
      const btn = document.querySelector('button[data-dy="article"]');
      if (btn) sku = btn.innerText.replace(/\D/g, '');
    } else if (host.includes('mvideo.ru')) {
      const spans = document.querySelectorAll('span[mvidremovespaces]');
      for (let span of spans) {
        const text = span.innerText.replace(/\s/g, '');
        if (/^\d+$/.test(text) && text.length > 5) { sku = text; break; }
      }
    }

    if (!sku) {
        const match = window.location.href.match(/(\d+)(\/?)$/);
        if (match) sku = match[1];
    }

    if (sku) {
      if (host.includes('mvideo.ru')) {
        const soldOut = document.querySelector('.product-sold-out-text');
        const notif = document.querySelector('mvid-product-notification .product-notification__text');
        const isLow = notif && notif.textContent.includes('Осталось мало');
        if (soldOut) problemType = 'sold_out';
        else if (isLow) problemType = 'low_stock';
      } else if (host.includes('eldorado.ru')) {
        const safeText = document.body.textContent.toLowerCase().replace(/\s+/g, ' ');
        const isSoldOut = safeText.includes('нет в наличии') || safeText.includes('сообщить о поступлении');
        const isLow = safeText.includes('почти закончился') || safeText.includes('осталось мало');
        if (isSoldOut) problemType = 'sold_out';
        else if (isLow) problemType = 'low_stock';
      }
    }

    // Цена: читаем из DOM — "Цена для всех" (не персональная)
    if (host.includes('mvideo.ru')) {
      // Залогиненный: блок "Цена для всех" отдельно от персональной
      const priceForAllEl = document.querySelector('.emphasized-personal-price__price-for-all .price__main-value');
      if (priceForAllEl) {
        price = parseInt(priceForAllEl.textContent.replace(/\D/g, '')) || null;
      } else {
        // Не залогиненный: обычный блок цены (класс price--pdp-price-for-all без родительского emphasized-personal-price)
        const mainPriceEl = document.querySelector('.price--pdp-price-for-all .price__main-value, .price--pdp-price .price__main-value');
        if (mainPriceEl) {
          price = parseInt(mainPriceEl.textContent.replace(/\D/g, '')) || null;
        }
      }
    } else if (host.includes('eldorado.ru')) {
      const elPriceEl = document.querySelector('[data-pc="offer_price"], .product-buy-price__price');
      if (elPriceEl) {
        price = parseInt(elPriceEl.textContent.replace(/\D/g, '')) || null;
      }
    }
  } catch (e) {}

  return { sku, problemType, regionError, price };
}

chrome.action.onClicked.addListener(async (tab) => {
  chrome.tabs.sendMessage(tab.id, { action: "toggleWidget" });
});

chrome.runtime.onMessage.addListener((req, sender, sendResponse) => {
  if (req.action === "collectData") {
    collectAllTabs(sender.tab.windowId).then(sendResponse);
    return true; 
  }
  if (req.action === "closeTabs") {
    chrome.tabs.remove(req.tabIds).then(() => sendResponse({success: true}));
    return true;
  }
  if (req.action === "activateTab") {
    chrome.tabs.update(req.tabId, { active: true });
    chrome.tabs.get(req.tabId, (tab) => {
        if (tab && tab.windowId) chrome.windows.update(tab.windowId, { focused: true });
    });
  }
  if (req.action === "checkForUpdate") {
    (async () => {
      try {
        const resp = await fetch(UPDATE_URL, { cache: 'no-store' });
        if (!resp.ok) return sendResponse({ error: 'fetch failed' });
        const remote = await resp.json();
        const local = chrome.runtime.getManifest();
        if (isNewerVersion(remote.version, local.version)) {
          sendResponse({ hasUpdate: true, remoteVersion: remote.version, localVersion: local.version });
        } else {
          sendResponse({ hasUpdate: false, localVersion: local.version });
        }
      } catch (e) { sendResponse({ error: e.message }); }
    })();
    return true;
  }
  
  // === FIX v4.9.0: Open in specific window ===
  if (req.action === "openTab") {
      // sender.tab.windowId гарантирует, что вкладка откроется в том же окне, откуда нажали кнопку
      chrome.tabs.create({ 
          url: req.url, 
          windowId: sender.tab.windowId, 
          active: false 
      });
      return true;
  }
  
  // === МОНИТОРИНГ: управление списком ===
  if (req.action === "addMonitorItem") {
    chrome.storage.local.get('monitoredItems', (res) => {
      const items = res.monitoredItems || [];
      const exists = items.find(i => i.sku === req.item.sku);
      if (!exists) items.push(req.item);
      chrome.storage.local.set({ monitoredItems: items }, () => sendResponse({ success: true, items }));
    });
    return true;
  }

  if (req.action === "removeMonitorItem") {
    chrome.storage.local.get('monitoredItems', (res) => {
      const items = (res.monitoredItems || []).filter(i => i.sku !== req.sku);
      chrome.storage.local.set({ monitoredItems: items }, () => sendResponse({ success: true, items }));
    });
    return true;
  }

  if (req.action === "getMonitorItems") {
    chrome.storage.local.get(['monitoredItems', 'monitorInterval'], (res) => {
      sendResponse({ items: res.monitoredItems || [], interval: res.monitorInterval || 5 });
    });
    return true;
  }

  if (req.action === "setMonitorInterval") {
    const minutes = Math.max(1, parseInt(req.minutes) || 5);
    chrome.storage.local.set({ monitorInterval: minutes }, () => {
      chrome.alarms.create('priceCheckAlarm', { periodInMinutes: minutes });
      sendResponse({ success: true });
    });
    return true;
  }

  if (req.action === "runMonitorNow") {
    runMonitorCheck().then(() => sendResponse({ success: true }));
    return true;
  }

  if (req.action === "clearMonitorBadge") {
    chrome.action.setBadgeText({ text: '' });
  }
  if (req.action === "fetchGoogleDoc") {
      const docIdMatch = req.url.match(/\/document\/d\/([a-zA-Z0-9-_]+)/);
      if (!docIdMatch) {
          sendResponse({ success: false, error: "Неверная ссылка" });
          return true;
      }
      const exportUrl = `https://docs.google.com/document/d/${docIdMatch[1]}/export?format=txt`;
      fetch(exportUrl)
          .then(res => res.status === 200 ? res.text() : Promise.reject(res.status))
          .then(text => sendResponse({ success: true, data: text }))
          .catch(err => sendResponse({ success: false, error: err.toString() }));
      return true; 
  }

  // === BULK AVAILABILITY CHECK (#3) ===
  if (req.action === "bulkCheck") {
    bulkCheckAvailability(req.items, req.store, sender.tab.id).then(sendResponse);
    return true;
  }

  // === PROCESSED SKUs (#7 Duplicate Detection) ===
  if (req.action === "markProcessed") {
    chrome.storage.local.get('processedSkus', (res) => {
      const existing = res.processedSkus || {};
      const now = Date.now();
      req.skus.forEach(sku => { existing[sku] = now; });
      chrome.storage.local.set({ processedSkus: existing }, () => {
        sendResponse({ success: true, count: Object.keys(existing).length });
      });
    });
    return true;
  }

  if (req.action === "getProcessedSkus") {
    chrome.storage.local.get('processedSkus', (res) => {
      sendResponse({ skus: res.processedSkus || {} });
    });
    return true;
  }

  if (req.action === "clearProcessedSkus") {
    chrome.storage.local.set({ processedSkus: {} }, () => {
      sendResponse({ success: true });
    });
    return true;
  }

  // === ELDORADO RESOLVER ===
  if (req.action === "resolveElLink") {
      const searchUrl = `https://www.eldorado.ru/search/catalog.php?q=${req.sku}`;
      fetch(searchUrl)
        .then(r => r.text())
        .then(html => {
            const match = html.match(/<script id="__NEXT_DATA__" type="application\/json">([\s\S]*?)<\/script>/);
            if (match && match[1]) {
                try {
                    const data = JSON.parse(match[1]);
                    const state = data.props?.initialState;
                    const listing = state?.['listing-module'];
                    const searchIds = listing?.productsIds || [];
                    
                    if (searchIds.length > 0) {
                        const targetId = searchIds[0];
                        const productStore = state?.['products-store-module']?.products || {};
                        const product = productStore[targetId];
                        if (product && product.code) {
                            sendResponse({ url: `https://www.eldorado.ru/cat/detail/${product.code}/` });
                            return;
                        }
                    }
                } catch(e) {}
            }
            sendResponse({ url: searchUrl });
        })
        .catch(() => sendResponse({ url: searchUrl }));
      return true;
  }
});


// === УТИЛИТА: форматирование длительности бана ===
function formatBanDuration(bannedAt) {
  const start = new Date(bannedAt);
  const end = new Date();
  const diffMs = end - start;
  const diffMin = Math.floor(diffMs / 60000);
  const h = Math.floor(diffMin / 60);
  const m = diffMin % 60;
  const fmt = (d) => d.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
  const duration = h > 0 ? `${h}ч ${m}мин` : `${m}мин`;
  return `${fmt(start)} — ${fmt(end)} (${duration})`;
}

// === BULK AVAILABILITY CHECK (#3) ===
async function bulkCheckAvailability(items, store, senderTabId) {
  const results = [];

  function sendProgress(current, total) {
    try { chrome.tabs.sendMessage(senderTabId, { action: 'bulkCheckProgress', current, total }); } catch(e) {}
  }

  if (store === 'mvideo') {
    // М.Видео — Angular SPA: HTML-парсинг и BFF prices не определяют наличие.
    // Единственный надёжный способ — открыть вкладку, дождаться рендера, инжектнуть readProductInfo.
    // Создаём свёрнутое окно, чтобы вкладки не мелькали у пользователя
    const checkWindow = await chrome.windows.create({ url: 'about:blank', state: 'minimized', focused: false });
    const checkWindowId = checkWindow.id;

    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      let price = null;

      try {
        const tab = await chrome.tabs.create({ url: item.url, windowId: checkWindowId, active: false });
        await new Promise((resolve) => {
          const timeout = setTimeout(() => { chrome.tabs.onUpdated.removeListener(listener); resolve(); }, 15000);
          const listener = (tabId, changeInfo) => {
            if (tabId === tab.id && changeInfo.status === 'complete') {
              chrome.tabs.onUpdated.removeListener(listener);
              clearTimeout(timeout);
              resolve();
            }
          };
          chrome.tabs.onUpdated.addListener(listener);
        });
        // Даём Angular 3 сек на рендер
        await new Promise(r => setTimeout(r, 3000));

        const injection = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProductInfo });
        const data = injection[0]?.result;
        price = data?.price ?? null;

        // Закрываем вкладку
        await chrome.tabs.remove(tab.id);

        if (!data || !data.sku) {
          results.push({ sku: item.sku, status: 'error', price });
        } else if (data.problemType === 'banned') {
          results.push({ sku: item.sku, status: 'banned', price });
        } else if (data.problemType === 'sold_out') {
          results.push({ sku: item.sku, status: 'sold_out', price });
        } else if (data.problemType === 'low_stock') {
          results.push({ sku: item.sku, status: 'low_stock', price });
        } else {
          results.push({ sku: item.sku, status: 'available', price });
        }
      } catch (e) {
        results.push({ sku: item.sku, status: 'error', price });
      }
      sendProgress(i + 1, items.length);
      if (i < items.length - 1) await new Promise(r => setTimeout(r, 500));
    }
    // Закрываем свёрнутое окно проверки
    try { await chrome.windows.remove(checkWindowId); } catch(e) {}
  } else {
    // Эльдорадо: последовательные запросы с задержкой
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      try {
        const r = await fetch(item.url, { headers: { 'Cache-Control': 'no-cache' } });
        const html = await r.text();
        const lower = html.toLowerCase().replace(/\s+/g, ' ');
        const isSoldOut = lower.includes('нет в наличии') || lower.includes('сообщить о поступлении');
        const isLow = lower.includes('почти закончился') || lower.includes('осталось мало');

        let price = null;
        const priceMatch = html.match(/"price"\s*:\s*(\d+)/);
        if (priceMatch) price = parseInt(priceMatch[1]);

        if (isSoldOut) {
          results.push({ sku: item.sku, status: 'sold_out', price });
        } else if (isLow) {
          results.push({ sku: item.sku, status: 'low_stock', price });
        } else {
          results.push({ sku: item.sku, status: 'available', price });
        }
      } catch (e) {
        results.push({ sku: item.sku, status: 'error', price: null });
      }
      sendProgress(i + 1, items.length);
      // Задержка между запросами для Эльдорадо
      if (i < items.length - 1) {
        await new Promise(r => setTimeout(r, 400));
      }
    }
  }

  return results;
}

// === БЫСТРАЯ ПРОВЕРКА СНЯТИЯ БАНА (каждые 30 сек) ===
function scheduleBanCheck() {
  chrome.alarms.get('banQuickCheck', (existing) => {
    if (!existing) chrome.alarms.create('banQuickCheck', { delayInMinutes: 0.5 });
  });
}

async function runBanQuickCheck() {
  const { monitoredItems = [] } = await chrome.storage.local.get('monitoredItems');
  const bannedItems = monitoredItems.filter(i => i.lastStatus === 'banned' && i.store === 'mvideo');
  if (bannedItems.length === 0) return; // нечего проверять — не переназначаем alarm

  const updatedItems = [...monitoredItems];
  const unbannedItems = [];

  for (const item of bannedItems) {
    const idx = updatedItems.findIndex(i => i.sku === item.sku);
    try {
      const r = await fetch(
        `https://www.mvideo.ru/bff/products/prices?productIds=${item.sku}&addBonusRubles=false&isPromoApplied=true`,
        { headers: { 'Cache-Control': 'no-cache' } }
      );
      if (r.status === 200) {
        const data = await r.json();
        const priceData = data.body?.materialPrices?.[0]?.price;
        const price = priceData?.basePromoPrice ?? priceData?.basePrice;
        updatedItems[idx] = { ...item, lastStatus: price ? 'available' : 'sold_out' };
        unbannedItems.push({ sku: item.sku, url: item.url, bannedAt: item.bannedAt || item.addedAt });
      }
    } catch (e) {}
  }

  await chrome.storage.local.set({ monitoredItems: updatedItems });
  if (unbannedItems.length > 0) {
    const first = unbannedItems[0];
    const title = unbannedItems.length === 1
      ? `С товара ${first.sku} снят БАН!`
      : `С товара ${first.sku} и ещё ${unbannedItems.length - 1} снят БАН!`;
    const durations = unbannedItems.map(i => `${i.sku}: ${formatBanDuration(i.bannedAt)}`).join('\n');
    await chrome.storage.session.set({ notifUrls_banCheck: unbannedItems.map(i => i.url) });
    chrome.notifications.create('ban-check-batch', {
      type: 'basic', iconUrl: 'icon.png',
      title: '🔓 ' + title,
      message: durations, priority: 2
    });
    chrome.action.setBadgeText({ text: String(unbannedItems.length) });
    chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
  }

  // Переназначаем alarm если ещё остались забаненные товары
  if (updatedItems.some(i => i.lastStatus === 'banned')) {
    chrome.alarms.create('banQuickCheck', { delayInMinutes: 0.5 });
  }
}

async function runMonitorCheck() {
  const { monitoredItems = [] } = await chrome.storage.local.get('monitoredItems');
  if (monitoredItems.length === 0) return;

  const updatedItems = [];
  const banLiftedItems = [];
  const availableSkus = [];

  for (const item of monitoredItems) {
    let newStatus = item.lastStatus;
    let newBannedAt = item.bannedAt;

    try {
      if (item.store === 'mvideo') {
        const r = await fetch(
          `https://www.mvideo.ru/bff/products/prices?productIds=${item.sku}&addBonusRubles=false&isPromoApplied=true`,
          { headers: { 'Cache-Control': 'no-cache' } }
        );
        if (r.status === 200) {
          const data = await r.json();
          const priceData = data.body?.materialPrices?.[0]?.price;
          const price = priceData?.basePromoPrice ?? priceData?.basePrice;
          newStatus = price ? 'available' : 'sold_out';
        } else if (r.status === 400 || r.status === 403 || r.status === 429) {
          newStatus = 'banned';
          if (item.lastStatus !== 'banned') newBannedAt = Date.now();
        }
      } else if (item.store === 'eldorado') {
        const r = await fetch(item.url, { headers: { 'Cache-Control': 'no-cache' } });
        const html = await r.text();
        const lower = html.toLowerCase().replace(/\s+/g, ' ');
        const isSoldOut = lower.includes('нет в наличии') || lower.includes('сообщить о поступлении');
        newStatus = isSoldOut ? 'sold_out' : 'available';
        await new Promise(r => setTimeout(r, 400));
      }
    } catch (e) {
      updatedItems.push(item);
      continue;
    }

    const wasProblematic = item.lastStatus === 'sold_out' || item.lastStatus === 'banned';
    const isNowGood = newStatus === 'available';

    if (wasProblematic && isNowGood) {
      if (item.lastStatus === 'banned') banLiftedItems.push({ sku: item.sku, url: item.url, bannedAt: item.bannedAt || item.addedAt });
      else availableSkus.push(item.sku);

      if (item.afterNotify === 'auto-remove') continue;
    }

    updatedItems.push({ ...item, lastStatus: newStatus, bannedAt: newBannedAt });
  }

  await chrome.storage.local.set({ monitoredItems: updatedItems });

  const totalChanges = banLiftedItems.length + availableSkus.length;
  if (totalChanges > 0) {
    // Одно сводное уведомление
    const parts = [];
    if (banLiftedItems.length > 0) {
      const first = banLiftedItems[0];
      const banTitle = banLiftedItems.length === 1
        ? `С товара ${first.sku} снят БАН!`
        : `С товара ${first.sku} и ещё ${banLiftedItems.length - 1} снят БАН!`;
      const durations = banLiftedItems.map(i => `${i.sku}: ${formatBanDuration(i.bannedAt)}`).join('\n');
      parts.push(`${banTitle}\n${durations}`);
    }
    if (availableSkus.length > 0) parts.push(`В наличии: ${availableSkus.join(', ')}`);
    const title = banLiftedItems.length > 0 && availableSkus.length === 0
      ? '🔓 Бан снят — SKU Master'
      : '✅ Обновление — SKU Master';
    const notifUrls = [
      ...banLiftedItems.map(i => i.url),
      ...availableSkus.map(sku => monitoredItems.find(i => i.sku === sku)?.url).filter(Boolean)
    ];
    if (notifUrls.length > 0) await chrome.storage.session.set({ notifUrls_monitor: notifUrls });
    chrome.notifications.create('monitor-batch', {
      type: 'basic', iconUrl: 'icon.png',
      title, message: parts.join('\n'), priority: 2
    });
    chrome.action.setBadgeText({ text: String(totalChanges) });
    chrome.action.setBadgeBackgroundColor({ color: '#28a745' });
  }
}

async function collectAllTabs(targetWindowId) {
  const tabs = await chrome.tabs.query({ windowId: targetWindowId, url: ["*://www.eldorado.ru/*", "*://www.mvideo.ru/*"] });
  const results = [];
  const mvideoIds = [];
  const eldoradoIds = [];

  for (const tab of tabs) {
    if (!isProductUrl(tab.url)) continue;
    if (tab.url.includes('mvideo')) mvideoIds.push(tab.id); else eldoradoIds.push(tab.id);

    if (blockedTabs.has(tab.id)) {
        let sku = "Неизвестно";
        const match = tab.url.match(/(\d+)(\/?)$/);
        if (match) sku = match[1];
        results.push({ tabId: tab.id, url: tab.url, sku: sku, problemType: 'banned', regionError: false });
        continue;
    }

    if (tab.discarded) {
      results.push({ tabId: tab.id, url: tab.url, title: tab.title, isSleeping: true });
      continue;
    }

    try {
      const injection = await chrome.scripting.executeScript({ target: { tabId: tab.id }, func: readProductInfo });
      const data = injection[0].result;
      if (data) {
        if (data.problemType === 'banned') { blockedTabs.set(tab.id, "Detected Internal"); saveBlockedTabs(); }
        results.push({ tabId: tab.id, url: tab.url, sku: data.sku, problemType: data.problemType, regionError: data.regionError });
      }
    } catch (e) {
      results.push({ tabId: tab.id, url: tab.url, title: tab.title, isSleeping: true });
    }
  }
  
  const finalData = { results, mvCount: mvideoIds.length, elCount: eldoradoIds.length, mvIds: mvideoIds, elIds: eldoradoIds, timestamp: Date.now() };
  
  chrome.storage.local.get('scanHistory', (res) => {
      const history = res.scanHistory || [];
      history.unshift(finalData);
      if (history.length > 5) history.pop();
      chrome.storage.local.set({ lastScanData: finalData, scanHistory: history });
  });

  return finalData;
}