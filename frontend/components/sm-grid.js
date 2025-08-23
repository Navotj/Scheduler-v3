// components/sm-grid.js
// Grid (controls + availability table + now marker) component.
// No Shadow DOM to keep existing selectors working (schedule_matcher.js relies on global IDs).

class SmGrid extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="controls" id="controls">
        <button id="prev-week" class="btn btn-secondary" title="Previous week">← Previous week</button>
        <button id="next-week" class="btn btn-secondary" title="Next week">Next week →</button>
        <span class="muted helper">Shift+Scroll = Vertical Zoom, Scroll = Pan</span>
      </div>

      <div class="grid" id="grid">
        <div class="grid-content" id="grid-content">
          <table class="table" id="scheduler-table" aria-label="Group availability grid"></table>
          <div id="now-marker" class="now-marker" style="display:none;">
            <span class="bubble">now</span>
          </div>
        </div>
      </div>
    `;

    // If page script exposes an init hook, call it now that DOM exists.
    if (window.scheduler && typeof window.scheduler.initGrid === 'function') {
      window.scheduler.initGrid();
    }
  }
}

customElements.define('sm-grid', SmGrid);
