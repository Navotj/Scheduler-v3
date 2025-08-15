window.initLoginForm = function () {
  const form = document.getElementById('login-form');
  const errorDisplay = document.getElementById('error');

  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const username = document.getElementById('username').value;
    const password = document.getElementById('password').value;

    errorDisplay.textContent = '';
    errorDisplay.style.color = '#f55';

    try {
      const res = await fetch('/login', {
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

      const check = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
      if (!check.ok) {
        errorDisplay.textContent = 'Login failed (no session)';
        return;
      }

      errorDisplay.style.color = '#0f0';
      errorDisplay.textContent = '✅ Sign-in successful. Loading...';
      setTimeout(() => {
        if (window.closeModal) window.closeModal();
        if (window.setAuthState) window.setAuthState(true, username);
      }, 600);
    } catch (err) {
      console.error('[login] exception', err);
      errorDisplay.textContent = 'Connection error';
    }
  });
}
