window.initRegisterForm = function () {
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm-password');
  const usernameInput = document.getElementById('username');
  const emailInput = document.getElementById('email');

  const matchWarning = document.getElementById('match-warning');
  const lengthWarning = document.getElementById('length-warning');
  const complexityWarning = document.getElementById('complexity-warning');
  const usernameWarning = document.getElementById('username-warning');
  const errorDisplay = document.getElementById('error');

  let passwordStarted = false;
  let usernameStarted = false;

  function checkPasswordsMatch() {
    if (passwordInput.value !== confirmInput.value) {
      matchWarning.textContent = 'Passwords do not match';
      return false;
    } else {
      matchWarning.textContent = '';
      return true;
    }
  }

  function checkPasswordLength() {
    if (!passwordStarted) return true;
    if (passwordInput.value.length < 6) {
      lengthWarning.textContent = 'Password must be at least 6 characters';
      return false;
    } else {
      lengthWarning.textContent = '';
      return true;
    }
  }

  function checkPasswordComplexity() {
    const hasLetters = /[a-zA-Z]/.test(passwordInput.value);
    const hasNumbers = /[0-9]/.test(passwordInput.value);
    if (!passwordStarted) return true;
    if (!hasLetters || !hasNumbers) {
      complexityWarning.textContent = 'Password must contain letters and numbers';
      return false;
    } else {
      complexityWarning.textContent = '';
      return true;
    }
  }

  function checkUsernameLength() {
    if (!usernameStarted) return true;
    if (usernameInput.value.length < 3) {
      usernameWarning.textContent = 'Username must be at least 3 characters';
      return false;
    } else {
      usernameWarning.textContent = '';
      return true;
    }
  }

  passwordInput.addEventListener('input', () => {
    passwordStarted = true;
    checkPasswordsMatch();
    checkPasswordLength();
    checkPasswordComplexity();
  });

  confirmInput.addEventListener('input', checkPasswordsMatch);

  usernameInput.addEventListener('input', () => {
    usernameStarted = true;
    checkUsernameLength();
  });

  document.getElementById('register-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = emailInput.value;
    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    const valid =
      checkPasswordsMatch() &
      checkPasswordLength() &
      checkPasswordComplexity() &
      checkUsernameLength();

    if (!valid) {
      errorDisplay.textContent = 'Fix validation issues';
      return;
    }

    try {
      const res = await fetch(`${window.API_BASE_URL}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ email, username, password })
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errorDisplay.textContent = data.error || 'Registration failed';
        return;
      }

      // Show verification notice instead of opening login directly
      if (typeof window.openVerificationNotice === 'function') {
        window.openVerificationNotice(email);
      } else if (typeof window.openLoginModal === 'function') {
        window.openLoginModal();
      }
    } catch (err) {
      errorDisplay.textContent = 'Connection error';
    }
  });
};
