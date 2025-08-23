(function () {
  'use strict';

  const COLS = 7;
  const SLOTS_PER_HOUR = 2;
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 1800;

  const ZOOM_STEP = 0.05;
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.6;

  let zoomFactor = 1.0;
  let heatmapName = 'viridis';
  let isAuthenticated = false;
  let currentUsername = null;
  let weekOffset = 0;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' };
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  let table, grid, gridContent, resultsEl, resultsPanelEl, nowMarkerEl, controlsEl;

  const COLORMAPS = {
    viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
    plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
    cividis:    [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
    twilight:   [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']]
  };

  function resolveTimezone(val) {
    if (!val || val === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return val;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
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
    const delta = (weekStartIdx === 1) ? (idx + 6) % 7 : (idx + 7) % 7;
    const p = tzParts(d);
    return epochFromZoned(+p.year, +p.month, +p.day - delta, 0, 0);
  }
  function getWeekStartEpoch() {
    const now = Math.floor(Date.now()/1000);
    return startOfThisWeek(now) + weekOffset*7*86400;
  }
  function formatHourLabel(h) {
    if (hour12) { const hh = (h%12)||12; return `${hh} ${h<12?'AM':'PM'}`; }
    return `${String(h).padStart(2,'0')}:00`;
  }

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

  function applyZoomStyles() {
    const base = 18;
    const px = clamp(Math.round(base * zoomFactor), 10, 42);
    document.documentElement.style.setProperty('--row-height', px + 'px');
    positionNowMarker();
  }

  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');
    if (!grid) return;
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });
  }

  function positionNowMarker() {
    if (!nowMarkerEl) return;
    const nowSec = Math.floor(Date.now() / 1000);
    const baseEpoch = getWeekStartEpoch();
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
  }

  function installNowTick() {
    positionNowMarker();
    setInterval(positionNowMarker, 30000);
  }

  function paintHeatmap(values) {
    if (!Array.isArray(values) || values.length !== 7) return;
    const max = Math.max(1, ...values.flat());
    table.querySelectorAll('td').forEach(td => {
      const day = Number(td.dataset.day);
      const slot = Number(td.dataset.slot);
      const v = values[day]?.[slot] ?? 0;
      const norm = v / max;
      td.style.background = v > 0 ? colormapColor(norm) : '';
    });
  }

  async function fetchMembers() {
    try {
      const r = await fetch('/groups/members', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return [];
      const j = await r.json().catch(()=>[]);
      return Array.isArray(j) ? j : [];
    } catch { return []; }
  }
  async function fetchHeatmap(startEpoch, endEpoch) {
    try {
      const r = await fetch('/groups/heatmap', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        credentials: 'include', cache: 'no-store',
        body: JSON.stringify({ start: startEpoch, end: endEpoch })
      });
      if (!r.ok) return null;
      const j = await r.json().catch(()=>null);
      return j && (j.values || j);
    } catch { return null; }
  }

  async function renderWeek() {
    const startEpoch = getWeekStartEpoch();
    const heat = await fetchHeatmap(startEpoch, startEpoch + 7*86400);
    if (heat) paintHeatmap(heat);
    positionNowMarker();
  }

  function setAuth(authenticated, username) {
    isAuthenticated = !!authenticated;
    currentUsername = authenticated ? username : null;
  }
  window.scheduler = { setAuth };

  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    nowMarkerEl = document.getElementById('now-marker');
    resultsEl = document.getElementById('results');
    resultsPanelEl = document.getElementById('results-panel');
    controlsEl = document.getElementById('controls');

    try {
      const localRaw = localStorage.getItem('nat20_settings');
      if (localRaw) settings = { ...settings, ...JSON.parse(localRaw) };
      const r = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
      if (r.ok) settings = { ...settings, ...(await r.json().catch(()=>({}))) };
    } catch {}
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    heatmapName = settings.heatmap || 'viridis';
    zoomFactor = Number(settings.defaultZoom || 1.0);
    applyZoomStyles();

    document.getElementById('prev-week').addEventListener('click', async () => { weekOffset--; buildTable(); await renderWeek(); });
    document.getElementById('next-week').addEventListener('click', async () => { weekOffset++; buildTable(); await renderWeek(); });

    setupZoomHandlers();

    buildTable();
    await renderWeek();
    installNowTick();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
