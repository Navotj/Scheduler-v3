// components/sm-members-v2.js
class SmMembersV2 extends HTMLElement {
  connectedCallback() {
    this.innerHTML = `
      <div class="panel">
        <h3>Members</h3>
        <div class="row" style="gap:8px; margin-bottom:8px;">
          <input type="text" id="add-username" placeholder="Username" autocomplete="off" />
          <button id="add-user-btn" class="btn btn-primary">Add</button>
          <button id="add-me-btn" class="btn btn-primary">Add me</button>
        </div>
        <div id="member-error" class="muted" aria-live="polite"></div>
        <ul id="member-list" class="member-list" aria-live="polite"></ul>
      </div>
    `;
    if (window.scheduler?.initMembers) window.scheduler.initMembers();
  }
}
customElements.define('sm-members-v2', SmMembersV2);
