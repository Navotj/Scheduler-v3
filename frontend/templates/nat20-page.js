// templates/nat20-page.js
// Minimal page template: renders topbar + modal scaffolding only.
// NO columns, NO layout. Content is modular and unstructured.
// All light-DOM children are moved into a neutral #page-shell wrapper.
// No Shadow DOM so global CSS keeps working.

class Nat20Page extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  constructor() {
    super();
    this._title = this.getAttribute('title') || document.title || 'NAT20';
  }

  connectedCallback() {
    this.innerHTML = `
      <div id="modal-overlay" style="display:none;">
        <div id="modal-container"></div>
      </div>

      <div id="topbar-root" data-title="${this._title}"></div>

      <div class="container" id="page-shell"></div>

      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;

    const overlay = this.querySelector('#modal-overlay');
    const container = this.querySelector('#modal-container');

    // Move existing light-DOM children into the neutral page-shell wrapper
    const shell = this.querySelector('#page-shell');
    const toMove = Array.from(this.childNodes).filter(n =>
      !(n.id === 'modal-overlay' || n.id === 'topbar-root' || n.id === 'page-shell' || n.id === 'cell-tooltip')
    );
    toMove.forEach(n => shell.appendChild(n));

    // Modal helpers (global so login/register can use them)
    function runModalInit(path) {
      if (path.includes('register.html') && window.initRegisterForm) {
        window.initRegisterForm();
      } else if (path.includes('login.html') && window.initLoginForm) {
        window.initLoginForm();
      }
    }

    window.openModal = function openModal(path) {
      fetch(path, { cache: 'no-cache' })
        .then(res => res.text())
        .then(html => {
          container.innerHTML = html;
          overlay.style.display = 'flex';
          document.body.classList.add('modal-active');
          runModalInit(path);
        });
    };

    window.swapModal = function swapModal(path) {
      fetch(path, { cache: 'no-cache' })
        .then(res => res.text())
        .then(html => {
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
      const t = this.querySelector('#topbar-root');
      if (t) t.dataset.title = newVal;
      if (document.title) document.title = `${newVal} — NAT20`;
    }
  }
}

customElements.define('nat20-page', Nat20Page);
