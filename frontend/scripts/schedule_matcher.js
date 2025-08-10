(function () {
  'use strict';

  // --- Constants ---
  const BASE_URL = 'http://backend.nat20scheduling.com:3000';
  const SLOTS_PER_HOUR = 2;        // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 1800;           // 30m in seconds

  // --- State ---
  let weekOffset = 0;              // 0 = current week
  let isAuthenticated = false;
  let currentUsername = null;

  // settings
  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0 };
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  // vertical zoom only
  let zoomFactor = 1.0;
  const ZOOM_MIN = 0.6, ZOOM_MAX = 2.0, ZOOM_STEP = 0.1;

  // members & availability
  let members = [];                // array of usernames (strings)
  const userSlotSets = new Map();  // username -> Set(epoch seconds)
  let totalMembers = 0;

  // cached elements
  let table;
  let grid;
  let resultsEl;
  let resultsPanelEl;
  let nowMarkerEl;

  // derived week arrays (rebuilt after paintCounts)
  let ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
  let WEEK_ROWS = 7 * ROWS_PER_DAY;
  let counts = [];                 // length WEEK_ROWS, number available at slot
  let sets = [];                   // length WEEK_ROWS, Set of users available at slot

  // --- Utils ---
  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function loadLocalSettings() {
    try {
      const raw = localStorage.getItem('nat20_settings');
      if (!raw) return null;
      return JSON.parse(raw);
    } catch { return null; }
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
    return Math.floor(ts / 1000); // seconds
  }

  function getYMDInTZ(date, tzName) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
  }
  function getTodayYMDInTZ(tzName) { return getYMDInTZ(new Date(), tzName); }

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
    const today = getTodayYMDInTZ(tz);
    const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, tz);
    const todayIdx = weekdayIndexInTZ(todayMid, tz);
    const diff = (todayIdx - weekStartIdx + 7) % 7;
    const baseYMD = ymdAddDays(today, -diff + weekOffset * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  }

  function fmtTime(h, m) {
    if (hour12) {
      const ampm = h >= 12 ? 'pm' : 'am';
      let hr = h % 12; if (hr === 0) hr = 12;
      const mm = String(m).padStart(2, '0');
      return `${hr}:${mm} ${ampm}`;
    }
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
  }

  function fmtRangeSec(startSec, endSec) {
    const a = new Date(startSec * 1000);
    const b = new Date(endSec * 1000);
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][a.getUTCDay()];
    const sh = a.getUTCHours(); const sm = a.getUTCMinutes();
    const eh = b.getUTCHours(); const em = b.getUTCMinutes();
    return `${dow}, ${fmtTime(sh, sm)} – ${fmtTime(eh, em)}`;
  }

  function rowHeightPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
    return parseFloat(v.replace('px',''));
  }

  function gToDayRow(g) {
    const day = Math.floor(g / ROWS_PER_DAY);
    const row = g % ROWS_PER_DAY;
    return { day, row };
  }

  // --- Build table ---
  function buildTable() {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    thTime.className = 'time-col';
    trh.appendChild(thTime);

    const { baseEpoch } = getWeekStartEpochAndYMD();
    for (let i = 0; i < 7; i++) {
      const d = new Date((baseEpoch + i * 86400) * 1000);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', day: '2-digit', month: 'short'
      }).format(d);
      const th = document.createElement('th');
      th.textContent = label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalRows = ROWS_PER_DAY;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');

      // hour label cell spans two rows (both half-hours)
      if (r % 2 === 0) {
        const minutes = (HOURS_START * 60) + r * (60 / SLOTS_PER_HOUR);
        const hh = Math.floor(minutes / 60);
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.rowSpan = 2;
        th.textContent = fmtTime(hh, 0);
        tr.appendChild(th);
      }

      for (let day = 0; day < 7; day++) {
        const td = document.createElement('td');
        td.className = 'slot-cell';
        const epoch = (getDayStartSec(day) + r * SLOT_SEC);
        td.dataset.epoch = String(epoch);
        td.dataset.day = String(day);
        td.dataset.row = String(r);
        td.dataset.c = '0';
        td.addEventListener('mousemove', onCellHoverMove);
        td.addEventListener('mouseleave', hideTooltip);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    applyZoomStyles();
    paintCounts();
    shadePast();
    positionNowMarker();
    syncResultsHeight();
  }

  function getDayStartSec(dayIndex) {
    const { baseEpoch } = getWeekStartEpochAndYMD();
    return baseEpoch + dayIndex * 86400;
  }

  // --- Availability fetch (from/to in SECONDS, names in `usernames`) ---
  async function fetchMembersAvail() {
    if (!members.length) {
      userSlotSets.clear();
      totalMembers = 0;
      paintCounts();
      applyFilterDimming();
      updateLegend();
      return;
    }
    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const payload = { from: baseEpoch, to: endEpoch, usernames: members };
    const tryPaths = [
      `${BASE_URL}/availability/get_many`,
      `${BASE_URL}/availability/availability/get_many`
    ];

    let data = { intervals: {} };
    for (const url of tryPaths) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        if (res.status === 404) { continue; }
        if (!res.ok) { continue; }
        data = await res.json();
        break;
      } catch {}
    }

    userSlotSets.clear();
    for (const uname of members) {
      const intervals = (data.intervals && data.intervals[uname]) || [];
      const set = new Set();
      for (const iv of intervals) {
        const from = Math.max(iv.from, baseEpoch);
        const to = Math.min(iv.to, endEpoch);
        let t = Math.ceil(from / SLOT_SEC) * SLOT_SEC;
        for (; t < to; t += SLOT_SEC) set.add(t);
      }
      userSlotSets.set(uname, set);
    }
    totalMembers = members.length;

    paintCounts();
    applyFilterDimming();
    updateLegend();
  }

  // --- Paint counts into cells (0..7+) and build week arrays ---
  function slotCount(epoch) {
    let count = 0;
    for (const u of members) {
      const set = userSlotSets.get(u);
      if (set && set.has(epoch)) count++;
    }
    return count;
  }

  function paintCounts() {
    counts = [];
    sets = [];
    const tds = table.querySelectorAll('.slot-cell');
    for (const td of tds) {
      const epoch = Number(td.dataset.epoch);
      const c = Math.min(7, slotCount(epoch));
      td.dataset.c = String(c);
      td.classList.remove('dim', 'past', 'highlight');

      // store for global scanning
      const day = Number(td.dataset.day);
      const row = Number(td.dataset.row);
      const g = day * ROWS_PER_DAY + row;
      counts[g] = slotCount(epoch); // raw count for logic
      const who = new Set();
      for (const u of members) {
        const set = userSlotSets.get(u);
        if (set && set.has(epoch)) who.add(u);
      }
      sets[g] = who;
    }
    WEEK_ROWS = counts.length;
  }

  // --- Past shading ---
  function shadePast() {
    const nowMs = Date.now();
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const baseMs = baseEpoch * 1000;
    const endMs = baseMs + 7 * 86400000;
    const tds = table.querySelectorAll('.slot-cell');

    for (const td of tds) td.classList.remove('past');
    if (nowMs < baseMs || nowMs > endMs) return;

    for (const td of tds) {
      const cellMs = Number(td.dataset.epoch) * 1000;
      if (cellMs < nowMs) td.classList.add('past');
    }
  }

  function nowGlobalIndex() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const idx = Math.ceil((nowSec - baseEpoch) / SLOT_SEC);
    return Math.max(0, idx);
  }

  // --- NOW marker (restricted to current day column; centered bubble) ---
  function positionNowMarker() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const endSec = baseEpoch + 7 * 86400;

    if (nowSec < baseEpoch || nowSec >= endSec) {
      nowMarkerEl.style.display = 'none';
      return;
    }
    nowMarkerEl.style.display = 'block';

    const secondsIntoWeek = nowSec - baseEpoch;
    const dayIdx = Math.floor(secondsIntoWeek / 86400);
    const secondsIntoDay = secondsIntoWeek - dayIdx * 86400;
    const rowsIntoDay = secondsIntoDay / SLOT_SEC;

    const thead = table.querySelector('thead');
    const headerH = thead ? thead.offsetHeight : 0;
    const topPx = headerH + rowsIntoDay * rowHeightPx();
    nowMarkerEl.style.top = `${topPx}px`;

    const firstCell = table.querySelector(`tbody tr:first-child td.slot-cell[data-day="${dayIdx}"][data-row="0"]`);
    if (firstCell) {
      const colLeft = firstCell.offsetLeft;
      const colWidth = firstCell.offsetWidth;
      nowMarkerEl.style.left = `${colLeft}px`;
      nowMarkerEl.style.width = `${colWidth}px`;

      // center the bubble within the active day column
      const bubble = nowMarkerEl.querySelector('.bubble');
      if (bubble) {
        bubble.style.left = (colLeft + colWidth / 2) + 'px';
      }
    }
  }

  function bindMarkerReposition() {
    grid.addEventListener('scroll', positionNowMarker);
    window.addEventListener('resize', () => { positionNowMarker(); syncResultsHeight(); });
    setInterval(positionNowMarker, 30000);
  }

  // --- Filter dimming (global across week; respects midnight). Past slots are always dim. ---
  function applyFilterDimming() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, totalMembers - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));

    const tds = table.querySelectorAll('.slot-cell');
    for (const td of tds) td.classList.remove('dim');
    if (!totalMembers || needed <= 0) return;

    const startIdx = nowGlobalIndex(); // ignore past

    let g = 0;
    while (g < WEEK_ROWS) {
      if (g < startIdx || (counts[g] || 0) < needed) { dimCell(g); g++; continue; }
      let h = g;
      while (h < WEEK_ROWS && h >= startIdx && (counts[h] || 0) >= needed) h++;
      const blockLen = h - g;
      if (blockLen < minSlots) {
        for (let t = g; t < h; t++) dimCell(t);
      }
      g = h;
    }
  }

  function dimCell(globalIndex) {
    const { day, row } = gToDayRow(globalIndex);
    const cell = table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`);
    if (cell) cell.classList.add('dim');
  }

  // --- Results / candidates (supports midnight; no duplicate sessions per participant count; skip past) ---
  function findCandidates() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, totalMembers - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));
    const startIdx = nowGlobalIndex();

    const sessions = [];
    if (!totalMembers || needed <= 0) { renderResults(sessions); return; }

    const { baseEpoch } = getWeekStartEpochAndYMD();

    for (let k = totalMembers; k >= needed; k--) {
      let g = startIdx;
      while (g < WEEK_ROWS) {
        if ((counts[g] || 0) < k) { g++; continue; }

        // expand while keeping >= k AND intersect users to true participant set
        let s = g;
        let t = g + 1;
        let inter = new Set(sets[g]);
        while (t < WEEK_ROWS && (counts[t] || 0) >= k) {
          const avail = sets[t];
          inter = new Set([...inter].filter(x => avail.has(x)));
          if (inter.size < k) break;
          t++;
        }

        // clamp start to now (t already >= g+1 >= startIdx+1)
        s = Math.max(s, startIdx);

        const length = t - s;
        if (length >= minSlots && inter.size >= k) {
          const startSec = baseEpoch + s * SLOT_SEC;
          const endSec = baseEpoch + t * SLOT_SEC;

          sessions.push({
            gStart: s, gEnd: t,
            start: startSec, end: endSec,
            duration: length,
            participants: inter.size,
            users: Array.from(inter)
          });
        }

        // jump to end of this >=k block to avoid duplicates for same k
        while (t < WEEK_ROWS && (counts[t] || 0) >= k) t++;
        g = t;
      }
    }

    // Sort
    const sortMode = document.getElementById('sort-method').value;
    sessions.sort((a, b) => {
      if (sortMode === 'most') {
        if (b.participants !== a.participants) return b.participants - a.participants;
        return a.start - b.start;
      }
      if (sortMode === 'earliest-week') return a.start - b.start;
      if (sortMode === 'latest-week') return b.start - a.start;
      if (sortMode === 'earliest') {
        const aRow = a.gStart % ROWS_PER_DAY, bRow = b.gStart % ROWS_PER_DAY;
        if (aRow !== bRow) return aRow - bRow;
        return a.start - b.start;
      }
      if (sortMode === 'latest') {
        const aRow = a.gStart % ROWS_PER_DAY, bRow = b.gStart % ROWS_PER_DAY;
        if (aRow !== bRow) return bRow - aRow;
        return a.start - b.start;
      }
      if (sortMode === 'longest') {
        if (b.duration !== a.duration) return b.duration - a.duration;
        return a.start - b.start;
      }
      return a.start - b.start;
    });

    renderResults(sessions);
  }

  function renderResults(list) {
    resultsEl.innerHTML = '';
    clearHighlights();

    if (!list.length) {
      resultsEl.innerHTML = '<div class="result"><div class="res-sub">No matching sessions. Adjust filters.</div></div>';
      return;
    }

    for (const it of list) {
      const wrap = document.createElement('div');
      wrap.className = 'result';

      const top = document.createElement('div');
      top.className = 'res-top';
      top.textContent = fmtRangeSec(it.start, it.end);

      const sub = document.createElement('div');
      sub.className = 'res-sub';
      sub.textContent = `${it.participants}/${totalMembers} available • ${((it.duration)/SLOTS_PER_HOUR).toFixed(1)}h`;

      const usersLine = document.createElement('div');
      usersLine.className = 'res-users';
      usersLine.textContent = `Users: ${it.users.join(', ')}`;

      wrap.appendChild(top);
      wrap.appendChild(sub);
      wrap.appendChild(usersLine);

      // hover highlight (grid + card border)
      wrap.addEventListener('mouseenter', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, true);
        wrap.classList.add('hovered');
      });
      wrap.addEventListener('mouseleave', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, false);
        wrap.classList.remove('hovered');
      });

      resultsEl.appendChild(wrap);
    }
  }

  function highlightRangeGlobal(gStart, gEnd, on) {
    for (let g = gStart; g < gEnd; g++) {
      const { day, row } = gToDayRow(g);
      const td = table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`);
      if (td) td.classList.toggle('highlight', on);
    }
  }

  function clearHighlights() {
    for (const td of table.querySelectorAll('.slot-cell.highlight')) td.classList.remove('highlight');
  }

  // --- Tooltip ---
  function onCellHoverMove(e) {
    const td = e.currentTarget;
    if (td.classList.contains('past')) return; // no interaction for past
    const epoch = Number(td.dataset.epoch);
    const lists = availabilityListsAt(epoch);
    const tip = document.getElementById('cell-tooltip');
    const avail = lists.available.length ? `Available: ${lists.available.join(', ')}` : 'Available: —';
    const unavail = lists.unavailable.length ? `Unavailable: ${lists.unavailable.join(', ')}` : 'Unavailable: —';
    tip.innerHTML = `<div>${avail}</div><div style="margin-top:6px; color:#bbb;">${unavail}</div>`;
    tip.style.display = 'block';
    tip.style.left = (e.clientX + 14) + 'px';
    tip.style.top = (e.clientY + 16) + 'px';
  }
  function hideTooltip() {
    const tip = document.getElementById('cell-tooltip');
    tip.style.display = 'none';
  }
  function availabilityListsAt(epoch) {
    const available = [];
    const unavailable = [];
    for (const u of members) {
      const set = userSlotSets.get(u);
      if (set && set.has(epoch)) available.push(u);
      else unavailable.push(u);
    }
    return { available, unavailable };
  }

  // --- Legend (dynamic 0..members.length) ---
  function updateLegend() {
    const steps = document.getElementById('legend-steps');
    const labels = document.getElementById('legend-labels');
    steps.innerHTML = '';
    labels.innerHTML = '';

    const maxVal = members.length; // show 0..N inclusive
    const count = Math.max(1, maxVal + 1);

    steps.style.gridTemplateColumns = `repeat(${count}, 1fr)`;
    labels.style.gridTemplateColumns = `repeat(${count}, 1fr)`;

    for (let i = 0; i < count; i++) {
      const chip = document.createElement('div');
      chip.className = 'chip slot-cell';
      chip.dataset.c = String(Math.min(i, 7)); // palette up to 7
      steps.appendChild(chip);

      const lab = document.createElement('span');
      lab.textContent = String(i);
      labels.appendChild(lab);
    }
  }

  // --- Results panel sizing to match grid bottom ---
  function syncResultsHeight() {
    if (!grid || !resultsPanelEl || !resultsEl) return;
    const h = grid.clientHeight; // visible height of the grid
    resultsPanelEl.style.maxHeight = h + 'px';
    resultsEl.style.maxHeight = (h - resultsPanelEl.querySelector('h3').offsetHeight - 24) + 'px';
  }

  // --- Zoom (vertical only) ---
  function applyZoomStyles() {
    const base = 18;
    const px = clamp(Math.round(base * zoomFactor), 10, 42);
    document.documentElement.style.setProperty('--row-height', `${px}px`);
    positionNowMarker();
    syncResultsHeight();
  }

  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // normal scroll
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });
  }

  // --- Auth from host page ---
  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;
  }

  // --- Members UI ---
  function renderMembers() {
    const ul = document.getElementById('member-list');
    ul.innerHTML = '';
    for (const name of members) {
      const li = document.createElement('li');
      const txt = document.createElement('div');
      txt.textContent = name;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        members = members.filter(u => u !== name);
        renderMembers();
        await fetchMembersAvail();
      });
      li.appendChild(txt);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    updateLegend();
  }

  // --- Init / wiring ---
  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    resultsEl = document.getElementById('results');
    resultsPanelEl = document.getElementById('results-panel');
    nowMarkerEl = document.getElementById('now-marker');

    // controls
    document.getElementById('prev-week').addEventListener('click', async () => {
      weekOffset -= 1;
      buildTable();
      await fetchMembersAvail();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      weekOffset += 1;
      buildTable();
      await fetchMembersAvail();
    });

    // members add/remove
    document.getElementById('add-user-btn').addEventListener('click', async () => {
      const input = document.getElementById('add-username');
      const name = (input.value || '').trim();
      if (!name) return;
      if (!members.includes(name)) members.push(name);
      input.value = '';
      renderMembers();
      await fetchMembersAvail();
    });

    document.getElementById('add-me-btn').addEventListener('click', async () => {
      if (!isAuthenticated || !currentUsername) return;
      if (!members.includes(currentUsername)) members.push(currentUsername);
      renderMembers();
      await fetchMembersAvail();
    });

    // filters
    document.getElementById('max-missing').addEventListener('input', applyFilterDimming);
    const minHoursEl = document.getElementById('min-hours');
    minHoursEl.addEventListener('input', applyFilterDimming);
    minHoursEl.addEventListener('wheel', (e) => {
      e.preventDefault();
      const dir = -Math.sign(e.deltaY);
      const cur = parseFloat(minHoursEl.value || '0') || 0;
      let next = cur + dir * 0.5;
      if (next < 0) next = 0;
      next = Math.round(next * 2) / 2;
      minHoursEl.value = String(next);
      applyFilterDimming();
    }, { passive: false });

    // candidates
    document.getElementById('find-btn').addEventListener('click', findCandidates);

    // settings
    await loadSettings();

    // restore previous members
    try {
      const prev = JSON.parse(sessionStorage.getItem('nat20_members') || '[]');
      if (Array.isArray(prev)) members = prev.filter(x => typeof x === 'string');
    } catch {}

    buildTable();
    renderMembers();
    await fetchMembersAvail();

    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('nat20_members', JSON.stringify(members));
    });

    setupZoomHandlers();
    bindMarkerReposition();
  }

  async function fetchRemoteSettings() {
    try {
      const res = await fetch(`${BASE_URL}/settings`, { credentials: 'include', cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  async function loadSettings() {
    const local = loadLocalSettings();
    const remote = await fetchRemoteSettings();
    const s = remote || local || DEFAULT_SETTINGS;

    settings = { ...DEFAULT_SETTINGS, ...s };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    zoomFactor = clamp(typeof settings.defaultZoom === 'number' ? settings.defaultZoom : 1.0, ZOOM_MIN, ZOOM_MAX);
    applyZoomStyles();
  }

  // expose to host page
  window.scheduler = { init, setAuth };

  // auto-boot if DOM already ready
  if (document.readyState !== 'loading') init();
})();
