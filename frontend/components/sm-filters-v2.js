// components/sm-filters-v2.js
class SmFiltersV2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel" id="filters-panel">
        <h3>Filters</h3>
        <div class="row" style="gap:12px;">
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="muted">Max missing</span>
            <input type="number" id="max-missing" min="0" value="0" />
          </label>
          <label style="display:flex; flex-direction:column; gap:4px;">
            <span class="muted">Min length</span>
            <div class="row" style="gap:6px;">
              <input type="number" id="min-hours" min="0" step="0.5" value="1" />
              <span class="muted">h</span>
            </div>
          </label>
          <label style="display:flex; flex-direction:column; gap:4px; min-width:180px;">
            <span class="muted">Sort</span>
            <select id="sort-method">
              <option value="earliest-week">Earliest in week</option>
              <option value="latest-week">Latest in week</option>
              <option value="earliest">Earliest start (day)</option>
              <option value="latest">Latest start (day)</option>
              <option value="longest">Longest duration</option>
              <option value="most" selected>Most participants</option>
            </select>
          </label>
        </div>
        <div id="legend-blocks" class="row" style="flex-wrap:wrap; gap:6px; margin-top:8px;"></div>
      </div>
    `;
    if (window.scheduler?.initFilters) window.scheduler.initFilters();
  }
}
customElements.define('sm-filters-v2', SmFiltersV2);
