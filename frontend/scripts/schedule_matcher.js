(function () {
  'use strict';

  // --- Constants ---
  const COLS = 7;
  const SLOTS_PER_HOUR = 2; // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 1800; // 30 minutes
  const ZOOM_STEP = 0.05;
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.6;

  // --- State ---
  let zoomFactor = 1.0;
  let heatmapName = 'viridis';
  let isAuthenticated = false;
  let currentUsername = null;
  let weekOffset = 0;

  // Settings
  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' };
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  // DOM refs
  let table, grid, resultsEl, resultsPanelEl, nowMarkerEl, rightColEl, controlsEl;

  // Data
  let members = [];             // all known members
  let selectedMembers = [];     // shown in legend/results
  let userSlotSets = new Map(); // username -> Set(slot_index)
  let totalMembers = 0;

  // --- Utilities ---
  function resolveTimezone(val) {
    if (!val || val === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return val;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // --- Date helpers (DST safe) ---
  function tzParts(dt) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false }).formatToParts(dt).reduce((a,p)=> (a[p.type]=p.value, a), {});
  }
  function tzOffsetMinutes(date) {
    const p = tzParts(date);
    const asUTC = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime())/60000);
  }
  function epochFromZoned(y,m,d,hh,mm) {
    const guess = Date.UTC(y, m-1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(new Date(guess));
    let ts = guess - off*60000;
    off = tzOffsetMinutes(new Date(ts));
    ts = guess - off*60000;
    return Math.floor(ts/1000);
  }
  function startOfThisWeek(epoch) {
    const d = new Date(epoch*1000);
    const wd = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(d);
    const idx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
    const delta = (weekStartIdx === 1) ? (idx + 6) % 7 : (idx + 7) % 7; // mon or sun
    const p = tzParts(d);
    return epochFromZoned(+p.year, +p.month, +p.day - delta, 0, 0);
  }
  function getWeekStartEpochAndYMD() {
    const now = Math.floor(Date.now()/1000);
    const base = startOfThisWeek(now) + weekOffset*7*86400;
    const d = new Date(base*1000);
    const p = tzParts(d);
    return { baseEpoch: base, y: +p.year, m: +p.month, d: +p.day };
  }
  function formatHourLabel(h) {
    if (hour12) { const hh = (h%12)||12; return `${hh} ${h<12?'AM':'PM'}`; }
    return `${String(h).padStart(2,'0')}:00`;
  }

  // --- Color maps and blending ---
  const COLORMAPS = {
    viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
    plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
    cividis:    [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
    twilight:   [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
    lava:       [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
  };
  function hexToRgb(h){ const x=parseInt(h.slice(1),16); return [x>>16&255,x>>8&255,x&255]; }
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
  function mix(a,b,u){ return [Math.round(a[0]+(b[0]-a[0])*u), Math.round(a[1]+(b[1]-a[1])*u), Math.round(a[2]+(b[2]-a[2])*u)]; }
  function withAlpha([r,g,b], a) { return `rgba(${r}, ${g}, ${b}, ${a})`; }

  // Low-count compression for nicer gradient
  function colorForCount(count, maxCount) {
    if (maxCount <= 0) return 'transparent';
    const t0 = count / maxCount;
    const t = Math.max(0, Math.min(1, t0));
    const g = heatmapName === 'twilight' ? t : Math.pow(t, 0.85);
    return colormapColor(g);
  }

  // --- Build table ---
  function buildTable() {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const days = (weekStartIdx === 1)
      ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (const d of days) {
      const th = document.createElement('th');
      th.textContent = d;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let h = HOURS_START; h < HOURS_END; h++) {
      const tr = document.createElement('tr');
      const th = document.createElement('th');
      th.textContent = formatHourLabel(h);
      tr.appendChild(th);

      for (let day = 0; day < COLS; day++) {
        for (let s = 0; s < SLOTS_PER_HOUR; s++) {
          const td = document.createElement('td');
          td.dataset.day = String(day);
          td.dataset.slot = String(h * SLOTS_PER_HOUR + s);
          tr.appendChild(td);
        }
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
  }

  // --- Painting / data merging ---
  function clearCells() {
    table.querySelectorAll('td').forEach(td => { td.style.background = ''; td.style.opacity = ''; });
  }

  function getWeekSlotsRange() {
    const { baseEpoch } = getWeekStartEpochAndYMD();
    return { baseEpoch, endEpoch: baseEpoch + 7 * 86400 };
  }

  function paintCounts() {
    const { baseEpoch, endEpoch } = getWeekSlotsRange();

    clearCells();

    // create a 7 x (24*2) matrix of counts
    const counts = Array.from({ length: 7 }, () => Array(48).fill(0));

    for (const [uname, set] of userSlotSets.entries()) {
      for (const ts of set) {
        if (ts < baseEpoch || ts >= endEpoch) continue;
        const rel = ts - baseEpoch;
        const day = Math.floor(rel / 86400);
        const slot = Math.floor((rel % 86400) / SLOT_SEC);
        if (day >= 0 && day < 7 && slot >= 0 && slot < 48) counts[day][slot]++;
      }
    }

    const maxCount = Math.max(1, ...counts.flat());

    for (let day = 0; day < 7; day++) {
      for (let slot = 0; slot < 48; slot++) {
        const td = table.querySelector(`td[data-day="${day}"][data-slot="${slot}"]`);
        if (!td) continue;
        const c = counts[day][slot];
        if (c > 0) td.style.background = colorForCount(c, maxCount);
      }
    }
  }

  function shadePast() {
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const nowIdx = nowGlobalIndex();
    if (weekOffset !== 0) return;

    for (let i = 0; i < nowIdx; i++) {
      const day = Math.floor(i / 48);
      const slot = i % 48;
      const td = table.querySelector(`td[data-day="${day}"][data-slot="${slot}"]`);
      if (td) td.style.opacity = '0.45';
    }
  }

  // --- Legend ---
  function updateLegend() {
    const legend = document.getElementById('legend-blocks');
    if (!legend) return;
    legend.innerHTML = '';
    for (let i = 0; i <= 9; i++) {
      const b = document.createElement('div');
      b.className = 'block';
      b.style.background = colorForCount(i, 9);
      legend.appendChild(b);
    }
  }

  // --- Filters / results (placeholder) ---
  function applyFilterDimming() {
    // Placeholder to visually dim cells if filters exclude them (no-op for now)
  }

  function findCandidates() {
    // Placeholder: compute best slots based on counts (no-op minimal)
    const items = [];
    resultsEl.innerHTML = '';
    if (!items.length) {
      const div = document.createElement('div');
      div.className = 'result';
      div.textContent = 'No results';
      resultsEl.appendChild(div);
    }
  }

  function syncResultsHeight() {
    if (!resultsPanelEl) return;
    const rect = grid.getBoundingClientRect();
    const pStyle = getComputedStyle(resultsPanelEl);
    const pTop = parseFloat(pStyle.paddingTop) || 0;
    const pBottom = parseFloat(pStyle.paddingBottom) || 0;
    const available = rect.height;
    const titleH = resultsPanelEl.querySelector('h3').offsetHeight;

    resultsPanelEl.style.height = available + 'px';
    const inner = Math.max(60, available - (pTop + pBottom + titleH) - 6);
    resultsEl.style.height = inner + 'px';
  }

  // --- Right column vertical alignment with grid top ---
  function syncRightColOffset() {
    if (!rightColEl || !controlsEl) return;
    const styles = getComputedStyle(controlsEl);
    const mTop = parseFloat(styles.marginTop) || 0;
    const mBottom = parseFloat(styles.marginBottom) || 0;
    const offset = controlsEl.offsetHeight + mTop + mBottom;
    rightColEl.style.marginTop = offset + 'px';
  }

  // --- NOW marker positioning ---
  function nowGlobalIndex() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const idx = Math.ceil((nowSec - baseEpoch) / SLOT_SEC);
    return Math.max(0, idx);
  }

  let theadTopCache = 0;
  function positionNowMarker() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const endSec = baseEpoch + 7 * 86400;

    if (nowSec < baseEpoch || nowSec > endSec) { nowMarkerEl.style.display = 'none'; return; }

    const rel = nowSec - baseEpoch;
    const day = Math.floor(rel / 86400);
    const secOfDay = rel % 86400;
    const hourFrac = secOfDay / 3600;

    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const rowPx = hourFrac * rowHeight;

    nowMarkerEl.style.setProperty('--rowpx', `${rowPx}px`);
    nowMarkerEl.style.setProperty('--col', String(day));
    nowMarkerEl.style.display = 'block';

    // keep label visible near center
    const thead = table.tHead;
    if (thead) theadTopCache = thead.getBoundingClientRect().top;
    const viewH = window.innerHeight || document.documentElement.clientHeight;
    const markerY = (theadTopCache || 0) + rowPx;
    const clampedY = Math.min(Math.max(markerY, 80), viewH - 26);
    nowMarkerEl.querySelector('.bubble').style.top = (clampedY - (theadTopCache || 0) - 10) + 'px';
  }

  function installNowTick() {
    positionNowMarker();
    setInterval(positionNowMarker, 30000);
  }

  // --- Zoom ---
  function applyZoomStyles() {
    const base = 18; // px at zoom 1.0
    const px = clamp(Math.round(base * zoomFactor), 10, 42);
    document.documentElement.style.setProperty('--row-height', px + 'px');
    positionNowMarker();
    syncResultsHeight();
  }

  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');
    if (!grid) return; // grid not present on this page
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // normal scroll
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });
  }

  function initialZoomToFit24h() {
    const base = 18; // px at zoom 1.0
    const contentEl = document.getElementById('grid-content');
    if (!contentEl) return;
    const usable = contentEl.clientHeight - 60;
    const needed = 24 * base * SLOTS_PER_HOUR;
    const z = clamp(usable / needed, ZOOM_MIN, ZOOM_MAX);
    zoomFactor = z;
    applyZoomStyles();
  }

  // --- Fetching / server calls (placeholder) ---
  async function fetchMembers() {
    try {
      const r = await fetch('/groups/members', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>[]);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  async function fetchUserAvailability(u, start, end) {
    try {
      const r = await fetch(`/availability?user=${encodeURIComponent(u)}&start=${start}&end=${end}`, { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>({ranges:[]}));
      return j.ranges || [];
    } catch { return []; }
  }

  // Merge availability into sets
  function rangesToSlots(ranges, baseEpoch, endEpoch) {
    const set = new Set();
    for (const iv of ranges) {
      const from = Math.max(iv.start ?? iv.from, baseEpoch);
      const to = Math.min(iv.end ?? iv.to, endEpoch);
      let t = Math.ceil(from / SLOT_SEC) * SLOT_SEC;
      for (; t < to; t += SLOT_SEC) set.add(t);
    }
    return set;
  }

  async function fetchMembersAvail() {
    const { baseEpoch, y, m, d } = getWeekStartEpochAndYMD();
    const endEpoch = baseEpoch + 7 * 86400;

    userSlotSets.clear();

    // default members from server
    try {
      members = await fetchMembers();
    } catch { members = []; }

    // include current user if logged in
    if (isAuthenticated && currentUsername && !members.includes(currentUsername)) members.push(currentUsername);

    // selectedMembers mirror for now
    selectedMembers = members.slice();

    // fetch each user's availability
    for (const uname of members) {
      const ranges = await fetchUserAvailability(uname, baseEpoch, endEpoch);
      const set = rangesToSlots(ranges, baseEpoch, endEpoch);
      userSlotSets.set(uname, set);
    }
    totalMembers = members.length;

    paintCounts();
    shadePast();
    applyFilterDimming();
    updateLegend();
    syncResultsHeight();
    positionNowMarker();
  }

  // --- Auth integration ---
  function setAuth(authenticated, username) {
    isAuthenticated = !!authenticated;
    currentUsername = authenticated ? username : null;
  }
  if (window.addEventListener) {
    window.addEventListener('auth:changed', (e) => {
      const det = (e && e.detail) || {};
      setAuth(!!det.isAuthenticated, det.username || null);
    });
  }

  // --- UI wiring / init ---
  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    resultsEl = document.getElementById('results');
    resultsPanelEl = document.getElementById('results-panel');
    nowMarkerEl = document.getElementById('now-marker');
    rightColEl = document.getElementById('right-col');
    controlsEl = document.getElementById('controls');

    // read local settings
    try {
      const localRaw = localStorage.getItem('nat20_settings');
      if (localRaw) {
        const local = JSON.parse(localRaw);
        settings = { ...DEFAULT_SETTINGS, ...local };
      }
    } catch {}
    try {
      const r = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
      if (r.ok) {
        const remote = await r.json().catch(()=> ({}));
        settings = { ...settings, ...remote };
      }
    } catch {}

    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    heatmapName = settings.heatmap || 'viridis';
    zoomFactor = Number(settings.defaultZoom || 1.0);
    applyZoomStyles();

    document.getElementById('prev-week').addEventListener('click', async () => {
      weekOffset--; buildTable(); await fetchMembersAvail();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      weekOffset++; buildTable(); await fetchMembersAvail();
    });

    setupZoomHandlers();
    initialZoomToFit24h();

    buildTable();
    await fetchMembersAvail();

    installNowTick();
    window.addEventListener('resize', () => { syncResultsHeight(); positionNowMarker(); syncRightColOffset(); });
    syncRightColOffset();
  }

  // expose for shell.js if needed
  window.scheduler = { setAuth };

  // start
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
