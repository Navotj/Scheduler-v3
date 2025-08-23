// components/sm-filters.js
class SmFilters extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel" id="filters-panel">
        <h3>Filters</h3>

        <div class="field-row" style="display:flex; gap:12px;">
          <div class="field" style="flex:1;">
            <label for="max-missing" class="muted">Max missing</label>
            <input type="number" id="max-missing" min="0" value="0" />
          </div>

          <div class="field" style="flex:1;">
            <label for="min-hours" class="muted">Min length (hours)</label>
            <input type="number" id="min-hours" min="0.5" step="0.5" value="1" />
          </div>

          <div class="field" style="flex:1;">
            <label for="sort-method" class="muted">Sort</label>
            <select id="sort-method">
              <option value="most">Most players</option>
              <option value="earliest-week">Earliest (week)</option>
              <option value="latest-week">Latest (week)</option>
              <option value="earliest">Earliest (day)</option>
              <option value="latest">Latest (day)</option>
              <option value="longest">Longest duration</option>
            </select>
          </div>
        </div>

        <div class="legend" style="margin-top:12px;">
          <!-- three synchronized rows -->
          <div id="legend-blocks" class="legend-blocks" aria-label="Availability legend"></div>
          <div id="legend-steps" class="legend-steps"></div>
          <div id="legend-labels" class="legend-labels"></div>
        </div>
      </div>
    `;
  }
}
customElements.define('sm-filters', SmFilters);
