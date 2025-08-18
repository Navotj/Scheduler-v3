(function () {
  'use strict';

  // ---- utilities ----
  function withAbort(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

  function setAuthStateSafe(isAuthed, username) {
    if (typeof window.setAuthState === 'function') {
      window.setAuthState(!!isAuthed, username || null);
    }
  }

  // ---- initial page-load auth check (longer timeout + single retry) ----
  function runInitialAuthCheck(timeoutMs = 8000, didRetry = false) {
    const { controller, timer } = withAbort(timeoutMs);
    fetch('/auth/check', {
      credentials: 'include',
      cache: 'no-store',
      signal: controller.signal
    })
      .then(async (res) => {
        clearTimeout(timer);
        if (!res.ok) {
          setAuthStateSafe(false, null);
          return null;
        }
        try {
          return await res.json();
        } catch {
          return null;
        }
      })
      .then((data) => {
        if (!data) {
          setAuthStateSafe(false, null);
          return;
        }
        const name =
          (data && data.user && data.user.username) ||
          (data && data.username) ||
          '';
        if (name) setAuthStateSafe(true, name);
        else setAuthStateSafe(false, null);
      })
      .catch((err) => {
        // Retry once with a slightly longer timeout if the first attempt aborted/failed
        if (!didRetry) {
          runInitialAuthCheck(Math.max(timeoutMs, 12000), true);
        } else {
          setAuthStateSafe(false, null);
        }
      });
  }

  // ---- login form handler (more generous timeouts) ----
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
        // 1) Login (20s hard cap)
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

        // 2) Verify session (10s hard cap)
        let verifiedUsername = '';
        {
          const { controller, timer } = withAbort(10000);
          const check = await fetch('/auth/check', {
            credentials: 'include',
            cache: 'no-cache',
            signal: controller.signal
          });
          clearTimeout(timer);

          if (!check.ok) throw new Error('Login failed (no session)');

          const data = await check.json().catch(() => ({}));
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

  // kick off initial session check on load
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () =>
      runInitialAuthCheck(8000)
    );
  } else {
    runInitialAuthCheck(8000);
  }
})();
