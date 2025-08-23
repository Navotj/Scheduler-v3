// components/availability_grid.js
// Light-DOM <availability-grid> that builds a weekly availability picker.
(() => {
  'use strict';

  // ---- Constants ----
  const SLOT_MIN = 30;
  const SLOT_SEC = SLOT_MIN * 60;
  const SLOTS_PER_HOUR = 60 / SLOT_MIN; // 2
  const HOURS_START = 0, HOURS_END = 24;
  const ROWS_PER_DAY = (HOURS_END - HOURS_START) * SLOTS_PER_HOUR;

  const DEFAULT_SETTINGS = { timezone: 'auto', clock: '24', weekStart: 'sun' };

  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const shade = (on) => on ? 'rgba(0,180,120,0.75)' : 'transparent';

  function loadSettings() {
    try { return { ...DEFAULT_SETTINGS, ...(JSON.parse(localStorage.getItem('nat20_settings')||'null')||{}) }; }
    catch { return { ...DEFAULT_SETTINGS }; }
  }
  function resolveTimezone(val) {
    if (!val || val === 'auto') return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
    return val;
  }
  function tzParts(tz, opts, d) { return new Intl.DateTimeFormat('en-US', { timeZone: tz, ...opts }).formatToParts(d); }
  function tzOffsetMinutes(tz, date) {
    const p = tzParts(tz, { year:'numeric', month:'2-digit', day:'2-digit', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:false }, date);
    const m = {}; for (const x of p) m[x.type] = x.value;
    const asUTC = Date.UTC(+m.year, +m.month-1, +m.day, +m.hour, +m.minute, +m.second);
    return Math.round((asUTC - date.getTime())/60000);
  }
  function epochFromZoned(y,m,d,hh,mm,tz) {
    const guess = Date.UTC(y, m-1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(tz, new Date(guess));
    let ts = guess - off*60000;
    off = tzOffsetMinutes(tz, new Date(ts));
    ts = guess - off*60000;
    return Math.floor(ts/1000);
  }
  function ymdInTZ(date, tz) {
    const p = tzParts(tz, { year:'numeric', month:'2-digit', day:'2-digit' }, date);
    const m = {}; p.forEach(q => m[q.type]=q.value);
    return { y:+m.year, m:+m.month, d:+m.day };
  }
  const todayYMD = (tz) => ymdInTZ(new Date(), tz);
  function ymdAddDays(ymd, add) {
    const t = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    t.setUTCDate(t.getUTCDate() + add);
    return { y: t.getUTCFullYear(), m: t.getUTCMonth()+1, d: t.getUTCDate() };
  }
  function weekdayIndexInTZ(sec, tz) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tz, weekday:'short' }).format(new Date(sec*1000));
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
  }
  function fmtTime(h, m, hour12) {
    if (hour12) {
      const ampm = h >= 12 ? 'pm' : 'am';
      let hr = h % 12; if (hr === 0) hr = 12;
      return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
    }
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  class AvailabilityGrid extends HTMLElement {
    constructor() {
      super();
      this.settings = loadSettings();
      this.tz = resolveTimezone(this.settings.timezone);
      this.hour12 = this.settings.clock === '12';
      this.weekStartIdx = this.settings.weekStart === 'mon' ? 1 : 0;

      this.weekOffset = 0;
      this.isAuthenticated = (window.__authState && window.__authState.authenticated) || false;
      this.username = (window.__authState && window.__authState.username) || null;

      this.slotSet = new Set();
      this.dragging = null;
      this.zoom = 1.0;

      this._authListener = (e) => {
        this.isAuthenticated = !!(e.detail && e.detail.authenticated);
        this.username = e.detail && e.detail.username;
        this.updateGating();
      };
    }

    connectedCallback() {
      this.innerHTML = `
        <div id="grid" class="grid-wrap">
          <div id="grid-content">
            <table id="grid-table" class="grid-table"></table>
            <div id="now-marker" class="now-marker" style="display:none;"></div>
          </div>
          <div id="sign-in-gate" class="sign-in-gate" style="display:none;">
            <div class="bubble">
              <div class="bubble-title">Please sign in</div>
              <div class="bubble-body">You need to login to edit and save your availability.</div>
              <button id="bubble-login">Login</button>
            </div>
          </div>
        </div>

        <aside id="side" class="side">
          <div class="panel">
            <div class="row">
              <button id="prev-week">← Prev</button>
              <div id="week-label" class="week-label"></div>
              <button id="next-week">Next →</button>
            </div>
            <div class="row">
              <label><input type="radio" name="mode" value="add" checked> Add</label>
              <label><input type="radio" name="mode" value="remove"> Remove</label>
              <button id="save" title="Save this week">Save</button>
            </div>
            <div class="row small">Shift+wheel to zoom; drag to select.</div>
          </div>
        </aside>
      `;

      this.addEventListener('wheel', (e) => {
        if (!e.shiftKey) return;
        e.preventDefault();
        const delta = Math.sign(e.deltaY);
        this.zoom = clamp(this.zoom - delta * 0.1, 0.7, 2.0);
        this.applyZoom();
      }, { passive: false });

      this.querySelector('#prev-week')?.addEventListener('click', () => { this.weekOffset -= 1; this.build(); this.loadWeek(); });
      this.querySelector('#next-week')?.addEventListener('click', () => { this.weekOffset += 1; this.build(); this.loadWeek(); });
      this.querySelector('#save')?.addEventListener('click', () => this.saveWeek());
      this.querySelector('#bubble-login')?.addEventListener('click', () => window.openModal && window.openModal('../pages/login.html'));

      this.addEventListener('auth-changed', this._authListener);
      this.build();
      this.loadWeek();
      this.updateGating();
      this.bindRecalc();
    }

    disconnectedCallback() {
      this.removeEventListener('auth-changed', this._authListener);
      if (this._timer) { clearInterval(this._timer); this._timer = null; }
    }

    // ---- Build / paint ----
    getWeekStart() {
      const today = todayYMD(this.tz);
      const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, this.tz);
      const todayIdx = weekdayIndexInTZ(todayMid, this.tz);
      const diff = (todayIdx - this.weekStartIdx + 7) % 7;
      const baseYMD = ymdAddDays(today, -diff + this.weekOffset * 7);
      const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, this.tz);
      return { baseEpoch, baseYMD };
    }
    dayStart(i) { return this.getWeekStart().baseEpoch + i * 86400; }

    labelWeek() {
      const { baseYMD } = this.getWeekStart();
      const endYMD = ymdAddDays(baseYMD, 6);
      const fmt = (ymd) => new Intl.DateTimeFormat('en-GB', { timeZone: this.tz, month: 'short', day: '2-digit' })
        .format(new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d)));
      this.querySelector('#week-label').textContent = `${fmt(baseYMD)} – ${fmt(endYMD)} (${this.tz})`;
    }

    build() {
      const table = this.querySelector('#grid-table');
      table.innerHTML = '';
      this.labelWeek();

      const thead = document.createElement('thead');
      const trh = document.createElement('tr');
      const thTime = document.createElement('th');
      thTime.className = 'time-col';
      thTime.textContent = 'Time';
      trh.appendChild(thTime);

      const { baseEpoch } = this.getWeekStart();
      for (let i = 0; i < 7; i++) {
        const d = new Date((baseEpoch + i * 86400) * 1000);
        const label = new Intl.DateTimeFormat('en-GB', { timeZone: this.tz, weekday: 'short', day: '2-digit', month: 'short' }).format(d);
        const th = document.createElement('th');
        th.textContent = label;
        th.className = 'day';
        trh.appendChild(th);
      }
      thead.appendChild(trh);
      table.appendChild(thead);

      const tbody = document.createElement('tbody');
      for (let r = 0; r < ROWS_PER_DAY; r++) {
        const tr = document.createElement('tr');

        if (r % 2 === 0) {
          const minutes = (HOURS_START * 60) + r * SLOT_MIN;
          const hh = Math.floor(minutes / 60);
          const th = document.createElement('th');
          th.className = 'time-col hour';
          th.rowSpan = 2;
          th.textContent = fmtTime(hh, 0, this.hour12);
          tr.appendChild(th);
        }

        for (let day = 0; day < 7; day++) {
          const td = document.createElement('td');
          td.className = 'slot-cell';
          const epoch = (this.dayStart(day) + r * SLOT_SEC);
          td.dataset.epoch = String(epoch);
          td.addEventListener('mousedown', (e) => this.onMouseDown(e, epoch));
          td.addEventListener('mouseenter', (e) => this.onMouseEnter(e, epoch));
          td.addEventListener('mouseleave', () => this.hideTooltip());
          tr.appendChild(td);
        }
        tbody.appendChild(tr);
      }
      table.appendChild(tbody);

      this.applySelectionPaint();
      this.positionNow();
    }

    applySelectionPaint() {
      const table = this.querySelector('#grid-table');
      for (const td of table.querySelectorAll('td.slot-cell')) {
        const epoch = +td.dataset.epoch;
        td.style.setProperty('background-color', shade(this.slotSet.has(epoch)), 'important');
      }
    }

    applyZoom() {
      const base = 18;
      const px = clamp(Math.round(base * this.zoom), 10, 42);
      document.documentElement.style.setProperty('--row-height', `${px}px`);
      this.positionNow();
    }

    bindRecalc() {
      const content = this.querySelector('#grid-content');
      content?.addEventListener('scroll', () => this.positionNow());
      window.addEventListener('resize', () => this.positionNow());
      this._timer = setInterval(() => this.positionNow(), 30000);
    }

    positionNow() {
      const marker = this.querySelector('#now-marker');
      const nowSec = Math.floor(Date.now() / 1000);
      const { baseEpoch } = this.getWeekStart();
      const endSec = baseEpoch + 7*86400;

      if (nowSec < baseEpoch || nowSec >= endSec) {
        marker.style.display = 'none';
        return;
      }
      marker.style.display = 'block';

      const secondsIntoWeek = nowSec - baseEpoch;
      const dayIdx = Math.floor(secondsIntoWeek / 86400);
      const secondsIntoDay = secondsIntoWeek - dayIdx * 86400;
      const rowsIntoDay = secondsIntoDay / SLOT_SEC;

      const thead = this.querySelector('thead');
      const headerH = thead ? thead.offsetHeight : 0;
      const rowH = parseFloat(getComputedStyle(document.documentElement).getPropertyValue('--row-height')) || 18;
      marker.style.top = `${headerH + rowsIntoDay * rowH}px`;

      const firstCell = this.querySelector(`tbody tr:first-child td.slot-cell:nth-child(${dayIdx + 2})`);
      if (firstCell) {
        marker.style.left = `${firstCell.offsetLeft}px`;
        marker.style.width = `${firstCell.offsetWidth}px`;
      }
    }

    // ---- Interaction ----
    get mode() {
      const v = this.querySelector('input[name="mode"]:checked')?.value;
      return (v === 'remove') ? 'remove' : 'add';
    }

    onMouseDown(e, epoch) {
      if (!this.isAuthenticated) return this.showGate();
      this.dragging = (this.mode === 'remove') ? 'remove' : 'add';
      this.toggleSlot(epoch, this.dragging === 'add');
      this.applySelectionPaint();
      const up = () => { this.dragging = null; window.removeEventListener('mouseup', up); };
      window.addEventListener('mouseup', up);
    }

    onMouseEnter(e, epoch) {
      if (this.dragging) {
        this.toggleSlot(epoch, this.dragging === 'add');
        this.applySelectionPaint();
      }
      const tip = this.ensureTip();
      const end = epoch + SLOT_SEC;
      const s = new Intl.DateTimeFormat('en-GB', { timeZone: this.tz, hour: '2-digit', minute: '2-digit', hour12: this.hour12 }).format(new Date(epoch*1000));
      const e2 = new Intl.DateTimeFormat('en-GB', { timeZone: this.tz, hour: '2-digit', minute: '2-digit', hour12: this.hour12 }).format(new Date(end*1000));
      tip.textContent = `${s} – ${e2}`;
      tip.style.display = 'block';
      tip.style.left = (e.clientX + 12) + 'px';
      tip.style.top = (e.clientY + 14) + 'px';
    }
    hideTooltip() { const t = document.getElementById('cell-tooltip'); if (t) t.style.display = 'none'; }
    ensureTip() {
      let t = document.getElementById('cell-tooltip');
      if (!t) {
        t = document.createElement('div');
        t.id = 'cell-tooltip';
        t.className = 'tooltip';
        document.body.appendChild(t);
      }
      return t;
    }

    toggleSlot(epoch, on) { if (on) this.slotSet.add(epoch); else this.slotSet.delete(epoch); }

    // ---- Save / load ----
    getRange() {
      const { baseEpoch, baseYMD } = this.getWeekStart();
      const endYMD = ymdAddDays(baseYMD, 7);
      const endEpoch = epochFromZoned(endYMD.y, endYMD.m, endYMD.d, 0, 0, this.tz);
      return { from: baseEpoch, to: endEpoch };
    }

    async saveWeek() {
      if (!this.isAuthenticated) return this.showGate();
      const { from, to } = this.getRange();
      const intervals = [];
      const arr = Array.from(this.slotSet).sort((a,b)=>a-b);
      let i = 0;
      while (i < arr.length) {
        let s = arr[i], j = i + 1;
        while (j < arr.length && arr[j] === arr[j-1] + SLOT_SEC) j++;
        const e = arr[j-1] + SLOT_SEC;
        intervals.push({ from: Math.max(s, from), to: Math.min(e, to) });
        i = j;
      }
      try {
        const res = await fetch('/availability/save', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to, intervals })
        });
        if (!res.ok) throw new Error();
        this.flash('Saved ✓');
      } catch {
        this.flash('Failed to save', true);
      }
    }

    async loadWeek() {
      const { from, to } = this.getRange();
      try {
        const res = await fetch('/availability/get', {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ from, to })
        });
        if (!res.ok) throw new Error();
        const data = await res.json();
        this.slotSet.clear();
        for (const iv of (data.intervals || [])) {
          let t = Math.ceil(iv.from / SLOT_SEC) * SLOT_SEC;
          for (; t < iv.to; t += SLOT_SEC) this.slotSet.add(t);
        }
      } catch {
        this.slotSet.clear(); // not authed or nothing saved
      }
      this.applySelectionPaint();
    }

    // ---- Gating / UI ----
    showGate() {
      const gate = this.querySelector('#sign-in-gate');
      gate.style.display = 'block';
      gate.classList.add('visible');
      setTimeout(() => gate.classList.remove('visible'), 1600);
    }
    updateGating() {
      const gate = this.querySelector('#sign-in-gate');
      gate.style.display = this.isAuthenticated ? 'none' : 'block';
    }
    flash(msg, isErr) {
      let n = document.getElementById('toast');
      if (!n) {
        n = document.createElement('div');
        n.id = 'toast';
        n.className = 'toast';
        document.body.appendChild(n);
      }
      n.textContent = msg;
      n.classList.toggle('error', !!isErr);
      n.style.display = 'block';
      setTimeout(() => { n.style.display = 'none'; }, 1300);
    }
  }

  customElements.define('availability-grid', AvailabilityGrid);
})();
