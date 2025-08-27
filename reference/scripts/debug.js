// Minimal fetch logger. Remove after debugging.
(function () {
  if (window.__FETCH_LOGGER__) return; // avoid double-wrap
  window.__FETCH_LOGGER__ = true;

  const origFetch = window.fetch;
  window.fetch = async (...args) => {
    const [input, init] = args;
    const url = (typeof input === 'string') ? input : (input && input.url);
    console.debug('[fetch]', url, init || {});
    try {
      const res = await origFetch(...args);
      console.debug('[fetch:res]', res.status, res.url);
      if (!res.ok) {
        // Clone & log up to 500 chars to avoid spam
        const txt = await res.clone().text().catch(() => '');
        console.error('[fetch:error]', res.status, res.url, txt.slice(0, 500));
      }
      return res;
    } catch (err) {
      console.error('[fetch:throw]', url, err);
      throw err;
    }
  };

  // Global JS error visibility
  window.addEventListener('error', (e) => {
    console.error('[window:error]', e.message, e.filename, e.lineno, e.colno);
  });
  window.addEventListener('unhandledrejection', (e) => {
    console.error('[promise:unhandled]', e.reason);
  });

  console.info('[debug] fetch logger enabled');
})();
