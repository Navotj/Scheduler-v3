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
    let timeoutId;
    const timeoutPromise = new Promise((_, reject) => {
      timeoutId = setTimeout(() => reject(new Error('Request timed out')), ms);
    });
    return Promise.race([
      promise.finally(() => clearTimeout(timeoutId)),
      timeoutPromise
    ]);
  }

  function setAuthStateSafe(authenticated, username) {
    try {
      if (typeof window.setAuthState === 'function') {
        window.setAuthState(authenticated, username);
      } else if (typeof document !== 'undefined') {
        document.dispatchEvent(new CustomEvent('auth:changed', {
          detail: { isAuthenticated: authenticated, username }
        }));
      }
    } catch (_) {}
  }

  // =========================
  // Public initializer
  // =========================
  window.initLoginForm = function () {
    const form = document.getElementById('login-form');
    const usernameInput = document.getElementById('username');
    const passwordInput = document.getElementById('password');
    const errorDisplay = document.getElementById('error');
    const submitBtn = form && form.querySelector('button[type="submit"]');

    if (!form || !usernameInput || !passwordInput) return;

    let pending = false;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      if (pending) return;
      pending = true;
      if (submitBtn) submitBtn.disabled = true;
      errorDisplay.textContent = '';

      const username = usernameInput.value.trim();
      const password = passwordInput.value;

      try {
        const { controller, timer } = withAbort(8000);
        const res = await withTimeoutPromise(fetch('/auth/login', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ username, password }),
          signal: controller.signal
        }), 9000);
        clearTimeout(timer);

        if (!res.ok) {
          const msg = await res.text().catch(()=>'');
          throw new Error(msg || 'Login failed');
        }

        // Verify with /auth/check (avoids false-positives if cookie set but session invalid)
        let verifiedUsername = username;
        try {
          const ver = await fetch('/auth/check', { credentials: 'include', cache: 'no-store' });
          if (ver.ok) {
            const j = await ver.json().catch(()=>({}));
            verifiedUsername = (j && (j.username || j.user || j.name)) || username;
          }
        } catch {}

        errorDisplay.style.color = '#7bd88f';
        errorDisplay.textContent = 'Login successful';
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
