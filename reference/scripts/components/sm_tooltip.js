// sm_tooltip.js (ES module)
import { state } from './sm_state.js';

export function availabilityListsAt(epoch) {
  const available = [];
  const unavailable = [];
  for (const u of state.members) {
    const set = state.userSlotSets.get(u);
    if (set && set.has(epoch)) available.push(u);
    else unavailable.push(u);
  }
  return { available, unavailable };
}

export function onCellHoverMove(e) {
  const td = e.currentTarget;
  if (td.classList.contains('past')) return;
  const epoch = Number(td.dataset.epoch);
  const lists = availabilityListsAt(epoch);
  const tip = document.getElementById('cell-tooltip');
  const avail = lists.available.length ? `Available: ${lists.available.join(', ')}` : 'Available: —';
  const unavail = lists.unavailable.length ? `Unavailable: ${lists.unavailable.join(', ')}` : 'Unavailable: —';
  tip.innerHTML = `<div>${avail}</div><div style="margin-top:6px; color:#bbb;">${unavail}</div>`;
  tip.style.display = 'block';
  tip.style.left = (e.clientX + 14) + 'px';
  tip.style.top = (e.clientY + 16) + 'px';
}

export function hideTooltip() {
  const tip = document.getElementById('cell-tooltip');
  tip.style.display = 'none';
}
