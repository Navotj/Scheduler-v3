// sm_members.js
export function create_sm_members_panel() {
  const panel = document.createElement('div');
  panel.className = 'panel';

  const h3 = document.createElement('h3');
  h3.textContent = 'members';

  const addWrap = document.createElement('div');
  addWrap.className = 'add-user';

  const input = document.createElement('input');
  input.type = 'text';
  input.id = 'add-username';
  input.placeholder = 'username';
  input.autocomplete = 'off';

  const addBtn = document.createElement('button');
  addBtn.id = 'add-user-btn';
  addBtn.className = 'btn btn-primary';
  addBtn.textContent = 'add';

  const addMeBtn = document.createElement('button');
  addMeBtn.id = 'add-me-btn';
  addMeBtn.className = 'btn btn-primary';
  addMeBtn.textContent = 'add me';

  addWrap.append(input, addBtn, addMeBtn);

  const err = document.createElement('div');
  err.id = 'member-error';
  err.className = 'error-text';
  err.setAttribute('aria-live', 'polite');

  const list = document.createElement('ul');
  list.id = 'member-list';
  list.className = 'member-list';
  list.setAttribute('aria-live', 'polite');

  panel.append(h3, addWrap, err, list);
  return panel;
}
