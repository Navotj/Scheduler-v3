(function () {
  'use strict';
  class SchedulerMembers extends HTMLElement {
    constructor(){ super(); this.members = []; this.username = null; }
    connectedCallback(){
      this.innerHTML = `
        <div class="panel">
          <h3>Members</h3>
          <div class="add-user">
            <input type="text" id="add-username" placeholder="Username" autocomplete="off" />
            <button id="add-user-btn" class="btn btn-primary">Add</button>
            <button id="add-me-btn" class="btn btn-primary">Add me</button>
          </div>
          <div id="member-error" class="error-text" aria-live="polite"></div>
          <ul id="member-list" class="member-list" aria-live="polite"></ul>
        </div>
      `;
      this.$ = (s)=>this.querySelector(s);
      this.$('#add-user-btn').addEventListener('click', ()=>this._addUser());
      this.$('#add-me-btn').addEventListener('click', ()=>this._addMe());
      // auth from shell
      this.closest('page-shell')?.addEventListener('authchange', (ev)=>{ this.username = ev.detail.username || null; });
    }
    get list(){ return this.members.slice(); }
    set list(v){ this.members = v.slice(); this._renderList(); }
    _emit(){ this.dispatchEvent(new CustomEvent('memberschange',{ bubbles:true, detail:{ members:this.list } })); }
    async _addUser(){
      const input = this.$('#add-username'); const name=(input.value||'').trim();
      if (!name || this.members.includes(name)) { input.value=''; return; }
      // optional: validate exists (you already had userExists; can be reinstated here)
      this.members.push(name); input.value=''; this._renderList(); this._emit();
    }
    _addMe(){
      if (!this.username) { this.$('#member-error').textContent='Please login first.'; return; }
      this.$('#member-error').textContent='';
      if (!this.members.includes(this.username)) this.members.push(this.username);
      this._renderList(); this._emit();
    }
    _remove(name){ this.members = this.members.filter(u=>u!==name); this._renderList(); this._emit(); }
    _renderList(){
      const ul=this.$('#member-list'); ul.innerHTML='';
      for (const name of this.members){
        const li=document.createElement('li');
        const txt=document.createElement('div'); txt.textContent=name;
        const btn=document.createElement('button'); btn.textContent='Remove'; btn.addEventListener('click', ()=>this._remove(name));
        li.appendChild(txt); li.appendChild(btn); ul.appendChild(li);
      }
    }
  }
  if (!customElements.get('scheduler-members')) customElements.define('scheduler-members', SchedulerMembers);
})();
