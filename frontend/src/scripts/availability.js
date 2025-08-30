(function () {
  const SLOTS_PER_HOUR = 2;            // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_SEC = 30 * 60;

  // State
  let isAuthenticated = true;
  let paintMode = 'add';
  let weekOffset = 0;                   // in weeks relative to current
  const selected = new Set();           // epoch seconds of selected slots (current page’s week)
  let slotHeight = 18;                  // px; controls vertical zoom of slots
  let unsaved = false;                  // track unsaved changes

  // DOM refs
  let gridContent, table;

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

  // --- Init / Public API ---
  function init() {
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
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

    // Final fallback to server-side auth (covers hard refresh / first load)
    (async () => {
      try {
        const api = (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
        if (!api) return;
        const res = await fetch(`${api}/auth/check`, { credentials: 'include', cache: 'no-store' });
        setAuth(res.ok);
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
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  window.schedule = { init, setAuth };
})();
