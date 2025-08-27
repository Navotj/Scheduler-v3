(function () {
  'use strict';

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
    try {
      window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
    } catch {}
  }
    function populateTimezones(select) {
    // Clear existing options
    while (select.firstChild) select.removeChild(select.firstChild);

    const existing = new Set();
    function addOption(val, label) {
        if (existing.has(val)) return;
        const opt = document.createElement('option');
        opt.value = val;
        opt.textContent = label || val;
        select.appendChild(opt);
        existing.add(val);
    }

    const now = new Date();

    function offsetMinutesFor(tz) {
        const dtf = new Intl.DateTimeFormat('en-US', {
        timeZone: tz,
        year: 'numeric',
        month: '2-digit',
        day: '2-digit',
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit',
        hour12: false
        });
        const parts = dtf.formatToParts(now);
        const map = {};
        for (const { type, value } of parts) map[type] = value;
        const asUTC = Date.UTC(
        map.year,
        Number(map.month) - 1,
        map.day,
        map.hour,
        map.minute,
        map.second
        );
        // Positive value means ahead of UTC
        return Math.round((asUTC - now.getTime()) / 60000);
    }

    function fmtOffset(mins) {
        const sign = mins >= 0 ? '+' : '-';
        const abs = Math.abs(mins);
        const hh = String(Math.floor(abs / 60)).padStart(2, '0');
        const mm = String(abs % 60).padStart(2, '0');
        return `UTC${sign}${hh}:${mm}`;
    }

    // Add "Automatic" first with current system TZ + offset
    const sysTZ = getSystemTZ();
    let sysOff = 0;
    try { sysOff = offsetMinutesFor(sysTZ); } catch {}
    addOption('auto', `Automatic (system) — ${sysTZ} (${fmtOffset(sysOff)})`);

    // Build full list of IANA time zones (no hardcoding), sort by current offset then name
    let tzList = [];
    try {
        if (typeof Intl.supportedValuesOf === 'function') {
        tzList = Intl.supportedValuesOf('timeZone');
        } else {
        tzList = Array.from(new Set(['UTC', sysTZ]));
        }
    } catch {
        tzList = Array.from(new Set(['UTC', sysTZ]));
    }

    const items = tzList.map((tz) => {
        let off = 0;
        try { off = offsetMinutesFor(tz); } catch {}
        return { tz, off };
    });

    items.sort((a, b) => (a.off - b.off) || a.tz.localeCompare(b.tz));

    for (const { tz, off } of items) {
        const label = `${fmtOffset(off)} — ${tz.replace(/_/g, ' ')}`;
        addOption(tz, label);
    }
  }
  async function fetchRemote() {
    try {
      const res = await fetch('/settings', { credentials: 'include', cache: 'no-store' });
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
    if (!res.ok) {
      const text = await res.text().catch(() => '');
      throw new Error(text || `HTTP ${res.status}`);
    }
    return res.json();
  }
  function gradientCssFor(name) {
    const maps = {
      viridis:  [[0,'#440154'],[0.25,'#3b528b'],[0.5,'#21918c'],[0.75,'#5ec962'],[1,'#fde725']],
      plasma:   [[0,'#0d0887'],[0.25,'#6a00a8'],[0.5,'#b12a90'],[0.75,'#e16462'],[1,'#fca636']],
      cividis:  [[0,'#00204c'],[0.25,'#2c3e70'],[0.5,'#606c7c'],[0.75,'#9da472'],[1,'#f9e721']],
      twilight: [[0,'#1e1745'],[0.25,'#373a97'],[0.5,'#73518c'],[0.75,'#b06b6d'],[1,'#d3c6b9']],
      lava:     [[0,'#000004'],[0.2,'#320a5a'],[0.4,'#781c6d'],[0.6,'#bb3654'],[0.8,'#ed6925'],[1,'#fcffa4']]
    };
    const stops = maps[name] || maps.viridis;
    const parts = stops.map(([t, c]) => `${c} ${(t*100).toFixed(0)}%`);
    return `linear-gradient(90deg, ${parts.join(', ')})`;
  }
  function settingsModalHTML() {
    return `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:12px">
        <h2 style="font-size:18px;margin:0">Settings</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>

      <form id="settings-form" style="display:grid;gap:14px">
        <fieldset style="border:0;padding:0;margin:0">
          <legend style="font-weight:600;margin-bottom:6px">Timezone</legend>
          <div style="display:flex;gap:12px;flex-wrap:wrap;margin-bottom:8px">
            <label><input type="radio" name="tzMode" id="tz-auto" value="auto" checked> Automatic (system)</label>
            <label><input type="radio" name="tzMode" id="tz-manual" value="manual"> Manual</label>
          </div>
          <select id="timezone" disabled
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"></select>
          <span style="display:block;color:#9aa0a6;margin-top:6px">Choose a manual timezone only if automatic detection is incorrect.</span>
        </fieldset>

        <fieldset style="border:0;padding:0;margin:0">
          <legend style="font-weight:600;margin-bottom:6px">Clock</legend>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label><input type="radio" name="clock" value="24" checked> 24-hour</label>
            <label><input type="radio" name="clock" value="12"> 12-hour (AM/PM)</label>
          </div>
        </fieldset>

        <fieldset style="border:0;padding:0;margin:0">
          <legend style="font-weight:600;margin-bottom:6px">Week starts on</legend>
          <div style="display:flex;gap:12px;flex-wrap:wrap">
            <label><input type="radio" name="weekStart" value="sun" checked> Sunday</label>
            <label><input type="radio" name="weekStart" value="mon"> Monday</label>
          </div>
        </fieldset>

        <fieldset style="border:0;padding:0;margin:0">
          <legend style="font-weight:600;margin-bottom:6px">Display</legend>
          <div style="display:flex;gap:12px;align-items:center;flex-wrap:wrap">
            <span>Default vertical zoom</span>
            <input type="range" id="defaultZoom" min="0.6" max="2.0" step="0.1" value="1.0">
            <span id="zoomValue" style="min-width:36px;text-align:right;color:#cfd3d8">1.0</span>
          </div>
        </fieldset>

        <fieldset style="border:0;padding:0;margin:0">
          <legend style="font-weight:600;margin-bottom:6px">Heatmap colours</legend>
          <select id="heatmap"
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px">
            <option value="viridis">Viridis</option>
            <option value="plasma">Plasma</option>
            <option value="cividis">Cividis</option>
            <option value="twilight">Twilight</option>
            <option value="lava">Lava</option>
          </select>
          <div id="heatmapPreview" aria-hidden="true"
               style="margin-top:8px;height:18px;border-radius:6px;border:1px solid var(--chip-border,#2b2f36)"></div>
          <span style="display:block;color:#9aa0a6;margin-top:6px">Controls the colour scale used in the schedule heatmap and legend.</span>
        </fieldset>

        <div style="display:flex;gap:10px;justify-content:flex-end;align-items:center">
          <button type="submit"
            style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(46,160,67,0.5);background:rgba(46,160,67,0.2);color:#b7f4c0;cursor:pointer">Save</button>
          <span id="saveStatus" style="min-height:18px;font-size:13px;color:#9aa0a6" aria-live="polite"></span>
        </div>
      </form>
    `;
  }

  function openSettingsModal() {
    if (typeof window.openModal !== 'function') return;
    window.openModal(settingsModalHTML());

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
    const $heatmap = document.getElementById('heatmap');
    const $heatmapPreview = document.getElementById('heatmapPreview');

    populateTimezones($tz);

    const defaults = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' };

    (async () => {
      const remote = await fetchRemote();
      const local = loadLocal();
      const s = remote || local || defaults;

      const isAuto = !s.timezone || s.timezone === 'auto';
      $tzModeAuto.checked = isAuto;
      $tzModeManual.checked = !isAuto;
      $tz.disabled = isAuto;
      $tz.value = isAuto ? getSystemTZ() : (s.timezone || getSystemTZ());
      if ($tz.value === 'auto') $tz.value = getSystemTZ();

      (s.clock === '12' ? $clock12 : $clock24).checked = true;
      (s.weekStart === 'mon' ? $weekMon : $weekSun).checked = true;

      const zoom = (typeof s.defaultZoom === 'number') ? s.defaultZoom : 1.0;
      $defaultZoom.value = String(zoom);
      $zoomValue.textContent = zoom.toFixed(1);

      if ($heatmap) {
        const heat = s.heatmap || 'viridis';
        $heatmap.value = heat;
        if ($heatmapPreview) $heatmapPreview.style.background = gradientCssFor(heat);
      }
    })();

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

    if ($heatmap) {
      $heatmap.addEventListener('change', () => {
        if ($heatmapPreview) $heatmapPreview.style.background = gradientCssFor($heatmap.value);
      });
    }

    $form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const obj = {
        timezone: ($tzModeAuto.checked ? 'auto' : $tz.value),
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
      } catch (_err) {
        $status.textContent = 'Save failed';
        setTimeout(() => { $status.textContent = ''; }, 2000);
      }
    });
  }

  function wireButton() {
    const btn = document.getElementById('settings-btn');
    if (!btn) return;
    btn.addEventListener('click', openSettingsModal);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', wireButton, { once: true });
  } else {
    wireButton();
  }
})();
