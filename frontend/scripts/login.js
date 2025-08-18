(function () {
  'use strict';

  // =========================
  // Helpers
  // =========================

  // Abort-based timeout (used for non-deduped requests like POST /auth/login)
  function withAbort(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  // Promise timeout without aborting the underlying request (safe with deduped fetch)
  function withTimeoutPromise(promise, ms) {
    return new Promise((resolve, reject) => {
      const t = setTimeout(() => reject(new Error('timeout')), ms);
      promise
        .then((v) => {
          clearTimeout(t);
          resolve(v);
        })
        .catch((e) => {
          clearTimeout(t);
          reject(e);
        });
    });
  }

  function setAuthStateSafe(isAuthed, username) {
    if (typeof window.setAuthState === 'function') {
      window.setAuthState(!!isAuthed, username || null);
    }
  }

  // =========================
  // Global fetch de-duplication for auth/settings endpoints
  // - Prevents duplicate concurrent requests that cause "(canceled)" noise.
  // - Ignores caller-provided AbortSignals so one caller can't cancel others.
  // =========================

  if (!window.__dedupeFetchInstalled) {
    const origFetch = window.fetch.bind(window);
    const inflight = new Map();

    // Treat /auth/check and /check as a single logical key to avoid double-hitting both.
    function canonicalKey(url) {
      const u = new URL(url, window.location.origin);
      const p = u.pathname;
      if (p === '/auth/check' || p === '/check') {
        return `${u.origin}/__authcheck__`;
      }
      if (p === '/settings') {
        return `${u.origin}/__settings__${u.search}`;
      }
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
        // If URL parsing fails, fall back to original fetch.
        return origFetch(input, init);
      }

      if (!shouldDedupe(absolute)) {
        return origFetch(input, init);
      }

      const key = canonicalKey(absolute);
      if (inflight.has(key)) {
        return inflight.get(key).then((resp) => resp.clone());
      }

      // Merge defaults without overriding explicit caller options (except ignore signal).
      const merged = { ...(init || {}) };
      if (!('credentials' in merged)) merged.credentials = 'include';
      if (!('cache' in merged)) merged.cache = 'no-store';
      if ('signal' in merged) delete merged.signal; // avoid cross-cancellation

      const req = origFetch(absolute, merged).finally(() => {
        // Drop from map after settle so new calls can refetch.
        setTimeout(() => inflight.delete(key), 0);
      });

      inflight.set(key, req);
      return req.then((resp) => resp.clone());
    };
  }

  // =========================
  // Initial page-load auth check with single-flight + retry
  // =========================

  const CHECK_ENDPOINT_PRIMARY = '/auth/check'; // current canonical endpoint
  const CHECK_ENDPOINT_FALLBACK = '/check';     // if primary fails hard

  async function doAuthCheckOnce(endpoint) {
    // Use deduped fetch; apply logical timeout without aborting the underlying request.
    const res = await withTimeoutPromise(
      fetch(endpoint, { credentials: 'include', cache: 'no-store' }),
      8000
    );
    if (!res.ok) throw new Error(`check ${res.status}`);
    let data = {};
    try {
      data = await res.json();
    } catch {}
    return data || {};
  }

  async function runInitialAuthCheckInternal() {
    try {
      const data = await doAuthCheckOnce(CHECK_ENDPOINT_PRIMARY);
      return data;
    } catch (e1) {
      // Retry once with a longer timeout and try the fallback path if needed.
      try {
        const res = await withTimeoutPromise(
          fetch(CHECK_ENDPOINT_PRIMARY, { credentials: 'include', cache: 'no-store' }),
          12000
        );
        if (!res.ok) throw new Error(`check ${res.status}`);
        return (await res.json().catch(() => ({}))) || {};
      } catch (e2) {
        try {
          const res = await withTimeoutPromise(
            fetch(CHECK_ENDPOINT_FALLBACK, { credentials: 'include', cache: 'no-store' }),
            12000
          );
          if (!res.ok) throw new Error(`check ${res.status}`);
          return (await res.json().catch(() => ({}))) || {};
        } catch {
          return {};
        }
      }
    }
  }

  // Single-flight global promise so multiple scripts/pages don't duplicate work.
  if (!window.auth) window.auth = { state: 'unknown', user: null, ready: null };
  if (!window.__authCheckPromise) {
    window.__authCheckPromise = (async () => {
      const data = await runInitialAuthCheckInternal();
      const name =
        (data && data.user && data.user.username) ||
        (data && data.username) ||
        '';
      if (name) {
        window.auth.state = 'authenticated';
        window.auth.user = name;
        setAuthStateSafe(true, name);
      } else {
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
  // Login form handler (unchanged semantics; uses abort for POST; verify via deduped check)
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
        // 1) Login (20s hard cap, real abort)
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

        // 2) Verify session (10s logical cap; uses deduped fetch)
        let verifiedUsername = '';
        {
          const res = await withTimeoutPromise(
            fetch(CHECK_ENDPOINT_PRIMARY, { credentials: 'include', cache: 'no-store' }),
            10000
          ).catch(async () => {
            // Fallback to /check if /auth/check fails on some pages
            return withTimeoutPromise(
              fetch(CHECK_ENDPOINT_FALLBACK, { credentials: 'include', cache: 'no-store' }),
              10000
            );
          });

          if (!res || !res.ok) throw new Error('Login failed (no session)');
          const data = await res.json().catch(() => ({}));
          verifiedUsername =
            (data && data.user && data.user.username) ||
            data.username ||
            '';
          if (!verifiedUsername)
            throw new Error('Login failed (invalid session)');
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
