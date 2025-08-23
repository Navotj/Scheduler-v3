(function () {
  'use strict';

  class AvailabilityGrid extends HTMLElement {
    constructor() {
      super();
      this._authed = false;
      this._selected = new Set();
      this._paintMode = 'add';
      this._weekOffset = 0;

      // settings defaults (same as original)
      this.DEFAULTS = { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0 };
      this.settings = { ...this.DEFAULTS };
      this.tz = this._resolveTz(this.settings.timezone);
      this.hour12 = this.settings.clock === '12';
      this.weekStartIdx = this.settings.weekStart === 'mon' ? 1 : 0;

      // zoom
      this.zoomFactor = 1.0;
      this.ZOOM_MAX = 2.0;
      this.ZOOM_STEP = 0.1;
      this.zoomMinFit = 0.6;

      // drag
      this.isDragging = false;
      this.dragStart = null;
      this.dragEnd = null;
      this.dragHintEl = null;
    }

    connectedCallback() {
      this.innerHTML = `
        <div class="header-row">
          <div class="week-and-help">
            <span id="week-label"></span>
            <span>Shift+Scroll = Vertical Zoom, Scroll = Pan</span>
          </div>
          <div class="controls">
            <button id="prev-week">Previous week</button>
            <button id="next-week">Next week</button>
            <button id="mode-add" class="active">Add</button>
            <button id="mode-subtract">Subtract</button>
            <button id="save">Save</button>
          </div>
        </div>

        <section id="grid" class="grid">
          <div id="grid-content" class="grid-content">
            <table id="schedule-table" class="table" aria-label="Weekly availability grid"></table>
          </div>
        </section>

        <div id="signin-tooltip" class="signin-tooltip">Sign in to edit your availability</div>
      `;

      // cache
      this.$ = (sel) => this.querySelector(sel);
      this.table = this.$('#schedule-table');
      this.grid = this.$('#grid');
      this.gridContent = this.$('#grid-content');
      this.weekLabel = this.$('#week-label');

      // events
      this.$('#prev-week').addEventListener('click', async () => {
        if (!this._authed) return;
        this._weekOffset -= 1;
        await this._loadWeekSelections();
        this._buildGrid();
      });
      this.$('#next-week').addEventListener('click', async () => {
        if (!this._authed) return;
        this._weekOffset += 1;
        await this._loadWeekSelections();
        this._buildGrid();
      });
      this.$('#mode-add').addEventListener('click', () => this._setMode('add'));
      this.$('#mode-subtract').addEventListener('click', () => this._setMode('subtract'));
      this.$('#save').addEventListener('click', () => this._saveWeek());

      // react to settings changes from other tabs/pages
      window.addEventListener('storage', (e) => {
        if (e.key !== 'nat20_settings') return;
        const s = this._loadLocal();
        if (!s) return;
        this.settings = { ...this.DEFAULTS, ...s };
        this.tz = this._resolveTz(this.settings.timezone);
        this.hour12 = this.settings.clock === '12';
        this.weekStartIdx = s.weekStart === 'mon' ? 1 : 0;
        this._applyZoom();
        this._buildGrid();
      });

      // auth from <page-shell>
      this.closest('page-shell')?.addEventListener('authchange', (ev) => {
        this.setAuth(ev.detail.authed);
      });

      // init from stored settings + server settings (kept identical to original)
      this._init();
    }

    // ===== settings + time helpers (lifted from your availability_picker.js) =====
    _resolveTz(val) { return (!val || val === 'auto') ? (Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC') : val; }
    _loadLocal() { try { const raw = localStorage.getItem('nat20_settings'); return raw ? JSON.parse(raw) : null; } catch { return null; } }
    async _fetchRemoteSettings() {
      try { const r = await fetch('/settings', { credentials: 'include', cache: 'no-cache' }); if (r.ok) return await r.json(); } catch {}
      return null;
    }
    _saveLocal(obj) {
      localStorage.setItem('nat20_settings', JSON.stringify(obj));
      window.dispatchEvent(new StorageEvent('storage', { key: 'nat20_settings', newValue: JSON.stringify(obj) }));
    }
    _tzOffsetMin(tzName, date) {
      const parts = new Intl.DateTimeFormat('en-US',{ timeZone: tzName, hour12: false, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit' }).formatToParts(date);
      const m = {}; for (const p of parts) m[p.type] = p.value;
      const asUTC = Date.UTC(+m.year, +m.month-1, +m.day, +m.hour, +m.minute, +m.second);
      return Math.round((asUTC - date.getTime())/60000);
    }
    _epochFromZoned(y,m,d,hh,mm,tzName) {
      const guess = Date.UTC(y,m-1,d,hh,mm,0,0);
      let off = this._tzOffsetMin(tzName, new Date(guess));
      let ts = guess - off*60000;
      off = this._tzOffsetMin(tzName, new Date(ts));
      ts = guess - off*60000;
      return Math.floor(ts/1000);
    }
    _todayYMD() {
      const parts = new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, year:'numeric',month:'2-digit',day:'2-digit' }).formatToParts(new Date());
      const m = {}; for (const p of parts) m[p.type] = p.value; return { y:+m.year, m:+m.month, d:+m.day };
    }
    _ymdAddDays(ymd, add) { const tmp = new Date(Date.UTC(ymd.y, ymd.m-1, ymd.d)); tmp.setUTCDate(tmp.getUTCDate()+add); return { y:tmp.getUTCFullYear(), m:tmp.getUTCMonth()+1, d:tmp.getUTCDate() }; }
    _weekdayIndex(epochSec) {
      const wd = new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, weekday:'short' }).format(new Date(epochSec*1000));
      return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
    }
    _formatHourLabel(h) {
      if (this.hour12) { const hr = (h%12)||12; return `${hr} ${h<12?'AM':'PM'}`; }
      return `${String(h).padStart(2,'0')}:00`;
    }
    _weekStartEpoch() {
      const todayYMD = this._todayYMD();
      const todayMid = this._epochFromZoned(todayYMD.y,todayYMD.m,todayYMD.d,0,0,this.tz);
      const todayIdx = this._weekdayIndex(todayMid);
      const diff = (todayIdx - this.weekStartIdx + 7) % 7;
      const baseYMD = this._ymdAddDays(todayYMD, -diff + this._weekOffset*7);
      const baseEpoch = this._epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, this.tz);
      return { baseEpoch, baseYMD };
    }

    // ===== grid build (trimmed from your file, behavior identical) =====
    _buildGrid() {
      const SLOTS_PER_HOUR = 2, HOURS_START = 0, HOURS_END = 24, SLOT_SEC = 30*60;
      this.table.innerHTML = '';
      const { baseEpoch, baseYMD } = this._weekStartEpoch();

      // header
      const thead = document.createElement('thead');
      const tr = document.createElement('tr');
      const th0 = document.createElement('th'); th0.className='time-col'; th0.textContent='Time'; tr.appendChild(th0);
      const dayEpochs = [];
      for (let i=0;i<7;i++){
        const ymd = this._ymdAddDays(baseYMD, i);
        const dayEpoch = this._epochFromZoned(ymd.y, ymd.m, ymd.d, 0, 0, this.tz);
        dayEpochs.push({ymd, epoch: dayEpoch});
        const th = document.createElement('th');
        th.textContent = new Intl.DateTimeFormat(undefined,{ timeZone:this.tz, weekday:'short', month:'short', day:'numeric' }).format(new Date(dayEpoch*1000));
        tr.appendChild(th);
      }
      thead.appendChild(tr); this.table.appendChild(thead);

      // label
      const endDate = new Date((baseEpoch + 6*86400)*1000);
      const fmt = (dt)=>new Intl.DateTimeFormat(undefined,{ timeZone:this.tz, month:'short', day:'numeric' }).format(dt);
      const y1 = new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, year:'numeric'}).format(new Date(baseEpoch*1000));
      const y2 = new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, year:'numeric'}).format(endDate);
      this.weekLabel.textContent = `${fmt(new Date(baseEpoch*1000))} – ${fmt(endDate)}, ${y1===y2?y1:`${y1}–${y2}`}`;

      // body
      const tbody = document.createElement('tbody');
      const totalRows = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;
      const nowEpoch = Math.floor(Date.now()/1000);

      for (let r=0;r<totalRows;r++){
        const tr = document.createElement('tr');

        if (r%2===0){
          const hour = Math.floor(r/2)+HOURS_START;
          const th = document.createElement('th'); th.className='time-col hour'; th.rowSpan=2;
          th.textContent = this._formatHourLabel(hour);
          tr.appendChild(th);
        }

        for (let c=0;c<7;c++){
          const hour = Math.floor(r/2)+HOURS_START;
          const half = (r%2)===1;
          const ymd = dayEpochs[c].ymd;
          const epoch = this._epochFromZoned(ymd.y, ymd.m, ymd.d, hour, half?30:0, this.tz);

          const td = document.createElement('td');
          td.className = 'slot-cell';
          td.dataset.epoch = String(epoch);
          td.dataset.row = r; td.dataset.col = c;

          if (this._selected.has(epoch)) td.classList.add('selected');
          if (epoch < nowEpoch) td.classList.add('past');

          td.addEventListener('mousedown', (e)=> {
            if (!this._authed) return this._showSigninTooltip(e);
            if (td.classList.contains('past')) return;
            e.preventDefault(); this.isDragging = true;
            this.dragStart = {row:r,col:c}; this.dragEnd = {row:r,col:c};
            this._updatePreview(); this._showDragHint(e);
          });
          td.addEventListener('mouseenter', (e)=> {
            if (!this._authed || !this.isDragging || td.classList.contains('past')) return;
            this.dragEnd = {row:r,col:c};
            this._updatePreview(); this._updateDragHint(e);
          });
          td.addEventListener('mouseup', ()=>{
            if (!this._authed || !this.isDragging || td.classList.contains('past')) return;
            this.dragEnd = {row:r,col:c};
            this._applyBoxSelection(); this._clearPreview(); this._hideDragHint();
            this.isDragging=false; this.dragStart=this.dragEnd=null;
          });

          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      this.table.appendChild(tbody);

      document.addEventListener('mouseup', () => {
        if (!this._authed) return;
        if (this.isDragging) { this._applyBoxSelection(); this._clearPreview(); this._hideDragHint(); }
        this.isDragging=false; this.dragStart=this.dragEnd=null;
      });

      this._setupZoomHandlers();
      requestAnimationFrame(()=>this._fitZoomTo24h());
      requestAnimationFrame(()=>this._updateNowMarker());
    }

    // ===== selection & preview =====
    _forEachCellInBox(fn) {
      if (!this.dragStart || !this.dragEnd) return;
      const r1 = Math.min(this.dragStart.row, this.dragEnd.row);
      const r2 = Math.max(this.dragStart.row, this.dragEnd.row);
      const c1 = Math.min(this.dragStart.col, this.dragEnd.col);
      const c2 = Math.max(this.dragStart.col, this.dragEnd.col);
      for (let r=r1;r<=r2;r++){
        for (let c=c1;c<=c2;c++){
          const cell = this.table.querySelector(`td.slot-cell[data-row="${r}"][data-col="${c}"]`);
          if (cell && !cell.classList.contains('past')) fn(cell);
        }
      }
    }
    _updatePreview(){ this._clearPreview(); this._forEachCellInBox(cell => cell.classList.add(this._paintMode==='add'?'preview-add':'preview-sub')); }
    _clearPreview(){ this.table.querySelectorAll('.preview-add,.preview-sub').forEach(el=>el.classList.remove('preview-add','preview-sub')); }
    _applyBoxSelection(){
      this._forEachCellInBox(cell => {
        const epoch = +cell.dataset.epoch;
        if (this._paintMode==='add'){ this._selected.add(epoch); cell.classList.add('selected'); }
        else { this._selected.delete(epoch); cell.classList.remove('selected'); }
      });
    }
    _setMode(m){ this._paintMode=m; this.querySelector('#mode-add').classList.toggle('active', m==='add'); this.querySelector('#mode-subtract').classList.toggle('active', m==='subtract'); }

    // ===== save/load =====
    _compressToIntervals(sortedEpochs) {
      const SLOT_SEC = 1800; const out=[];
      if (!sortedEpochs.length) return out;
      let curFrom = sortedEpochs[0], prev = sortedEpochs[0];
      for (let i=1;i<sortedEpochs.length;i++){ const t=sortedEpochs[i]; if (t===prev+SLOT_SEC) prev=t; else { out.push({from:curFrom,to:prev+SLOT_SEC}); curFrom=t; prev=t; } }
      out.push({from:curFrom,to:prev+SLOT_SEC}); return out;
    }
    async _saveWeek(){
      if (!this._authed) return;
      const { baseEpoch, baseYMD } = this._weekStartEpoch();
      const endYMD = this._ymdAddDays(baseYMD, 7);
      const endEpoch = this._epochFromZoned(endYMD.y,endYMD.m,endYMD.d,0,0,this.tz);
      const inside = Array.from(this._selected).filter(t => t>=baseEpoch && t<endEpoch).sort((a,b)=>a-b);
      const intervals = this._compressToIntervals(inside);
      try {
        const res = await fetch('/availability/save', {
          method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include',
          body: JSON.stringify({ from:baseEpoch, to:endEpoch, intervals, sourceTimezone:this.tz })
        });
        if (!res.ok) { const txt = await res.text(); alert(`Save failed: ${res.status} ${txt}`); return; }
        alert('Saved!');
      } catch { alert('Connection error while saving'); }
    }
    async _loadWeekSelections(){
      const { baseEpoch, baseYMD } = this._weekStartEpoch();
      const endYMD = this._ymdAddDays(baseYMD, 7);
      const endEpoch = this._epochFromZoned(endYMD.y,endYMD.m,endYMD.d,0,0,this.tz);
      try {
        const res = await fetch(`/availability/get?from=${baseEpoch}&to=${endEpoch}`, { credentials:'include', cache:'no-cache' });
        if (!res.ok) return;
        const data = await res.json();
        if (Array.isArray(data.intervals)) {
          for (const t of Array.from(this._selected)) if (t>=baseEpoch && t<endEpoch) this._selected.delete(t);
          for (const iv of data.intervals) {
            for (let t=+iv.from; t<+iv.to; t+=1800) this._selected.add(t);
          }
        }
      } catch {}
    }

    // ===== zoom & now-marker (vertical only) =====
    _applyZoom(){
      const baseRow = 18;
      document.documentElement.style.setProperty('--row-height', `${(baseRow * this.zoomFactor).toFixed(2)}px`);
      requestAnimationFrame(()=>this._updateNowMarker());
    }
    _fitZoomTo24h(){
      const baseRow=18; const thead=this.table.querySelector('thead'); const content=this.gridContent;
      if (!thead || !content) return;
      const available = Math.max(0, content.clientHeight - thead.offsetHeight - 2);
      const needed = 48 * baseRow;
      const zFit = Math.max(available/needed, 0.1);
      this.zoomMinFit = Math.min(zFit, this.ZOOM_MAX);
      this.zoomFactor = Math.max(this.zoomFactor, this.zoomMinFit);
      this._applyZoom();
    }
    _setupZoomHandlers(){
      this.grid.addEventListener('wheel', (e)=>{
        if (!e.shiftKey) return;
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        this.zoomFactor = Math.max(this.zoomMinFit, Math.min(this.ZOOM_MAX, this.zoomFactor - delta*this.ZOOM_STEP));
        this._applyZoom();
      }, { passive:false });
      window.addEventListener('resize', ()=>{ this._fitZoomTo24h(); this._updateNowMarker(); });
    }
    _ensureNowMarker(){
      if (this.nowMarker && this.nowMarker.parentElement === this.gridContent) return;
      if (this.nowMarker && this.nowMarker.parentElement) this.nowMarker.parentElement.removeChild(this.nowMarker);
      this.nowMarker = document.createElement('div');
      this.nowMarker.id='now-marker'; this.nowMarker.className='now-marker';
      const bubble=document.createElement('span'); bubble.className='bubble'; bubble.textContent='now';
      this.nowMarker.appendChild(bubble);
      this.gridContent.appendChild(this.nowMarker);
    }
    _updateNowMarker(){
      this._ensureNowMarker();
      const { baseYMD } = this._weekStartEpoch();
      const today = this._todayYMD();
      const dayOffset = Math.round((Date.UTC(today.y,today.m-1,today.d)-Date.UTC(baseYMD.y,baseYMD.m-1,baseYMD.d))/86400000);
      if (dayOffset < 0 || dayOffset > 6) { this.nowMarker.style.display='none'; return; }

      const parts = new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, hour12:false, hour:'2-digit', minute:'2-digit' }).formatToParts(new Date());
      const hh = +parts.find(p=>p.type==='hour').value;
      const mm = +parts.find(p=>p.type==='minute').value;

      const rowIndex = hh*2 + (mm>=30?1:0);
      const frac = (mm%30)/30;

      const targetCell = this.table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="${rowIndex}"]`);
      const colStartCell = this.table.querySelector(`td.slot-cell[data-col="${dayOffset}"][data-row="0"]`);
      if (!targetCell || !colStartCell) { this.nowMarker.style.display='none'; return; }

      const top = (this.table.offsetTop||0) + targetCell.offsetTop + (targetCell.offsetHeight*frac);
      const left = (this.table.offsetLeft||0) + colStartCell.offsetLeft;
      const width = colStartCell.offsetWidth;
      Object.assign(this.nowMarker.style,{ display:'block', top:`${top}px`, left:`${left}px`, width:`${width}px` });
    }

    // ===== auth + hints =====
    setAuth(ok){ this._authed = !!ok; }
    _showSigninTooltip(e){ const tt=this.$('#signin-tooltip'); tt.style.display='block'; tt.style.left=(e.clientX+12)+'px'; tt.style.top=(e.clientY+14)+'px'; }
    _updateDragHint(e){ if (!this.dragHintEl || this.dragHintEl.style.display!=='block') return; this.dragHintEl.textContent=this._currentDragRangeLabel(); this.dragHintEl.style.left=e.clientX+'px'; this.dragHintEl.style.top=e.clientY+'px'; }
    _currentDragRangeLabel(){
      if (!this.dragStart||!this.dragEnd) return '';
      const SLOTS_PER_HOUR=2;
      const rowToHM = (r)=>({ h:Math.floor(r/SLOTS_PER_HOUR), m:(r%SLOTS_PER_HOUR)*30 });
      const fmt = (h,m)=> this.hour12 ? `${(h%12)||12}:${String(m).padStart(2,'0')} ${h<12?'AM':'PM'}` : `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
      const r1=Math.min(this.dragStart.row,this.dragEnd.row), r2=Math.max(this.dragStart.row,this.dragEnd.row);
      const a=rowToHM(r1), b=rowToHM(r2+1); return `${fmt(a.h,a.m)} – ${fmt(b.h,b.m)}`;
    }
    _ensureDragHint(){ if (this.dragHintEl) return; this.dragHintEl=document.createElement('div'); this.dragHintEl.className='drag-hint'; document.body.appendChild(this.dragHintEl); }
    _showDragHint(e){ this._ensureDragHint(); this.dragHintEl.style.display='block'; this.dragHintEl.textContent=this._currentDragRangeLabel(); this.dragHintEl.style.left=e.clientX+'px'; this.dragHintEl.style.top=e.clientY+'px'; }
    _hideDragHint(){ if (this.dragHintEl) this.dragHintEl.style.display='none'; }

    // ===== init =====
    async _init(){
      const remote = await this._fetchRemoteSettings();
      const local = this._loadLocal();
      const s = remote || local || this.DEFAULTS;
      this.settings = { ...this.DEFAULTS, ...s };
      this.tz = this._resolveTz(this.settings.timezone);
      this.hour12 = this.settings.clock === '12';
      this.weekStartIdx = this.settings.weekStart === 'mon' ? 1 : 0;

      const dz = (typeof this.settings.defaultZoom === 'number') ? this.settings.defaultZoom : 1.0;
      this.zoomFactor = dz;
      this._saveLocal(this.settings);

      this._applyZoom();
      await this._loadWeekSelections();
      this._buildGrid();
      setInterval(()=>this._updateNowMarker(), 60000);
    }
  }

  if (!customElements.get('availability-grid')) customElements.define('availability-grid', AvailabilityGrid);
})();
