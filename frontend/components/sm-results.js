// components/sm-results.js
// Results panel component (results list container).

class SmResults extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="results-panel" class="panel results-panel">
        <h3>Results</h3>
        <div id="results" class="results" aria-live="polite"></div>
      </div>
    `;

    if (window.scheduler && typeof window.scheduler.initResults === 'function') {
      window.scheduler.initResults();
    }
  }
}

customElements.define('sm-results', SmResults);
