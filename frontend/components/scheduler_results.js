(function () {
  'use strict';
  class SchedulerResults extends HTMLElement {
    connectedCallback(){
      this.innerHTML = `
        <div class="panel results-panel">
          <h3>Results</h3>
          <div id="results" class="results" aria-live="polite"></div>
        </div>
      `;
      this.$=(s)=>this.querySelector(s);
    }
    render(list, totals, formatRange, onHover){
      const el=this.$('#results'); el.innerHTML='';
      if (!list.length){ el.innerHTML='<div class="result"><div class="res-sub">No matching sessions. Adjust filters.</div></div>'; return; }
      for (const it of list){
        const wrap=document.createElement('div'); wrap.className='result';
        const top=document.createElement('div'); top.className='res-top'; top.textContent=formatRange(it.start, it.end);
        const sub=document.createElement('div'); sub.className='res-sub';
        sub.textContent=`${it.participants}/${totals} available • ${(it.duration/2).toFixed(1)}h`;
        const users=document.createElement('div'); users.className='res-users';
        users.textContent = `Users: ${it.users.join(', ')}`;
        const actions=document.createElement('div'); actions.className='result-actions';
        const btn=document.createElement('button'); btn.type='button'; btn.textContent='Copy Discord invitation';
        btn.addEventListener('click', async (e)=>{
          e.stopPropagation();
          const txt = this._discord(it, totals);
          try {
            if (navigator.clipboard && window.isSecureContext) { await navigator.clipboard.writeText(txt); btn.textContent='Copied'; setTimeout(()=>btn.textContent='Copy Discord invitation',1200); }
            else { const ta=document.createElement('textarea'); ta.value=txt; ta.style.position='fixed'; ta.style.left='-9999px'; document.body.appendChild(ta); ta.select(); document.execCommand('copy'); document.body.removeChild(ta); btn.textContent='Copied'; setTimeout(()=>btn.textContent='Copy Discord invitation',1200); }
          } catch { btn.textContent='Failed'; setTimeout(()=>btn.textContent='Copy Discord invitation',1200); }
        });
        actions.appendChild(btn);

        wrap.appendChild(top); wrap.appendChild(sub); wrap.appendChild(users); wrap.appendChild(actions);
        wrap.addEventListener('mouseenter', ()=>onHover(it,true));
        wrap.addEventListener('mouseleave', ()=>onHover(it,false));

        el.appendChild(wrap);
      }
    }
    _discord(item, total){
      const start=Math.floor(item.start), end=Math.floor(item.end);
      const users=item.users.slice().sort();
      const missing=item.allMembers.filter(m=>!item.users.includes(m)).sort();
      const playersLine = users.length ? `players: ${users.join(', ')}` : 'players: —';
      const missingLine = missing.length ? `missing: ${missing.join(', ')}` : 'missing: —';
      return `session at <t:${start}:F> until <t:${end}:t>
${playersLine}
${missingLine}
please confirm`;
    }
  }
  if (!customElements.get('scheduler-results')) customElements.define('scheduler-results', SchedulerResults);
})();
