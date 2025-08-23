// components/sm-grid-v2.js
// PURE grid (no controls). Keeps IDs used by external logic if present.

class SmGridV2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="grid" id="grid">
        <div class="grid-content" id="grid-content">
          <table class="table" id="scheduler-table" aria-label="Group availability grid"></table>
          <div id="now-marker" class="now-marker"><span class="bubble">now</span></div>
        </div>
      </div>
    `;
    if (window.scheduler?.initGrid) window.scheduler.initGrid();
  }
}
customElements.define('sm-grid-v2', SmGridV2);
