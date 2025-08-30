(function () {
  'use strict';

  // ===== Config (match availability) =====
  const SLOTS_PER_HOUR = 2;            // 30-minute slots
  const HOURS_START = 0;
  const HOURS_END = 24;
  const SLOT_MIN = 60 / SLOTS_PER_HOUR; // 30
  const ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

  // ===== State =====
  let isAuthenticated = true;
  let paintMode = 'add';
  let slotHeight = 18;                  // px; Shift+Wheel adjusts
  let unsaved = false;                  // track unsaved changes

  // Subjective selection: key = day * ROWS_PER_DAY + row
  const selected = new Set();

  // DOM refs
  let gridContent, table;

  // Settings snapshot
  function readSettings() {
    const s = shared.readSettings();
    return { tz: s.tz, clock: s.clock, weekStart: s.weekStart, dateFormat: s.dateFormat };
  }
  let cfg = readSettings();

  window.addEventListener('storage', (e) => {
    if (e && e.key === shared.SETTINGS_KEY) {
      cfg = readSettings();
      buildGrid();
      applySlotHeight();
    }
  });

  // ===== Unsaved-change helpers =====
  function onBeforeUnload(e) {
    e.preventDefault();
    e.returnValue = 'You have unsaved template changes.';
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
    return !unsaved || window.confirm('You have unsaved template changes. Leave without saving?');
  }

  // ===== Grid build (shared skeleton; headers trimmed to weekday only) =====
  function buildGrid() {
    cfg = readSettings();
    if (!table) return;

    const out = shared.buildWeekTableSkeleton(table, {
      tz: cfg.tz,
      clock: cfg.clock,
      weekStart: cfg.weekStart,
      weekOffset: 0,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END,
      slotsPerHour: SLOTS_PER_HOUR,
      dateFormat: cfg.dateFormat,
      onCellCreate: (td, ctx) => {
        td.addEventListener('mousedown', (e) => {
          if (!isAuthenticated) {
            e.preventDefault();
            shared.showToast('You must be logged in to edit templates.', 'info');
            return;
          }
          e.preventDefault();
          dragStart = { row: ctx.row, col: ctx.day };
          dragEnd = { row: ctx.row, col: ctx.day };
          isDragging = true;
          updatePreview();
        });
        td.addEventListener('mouseenter', () => {
          if (!isAuthenticated || !isDragging) return;
          dragEnd = { row: ctx.row, col: ctx.day };
          updatePreview();
        });
        td.addEventListener('mouseup', () => {
          if (!isAuthenticated || !isDragging) return;
          dragEnd = { row: ctx.row, col: ctx.day };
          applyBoxSelection();
          clearPreview();
          isDragging = false;
          dragStart = dragEnd = null;
        });
      }
    });

    // Replace header text with weekday names only
    if (Array.isArray(out.dayEpochs) && out.dayEpochs.length === 7) {
      const ths = table.querySelectorAll('thead th.day');
      for (let i = 0; i < ths.length; i++) {
        const d = new Date(out.dayEpochs[i] * 1000);
        const wk = new Intl.DateTimeFormat(undefined, { timeZone: cfg.tz, weekday: 'short' }).format(d);
        ths[i].textContent = wk;
      }
    }

    applySelectedClasses();
    applySlotHeight();
  }

  // ===== Drag selection =====
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
        if (cell) fn(cell, r, c);
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
    forEachCellInBox((cell, row, col) => {
      const key = col * ROWS_PER_DAY + row;
      if (paintMode === 'add') {
        selected.add(key);
        cell.classList.add('selected');
      } else {
        selected.delete(key);
        cell.classList.remove('selected');
      }
    });
    markDirty();
  }
  function applySelectedClasses() {
    const cells = table.querySelectorAll('td.slot-cell');
    for (const cell of cells) {
      const row = Number(cell.dataset.row);
      const col = Number(cell.dataset.col);
      const key = col * ROWS_PER_DAY + row;
      if (selected.has(key)) cell.classList.add('selected'); else cell.classList.remove('selected');
    }
  }

  // ===== Controls =====
  function setMode(m) {
    paintMode = m === 'subtract' ? 'subtract' : 'add';
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    if (addBtn) addBtn.setAttribute('aria-pressed', String(paintMode === 'add'));
    if (subBtn) subBtn.setAttribute('aria-pressed', String(paintMode === 'subtract'));
  }

  function attachControls() {
    const addBtn = document.getElementById('mode-add');
    const subBtn = document.getElementById('mode-subtract');
    const clearBtn = document.getElementById('template-clear');
    const saveBtn = document.getElementById('template-save');
    const nameInput = document.getElementById('template-name');
    const select = document.getElementById('template-select');
    const deleteBtn = document.getElementById('template-delete');
    const exportBtn = document.getElementById('template-export');

    if (addBtn) addBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('add'); });
    if (subBtn) subBtn.addEventListener('click', () => { if (!isAuthenticated) return; setMode('subtract'); });

    if (clearBtn) clearBtn.addEventListener('click', () => {
      if (!confirmLeaveIfDirty()) return;
      selected.clear();
      applySelectedClasses();
      markSaved();
    });

    if (saveBtn) saveBtn.addEventListener('click', async () => {
      if (!isAuthenticated) return;
      const name = (nameInput && nameInput.value.trim()) || '';
      if (!name) { alert('Enter a template name'); return; }
      const payload = buildTemplatePayload(name);
      const tpl = await apiSaveTemplate(payload);
      if (!tpl) { shared.showToast('Save failed.', 'error'); return; }
      populateTemplateSelect(select, tpl.id);
      markSaved();
      shared.showToast('Template saved.', 'success');
    });

    if (select) select.addEventListener('change', async () => {
      const id = select.value;
      if (!id) return;
      if (!confirmLeaveIfDirty()) { select.value = ''; return; }
      const tpl = await apiGetTemplate({ id });
      if (!tpl) { shared.showToast('Template not found.', 'warn'); return; }
      loadTemplateIntoSelection(tpl);
      applySelectedClasses();
      markSaved();
      if (nameInput) nameInput.value = tpl.name || '';
    });

    if (deleteBtn) deleteBtn.addEventListener('click', async () => {
      const id = select ? select.value : '';
      if (!id) { alert('Choose a template to delete'); return; }
      const ok = window.confirm('Delete this template?');
      if (!ok) return;
      const okDel = await apiDeleteTemplate({ id });
      if (!okDel) { shared.showToast('Delete failed.', 'error'); return; }
      populateTemplateSelect(select, '');
      selected.clear();
      applySelectedClasses();
      markSaved();
      shared.showToast('Template deleted.', 'success');
    });

    if (exportBtn) exportBtn.addEventListener('click', async () => {
      const id = select ? select.value : '';
      if (!id) { alert('Choose a template to export'); return; }
      const tpl = await apiGetTemplate({ id });
      if (!tpl) { shared.showToast('Template not found.', 'warn'); return; }
      const json = JSON.stringify(tpl, null, 2);
      const ok = await shared.copyToClipboard(json);
      shared.showToast(ok ? 'Template JSON copied.' : 'Copy failed.', ok ? 'success' : 'error');
    });
  }

  function interceptLinkNavigation() {
    document.addEventListener('click', function (e) {
      const a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
      if (!a) return;
      const href = a.getAttribute('href');
      if (!href || href.startsWith('#') || href.startsWith('javascript:')) return;
      const tgt = (a.getAttribute('target') || '').toLowerCase();
      if (tgt && tgt !== '_self') return;
      if (unsaved) {
        const ok = window.confirm('You have unsaved template changes. Leave without saving?');
        if (!ok) { e.preventDefault(); e.stopPropagation(); return; }
        window.removeEventListener('beforeunload', onBeforeUnload);
        unsaved = false;
      }
    }, true);
  }

  // ===== Zoom (Shift + Wheel) =====
  function applySlotHeight() { shared.setSlotHeight(gridContent, slotHeight); }
  const wheelZoomHandler = shared.createWheelZoomHandler({
    get: () => slotHeight,
    set: (v) => { slotHeight = v; },
    gridContent: null,
    min: 12, max: 48, step: 2,
    onChange: () => {}
  });

  // ===== Template <-> selection =====
  function rowToMinute(row) {
    const hour = Math.floor(row / SLOTS_PER_HOUR) + HOURS_START;
    const slot = row % SLOTS_PER_HOUR;
    return (hour * 60) + (slot * SLOT_MIN);
  }
  function minuteToRow(minute) {
    const h = Math.floor(minute / 60);
    const m = minute % 60;
    const row = (h - HOURS_START) * SLOTS_PER_HOUR + Math.floor(m / SLOT_MIN + 1e-6);
    return Math.max(0, Math.min(ROWS_PER_DAY, row));
  }

  function buildTemplatePayload(name) {
    const days = [];
    for (let day = 0; day < 7; day++) {
      const rows = [];
      for (let row = 0; row < ROWS_PER_DAY; row++) {
        const key = day * ROWS_PER_DAY + row;
        if (selected.has(key)) rows.push(row);
      }
      rows.sort((a, b) => a - b);
      const intervals = [];
      if (rows.length) {
        let fromRow = rows[0];
        let prevRow = rows[0];
        for (let i = 1; i < rows.length; i++) {
          const r = rows[i];
          if (r === prevRow + 1) prevRow = r;
          else {
            intervals.push([rowToMinute(fromRow), rowToMinute(prevRow + 1)]);
            fromRow = r; prevRow = r;
          }
        }
        intervals.push([rowToMinute(fromRow), rowToMinute(prevRow + 1)]);
      }
      days.push(intervals);
    }
    return {
      name: String(name || 'Untitled'),
      tz: cfg.tz,
      stepMin: SLOT_MIN,
      hoursStart: HOURS_START,
      hoursEnd: HOURS_END,
      days
    };
  }

  function loadTemplateIntoSelection(tpl) {
    selected.clear();
    const days = Array.isArray(tpl.days) ? tpl.days : [];
    for (let day = 0; day < 7; day++) {
      const list = Array.isArray(days[day]) ? days[day] : [];
      for (const pair of list) {
        const fromMin = Number(pair[0]);
        const toMin = Number(pair[1]);
        if (!Number.isFinite(fromMin) || !Number.isFinite(toMin) || toMin <= fromMin) continue;
        const fromRow = minuteToRow(fromMin);
        const toRow = minuteToRow(toMin);
        for (let r = fromRow; r < toRow; r++) {
          const key = day * ROWS_PER_DAY + r;
          selected.add(key);
        }
      }
    }
  }

  // ===== Backend API =====
  function apiBase() {
    return (typeof window.API_BASE_URL === 'string' && window.API_BASE_URL) ? window.API_BASE_URL : '';
  }

  async function apiListTemplates() {
    try {
      const api = apiBase(); if (!api) return [];
      const res = await fetch(`${api}/templates/list`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return [];
      const data = await res.json();
      return Array.isArray(data.templates) ? data.templates : [];
    } catch { return []; }
  }

  async function apiGetTemplate({ id, name }) {
    try {
      const api = apiBase(); if (!api) return null;
      const qs = id ? `id=${encodeURIComponent(id)}` : `name=${encodeURIComponent(name || '')}`;
      const res = await fetch(`${api}/templates/get?${qs}`, { credentials: 'include', cache: 'no-store' });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.template ? data.template : null;
    } catch { return null; }
  }

  async function apiSaveTemplate(payload /* {name, tz, stepMin, hoursStart, hoursEnd, days} or +id */) {
    try {
      const api = apiBase(); if (!api) return null;
      const res = await fetch(`${api}/templates/save`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      });
      if (!res.ok) return null;
      const data = await res.json();
      return data && data.template ? data.template : null;
    } catch { return null; }
  }

  async function apiDeleteTemplate({ id, name }) {
    try {
      const api = apiBase(); if (!api) return false;
      const res = await fetch(`${api}/templates/delete`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(id ? { id } : { name })
      });
      return res.ok;
    } catch { return false; }
  }

  async function populateTemplateSelect(selectEl, selectId) {
    if (!selectEl) return;
    const items = await apiListTemplates();
    const prev = selectEl.value;
    selectEl.innerHTML = '<option value="">(choose template)</option>';
    for (const t of items) {
      const opt = document.createElement('option');
      opt.value = String(t.id);
      opt.textContent = t.name;
      selectEl.appendChild(opt);
    }
    const id = selectId || prev;
    if (id) selectEl.value = id;
  }

  // ===== Init / Auth bridge =====
  function init() {
    gridContent = document.getElementById('grid-content');
    table = document.getElementById('schedule-table');
    if (!gridContent || !table) return;

    wheelZoomHandler.gridContent = gridContent;

    setMode('add');
    attachControls();
    interceptLinkNavigation();

    slotHeight = 12;
    applySlotHeight();

    const authGuard = (e) => {
      if (!isAuthenticated) {
        e.preventDefault();
        e.stopPropagation();
        shared.showToast('You must be logged in to edit templates.', 'info');
      }
    };
    gridContent.addEventListener('pointerdown', authGuard, true);
    gridContent.addEventListener('contextmenu', authGuard, true);

    function observeAuthButton() {
      const btn = document.getElementById('auth-btn');
      if (!btn) return;
      setAuth(btn.dataset.state === 'authenticated');
      const mo = new MutationObserver((ml) => {
        for (const m of ml) {
          if (m.type === 'attributes' && m.attributeName === 'data-state') {
            setAuth(btn.dataset.state === 'authenticated');
          }
        }
      });
      mo.observe(btn, { attributes: true, attributeFilter: ['data-state'] });
    }
    function hookSetAuthState() {
      if (window.__tplSetAuthStateHooked) return;
      if (typeof window.setAuthState === 'function') {
        const orig = window.setAuthState;
        window.setAuthState = function(isAuthed, username) {
          const r = orig.apply(this, arguments);
          try { setAuth(!!isAuthed); } catch {}
          return r;
        };
        window.__tplSetAuthStateHooked = true;
      }
    }

    observeAuthButton();
    hookSetAuthState();
    let tries = 0;
    const hookTimer = setInterval(() => {
      tries += 1;
      hookSetAuthState();
      if (window.__tplSetAuthStateHooked || tries > 20) clearInterval(hookTimer);
    }, 250);

    gridContent.addEventListener('wheel', wheelZoomHandler, { passive: false });

    buildGrid();

    // Populate template dropdown from DB
    const select = document.getElementById('template-select');
    populateTemplateSelect(select, '');

    // Final auth check + refresh list if needed
    (async () => {
      try {
        const api = apiBase(); if (!api) return;
        const res = await fetch(`${api}/auth/check`, { credentials: 'include', cache: 'no-store' });
        setAuth(res.ok);
        populateTemplateSelect(select, '');
      } catch {}
    })();
  }

  function setAuth(v) {
    const next = !!v;
    if (next === isAuthenticated) return;
    isAuthenticated = next;
    if (!isAuthenticated) {
      isDragging = false;
      dragStart = dragEnd = null;
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
  else init();

  // Public API (optional)
  window.templates = {
    init,
    setAuth,
    list: apiListTemplates,
    saveCurrent: async function(name) {
      const tpl = await apiSaveTemplate(buildTemplatePayload(name));
      if (tpl) markSaved();
      return tpl ? tpl.id : null;
    },
    loadIntoGrid: async function(id) {
      const tpl = await apiGetTemplate({ id });
      if (!tpl) return false;
      loadTemplateIntoSelection(tpl);
      applySelectedClasses();
      markSaved();
      return true;
    },
    delete: apiDeleteTemplate,
    export: apiGetTemplate,
    importTemplate: async function(obj) {
      if (!obj || !Array.isArray(obj.days) || obj.days.length !== 7) return null;
      const tpl = await apiSaveTemplate({
        name: obj.name || 'Imported',
        tz: obj.tz || cfg.tz,
        stepMin: obj.stepMin || SLOT_MIN,
        hoursStart: Number.isFinite(obj.hoursStart) ? obj.hoursStart : HOURS_START,
        hoursEnd: Number.isFinite(obj.hoursEnd) ? obj.hoursEnd : HOURS_END,
        days: obj.days
      });
      return tpl ? tpl.id : null;
    }
  };
})();
