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
      const res = await fetch('http://backend.nat20scheduling.com:3000/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        errorDisplay.style.color = '#0f0';
        errorDisplay.textContent = '✅ Sign-in successful. Loading...';
        setTimeout(() => {
          if (window.closeModal) window.closeModal();
          // Prefer unified setter if present (works for index.html and schedule.html)
          if (typeof window.setAuthState === 'function') {
            window.setAuthState(true, username);
          } else {
            // Fallback for any page not exposing setAuthState
            window.isAuthenticated = true;
            window.currentUsername = username;
            if (typeof window.updateAuthUI === 'function') window.updateAuthUI();
          }
        }, 1000);
      } else {
        const data = await res.json();
        errorDisplay.textContent = data.error || 'Login failed';
      }
    } catch {
      errorDisplay.textContent = 'Connection error';
    }
  });
}
