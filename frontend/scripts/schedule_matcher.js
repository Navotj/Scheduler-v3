(function () {
  'use strict';

  // --- Constants ---
  const BASE_URL = '';
  const SLOTS_PER_HOUR = 2;        // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 1800;           // 30m in seconds

  // --- State ---
  let weekOffset = 0;              // 0 = current week
  let isAuthenticated = false;
  let currentUsername = null;

  // settings
  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' };
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
  let heatmapName = settings.heatmap || 'viridis';

  // vertical zoom only
  let zoomFactor = 1.0;
  const ZOOM_MIN = 0.7;
  const ZOOM_MAX = 1.6;

  // members
  let members = [];
  let selectedUsers = new Set();

  // refs
  let grid, gridContent, table, nowMarker;
  let addUserInput, addUserBtn, addMeBtn, memberList, memberError;
  let resultsEl, resultsPanel;
  let maxMissingInput, minHoursInput, sortSelect;

  // --- Utilities ---
  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
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

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function formatHourLabel(hour) {
    if (hour12) {
      const h = (hour % 12) || 12; const ampm = hour < 12 ? 'AM' : 'PM';
      return `${h} ${ampm}`;
    }
    return `${String(hour).padStart(2, '0')}:00`;
  }

  function getWeekStartEpoch() {
    const now = Math.floor(Date.now() / 1000);
    const start = startOfThisWeek(now, tz, weekStartIdx);
    return start + weekOffset * 7 * 86400;
  }

  // --- Heatmap palette ---
  function colorFor(value) {
    const v = clamp(value, 0, 1);
    const maps = {
      viridis: [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]],
      plasma: [[13,8,135],[106,0,168],[177,42,144],[225,100,98],[252,166,54]],
      cividis:[[0,32,76],[43,73,110],[126,127,129],[198,197,142],[255,234,70]],
      twilight:[[75,0,85],[59,59,152],[43,122,120],[134,203,146],[243,223,191]],
      lava: [[24,0,26],[107,0,41],[183,28,28],[239,108,0],[255,213,79]]
    }[heatmapName] || [[68,1,84],[59,82,139],[33,145,140],[94,201,98],[253,231,37]];
    const idx = Math.min(4, Math.floor(v * 4));
    const [r,g,b] = maps[idx];
    return `rgb(${r}, ${g}, ${b})`;
  }

  // --- Rendering grid ---
  function buildTable(container) {
    const tbl = document.createElement('table');
    tbl.className = 'table';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');
    trh.appendChild(document.createElement('th'));

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

  // --- Fetch helpers ---
  function authFetch(url, init) {
    return fetch(url, { credentials: 'include', cache: 'no-store', ...(init || {}) });
  }

  async function fetchMembers() {
    const res = await authFetch('/groups/members');
    if (!res.ok) return [];
    return res.json().catch(()=>[]);
  }

  async function fetchHeatmap(startEpoch, endEpoch, users) {
    const res = await authFetch('/groups/heatmap', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ users, start: startEpoch, end: endEpoch })
    });
    if (!res.ok) throw new Error('heatmap');
    return res.json();
  }

  // --- Interactions ---
  function installControls() {
    const prev = document.getElementById('prev-week');
    const next = document.getElementById('next-week');
    if (prev) prev.addEventListener('click', () => { weekOffset--; render(); });
    if (next) next.addEventListener('click', () => { weekOffset++; render(); });

    maxMissingInput = document.getElementById('max-missing');
    minHoursInput = document.getElementById('min-hours');
    sortSelect = document.getElementById('sort-method');
  }

  function installZoom() {
    grid.addEventListener('wheel', (e) => {
      if (e.shiftKey) {
        e.preventDefault();
        const delta = e.deltaY < 0 ? 0.05 : -0.05;
        zoomFactor = clamp(zoomFactor + delta, ZOOM_MIN, ZOOM_MAX);
        document.documentElement.style.setProperty('--zoom', String(zoomFactor));
      }
    }, { passive: false });
  }

  function updateNowMarker(epochStart) {
    if (!nowMarker) return;
    const now = Date.now() / 1000;
    const secIntoWeek = now - epochStart;
    if (secIntoWeek < 0 || secIntoWeek > 7 * 86400) { nowMarker.style.display = 'none'; return; }
    const day = Math.floor(secIntoWeek / 86400);
    const remain = secIntoWeek - day * 86400;
    const fracHour = remain / 3600;
    nowMarker.style.display = 'block';
    nowMarker.style.setProperty('--col', String(day));
    nowMarker.style.setProperty('--row', String(fracHour));
  }

  function installNowTick(epochStart) {
    updateNowMarker(epochStart);
    setInterval(() => updateNowMarker(epochStart), 30000);
  }

  // --- Members UI ---
  function renderMemberList() {
    memberList.innerHTML = '';
    for (const m of members) {
      const li = document.createElement('li');
      const label = document.createElement('label');
      const cb = document.createElement('input');
      cb.type = 'checkbox';
      cb.checked = selectedUsers.has(m);
      cb.addEventListener('change', () => {
        if (cb.checked) selectedUsers.add(m); else selectedUsers.delete(m);
        render(); // recompute heatmap
      });
      label.appendChild(cb);
      const span = document.createElement('span');
      span.textContent = ' ' + m;
      label.appendChild(span);
      li.appendChild(label);
      memberList.appendChild(li);
    }
  }

  async function addUser(username) {
    const u = username.trim();
    if (!u) return;
    if (selectedUsers.has(u)) return;
    selectedUsers.add(u);
    if (!members.includes(u)) members.push(u);
    renderMemberList();
    render();
  }

  function removeUser(username) {
    selectedUsers.delete(username);
    renderMemberList();
    render();
  }

  // --- Results (placeholder simple layout to be rearranged later) ---
  function renderResults(slots) {
    resultsEl.innerHTML = '';
    if (!slots || slots.length === 0) {
      resultsEl.textContent = 'No results';
      return;
    }
    for (const s of slots.slice(0, 25)) {
      const div = document.createElement('div');
      div.className = 'result';
      div.textContent = `${new Date(s.start * 1000).toLocaleString()} – ${new Date(s.end * 1000).toLocaleTimeString()}`;
      resultsEl.appendChild(div);
    }
  }

  // --- Heatmap rendering ---
  function paintHeatmap(values) {
    if (!Array.isArray(values) || values.length !== 7) return;

    const max = Math.max(1, ...values.flat());
    table.querySelectorAll('td').forEach(td => {
      const day = Number(td.getAttribute('data-day'));
      const slot = Number(td.getAttribute('data-slot'));
      const v = values[day]?.[slot] ?? 0;
      const norm = v / max;
      td.style.background = colorFor(norm);
    });
  }

  // --- Fetch + compute ---
  async function computeAndRender() {
    const startEpoch = getWeekStartEpoch();
    const endEpoch = startEpoch + 7 * 86400;

    try {
      const users = Array.from(selectedUsers);
      const heat = await fetchHeatmap(startEpoch, endEpoch, users);
      paintHeatmap(heat.values || heat);
      renderResults(heat.slots || []);
    } catch (e) {
      // noop UI failure is acceptable here
    }
  }

  // --- High-level render ---
  function render() {
    const start = getWeekStartEpoch();
    updateNowMarker(start);
    computeAndRender();
  }

  // --- Auth hooks from shell.js ---
  function setAuth(authenticated, username) {
    isAuthenticated = !!authenticated;
    currentUsername = username || null;
    if (isAuthenticated && currentUsername && !members.includes(currentUsername)) members.push(currentUsername);
    renderMemberList();
  }
  document.addEventListener('auth:changed', (e) => {
    const det = (e && e.detail) || {};
    setAuth(!!det.isAuthenticated, det.username || null);
  });
  window.scheduler = { setAuth };

  // --- Init ---
  function hydrateSettings(base) {
    settings = { ...DEFAULT_SETTINGS, ...(base || {}) };
    tz = resolveTimezone(settings.timezone);
    hour12 = settings.clock === '12';
    weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
    heatmapName = settings.heatmap || 'viridis';
    zoomFactor = Number(settings.defaultZoom || 1.0);
    document.documentElement.style.setProperty('--zoom', String(zoomFactor));
  }

  async function init() {
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('scheduler-table');
    nowMarker = document.getElementById('now-marker');

    addUserInput = document.getElementById('add-username');
    addUserBtn = document.getElementById('add-user-btn');
    addMeBtn = document.getElementById('add-me-btn');
    memberList = document.getElementById('member-list');
    memberError = document.getElementById('member-error');
    resultsEl = document.getElementById('results');
    resultsPanel = document.getElementById('results-panel');

    maxMissingInput = document.getElementById('max-missing');
    minHoursInput = document.getElementById('min-hours');
    sortSelect = document.getElementById('sort-method');

    if (!grid || !gridContent || !table) return;

    buildTable(gridContent);
    installControls();
    installZoom();
    installNowTick(getWeekStartEpoch());

    try {
      const localRaw = localStorage.getItem('nat20_settings');
      if (localRaw) hydrateSettings(JSON.parse(localRaw));
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json().catch(()=> ({}));
        hydrateSettings({ ...settings, ...remote });
      }
    } catch {}

    // members initial
    try {
      members = await fetchMembers();
      renderMemberList();
    } catch {}

    // add/remove
    if (addUserBtn && addUserInput) addUserBtn.addEventListener('click', () => addUser(addUserInput.value));
    if (addMeBtn) addMeBtn.addEventListener('click', () => { if (currentUsername) addUser(currentUsername); });

    render();
  }

  document.addEventListener('DOMContentLoaded', init);
})();
