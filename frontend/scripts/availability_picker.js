/* Availability Picker — refactored to use schedule_shared.js for grid/now/zoom. */
(function () {
  'use strict';

  const Shared = window.scheduleShared;
  const DEF = Shared.DEFAULTS;

  // ---- State ----
  let tz = Shared.resolveTimezone();
  let weekStartIdx = 1; // Mon
  let weekOffset = 0;
  let hour12 = false;

  let zoomFactor = 1.0;
  let zoomMinFit = 0.35;

  const selected = new Set(); // epoch seconds of selected slots

  // Elements
  let grid, gridContent, table, weekLabelEl, dragHintEl, signinTooltipEl;

  // ---- Init ----
  function init() {
    grid = document.getElementById('grid');
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    weekLabelEl = document.getElementById('week-label');
    signinTooltipEl = document.getElementById('signin-tooltip');

    setupControls();
    buildGrid(); // includes week label

    // Zoom handlers
    setupZoomHandlers();

    // Recompute zoom fit and NOW on resize
    window.addEventListener('resize', () => {
      requestAnimationFrame(() => {
        const fit = Shared.initialZoomToFit24h(table, gridContent, (24 - DEF.HOURS_START) * DEF.SLOTS_PER_HOUR, DEF.ZOOM_MIN, DEF.ZOOM_MAX);
        zoomMinFit = fit.min;
        zoomFactor = Math.max(zoomFactor, fit.min);
        Shared.applyZoomStyles(zoomFactor);
      });
    });

    // Load initial availability
    loadAvailability();
  }

  // ---- Build Grid ----
  let lastBuildCtx = null;
  function buildGrid() {
    const ctx = Shared.buildWeekTable(table, {
      tz, hour12, weekStartIdx, weekOffset,
      SLOTS_PER_HOUR: DEF.SLOTS_PER_HOUR,
      HOURS_START: DEF.HOURS_START,
      HOURS_END: DEF.HOURS_END,
      selectedEpochs: selected,
      onCreateCell: attachCellHandlers,
    });
    lastBuildCtx = ctx;
    Shared.renderWeekLabel(weekLabelEl, ctx.dayEpochs[0].epoch, tz);

    // Fit zoom to container
    const fit = Shared.initialZoomToFit24h(table, gridContent, ctx.rowsPerDay, DEF.ZOOM_MIN, DEF.ZOOM_MAX);
    zoomMinFit = fit.min;
    zoomFactor = Math.max(zoomFactor, fit.min);
    Shared.applyZoomStyles(zoomFactor);

    // NOW marker
    Shared.bindNowMarkerAuto(table, gridContent, () => ({
      baseEpoch: ctx.dayEpochs[0].epoch, tz,
      hoursStart: DEF.HOURS_START, slotsPerHour: DEF.SLOTS_PER_HOUR
    }));

    // Disable past cells (based on current time in tz)
    markPastCells(ctx);
  }

  function markPastCells(ctx) {
    const now = Math.floor(Date.now() / 1000);
    const start = ctx.dayEpochs[0].epoch;
    const end = start + 7 * 86400;
    const cells = table.querySelectorAll('tbody td.slot-cell');
    for (const td of cells) {
      const ep = +td.dataset.epoch;
      td.classList.toggle('past', ep < now && ep >= start && ep < end);
    }
  }

  // ---- Cell interactions (drag add/subtract) ----
  let mode = 'add'; // 'add' | 'subtract'
  let dragging = false;
  let dragWillSelect = true;
  let dragStart = null;

  function attachCellHandlers(td, info) {
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
    const step = 3600 / DEF.SLOTS_PER_HOUR;

    for (let ep = a; ep <= b; ep += step) {
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

  // ---- Zoom handlers (Shift+wheel) ----
  function setupZoomHandlers() {
    grid.addEventListener('wheel', (e) => {
      if (!e.shiftKey) return; // allow normal panning without Shift
      e.preventDefault();
      const delta = Math.sign(e.deltaY);
      zoomFactor = clamp(zoomFactor - delta * DEF.ZOOM_STEP, zoomMinFit, DEF.ZOOM_MAX);
      Shared.applyZoomStyles(zoomFactor);
    }, { passive: false });

    window.addEventListener('keydown', (e) => {
      if (!e.shiftKey) return;
      if (e.key === '=' || e.key === '+') { zoomFactor = clamp(zoomFactor + DEF.ZOOM_STEP, zoomMinFit, DEF.ZOOM_MAX); Shared.applyZoomStyles(zoomFactor); }
      else if (e.key === '-' || e.key === '_') { zoomFactor = clamp(zoomFactor - DEF.ZOOM_STEP, zoomMinFit, DEF.ZOOM_MAX); Shared.applyZoomStyles(zoomFactor); }
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
    // Simple UI helper to show tooltip if not signed in
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
  function clamp(v, a, b) { return Math.min(b, Math.max(a, v)); }

  // ---- Expose ----
  window.schedule = {
    init,
    setAuth
  };

  document.addEventListener('DOMContentLoaded', init);
})();
