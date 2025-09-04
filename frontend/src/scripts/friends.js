(function(){
  'use strict';

  // ====== DOM ======
  const addForm = document.getElementById('add-form');
  const addTarget = document.getElementById('add-target');
  const addStatus = document.getElementById('add-status');
  const addBtn = document.getElementById('add-send');

  const incomingList = document.getElementById('incoming-list');
  const outgoingList = document.getElementById('outgoing-list');
  const friendsList  = document.getElementById('friends-list');
  const blockedList  = document.getElementById('blocked-list');

  const blockForm = document.getElementById('block-form');
  const blockTarget = document.getElementById('block-target');
  const blockStatus = document.getElementById('block-status');
  const blockBtn = document.getElementById('block-send');

  const unblockForm = document.getElementById('unblock-form');
  const unblockTarget = document.getElementById('unblock-target');
  const unblockStatus = document.getElementById('unblock-status');
  const unblockBtn = document.getElementById('unblock-send');

  // ====== API helper ======
  const API_PREFIX = '/api';

  async function api(path, opts = {}) {
    const controller = new AbortController();
    const timeoutMs = typeof opts.timeout === 'number' ? opts.timeout : 15000;
    const t = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(API_PREFIX + path, {
        method: opts.method || 'GET',
        headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        credentials: 'include',
        signal: controller.signal,
      });
      clearTimeout(t);
      let data = null;
      try { data = await res.json(); } catch(_) {}
      if (res.ok) return data || { ok:true };
      const error = data && typeof data.error === 'string' ? data.error : (res.status >= 500 ? 'internal' : 'bad_request');
      return { ok:false, error, message: data && data.message };
    } catch (err) {
      clearTimeout(t);
      return { ok:false, error:'network' };
    }
  }

  function text(t){ return document.createTextNode(String(t)) }
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
      else if (k.toLowerCase().startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2).toLowerCase(), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  }

  function showInlineStatus(node, msg){ if (node) node.textContent = msg || ''; }

  function displayName(u){
    if (!u) return '';
    return (u.username && u.username.trim()) ? u.username : '(unknown)';
  }

  // username-only validation (3–20 chars; letters, numbers, dot, underscore, dash)
  const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;
  function validateTargetInput(value){
    const v = (value || '').trim();
    if (!v) return { ok:false, msg:'enter a username' };
    if (v.includes('@')) return { ok:false, msg:'emails are not allowed here' };
    if (!USERNAME_RE.test(v)) return { ok:false, msg:'username must be 3–20 chars (a–z, 0–9, . _ -)' };
    return { ok:true, val:v };
  }

  async function withDisabled(btn, fn){
    if (btn) btn.disabled = true;
    try { return await fn(); }
    finally { if (btn) btn.disabled = false; }
  }

  // outline-only icons
  function svgX() {
    const s = '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 6 L18 18 M18 6 L6 18"/></svg>';
    const span = document.createElement('span'); span.innerHTML = s;
    return span.firstChild;
  }
  function svgNoEntryOutline() {
    const s = '<svg viewBox="0 0 24 24" aria-hidden="true"><circle cx="12" cy="12" r="9"/><path d="M7 12h10"/></svg>';
    const span = document.createElement('span'); span.innerHTML = s;
    return span.firstChild;
  }

  // ====== Renderers ======
  function renderIncoming(list){
    incomingList.replaceChildren();
    if (!list || list.length === 0) {
      incomingList.append(el('li',{class:'muted small'},[text('No incoming requests')]));
      return;
    }
    for (const u of list){
      const li = el('li',{class:'list-item'});
      const name = el('span',{class:'name'},[text(displayName(u))]);
      const accept = el('button',{class:'btn',type:'button',onClick:()=>acceptRequest(u.id)},[text('✓')]);
      const decline = el('button',{class:'btn btn-lite',type:'button',onClick:()=>declineRequest(u.id)},[text('✕')]);
      li.append(name, accept, decline);
      incomingList.append(li);
    }
  }

  function renderOutgoing(list){
    outgoingList.replaceChildren();
    if (!list || list.length === 0) {
      outgoingList.append(el('li',{class:'muted small'},[text('No outgoing requests')]));
      return;
    }
    for (const u of list){
      const li = el('li',{class:'list-item'});
      const name = el('span',{class:'name'},[text(displayName(u))]);
      const cancel = el('button',{class:'btn btn-warning',type:'button',onClick:()=>cancelOutgoing(u.id)},[text('✕')]);
      li.append(name, cancel);
      outgoingList.append(li);
    }
  }

  function renderFriends(list){
    friendsList.replaceChildren();
    if (!list || list.length === 0){
      friendsList.append(el('li',{class:'muted small'},[text('No friends yet')]));
      return;
    }
    for (const u of list){
      const cell = el('li',{class:'friend-cell'});
      const name = el('div',{class:'identity'},[text(displayName(u))]);

      const removeBtn = el('button',{class:'icon-btn btn-remove',title:'Remove',type:'button',onClick:()=>confirmRemove(u.id,u.username)});
      removeBtn.append(svgX());

      const blockBtn  = el('button',{class:'icon-btn btn-block', title:'Block', type:'button',onClick:()=>confirmBlock(u.id,u.username)});
      blockBtn.append(svgNoEntryOutline());

      cell.append(name, removeBtn, blockBtn);
      friendsList.append(cell);
    }
  }

  function renderBlocked(list){
    blockedList.replaceChildren();
    if (!list || list.length === 0){
      blockedList.append(el('li',{class:'muted small'},[text('No blocked users')]));
      return;
    }
    for (const u of list){
      const cell = el('li',{class:'friend-cell'});
      const name = el('div',{class:'identity'},[text(displayName(u))]);
      const unblockBtn = el('button',{class:'icon-btn btn-remove',title:'Unblock',type:'button',onClick:()=>unblockUserTarget(u.username)});
      unblockBtn.append(svgX());
      cell.append(name, unblockBtn);
      blockedList.append(cell);
    }
  }

  // ====== Confirm wrappers ======
  function confirmRemove(id, username){
    if (window.confirm(`Remove user ${username}?`)) removeFriend(id);
  }
  function confirmBlock(id, username){
    if (window.confirm(`Block user ${username}?`)) blockUserId(id);
  }

  // ====== Actions ======
  async function sendRequest(target){
    const out = await api('/friends/request', { method:'POST', body:{ username: target } });
    showInlineStatus(addStatus, (out && out.message) || 'Request sent.');
    await refreshAll();
  }
  async function acceptRequest(userId){ await api('/friends/accept', { method:'POST', body:{ userId } }); await refreshAll(); }
  async function declineRequest(userId){ await api('/friends/decline', { method:'POST', body:{ userId } }); await refreshAll(); }
  async function cancelOutgoing(userId){ await api('/friends/cancel', { method:'POST', body:{ userId } }); await refreshAll(); }
  async function removeFriend(userId){ await api('/friends/remove', { method:'POST', body:{ userId } }); await refreshAll(); }
  async function blockUserId(userId){ const r=await api('/friends/block', { method:'POST', body:{ userId } }); showInlineStatus(blockStatus, r && r.message || 'User blocked.'); await refreshAll(); }
  async function blockUserTarget(target){ const r=await api('/friends/block', { method:'POST', body:{ username: target } }); showInlineStatus(blockStatus, r && r.message || 'User blocked.'); await refreshAll(); }
  async function unblockUserTarget(target){ const r=await api('/friends/unblock', { method:'POST', body:{ username: target } }); showInlineStatus(unblockStatus, r && r.message || 'User unblocked.'); await refreshAll(); }

  // ====== Loaders ======
  async function refreshAll(){
    const [friends, reqs, blocks] = await Promise.all([
      api('/friends/list').catch(()=>({friends:[]})),
      api('/friends/requests').catch(()=>({incoming:[], outgoing:[]})),
      api('/friends/blocklist').catch(()=>({blocked:[]})),
    ]);
    renderFriends(friends?.friends || []);
    renderIncoming(reqs?.incoming || []);
    renderOutgoing(reqs?.outgoing || []);
    renderBlocked(blocks?.blocked || []);
  }

  // ====== Events ======
  addForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = validateTargetInput(addTarget.value);
    if (!v.ok) { showInlineStatus(addStatus, v.msg); return; }
    withDisabled(addBtn, () => sendRequest(v.val));
  });

  blockForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = validateTargetInput(blockTarget.value);
    if (!v.ok) { showInlineStatus(blockStatus, v.msg); return; }
    withDisabled(blockBtn, () => blockUserTarget(v.val));
  });

  unblockForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const v = validateTargetInput(unblockTarget.value);
    if (!v.ok) { showInlineStatus(unblockStatus, v.msg); return; }
    withDisabled(unblockBtn, () => unblockUserTarget(v.val));
  });

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', refreshAll);
})();
