(function () {
  const SLOTS_PER_HOUR = 2;        // 30-min steps
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 1800;

  // state
  let weekOffset = 0;
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

  // members and availability
  let members = []; // array of usernames
  const userSlotSets = new Map(); // username -> Set(epoch)
  let totalMembers = 0;

  // cached
  let table;
  let grid;
  let nowMarker;

  // utils
  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

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
    const todayYMD = getTodayYMDInTZ(tz);
    const todayMid = epochFromZoned(todayYMD.y, todayYMD.m, todayYMD.d, 0, 0, tz);
    const todayIdx = weekdayIndexInTZ(todayMid, tz);
    const diff = (todayIdx - weekStartIdx + 7) % 7;
    const baseYMD = ymdAddDays(todayYMD, -diff + weekOffset * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  }

  function formatHourLabel(hour) {
    if (!hour12) return `${String(hour).padStart(2, '0')}:00`;
    const h = (hour % 12) || 12;
    const ampm = hour < 12 ? 'AM' : 'PM';
    return `${h} ${ampm}`;
  }

  function colorFor(count, total) {
    if (total === 0) return '#2a2a2a';
    const ratio = count / total; // 0..1
    const light = 18 + Math.round(22 * ratio); // 18%..40%
    const sat = 55; // %
    const hue = 140; // green
    return `hsl(${hue}, ${sat}%, ${light}%)`;
  }

  function minutesToHhmm(mins) {
    const h = Math.floor(mins / 60);
    const m = mins % 60;
    return `${h}h ${String(m).padStart(2, '0')}m`;
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

  function applyZoomStyles() {
    const root = document.documentElement;
    const baseRow = 18, baseFont = 12;
    zoomFactor = clamp(zoomFactor, ZOOM_MIN, ZOOM_MAX);
    root.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--font-size', `${(baseFont * zoomFactor).toFixed(2)}px`);
    updateNowMarker(); // row height changed → reposition
  }

  function buildGrid() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    nowMarker = document.getElementById('now-marker');
    table.innerHTML = '';

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    renderWeekLabel(baseEpoch);

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
        td.style.background = colorFor(slotCount(epoch), totalMembers);

        td.addEventListener('mousemove', onCellHoverMove);
        td.addEventListener('mouseleave', hideTooltip);

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    setupZoomHandlers();
    applyFilterDimming();

    // position/update NOW marker
    updateNowMarker();
  }

  function onCellHoverMove(e) {
    const td = e.currentTarget;
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

  function slotCount(epoch) {
    let count = 0;
    for (const u of members) {
      const set = userSlotSets.get(u);
      if (set && set.has(epoch)) count++;
    }
    return count;
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

  async function fetchRemoteSettings() {
    try {
      const res = await fetch('http://backend.nat20scheduling.com:3000/settings', { credentials: 'include', cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  async function loadSettings() {
    const remote = await fetchRemoteSettings();
    const s = remote || DEFAULT_SETTINGS;
    settings = { ...DEFAULT_SETTINGS, ...s };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    zoomFactor = clamp(typeof settings.defaultZoom === 'number' ? settings.defaultZoom : 1.0, ZOOM_MIN, ZOOM_MAX);
    applyZoomStyles();
  }

  async function fetchMembersAvail() {
    if (!members.length) {
      userSlotSets.clear();
      totalMembers = 0;
      return;
    }
    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const payload = { from: baseEpoch, to: endEpoch, usernames: members };
    const res = await fetch('http://backend.nat20scheduling.com:3000/availability/get_many', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(payload)
    });

    const data = res.ok ? await res.json() : { intervals: {} };
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

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX); applyZoomStyles(); }
      else if (e.key === '0') { zoomFactor = 1.0; applyZoomStyles(); }
    });

    grid.addEventListener('scroll', () => {
      updateNowMarker(); // adjust for scroll
    });
    window.addEventListener('resize', () => {
      updateNowMarker();
    });
  }

  function updateNowMarker() {
    if (!grid || !table || !nowMarker) return;

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const now = new Date();
    const nowEpoch = Math.floor(now.getTime() / 1000);
    if (nowEpoch < baseEpoch || nowEpoch >= endEpoch) {
      nowMarker.style.display = 'none';
      return;
    }

    // minutes since midnight in leader's timezone
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tz,
      hour12: false,
      hour: '2-digit',
      minute: '2-digit'
    }).formatToParts(now);
    const hh = Number(parts.find(p => p.type === 'hour').value);
    const mm = Number(parts.find(p => p.type === 'minute').value);
    const minutes = hh * 60 + mm;

    const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const thead = table.tHead;
    const headerH = thead ? thead.getBoundingClientRect().height : 0;

    const slotIndexFloat = minutes / 30; // e.g., 9:15 -> 18.5
    const contentY = headerH + slotIndexFloat * rowH;
    const visibleY = contentY - grid.scrollTop;

    nowMarker.style.display = 'block';
    nowMarker.style.top = `${visibleY}px`;
  }

  function attachUI() {
    document.getElementById('prev-week').addEventListener('click', async () => {
      weekOffset -= 1;
      await fetchMembersAvail();
      buildGrid();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      weekOffset += 1;
      await fetchMembersAvail();
      buildGrid();
    });

    document.getElementById('add-user-btn').addEventListener('click', addUserFromInput);
    document.getElementById('add-username').addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); addUserFromInput(); }
    });
    const addMeBtn = document.getElementById('add-me-btn');
    addMeBtn.addEventListener('click', () => {
      if (!currentUsername) return;
      if (!members.includes(currentUsername)) {
        members.push(currentUsername);
        renderMemberList();
        rebuild();
      }
    });

    document.getElementById('find-btn').addEventListener('click', () => {
      const results = computeCandidates();
      renderResults(results);
    });
  }

  function addUserFromInput() {
    const inp = document.getElementById('add-username');
    const val = inp.value.trim();
    if (!val) return;
    if (!members.includes(val)) {
      members.push(val);
      renderMemberList();
      rebuild();
    }
    inp.value = '';
  }

  function removeMember(uname) {
    members = members.filter(u => u !== uname);
    renderMemberList();
    rebuild();
  }

  async function rebuild() {
    await fetchMembersAvail();
    buildGrid();
  }

  function renderMemberList() {
    const ul = document.getElementById('member-list');
    ul.innerHTML = '';
    for (const u of members) {
      const li = document.createElement('li');
      li.innerHTML = `<span>${u}</span>`;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.addEventListener('click', () => removeMember(u));
      li.appendChild(btn);
      ul.appendChild(li);
    }
    const maxMissing = document.getElementById('max-missing');
    maxMissing.max = String(Math.max(0, members.length));
  }

  function applyFilterDimming() {
    const maxMissingEl = document.getElementById('max-missing');
    const maxMissing = Math.max(0, Number(maxMissingEl.value || 0));
    const cells = table.querySelectorAll('td.slot-cell');
    for (const td of cells) {
      const epoch = Number(td.dataset.epoch);
      const count = slotCount(epoch);
      const missing = totalMembers - count;
      if (totalMembers > 0 && missing > maxMissing) td.classList.add('dim');
      else td.classList.remove('dim');
    }
  }

  function computeCandidates() {
    const maxMissing = Math.max(0, Number(document.getElementById('max-missing').value || 0));
    const minHours = Math.max(0, Number(document.getElementById('min-hours').value || 0));
    const minMins = Math.max(0, Number(document.getElementById('min-mins').value || 0));
    const minDurationSec = (minHours * 60 + minMins) * 60;
    const sortMethod = document.getElementById('sort-method').value;

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const slots = [];
    for (let t = baseEpoch; t < endEpoch; t += SLOT_SEC) {
      const available = [];
      for (const u of members) {
        const set = userSlotSets.get(u);
        if (set && set.has(t)) available.push(u);
      }
      const key = available.slice().sort().join('|'); // constant set key
      slots.push({ t, available, key });
    }

    const segments = [];
    let segStart = null, segKey = null, segAvail = null;
    for (const s of slots) {
      if (segKey === null) {
        segStart = s.t;
        segKey = s.key;
        segAvail = s.available;
      } else if (s.key !== segKey) {
        const segEnd = s.t;
        if (segAvail) {
          const participants = segAvail.length;
          const missing = totalMembers - participants;
          const duration = segEnd - segStart;
          if (participants > 0 && missing <= maxMissing && duration >= minDurationSec) {
            segments.push({ from: segStart, to: segEnd, participants, missing, users: segAvail.slice() });
          }
        }
        segStart = s.t;
        segKey = s.key;
        segAvail = s.available;
      }
    }
    if (segKey !== null) {
      const segEnd = endEpoch;
      if (segAvail) {
        const participants = segAvail.length;
        const missing = totalMembers - participants;
        const duration = segEnd - segStart;
        if (participants > 0 && missing <= maxMissing && duration >= minDurationSec) {
          segments.push({ from: segStart, to: segEnd, participants, missing, users: segAvail.slice() });
        }
      }
    }

    segments.sort((a, b) => {
      if (sortMethod === 'earliest') return a.from - b.from;
      if (sortMethod === 'latest') return b.from - a.from;
      if (sortMethod === 'longest') return (b.to - b.from) - (a.to - a.from) || a.from - b.from;
      if (sortMethod === 'most') return (b.participants - a.participants) || ((b.to - b.from) - (a.to - a.from)) || (a.from - b.from);
      return a.from - b.from;
    });

    return segments.slice(0, 50);
  }

  function formatRangeLocal(fromSec, toSec) {
    const opts = { timeZone: tz, hour12, weekday: 'short', month: 'short', day: 'numeric',
                   hour: '2-digit', minute: '2-digit' };
    const fmt = new Intl.DateTimeFormat(undefined, opts);
    const a = fmt.format(new Date(fromSec * 1000));
    const b = new Intl.DateTimeFormat(undefined, { timeZone: tz, hour12, hour: '2-digit', minute: '2-digit' }).format(new Date(toSec * 1000));
    return `${a} – ${b}`;
  }

  function clearHighlights() {
    table.querySelectorAll('.slot-cell.highlight').forEach(el => el.classList.remove('highlight'));
  }

  function highlightRange(fromSec, toSec) {
    for (let t = fromSec; t < toSec; t += SLOT_SEC) {
      const cell = table.querySelector(`td.slot-cell[data-epoch="${t}"]`);
      if (cell) cell.classList.add('highlight');
    }
  }

  function renderResults(list) {
    applyFilterDimming();
    const wrap = document.getElementById('results');
    wrap.innerHTML = '';
    if (!list.length) {
      wrap.textContent = 'No matches.';
      return;
    }
    for (const item of list) {
      const div = document.createElement('div');
      div.className = 'result';
      const durMin = Math.round((item.to - item.from) / 60);
      div.innerHTML = `
        <div class="res-top">${formatRangeLocal(item.from, item.to)}</div>
        <div class="res-sub">${item.participants}/${totalMembers} available · ${minutesToHhmm(durMin)}</div>
        <div class="res-users">Users: ${item.users.join(', ')}</div>
      `;
      div.addEventListener('mouseenter', () => { clearHighlights(); highlightRange(item.from, item.to); });
      div.addEventListener('mouseleave', () => { clearHighlights(); });
      wrap.appendChild(div);
    }
  }

  async function init() {
    table = document.getElementById('scheduler-table');
    grid = document.getElementById('grid');
    nowMarker = document.getElementById('now-marker');
    attachUI();
    await loadSettings();
    await fetchMembersAvail();
    buildGrid();

    // re-apply dimming when filter inputs change
    document.getElementById('max-missing').addEventListener('input', applyFilterDimming);
    document.getElementById('min-hours').addEventListener('input', () => {});
    document.getElementById('min-mins').addEventListener('input', () => {});

    // update "now" marker periodically
    setInterval(updateNowMarker, 60000);
  }

  function setAuth(auth, username) {
    isAuthenticated = !!auth;
    currentUsername = username || null;
  }

  window.scheduler = { init, setAuth };
})();
