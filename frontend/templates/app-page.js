// templates/app-page.js
// Minimal page template: topbar + modal + padded container. NO columns, NO two-col, NO external deps.

class AppPage extends HTMLElement {
  static get observedAttributes() { return ['title']; }
  constructor() {
    super();
    this._title = this.getAttribute('title') || 'App';
  }

  connectedCallback() {
    this.innerHTML = `
      <div id="modal-overlay" style="display:none;">
        <div id="modal-container"></div>
      </div>

      <header id="topbar-root" class="topbar" role="banner" aria-label="Top navigation">
        <div class="topbar-inner">
          <div class="topbar-left">
            <a class="brand" href="/">NAT20</a>
            <span class="page-title">${this._title}</span>
          </div>
          <div class="topbar-right">
            <button class="btn btn-secondary" id="logout-btn" type="button">Logout</button>
          </div>
        </div>
      </header>

      <main id="page-shell" class="container" role="main"></main>

      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;

    // Move any existing light DOM children into #page-shell
    const shell = this.querySelector('#page-shell');
    const protectedIds = new Set(['modal-overlay','topbar-root','page-shell','cell-tooltip']);
    const toMove = Array.from(this.childNodes).filter(n => !(n.nodeType === Node.ELEMENT_NODE && protectedIds.has(n.id)));
    toMove.forEach(n => shell.appendChild(n));

    // Minimal modal helpers (no external deps)
    const overlay = this.querySelector('#modal-overlay');
    const container = this.querySelector('#modal-container');

    function runModalInit(_path) { /* hook for page-specific init if needed */ }

    window.openModal = (path) => {
      fetch(path, { cache: 'no-cache' }).then(r => r.text()).then(html => {
        container.innerHTML = html;
        overlay.style.display = 'flex';
        document.body.classList.add('modal-active');
        runModalInit(path);
      });
    };
    window.swapModal = (path) => {
      fetch(path, { cache: 'no-cache' }).then(r => r.text()).then(html => {
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
  }

  attributeChangedCallback(name, _oldVal, newVal) {
    if (name === 'title') {
      this._title = newVal;
      const t = this.querySelector('.page-title');
      if (t) t.textContent = newVal;
      document.title = `${newVal} — NAT20`;
    }
  }
}

customElements.define('app-page', AppPage);
