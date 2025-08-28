(function () {
  'use strict';

  const SLOTS_PER_HOUR = 2;
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  let weekOffset = 0;
  let isAuthenticated = false;
  let currentUsername = null;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun', heatmap: 'viridis' };
  let settings = { ...DEFAULT_SETTINGS };
  let tz = resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
  let heatmapName = settings.heatmap || 'viridis';

  let slotHeight = 18; // px
  const ZOOM_MIN = 12, ZOOM_MAX = 48, ZOOM_STEP = 2;

  let members = [];
  const userSlotSets = new Map();
  let totalMembers = 0;

  const ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
  let WEEK_ROWS = 7 * ROWS_PER_DAY;
  let counts = [];
  let sets = [];

  let gridContent, table, nowMarker, resultsEl, resultsPanel;

  let __initDone = false;
  let __addingUser = false;
  let __addingMe = false;

  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }
  function tzOffsetMinutes(tzName, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
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
    const today = getTodayYMDInTZ(tz);
    const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, tz);
    const todayIdx = weekdayIndexInTZ(todayMid, tz);
    const diff = (todayIdx - weekStartIdx + 7) % 7;
    const baseYMD = ymdAddDays(today, -diff + weekOffset * 7);
    const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, tz);
    return { baseEpoch, baseYMD };
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
  function fmtRangeSec(startSec, endSec) {
    const a = new Date(startSec * 1000);
    const b = new Date(endSec * 1000);
    const dow = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(a);
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12 }).format(a);
    const e = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12 }).format(b);
    return `${dow}, ${s} – ${e}`;
  }

  function applySlotHeight() {
    if (gridContent) gridContent.style.setProperty('--slot-h', `${slotHeight}px`);
  }
  function onWheelZoom(e) {
    if (!e.shiftKey) return;
    if (!gridContent) return;
    e.preventDefault();
    const dir = Math.sign(e.deltaY);
    const next = slotHeight - dir * ZOOM_STEP;
    slotHeight = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, next));
    applySlotHeight();
    updateNowMarker();
  }

  function buildTable() {
    table.innerHTML = '';

    const thead = document.createElement('thead');
    const trh = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.textContent = 'Time';
    thTime.className = 'time-col';
    trh.appendChild(thTime);

    const { baseEpoch } = getWeekStartEpochAndYMD();
    for (let i = 0; i < 7; i++) {
      const d = new Date((baseEpoch + i * 86400) * 1000);
      const label = new Intl.DateTimeFormat('en-GB', {
        timeZone: tz, weekday: 'short', day: '2-digit', month: 'short'
      }).format(d);
      const th = document.createElement('th');
      th.textContent = label;
      th.className = 'day';
      trh.appendChild(th);
    }
    thead.appendChild(trh);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');
    const totalRows = ROWS_PER_DAY;

    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');

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
        const epoch = getDayStartSec(day) + r * SLOT_SEC;
        td.dataset.epoch = String(epoch);
        td.dataset.day = String(day);
        td.dataset.row = String(r);
        td.dataset.c = '0';
        td.addEventListener('mousemove', onCellHoverMove);
        td.addEventListener('mouseleave', hideTooltip);
        tr.appendChild(td);
      }
      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    applySlotHeight();
    paintCounts();
    shadePast();
    updateNowMarker();

    requestAnimationFrame(() => {
      const headH = thead.offsetHeight || 0;
      const avail = Math.max(0, gridContent.clientHeight - headH - 2);
      const needed = ROWS_PER_DAY * slotHeight;
      if (needed > 0) {
        const fit = Math.max(ZOOM_MIN, Math.min(ZOOM_MAX, Math.floor(avail / (needed / slotHeight))));
        if (!Number.isNaN(fit)) {
          slotHeight = fit;
          applySlotHeight();
          updateNowMarker();
        }
      }
    });

    updateWeekLabel();
  }

  function getDayStartSec(dayIndex) {
    const { baseEpoch } = getWeekStartEpochAndYMD();
    return baseEpoch + dayIndex * 86400;
  }

  const COLORMAPS = {
    viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
    plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
    cividis:    [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
    twilight:   [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
    lava:       [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
  };
  function lerp(a, b, t) { return a + (b - a) * t; }
  function hexToRgb(hex) {
    const m = /^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(hex);
    if (!m) return { r: 0, g: 0, b: 0 };
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
  }
  function rgbToCss({ r, g, b }) { return `rgb(${r}, ${g}, ${b})`; }
  function interpStops(stops, t) {
    if (t <= 0) return hexToRgb(stops[0][1]);
    if (t >= 1) return hexToRgb(stops[stops.length - 1][1]);
    for (let i = 0; i < stops.length - 1; i++) {
      const [t0, c0] = stops[i];
      const [t1, c1] = stops[i + 1];
      if (t >= t0 && t <= t1) {
        const k = (t - t0) / (t1 - t0);
        const a = hexToRgb(c0), b = hexToRgb(c1);
        return { r: Math.round(lerp(a.r, b.r, k)), g: Math.round(lerp(a.g, b.g, k)), b: Math.round(lerp(a.b, b.b, k)) };
      }
    }
    return hexToRgb(stops[stops.length - 1][1]);
  }
  function colormapColor(t) {
    const stops = COLORMAPS[heatmapName] || COLORMAPS.viridis;
    const rgb = interpStops(stops, t);
    return rgbToCss(rgb);
  }
  function shadeForCount(count) {
    const n = totalMembers || 0;
    const threshold = n >= 11 ? (n - 10) : 0;
    if (n <= 0) return '#0a0a0a';
    if (count <= threshold) return '#0a0a0a';
    const denom = Math.max(1, n - threshold);
    const t0 = (count - threshold) / denom;
    const t = Math.max(0, Math.min(1, t0));
    const g = heatmapName === 'twilight' ? t : Math.pow(t, 0.85);
    return colormapColor(g);
  }

  function slotCount(epoch) {
    let count = 0;
    for (const u of members) {
      const set = userSlotSets.get(u);
      if (set && set.has(epoch)) count++;
    }
    return count;
  }

  function paintCounts() {
    counts = [];
    sets = [];
    const tds = table.querySelectorAll('.slot-cell');
    const n = totalMembers || 0;
    const threshold = n >= 11 ? (n - 10) : 0;

    for (const td of tds) {
      const epoch = Number(td.dataset.epoch);
      const raw = slotCount(epoch);

      td.style.setProperty('background-color', shadeForCount(raw), 'important');

      if (n >= 11) td.dataset.c = (raw <= threshold) ? '0' : '7';
      else td.dataset.c = raw > 0 ? '7' : '0';

      td.classList.remove('dim', 'highlight');

      const day = Number(td.dataset.day);
      const row = Number(td.dataset.row);
      const g = day * ROWS_PER_DAY + row;
      counts[g] = raw;

      const who = new Set();
      for (const u of members) {
        const set = userSlotSets.get(u);
        if (set && set.has(epoch)) who.add(u);
      }
      sets[g] = who;
    }
    WEEK_ROWS = counts.length;
  }

  function shadePast() {
    const nowMs = Date.now();
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const baseMs = baseEpoch * 1000;
    const endMs = baseMs + 7 * 86400000;

    for (const td of table.querySelectorAll('.slot-cell')) td.classList.remove('past');
    if (nowMs < baseMs || nowMs > endMs) return;

    for (const td of table.querySelectorAll('.slot-cell')) {
      const cellMs = Number(td.dataset.epoch) * 1000;
      if (cellMs < nowMs) td.classList.add('past');
    }
  }

  function nowGlobalIndex() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const idx = Math.ceil((nowSec - baseEpoch) / SLOT_SEC);
    return Math.max(0, idx);
  }

  function updateNowMarker() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const weekEnd = baseEpoch + 7 * 86400;

    if (nowSec < baseEpoch || nowSec >= weekEnd) {
      nowMarker.style.display = 'none';
      return;
    }
    nowMarker.style.display = 'block';

    const secondsIntoWeek = nowSec - baseEpoch;
    const dayIdx = Math.floor(secondsIntoWeek / 86400);
    const secondsIntoDay = secondsIntoWeek - dayIdx * 86400;
    const rowsIntoDay = secondsIntoDay / SLOT_SEC;

    const headH = table.querySelector('thead')?.offsetHeight || 0;
    const topPx = headH + rowsIntoDay * slotHeight;
    nowMarker.style.top = `${topPx}px`;

    const firstCell = table.querySelector(`tbody tr:first-child td.slot-cell[data-day="${dayIdx}"][data-row="0"]`);
    if (firstCell) {
      nowMarker.style.left = `${firstCell.offsetLeft}px`;
      nowMarker.style.width = `${firstCell.offsetWidth}px`;
    }
  }

  function onCellHoverMove(e) {
    const td = e.currentTarget;
    if (td.classList.contains('past')) return;
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

  function applyFilterDimming() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, totalMembers - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));
    const startIdx = nowGlobalIndex();

    for (const td of table.querySelectorAll('.slot-cell')) td.classList.remove('dim');
    if (!totalMembers || needed <= 0) return;

    let g = 0;
    while (g < WEEK_ROWS) {
      if (g < startIdx || (counts[g] || 0) < needed) { dimCell(g); g++; continue; }
      let h = g;
      while (h < WEEK_ROWS && h >= startIdx && (counts[h] || 0) >= needed) h++;
      const blockLen = h - g;
      if (blockLen < minSlots) {
        for (let t = g; t < h; t++) dimCell(t);
      }
      g = h;
    }
  }
  function dimCell(globalIndex) {
    const day = Math.floor(globalIndex / ROWS_PER_DAY);
    const row = globalIndex % ROWS_PER_DAY;
    const cell = table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`);
    if (cell) cell.classList.add('dim');
  }

  function updateLegend() {
    const blocks = document.getElementById('legend-blocks');
    if (!blocks) return;

    const n = members.length;
    const chips = [];
    document.documentElement.classList.toggle('compress-low', n >= 11);

    if (n >= 11) {
      const threshold = Math.max(0, n - 10);
      chips.push({ raw: 0, label: `≤${threshold}` });
      for (let i = threshold + 1; i <= n; i++) chips.push({ raw: i, label: String(i) });
    } else {
      for (let i = 0; i <= n; i++) chips.push({ raw: i, label: String(i) });
    }

    blocks.innerHTML = '';
    const COLS = 5;

    for (let i = 0; i < chips.length; i += COLS) {
      const group = chips.slice(i, i + COLS);

      const stepsRow = document.createElement('div');
      stepsRow.className = 'steps-row';

      const labelsRow = document.createElement('div');
      labelsRow.className = 'labels-row';

      for (const item of group) {
        const chip = document.createElement('div');
        chip.className = 'chip slot-cell';
        chip.style.setProperty('background-color', shadeForCount(item.raw), 'important');

        if (n >= 11) {
          const threshold = Math.max(0, n - 10);
          chip.dataset.c = (item.raw <= threshold) ? '0' : '7';
        } else {
          chip.dataset.c = item.raw > 0 ? '7' : '0';
        }

        stepsRow.appendChild(chip);

        const lab = document.createElement('span');
        lab.textContent = item.label;
        labelsRow.appendChild(lab);
      }

      for (let f = group.length; f < COLS; f++) {
        const spacerChip = document.createElement('div');
        spacerChip.className = 'chip spacer';
        stepsRow.appendChild(spacerChip);

        const spacerLab = document.createElement('span');
        spacerLab.className = 'spacer';
        labelsRow.appendChild(spacerLab);
      }

      blocks.appendChild(stepsRow);
      blocks.appendChild(labelsRow);
    }
  }

  function findCandidates() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, totalMembers - maxMissing);
    const minSlots = Math.max(1, Math.round(minHours * SLOTS_PER_HOUR));
    const startIdx = nowGlobalIndex();

    const sessions = [];
    const seen = new Set();
    if (!totalMembers || needed <= 0) { renderResults(sessions); return; }

    const { baseEpoch } = getWeekStartEpochAndYMD();

    for (let k = totalMembers; k >= needed; k--) {
      let g = startIdx;
      while (g < WEEK_ROWS) {
        if ((counts[g] || 0) < k) { g++; continue; }
        let s = g;
        let t = g + 1;
        let inter = new Set(sets[g]);
        while (t < WEEK_ROWS && (counts[t] || 0) >= k) {
          const avail = sets[t];
          inter = new Set([...inter].filter(x => avail.has(x)));
          if (inter.size < k) break;
          t++;
        }
        s = Math.max(s, startIdx);
        const length = t - s;
        if (length >= minSlots && inter.size >= k) {
          const startSec = baseEpoch + s * SLOT_SEC;
          const endSec = baseEpoch + t * SLOT_SEC;
          const usersSorted = Array.from(inter).sort();
          const key = `${startSec}-${endSec}-${usersSorted.join('|')}`;
          if (!seen.has(key)) {
            seen.add(key);
            sessions.push({
              gStart: s, gEnd: t,
              start: startSec, end: endSec,
              duration: length,
              participants: usersSorted.length,
              users: usersSorted
            });
          }
        }
        while (t < WEEK_ROWS && (counts[t] || 0) >= k) t++;
        g = t;
      }
    }

    const sortMode = document.getElementById('sort-method').value;
    sessions.sort((a, b) => {
      if (sortMode === 'most') {
        if (b.participants !== a.participants) return b.participants - a.participants;
        return a.start - b.start;
      }
      if (sortMode === 'earliest-week') return a.start - b.start;
      if (sortMode === 'latest-week') return b.start - a.start;
      if (sortMode === 'earliest') {
        const aRow = a.gStart % ROWS_PER_DAY, bRow = b.gStart % ROWS_PER_DAY;
        if (aRow !== bRow) return aRow - bRow;
        return a.start - b.start;
      }
      if (sortMode === 'latest') {
        const aRow = a.gStart % ROWS_PER_DAY, bRow = b.gStart % ROWS_PER_DAY;
        if (aRow !== bRow) return bRow - aRow;
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
    clearHighlights();

    if (!list.length) {
      resultsEl.innerHTML = '<div class="result"><div class="res-sub">No matching sessions. Adjust filters.</div></div>';
      return;
    }

    for (const it of list) {
      const wrap = document.createElement('div');
      wrap.className = 'result';

      const top = document.createElement('div');
      top.className = 'res-top';
      top.textContent = fmtRangeSec(it.start, it.end);

      const sub = document.createElement('div');
      sub.className = 'res-sub';
      sub.textContent = `${it.participants}/${totalMembers} available • ${((it.duration)/SLOTS_PER_HOUR).toFixed(1)}h`;

      const usersLine = document.createElement('div');
      usersLine.className = 'res-users';
      usersLine.textContent = `Users: ${it.users.join(', ')}`;

      const actions = document.createElement('div');
      const copyBtn = document.createElement('button');
      copyBtn.type = 'button';
      copyBtn.textContent = 'Copy Discord invitation';
      copyBtn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const text = buildDiscordInvite(it);
        const ok = await copyToClipboard(text);
        const old = copyBtn.textContent;
        copyBtn.textContent = ok ? 'Copied to clipboard' : 'Failed to copy';
        setTimeout(() => { copyBtn.textContent = old; }, 1200);
      });
      actions.appendChild(copyBtn);

      wrap.appendChild(top);
      wrap.appendChild(sub);
      wrap.appendChild(usersLine);
      wrap.appendChild(actions);

      wrap.addEventListener('mouseenter', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, true);
        wrap.classList.add('hovered');
      });
      wrap.addEventListener('mouseleave', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, false);
        wrap.classList.remove('hovered');
      });

      resultsEl.appendChild(wrap);
    }
  }

  function highlightRangeGlobal(gStart, gEnd, on) {
    for (let g = gStart; g < gEnd; g++) {
      const day = Math.floor(g / ROWS_PER_DAY);
      const row = g % ROWS_PER_DAY;
      const td = table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`);
      if (td) td.classList.toggle('highlight', on);
    }
  }
  function clearHighlights() {
    for (const td of table.querySelectorAll('.slot-cell.highlight')) td.classList.remove('highlight');
  }

  async function userExists(name) {
    try {
      const url = `${window.API_BASE_URL}/users/exists?username=${encodeURIComponent(name)}`;
      const res = await fetch(url, { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) return false;
      const data = await res.json();
      return !!data.exists;
    } catch {
      return false;
    }
  }
function setMemberError(msg) {
  const el = document.getElementById('member-error');
  if (el) {
    el.textContent = msg || '';
    if (msg) el.classList.add('is-error'); else el.classList.remove('is-error');
  }
  if (msg) showToast(msg, 'error');
}
  function renderMembers() {
    const ul = document.getElementById('member-list');
    if (!ul) { updateLegend(); return; }
    ul.innerHTML = '';
    for (const name of members) {
      const li = document.createElement('li');
      const txt = document.createElement('div');
      txt.textContent = name;
      const btn = document.createElement('button');
      btn.textContent = 'Remove';
      btn.addEventListener('click', async () => {
        members = members.filter(u => u !== name);
        renderMembers();
        await fetchMembersAvail();
      });
      li.appendChild(txt);
      li.appendChild(btn);
      ul.appendChild(li);
    }
    updateLegend();
  }

  async function copyToClipboard(text) {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(text);
        return true;
      }
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.focus();
      ta.select();
      const ok = document.execCommand('copy');
      document.body.removeChild(ta);
      return ok;
    } catch {
      return false;
    }
  }
  function buildDiscordInvite(item) {
    const start = Math.floor(item.start);
    const end = Math.floor(item.end);
    const users = item.users.slice().sort();
    const missing = members.filter(m => !item.users.includes(m)).sort();
    const playersLine = users.length ? `players: ${users.join(', ')}` : 'players: —';
    const missingLine = missing.length ? `missing: ${missing.join(', ')}` : 'missing: —';
    return `session at <t:${start}:F> until <t:${end}:t>
${playersLine}
${missingLine}
please confirm`;
  }

  async function fetchMembersAvail() {
    if (!members.length) {
      userSlotSets.clear();
      totalMembers = 0;
      paintCounts();
      shadePast();
      applyFilterDimming();
      updateLegend();
      findCandidates();
      return;
    }

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = ymdAddDays(baseYMD, 7);
    const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

    const payload = { from: baseEpoch, to: endEpoch, usernames: members };
    const tryPaths = [
      `${window.API_BASE_URL}/availability/get_many`,
      `${window.API_BASE_URL}/availability/availability/get_many`
    ];

    let data = { intervals: {} };
    for (const url of tryPaths) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        if (res.status === 404) { continue; }
        if (!res.ok) { continue; }
        data = await res.json();
        break;
      } catch {}
    }

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

    paintCounts();
    shadePast();
    applyFilterDimming();
    updateLegend();
    findCandidates();
  }

  function updateWeekLabel() {
    const el = document.getElementById('week-label');
    if (!el) return;
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const end = baseEpoch + 7 * 86400;
    const a = new Date(baseEpoch * 1000);
    const b = new Date((end - 1) * 1000);
    const fmt = new Intl.DateTimeFormat('en-GB', { timeZone: tz, month: 'short', day: '2-digit' });
    el.textContent = `${fmt.format(a)} – ${fmt.format(b)}`;
  }

  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;
    if (isAuthenticated && currentUsername) {
        if (!members.includes(currentUsername)) {
        members.push(currentUsername);
        renderMembers();
        }
        fetchMembersAvail();
    }
  }

  function attachHandlers() {
    gridContent.addEventListener('wheel', onWheelZoom, { passive: false });
    gridContent.addEventListener('scroll', updateNowMarker, { passive: true });
    window.addEventListener('resize', updateNowMarker, { passive: true });
    setInterval(updateNowMarker, 30000);

    document.getElementById('max-missing').addEventListener('input', () => { applyFilterDimming(); findCandidates(); });
    document.getElementById('min-hours').addEventListener('input', () => { applyFilterDimming(); findCandidates(); });
    document.getElementById('sort-method').addEventListener('change', () => { findCandidates(); });

    document.getElementById('add-user-btn').addEventListener('click', onAddUser);

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

    window.addEventListener('storage', (e) => {
        if (e && e.key === 'nat20_settings') {
        const next = loadLocalSettings();
        if (next) {
            const prevTz = tz;
            settings = { ...DEFAULT_SETTINGS, ...next };
            tz = resolveTimezone(settings.timezone);
            hour12 = settings.clock === '12';
            weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
            heatmapName = settings.heatmap || 'viridis';
            if (tz !== prevTz) { buildTable(); fetchMembersAvail(); }
            else { paintCounts(); updateLegend(); }
        }
        }
    });
  }

  async function onAddUser() {
    if (__addingUser) return;
    __addingUser = true;
    try {
      const input = document.getElementById('add-username');
      const name = (input.value || '').trim();
      if (!name) return;
      if (members.includes(name)) { input.value = ''; return; }
      setMemberError('');
      const exists = await userExists(name);
      if (!exists) { setMemberError('User not found'); return; }
      members.push(name);
      input.value = '';
      renderMembers();
      await fetchMembersAvail();
    } finally {
      __addingUser = false;
    }
  }

  async function onAddMe() {
    if (__addingMe) return;
    __addingMe = true;
    try {
      if (!currentUsername) { setMemberError('Please login first.'); return; }
      if (!members.includes(currentUsername)) members.push(currentUsername);
      renderMembers();
      await fetchMembersAvail();
    } finally {
      __addingMe = false;
    }
  }

  function loadLocalSettings() {
    try {
      const raw = localStorage.getItem('nat20_settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  async function init() {
    if (__initDone) return;
    __initDone = true;

    const local = loadLocalSettings();
    if (local) {
      settings = { ...DEFAULT_SETTINGS, ...local };
      tz = resolveTimezone(settings.timezone);
      hour12 = settings.clock === '12';
      weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
      heatmapName = settings.heatmap || 'viridis';
    }

    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    nowMarker = document.getElementById('now-marker');
    resultsEl = document.getElementById('results');
    resultsPanel = document.getElementById('results-panel');

    buildTable();
    attachHandlers();
    await fetchMembersAvail();
  }

  window.scheduler = { init, setAuth };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();

function getToastStack() {
  let stack = document.getElementById('toast-stack');
  if (!stack) {
    stack = document.createElement('div');
    stack.id = 'toast-stack';
    stack.className = 'toast-stack';
    document.body.appendChild(stack);
  }
  return stack;
}

function showToast(message, variant = 'info') {
  const stack = getToastStack();
  const div = document.createElement('div');
  div.className = `toast toast-${variant}`;
  div.setAttribute('role', 'alert');
  div.textContent = message;
  stack.appendChild(div);

  // auto dismiss
  window.setTimeout(() => {
    div.classList.add('bye');
  }, 3500);
  div.addEventListener('animationend', () => {
    if (div.classList.contains('bye')) div.remove();
  });
}
