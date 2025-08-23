/* scripts/topbar.js
   Shadow DOM topbar renderer + shared padding control (via topbar.css).
   Looks for #topbar-root (placed by <nat20-page>).
*/
(() => {
  let shadowRoot = null;
  let auth = { ok: false, user: null };

  async function fetchFirst(paths) {
    for (const p of paths) {
      try {
        const res = await fetch(p, { cache: 'no-cache', credentials: 'same-origin' });
        if (res.ok) return await res.text();
      } catch {}
    }
    throw new Error('Topbar asset(s) not found at any expected path.');
  }

  function titleFromHost() {
    const host = document.getElementById('topbar-root');
    return (host && host.dataset.title) || document.title || 'NAT20';
  }

  function applyTitle() {
    if (!shadowRoot) return;
    const el = shadowRoot.getElementById('topbar-title');
    if (el) el.textContent = titleFromHost();
  }

  function renderAuthUI() {
    if (!shadowRoot) return;
    const userLabel = shadowRoot.getElementById('user-label');
    const authBtn = shadowRoot.getElementById('auth-button');
    if (!authBtn || !userLabel) return;

    if (auth.ok) {
      userLabel.textContent = `Signed in as ${auth.user}`;
      userLabel.style.display = 'inline';
      authBtn.textContent = 'Logout';
      authBtn.onclick = () => {
        auth = { ok: false, user: null };
        if (typeof window.onAuthStateChange === 'function') {
          try { window.onAuthStateChange(false, null); } catch {}
        }
        renderAuthUI();
      };
    } else {
      userLabel.textContent = '';
      userLabel.style.display = 'none';
      authBtn.textContent = 'Login';
      authBtn.onclick = () => {
        // Keep simple: navigate to login page (modal loader can hook into this if present)
        location.href = '/pages/login.html';
      };
    }
  }

  async function mount() {
    const host = document.getElementById('topbar-root');
    if (!host) return;

    // Resolve assets for both /frontend/ and site-root hosting
    const html = await fetchFirst([
      '/components/topbar.html',
      '../components/topbar.html',
      './components/topbar.html',
      '/frontend/components/topbar.html'
    ]);

    const css = await fetchFirst([
      '/styles/topbar.css',
      '../styles/topbar.css',
      './styles/topbar.css',
      '/frontend/styles/topbar.css'
    ]);

    shadowRoot = host.attachShadow({ mode: 'open' });

    const style = document.createElement('style');
    style.textContent = `
      :host, * { box-sizing: border-box; }
      :host { display:block; }
    `;

    const styleBar = document.createElement('style');
    styleBar.textContent = css;

    const wrap = document.createElement('div');
    wrap.innerHTML = html;

    shadowRoot.appendChild(style);
    shadowRoot.appendChild(styleBar);
    shadowRoot.appendChild(wrap);

    applyTitle();
    renderAuthUI();

    // Public hooks
    window.setAuthState = (isOk, username) => {
      auth = { ok: !!isOk, user: isOk ? username : null };
      if (typeof window.onAuthStateChange === 'function') {
        try { window.onAuthStateChange(auth.ok, auth.user); } catch {}
      }
      renderAuthUI();
    };
    window.topbar = {
      refreshAuth(isOk, username) {
        if (typeof isOk !== 'undefined') {
          auth = { ok: !!isOk, user: isOk ? username : null };
        }
        applyTitle();
        renderAuthUI();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount, { once: true });
  } else {
    void mount();
  }
})();
