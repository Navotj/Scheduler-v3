(function () {
  // Compute API base from current site: strip "www." and prepend "api."
  const { protocol, hostname } = window.location;
  const baseHost = hostname.replace(/^www\./, "");
  const apiHost  = `api.${baseHost}`;
  const API_BASE_URL = `${protocol}//${apiHost}`;

  // Expose for direct use
  window.API_BASE_URL = API_BASE_URL;
  console.log("[config.js] API_BASE_URL set to:", API_BASE_URL);

  // Patch fetch to route app API calls to the API host even if code uses relative paths.
  const TARGET_PREFIXES = ['/auth', '/settings', '/availability'];
  const origFetch = window.fetch.bind(window);

  function needsApiHost(pathname) {
    for (const p of TARGET_PREFIXES) {
      if (pathname === p || pathname.startsWith(p + '/')) return true;
    }
    return false;
  }

  window.fetch = function (input, init) {
    try {
      const u = new URL(typeof input === 'string' ? input : input.url, window.location.origin);

      if (u.origin === window.location.origin && needsApiHost(u.pathname)) {
        const apiUrl = `${API_BASE_URL}${u.pathname}${u.search}`;
        console.log("[config.js] Rewriting relative fetch →", apiUrl);
        return origFetch(apiUrl, init);
      }

      const isFrontHost = u.hostname === window.location.hostname;
      if (isFrontHost && needsApiHost(u.pathname)) {
        const apiUrl = `${API_BASE_URL}${u.pathname}${u.search}`;
        console.log("[config.js] Rewriting frontend-host fetch →", apiUrl);
        return origFetch(apiUrl, init);
      }

      return origFetch(input, init);
    } catch (err) {
      console.warn("[config.js] fetch patch error, falling back:", err);
      return origFetch(input, init);
    }
  };
})();
