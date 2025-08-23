(function () {
  'use strict';

  // =========================
  // Helpers
  // =========================

  // Abort-based timeout (used only for POST /auth/login)
  function withAbort(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  // Promise timeout that does NOT abort the request (prevents "(canceled)")
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
  // - Prevents races & "(canceled)" from concurrent checks.
  // - No AbortSignals are honored for these endpoints.
  // =========================
  if (!window.__dedupeFetchInstalled) {
    const origFetch = window.fetch.bind(window);
    const inflight = (window.__dedupeInflight = new Map());

    function canonicalKey(url) {
      const u = new URL(url, window.location.origin);
      const p = u.pathname;
      if (p === '/auth/check' || p === '/check') return `${u.origin}/__authcheck__`;
      if (p === '/settings') return `${u.origin}/__settings__${u.search}`;
      return u.toString();
    }

    function shouldDedupe(url) {
      const p = new URL(url, window.location.origin).pathname;
      return p === '/auth/check' || p === '/check' || p === '/settings';
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
      inflight.delete(`${window.location.origin}/__authcheck__`);
    };
  }

  // =========================
  // Initial page-load auth check (single-flight, deterministic)
  // Always use /auth/check to remove ambiguity.
  // =========================

  const CHECK_ENDPOINT = '/auth/check';

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
          window.auth.state = 'anonymous';
          window.auth.user = null;
          setAuthStateSafe(false, null);
        }
      } catch {
        // Deterministic fallback: treat as anonymous without canceling requests
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
  // Login form handler
  // =========================
  window.initLoginForm = function () {
    const form = document.getElementById('login-form');
    const errorDisplay = document.getElementById('error');
    if (!form) return;

    let pending = false;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pending) return;

      const username = (document.getElementById('username').value || '').trim();
      const password = document.getElementById('password').value || '';

      const submitBtn = form.querySelector('button[type="submit"]');
      pending = true;
      if (submitBtn) submitBtn.disabled = true;
      errorDisplay.style.color = '#f55';
      errorDisplay.textContent = '';

      try {
        // 1) Login (20s hard cap with abort)
        {
          const { controller, timer } = withAbort(20000);
          const res = await fetch('/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            cache: 'no-store',
            signal: controller.signal,
            body: JSON.stringify({ username, password })
          });
          clearTimeout(timer);

          if (!res.ok) {
            let message = 'Login failed';
            try {
              const data = await res.json();
              if (data && data.error) message = data.error;
            } catch {}
            throw new Error(message);
          }
        }

        // 2) Verify session deterministically via /auth/check (no abort)
        let verifiedUsername = '';
        {
          // Ensure next check isn't served from a shared in-flight promise
          if (typeof window.__bustAuthCheckOnce === 'function') window.__bustAuthCheckOnce();

          const res = await withTimeoutPromise(
            fetch(`${CHECK_ENDPOINT}?t=${Date.now()}`, { credentials: 'include', cache: 'no-store' }),
            10000
          );

          if (!res.ok) throw new Error('Login failed (no session)');
          const data = await res.json().catch(() => ({}));
          verifiedUsername =
            (data && data.user && data.user.username) ||
            data.username || '';
          if (!verifiedUsername) throw new Error('Login failed (invalid session)');
        }

        // 3) Success UI
        errorDisplay.style.color = '#0f0';
        errorDisplay.textContent = '✅ Sign-in successful';
        setTimeout(() => {
          if (window.closeModal) window.closeModal();
          setAuthStateSafe(true, verifiedUsername);
        }, 300);
      } catch (err) {
        errorDisplay.textContent =
          err && err.message ? err.message : 'Connection error';
      } finally {
        pending = false;
        if (submitBtn) submitBtn.disabled = false;
      }
    });
  };
})();
