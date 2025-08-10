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

  let zoomFactor = clamp(typeof settings.defaultZoom === 'number' ? settings.defaultZoom : 1.0, 0.6, 2.0);
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEP = 0.1;

  const selected = new Set();

  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  let table;
  let grid;
  let nowMarker;

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
      const res = await fetch('http://backend.nat20scheduling.com:3000/settings', { credentials: 'include', cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  function saveLocal(obj) {
    localStorage.setItem('nat20_settings', JSON.stringify(obj));
    window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
  }

  function tzOffsetMinutes(tzName, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
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
    return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
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
    document.getElementById('week-label').textContent = `${fmt(startDate)} – ${fmt(endDate)}, ${year}`;
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
    nowMarker = document.getElementById('now-marker');
    if (!nowMarker && grid) {
      nowMarker = document.createElement('div');
      nowMarker.id = 'now-marker';
      nowMarker.className = 'now-marker';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'NOW';
      nowMarker.appendChild(bubble);
      grid.appendChild(nowMarker);
    }
  }

  function applyZoomStyles() {
    const root = document.documentElement;
    const baseRow = 18;
    const baseFont = 12;

    root.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--font-size', `${(baseFont * zoomFactor).toFixed(2)}px`);

    const body = document.body;
    body.classList.remove('zoom-dense', 'zoom-medium', 'zoom-large');
    if (zoomFactor < 1.1) body.classList.add('zoom-dense');
    else if (zoomFactor < 1.5) body.classList.add('zoom-medium');
    else body.classList.add('zoom-large');

    requestAnimationFrame(updateNowMarker);
  }

  function buildGrid() {
    table = document.getElementById('schedule-table');
    grid = document.getElementById('grid');
    ensureNowMarker();
    table.innerHTML = '';

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    renderWeekLabel(baseEpoch);

    const nowEpoch = Math.floor(Date.now() / 1000);

    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
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
          dragStart = { row: r, col: c };
          dragEnd = { row: r, col: c };
          updatePreview();
        });

        td.addEventListener('mouseenter', (e) => {
          if (!isAuthenticated) return moveSigninTooltip(e);
          if (!isDragging) return;
          if (td.classList.contains('past')) return;
          dragEnd = { row: r, col: c };
          updatePreview();
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
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    document.addEventListener('mouseup', () => {
      if (!isAuthenticated) return;
      if (isDragging) {
        applyBoxSelection();
        clearPreview();
      }
      isDragging = false;
      dragStart = dragEnd = null;
    });

    setupZoomHandlers();

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
        if (cell && !cell.classList.contains('past')) fn(cell);
      }
    }
  }

  function updatePreview() {
    clearPreview();
    forEachCellInBox((cell) => {
      if (paintMode === 'add') cell.classList.add('preview-add');
      else cell.classList.add('preview-sub');
    });
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
    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const inside = Array.from(selected).filter(t => t >= baseEpoch && t < endEpoch).sort((a, b) => a - b);
    const intervals = compressToIntervals(inside);
    try {
      const res = await fetch('http://backend.nat20scheduling.com:3000/availability/save', {
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

  async function loadWeekSelections() {
    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);
    try {
      const res = await fetch(`http://backend.nat20scheduling.com:3000/availability/get?from=${baseEpoch}&to=${endEpoch}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.intervals)) {
          for (const t of Array.from(selected)) if (t >= baseEpoch && t < endEpoch) selected.delete(t);
          for (const iv of data.intervals) {
            const from = Number(iv.from);
            const to = Number(iv.to);
            for (let t = from; t < to; t += SLOT_SEC) selected.add(t);
          }
        }
      }
    } catch {}
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
        zoomFactor = clamp(typeof settings.defaultZoom === 'number' ? settings.defaultZoom : zoomFactor, ZOOM_MIN, ZOOM_MAX);
        applyZoomStyles();
        buildGrid();
      }
    });
  }

  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // normal vertical panning
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '0') { zoomFactor = 1.0; applyZoomStyles(); }
    });

    grid.addEventListener('scroll', () => requestAnimationFrame(updateNowMarker), { passive: true });
    window.addEventListener('resize', () => requestAnimationFrame(updateNowMarker));
  }

  // --- NOW MARKER (pixel-accurate; stable across scroll/zoom) ---
  function ymdUTC(ymd) { return Date.UTC(ymd.y, ymd.m - 1, ymd.d); }
  function diffDays(aYMD, bYMD) { return Math.round((ymdUTC(bYMD) - ymdUTC(aYMD)) / 86400000); }

  function updateNowMarker() {
    ensureNowMarker();
    if (!grid || !table || !nowMarker) return;

    const { baseYMD } = getWeekStartEpochAndYMD();
    const todayYMD = getTodayYMDInTZ(tz);
    const dayOffset = diffDays(baseYMD, todayYMD);
    if (dayOffset < 0 || dayOffset > 6) {
      nowMarker.style.display = 'none';
      return;
    }

    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hh = Number(parts.find(p => p.type === 'hour').value);
    const mm = Number(parts.find(p => p.type === 'minute').value);

    const rowIndex = hh * 2 + (mm >= 30 ? 1 : 0);
    const frac = (mm % 30) / 30;

    const cell = table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="${rowIndex}"]`);
    const dayStart = table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="0"]`);
    if (!cell || !dayStart) {
      nowMarker.style.display = 'none';
      return;
    }

    const gridRect = grid.getBoundingClientRect();
    const cellRect = cell.getBoundingClientRect();
    const colRect = dayStart.getBoundingClientRect();

    const top = (cellRect.top - gridRect.top) + (cellRect.height * frac);
    const left = (colRect.left - gridRect.left);
    const width = colRect.width;

    nowMarker.style.display = 'block';
    nowMarker.style.top = `${top}px`;
    nowMarker.style.left = `${left}px`;
    nowMarker.style.width = `${width}px`;
  }
  // --- /NOW MARKER ---

  async function init() {
    const remote = await fetchRemoteSettings();
    const local = loadLocal();
    const s = remote || local || DEFAULT_SETTINGS;
    settings = { ...DEFAULT_SETTINGS, ...s };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    highlightWeekends = !!settings.highlightWeekends;
    zoomFactor = clamp(typeof settings.defaultZoom === 'number' ? settings.defaultZoom : 1.0, ZOOM_MIN, ZOOM_MAX);
    saveLocal(settings);

    applyZoomStyles();
    attachEvents();
    await loadWeekSelections();
    buildGrid();

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

  window.schedule = { init, setAuth };
})();
