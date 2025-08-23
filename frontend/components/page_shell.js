// components/page_shell.js
(() => {
  'use strict';

  const TPL = (title, homeHref) => `
    <div id="ps-modal-overlay" style="display:none;">
      <div id="ps-modal-container"></div>
    </div>

    <header class="top-bar">
      <div class="top-left">
        <a class="breadcrumb" href="${homeHref}">← Home</a>
        <h1 class="title" style="margin:0;font-size:16px;">${title || ''}</h1>
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
    }

    connectedCallback() {
      // keep any existing children (e.g., <availability-grid>)
      const kids = Array.from(this.childNodes);

      const inPages = (location.pathname || '').includes('/pages/');
      const homeHref = this.getAttribute('home-href') || (inPages ? '../index.html' : '/index.html');
      const title = this.getAttribute('page-title') || '';

      this.innerHTML = TPL(title, homeHref);

      const content = this.querySelector('#ps-content');
      for (const n of kids) {
        if (n.nodeType === Node.TEXT_NODE && !n.textContent.trim()) continue;
        content.appendChild(n);
      }

      const btn = this.querySelector('#ps-auth-btn');
      btn.addEventListener('click', () => this.isAuthenticated ? this.logout() : this.openModal('../pages/login.html'));

      // expose modal helpers
      window.openModal = this.openModal.bind(this);
      window.swapModal = this.swapModal.bind(this);
      window.closeModal = this.closeModal.bind(this);

      this.checkAuth();
    }

    // --- Auth ---
    async checkAuth() {
      try {
        const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-cache' });
        const data = res.ok ? await res.json().catch(() => ({})) : {};
        const uname = (data?.user?.username) || data?.username || null;
        this.isAuthenticated = !!uname;
        this.username = uname;
      } catch {
        this.isAuthenticated = false; this.username = null;
      }
      this.updateAuthUI();
      this.dispatchEvent(new CustomEvent('auth-changed', {
        bubbles: true,
        detail: { authenticated: this.isAuthenticated, username: this.username }
      }));
    }

    async logout() {
      try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
      this.isAuthenticated = false;
      this.username = null;
      this.updateAuthUI();
      this.dispatchEvent(new CustomEvent('auth-changed', { bubbles: true, detail: { authenticated: false, username: null } }));
    }

    updateAuthUI() {
      const label = this.querySelector('#ps-user-label');
      const btn = this.querySelector('#ps-auth-btn');
      if (this.isAuthenticated) {
        label.textContent = `Signed in as ${this.username}`;
        label.style.display = 'inline';
        btn.textContent = 'Logout';
      } else {
        label.textContent = '';
        label.style.display = 'none';
        btn.textContent = 'Login';
      }
    }

    // --- Modal helpers (for login/register) ---
    openModal(path) { this.#loadIntoModal(path); }
    swapModal(path) { this.#loadIntoModal(path); }
    closeModal() {
      this.querySelector('#ps-modal-overlay').style.display = 'none';
      this.querySelector('#ps-modal-container').innerHTML = '';
      document.body.classList.remove('modal-active');
    }
    #loadIntoModal(path) {
      const overlay = this.querySelector('#ps-modal-overlay');
      const container = this.querySelector('#ps-modal-container');
      fetch(path, { cache: 'no-cache' })
        .then(r => r.text())
        .then(html => {
          container.innerHTML = html;
          overlay.style.display = 'flex';
          document.body.classList.add('modal-active');
          if (path.includes('register.html') && window.initRegisterForm) window.initRegisterForm();
          if (path.includes('login.html') && window.initLoginForm) window.initLoginForm();
        });
    }
  }

  customElements.define('page-shell', PageShell);
})();
