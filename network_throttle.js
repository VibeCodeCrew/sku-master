(function() {
    const DELAY_MS = 1800;
    const RATE_LIMITED_PATHS = [ '/bff/products/prices', '/bff/product-details', '/bff/products/listing' ];
    const originalFetch = window.fetch;
    const sleep = (ms) => new Promise(r => setTimeout(r, ms));

    console.log('[SKU Master 5.0.0] Защита от перегрузок активирована.');

    window.fetch = async function (...args) {
      const url = args[0] ? args[0].toString() : '';
      const needsThrottling = RATE_LIMITED_PATHS.some(sub => url.includes(sub));
      // Read from localStorage first (available at document_start), fallback to data-attribute
      const lsProtection = localStorage.getItem('skuProtectionEnabled') === 'true';
      const attrProtection = document.body && document.body.getAttribute('data-protection-enabled') === 'true';
      const isProtectionOn = lsProtection || attrProtection;

      if (!needsThrottling || !isProtectionOn) return await executeThrottledFetch(url, args, false);

      if (navigator.locks) {
          return navigator.locks.request('api_rate_limiter_lock', async (lock) => {
             return await executeThrottledFetch(url, args, true);
          });
      } else {
          return await executeThrottledFetch(url, args, true);
      }
    };

    async function executeThrottledFetch(url, args, useDelay) {
        try {
            const response = await originalFetch(...args);
            if (response.status === 400 || response.status === 403 || response.status === 429) {
                console.warn(`[SKU Master] Запрос ограничен (${response.status}). Ожидание...`);
                document.body.setAttribute('data-request-blocked', 'true');
                if (!document.body.getAttribute('data-block-start')) {
                    document.body.setAttribute('data-block-start', new Date().toLocaleTimeString());
                }
                // Прямой сигнал в content.js (ISOLATED world) — не зависит от service worker
                // ВАЖНО: document (не window) — единственный общий объект между MAIN и ISOLATED worlds
                document.dispatchEvent(new CustomEvent('sku-ban-detected', {
                    detail: { timestamp: new Date().toLocaleTimeString() }
                }));
                await sleep(DELAY_MS * 3);
            } else {
                if (useDelay) await sleep(DELAY_MS);
            }
            return response;
        } catch (err) {
            if (useDelay) await sleep(DELAY_MS);
            throw err;
        }
    }
  })();
