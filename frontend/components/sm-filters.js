// components/sm-filters.js
// Filters panel component (max missing, min hours, sort, legend).

class SmFilters extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel" id="filters-panel">
        <h3>Filters</h3>

        <div class="field-row">
          <div class="field">
            <label for="max-missing">Max missing</label>
            <input type="number" id="max-missing" min="0" value="0" />
          </div>

          <div class="field">
            <label for="min-hours">Min length</label>
            <div class="row">
              <input type="number" id="min-hours" min="0" step="0.5" value="1" />
              <span>h</span>
            </div>
          </div>
        </div>

        <div class="sort-row">
          <div class="field">
            <label for="sort-method">Sort</label>
            <select id="sort-method">
              <option value="earliest-week">Earliest in week</option>
              <option value="latest-week">Latest in week</option>
              <option value="earliest">Earliest start (day)</option>
              <option value="latest">Latest start (day)</option>
              <option value="longest">Longest duration</option>
              <option value="most" selected>Most participants</option>
            </select>
          </div>
        </div>

        <div class="legend">
          <div id="legend-blocks" class="legend-blocks" aria-label="Availability legend"></div>
        </div>
      </div>
    `;

    if (window.scheduler && typeof window.scheduler.initFilters === 'function') {
      window.scheduler.initFilters();
    }
  }
}

customElements.define('sm-filters', SmFilters);
