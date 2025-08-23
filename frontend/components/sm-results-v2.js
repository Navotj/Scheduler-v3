// components/sm-results-v2.js
class SmResultsV2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel">
        <h3>Results</h3>
        <div id="results" class="results" aria-live="polite"></div>
      </div>
    `;
    if (window.scheduler?.initResults) window.scheduler.initResults();
  }
}
customElements.define('sm-results-v2', SmResultsV2);
