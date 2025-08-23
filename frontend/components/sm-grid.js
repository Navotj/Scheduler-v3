// components/sm-grid.js
// Grid (controls + availability table + now marker). No Shadow DOM so global CSS applies.

class SmGrid extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="grid" id="grid">
        <div class="grid-content" id="grid-content">
          <table class="table" id="scheduler-table" aria-label="Group availability grid"></table>
          <div id="now-marker" class="now-marker" style="display:none;">
            <span class="bubble">now</span>
          </div>
        </div>
      </div>
    `;
    if (window.scheduler && typeof window.scheduler.initGrid === 'function') {
      window.scheduler.initGrid();
    }
  }
}
customElements.define('sm-grid', SmGrid);
