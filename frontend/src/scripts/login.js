(function () {
  'use strict';

  // =========================
  // Helpers
  // =========================
  const API = (window.API_BASE_URL || '/api').replace(/\/$/, '');
  const CHECK_ENDPOINT = `${API}/auth/check`;

  function withTimeoutPromise(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      promise.then(
        (v) => { clearTimeout(t); resolve(v); },
        (e) => { clearTimeout(t); reject(e); }
      );
    });
  }

  function setAuthStateSafe(isAuthed, username) {
    if (typeof window.setAuthState === 'function') {
      window.setAuthState(!!isAuthed, username || null);
    }
  }

  // =========================
  // Global fetch de-duplication (auth/settings)
  // =========================
  if (!window.__dedupeFetchInstalled) {
    const origFetch = window.fetch.bind(window);
    const inflight = (window.__dedupeInflight = new Map());

    function canonicalKey(url) {
      const u = new URL(url, window.location.origin);
      const p = u.pathname;
      if (p.endsWith('/auth/check')) return `${u.origin}/__authcheck__`;
      if (p.endsWith('/settings')) return `${u.origin}/__settings__${u.search}`;
      return u.toString();
    }

    function shouldDedupe(url) {
      const p = new URL(url, window.location.origin).pathname;
      return p.endsWith('/auth/check') || p.endsWith('/settings');
    }

    window.__dedupeFetchInstalled = true;
    window.fetch = function dedupedFetch(input, init) {
      const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
      let absolute;
      try {
        absolute = new URL(urlStr, window.location.origin).toString();
      } catch {
        return origFetch(input, init);
      }

      if (!shouldDedupe(absolute)) {
        return origFetch(input, init);
      }

      const key = canonicalKey(absolute);
      if (inflight.has(key)) return inflight.get(key).then((resp) => resp.clone());

      const merged = { ...(init || {}) };
      if (!('credentials' in merged)) merged.credentials = 'include';
      if (!('cache' in merged)) merged.cache = 'no-store';
      if ('signal' in merged) delete merged.signal; // avoid cross-cancellation

      const req = origFetch(absolute, merged).finally(() => {
        setTimeout(() => inflight.delete(key), 0);
      });

      inflight.set(key, req);
      return req.then((resp) => resp.clone());
    };

    // Helper to force next /auth/check to hit origin (used after login)
    window.__bustAuthCheckOnce = function () {
      (window.__dedupeInflight || new Map()).delete(`${window.location.origin}/__authcheck__`);
    };
  }

  // =========================
  // Initial page-load auth check (single-flight, deterministic)
  // =========================
  async function doAuthCheckOnce() {
    const res = await withTimeoutPromise(
      fetch(CHECK_ENDPOINT, { credentials: 'include', cache: 'no-store' }),
      12000
    );
    if (!res.ok) throw new Error(`check ${res.status}`);
    let data = {};
    try { data = await res.json(); } catch {}
    return data || {};
  }

  if (!window.auth) window.auth = { state: 'unknown', user: null, ready: null };

  if (!window.__authCheckPromise) {
    window.__authCheckPromise = (async () => {
      try {
        const data = await doAuthCheckOnce();
        const name =
          (data && data.user && data.user.username) ||
          (data && data.username) || '';
        if (name) {
          window.auth.state = 'authenticated';
          window.auth.user = name;
          setAuthStateSafe(true, name);
        } else {
          window.auth.state = 'authenticated'; // session may exist but username not set yet
          window.auth.user = null;
          setAuthStateSafe(true, null);
        }
      } catch {
        window.auth.state = 'anonymous';
        window.auth.user = null;
        setAuthStateSafe(false, null);
      }
    })();
    window.auth.ready = window.__authCheckPromise;
  }

  window.ensureAuthReady = function ensureAuthReady() {
    return window.auth && window.auth.ready ? window.auth.ready : Promise.resolve();
  };

  // Kick off initial session check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void window.ensureAuthReady(), { once: true });
  } else {
    void window.ensureAuthReady();
  }

  // =========================
  // OAuth helpers
  // =========================
  window.oauthStart = function oauthStart(provider) {
    const p = String(provider || '').toLowerCase();
    const returnTo = window.location.href;
    window.location.href = `${API}/auth/oauth/${encodeURIComponent(p)}/start?returnTo=${encodeURIComponent(returnTo)}`;
  };

  // After OAuth callback, backend may append ?needsUsername=1 to the return URL.
  function needsUsernameFromURL() {
    try {
      const u = new URL(window.location.href);
      return u.searchParams.get('needsUsername') === '1';
    } catch {
      return false;
    }
  }

  async function maybePromptUsername() {
    // wait for auth state
    await window.ensureAuthReady();
    const need = needsUsernameFromURL() || (window.auth && window.auth.state === 'authenticated' && !window.auth.user);
    if (!need) return;
    if (typeof window.openUsernameModal === 'function') {
      window.openUsernameModal();
    }
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => void maybePromptUsername(), { once: true });
  } else {
    void maybePromptUsername();
  }
})();
