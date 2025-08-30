(function (global) {
  'use strict';
  if (!global.shared) global.shared = {};

  // ===============================
  // Settings
  // ===============================
  const SETTINGS_KEY = 'nat20_settings';

  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }

  function readSettings() {
    let raw = null;
    try { raw = localStorage.getItem(SETTINGS_KEY); } catch {}
    let s = {};
    try { s = raw ? JSON.parse(raw) : {}; } catch { s = {}; }

    const sysTZ = (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    const tz = resolveTimezone(s.timezone || 'auto') || sysTZ;
    const clock = (s.clock === '12') ? '12' : '24';
    const weekStart = (s.weekStart === 'mon') ? 'mon' : 'sun';
    const heatmap = typeof s.heatmap === 'string' ? s.heatmap : 'viridis';
    const dateFormat = (typeof s.dateFormat === 'string' && ['mon-dd','dd-mm','mm-dd','dd-mon'].includes(s.dateFormat))
      ? s.dateFormat
      : 'mon-dd';
    return { tz, clock, weekStart, heatmap, dateFormat };
  }

  function onSettingsChange(handler) {
    window.addEventListener('storage', (e) => {
      if (e && e.key === SETTINGS_KEY) {
        try { handler(readSettings(), e); } catch {}
      }
    });
  }

  function getSavedDateFormat() {
    try {
      var s = readSettings();
      if (s && typeof s.dateFormat === 'string') return s.dateFormat;
    } catch {}
    return 'mon-dd';
  }

  // ===============================
  // Timezone & Epoch Math (DST-safe)
  // ===============================
  function epochFromZoned(y, m, d, hh, mm, tzName) {
    function wallUTCFromInstant(ms) {
      const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tzName,
        hour12: false,
        year: 'numeric', month: '2-digit', day: '2-digit',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
      const parts = dtf.formatToParts(new Date(ms));
      const map = {};
      for (const p of parts) map[p.type] = p.value;
      return Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    }
    const naive = Date.UTC(y, m - 1, d, hh, mm, 0);
    const offset1 = wallUTCFromInstant(naive) - naive;
    let instant = naive - offset1;
    const offset2 = wallUTCFromInstant(instant) - instant;
    instant = naive - offset2;
    return Math.floor(instant / 1000);
  }

  function getYMDInTZ(date, tzName) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit'
    }).formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
  }

  function todayYMD(tzName) { return getYMDInTZ(new Date(), tzName); }

  function addDays(y, m, d, add) {
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + add);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function weekdayIndexInTZ(epochSec, tzName) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).format(new Date(epochSec * 1000));
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
  }

  function getWeekStartEpochAndYMD(tzName, weekStart /* 'sun'|'mon' */, weekOffset /* int */) {
    const today = todayYMD(tzName);
    const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, tzName);
    const idx = weekdayIndexInTZ(todayMid, tzName);
    const startIdx = (weekStart === 'mon') ? 1 : 0;
    const diff = (idx - startIdx + 7) % 7;
    const baseYMD = addDays(today.y, today.m, today.d, -diff + (weekOffset|0) * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tzName);
    return { baseEpoch, baseYMD };
  }

  function minutesOfDayInTZ(tzName) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(new Date());
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    return (+map.hour) * 60 + (+map.minute) + (+map.second) / 60;
  }

  // ===============================
  // Formatting
  // ===============================
  function formatHourLabel(clock, hour, opts) {
    if (clock === '12') {
      const h12 = (hour % 12) === 0 ? 12 : (hour % 12);
      const upper = !opts || opts.ampmCase !== 'lower';
      const ampm = hour < 12 ? (upper ? 'AM' : 'am') : (upper ? 'PM' : 'pm');
      return `${h12}:00 ${ampm}`;
    }
    return String(hour).padStart(2, '0') + ':00';
  }

  function headerLabelFor(tzName, epochSec, dateFormat) {
    const d = new Date(epochSec * 1000);
    const weekday = new Intl.DateTimeFormat(undefined, { timeZone: tzName, weekday: 'short' }).format(d);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(d);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const moNum = String(+map.month);
    const ddNum = String(+map.day);
    const monName = ['jan','feb','mar','apr','may','jun','jul','aug','sep','oct','nov','dec'][+map.month - 1];

    let dateText;
    switch (dateFormat) {
      case 'dd-mm':  dateText = `${ddNum}/${moNum}`; break;
      case 'mm-dd':  dateText = `${moNum}/${ddNum}`; break;
      case 'dd-mon': dateText = `${ddNum} ${monName}`; break;
      default:       dateText = `${monName} ${ddNum}`;
    }
    return `${weekday}, ${dateText}`;
  }

  function renderWeekRangeLabel(target, startEpoch, tzName) {
    const el = (typeof target === 'string') ? document.getElementById(target) : target;
    if (!el) return;
    const startDate = new Date(startEpoch * 1000);
    const endDate = new Date((startEpoch + 6 * 86400) * 1000);
    const fmt = (dt) => new Intl.DateTimeFormat(undefined, { timeZone: tzName, month: 'short', day: 'numeric' }).format(dt);
    const startYear = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric' }).format(startDate);
    const endYear = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric' }).format(endDate);
    const year = (startYear === endYear) ? startYear : (startYear + '–' + endYear);
    el.textContent = `${fmt(startDate)} – ${fmt(endDate)}, ${year}`;
  }

  function formatRangeSec(tzName, startSec, endSec, hour12) {
    var a = new Date(startSec * 1000);
    var b = new Date(endSec * 1000);
    var dow = new Intl.DateTimeFormat('en-GB', { timeZone: tzName, weekday: 'short' }).format(a);
    var s = new Intl.DateTimeFormat('en-GB', { timeZone: tzName, hour: '2-digit', minute: '2-digit', hour12: !!hour12 }).format(a);
    var e = new Intl.DateTimeFormat('en-GB', { timeZone: tzName, hour: '2-digit', minute: '2-digit', hour12: !!hour12 }).format(b);
    return dow + ', ' + s + ' – ' + e;
  }

  // ===============================
  // Misc
  // ===============================
  function clamp(v, lo, hi) { return Math.min(hi, Math.max(lo, v)); }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      var ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }

  // ===============================
  // Table Skeleton Builder (shared)
  // ===============================
  function buildWeekTableSkeleton(table, opts) {
    const o = Object.assign({
      tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
      clock: '24',
      weekStart: 'sun',
      weekOffset: 0,
      hoursStart: 0,
      hoursEnd: 24,
      slotsPerHour: 2,
      dateFormat: 'mon-dd',
      onCellCreate: null
    }, opts || {});
    table.innerHTML = '';

    const wk = getWeekStartEpochAndYMD(o.tz, o.weekStart, o.weekOffset);
    const baseEpoch = wk.baseEpoch;
    const baseYMD = wk.baseYMD;

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    thTime.className = 'time-col';
    trh.appendChild(thTime);

    const dayEpochs = [];
    for (let i = 0; i < 7; i++) {
      const ymd = addDays(baseYMD.y, baseYMD.m, baseYMD.d, i);
      const dayEpoch = epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, o.tz);
      dayEpochs.push(dayEpoch);
      const th = document.createElement('th');
      th.textContent = headerLabelFor(o.tz, dayEpoch, o.dateFormat);
      th.className = 'day';
      th.dataset.col = String(i);
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalRows = (o.hoursEnd - o.hoursStart) * o.slotsPerHour;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');
      const isHourTop = (r % o.slotsPerHour) === 0;
      tr.className = isHourTop ? 'row-hour' : 'row-half';

      if (isHourTop) {
        const hour = Math.floor(r / o.slotsPerHour) + o.hoursStart;
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.rowSpan = o.slotsPerHour;
        const span = document.createElement('span');
        span.className = 'time-label hour';
        span.textContent = formatHourLabel(o.clock, hour);
        th.appendChild(span);
        tr.appendChild(th);
      }

      const hour = Math.floor(r / o.slotsPerHour) + o.hoursStart;
      const minute = Math.round((r % o.slotsPerHour) * (60 / o.slotsPerHour));

      for (let day = 0; day < 7; day++) {
        const ymd = addDays(baseYMD.y, baseYMD.m, baseYMD.d, day);
        const epoch = epochFromZoned(ymd.y, ymd.m, ymd.d, hour, minute, o.tz);

        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.row = String(r);
        td.dataset.col = String(day); // availability.js uses [data-col]
        td.dataset.day = String(day); // matcher.js uses [data-day]
        td.dataset.epoch = String(epoch);

        if (typeof o.onCellCreate === 'function') {
          o.onCellCreate(td, { epoch, day, row: r, hour, minute });
        }

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
    return { baseEpoch, dayEpochs, totalRows };
  }

  // ===============================
  // Past shading / interactivity
  // ===============================
  function shadePastCells(table, opts) {
    const nowSec = (opts && Number.isFinite(opts.nowSec)) ? opts.nowSec : Math.floor(Date.now() / 1000);
    const clear = !!(opts && opts.clearInlineBg);
    const cells = table.querySelectorAll('td.slot-cell');
    for (const td of cells) {
      const epoch = Number(td.dataset.epoch);
      if (!Number.isFinite(epoch)) continue;
      if (epoch < nowSec) {
        td.classList.add('past');
        if (clear) td.style.removeProperty('background-color');
      } else {
        td.classList.remove('past');
      }
    }
  }

  // ===============================
  // NOW marker (shared)
  // ===============================
  function _cumPos(el, stop) {
    let x = 0, y = 0;
    while (el && el !== stop) {
      x += el.offsetLeft || 0;
      y += el.offsetTop || 0;
      el = el.offsetParent;
    }
    return { x, y };
  }

  function ensureNowMarker(gridContent) {
    let nm = gridContent ? gridContent.querySelector('#now-marker') : null;
    if (!nm && gridContent) {
      nm = document.createElement('div');
      nm.id = 'now-marker';
      nm.className = 'now-marker';
      const bubble = document.createElement('span');
      bubble.className = 'bubble';
      bubble.textContent = 'NOW';
      nm.appendChild(bubble);
      gridContent.appendChild(nm);
    }
    return nm;
  }

  function positionNowMarker(p) {
    const { gridContent, table, tz, weekStart, weekOffset } = p;
    if (!gridContent || !table) return;

    const nowMarker = ensureNowMarker(gridContent);

    const { baseEpoch } = getWeekStartEpochAndYMD(tz, weekStart, weekOffset);
    const today = todayYMD(tz);
    const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, tz);
    const dayOffset = Math.floor((todayMid - baseEpoch) / 86400);

    if (dayOffset < 0 || dayOffset > 6) { nowMarker.style.display = 'none'; return; }

    const selFirst = `tbody tr:first-child td.slot-cell[data-day="${dayOffset}"], tbody tr:first-child td.slot-cell[data-col="${dayOffset}"]`;
    const selLast  = `tbody tr:last-child  td.slot-cell[data-day="${dayOffset}"], tbody tr:last-child  td.slot-cell[data-col="${dayOffset}"]`;
    const firstCell = table.querySelector(selFirst);
    const lastCell  = table.querySelector(selLast);
    if (!firstCell || !lastCell) { nowMarker.style.display = 'none'; return; }

    const left = _cumPos(firstCell, gridContent).x;
    const topStart = _cumPos(firstCell, gridContent).y;
    const topEnd = _cumPos(lastCell, gridContent).y + lastCell.offsetHeight;
    const dayHeight = topEnd - topStart;

    const minutes = minutesOfDayInTZ(tz);
    const frac = Math.max(0, Math.min(1, minutes / (24 * 60)));

    nowMarker.style.display = 'block';
    nowMarker.style.left = `${left}px`;
    nowMarker.style.width = `${firstCell.offsetWidth}px`;
    nowMarker.style.top = `${topStart + frac * dayHeight}px`;
  }

  function bindNowMarker(gridContent, table, opts) {
    if (!gridContent || !table) return;
    if (gridContent.__nowBound) return;
    const update = () => positionNowMarker({
      gridContent, table,
      tz: opts.tz, weekStart: opts.weekStart, weekOffset: opts.weekOffset
    });
    gridContent.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update, { passive: true });
    setInterval(update, 60000);
    gridContent.__nowBound = true;
  }

  // ===============================
  // Zoom helpers (Shift + Wheel)
  // ===============================
  function setSlotHeight(gridContent, px) {
    if (gridContent) gridContent.style.setProperty('--slot-h', `${px}px`);
  }

  function createWheelZoomHandler(o) {
    const requireShift = (o.requireShift !== false);
    const fn = function onWheelZoom(e) {
        const gc = fn.gridContent || o.gridContent;
        if (!gc) return;
        if (requireShift && !e.shiftKey) return;
        e.preventDefault();

        const primary = Math.abs(e.deltaY) >= Math.abs(e.deltaX) ? e.deltaY : e.deltaX;
        const dir = primary > 0 ? 1 : (primary < 0 ? -1 : 0);
        if (!dir) return;

        const cur = Number(o.get());
        if (!Number.isFinite(cur)) return;

        const next = cur - dir * o.step;
        const clamped = Math.min(o.max, Math.max(o.min, next));

        if (clamped !== cur) {
        o.set(clamped);
        setSlotHeight(gc, clamped);
        if (typeof o.onChange === 'function') o.onChange();
        }
    };
    fn.gridContent = o.gridContent || null; // allow late binding via handler.gridContent = element
    return fn;
  }

  // ===============================
  // Expose
  // ===============================
  global.shared = Object.assign(global.shared, {
    SETTINGS_KEY,
    resolveTimezone,
    readSettings,
    onSettingsChange,
    getSavedDateFormat,
    epochFromZoned,
    getYMDInTZ,
    todayYMD,
    addDays,
    weekdayIndexInTZ,
    getWeekStartEpochAndYMD,
    minutesOfDayInTZ,
    formatHourLabel,
    headerLabelFor,
    renderWeekRangeLabel,
    formatRangeSec,
    clamp,
    copyToClipboard,
    buildWeekTableSkeleton,
    shadePastCells,
    ensureNowMarker,
    positionNowMarker,
    bindNowMarker,
    setSlotHeight,
    createWheelZoomHandler
  });
})(window);
