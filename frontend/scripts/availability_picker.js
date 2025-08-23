(function () {
  // STRUCTURE: 48 ROWS (HALF-HOUR), 7 COLUMNS (DAYS) — matches original table behavior.

  const SLOTS_PER_HOUR = 2;          // half-hours
  const HOURS = 24;
  const SLOT_SEC = 30 * 60;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0 };
  let settings = { ...DEFAULT_SETTINGS };

  let tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  let hour12 = false;
  let weekStartIdx = 0;

  let zoomFactor = 1.0;
  let weekOffset = 0;
  let isAuthenticated = false;

  let table, grid, gridContent, nowMarker;

  // ---------- utils ----------
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

  // ---------- table ----------
  function buildTable() {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    const th0 = document.createElement('th');
    th0.textContent = 'Time';
    trh.appendChild(th0);

    const days = weekStartIdx === 1
      ? ['Mon','Tue','Wed','Thu','Fri','Sat','Sun']
      : ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];

    for (const d of days) { const th = document.createElement('th'); th.textContent = d; trh.appendChild(th); }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    for (let h = 0; h < HOURS; h++) {
      for (let s = 0; s < SLOTS_PER_HOUR; s++) {
        const tr = document.createElement('tr');

        const th = document.createElement('th');
        th.textContent = (s === 0) ? fmtHour(h) : ''; // show label on hour rows only
        tr.appendChild(th);

        for (let day = 0; day < 7; day++) {
          const td = document.createElement('td');
          td.dataset.day = String(day);
          td.dataset.slot = String(h * SLOTS_PER_HOUR + s); // 0..47
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
    }

    table.appendChild(tbody);
  }

  // ---------- painting/select ----------
  function rangeToCells(range, startEpoch) {
    const start = Math.max(range.start, startEpoch);
    const end = Math.min(range.end, startEpoch + 7*86400);
    if (end <= start) return [];
    const out = [];
    for (let t = Math.floor(start / SLOT_SEC) * SLOT_SEC; t < end; t += SLOT_SEC) {
      const rel = t - startEpoch;
      const day = Math.floor(rel / 86400);
      const slot = Math.floor((rel % 86400) / SLOT_SEC);
      if (day >=0 && day < 7 && slot >= 0 && slot < 48) out.push({ day, slot });
    }
    return out;
  }
  function cellsToRanges(cells, startEpoch) {
    const perDay = new Map();
    for (const c of cells) { const k = String(c.day); if(!perDay.has(k)) perDay.set(k,new Set()); perDay.get(k).add(c.slot); }
    const res = [];
    for (let day = 0; day < 7; day++) {
      const set = perDay.get(String(day)); if (!set || set.size === 0) continue;
      const arr = Array.from(set).sort((a,b)=>a-b);
      let runStart = arr[0], prev = arr[0];
      for (let i = 1; i <= arr.length; i++) {
        const v = arr[i];
        if (v !== prev + 1) {
          const from = startEpoch + day*86400 + runStart*SLOT_SEC;
          const to   = startEpoch + day*86400 + (prev+1)*SLOT_SEC;
          res.push({ start: from, end: to });
          runStart = v;
        }
        prev = v;
      }
    }
    return res;
  }
  function clearMarks() { table.querySelectorAll('td').forEach(td => td.classList.remove('marked','selecting')); }
  function markCells(ranges, startEpoch) {
    for (const r of ranges) for (const c of rangeToCells(r, startEpoch)) {
      const td = table.querySelector(`td[data-day="${c.day}"][data-slot="${c.slot}"]`); if (td) td.classList.add('marked');
    }
  }

  let isDragging = false, dragA = null, dragB = null;
  function tdPos(td){ return { day:+td.dataset.day, slot:+td.dataset.slot }; }
  function updateSelecting() {
    table.querySelectorAll('td').forEach(td => td.classList.remove('selecting'));
    if (!dragA || !dragB) return;
    const a = tdPos(dragA), b = tdPos(dragB);
    const dayLo = Math.min(a.day,b.day), dayHi = Math.max(a.day,b.day);
    const slotLo = Math.min(a.slot,b.slot), slotHi = Math.max(a.slot,b.slot);
    for (let d = dayLo; d <= dayHi; d++) for (let s = slotLo; s <= slotHi; s++) {
      const td = table.querySelector(`td[data-day="${d}"][data-slot="${s}"]`); if (td) td.classList.add('selecting');
    }
  }
  function applySelecting(add=true) {
    const sel = table.querySelectorAll('td.selecting');
    sel.forEach(td => { td.classList.remove('selecting'); if (add) td.classList.add('marked'); else td.classList.remove('marked'); });
  }

  // ---------- now marker ----------
  function updateNowMarker() {
    if (!nowMarker) return;
    const start = getWeekStart();
    const now = Math.floor(Date.now()/1000);
    if (now < start || now >= start + 7*86400) { nowMarker.style.display = 'none'; return; }
    const rel = now - start;
    const minuteOfDay = Math.floor(rel % 86400 / 60);
    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const rowIndex = Math.floor(minuteOfDay / 30) + (minuteOfDay % 30) / 30; // half-hour rows -> multiply by row height
    nowMarker.style.setProperty('--rowpx', `${rowIndex * rowH}px`);
    nowMarker.style.display = 'block';
  }

  // ---------- zoom/pan ----------
  function applyZoom() {
    const base = 18;
    const px = clamp(base * zoomFactor, 12, 42);
    document.documentElement.style.setProperty('--row-height', `${px}px`);
    updateNowMarker();
  }

  function installHandlers() {
    // week nav
    document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset--; render(); });
    document.getElementById('next-week')?.addEventListener('click', () => { weekOffset++; render(); });

    // mouse paint
    gridContent.addEventListener('mousedown', (e) => {
      const td = e.target.closest('td'); if (!td) return;
      isDragging = true; dragA = dragB = td; updateSelecting(); e.preventDefault();
    });
    window.addEventListener('mousemove', (e) => { if (!isDragging) return; const td = e.target.closest && e.target.closest('td'); if (td) dragB = td; updateSelecting(); });
    window.addEventListener('mouseup', () => { if (!isDragging) return; isDragging = false; applySelecting(true); dragA = dragB = null; });

    // zoom (Shift+wheel)
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      zoomFactor = clamp(zoomFactor + (e.deltaY < 0 ? 0.05 : -0.05), 0.7, 1.6);
      applyZoom();
    }, { passive: false });
  }

  // ---------- data I/O (endpoints preserved) ----------
  async function fetchAvailability(start, end) {
    const r = await fetch(`/availability?start=${start}&end=${end}`, { credentials: 'include', cache: 'no-store' });
    if (!r.ok) return { ranges: [] };
    return r.json();
  }
  async function saveAvailability(ranges) {
    const r = await fetch('/availability/save', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ ranges }), credentials: 'include' });
    if (!r.ok) throw new Error('save failed');
    return r.json().catch(()=>({ok:true}));
  }

  async function render() {
    clearMarks();
    buildTable(); // rebuild to ensure exact structure
    const start = getWeekStart();
    const end = start + 7*86400;
    try {
      const data = await fetchAvailability(start, end);
      markCells(data.ranges || [], start);
    } catch {}
    updateNowMarker();
  }

  // ---------- boot ----------
  async function init() {
    table = document.getElementById('schedule-table');
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    nowMarker = document.getElementById('now-marker');

    // hydrate settings
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
    buildTable();
    installHandlers();
    render();
    setInterval(updateNowMarker, 30000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();
})();
