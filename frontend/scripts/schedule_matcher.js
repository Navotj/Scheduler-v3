(function () {
  'use strict';

  // --- Constants ---
  const BASE_URL = 'http://backend.nat20scheduling.com:3000';
  const SLOTS_PER_HOUR = 2;           // 30-minute slots
  const SLOT_SEC = 30 * 60;
  const HOURS_START = 0;
  const HOURS_END = 24;

  // --- State ---
  let weekOffset = 0;                 // 0 = current week
  let zoom = 1;                       // vertical zoom multiplier
  let members = [];                   // [{username}]
  let availabilityByUser = new Map(); // username -> array of {start,end} epoch ms
  let isAuthenticated = false;
  let currentUsername = null;

  // Settings (from localStorage if present)
  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun' };
  let settings = loadLocal('nat20_settings') || DEFAULT_SETTINGS;
  if (!settings.timezone) settings.timezone = 'auto';
  if (!settings.clock) settings.clock = '24';
  if (!settings.weekStart) settings.weekStart = 'sun';

  const tz = settings.timezone === 'auto'
    ? Intl.DateTimeFormat().resolvedOptions().timeZone
    : settings.timezone;
  const hour12 = settings.clock === '12';
  const weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;

  // --- Elements ---
  let tableEl, gridEl, gridContentEl, dayHeadersEl, dateRangeEl, resultsEl;

  // --- Utils: timezone-safe epoch helpers ---
  function tzOffsetMinutes(tzName, dateMs) {
    const d = new Date(dateMs);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName,
      hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const utcGuess = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.round((utcGuess - dateMs) / 60000);
  }

  function epochFromZoned(y, m, d, hh, mm, tzName) {
    const guessUtc = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(tzName, guessUtc);
    let ts = guessUtc - off * 60000;
    // one more pass for DST boundaries
    off = tzOffsetMinutes(tzName, ts);
    ts = guessUtc - off * 60000;
    return ts;
  }

  function startOfWeekEpoch(ms, tzName, weekStart) {
    const d = new Date(ms);
    // get local Y/M/D in tz
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short'
    }).formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const local = new Date(epochFromZoned(+map.year, +map.month, +map.day, 0, 0, tzName));
    const dow = (local.getUTCDay()); // 0..6 (Sun..Sat) but computed in UTC at local midnight
    const target = weekStart; // 0 Sun or 1 Mon
    const diff = (dow - target + 7) % 7;
    const weekStartLocal = new Date(local.getTime() - diff * 24 * 3600 * 1000);
    // return epoch of local midnight of the first day of week
    const y = weekStartLocal.getUTCFullYear();
    const m = weekStartLocal.getUTCMonth() + 1;
    const d2 = weekStartLocal.getUTCDate();
    return epochFromZoned(y, m, d2, 0, 0, tzName);
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

  function fmtRange(startMs, endMs) {
    const a = new Date(startMs);
    const b = new Date(endMs);
    const dow = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'][a.getUTCDay()];
    const sh = a.getUTCHours(); const sm = a.getUTCMinutes();
    const eh = b.getUTCHours(); const em = b.getUTCMinutes();
    return `${dow}, ${fmtTime(sh, sm)} – ${fmtTime(eh, em)}`;
  }

  function loadLocal(key) {
    try { return JSON.parse(localStorage.getItem(key)); } catch { return null; }
  }

  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

  // --- Grid build ---
  function buildGrid() {
    // headers
    dayHeadersEl.innerHTML = '';
    const now = Date.now();
    const curWeekStart = startOfWeekEpoch(now, tz, weekStartIdx);
    const start = curWeekStart + weekOffset * 7 * 24 * 3600 * 1000;
    const days = [];
    for (let i = 0; i < 7; i++) {
      const d = new Date(start + i * 86400000);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', day: '2-digit', month: 'short'
      }).format(d);
      const div = document.createElement('div');
      div.className = 'day';
      div.textContent = label;
      dayHeadersEl.appendChild(div);
      days.push(start + i * 86400000);
    }

    // date range label
    const first = new Date(days[0]);
    const last = new Date(days[6]);
    dateRangeEl.textContent = ` ${new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short' }).format(first)} – ${new Intl.DateTimeFormat('en-GB', { day:'2-digit', month:'short', year:'numeric' }).format(last)}`;

    // body
    gridContentEl.innerHTML = gridContentEl.innerHTML; // preserve now marker element
    // remove everything except now-marker
    for (const el of Array.from(gridContentEl.children)) {
      if (el.id !== 'now-marker') el.remove();
    }

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
    for (let r = 0; r < totalRows; r++) {
      const row = document.createElement('div');
      row.className = 'row';

      // time label
      const minutes = (HOURS_START * 60) + r * (60 / SLOTS_PER_HOUR);
      const hh = Math.floor(minutes / 60);
      const mm = minutes % 60;
      const t = document.createElement('div');
      t.className = 'timecell';
      t.textContent = (mm === 0) ? fmtTime(hh, 0) : '';
      row.appendChild(t);

      for (let c = 0; c < 7; c++) {
        const cell = document.createElement('div');
        cell.className = 'cell';
        cell.dataset.day = String(c);
        cell.dataset.row = String(r);

        // default availability count
        cell.dataset.c = '0';

        row.appendChild(cell);
      }
      gridContentEl.appendChild(row);
    }

    applyZoom();
    shadePast();
    paintAvailability();
    applyFilterDimming();
    positionNowMarker(); // also updates visibility
  }

  function gridRows() {
    return Array.from(gridContentEl.querySelectorAll('.row'));
  }

  function cells() {
    return Array.from(gridContentEl.querySelectorAll('.cell'));
  }

  function rowHeightPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
    return parseFloat(v.replace('px',''));
  }

  // --- Availability painting ---
  function paintAvailability() {
    // reset counts
    for (const cell of cells()) cell.dataset.c = '0';

    // Build per-slot counts
    const start = getWeekStartEpoch();
    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (const [user, ranges] of availabilityByUser) {
      for (const rng of ranges) {
        // clamp to week
        const a = Math.max(rng.start, start);
        const b = Math.min(rng.end, start + 7 * 86400000);
        if (b <= a) continue;

        // iterate slots
        for (let day = 0; day < 7; day++) {
          const dayStart = start + day * 86400000;
          const dayEnd = dayStart + 86400000;
          const s = Math.max(a, dayStart);
          const e = Math.min(b, dayEnd);
          if (e <= s) continue;

          const firstSlot = Math.max(0, Math.floor(((s - dayStart) / 1000) / SLOT_SEC));
          const lastSlotExclusive = Math.min(totalRows, Math.ceil(((e - dayStart) / 1000) / SLOT_SEC));

          for (let r = firstSlot; r < lastSlotExclusive; r++) {
            const cell = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${r}"]`);
            if (cell) {
              const cur = +cell.dataset.c;
              cell.dataset.c = String(Math.min(7, cur + 1)); // cap to 7+ for palette
            }
          }
        }
      }
    }
  }

  // --- Past shading ---
  function shadePast() {
    // clear past flags
    for (const cell of cells()) cell.classList.remove('past');

    const now = Date.now();
    const weekStart = getWeekStartEpoch();
    const weekEnd = weekStart + 7 * 86400000;

    if (now < weekStart || now > weekEnd) return; // not in this week

    const dayIdx = Math.floor((now - weekStart) / 86400000);
    const dayStart = weekStart + dayIdx * 86400000;
    const slotIdx = Math.floor(((now - dayStart) / 1000) / SLOT_SEC);

    // days before today -> past
    for (let d = 0; d < dayIdx; d++) {
      for (const cell of gridContentEl.querySelectorAll(`.cell[data-day="${d}"]`)) cell.classList.add('past');
    }
    // current day, slots before current slot
    for (let r = 0; r < slotIdx; r++) {
      const cell = gridContentEl.querySelector(`.cell[data-day="${dayIdx}"][data-row="${r}"]`);
      if (cell) cell.classList.add('past');
    }
  }

  // --- Now marker ---
  function positionNowMarker() {
    const marker = document.getElementById('now-marker');
    const now = Date.now();
    const weekStart = getWeekStartEpoch();
    const weekEnd = weekStart + 7 * 86400000;

    if (now < weekStart || now > weekEnd) {
      marker.style.display = 'none';
      return;
    }
    marker.style.display = 'block';

    const dayIdx = Math.floor((now - weekStart) / 86400000);
    const dayStart = weekStart + dayIdx * 86400000;
    const secondsIntoDay = Math.floor((now - dayStart) / 1000);
    const rowsIntoDay = secondsIntoDay / SLOT_SEC;
    const topPx = rowsIntoDay * rowHeightPx();

    marker.style.top = `${topPx}px`;
  }

  // Keep marker aligned on scroll/zoom/resize
  function bindMarkerReposition() {
    gridEl.addEventListener('scroll', () => positionNowMarker());
    window.addEventListener('resize', () => positionNowMarker());
    setInterval(positionNowMarker, 30000); // update roughly every 30s
  }

  // --- Filter dimming (threshold + min session length) ---
  function applyFilterDimming() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, members.length - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR)); // 0.5h -> 1 slot, etc.

    // Clear existing dim flags
    for (const cell of cells()) cell.classList.remove('dim');

    if (members.length === 0) return;

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let day = 0; day < 7; day++) {
      // For each row, compute contiguous streak where count >= needed
      let r = 0;
      while (r < totalRows) {
        const cell = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${r}"]`);
        const ok = cell && (+cell.dataset.c) >= needed;
        if (!ok) {
          if (cell) cell.classList.add('dim');
          r++;
          continue;
        }
        // count streak
        let len = 0;
        let rr = r;
        for (; rr < totalRows; rr++) {
          const c = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${rr}"]`);
          if (!c || (+c.dataset.c) < needed) break;
          len++;
        }
        // mark as dim if streak shorter than minSlots
        if (len < minSlots) {
          for (let k = r; k < rr; k++) {
            const c = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${k}"]`);
            if (c) c.classList.add('dim');
          }
        }
        r = rr;
      }
    }
  }

  // --- Candidate finding ---
  function findCandidates() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, members.length - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));
    const start = getWeekStartEpoch();

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
    const sessions = [];

    for (let day = 0; day < 7; day++) {
      let r = 0;
      while (r < totalRows) {
        const cell = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${r}"]`);
        if (!cell || (+cell.dataset.c) < needed) { r++; continue; }

        let rr = r;
        while (rr < totalRows) {
          const c = gridContentEl.querySelector(`.cell[data-day="${day}"][data-row="${rr}"]`);
          if (!c || (+c.dataset.c) < needed) break;
          rr++;
        }

        const streak = rr - r;
        if (streak >= minSlots) {
          // determine participating users (those available for entire streak)
          const sessionStart = start + day * 86400000 + r * SLOT_SEC * 1000;
          const sessionEnd = start + day * 86400000 + rr * SLOT_SEC * 1000;

          const users = [];
          for (const [uname, ranges] of availabilityByUser) {
            let okWhole = false;
            for (const rng of ranges) {
              if (rng.start <= sessionStart && rng.end >= sessionEnd) { okWhole = true; break; }
            }
            if (okWhole) users.push(uname);
          }

          sessions.push({
            day, rStart: r, rEnd: rr,
            start: sessionStart, end: sessionEnd,
            participants: users.length, users
          });
        }

        r = rr + 1;
      }
    }

    const sortMode = document.getElementById('sort').value;
    sessions.sort((a,b) => {
      if (sortMode === 'most_participants') {
        if (b.participants !== a.participants) return b.participants - a.participants;
        // tie-breaker: earliest in week
        return a.start - b.start;
      }
      if (sortMode === 'earliest_in_week') return a.start - b.start;
      if (sortMode === 'latest_in_week') return b.start - a.start;
      if (sortMode === 'earliest_start') {
        // compare by time of day (rStart)
        if (a.rStart !== b.rStart) return a.rStart - b.rStart;
        return a.start - b.start; // tie-break by earliest in week
      }
      if (sortMode === 'latest_start') {
        if (a.rStart !== b.rStart) return b.rStart - a.rStart;
        return a.start - b.start; // tie-break by earliest in week
      }
      return a.start - b.start;
    });

    renderResults(sessions);
  }

  function renderResults(list) {
    const out = resultsEl;
    out.innerHTML = '';
    if (!list.length) {
      out.innerHTML = '<div class="empty">No matching sessions. Adjust filters.</div>';
      return;
    }
    for (const it of list) {
      const div = document.createElement('div');
      div.className = 'result-item';
      const line1 = document.createElement('div');
      line1.className = 'line';
      line1.innerHTML = `<div>${fmtRange(it.start, it.end)}</div><div><strong>${it.participants}/${members.length}</strong> available</div>`;
      const line2 = document.createElement('div');
      line2.className = 'users';
      line2.textContent = `Users: ${it.users.join(', ')}`;
      div.appendChild(line1);
      div.appendChild(line2);
      out.appendChild(div);
    }
  }

  // --- Fetch availability ---
  async function fetchMembersAvail() {
    availabilityByUser.clear();
    if (members.length === 0) { paintAvailability(); applyFilterDimming(); return; }

    const weekStart = getWeekStartEpoch();
    const body = {
      usernames: members.map(m => m.username),
      start: weekStart,
      end: weekStart + 7 * 86400000
    };

    // try primary endpoint, then fallback to legacy
    let url = `${BASE_URL}/availability/get_many`;
    let res = await tryPost(url, body);
    if (!res || res.status === 404) {
      url = `${BASE_URL}/availability/availability/get_many`;
      res = await tryPost(url, body);
    }
    if (!res || res.status !== 200) {
      console.warn('fetch availability failed', res && res.status);
      paintAvailability(); applyFilterDimming(); return;
    }
    const data = await res.json();
    // expected: { data: { username: [{start,end},...] } } or array
    if (Array.isArray(data)) {
      for (const u of data) availabilityByUser.set(u.username, u.entries || u.availability || []);
    } else if (data && data.data) {
      for (const [uname, arr] of Object.entries(data.data)) {
        availabilityByUser.set(uname, arr);
      }
    } else {
      // best-effort
      for (const [uname, arr] of Object.entries(data)) availabilityByUser.set(uname, arr);
    }

    paintAvailability();
    applyFilterDimming();
  }

  async function tryPost(url, body) {
    try {
      const ctrl = new AbortController();
      const t = setTimeout(() => ctrl.abort(), 6000);
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(body),
        signal: ctrl.signal
      });
      clearTimeout(t);
      return res;
    } catch (e) {
      return null;
    }
  }

  // --- Members UI ---
  function renderMembers() {
    const list = document.getElementById('member-list');
    list.innerHTML = '';
    for (const m of members) {
      const row = document.createElement('div');
      row.className = 'member';
      const name = document.createElement('div');
      name.textContent = m.username;
      const btn = document.createElement('button');
      btn.className = 'btn btn-secondary';
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        members = members.filter(x => x.username !== m.username);
        renderMembers();
        await fetchMembersAvail();
      });
      row.appendChild(name);
      row.appendChild(btn);
      list.appendChild(row);
    }
    updateLegend();
  }

  function updateLegend() {
    const labels = document.getElementById('legend-labels');
    labels.innerHTML = '';
    const max = Math.max(7, members.length);
    // ensure 0..7 at least
    for (let i = 0; i < 8; i++) {
      const d = document.createElement('div');
      d.textContent = String(i);
      labels.appendChild(d);
    }
    // paint boxes up to 7 using data-val attribute (CSS palette is fixed)
    for (const el of document.querySelectorAll('.legend-box')) {
      const v = parseInt(el.dataset.val, 10);
      el.style.background = '';
      el.removeAttribute('data-c');
      el.setAttribute('data-c', String(v));
      el.className = 'legend-box cell';
      el.style.pointerEvents = 'none';
    }
  }

  // --- Zoom / Pan ---
  function applyZoom() {
    const base = 18;
    const newPx = clamp(Math.round(base * zoom), 10, 42);
    document.documentElement.style.setProperty('--row-height', `${newPx}px`);
    positionNowMarker();
  }

  function bindZoomAndPan() {
    gridEl.addEventListener('wheel', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        const delta = -Math.sign(e.deltaY);
        zoom = clamp(zoom + delta * 0.1, 0.5, 2.2);
        applyZoom();
      }
      // otherwise normal scroll (pan)
    }, { passive: false });
  }

  // --- Helpers ---
  function getWeekStartEpoch() {
    const now = Date.now();
    const cur = startOfWeekEpoch(now, tz, weekStartIdx);
    return cur + weekOffset * 7 * 86400000;
  }

  // --- Auth ---
  async function checkAuth() {
    try {
      const res = await fetch(`${BASE_URL}/auth/check`, { credentials: 'include', cache: 'no-cache' });
      if (res.status === 200) {
        const data = await res.json();
        isAuthenticated = true;
        currentUsername = data && (data.username || data.user || data.email) || null;
      } else {
        isAuthenticated = false;
      }
    } catch {
      isAuthenticated = false;
    }
    const label = document.getElementById('auth-user');
    if (isAuthenticated && currentUsername) {
      label.textContent = `Signed in as ${currentUsername}`;
      label.style.display = 'inline';
    } else {
      label.style.display = 'none';
    }
  }

  async function logout() {
    try { await fetch(`${BASE_URL}/auth/logout`, { credentials: 'include' }); } catch {}
    window.location.href = '/index.html';
  }

  // --- Attach UI ---
  function attachUI() {
    document.getElementById('prev-week').addEventListener('click', async () => {
      weekOffset -= 1;
      buildGrid();
      await fetchMembersAvail();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      weekOffset += 1;
      buildGrid();
      await fetchMembersAvail();
    });

    // Add member(s)
    document.getElementById('add-user').addEventListener('click', async () => {
      const input = document.getElementById('member-input');
      const name = (input.value || '').trim();
      if (!name) return;
      if (!members.some(m => m.username === name)) members.push({ username: name });
      input.value = '';
      renderMembers();
      await fetchMembersAvail();
    });

    document.getElementById('add-me').addEventListener('click', async () => {
      if (!isAuthenticated || !currentUsername) return;
      if (!members.some(m => m.username === currentUsername)) members.push({ username: currentUsername });
      renderMembers();
      await fetchMembersAvail();
    });

    // find
    document.getElementById('find-btn').addEventListener('click', () => {
      findCandidates();
    });

    // filter change handlers
    document.getElementById('max-missing').addEventListener('input', () => {
      applyFilterDimming();
    });
    const minHoursEl = document.getElementById('min-hours');
    minHoursEl.addEventListener('input', () => applyFilterDimming());
    minHoursEl.addEventListener('wheel', (e) => {
      // increments of 0.5h
      e.preventDefault();
      const dir = -Math.sign(e.deltaY);
      const cur = parseFloat(minHoursEl.value || '0') || 0;
      let next = cur + dir * 0.5;
      if (next < 0) next = 0;
      // round to nearest 0.5 to avoid float noise
      next = Math.round(next * 2) / 2;
      minHoursEl.value = String(next);
      applyFilterDimming();
    }, { passive: false });

    // logout
    document.getElementById('logout-btn').addEventListener('click', logout);

    // horizontal pan is default via native scrollbars
  }

  // --- Init ---
  function wireLegendNumbers() {
    const labels = document.getElementById('legend-labels');
    labels.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const div = document.createElement('div');
      div.textContent = String(i);
      labels.appendChild(div);
    }
  }

  async function init() {
    tableEl = document.getElementById('table');
    gridEl = document.getElementById('grid');
    gridContentEl = document.getElementById('grid-content');
    dayHeadersEl = document.getElementById('day-headers');
    dateRangeEl = document.getElementById('date-range');
    resultsEl = document.getElementById('results');

    attachUI();
    bindZoomAndPan();
    bindMarkerReposition();
    wireLegendNumbers();

    await checkAuth();
    buildGrid();

    // demo: keep previous members from sessionStorage
    try {
      const prev = JSON.parse(sessionStorage.getItem('nat20_members') || '[]');
      if (Array.isArray(prev)) members = prev;
    } catch {}
    renderMembers();
    await fetchMembersAvail();

    window.addEventListener('beforeunload', () => {
      sessionStorage.setItem('nat20_members', JSON.stringify(members));
    });
  }

  // boot
  if (document.readyState !== 'loading') init();
  else document.addEventListener('DOMContentLoaded', init);

  // expose for debugging
  window.__scheduler = { buildGrid, fetchMembersAvail, findCandidates };
})();
