// components/sm-members.js
class SmMembers extends HTMLElement {
  connectedCallback() {
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
  }
}
customElements.define('sm-members', SmMembers);
