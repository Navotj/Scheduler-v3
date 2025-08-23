// templates/nat20-page.js
// Reusable NAT20 page template custom element. Renders topbar, shared modal, and a two-column container with slots.
// NOTE: Intentionally does NOT use Shadow DOM so existing global selectors/IDs and CSS continue to work.

class Nat20Page extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  constructor() {
    super();
    this._title = this.getAttribute('title') || document.title || 'NAT20';
  }

  connectedCallback() {
    // Build the page chrome (topbar + container + modal overlay)
    this.innerHTML = `
      <div id="modal-overlay" style="display:none;">
        <div id="modal-container"></div>
      </div>

      <div id="topbar-root" data-title="${this._title}"></div>

      <div class="container two-col">
        <div class="left-col">
          <slot name="left"></slot>
        </div>
        <div class="right-col">
          <slot name="right"></slot>
        </div>
      </div>

      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;

    // Modal helpers made global for reuse by all pages/components
    const overlay = this.querySelector('#modal-overlay');
    const container = this.querySelector('#modal-container');

    function runModalInit(path) {
      if (path.includes('register.html') && window.initRegisterForm) {
        window.initRegisterForm();
      } else if (path.includes('login.html') && window.initLoginForm) {
        window.initLoginForm();
      }
    }

    window.openModal = function openModal(path) {
      fetch(path, { cache: 'no-cache' })
        .then((res) => res.text())
        .then((html) => {
          container.innerHTML = html;
          overlay.style.display = 'flex';
          document.body.classList.add('modal-active');
          runModalInit(path);
        });
    };

    window.swapModal = function swapModal(path) {
      fetch(path, { cache: 'no-cache' })
        .then((res) => res.text())
        .then((html) => {
          container.innerHTML = html;
          document.body.classList.add('modal-active');
          runModalInit(path);
        });
    };

    window.closeModal = function closeModal() {
      overlay.style.display = 'none';
      document.body.classList.remove('modal-active');
      container.innerHTML = '';
    };

    // Auth propagation hook for pages that care (called by topbar.js)
    window.onAuthStateChange = (isAuthed, username) => {
      if (window.scheduler && typeof window.scheduler.setAuth === 'function') {
        window.scheduler.setAuth(!!isAuthed, isAuthed ? username : null);
      }
    };

    // Kick topbar auth refresh if available
    if (window.topbar && typeof window.topbar.refreshAuth === 'function') {
      window.topbar.refreshAuth();
    }
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (name === 'title') {
      this._title = newVal;
      const t = document.getElementById('topbar-root');
      if (t) t.dataset.title = newVal;
      if (document.title) document.title = newVal + ' — NAT20';
    }
  }
}

customElements.define('nat20-page', Nat20Page);
