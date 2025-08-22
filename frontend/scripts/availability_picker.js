// NAT20 Availability Picker — keeps user selection grid (30-min slots), supports drag-add/subtract.
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

  // ---- State ----
  let tzName = resolveTimezone();
  let weekStartIdx = 1; // 1=Mon
  let weekOffset = 0;   // how many weeks offset from "this week"
  let hour12 = false;

  let zoomFactor = 1.0;
  let zoomMinFit = 0.35;

  const selected = new Set(); // epoch seconds for selected slots

  // elements
  let grid, gridContent, table, weekLabelEl, dragHintEl, signinTooltipEl;

  // ---- Utilities (time) ----
  function resolveTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
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
    const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day),
                           Number(map.hour), Number(map.minute), Number(map.second));
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

  function formatHourLabel(h, hour12) {
    if (hour12) {
      const ampm = h < 12 ? 'AM' : 'PM';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return `${hh}:00 ${ampm}`;
    }
    const hh = h.toString().padStart(2, '0');
    return `${hh}:00`;
  }

  // ---- Grid base (start of this week in local TZ) ----
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

  // ---- Build table skeleton ----
  function buildGrid() {
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

        if (selected.has(startEpoch)) td.classList.add('selected');

        attachEvents(td, { day: c, row: r, epoch: startEpoch });
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    // Label
    renderWeekLabel(dayEpochs[0].epoch);

    // Fit zoom to container, then ensure NOW marker position
    initialZoomToFit24h();

    ensureNowMarker();
    bindNowMarker();
    markPastCells(dayEpochs[0].epoch);
  }

  function renderWeekLabel(baseEpoch) {
    if (!weekLabelEl) return;
    const start = new Date(baseEpoch * 1000);
    const end = new Date((baseEpoch + 6 * 86400) * 1000);
    const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tzName, month: 'short', day: 'numeric' });
    weekLabelEl.textContent = `${fmt.format(start)} – ${fmt.format(end)}`;
  }

  // ---- NOW marker ----
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

  // ---- Past cells within current 7-day range ----
  function markPastCells(rangeStartEpoch) {
    const now = Math.floor(Date.now() / 1000);
    const start = rangeStartEpoch;
    const end = start + 7 * 86400;

    const cells = table.querySelectorAll('tbody td.slot-cell');
    for (const td of cells) {
      const ep = +td.dataset.epoch;
      td.classList.toggle('past', ep < now && ep >= start && ep < end);
    }
  }

  // ---- Selection drag logic ----
  let mode = 'add'; // 'add' | 'subtract'
  let dragging = false;
  let dragWillSelect = true;
  let dragStart = null;

  function attachEvents(td, info) {
    td.addEventListener('mousedown', (e) => {
      if (e.button !== 0) return;
      dragging = true;
      dragStart = info.epoch;
      dragWillSelect = (mode === 'add') ? !selected.has(info.epoch) : false;
      td.classList.add(dragWillSelect ? 'preview-add' : 'preview-sub');
      showDragHint(e.clientX, e.clientY);
      e.preventDefault();
    });
    td.addEventListener('mouseenter', (e) => {
      if (!dragging) return;
      td.classList.add(dragWillSelect ? 'preview-add' : 'preview-sub');
      showDragHint(e.clientX, e.clientY);
    });
    td.addEventListener('mouseleave', () => {
      if (!dragging) return;
      td.classList.remove('preview-add', 'preview-sub');
    });
  }

  document.addEventListener('mouseup', (e) => {
    if (!dragging) return;
    dragging = false;
    hideDragHint();

    const over = document.elementFromPoint(e.clientX, e.clientY);
    const endEpoch = (over && over.closest && over.closest('td.slot-cell')) ? +over.closest('td.slot-cell').dataset.epoch : dragStart;

    const a = Math.min(dragStart, endEpoch);
    const b = Math.max(dragStart, endEpoch);
    for (let ep = a; ep <= b; ep += SLOT_SEC) {
      if (mode === 'add') selected.add(ep);
      else selected.delete(ep);
    }
    rebuildSelections();
  });

  function rebuildSelections() {
    const tds = table.querySelectorAll('tbody td.slot-cell');
    for (const td of tds) {
      const ep = +td.dataset.epoch;
      td.classList.toggle('selected', selected.has(ep));
      td.classList.remove('preview-add', 'preview-sub');
    }
  }

  // ---- Drag hint ----
  function ensureDragHint() {
    if (dragHintEl) return dragHintEl;
    dragHintEl = document.createElement('div');
    dragHintEl.className = 'drag-hint';
    document.body.appendChild(dragHintEl);
    return dragHintEl;
  }
  function showDragHint(x, y) {
    const el = ensureDragHint();
    el.style.display = 'block';
    el.style.transform = `translate(${x + 12}px, ${y + 14}px)`;
    el.textContent = mode === 'add' ? 'Add slots' : 'Subtract slots';
  }
  function hideDragHint() { if (dragHintEl) dragHintEl.style.display = 'none'; }

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
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + 0.08, zoomMinFit, 2.0); applyZoomStyles(); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - 0.08, zoomMinFit, 2.0); applyZoomStyles(); }
    });
  }

  // ---- Controls & Auth ----
  function setupControls() {
    document.getElementById('prev-week')?.addEventListener('click', () => { weekOffset -= 1; buildGrid(); });
    document.getElementById('next-week')?.addEventListener('click', () => { weekOffset += 1; buildGrid(); });

    document.getElementById('mode-add')?.addEventListener('click', function () {
      mode = 'add'; this.classList.add('active');
      document.getElementById('mode-subtract')?.classList.remove('active');
    });
    document.getElementById('mode-subtract')?.addEventListener('click', function () {
      mode = 'subtract'; this.classList.add('active');
      document.getElementById('mode-add')?.classList.remove('active');
    });

    document.getElementById('save')?.addEventListener('click', saveAvailability);
  }

  function setAuth(isAuthed) {
    if (!signinTooltipEl) return;
    if (isAuthed) {
      signinTooltipEl.style.display = 'none';
    } else {
      signinTooltipEl.style.display = 'block';
      setTimeout(() => (signinTooltipEl.style.display = 'none'), 1800);
    }
  }

  // ---- Server I/O ----
  async function loadAvailability() {
    try {
      const res = await fetch('/availability/get', { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) return;
      const data = await res.json();
      selected.clear();
      if (Array.isArray(data?.slots)) {
        for (const ep of data.slots) selected.add(+ep);
      }
      rebuildSelections();
    } catch {}
  }

  async function saveAvailability() {
    try {
      const body = JSON.stringify({ slots: Array.from(selected).sort((a, b) => a - b) });
      const res = await fetch('/availability/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body
      });
      if (!res.ok) throw new Error('save failed');
    } catch (e) {
      console.error(e);
    }
  }

  // ---- Utils ----
  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  // ---- Init ----
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
    table = document.getElementById('schedule-table');
    weekLabelEl = document.getElementById('week-label');
    signinTooltipEl = document.getElementById('signin-tooltip');

    setupControls();
    buildGrid();
    setupZoomHandlers();

    window.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        initialZoomToFit24h();
      });
    });

    loadAvailability();
  }

  window.schedule = {
    init,
    setAuth
  };

})();
