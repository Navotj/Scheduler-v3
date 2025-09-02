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

  const blockForm = document.getElementById('block-form');
  const blockTarget = document.getElementById('block-target');
  const blockStatus = document.getElementById('block-status');
  const blockBtn = document.getElementById('block-send');

  const unblockForm = document.getElementById('unblock-form');
  const unblockTarget = document.getElementById('unblock-target');
  const unblockStatus = document.getElementById('unblock-status');
  const unblockBtn = document.getElementById('unblock-send');

  const refreshBtn = document.getElementById('refresh');

  // ====== API helper ======
  const API_PREFIX = '/api';

  async function api(path, opts = {}) {
    const res = await fetch(API_PREFIX + path, {
      method: opts.method || 'GET',
      headers: { 'Content-Type': 'application/json', ...(opts.headers || {}) },
      body: opts.body ? JSON.stringify(opts.body) : undefined,
      credentials: 'include',
    });
    let data = null;
    try { data = await res.json(); } catch (_) { /* ignore */ }
    if (res.status === 401) {
      showInlineStatus(addStatus, 'Please sign in to manage friends.');
      throw new Error('unauthorized');
    }
    return data || { ok:false, error:'invalid' };
  }

  function text(t){ return document.createTextNode(String(t)) }
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k,v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') for (const [dk,dv] of Object.entries(v)) e.dataset[dk] = dv;
      else if (k.startsWith('on') && typeof v === 'function') e.addEventListener(k.slice(2), v);
      else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  }

  function showInlineStatus(node, msg){
    if (!node) return;
    node.textContent = msg || '';
  }

  function displayName(u){
    if (!u) return '';
    if (u.username && u.username.trim()) return u.username;
    return u.email || '(unknown)';
  }

  // basic input validation: email OR username(2-20, a-z0-9._-)
  const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  const USERNAME_RE = /^[a-zA-Z0-9._-]{3,20}$/;
  function validateTargetInput(value){
    const v = (value || '').trim();
    if (!v) return { ok:false, msg:'enter a valid email or username' };
    if (v.includes('@')) {
      if (!EMAIL_RE.test(v)) return { ok:false, msg:'enter a valid email' };
      return { ok:true, val:v };
    }
    if (!USERNAME_RE.test(v)) return { ok:false, msg:'enter a valid username (3–20 chars: letters, numbers, dot, underscore, dash)' };
    return { ok:true, val:v };
  }

  async function withDisabled(btn, fn){
    if (btn) btn.disabled = true;
    try { return await fn(); }
    finally { if (btn) btn.disabled = false; }
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
      const left = el('div',{class:'identity'},[
        el('span',{class:'name'},[text(displayName(u))]),
        el('span',{class:'meta'},[text(u.email)])
      ]);
      const accept = el('button',{class:'btn', type:'button', onClick:()=>acceptRequest(u.id)},[text('Accept')]);
      const decline = el('button',{class:'btn btn-lite', type:'button', onClick:()=>declineRequest(u.id)},[text('Decline')]);
      const right = el('div',{},[accept, decline]);
      li.append(left, right);
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
      const left = el('div',{class:'identity'},[
        el('span',{class:'name'},[text(displayName(u))]),
        el('span',{class:'meta'},[text(u.email)])
      ]);
      const note = el('span',{class:'muted small'},[text('Pending…')]);
      const right = el('div',{},[note]);
      li.append(left, right);
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
      const card = el('li',{class:'friend-card'});
      const who = el('div',{class:'identity'},[
        el('span',{class:'name'},[text(displayName(u))]),
        el('span',{class:'meta'},[text(u.email)])
      ]);
      const actions = el('div',{class:'friend-actions'},[
        el('button',{class:'btn btn-lite', type:'button', onClick:()=>removeFriend(u.id)},[text('Remove')]),
        el('button',{class:'btn btn-danger', type:'button', onClick:()=>blockUserId(u.id)},[text('Block')]),
      ]);
      card.append(who, actions);
      friendsList.append(card);
    }
  }

  // ====== Actions ======
  async function sendRequest(target){
    const out = await api('/friends/request', { method:'POST', body:{ target } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function acceptRequest(userId){
    const out = await api('/friends/accept', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function declineRequest(userId){
    const out = await api('/friends/decline', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function removeFriend(userId){
    const out = await api('/friends/remove', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function blockUserId(userId){
    const out = await api('/friends/block', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(blockStatus, msg);
    await refreshAll();
  }

  async function blockUserTarget(target){
    const out = await api('/friends/block', { method:'POST', body:{ target } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(blockStatus, msg);
    await refreshAll();
  }

  async function unblockUserTarget(target){
    const out = await api('/friends/unblock', { method:'POST', body:{ target } });
    const msg = normalizeMessage(out?.message);
    showInlineStatus(unblockStatus, msg);
    await refreshAll();
  }

  function normalizeMessage(m){
    switch ((m || '').toLowerCase()) {
      case 'cannot add yourself': return 'You cannot add yourself.';
      case 'cannot accept yourself': return 'You cannot accept yourself.';
      case 'cannot decline yourself': return 'You cannot decline yourself.';
      case 'cannot remove yourself': return 'You cannot remove yourself.';
      case 'cannot block yourself': return 'You cannot block yourself.';
      case 'cannot unblock yourself': return 'You cannot unblock yourself.';
      case 'user not found': return 'User not found.';
      case 'user is already in friend list': return 'Already in your friend list.';
      case 'already have pending request to user': return 'Already have a pending request to that user.';
      case 'friend added': return 'Friend added.';
      case 'request sent': return 'Request sent.';
      case 'declined': return 'Request declined.';
      case 'removed': return 'Friend removed.';
      case 'blocked': return 'User blocked.';
      case 'unblocked': return 'User unblocked.';
      default: return m || 'Done.';
    }
  }

  // ====== Loaders ======
  async function refreshAll(){
    const [friends, reqs] = await Promise.all([
      api('/friends/list').catch(()=>({friends:[]})),
      api('/friends/requests').catch(()=>({incoming:[], outgoing:[]})),
    ]);
    renderFriends(friends?.friends || []);
    renderIncoming(reqs?.incoming || []);
    renderOutgoing(reqs?.outgoing || []);
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

  refreshBtn.addEventListener('click', ()=>{ refreshAll(); });

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', refreshAll);
})();
