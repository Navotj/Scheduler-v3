(function(){
  'use strict';

  const API = (window.API_BASE_URL || '/api').replace(/\/$/, '');

  function usernameFormHTML(){
    return `
      <header style="display:flex;align-items:center;justify-content:space-between;margin-bottom:10px">
        <h2 style="font-size:18px;margin:0">Choose a username</h2>
        <button type="button" onclick="closeModal()" aria-label="Close" title="Close"
          style="background:transparent;border:0;color:var(--fg-0,#e7eaf2);font-size:20px;line-height:1;cursor:pointer">×</button>
      </header>
      <form id="username-form" style="display:grid;gap:10px">
        <label>Username (3–20: letters, numbers, _)
          <input id="username" name="username" type="text" autocomplete="username" required
            pattern="^[A-Za-z0-9_]{3,24}$"
            style="width:100%;height:36px;border-radius:8px;border:1px solid var(--border,#1a1c20);background:var(--bg-1,#0c0d10);color:var(--fg-0,#e7eaf2);padding:0 10px"/>
          <div id="username-msg" style="font-size:12px;min-height:16px;color:#b6bfd4"></div>
        </label>
        <div style="display:flex;gap:8px;justify-content:flex-end">
          <button type="submit"
            style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(124,92,255,0.5);background:rgba(124,92,255,0.15);color:#e7eaf2;cursor:pointer">Save</button>
        </div>
      </form>
    `;
  }

  function updateQueryRemoveNeeds() {
    try {
      const u = new URL(window.location.href);
      if (u.searchParams.has('needsUsername')) {
        u.searchParams.delete('needsUsername');
        window.history.replaceState({}, '', u.pathname + (u.search || '') + (u.hash || ''));
      }
    } catch { /* no-op */ }
  }

  window.openUsernameModal = function openUsernameModal(){
    if (typeof window.openModal !== 'function') return;
    window.openModal(usernameFormHTML());

    const form = document.getElementById('username-form');
    const msg = document.getElementById('username-msg');
    const input = document.getElementById('username');

    if (!form) return;

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const desired = (input.value || '').trim();
      if (!/^[A-Za-z0-9_]{3,24}$/.test(desired)) {
        msg.style.color = '#f55';
        msg.textContent = 'Invalid username format.';
        return;
      }

      msg.style.color = '#b6bfd4';
      msg.textContent = 'Saving...';

      try {
        const res = await fetch(`${API}/auth/username`, {
          method: 'POST',
          headers: { 'Content-Type':'application/json' },
          credentials: 'include',
          cache: 'no-store',
          body: JSON.stringify({ username: desired })
        });
        const data = await res.json().catch(() => ({}));
        if (!res.ok) {
          const code = data && data.error;
          msg.style.color = '#f55';
          msg.textContent = code === 'username_taken'
            ? 'Username is taken.'
            : code === 'username_already_set'
              ? 'Username already set.'
              : 'Could not save username.';
          return;
        }

        // Success
        msg.style.color = '#0f0';
        msg.textContent = 'Saved!';
        if (typeof window.setAuthState === 'function') {
          window.setAuthState(true, desired);
        }
        updateQueryRemoveNeeds();
        setTimeout(() => { if (window.closeModal) window.closeModal(); }, 300);
      } catch {
        msg.style.color = '#f55';
        msg.textContent = 'Network error.';
      }
    });
  };
})();
