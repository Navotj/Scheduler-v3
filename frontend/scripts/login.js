window.initLoginForm = function () {
  const form = document.getElementById('login-form');
  const errorDisplay = document.getElementById('error');

  if (!form) return;

  function withAbort(ms) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), ms);
    return { controller, timer };
  }

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
      // 1) Login (short, bounded timeout)
      {
        const { controller, timer } = withAbort(10000); // 10s
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

      // 2) Verify session (short, bounded timeout)
      let verifiedUsername = '';
      {
        const { controller, timer } = withAbort(8000); // 8s
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
        if (!verifiedUsername) throw new Error('Login failed (invalid session)');
      }

      // 3) Success UI
      errorDisplay.style.color = '#0f0';
      errorDisplay.textContent = '✅ Sign-in successful';
      setTimeout(() => {
        if (window.closeModal) window.closeModal();
        if (window.setAuthState) window.setAuthState(true, verifiedUsername);
      }, 300);
    } catch (err) {
      errorDisplay.textContent =
        (err && err.message) ? err.message : 'Connection error';
    } finally {
      pending = false;
      if (submitBtn) submitBtn.disabled = false;
    }
  });
};
