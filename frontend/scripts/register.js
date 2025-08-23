window.initRegisterForm = function () {
  const passwordInput = document.getElementById('password');
  const confirmInput = document.getElementById('confirm-password');
  const usernameInput = document.getElementById('username');

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
    if (passwordInput.value.length < 8) {
      lengthWarning.textContent = 'Password must be at least 8 characters';
      return false;
    } else {
      lengthWarning.textContent = '';
      return true;
    }
  }

  function checkPasswordComplexity() {
    if (!passwordStarted) return true;
    const hasLetter = /[A-Za-z]/.test(passwordInput.value);
    const hasNumber = /[0-9]/.test(passwordInput.value);
    if (!hasLetter || !hasNumber) {
      complexityWarning.textContent = 'Password should contain letters and numbers';
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

  confirmInput.addEventListener('input', () => {
    passwordStarted = true;
    checkPasswordsMatch();
  });

  usernameInput.addEventListener('input', () => {
    usernameStarted = true;
    checkUsernameLength();
  });

  const form = document.getElementById('register-form');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    usernameStarted = true;
    passwordStarted = true;

    const uOk = checkUsernameLength();
    const lenOk = checkPasswordLength();
    const compOk = checkPasswordComplexity();
    const matchOk = checkPasswordsMatch();
    if (!(uOk && lenOk && compOk && matchOk)) return;

    const username = usernameInput.value.trim();
    const password = passwordInput.value;

    try {
      const res = await fetch('/auth/register', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!res.ok) {
        const msg = await res.text().catch(()=>'');
        throw new Error(msg || 'Registration failed');
      }
      errorDisplay.style.color = '#7bd88f';
      errorDisplay.textContent = 'Registration successful';
      setTimeout(() => {
        if (window.swapModal) window.swapModal('/pages/login.html');
      }, 300);
    } catch (err) {
      errorDisplay.style.color = '#f55';
      errorDisplay.textContent = err && err.message ? err.message : 'Connection error';
    }
  });
};
