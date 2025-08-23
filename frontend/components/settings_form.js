(function () {
  'use strict';
  class SettingsForm extends HTMLElement {
    connectedCallback(){
      this.innerHTML = `
        <form id="settings-form" class="settings-form">
          <div class="field">
            <label><strong>Timezone</strong></label>
            <div class="row">
              <label><input type="radio" name="tzMode" id="tz-auto" value="auto" checked> Automatic (system)</label>
              <label><input type="radio" name="tzMode" id="tz-manual" value="manual"> Manual</label>
            </div>
            <select id="timezone" disabled></select>
            <span class="hint">Choose a manual timezone only if automatic detection is incorrect.</span>
          </div>

          <div class="field">
            <label><strong>Clock</strong></label>
            <div class="row">
              <label><input type="radio" name="clock" value="24" checked> 24-hour</label>
              <label><input type="radio" name="clock" value="12"> 12-hour (AM/PM)</label>
            </div>
          </div>

          <div class="field">
            <label><strong>Week starts on</strong></label>
            <div class="row">
              <label><input type="radio" name="weekStart" value="sun" checked> Sunday</label>
              <label><input type="radio" name="weekStart" value="mon"> Monday</label>
            </div>
          </div>

          <div class="field">
            <label for="defaultZoom"><strong>Display</strong></label>
            <div class="row">
              <span>Default vertical zoom</span>
              <input type="range" id="defaultZoom" min="0.6" max="2.0" step="0.1" value="1.0">
              <span id="zoomValue" class="range-readout">1.0</span>
            </div>
          </div>

          <div class="field">
            <label for="heatmap"><strong>Heatmap colours</strong></label>
            <select id="heatmap">
              <option value="viridis">Viridis</option>
              <option value="plasma">Plasma</option>
              <option value="cividis">Cividis</option>
              <option value="twilight">Twilight</option>
              <option value="lava">Lava</option>
            </select>
            <div class="gradient-preview" id="heatmapPreview" aria-hidden="true"></div>
            <span class="hint">Controls the colour scale used in the schedule heatmap and legend.</span>
          </div>

          <div class="actions">
            <button type="submit">Save</button>
            <span id="saveStatus" class="save-status" aria-live="polite"></span>
          </div>
        </form>
      `;

      // ——— your settings.js logic (ported verbatim but scoped) ———
      const getSystemTZ = () => (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
      const loadLocal = () => { try { const raw=localStorage.getItem('nat20_settings'); return raw?JSON.parse(raw):null; } catch { return null; } };
      const saveLocal = (obj) => {
        localStorage.setItem('nat20_settings', JSON.stringify(obj));
        try { window.dispatchEvent(new StorageEvent('storage', { key:'nat20_settings', newValue: JSON.stringify(obj) })); } catch {}
      };
      const populateTimezones = (select) => {
        const seen=new Set(); const add=(v,l)=>{ if(seen.has(v)) return; const opt=document.createElement('option'); opt.value=v; opt.textContent=l||v; select.appendChild(opt); seen.add(v); };
        add('auto','Automatic (system)');
        try {
          if (typeof Intl.supportedValuesOf==='function'){ for (const tz of Intl.supportedValuesOf('timeZone')) add(tz); }
          else ['UTC','Europe/London','Europe/Paris','America/New_York','America/Los_Angeles','Asia/Tokyo','Australia/Sydney'].forEach(add);
        } catch { ['UTC', getSystemTZ()].forEach(add); }
      };
      const fetchRemote = async () => { try { const r=await fetch('/settings',{credentials:'include',cache:'no-cache'}); if(r.ok) return await r.json(); } catch {} return null; };
      const saveRemote = async (obj) => {
        const r=await fetch('/settings',{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(obj) });
        if (!r.ok) throw new Error(await r.text().catch(()=>`HTTP ${r.status}`)); return r.json();
      };
      const gradientCssFor = (name) => {
        const maps={ viridis:[[0,'#440154'],[.25,'#3b528b'],[.5,'#21918c'],[.75,'#5ec962'],[1,'#fde725']],
          plasma:[[0,'#0d0887'],[.25,'#6a00a8'],[.5,'#b12a90'],[.75,'#e16462'],[1,'#fca636']],
          cividis:[[0,'#00204c'],[.25,'#2c3e70'],[.5,'#606c7c'],[.75,'#9da472'],[1,'#f9e721']],
          twilight:[[0,'#1e1745'],[.25,'#373a97'],[.5,'#73518c'],[.75,'#b06b6d'],[1,'#d3c6b9']],
          lava:[[0,'#000004'],[.2,'#320a5a'],[.4,'#781c6d'],[.6,'#bb3654'],[.8,'#ed6925'],[1,'#fcffa4']] };
        const stops=maps[name]||maps.viridis;
        const parts=stops.map(([t,c])=>`${c} ${(t*100).toFixed(0)}%`); return `linear-gradient(90deg, ${parts.join(', ')})`;
      };

      const $=(s)=>this.querySelector(s);
      const $tzModeAuto=$('#tz-auto'), $tzModeManual=$('#tz-manual'), $tz=$('#timezone');
      const $clock24=this.querySelector('input[name="clock"][value="24"]');
      const $clock12=this.querySelector('input[name="clock"][value="12"]');
      const $weekSun=this.querySelector('input[name="weekStart"][value="sun"]');
      const $weekMon=this.querySelector('input[name="weekStart"][value="mon"]');
      const $defaultZoom=$('#defaultZoom'), $zoomValue=$('#zoomValue');
      const $heatmap=$('#heatmap'), $heatmapPreview=$('#heatmapPreview');
      const $form=$('#settings-form'), $status=$('#saveStatus');

      populateTimezones($tz);

      (async ()=>{
        const defaults={ timezone:'auto', clock:'24', weekStart:'sun', defaultZoom:1.0, heatmap:'viridis' };
        const remote=await fetchRemote(); const local=loadLocal(); const s=remote || local || defaults;

        const isAuto=!s.timezone || s.timezone==='auto';
        $tzModeAuto.checked=isAuto; $tzModeManual.checked=!isAuto; $tz.disabled=isAuto;
        $tz.value = isAuto ? getSystemTZ() : (s.timezone || getSystemTZ());
        if ($tz.value==='auto') $tz.value=getSystemTZ();

        (s.clock==='12' ? $clock12 : $clock24).checked = true;
        (s.weekStart==='mon' ? $weekMon : $weekSun).checked = true;

        const zoom = (typeof s.defaultZoom==='number') ? s.defaultZoom : 1.0;
        $defaultZoom.value=String(zoom); $zoomValue.textContent=zoom.toFixed(1);

        if ($heatmap){ $heatmap.value=s.heatmap||'viridis'; if($heatmapPreview) $heatmapPreview.style.background=gradientCssFor($heatmap.value);
          $heatmap.addEventListener('change', ()=>{ if($heatmapPreview) $heatmapPreview.style.background=gradientCssFor($heatmap.value); });
        }
      })();

      $defaultZoom.addEventListener('input', ()=>{ const z=Number($defaultZoom.value); $zoomValue.textContent=z.toFixed(1); });
      function updateTzMode(){ const manual=$tzModeManual.checked; $tz.disabled=!manual; if(!manual){ const sys=getSystemTZ(); if(!$tz.querySelector(`option[value="${sys}"]`)){ const opt=document.createElement('option'); opt.value=sys; opt.textContent=sys; $tz.appendChild(opt);} $tz.value=sys; } }
      $tzModeAuto.addEventListener('change', updateTzMode); $tzModeManual.addEventListener('change', updateTzMode);

      $form.addEventListener('submit', async (e)=>{
        e.preventDefault();
        const obj={
          timezone: ($tzModeAuto.checked?'auto':$tz.value),
          clock: ($clock12.checked?'12':'24'),
          weekStart: ($weekMon.checked?'mon':'sun'),
          defaultZoom: Number($defaultZoom.value),
          heatmap: ($heatmap ? $heatmap.value : 'viridis')
        };
        try{
          const saved=await saveRemote(obj);
          saveLocal(saved);
          $status.textContent='Saved ✓'; setTimeout(()=>{$status.textContent='';},1500);
        } catch {
          $status.textContent='Save failed'; setTimeout(()=>{$status.textContent='';},2000);
        }
      });
    }
  }
  if (!customElements.get('settings-form')) customElements.define('settings-form', SettingsForm);
})();
