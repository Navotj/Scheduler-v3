/* Auth UI (OAuth-only): topbar button + provider modal + username prompt hook.
   Endpoints expected:
   - GET  /api/auth/check
   - POST /api/auth/logout
   - GET  /api/auth/oauth/{google|github|discord}/start?returnTo=...
   - POST /api/auth/username   (handled by scripts/username.js)
*/
(function(){
  'use strict';

  const API = (window.API_BASE_URL || '/api').replace(/\/$/, '');
  const ENDPOINTS = {
    check:  `${API}/auth/check`,
    logout: `${API}/auth/logout`
  };

  // ========= Provider modal =========
  function loginProvidersHTML(){
    return `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h2 style="font-size:18px;margin:0">Sign in</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>

      <div style="display:grid;gap:10px">
        <button type="button" id="btn-google"
          style="height:38px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:rgba(255,255,255,0.04);color:var(--fg-0,#e7eaf2);cursor:pointer">
          Continue with Google
        </button>
        <button type="button" id="btn-github"
          style="height:38px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:rgba(255,255,255,0.04);color:var(--fg-0,#e7eaf2);cursor:pointer">
          Continue with GitHub
        </button>
        <button type="button" id="btn-discord"
          style="height:38px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:rgba(255,255,255,0.04);color:var(--fg-0,#e7eaf2);cursor:pointer">
          Continue with Discord
        </button>

        <div style="display:flex;justify-content:space-between;align-items:center;margin-top:2px">
          <span id="auth-error" style="min-height:18px;font-size:13px;color:#f55"></span>
          <button type="button" id="btn-guest"
            style="height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:transparent;color:var(--fg-0,#e7eaf2);cursor:pointer">
            Continue without signing in
          </button>
        </div>
      </div>
    `;
  }

  function openLoginModal(){
    if (typeof window.openModal !== 'function') return;
    window.openModal(loginProvidersHTML());

    const g = document.getElementById('btn-google');
    const gh = document.getElementById('btn-github');
    const d = document.getElementById('btn-discord');
    const guest = document.getElementById('btn-guest');

    if (g) g.addEventListener('click', () => window.oauthStart && window.oauthStart('google'));
    if (gh) gh.addEventListener('click', () => window.oauthStart && window.oauthStart('github'));
    if (d) d.addEventListener('click', () => window.oauthStart && window.oauthStart('discord'));
    if (guest) guest.addEventListener('click', () => { if (window.closeModal) window.closeModal(); });
  }

  // expose for modal.js swapper
  window.openLoginModal = openLoginModal;

  // ========= Topbar auth button state =========
  function toggleIcons(isAuthed){
    const btn = document.getElementById('auth-btn');
    const scope = (btn && btn.closest('.topbar')) || document;
    const logins  = scope.querySelectorAll('[data-icon="login"]');
    const logouts = scope.querySelectorAll('[data-icon="logout"]');
    logins.forEach(el => { el.hidden  = !!isAuthed; });
    logouts.forEach(el => { el.hidden = !isAuthed; });
  }

  function setAuthState(isAuthed, username){
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    btn.dataset.state = isAuthed ? 'authenticated' : 'anonymous';
    toggleIcons(!!isAuthed);

    btn.classList.toggle('navbtn--login', !isAuthed);
    btn.classList.toggle('navbtn--logout', !!isAuthed);
    btn.setAttribute('aria-label', isAuthed ? 'Sign out' : 'Sign in');
    btn.setAttribute('title',      isAuthed ? 'Sign out' : 'Sign in');

    const label = document.getElementById('auth-label');
    if (label) {
      label.textContent = isAuthed
        ? ('logged in' + (username ? (' as ' + username) : ''))
        : 'not logged in';
    }
  }
  window.setAuthState = setAuthState;

  async function doLogout(){
    try {
      const res = await fetch(ENDPOINTS.logout, {
        method:'POST',
        credentials:'include',
        cache:'no-store',
        headers:{ 'Content-Type':'application/json' }
      });
      if (!res.ok) {
        const res2 = await fetch(ENDPOINTS.logout, { credentials:'include', cache:'no-store' });
        if (!res2.ok) throw new Error('logout failed');
      }
    } catch(_e) {
      // no-op
    } finally {
      setAuthState(false, null);
    }
  }

  function wireButton(){
    const btn = document.getElementById('auth-btn');
    if (!btn) return;
    btn.addEventListener('click', ()=>{
      const authed = btn.dataset.state === 'authenticated';
      if (authed) doLogout();
      else openLoginModal();
    });
  }

  if (document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', wireButton, { once:true });
  } else {
    wireButton();
  }
})();
