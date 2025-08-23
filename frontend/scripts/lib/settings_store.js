/* global window, fetch */
(function () {
  'use strict';

  const KEY = 'nat20_settings';
  const DEFAULTS = {
    timezone: 'auto',
    clock: '24',
    weekStart: 'sun',
    defaultZoom: 1.0,
    heatmap: 'viridis'
  };

  function loadLocal() {
    try { const raw = localStorage.getItem(KEY); return raw ? JSON.parse(raw) : null; }
    catch { return null; }
  }

  function saveLocal(obj) {
    const json = JSON.stringify(obj);
    localStorage.setItem(KEY, json);
    try {
      // broadcast to other tabs
      window.dispatchEvent(new StorageEvent('storage', { key: KEY, newValue: json }));
    } catch {}
  }

  async function fetchRemote() {
    try {
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  async function saveRemote(obj) {
    const res = await fetch('/settings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(obj)
    });
    if (!res.ok) throw new Error(await res.text().catch(() => `HTTP ${res.status}`));
    return res.json();
  }

  function effectiveLocal() {
    const l = loadLocal();
    return { ...DEFAULTS, ...(l || {}) };
  }

  window.settingsStore = {
    DEFAULTS,
    loadLocal, saveLocal, effectiveLocal,
    fetchRemote, saveRemote
  };
})();
