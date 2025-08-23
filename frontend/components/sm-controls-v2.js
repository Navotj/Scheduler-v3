// components/sm-controls-v2.js
// Bottom controls only.

class SmControlsV2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel">
        <div class="controls" id="controls">
          <button id="prev-week" class="btn btn-secondary" title="Previous week">← Previous week</button>
          <button id="next-week" class="btn btn-secondary" title="Next week">Next week →</button>
          <span class="muted helper">Shift+Scroll = Vertical Zoom, Scroll = Pan</span>
        </div>
      </div>
    `;
    if (window.scheduler?.initControls) window.scheduler.initControls();
  }
}
customElements.define('sm-controls-v2', SmControlsV2);
