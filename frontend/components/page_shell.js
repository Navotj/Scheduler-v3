// components/page_shell.js
// Light-DOM page shell used by all pages. Renders a top bar and hosts auth modal.
// Emits 'auth-changed' event with {authenticated, username}.
(() => {
  'use strict';

  const TPL = (title, homeHref) => `
    <!-- Modal host reused by login/register -->
    <div id="modal-overlay" style="display:none;">
      <div id="modal-container"></div>
    </div>

    <!-- Top bar -->
    <header class="top-bar">
      <div class="top-left">
        <a class="breadcrumb" href="${homeHref}">← Home</a>
        <h1 class="title">${title || ''}</h1>
      </div>
      <div class="user-info">
        <span id="user-label" class="user-label" style="display:none;"></span>
        <button id="auth-button">Login</button>
      </div>
    </header>

    <!-- Content area -->
    <main class="page-shell">
      <slot name="content"></slot>
    </main>
  `;

  class PageShell extends HTMLElement {
    constructor() {
      super();
      this.isAuthenticated = false;
      this.username = null;
      this._boundUpdate = this.updateAuthUI.bind(this);
    }

    connectedCallback() {
      const inPages = (location.pathname || '').includes('/pages/');
      const homeHref = this.getAttribute('home-href') || (inPages ? '../index.html' : '/index.html');

      const title = this.getAttribute('page-title') || '';
      this.innerHTML = TPL(title, homeHref);

      const authBtn = this.querySelector('#auth-button');
      if (authBtn) authBtn.addEventListener('click', () => {
        if (this.isAuthenticated) this.logout();
        else this.openModal('../pages/login.html');
      });

      // Expose modal helpers globally so login/register can call them
      window.openModal = this.openModal.bind(this);
      window.swapModal = this.swapModal.bind(this);
      window.closeModal = this.closeModal.bind(this);

      this.checkAuth().then(() => this.dispatchAuthChanged());
    }

    // ----- Modal helpers -----
    openModal(path) {
      const overlay = this.querySelector('#modal-overlay');
      const container = this.querySelector('#modal-container');
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
      const container = this.querySelector('#modal-container');
      fetch(path, { cache: 'no-cache' })
        .then(r => r.text())
        .then(html => {
          container.innerHTML = html;
          document.body.classList.add('modal-active');
          this.runModalInit(path);
        });
    }
    closeModal() {
      const overlay = this.querySelector('#modal-overlay');
      const container = this.querySelector('#modal-container');
      overlay.style.display = 'none';
      document.body.classList.remove('modal-active');
      container.innerHTML = '';
    }
    runModalInit(path) {
      if (path.includes('register.html') && window.initRegisterForm) window.initRegisterForm();
      else if (path.includes('login.html') && window.initLoginForm) window.initLoginForm();
    }

    // ----- Auth -----
    async checkAuth() {
      try {
        const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
        if (!res.ok) throw new Error();
        const data = await res.json().catch(() => ({}));
        const uname = (data && data.user && data.user.username) || data.username || data.name || null;
        this.isAuthenticated = !!uname;
        this.username = uname || null;
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
      const userLabel = this.querySelector('#user-label');
      const authButton = this.querySelector('#auth-button');
      if (!userLabel || !authButton) return;
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
