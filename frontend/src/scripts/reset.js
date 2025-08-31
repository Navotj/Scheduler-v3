(function(){
  'use strict';
  if (typeof window.API_BASE_URL !== 'string') window.API_BASE_URL = '';
  const API = window.API_BASE_URL || '';

  window.openResetModal = function(){
    if (!window.openModal) return;
    const html = `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h2 style="font-size:18px;margin:0">Reset password</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>
      <form id="reset-request-form" style="display:grid;gap:10px">
        <label>Email (or leave blank and use username)
          <input id="reset-email" type="email"
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
        </label>
        <label>Username
          <input id="reset-username" type="text" autocomplete="username"
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
        </label>
        <div id="reset-msg" style="min-height:18px;font-size:13px;color:#b6bfd4"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="submit"
            style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(124,92,255,0.5);background:rgba(124,92,255,0.15);color:#e7eaf2;cursor:pointer">Send link</button>
        </div>
      </form>
    `;
    window.openModal(html);
    const form = document.getElementById('reset-request-form');
    const msg = document.getElementById('reset-msg');
    form.addEventListener('submit', async (e)=>{
      e.preventDefault();
      const email = (document.getElementById('reset-email').value || '').trim();
      const username = (document.getElementById('reset-username').value || '').trim();
      msg.style.color = '#b6bfd4';
      msg.textContent = '';
      try {
        const res = await fetch(`${API}/auth/request-reset`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ email, username })
        });
        if (!res.ok) throw new Error('failed');
        msg.style.color = '#0f0';
        msg.textContent = 'If the account exists, a reset link has been sent.';
      } catch {
        msg.style.color = '#f55';
        msg.textContent = 'Could not send reset link.';
      }
    });
  };
})();
