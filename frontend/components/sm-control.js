// components/sm-control.js
// Previous/Next buttons + helper. No page-specific logic; emits events only.

class SmControl extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel controls-panel">
        <div class="controls" id="controls">
          <button id="prev-week" class="btn btn-secondary" title="Previous week">← Previous week</button>
          <button id="next-week" class="btn btn-secondary" title="Next week">Next week →</button>
          <span class="muted helper">Shift+Scroll = Vertical Zoom, Scroll = Pan</span>
        </div>
      </div>
    `;

    const prev = this.querySelector('#prev-week');
    const next = this.querySelector('#next-week');
    prev.addEventListener('click', () => this.dispatchEvent(new CustomEvent('change-week', { detail: { delta: -1 }, bubbles: true })));
    next.addEventListener('click', () => this.dispatchEvent(new CustomEvent('change-week', { detail: { delta: 1 }, bubbles: true })));
  }
}
customElements.define('sm-control', SmControl);
