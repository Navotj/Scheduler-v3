/* Topbar loader with Shadow DOM encapsulation.
   - Prevents page-level CSS (e.g., header/topbar resets with !important) from overriding the top bar.
   - Fetches /components/topbar.html and /styles/topbar.css, injects both into a shadowRoot.
   - Exposes window.topbar.refreshAuth() and window.setAuthState() just like before.
*/
(() => {
  let shadowRoot = null;

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.text();
  }

  async function mount() {
    const host = document.getElementById('topbar-root');
    if (!host) return;

    // Idempotent: if already mounted with a shadow root, just refresh auth state.
    if (host.shadowRoot) {
      shadowRoot = host.shadowRoot;
      setupAuthHandlers();
      void refreshAuth();
      return;
    }

    // Attach shadow root so page CSS cannot override the bar
    shadowRoot = host.attachShadow({ mode: 'open' });

    // Load HTML + CSS for the top bar
    let html = '';
    let css = '';
    try {
      [html, css] = await Promise.all([
        fetchText('/components/topbar.html'),
        fetchText('/styles/topbar.css'),
      ]);
    } catch (e) {
      // Hard fallback: render minimal inline bar if assets fail
      html = `
        <header class="top-bar">
          <div class="top-left">
            <a class="breadcrumb" href="/index.html">← Home</a>
            <strong id="topbar-title" style="margin-left:8px;"></strong>
          </div>
          <div class="user-info">
            <span id="user-label" class="user-label" style="display:none;"></span>
            <button id="auth-button" class="btn btn-secondary">Login</button>
          </div>
        </header>`;
      css = `
        .top-bar{display:flex;justify-content:space-between;align-items:center;height:56px;padding:0 20px;background:#171717;border-bottom:1px solid #333;position:sticky;top:0;z-index:100}
        .top-left{display:flex;align-items:center;gap:12px}
        .top-bar a{color:#9ecbff;text-decoration:none}
        #auth-button{background:#2d6cdf;color:#fff;border:0;padding:8px 12px;border-radius:8px;cursor:pointer}
        #auth-button:hover{filter:brightness(1.1)}
        #topbar-title{display:inline;font-weight:700}
      `;
    }

    // Render into shadow root
    shadowRoot.innerHTML = `<style>${css}</style>${html}`;

    // Title (from host data-title)
    const title = host.dataset.title || '';
    const titleEl = shadowRoot.querySelector('#topbar-title');
    if (titleEl) {
      if (title) {
        titleEl.textContent = title;
        titleEl.style.display = 'inline';
      } else {
        titleEl.remove();
      }
    }

    setupAuthHandlers();
    void refreshAuth();
  }

  function q(sel) {
    return shadowRoot ? shadowRoot.querySelector(sel) : null;
  }

  function setAuthUI(isAuthed, username) {
    const userLabel = q('#user-label');
    const authButton = q('#auth-button');
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
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    void mount();
  }
})();
