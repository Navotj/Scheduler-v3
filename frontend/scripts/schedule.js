(function () {
  const HOURS_START = 8;   // inclusive
  const HOURS_END = 22;    // exclusive
  const DAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

  let weekOffset = 0; // 0 = current week, -1 previous, +1 next
  let paintMode = 'add'; // 'add' | 'subtract'
  let isMouseDown = false;

  // Map key: ISO "YYYY-MM-DDTHH:00:00Z" -> true
  let selected = new Set();

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

  function asHourISOLocal(date, hour) {
    const d = new Date(date);
    d.setHours(hour, 0, 0, 0);
    // Use local time ISO without timezone conversion; backend should treat as local or specify tz handling.
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    const hh = String(d.getHours()).padStart(2, '0');
    return `${y}-${m}-${day}T${hh}:00:00`;
  }

  function renderWeekLabel(start) {
    const end = addDays(start, 6);
    const fmt = (dt) => dt.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
    const year = start.getFullYear() === end.getFullYear() ? start.getFullYear() : `${start.getFullYear()}–${end.getFullYear()}`;
    document.getElementById('week-label').textContent = `${fmt(start)} – ${fmt(end)}, ${year}`;
  }

  function buildGrid() {
    const table = document.getElementById('schedule-table');
    table.innerHTML = '';

    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    renderWeekLabel(base);

    // Header row
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

    for (let hour = HOURS_START; hour < HOURS_END; hour++) {
      const tr = document.createElement('tr');

      const timeCell = document.createElement('td');
      timeCell.className = 'time-col';
      const label = `${String(hour).padStart(2, '0')}:00`;
      timeCell.textContent = label;
      tr.appendChild(timeCell);

      for (let i = 0; i < 7; i++) {
        const cur = addDays(base, i);
        const iso = asHourISOLocal(cur, hour);
        const td = document.createElement('td');
        td.className = 'hour-cell';
        td.dataset.iso = iso;

        if (selected.has(iso)) {
          td.classList.add('selected');
        }

        td.addEventListener('mousedown', (e) => {
          e.preventDefault();
          isMouseDown = true;
          applyCell(td);
        });

        td.addEventListener('mouseenter', () => {
          if (!isMouseDown) return;
          applyCell(td, true);
        });

        td.addEventListener('mouseup', () => {
          isMouseDown = false;
          clearDragState(td);
        });

        tr.appendChild(td);
      }

      tbody.appendChild(tr);
    }

    table.appendChild(tbody);

    document.addEventListener('mouseup', () => {
      isMouseDown = false;
      const cells = table.querySelectorAll('.hour-cell.dragging-add, .hour-cell.dragging-sub');
      cells.forEach(clearDragState);
    });
  }

  function applyCell(td, dragging = false) {
    if (paintMode === 'add') {
      selected.add(td.dataset.iso);
      td.classList.add('selected');
      if (dragging) {
        td.classList.add('dragging-add');
      }
    } else {
      selected.delete(td.dataset.iso);
      td.classList.remove('selected');
      if (dragging) {
        td.classList.add('dragging-sub');
      }
    }
  }

  function clearDragState(td) {
    td.classList.remove('dragging-add');
    td.classList.remove('dragging-sub');
  }

  function setMode(mode) {
    paintMode = mode;
    document.getElementById('mode-add').classList.toggle('active', mode === 'add');
    document.getElementById('mode-subtract').classList.toggle('active', mode === 'subtract');
  }

  async function saveWeek() {
    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);

    const weekStart = formatDateLabel(base);
    const slots = Array.from(selected).filter((iso) => iso.startsWith(weekStart));

    try {
      const res = await fetch('http://backend.nat20scheduling.com:3000/availability/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ weekStart, slots })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Save failed: ${res.status} ${text}`);
        return;
      }
      alert('Saved!');
    } catch (e) {
      alert('Connection error while saving');
    }
  }

  async function loadWeekSelections() {
    const today = new Date();
    const base = getStartOfWeek(today);
    base.setDate(base.getDate() + weekOffset * 7);
    const weekStart = formatDateLabel(base);
    try {
      const res = await fetch(`http://backend.nat20scheduling.com:3000/availability/get?weekStart=${encodeURIComponent(weekStart)}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        // Expecting { slots: ["YYYY-MM-DDTHH:00:00", ...] }
        if (Array.isArray(data.slots)) {
          // Remove current week's entries first
          for (const iso of Array.from(selected)) {
            if (iso.startsWith(weekStart)) selected.delete(iso);
          }
          data.slots.forEach(s => selected.add(s));
        }
      }
    } catch {
      // Ignore load errors; user might be logged out or endpoint not ready
    }
  }

  function attachEvents() {
    document.getElementById('prev-week').addEventListener('click', async () => {
      weekOffset -= 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('next-week').addEventListener('click', async () => {
      weekOffset += 1;
      await loadWeekSelections();
      buildGrid();
    });
    document.getElementById('mode-add').addEventListener('click', () => setMode('add'));
    document.getElementById('mode-subtract').addEventListener('click', () => setMode('subtract'));
    document.getElementById('save').addEventListener('click', saveWeek);
  }

  async function init() {
    attachEvents();
    await loadWeekSelections();
    buildGrid();
  }

  window.schedule = { init };
})();
