// templates/nat20-page.js
// Reusable NAT20 page template custom element. Renders topbar, shared modal,
// a two-column container, and ingests any light-DOM nodes tagged with slot="left"/"right"
// into the proper columns. No Shadow DOM is used so global CSS applies.

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

      <div class="container two-col" id="nat20-columns">
        <div class="left-col" id="nat20-left"></div>
        <div class="right-col" id="nat20-right"></div>
      </div>

      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;

    const overlay = this.querySelector('#modal-overlay');
    const container = this.querySelector('#modal-container');

    // Modal helpers
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

    // Ingest any light-DOM slotted nodes into our columns (since we don't use Shadow DOM)
    this._ingestSlots();

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

  _ingestSlots() {
    const leftCol = this.querySelector('#nat20-left');
    const rightCol = this.querySelector('#nat20-right');
    if (!leftCol || !rightCol) return;

    // Collect nodes with slot="left"/"right" that are currently outside columns.
    // Use Array.from to avoid live NodeList issues as we reparent.
    const leftNodes = Array.from(this.querySelectorAll('[slot="left"]'));
    const rightNodes = Array.from(this.querySelectorAll('[slot="right"]'));

    // Helper to move nodes
    const moveNodes = (nodes, target) => {
      for (const node of nodes) {
        // If the node is a whitespace-only text node, skip
        if (node.nodeType === Node.TEXT_NODE && !node.textContent.trim()) continue;
        node.removeAttribute && node.removeAttribute('slot');
        target.appendChild(node);
      }
    };

    moveNodes(leftNodes, leftCol);
    moveNodes(rightNodes, rightCol);
  }
}

customElements.define('nat20-page', Nat20Page);
