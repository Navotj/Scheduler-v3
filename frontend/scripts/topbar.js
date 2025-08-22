(() => {
  async function mount() {
    const host = document.getElementById('topbar-root');
    if (!host) return;

    try {
      const res = await fetch('/components/topbar.html', { cache: 'no-cache' });
      const html = await res.text();
      host.innerHTML = html;
    } catch {
      // If fetch fails, fail silently to avoid breaking the page
      return;
    }

    const title = host.dataset.title || '';
    const titleEl = host.querySelector('#topbar-title');
    if (titleEl) {
      if (title) {
        titleEl.textContent = title;
        titleEl.style.display = 'inline';
      } else {
        titleEl.remove();
      }
    }

    setupAuthHandlers();
  }

  function setAuthUI(isAuthed, username) {
    const userLabel = document.getElementById('user-label');
    const authButton = document.getElementById('auth-button');
    if (!userLabel || !authButton) return;

    if (isAuthed) {
      userLabel.textContent = `Signed in as ${username}`;
      userLabel.style.display = 'inline';
      authButton.textContent = 'Logout';
      authButton.onclick = logout;
    } else {
      userLabel.textContent = '';
      userLabel.style.display = 'none';
      authButton.textContent = 'Login';
      authButton.onclick = () => {
        if (typeof window.openModal === 'function') {
          window.openModal('/pages/login.html');
        } else {
          window.location.href = '/pages/login.html';
        }
      };
    }
  }

  async function refreshAuth() {
    // Prefer the app's shared readiness if present
    if (typeof window.ensureAuthReady === 'function') {
      try { await window.ensureAuthReady(); } catch {}
    }

    let ok = false;
    let uname = null;

    try {
      const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
      if (res.ok) {
        const data = await res.json().catch(() => ({}));
        uname =
          (data && data.user && data.user.username) ||
          data.username ||
          data.name ||
          null;
        ok = !!uname;
      }
    } catch {}

    setAuthUI(ok, uname);
    if (typeof window.onAuthStateChange === 'function') {
      try { window.onAuthStateChange(ok, uname); } catch {}
    }
  }

  async function logout() {
    try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
    if (typeof window.__bustAuthCheckOnce === 'function') {
      try { window.__bustAuthCheckOnce(); } catch {}
    }
    setAuthUI(false, null);
    if (typeof window.onAuthStateChange === 'function') {
      try { window.onAuthStateChange(false, null); } catch {}
    }
  }

  function setupAuthHandlers() {
    // Provide a stable hook used by login.js after successful login
    window.setAuthState = function (authenticated, username) {
      const ok = !!authenticated;
      const uname = ok ? username : null;
      setAuthUI(ok, uname);
      if (typeof window.onAuthStateChange === 'function') {
        try { window.onAuthStateChange(ok, uname); } catch {}
      }
    };

    // Expose manual refresh
    window.topbar = { refreshAuth };

    // Initial check
    void refreshAuth();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    void mount();
  }
})();
