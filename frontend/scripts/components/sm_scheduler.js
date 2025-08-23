// sm_scheduler.js (ES module)
// Orchestrator that wires components and replaces the monolithic schedule_matcher.js.

import { CONST, state, resolveTimezone, loadLocalSettings } from './components/sm_state.js';
import { attachDOM, buildTable, paintCounts, shadePast, positionNowMarker, bindMarkerReposition, setupZoomHandlers } from './components/sm_table_core.js';
import { applyFilterDimming } from './components/sm_filters_core.js';
import { updateLegend } from './components/sm_legend_core.js';
import { findCandidates } from './components/sm_results_core.js';

const BASE_URL = ''; // same-origin

// concurrency guards
let __initDone = false;
let __addingUser = false;
let __addingMe = false;

async function userExists(name) {
  try {
    const url = `${BASE_URL}/users/exists?username=${encodeURIComponent(name)}`;
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
  if (!el) return;
  el.textContent = msg || '';
}

async function fetchMembersAvail() {
  if (!state.members.length) {
    state.userSlotSets.clear();
    state.totalMembers = 0;
    paintCounts();
    shadePast();
    applyFilterDimming(document.getElementById('scheduler-table'));
    updateLegend();
    findCandidates(document.getElementById('results'));
    return;
  }

  const fromTo = (() => {
    // import lazily to avoid cycle
    return import('./components/sm_state.js').then(mod => {
      const { getWeekStartEpochAndYMD, ymdAddDays, epochFromZoned } = mod;
      const { baseEpoch, baseYMD } = getWeekStartEpochAndYMD();
      const endYMD = ymdAddDays(baseYMD, 7);
      const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, state.tz);
      return { from: baseEpoch, to: endEpoch };
    });
  })();

  const { from, to } = await fromTo;

  const payload = { from, to, usernames: state.members };
  const tryPaths = [
    `${BASE_URL}/availability/get_many`,
    `${BASE_URL}/availability/availability/get_many`
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

  state.userSlotSets.clear();
  for (const uname of state.members) {
    const intervals = (data.intervals && data.intervals[uname]) || [];
    const set = new Set();
    for (const iv of intervals) {
      const fromClamped = Math.max(iv.from, from);
      const toClamped = Math.min(iv.to, to);
      let t = Math.ceil(fromClamped / CONST.SLOT_SEC) * CONST.SLOT_SEC;
      for (; t < toClamped; t += CONST.SLOT_SEC) set.add(t);
    }
    state.userSlotSets.set(uname, set);
  }
  state.totalMembers = state.members.length;

  paintCounts();
  shadePast();
  applyFilterDimming(document.getElementById('scheduler-table'));
  updateLegend();
  findCandidates(document.getElementById('results'));
}

// public API (kept compatible)
export function initScheduler() {
  if (__initDone) return;
  __initDone = true;

  // DOM refs from page (created by component builders)
  attachDOM({
    tableEl: document.getElementById('scheduler-table'),
    gridEl: document.getElementById('grid'),
    resultsEl: document.getElementById('results'),
    resultsPanelEl: document.getElementById('results-panel'),
    nowMarkerEl: document.getElementById('now-marker'),
    rightColEl: document.getElementById('right-col'),
    controlsEl: document.getElementById('controls'),
  });

  // local settings
  const local = loadLocalSettings();
  if (local) {
    state.settings = { ...state.DEFAULT_SETTINGS, ...local };
  } else {
    state.settings = { ...state.DEFAULT_SETTINGS };
  }
  state.tz = resolveTimezone(state.settings.timezone);
  state.hour12 = state.settings.clock === '12';
  state.weekStartIdx = state.settings.weekStart === 'mon' ? 1 : 0;
  state.heatmapName = state.settings.heatmap || 'viridis';

  // react to settings changes
  window.addEventListener('storage', async (e) => {
    if (e && e.key === 'nat20_settings') {
      const next = loadLocalSettings();
      if (!next) return;
      const prevTz = state.tz;
      const prevWeekStart = state.weekStartIdx;

      state.settings = { ...state.DEFAULT_SETTINGS, ...next };
      state.tz = resolveTimezone(state.settings.timezone);
      state.hour12 = state.settings.clock === '12';
      state.weekStartIdx = state.settings.weekStart === 'mon' ? 1 : 0;
      state.heatmapName = state.settings.heatmap || 'viridis';

      const needsRebuild = (state.tz !== prevTz) || (state.weekStartIdx !== prevWeekStart);
      if (needsRebuild) { buildTable(); await fetchMembersAvail(); }
      else { paintCounts(); updateLegend(); }
    }
  });

  // week nav
  document.getElementById('prev-week').addEventListener('click', async () => {
    state.weekOffset -= 1;
    buildTable();
    await fetchMembersAvail();
  });
  document.getElementById('next-week').addEventListener('click', async () => {
    state.weekOffset += 1;
    buildTable();
    await fetchMembersAvail();
  });

  // members
  document.getElementById('add-user-btn').addEventListener('click', async () => {
    if (__addingUser) return;
    __addingUser = true;
    try {
      const input = document.getElementById('add-username');
      const name = (input.value || '').trim();
      if (!name) return;
      if (state.members.includes(name)) { input.value = ''; return; }

      setMemberError('');
      const exists = await userExists(name);
      if (!exists) { setMemberError('User not found'); return; }

      if (!state.members.includes(name)) state.members.push(name);
      input.value = '';
      renderMembersUI();
      await fetchMembersAvail();
    } finally {
      __addingUser = false;
    }
  });

  document.getElementById('add-me-btn').addEventListener('click', async () => {
    if (__addingMe) return;
    __addingMe = true;
    try {
      if (!state.currentUsername) { setMemberError('Please login first.'); return; }
      if (!state.members.includes(state.currentUsername)) state.members.push(state.currentUsername);
      renderMembersUI();
      await fetchMembersAvail();
    } finally {
      __addingMe = false;
    }
  });

  // filters
  document.getElementById('max-missing').addEventListener('input', () => {
    applyFilterDimming(document.getElementById('scheduler-table')); findCandidates(document.getElementById('results'));
  });
  document.getElementById('min-hours').addEventListener('input', () => {
    applyFilterDimming(document.getElementById('scheduler-table')); findCandidates(document.getElementById('results'));
  });
  document.getElementById('sort-method').addEventListener('change', () => {
    findCandidates(document.getElementById('results'));
  });

  // zoom + table
  setupZoomHandlers();
  buildTable();

  // initial data
  fetchMembersAvail();
  bindMarkerReposition();

  // expose for page shell auth integration, if present
  window.scheduler = {
    init: () => {}, // no-op to preserve previous call sites
    setAuth(ok, username) {
      state.isAuthenticated = !!ok;
      state.currentUsername = ok ? username : null;
    }
  };
}

function renderMembersUI() {
  const ul = document.getElementById('member-list');
  ul.innerHTML = '';
  for (const name of state.members) {
    const li = document.createElement('li');
    const txt = document.createElement('div');
    txt.textContent = name;
    const btn = document.createElement('button');
    btn.textContent = 'Remove';
    btn.addEventListener('click', async () => {
      state.members = state.members.filter(u => u !== name);
      renderMembersUI();
      await fetchMembersAvail();
    });
    li.appendChild(txt);
    li.appendChild(btn);
    ul.appendChild(li);
  }
  updateLegend();
}
