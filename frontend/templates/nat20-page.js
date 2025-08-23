// templates/nat20-page.js
// Page shell: injects topbar + shared padded container. Moves light-DOM children into .page-shell.

class Nat20Page extends HTMLElement {
  static get observedAttributes() { return ['title']; }

  constructor() {
    super();
    this._title = this.getAttribute('title') || document.title || 'NAT20';
  }

  connectedCallback() {
    // Skeleton
    this.innerHTML = `
      <div id="topbar-root" data-title="${this._title}"></div>
      <div id="page-shell" class="page-shell"></div>
    `;

    // Move all user content into #page-shell
    const shell = this.querySelector('#page-shell');
    const toMove = [];
    for (const node of Array.from(this.childNodes)) {
      if (node.id === 'topbar-root' || node.id === 'page-shell') continue;
      toMove.push(node);
    }
    for (const n of toMove) shell.appendChild(n);

    // Apply initial title to topbar
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
