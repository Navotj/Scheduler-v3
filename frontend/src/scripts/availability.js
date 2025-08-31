(function () {
  const SLOTS_PER_HOUR = 2;            // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;
  const ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

  // State
  let isAuthenticated = true;
  let paintMode = 'add';
  let weekOffset = 0;                   // in weeks relative to current
  const selected = new Set();           // epoch seconds of selected slots (current page’s week)
  let slotHeight = 18;                  // px; controls vertical zoom of slots
  let unsaved = false;                  // track unsaved changes

  // DOM refs
  let gridContent, table, rightPane;

  // --- Settings bridge ---
  const SETTINGS_KEY = 'nat20_settings';
  function readSettings() {
    // Delegate to shared to keep consistency
    const s = shared.readSettings();
    return { tz: s.tz, clock: s.clock, weekStart: s.weekStart };
  }
  let cfg = readSettings();

  window.addEventListener('storage', (e) => {
    if (e && e.key === SETTINGS_KEY) {
      cfg = readSettings();
      buildGrid();
      updateNowMarker();
      // Templates list does not depend on weekOffset, but repaint previews on font/zoom changes
      renderTemplatesPanel(); // safe to call; it will noop if right pane not present
    }
  });

  // --- Unsaved-change helpers ---
  function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = 'You have unsaved changes.'; // some browsers ignore custom text
  }
  function markDirty() {
    if (!unsaved) {
      unsaved = true;
      window.addEventListener('beforeunload', onBeforeUnload);
    }
  }
  function markSaved() {
    if (unsaved) {
      unsaved = false;
      window.removeEventListener('beforeunload', onBeforeUnload);
    }
  }
  function confirmLeaveIfDirty() {
    return !unsaved || window.confirm('You have unsaved changes. Leave without saving?');
  }

  // --- Labels ---
  function renderWeekLabel(startEpoch, tz) {
    shared.renderWeekRangeLabel('week-label', startEpoch, tz);
  }

  // --- Build grid via shared skeleton ---
  function buildGrid() {
    cfg = readSettings();
    const tz = cfg.tz;
    if (!table) return;

    // date format from shared settings
    const dateFmt = shared.getSavedDateFormat();

    // Build table via shared skeleton
    const out = shared.buildWeekTableSkeleton(table, {
      tz,
      clock: cfg.clock,
      weekStart: cfg.weekStart,
      weekOffset,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END,
      slotsPerHour: SLOTS_PER_HOUR,
      dateFormat: dateFmt,
      onCellCreate: (td, ctx) => {
        // "past" marking at build time (also refreshed on updateNowMarker)
        if (ctx.epoch < Math.floor(Date.now() / 1000)) td.classList.add('past');

        td.addEventListener('mousedown', (e) => {
          // Block interaction when not authenticated and show toast
          if (!isAuthenticated) {
            e.preventDefault();
            shared.showToast('You must be logged in to edit your availability.', 'info');
            return;
          }
          if (td.classList.contains('past')) return;
          e.preventDefault();
          dragStart = { row: ctx.row, col: ctx.day };
          dragEnd = { row: ctx.row, col: ctx.day };
          isDragging = true;
          updatePreview();
        });

        td.addEventListener('mouseenter', () => {
          if (!isAuthenticated || !isDragging || td.classList.contains('past')) return;
          dragEnd = { row: ctx.row, col: ctx.day };
          updatePreview();
        });

        td.addEventListener('mouseup', () => {
          if (!isAuthenticated || !isDragging || td.classList.contains('past')) return;
          dragEnd = { row: ctx.row, col: ctx.day };
          applyBoxSelection();
          clearPreview();
          isDragging = false;
          dragStart = dragEnd = null;
        });
      }
    });

    renderWeekLabel(out.baseEpoch, tz);

    loadWeekSelections().then(applySelectedClasses);

    updateNowMarker();

    applySlotHeight();
  }

  // --- Drag selection ---
  let isDragging = false;
  let dragStart = null;
  let dragEnd = null;

  function forEachCellInBox(fn) {
    if (!dragStart || !dragEnd) return;
    const r1 = Math.min(dragStart.row, dragEnd.row);
    const r2 = Math.max(dragStart.row, dragEnd.row);
    const c1 = Math.min(dragStart.col, dragEnd.col);
    const c2 = Math.max(dragStart.col, dragEnd.col);
    for (let r = r1; r <= r2; r++) {
      for (let c = c1; c <= c2; c++) {
        const cell = table.querySelector('td.slot-cell[data-row="'+r+'"][data-col="'+c+'"]');
        if (cell && !cell.classList.contains('past')) fn(cell);
      }
    }
  }
  function clearPreview() {
    table.querySelectorAll('.preview-add, .preview-sub').forEach(el => el.classList.remove('preview-add', 'preview-sub'));
  }
  function updatePreview() {
    clearPreview();
    forEachCellInBox((cell) => {
      cell.classList.add(paintMode === 'add' ? 'preview-add' : 'preview-sub');
    });
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
    markDirty();
  }
  function applySelectedClasses() {
    const cells = table.querySelectorAll('td.slot-cell');
    cells.forEach(cell => {
      const epoch = Number(cell.dataset.epoch);
      if (selected.has(epoch)) cell.classList.add('selected'); else cell.classList.remove('selected');
    });
  }

  // --- NOW marker / past shading (shared) ---
  function updateNowMarker() {
    if (!table || !gridContent) return;
    // keep "past" class refreshed as time passes
    shared.shadePastCells(table, { clearInlineBg: false });
    // bind and position NOW
    const weekStart = (cfg.weekStart === 'mon') ? 'mon' : 'sun';
    shared.bindNowMarker(gridContent, table, { tz: cfg.tz, weekStart, weekOffset });
    shared.positionNowMarker({ gridContent, table, tz: cfg.tz, weekStart, weekOffset });
  }

  // --- Controls ---
  function setMode(m) {
    paintMode = m === 'subtract' ? 'subtract' : 'add';
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    if (addBtn) addBtn.setAttribute('aria-pressed', String(paintMode === 'add'));
    if (subBtn) subBtn.setAttribute('aria-pressed', String(paintMode === 'subtract'));
  }

  async function loadWeekSelections() {
    const tz = cfg.tz;
    const { baseEpoch } = shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset);
    const endEpoch = baseEpoch + 7 * 86400;

    // Keep only selections outside this week; clear inside-week, re-fill from server
    for (const t of Array.from(selected)) if (t >= baseEpoch && t < endEpoch) selected.delete(t);

    try {
      const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
      if (!api) return; // offline mode
      const res = await fetch(`${api}/availability/get?from=${baseEpoch}&to=${endEpoch}`, {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        const data = await res.json();
        if (Array.isArray(data.intervals)) {
          for (const iv of data.intervals) {
            const from = Number(iv.from);
            const to = Number(iv.to);
            for (let t = from; t < to; t += SLOT_SEC) selected.add(t);
          }
        }
      }
    } catch {}
  }

  function compressToIntervals(sortedEpochs) {
    const intervals = [];
    if (!sortedEpochs.length) return intervals;
    let curFrom = sortedEpochs[0];
    let prev = sortedEpochs[0];
    for (let i = 1; i < sortedEpochs.length; i++) {
      const t = sortedEpochs[i];
      if (t === prev + SLOT_SEC) prev = t;
      else { intervals.push({ from: curFrom, to: prev + SLOT_SEC }); curFrom = t; prev = t; }
    }
    intervals.push({ from: curFrom, to: prev + SLOT_SEC });
    return intervals;
  }

  async function saveWeek() {
    if (!isAuthenticated) return;
    const tz = cfg.tz;
    const { baseEpoch } = shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset);
    const endEpoch = baseEpoch + 7 * 86400;

    const inside = Array.from(selected).filter(t => t >= baseEpoch && t < endEpoch).sort((a,b) => a-b);
    const intervals = compressToIntervals(inside);

    try {
      const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
      if (!api) { alert('No API configured'); return; }
      const res = await fetch(`${api}/availability/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ from: baseEpoch, to: endEpoch, intervals, sourceTimezone: tz })
      });
      if (!res.ok) {
        const text = await res.text();
        alert(`Save failed: ${res.status} ${text}`);
        return;
      }
      markSaved();
      alert('Saved!');
    } catch {
      alert('Connection error while saving');
    }
  }

  function attachControls() {
    const prev = document.getElementById('prev-week');
    const next = document.getElementById('next-week');
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    const saveBtn = document.getElementById('save');

    // Allow navigation regardless of auth, but guard unsaved
    if (prev) prev.addEventListener('click', () => {
      if (!confirmLeaveIfDirty()) return;
      markSaved();
      weekOffset -= 1;
      buildGrid();
    });
    if (next) next.addEventListener('click', () => {
      if (!confirmLeaveIfDirty()) return;
      markSaved();
      weekOffset += 1;
      buildGrid();
    });

    // Editing actions remain gated by auth
    if (addBtn) addBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('add'); });
    if (subBtn) subBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('subtract'); });
    if (saveBtn) saveBtn.addEventListener('click', saveWeek);
  }

  // Intercept in-page link navigation to guard unsaved changes (custom confirm)
  function interceptLinkNavigation() {
    document.addEventListener('click', function(e) {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;

      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;

      const tgt = (a.getAttribute('target') || '').toLowerCase();
      if (tgt && tgt !== '_self') return; // let new tab/window proceed without prompts

      if (unsaved) {
        const ok = window.confirm('You have unsaved changes. Leave without saving?');
        if (!ok) {
          e.preventDefault();
          e.stopPropagation();
          return;
        }
        // User chose to leave: suppress the native beforeunload prompt for this navigation
        window.removeEventListener('beforeunload', onBeforeUnload);
        unsaved = false;
      }
      // allow navigation to proceed
    }, true);
  }

  // --- Zoom (Shift + Scroll) via shared ---
  function applySlotHeight() {
    shared.setSlotHeight(gridContent, slotHeight);
  }
  const wheelZoomHandler = shared.createWheelZoomHandler({
    get: () => slotHeight,
    set: (v) => { slotHeight = v; },
    gridContent: null, // set in init
    min: 12,
    max: 48,
    step: 2,
    onChange: () => { updateNowMarker(); }
  });

  // ===============================
  // Templates side panel (right)
  // ===============================
  async function fetchTemplatesList() {
    try {
      const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
      if (!api) return [];
      const res = await fetch(`${api}/templates/list`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.templates) ? data.templates : [];
    } catch { return []; }
  }

  async function fetchTemplate(id) {
    if (!id) return null;

    // Single-flight + memory cache without touching globals
    const inflight = fetchTemplate._inflight || (fetchTemplate._inflight = new Map());
    const cache = fetchTemplate._cache || (fetchTemplate._cache = new Map());

    // Return cached result immediately (good enough for preview rendering)
    if (cache.has(id)) return cache.get(id);

    // Coalesce concurrent identical GETs
    if (inflight.has(id)) return inflight.get(id);

    const p = (async () => {
      try {
        const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
        if (!api) return null;
        const res = await fetch(`${api}/templates/get?id=${encodeURIComponent(id)}`, {
          credentials: 'include',
          cache: 'no-store'
        });
        if (!res.ok) return null;
        const data = await res.json();
        const tpl = (data && data.template) ? data.template : null;
        if (tpl) cache.set(id, tpl);
        return tpl;
      } catch {
        return null;
      } finally {
        inflight.delete(id);
      }
    })();

    inflight.set(id, p);
    return p;
  }


  function ensureRightPaneSkeleton() {
    // Use the existing right-panel markup from availability.html:
    // <section id="side-cards-panel" class="panel"><div id="side-cards" class="side-cards"></div></section>
    const list = document.getElementById('side-cards');
    return list || null;
  }

  function drawTinyPreview(canvas, tpl) {
    // Use the canvas's existing CSS size (do NOT change card/layout).
    const rect = canvas.getBoundingClientRect();
    const cssW = Math.max(40, Math.round(rect.width || 84));
    const cssH = Math.max(20, Math.round(rect.height || 42));

    // Backing store for crisp rendering at device pixel ratio
    const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
    canvas.width = cssW * dpr;
    canvas.height = cssH * dpr;

    const ctx = canvas.getContext('2d');
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0); // draw in CSS pixels
    ctx.imageSmoothingEnabled = false;

    const w = cssW;
    const h = cssH;

    // Grid config
    const cols = 7;
    const rows = 12; // 2h per row
    const cw = w / cols;
    const rh = h / rows;

    // Clear
    ctx.clearRect(0, 0, w, h);

    // Draw full-bleed grid including right and bottom edges
    ctx.globalAlpha = 0.25;
    ctx.strokeStyle = '#888';
    ctx.lineWidth = 1;

    // Vertical lines (snap to pixel grid; ensure last line is w - 0.5)
    for (let c = 0; c <= cols; c++) {
      const x = (c === cols) ? (w - 0.5) : (Math.floor(c * cw) + 0.5);
      ctx.beginPath();
      ctx.moveTo(x, 0);
      ctx.lineTo(x, h);
      ctx.stroke();
    }

    // Horizontal lines (snap to pixel grid; ensure last line is h - 0.5)
    for (let r = 0; r <= rows; r++) {
      const y = (r === rows) ? (h - 0.5) : (Math.floor(r * rh) + 0.5);
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(w, y);
      ctx.stroke();
    }

    // Fill intervals to touch borders exactly (no 1px gaps)
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = '#7c5cff';

    const days = Array.isArray(tpl.days) ? tpl.days : [];
    for (let day = 0; day < 7; day++) {
      const intervals = Array.isArray(days[day]) ? days[day] : [];
      // Exact integer pixel span for the column
      const x0 = Math.floor(day * cw);
      const x1 = Math.floor((day + 1) * cw);
      const colW = Math.max(1, x1 - x0);

      for (const pair of intervals) {
        const fromMin = Number(pair[0]);
        const toMin = Number(pair[1]);
        if (!Number.isFinite(fromMin) || !Number.isFinite(toMin) || toMin <= fromMin) continue;

        // Map minutes to pixel rows; align to integers
        const y0 = Math.floor((fromMin / 1440) * h);
        const y1 = Math.floor((toMin / 1440) * h);
        const rectH = Math.max(1, y1 - y0);

        ctx.fillRect(x0, y0, colW, rectH);
      }
    }
  }

  async function renderTemplatesPanel() {
    const listEl = ensureRightPaneSkeleton();
    if (!listEl) return;
    listEl.textContent = 'Loading…';

    const items = await fetchTemplatesList();
    listEl.textContent = '';

    if (!items.length) {
      const empty = document.createElement('div');
      empty.className = 'card';
      const top = document.createElement('div');
      top.className = 'res-top';
      top.textContent = 'No templates yet.';
      empty.appendChild(top);
      listEl.appendChild(empty);
      return;
    }

    for (const meta of items) {
      const card = document.createElement('div');
      card.className = 'card';
      card.dataset.id = String(meta.id);
      card.setAttribute('draggable', 'true');

      const title = document.createElement('div');
      title.className = 'res-top';
      title.textContent = meta.name || 'Template';

      const canvas = document.createElement('canvas');
      canvas.className = 'tpl-mini';

      card.appendChild(title);
      card.appendChild(canvas);
      listEl.appendChild(card);

      // Hover effect parity with matcher results
      card.addEventListener('mouseenter', () => card.classList.add('hovered'));
      card.addEventListener('mouseleave', () => card.classList.remove('hovered'));

      // Click anywhere to apply (confirmation handled inside applyTemplateById when overwriting)
      card.addEventListener('click', async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await applyTemplateById(meta.id);
      });

      // Drag-to-apply support
      card.addEventListener('dragstart', (e) => {
        e.dataTransfer.setData('text/plain', String(meta.id));
        try { e.dataTransfer.setData('application/x-template-id', String(meta.id)); } catch {}
        e.dataTransfer.effectAllowed = 'copy';
      });

      // Fetch full template to render visual preview only
      fetchTemplate(meta.id).then((tpl) => {
        if (!tpl) return;
        drawTinyPreview(canvas, tpl);
      }).catch(() => {});
    }
  }

  function bindDropZone() {
    if (!gridContent) return;
    gridContent.addEventListener('dragover', (e) => {
      if (!isAuthenticated) return;
      const hasId = e.dataTransfer && (e.dataTransfer.types.includes('application/x-template-id') || e.dataTransfer.types.includes('text/plain'));
      if (!hasId) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'copy';
    });
    gridContent.addEventListener('drop', async (e) => {
      if (!isAuthenticated) {
        shared.showToast('You must be logged in to edit your availability.', 'info');
        return;
      }
      const id = (e.dataTransfer && (e.dataTransfer.getData('application/x-template-id') || e.dataTransfer.getData('text/plain'))) || '';
      if (!id) return;
      e.preventDefault();
      await applyTemplateById(id);
    });
  }

  async function applyTemplateById(id) {
    const tpl = await fetchTemplate(id);
    if (!tpl) { shared.showToast('Failed to load template.', 'error'); return; }

    const tz = cfg.tz;
    const { baseEpoch } = shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset);
    const endEpoch = baseEpoch + 7 * 86400;

    const hasExisting = Array.from(selected).some(t => t >= baseEpoch && t < endEpoch);
    if (hasExisting) {
      const ok = window.confirm('This will overwrite this week’s data. Continue?');
      if (!ok) return;
    }

    // Clear current week
    for (const t of Array.from(selected)) { if (t >= baseEpoch && t < endEpoch) selected.delete(t); }

    // Apply template into current week
    const days = Array.isArray(tpl.days) ? tpl.days : [];
    for (let day = 0; day < 7; day++) {
      const ymd = shared.addDays(shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset).baseYMD.y,
                                 shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset).baseYMD.m,
                                 shared.getWeekStartEpochAndYMD(tz, cfg.weekStart, weekOffset).baseYMD.d, day);
      const intervals = Array.isArray(days[day]) ? days[day] : [];
      for (const pair of intervals) {
        const fromMin = Number(pair[0]);
        const toMin = Number(pair[1]);
        if (!Number.isFinite(fromMin) || !Number.isFinite(toMin) || toMin <= fromMin) continue;
        const fromRow = minuteToRow(fromMin);
        const toRow = minuteToRow(toMin); // exclusive
        for (let r = Math.max(0, fromRow); r < Math.min(ROWS_PER_DAY, toRow); r++) {
          const hour = Math.floor(r / SLOTS_PER_HOUR) + HOURS_START;
          const minute = Math.round((r % SLOTS_PER_HOUR) * (60 / SLOTS_PER_HOUR));
          const epoch = shared.epochFromZoned(ymd.y, ymd.m, ymd.d, hour, minute, tz);
          if (epoch >= baseEpoch && epoch < endEpoch) selected.add(epoch);
        }
      }
    }

    applySelectedClasses();
    markDirty();
    shared.showToast('Template applied to this week.', 'success');
  }

  function minuteToRow(minute) {
    const slotMin = 60 / SLOTS_PER_HOUR; // 30
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    const row = (h - HOURS_START) * SLOTS_PER_HOUR + Math.floor(m / slotMin + 1e-6);
    return row;
  }

  // --- Init / Public API ---
  function init() {
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    rightPane = document.querySelector('.availability-right');
    if (!gridContent || !table) return;

    // bind handler target now that gridContent exists
    wheelZoomHandler.gridContent = gridContent;

    setMode('add');
    attachControls();
    interceptLinkNavigation();

    // Start fully zoomed out like matcher
    slotHeight = 12;
    applySlotHeight();

    // Block all table interactions when not authenticated and surface a toast
    const authGuard = (e) => {
      if (!isAuthenticated) {
        e.preventDefault();
        e.stopPropagation();
        shared.showToast('You must be logged in to edit your availability.', 'info');
      }
    };
    gridContent.addEventListener('pointerdown', authGuard, true);
    gridContent.addEventListener('contextmenu', authGuard, true);

    // ——— Sync auth state from topbar/auth.js without reloading ———
    function observeAuthButton() {
      const btn = document.getElementById('auth-btn');
      if (!btn) return;
      // set initial from current button state
      setAuth(btn.dataset.state === 'authenticated');
      // watch for changes driven by auth.js
      const mo = new MutationObserver((mutList) => {
        for (const m of mutList) {
          if (m.type === 'attributes' && m.attributeName === 'data-state') {
            setAuth(btn.dataset.state === 'authenticated');
          }
        }
      });
      mo.observe(btn, { attributes: true, attributeFilter: ['data-state'] });
    }

    // Hook into auth.js' setAuthState if available (and if it appears later)
    function hookSetAuthState() {
      if (window.__setAuthStateHooked) return;
      if (typeof window.setAuthState === 'function') {
        const original = window.setAuthState;
        window.setAuthState = function(isAuthed, username) {
          const r = original.apply(this, arguments);
          try { setAuth(!!isAuthed); } catch {}
          return r;
        };
        window.__setAuthStateHooked = true;
      }
    }

    observeAuthButton();
    hookSetAuthState();
    // Retry hooking a few times in case auth.js loads after this script
    let hookTries = 0;
    const hookTimer = setInterval(() => {
      hookTries += 1;
      hookSetAuthState();
      if (window.__setAuthStateHooked || hookTries > 20) clearInterval(hookTimer);
    }, 250);

    gridContent.addEventListener('wheel', wheelZoomHandler, { passive: false });

    buildGrid();

    // Keep the NOW marker in sync & update past shading
    setInterval(updateNowMarker, 60000);

    // Right pane templates
    renderTemplatesPanel();
    bindDropZone();

    // Final fallback to server-side auth (covers hard refresh / first load)
    (async () => {
      try {
        const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
        if (!api) return;
        const res = await fetch(`${api}/auth/check`, { credentials: 'include', cache: 'no-store' });
        setAuth(res.ok);
        // After auth known, refresh templates (list may be auth-gated)
        renderTemplatesPanel();
      } catch {}
    })();
  }

  function setAuth(v) {
    const next = !!v;
    if (next === isAuthenticated) return;

    isAuthenticated = next;

    // Reset state to avoid leaking previous user's selections/preview
    isDragging = false;
    dragStart = null;
    dragEnd = null;
    selected.clear();
    markSaved();

    // Re-render grid to reflect new auth state and reload data
    buildGrid();

    // Re-render templates panel (auth may change list visibility)
    renderTemplatesPanel();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.schedule = { init, setAuth };
})();
