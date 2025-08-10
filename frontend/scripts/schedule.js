(function () {
  // 24h with 30-min intervals; hour labels only, half-hour label appears when zoomed in
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
  const SLOTS_PER_HOUR = 2; // 30-minute steps
  const HOURS_START = 0;    // 00:00
  const HOURS_END = 24;     // up to 24:00 (exclusive)

  let weekOffset = 0;                 // 0 = current week, -1 previous, +1 next
  let paintMode = 'add';              // 'add' | 'subtract'
  let isAuthenticated = false;

  // Zoom state
  // zoomFactor scales row height, column width, and font size
  let zoomFactor = 1.0;
  const ZOOM_MIN = 0.6;
  const ZOOM_MAX = 2.0;
  const ZOOM_STEP = 0.1;

  // Selection data
  // key: "YYYY-MM-DDTHH:MM:00" (local) -> true
  const selected = new Set();

  // Box selection state
  let isDragging = false;
  let dragStart = null;  // { row, col }
  let dragEnd = null;    // { row, col }

  // Cached DOM
  let table;
  let grid;

  function getStartOfWeek(date) {
    // Week starts on Sunday
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

  function toLocalISOSlot(date, hour, half) {
    const d = new Date(date);
    d.setHours(hour, half ? 30 : 0, 0, 0);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    const mm = String(d.getMinutes()).padStart(2, '0');
    return `${y}-${m}-${dd}T${hh}:${mm}:00`;
  }

  function renderWeekLabel(start) {
    const end = addDays(start, 6);
    const fmt = (dt) => dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const year = start.getFullYear() === end.getFullYear() ? start.getFullYear() : `${start.getFullYear()}–${end.getFullYear()}`;
    document.getElementById('week-label').textContent = `${fmt(start)} – ${fmt(end)}, ${year}`;
  }

  function applyZoomStyles() {
    const root = document.documentElement;
    // Base values from CSS in schedule.html :root
    const baseRow = 18;     // px
    const baseCol = 110;    // px
    const baseFont = 12;    // px

    root.style.setProperty('--row-height', `${(baseRow * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--col-width', `${(baseCol * zoomFactor).toFixed(2)}px`);
    root.style.setProperty('--font-size', `${(baseFont * zoomFactor).toFixed(2)}px`);

    // Toggle half-hour label visibility by body class based on zoom
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

      const timeCell = document.createElement('td');
      timeCell.className = 'time-col';
      const hh = String(hour).padStart(2, '0');

      // Only show hour marks on :00 rows, leave :30 blank unless zoomed-in class shows minor label (handled by CSS)
      if (!half) {
        const spanHour = document.createElement('span');
        spanHour.className = 'time-label hour';
        spanHour.textContent = `${hh}:00`;
        timeCell.appendChild(spanHour);
      } else {
        const spanHalf = document.createElement('span');
        spanHalf.className = 'time-label half';
        spanHalf.textContent = `${hh}:30`;
        timeCell.appendChild(spanHalf);
      }
      tr.appendChild(timeCell);

      for (let c = 0; c < 7; c++) {
        const cur = addDays(base, c);
        const iso = toLocalISOSlot(cur, hour, half);

        const td = document.createElement('td');
        td.className = 'slot-cell';
        td.dataset.iso = iso;
        td.dataset.row = r;
        td.dataset.col = c;

        if (selected.has(iso)) {
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

    // Attach zoom handlers after grid exists
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
      const iso = cell.dataset.iso;
      if (paintMode === 'add') {
        selected.add(iso);
        cell.classList.add('selected');
      } else {
        selected.delete(iso);
        cell.classList.remove('selected');
      }
    });
  }

  function setMode(mode) {
    paintMode = mode;
    document.getElementById('mode-add').classList.toggle('active', mode === 'add');
    document.getElementById('mode-subtract').classList.toggle('active', mode === 'subtract');
  }

  function getWeekRange() {
    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    const start = new Date(base);
    const end = new Date(base);
    end.setDate(end.getDate() + 6);
    end.setHours(23,59,59,999);
    return { start, end, weekStartLabel: formatDateLabel(base) };
  }

  function isInRangeLocal(iso, start, end) {
    const d = new Date(iso);
    return d >= start && d <= end;
  }

  async function saveWeek() {
    if (!isAuthenticated) return;
    const { start, end, weekStartLabel } = getWeekRange();

    const slots = Array.from(selected).filter((iso) => isInRangeLocal(iso, start, end));

    try {
      const res = await fetch('http://backend.nat20scheduling.com:3000/availability/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ weekStart: weekStartLabel, slots })
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
    const { weekStartLabel, start, end } = getWeekRange();
    try {
      const res = await fetch(`http://backend.nat20scheduling.com:3000/availability/get?weekStart=${encodeURIComponent(weekStartLabel)}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.slots)) {
          // Remove existing slots for the week, then add loaded ones
          for (const iso of Array.from(selected)) {
            if (isInRangeLocal(iso, start, end)) selected.delete(iso);
          }
          data.slots.forEach(s => selected.add(s));
        }
      }
    } catch {
      // ok to ignore if not available or not authenticated
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

    // Shift + Wheel => zoom. Normal wheel => scroll/pan as usual.
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // allow normal scrolling
      e.preventDefault();
      const delta = Math.sign(e.deltaY); // 1 for down, -1 for up
      zoomFactor = clamp(zoomFactor - delta * ZOOM_STEP, ZOOM_MIN, ZOOM_MAX);
      applyZoomStyles();
    }, { passive: false });

    // Keyboard shortcuts for zoom if desired (+/- with Shift)
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
