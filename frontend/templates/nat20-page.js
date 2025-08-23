// templates/nat20-page.js
// Minimal page template: topbar + modal + neutral container padding. NO enforced layout.

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

      <!-- neutral page wrapper providing shared width/padding via .container -->
      <div id="page-shell" class="container"></div>

      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;

    const overlay = this.querySelector('#modal-overlay');
    const container = this.querySelector('#modal-container');
    const shell = this.querySelector('#page-shell');

    // Move existing light-DOM children into #page-shell (flat flow)
    const toMove = Array.from(this.childNodes).filter(
      n => !(n.id === 'modal-overlay' || n.id === 'topbar-root' || n.id === 'page-shell' || n.id === 'cell-tooltip')
    );
    toMove.forEach(n => shell.appendChild(n));

    function runModalInit(path) {
      if (path.includes('register.html') && window.initRegisterForm) window.initRegisterForm();
      else if (path.includes('login.html') && window.initLoginForm) window.initLoginForm();
    }

    window.openModal = (path) => {
      fetch(path, { cache: 'no-cache' })
        .then(res => res.text())
        .then(html => {
          container.innerHTML = html;
          overlay.style.display = 'flex';
          document.body.classList.add('modal-active');
          runModalInit(path);
        });
    };

    window.swapModal = (path) => {
      fetch(path, { cache: 'no-cache' })
        .then(res => res.text())
        .then(html => {
          container.innerHTML = html;
          document.body.classList.add('modal-active');
          runModalInit(path);
        });
    };

    window.closeModal = () => {
      overlay.style.display = 'none';
      document.body.classList.remove('modal-active');
      container.innerHTML = '';
    };

    window.onAuthStateChange = (isAuthed, username) => {
      if (window.scheduler && typeof window.scheduler.setAuth === 'function') {
        window.scheduler.setAuth(!!isAuthed, isAuthed ? username : null);
      }
    };

    if (window.topbar && typeof window.topbar.refreshAuth === 'function') {
      window.topbar.refreshAuth();
    }
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (name === 'title') {
      this._title = newVal;
      const t = this.querySelector('#topbar-root');
      if (t) t.dataset.title = newVal;
      document.title = `${newVal} — NAT20`;
    }
  }
}

customElements.define('nat20-page', Nat20Page);
