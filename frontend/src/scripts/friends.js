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

  const tabIncoming = document.getElementById('tab-incoming');
  const tabOutgoing = document.getElementById('tab-outgoing');

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
      try { data = await res.json(); } catch (_) {}
      if (res.ok) return data || { ok:true };
      return { ok:false, error: data?.error || 'bad_request', message: data?.message };
    } catch (err) {
      clearTimeout(t);
      return { ok:false, error: 'network' };
    }
  }

  function text(t){ return document.createTextNode(String(t)) }
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') e.className = v;
      else if (k === 'dataset') for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
      else if (k.toLowerCase().startsWith('on') && typeof v === 'function') {
        e.addEventListener(k.slice(2).toLowerCase(), v);
      } else e.setAttribute(k, v);
    }
    for (const c of children) e.append(c);
    return e;
  }

  function showInlineStatus(node, msg){
    if (node) node.textContent = msg || '';
  }

  function displayName(u){ return (u?.username || '').trim() || '(unknown)'; }

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
      const card = el('li',{class:'friend-card'});
      const name = el('div',{class:'identity'},[text(displayName(u))]);
      const removeBtn = el('button',{class:'icon-btn btn-remove',title:'Remove',onClick:()=>confirmRemove(u.id,u.username)},[text('✕')]);
      const blockBtn = el('button',{class:'icon-btn btn-block',title:'Block',onClick:()=>confirmBlock(u.id,u.username)},[text('🚫')]);
      card.append(name, removeBtn, blockBtn);
      friendsList.append(card);
    }
  }

  function renderBlocked(list){
    blockedList.replaceChildren();
    if (!list || list.length === 0){
      blockedList.append(el('li',{class:'muted small'},[text('No blocked users')]));
      return;
    }
    for (const u of list){
      const card = el('li',{class:'friend-card'});
      const name = el('div',{class:'identity'},[text(displayName(u))]);
      const unblockBtn = el('button',{class:'icon-btn btn-remove',title:'Unblock',onClick:()=>unblockUserTarget(u.username)},[text('✕')]);
      card.append(name, unblockBtn);
      blockedList.append(card);
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
  async function sendRequest(target){ await api('/friends/request',{method:'POST',body:{username:target}}); await refreshAll(); }
  async function acceptRequest(userId){ await api('/friends/accept',{method:'POST',body:{userId}}); await refreshAll(); }
  async function declineRequest(userId){ await api('/friends/decline',{method:'POST',body:{userId}}); await refreshAll(); }
  async function cancelOutgoing(userId){ await api('/friends/cancel',{method:'POST',body:{userId}}); await refreshAll(); }
  async function removeFriend(userId){ await api('/friends/remove',{method:'POST',body:{userId}}); await refreshAll(); }
  async function blockUserId(userId){ await api('/friends/block',{method:'POST',body:{userId}}); await refreshAll(); }
  async function blockUserTarget(target){ await api('/friends/block',{method:'POST',body:{username:target}}); await refreshAll(); }
  async function unblockUserTarget(target){ await api('/friends/unblock',{method:'POST',body:{username:target}}); await refreshAll(); }

  // ====== Loaders ======
  async function refreshAll(){
    const [friends, reqs, blocks] = await Promise.all([
      api('/friends/list').catch(()=>({friends:[]})),
      api('/friends/requests').catch(()=>({incoming:[], outgoing:[]})),
      api('/friends/blocklist').catch(()=>({blocked:[]})),
    ]);
    renderFriends(friends?.friends||[]);
    renderIncoming(reqs?.incoming||[]);
    renderOutgoing(reqs?.outgoing||[]);
    renderBlocked(blocks?.blocked||[]);
  }

  // ====== Events ======
  addForm.addEventListener('submit', e=>{
    e.preventDefault();
    const val = addTarget.value.trim();
    if (!val) return;
    addBtn.disabled=true;
    sendRequest(val).finally(()=>addBtn.disabled=false);
  });
  blockForm.addEventListener('submit', e=>{
    e.preventDefault();
    const val = blockTarget.value.trim();
    if (!val) return;
    blockBtn.disabled=true;
    blockUserTarget(val).finally(()=>blockBtn.disabled=false);
  });
  unblockForm.addEventListener('submit', e=>{
    e.preventDefault();
    const val = unblockTarget.value.trim();
    if (!val) return;
    unblockBtn.disabled=true;
    unblockUserTarget(val).finally(()=>unblockBtn.disabled=false);
  });

  tabIncoming.addEventListener('click',()=>{
    tabIncoming.classList.add('active'); tabIncoming.setAttribute('aria-selected','true');
    tabOutgoing.classList.remove('active'); tabOutgoing.setAttribute('aria-selected','false');
    incomingList.hidden=false; outgoingList.hidden=true;
  });
  tabOutgoing.addEventListener('click',()=>{
    tabOutgoing.classList.add('active'); tabOutgoing.setAttribute('aria-selected','true');
    tabIncoming.classList.remove('active'); tabIncoming.setAttribute('aria-selected','false');
    outgoingList.hidden=false; incomingList.hidden=true;
  });

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', refreshAll);
})();
