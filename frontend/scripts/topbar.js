/* Topbar loader with Shadow DOM encapsulation + hard reset of typography and sizing.
   Ensures consistent height, padding, and font across all pages regardless of page CSS.
   Exposes window.topbar.refreshAuth() and window.setAuthState() hooks.
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

    // Normalize host so page-level CSS can't alter layout differently per page
    host.style.display = 'block';
    host.style.margin = '0';
    host.style.padding = '0';
    host.style.width = '100%';

    // If already mounted, just refresh auth
    if (host.shadowRoot) {
      shadowRoot = host.shadowRoot;
      setupAuthHandlers();
      void refreshAuth();
      return;
    }

    // Attach shadow root
    shadowRoot = host.attachShadow({ mode: 'open' });

    // Load HTML and CSS
    let html = '';
    let css = '';
    try {
      [html, css] = await Promise.all([
        fetchText('/components/topbar.html'),
        fetchText('/styles/topbar.css'),
      ]);
    } catch (e) {
      html = `
        <header class="nat20-top-bar">
          <div class="top-left">
            <a class="breadcrumb" href="/index.html">← Home</a>
            <strong id="topbar-title" class="title"></strong>
          </div>
          <div class="user-info">
            <span id="user-label" class="user-label" style="display:none;"></span>
            <button id="auth-button" class="auth-btn">Login</button>
          </div>
        </header>`;
      css = `
        :host{display:block; margin:0; padding:0; width:100%;
          font-family: system-ui,-apple-system,"Segoe UI",Roboto,"Helvetica Neue",Arial,"Noto Sans","Liberation Sans",sans-serif;
          font-size:14px; line-height:1.2; color-scheme: dark; }
        .nat20-top-bar{box-sizing:border-box; display:flex; justify-content:space-between; align-items:center;
          height:56px; padding:0 20px; background:#171717; border-bottom:1px solid #333; position:sticky; top:0; z-index:1000}
        .top-left{display:flex; align-items:center; gap:12px}
        .breadcrumb{color:#9ecbff; text-decoration:none}
        .breadcrumb:hover{text-decoration:underline}
        .title{font-weight:700; color:#fff}
        .user-info{display:flex; align-items:center; gap:12px}
        .user-label{opacity:.9; color:#eee}
        .auth-btn{height:28px; padding:6px 10px; border-radius:8px; border:1px solid #333; background:#2d6cdf; color:#fff; cursor:pointer; line-height:1}
        .auth-btn:hover{filter:brightness(1.1)}
      `;
    }

    // Inject into shadow
    shadowRoot.innerHTML = `<style>${css}</style>${html}`;

    // Apply fixed title from host dataset
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
    window.setAuthState = function (authenticated, username) {
      const ok = !!authenticated;
      const uname = ok ? username : null;
      setAuthUI(ok, uname);
      if (typeof window.onAuthStateChange === 'function') {
        try { window.onAuthStateChange(ok, uname); } catch {}
      }
    };
    window.topbar = { refreshAuth };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    void mount();
  }
})();
