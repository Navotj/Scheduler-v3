// --- global fetch de-dup for auth/settings (idempotent installer) ---
(function () {
  if (window.__dedupeFetchInstalled) return;
  const origFetch = window.fetch.bind(window);
  const inflight = new Map();

  function shouldDedupe(url) {
    const p = new URL(url, window.location.origin).pathname;
    return p === '/auth/check' || p === '/check' || p === '/settings';
  }
  function canonicalKey(url) {
    const u = new URL(url, window.location.origin);
    const p = u.pathname;
    if (p === '/auth/check' || p === '/check') return `${u.origin}/__authcheck__`;
    if (p === '/settings') return `${u.origin}/__settings__`; // ignore search to collapse dupes
    return u.toString();
  }
  window.__dedupeFetchInstalled = true;
  window.fetch = function dedupedFetch(input, init) {
    const urlStr = typeof input === 'string' ? input : (input && input.url) || '';
    let absolute;
    try { absolute = new URL(urlStr, window.location.origin).toString(); } catch { return origFetch(input, init); }
    if (!shouldDedupe(absolute)) return origFetch(input, init);

    const key = canonicalKey(absolute);
    if (inflight.has(key)) return inflight.get(key).then(r => r.clone());

    const merged = { ...(init || {}) };
    if (!('credentials' in merged)) merged.credentials = 'include';
    if (!('cache' in merged)) merged.cache = 'no-store';
    if ('signal' in merged) delete merged.signal;

    const req = origFetch(absolute, merged).finally(() => setTimeout(() => inflight.delete(key), 0));
    inflight.set(key, req);
    return req.then(r => r.clone());
  };
})();

(function () {
  function getSystemTZ() {
    return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  }

  function loadLocal() {
    try {
      const raw = localStorage.getItem('nat20_settings');
      return raw ? JSON.parse(raw) : null;
    } catch { return null; }
  }

  function saveLocal(obj) {
    localStorage.setItem('nat20_settings', JSON.stringify(obj));
    // broadcast to other tabs/windows (for schedule matcher live updates)
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
    } catch {}
  }

  function populateTimezones(select) {
    const existing = new Set();
    function addOption(val, label) {
      if (existing.has(val)) return;
      const opt = document.createElement('option');
      opt.value = val;
      opt.textContent = label || val;
      select.appendChild(opt);
      existing.add(val);
    }

    addOption('auto', 'Automatic (system)');
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        const list = Intl.supportedValuesOf('timeZone');
        for (const tz of list) addOption(tz);
      } else {
        ['UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Moscow','Asia/Jerusalem','Asia/Tokyo','Asia/Shanghai','Asia/Kolkata','America/New_York','America/Chicago','America/Denver','America/Los_Angeles','Australia/Sydney'].forEach(tz => addOption(tz));
      }
    } catch {
      ['UTC', getSystemTZ()].forEach(tz => addOption(tz));
    }
  }

  async function fetchRemote() {
    try {
      const res = await fetch(`${window.API_BASE_URL}/settings`, { credentials: 'include', cache: 'no-cache' });
      if (res.ok) return await res.json();
    } catch {}
    return null;
  }

  async function saveRemote(obj) {
    const res = await fetch(`${window.API_BASE_URL}/settings`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify(obj)
    });
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }

  // Map name -> CSS gradient preview
  function gradientCssFor(name) {
    const maps = {
      viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
      plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
      cividis:    [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
      twilight:   [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
      lava:       [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
    };
    const stops = maps[name] || maps.viridis;
    const parts = stops.map(([t, c]) => `${c} ${(t*100).toFixed(0)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }

  document.addEventListener('DOMContentLoaded', async () => {
    const $tzModeAuto = document.getElementById('tz-auto');
    const $tzModeManual = document.getElementById('tz-manual');
    const $tz = document.getElementById('timezone');
    const $clock24 = document.querySelector('input[name="clock"][value="24"]');
    const $clock12 = document.querySelector('input[name="clock"][value="12"]');
    const $weekSun = document.querySelector('input[name="weekStart"][value="sun"]');
    const $weekMon = document.querySelector('input[name="weekStart"][value="mon"]');
    const $defaultZoom = document.getElementById('defaultZoom');
    const $zoomValue = document.getElementById('zoomValue');
    const $form = document.getElementById('settings-form');
    const $status = document.getElementById('saveStatus');

    // heatmap controls
    const $heatmap = document.getElementById('heatmap');
    const $heatmapPreview = document.getElementById('heatmapPreview');

    populateTimezones($tz);

    const defaults = {
      timezone: 'auto',
      clock: '24',
      weekStart: 'sun',
      defaultZoom: 1.0,
      heatmap: 'viridis'
    };

    const remote = await fetchRemote();
    const local = loadLocal();
    const s = remote || local || defaults;

    // tz mode + select
    const isAuto = !s.timezone || s.timezone === 'auto';
    $tzModeAuto.checked = isAuto;
    $tzModeManual.checked = !isAuto;
    $tz.disabled = isAuto;
    $tz.value = isAuto ? getSystemTZ() : (s.timezone || getSystemTZ());
    if ($tz.value === 'auto') $tz.value = getSystemTZ();

    // clock / week start
    (s.clock === '12' ? $clock12 : $clock24).checked = true;
    (s.weekStart === 'mon' ? $weekMon : $weekSun).checked = true;

    // zoom
    const zoom = (typeof s.defaultZoom === 'number') ? s.defaultZoom : 1.0;
    $defaultZoom.value = String(zoom);
    $zoomValue.textContent = zoom.toFixed(1);

    // heatmap initial + live preview
    const heat = s.heatmap || 'viridis';
    if ($heatmap) {
      $heatmap.value = heat;
      if ($heatmapPreview) $heatmapPreview.style.background = gradientCssFor(heat);
      $heatmap.addEventListener('change', () => {
        if ($heatmapPreview) $heatmapPreview.style.background = gradientCssFor($heatmap.value);
      });
    }

    $defaultZoom.addEventListener('input', () => {
      const z = Number($defaultZoom.value);
      $zoomValue.textContent = z.toFixed(1);
    });

    function updateTzMode() {
      const manual = $tzModeManual.checked;
      $tz.disabled = !manual;
      if (!manual) {
        const sys = getSystemTZ();
        if (!$tz.querySelector(`option[value="${sys}"]`)) {
          const opt = document.createElement('option');
          opt.value = sys;
          opt.textContent = sys;
          $tz.appendChild(opt);
        }
        $tz.value = sys;
      }
    }
    $tzModeAuto.addEventListener('change', updateTzMode);
    $tzModeManual.addEventListener('change', updateTzMode);

    $form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const useAuto = $tzModeAuto.checked;
      const tzVal = useAuto ? 'auto' : $tz.value;

      const obj = {
        timezone: tzVal,
        clock: ($clock12.checked ? '12' : '24'),
        weekStart: ($weekMon.checked ? 'mon' : 'sun'),
        defaultZoom: Number($defaultZoom.value),
        heatmap: ($heatmap ? $heatmap.value : 'viridis')
      };

      try {
        const saved = await saveRemote(obj);
        saveLocal(saved);
        $status.textContent = 'Saved ✓';
        setTimeout(() => { $status.textContent = ''; }, 1500);
      } catch (err) {
        $status.textContent = 'Save failed';
        setTimeout(() => { $status.textContent = ''; }, 2000);
      }
    });
  });
})();
