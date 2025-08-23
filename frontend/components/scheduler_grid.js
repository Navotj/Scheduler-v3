(function () {
  'use strict';

  const SLOTS_PER_HOUR = 2, SLOT_SEC = 1800, HOURS_START=0, HOURS_END=24;

  class SchedulerGrid extends HTMLElement {
    constructor(){
      super();
      // state
      this.weekOffset=0; this.members=[];
      this.totalMembers=0; this.userSlotSets=new Map();
      this.settings={ timezone:'auto', clock:'24', weekStart:'sun', defaultZoom:1.0, heatmap:'viridis' };
      this.tz=this._resolveTz(this.settings.timezone);
      this.hour12=this.settings.clock==='12';
      this.weekStartIdx=this.settings.weekStart==='mon'?1:0;
      this.heatmap=this.settings.heatmap;

      // derived
      this.ROWS_PER_DAY=(HOURS_END-HOURS_START)*SLOTS_PER_HOUR;
      this.WEEK_ROWS=this.ROWS_PER_DAY*7;
      this.counts=[]; this.sets=[];

      // zoom
      this.zoom=1.0; this.ZMIN=0.6; this.ZMAX=2.0; this.ZSTEP=0.1;

      // cache
      this.$=null; this.table=null; this.grid=null; this.results=null; this.resultsPanel=null; this.nowMarker=null;
    }

    connectedCallback(){
      this.innerHTML = `
        <div class="left-col">
          <div id="controls" class="controls">
            <button id="prev-week" class="btn btn-secondary" title="Previous week">← Previous week</button>
            <button id="next-week" class="btn btn-secondary" title="Next week">Next week →</button>
            <span class="muted helper">Shift+Scroll = Vertical Zoom, Scroll = Pan</span>
          </div>
          <div class="grid" id="grid">
            <div class="grid-content" id="grid-content">
              <table class="table" id="scheduler-table" aria-label="Group availability grid"></table>
              <div id="now-marker" class="now-marker" style="display:none;"><span class="bubble">now</span></div>
            </div>
          </div>
        </div>
      `;
      this.$=(s)=>this.querySelector(s);
      this.table=this.$('#scheduler-table'); this.grid=this.$('#grid'); this.resultsPanel=this.closest('page-shell')?.querySelector('scheduler-results')||null;

      // listen to sibling panels
      const membersEl = this.closest('page-shell')?.querySelector('scheduler-members');
      const filtersEl = this.closest('page-shell')?.querySelector('scheduler-filters');
      const resultsEl = this.closest('page-shell')?.querySelector('scheduler-results');

      membersEl?.addEventListener('memberschange', (ev)=>{ this.members = ev.detail.members || []; this._updateAll(); });
      this.closest('page-shell')?.addEventListener('authchange', (ev)=>{ /* no-op needed here; members panel handles "Add me" */ });

      filtersEl?.addEventListener('filterschange', ()=>{ this._applyFilterDimming(filtersEl.values); this._findCandidates(filtersEl.values, resultsEl); });

      // nav
      this.$('#prev-week').addEventListener('click', async ()=>{ this.weekOffset-=1; this._buildTable(); await this._fetchAvail(); this._updateLegend(filtersEl); this._applyFilterDimming(filtersEl.values); this._findCandidates(filtersEl.values, resultsEl); });
      this.$('#next-week').addEventListener('click', async ()=>{ this.weekOffset+=1; this._buildTable(); await this._fetchAvail(); this._updateLegend(filtersEl); this._applyFilterDimming(filtersEl.values); this._findCandidates(filtersEl.values, resultsEl); });

      // settings live
      window.addEventListener('storage', (e)=>{
        if (e.key!=='nat20_settings') return;
        const s=this._loadLocal();
        if (!s) return;
        const prevTz=this.tz, prevStart=this.weekStartIdx;
        this.settings={ ...this.settings, ...s };
        this.tz=this._resolveTz(this.settings.timezone);
        this.hour12=this.settings.clock==='12';
        this.weekStartIdx=this.settings.weekStart==='mon'?1:0;
        this.heatmap=this.settings.heatmap||'viridis';
        if (this.tz!==prevTz || this.weekStartIdx!==prevStart){ this._buildTable(); this._fetchAvail(); }
        else { this._paintCounts(); this._updateLegend(filtersEl); }
      });

      // zoom
      this.grid.addEventListener('wheel', (e)=>{ if(!e.shiftKey) return; e.preventDefault(); const d=Math.sign(e.deltaY); this.zoom=this._clamp(this.zoom-d*this.ZSTEP,this.ZMIN,this.ZMAX); this._applyZoom(); }, { passive:false });

      // init
      const local=this._loadLocal(); if (local) { this.settings={...this.settings,...local}; this.tz=this._resolveTz(this.settings.timezone); this.hour12=this.settings.clock==='12'; this.weekStartIdx=this.settings.weekStart==='mon'?1:0; this.heatmap=this.settings.heatmap||'viridis'; }
      this._buildTable();
      this._fetchAvail().then(()=>{
        this._updateLegend(filtersEl);
        this._applyFilterDimming(filtersEl?.values||{maxMissing:0,minHours:1});
        this._findCandidates(filtersEl?.values||{maxMissing:0,minHours:1,sort:'most'}, resultsEl);
      });
      this._bindMarkerReposition();
    }

    // ===== utils (subset of your originals) =====
    _clamp(v,lo,hi){ return Math.max(lo, Math.min(hi,v)); }
    _resolveTz(v){ return (!v||v==='auto') ? (Intl.DateTimeFormat().resolvedOptions().timeZone||'UTC') : v; }
    _loadLocal(){ try { const raw=localStorage.getItem('nat20_settings'); return raw?JSON.parse(raw):null; } catch { return null; } }
    _tzOffsetMin(tzName, date){
      const parts=new Intl.DateTimeFormat('en-US',{ timeZone:tzName, hour12:false, year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',second:'2-digit'}).formatToParts(date);
      const m={}; for(const p of parts) m[p.type]=p.value;
      const asUTC=Date.UTC(+m.year,+m.month-1,+m.day,+m.hour,+m.minute,+m.second);
      return Math.round((asUTC - date.getTime())/60000);
    }
    _epochFromZoned(y,m,d,hh,mm,tz){ const guess=Date.UTC(y,m-1,d,hh,mm,0,0); let off=this._tzOffsetMin(tz,new Date(guess)); let ts=guess-off*60000; off=this._tzOffsetMin(tz,new Date(ts)); ts=guess-off*60000; return Math.floor(ts/1000); }
    _getYMD(date){ const parts=new Intl.DateTimeFormat('en-US',{ timeZone:this.tz,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(date); const m={}; for(const p of parts) m[p.type]=p.value; return {y:+m.year,m:+m.month,d:+m.day}; }
    _today(){ return this._getYMD(new Date()); }
    _addDays(ymd, n){ const t=new Date(Date.UTC(ymd.y,ymd.m-1,ymd.d)); t.setUTCDate(t.getUTCDate()+n); return { y:t.getUTCFullYear(), m:t.getUTCMonth()+1, d:t.getUTCDate() }; }
    _weekdayIndex(epoch){ const wd=new Intl.DateTimeFormat('en-US',{ timeZone:this.tz, weekday:'short'}).format(new Date(epoch*1000)); return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd); }
    _weekStart() {
      const today=this._today(); const todayMid=this._epochFromZoned(today.y,today.m,today.d,0,0,this.tz);
      const idx=this._weekdayIndex(todayMid); const diff=(idx - this.weekStartIdx + 7) % 7;
      const base=this._addDays(today, -diff + this.weekOffset*7);
      const baseEpoch=this._epochFromZoned(base.y,base.m,base.d,0,0,this.tz);
      return { baseEpoch, baseYMD:base };
    }
    _fmtTime(h,m){ if(this.hour12){ const am=h>=12?'pm':'am'; let hr=h%12; if(!hr) hr=12; return `${hr}:${String(m).padStart(2,'0')} ${am}`; } return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`; }
    _fmtRange(startSec,endSec){
      const a=new Date(startSec*1000), b=new Date(endSec*1000);
      const dow=new Intl.DateTimeFormat('en-GB',{ timeZone:this.tz, weekday:'short'}).format(a);
      const s=new Intl.DateTimeFormat('en-GB',{ timeZone:this.tz, hour:'2-digit', minute:'2-digit', hour12:this.hour12 }).format(a);
      const e=new Intl.DateTimeFormat('en-GB',{ timeZone:this.tz, hour:'2-digit', minute:'2-digit', hour12:this.hour12 }).format(b);
      return `${dow}, ${s} – ${e}`;
    }

    // ===== build table & paint counts (same mechanics as your code) =====
    _buildTable(){
      this.table.innerHTML='';
      const thead=document.createElement('thead'); const tr=document.createElement('tr');
      const th0=document.createElement('th'); th0.textContent='Time'; th0.className='time-col'; tr.appendChild(th0);
      const { baseEpoch } = this._weekStart();
      for (let i=0;i<7;i++){
        const d=new Date((baseEpoch+i*86400)*1000);
        const label=new Intl.DateTimeFormat('en-GB',{ timeZone:this.tz, weekday:'short', day:'2-digit', month:'short'}).format(d);
        const th=document.createElement('th'); th.textContent=label; th.className='day'; tr.appendChild(th);
      }
      thead.appendChild(tr); this.table.appendChild(thead);

      const tbody=document.createElement('tbody');
      for (let r=0;r<this.ROWS_PER_DAY;r++){
        const tr=document.createElement('tr');
        if (r%2===0){ const hh=Math.floor(r/2); const th=document.createElement('th'); th.className='time-col hour'; th.rowSpan=2; th.textContent=this._fmtTime(hh,0); tr.appendChild(th); }
        for (let day=0; day<7; day++){
          const td=document.createElement('td'); td.className='slot-cell';
          td.dataset.day=String(day); td.dataset.row=String(r);
          const epoch=this._dayStart(day) + r*SLOT_SEC; td.dataset.epoch=String(epoch);
          td.addEventListener('mousemove', (e)=>this._onHover(e));
          td.addEventListener('mouseleave', ()=>{ const tip=document.querySelector('#cell-tooltip'); if (tip) tip.style.display='none'; });
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      this.table.appendChild(tbody);
      this._applyZoom(); this._shadePast(); this._positionNow(); this._syncResultsHeight();
      requestAnimationFrame(()=>this._fit24h());
    }
    _dayStart(day){ const { baseEpoch } = this._weekStart(); return baseEpoch + day*86400; }
    async _fetchAvail(){
      if (!this.members.length){ this.userSlotSets.clear(); this.totalMembers=0; this._paintCounts(); return; }
      const { baseEpoch, baseYMD } = this._weekStart();
      const endYMD=this._addDays(baseYMD,7); const endEpoch=this._epochFromZoned(endYMD.y,endYMD.m,endYMD.d,0,0,this.tz);
      const payload={ from:baseEpoch, to:endEpoch, usernames:this.members };
      const paths=['/availability/get_many','/availability/availability/get_many']; // try both like your code
      let data={ intervals:{} };
      for (const url of paths){
        try{ const res=await fetch(url,{ method:'POST', headers:{'Content-Type':'application/json'}, credentials:'include', body:JSON.stringify(payload) }); if (res.status===404) continue; if (!res.ok) continue; data=await res.json(); break; } catch {}
      }
      this.userSlotSets.clear();
      for (const uname of this.members){
        const intervals=(data.intervals && data.intervals[uname]) || [];
        const set=new Set();
        for (const iv of intervals){
          let from=Math.max(iv.from, baseEpoch), to=Math.min(iv.to, endEpoch);
          for (let t=Math.ceil(from/SLOT_SEC)*SLOT_SEC; t<to; t+=SLOT_SEC) set.add(t);
        }
        this.userSlotSets.set(uname,set);
      }
      this.totalMembers=this.members.length;
      this._paintCounts();
    }
    _slotCount(epoch){ let c=0; for (const u of this.members){ const s=this.userSlotSets.get(u); if (s && s.has(epoch)) c++; } return c; }
    _paintCounts(){
      this.counts=[]; this.sets=[];
      const all=this.table.querySelectorAll('.slot-cell');
      for (const td of all){
        const epoch=+td.dataset.epoch;
        const raw=this._slotCount(epoch);
        td.style.setProperty('background-color', this._shadeForCount(raw), 'important');
        td.classList.remove('dim','highlight');
        const day=+td.dataset.day, row=+td.dataset.row, g=day*this.ROWS_PER_DAY + row;
        this.counts[g]=raw;
        const who=new Set(); for (const u of this.members){ const s=this.userSlotSets.get(u); if (s && s.has(epoch)) who.add(u); }
        this.sets[g]=who;
      }
      this.WEEK_ROWS=this.counts.length;
    }

    // ===== colors / legend =====
    _shadeForCount(count){
      const n=this.totalMembers||0;
      const threshold = n>=11 ? (n-10) : 0;
      if (n<=0) return '#0a0a0a';
      if (count<=threshold) return '#0a0a0a';
      const denom=Math.max(1,n-threshold);
      const t0=(count-threshold)/denom;
      const t=Math.max(0,Math.min(1, t0));
      return this._colormap(t);
    }
    _colormap(t){
      const maps={
        viridis:[[0,'#440154'],[.25,'#3b528b'],[.5,'#21918c'],[.75,'#5ec962'],[1,'#fde725']],
        plasma:[[0,'#0d0887'],[.25,'#6a00a8'],[.5,'#b12a90'],[.75,'#e16462'],[1,'#fca636']],
        cividis:[[0,'#00204c'],[.25,'#2c3e70'],[.5,'#606c7c'],[.75,'#9da472'],[1,'#f9e721']],
        twilight:[[0,'#1e1745'],[.25,'#373a97'],[.5,'#73518c'],[.75,'#b06b6d'],[1,'#d3c6b9']],
        lava:[[0,'#000004'],[.2,'#320a5a'],[.4,'#781c6d'],[.6,'#bb3654'],[.8,'#ed6925'],[1,'#fcffa4']]
      };
      const stops=maps[this.heatmap]||maps.viridis;
      const lerp=(a,b,k)=>a+(b-a)*k;
      function hex(h){ const m=/^#?([a-f0-9]{2})([a-f0-9]{2})([a-f0-9]{2})$/i.exec(h); return { r:parseInt(m[1],16), g:parseInt(m[2],16), b:parseInt(m[3],16) }; }
      let c0=stops[0][1], c1=stops[stops.length-1][1], t0=0, t1=1;
      for (let i=0;i<stops.length-1;i++){ const [a,ca]=stops[i], [b,cb]=stops[i+1]; if (t>=a && t<=b){ t0=a; t1=b; c0=ca; c1=cb; break; } }
      const A=hex(c0), B=hex(c1); const k=(t - t0)/(t1 - t0);
      const r=Math.round(lerp(A.r,B.r,k)), g=Math.round(lerp(A.g,B.g,k)), b=Math.round(lerp(A.b,B.b,k));
      return `rgb(${r}, ${g}, ${b})`;
    }
    _updateLegend(filtersEl){
      if (!filtersEl) return;
      filtersEl.setLegendPainter({ total:this.totalMembers, color:(raw)=>this._shadeForCount(raw) });
    }

    // ===== filters / candidates =====
    _applyFilterDimming({maxMissing=0,minHours=1}){
      const needed=Math.max(0, this.totalMembers - maxMissing);
      const minSlots=Math.max(1, Math.round(minHours*SLOTS_PER_HOUR));
      const startIdx=this._nowIndex();

      const all=this.table.querySelectorAll('.slot-cell'); for (const td of all) td.classList.remove('dim');
      if (!this.totalMembers || needed<=0) return;

      let g=0;
      while (g<this.WEEK_ROWS){
        if (g < startIdx || (this.counts[g]||0) < needed){ this._dim(g); g++; continue; }
        let h=g; while (h<this.WEEK_ROWS && h>=startIdx && (this.counts[h]||0)>=needed) h++;
        const len=h-g; if (len<minSlots){ for (let t=g;t<h;t++) this._dim(t); }
        g=h;
      }
    }
    _dim(g){ const {day,row}=this._g2dr(g); const td=this.table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`); if (td) td.classList.add('dim'); }
    _g2dr(g){ const day=Math.floor(g/this.ROWS_PER_DAY); const row=g%this.ROWS_PER_DAY; return {day,row}; }

    _findCandidates({maxMissing=0,minHours=1,sort='most'}, resultsEl){
      const needed=Math.max(0, this.totalMembers - maxMissing);
      const minSlots=Math.max(1, Math.round(minHours*SLOTS_PER_HOUR));
      const startIdx=this._nowIndex();
      const sessions=[]; const seen=new Set();
      if (!this.totalMembers || needed<=0){ resultsEl?.render([],this.totalMembers,(a,b)=>this._fmtRange(a,b),()=>{}); return; }

      const { baseEpoch } = this._weekStart();
      for (let k=this.totalMembers; k>=needed; k--){
        let g=startIdx;
        while (g<this.WEEK_ROWS){
          if ((this.counts[g]||0)<k){ g++; continue; }
          let s=g, t=g+1, inter=new Set(this.sets[g]);
          while (t<this.WEEK_ROWS && (this.counts[t]||0)>=k){
            const avail=this.sets[t]; inter=new Set([...inter].filter(x=>avail.has(x)));
            if (inter.size<k) break; t++;
          }
          s=Math.max(s,startIdx);
          const len=t-s;
          if (len>=minSlots && inter.size>=k){
            const start = baseEpoch + s*SLOT_SEC;
            const end   = baseEpoch + t*SLOT_SEC;
            const users = Array.from(inter).sort();
            const key = `${start}-${end}-${users.join('|')}`;
            if (!seen.has(key)){ seen.add(key); sessions.push({ gStart:s, gEnd:t, start, end, duration:len, participants:users.length, users, allMembers:this.members.slice() }); }
          }
          while (t<this.WEEK_ROWS && (this.counts[t]||0)>=k) t++; g=t;
        }
      }
      sessions.sort((a,b)=>{
        if (sort==='most'){ if (b.participants!==a.participants) return b.participants-a.participants; return a.start-b.start; }
        if (sort==='earliest-week') return a.start-b.start;
        if (sort==='latest-week') return b.start-a.start;
        if (sort==='earliest'){ const ar=a.gStart%this.ROWS_PER_DAY, br=b.gStart%this.ROWS_PER_DAY; if (ar!==br) return ar-br; return a.start-b.start; }
        if (sort==='latest'){ const ar=a.gStart%this.ROWS_PER_DAY, br=b.gStart%this.ROWS_PER_DAY; if (ar!==br) return br-ar; return a.start-b.start; }
        if (sort==='longest'){ if (b.duration!==a.duration) return b.duration-a.duration; return a.start-b.start; }
        return a.start-b.start;
      });

      resultsEl?.render(sessions, this.totalMembers, (a,b)=>this._fmtRange(a,b), (it,on)=>this._highlight(it,on));
    }

    _highlight(item, on){
      for (let g=item.gStart; g<item.gEnd; g++){
        const {day,row}=this._g2dr(g);
        const td=this.table.querySelector(`.slot-cell[data-day="${day}"][data-row="${row}"]`);
        if (td) td.classList.toggle('highlight', on);
      }
    }

    // ===== tooltip =====
    _onHover(e){
      const td=e.currentTarget; if (td.classList.contains('past')) return;
      const epoch=+td.dataset.epoch;
      const available=[], unavailable=[];
      for (const u of this.members){ const s=this.userSlotSets.get(u); if (s && s.has(epoch)) available.push(u); else unavailable.push(u); }
      const tip=document.querySelector('#cell-tooltip'); if (!tip) return;
      tip.innerHTML = `<div>Available: ${available.length?available.join(', '):'—'}</div><div style="margin-top:6px; color:#bbb;">${unavailable.length?('Unavailable: '+unavailable.join(', ')):'Unavailable: —'}</div>`;
      tip.style.display='block'; tip.style.left=(e.clientX+14)+'px'; tip.style.top=(e.clientY+16)+'px';
    }

    // ===== past, now, zoom sizing =====
    _shadePast(){
      const nowMs=Date.now(); const { baseEpoch } = this._weekStart(); const baseMs=baseEpoch*1000; const endMs=baseMs+7*86400000;
      const tds=this.table.querySelectorAll('.slot-cell');
      for (const td of tds) td.classList.remove('past');
      if (nowMs<baseMs || nowMs>endMs) return;
      for (const td of tds){ const cellMs=+td.dataset.epoch*1000; if (cellMs<nowMs) td.classList.add('past'); }
    }
    _nowIndex(){ const nowSec=Math.floor(Date.now()/1000); const { baseEpoch } = this._weekStart(); return Math.max(0, Math.ceil((nowSec - baseEpoch)/SLOT_SEC)); }
    _rowPx(){ const v=getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim(); return parseFloat(v.replace('px','')); }
    _positionNow(){
      const nowSec=Math.floor(Date.now()/1000); const { baseEpoch } = this._weekStart(); const endSec=baseEpoch+7*86400;
      this.nowMarker=this.$('#now-marker'); if (nowSec<baseEpoch || nowSec>=endSec){ this.nowMarker.style.display='none'; return; }
      this.nowMarker.style.display='block';
      const secondsIntoWeek=nowSec-baseEpoch; const dayIdx=Math.floor(secondsIntoWeek/86400);
      const secondsIntoDay=secondsIntoWeek - dayIdx*86400; const rowsIntoDay=secondsIntoDay/SLOT_SEC;
      const headerH = this.table.querySelector('thead')?.offsetHeight || 0;
      const topPx = headerH + rowsIntoDay * this._rowPx();
      this.nowMarker.style.top = `${topPx}px`;
      const first = this.table.querySelector(`tbody tr:first-child td.slot-cell[data-day="${dayIdx}"][data-row="0"]`);
      if (first){ const left=first.offsetLeft, w=first.offsetWidth; this.nowMarker.style.left=`${left}px`; this.nowMarker.style.width=`${w}px`; }
    }
    _bindMarkerReposition(){ this.grid.addEventListener('scroll', ()=>this._positionNow()); window.addEventListener('resize', ()=>{ this._positionNow(); this._syncResultsHeight(); }); setInterval(()=>this._positionNow(), 30000); }
    _applyZoom(){ const base=18; const px=this._clamp(Math.round(base*this.zoom),10,42); document.documentElement.style.setProperty('--row-height', `${px}px`); this._positionNow(); this._syncResultsHeight(); }
    _fit24h(){
      const base=18, content=this.$('#grid-content'), thead=this.table.querySelector('thead'); if(!content||!thead) return;
      const available=Math.max(0, content.clientHeight - thead.offsetHeight - 2);
      const needed=this.ROWS_PER_DAY * base;
      const z=this._clamp(available/needed, this.ZMIN, this.ZMAX); this.zoom = z>=this.ZMIN ? z : this.ZMIN; this._applyZoom();
    }
    _syncResultsHeight(){
      const resultsPanel = this.closest('page-shell')?.querySelector('scheduler-results');
      if (!resultsPanel) return;
      const gridRect=this.grid.getBoundingClientRect(); const panelRect=resultsPanel.getBoundingClientRect();
      const available=Math.max(120, Math.floor(gridRect.bottom - panelRect.top - 8));
      const inner = Math.max(60, available - 36); // padding/title approx
      resultsPanel.style.height = available+'px';
      const list = resultsPanel.querySelector('#results'); if (list) list.style.height = inner+'px';
    }

    // ===== external sync =====
    async _updateAll(){ await this._fetchAvail(); const filtersEl=this.closest('page-shell')?.querySelector('scheduler-filters'); const resultsEl=this.closest('page-shell')?.querySelector('scheduler-results'); this._updateLegend(filtersEl); this._applyFilterDimming(filtersEl?.values||{maxMissing:0,minHours:1}); this._findCandidates(filtersEl?.values||{maxMissing:0,minHours:1,sort:'most'}, resultsEl); }
  }

  if (!customElements.get('scheduler-grid')) customElements.define('scheduler-grid', SchedulerGrid);
})();
