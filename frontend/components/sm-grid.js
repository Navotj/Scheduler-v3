// components/sm-grid.js
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
      <div id="cell-tooltip" class="cell-tooltip" style="display:none;"></div>
    `;
  }
}
customElements.define('sm-grid', SmGrid);
