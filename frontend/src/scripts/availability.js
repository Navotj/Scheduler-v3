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
  let slotHeight = 18;                  // px; controls vertical zoom of slots

  // DOM refs
  let gridContent, table, nowMarker;

  // --- Settings bridge (reads settings.js saved state) ---
  const SETTINGS_KEY = 'nat20_settings';
  const DEFAULTS = { timezone: 'auto', clock: '24', weekStart: 'sun' };

  function readSettings() {
    let s = {};
    try {
      const raw = localStorage.getItem(SETTINGS_KEY);
      s = raw ? JSON.parse(raw) : {};
    } catch {}
    const sysTZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    const tz = (s.timezone && s.timezone !== 'auto') ? s.timezone : sysTZ;
    const clock = (s.clock === '12') ? '12' : '24';
    const weekStart = (s.weekStart === 'mon') ? 'mon' : 'sun';
    return { tz, clock, weekStart };
  }

  let cfg = readSettings();

  // React live to settings changes (settings.js dispatches a StorageEvent)
  window.addEventListener('storage', (e) => {
    if (e && e.key === SETTINGS_KEY) {
      cfg = readSettings();
      buildGrid();
      updateNowMarker();
    }
  });

  // --- Time helpers ---
  function zonedEpoch(y, m, d, hh, mm, tz) {
    // Convert a wall time in IANA tz to a UTC epoch (seconds), DST-safe via offset iteration
    function wallUTCFromInstant(ms) {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const parts = dtf.formatToParts(new Date(ms));
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      return Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    }

    // Start with the naive UTC of the provided wall components
    const naive = Date.UTC(y, m - 1, d, hh, mm, 0);

    // First guess: subtract the offset observed at the naive instant
    const offset1 = wallUTCFromInstant(naive) - naive;
    let instant = naive - offset1;

    // Refine once: recompute offset at the candidate instant (handles DST edges)
    const offset2 = wallUTCFromInstant(instant) - instant;
    instant = naive - offset2;

    return Math.floor(instant / 1000);
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
  function getWeekStartYMD(tz) {
    // Respect settings.js: Sunday or Monday start, computed in the chosen TZ
    const t = todayYMD(tz);
    const todayMid = zonedEpoch(t.y, t.m, t.d, 0, 0, tz);

    // Weekday index in the target timezone (0=Sun..6=Sat)
    const wdName = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(todayMid * 1000));
    const wdLocal = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wdName);

    // Offset from configured week start
    const weekStartIdx = (cfg.weekStart === 'mon') ? 1 : 0;
    const diff = (wdLocal - weekStartIdx + 7) % 7;

    // Move back to the configured week's start, then apply weekOffset
    return addDays(t.y, t.m, t.d, -diff + weekOffset * 7);
  }

  function minutesOfDayInTZ(tz) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return (+map.hour) * 60 + (+map.minute) + (+map.second) / 60;
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
    if (cfg.clock === '12') {
      const h12 = (hour % 12) === 0 ? 12 : (hour % 12);
      const ampm = hour < 12 ? 'AM' : 'PM';
      return `${h12}:00 ${ampm}`;
    }
    return String(hour).padStart(2, '0') + ':00';
  }

  function buildGrid() {
    cfg = readSettings(); // refresh once at build time
    const tz = cfg.tz;
    if (!table) return;

    table.innerHTML = '';

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

    // Apply current zoom after rebuild
    applySlotHeight();
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

    if (!updateNowMarker._bound) {
      try {
        window.addEventListener('resize', updateNowMarker, { passive: true });
        if (gridContent) gridContent.addEventListener('scroll', updateNowMarker, { passive: true });
      } catch {}
      updateNowMarker._bound = true;
    }

    const tbody = table.tBodies && table.tBodies[0];
    if (!tbody || !nowMarker || !gridContent) { if (nowMarker) nowMarker.style.display = 'none'; return; }

    const tz = cfg.tz;

    const base = getWeekStartYMD(tz);
    const baseEpoch = zonedEpoch(base.y, base.m, base.d, 0, 0, tz);
    const t = todayYMD(tz);
    const todayMid = zonedEpoch(t.y, t.m, t.d, 0, 0, tz);
    const dayOffset = Math.floor((todayMid - baseEpoch) / 86400);

    if (dayOffset < 0 || dayOffset > 6) { nowMarker.style.display = 'none'; return; }

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
    const firstCell = table.querySelector('td.slot-cell[data-col="' + dayOffset + '"][data-row="0"]');
    const lastCell  = table.querySelector('td.slot-cell[data-col="' + dayOffset + '"][data-row="' + (totalRows - 1) + '"]');
    if (!firstCell || !lastCell) { nowMarker.style.display = 'none'; return; }

    function cumTop(el, stop) { let y = 0; while (el && el !== stop) { y += el.offsetTop; el = el.offsetParent; } return y; }
    function cumLeft(el, stop) { let x = 0; while (el && el !== stop) { x += el.offsetLeft; el = el.offsetParent; } return x; }

    const minutes = minutesOfDayInTZ(tz);

    const topStart = cumTop(firstCell, gridContent);
    const topEnd = cumTop(lastCell, gridContent) + lastCell.offsetHeight;
    const dayHeight = topEnd - topStart;
    const top = topStart + (minutes / (24 * 60)) * dayHeight;

    const left = cumLeft(firstCell, gridContent);
    const width = firstCell.offsetWidth;

    nowMarker.style.display = 'block';
    nowMarker.style.top = top + 'px';
    nowMarker.style.left = left + 'px';
    nowMarker.style.right = '';
    nowMarker.style.width = width + 'px';
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
    const tz = cfg.tz;
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
    const tz = cfg.tz;
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

  // --- Zoom (Shift + Scroll) ---
  function applySlotHeight() {
    if (gridContent) gridContent.style.setProperty('--slot-h', `${slotHeight}px`);
  }
  function onWheelZoom(e) {
    if (!e.shiftKey) return;
    if (!gridContent) return;
    e.preventDefault();
    const step = 2;
    const dir = Math.sign(e.deltaY);       // up: -1, down: +1 (varies per device)
    const next = slotHeight - dir * step;  // invert so wheel-up zooms in (larger rows)
    slotHeight = Math.min(48, Math.max(12, next)); // clamp
    applySlotHeight();
    updateNowMarker();
  }

  // --- Init / Public API ---
  function init() {
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    if (!gridContent || !table) return;
    setMode('add');
    attachControls();
    applySlotHeight();
    gridContent.addEventListener('wheel', onWheelZoom, { passive: false });
    buildGrid();
    // Keep the NOW marker in sync
    setInterval(updateNowMarker, 60000);
  }

  function setAuth(v) { isAuthenticated = !!v; }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.schedule = { init, setAuth };
})();
