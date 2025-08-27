// sm_filters.js
export function create_sm_filters_panel() {
  const panel = document.createElement('div');
  panel.className = 'panel';
  panel.id = 'filters-panel';

  const h3 = document.createElement('h3');
  h3.textContent = 'filters';

  // Row: max missing + min length
  const row1 = document.createElement('div');
  row1.className = 'field-row';

  const fMissing = document.createElement('div');
  fMissing.className = 'field';
  const lMissing = document.createElement('label');
  lMissing.htmlFor = 'max-missing';
  lMissing.textContent = 'max missing';
  const iMissing = document.createElement('input');
  iMissing.type = 'number';
  iMissing.id = 'max-missing';
  iMissing.min = '0';
  iMissing.value = '0';
  fMissing.append(lMissing, iMissing);

  const fMinLen = document.createElement('div');
  fMinLen.className = 'field';
  const lMin = document.createElement('label');
  lMin.htmlFor = 'min-hours';
  lMin.textContent = 'min length';
  const rowMin = document.createElement('div');
  rowMin.className = 'row';
  const iMin = document.createElement('input');
  iMin.type = 'number';
  iMin.id = 'min-hours';
  iMin.min = '0';
  iMin.step = '0.5';
  iMin.value = '1';
  const spanH = document.createElement('span');
  spanH.textContent = 'h';
  rowMin.append(iMin, spanH);
  fMinLen.append(lMin, rowMin);

  row1.append(fMissing, fMinLen);

  // Row: sort
  const sortRow = document.createElement('div');
  sortRow.className = 'sort-row';
  const fSort = document.createElement('div');
  fSort.className = 'field';
  const lSort = document.createElement('label');
  lSort.htmlFor = 'sort-method';
  lSort.textContent = 'sort';
  const select = document.createElement('select');
  select.id = 'sort-method';
  select.innerHTML = `
    <option value="earliest-week">earliest in week</option>
    <option value="latest-week">latest in week</option>
    <option value="earliest">earliest start (day)</option>
    <option value="latest">latest start (day)</option>
    <option value="longest">longest duration</option>
    <option value="most" selected>most participants</option>
  `;
  fSort.append(lSort, select);
  sortRow.appendChild(fSort);

  // Legend
  const legend = document.createElement('div');
  legend.className = 'legend';
  const blocks = document.createElement('div');
  blocks.id = 'legend-blocks';
  blocks.className = 'legend-blocks';
  blocks.setAttribute('aria-label', 'availability legend');
  legend.appendChild(blocks);

  panel.append(h3, row1, sortRow, legend);
  return panel;
}
