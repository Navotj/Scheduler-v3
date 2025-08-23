(function () {
  const SLOTS_PER_HOUR = 2;
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  let weekOffset = 0;
  let paintMode = 'add';
  let isAuthenticated = false;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0 };

  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  let zoomFactor = 1.0;

  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  let dragHintEl = null;

  let table;
  let grid;
  let gridContent;
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

  function mondayOfWeek(epoch, tzName) {
    const d = new Date(epoch * 1000);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).formatToParts(d);
    let wd = null;
    for (const p of parts) if (p.type === 'weekday') { wd = p.value; break; }
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    const delta = (idx + 6) % 7;
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const map = {};
    for (const p of dateParts) map[p.type] = p.value;
    const y = Number(map.year), m = Number(map.month), day = Number(map.day);
    return epochFromZoned(y, m, day - delta, 0, 0, tzName);
  }

  function sundayOfWeek(epoch, tzName) {
    const d = new Date(epoch * 1000);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).formatToParts(d);
    let wd = null;
    for (const p of parts) if (p.type === 'weekday') { wd = p.value; break; }
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    const delta = (idx + 7) % 7;
    const dateParts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(d);
    const map = {};
    for (const p of dateParts) map[p.type] = p.value;
    const y = Number(map.year), m = Number(map.month), day = Number(map.day);
    return epochFromZoned(y, m, day - delta, 0, 0, tzName);
  }

  function startOfThisWeek(epoch, tzName, weekStart) {
    if (weekStart === 1) return mondayOfWeek(epoch, tzName);
    return sundayOfWeek(epoch, tzName);
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
    const startYear = new Intl.DateTimeFormat(undefined, { timeZone: tz, year: 'numeric' }).format(startDate);
    const endYear = new Intl.DateTimeFormat(undefined, { timeZone: tz, year: 'numeric' }).format(endDate);
    const label = `${fmt(startDate)}${startYear !== endYear ? ' ' + startYear : ''} – ${fmt(endDate)} ${endYear}`;
    const el = document.getElementById('week-label');
    if (el) el.textContent = label;
  }

  function getNowMarkerPosition(epochStart) {
    const now = Date.now() / 1000;
    const secIntoWeek = now - epochStart;
    if (secIntoWeek < 0 || secIntoWeek > 7 * 86400) return null;
    const day = Math.floor(secIntoWeek / 86400);
    const remain = secIntoWeek - day * 86400;
    const fracHour = remain / 3600;
    return { day, fracHour };
  }

  function updateNowMarker(epochStart) {
    if (!nowMarker) return;
    const pos = getNowMarkerPosition(epochStart);
    if (!pos) { nowMarker.style.display = 'none'; return; }
    nowMarker.style.display = 'block';
    nowMarker.style.setProperty('--col', String(pos.day));
    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    nowMarker.style.setProperty('--rowpx', `${pos.fracHour * rowH}px`);
  }

  function fetchWithAuth(url, options = {}) {
    const merged = { credentials: 'include', cache: 'no-cache', ...options };
    return fetch(url, merged);
  }

  async function saveAvailability(username, ranges) {
    const res = await fetchWithAuth('/availability/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ ranges })
    });
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Save failed'));
    return res.json().catch(()=>({ ok:true }));
  }

  async function fetchAvailability(username, startEpoch, endEpoch) {
    const url = `/availability?start=${startEpoch}&end=${endEpoch}`;
    const res = await fetchWithAuth(url);
    if (!res.ok) throw new Error(await res.text().catch(()=> 'Fetch failed'));
    return res.json();
  }

  function rangeToCells(range, startEpoch) {
    const start = Math.max(range.start, startEpoch);
    const end = Math.min(range.end, startEpoch + 7 * 86400);
    if (end <= start) return [];
    const startDay = Math.floor((start - startEpoch) / 86400);
    const endDay = Math.floor((end - startEpoch) / 86400);
    const out = [];
    const slotLen = 1800;
    for (let day = startDay; day <= endDay; day++) {
      const dayStart = startEpoch + day * 86400;
      const a = Math.max(0, Math.floor((start - dayStart) / slotLen));
      const b = Math.min(48, Math.ceil((end - dayStart) / slotLen));
      for (let s = a; s < b; s++) out.push({ day, slot: s });
    }
    return out;
  }

  function cellsToRanges(cells, startEpoch) {
    const slotLen = 1800;
    const byDay = new Map();
    for (const c of cells) {
      const key = String(c.day);
      if (!byDay.has(key)) byDay.set(key, new Set());
      byDay.get(key).add(c.slot);
    }
    const ranges = [];
    for (let day = 0; day < 7; day++) {
      const set = byDay.get(String(day));
      if (!set || set.size === 0) continue;
      const arr = Array.from(set).sort((a,b)=>a-b);
      let start = arr[0];
      for (let i = 1; i <= arr.length; i++) {
        if (i === arr.length || arr[i] !== arr[i-1] + 1) {
          const dayStart = startEpoch + day * 86400;
          ranges.push({ start: dayStart + start * slotLen, end: dayStart + (arr[i-1] + 1) * slotLen });
          start = arr[i];
        }
      }
    }
    return ranges;
  }

  function buildTable(container) {
    const tbl = document.createElement('table');
    tbl.className = 'table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = 'Time';
    trh.appendChild(th0);

    const days = weekStartIdx === 1
      ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
      : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

    for (const d of days) {
      const th = document.createElement('th');
      th.textContent = d;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    tbl.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let h = HOURS_START; h < HOURS_END; h++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = formatHourLabel(h);
      tr.appendChild(th);

      for (let day = 0; day < 7; day++) {
        for (let s = 0; s < SLOTS_PER_HOUR; s++) {
          const td = document.createElement('td');
          td.setAttribute('data-day', String(day));
          td.setAttribute('data-slot', String(h * SLOTS_PER_HOUR + s));
          tr.appendChild(td);
        }
      }
      tbody.appendChild(tr);
    }

    tbl.appendChild(tbody);
    container.appendChild(tbl);
    return tbl;
  }

  function applyZoomStyles() {
    const baseRow = 18;
    document.documentElement.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    requestAnimationFrame(() => updateNowMarker(getWeekStartEpoch()));
  }

  function installControls() {
    const prev = document.getElementById('prev-week');
    const next = document.getElementById('next-week');
    const save = document.getElementById('save');
    const add = document.getElementById('mode-add');
    const sub = document.getElementById('mode-subtract');
    if (prev) prev.addEventListener('click', () => { weekOffset--; render(); });
    if (next) next.addEventListener('click', () => { weekOffset++; render(); });
    if (save) save.addEventListener('click', onSave);
    if (add) add.addEventListener('click', () => { paintMode = 'add'; add.classList.add('active'); sub.classList.remove('active'); });
    if (sub) sub.addEventListener('click', () => { paintMode = 'subtract'; sub.classList.add('active'); add.classList.remove('active'); });
  }

  async function onSave() {
    if (!isAuthenticated) { alert('Login to save'); return; }
    const weekStartEpoch = getWeekStartEpoch();
    const cells = collectMarkedCells();
    const ranges = cellsToRanges(cells, weekStartEpoch);
    try {
      await saveAvailability(null, ranges);
      alert('Saved');
    } catch (e) {
      alert('Save failed');
    }
  }

  function getWeekStartEpoch() {
    const now = Math.floor(Date.now() / 1000);
    const start = startOfThisWeek(now, tz, weekStartIdx);
    return start + weekOffset * 7 * 86400;
  }

  function collectMarkedCells() {
    const cells = [];
    table.querySelectorAll('td.marked').forEach(td => {
      cells.push({ day: Number(td.getAttribute('data-day')), slot: Number(td.getAttribute('data-slot')) });
    });
    return cells;
  }

  function clearTable() {
    table.querySelectorAll('td').forEach(td => td.classList.remove('marked'));
  }

  function markCells(ranges, weekStartEpoch) {
    for (const r of ranges) {
      for (const c of rangeToCells(r, weekStartEpoch)) {
        const td = table.querySelector(`td[data-day="${c.day}"][data-slot="${c.slot}"]`);
        if (td) td.classList.add('marked');
      }
    }
  }

  function installPainting() {
    gridContent.addEventListener('mousedown', (e) => {
      const cell = e.target.closest('td');
      if (!cell) return;

      isDragging = true;
      dragStart = cell;
      dragEnd = cell;
      showDragHint(e);
      updateSelection();
      e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => {
      if (!isDragging) return;
      const cell = e.target.closest && e.target.closest('td');
      if (cell) dragEnd = cell;
      showDragHint(e);
      updateSelection();
    });
    window.addEventListener('mouseup', () => {
      if (!isDragging) return;
      isDragging = false;
      applySelection();
      hideDragHint();
      dragStart = dragEnd = null;
    });
  }

  function tdPos(td) {
    return { day: Number(td.getAttribute('data-day')), slot: Number(td.getAttribute('data-slot')) };
  }

  function updateSelection() {
    table.querySelectorAll('td').forEach(td => td.classList.remove('selecting'));
    if (!dragStart || !dragEnd) return;
    const a = tdPos(dragStart);
    const b = tdPos(dragEnd);
    const dayLo = Math.min(a.day, b.day);
    const dayHi = Math.max(a.day, b.day);
    const slotLo = Math.min(a.slot, b.slot);
    const slotHi = Math.max(a.slot, b.slot);
    for (let day = dayLo; day <= dayHi; day++) {
      for (let slot = slotLo; slot <= slotHi; slot++) {
        const td = table.querySelector(`td[data-day="${day}"][data-slot="${slot}"]`);
        if (td) td.classList.add('selecting');
      }
    }
  }

  function applySelection() {
    const sel = Array.from(table.querySelectorAll('td.selecting'));
    for (const td of sel) {
      td.classList.remove('selecting');
      if (paintMode === 'add') td.classList.add('marked');
      else td.classList.remove('marked');
    }
  }

  function showDragHint(e) {
    if (!dragHintEl) {
      dragHintEl = document.createElement('div');
      dragHintEl.className = 'drag-hint';
      document.body.appendChild(dragHintEl);
    }
    const a = tdPos(dragStart || e.target.closest('td'));
    const b = tdPos(dragEnd || e.target.closest('td'));
    if (!a || !b) return;
    const dayLo = Math.min(a.day, b.day);
    const dayHi = Math.max(a.day, b.day);
    const slotLo = Math.min(a.slot, b.slot);
    const slotHi = Math.max(a.slot, b.slot);
    const hours = ((slotHi - slotLo + 1) / SLOTS_PER_HOUR).toFixed(1);
    dragHintEl.textContent = `${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayLo]}–${['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][dayHi]} • ${hours}h`;
    dragHintEl.style.left = `${e.clientX + 16}px`;
    dragHintEl.style.top = `${e.clientY + 16}px`;
    dragHintEl.style.display = 'block';
  }
  function hideDragHint() { if (dragHintEl) dragHintEl.style.display = 'none'; }

  function installZoomPan() {
    grid.addEventListener('wheel', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        zoomFactor = clamp(zoomFactor + delta, 0.7, 1.6);
        applyZoomStyles();
      }
    }, { passive: false });
  }

  function installNowMarkerTick(epochStart) {
    updateNowMarker(epochStart);
    setInterval(() => updateNowMarker(epochStart), 30 * 1000);
  }

  async function loadWeek() {
    const startEpoch = getWeekStartEpoch();
    renderWeekLabel(startEpoch);
    updateNowMarker(startEpoch);

    clearTable();
    if (!isAuthenticated) return;

    try {
      const data = await fetchAvailability(null, startEpoch, startEpoch + 7 * 86400);
      if (data && Array.isArray(data.ranges)) {
        markCells(data.ranges, startEpoch);
      }
    } catch {}
  }

  function render() { loadWeek(); }

  function setAuth(auth) {
    isAuthenticated = !!auth;
    const tip = document.getElementById('signin-tooltip');
    if (tip) tip.style.display = isAuthenticated ? 'none' : 'block';
  }

  document.addEventListener('auth:changed', (e) => {
    setAuth(!!(e.detail && e.detail.isAuthenticated));
  });

  function hydrateSettings(base) {
    settings = { ...DEFAULT_SETTINGS, ...(base || {}) };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    zoomFactor = Number(settings.defaultZoom || 1.0);
    applyZoomStyles();
  }

  async function init() {
    table = document.getElementById('schedule-table'); // id matches HTML
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    nowMarker = document.getElementById('now-marker');

    if (!grid || !gridContent) return;

    buildTable(gridContent);
    installControls();
    installPainting();
    installZoomPan();
    installNowMarkerTick(getWeekStartEpoch());

    const local = loadLocal();
    if (local) hydrateSettings(local);
    try {
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-cache' });
      if (res.ok) {
        const remote = await res.json();
        if (remote && typeof remote === 'object') {
          hydrateSettings({ ...local, ...remote });
          saveLocal({ ...local, ...remote });
        }
      }
    } catch {}

    // legend labels
    (function renderLegend() {
      const labels = document.getElementById('legend-labels');
      const steps = document.getElementById('legend-steps');
      if (!labels || !steps) return;
      labels.innerHTML = '';
      steps.innerHTML = '';
      for (let i = 0; i <= 10; i++) {
        const slot = document.createElement('div');
        slot.className = 'legend-step';
        slot.style.setProperty('--p', String(i / 10));
        steps.appendChild(slot);
      }
      for (let i = 0; i < 24; i += 2) {
        const span = document.createElement('span');
        span.textContent = formatHourLabel(i);
        labels.appendChild(span);
      }
    })();

    render();
  }

  window.schedule = { init, setAuth };
})();
