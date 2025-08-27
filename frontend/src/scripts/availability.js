(function () {
  // Minimal availability table builder (80/20 layout-ready) — no controls, no network.
  const SLOTS_PER_HOUR = 2;             // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  let isAuthenticated = true;           // editable by default; integrate later via window.schedule.setAuth
  let paintMode = 'add';                // only "add" for now (no UI toggles)

  // Zoom
  let zoomFactor = 1.0;
  const ZOOM_STEP = 0.1;
  const ZOOM_MAX = 2.0;
  let zoomMinFit = 0.6;

  // Settings-lite
  let hour12 = false;                   // 24h labels
  const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

  // State
  const selected = new Set();
  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  // DOM refs
  let grid, gridContent, table, nowMarker, dragHintEl;

  // --- Helpers ---
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function tzOffsetMinutes(tzName, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function epochFromZoned(y, m, d, hh, mm, tzName) {
    const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(tzName, new Date(guess));
    let ts = guess - off * 60000;
    off = tzOffsetMinutes(tzName, new Date(ts));
    ts = guess - off * 60000;
    return Math.floor(ts / 1000);
  }

  function getTodayYMDInTZ(tzName) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return { y: +map.year, m: +map.month, d: +map.day };
  }

  function ymdAddDays(ymd, add) {
    const tmp = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    tmp.setUTCDate(tmp.getUTCDate() + add);
    return { y: tmp.getUTCFullYear(), m: tmp.getUTCMonth() + 1, d: tmp.getUTCDate() };
  }

  function weekdayIndexInTZ(epochSec, tzName) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).format(new Date(epochSec * 1000));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
  }

  function getWeekStartEpochAndYMD() {
    const todayYMD = getTodayYMDInTZ(tz);
    const todayMid = epochFromZoned(todayYMD.y, todayYMD.m, todayYMD.d, 0, 0, tz);
    const todayIdx = weekdayIndexInTZ(todayMid, tz);      // 0..6 Sun..Sat
    const diff = todayIdx;                                 // weekStart = Sun
    const baseYMD = ymdAddDays(todayYMD, -diff);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  }

  function formatHourLabel(hour) {
    if (!hour12) return `${String(hour).padStart(2, '0')}:00`;
    const h = (hour % 12) || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h} ${ampm}`;
  }

  // --- Zoom / fit ---
  function applyZoomStyles() {
    const root = document.documentElement;
    const baseRow = 18; // px at 1.0
    root.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    requestAnimationFrame(updateNowMarker);
  }

  function initialZoomToFit24h() {
    if (!grid || !table) return;
    const thead = table.querySelector('thead');
    const contentEl = gridContent;
    if (!thead || !contentEl) return;

    const baseRow = 18;
    const available = Math.max(0, contentEl.clientHeight - thead.offsetHeight - 2);
    const rowsPerDay = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR; // 48
    const needed = rowsPerDay * baseRow;
    const zFit = Math.max(available / needed, 0.1);
    zoomMinFit = Math.min(zFit, ZOOM_MAX);
    zoomFactor = Math.max(zoomFactor, zoomMinFit);
    applyZoomStyles();
  }

  function setupZoomHandlers() {
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, zoomMinFit, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + ZOOM_STEP, zoomMinFit, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - ZOOM_STEP, zoomMinFit, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '0') { initialZoomToFit24h(); }
    });

    window.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        initialZoomToFit24h();
        updateNowMarker();
      });
    });
  }

  // --- Drag helpers ---
  function ensureDragHint() {
    if (dragHintEl) return;
    dragHintEl = document.createElement('div');
    dragHintEl.className = 'drag-hint';
    document.body.appendChild(dragHintEl);
  }
  function rowToHM(rowIndex) {
    const hour = Math.floor(rowIndex / SLOTS_PER_HOUR) + HOURS_START;
    const minute = (rowIndex % SLOTS_PER_HOUR) * (60 / SLOTS_PER_HOUR);
    return { hour, minute };
  }
  function formatTimeLabel(h, m) {
    if (!hour12) return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
    const ampm = h < 12 ? 'AM' : 'PM';
    const h12 = (h % 12) || 12;
    return `${h12}:${String(m).padStart(2, '0')} ${ampm}`;
  }
  function currentDragRangeLabel() {
    if (!dragStart || !dragEnd) return '';
    const r1 = Math.min(dragStart.row, dragEnd.row);
    const r2 = Math.max(dragStart.row, dragEnd.row);
    const start = rowToHM(r1);
    const end   = rowToHM(r2 + 1);
    return `${formatTimeLabel(start.hour, start.minute)} – ${formatTimeLabel(end.hour, end.minute)}`;
  }
  function positionDragHint(e) {
    if (!dragHintEl) return;
    dragHintEl.style.left = `${e.clientX}px`;
    dragHintEl.style.top  = `${e.clientY}px`;
  }
  function showDragHint(e) {
    ensureDragHint();
    dragHintEl.style.display = 'block';
    dragHintEl.textContent = currentDragRangeLabel();
    positionDragHint(e);
  }
  function updateDragHint(e) {
    if (!dragHintEl || dragHintEl.style.display !== 'block') return;
    dragHintEl.textContent = currentDragRangeLabel();
    positionDragHint(e);
  }
  function hideDragHint() {
    if (dragHintEl) dragHintEl.style.display = 'none';
  }

  function forEachCellInBox(fn) {
    if (!dragStart || !dragEnd) return;
    const r1 = Math.min(dragStart.row, dragEnd.row);
    const r2 = Math.max(dragStart.row, dragEnd.row);
    const c1 = Math.min(dragStart.col, dragEnd.col);
    const c2 = Math.max(dragStart.col, dragEnd.col);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = table.querySelector(`td.slot-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell && !cell.classList.contains('past')) fn(cell);
      }
    }
  }

  function updatePreview() {
    clearPreview();
    forEachCellInBox((cell) => {
      if (paintMode === 'add') cell.classList.add('preview-add');
    });
  }

  function clearPreview() {
    table.querySelectorAll('.preview-add').forEach(el => el.classList.remove('preview-add'));
  }

  function applyBoxSelection() {
    forEachCellInBox((cell) => {
      const epoch = Number(cell.dataset.epoch);
      if (paintMode === 'add') {
        selected.add(epoch);
        cell.classList.add('selected');
      }
    });
  }

  // --- NOW MARKER ---
  function ensureNowMarker() {
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
    ensureNowMarker();
    if (!gridContent || !table || !nowMarker) return;

    const { baseYMD } = getWeekStartEpochAndYMD();
    const todayYMD = getTodayYMDInTZ(tz);
    const dayOffset = Math.round((Date.UTC(todayYMD.y, todayYMD.m - 1, todayYMD.d) - Date.UTC(baseYMD.y, baseYMD.m - 1, baseYMD.d)) / 86400000);
    if (dayOffset < 0 || dayOffset > 6) { nowMarker.style.display = 'none'; return; }

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hh = Number(parts.find(p => p.type === 'hour').value);
    const mm = Number(parts.find(p => p.type === 'minute').value);

    const rowIndex = hh * 2 + (mm >= 30 ? 1 : 0);
    const frac = (mm % 30) / 30;

    const targetCell = table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="${rowIndex}"]`);
    const colStartCell = table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="0"]`);
    if (!targetCell || !colStartCell) { nowMarker.style.display = 'none'; return; }

    const contentTop = (table.offsetTop || 0) + targetCell.offsetTop + (targetCell.offsetHeight * frac);
    const contentLeft = (table.offsetLeft || 0) + colStartCell.offsetLeft;
    const contentWidth = colStartCell.offsetWidth;

    nowMarker.style.display = 'block';
    nowMarker.style.top = `${contentTop}px`;
    nowMarker.style.left = `${contentLeft}px`;
    nowMarker.style.width = `${contentWidth}px`;
  }

  // --- Build grid (thead + 48x7 tbody) ---
  function buildGrid() {
    table.innerHTML = '';

    // Header
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    hr.appendChild(thTime);

    const { baseYMD } = getWeekStartEpochAndYMD();
    const dayEpochs = [];
    for (let i = 0; i < 7; i++) {
      const ymd = ymdAddDays(baseYMD, i);
      const dayEpoch = epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, tz);
      dayEpochs.push({ ymd, epoch: dayEpoch });

      const th = document.createElement('th');
      const label = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(dayEpoch * 1000));
      th.textContent = label;
      th.dataset.col = String(i);
      th.className = 'day';
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    // Body (48 rows × 7)
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
        const spanHour = document.createElement('span');
        spanHour.className = 'time-label hour';
        spanHour.textContent = formatHourLabel(hour);
        th.appendChild(spanHour);
        tr.appendChild(th);
      }

      for (let c = 0; c < 7; c++) {
        const ymd = dayEpochs[c].ymd;
        const epoch = epochFromZoned(ymd.y, ymd.m, ymd.d, hour, half ? 30 : 0, tz);

        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.epoch = String(epoch);
        td.dataset.row = r;
        td.dataset.col = c;

        if (epoch < nowEpoch) td.classList.add('past');

        td.addEventListener('mousedown', (e) => {
          if (!isAuthenticated) return;
          if (td.classList.contains('past')) return;
          e.preventDefault();
          isDragging = true;
          dragStart = { row: r, col: c };
          dragEnd = { row: r, col: c };
          updatePreview();
          showDragHint(e);
        });

        td.addEventListener('mouseenter', (e) => {
          if (!isAuthenticated || !isDragging) return;
          if (td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          updatePreview();
          updateDragHint(e);
        });

        td.addEventListener('mouseup', () => {
          if (!isAuthenticated || !isDragging) return;
          if (td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          applyBoxSelection();
          clearPreview();
          hideDragHint();
          isDragging = false;
          dragStart = dragEnd = null;
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // mouseup anywhere ends drag
    document.addEventListener('mouseup', () => {
      if (!isAuthenticated) return;
      if (isDragging) {
        applyBoxSelection();
        clearPreview();
        hideDragHint();
      }
      isDragging = false;
      dragStart = dragEnd = null;
    });

    // Fit & marker
    requestAnimationFrame(() => requestAnimationFrame(initialZoomToFit24h));
    requestAnimationFrame(updateNowMarker);
  }

  // --- Public API ---
  async function init() {
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');

    if (!grid || !gridContent || !table) return;

    applyZoomStyles();
    setupZoomHandlers();
    ensureNowMarker();
    buildGrid();

    // keep "now" in sync every minute
    setInterval(updateNowMarker, 60000);
    // live drag-hint follow
    document.addEventListener('mousemove', (e) => { if (isDragging) updateDragHint(e); });
  }

  function setAuth(v) { isAuthenticated = !!v; }

  window.schedule = { init, setAuth };
})();
