// NAT20 Group Scheduler — computes group availability heatmap and candidate ranges.
// This file is the original implementation with styling/behavior as provided.

/* global navigator */

(function () {
  'use strict';

  // ---- Constants ----
  const GRID_DAYS = 7;
  const SLOTS_PER_HOUR = 2; // 30-min slots
  const SLOT_SEC = 3600 / SLOTS_PER_HOUR;
  const HOURS_START = 0;
  const HOURS_END = 24;

  const MAX_RESULTS = 200;

  // ---- State ----
  let tzName = resolveTimezone();
  let weekStartIdx = 1; // Monday
  let weekOffset = 0;
  let hour12 = false;

  let zoomFactor = 1.0;
  let zoomMinFit = 0.35;

  let isAuthenticated = false;
  let currentUsername = null;

  const members = new Set();
  let selectedUsers = []; // for results intros
  let heatmap = []; // computed per rebuild (counts)
  let lastBuildCtx = null;

  // Elements
  let grid, gridContent, table, controlsEl, rightColEl, resultsPanelEl, resultsEl, tooltipEl;

  // ---- Utilities (time/format) ----
  function resolveTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }

  function tzOffsetMinutes(tzName, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function epochFromZoned(y, m, d, hh, mm, tzName) {
    const utc = Date.UTC(y, m - 1, d, hh, mm, 0);
    const fake = new Date(utc);
    const off = tzOffsetMinutes(tzName, fake);
    return Math.floor((utc - off * 60000) / 1000);
  }

  function getTodayYMDInTZ(tzName) {
    const now = new Date();
    const off = tzOffsetMinutes(tzName, now);
    const local = new Date(now.getTime() + off * 60000);
    return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
  }

  function ymdAddDays(ymd, days) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + days * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  }

  function weekdayIndexInTZ(ymd, tzName) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    const tzOff = tzOffsetMinutes(tzName, dt);
    const local = new Date(dt.getTime() + tzOff * 60000);
    return local.getUTCDay();
  }

  function fmtTime(epochSec) {
    const d = new Date(epochSec * 1000);
    return new Intl.DateTimeFormat(undefined, {
      timeZone: tzName,
      weekday: 'short',
      month: 'short',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    }).format(d);
  }

  function fmtRangeSec(a, b) {
    const hours = (b - a) / 3600;
    return `${fmtTime(a)} → ${fmtTime(b)} (${hours % 1 === 0 ? hours.toFixed(0) : hours.toFixed(1)}h)`;
  }

  // ---- Build Grid ----
  function getWeekStartEpochAndYMD(opts) {
    const tz = opts.tzName;
    const weekStartIdx = opts.weekStartIdx ?? 1; // 1=Mon
    const today = getTodayYMDInTZ(tz);
    const dow = weekdayIndexInTZ(today, tz);
    const delta = (dow - weekStartIdx + 7) % 7;
    const baseYMD = ymdAddDays(today, -delta + (opts.weekOffset || 0) * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  }

  function buildTable() {
    table.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const dayEpochs = [];
    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD({ tzName, weekStartIdx, weekOffset });

    for (let i = 0; i < GRID_DAYS; i++) {
      const ymd = ymdAddDays(baseYMD, i);
      const dayEpoch = epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, tzName);
      dayEpochs.push({ ymd, epoch: dayEpoch });

      const th = document.createElement('th');
      th.className = 'day';
      th.dataset.dayIndex = String(i);
      th.textContent = new Intl.DateTimeFormat(undefined, {
        timeZone: tzName, weekday: 'short', month: 'short', day: 'numeric'
      }).format(new Date(dayEpoch * 1000));
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rowsPerDay = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let r = 0; r < rowsPerDay; r++) {
      const tr = document.createElement('tr');

      if (r % SLOTS_PER_HOUR === 0) {
        const hour = HOURS_START + Math.floor(r / SLOTS_PER_HOUR);
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.textContent = formatHourLabel(hour, hour12);
        tr.appendChild(th);
      } else {
        const th = document.createElement('th');
        th.className = 'time-col';
        th.textContent = '';
        tr.appendChild(th);
      }

      for (let c = 0; c < GRID_DAYS; c++) {
        const startEpoch = dayEpochs[c].epoch + r * SLOT_SEC;
        const td = document.createElement('td');
        td.className = 'slot-cell';

        td.dataset.epoch = String(startEpoch);
        td.dataset.day = String(c);
        td.dataset.row = String(r);

        attachCellHover(td, { day: c, row: r, epoch: startEpoch });
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // Fit zoom and NOW marker
    initialZoomToFit24h();
    ensureNowMarker();
    bindNowMarker();

    lastBuildCtx = { dayEpochs, rowsPerDay, slotSec: SLOT_SEC };

    // Recompute for existing members
    recompute();
  }

  function formatHourLabel(h, hour12) {
    if (hour12) {
      const ampm = h < 12 ? 'AM' : 'PM';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return `${hh}:00 ${ampm}`;
    }
    const hh = h.toString().padStart(2, '0');
    return `${hh}:00`;
  }

  // ---- NOW marker (identical behavior to original) ----
  function ensureNowMarker() {
    let nowMarker = gridContent.querySelector('.now-marker');
    if (!nowMarker) {
      nowMarker = document.createElement('div');
      nowMarker.className = 'now-marker';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'NOW';
      nowMarker.appendChild(bubble);
      gridContent.appendChild(nowMarker);
    }
    return nowMarker;
  }

  function bindNowMarker() {
    const update = () => positionNow();
    gridContent.addEventListener('scroll', () => requestAnimationFrame(update));
    window.addEventListener('resize', () => requestAnimationFrame(update));
    setInterval(update, 60000);
    update();
  }

  function positionNow() {
    const tableEl = table;
    const gridContentEl = gridContent;
    const thead = tableEl.querySelector('thead');

    const nowEpoch = Math.floor(Date.now() / 1000);
    const ctx = getWeekStartEpochAndYMD({ tzName, weekStartIdx, weekOffset });
    const start = ctx.baseEpoch;
    const end = start + 7 * 86400;

    const marker = ensureNowMarker();
    if (nowEpoch < start || nowEpoch >= end) {
      marker.style.display = 'none';
      return;
    }

    const dayIndex = Math.floor((nowEpoch - start) / 86400);
    const dayStartEpoch = start + dayIndex * 86400;

    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const theadH = thead ? thead.offsetHeight : 0;

    const parts = new Date(dayStartEpoch * 1000);
    const localStart = epochFromZoned(parts.getUTCFullYear(), parts.getUTCMonth() + 1, parts.getUTCDate(), 0, 0, tzName);
    const offSec = nowEpoch - localStart;

    const secondsPerRow = (3600 / SLOTS_PER_HOUR);
    const rowFloat = offSec / secondsPerRow;
    const top = theadH + rowFloat * rowHeight;

    const headerCells = tableEl.querySelectorAll('thead th.day');
    if (!headerCells[dayIndex]) {
      marker.style.display = 'none';
      return;
    }
    const targetHeader = headerCells[dayIndex];
    const tableRect = tableEl.getBoundingClientRect();
    const headRect = targetHeader.getBoundingClientRect();

    const left = headRect.left - tableRect.left;
    const width = headRect.width;

    marker.style.display = 'block';
    marker.style.top = `${top}px`;
    marker.style.left = `${left}px`;
    marker.style.width = `${width}px`;
  }

  // ---- Hover tooltip ----
  function attachCellHover(td, info) {
    td.addEventListener('mousemove', (e) => {
      if (!tooltipEl) return;
      const participants = (heatmap[info.epoch] && heatmap[info.epoch].users) || [];
      tooltipEl.innerHTML = `<strong>${participants.length} available</strong>${participants.length ? `<br>${participants.join(', ')}` : ''}`;
      tooltipEl.style.display = 'block';
      tooltipEl.style.transform = `translate(${e.clientX + 10}px, ${e.clientY - 24}px)`;
    });
    td.addEventListener('mouseleave', () => { if (tooltipEl) tooltipEl.style.display = 'none'; });
  }

  // ---- Controls / Members / Filters ----
  function bindControls() {
    document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset -= 1; buildTable(); });
    document.getElementById('next-week')?.addEventListener('click', () => { weekOffset += 1; buildTable(); });

    document.getElementById('add-user-btn')?.addEventListener('click', addUserFromInput);
    document.getElementById('add-me-btn')?.addEventListener('click', () => { if (currentUsername) addMember(currentUsername); });

    document.getElementById('max-missing')?.addEventListener('input', recompute);
    document.getElementById('min-hours')?.addEventListener('input', recompute);
    document.getElementById('sort-method')?.addEventListener('change', recompute);
  }

  async function addUserFromInput() {
    const inp = document.getElementById('add-username');
    const name = (inp?.value || '').trim();
    if (!name) return;
    addMember(name);
    inp.value = '';
  }

  function addMember(name) {
    if (members.has(name)) return;
    members.add(name);
    renderMembers();
    recompute();
  }

  function removeMember(name) {
    members.delete(name);
    renderMembers();
    recompute();
  }

  function renderMembers() {
    const ul = document.getElementById('member-list');
    if (!ul) return;
    ul.innerHTML = '';
    for (const name of members) {
      const li = document.createElement('li');
      const txt = document.createElement('div');
      txt.textContent = name;
      const rm = document.createElement('button');
      rm.className = 'btn btn-secondary';
      rm.textContent = 'Remove';
      rm.addEventListener('click', () => removeMember(name));
      li.appendChild(txt);
      li.appendChild(rm);
      ul.appendChild(li);
    }
  }

  // ---- Zoom (vertical only) ----
  function applyZoomStyles() {
    const base = 18;
    const px = Math.max(10, Math.min(42, Math.round(base * zoomFactor)));
    document.documentElement.style.setProperty('--row-height', `${px}px`);
  }

  function setupZoomHandlers() {
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * 0.08, zoomMinFit, 2.0);
      applyZoomStyles();
      syncResultsHeight();
    }, { passive: false });
  }

  function syncResultsHeight() {
    if (!rightColEl || !resultsPanelEl) return;
    const gridRect = grid.getBoundingClientRect();
    const top = gridRect.top;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const available = Math.max(120, vh - top - 24);
    resultsPanelEl.style.height = `${available}px`;
    const h3 = resultsPanelEl.querySelector('h3');
    const headH = h3 ? h3.offsetHeight + 18 : 18;
    resultsEl.style.height = `${Math.max(60, available - headH)}px`;
  }

  // ---- Compute availability heatmap & results ----
  async function recompute() {
    if (!lastBuildCtx) return;

    const day0 = lastBuildCtx.dayEpochs[0].epoch;
    const day7 = day0 + 7 * 86400;
    const slotSec = lastBuildCtx.slotSec;

    const userSlots = {};
    await Promise.all(Array.from(members).map(async (u) => {
      try {
        const res = await fetch(`/availability/get?username=${encodeURIComponent(u)}`, { credentials: 'include', cache: 'no-cache' });
        if (!res.ok) return;
        const data = await res.json();
        const set = new Set(Array.isArray(data?.slots) ? data.slots.map(Number) : []);
        userSlots[u] = set;
      } catch {}
    }));

    heatmap = {};
    for (let ep = day0; ep < day7; ep += slotSec) {
      const users = [];
      for (const [uname, set] of Object.entries(userSlots)) {
        if (set.has(ep)) users.push(uname);
      }
      heatmap[ep] = { count: users.length, users };
    }

    colorizeCells();
    buildResults();
  }

  function colorizeCells() {
    const tds = table.querySelectorAll('tbody td.slot-cell');
    const maxCount = Math.max(1, Array.from(Object.values(heatmap)).reduce((m, v) => Math.max(m, v.count), 1));
    for (const td of tds) {
      const ep = +td.dataset.epoch;
      const v = heatmap[ep]?.count || 0;
      const step = v === 0 ? '#181818' :
                   v <= 1 ? '#1e2a1e' :
                   v <= 2 ? '#234b1f' :
                   v <= 3 ? '#2a6f24' :
                            '#2fa12a';
      td.style.backgroundColor = step;
    }
  }

  function buildResults() {
    const maxMissing = parseInt(document.getElementById('max-missing')?.value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours')?.value || '1');
    const sort = (document.getElementById('sort-method')?.value) || 'most';

    const slotSec = lastBuildCtx.slotSec;
    const needUsers = Math.max(0, members.size - maxMissing);

    const segments = [];
    for (let d = 0; d < 7; d++) {
      const dayStart = lastBuildCtx.dayEpochs[d].epoch;
      const dayEnd = dayStart + 86400;
      let curStart = null;
      let curUsers = null;

      for (let ep = dayStart; ep < dayEnd; ep += slotSec) {
        const info = heatmap[ep] || { count: 0, users: [] };
        if (info.count >= needUsers) {
          if (curStart === null) {
            curStart = ep;
            curUsers = info.users.slice().sort();
          }
        } else {
          if (curStart !== null) {
            const end = ep;
            const hours = (end - curStart) / 3600;
            if (hours >= minHours) segments.push({ start: curStart, end, users: curUsers });
            curStart = null;
            curUsers = null;
          }
        }
      }
      if (curStart !== null) {
        const end = dayEnd;
        const hours = (end - curStart) / 3600;
        if (hours >= minHours) segments.push({ start: curStart, end, users: curUsers });
      }
    }

    const tzFmt = new Intl.DateTimeFormat(undefined, { timeZone: tzName, weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    const sorters = {
      'most': (a, b) => b.users.length - a.users.length || a.start - b.start,
      'longest': (a, b) => (b.end - b.start) - (a.end - a.start),
      'earliest': (a, b) => a.start - b.start,
      'latest': (a, b) => b.start - a.start,
      'earliest-week': (a, b) => a.start - b.start,
      'latest-week': (a, b) => b.start - a.start
    };
    segments.sort(sorters[sort] || sorters['most']);

    resultsEl.innerHTML = '';
    for (const seg of segments.slice(0, MAX_RESULTS)) {
      const card = document.createElement('div');
      card.className = 'result';
      const durH = ((seg.end - seg.start) / 3600).toFixed(1).replace(/\.0$/, '');
      const top = document.createElement('div'); top.className = 'res-top';
      top.textContent = `${seg.users.length} can make it — ${durH}h`;
      const sub = document.createElement('div'); sub.className = 'res-sub';
      sub.textContent = `${tzFmt.format(new Date(seg.start * 1000))} → ${tzFmt.format(new Date(seg.end * 1000))}`;
      const who = document.createElement('div'); who.className = 'res-users';
      who.textContent = seg.users.join(', ');
      const btn = document.createElement('button');
      btn.addEventListener('click', () => {
        const text = `${tzFmt.format(new Date(seg.start * 1000))} → ${tzFmt.format(new Date(seg.end * 1000))} (${durH}h)\n${seg.users.join(', ')}`;
        navigator.clipboard?.writeText(text);
      });

      card.appendChild(top);
      card.appendChild(sub);
      card.appendChild(who);
      card.appendChild(btn);
      resultsEl.appendChild(card);
    }
  }

  // ---- Utils ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- Init / Auth ----
  function initialZoomToFit24h() {
    const base = 18;
    const thead = table.querySelector('thead');
    if (!thead || !gridContent) return;
    const available = Math.max(0, gridContent.clientHeight - thead.offsetHeight - 2);
    const needed = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR * base;
    const zFit = Math.max(available / needed, 0.35);
    zoomMinFit = zFit;
    zoomFactor = Math.max(zoomFactor, zFit);
    applyZoomStyles();
  }

  function init() {
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('scheduler-table');
    controlsEl = document.getElementById('controls');
    rightColEl = document.getElementById('right-col');
    resultsPanelEl = document.getElementById('results-panel');
    resultsEl = document.getElementById('results');
    tooltipEl = document.getElementById('cell-tooltip');

    bindControls();
    buildTable();
    setupZoomHandlers();

    window.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        syncResultsHeight();
        initialZoomToFit24h();
      });
    });

    syncResultsHeight();
  }

  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;
  }

  window.scheduler = {
    init,
    setAuth
  };

})();
