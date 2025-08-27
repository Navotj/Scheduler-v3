(function () {
  const SLOTS_PER_HOUR = 2;
  const HOURS_START = 0;
  const HOURS_END = 24;

  let table, gridContent, nowMarker;

  function formatHourLabel(hour) {
    return String(hour).padStart(2, '0') + ':00';
  }

  function zonedEpoch(y, m, d, hh, mm, tz) {
    const dtf = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' });
    const parts = dtf.formatToParts(new Date(Date.UTC(y, m - 1, d, hh, mm, 0)));
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const asUTC = Date.UTC(+map.year, +map.month - 1, +map.day, +map.hour, +map.minute, +map.second);
    return Math.floor(asUTC / 1000);
  }

  function getWeekStartYMD(tz) {
    const now = new Date();
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(now);
    const map = {};
    for (const p of parts) map[p.type] = p.value;
    const y = +map.year, m = +map.month, d = +map.day;
    const todayMid = zonedEpoch(y, m, d, 0, 0, tz);
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday: 'short' }).format(new Date(todayMid * 1000));
    const idx = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
    const base = new Date(Date.UTC(y, m - 1, d));
    base.setUTCDate(base.getUTCDate() - idx);
    return { y: base.getUTCFullYear(), m: base.getUTCMonth() + 1, d: base.getUTCDate() };
  }

  function addDays(y, m, d, add) {
    const t = new Date(Date.UTC(y, m - 1, d));
    t.setUTCDate(t.getUTCDate() + add);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() };
  }

  function buildGrid() {
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    trh.appendChild(thTime);

    const base = getWeekStartYMD(tz);
    const dayEpochs = [];
    for (let c = 0; c < 7; c++) {
      const ymd = addDays(base.y, base.m, base.d, c);
      const dayEpoch = zonedEpoch(ymd.y, ymd.m, ymd.d, 0, 0, tz);
      dayEpochs.push({ ymd, epoch: dayEpoch });
      const th = document.createElement('th');
      th.className = 'day';
      th.dataset.col = String(c);
      th.textContent = new Intl.DateTimeFormat(undefined, { timeZone: tz, weekday: 'short', month: 'short', day: 'numeric' }).format(new Date(dayEpoch * 1000));
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');
      const hour = Math.floor(r / SLOTS_PER_HOUR) + HOURS_START;
      const half = r % SLOTS_PER_HOUR === 1;
      tr.className = half ? 'row-half' : 'row-hour';

      if (!half) {
        const th = document.createElement('th');
        th.className = 'time-col hour';
        th.rowSpan = 2;
        const span = document.createElement('span');
        span.className = 'time-label hour';
        span.textContent = formatHourLabel(hour);
        th.appendChild(span);
        tr.appendChild(th);
      }

      for (let c = 0; c < 7; c++) {
        const ymd = dayEpochs[c].ymd;
        const epoch = zonedEpoch(ymd.y, ymd.m, ymd.d, hour, half ? 30 : 0, tz);
        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.row = String(r);
        td.dataset.col = String(c);
        td.dataset.epoch = String(epoch);
        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);
  }

  function ensureNowMarker() {
    if (nowMarker) return;
    nowMarker = document.createElement('div');
    nowMarker.className = 'now-marker';
    const bubble = document.createElement('span');
    bubble.className = 'bubble';
    bubble.textContent = 'NOW';
    nowMarker.appendChild(bubble);
    gridContent.appendChild(nowMarker);
  }

  function updateNowMarker() {
    ensureNowMarker();
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    const base = getWeekStartYMD(tz);
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tz, hour12: false, hour: '2-digit', minute: '2-digit' }).formatToParts(new Date());
    const hh = Number(parts.find(p => p.type === 'hour').value);
    const mm = Number(parts.find(p => p.type === 'minute').value);
    const dayIdx = new Date().getDay();
    const rowIndex = hh * 2 + (mm >= 30 ? 1 : 0);
    const frac = (mm % 30) / 30;

    const targetCell = table.querySelector('td.slot-cell[data-col="' + dayIdx + '"][data-row="' + rowIndex + '"]');
    const colStartCell = table.querySelector('td.slot-cell[data-col="' + dayIdx + '"][data-row="0"]');
    if (!targetCell || !colStartCell) { nowMarker.style.display = 'none'; return; }

    const top = targetCell.offsetTop + targetCell.offsetHeight * frac;
    const left = colStartCell.offsetLeft;
    const width = colStartCell.offsetWidth;

    nowMarker.style.display = 'block';
    nowMarker.style.top = top + 'px';
    nowMarker.style.left = left + 'px';
    nowMarker.style.width = width + 'px';
  }

  function init() {
    table = document.getElementById('schedule-table');
    gridContent = document.getElementById('grid-content');
    if (!table || !gridContent) return;
    buildGrid();
    ensureNowMarker();
    updateNowMarker();
    setInterval(updateNowMarker, 60000);
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.schedule = { init };
})();
