(function () {
  // STRUCTURE: 48 ROWS (HALF-HOUR), 7 COLUMNS (DAYS) — matches original table behavior.

  const COLS = 7;
  const SLOTS_PER_HOUR = 2;
  const HOURS = 24;
  const SLOT_SEC = 1800;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' };
  let settings = { ...DEFAULT_SETTINGS };

  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let hour12 = false;
  let weekStartIdx = 0;
  let zoomFactor = 1.0;
  let weekOffset = 0;

  let table, grid, gridContent, nowMarker;

  // --- utils ---
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function fmtHour(h) { if (!hour12) return `${String(h).padStart(2,'0')}:00`; const t=(h%12)||12; return `${t} ${h<12?'AM':'PM'}`; }

  function tzParts(dt, zone) {
    return new Intl.DateTimeFormat('en-GB', { timeZone: zone, year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false })
      .formatToParts(dt).reduce((a,p)=> (a[p.type]=p.value, a), {});
  }
  function tzOffsetMinutes(zone, date) {
    const p = tzParts(date, zone);
    const asUTC = Date.UTC(+p.year, +p.month-1, +p.day, +p.hour, +p.minute, +p.second);
    return Math.round((asUTC - date.getTime())/60000);
  }
  function epochFromZoned(y,m,d,hh,mm,zone) {
    const guess = Date.UTC(y, m-1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(zone, new Date(guess));
    let ts = guess - off*60000;
    off = tzOffsetMinutes(zone, new Date(ts));
    ts = guess - off*60000;
    return Math.floor(ts/1000);
  }
  function startOfWeek(epoch, zone, startIdx) {
    const d = new Date(epoch*1000);
    const wd = new Intl.DateTimeFormat('en-GB', { timeZone: zone, weekday:'short' }).format(d);
    const idx = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
    const delta = (startIdx === 1) ? (idx + 6) % 7 : (idx + 7) % 7;
    const p = tzParts(d, zone);
    return epochFromZoned(+p.year, +p.month, +p.day - delta, 0, 0, zone);
  }
  function getWeekStart() {
    const now = Math.floor(Date.now()/1000);
    return startOfWeek(now, tz, weekStartIdx) + weekOffset*7*86400;
  }
  function formatHour(h){ return fmtHour(h); }

  // --- table ---
  function buildTable() {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th'); th0.textContent = 'Time'; trh.appendChild(th0);

    const days = weekStartIdx === 1 ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'] : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
    for (const d of days) { const th = document.createElement('th'); th.textContent = d; trh.appendChild(th); }
    thead.appendChild(trh); table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let h = 0; h < HOURS; h++) {
      for (let s = 0; s < SLOTS_PER_HOUR; s++) {
        const tr = document.createElement('tr');

        const th = document.createElement('th');
        th.textContent = (s === 0) ? formatHour(h) : '';
        tr.appendChild(th);

        for (let day = 0; day < COLS; day++) {
          const td = document.createElement('td');
          td.dataset.day = String(day);
          td.dataset.slot = String(h * SLOTS_PER_HOUR + s);
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }
    table.appendChild(tbody);
  }

  // --- now marker ---
  function updateNowMarker() {
    if (!nowMarker) return;
    const start = getWeekStart();
    const now = Math.floor(Date.now()/1000);
    if (now < start || now >= start + 7*86400) { nowMarker.style.display = 'none'; return; }
    const rel = now - start;
    const minuteOfDay = Math.floor(rel % 86400 / 60);
    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const rowIndex = Math.floor(minuteOfDay / 30) + (minuteOfDay % 30) / 30;
    nowMarker.style.setProperty('--rowpx', `${rowIndex * rowH}px`);
    nowMarker.style.display = 'block';
  }

  // --- zoom ---
  function applyZoom() {
    const base = 18;
    const px = clamp(base * zoomFactor, 12, 42);
    document.documentElement.style.setProperty('--row-height', `${px}px`);
    updateNowMarker();
  }
  function installZoom() {
    if (!grid) return;
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      zoomFactor = clamp(zoomFactor + (e.deltaY < 0 ? 0.05 : -0.05), 0.7, 1.6);
      applyZoom();
    }, { passive: false });
  }

  // --- heatmap (placeholder, paints if server provides) ---
  function paintHeatmap(values) {
    if (!Array.isArray(values) || values.length !== 7) return;
    const max = Math.max(1, ...values.flat());
    table.querySelectorAll('td').forEach(td => {
      const day = +td.dataset.day, slot = +td.dataset.slot;
      const v = values[day]?.[slot] ?? 0;
      td.style.background = v > 0 ? `rgba(92, 186, 125, ${Math.min(1, 0.15 + 0.85 * (v / max))})` : '';
    });
  }
  async function fetchHeatmap(start, end) {
    try {
      const r = await fetch('/groups/heatmap', { method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body: JSON.stringify({ start, end }) });
      if (!r.ok) return null;
      const j = await r.json().catch(()=>null);
      return j && (j.values || j);
    } catch { return null; }
  }

  async function render() {
    buildTable();
    const start = getWeekStart();
    const end = start + 7*86400;
    try {
      const values = await fetchHeatmap(start, end);
      if (values) paintHeatmap(values);
    } catch {}
    updateNowMarker();
  }

  // --- boot ---
  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    nowMarker = document.getElementById('now-marker');

    // settings
    try {
      const local = JSON.parse(localStorage.getItem('nat20_settings') || '{}');
      settings = { ...settings, ...local };
      const r = await fetch('/settings', { credentials:'include', cache:'no-store' });
      if (r.ok) Object.assign(settings, await r.json().catch(()=>({})));
    } catch {}
    tz = (settings.timezone && settings.timezone !== 'auto') ? settings.timezone : (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC');
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    zoomFactor = Number(settings.defaultZoom || 1.0);

    applyZoom();
    installZoom();

    document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset--; render(); });
    document.getElementById('next-week')?.addEventListener('click', () => { weekOffset++; render(); });

    render();
    setInterval(updateNowMarker, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
