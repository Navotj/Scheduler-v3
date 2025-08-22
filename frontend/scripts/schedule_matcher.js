/* Group Scheduler — refactored to use schedule_shared.js for grid/now/zoom.
   Keeps members/filters/results logic on the client side using /availability/get.
*/
(function () {
  'use strict';

  const Shared = window.scheduleShared;
  const DEF = Shared.DEFAULTS;

  // ---- State ----
  let tz = Shared.resolveTimezone();
  let weekStartIdx = 1; // Monday
  let weekOffset = 0;
  let hour12 = false;

  let zoomFactor = 1.0;
  let zoomMinFit = 0.35;

  let isAuthenticated = false;
  let currentUsername = null;

  const members = new Set();
  let heatmap = []; // computed per rebuild (counts)
  let lastBuildCtx = null;

  // Elements
  let grid, gridContent, table, controlsEl, rightColEl, resultsPanelEl, resultsEl, tooltipEl;

  // ---- Init / Auth ----
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
        const fit = Shared.initialZoomToFit24h(table, gridContent, lastBuildCtx?.rowsPerDay || 48, DEF.ZOOM_MIN, DEF.ZOOM_MAX);
        zoomMinFit = fit.min;
        zoomFactor = Math.max(zoomFactor, fit.min);
        Shared.applyZoomStyles(zoomFactor);
      });
    });

    syncResultsHeight();
  }

  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;
  }

  // ---- Build Grid ----
  function buildTable() {
    const ctx = Shared.buildWeekTable(table, {
      tz, hour12, weekStartIdx, weekOffset,
      SLOTS_PER_HOUR: DEF.SLOTS_PER_HOUR,
      HOURS_START: DEF.HOURS_START,
      HOURS_END: DEF.HOURS_END,
      onCreateCell: attachCellHover
    });
    lastBuildCtx = ctx;

    // Fit zoom
    const fit = Shared.initialZoomToFit24h(table, gridContent, ctx.rowsPerDay, DEF.ZOOM_MIN, DEF.ZOOM_MAX);
    zoomMinFit = fit.min;
    zoomFactor = Math.max(zoomFactor, fit.min);
    Shared.applyZoomStyles(zoomFactor);

    // NOW marker
    Shared.bindNowMarkerAuto(table, gridContent, () => ({
      baseEpoch: ctx.dayEpochs[0].epoch, tz,
      hoursStart: DEF.HOURS_START, slotsPerHour: DEF.SLOTS_PER_HOUR
    }));

    // Recompute counts for current member list
    recompute();
  }

  // ---- Cell hover tooltip ----
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
  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return;
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * DEF.ZOOM_STEP, zoomMinFit, DEF.ZOOM_MAX);
      Shared.applyZoomStyles(zoomFactor);
      syncResultsHeight();
    }, { passive: false });
  }

  function syncResultsHeight() {
    // Keep results panel height aligned with grid visible area
    if (!rightColEl || !resultsPanelEl) return;
    const gridRect = grid.getBoundingClientRect();
    const top = gridRect.top;
    const vh = window.innerHeight || document.documentElement.clientHeight;
    const available = Math.max(120, vh - top - 24);
    resultsPanelEl.style.height = `${available}px`;
    resultsEl.style.height = `${Math.max(60, available - (resultsPanelEl.querySelector('h3').offsetHeight + 18))}px`;
  }

  // ---- Compute availability heatmap & results ----
  async function recompute() {
    if (!lastBuildCtx) return;

    // Fetch each member's availability for the visible 7 days
    const day0 = lastBuildCtx.dayEpochs[0].epoch;
    const day7 = day0 + 7 * 86400;
    const slotSec = lastBuildCtx.slotSeconds;

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

    // Build counts map for this 7-day window
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
      // Simple 5-step gradient from grey -> green
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

    const slotSec = lastBuildCtx.slotSeconds;
    const needUsers = Math.max(0, members.size - maxMissing);

    const segments = []; // { start, end, users }
    // Scan day by day
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
          } else {
            // continue
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

    // Sort variants
    const tzFmt = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', hour: '2-digit', minute: '2-digit', month: 'short', day: 'numeric' });
    const sorters = {
      'most': (a, b) => b.users.length - a.users.length || a.start - b.start,
      'longest': (a, b) => (b.end - b.start) - (a.end - a.start),
      'earliest': (a, b) => a.start - b.start,
      'latest': (a, b) => b.start - a.start,
      'earliest-week': (a, b) => a.start - b.start,
      'latest-week': (a, b) => b.start - a.start
    };
    segments.sort(sorters[sort] || sorters['most']);

    // Render
    resultsEl.innerHTML = '';
    for (const seg of segments.slice(0, 200)) {
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
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // ---- Expose ----
  window.scheduler = {
    init,
    setAuth
  };

  document.addEventListener('DOMContentLoaded', init);
})();
