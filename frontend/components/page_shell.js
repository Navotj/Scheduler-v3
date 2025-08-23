// frontend/components/page_shell.js
(function () {
  'use strict';

  const TEMPLATE = (title) => `
    <div id="ps-modal-overlay" style="display:none;">
      <div id="ps-modal-container"></div>
    </div>

    <header class="top-bar">
      <div class="top-left">
        <a href="../index.html">← Home</a>
        <h1 style="margin:0;font-size:16px;">${title ? title.replace(/</g, '&lt;') : ''}</h1>
      </div>
      <div class="user-info">
        <span id="ps-user-label" class="user-label" style="display:none;"></span>
        <button id="ps-auth-btn">Login</button>
      </div>
    </header>

    <main class="container">
      <div id="ps-content">
        <slot name="content"></slot>
      </div>
    </main>
  `;

  class PageShell extends HTMLElement {
    connectedCallback() {
      const title = this.getAttribute('page-title') || '';
      this.innerHTML = TEMPLATE(title);

      this.$label = this.querySelector('#ps-user-label');
      this.$btn = this.querySelector('#ps-auth-btn');

      // Initial auth fetch + broadcast
      this._refreshAuth();

      // Click handler: login or logout depending on state
      this.$btn.addEventListener('click', async () => {
        if (this._auth?.ok) {
          try {
            await window.httpClient.logout();
          } catch (e) {
            console.warn('logout failed (ignored)', e);
          }
          await this._refreshAuth();
        } else {
          // simple navigate to the login page
          location.href = './login.html';
        }
      });
    }

    async _refreshAuth() {
      let ok = false, username = null;
      try {
        const me = await window.httpClient.me();
        username = me?.username || null;
        ok = !!username;
      } catch (e) {
        ok = false; username = null;
      }

      this._auth = { ok, username };
      window.__auth = this._auth;
      window.dispatchEvent(new CustomEvent('ps-auth-changed', { detail: this._auth }));

      // UI
      if (ok) {
        this.$label.textContent = `Signed in as ${username}`;
        this.$label.style.display = 'inline';
        this.$btn.textContent = 'Logout';
      } else {
        this.$label.style.display = 'none';
        this.$label.textContent = '';
        this.$btn.textContent = 'Login';
      }
    }
  }

  customElements.define('page-shell', PageShell);
})();
