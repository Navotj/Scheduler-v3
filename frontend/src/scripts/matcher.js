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
  let tz = shared.resolveTimezone(settings.timezone);
  let hour12 = settings.clock === '12';
  let weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
  let heatmapName = settings.heatmap || 'viridis';

  let slotHeight = 18; // px
  const ZOOM_MIN = 12, ZOOM_MAX = 48, ZOOM_STEP = 2;

  let members = [];
  const userSlotSets = new Map();
  let totalMembers = 0;

  // Friends cache (usernames only, case-insensitive compare)
  let friendUsernames = new Set();
  let friendsLoaded = false;

  const ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
  let WEEK_ROWS = 7 * ROWS_PER_DAY;
  let counts = [];
  let sets = [];

  let gridContent, table, resultsEl, resultsPanel;

  let __initDone = false;
  let __addingUser = false;
  let __addingMe = false;

  function getWeekStartEpochAndYMD() {
    return shared.getWeekStartEpochAndYMD(tz, (weekStartIdx === 1 ? 'mon' : 'sun'), weekOffset);
  }

  function fmtRangeSec(startSec, endSec) {
    return shared.formatRangeSec(tz, startSec, endSec, hour12);
  }

  function applySlotHeight() {
    shared.setSlotHeight(gridContent, slotHeight);
  }

  async function fetchFriendUsernames() {
    try {
      const url = `${window.API_BASE_URL}/friends/list`;
      const res = await fetch(url, { credentials: 'include', cache: 'no-cache' });
      if (!res.ok) {
        friendUsernames = new Set();
        friendsLoaded = true;
        return;
      }
      const data = await res.json();
      const set = new Set();
      const arr = (data && Array.isArray(data.friends)) ? data.friends : [];
      for (const f of arr) {
        if (f && f.username) set.add(String(f.username).toLowerCase());
      }
      friendUsernames = set;
      friendsLoaded = true;
    } catch {
      friendUsernames = new Set();
      friendsLoaded = true;
    }
  }

  const wheelZoomHandler = shared.createWheelZoomHandler({
    get: () => slotHeight,
    set: (v) => { slotHeight = v; },
    gridContent: null, // set in init
    min: ZOOM_MIN,
    max: ZOOM_MAX,
    step: ZOOM_STEP,
    onChange: () => { updateNowMarker(); }
  });

  function buildTable() {
    table.innerHTML = '';

    const dateFmt = shared.getSavedDateFormat();

    const out = shared.buildWeekTableSkeleton(table, {
      tz,
      clock: hour12 ? '12' : '24',
      weekStart: (weekStartIdx === 1 ? 'mon' : 'sun'),
      weekOffset,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END,
      slotsPerHour: SLOTS_PER_HOUR,
      dateFormat: dateFmt,
      onCellCreate: (td) => {
        td.dataset.c = '0';
        td.addEventListener('mousemove', onCellHoverMove);
        td.addEventListener('mouseleave', hideTooltip);
      }
    });

    applySlotHeight();
    paintCounts();
    shadePast();
    updateNowMarker();

    const thead = table.querySelector('thead');
    requestAnimationFrame(() => {
      const headH = thead ? (thead.offsetHeight || 0) : 0;
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
  function rgbToCss({ r, g, b }) { return `rgb(${r}, ${b ? b : 0}, ${g})`.replace(/,\s*([0-9]+)\)$/, (_, gval) => `, ${gval})`).replace(/([0-9]+),\s*([0-9]+)\)$/, (m, r2, g2) => `rgb(${r}, ${g}, ${b})`); }
  function _rgbToCss(rgb) { return `rgb(${rgb.r}, ${rgb.g}, ${rgb.b})`; }

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
    return _rgbToCss(rgb);
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
      const isPast = td.classList.contains('past');

      // Preserve "past" greys: never repaint background for past cells.
      if (isPast) {
        td.style.removeProperty('background-color');
      } else {
        const isEmpty = (n >= 11) ? (raw <= threshold) : (raw === 0);
        if (isEmpty) {
          td.style.removeProperty('background-color');
        } else {
          td.style.setProperty('background-color', shadeForCount(raw), 'important');
        }
      }

      // Keep dataset.c up-to-date for legend/semantics even for past cells.
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
    if (!table) return;
    shared.shadePastCells(table, { clearInlineBg: true });
  }

  function nowGlobalIndex() {
    const nowSec = Math.floor(Date.now() / 1000);
    const { baseEpoch } = getWeekStartEpochAndYMD();
    const idx = Math.ceil((nowSec - baseEpoch) / SLOT_SEC);
    return Math.max(0, idx);
  }

  function updateNowMarker() {
    if (!gridContent || !table) return;
    shadePast();

    const weekStart = (weekStartIdx === 1 ? 'mon' : 'sun');
    shared.bindNowMarker(gridContent, table, { tz, weekStart, weekOffset });
    shared.positionNowMarker({ gridContent, table, tz, weekStart, weekOffset });
  }

  function onCellHoverMove(e) {
    const td = e.currentTarget;
    if (td.classList.contains('past')) return;

    let tip = document.getElementById('cell-tooltip');
    if (!tip) {
      tip = document.createElement('div');
      tip.id = 'cell-tooltip';
      tip.className = 'cell-tooltip';
      document.body.appendChild(tip);
    }

    const epoch = Number(td.dataset.epoch);
    const lists = availabilityListsAt(epoch);

    const avail = lists.available.length ? `Available: ${lists.available.join(', ')}` : 'Available: —';
    const unavail = lists.unavailable.length ? `Unavailable: ${lists.unavailable.join(', ')}` : 'Unavailable: —';

    tip.innerHTML = `<div>${avail}</div><div style="margin-top:6px; color:#bbb;">${unavail}</div>`;
    tip.style.display = 'block';

    const pad = 12;
    let x = e.clientX + 14;
    let y = e.clientY + 16;

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;

    const vw = document.documentElement.clientWidth;
    const vh = document.documentElement.clientHeight;
    const tw = tip.offsetWidth || 0;
    const th = tip.offsetHeight || 0;

    if (x + tw + pad > vw) x = Math.max(pad, vw - tw - pad);
    if (y + th + pad > vh) y = Math.max(pad, vh - th - pad);

    tip.style.left = `${x}px`;
    tip.style.top = `${y}px`;
  }

  function hideTooltip() {
    const tip = document.getElementById('cell-tooltip');
    if (tip) tip.style.display = 'none';
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
    const maxMissingEl = document.getElementById('max-missing');
    if (maxMissingEl) enforceMaxMissingLimit();
    const maxMissing = parseInt((maxMissingEl && maxMissingEl.value) || '0', 10);
    const minHours = parseFloat(document.getElementById('min-hours').value || '1');
    const needed = Math.max(0, totalMembers - maxMissing);
    const minSlots = Math.max(1, Math.ceil(minHours * SLOTS_PER_HOUR));
    const startIdx = nowGlobalIndex();

    for (const td of table.querySelectorAll('.slot-cell')) td.classList.remove('dim');
    if (!totalMembers || needed <= 0) return;

    // Do not dim any past cells; start evaluating from "now".
    let g = Math.max(0, startIdx);
    while (g < WEEK_ROWS) {
      if ((counts[g] || 0) < needed) { dimCell(g); g++; continue; }
      let h = g;
      while (h < WEEK_ROWS && (counts[h] || 0) >= needed) h++;
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

    const n = totalMembers;
    const MAX_COLS = 6;

    // Determine which values to display
    const values = [];
    if (n + 1 <= MAX_COLS) {
      // 0..n, then pad with empty to reach 6
      for (let i = 0; i <= n; i++) values.push(i);
      while (values.length < MAX_COLS) values.push(null);
    } else {
      // Highest six: n-5..n
      for (let v = n - (MAX_COLS - 1); v <= n; v++) values.push(v);
    }

    // Leftmost aggregation: when we show n-5..n and n>=5, the first column (values[0])
    // represents 0..values[0] and should use the "zero" color.
    const aggregateLeftVal = (n + 1 > MAX_COLS) ? values[0] : null;

    // Build grid (2 rows x 6 cols)
    blocks.innerHTML = '';
    blocks.className = 'legend-blocks';

    // Colors row
    for (let i = 0; i < MAX_COLS; i++) {
      const val = values[i];
      const cell = document.createElement('div');
      cell.className = 'color-cell';
      if (val === null) {
        cell.classList.add('empty');
      } else {
        const color = (aggregateLeftVal !== null && val === aggregateLeftVal)
          ? shadeForCount(0)           // aggregated bucket "0..k" uses zero color (black)
          : shadeForCount(val);        // normal bucket color
        cell.style.setProperty('background-color', color, 'important');
      }
      blocks.appendChild(cell);
    }

    // Numbers row
    for (let i = 0; i < MAX_COLS; i++) {
      const val = values[i];
      const lab = document.createElement('div');
      lab.className = 'num-cell';
      if (val === null) {
        lab.classList.add('empty');
        lab.textContent = '';
      } else {
        lab.textContent = String(val);
      }
      blocks.appendChild(lab);
    }
  }

  function findCandidates() {
    const maxMissing = parseInt(document.getElementById('max-missing').value || '0', 10);
    const minHours   = parseFloat(document.getElementById('min-hours').value || '1');
    const needed     = Math.max(0, totalMembers - maxMissing);
    const minSlots   = Math.max(1, Math.ceil(minHours * SLOTS_PER_HOUR));

    const startIdx   = (weekOffset > 0) ? 0 : nowGlobalIndex();

    const { baseEpoch } = getWeekStartEpochAndYMD();

    if (!totalMembers || needed <= 0) { renderResults([]); return; }

    const setEqual = (a, b) => {
      if (a.size !== b.size) return false;
      for (const v of a) if (!b.has(v)) return false;
      return true;
    };
    const setIntersect = (a, b) => {
      const out = new Set();
      for (const v of a) if (b.has(v)) out.add(v);
      return out;
    };
    const toSortedArr = (s) => Array.from(s).sort();

    const sessions = [];
    const addSession = (gStart, gEnd, cohortSet) => {
      const length = gEnd - gStart;
      if (length < minSlots) return;
      if (!cohortSet || cohortSet.size < needed) return;
      const usersSorted = toSortedArr(cohortSet);
      sessions.push({
        gStart,
        gEnd,
        start: baseEpoch + gStart * SLOT_SEC,
        end:   baseEpoch + gEnd   * SLOT_SEC,
        duration: length,
        participants: usersSorted.length,
        users: usersSorted
      });
    };

    (function buildIntersectionSegments() {
      let current = null;
      let segStart = -1;

      for (let g = startIdx; g < WEEK_ROWS; g++) {
        const slot = sets[g];

        if (!slot || slot.size < needed) {
          if (current) addSession(segStart, g, current);
          current = null;
          segStart = -1;
          continue;
        }

        if (!current) {
          current = new Set(slot);
          segStart = g;
          continue;
        }

        const next = setIntersect(current, slot);

        if (next.size < needed) {
          addSession(segStart, g, current);
          current = null;
          segStart = -1;
          continue;
        }

        if (!setEqual(next, current)) {
          addSession(segStart, g, current);
          current = next;
          segStart = g;
        }
      }

      if (current) addSession(segStart, WEEK_ROWS, current);
    })();

    (function buildExactRuns() {
      let runCohort = null;
      let runStart = -1;

      for (let g = startIdx; g < WEEK_ROWS; g++) {
        const slot = sets[g];
        const meets = !!slot && slot.size >= needed;

        if (!meets) {
          if (runCohort) addSession(runStart, g, runCohort);
          runCohort = null;
          runStart = -1;
          continue;
        }

        if (!runCohort) {
          runCohort = new Set(slot);
          runStart = g;
          continue;
        }

        if (!setEqual(slot, runCohort)) {
          addSession(runStart, g, runCohort);
          runCohort = new Set(slot);
          runStart = g;
        }
      }

      if (runCohort) addSession(runStart, WEEK_ROWS, runCohort);
    })();

    const keyOf = (s) => `${s.gStart}:${s.gEnd}:${s.users.join(',')}`;
    const dedupMap = new Map();
    for (const s of sessions) dedupMap.set(keyOf(s), s);
    let finalSessions = Array.from(dedupMap.values());

    {
      const byUsers = new Map();
      for (const s of finalSessions) {
        const key = s.users.join(',');
        if (!byUsers.has(key)) byUsers.set(key, []);
        byUsers.get(key).push(s);
      }
      const kept = [];
      for (const arr of byUsers.values()) {
        arr.sort((a, b) => {
          if (a.gStart !== b.gStart) return a.gStart - b.gStart;
          return b.gEnd - a.gEnd;
        });
        const winners = [];
        for (const s of arr) {
          let dominated = false;
          for (const w of winners) {
            if (w.gStart <= s.gStart && w.gEnd >= s.gEnd) { dominated = true; break; }
          }
          if (!dominated) winners.push(s);
        }
        kept.push(...winners);
      }
      finalSessions = kept;
    }

    const sortEl  = document.getElementById('sort-method');
    const byVal   = (sortEl && sortEl.value || '').toLowerCase().trim();
    const byText  = (sortEl && sortEl.options && sortEl.selectedIndex >= 0 ? (sortEl.options[sortEl.selectedIndex].text || '') : '').toLowerCase().trim();
    const sortRaw = byVal || byText;

    let sortMode = 'most';
    if (sortRaw.includes('earliest') && sortRaw.includes('week')) sortMode = 'earliest-week';
    else if (sortRaw.includes('latest') && sortRaw.includes('week')) sortMode = 'latest-week';
    else if (sortRaw.includes('earliest')) sortMode = 'earliest';
    else if (sortRaw.includes('latest'))   sortMode = 'latest';
    else if (sortRaw.includes('longest') || sortRaw.includes('duration')) sortMode = 'longest';
    else if (sortRaw.includes('most'))     sortMode = 'most';

    finalSessions.sort((a, b) => {
      switch (sortMode) {
        case 'most':
          if (b.participants !== a.participants) return b.participants - a.participants;
          if (b.duration     !== a.duration)     return b.duration - a.duration;
          return a.start - b.start;
        case 'earliest-week':
          return a.start - b.start;
        case 'latest-week':
          return b.start - a.start;
        case 'earliest': {
          const ar = a.gStart % ROWS_PER_DAY, br = b.gStart % ROWS_PER_DAY;
          if (ar !== br) return ar - br;
          return a.start - b.start;
        }
        case 'latest': {
          const ar = a.gStart % ROWS_PER_DAY, br = b.gStart % ROWS_PER_DAY;
          if (ar !== br) return br - ar;
          return a.start - b.start;
        }
        case 'longest':
          if (b.duration     !== a.duration)     return b.duration - a.duration;
          if (b.participants !== a.participants) return b.participants - a.participants;
          return a.start - b.start;
        default:
          return a.start - b.start;
      }
    });

    renderResults(finalSessions);
  }

  function renderMembers() {
    try {
      // Try common container ids used in the UI; no-op if none exist.
      const container =
        document.getElementById('members') ||
        document.getElementById('members-list') ||
        document.getElementById('member-list');

      if (!container) return;

      // Minimal rendering: show the current members list as comma-separated text.
      // Avoid introducing new handlers or dependencies.
      container.textContent = members.join(', ');
    } catch {
      // Silent no-op to ensure this never throws.
    }
  }

  function renderResults(list) {
    if (!resultsEl) return; // guard if panel not present
    resultsEl.innerHTML = '';
    clearHighlights();

    const keep = new Array(WEEK_ROWS).fill(false);
    for (const it of list) {
      for (let g = it.gStart; g < it.gEnd; g++) keep[g] = true;
    }

    const tds = table.querySelectorAll('.slot-cell');
    for (const td of tds) {
      const day = Number(td.dataset.day);
      const row = Number(td.dataset.row);
      if (!Number.isFinite(day) || !Number.isFinite(row)) continue;
      const g = day * ROWS_PER_DAY + row;

      // Never dim or restyle past cells; keep uniform past grey.
      if (td.classList.contains('past')) {
        td.classList.remove('dim');
        td.style.opacity = '';
        td.style.filter = '';
        continue;
      }

      const raw = counts[g] || 0;

      if (keep[g] || raw === 0) {
        td.classList.remove('dim');
        td.style.opacity = '';
        td.style.filter = '';
      } else {
        td.classList.add('dim');
        td.style.opacity = '0.45';
        td.style.filter = 'grayscale(40%) brightness(0.85)';
      }
    }

    if (!list.length) {
      const empty = document.createElement('div');
      empty.className = 'card';
      const sub = document.createElement('div');
      sub.className = 'res-sub';
      sub.textContent = 'No matching sessions. Adjust filters.';
      empty.appendChild(sub);
      resultsEl.appendChild(empty);
      return;
    }

    for (const it of list) {
      const card = document.createElement('div');
      card.className = 'card';

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
        const ok = await shared.copyToClipboard(text);
        const old = copyBtn.textContent;
        copyBtn.textContent = ok ? 'Copied to clipboard' : 'Failed to copy';
        setTimeout(() => { copyBtn.textContent = old; }, 1200);
      });
      actions.appendChild(copyBtn);

      card.appendChild(top);
      card.appendChild(sub);
      card.appendChild(usersLine);
      card.appendChild(actions);

      card.addEventListener('mouseenter', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, true);
        card.classList.add('hovered');
        if (resultsPanel) resultsPanel.classList.add('glow');
      });
      card.addEventListener('mouseleave', () => {
        highlightRangeGlobal(it.gStart, it.gEnd, false);
        card.classList.remove('hovered');
        if (resultsPanel) resultsPanel.classList.remove('glow');
      });

      resultsEl.appendChild(card);
    }
  }

  function buildDiscordInvite(s) {
    // Keep previous behavior (unchanged)
    const head = fmtRangeSec(s.start, s.end);
    const list = s.users.join(', ');
    return `**Session window:** ${head}\n**Participants (${s.participants}/${totalMembers}):** ${list}`;
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
      el.textContent = '';
      el.classList.remove('is-error');
      el.setAttribute('aria-hidden', 'true');
    }
    if (msg) {
      if (typeof shared !== 'undefined' && typeof shared.showToast === 'function') {
        shared.showToast(msg, 'error');
      } else if (typeof window !== 'undefined' && typeof window.showToast === 'function') {
        window.showToast(msg, 'error');
      } else {
        console.error('[toast]', msg);
      }
    }
  }

  async function fetchMembersAvail() {
    if (!members.length) {
      userSlotSets.clear();
      totalMembers = 0;
      paintCounts();
      shadePast();
      enforceMaxMissingLimit();
      applyFilterDimming();
      updateLegend();
      findCandidates();
      return;
    }

    const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
    const endYMD = shared.addDays(baseYMD.y, baseYMD.m, baseYMD.d, 7);
    const endEpoch = shared.epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, tz);

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

    enforceMaxMissingLimit();
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
    shared.renderWeekRangeLabel(el, baseEpoch, tz);
  }

  function setAuth(ok, username) {
    isAuthenticated = !!ok;
    currentUsername = ok ? username : null;

    // Refresh friends list when auth state changes (fire-and-forget)
    friendsLoaded = false;
    fetchFriendUsernames();

    if (isAuthenticated && currentUsername) {
      if (!members.includes(currentUsername)) {
        members.push(currentUsername);
        renderMembers();
        enforceMaxMissingLimit();
      }
      fetchMembersAvail();
    }
  }

  function attachHandlers() {
    wheelZoomHandler.gridContent = gridContent;
    gridContent.addEventListener('wheel', wheelZoomHandler, { passive: false });

    setInterval(updateNowMarker, 30000);

    document.getElementById('max-missing').addEventListener('input', () => {
      enforceMaxMissingLimit();
      applyFilterDimming();
      findCandidates();
    });
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
          tz = shared.resolveTimezone(settings.timezone);
          hour12 = settings.clock === '12';
          weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
          heatmapName = settings.heatmap || 'viridis';
          if (tz !== prevTz) { buildTable(); fetchMembersAvail(); }
          else { paintCounts(); shadePast(); applyFilterDimming(); updateLegend(); }
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

      // Prevent duplicates
      if (members.includes(name)) { input.value = ''; return; }

      // Load friends on demand if not loaded yet
      if (!friendsLoaded) await fetchFriendUsernames();

      setMemberError('');

      // Self can always be added
      const isSelf = currentUsername && name.toLowerCase() === String(currentUsername).toLowerCase();

      // Check existence first (to preserve "User not found" semantics)
      const exists = await userExists(name);
      if (!exists) { setMemberError('User not found'); return; }

      // If not self, enforce friendship
      if (!isSelf) {
        const isFriend = friendUsernames.has(name.toLowerCase());
        if (!isFriend) { setMemberError('Not friends with specified user'); return; }
      }

      members.push(name);
      input.value = '';
      renderMembers();
      enforceMaxMissingLimit();
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
      enforceMaxMissingLimit();
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

  function enforceMaxMissingLimit() {
    const el = document.getElementById('max-missing');
    if (!el) return;
    const currentPlayers = totalMembers || members.length || 0;
    const maxAllowed = Math.max(0, currentPlayers - 1);
    el.max = String(maxAllowed);
    let val = parseInt((el.value || '0'), 10);
    if (Number.isNaN(val)) val = 0;
    if (val > maxAllowed) el.value = String(maxAllowed);
    if (val < 0) el.value = '0';
  }

  async function init() {
    if (__initDone) return;
    __initDone = true;

    const local = loadLocalSettings();
    if (local) {
      settings = { ...DEFAULT_SETTINGS, ...local };
      tz = shared.resolveTimezone(settings.timezone);
      hour12 = settings.clock === '12';
      weekStartIdx = settings.weekStart === 'mon' ? 1 : 0;
      heatmapName = settings.heatmap || 'viridis';
    }

    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    // Updated to match matcher.html right-side container ids
    resultsEl = document.getElementById('side-cards');
    resultsPanel = document.getElementById('side-cards-panel');

    buildTable();
    attachHandlers();
    enforceMaxMissingLimit();

    // Detect auth via existing allowlisted endpoint and auto-add current user
    try {
      const url = `${window.API_BASE_URL}/auth/check`;
      const res = await fetch(url, { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const data = await res.json();
        const obj = (data && (data.user || data.me || data.account)) || data || {};
        let uname = null;
        if (typeof obj.username === 'string' && obj.username.trim()) uname = obj.username.trim();
        else if (typeof data.username === 'string' && data.username.trim()) uname = data.username.trim();

        const isAuthedFlag = (data && (data.authenticated === true || data.isAuthenticated === true)) || !!uname;
        setAuth(!!isAuthedFlag, uname || null);
      } else if (res.status === 401) {
        setAuth(false, null);
      }
    } catch {
      // leave unauthenticated if the check fails
    }

    await fetchMembersAvail();
  }

  // === Exposed helpers for username dropdown integration ===
  function getMembers() {
    return members.slice();
  }

  function removeMember(name) {
    if (!name) return;
    const idx = members.findIndex(u => String(u).toLowerCase() === String(name).toLowerCase());
    if (idx >= 0) {
      members.splice(idx, 1);
      renderMembers();
      enforceMaxMissingLimit();
      fetchMembersAvail();
    }
  }

  window.scheduler = { init, setAuth, getMembers, removeMember };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
