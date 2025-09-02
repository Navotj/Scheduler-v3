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
      try { data = await res.json(); } catch (_) { /* ignore parse errors */ }

      if (res.ok) {
        return data || { ok: true };
      }

      const error =
        res.status === 401 ? 'unauthorized' :
        res.status === 429 ? 'rate_limited' :
        (data && typeof data.error === 'string') ? data.error :
        (res.status >= 500 ? 'internal' : 'bad_request');

      return { ok: false, error, message: data && data.message };
    } catch (err) {
      clearTimeout(t);
      if (err && err.name === 'AbortError') return { ok: false, error: 'timeout' };
      return { ok: false, error: 'network' };
    }
  }

  function text(t){ return document.createTextNode(String(t)) }
  function el(tag, attrs = {}, children = []) {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs)) {
        if (k === 'class') {
        e.className = v;
        } else if (k === 'dataset') {
        for (const [dk, dv] of Object.entries(v)) e.dataset[dk] = dv;
        } else if (k.toLowerCase().startsWith('on') && typeof v === 'function') {
        const ev = k.slice(2).toLowerCase(); // normalize e.g. onClick -> 'click'
        e.addEventListener(ev, v);
        } else {
        e.setAttribute(k, v);
        }
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
        el('span',{class:'name'},[text(displayName(u))])
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
        el('span',{class:'name'},[text(displayName(u))])
      ]);
      const cancel = el('button',{class:'btn btn-warning', type:'button', onClick:()=>cancelOutgoing(u.id)},[text('Cancel')]);
      const right = el('div',{},[cancel]);
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
        el('span',{class:'name'},[text(displayName(u))])
      ]);
      const actions = el('div',{class:'friend-actions'},[
        el('button',{class:'btn btn-lite', type:'button', onClick:()=>removeFriend(u.id)},[text('Remove')]),
        el('button',{class:'btn btn-danger', type:'button', onClick:()=>blockUserId(u.id)},[text('Block')]),
      ]);
      card.append(who, actions);
      friendsList.append(card);
    }
  }

  // ====== Message mapping ======
  function normalizeMessage(resp){
    if (typeof resp === 'string') {
      return mapKnownMessage(resp) || (resp || 'Something went wrong.');
    }
    if (!resp || typeof resp !== 'object') return 'Something went wrong.';
    if (resp.ok) {
      return mapKnownMessage(resp.message) || resp.message || 'Done.';
    }
    switch ((resp.error || '').toLowerCase()) {
      case 'unauthorized': return 'Please sign in to manage friends.';
      case 'internal': return 'Internal error. Please try again.';
      case 'network': return 'Network error. Check your connection.';
      case 'timeout': return 'Request timed out. Try again.';
      case 'bad_request': return 'Invalid request.';
      case 'invalid': return 'Invalid response.';
      case 'rate_limited': return 'Too many requests. Slow down and try again.';
      default:
        if (resp.message) return mapKnownMessage(resp.message) || resp.message;
        return 'Something went wrong.';
    }
  }

  function mapKnownMessage(m){
    switch ((m || '').toLowerCase()) {
      case 'cannot add yourself': return 'You cannot add yourself.';
      case 'cannot accept yourself': return 'You cannot accept yourself.';
      case 'cannot decline yourself': return 'You cannot decline yourself.';
      case 'cannot remove yourself': return 'You cannot remove yourself.';
      case 'cannot block yourself': return 'You cannot block yourself.';
      case 'cannot unblock yourself': return 'You cannot unblock yourself.';
      case 'cannot cancel yourself': return 'You cannot cancel yourself.';
      case 'user not found': return 'User not found.';
      case 'user is already in friend list': return 'Already in your friend list.';
      case 'already have pending request to user': return 'Already have a pending request to that user.';
      case 'friend added': return 'Friend added.';
      case 'request sent': return 'Request sent.';
      case 'declined': return 'Request declined.';
      case 'removed': return 'Friend removed.';
      case 'blocked': return 'User blocked.';
      case 'unblocked': return 'User unblocked.';
      case 'cancelled': return 'Request canceled.';
      default: return null;
    }
  }

  // ====== Actions ======
  async function sendRequest(target){
    const out = await api('/friends/request', { method:'POST', body:{ username: target } });
    const msg = normalizeMessage(out);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function acceptRequest(userId){
    const out = await api('/friends/accept', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function declineRequest(userId){
    const out = await api('/friends/decline', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function cancelOutgoing(userId){
    const out = await api('/friends/cancel', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function removeFriend(userId){
    const out = await api('/friends/remove', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out);
    showInlineStatus(addStatus, msg);
    await refreshAll();
  }

  async function blockUserId(userId){
    const out = await api('/friends/block', { method:'POST', body:{ userId } });
    const msg = normalizeMessage(out);
    showInlineStatus(blockStatus, msg);
    await refreshAll();
  }

  async function blockUserTarget(target){
    const out = await api('/friends/block', { method:'POST', body:{ username: target } });
    const msg = normalizeMessage(out);
    showInlineStatus(blockStatus, msg);
    await refreshAll();
  }

  async function unblockUserTarget(target){
    const out = await api('/friends/unblock', { method:'POST', body:{ username: target } });
    const msg = normalizeMessage(out);
    showInlineStatus(unblockStatus, msg);
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
