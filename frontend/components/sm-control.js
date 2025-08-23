// components/sm-control.js
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
  }
}
customElements.define('sm-control', SmControl);
