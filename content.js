// content.js - WIDGET UI v5.0.0 (Bulk Check + Duplicate Detection)

const isTop = window === window.top;
let widgetObserver = null; 
let batchRunning = false; 

// === SUPPORT WIDGET FILTER ===
function toggleSupportWidgets(shouldHide) {
    const styleId = 'sku-master-widget-hide';
    
    // Расширенный список селекторов (включая старые и новые)
    const cssRules = `
        #__threadswidget_root,
        #jivo-iframe-container,
        jdiv,
        div[aria-label="Open"],
        div[aria-label="Открыть онлайн-консультант"], 
        div[class*="chat-button"],
        div[class*="ChatButton"],
        .chat-button, 
        mvid-chat-button,
        iframe[src*="threadswidget"],
        iframe[src*="jivosite"],
        [data-testid="chat-button"]
        { display: none !important; opacity: 0 !important; pointer-events: none !important; visibility: hidden !important; width: 0 !important; height: 0 !important; }
    `;

    // Функция: Вставка стиля + Прямое скрытие элементов
    const injectStyle = () => {
        // 1. Возвращаем стиль, если его снесли
        if (!document.getElementById(styleId)) {
            const styleTag = document.createElement('style');
            styleTag.id = styleId;
            styleTag.textContent = cssRules;
            (document.head || document.documentElement).appendChild(styleTag);
        }

        // 2. Страховка: ищем и давим конкретные ID напрямую
        const widgetRoot = document.getElementById('__threadswidget_root');
        if (widgetRoot) widgetRoot.style.display = 'none';
        
        const jivoRoot = document.getElementById('jivo-iframe-container');
        if (jivoRoot) jivoRoot.style.display = 'none';
    };

    if (shouldHide) {
        // Первичный запуск
        injectStyle();
        
        // Создаем "Сторожевого пса"
        if (!widgetObserver) {
            widgetObserver = new MutationObserver((mutations) => {
                // Если сайт перерисовал <head> и удалил наш стиль - восстанавливаем
                if (!document.getElementById(styleId)) {
                    injectStyle();
                }
                // Также пытаемся скрыть элементы, если они появились динамически
                const widgetRoot = document.getElementById('__threadswidget_root');
                if (widgetRoot && widgetRoot.style.display !== 'none') {
                    widgetRoot.style.display = 'none';
                }
            });
            
            // Следим за всем документом (head + body), чтобы поймать удаление стиля
            widgetObserver.observe(document.documentElement, { childList: true, subtree: true });
        }
    } else {
        // Отключение: удаляем стиль и наблюдателя
        const styleTag = document.getElementById(styleId);
        if (styleTag) styleTag.remove();
        
        // Возвращаем видимость (по желанию)
        const widgetRoot = document.getElementById('__threadswidget_root');
        if (widgetRoot) widgetRoot.style.display = '';

        if (widgetObserver) {
            widgetObserver.disconnect();
            widgetObserver = null;
        }
    }
}

chrome.storage.local.get(['replaceChatBtn'], (res) => {
    toggleSupportWidgets(res.replaceChatBtn === true);
});
chrome.storage.onChanged.addListener((changes) => {
    if (changes.replaceChatBtn) {
        toggleSupportWidgets(changes.replaceChatBtn.newValue === true);
    }
});

// === MAIN INTERFACE ===
function initInterface() {
    if (!isTop) return; 

    console.info("%c SKU Master 5.0.0 ", "background: #28a745; color: white; padding: 2px 5px; border-radius: 3px;");
    const ICON_URL = chrome.runtime.getURL("icon.png");

    // Stub overwritten by createPanel once toastMsg element exists
    let showToast = (text) => console.log('[SKU Master toast]', text);

    // --- Helpers ---
    async function smartCopy(text, html = null, callback = null) {
        try {
            const items = {};
            items["text/plain"] = new Blob([text], { type: "text/plain" });
            if (html) items["text/html"] = new Blob([html], { type: "text/html" });
            await navigator.clipboard.write([new ClipboardItem(items)]);
            if (callback) callback(true);
        } catch (err) {
            if (callback) callback(false);
        }
    }

    function downloadAsXLS(filename, content) {
        const html = `
          <html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel" xmlns="http://www.w3.org/TR/REC-html40">
          <head><meta charset="UTF-8"></head><body>${content}</body></html>`;
        const blob = new Blob([html], { type: 'application/vnd.ms-excel' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = filename;
        document.body.appendChild(link);
        link.click();
        URL.revokeObjectURL(url); // освобождаем память
        link.remove();
    }

    function injectLink(container, cleanText, labelHtml = '') {
      if (container.dataset.processed) return;
      container.dataset.processed = "true";
      container.innerHTML = `
        ${labelHtml} 
        <span class="sku-copy-btn" 
              style="color: #007bff; text-decoration: underline; font-weight: bold; margin-left: 5px; cursor: pointer;"
              title="Нажмите, чтобы скопировать">
              ${cleanText}
        </span>
        <span class="ext-msg" style="display: none; color: #28a745; font-size: 12px; margin-left: 8px; font-weight:normal;">OK</span>
      `;
      const btn = container.querySelector('.sku-copy-btn');
      const msg = container.querySelector('.ext-msg');
      btn.addEventListener("click", (e) => {
          e.preventDefault(); e.stopPropagation();
          const linkHtml = `<a href="${window.location.href}">${cleanText}</a>`;
          smartCopy(cleanText, linkHtml, (success) => {
              if (success) {
                  msg.style.display = "inline"; msg.style.opacity = "1";
                  setTimeout(() => { msg.style.display = "none"; }, 1200);
              } else {
                  msg.innerText = "Err"; msg.style.color = "red"; msg.style.display = "inline";
                  setTimeout(() => { msg.style.display = "none"; }, 1200);
              }
          });
      });
    }

    function processPage() {
      const host = window.location.hostname;
      if (host.includes('eldorado.ru')) {
        const btn = document.querySelector('button[data-dy="article"]');
        if (btn) {
            const cleanSku = btn.innerText.replace(/[^0-9]/g, '');
            injectLink(btn, cleanSku, ''); 
        }
      } 
      else if (host.includes('mvideo.ru')) {
        document.querySelectorAll('span[mvidremovespaces]').forEach(span => {
          const clean = span.innerText.replace(/\s/g, '');
          if (/^\d+$/.test(clean) && clean.length > 5) {
              injectLink(span, clean, '');
          }
        });
      }
    }
    const observer = new MutationObserver(processPage);
    if (document.body) {
      observer.observe(document.body, { childList: true, subtree: true });
      processPage();
      window.addEventListener('beforeunload', () => observer.disconnect(), { once: true });
    }

    function checkRegionAndWarn() {
        const host = window.location.hostname;
        let regionElement = null;
        let currentRegionText = "";

        if (host.includes('mvideo.ru')) {
            const textNode = document.querySelector('.location-text');
            regionElement = textNode ? textNode.closest('.location') || textNode : null;
        } 
        else if (host.includes('eldorado.ru')) {
            const textSpan = document.querySelector('.elme');
            if (textSpan) regionElement = textSpan.closest('button') || textSpan;
            else {
                const pinIcon = document.querySelector('svg path[d^="M8.057 8a2.012"]');
                if (pinIcon) regionElement = pinIcon.closest('button');
            }
        }

        if (regionElement) {
            currentRegionText = regionElement.innerText.trim();
            if (currentRegionText && !currentRegionText.toLowerCase().includes('москва')) {
                showRegionAlert(regionElement, currentRegionText);
            }
        }
    }

    function showRegionAlert(targetElement, currentText) {
        if (document.getElementById('region-guard-alert')) return;
        const alertDiv = document.createElement('div');
        alertDiv.id = 'region-guard-alert';
        alertDiv.style.cssText = `
            position: fixed; top: 80px; right: 20px; width: 320px;
            background: #fff; border-left: 5px solid #dc3545;
            box-shadow: 0 5px 25px rgba(0,0,0,0.3); border-radius: 4px;
            z-index: 2147483647; font-family: 'Segoe UI', sans-serif;
            padding: 15px; animation: slideInRight 0.3s ease-out;
        `;
        alertDiv.innerHTML = `
            <style>
                @keyframes slideInRight { from { transform: translateX(100%); opacity: 0; } to { transform: translateX(0); opacity: 1; } }
                .rg-title { font-weight: bold; font-size: 14px; color: #dc3545; margin-bottom: 5px; display: flex; align-items: center; gap: 8px; }
                .rg-text { font-size: 13px; color: #333; margin-bottom: 12px; line-height: 1.4; }
                .rg-current { background: #fee2e2; padding: 2px 6px; border-radius: 4px; color: #b91c1c; font-weight: 700; }
                .rg-actions { display: flex; gap: 10px; }
                .rg-btn { flex: 1; padding: 8px; border: none; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; text-align: center; transition: 0.2s; }
                .rg-btn-fix { background: #dc3545; color: white; }
                .rg-btn-fix:hover { background: #c82333; }
                .rg-btn-skip { background: #f8f9fa; color: #666; border: 1px solid #ddd; }
                .rg-btn-skip:hover { background: #e2e6ea; }
            </style>
            <div class="rg-title"><span style="font-size:18px;">📍</span> Регион не Москва!</div>
            <div class="rg-text">Текущий регион: <span class="rg-current">${currentText}</span>.<br>Для корректных цен нужна Москва.</div>
            <div class="rg-actions"><button id="rgFixBtn" class="rg-btn rg-btn-fix">ПОКАЗАТЬ ГДЕ</button><button id="rgSkipBtn" class="rg-btn rg-btn-skip">Пропустить</button></div>
        `;
        document.body.appendChild(alertDiv);
        document.getElementById('rgSkipBtn').onclick = () => alertDiv.remove();
        document.getElementById('rgFixBtn').onclick = () => {
            window.scrollTo({ top: 0, behavior: 'smooth' });
            if (targetElement) {
                const originalZ = targetElement.style.zIndex; const originalPos = targetElement.style.position;
                targetElement.style.transition = "all 0.3s ease-in-out"; targetElement.style.position = "relative"; targetElement.style.zIndex = "10000";
                let count = 0;
                const interval = setInterval(() => {
                    count++; targetElement.style.outline = (count % 2 !== 0) ? "4px solid #dc3545" : "none"; targetElement.style.transform = (count % 2 !== 0) ? "scale(1.1)" : "scale(1)";
                    if (count >= 6) { clearInterval(interval); targetElement.style.zIndex = originalZ; targetElement.style.position = originalPos; targetElement.style.transform = ""; targetElement.style.outline = ""; }
                }, 400);
            }
            alertDiv.remove();
        };
    }
    setTimeout(checkRegionAndWarn, 1500);

    async function checkBanStatus(productId, bannerElement) {
        const statusSpan = bannerElement.querySelector('#ban-status-text');
        statusSpan.innerHTML = '⏳...';
        try {
            const checkUrl = `https://www.mvideo.ru/bff/products/prices?productIds=${productId}&addBonusRubles=false&isPromoApplied=true`;
            const response = await fetch(checkUrl, { headers: { 'Cache-Control': 'no-cache' } });
            if (response.status === 200) {
                const data = await response.json();
                const priceData = data.body?.materialPrices?.[0]?.price;
                const price = priceData?.basePromoPrice ?? priceData?.basePrice ?? '???';
                bannerElement.style.background = '#2e7d32'; 
                bannerElement.querySelector('#ban-left-part').innerHTML = `<span style="font-weight:bold;">✅ ДОСТУП ЕСТЬ!</span> <span style="font-size:12px;">Цена: ${price} ₽</span>`;
                statusSpan.innerHTML = '';
            } else { statusSpan.innerHTML = `⛔ Код ${response.status}`; }
        } catch (e) { statusSpan.innerHTML = `❌ Ошибка`; }
    }

    function showBanBanner(timestamp) {
        document.body.setAttribute('data-request-blocked', 'true');
        if (document.getElementById('ban-alert-strip')) return;
        const match = window.location.href.match(/(\d+)(\/?)$/);
        const productId = match ? match[1] : null;
        const banBanner = document.createElement('div');
        banBanner.id = 'ban-alert-strip';
        banBanner.style.cssText = `position:fixed;top:0;left:0;width:100%;background:#212121;color:#fff;z-index:9999999;padding:8px 15px;display:flex;justify-content:space-between;align-items:center;box-shadow:0 4px 15px rgba(0,0,0,0.5);font-family:sans-serif;`;
        const leftPart = `<div id="ban-left-part" style="display:flex;flex-direction:column;"><span style="font-weight:bold;color:#ff9800;font-size:13px;">⛔ МЯГКИЙ БАН</span><span style="font-size:10px;color:#aaa;">${timestamp || ''}</span></div>`;
        const rightPart = document.createElement('div');
        rightPart.style.cssText = "display:flex;align-items:center;gap:10px;";
        const statusText = document.createElement('span'); statusText.id = 'ban-status-text'; statusText.style.fontSize = '12px';
        const checkBtn = document.createElement('button'); checkBtn.innerText = "Проверить";
        checkBtn.style.cssText = `background:#007bff;border:none;color:white;padding:4px 8px;border-radius:4px;cursor:pointer;font-weight:bold;font-size:11px;`;
        const closeB = document.createElement('div'); closeB.innerText = '✕'; closeB.style.cssText = 'cursor:pointer;margin-left:8px;'; closeB.onclick=()=>banBanner.remove();
        if (productId) checkBtn.onclick = () => checkBanStatus(productId, banBanner); else { checkBtn.disabled = true; checkBtn.style.background = "#555"; }
        rightPart.appendChild(statusText); rightPart.appendChild(checkBtn); rightPart.appendChild(closeB);
        banBanner.innerHTML = leftPart; banBanner.appendChild(rightPart);
        document.body.appendChild(banBanner);
    }

    // Основной путь: сигнал от network_throttle.js (MAIN world) напрямую, без service worker
    // document — единственный общий DOM-объект между MAIN и ISOLATED worlds в Chrome
    document.addEventListener('sku-ban-detected', (e) => {
        showBanBanner(e.detail.timestamp);
    });

    // Резервный путь: сигнал от background.js через webRequest (если service worker активен)
    chrome.runtime.onMessage.addListener((req) => {
        if (req.action === "requestBlocked") {
            showBanBanner(req.timestamp);
        }
    });

    let panelState = { mvideoIds: [], eldoradoIds: [], results: [] };
    let batchState = { uniqueSkus: [], isMvideo: null, resolvedLinks: [] }; 
    
    let widgetState = {
        x: window.innerWidth - 80,
        y: window.innerHeight - 80,
        isOpen: false,
        quadrant: 'bottom-right',
        isFixedMode: false,
        lastPLeft: 0,
        lastPTop: -520
    };

    const CSS = `
      /* ── BASE ── */
      .wrapper-container * { box-sizing: border-box; }
      .wrapper-container { position: fixed; z-index: 2147483647; }

      /* ── FAB ── */
      .fab-launcher {
        position: absolute; width: 56px; height: 56px;
        border-radius: 28px;
        background: #0d1117;
        box-shadow: 0 4px 20px rgba(37,99,235,0.4), 0 2px 8px rgba(0,0,0,0.5);
        border: 1.5px solid rgba(37,99,235,0.55);
        cursor: grab;
        display: flex; align-items: center; justify-content: center;
        user-select: none;
        transition: transform 0.18s ease, box-shadow 0.18s ease, opacity 0.15s ease;
        z-index: 2;
      }
      .fab-launcher:hover {
        transform: scale(1.06);
        box-shadow: 0 6px 26px rgba(37,99,235,0.55), 0 2px 10px rgba(0,0,0,0.6);
      }
      .fab-launcher:active { cursor: grabbing; transform: scale(0.97); }
      .fab-launcher img { width: 30px; height: 30px; object-fit: contain; pointer-events: none; }

      /* ── MORPH ICON (floats above everything, animated by JS) ── */
      .morph-icon {
        position: absolute; z-index: 20; pointer-events: none;
        display: flex; align-items: center; justify-content: center;
        opacity: 0;
      }
      .morph-icon img { object-fit: contain; display: block; }

      /* FAB hidden states */
      .fab-launcher.hidden { opacity: 0; pointer-events: none; }
      .fab-launcher.hidden-instant { opacity: 0 !important; pointer-events: none !important; transition: none !important; }

      /* ── FAB CLOSE BTN ── */
      .fab-close-btn {
        position: absolute; top: -8px; right: -8px;
        width: 20px; height: 20px; border-radius: 50%;
        background: #dc2626; color: white;
        display: flex; align-items: center; justify-content: center;
        font-size: 12px; line-height: 1; cursor: pointer;
        opacity: 0; transform: scale(0.4);
        transition: opacity 0.18s ease, transform 0.18s ease;
        box-shadow: 0 2px 8px rgba(0,0,0,0.5); z-index: 10;
      }
      .fab-launcher:hover .fab-close-btn { opacity: 1; transform: scale(1); }
      .fab-close-btn:hover { background: #b91c1c; transform: scale(1.15) !important; }

      /* ── FIXED MODE ── */
      .fixed-mode {
        width: 56px; height: 56px;
        right: 24px !important; bottom: 24px !important;
        left: auto !important; top: auto !important;
      }
      .fixed-mode .fab-launcher { cursor: pointer !important; }
      .fixed-mode .header { cursor: default !important; }

      /* ── PANEL ── */
      .panel {
        position: absolute; width: 340px;
        max-height: 80vh; min-height: 150px;
        background: #f1f5f9;
        box-shadow: 0 24px 64px rgba(0,0,0,0.22), 0 0 0 1px rgba(0,0,0,0.07);
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', system-ui, sans-serif;
        display: flex; flex-direction: column; overflow: hidden;
        border-radius: 14px; z-index: 1;
        opacity: 0; pointer-events: none;
      }
      .panel.visible { pointer-events: auto; }

      /* Content fades in AFTER morph, using JS-controlled class */
      .morph-hidden { opacity: 0; }
      .panel.content-visible .morph-hidden {
        opacity: 1;
        transition: opacity 0.22s ease;
      }

      /* ── RESIZE HANDLE ── */
      .resize-handle {
        width: 100%; height: 7px; cursor: ns-resize; flex-shrink: 0;
        display: flex; align-items: center; justify-content: center;
        background: #0d1117;
      }
      .resize-handle::after {
        content: ''; display: block;
        width: 30px; height: 3px; border-radius: 2px;
        background: rgba(255,255,255,0.18);
      }

      /* ── HEADER ── */
      .header {
        padding: 0 10px 0 12px; height: 44px;
        display: flex; justify-content: space-between; align-items: center;
        background: #0d1117;
        cursor: grab; flex-shrink: 0;
        border-bottom: 1px solid rgba(255,255,255,0.05);
      }
      .header:active { cursor: grabbing; }
      .header-title {
        font-weight: 700; font-size: 13px; letter-spacing: 0.15px;
        display: flex; align-items: center; gap: 8px;
        color: rgba(255,255,255,0.92); flex: 1;
      }
      /* Placeholder that reserves space for the morph-icon */
      .header-icon-ph { width: 18px; height: 18px; flex-shrink: 0; }
      .header-controls { display: flex; gap: 1px; }
      .btn-icon {
        background: transparent; width: 28px; height: 28px;
        display: flex; align-items: center; justify-content: center;
        color: rgba(255,255,255,1); border-radius: 6px;
        font-size: 15px; border: none; cursor: pointer;
        transition: background 0.15s;
      }
      .btn-icon:hover { background: rgba(255,255,255,0.14); }

      /* ── CONTENT ── */
      .content {
        padding: 10px; overflow-y: auto; flex-grow: 1;
        background: #f1f5f9; min-height: 60px;
      }

      /* ── FOOTER ── */
      .footer {
        padding: 12px; background: #ffffff;
        border-top: 1px solid #e2e8f0;
        display: flex; flex-direction: column; gap: 8px; flex-shrink: 0;
      }

      /* ── BUTTONS ── */
      .btn-block {
        width: 100%; padding: 10px 14px; cursor: pointer; border: none;
        border-radius: 8px; color: white; font-weight: 600; font-size: 13px;
        display: flex; justify-content: center; align-items: center;
        transition: transform 0.12s ease, opacity 0.15s, box-shadow 0.12s ease;
        box-shadow: 0 2px 6px rgba(0,0,0,0.14);
        letter-spacing: 0.1px;
      }
      .btn-block:hover { opacity: 0.91; transform: translateY(-1px); box-shadow: 0 4px 14px rgba(0,0,0,0.18); }
      .btn-block:active { transform: translateY(0); }
      .btn-primary { background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); font-size: 14px; padding: 12px; }
      .btn-warning { background: linear-gradient(135deg, #f59e0b 0%, #d97706 100%); color: white; }
      .btn-success { background: linear-gradient(135deg, #059669 0%, #047857 100%); font-size: 14px; }
      .btn-red { background: linear-gradient(135deg, #dc2626 0%, #b91c1c 100%); }
      .btn-excel { background: linear-gradient(135deg, #16a34a 0%, #15803d 100%); }
      .btn-mv { background: #E30613; color: white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-weight:600; font-size:12px; }
      .btn-el { background: #4cae23; color: white; border:none; border-radius:6px; padding:6px 10px; cursor:pointer; font-weight:600; font-size:12px; }

      /* ── ITEMS ── */
      .item {
        display: flex; justify-content: space-between; align-items: center;
        background: #fff; padding: 9px 11px; border-radius: 8px; margin-bottom: 5px;
        box-shadow: 0 1px 3px rgba(0,0,0,0.06), 0 0 0 1px rgba(0,0,0,0.04);
        transition: box-shadow 0.15s;
      }
      .item:hover { box-shadow: 0 3px 10px rgba(0,0,0,0.09), 0 0 0 1px rgba(0,0,0,0.05); }

      /* ── BADGES ── */
      .badge {
        padding: 3px 7px; border-radius: 5px;
        font-size: 9px; color: white; margin-right: 6px;
        font-weight: 700; text-transform: uppercase; letter-spacing: 0.4px;
      }
      .badge-red { background: #dc2626; }
      .badge-orange { background: #ea580c; }
      .badge-gray { background: #64748b; }
      .badge-black { background: #1e293b; color: #fbbf24; }
      .badge-purple { background: #7c3aed; }

      /* ── STATUS / TOAST ── */
      .status { text-align: center; font-size: 11px; color: #94a3b8; margin-top: 4px; font-weight: 500; }
      .toast {
        background: #1e293b; color: #f1f5f9;
        text-align: center; padding: 9px 18px; border-radius: 24px;
        font-size: 12px; font-weight: 500; white-space: nowrap;
        position: absolute; bottom: 70px; left: 50%; transform: translateX(-50%);
        z-index: 100; display: none;
        box-shadow: 0 4px 16px rgba(0,0,0,0.35);
      }

      /* ── DROPDOWNS (settings / history) ── */
      .settings-menu {
        position: absolute; top: 52px; right: 10px; width: 232px;
        background: white; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06);
        display: none; z-index: 1000; padding: 8px; overflow: hidden;
      }
      .settings-menu.active { display: block; }
      .setting-item {
        display: flex; align-items: center; gap: 10px;
        font-size: 12px; color: #334155;
        padding: 7px 8px; border-radius: 6px; cursor: pointer;
        transition: background 0.15s; margin-bottom: 2px;
      }
      .setting-item:hover { background: #f1f5f9; }

      .history-menu {
        position: absolute; top: 52px; right: 46px; width: 210px;
        background: white; border-radius: 10px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.16), 0 0 0 1px rgba(0,0,0,0.06);
        display: none; z-index: 1000; overflow: hidden;
      }
      .history-menu.active { display: block; }
      .history-item {
        padding: 10px 14px; border-bottom: 1px solid #f1f5f9;
        cursor: pointer; transition: background 0.15s;
      }
      .history-item:last-child { border-bottom: none; }
      .history-item:hover { background: #f8fafc; }
      .h-date { font-weight: 700; font-size: 12px; color: #1e293b; }
      .h-info { font-size: 11px; color: #94a3b8; margin-top: 2px; }

      /* ── SUB-FOOTER ── */
      .sub-footer {
        margin-top: 4px; padding-top: 10px; border-top: 1px dashed #e2e8f0;
        display: flex; justify-content: center; gap: 20px; font-size: 11px;
      }
      .sub-link { text-decoration: none; color: #94a3b8; transition: color 0.2s; display: flex; align-items: center; gap: 5px; }
      .sub-link:hover { color: #475569; }
      .sub-link svg { width: 12px; height: 12px; fill: currentColor; }

      /* ── BATCH AREA ── */
      .batch-area { padding: 10px; background: #fff; display:none; border-bottom: 1px solid #e2e8f0; }
      .batch-area.active { display: block; }
      .input-wrapper { position: relative; width: 100%; }
      .batch-input {
        width: 100%; height: 80px; padding: 8px 10px;
        border: 1px solid #e2e8f0; border-radius: 8px;
        font-size: 12px; resize: none; box-sizing: border-box;
        font-family: 'SF Mono', 'Consolas', monospace;
        color: #1e293b; background: #f8fafc; outline: none;
        transition: border-color 0.15s, box-shadow 0.15s;
      }
      .batch-input:focus { border-color: #2563eb; box-shadow: 0 0 0 3px rgba(37,99,235,0.1); background: #fff; }
      .clear-btn {
        position: absolute; bottom: 8px; right: 8px;
        width: 20px; height: 20px; border-radius: 50%;
        display: flex; align-items: center; justify-content: center;
        font-size: 11px; color: #94a3b8; cursor: pointer;
        opacity: 0; transition: all 0.2s; z-index: 5;
        user-select: none; background: rgba(255,255,255,0.9);
      }
      .input-wrapper:hover .clear-btn { opacity: 0.7; }
      .clear-btn:hover { opacity: 1 !important; color: white; background: #dc2626; box-shadow: 0 2px 6px rgba(0,0,0,0.2); }
      .store-switch-container { margin-top: 8px; }
      .store-switch { display: flex; background: #f1f5f9; border-radius: 8px; padding: 3px; }
      .store-opt { flex:1; padding: 6px; font-size: 12px; cursor: pointer; border-radius: 6px; color: #64748b; font-weight: 600; text-align:center; transition: all 0.18s; user-select:none; }
      .store-opt.active { background: white; color: #0f172a; box-shadow: 0 1px 4px rgba(0,0,0,0.1); }
      .store-opt.mv.active { color: #E30613; }
      .store-opt.el.active { color: #16a34a; }
      #batchAnalyzeBtn { width:100%; padding:9px; font-size:12px; margin-top:8px; cursor: pointer; border-radius:8px; }
      .batch-actions-wrapper { display:none; flex-direction:column; gap:8px; margin-top:8px; }
      .batch-row-buttons { display:flex; gap:6px; }
      .batch-row-buttons button { flex:1; }
      .batch-stats { font-size:11px; color:#64748b; display:flex; justify-content:space-between; padding:0 2px; }
      .batch-progress { font-size:11px; color:#2563eb; margin-top:5px; text-align:center; display:none; font-weight:500; }

      /* ── MONITOR PANEL ── */
      .monitor-area { padding: 10px; background: #fff; display:none; border-bottom: 1px solid #e2e8f0; }
      .monitor-area.active { display: block; }
      .monitor-empty { text-align:center; padding: 20px 10px; color: #94a3b8; font-size: 12px; line-height: 1.6; }
      .monitor-item {
        display:flex; justify-content:space-between; align-items:center;
        background:#f8fafc; padding:8px 10px; border-radius:8px; margin-bottom:5px;
        border: 1px solid #e2e8f0; font-size:12px; transition: box-shadow 0.15s;
      }
      .monitor-item:hover { box-shadow: 0 2px 8px rgba(0,0,0,0.07); }
      .monitor-item-left { display:flex; flex-direction:column; gap:2px; }
      .monitor-item-sku { font-weight:700; color:#1e293b; }
      .monitor-item-status { font-size:10px; color:#64748b; }
      .monitor-remove-btn { background:none; border:none; color:#cbd5e1; cursor:pointer; font-size:18px; padding:0 4px; line-height:1; transition:color 0.15s; }
      .monitor-remove-btn:hover { color:#dc2626; }
      .monitor-settings { margin-top:10px; padding-top:10px; border-top:1px solid #e2e8f0; display:flex; flex-direction:column; gap:8px; }
      .monitor-row { display:flex; align-items:center; justify-content:space-between; font-size:12px; color:#334155; }
      .monitor-interval-input { width:52px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; font-size:12px; text-align:center; outline:none; }
      .monitor-interval-input:focus { border-color:#2563eb; }
      .monitor-after-select { font-size:11px; padding:4px 6px; border:1px solid #e2e8f0; border-radius:6px; color:#334155; outline:none; }
      .monitor-run-btn { font-size:11px; padding:5px 12px; background:#2563eb; color:white; border:none; border-radius:6px; cursor:pointer; font-weight:600; transition:background 0.15s; }
      .monitor-run-btn:hover { background:#1d4ed8; }
      .btn-watch { background:none; border:1.5px solid #2563eb; color:#2563eb; border-radius:5px; font-size:10px; font-weight:600; padding:3px 7px; cursor:pointer; white-space:nowrap; margin-left:4px; transition:all 0.15s; }
      .btn-watch:hover { background:#2563eb; color:white; }
      .btn-watch.watching { border-color:#059669; color:#059669; }
      .btn-watch.watching:hover { background:#059669; color:white; }

      /* ── BULK CHECK RESULTS (#3) ── */
      .bulk-results { margin-top:8px; max-height:200px; overflow-y:auto; border:1px solid #e2e8f0; border-radius:8px; background:#f8fafc; }
      .bulk-item {
        display:flex; justify-content:space-between; align-items:center;
        padding:7px 10px; border-bottom:1px solid #f1f5f9; font-size:12px;
      }
      .bulk-item:last-child { border-bottom:none; }
      .bulk-item-sku { font-weight:700; color:#1e293b; font-family:'SF Mono','Consolas',monospace; }
      .bulk-item-price { color:#059669; font-weight:600; font-size:11px; }
      .bulk-item-status { padding:2px 6px; border-radius:4px; font-size:9px; font-weight:700; text-transform:uppercase; letter-spacing:0.3px; }
      .bs-available { background:#dcfce7; color:#166534; }
      .bs-sold-out { background:#fee2e2; color:#991b1b; }
      .bs-low-stock { background:#fff7ed; color:#9a3412; }
      .bs-banned { background:#1e293b; color:#fbbf24; }
      .bs-error { background:#f1f5f9; color:#64748b; }
      .bulk-summary { padding:8px 10px; font-size:11px; color:#64748b; display:flex; justify-content:space-between; border-bottom:1px solid #e2e8f0; background:#fff; border-radius:8px 8px 0 0; }

      /* ── DUPLICATE BADGE (#7) ── */
      .badge-dupe { background: #7c3aed; color: white; }
      .dupe-notice {
        background:#faf5ff; border:1px solid #e9d5ff; border-radius:8px;
        padding:8px 12px; margin-bottom:8px; font-size:11px; color:#6b21a8;
        display:flex; justify-content:space-between; align-items:center;
      }
      .dupe-notice-text { line-height:1.4; }
      .mark-processed-btn {
        font-size:11px; padding:5px 10px; background:#7c3aed; color:white;
        border:none; border-radius:6px; cursor:pointer; font-weight:600;
        white-space:nowrap; margin-left:8px; transition:background 0.15s;
      }
      .mark-processed-btn:hover { background:#6d28d9; }
      .clear-processed-btn {
        font-size:10px; padding:3px 8px; background:#f1f5f9; color:#64748b;
        border:1px solid #e2e8f0; border-radius:4px; cursor:pointer;
        transition:all 0.15s;
      }
      .clear-processed-btn:hover { background:#fee2e2; color:#dc2626; border-color:#fecaca; }
    `;

    function createPanel() {
      if (document.getElementById('sku-master-host')) return;
      const host = document.createElement('div');
      host.id = 'sku-master-host';
      const shadow = host.attachShadow({ mode: 'open' });
      document.body.appendChild(host);
      const style = document.createElement('style');
      style.textContent = CSS;
      shadow.appendChild(style);

      const wrapper = document.createElement('div');
      wrapper.classList.add('wrapper-container');
      wrapper.innerHTML = `
        <div class="fab-launcher" id="fabBtn" title="SKU Master">
            <img src="${ICON_URL}">
            <div class="fab-close-btn" id="fabCloseBtn" title="Скрыть виджет">×</div>
        </div>

        <!-- Floating icon: hidden by default, animated by JS only during open/close -->
        <div class="morph-icon" id="morphIcon" style="opacity:0;pointer-events:none"><img src="${ICON_URL}" width="30" height="30"></div>

        <div class="panel" id="mainPanel">
            <div class="resize-handle" id="resizeHandle"></div>
            <div class="header" id="dragHeader">
              <div class="header-title">
                  <div class="header-icon-ph"></div> SKU Master 5.0.0
              </div>
              <div class="header-controls">
                  <button class="btn-icon" id="batchBtn" title="Пакетное открытие">⚡</button>
                  <button class="btn-icon" id="monitorBtn" title="Мониторинг">👁</button>
                  <button class="btn-icon" id="historyBtn" title="История (последние 5)">🕒</button>
                  <button class="btn-icon" id="settingsBtn" title="Настройки">⋮</button>
                  <button class="btn-icon" id="hideBtn" title="Свернуть">✕</button>
              </div>
            </div>

            <div class="settings-menu" id="settingsMenu">
                <label class="setting-item"><input type="checkbox" id="protectionToggle"><div><span>Защита от бана (М.Видео)</span></div></label>
                <label class="setting-item"><input type="checkbox" id="replaceChatToggle"><div><span>Закрепить в углу экрана</span></div></label>
            </div>

            <div class="history-menu" id="historyMenu">
                <div style="padding:10px; text-align:center; color:#999; font-size:12px;">Пусто</div>
            </div>

            <div class="batch-area" id="batchArea">
                <div class="input-wrapper">
                    <textarea class="batch-input" id="batchInput" placeholder="Вставьте текст или ссылку на Google Doc..."></textarea>
                    <div class="clear-btn" id="batchClearBtn" title="Очистить поле">✕</div>
                </div>
                
                <div class="store-switch-container">
                    <div class="store-switch">
                        <div class="store-opt mv" id="storeMv">М.Видео</div>
                        <div class="store-opt el" id="storeEl">Эльдорадо</div>
                    </div>
                </div>

                <button id="batchAnalyzeBtn" class="btn-block btn-primary">🔍 Анализировать</button>
                
                <div class="batch-actions-wrapper" id="batchActionsWrapper">
                    <div class="batch-stats" id="batchStats">
                        <span>Найдено: 0</span>
                        <span>Повторов: 0</span>
                    </div>
                    
                    <div class="batch-row-buttons">
                        <button id="batchExportBtn" class="btn-excel" style="font-size:11px; padding:6px 10px; border:none; border-radius:4px; color:white; cursor:pointer;">📥 Excel</button>
                        <button id="batchCheckBtn" class="btn-primary" style="font-size:11px; padding:6px 10px; border:none; border-radius:4px; color:white; cursor:pointer; background:linear-gradient(135deg,#7c3aed,#6d28d9);">🔍 Проверить</button>
                        <button id="batchOpenBtn" class="btn-primary" style="font-size:11px; padding:6px 10px; border:none; border-radius:4px; color:white; cursor:pointer;">Открыть</button>
                    </div>
                    
                    <button id="batchStopBtn" class="btn-block btn-red" style="display:none; margin-top:5px; padding:8px;">⛔ СТОП</button>
                </div>
                
                <div class="batch-progress" id="batchProgress"></div>
            </div>

            <div class="monitor-area" id="monitorArea">
                <div id="monitorList"><div class="monitor-empty">Нет отслеживаемых товаров</div></div>
                <div class="monitor-settings">
                    <div class="monitor-row">
                        <span>Интервал (мин):</span>
                        <div style="display:flex;gap:6px;align-items:center;">
                            <input type="number" class="monitor-interval-input" id="monitorIntervalInput" min="1" max="60" value="5">
                            <button class="monitor-run-btn" id="monitorSaveInterval">Сохранить</button>
                        </div>
                    </div>
                    <div class="monitor-row">
                        <span>После уведомления:</span>
                        <select class="monitor-after-select" id="monitorAfterSelect">
                            <option value="keep">Оставить в списке</option>
                            <option value="auto-remove">Убрать автоматически</option>
                            <option value="manual-remove">Убрать вручную</option>
                        </select>
                    </div>
                    <button class="monitor-run-btn" id="monitorRunNow" style="width:100%;margin-top:4px;">🔄 Проверить сейчас</button>
                </div>
            </div>

            <div class="content morph-hidden" id="resultsArea">
                <div style="text-align:center; color:#adb5bd; margin-top:20px;">Нажмите «Собрать»</div>
            </div>

            <div class="footer morph-hidden">
                 <button id="collectBtn" class="btn-block btn-primary">Собрать артикулы</button>
                 <button id="mainCopyBtn" class="btn-block btn-success" style="display:none; margin-top:8px;">📋 Скопировать список</button>
                 <div id="problemButtons" style="display:none; flex-direction:column; gap:8px;">
                     <button id="copyAll" class="btn-block btn-warning">⚠️ Игнорировать и скопировать</button>
                     <button id="copyAvailable" class="btn-block btn-success">✅ Копировать в наличии</button>
                     <button id="exportProblems" class="btn-block btn-red">📥 Скачать отчёт с проблемами</button>
                 </div>
                 <button id="exportAll" class="btn-block btn-excel" style="display:none;">📥 Скачать полный отчёт</button>
                 <div class="status" id="statusText"></div>
                 <div class="sub-footer">
                    <a href="https://t.me/cynobeats" target="_blank" class="sub-link">✈️ Проблемы? Пиши мне</a>
                    <a href="https://octagonal-roadway-041.notion.site/1d98f2cd29ea806b978ad969d9cc5445?v=1d98f2cd29ea8016beb6000c23dbf175" target="_blank" class="sub-link">Наша Wiki</a>
                 </div>
            </div>
            <div class="toast" id="toastMsg"></div>
        </div>
      `;
      shadow.appendChild(wrapper);

      // Elements
      const fabBtn = wrapper.querySelector('#fabBtn');
      const fabCloseBtn = wrapper.querySelector('#fabCloseBtn');
      const morphIcon = wrapper.querySelector('#morphIcon');
      const morphIconImg = morphIcon.querySelector('img');
      const mainPanel = wrapper.querySelector('#mainPanel');
      const dragHeader = wrapper.querySelector('#dragHeader');
      const hideBtn = wrapper.querySelector('#hideBtn');
      const settingsBtn = wrapper.querySelector('#settingsBtn');
      const settingsMenu = wrapper.querySelector('#settingsMenu');
      const historyBtn = wrapper.querySelector('#historyBtn');
      const historyMenu = wrapper.querySelector('#historyMenu');
      
      const batchBtn = wrapper.querySelector('#batchBtn');
      const batchArea = wrapper.querySelector('#batchArea');
      const batchInput = wrapper.querySelector('#batchInput');
      const batchClearBtn = wrapper.querySelector('#batchClearBtn');
      const batchAnalyzeBtn = wrapper.querySelector('#batchAnalyzeBtn');
      const batchActionsWrapper = wrapper.querySelector('#batchActionsWrapper');
      const batchStats = wrapper.querySelector('#batchStats');
      const storeMv = wrapper.querySelector('#storeMv');
      const storeEl = wrapper.querySelector('#storeEl');
      const batchExportBtn = wrapper.querySelector('#batchExportBtn');
      const batchCheckBtn = wrapper.querySelector('#batchCheckBtn');
      const batchOpenBtn = wrapper.querySelector('#batchOpenBtn');
      const batchStopBtn = wrapper.querySelector('#batchStopBtn');
      const batchProgress = wrapper.querySelector('#batchProgress');

      const protectionToggle = wrapper.querySelector('#protectionToggle');
      const replaceChatToggle = wrapper.querySelector('#replaceChatToggle');
      const monitorBtn = wrapper.querySelector('#monitorBtn');
      const monitorArea = wrapper.querySelector('#monitorArea');
      const monitorList = wrapper.querySelector('#monitorList');
      const monitorIntervalInput = wrapper.querySelector('#monitorIntervalInput');
      const monitorAfterSelect = wrapper.querySelector('#monitorAfterSelect');
      const monitorSaveInterval = wrapper.querySelector('#monitorSaveInterval');
      const monitorRunNow = wrapper.querySelector('#monitorRunNow');
      const collectBtn = wrapper.querySelector('#collectBtn');
      const mainCopyBtn = wrapper.querySelector('#mainCopyBtn'); 
      const resultsArea = wrapper.querySelector('#resultsArea');
      const statusText = wrapper.querySelector('#statusText');
      const toastMsg = wrapper.querySelector('#toastMsg');
      const problemButtons = wrapper.querySelector('#problemButtons');
      const exportAllBtn = wrapper.querySelector('#exportAll');
      const resizeHandle = wrapper.querySelector('#resizeHandle');

      function toggleChatReplacement(enable) {
          widgetState.isFixedMode = enable;
          if (enable) {
              wrapper.classList.add('fixed-mode');
              wrapper.style.left = 'auto'; wrapper.style.top = 'auto'; wrapper.style.right = '24px'; wrapper.style.bottom = '24px';
              fabBtn.style.left = '0px'; fabBtn.style.top = '0px'; fabBtn.style.position = 'absolute';
              mainPanel.style.left = 'auto'; mainPanel.style.top = 'auto'; 
              mainPanel.style.right = '0px'; mainPanel.style.bottom = '0px'; 
              mainPanel.style.transformOrigin = 'bottom right';
              widgetState.quadrant = 'bottom-right';
          } else {
              wrapper.classList.remove('fixed-mode');
              wrapper.style.width = ''; wrapper.style.height = ''; wrapper.style.right = 'auto'; wrapper.style.bottom = 'auto';
              setElementPosition(wrapper, widgetState.x, widgetState.y);
              fabBtn.style.position = 'absolute'; fabBtn.style.left = '0'; fabBtn.style.top = '0';
              if (!widgetState.isOpen) { mainPanel.classList.remove('visible'); fabBtn.classList.remove('hidden'); }
          }
      }

      function setElementPosition(el, x, y) { el.style.left = x + 'px'; el.style.top = y + 'px'; }

      chrome.storage.local.get(['widgetPos', 'lastScanData', 'replaceChatBtn', 'protectionEnabled'], (res) => {
          if (res.widgetPos && !res.replaceChatBtn) {
              widgetState.x = res.widgetPos.x; widgetState.y = res.widgetPos.y;
              setElementPosition(wrapper, widgetState.x, widgetState.y);
          }
          if (res.lastScanData) applyScanData(res.lastScanData);
          const isReplace = res.replaceChatBtn === true;
          replaceChatToggle.checked = isReplace; toggleChatReplacement(isReplace);
          const isProt = res.protectionEnabled === true;
          protectionToggle.checked = isProt; 
          document.body.setAttribute('data-protection-enabled', isProt);
          // Синхронизируем localStorage — network_throttle.js читает его при document_start
          localStorage.setItem('skuProtectionEnabled', isProt ? 'true' : 'false');
      });

      chrome.storage.onChanged.addListener((changes) => {
          if (changes.widgetPos && !widgetState.isFixedMode) {
              const pos = changes.widgetPos.newValue;
              widgetState.x = pos.x; widgetState.y = pos.y;
              setElementPosition(wrapper, widgetState.x, widgetState.y);
          }
          if (changes.replaceChatBtn) {
              const newVal = changes.replaceChatBtn.newValue;
              replaceChatToggle.checked = newVal; toggleChatReplacement(newVal);
          }
          if (changes.lastScanData) applyScanData(changes.lastScanData.newValue);
      });

      function savePosition() {
          if (widgetState.isFixedMode) return;
          chrome.storage.local.set({ widgetPos: { x: widgetState.x, y: widgetState.y } });
      }

      function getQuadrant(x, y) {
          const centerX = window.innerWidth / 2;
          const centerY = window.innerHeight / 2;
          if (x < centerX && y < centerY) return 'top-left';
          if (x >= centerX && y < centerY) return 'top-right';
          if (x < centerX && y >= centerY) return 'bottom-left';
          return 'bottom-right';
      }

      const MORPH_EASE = 'cubic-bezier(0.34, 1.12, 0.64, 1)';
      const MORPH_DUR  = '0.46s';

      function _calcPanelPos(measuredH = null) {
          const q = getQuadrant(widgetState.x + 28, widgetState.y + 28);
          widgetState.quadrant = q;
          const panelW = 340;
          const maxPanelH = Math.min(Math.round(window.innerHeight * 0.72), 570);
          const panelH = (measuredH !== null) ? Math.min(Math.max(measuredH, 150), maxPanelH) : maxPanelH;
          let pLeft, pTop;
          if (q === 'bottom-right') {
              pLeft = 56 - panelW; pTop = 56 - panelH;
              if (widgetState.y + pTop < 10) pTop = 10 - widgetState.y;
          } else if (q === 'bottom-left') {
              pLeft = 0; pTop = 56 - panelH;
              if (widgetState.y + pTop < 10) pTop = 10 - widgetState.y;
          } else if (q === 'top-right') {
              pLeft = 56 - panelW; pTop = 0;
          } else {
              pLeft = 0; pTop = 0;
          }
          widgetState.lastPLeft = pLeft;
          widgetState.lastPTop  = pTop;
          return { q, pLeft, pTop, panelW, panelH };
      }

      function openPanel() {
          widgetState.isOpen = true;

          // Fixed mode — no morph needed
          if (widgetState.isFixedMode) {
              fabBtn.classList.add('hidden');
              morphIcon.style.opacity = '0';
              mainPanel.style.cssText = 'opacity:1; pointer-events:auto; right:0px; bottom:0px; left:auto; top:auto;';
              mainPanel.classList.add('visible', 'content-visible');
              return;
          }

          // Измеряем естественную высоту контента синхронно (без визуального флеша)
          const _maxH = Math.min(Math.round(window.innerHeight * 0.72), 570);
          mainPanel.classList.add('visible');
          Object.assign(mainPanel.style, {
              transition: 'none', opacity: '0', pointerEvents: 'none',
              width: '340px', height: '', maxHeight: _maxH + 'px', overflow: 'hidden'
          });
          const _measuredH = mainPanel.offsetHeight;
          mainPanel.classList.remove('visible');
          mainPanel.style.cssText = '';

          const { pLeft, pTop, panelW, panelH } = _calcPanelPos(_measuredH);

          // ── 1. Hide FAB (instantly, no transition) ──────────────────────
          fabBtn.style.transition = 'none';
          fabBtn.style.opacity = '0';
          fabBtn.style.pointerEvents = 'none';

          // ── 2. Show morphIcon at FAB center ─────────────────────────────
          const iconSz = 30, iconOff = (56 - iconSz) / 2;
          Object.assign(morphIcon.style, {
              transition: 'none', opacity: '1', pointerEvents: 'none',
              left: iconOff + 'px', top: iconOff + 'px',
              width: iconSz + 'px', height: iconSz + 'px'
          });
          morphIconImg.style.cssText = `transition:none; width:${iconSz}px; height:${iconSz}px`;

          // ── 3. Set panel to FAB shape (same dark background as FAB) ─────
          //    No transition yet. content-visible is OFF — only header/handle show.
          Object.assign(mainPanel.style, {
              transition: 'none', opacity: '1', pointerEvents: 'auto',
              left: '0px', top: '0px',
              width: '56px', height: '56px',
              borderRadius: '28px', maxHeight: '', overflow: 'hidden'
          });
          mainPanel.classList.add('visible');
          mainPanel.classList.remove('content-visible');

          // ── 4. Double-rAF to guarantee layout flush ──────────────────────
          requestAnimationFrame(() => { requestAnimationFrame(() => {
              const geomTrans = `left ${MORPH_DUR} ${MORPH_EASE}, top ${MORPH_DUR} ${MORPH_EASE}, width ${MORPH_DUR} ${MORPH_EASE}, height ${MORPH_DUR} ${MORPH_EASE}, border-radius ${MORPH_DUR} ${MORPH_EASE}`;

              // Panel morphs: circle → rectangle
              mainPanel.style.transition = geomTrans;
              Object.assign(mainPanel.style, {
                  left: pLeft + 'px', top: pTop + 'px',
                  width: panelW + 'px', height: panelH + 'px',
                  borderRadius: '14px'
              });

              // morphIcon flies: FAB center → header icon slot (left:12, top: resize(7) + (44-18)/2 = 20)
              const iTarget = 18;
              const iL = pLeft + 12, iT = pTop + 20;
              const iconTrans = `left ${MORPH_DUR} ${MORPH_EASE}, top ${MORPH_DUR} ${MORPH_EASE}, width ${MORPH_DUR} ${MORPH_EASE}, height ${MORPH_DUR} ${MORPH_EASE}`;
              morphIcon.style.transition = iconTrans;
              morphIconImg.style.transition = `width ${MORPH_DUR} ${MORPH_EASE}, height ${MORPH_DUR} ${MORPH_EASE}`;
              Object.assign(morphIcon.style, { left: iL+'px', top: iT+'px', width: iTarget+'px', height: iTarget+'px' });
              morphIconImg.style.width = morphIconImg.style.height = iTarget + 'px';

              // After morph: reveal content, fade out morphIcon, restore FAB hidden state cleanly
              const MORPH_MS = 460;
              setTimeout(() => {
                  mainPanel.classList.add('content-visible');
                  morphIcon.style.transition = 'opacity 0.15s ease';
                  morphIcon.style.opacity = '0';
                  // Restore FAB hidden normally (for next use)
                  fabBtn.style.transition = '';
                  fabBtn.classList.add('hidden');
              }, MORPH_MS);
          }); });
      }

      function closePanel() {
          widgetState.isOpen = false;
          settingsMenu.classList.remove('active');
          historyMenu.classList.remove('active');

          // Fixed mode
          if (widgetState.isFixedMode) {
              mainPanel.classList.remove('visible', 'content-visible');
              mainPanel.style.cssText = 'right:0px; bottom:0px; left:auto; top:auto;';
              fabBtn.style.transition = '';
              fabBtn.style.opacity = '';
              fabBtn.style.pointerEvents = '';
              fabBtn.classList.remove('hidden');
              return;
          }

          // ── 1. Hide content instantly ──────────────────────────────────
          mainPanel.classList.remove('content-visible');

          // ── 2. Lock current height for animation ───────────────────────
          const curH = mainPanel.offsetHeight || 400;
          mainPanel.style.maxHeight = '';
          mainPanel.style.height = curH + 'px';

          // ── 3. Restore morphIcon at header icon slot ────────────────────
          const pLeft = widgetState.lastPLeft, pTop = widgetState.lastPTop;
          const iTarget = 18;
          const iL = pLeft + 12, iT = pTop + 20;
          Object.assign(morphIcon.style, {
              transition: 'none', opacity: '1', pointerEvents: 'none',
              left: iL+'px', top: iT+'px', width: iTarget+'px', height: iTarget+'px'
          });
          morphIconImg.style.cssText = `transition:none; width:${iTarget}px; height:${iTarget}px`;

          // ── 4. Double-rAF animate back ─────────────────────────────────
          requestAnimationFrame(() => { requestAnimationFrame(() => {
              const CLOSE_EASE = 'cubic-bezier(0.4, 0, 0.6, 1)';
              const CLOSE_DUR  = '0.36s';
              const geomTrans = `left ${CLOSE_DUR} ${CLOSE_EASE}, top ${CLOSE_DUR} ${CLOSE_EASE}, width ${CLOSE_DUR} ${CLOSE_EASE}, height ${CLOSE_DUR} ${CLOSE_EASE}, border-radius ${CLOSE_DUR} ${CLOSE_EASE}, opacity 0.18s ease 0.18s`;

              mainPanel.style.transition = geomTrans;
              Object.assign(mainPanel.style, {
                  left: '0px', top: '0px',
                  width: '56px', height: '56px',
                  borderRadius: '28px', opacity: '0'
              });

              const iconSz = 30, iconOff = (56 - iconSz) / 2;
              const iconTrans = `left ${CLOSE_DUR} ${CLOSE_EASE}, top ${CLOSE_DUR} ${CLOSE_EASE}, width ${CLOSE_DUR} ${CLOSE_EASE}, height ${CLOSE_DUR} ${CLOSE_EASE}, opacity 0.15s ease 0.2s`;
              morphIcon.style.transition = iconTrans;
              morphIconImg.style.transition = `width ${CLOSE_DUR} ${CLOSE_EASE}, height ${CLOSE_DUR} ${CLOSE_EASE}`;
              Object.assign(morphIcon.style, { left: iconOff+'px', top: iconOff+'px', width: iconSz+'px', height: iconSz+'px', opacity: '0' });
              morphIconImg.style.width = morphIconImg.style.height = iconSz + 'px';

              // ── 5. Cleanup ─────────────────────────────────────────────
              setTimeout(() => {
                  mainPanel.classList.remove('visible');
                  mainPanel.style.cssText = '';
                  morphIcon.style.cssText = 'opacity:0; pointer-events:none';
                  // Restore FAB
                  fabBtn.style.transition = '';
                  fabBtn.style.opacity = '';
                  fabBtn.style.pointerEvents = '';
                  fabBtn.classList.remove('hidden');
              }, 380);
          }); });
      }

      hideBtn.onclick = closePanel;

      document.addEventListener('mousedown', (e) => {
          if (e.target === host) return;
          if (widgetState.isOpen) closePanel();
      });

      let isDragging = false, dragStart = 0, shiftX, shiftY;
      const startDrag = (e) => {
          if (widgetState.isFixedMode) return; 
          if (e.target.closest('.fab-close-btn')) return;
          isDragging = false; dragStart = Date.now();
          const rect = wrapper.getBoundingClientRect();
          shiftX = e.clientX - rect.left; shiftY = e.clientY - rect.top;
          function moveAt(pageX, pageY) {
              isDragging = true;
              let newX = pageX - shiftX; let newY = pageY - shiftY;
              newX = Math.max(0, Math.min(window.innerWidth - 56, newX));
              newY = Math.max(0, Math.min(window.innerHeight - 56, newY));
              setElementPosition(wrapper, newX, newY);
              widgetState.x = newX; widgetState.y = newY;
          }
          function onMouseMove(event) { moveAt(event.clientX, event.clientY); }
          document.addEventListener('mousemove', onMouseMove);
          const stopDrag = () => {
              if (isDragging) savePosition();
              document.removeEventListener('mousemove', onMouseMove); 
              document.removeEventListener('mouseup', stopDrag);
          };
          document.addEventListener('mouseup', stopDrag);
      };

      fabBtn.addEventListener('mousedown', startDrag);
      dragHeader.addEventListener('mousedown', (e) => { if (e.target.closest('button')) return; startDrag(e); });

      fabBtn.onclick = (e) => { 
          if (e.target.closest('.fab-close-btn')) return;
          if (Date.now() - dragStart > 200 && isDragging) return; 
          openPanel(); 
      };

      fabCloseBtn.onclick = (e) => {
          e.stopPropagation();
          wrapper.style.display = 'none';
          sessionStorage.setItem('skuMasterHidden', 'true');
      };
      if (sessionStorage.getItem('skuMasterHidden') === 'true') wrapper.style.display = 'none';

      let isResizing = false;
      resizeHandle.addEventListener('mousedown', (e) => { isResizing = true; e.preventDefault(); document.addEventListener('mousemove', handleMouseMove); document.addEventListener('mouseup', stopResize); });
      
      function handleMouseMove(e) {
          if (!isResizing) return;
          const rect = mainPanel.getBoundingClientRect();
          const newH = rect.bottom - e.clientY;
          // Минимальная высота = все фиксированные части + 60px контента (footer не обрезается)
          const fixedPartsH = mainPanel.offsetHeight - resultsArea.offsetHeight;
          const minH = Math.max(150, fixedPartsH + 60);
          if (newH >= minH && newH < window.innerHeight - 20) {
              mainPanel.style.height = `${newH}px`;
              if (!widgetState.isFixedMode && widgetState.quadrant.includes('bottom')) {
                  mainPanel.style.top = (56 - newH) + 'px';
              }
          }
      }
      function stopResize() { isResizing = false; document.removeEventListener('mousemove', handleMouseMove); document.removeEventListener('mouseup', stopResize); }

      settingsBtn.onclick = () => {
          historyMenu.classList.remove('active');
          settingsMenu.classList.toggle('active');
      }

      function renderHistory() {
          chrome.storage.local.get('scanHistory', (res) => {
              const list = res.scanHistory || [];
              historyMenu.innerHTML = '';
              if (list.length === 0) {
                  historyMenu.innerHTML = '<div style="padding:15px; text-align:center; color:#999; font-size:12px;">История пуста</div>';
                  return;
              }
              list.forEach((scan) => {
                  const date = new Date(scan.timestamp || Date.now());
                  const timeStr = date.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
                  const dateStr = date.toLocaleDateString('ru-RU', { day: 'numeric', month: 'short' });
                  const div = document.createElement('div');
                  div.className = 'history-item';
                  div.innerHTML = `
                      <div class="h-date">${dateStr}, ${timeStr}</div>
                      <div class="h-info">Товаров: ${scan.results.length} (МВ:${scan.mvCount} / ЭЛ:${scan.elCount})</div>
                  `;
                  div.onclick = () => {
                      applyScanData(scan);
                      historyMenu.classList.remove('active');
                      showToast(`Загружен скан от ${timeStr}`);
                  };
                  historyMenu.appendChild(div);
              });
          });
      }

      historyBtn.onclick = (e) => {
          e.stopPropagation();
          settingsMenu.classList.remove('active');
          if (historyMenu.classList.contains('active')) {
              historyMenu.classList.remove('active');
          } else {
              renderHistory();
              historyMenu.classList.add('active');
          }
      };

      batchBtn.onclick = () => {
          monitorArea.classList.remove('active');
          batchArea.classList.toggle('active');
      };

      // === МОНИТОРИНГ: логика панели ===
      monitorBtn.onclick = () => {
          batchArea.classList.remove('active');
          const isOpening = !monitorArea.classList.contains('active');
          monitorArea.classList.toggle('active');
          if (isOpening) {
              chrome.runtime.sendMessage({ action: 'clearMonitorBadge' });
              loadMonitorPanel();
          }
      };

      function loadMonitorPanel() {
          chrome.runtime.sendMessage({ action: 'getMonitorItems' }, (res) => {
              if (chrome.runtime.lastError || !res) return;
              monitorIntervalInput.value = res.interval || 5;
              renderMonitorList(res.items || []);
          });
      }

      function renderMonitorList(items) {
          if (items.length === 0) {
              monitorList.innerHTML = '<div class="monitor-empty">Нет отслеживаемых товаров.<br>Нажмите 👁 на товаре в результатах.</div>';
              return;
          }
          monitorList.innerHTML = '';
          items.forEach(item => {
              const div = document.createElement('div');
              div.className = 'monitor-item';
              const statusMap = { sold_out: '🔴 Нет в наличии', banned: '⛔ Мягкий бан', available: '✅ В наличии' };
              const storeLabel = item.store === 'mvideo' ? 'МВ' : 'ЭЛ';
              div.innerHTML = `
                  <div class="monitor-item-left">
                      <span class="monitor-item-sku">${item.sku} <span style="color:#aaa;font-weight:400;">[${storeLabel}]</span></span>
                      <span class="monitor-item-status">${statusMap[item.lastStatus] || '⏳ Ожидание'}</span>
                  </div>
                  <button class="monitor-remove-btn" title="Снять с мониторинга">×</button>
              `;
              div.querySelector('.monitor-remove-btn').onclick = () => {
                  chrome.runtime.sendMessage({ action: 'removeMonitorItem', sku: item.sku }, (res) => {
                      if (res && res.items) renderMonitorList(res.items);
                  });
              };
              monitorList.appendChild(div);
          });
      }

      monitorSaveInterval.onclick = () => {
          const val = parseInt(monitorIntervalInput.value);
          if (!val || val < 1) { showToast('Минимум 1 минута'); return; }
          chrome.runtime.sendMessage({ action: 'setMonitorInterval', minutes: val }, () => {
              showToast(`Интервал: ${val} мин`);
          });
      };

      monitorRunNow.onclick = () => {
          monitorRunNow.textContent = '⏳ Проверяю...';
          monitorRunNow.disabled = true;
          chrome.runtime.sendMessage({ action: 'runMonitorNow' }, () => {
              loadMonitorPanel();
              monitorRunNow.textContent = '🔄 Проверить сейчас';
              monitorRunNow.disabled = false;
              showToast('Проверка завершена');
          });
      };

      function resetBatchUI() {
          batchAnalyzeBtn.style.display = 'block';
          batchActionsWrapper.style.display = 'none';
          batchState.uniqueSkus = [];
          batchProgress.innerHTML = '';
          batchProgress.style.display = 'none';
          batchProgress.style.textAlign = '';
          // Button Logic
          batchClearBtn.style.display = batchInput.value.length > 0 ? 'flex' : 'none';
      }

      batchInput.addEventListener('input', resetBatchUI);

      // CLEAR BUTTON
      batchClearBtn.onclick = () => {
          batchInput.value = '';
          resetBatchUI();
          batchInput.focus();
      };

      storeMv.onclick = () => {
          batchState.isMvideo = true;
          storeMv.classList.add('active'); storeEl.classList.remove('active');
      };
      storeEl.onclick = () => {
          batchState.isMvideo = false;
          storeEl.classList.add('active'); storeMv.classList.remove('active');
      };

      // --- STAGE 1: ANALYZE + RESOLVE (v4.9.1 Logic) ---
      batchAnalyzeBtn.onclick = async () => {
          let text = batchInput.value.trim();
          if(!text) { showToast("Пустое поле"); return; }
          
          if (batchState.isMvideo === null) {
              showToast("Выберите магазин (МВ или ЭЛ)");
              return;
          }

          // 1. Google Docs Check
          if (text.includes('docs.google.com/document/d/')) {
              batchAnalyzeBtn.textContent = "⏳ Скачиваю Google Doc...";
              try {
                  const response = await new Promise(resolve => {
                      chrome.runtime.sendMessage({ action: "fetchGoogleDoc", url: text }, resolve);
                  });
                  
                  if (response && response.success) {
                      text = response.data;
                      batchInput.value = text; 
                      batchClearBtn.style.display = 'flex'; // Show clear button
                      showToast("Текст загружен!");
                  } else {
                      throw new Error(response.error || "Ошибка");
                  }
              } catch (e) {
                  showToast("⛔ Ошибка доступа к Doc");
                  alert("Не удалось открыть документ. Проверьте доступ по ссылке.");
                  batchAnalyzeBtn.textContent = "🔍 Анализировать";
                  return;
              }
          }

          // 2. Extract SKUs (убираем URL перед извлечением, чтобы не захватывать числа из ссылок)
          const cleanText = text.replace(/https?:\/\/[^\s]+/g, '');
          const matches = cleanText.match(/\b\d{7,9}\b/g) || [];
          const unique = [...new Set(matches)];
          
          if(unique.length === 0) {
              showToast("Артикулы не найдены");
              batchAnalyzeBtn.textContent = "🔍 Анализировать";
              return;
          }

          // 3. RESOLUTION PHASE
          batchState.resolvedLinks = []; 
          
          if (!batchState.isMvideo) { // Eldorado - Need Resolution
              batchAnalyzeBtn.textContent = `⏳ Получение ссылок (0/${unique.length})...`;
              batchProgress.style.display = 'block';
              
              for (let i = 0; i < unique.length; i++) {
                  const sku = unique[i];
                  batchProgress.textContent = `Получение ссылок (${i+1}/${unique.length})...`;
                  
                  const resolvedUrl = await new Promise(resolve => {
                      chrome.runtime.sendMessage({ action: "resolveElLink", sku: sku }, (resp) => {
                          if (chrome.runtime.lastError || !resp) {
                              resolve(`https://www.eldorado.ru/search/catalog.php?q=${sku}`);
                          } else {
                              resolve(resp.url);
                          }
                      });
                  });
                  
                  batchState.resolvedLinks.push({ sku: sku, url: resolvedUrl });
                  await new Promise(r => setTimeout(r, 200));
              }
              batchProgress.style.display = 'none';
          } else {
              // M.Video - Direct Links
              batchState.resolvedLinks = unique.map(sku => ({
                  sku: sku,
                  url: `https://www.mvideo.ru/products/${sku}`
              }));
          }

          // 4. Update UI
          batchStats.innerHTML = `
              <span>Найдено: <b>${unique.length}</b></span>
              <span style="color:#888; font-size:10px;">(Дублей: ${matches.length - unique.length})</span>
          `;
          batchAnalyzeBtn.textContent = "🔍 Анализировать"; // Reset text
          batchAnalyzeBtn.style.display = 'none';
          batchActionsWrapper.style.display = 'flex';
      };

      // --- STAGE 2: ACTIONS ---
      batchStopBtn.onclick = () => {
          batchRunning = false;
          batchStopBtn.style.display = 'none';
          batchProgress.textContent = 'Остановлено пользователем';
      };

      batchOpenBtn.onclick = async () => {
          const links = batchState.resolvedLinks;
          const total = links.length;
          
          if (!confirm(`Найдено ${total} уникальных товаров.\nВнимание! Задержка увеличена (5-8 сек) во избежание бана.\nОткрыть вкладки?`)) return;

          batchRunning = true;
          batchStopBtn.style.display = 'block';
          batchProgress.style.display = 'block';

          for (let i = 0; i < total; i++) {
              if (!batchRunning) break; 

              const item = links[i];
              chrome.runtime.sendMessage({ action: "openTab", url: item.url });
              
              if (i < total - 1) {
                  const delay = 5000 + Math.random() * 3000; 
                  const steps = 10;
                  const stepTime = delay / steps;
                  
                  for (let j = steps; j > 0; j--) {
                      if (!batchRunning) break;
                      batchProgress.textContent = `Открыто ${i+1}/${total}. Жду ${Math.ceil((j*stepTime)/1000)}с...`;
                      await new Promise(r => setTimeout(r, stepTime));
                  }
              } else {
                  batchProgress.textContent = `Готово! ${total} вкладок.`;
              }
          }
          
          batchRunning = false;
          batchStopBtn.style.display = 'none';
          setTimeout(() => { if(!batchRunning) batchProgress.style.display = 'none'; }, 3000);
      };

      batchExportBtn.onclick = async () => {
          const links = batchState.resolvedLinks;
          if (!links || links.length === 0) return;
          
          let tableRows = "";
          links.forEach(item => {
              tableRows += `<tr><td>${item.sku}</td><td><a href="${item.url}">${item.url}</a></td></tr>`;
          });

          const table = `<table border="1"><tr><th>Артикул</th><th>Ссылка</th></tr>${tableRows}</table>`;
          const date = new Date().toISOString().slice(0,10);
          const suffix = batchState.isMvideo ? "_mv" : "_el";
          downloadAsXLS(`batch_list_${date}${suffix}.xls`, table);
          showToast(`Скачан XLS: ${links.length} строк`);
      };

      // === BULK AVAILABILITY CHECK (#3) ===
      batchCheckBtn.onclick = async () => {
          const links = batchState.resolvedLinks;
          if (!links || links.length === 0) return;

          const store = batchState.isMvideo ? 'mvideo' : 'eldorado';
          batchCheckBtn.disabled = true;
          batchCheckBtn.textContent = '⏳...';
          batchProgress.style.display = 'block';
          batchProgress.textContent = `Проверяю ${links.length} артикулов...`;

          try {
              const results = await new Promise((resolve) => {
                  chrome.runtime.sendMessage({
                      action: "bulkCheck",
                      items: links.map(l => ({ sku: l.sku, url: l.url })),
                      store: store
                  }, resolve);
              });

              if (!results || !Array.isArray(results)) {
                  showToast('Ошибка проверки');
                  return;
              }

              // Считаем статистику
              const available = results.filter(r => r.status === 'available').length;
              const soldOut = results.filter(r => r.status === 'sold_out').length;
              const lowStock = results.filter(r => r.status === 'low_stock').length;
              const banned = results.filter(r => r.status === 'banned').length;
              const errors = results.filter(r => r.status === 'error').length;

              // Рендерим результаты
              let html = `<div class="bulk-summary">
                  <span>✅ ${available}</span>
                  ${soldOut > 0 ? `<span>🔴 ${soldOut}</span>` : ''}
                  ${lowStock > 0 ? `<span>🟠 ${lowStock}</span>` : ''}
                  ${banned > 0 ? `<span>⛔ ${banned}</span>` : ''}
                  ${errors > 0 ? `<span>❌ ${errors}</span>` : ''}
              </div>`;

              results.forEach(r => {
                  const statusMap = {
                      available: { cls: 'bs-available', text: 'В наличии' },
                      sold_out: { cls: 'bs-sold-out', text: 'Нет' },
                      low_stock: { cls: 'bs-low-stock', text: 'Мало' },
                      banned: { cls: 'bs-banned', text: 'Бан' },
                      error: { cls: 'bs-error', text: 'Ошибка' }
                  };
                  const s = statusMap[r.status] || statusMap.error;
                  const priceStr = r.price ? `${r.price.toLocaleString('ru-RU')} ₽` : '';
                  html += `<div class="bulk-item">
                      <span class="bulk-item-sku">${r.sku}</span>
                      <div style="display:flex;align-items:center;gap:6px;">
                          ${priceStr ? `<span class="bulk-item-price">${priceStr}</span>` : ''}
                          <span class="bulk-item-status ${s.cls}">${s.text}</span>
                      </div>
                  </div>`;
              });

              // Показываем в batchProgress area, заменяя его на контейнер
              batchProgress.innerHTML = `<div class="bulk-results">${html}</div>`;
              batchProgress.style.display = 'block';
              batchProgress.style.textAlign = 'left';

              // Кнопка экспорта результатов проверки
              const exportCheckBtn = document.createElement('button');
              exportCheckBtn.className = 'btn-excel';
              exportCheckBtn.style.cssText = 'width:100%; margin-top:6px; padding:7px; font-size:11px; border:none; border-radius:6px; color:white; cursor:pointer;';
              exportCheckBtn.textContent = '📥 Скачать результат проверки';
              exportCheckBtn.onclick = () => {
                  let rows = '';
                  results.forEach(r => {
                      const statusText = { available: 'В наличии', sold_out: 'Нет в наличии', low_stock: 'Мало остатков', banned: 'Мягкий бан', error: 'Ошибка' }[r.status] || 'Неизвестно';
                      const link = links.find(l => l.sku === r.sku);
                      rows += `<tr><td>${r.sku}</td><td>${statusText}</td><td>${r.price || ''}</td><td><a href="${link?.url || ''}">${link?.url || ''}</a></td></tr>`;
                  });
                  const table = `<table border="1"><tr><th>Артикул</th><th>Статус</th><th>Цена</th><th>Ссылка</th></tr>${rows}</table>`;
                  const date = new Date().toISOString().slice(0,10);
                  downloadAsXLS(`availability_check_${date}.xls`, table);
                  showToast('Отчёт скачан');
              };
              batchProgress.appendChild(exportCheckBtn);

          } catch (e) {
              showToast('Ошибка проверки');
          } finally {
              batchCheckBtn.disabled = false;
              batchCheckBtn.textContent = '🔍 Проверить';
          }
      };

      wrapper.addEventListener('click', (e) => { 
          if (!settingsMenu.contains(e.target) && e.target !== settingsBtn) settingsMenu.classList.remove('active'); 
          if (!historyMenu.contains(e.target) && e.target !== historyBtn) historyMenu.classList.remove('active');
      });

      showToast = (text) => { toastMsg.textContent = text; toastMsg.style.display = 'block'; setTimeout(() => { toastMsg.style.display = 'none'; }, 2000); };
      protectionToggle.onchange = (e) => { const isEnabled = e.target.checked; chrome.storage.local.set({ protectionEnabled: isEnabled }); document.body.setAttribute('data-protection-enabled', isEnabled); localStorage.setItem('skuProtectionEnabled', isEnabled ? 'true' : 'false'); showToast(isEnabled ? "Защита включена" : "Защита выключена"); };
      replaceChatToggle.onchange = (e) => { const isEnabled = e.target.checked; chrome.storage.local.set({ replaceChatBtn: isEnabled }); toggleChatReplacement(isEnabled); showToast(isEnabled ? "Чат заменен на виджет" : "Виджет откреплен"); };

      collectBtn.onclick = async () => {
        statusText.textContent = 'Сканирую...'; 
        problemButtons.style.display = 'none'; 
        exportAllBtn.style.display = 'none'; 
        mainCopyBtn.style.display = 'none';
        
        resultsArea.innerHTML = '<div style="text-align:center; padding:40px; font-size:24px;">⏳</div>';
        
        try { 
            chrome.runtime.sendMessage({ action: "collectData" }, async (response) => { 
                if (chrome.runtime.lastError) { statusText.innerHTML = '<span style="color:red">Ошибка: F5</span>'; return; } 
                if (!response) { statusText.textContent = 'Ошибка данных'; return; } 
                
                // === DUPLICATE DETECTION ===
                chrome.runtime.sendMessage({ action: "getProcessedSkus" }, (procRes) => {
                    const processed = (procRes && procRes.skus) ? procRes.skus : {};

                    // Считаем вхождения SKU в текущем скане (несколько вкладок одного товара)
                    const skuCount = {};
                    response.results.forEach(r => { if (r.sku) skuCount[r.sku] = (skuCount[r.sku] || 0) + 1; });
                    const seenInSession = new Set();
                    response.results.forEach(r => {
                        if (!r.sku) return;
                        if (processed[r.sku]) r.isHistorical = true;        // ранее добавлялся
                        if (skuCount[r.sku] > 1) {
                            if (seenInSession.has(r.sku)) r.isDuplicate = true; // дубль вкладки
                            seenInSession.add(r.sku);
                        }
                    });
                    response._dupeCount = response.results.filter(r => r.isDuplicate).length;

                    applyScanData(response);

                    if (response.results.length > 0 && response.mvCount * response.elCount === 0) {
                        const problems = response.results.filter(r => r.problemType || r.isSleeping || r.regionError || r.isDuplicate || r.isHistorical);
                        if (problems.length === 0) {
                            const text = response.results.map(i => i.sku).filter(Boolean).join(', ');
                            const html = response.results.map(i => `<a href="${i.url}">${i.sku}</a>`).filter(Boolean).join(', ');
                            smartCopy(text, html, (success) => {
                                if (success) {
                                    showToast(`Успех! ${response.results.length} скопировано`);
                                    const skusToMark = [...new Set(response.results.filter(r => r.sku).map(r => r.sku))];
                                    if (skusToMark.length > 0) chrome.runtime.sendMessage({ action: 'markProcessed', skus: skusToMark });
                                } else {
                                    mainCopyBtn.style.display = 'block';
                                    mainCopyBtn.textContent = `📋 Скопировать список (${response.results.length} шт.)`;
                                    showToast('Готово. Нажмите "Скопировать"');
                                }
                            });
                        }
                    }
                });
            }); 
        } catch(e) { statusText.innerHTML = '<span style="color:red">Обновите страницу!</span>'; }
      };

      function applyScanData(data) {
          panelState = data;
          const problems = data.results.filter(r => r.problemType || r.isSleeping || r.regionError || r.isDuplicate || r.isHistorical);
          renderResults(data, resultsArea, statusText);
          exportAllBtn.style.display = data.results.length > 0 ? 'block' : 'none';
          mainCopyBtn.style.display = 'none';
          problemButtons.style.display = problems.length > 0 ? 'flex' : 'none';
      }

      mainCopyBtn.onclick = () => {
          const text = panelState.results.map(i => i.sku).filter(Boolean).join(', ');
          const html = panelState.results.map(i => `<a href="${i.url}">${i.sku}</a>`).filter(Boolean).join(', ');
          smartCopy(text, html, (success) => {
              if (success) {
                  showToast(`Скопировано: ${panelState.results.length} шт.`);
                  const skusToMark = [...new Set(panelState.results.filter(r => r.sku).map(r => r.sku))];
                  if (skusToMark.length > 0) chrome.runtime.sendMessage({ action: 'markProcessed', skus: skusToMark });
              } else {
                  showToast('Ошибка копирования');
              }
          });
      };
      
      wrapper.querySelector('#copyAvailable').onclick = () => {
          const available = panelState.results.filter(r => !r.problemType && !r.isSleeping && !r.regionError);
          if (available.length === 0) { showToast('Нет доступных'); return; }
          const text = available.map(i => i.sku).join(', ');
          const html = available.map(i => `<a href="${i.url}">${i.sku}</a>`).join(', ');
          smartCopy(text, html, (s) => {
              if (s) {
                  showToast(`Скопировано: ${available.length}`);
                  const skusToMark = [...new Set(available.filter(r => r.sku).map(r => r.sku))];
                  if (skusToMark.length > 0) chrome.runtime.sendMessage({ action: 'markProcessed', skus: skusToMark });
              } else { showToast('Err'); }
          });
      };
      
      wrapper.querySelector('#copyAll').onclick = () => {
          const text = panelState.results.map(i => i.sku).join(', ');
          const html = panelState.results.map(i => `<a href="${i.url}">${i.sku}</a>`).join(', ');
          smartCopy(text, html, (s) => {
              if (s) {
                  showToast(`Скопировано: ${panelState.results.length}`);
                  const skusToMark = [...new Set(panelState.results.filter(r => r.sku).map(r => r.sku))];
                  if (skusToMark.length > 0) chrome.runtime.sendMessage({ action: 'markProcessed', skus: skusToMark });
              } else { showToast('Err'); }
          });
      };
      
      wrapper.querySelector('#exportAll').onclick = () => exportToXLS(panelState.results, false);
      wrapper.querySelector('#exportProblems').onclick = () => exportToXLS(panelState.results, true);

      function exportToXLS(items, onlyProblems) { 
        if (!items || items.length === 0) return; 
        let dataToExport = items; 
        if (onlyProblems) { 
            dataToExport = items.filter(r => r.problemType || r.isSleeping || r.regionError); 
            if (dataToExport.length === 0) { alert('Нет проблемных товаров'); return; } 
        } 
        
        let rows = "";
        dataToExport.forEach(row => { 
            let statusText = "В наличии"; 
            if (row.problemType === 'banned') statusText = "Мягкий бан (403)"; 
            else if (row.isSleeping) statusText = "Спит (не загружена)"; 
            else if (row.regionError) statusText = "Неверный регион"; 
            else if (row.problemType === 'sold_out') statusText = "Нет в наличии"; 
            else if (row.problemType === 'low_stock') statusText = "Мало остатков"; 
            
            rows += `<tr><td>${row.sku || "Без артикула"}</td><td>${statusText}</td><td><a href="${row.url}">${row.url}</a></td></tr>`;
        });
        
        const table = `<table border="1"><tr><th>Артикул</th><th>Статус</th><th>Ссылка</th></tr>${rows}</table>`;
        const date = new Date().toISOString().slice(0,10); 
        const suffix = onlyProblems ? "_problems" : "_full"; 
        downloadAsXLS(`sku_report_${date}${suffix}.xls`, table);
      }

      chrome.runtime.onMessage.addListener((req) => { if (req.action === "toggleWidget") { if(wrapper.style.display === 'none') { wrapper.style.display = 'block'; sessionStorage.removeItem('skuMasterHidden'); } if (widgetState.isOpen) closePanel(); else openPanel(); } });
    }

    function renderResults(data, container, status) {
      container.innerHTML = '';
      if (data.mvCount > 0 && data.elCount > 0) { status.textContent = 'Конфликт магазинов'; container.innerHTML = `<div style="text-align:center; padding:20px;">Закройте лишнее:<br><br><button class="btn-mv" id="closeMv">М.Видео (${data.mvCount})</button> <button class="btn-el" id="closeEl">Эльдорадо (${data.elCount})</button></div>`; container.querySelector('#closeMv').onclick = () => closeTabs(data.mvIds); container.querySelector('#closeEl').onclick = () => closeTabs(data.elIds); return; }
      const problems = data.results.filter(r => r.problemType || r.isSleeping || r.regionError);
      const good = data.results.filter(r => !r.problemType && !r.isSleeping && !r.regionError);
      const sessionDupes = data.results.filter(r => r.isDuplicate);    // несколько вкладок одного товара
      const historicals = data.results.filter(r => r.isHistorical);    // ранее добавлялся
      if (data.results.length === 0) { status.textContent = ''; container.innerHTML = '<div style="text-align:center; padding:30px; color:#999;">В этом окне товаров нет</div>'; return; }

      // Плашка: ранее добавлявшиеся товары
      if (historicals.length > 0) {
        const notice = document.createElement('div');
        notice.className = 'dupe-notice';
        notice.innerHTML = `
          <span class="dupe-notice-text">📋 Уже добавляли: <b>${historicals.length}</b> из ${data.results.length}</span>
          <button class="clear-processed-btn" id="clearProcessedBtn">Сбросить историю</button>
        `;
        container.appendChild(notice);
        notice.querySelector('#clearProcessedBtn').onclick = () => {
          chrome.runtime.sendMessage({ action: 'clearProcessedSkus' }, () => {
            data.results.forEach(r => { r.isHistorical = false; });
            renderResults(data, container, status);
            showToast('История очищена');
          });
        };
      }

      if (problems.length > 0 || sessionDupes.length > 0 || historicals.length > 0) {
        const statusParts = [];
        if (problems.length > 0) statusParts.push(`Проблем: ${problems.length}`);
        if (sessionDupes.length > 0) statusParts.push(`Дублей: ${sessionDupes.length}`);
        if (historicals.length > 0) statusParts.push(`Добавлялось: ${historicals.length}`);
        statusParts.push(`Ок: ${good.filter(r => !r.isDuplicate && !r.isHistorical).length}`);
        status.textContent = statusParts.join(' | ');
      }

      if (problems.length > 0 || sessionDupes.length > 0 || historicals.length > 0) {
        const itemsToShow = data.results.filter(r => r.problemType || r.isSleeping || r.regionError || r.isDuplicate || r.isHistorical);
        itemsToShow.forEach(item => { const div = document.createElement('div'); div.className = 'item'; let badge = '';
          if (item.isHistorical && !item.isDuplicate && !item.problemType && !item.isSleeping && !item.regionError) {
            badge = '<span class="badge badge-gray">ДОБАВЛЕН</span>';
          } else if (item.isDuplicate && !item.problemType && !item.isSleeping && !item.regionError) {
            badge = '<span class="badge badge-dupe">ДУБЛЬ</span>';
          } else if (item.problemType === 'banned') badge = '<span class="badge badge-black">МЯГКИЙ БАН</span>';
          else if (item.isSleeping) badge = '<span class="badge badge-gray">СПИТ</span>';
          else if (item.regionError) badge = '<span class="badge badge-purple">РЕГИОН</span>';
          else if (item.problemType === 'sold_out') badge = '<span class="badge badge-red">НЕТ</span>';
          else badge = '<span class="badge badge-orange">МАЛО</span>';
          if (item.isHistorical && (item.problemType || item.isSleeping || item.regionError || item.isDuplicate)) {
            badge += ' <span class="badge badge-gray">ДОБАВЛЕН</span>';
          }
          if (item.isDuplicate && (item.problemType || item.isSleeping || item.regionError)) {
            badge += ' <span class="badge badge-dupe">ДУБЛЬ</span>';
          }
        const canWatch = item.problemType === 'banned';
        const itemStore = item.url && item.url.includes('mvideo') ? 'mvideo' : 'eldorado';
        const watchBtnHtml = canWatch ? `<button class="btn-watch" data-sku="${item.sku}" data-url="${item.url}" data-status="${item.problemType}" data-store="${itemStore}" title="Следить">👁</button>` : '';
        div.innerHTML = `<div style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:190px;">${badge} ${item.sku || '---'}</div><div style="display:flex;gap:4px;align-items:center;">${watchBtnHtml}<button class="btn-icon" data-tabid="${item.tabId}">🔎</button></div>`;
        div.querySelector('[data-tabid]').onclick = () => chrome.runtime.sendMessage({action: 'activateTab', tabId: item.tabId});
        if (canWatch) {
          div.querySelector('.btn-watch').onclick = function() {
            const sku = this.dataset.sku;
            const afterNotify = 'keep';
            chrome.runtime.sendMessage({ action: 'addMonitorItem', item: { sku, url: this.dataset.url, store: this.dataset.store, lastStatus: this.dataset.status, afterNotify, addedAt: Date.now() } }, () => { this.textContent = '✅'; this.classList.add('watching'); this.disabled = true; showToast(`Следим за ${sku}`); });
          };
        }
        container.appendChild(div); });
      } else { status.textContent = `Найдено: ${good.length}`; container.innerHTML += '<div style="text-align:center; padding:30px; color:#28a745; font-weight:bold;">✅ Все товары доступны!</div>'; }
    }
    function closeTabs(ids) { chrome.runtime.sendMessage({ action: "closeTabs", tabIds: ids }, () => { const h = document.getElementById('sku-master-host'); h?.shadowRoot?.querySelector('#collectBtn')?.click(); }); }

    createPanel();
}

if (document.readyState === 'loading') { document.addEventListener('DOMContentLoaded', initInterface); } else { initInterface(); }