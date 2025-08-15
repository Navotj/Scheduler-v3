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
      // 1) attempt login
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

      // 2) confirm session cookie actually present
      const check = await fetch('/auth/check', {
        credentials: 'include',
        cache: 'no-cache'
      });

      if (!check.ok) {
        errorDisplay.textContent = 'Login failed (no session)';
        return;
      }

      // 3) only now show success / update UI
      errorDisplay.style.color = '#0f0';
      errorDisplay.textContent = '✅ Sign-in successful. Loading...';
      setTimeout(() => {
        if (window.closeModal) window.closeModal();
        if (window.setAuthState) window.setAuthState(true, username);
        // location.reload(); // uncomment if you prefer a full refresh
      }, 600);
    } catch {
      errorDisplay.textContent = 'Connection error';
    }
  });
}
