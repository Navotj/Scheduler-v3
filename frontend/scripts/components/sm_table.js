// sm_table.js
export function create_sm_table() {
  const grid = document.createElement('div');
  grid.className = 'grid';
  grid.id = 'grid';

  const content = document.createElement('div');
  content.className = 'grid-content';
  content.id = 'grid-content';

  const table = document.createElement('table');
  table.className = 'table';
  table.id = 'scheduler-table';
  table.setAttribute('aria-label', 'group availability grid');

  const now = document.createElement('div');
  now.id = 'now-marker';
  now.className = 'now-marker';
  now.style.display = 'none';
  const bubble = document.createElement('span');
  bubble.className = 'bubble';
  bubble.textContent = 'now';
  now.appendChild(bubble);

  content.appendChild(table);
  content.appendChild(now);
  grid.appendChild(content);
  return grid;
}
