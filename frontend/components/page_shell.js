// components/page_shell.js
// Light-DOM page shell. Preserves existing children by moving them into #ps-content.
(() => {
  'use strict';

  const TPL = (title, homeHref) => `
    <div id="ps-modal-overlay" style="display:none;">
      <div id="ps-modal-container"></div>
    </div>

    <header class="top-bar">
      <div class="top-left">
        <a class="breadcrumb" href="${homeHref}">← Home</a>
        <h1 class="title">${title || ''}</h1>
      </div>
      <div class="user-info">
        <span id="ps-user-label" class="user-label" style="display:none;"></span>
        <button id="ps-auth-btn">Login</button>
      </div>
    </header>

    <main id="ps-content" class="container"></main>
  `;

  class PageShell extends HTMLElement {
    constructor() {
      super();
      this.isAuthenticated = false;
      this.username = null;
      this._authChanged = this.dispatchAuthChanged.bind(this);
    }

    connectedCallback() {
      // Save any existing children (e.g., <availability-grid>)
      const children = Array.from(this.childNodes);

      // Build shell
      const inPages = (location.pathname || '').includes('/pages/');
      const homeHref = this.getAttribute('home-href') || (inPages ? '../index.html' : '/index.html');
      const title = this.getAttribute('page-title') || '';
      this.innerHTML = TPL(title, homeHref);

      // Move original children into the real content container (NOT a <slot/>)
      const content = this.querySelector('#ps-content');
      for (const n of children) {
        // Skip pure whitespace text nodes
        if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) continue;
        content.appendChild(n);
      }

      // Wire auth button
      const authBtn = this.querySelector('#ps-auth-btn');
      authBtn.addEventListener('click', () => {
        if (this.isAuthenticated) this.logout();
        else this.openModal('../pages/login.html');
      });

      // Expose modal helpers for login/register scripts
      window.openModal = this.openModal.bind(this);
      window.swapModal = this.swapModal.bind(this);
      window.closeModal = this.closeModal.bind(this);

      // Initialize auth UI
      this.checkAuth().then(this._authChanged);
    }

    // ---------- Modal helpers ----------
    openModal(path) {
      const overlay = this.querySelector('#ps-modal-overlay');
      const container = this.querySelector('#ps-modal-container');
      fetch(path, { cache: 'no-cache' })
        .then(r => r.text())
        .then(html => {
          container.innerHTML = html;
          overlay.style.display = 'flex';
          document.body.classList.add('modal-active');
          this.runModalInit(path);
        });
    }
    swapModal(path) {
      const container = this.querySelector('#ps-modal-container');
      fetch(path, { cache: 'no-cache' })
        .then(r => r.text())
        .then(html => {
          container.innerHTML = html;
          document.body.classList.add('modal-active');
          this.runModalInit(path);
        });
    }
    closeModal() {
      this.querySelector('#ps-modal-overlay').style.display = 'none';
      document.body.classList.remove('modal-active');
      this.querySelector('#ps-modal-container').innerHTML = '';
    }
    runModalInit(path) {
      if (path.includes('register.html') && window.initRegisterForm) window.initRegisterForm();
      else if (path.includes('login.html') && window.initLoginForm) window.initLoginForm();
    }

    // ---------- Auth ----------
    async checkAuth() {
      try {
        const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
        if (!res.ok) throw new Error();
        const data = await res.json().catch(() => ({}));
        const uname = (data && data.user && data.user.username) || data.username || null;
        this.isAuthenticated = !!uname;
        this.username = uname;
      } catch {
        this.isAuthenticated = false;
        this.username = null;
      }
      this.updateAuthUI();
      window.__authState = { authenticated: this.isAuthenticated, username: this.username };
    }

    async logout() {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      this.isAuthenticated = false;
      this.username = null;
      this.updateAuthUI();
      this.dispatchAuthChanged();
    }

    updateAuthUI() {
      const userLabel = this.querySelector('#ps-user-label');
      const authButton = this.querySelector('#ps-auth-btn');
      if (this.isAuthenticated) {
        userLabel.textContent = `Signed in as ${this.username}`;
        userLabel.style.display = 'inline';
        authButton.textContent = 'Logout';
      } else {
        userLabel.style.display = 'none';
        userLabel.textContent = '';
        authButton.textContent = 'Login';
      }
    }

    dispatchAuthChanged() {
      this.dispatchEvent(new CustomEvent('auth-changed', {
        bubbles: true,
        detail: { authenticated: this.isAuthenticated, username: this.username }
      }));
    }
  }

  customElements.define('page-shell', PageShell);
})();
