// components/sm-results.js
class SmResults extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div id="results-panel" class="panel results-panel">
        <h3>Results</h3>
        <div id="results" class="results" aria-live="polite"></div>
      </div>
    `;
  }
}
customElements.define('sm-results', SmResults);
