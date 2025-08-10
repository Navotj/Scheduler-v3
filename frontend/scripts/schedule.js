(function () {
  // 24h with 30-min intervals; hour labels only (half-hour labels appear when zoomed in via CSS)
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SLOTS_PER_HOUR = 2;         // 30-minute steps
  const HOURS_START = 0;            // 00:00
  const HOURS_END = 24;             // up to 24:00 (exclusive)
  const SLOT_SEC = 30 * 60;         // 1800 seconds

  let weekOffset = 0;               // 0 = current week, -1 previous, +1 next
  let paintMode = 'add';            // 'add' | 'subtract'
  let isAuthenticated = false;

  // Zoom state
  let zoomFactor = 1.0;
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEP = 0.1;

  // Selection data: store epoch seconds (number) for each 30-min slot
  const selected = new Set();

  // Box selection state
  let isDragging = false;
  let dragStart = null;  // { row, col }
  let dragEnd = null;    // { row, col }

  // Cached DOM
  let table;
  let grid;

  function getStartOfWeek(date) {
    // Week starts on Sunday in local time
    const d = new Date(date);
    const day = d.getDay(); // 0..6 with 0=Sun
    const diff = -day; // days to go back to Sunday
    const start = new Date(d);
    start.setHours(0,0,0,0);
    start.setDate(d.getDate() + diff);
    return start;
  }

  function addDays(date, days) {
    const d = new Date(date);
    d.setDate(d.getDate() + days);
    return d;
  }

  function formatDateLabel(d) {
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${y}-${m}-${day}`;
  }

  function toEpochLocal(date, hour, half) {
    // Local time -> epoch seconds (UTC)
    const d = new Date(date);
    d.setHours(hour, half ? 30 : 0, 0, 0);
    return Math.floor(d.getTime() / 1000);
  }

  function renderWeekLabel(start) {
    const end = addDays(start, 6);
    const fmt = (dt) => dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const year = start.getFullYear() === end.getFullYear() ? start.getFullYear() : `${start.getFullYear()}–${end.getFullYear()}`;
    document.getElementById('week-label').textContent = `${fmt(start)} – ${fmt(end)}, ${year}`;
  }

  function applyZoomStyles() {
    const root = document.documentElement;
    const baseRow = 18;     // px
    const baseCol = 110;    // px
    const baseFont = 12;    // px

    root.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--col-width', `${(baseCol * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--font-size', `${(baseFont * zoomFactor).toFixed(2)}px`);

    const body = document.body;
    body.classList.remove('zoom-dense', 'zoom-medium', 'zoom-large');
    if (zoomFactor < 1.1) {
      body.classList.add('zoom-dense');   // only hours visible
    } else if (zoomFactor < 1.5) {
      body.classList.add('zoom-medium');  // still only hours
    } else {
      body.classList.add('zoom-large');   // show :30 labels
    }
  }

  function buildGrid() {
    table = document.getElementById('schedule-table');
    grid = document.getElementById('grid');
    table.innerHTML = '';

    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    renderWeekLabel(base);

    // Header
    const thead = document.createElement('thead');
    const hr = document.createElement('tr');

    const thTime = document.createElement('th');
    thTime.className = 'time-col';
    thTime.textContent = 'Time';
    hr.appendChild(thTime);

    for (let i = 0; i < 7; i++) {
      const cur = addDays(base, i);
      const th = document.createElement('th');
      th.textContent = `${DAYS[cur.getDay()]} ${cur.toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}`;
      th.dataset.date = formatDateLabel(cur);
      hr.appendChild(th);
    }
    thead.appendChild(hr);
    table.appendChild(thead);

    const tbody = document.createElement('tbody');

    const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR; // 48
    for (let r = 0; r < totalRows; r++) {
      const tr = document.createElement('tr');

      const hour = Math.floor(r / SLOTS_PER_HOUR) + HOURS_START;
      const half = r % SLOTS_PER_HOUR === 1; // 0 => :00, 1 => :30
      tr.className = half ? 'row-half' : 'row-hour';

      if (!half) {
        // Hour row: create a time cell that spans both this row and the next half-hour row
        const timeCell = document.createElement('td');
        timeCell.className = 'time-col hour';
        timeCell.rowSpan = 2;
        const hh = String(hour).padStart(2, '0');
        const spanHour = document.createElement('span');
        spanHour.className = 'time-label hour';
        spanHour.textContent = `${hh}:00`;
        timeCell.appendChild(spanHour);
        tr.appendChild(timeCell);
      }
      // For half rows, we DO NOT append a time cell (rowSpan=2 above covers it)

      for (let c = 0; c < 7; c++) {
        const cur = addDays(base, c);
        const epoch = toEpochLocal(cur, hour, half);

        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.epoch = String(epoch);
        td.dataset.row = r;
        td.dataset.col = c;

        if (selected.has(epoch)) {
          td.classList.add('selected');
        }

        td.addEventListener('mousedown', (e) => {
          if (!isAuthenticated) return;
          e.preventDefault();
          isDragging = true;
          dragStart = { row: r, col: c };
          dragEnd = { row: r, col: c };
          updatePreview();
        });

        td.addEventListener('mouseenter', () => {
          if (!isAuthenticated) return;
          if (!isDragging) return;
          dragEnd = { row: r, col: c };
          updatePreview();
        });

        td.addEventListener('mouseup', () => {
          if (!isAuthenticated) return;
          if (!isDragging) return;
          dragEnd = { row: r, col: c };
          applyBoxSelection();
          clearPreview();
          isDragging = false;
          dragStart = dragEnd = null;
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    document.addEventListener('mouseup', () => {
      if (!isAuthenticated) return;
      if (isDragging) {
        applyBoxSelection();
        clearPreview();
      }
      isDragging = false;
      dragStart = dragEnd = null;
    });

    setupZoomHandlers();
  }

  function forEachCellInBox(fn) {
    if (!dragStart || !dragEnd) return;
    const r1 = Math.min(dragStart.row, dragEnd.row);
    const r2 = Math.max(dragStart.row, dragEnd.row);
    const c1 = Math.min(dragStart.col, dragEnd.col);
    const c2 = Math.max(dragStart.col, dragEnd.col);

    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = table.querySelector(`td.slot-cell[data-row="${r}"][data-col="${c}"]`);
        if (cell) fn(cell);
      }
    }
  }

  function updatePreview() {
    clearPreview();
    forEachCellInBox((cell) => {
      if (paintMode === 'add') {
        cell.classList.add('preview-add');
      } else {
        cell.classList.add('preview-sub');
      }
    });
  }

  function clearPreview() {
    table.querySelectorAll('.preview-add').forEach(el => el.classList.remove('preview-add'));
    table.querySelectorAll('.preview-sub').forEach(el => el.classList.remove('preview-sub'));
  }

  function applyBoxSelection() {
    forEachCellInBox((cell) => {
      const epoch = Number(cell.dataset.epoch);
      if (paintMode === 'add') {
        selected.add(epoch);
        cell.classList.add('selected');
      } else {
        selected.delete(epoch);
        cell.classList.remove('selected');
      }
    });
  }

  function setMode(mode) {
    paintMode = mode;
    document.getElementById('mode-add').classList.toggle('active', mode === 'add');
    document.getElementById('mode-subtract').classList.toggle('active', mode === 'subtract');
  }

  function getWeekBoundsEpoch() {
    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    const startEpoch = Math.floor(base.getTime() / 1000);
    const endEpoch = startEpoch + 7 * 24 * 3600; // next Sunday 00:00 local
    return { startEpoch, endEpoch, baseDate: base };
  }

  function compressToIntervals(sortedEpochs) {
    const intervals = [];
    if (!sortedEpochs.length) return intervals;

    let curFrom = sortedEpochs[0];
    let prev = sortedEpochs[0];

    for (let i = 1; i < sortedEpochs.length; i++) {
      const t = sortedEpochs[i];
      if (t === prev + SLOT_SEC) {
        prev = t;
      } else {
        intervals.push({ from: curFrom, to: prev + SLOT_SEC });
        curFrom = t;
        prev = t;
      }
    }
    intervals.push({ from: curFrom, to: prev + SLOT_SEC });
    return intervals;
  }

  async function saveWeek() {
    if (!isAuthenticated) return;
    const { startEpoch, endEpoch } = getWeekBoundsEpoch();

    // Collect all selected slots inside the week and compress to intervals
    const inside = Array.from(selected).filter(t => t >= startEpoch && t < endEpoch).sort((a, b) => a - b);
    const intervals = compressToIntervals(inside);

    try {
      const res = await fetch('http://backend.nat20scheduling.com:3000/availability/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({
          from: startEpoch,
          to: endEpoch,
          intervals
        })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Save failed: ${res.status} ${text}`);
        return;
      }
      alert('Saved!');
    } catch {
      alert('Connection error while saving');
    }
  }

  async function loadWeekSelections() {
    const { startEpoch, endEpoch } = getWeekBoundsEpoch();
    try {
      const res = await fetch(`http://backend.nat20scheduling.com:3000/availability/get?from=${startEpoch}&to=${endEpoch}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        // data.intervals = [{from, to}, ...] in epoch seconds
        if (Array.isArray(data.intervals)) {
          // Remove current week's entries first
          for (const t of Array.from(selected)) {
            if (t >= startEpoch && t < endEpoch) selected.delete(t);
          }
          // Expand intervals back into 30-min slots
          for (const iv of data.intervals) {
            const from = Number(iv.from);
            const to = Number(iv.to);
            for (let t = from; t < to; t += SLOT_SEC) {
              selected.add(t);
            }
          }
        }
      }
    } catch {
      // ignore if not available or not authenticated
    }
  }

  function attachEvents() {
    document.getElementById('prev-week').addEventListener('click', async () => {
      if (!isAuthenticated) return;
      weekOffset -= 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      if (!isAuthenticated) return;
      weekOffset += 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('mode-add').addEventListener('click', () => {
      if (!isAuthenticated) return;
      setMode('add');
    });
    document.getElementById('mode-subtract').addEventListener('click', () => {
      if (!isAuthenticated) return;
      setMode('subtract');
    });
    document.getElementById('save').addEventListener('click', saveWeek);
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function setupZoomHandlers() {
    if (!grid) grid = document.getElementById('grid');

    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // normal scroll to pan
      e.preventDefault();
      const delta = Math.sign(e.deltaY); // 1 for down, -1 for up
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') {
        zoomFactor = clamp(zoomFactor + ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
        applyZoomStyles();
      } else if (e.key === '-' || e.key === '_') {
        zoomFactor = clamp(zoomFactor - ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
        applyZoomStyles();
      } else if (e.key === '0') {
        zoomFactor = 1.0;
        applyZoomStyles();
      }
    });
  }

  async function init() {
    applyZoomStyles();
    attachEvents();
    await loadWeekSelections();
    buildGrid();
  }

  function setAuth(authenticated) {
    isAuthenticated = !!authenticated;
  }

  window.schedule = { init, setAuth };
})();
