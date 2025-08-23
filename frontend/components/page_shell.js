(function () {
  'use strict';

  class PageShell extends HTMLElement {
    constructor() {
      super();
      this.isAuthed = false;
      this.username = null;
      this._onAuthBtn = this._onAuthBtn.bind(this);
    }

    connectedCallback() {
      const title = this.getAttribute('page-title') || '';
      this.innerHTML = `
        <div id="ps-modal-overlay" style="display:none;">
          <div id="ps-modal-container"></div>
        </div>

        <header class="top-bar">
          <div class="top-left">
            <a href="/index.html">← Home</a>
            <h1 style="margin:0;font-size:16px;">${title}</h1>
          </div>
          <div class="user-info">
            <span id="ps-user-label" class="user-label" style="display:none;"></span>
            <button id="ps-auth-btn">Login</button>
          </div>
        </header>

        <main class="container">
          <slot name="content"></slot>
        </main>
      `;

      this.querySelector('#ps-auth-btn')?.addEventListener('click', this._onAuthBtn);

      // expose modal helpers so login/register can live as simple HTML partials
      window.openModal = (path) => this._openModal(path);
      window.swapModal = (path) => this._swapModal(path);
      window.closeModal = () => this._closeModal();

      // let auth-aware components subscribe
      window.setAuthState = (ok, username) => {
        this.isAuthed = !!ok;
        this.username = ok ? username : null;
        this._paintAuth();
        this._broadcastAuth();
      };

      this._checkAuth();
    }

    async _checkAuth() {
      try {
        const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-store' });
        if (res.ok) {
          const data = await res.json().catch(() => ({}));
          const uname = (data?.user?.username) || data?.username || null;
          this.isAuthed = !!uname;
          this.username = uname;
        } else {
          this.isAuthed = false; this.username = null;
        }
      } catch {
        this.isAuthed = false; this.username = null;
      }
      this._paintAuth();
      this._broadcastAuth();
    }

    _paintAuth() {
      const label = this.querySelector('#ps-user-label');
      const btn = this.querySelector('#ps-auth-btn');
      if (!label || !btn) return;

      if (this.isAuthed) {
        label.textContent = `Signed in as ${this.username}`;
        label.style.display = 'inline';
        btn.textContent = 'Logout';
      } else {
        label.style.display = 'none';
        label.textContent = '';
        btn.textContent = 'Login';
      }
    }

    _broadcastAuth() {
      this.dispatchEvent(new CustomEvent('authchange', {
        bubbles: true,
        detail: { authed: this.isAuthed, username: this.username }
      }));
    }

    async _onAuthBtn() {
      if (this.isAuthed) {
        try { await fetch('/auth/logout', { method: 'POST', credentials: 'include' }); } catch {}
        this.isAuthed = false; this.username = null;
        this._paintAuth(); this._broadcastAuth();
      } else {
        this._openModal('/pages/login.html');
      }
    }

    _openModal(path) {
      const overlay = this.querySelector('#ps-modal-overlay');
      const container = this.querySelector('#ps-modal-container');
      fetch(path, { cache: 'no-cache' }).then(r => r.text()).then(html => {
        container.innerHTML = html;
        overlay.style.display = 'flex';
        document.body.classList.add('modal-active');
        if (window.initLoginForm && path.includes('login')) window.initLoginForm();
        if (window.initRegisterForm && path.includes('register')) window.initRegisterForm();
      });
    }
    _swapModal(path) {
      const container = this.querySelector('#ps-modal-container');
      fetch(path, { cache: 'no-cache' }).then(r => r.text()).then(html => {
        container.innerHTML = html;
        if (window.initLoginForm && path.includes('login')) window.initLoginForm();
        if (window.initRegisterForm && path.includes('register')) window.initRegisterForm();
      });
    }
    _closeModal() {
      const overlay = this.querySelector('#ps-modal-overlay');
      const container = this.querySelector('#ps-modal-container');
      overlay.style.display = 'none';
      document.body.classList.remove('modal-active');
      container.innerHTML = '';
    }
  }

  if (!customElements.get('page-shell')) customElements.define('page-shell', PageShell);
})();
