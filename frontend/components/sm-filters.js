// components/sm-filters.js
// Filter panel with neutral UI; emits 'filters-change' when fields change.

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
            <label for="min-hours">Min length (hours)</label>
            <input type="number" id="min-hours" min="0.5" step="0.5" value="1" />
          </div>
        </div>

        <div class="legend">
          <div id="legend-blocks" class="legend-blocks" aria-label="Availability legend"></div>
        </div>
      </div>
    `;

    const fields = this.querySelectorAll('#max-missing, #min-hours');
    fields.forEach(el => el.addEventListener('input', () => {
      this.dispatchEvent(new CustomEvent('filters-change', { bubbles: true }));
    }));
  }
}
customElements.define('sm-filters', SmFilters);
