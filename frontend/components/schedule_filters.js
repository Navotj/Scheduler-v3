(function () {
  'use strict';
  class SchedulerFilters extends HTMLElement {
    connectedCallback(){
      this.innerHTML = `
        <div class="panel" id="filters-panel">
          <h3>Filters</h3>
          <div class="field-row">
            <div class="field">
              <label for="max-missing">Max missing</label>
              <input type="number" id="max-missing" min="0" value="0" />
            </div>
            <div class="field">
              <label for="min-hours">Min length</label>
              <div class="row">
                <input type="number" id="min-hours" min="0" step="0.5" value="1" />
                <span>h</span>
              </div>
            </div>
          </div>
          <div class="sort-row">
            <div class="field">
              <label for="sort-method">Sort</label>
              <select id="sort-method">
                <option value="earliest-week">Earliest in week</option>
                <option value="latest-week">Latest in week</option>
                <option value="earliest">Earliest start (day)</option>
                <option value="latest">Latest start (day)</option>
                <option value="longest">Longest duration</option>
                <option value="most" selected>Most participants</option>
              </select>
            </div>
          </div>
          <div class="legend">
            <div id="legend-blocks" class="legend-blocks" aria-label="Availability legend"></div>
          </div>
        </div>
      `;
      this.$=(s)=>this.querySelector(s);
      ['input','change'].forEach(ev=>{
        this.addEventListener(ev, ()=>{
          this.dispatchEvent(new CustomEvent('filterschange',{
            bubbles:true,
            detail:{
              maxMissing: parseInt(this.$('#max-missing').value||'0',10),
              minHours: parseFloat(this.$('#min-hours').value||'1'),
              sort: this.$('#sort-method').value
            }
          }));
        });
      });
    }
    get values(){
      return {
        maxMissing: parseInt(this.querySelector('#max-missing').value||'0',10),
        minHours: parseFloat(this.querySelector('#min-hours').value||'1'),
        sort: this.querySelector('#sort-method').value
      };
    }
    setLegendPainter(paint){ // grid passes a painter for legend chips
      const blocks=this.querySelector('#legend-blocks');
      blocks.innerHTML='';
      const n=paint.total;
      const chips=[];
      if (n>=11){ const threshold=Math.max(0,n-10); chips.push({raw:0,label:`≤${threshold}`}); for(let i=threshold+1;i<=n;i++) chips.push({raw:i,label:String(i)}); }
      else { for(let i=0;i<=n;i++) chips.push({raw:i,label:String(i)}); }
      const COLS=5;
      for (let i=0;i<chips.length;i+=COLS){
        const group=chips.slice(i,i+COLS);
        const steps=document.createElement('div'); steps.className='steps-row';
        const labels=document.createElement('div'); labels.className='labels-row';
        for (const item of group){
          const chip=document.createElement('div'); chip.className='chip slot-cell';
          chip.style.setProperty('background-color', paint.color(item.raw), 'important');
          steps.appendChild(chip);
          const lab=document.createElement('span'); lab.textContent=item.label; labels.appendChild(lab);
        }
        // spacers
        for (let f=group.length; f<COLS; f++){
          const s1=document.createElement('div'); s1.className='chip spacer'; steps.appendChild(s1);
          const s2=document.createElement('span'); s2.className='spacer'; labels.appendChild(s2);
        }
        blocks.appendChild(steps); blocks.appendChild(labels);
      }
    }
  }
  if (!customElements.get('scheduler-filters')) customElements.define('scheduler-filters', SchedulerFilters);
})();
