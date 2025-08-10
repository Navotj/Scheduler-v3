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
    window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
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

    addOption('auto', 'Auto (System)');
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
      const res = await fetch('http://backend.nat20scheduling.com:3000/settings', {
        credentials: 'include',
        cache: 'no-cache'
      });
      if (res.ok) {
        return await res.json();
      }
    } catch {}
    return null;
  }

  async function saveRemote(obj) {
    const res = await fetch('http://backend.nat20scheduling.com:3000/settings', {
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

  document.addEventListener('DOMContentLoaded', async () => {
    const $tz = document.getElementById('timezone');
    const $clock24 = document.querySelector('input[name="clock"][value="24"]');
    const $clock12 = document.querySelector('input[name="clock"][value="12"]');
    const $weekSun = document.querySelector('input[name="weekStart"][value="sun"]');
    const $weekMon = document.querySelector('input[name="weekStart"][value="mon"]');
    const $defaultZoom = document.getElementById('defaultZoom');
    const $zoomValue = document.getElementById('zoomValue');
    const $highlightWeekends = document.getElementById('highlightWeekends');
    const $form = document.getElementById('settings-form');
    const $status = document.getElementById('saveStatus');

    populateTimezones($tz);

    const defaults = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, highlightWeekends: false };
    const remote = await fetchRemote();
    const local = loadLocal();

    const s = remote || local || defaults;

    $tz.value = s.timezone || 'auto';
    if ($tz.value !== (s.timezone || 'auto')) $tz.value = 'auto';

    (s.clock === '12' ? $clock12 : $clock24).checked = true;
    (s.weekStart === 'mon' ? $weekMon : $weekSun).checked = true;

    const zoom = (typeof s.defaultZoom === 'number') ? s.defaultZoom : 1.0;
    $defaultZoom.value = String(zoom);
    $zoomValue.textContent = zoom.toFixed(1);

    $highlightWeekends.checked = !!s.highlightWeekends;

    $defaultZoom.addEventListener('input', () => {
      const z = Number($defaultZoom.value);
      $zoomValue.textContent = z.toFixed(1);
    });

    $form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const obj = {
        timezone: $tz.value,
        clock: ($clock12.checked ? '12' : '24'),
        weekStart: ($weekMon.checked ? 'mon' : 'sun'),
        defaultZoom: Number($defaultZoom.value),
        highlightWeekends: $highlightWeekends.checked
      };

      try {
        const saved = await saveRemote(obj);
        saveLocal(saved); // keep local copy in sync and notify other tabs
        $status.textContent = 'Saved ✓';
        setTimeout(() => { $status.textContent = ''; }, 1500);
      } catch (err) {
        $status.textContent = 'Save failed';
        setTimeout(() => { $status.textContent = ''; }, 2000);
      }
    });
  });
})();
