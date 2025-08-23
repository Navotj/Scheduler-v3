// Settings panel logic (modal-friendly) + light fetch de-dup.
(function () {
  // ---- fetch de-dup (idempotent installer) ----
  if (!window.__dedupeFetchInstalled) {
    const orig = window.fetch.bind(window);
    const inflight = new Map();
    const special = new Set(['/auth/check', '/check', '/settings']);
    function keyFor(u) {
      const url = new URL(u, window.location.origin);
      if (url.pathname === '/auth/check' || url.pathname === '/check') return `${url.origin}/__authcheck__`;
      if (url.pathname === '/settings') return `${url.origin}/__settings__`;
      return url.toString();
    }
    window.fetch = function(input, init) {
      let url;
      try { url = typeof input === 'string' ? new URL(input, window.location.origin).toString() : input.url; } catch { return orig(input, init); }
      if (!special.has(new URL(url).pathname)) return orig(input, init);
      const key = keyFor(url);
      if (inflight.has(key)) return inflight.get(key).then(r => r.clone());
      const merged = { ...(init || {}), credentials: 'include', cache: 'no-store' };
      if ('signal' in merged) delete merged.signal;
      const req = orig(url, merged).finally(() => setTimeout(() => inflight.delete(key), 0));
      inflight.set(key, req);
      return req.then(r => r.clone());
    };
    window.__dedupeFetchInstalled = true;
  }

  // ---- utilities ----
  function getSystemTZ() {
    try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; }
    catch { return 'UTC'; }
  }
  async function saveRemote(obj) {
    const res = await fetch('/settings', {
      method: 'POST',
      credentials: 'include',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(obj)
    });
    if (!res.ok) throw new Error(await res.text().catch(()=>'') || ('HTTP '+res.status));
    return res.json().catch(()=>obj);
  }
  function saveLocal(obj) {
    localStorage.setItem('nat20_settings', JSON.stringify(obj));
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
    } catch {}
  }
  function gradientCssFor(name) {
    const maps = {
      viridis:    [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
      plasma:     [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
      cividis:    [[0,'#00204c'],[0.25,'#2b496e'],[0.5,'#7e7f81'],[0.75,'#c6c58e'],[1,'#ffea46']],
      twilight:   [[0,'#4B0055'],[0.25,'#3B3B98'],[0.5,'#2B7A78'],[0.75,'#86CB92'],[1,'#F3DFBF']],
      lava:       [[0,'#18001a'],[0.25,'#6b0029'],[0.5,'#b71c1c'],[0.75,'#ef6c00'],[1,'#ffd54f']]
    };
    const stops = maps[name] || maps.viridis;
    const parts = stops.map(([t,c]) => `${c} ${(t*100).toFixed(0)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }
  function populateTimezones(select) {
    const set = new Set();
    function add(v, label) {
      if (set.has(v)) return;
      const o = document.createElement('option');
      o.value = v; o.textContent = label || v; select.appendChild(o);
      set.add(v);
    }
    add('auto', 'Automatic (system)');
    try {
      if (typeof Intl.supportedValuesOf === 'function') {
        for (const tz of Intl.supportedValuesOf('timeZone')) add(tz);
      } else {
        ['UTC','Europe/London','Europe/Paris','Europe/Berlin','Europe/Vienna','Europe/Madrid','America/New_York','America/Los_Angeles','Australia/Sydney'].forEach(add);
      }
    } catch {
      ['UTC', getSystemTZ()].forEach(add);
    }
  }

  // ---- modal-friendly initializer ----
  window.initSettingsPanel = async function initSettingsPanel(root) {
    const scope = root || document;

    const $tzModeAuto  = scope.querySelector('#tz-auto');
    const $tzModeManual= scope.querySelector('#tz-manual');
    const $tz          = scope.querySelector('#timezone');
    const $clock24     = scope.querySelector('input[name="clock"][value="24"]');
    const $clock12     = scope.querySelector('input[name="clock"][value="12"]');
    const $weekSun     = scope.querySelector('input[name="weekStart"][value="sun"]');
    const $weekMon     = scope.querySelector('input[name="weekStart"][value="mon"]');
    const $defaultZoom = scope.querySelector('#defaultZoom');
    const $zoomValue   = scope.querySelector('#zoomValue');
    const $heatmap     = scope.querySelector('#heatmap');
    const $heatPrev    = scope.querySelector('#heatmapPreview');
    const $form        = scope.querySelector('#settings-form');
    const $status      = scope.querySelector('#saveStatus');

    if (!$form) return; // nothing to init (defensive)

    populateTimezones($tz);

    const defaults = {
      timezone: 'auto',
      clock: '24',
      weekStart: 'sun',
      defaultZoom: 1.0,
      heatmap: 'viridis'
    };

    let local = {};
    try { local = JSON.parse(localStorage.getItem('nat20_settings') || '{}'); } catch { local = {}; }
    const base = Object.assign({}, defaults, local);

    // load from server if possible (race with local, server wins)
    try {
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
      if (res.ok) {
        const remote = await res.json().catch(()=>({}));
        Object.assign(base, remote || {});
      }
    } catch {}

    // hydrate UI
    ($tzModeAuto || {}).checked = (base.timezone === 'auto');
    ($tzModeManual || {}).checked = (base.timezone !== 'auto');
    if ($tz) { $tz.disabled = base.timezone === 'auto'; $tz.value = base.timezone === 'auto' ? 'auto' : base.timezone; }
    if ($clock24) $clock24.checked = base.clock !== '12';
    if ($clock12) $clock12.checked = base.clock === '12';
    if ($weekSun) $weekSun.checked = base.weekStart !== 'mon';
    if ($weekMon) $weekMon.checked = base.weekStart === 'mon';
    if ($defaultZoom) { $defaultZoom.value = String(base.defaultZoom); }
    if ($zoomValue) { $zoomValue.textContent = `${Number(base.defaultZoom || 1).toFixed(2).replace(/\.00$/,'')}×`; }
    if ($heatmap) $heatmap.value = base.heatmap || 'viridis';
    if ($heatPrev) $heatPrev.style.background = gradientCssFor(base.heatmap || 'viridis');

    // interactions
    if ($tzModeAuto && $tz) $tzModeAuto.addEventListener('change', () => { if ($tzModeAuto.checked) { $tz.disabled = true; $tz.value = 'auto'; } });
    if ($tzModeManual && $tz) $tzModeManual.addEventListener('change', () => { if ($tzModeManual.checked) { $tz.disabled = false; if ($tz.value === 'auto') $tz.value = getSystemTZ(); } });
    if ($defaultZoom && $zoomValue) $defaultZoom.addEventListener('input', () => {
      const v = Number($defaultZoom.value || 1);
      $zoomValue.textContent = `${v.toFixed(2).replace(/\.00$/,'')}×`;
    });
    if ($heatmap && $heatPrev) $heatmap.addEventListener('change', () => {
      $heatPrev.style.background = gradientCssFor($heatmap.value);
    });

    // submit
    $form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const obj = {
        timezone: ($tzModeAuto && $tzModeAuto.checked) ? 'auto' : ($tz ? $tz.value : 'auto'),
        clock: ($clock12 && $clock12.checked) ? '12' : '24',
        weekStart: ($weekMon && $weekMon.checked) ? 'mon' : 'sun',
        defaultZoom: Number(($defaultZoom && $defaultZoom.value) || 1.0),
        heatmap: ($heatmap && $heatmap.value) || 'viridis'
      };
      try {
        const saved = await saveRemote(obj);
        saveLocal(saved);
        if ($status) { $status.textContent = 'Saved ✓'; setTimeout(() => { $status.textContent = ''; }, 1500); }
      } catch {
        if ($status) { $status.textContent = 'Save failed'; setTimeout(() => { $status.textContent = ''; }, 2000); }
      }
    });
  };
})();
