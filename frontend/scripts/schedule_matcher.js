(function () {
  // Entry: schedule matcher page.

  // ----------------------
  // Constants / Defaults
  // ----------------------
  const SLOTS_PER_HOUR = 2;          // 30 minute slots per hour; table rows are *half hours*
  const HOURS_START = 0;             // inclusive
  const HOURS_END = 24;              // exclusive
  const SLOT_SEC = 30 * 60;          // seconds per slot (half-hour)

  const DEFAULT_SETTINGS = {
    timezone: 'auto',
    clock: '24',                     // 24 | 12
    weekStart: 'sun',                // sun | mon
    defaultZoom: 1.0,
    heatmap: 'viridis',
  };

  // ----------------------
  // State
  // ----------------------
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = (settings.clock === '12');
  let weekOffset = 0;
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  let zoomFactor = 1.0;
  let heatmapName = settings.heatmap || 'viridis';

  // members
  let members = [];            // list of usernames selected
  let allKnownMembers = [];    // from the server
  let currentUser = null;

  // DOM refs (lazy-initialized on init)
  let table, grid, gridContent, nowMarker, controlsEl, rightColEl;
  let memberList, memberError, addUsernameInput, addUserBtn, addMeBtn, results, resultsPanel;
  let sortSelect, maxMissingInput, minHoursInput;

  // tooltip
  let tooltipEl;

  // ----------------------
  // Utilities
  // ----------------------
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function resolveTimezone(val) {
    if (!val || val === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return val;
  }

  function tzParts(dt, zone) {
    return new Intl.DateTimeFormat('en-GB', {
      timeZone: zone,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit',
      hour12: false
    }).formatToParts(dt).reduce((a, p) => (a[p.type] = p.value, a), {});
  }

  function tzOffsetMinutes(zone, date) {
    const p = tzParts(date, zone);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function epochFromZoned(y, m, d, hh, mm, zone) {
    // DST robust: iterate to stable offset
    const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(zone, new Date(guess));
    let ts = guess - off * 60000;
    off = tzOffsetMinutes(zone, new Date(ts));
    ts = guess - off * 60000;
    return Math.floor(ts / 1000);
  }

  function startOfThisWeek(epoch, zone, weekStart) {
    const d = new Date(epoch * 1000);
    const wd = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday: 'short' }).format(d);
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    const delta = (weekStart === 1) ? (idx + 6) % 7 : (idx + 7) % 7;
    const p = tzParts(d, zone);
    return epochFromZoned(+p.year, +p.month, +p.day - delta, 0, 0, zone);
  }

  function formatHourLabel(hour) {
    if (!hour12) return `${String(hour).padStart(2, '0')}:00`;
    const h = (hour % 12) || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h} ${ampm}`;
  }

  // ----------------------
  // Color maps and blending
  // ----------------------
  const COLORMAPS = {
    viridis:    [[0, '#440154'], [0.25, '#3b528b'], [0.5, '#21918c'], [0.75, '#5ec962'], [1, '#fde725']],
    plasma:     [[0, '#0d0887'], [0.25, '#6a00a8'], [0.5, '#b12a90'], [0.75, '#e16462'], [1, '#fca636']],
    cividis:    [[0, '#00204c'], [0.25, '#2c3e70'], [0.5, '#606c7c'], [0.75, '#9da472'], [1, '#f9e721']],
    twilight:   [[0, '#1e1745'], [0.25, '#373a97'], [0.5, '#73518c'], [0.75, '#b06b6d'], [1, '#d3c6b9']],
    lava:       [[0, '#000004'], [0.2, '#320a5a'], [0.4, '#781c6d'], [0.6, '#bb3654'], [0.8, '#ed6925'], [1, '#fcffa4']]
  };

  function hexToRgb(h){ const x = parseInt(h.slice(1), 16); return [x>>16&255, x>>8&255, x&255]; }
  function rgbToCss([r,g,b]){ return `rgb(${r}, ${g}, ${b})`; }

  function interpStops(stops, t) {
    let a = stops[0][0], ca = hexToRgb(stops[0][1]);
    for (let i = 1; i < stops.length; i++) {
      const b = stops[i][0], cb = hexToRgb(stops[i][1]);
      if (t <= b) {
        const u = (t - a) / (b - a);
        return [Math.round(ca[0] + (cb[0]-ca[0])*u), Math.round(ca[1] + (cb[1]-ca[1])*u), Math.round(ca[2] + (cb[2]-ca[2])*u)];
      }
      a = b; ca = cb;
    }
    return hexToRgb(stops[stops.length - 1][1]);
  }

  function colormapColor(t) {
    const stops = COLORMAPS[heatmapName] || COLORMAPS.viridis;
    const rgb = interpStops(stops, t);
    return rgbToCss(rgb);
  }

  // ----------------------
  // Table construction
  // ----------------------
  function buildTable() {
    // Build *exact* original table: 7 day columns, rows are half-hours (2 per hour). First column is sticky "Time".
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const th0 = document.createElement('th');
    th0.textContent = 'Time';
    trh.appendChild(th0);

    const days = (weekStartIdx === 1) ? ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'] : ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    for (const d of days) {
      const th = document.createElement('th');
      th.textContent = d;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let h = HOURS_START; h < HOURS_END; h++) {
      // render two rows per hour (half-hours)
      for (let half = 0; half < SLOTS_PER_HOUR; half++) {
        const tr = document.createElement('tr');

        const th = document.createElement('th');
        th.textContent = (half === 0) ? formatHourLabel(h) : '';
        tr.appendChild(th);

        for (let day = 0; day < 7; day++) {
          const td = document.createElement('td');
          td.setAttribute('data-day', String(day));
          td.setAttribute('data-slot', String(h * SLOTS_PER_HOUR + half)); // 0..47 within day
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
  }

  // ----------------------
  // Heatmap painting / server
  // ----------------------
  async function fetchMembers() {
    try {
      const r = await fetch('/groups/members', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>[]);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }

  async function fetchWeekHeatmap(startEpoch, endEpoch) {
    try {
      const r = await fetch('/groups/heatmap', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        cache: 'no-store',
        body: JSON.stringify({ start: startEpoch, end: endEpoch })
      });
      if (!r.ok) return null;
      const j = await r.json().catch(()=>null);
      return (j && (j.values || j));
    } catch { return null; }
  }

  function paintHeatmap(values) {
    if (!Array.isArray(values) || values.length !== 7) return;
    const max = Math.max(1, ...values.flat());
    table.querySelectorAll('td').forEach(td => {
      const day = Number(td.getAttribute('data-day'));
      const slot = Number(td.getAttribute('data-slot'));
      const v = values[day]?.[slot] ?? 0;
      if (v <= 0) {
        td.style.background = '';
      } else {
        const t = Math.max(0, Math.min(1, v / max));
        td.style.background = colormapColor(t);
      }
    });
  }

  // ----------------------
  // NOW marker (positioned inside scroll area)
  // ----------------------
  function updateNowMarker() {
    const startEpoch = getWeekStartEpoch();
    const now = Math.floor(Date.now() / 1000);
    if (now < startEpoch || now > startEpoch + 7 * 86400) { nowMarker.style.display = 'none'; return; }

    const rel = now - startEpoch;
    const day = Math.floor(rel / 86400);
    const secOfDay = rel % 86400;
    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const rowPx = (secOfDay / 3600) * rowHeight;

    nowMarker.style.setProperty('--col', String(day));
    nowMarker.style.setProperty('--rowpx', `${rowPx}px`);
    nowMarker.style.display = 'block';
  }

  function installNowTick() {
    updateNowMarker();
    setInterval(updateNowMarker, 30 * 1000);
  }

  // ----------------------
  // Zoom
  // ----------------------
  function applyZoom() {
    const baseRow = 18;
    const px = clamp(Math.round(baseRow * zoomFactor), 12, 42);
    document.documentElement.style.setProperty('--row-height', `${px}px`);
    updateNowMarker();
  }

  function installZoomHandlers() {
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;   // normal scroll is pan
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * 0.05, 0.7, 1.6);
      applyZoom();
    }, { passive: false });
  }

  // ----------------------
  // Filters & results (placeholder: preserved structure, minimal logic)
  // ----------------------
  function updateLegendBlocks() {
    const blocks = document.getElementById('legend-blocks');
    if (!blocks) return;
    blocks.innerHTML = '';
    for (let i = 0; i <= 9; i++) {
      const b = document.createElement('div');
      b.className = 'block';
      b.style.background = colormapColor(i / 9);
      blocks.appendChild(b);
    }
    const labels = document.getElementById('legend-labels');
    const steps = document.getElementById('legend-steps');
    if (labels && steps) {
      labels.innerHTML = '';
      steps.innerHTML = '';
      for (let i = 0; i < 24; i += 2) {
        const span = document.createElement('span');
        span.textContent = formatHourLabel(i);
        labels.appendChild(span);
      }
      for (let i = 0; i <= 10; i++) {
        const step = document.createElement('div');
        step.className = 'legend-step';
        step.style.setProperty('--p', String(i / 10));
        steps.appendChild(step);
      }
    }
  }

  // ----------------------
  // Members UI (preserved behavior)
  // ----------------------
  function renderMembers() {
    memberList.innerHTML = '';
    for (const name of members) {
      const li = document.createElement('li');
      li.textContent = name;
      memberList.appendChild(li);
    }
  }

  function addMember(name) {
    name = (name || '').trim();
    if (!name) return;
    if (members.includes(name)) {
      memberError.textContent = 'Already added.';
      return;
    }
    members.push(name);
    memberError.textContent = '';
    addUsernameInput.value = '';
    renderMembers();
    // would re-fetch and repaint heatmap after changing cohort
  }

  // ----------------------
  // Week calculations
  // ----------------------
  function getWeekStartEpoch() {
    const now = Math.floor(Date.now() / 1000);
    return startOfThisWeek(now, tz, weekStartIdx) + weekOffset * 7 * 86400;
  }

  async function renderWeek() {
    buildTable();
    const start = getWeekStartEpoch();
    const end = start + 7 * 86400;

    try {
      const values = await fetchWeekHeatmap(start, end);
      if (values) paintHeatmap(values);
    } catch {}

    updateNowMarker();
  }

  // ----------------------
  // Init
  // ----------------------
  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    nowMarker = document.getElementById('now-marker');
    controlsEl = document.getElementById('controls');
    rightColEl = document.getElementById('right-col');
    memberList = document.getElementById('member-list');
    memberError = document.getElementById('member-error');
    addUsernameInput = document.getElementById('add-username');
    addUserBtn = document.getElementById('add-user-btn');
    addMeBtn = document.getElementById('add-me-btn');
    results = document.getElementById('results');
    resultsPanel = document.getElementById('results-panel');
    sortSelect = document.getElementById('sort-method');
    maxMissingInput = document.getElementById('max-missing');
    minHoursInput = document.getElementById('min-hours');
    tooltipEl = document.getElementById('cell-tooltip');

    // settings (merge local + remote)
    try {
      const localRaw = localStorage.getItem('nat20_settings');
      if (localRaw) settings = { ...settings, ...JSON.parse(localRaw) };
    } catch {}
    try {
      const r = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
      if (r.ok) settings = { ...settings, ...(await r.json().catch(()=>({}))) };
    } catch {}

    tz = resolveTimezone(settings.timezone);
    hour12 = (settings.clock === '12');
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    zoomFactor = Number(settings.defaultZoom || 1.0);
    heatmapName = settings.heatmap || 'viridis';

    applyZoom();
    installZoomHandlers();

    updateLegendBlocks();

    // buttons
    document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset--; renderWeek(); });
    document.getElementById('next-week')?.addEventListener('click', () => { weekOffset++; renderWeek(); });

    addUserBtn?.addEventListener('click', () => addMember(addUsernameInput.value));
    addMeBtn?.addEventListener('click', () => addMember(currentUser || 'me'));

    await renderWeek();
    installNowTick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
