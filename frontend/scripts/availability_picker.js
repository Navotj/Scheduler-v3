(function () {
  const SLOTS_PER_HOUR = 2;
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  let weekOffset = 0;
  let paintMode = 'add';
  let isAuthenticated = false;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, highlightWeekends: false };

  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
  let highlightWeekends = !!settings.highlightWeekends;

  let zoomFactor = 1.0;
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.4;
  const ZOOM_STEP = 0.1;

  const selected = new Set();

  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  let table;
  let grid;
  let gridContent;
  let nowMarker;
  let dragTooltip;

  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function loadLocal() {
    try {
      const raw = localStorage.getItem('nat20_settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function fetchRemoteSettings() {
    try {
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) return null;
      return await res.json();
    } catch {
      return null;
    }
  }

  function saveLocal(s) {
    try { localStorage.setItem('nat20_settings', JSON.stringify(s)); } catch {}
  }

  function epochFromZoned(y, m, d, hh, mm, tzName) {
    const dt = new Date(Date.UTC(y, m - 1, d, hh, mm || 0));
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false,
    }).formatToParts(dt);
    const parts = Object.fromEntries(f.map(p => [p.type, p.value]));
    const y2 = Number(parts.year), m2 = Number(parts.month), d2 = Number(parts.day);
    const h2 = Number(parts.hour), min2 = Number(parts.minute);
    return Math.floor(Date.UTC(y2, m2 - 1, d2, h2, min2) / 1000);
  }

  function getTodayYMDInTZ(tzName) {
    const now = new Date();
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const parts = Object.fromEntries(f.map(p => [p.type, p.value]));
    return { y: Number(parts.year), m: Number(parts.month), d: Number(parts.day) };
  }

  function ymdAddDays(ymd, days) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d + days));
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function weekdayIndexInTZ(epochSec, tzName) {
    const f = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).format(new Date(epochSec * 1000));
    return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(f);
  }

  function formatHourLabel(hour) {
    if (!hour12) return `${String(hour).padStart(2, '0')}:00`;
    const h = (hour % 12) || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h} ${ampm}`;
  }

  function renderWeekLabel(startEpoch) {
    const startDate = new Date(startEpoch * 1000);
    const endDate = new Date((startEpoch + 6 * 86400) * 1000);
    const fmt = (dt) => new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short', day: 'numeric' }).format(dt);
    const startYear = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(startDate);
    const endYear = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric' }).format(endDate);
    const year = startYear === endYear ? startYear : `${startYear}–${endYear}`;
    const el = document.getElementById('week-label');
    if (el) el.textContent = `${fmt(startDate)} – ${fmt(endDate)}, ${year}`;
  }

  function getWeekStartEpochAndYMD() {
    const todayYMD = getTodayYMDInTZ(tz);
    const todayMid = epochFromZoned(todayYMD.y, todayYMD.m, todayYMD.d, 0, 0, tz);
    const todayIdx = weekdayIndexInTZ(todayMid, tz);
    const diff = (todayIdx - weekStartIdx + 7) % 7;
    const baseYMD = ymdAddDays(todayYMD, -diff + weekOffset * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  }

  function ensureNowMarker() {
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
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
    } else if (nowMarker && nowMarker.parentElement !== gridContent && gridContent) {
      nowMarker.parentElement.removeChild(nowMarker);
      gridContent.appendChild(nowMarker);
    }
  }

  function ensureDragTooltip() {
    if (!dragTooltip) {
      dragTooltip = document.getElementById('drag-tooltip');
    }
    if (!dragTooltip) {
      dragTooltip = document.createElement('div');
      dragTooltip.id = 'drag-tooltip';
      dragTooltip.className = 'drag-tooltip';
      dragTooltip.style.display = 'none';
      document.body.appendChild(dragTooltip);
    }
  }

  function formatTimeHM(epochSec) {
    const dt = new Date(epochSec * 1000);
    const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12: hour12 });
    return fmt.format(dt);
  }

  function getEpochAt(rc) {
    if (!rc) return null;
    const el = table.querySelector(`td.slot-cell[data-row="${rc.row}"][data-col="${rc.col}"]`);
    return el ? Number(el.dataset.epoch) : null;
  }

  function updateDragTooltip(e) {
    if (!isDragging || !dragStart || !dragEnd) return;
    ensureDragTooltip();
    const start = getEpochAt(dragStart);
    const end = getEpochAt(dragEnd);
    if (start == null || end == null) return;
    const lo = Math.min(start, end);
    const hi = Math.max(start, end) + SLOT_SEC;
    dragTooltip.textContent = `${formatTimeHM(lo)} - ${formatTimeHM(hi)}`;
    if (e) {
      dragTooltip.style.left = (e.clientX + 14) + 'px';
      dragTooltip.style.top = (e.clientY + 16) + 'px';
    }
    dragTooltip.style.display = 'block';
  }

  function hideDragTooltip() {
    if (dragTooltip) dragTooltip.style.display = 'none';
  }

  function updateNowMarker() {
    ensureNowMarker();
    if (!nowMarker || !gridContent || !table) return;

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();

    const tzName = tz;
    const dayOffset = Math.floor((Date.UTC(baseYMD.y, baseYMD.m - 1, baseYMD.d) - Date.UTC(baseYMD.y, baseYMD.m - 1, baseYMD.d)) / 86400000);
    const todayYMD = getTodayYMDInTZ(tzName);
    const todayMidEpoch = epochFromZoned(todayYMD.y, todayYMD.m, todayYMD.d, 0, 0, tzName);
    const todayIdx = weekdayIndexInTZ(todayMidEpoch, tzName);
    const startOfWeekIdx = weekdayIndexInTZ(epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tzName), tzName);
    const rel = (todayIdx - weekStartIdx + 7) % 7;

    if (rel < 0 || rel > 6) {
      nowMarker.style.display = 'none';
      return;
    }

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hh = Number(parts.find(p => p.type === 'hour').value);
    const mm = Number(parts.find(p => p.type === 'minute').value);

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
    const dayCols = table.querySelectorAll('thead th.day');
    if (dayCols.length !== 7) { nowMarker.style.display = 'none'; return; }

    const dayCol = Array.from(dayCols)[rel];
    const dayRect = dayCol.getBoundingClientRect();
    const gridRect = gridContent.getBoundingClientRect();

    const yPerHour = (table.querySelector('tbody tr').getBoundingClientRect().height) * SLOTS_PER_HOUR;
    const y = ((hh - HOURS_START) * SLOTS_PER_HOUR + (mm >= 30 ? 1 : 0)) * (yPerHour / SLOTS_PER_HOUR);

    nowMarker.style.display = 'block';
    const headerHeight = table.querySelector('thead').getBoundingClientRect().height;
    nowMarker.style.left = (dayRect.left - gridRect.left) + 'px';
    nowMarker.style.width = (dayRect.width) + 'px';
    nowMarker.style.top = (headerHeight + y) + 'px';

    const bub = nowMarker.querySelector('.bubble');
    if (bub) bub.textContent = formatTimeHM(Math.floor(Date.now() / 1000));
  }

  function buildGrid() {
    table = document.getElementById('schedule-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    ensureNowMarker();
    table.innerHTML = '';

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    renderWeekLabel(baseEpoch);

    const nowEpoch = Math.floor(Date.now() / 1000);

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    thTime.className = 'time-col';
    hr.appendChild(thTime);

    const dayEpochs = [];
    for (let i = 0; i < 7; i++) {
      const ymd = ymdAddDays(baseYMD, i);
      const dayEpoch = epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, tz);
      dayEpochs.push({ ymd, epoch: dayEpoch });

      const th = document.createElement('th');
      const label = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(dayEpoch * 1000));
      th.textContent = label;
      th.dataset.col = String(i);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');

      const hour = Math.floor(r / SLOTS_PER_HOUR) + HOURS_START;
      const half = r % SLOTS_PER_HOUR === 1;
      tr.className = half ? 'row-half' : 'row-hour';

      if (!half) {
        const timeCell = document.createElement('td');
        timeCell.className = 'time-col hour';
        timeCell.rowSpan = 2;
        const spanHour = document.createElement('span');
        spanHour.className = 'time-label hour';
        spanHour.textContent = formatHourLabel(hour);
        timeCell.appendChild(spanHour);
        tr.appendChild(timeCell);
      }

      for (let c = 0; c < 7; c++) {
        const ymd = dayEpochs[c].ymd;
        const epoch = epochFromZoned(ymd.y, ymd.m, ymd.d, hour, half ? 30 : 0, tz);

        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.epoch = String(epoch);
        td.dataset.row = r;
        td.dataset.col = c;

        if (highlightWeekends) {
          const weekdayStr = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(dayEpochs[c].epoch * 1000));
          if (weekdayStr === 'Sat' || weekdayStr === 'Sun') td.classList.add('col-weekend');
        }

        if (selected.has(epoch)) td.classList.add('selected');

        if (epoch < nowEpoch) td.classList.add('past');

        td.addEventListener('mousedown', (e) => {
          if (!isAuthenticated) return showSigninTooltip(e);
          if (td.classList.contains('past')) return;
          e.preventDefault();
          isDragging = true;
          ensureDragTooltip();
          updateDragTooltip(e);
          dragStart = { row: r, col: c };
          dragEnd = { row: r, col: c };
          updatePreview(e);
        });

        td.addEventListener('mouseenter', (e) => {
          if (!isAuthenticated) return moveSigninTooltip(e);
          if (!isDragging) return;
          if (td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          updatePreview(e);
          updateDragTooltip(e);
        });

        td.addEventListener('mouseup', () => {
          if (!isAuthenticated) return;
          if (!isDragging) return;
          if (td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          applyBoxSelection();
          clearPreview();
          isDragging = false;
          dragStart = dragEnd = null;
          hideDragTooltip();
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    document.addEventListener('mouseup', () => {
      if (!isDragging) return;
      applyBoxSelection();
      clearPreview();
      isDragging = false;
      dragStart = dragEnd = null;
      hideDragTooltip();
    });

    setupZoomHandlers();

    // start zoomed-out to fit 24h (like schedule matcher)
    requestAnimationFrame(() => requestAnimationFrame(initialZoomToFit24h));
    requestAnimationFrame(updateNowMarker);
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
        if (cell) fn(cell);
      }
    }
  }

  function updatePreview(e) {
    clearPreview();
    forEachCellInBox((cell) => {
      if (paintMode === 'add') cell.classList.add('preview-add');
      else cell.classList.add('preview-sub');
    });
    updateDragTooltip();
  }

  function clearPreview() {
    table.querySelectorAll('.preview-add').forEach(el => el.classList.remove('preview-add'));
    table.querySelectorAll('.preview-sub').forEach(el => el.classList.remove('preview-sub'));
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

  function setMode(mode) {
    paintMode = mode;
    document.getElementById('mode-add').classList.toggle('active', mode === 'add');
    document.getElementById('mode-subtract').classList.toggle('active', mode === 'subtract');
  }

  function compressToIntervals(sortedEpochs) {
    const intervals = [];
    if (sortedEpochs.length === 0) return intervals;

    let start = sortedEpochs[0];
    let prev = start;

    for (let i = 1; i < sortedEpochs.length; i++) {
      const cur = sortedEpochs[i];
      if (cur === prev + SLOT_SEC) {
        prev = cur;
      } else {
        intervals.push([start, prev + SLOT_SEC]);
        start = prev = cur;
      }
    }
    intervals.push([start, prev + SLOT_SEC]);
    return intervals;
  }

  async function saveWeek() {
    if (!isAuthenticated) return;
    const epochs = Array.from(selected).sort((a, b) => a - b);
    const intervals = compressToIntervals(epochs);
    try {
      const res = await fetch('/availability', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ weekOffset, intervals })
      });
      if (!res.ok) throw new Error('Failed');
    } catch (e) {
      console.error('saveWeek error', e);
    }
  }

  async function loadWeekSelections() {
    selected.clear();
    try {
      const res = await fetch(`/availability?weekOffset=${encodeURIComponent(weekOffset)}`, { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      (data.intervals || []).forEach(([a, b]) => {
        for (let t = a; t < b; t += SLOT_SEC) selected.add(t);
      });
    } catch {}
  }

  function setupZoomHandlers() {
    const el = document.getElementById('grid-content');
    el.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // normal vertical panning
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });

    // Optional keyboard zoom with Shift held, vertical-only effect
    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
    });

    /* No scroll listener needed for horizontal; table is fixed-width */
  }

  function applyZoomStyles() {
    document.documentElement.style.setProperty('--row-height', `${Math.round(18 * zoomFactor)}px`);
  }

  function initialZoomToFit24h() {
    // set to minimum so full 24h fits; rely on CSS to cap text sizes
    zoomFactor = ZOOM_MIN;
    applyZoomStyles();
  }

  async function init() {
    table = document.getElementById('schedule-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    ensureNowMarker();
    ensureDragTooltip();

    const remote = await fetchRemoteSettings();
    const local = loadLocal();
    const s = remote || local || DEFAULT_SETTINGS;
    settings = { ...DEFAULT_SETTINGS, ...s };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    highlightWeekends = !!settings.highlightWeekends;

    // start from defaultZoom only for first paint; then we fit to viewport
    const dz = (typeof settings.defaultZoom === 'number') ? settings.defaultZoom : 1.0;
    zoomFactor = clamp(dz, ZOOM_MIN, ZOOM_MAX);
    saveLocal(settings);

    applyZoomStyles();
    attachEvents();
    await loadWeekSelections();
    buildGrid();

    // keep "now" in sync every minute
    setInterval(updateNowMarker, 60000);
  }

  function setAuth(authenticated) { isAuthenticated = !!authenticated; }

  function showSigninTooltip(e) {
    const tt = document.getElementById('signin-tooltip');
    tt.style.display = 'block';
    tt.style.left = (e.clientX + 12) + 'px';
    tt.style.top = (e.clientY + 14) + 'px';
  }
  function moveSigninTooltip(e) {
    const tt = document.getElementById('signin-tooltip');
    tt.style.left = (e.clientX + 12) + 'px';
    tt.style.top = (e.clientY + 14) + 'px';
  }

  function attachEvents() {
    document.getElementById('prev-week').addEventListener('click', async () => {
      if (!isAuthenticated) return;
      weekOffset -= 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      if (!isAuthenticated) return;
      weekOffset += 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('mode-add').addEventListener('click', () => { if (!isAuthenticated) return; setMode('add'); });
    document.getElementById('mode-subtract').addEventListener('click', () => { if (!isAuthenticated) return; setMode('subtract'); });
    document.getElementById('save').addEventListener('click', saveWeek);

    const tt = document.getElementById('signin-tooltip');
    ['mousemove','mouseenter'].forEach(ev => document.addEventListener(ev, (e) => {
      if (!isAuthenticated) {
        tt.style.display = 'block';
        tt.style.left = (e.clientX + 12) + 'px';
        tt.style.top = (e.clientY + 14) + 'px';
      }
    }));
    document.addEventListener('mouseleave', () => { tt.style.display = 'none'; });
    document.addEventListener('mousedown', () => { if (!isAuthenticated) tt.style.display = 'block'; });

    window.addEventListener('storage', (e) => {
      if (e.key === 'nat20_settings') {
        const s = loadLocal();
        if (!s) return;
        settings = { ...DEFAULT_SETTINGS, ...s };
        tz = resolveTimezone(settings.timezone);
        hour12 = settings.clock === '12';
        weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
        highlightWeekends = !!settings.highlightWeekends;
        // do not take defaultZoom from settings here; keep current user zoom
        applyZoomStyles();
        buildGrid();
      }
    });

    // Recompute now marker geometry on window resize
    window.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        requestAnimationFrame(updateNowMarker);
      });
    });
  }

  window.schedule = { init, setAuth };
})();
