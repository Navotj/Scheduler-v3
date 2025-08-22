/* Shared weekly grid + time utilities + zoom + NOW marker manager.
   Extracted to eliminate duplication across availability_picker.js and schedule_matcher.js.
   References:
   - availability_picker.js ensureNowMarker/zoom/buildGrid patterns :contentReference[oaicite:4]{index=4} :contentReference[oaicite:5]{index=5} :contentReference[oaicite:6]{index=6} :contentReference[oaicite:7]{index=7}
   - schedule_matcher.js zoom-fit+apply patterns :contentReference[oaicite:8]{index=8} :contentReference[oaicite:9]{index=9}
   - Centralized NOW marker should remain under sticky headers (z-index). :contentReference[oaicite:10]{index=10}
*/
(function () {
  'use strict';

  const Shared = {};

  // ---- Constants (pages may override via options) ----
  Shared.DEFAULTS = {
    SLOTS_PER_HOUR: 2,     // 30-min slots
    HOURS_START: 0,
    HOURS_END: 24,
    ZOOM_MIN: 0.35,
    ZOOM_MAX: 2.0,
    ZOOM_STEP: 0.08,
    WEEKEND_INDICES: [5, 6], // Fri/Sat
  };

  // ---- Timezone helpers ----
  Shared.resolveTimezone = function resolveTimezone(pref) {
    if (pref && typeof pref === 'string') return pref;
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  };

  Shared.tzOffsetMinutes = function tzOffsetMinutes(date, tz) {
    const f = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const parts = f.formatToParts(date);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const local = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.round((local - date.getTime()) / 60000);
  };

  Shared.epochFromZoned = function epochFromZoned(y, m, d, hh, mm, tz) {
    const utc = Date.UTC(y, m - 1, d, hh, mm, 0);
    const fake = new Date(utc);
    const off = Shared.tzOffsetMinutes(fake, tz);
    return Math.floor((utc - off * 60000) / 1000);
  };

  Shared.getTodayYMDInTZ = function getTodayYMDInTZ(tz) {
    const now = new Date();
    const off = Shared.tzOffsetMinutes(now, tz);
    const local = new Date(now.getTime() + off * 60000);
    return { y: local.getUTCFullYear(), m: local.getUTCMonth() + 1, d: local.getUTCDate() };
  };

  Shared.ymdAddDays = function ymdAddDays(ymd, days) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d) + days * 86400000);
    return { y: dt.getUTCFullYear(), m: dt.getUTCMonth() + 1, d: dt.getUTCDate() };
  };

  Shared.weekdayIndexInTZ = function weekdayIndexInTZ(ymd, tz) {
    const dt = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    const tzOff = Shared.tzOffsetMinutes(dt, tz);
    const local = new Date(dt.getTime() + tzOff * 60000);
    return local.getUTCDay(); // 0=Sun..6=Sat in local TZ
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
    const tz = opts.tz;
    const weekStartIdx = opts.weekStartIdx ?? 1; // 1=Mon
    const today = Shared.getTodayYMDInTZ(tz);
    const dow = Shared.weekdayIndexInTZ(today, tz);
    const delta = (dow - weekStartIdx + 7) % 7;
    const baseYMD = Shared.ymdAddDays(today, -delta + (opts.weekOffset || 0) * 7);
    const baseEpoch = Shared.epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
  };

  // ---- Build table skeleton (thead+tbody 7 days × rows) ----
  Shared.buildWeekTable = function buildWeekTable(tableEl, options) {
    const opt = Object.assign({}, Shared.DEFAULTS, options || {});
    const tz = opt.tz || Shared.resolveTimezone();
    const hour12 = !!opt.hour12;
    const { baseEpoch, baseYMD } = Shared.getWeekStartEpochAndYMD({ tz, weekStartIdx: opt.weekStartIdx ?? 1, weekOffset: opt.weekOffset || 0 });

    tableEl.innerHTML = '';
    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const dayEpochs = [];
    for (let i = 0; i < 7; i++) {
      const ymd = Shared.ymdAddDays(baseYMD, i);
      const dayEpoch = Shared.epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, tz);
      dayEpochs.push({ ymd, epoch: dayEpoch });

      const th = document.createElement('th');
      th.className = 'day';
      th.dataset.dayIndex = String(i);
      th.textContent = new Intl.DateTimeFormat(undefined, {
        timeZone: tz, weekday: 'short', month: 'short', day: 'numeric'
      }).format(new Date((dayEpoch) * 1000));
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
        th.textContent = Shared.formatHourLabel(hour, hour12);
        tr.appendChild(th);
      } else {
        const th = document.createElement('th');
        th.className = 'time-col';
        th.textContent = '';
        tr.appendChild(th);
      }

      for (let c = 0; c < 7; c++) {
        const startEpoch = dayEpochs[c].epoch + r * slotSeconds;
        const td = document.createElement('td');
        td.className = 'slot-cell';
        if (opt.WEEKEND_INDICES.includes(c)) td.classList.add('col-weekend');

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

    return { baseEpoch, baseYMD, dayEpochs, rowsPerDay, slotSeconds };
  };

  // ---- Week label helper ----
  Shared.renderWeekLabel = function renderWeekLabel(labelEl, baseEpoch, tz) {
    if (!labelEl) return;
    const start = new Date(baseEpoch * 1000);
    const end = new Date((baseEpoch + 6 * 86400) * 1000);
    const fmt = new Intl.DateTimeFormat(undefined, { timeZone: tz, month: 'short', day: 'numeric' });
    labelEl.textContent = `${fmt.format(start)} – ${fmt.format(end)}`;
  };

  // ---- NOW marker management ----
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
    const { tableEl, gridContentEl, baseEpoch, tz, hoursStart = 0, slotsPerHour = 2 } = params;
    if (!tableEl || !gridContentEl) return;

    const marker = Shared.ensureNowMarker(gridContentEl);
    const nowEpoch = Math.floor(Date.now() / 1000);

    // Determine if now is within this 7-day range in tz
    const start = baseEpoch;
    const end = baseEpoch + 7 * 86400;
    if (nowEpoch < start || nowEpoch >= end) {
      marker.style.display = 'none';
      return;
    }

    // Compute day index & vertical position
    const dayIndex = Math.floor((nowEpoch - start) / 86400);
    const dayStartEpoch = start + dayIndex * 86400;

    const rowHeight = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
    const thead = tableEl.querySelector('thead');
    const theadH = thead ? thead.offsetHeight : 0;

    // seconds since local day start
    const offSec = nowEpoch - Shared.epochFromZoned(
      new Date(dayStartEpoch * 1000).getUTCFullYear(),
      new Date(dayStartEpoch * 1000).getUTCMonth() + 1,
      new Date(dayStartEpoch * 1000).getUTCDate(),
      0, 0, tz
    );

    const totalRows = (24 - hoursStart) * slotsPerHour;
    const secondsPerRow = (3600 / slotsPerHour);
    const rowFloat = offSec / secondsPerRow;
    const top = theadH + rowFloat * rowHeight;

    // Horizontal geometry: compute left and width of the day column
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
    // getCtx() should return { baseEpoch, tz, hoursStart, slotsPerHour }
    const update = () => {
      const ctx = getCtx();
      if (!ctx) return;
      Shared.positionNowMarker({
        tableEl, gridContentEl,
        baseEpoch: ctx.baseEpoch,
        tz: ctx.tz,
        hoursStart: ctx.hoursStart,
        slotsPerHour: ctx.slotsPerHour
      });
    };
    gridContentEl.addEventListener('scroll', () => requestAnimationFrame(update));
    window.addEventListener('resize', () => requestAnimationFrame(update));
    setInterval(update, 60000); // refresh each minute
    update();
  };

  // ---- Zoom helpers (vertical-only) ----
  Shared.applyZoomStyles = function applyZoomStyles(zoomFactor) {
    const base = 18;
    const px = Math.max(10, Math.min(42, Math.round(base * zoomFactor)));
    document.documentElement.style.setProperty('--row-height', `${px}px`);
  };

  Shared.initialZoomToFit24h = function initialZoomToFit24h(tableEl, contentEl, rowsPerDay, zoomMin, zoomMax) {
    const base = 18;
    const thead = tableEl.querySelector('thead');
    if (!thead || !contentEl) return { zoom: 1, min: zoomMin };
    const available = Math.max(0, contentEl.clientHeight - thead.offsetHeight - 2);
    const needed = rowsPerDay * base;
    const zFit = Math.max(available / needed, zoomMin);
    const z = Math.min(zFit, zoomMax);
    return { zoom: z, min: z };
  };

  window.scheduleShared = Shared;
})();
