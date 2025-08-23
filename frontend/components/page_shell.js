// scripts/page_shell.js
(() => {
  'use strict';

  function currentPath() {
    return window.location.pathname + window.location.search + window.location.hash;
  }

  function moveLightChildrenInto(el, target) {
    // Move any light-DOM children (your page content) into the main container,
    // so the page isn’t empty if a <slot> was used in light DOM.
    const keep = new Set([target]);
    const header = el.querySelector('.top-bar');
    if (header) keep.add(header);

    const kids = Array.from(el.childNodes).filter(n => !keep.has(n));
    for (const n of kids) target.appendChild(n);
  }

  class PageShell extends HTMLElement {
    connectedCallback() {
      const title = this.getAttribute('page-title') || '';

      // If the page already provided markup (like in your HTML paste), use it.
      // Otherwise, create a minimal shell.
      this._btn   = this.querySelector('#ps-auth-btn');
      this._label = this.querySelector('#ps-user-label');
      this._main  = this.querySelector('main.container');

      if (!this._btn || !this._label || !this._main) {
        this.innerHTML = `
          <div id="ps-modal-overlay" style="display:none;">
            <div id="ps-modal-container"></div>
          </div>

          <header class="top-bar">
            <div class="top-left">
              <a href="../index.html">← Home</a>
              <h1 style="margin:0;font-size:16px;">${title}</h1>
            </div>
            <div class="user-info">
              <span id="ps-user-label" class="user-label" style="display:none;"></span>
              <button id="ps-auth-btn">Login</button>
            </div>
          </header>

          <main class="container" id="ps-main"></main>
        `;
        this._btn   = this.querySelector('#ps-auth-btn');
        this._label = this.querySelector('#ps-user-label');
        this._main  = this.querySelector('#ps-main');
        moveLightChildrenInto(this, this._main);
      } else {
        // If your markup is already there (as in your screenshot), still make sure
        // light children become visible content.
        moveLightChildrenInto(this, this._main);
      }

      // Hook for your login.js to call when auth state changes.
      // (Your login.js calls window.setAuthState(...) via setAuthStateSafe)
      window.setAuthState = (isAuthed, username) => {
        if (isAuthed) this._renderLoggedIn(username);
        else this._renderLoggedOut();
      };

      this._btn?.addEventListener('click', async () => {
        if (this._btn.dataset.state === 'logged-in') {
          try {
            await fetch('/auth/logout', {
              method: 'POST',
              credentials: 'include',
              headers: { 'Content-Type': 'application/json' }
            });
          } catch {}
          // Ask backend again (your login.js will also publish state)
          try {
            const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-store' });
            if (res.ok) {
              const data = await res.json().catch(() => ({}));
              const name =
                data?.user?.username ||
                data?.username || '';
              window.setAuthState(!!name, name || null);
            } else {
              window.setAuthState(false, null);
            }
          } catch {
            window.setAuthState(false, null);
          }
        } else {
          const here = currentPath();
          // Navigate to your existing login page (adjust relative path if needed)
          window.location.href = `../pages/login.html?next=${encodeURIComponent(here)}`;
        }
      });

      // On first paint, reflect whatever your auth bootstrap determined.
      this._bootstrapAuthUI();
    }

    async _bootstrapAuthUI() {
      // If your login.js is loaded, it exposes auth.ready and ensures a single-flight /auth/check.
      const ready = window.ensureAuthReady ? window.ensureAuthReady() : Promise.resolve();
      try { await ready; } catch {}

      const name =
        window.auth?.user ||
        null;

      if (name) this._renderLoggedIn(name);
      else this._renderLoggedOut();
    }

    _renderLoggedIn(username) {
      if (this._label) {
        this._label.textContent = `Signed in as ${username}`;
        this._label.style.display = 'inline';
      }
      if (this._btn) {
        this._btn.textContent = 'Logout';
        this._btn.dataset.state = 'logged-in';
      }
    }

    _renderLoggedOut() {
      if (this._label) {
        this._label.textContent = '';
        this._label.style.display = 'none';
      }
      if (this._btn) {
        this._btn.textContent = 'Login';
        this._btn.dataset.state = 'logged-out';
      }
    }
  }

  customElements.define('page-shell', PageShell);
})();
