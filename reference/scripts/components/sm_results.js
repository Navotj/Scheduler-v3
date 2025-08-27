// sm_results.js
export function create_sm_results_panel() {
  const panel = document.createElement('div');
  panel.className = 'panel results-panel';
  panel.id = 'results-panel';

  const h3 = document.createElement('h3');
  h3.textContent = 'results';

  const results = document.createElement('div');
  results.id = 'results';
  results.className = 'results';
  results.setAttribute('aria-live', 'polite');

  panel.append(h3, results);
  return panel;
}
