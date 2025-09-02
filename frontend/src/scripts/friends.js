(function(){
  'use strict';

  // ====== DOM ======
  const addForm = document.getElementById('add-form');
  const addTarget = document.getElementById('add-target');
  const addStatus = document.getElementById('add-status');

  const incomingList = document.getElementById('incoming-list');
  const outgoingList = document.getElementById('outgoing-list');
  const friendsList  = document.getElementById('friends-list');

  const blockForm = document.getElementById('block-form');
  const blockTarget = document.getElementById('block-target');
  const blockStatus = document.getElementById('block-status');

  const unblockForm = document.getElementById('unblock-form');
  const unblockTarget = document.getElementById('unblock-target');
  const unblockStatus = document.getElementById('unblock-status');

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
    showInlineStatus(addStatus, out?.message || 'done');
    await refreshAll();
  }

  async function acceptRequest(userId){
    const out = await api('/friends/accept', { method:'POST', body:{ userId } });
    showInlineStatus(addStatus, out?.message || 'done');
    await refreshAll();
  }

  async function declineRequest(userId){
    const out = await api('/friends/decline', { method:'POST', body:{ userId } });
    showInlineStatus(addStatus, out?.message || 'done');
    await refreshAll();
  }

  async function removeFriend(userId){
    const out = await api('/friends/remove', { method:'POST', body:{ userId } });
    showInlineStatus(addStatus, out?.message || 'done');
    await refreshAll();
  }

  async function blockUserId(userId){
    const out = await api('/friends/block', { method:'POST', body:{ userId } });
    showInlineStatus(blockStatus, out?.message || 'done');
    await refreshAll();
  }

  async function blockUserTarget(target){
    const out = await api('/friends/block', { method:'POST', body:{ target } });
    showInlineStatus(blockStatus, out?.message || 'done');
    await refreshAll();
  }

  async function unblockUserTarget(target){
    const out = await api('/friends/unblock', { method:'POST', body:{ target } });
    showInlineStatus(unblockStatus, out?.message || 'done');
    await refreshAll();
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
    const target = addTarget.value.trim();
    if (!target) return;
    sendRequest(target);
  });

  blockForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const target = blockTarget.value.trim();
    if (!target) return;
    blockUserTarget(target);
  });

  unblockForm.addEventListener('submit', (e)=>{
    e.preventDefault();
    const target = unblockTarget.value.trim();
    if (!target) return;
    unblockUserTarget(target);
  });

  refreshBtn.addEventListener('click', ()=>{ refreshAll(); });

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', refreshAll);
})();
