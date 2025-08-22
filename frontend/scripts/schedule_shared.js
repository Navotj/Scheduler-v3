/* schedule_shared.js
   Minimal shared utilities for NAT20 scheduling pages.
   Includes time helpers, 7-day table builder, week label helper,
   NOW marker positioning, and vertical zoom helpers.
   Intent: no visual changes by itself; pages keep their own CSS & behavior.
*/
(function () {
  'use strict';

  const Shared = {};

  // ---- Constants (pages may override via options) ----
  Shared.DEFAULTS = {
    GRID_DAYS: 7,
    SLOTS_PER_HOUR: 2,     // 30-min slots
    HOURS_START: 0,
    HOURS_END: 24
  };

  // ---- Time helpers (mirror original page logic) ----
  Shared.resolveTimezone = function resolveTimezone() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  };

  Shared.tzOffsetMinutes = function tzOffsetMinutes(tzName, date) {
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
  };

  Shared.epochFromZoned = function epochFromZoned(y, m, d, hh, mm, tzName) {
    const utc = Date.UTC(y, m - 1, d, hh, mm, 0);
    const fake = new Date(utc);
    const off = Shared.tzOffsetMinutes(tzName, fake);
    return Math.floor((utc - off * 60000) / 1000);
  };

  Shared.getTodayYMDInTZ = function getTodayYMDInTZ(tzName) {
    const now = new Date();
    const off = Shared.tzOffsetMinutes(tzName, now);
    const local = new Date(now.getTime() + off * 60000);
    return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
  };

  Shared.ymdAddDays = function ymdAddDays(ymd, days) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + days * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  Shared.weekdayIndexInTZ = function weekdayIndexInTZ(ymd, tzName) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    const tzOff = Shared.tzOffsetMinutes(tzName, dt);
    const local = new Date(dt.getTime() + tzOff * 60000);
    return local.getUTCDay();
  };

  Shared.formatHourLabel = function formatHourLabel(h, hour12) {
    if (hour12) {
      const ampm = h < 12 ? 'AM' : 'PM';
      const hh = h % 12 === 0 ? 12 : h % 12;
      return `${hh}:00 ${ampm}`;
    }
    const hh = h.toString().padStart(2, '0');
    return `${hh}:00`;
  };

  // ---- Week base (start of week in local TZ) ----
  Shared.getWeekStartEpochAndYMD = function getWeekStartEpochAndYMD(opts) {
    const tzName = opts.tzName;
    const weekStartIdx = opts.weekStartIdx ?? 1; // 1=Mon
    const today = Shared.getTodayYMDInTZ(tzName);
    const dow = Shared.weekdayIndexInTZ(today, tzName);
    const delta = (dow - weekStartIdx + 7) % 7;
    const baseYMD = Shared.ymdAddDays(today, -delta + (opts.weekOffset || 0) * 7);
    const baseEpoch = Shared.epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tzName);
    return { baseEpoch, baseYMD };
  };

  // ---- Build 7-day table skeleton (thead+tbody) ----
  // options: { tzName, weekStartIdx, weekOffset, hour12, SLOTS_PER_HOUR, HOURS_START, HOURS_END, onCreateCell, selectedEpochs? }
  Shared.buildWeekTable = function buildWeekTable(tableEl, options) {
    const DEF = Shared.DEFAULTS;
    const opt = Object.assign({}, DEF, options || {});
    const tzName = opt.tzName || Shared.resolveTimezone();
    const GRID_DAYS = DEF.GRID_DAYS;
    const { baseEpoch, baseYMD } = Shared.getWeekStartEpochAndYMD({ tzName, weekStartIdx: opt.weekStartIdx, weekOffset: opt.weekOffset });

    tableEl.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const dayEpochs = [];
    for (let i = 0; i < GRID_DAYS; i++) {
      const ymd = Shared.ymdAddDays(baseYMD, i);
      const dayEpoch = Shared.epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, tzName);
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
    tableEl.appendChild(thead);

    const tbody = document.createElement('tbody');
    const rowsPerDay = (opt.HOURS_END - opt.HOURS_START) * opt.SLOTS_PER_HOUR;
    const slotSeconds = (3600 / opt.SLOTS_PER_HOUR);

    for (let r = 0; r < rowsPerDay; r++) {
      const tr = document.createElement('tr');

      if (r % opt.SLOTS_PER_HOUR === 0) {
        const hour = opt.HOURS_START + Math.floor(r / opt.SLOTS_PER_HOUR);
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.textContent = Shared.formatHourLabel(hour, !!opt.hour12);
        tr.appendChild(th);
      } else {
        const th = document.createElement('th');
        th.className = 'time-col';
        th.textContent = '';
        tr.appendChild(th);
      }

      for (let c = 0; c < GRID_DAYS; c++) {
        const startEpoch = dayEpochs[c].epoch + r * slotSeconds;
        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.epoch = String(startEpoch);
        td.dataset.day = String(c);
        td.dataset.row = String(r);

        if (opt.selectedEpochs && opt.selectedEpochs.has(startEpoch)) td.classList.add('selected');

        if (typeof opt.onCreateCell === 'function') {
          opt.onCreateCell(td, { day: c, row: r, epoch: startEpoch });
        }
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    tableEl.appendChild(tbody);

    return { baseEpoch, baseYMD, dayEpochs, rowsPerDay, slotSeconds, tzName };
  };

  // ---- Week label ----
  Shared.renderWeekLabel = function renderWeekLabel(labelEl, baseEpoch, tzName) {
    if (!labelEl) return;
    const start = new Date(baseEpoch * 1000);
    const end = new Date((baseEpoch + 6 * 86400) * 1000);
    const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tzName, month: 'short', day: 'numeric' });
    labelEl.textContent = `${fmt.format(start)} – ${fmt.format(end)}`;
  };

  // ---- NOW marker helpers (no z-index here; pages style it) ----
  Shared.ensureNowMarker = function ensureNowMarker(gridContentEl) {
    let nowMarker = gridContentEl.querySelector('.now-marker');
    if (!nowMarker) {
      nowMarker = document.createElement('div');
      nowMarker.className = 'now-marker';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'NOW';
      nowMarker.appendChild(bubble);
      gridContentEl.appendChild(nowMarker);
    }
    return nowMarker;
  };

  Shared.positionNowMarker = function positionNowMarker(params) {
    const { tableEl, gridContentEl, baseEpoch, tzName, hoursStart = 0, slotsPerHour = 2 } = params;
    if (!tableEl || !gridContentEl) return;
    const thead = tableEl.querySelector('thead');

    const nowEpoch = Math.floor(Date.now() / 1000);
    const start = baseEpoch;
    const end = start + 7 * 86400;

    const marker = Shared.ensureNowMarker(gridContentEl);
    if (nowEpoch < start || nowEpoch >= end) {
      marker.style.display = 'none';
      return;
    }

    const dayIndex = Math.floor((nowEpoch - start) / 86400);
    const dayStartEpoch = start + dayIndex * 86400;

    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const theadH = thead ? thead.offsetHeight : 0;

    const parts = new Date(dayStartEpoch * 1000);
    const localStart = Shared.epochFromZoned(parts.getUTCFullYear(), parts.getUTCMonth() + 1, parts.getUTCDate(), 0, 0, tzName);
    const offSec = nowEpoch - localStart;

    const secondsPerRow = (3600 / slotsPerHour);
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
  };

  Shared.bindNowMarkerAuto = function bindNowMarkerAuto(tableEl, gridContentEl, getCtx) {
    // getCtx() should return { baseEpoch, tzName, hoursStart, slotsPerHour }
    const update = () => {
      const ctx = getCtx && getCtx();
      if (!ctx) return;
      Shared.positionNowMarker({
        tableEl, gridContentEl,
        baseEpoch: ctx.baseEpoch,
        tzName: ctx.tzName,
        hoursStart: ctx.hoursStart,
        slotsPerHour: ctx.slotsPerHour
      });
    };
    gridContentEl.addEventListener('scroll', () => requestAnimationFrame(update));
    window.addEventListener('resize', () => requestAnimationFrame(update));
    setInterval(update, 60000);
    update();
  };

  // ---- Zoom helpers (vertical) ----
  Shared.applyZoomStyles = function applyZoomStyles(zoomFactor) {
    const base = 18;
    const px = Math.max(10, Math.min(42, Math.round(base * zoomFactor)));
    document.documentElement.style.setProperty('--row-height', `${px}px`);
  };

  Shared.initialZoomToFit24h = function initialZoomToFit24h(tableEl, contentEl, rowsPerDay, minZoom = 0.35, maxZoom = 2.0) {
    const base = 18;
    const thead = tableEl.querySelector('thead');
    if (!thead || !contentEl) return { zoom: 1, min: minZoom };
    const available = Math.max(0, contentEl.clientHeight - thead.offsetHeight - 2);
    const needed = rowsPerDay * base;
    const zFit = Math.max(available / needed, minZoom);
    const z = Math.min(zFit, maxZoom);
    return { zoom: z, min: z };
  };

  window.scheduleShared = Shared;
})();
