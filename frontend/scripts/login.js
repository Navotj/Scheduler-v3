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
      const res = await fetch('http://backend.nat20scheduling.com/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ username, password })
      });

      if (res.ok) {
        errorDisplay.style.color = '#0f0';
        errorDisplay.textContent = '✅ Sign-in successful. Loading...';
        setTimeout(() => {
          window.closeModal();
          window.isAuthenticated = true;
          window.currentUsername = username;
          window.updateAuthUI();
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
