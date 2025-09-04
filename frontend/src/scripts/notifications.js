(function(){
  'use strict';

  const btn   = document.getElementById('notif-btn');
  const menu  = document.getElementById('notif-menu');
  const badge = document.getElementById('notif-badge');

  function setBadge(n){
    if (!badge) return;
    if (n > 0) {
      badge.textContent = String(n);
      badge.hidden = false;
    } else {
      badge.hidden = true;
    }
  }

  function closeMenu(){
    if (!menu || !btn) return;
    menu.style.display = 'none';
    btn.setAttribute('aria-expanded','false');
  }

  function openMenu(){
    if (!menu || !btn) return;
    menu.style.display = 'block';
    btn.setAttribute('aria-expanded','true');
  }

  function toggleMenu(){
    if (!menu) return;
    const isOpen = menu.style.display === 'block';
    if (isOpen) closeMenu(); else openMenu();
  }

  async function fetchRequests(){
    try{
      const r = await fetch('/api/friends/requests', { credentials:'include' });
      if (!r.ok) throw new Error('bad status');
      const json = await r.json();
      const incoming = Array.isArray(json?.incoming) ? json.incoming : [];
      renderMenu(incoming);
      setBadge(incoming.length);
    }catch(_){
      renderMenu([]);
      setBadge(0);
    }
  }

  function menuItem(username, userId){
    const li = document.createElement('div');
    li.setAttribute('role','menuitem');
    li.style.display = 'grid';
    li.style.gridTemplateColumns = '1fr auto auto';
    li.style.alignItems = 'center';
    li.style.gap = '6px';
    li.style.padding = '6px 8px';
    li.style.borderRadius = '8px';

    const label = document.createElement('div');
    label.textContent = username + ' sent a friend request';

    function mkBtn(text, title, kind){
      const b = document.createElement('button');
      b.type = 'button';
      b.title = title;
      b.textContent = text;
      b.style.height = '28px';
      b.style.minWidth = '28px';
      b.style.padding = '0 8px';
      b.style.borderRadius = '8px';
      b.style.border = '1px solid var(--border,#1a1c20)';
      b.style.background = kind === 'ok' ? '#1b6f3d' : '#6f1b1b';
      b.style.color = '#fff';
      b.style.cursor = 'pointer';
      return b;
    }

    const accept = mkBtn('✓','Accept','ok');
    const decline = mkBtn('✕','Decline','no');

    accept.addEventListener('click', async ()=>{
      accept.disabled = true;
      try{
        await fetch('/api/friends/accept', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ userId })
        });
      }finally{
        await fetchRequests();
      }
    });

    decline.addEventListener('click', async ()=>{
      decline.disabled = true;
      try{
        await fetch('/api/friends/decline', {
          method:'POST',
          headers:{'Content-Type':'application/json'},
          credentials:'include',
          body: JSON.stringify({ userId })
        });
      }finally{
        await fetchRequests();
      }
    });

    li.append(label, accept, decline);
    li.addEventListener('pointerenter', ()=>{ li.style.background='var(--bg-1,#0c0d10)'; });
    li.addEventListener('pointerleave', ()=>{ li.style.background='transparent'; });
    return li;
  }

  function renderMenu(incoming){
    if (!menu) return;
    menu.replaceChildren();
    if (!incoming.length){
      const empty = document.createElement('div');
      empty.className = 'muted small';
      empty.textContent = 'no new requests';
      empty.style.padding = '8px 10px';
      menu.append(empty);
      return;
    }
    for (const u of incoming){
      const username = (u && (u.username || u.name)) ? (u.username || u.name) : '(unknown)';
      const uid = u && (u.id || u._id);
      menu.append(menuItem(username, uid));
    }
  }

  function init(){
    if (!btn || !menu || !badge) return;
    btn.addEventListener('click', (e)=>{ e.stopPropagation(); toggleMenu(); });
    document.addEventListener('click', (e)=>{
      if (menu.style.display !== 'block') return;
      const root = document.getElementById('notif-root');
      if (root && root.contains(e.target)) return;
      closeMenu();
    });
    document.addEventListener('keydown', (e)=>{ if (e.key === 'Escape') closeMenu(); });

    fetchRequests();
    setInterval(fetchRequests, 30000);
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }
})();
