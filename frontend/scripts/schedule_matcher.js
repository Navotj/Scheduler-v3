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
  let gridEl, gridContentEl, tableEl, resultsEl, nowMarkerEl;

  // --- Utils ---
  function loadLocal(key) { try { return JSON.parse(localStorage.getItem(key)); } catch { return null; } }
  function clamp(v, a, b) { return Math.max(a, Math.min(b, v)); }

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
    off = tzOffsetMinutes(tzName, ts);
    ts = guessUtc - off * 60000;
    return ts;
  }
  function startOfWeekEpoch(ms, tzName, weekStart) {
    const d = new Date(ms);
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      weekday: 'short'
    }).formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const local = new Date(epochFromZoned(+map.year, +map.month, +map.day, 0, 0, tzName));
    const dow = local.getUTCDay();
    const diff = (dow - weekStart + 7) % 7;
    const weekStartLocal = new Date(local.getTime() - diff * 86400000);
    return epochFromZoned(
      weekStartLocal.getUTCFullYear(),
      weekStartLocal.getUTCMonth() + 1,
      weekStartLocal.getUTCDate(),
      0, 0, tzName
    );
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
  function rowHeightPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
    return parseFloat(v.replace('px',''));
  }
  function getWeekStartEpoch() {
    const now = Date.now();
    const cur = startOfWeekEpoch(now, tz, weekStartIdx);
    return cur + weekOffset * 7 * 86400000;
  }

  // --- Table build ---
  function buildTable() {
    tableEl.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    thTime.className = 'time-col';
    trh.appendChild(thTime);

    const start = getWeekStartEpoch();
    for (let i = 0; i < 7; i++) {
      const d = new Date(start + i * 86400000);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', day: '2-digit', month: 'short'
      }).format(d);
      const th = document.createElement('th');
      th.textContent = label;
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');

      // Hour label cell (rowspan=2)
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
        td.dataset.day = String(day);
        td.dataset.row = String(r);
        td.dataset.c = '0';
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    tableEl.appendChild(tbody);

    applyZoom();
    paintAvailability();
    shadePast();
    applyFilterDimming();
    positionNowMarker();
  }

  function cells() {
    return Array.from(tableEl.querySelectorAll('.slot-cell'));
  }

  // --- Availability painting ---
  function paintAvailability() {
    for (const cell of cells()) cell.dataset.c = '0';

    const start = getWeekStartEpoch();
    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (const [, ranges] of availabilityByUser) {
      for (const rng of ranges) {
        const a = Math.max(rng.start, start);
        const b = Math.min(rng.end, start + 7 * 86400000);
        if (b <= a) continue;

        for (let day = 0; day < 7; day++) {
          const dayStart = start + day * 86400000;
          const dayEnd = dayStart + 86400000;
          const s = Math.max(a, dayStart);
          const e = Math.min(b, dayEnd);
          if (e <= s) continue;

          const firstSlot = Math.max(0, Math.floor(((s - dayStart) / 1000) / SLOT_SEC));
          const lastSlotExclusive = Math.min(totalRows, Math.ceil(((e - dayStart) / 1000) / SLOT_SEC));

          for (let r = firstSlot; r < lastSlotExclusive; r++) {
            const cell = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${r}"]`);
            if (cell) {
              const cur = +cell.dataset.c;
              cell.dataset.c = String(Math.min(7, cur + 1));
            }
          }
        }
      }
    }
  }

  // --- Past shading ---
  function shadePast() {
    for (const cell of cells()) cell.classList.remove('past');

    const now = Date.now();
    const weekStart = getWeekStartEpoch();
    const weekEnd = weekStart + 7 * 86400000;
    if (now < weekStart || now > weekEnd) return;

    const dayIdx = Math.floor((now - weekStart) / 86400000);
    const dayStart = weekStart + dayIdx * 86400000;
    const slotIdx = Math.floor(((now - dayStart) / 1000) / SLOT_SEC);

    // days before today
    for (let d = 0; d < dayIdx; d++) {
      for (const cell of tableEl.querySelectorAll(`.slot-cell[data-day="${d}"]`)) cell.classList.add('past');
    }
    // earlier slots today
    for (let r = 0; r < slotIdx; r++) {
      const cell = tableEl.querySelector(`.slot-cell[data-day="${dayIdx}"][data-row="${r}"]`);
      if (cell) cell.classList.add('past');
    }
  }

  // --- Now marker ---
  function positionNowMarker() {
    const now = Date.now();
    const weekStart = getWeekStartEpoch();
    const weekEnd = weekStart + 7 * 86400000;

    if (now < weekStart || now > weekEnd) {
      nowMarkerEl.style.display = 'none';
      return;
    }

    nowMarkerEl.style.display = 'block';

    const dayIdx = Math.floor((now - weekStart) / 86400000);
    const dayStart = weekStart + dayIdx * 86400000;
    const secondsIntoDay = Math.floor((now - dayStart) / 1000);
    const rowsIntoDay = secondsIntoDay / SLOT_SEC;

    const thead = tableEl.querySelector('thead');
    const headerH = thead ? thead.offsetHeight : 0;
    const topPx = headerH + rowsIntoDay * rowHeightPx();

    nowMarkerEl.style.top = `${topPx}px`;
  }

  function bindMarkerReposition() {
    gridEl.addEventListener('scroll', () => positionNowMarker());
    window.addEventListener('resize', () => positionNowMarker());
    setInterval(positionNowMarker, 30000);
  }

  // --- Filters & candidates ---
  function applyFilterDimming() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, members.length - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));

    for (const cell of cells()) cell.classList.remove('dim');

    if (members.length === 0 || needed <= 0) return;

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let day = 0; day < 7; day++) {
      let r = 0;
      while (r < totalRows) {
        const cell = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${r}"]`);
        const ok = cell && (+cell.dataset.c) >= needed;
        if (!ok) {
          if (cell) cell.classList.add('dim');
          r++;
          continue;
        }
        // count contiguous streak
        let rr = r;
        while (rr < totalRows) {
          const c = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${rr}"]`);
          if (!c || (+c.dataset.c) < needed) break;
          rr++;
        }
        const streak = rr - r;
        if (streak < minSlots) {
          for (let k = r; k < rr; k++) {
            const c = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${k}"]`);
            if (c) c.classList.add('dim');
          }
        }
        r = rr;
      }
    }
  }

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
        const cell = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${r}"]`);
        if (!cell || (+cell.dataset.c) < needed) { r++; continue; }

        let rr = r;
        while (rr < totalRows) {
          const c = tableEl.querySelector(`.slot-cell[data-day="${day}"][data-row="${rr}"]`);
          if (!c || (+c.dataset.c) < needed) break;
          rr++;
        }

        const streak = rr - r;
        if (streak >= minSlots) {
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
            duration: rr - r,
            participants: users.length, users
          });
        }

        r = rr + 1;
      }
    }

    const sortMode = document.getElementById('sort-method').value;
    sessions.sort((a, b) => {
      if (sortMode === 'most') {
        if (b.participants !== a.participants) return b.participants - a.participants;
        return a.start - b.start; // tie -> earliest in week
      }
      if (sortMode === 'earliest-week') return a.start - b.start;
      if (sortMode === 'latest-week') return b.start - a.start;
      if (sortMode === 'earliest') {
        if (a.rStart !== b.rStart) return a.rStart - b.rStart;
        return a.start - b.start;
      }
      if (sortMode === 'latest') {
        if (a.rStart !== b.rStart) return b.rStart - a.rStart;
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
    // clear previous highlights
    for (const c of tableEl.querySelectorAll('.slot-cell.highlight')) c.classList.remove('highlight');

    if (!list.length) {
      resultsEl.innerHTML = '<div class="result"><div class="res-sub">No matching sessions. Adjust filters.</div></div>';
      return;
    }

    for (const it of list) {
      const wrap = document.createElement('div');
      wrap.className = 'result';

      const top = document.createElement('div');
      top.className = 'res-top';
      top.textContent = fmtRange(it.start, it.end);

      const sub = document.createElement('div');
      sub.className = 'res-sub';
      sub.textContent = `${it.participants}/${members.length} available • ${((it.rEnd - it.rStart)/SLOTS_PER_HOUR).toFixed(1)}h`;

      const usersLine = document.createElement('div');
      usersLine.className = 'res-users';
      usersLine.textContent = `Users: ${it.users.join(', ')}`;

      wrap.appendChild(top);
      wrap.appendChild(sub);
      wrap.appendChild(usersLine);

      // hover highlight
      wrap.addEventListener('mouseenter', () => {
        for (let r = it.rStart; r < it.rEnd; r++) {
          const cell = tableEl.querySelector(`.slot-cell[data-day="${it.day}"][data-row="${r}"]`);
          if (cell) cell.classList.add('highlight');
        }
      });
      wrap.addEventListener('mouseleave', () => {
        for (let r = it.rStart; r < it.rEnd; r++) {
          const cell = tableEl.querySelector(`.slot-cell[data-day="${it.day}"][data-row="${r}"]`);
          if (cell) cell.classList.remove('highlight');
        }
      });

      resultsEl.appendChild(wrap);
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

    let url = `${BASE_URL}/availability/get_many`;
    let res = await tryPost(url, body);
    if (!res || res.status === 404) {
      url = `${BASE_URL}/availability/availability/get_many`;
      res = await tryPost(url, body);
    }
    if (!res || res.status !== 200) {
      paintAvailability(); applyFilterDimming(); return;
    }
    const data = await res.json();

    if (Array.isArray(data)) {
      for (const u of data) availabilityByUser.set(u.username, u.entries || u.availability || []);
    } else if (data && data.data) {
      for (const [uname, arr] of Object.entries(data.data)) availabilityByUser.set(uname, arr);
    } else {
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
    } catch {
      return null;
    }
  }

  // --- Members UI ---
  function renderMembers() {
    const list = document.getElementById('member-list');
    list.innerHTML = '';
    for (const m of members) {
      const li = document.createElement('li');
      const name = document.createElement('div');
      name.textContent = m.username;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        members = members.filter(x => x.username !== m.username);
        renderMembers();
        await fetchMembersAvail();
      });
      li.appendChild(name);
      li.appendChild(btn);
      list.appendChild(li);
    }
    updateLegend();
  }

  function updateLegend() {
    const steps = document.getElementById('legend-steps');
    const labels = document.getElementById('legend-labels');
    steps.innerHTML = '';
    labels.innerHTML = '';
    for (let i = 0; i < 8; i++) {
      const chip = document.createElement('div');
      chip.className = 'chip slot-cell';
      chip.dataset.c = String(i);
      steps.appendChild(chip);

      const lab = document.createElement('span');
      lab.textContent = String(i);
      labels.appendChild(lab);
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
    }, { passive: false });
  }

  // --- Auth integration from page ---
  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;
  }

  // --- UI wiring ---
  function attachUI() {
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

    document.getElementById('add-user-btn').addEventListener('click', async () => {
      const input = document.getElementById('add-username');
      const name = (input.value || '').trim();
      if (!name) return;
      if (!members.some(m => m.username === name)) members.push({ username: name });
      input.value = '';
      renderMembers();
      await fetchMembersAvail();
    });

    document.getElementById('add-me-btn').addEventListener('click', async () => {
      if (!isAuthenticated || !currentUsername) return;
      if (!members.some(m => m.username === currentUsername)) members.push({ username: currentUsername });
      renderMembers();
      await fetchMembersAvail();
    });

    document.getElementById('find-btn').addEventListener('click', () => {
      findCandidates();
    });

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
  }

  // --- Init ---
  async function init() {
    gridEl = document.getElementById('grid');
    gridContentEl = document.getElementById('grid-content');
    tableEl = document.getElementById('scheduler-table');
    resultsEl = document.getElementById('results');
    nowMarkerEl = document.getElementById('now-marker');

    attachUI();
    bindZoomAndPan();
    bindMarkerReposition();
    updateLegend();

    buildTable();

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

  // expose to page
  window.scheduler = { init, setAuth };

  // auto-boot if DOM already ready (page also calls init)
  if (document.readyState !== 'loading') init();
})();
