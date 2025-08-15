window.initLoginForm = function () {
  const form = document.getElementById('login-form');
  const errorDisplay = document.getElementById('error');

  if (!form) return;

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = (document.getElementById('username').value || '').trim();
    const password = document.getElementById('password').value || '';

    errorDisplay.textContent = '';
    errorDisplay.style.color = '#f55';

    try {
      // Always hit API origin path so CloudFront routes to the backend
      const res = await fetch('/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorDisplay.textContent = data.error || 'Login failed';
        return;
      }

      // Verify a real session cookie exists (prevents false positives)
      const check = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
      if (!check.ok) {
        errorDisplay.textContent = 'Login failed (no session)';
        return;
      }

      const data = await check.json().catch(() => null);
      const verifiedUsername =
        (data && data.user && data.user.username) ||
        (data && data.username) ||
        '';

      if (!verifiedUsername) {
        errorDisplay.textContent = 'Login failed (invalid session)';
        return;
      }

      errorDisplay.style.color = '#0f0';
      errorDisplay.textContent = '✅ Sign-in successful';
      setTimeout(() => {
        if (window.closeModal) window.closeModal();
        if (window.setAuthState) window.setAuthState(true, verifiedUsername);
      }, 400);
    } catch (err) {
      errorDisplay.textContent = 'Connection error';
    }
  });
};
