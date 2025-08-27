// sm_table_core.js (ES module)
import { CONST, state, clamp, resolveTimezone, loadLocalSettings, getWeekStartEpochAndYMD, getDayStartSec, rowsPerDay, fmtTime, rowHeightPx } from './sm_state.js';
import { onCellHoverMove, hideTooltip } from './sm_tooltip.js';

// DOM refs (attached during attachDOM)
let dom = {
  tableEl: null,
  gridEl: null,
  resultsEl: null,
  resultsPanelEl: null,
  nowMarkerEl: null,
  rightColEl: null,
  controlsEl: null
};

export function attachDOM(refs) {
  dom = { ...dom, ...refs };
}

export function applyZoomStyles() {
  const base = 18;
  const px = clamp(Math.round(base * state.zoomFactor), 10, 42);
  document.documentElement.style.setProperty('--row-height', `${px}px`);
  positionNowMarker();
  syncResultsHeight();
}

export function setupZoomHandlers() {
  dom.gridEl.addEventListener('wheel', (e) => {
    if (!e.shiftKey) return; // normal scroll
    e.preventDefault();
    const delta = Math.sign(e.deltaY);
    state.zoomFactor = clamp(state.zoomFactor - delta * state.ZOOM_STEP, state.ZOOM_MIN, state.ZOOM_MAX);
    applyZoomStyles();
  }, { passive: false });
}

export function initialZoomToFit24h() {
  const base = 18; // px at zoom 1.0
  const thead = dom.tableEl.querySelector('thead');
  if (!dom.gridEl || !thead) return;

  const available = Math.max(0, dom.gridEl.clientHeight - thead.offsetHeight - 2);
  const needed = rowsPerDay() * base;
  const zFit = clamp(available / needed, state.ZOOM_MIN, state.ZOOM_MAX);

  state.zoomFactor = zFit >= state.ZOOM_MIN ? zFit : state.ZOOM_MIN;
  applyZoomStyles();
}

export function buildTable() {
  dom.tableEl.innerHTML = '';

  const thead = document.createElement('thead');
  const trh = document.createElement('tr');

  const thTime = document.createElement('th');
  thTime.textContent = 'Time';
  thTime.className = 'time-col';
  trh.appendChild(thTime);

  const { baseEpoch } = getWeekStartEpochAndYMD();
  for (let i = 0; i < 7; i++) {
    const d = new Date((baseEpoch + i * 86400) * 1000);
    const label = new Intl.DateTimeFormat('en-GB', {
      timeZone: state.tz, weekday: 'short', day: '2-digit', month: 'short'
    }).format(d);
    const th = document.createElement('th');
    th.textContent = label;
    th.className = 'day';
    trh.appendChild(th);
  }
  thead.appendChild(trh);
  dom.tableEl.appendChild(thead);

  const tbody = document.createElement('tbody');
  const totalRows = rowsPerDay();

  for (let r = 0; r < totalRows; r++) {
    const tr = document.createElement('tr');

    // hour label cell spans two rows (both half-hours)
    if (r % 2 === 0) {
      const minutes = (CONST.HOURS_START * 60) + r * (60 / CONST.SLOTS_PER_HOUR);
      const hh = Math.floor(minutes / 60);
      const th = document.createElement('th');
      th.className = 'time-col hour';
      th.rowSpan = 2;
      th.textContent = fmtTime(hh, 0);
      tr.appendChild(th);
    }

    for (let day = 0; day < 7; day++) {
      const td = document.createElement('td');
      td.className = 'slot-cell';
      const epoch = (getDayStartSec(day) + r * CONST.SLOT_SEC);
      td.dataset.epoch = String(epoch);
      td.dataset.day = String(day);
      td.dataset.row = String(r);
      td.dataset.c = '0';
      td.addEventListener('mousemove', onCellHoverMove);
      td.addEventListener('mouseleave', hideTooltip);
      tr.appendChild(td);
    }

    tbody.appendChild(tr);
  }

  dom.tableEl.appendChild(tbody);

  applyZoomStyles();
  paintCounts();
  shadePast();
  positionNowMarker();
  syncRightColOffset();
  syncResultsHeight();

  requestAnimationFrame(() => requestAnimationFrame(initialZoomToFit24h));
}

// ─────────────────────────── Coloring ───────────────────────────
function lerp(a, b, t) { return a + (b - a) * t; }
function hexToRgb(hex) {
  const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
  if (!m) return { r: 0, g: 0, b: 0 };
  return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
function rgbToCss({ r, g, b }) { return `rgb(${r}, ${g}, ${b})`; }

const COLORMAPS = {
  viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
  plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
  cividis:    [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
  twilight:   [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
  lava:       [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
};

function interpStops(stops, t) {
  if (t <= 0) return hexToRgb(stops[0][1]);
  if (t >= 1) return hexToRgb(stops[stops.length - 1][1]);
  for (let i = 0; i < stops.length - 1; i++) {
    const [t0, c0] = stops[i];
    const [t1, c1] = stops[i + 1];
    if (t >= t0 && t <= t1) {
      const k = (t - t0) / (t1 - t0);
      const a = hexToRgb(c0), b = hexToRgb(c1);
      return { r: Math.round(lerp(a.r, b.r, k)), g: Math.round(lerp(a.g, b.g, k)), b: Math.round(lerp(a.b, b.b, k)) };
    }
  }
  return hexToRgb(stops[stops.length - 1][1]);
}

function colormapColor(t) {
  const stops = COLORMAPS[state.heatmapName] || COLORMAPS.viridis;
  const rgb = interpStops(stops, t);
  return rgbToCss(rgb);
}

export function shadeForCount(count) {
  const n = state.totalMembers || 0;
  const threshold = n >= 11 ? (n - 10) : 0;

  if (n <= 0) return '#0a0a0a';
  if (count <= threshold) return '#0a0a0a';

  const denom = Math.max(1, n - threshold); // 1..10
  const t0 = (count - threshold) / denom;   // 0..1 within top band
  const t = Math.max(0, Math.min(1, t0));

  // slight gamma for punchier mid-tones except for twilight (already low-contrast)
  const g = state.heatmapName === 'twilight' ? t : Math.pow(t, 0.85);
  return colormapColor(g);
}

export function paintCounts() {
  state.counts = [];
  state.sets = [];
  const tds = dom.tableEl.querySelectorAll('.slot-cell');
  const n = state.totalMembers || 0;
  const threshold = n >= 11 ? (n - 10) : 0;

  for (const td of tds) {
    const epoch = Number(td.dataset.epoch);
    let raw = 0;
    for (const u of state.members) {
      const set = state.userSlotSets.get(u);
      if (set && set.has(epoch)) raw++;
    }

    td.style.setProperty('background-color', shadeForCount(raw), 'important');
    if (n >= 11) {
      td.dataset.c = (raw <= threshold) ? '0' : '7';
    } else {
      td.dataset.c = raw > 0 ? '7' : '0';
    }
    td.classList.remove('dim', 'highlight');

    const day = Number(td.dataset.day);
    const row = Number(td.dataset.row);
    const g = day * rowsPerDay() + row;
    state.counts[g] = raw;

    const who = new Set();
    for (const u of state.members) {
      const set = state.userSlotSets.get(u);
      if (set && set.has(epoch)) who.add(u);
    }
    state.sets[g] = who;
  }
}

export function shadePast() {
  const nowMs = Date.now();
  const { baseEpoch } = getWeekStartEpochAndYMD();
  const baseMs = baseEpoch * 1000;
  const endMs = baseMs + 7 * 86400000;
  const tds = dom.tableEl.querySelectorAll('.slot-cell');

  for (const td of tds) td.classList.remove('past');
  if (nowMs < baseMs || nowMs > endMs) return;

  for (const td of tds) {
    const cellMs = Number(td.dataset.epoch) * 1000;
    if (cellMs < nowMs) td.classList.add('past');
  }
}

// NOW marker
let theadTopCache = 0;
export function positionNowMarker() {
  const nowSec = Math.floor(Date.now() / 1000);
  const { baseEpoch } = getWeekStartEpochAndYMD();
  const endSec = baseEpoch + 7 * 86400;

  if (nowSec < baseEpoch || nowSec >= endSec) {
    dom.nowMarkerEl.style.display = 'none';
    return;
  }
  dom.nowMarkerEl.style.display = 'block';

  const secondsIntoWeek = nowSec - baseEpoch;
  theadTopCache = dom.tableEl.querySelector('thead')?.offsetHeight || 0;
  const dayIdx = Math.floor(secondsIntoWeek / 86400);
  const secondsIntoDay = secondsIntoWeek - dayIdx * 86400;
  const rowsIntoDay = secondsIntoDay / CONST.SLOT_SEC;

  const headerH = theadTopCache;
  const topPx = headerH + rowsIntoDay * rowHeightPx();
  dom.nowMarkerEl.style.top = `${topPx}px`;

  const firstCell = dom.tableEl.querySelector(`tbody tr:first-child td.slot-cell[data-day="${dayIdx}"][data-row="0"]`);
  if (firstCell) {
    const colLeft = firstCell.offsetLeft;
    const colWidth = firstCell.offsetWidth;
    dom.nowMarkerEl.style.left = `${colLeft}px`;
    dom.nowMarkerEl.style.width = `${colWidth}px`;
  }
}

export function bindMarkerReposition() {
  dom.gridEl.addEventListener('scroll', () => { positionNowMarker(); });
  window.addEventListener('resize', () => { positionNowMarker(); syncRightColOffset(); syncResultsHeight(); });
  setInterval(positionNowMarker, 30000);
}

export function syncRightColOffset() {
  if (!dom.rightColEl || !dom.controlsEl) return;
  const styles = getComputedStyle(dom.controlsEl);
  const mTop = parseFloat(styles.marginTop) || 0;
  const mBottom = parseFloat(styles.marginBottom) || 0;
  const offset = dom.controlsEl.offsetHeight + mTop + mBottom;
  dom.rightColEl.style.marginTop = offset + 'px';
}

export function syncResultsHeight() {
  if (!dom.gridEl || !dom.resultsPanelEl || !dom.resultsEl) return;
  const gridRect = dom.gridEl.getBoundingClientRect();
  const panelRect = dom.resultsPanelEl.getBoundingClientRect();
  const available = Math.max(120, Math.floor(gridRect.bottom - panelRect.top - 8));

  const panelStyles = getComputedStyle(dom.resultsPanelEl);
  const pTop = parseFloat(panelStyles.paddingTop) || 0;
  const pBottom = parseFloat(panelStyles.paddingBottom) || 0;
  const titleH = dom.resultsPanelEl.querySelector('h3').offsetHeight;

  dom.resultsPanelEl.style.height = available + 'px';
  const inner = Math.max(60, available - (pTop + pBottom + titleH) - 6);
  dom.resultsEl.style.height = inner + 'px';
}
