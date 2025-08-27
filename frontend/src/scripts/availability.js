(function () {
  const SLOTS_PER_HOUR = 2;            // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  // State
  let isAuthenticated = true;
  let paintMode = 'add';
  let weekOffset = 0;                   // in weeks relative to current
  const selected = new Set();           // epoch seconds of selected slots (current page’s week)

  // DOM refs
  let gridContent, table, nowMarker;

  // --- Time helpers ---
  function zonedEpoch(y, m, d, hh, mm, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = dtf.formatToParts(new Date(Date.UTC(y, m - 1, d, hh, mm, 0)));
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.floor(asUTC / 1000);
  }
  function todayYMD(tz) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return { y: +map.year, m: +map.month, d: +map.day };
  }
  function addDays(y, m, d, add) {
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + add);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }
  function getWeekStartYMD(tz) { // Sunday start
    const t = todayYMD(tz);
    const todayMid = zonedEpoch(t.y, t.m, t.d, 0, 0, tz);
    const wdLocal = new Date(todayMid * 1000).getUTCDay(); // based on the constructed midnight
    const base = addDays(t.y, t.m, t.d, -wdLocal + weekOffset * 7);
    return base;
  }

  // --- Labels ---
  function renderWeekLabel(startEpoch, tz) {
    const startDate = new Date(startEpoch * 1000);
    const endDate = new Date((startEpoch + 6 * 86400) * 1000);
    const fmt = (dt) => new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short', day: 'numeric' }).format(dt);
    const startYear = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(startDate);
    const endYear = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(endDate);
    const year = (startYear === endYear) ? startYear : `${startYear}–${endYear}`;
    const el = document.getElementById('week-label');
    if (el) el.textContent = `${fmt(startDate)} – ${fmt(endDate)}, ${year}`;
  }

  // --- Build grid ---
  function formatHourLabel(hour) {
    return String(hour).padStart(2, '0') + ':00';
  }

  function buildGrid() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    if (!table) return;

    table.innerHTML = '';
    // Do NOT clear global selections here; keep user edits while paging weeks
    // Clear selection classes; they will be re-applied for the current week after load
    table.querySelectorAll && table.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));

    // Header
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const base = getWeekStartYMD(tz);
    const baseEpoch = zonedEpoch(base.y, base.m, base.d, 0, 0, tz);
    renderWeekLabel(baseEpoch, tz);

    const dayEpochs = [];
    for (let c = 0; c < 7; c++) {
      const ymd = addDays(base.y, base.m, base.d, c);
      const dayEpoch = zonedEpoch(ymd.y, ymd.m, ymd.d, 0, 0, tz);
      dayEpochs.push({ ymd, epoch: dayEpoch });
      const th = document.createElement('th');
      th.className = 'day';
      th.dataset.col = String(c);
      th.textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(dayEpoch * 1000));
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    // Body
    const tbody = document.createElement('tbody');
    const nowEpoch = Math.floor(Date.now() / 1000);
    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');
      const hour = Math.floor(r / SLOTS_PER_HOUR) + HOURS_START;
      const half = r % SLOTS_PER_HOUR === 1;
      tr.className = half ? 'row-half' : 'row-hour';

      if (!half) {
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.rowSpan = 2;
        const span = document.createElement('span');
        span.className = 'time-label hour';
        span.textContent = formatHourLabel(hour);
        th.appendChild(span);
        tr.appendChild(th);
      }

      for (let c = 0; c < 7; c++) {
        const ymd = dayEpochs[c].ymd;
        const epoch = zonedEpoch(ymd.y, ymd.m, ymd.d, hour, half ? 30 : 0, tz);
        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.row = String(r);
        td.dataset.col = String(c);
        td.dataset.epoch = String(epoch);
        if (epoch < nowEpoch) td.classList.add('past');

        td.addEventListener('mousedown', (e) => {
          if (!isAuthenticated || td.classList.contains('past')) return;
          e.preventDefault();
          dragStart = { row: r, col: c };
          dragEnd = { row: r, col: c };
          isDragging = true;
          updatePreview();
        });
        td.addEventListener('mouseenter', () => {
          if (!isAuthenticated || !isDragging || td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          updatePreview();
        });
        td.addEventListener('mouseup', () => {
          if (!isAuthenticated || !isDragging || td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          applyBoxSelection();
          clearPreview();
          isDragging = false;
          dragStart = dragEnd = null;
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // Load + paint selections for this week
    loadWeekSelections().then(applySelectedClasses);

    // Ensure and place NOW marker
    ensureNowMarker();
    updateNowMarker();
  }

  // --- Drag selection ---
  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  function forEachCellInBox(fn) {
    if (!dragStart || !dragEnd) return;
    const r1 = Math.min(dragStart.row, dragEnd.row);
    const r2 = Math.max(dragStart.row, dragEnd.row);
    const c1 = Math.min(dragStart.col, dragEnd.col);
    const c2 = Math.max(dragStart.col, dragEnd.col);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = table.querySelector('td.slot-cell[data-row="'+r+'"][data-col="'+c+'"]');
        if (cell && !cell.classList.contains('past')) fn(cell);
      }
    }
  }
  function clearPreview() {
    table.querySelectorAll('.preview-add, .preview-sub').forEach(el => el.classList.remove('preview-add', 'preview-sub'));
  }
  function updatePreview() {
    clearPreview();
    forEachCellInBox((cell) => {
      cell.classList.add(paintMode === 'add' ? 'preview-add' : 'preview-sub');
    });
  }
  function applyBoxSelection() {
    forEachCellInBox((cell) => {
      const epoch = Number(cell.dataset.epoch);
      if (paintMode === 'add') {
        selected.add(epoch);
        cell.classList.add('selected');
      } else {
        selected.delete(epoch);
        cell.classList.remove('selected');
      }
    });
  }
  function applySelectedClasses() {
    const cells = table.querySelectorAll('td.slot-cell');
    cells.forEach(cell => {
      const epoch = Number(cell.dataset.epoch);
      if (selected.has(epoch)) cell.classList.add('selected'); else cell.classList.remove('selected');
    });
  }

  // --- NOW marker ---
  function ensureNowMarker() {
    if (nowMarker) return;
    nowMarker = document.getElementById('now-marker');
    if (!nowMarker && gridContent) {
      nowMarker = document.createElement('div');
      nowMarker.id = 'now-marker';
      nowMarker.className = 'now-marker';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'NOW';
      nowMarker.appendChild(bubble);
      gridContent.appendChild(nowMarker);
    }
  }
function updateNowMarker() {
  if (!table) return;
  ensureNowMarker();

  // If needed, bind a resize handler so zoom/resizes reflow the marker immediately.
  if (!updateNowMarker._bound) {
    try { window.addEventListener('resize', updateNowMarker, { passive: true }); } catch {}
    updateNowMarker._bound = true;
  }

  const tbody = table.tBodies && table.tBodies[0];
  if (!tbody || !nowMarker || !gridContent) { if (nowMarker) nowMarker.style.display = 'none'; return; }

  // Current local time -> minutes since midnight (fractional for smoothness)
  const now = new Date();
  const minutes = now.getHours() * 60 + now.getMinutes() + now.getSeconds() / 60;

  // Position relative to the scrollable content box of .grid-content
  const gridRect = gridContent.getBoundingClientRect();
  const tbodyRect = tbody.getBoundingClientRect();
  const tbodyTopInContent = (tbodyRect.top - gridRect.top) + gridContent.scrollTop;

  // Use the tbody's actual scrollHeight to stay aligned with the table at any zoom level
  const top = tbodyTopInContent + (minutes / (24 * 60)) * tbody.scrollHeight;

  // Full-width line across the table; avoid column-relative math (prevents drift on zoom)
  nowMarker.style.display = 'block';
  nowMarker.style.top = top + 'px';
  nowMarker.style.left = '0';
  nowMarker.style.right = '0';
  nowMarker.style.width = '';
}


  // --- Controls ---
  function setMode(m) {
    paintMode = m === 'subtract' ? 'subtract' : 'add';
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    if (addBtn) addBtn.setAttribute('aria-pressed', String(paintMode === 'add'));
    if (subBtn) subBtn.setAttribute('aria-pressed', String(paintMode === 'subtract'));
  }

  async function loadWeekSelections() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const base = getWeekStartYMD(tz);
    const baseEpoch = zonedEpoch(base.y, base.m, base.d, 0, 0, tz);
    const end = addDays(base.y, base.m, base.d, 7);
    const endEpoch = zonedEpoch(end.y, end.m, end.d, 0, 0, tz);

    // Keep only selections outside this week; clear inside-week, re-fill from server
    for (const t of Array.from(selected)) if (t >= baseEpoch && t < endEpoch) selected.delete(t);

    try {
      const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
      if (!api) return; // offline mode: skip fetch, keep local state only
      const res = await fetch(`${api}/availability/get?from=${baseEpoch}&to=${endEpoch}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.intervals)) {
          for (const iv of data.intervals) {
            const from = Number(iv.from);
            const to = Number(iv.to);
            for (let t = from; t < to; t += SLOT_SEC) selected.add(t);
          }
        }
      }
    } catch {
      // ignore network errors; user can still edit locally
    }
  }

  function compressToIntervals(sortedEpochs) {
    const intervals = [];
    if (!sortedEpochs.length) return intervals;
    let curFrom = sortedEpochs[0];
    let prev = sortedEpochs[0];
    for (let i = 1; i < sortedEpochs.length; i++) {
      const t = sortedEpochs[i];
      if (t === prev + SLOT_SEC) prev = t;
      else { intervals.push({ from: curFrom, to: prev + SLOT_SEC }); curFrom = t; prev = t; }
    }
    intervals.push({ from: curFrom, to: prev + SLOT_SEC });
    return intervals;
  }

  async function saveWeek() {
    if (!isAuthenticated) return;
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const base = getWeekStartYMD(tz);
    const baseEpoch = zonedEpoch(base.y, base.m, base.d, 0, 0, tz);
    const end = addDays(base.y, base.m, base.d, 7);
    const endEpoch = zonedEpoch(end.y, end.m, end.d, 0, 0, tz);

    const inside = Array.from(selected).filter(t => t >= baseEpoch && t < endEpoch).sort((a,b) => a-b);
    const intervals = compressToIntervals(inside);

    try {
      const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
      if (!api) { alert('No API configured'); return; }
      const res = await fetch(`${api}/availability/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from: baseEpoch, to: endEpoch, intervals, sourceTimezone: tz })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Save failed: ${res.status} ${text}`);
        return;
      }
      alert('Saved!');
    } catch {
      alert('Connection error while saving');
    }
  }

  function attachControls() {
    const prev = document.getElementById('prev-week');
    const next = document.getElementById('next-week');
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    const saveBtn = document.getElementById('save');

    if (prev) prev.addEventListener('click', () => { if (!isAuthenticated) return; weekOffset -= 1; buildGrid(); });
    if (next) next.addEventListener('click', () => { if (!isAuthenticated) return; weekOffset += 1; buildGrid(); });
    if (addBtn) addBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('add'); });
    if (subBtn) subBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('subtract'); });
    if (saveBtn) saveBtn.addEventListener('click', saveWeek);
  }

  // --- Init / Public API ---
  function init() {
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    if (!gridContent || !table) return;
    setMode('add');
    attachControls();
    buildGrid();
    // Keep the NOW marker in sync
    setInterval(updateNowMarker, 60000);
  }

  function setAuth(v) { isAuthenticated = !!v; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.schedule = { init, setAuth };
})();
