/* Auth UI integration for new app: topbar button + lightweight modals.
   Requires: /scripts/login.js and /scripts/register.js from old app.
   Endpoints expected: /auth/check, /auth/login, /auth/register, /auth/logout.
*/
(function(){
  'use strict';

  // ========= Config / endpoints =========
  if (typeof window.API_BASE_URL !== 'string') window.API_BASE_URL = '';
  const API = window.API_BASE_URL || '';
  const ENDPOINTS = {
    check:    `${API}/auth/check`,
    login:    `${API}/auth/login`,
    register: `${API}/auth/register`,
    logout:   `${API}/auth/logout`,
  };

  // ========= Forms (HTML) =========
  function loginFormHTML(){
    return `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h2 style="font-size:18px;margin:0">Sign in</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>
      <form id="login-form" style="display:grid;gap:10px">
        <label>Username
          <input id="username" name="username" type="text" autocomplete="username" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
        </label>
        <label>Password
          <input id="password" name="password" type="password" autocomplete="current-password" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
        </label>
        <div id="error" style="min-height:18px;font-size:13px;color:#f55"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="open-register"
            style="height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:transparent;color:var(--fg-0,#e7eaf2);cursor:pointer">Register</button>
          <button type="submit"
            style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(46,160,67,0.5);background:rgba(46,160,67,0.2);color:#b7f4c0;cursor:pointer">Sign in</button>
        </div>
      </form>
    `;
  }

  function registerFormHTML(){
    return `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h2 style="font-size:18px;margin:0">Create account</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>
      <form id="register-form" style="display:grid;gap:10px">
        <label>Email
          <input id="email" name="email" type="email" autocomplete="email" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
        </label>
        <label>Username
          <input id="username" name="username" type="text" autocomplete="username" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
          <div id="username-warning" style="font-size:12px;color:#ffb3b3;min-height:16px"></div>
        </label>
        <label>Password
          <input id="password" name="password" type="password" autocomplete="new-password" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
          <div id="length-warning" style="font-size:12px;color:#ffb3b3;min-height:16px"></div>
          <div id="complexity-warning" style="font-size:12px;color:#ffb3b3;min-height:16px"></div>
        </label>
        <label>Confirm password
          <input id="confirm-password" name="confirm-password" type="password" autocomplete="new-password" required
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
          <div id="match-warning" style="font-size:12px;color:#ffb3b3;min-height:16px"></div>
        </label>
        <div id="error" style="min-height:18px;font-size:13px;color:#f55"></div>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="button" id="open-login"
            style="height:34px;padding:0 12px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:transparent;color:var(--fg-0,#e7eaf2);cursor:pointer">Have an account? Sign in</button>
          <button type="submit"
            style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(124,92,255,0.5);background:rgba(124,92,255,0.15);color:#e7eaf2;cursor:pointer">Create account</button>
        </div>
      </form>
    `;
  }

  function openLoginModal(){
    if (typeof window.openModal !== 'function') return;
    window.openModal(loginFormHTML());
    const r = document.getElementById('open-register');
    if (r) r.addEventListener('click', ()=> openRegisterModal());
    if (typeof window.initLoginForm === 'function') window.initLoginForm();
  }

  function openRegisterModal(){
    if (typeof window.openModal !== 'function') return;
    window.openModal(registerFormHTML());
    const l = document.getElementById('open-login');
    if (l) l.addEventListener('click', ()=> openLoginModal());
    if (typeof window.initRegisterForm === 'function') window.initRegisterForm();
  }

  // expose for modal.js swapper
  window.openLoginModal = openLoginModal;
  window.openRegisterModal = openRegisterModal;

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
      label.textContent = isAuthed ? ('logged in as ' + (username || '')) : 'not logged in';
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
