(function(){
  'use strict';

  const API = (window.API_BASE_URL || '/api').replace(/\/$/, '');
  const MAX_SUGGESTIONS = 8;

  // ===== styles =====
  (function injectStyles() {
    if (document.getElementById('ua-style')) return;
    const css = `
      .ua-menu{
        position:absolute;z-index:99999;max-height:280px;overflow:auto;
        background:var(--bg-1,#0e1117);border:1px solid var(--border,#1a1c20);
        border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);padding:6px;
        display:none;cursor:default
      }
      .ua-menu[data-open="1"]{display:block}

      /* suggestion rows */
      .ua-option{
        display:block;width:100%;box-sizing:border-box;
        padding:8px 14px;border-radius:8px;
        cursor:default;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;
        font-size:14px;line-height:1.2
      }
      .ua-option:hover{background:var(--card,#141820)}
      .ua-option[aria-selected="true"]{outline:1px solid var(--ring,#3a78ff);background:var(--card,#141820)}
      .ua-empty{padding:8px 14px;color:var(--fg-2,#8b95ae);font-size:13px}

      /* STICKY SELECTED (vertical, full width) */
      .ua-sticky-wrap{display:block;margin:2px 2px 6px 2px}
      .ua-chip{
        display:flex;align-items:center;gap:10px;
        width:100%;box-sizing:border-box;
        background:#164a2e;color:#d2f8e1;border:1px solid #2e7d32;border-radius:8px;
        padding:8px 12px;margin:0 0 6px 0;
        font-size:13px;line-height:1;user-select:none;cursor:default
      }
      .ua-chip-label{
        flex:1 1 auto;min-width:0; /* allows proper ellipsis */
        overflow:hidden;text-overflow:ellipsis;white-space:nowrap;
      }
      .ua-chip-x{
        flex:0 0 auto;margin-left:auto;
        font-size:16px;line-height:1;color:#d2f8e1;cursor:pointer
      }
      .ua-divider{height:1px;background:var(--border,#1a1c20);margin:4px 0}
    `;
    const style = document.createElement('style');
    style.id = 'ua-style';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ===== username modal (unchanged) =====
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
    } catch {}
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

  // ===== dropdown autocomplete =====
  let uaInput = null;
  let uaMenu = null;
  let uaMenuOpen = false;
  let uaActiveIndex = -1;
  let uaAllFriends = [];
  let uaFiltered = [];
  let uaRepositionRAF = 0;

  function uaNorm(s) { return (s || '').toLowerCase(); }
  function uaIsClickInsideMenu(t) { return uaMenu && (t === uaMenu || uaMenu.contains(t)); }
  function uaIsVisible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }

  async function uaFetchFriends() {
    try {
      const res = await fetch(`${API}/friends/list`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      const names = (data && Array.isArray(data.friends) ? data.friends : [])
        .map(f => f && f.username)
        .filter(Boolean);
      const uniq = Array.from(new Set(names));
      uniq.sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'accent' }));
      return uniq;
    } catch {
      return [];
    }
  }

  function uaEnsureMenu() {
    if (uaMenu) return;
    uaMenu = document.createElement('div');
    uaMenu.className = 'ua-menu';
    uaMenu.setAttribute('role', 'listbox');
    uaMenu.setAttribute('aria-label', 'Friend suggestions');
    document.body.appendChild(uaMenu);
  }

  function uaOpenMenu() {
    if (uaMenuOpen || !uaInput) return;
    uaEnsureMenu();
    uaMenuOpen = true;
    uaMenu.dataset.open = '1';
    uaInput.setAttribute('aria-expanded', 'true');
    uaActiveIndex = -1;
    uaUpdateSuggestions();
    uaPositionMenu();
    window.addEventListener('resize', uaOnWindowChange, { passive: true });
    window.addEventListener('scroll', uaOnWindowChange, { passive: true, capture: true });
    document.addEventListener('click', uaOnDocClick, true);
  }

  function uaCloseMenu() {
    if (!uaMenuOpen) return;
    uaMenuOpen = false;
    if (uaMenu) {
      delete uaMenu.dataset.open;
      uaMenu.style.display = 'none';
    }
    if (uaInput) uaInput.setAttribute('aria-expanded', 'false');
    uaActiveIndex = -1;
    window.removeEventListener('resize', uaOnWindowChange, { passive: true });
    window.removeEventListener('scroll', uaOnWindowChange, { passive: true, capture: true });
    document.removeEventListener('click', uaOnDocClick, true);
  }

  function uaPositionMenu() {
    if (!uaMenuOpen || !uaMenu || !uaInput || !uaIsVisible(uaInput)) return;
    uaMenu.style.display = 'block';
    const r = uaInput.getBoundingClientRect();
    const mh = Math.min(uaMenu.scrollHeight, 280);
    const gap = 6;
    const top = window.scrollY + r.top - gap - mh; // above the input
    const left = window.scrollX + r.left;
    uaMenu.style.top = `${Math.max(4, top)}px`;
    uaMenu.style.left = `${left}px`;

    // Conform to the input width exactly (prevents odd padding/overflow mismatches)
    uaMenu.style.width = `${r.width}px`;
    uaMenu.style.maxWidth = `${r.width}px`;
    uaMenu.style.minWidth = `${r.width}px`;
    uaMenu.style.maxHeight = '280px';
  }

  function uaOnWindowChange() {
    if (!uaMenuOpen) return;
    cancelAnimationFrame(uaRepositionRAF);
    uaRepositionRAF = requestAnimationFrame(uaPositionMenu);
  }

  function uaOnDocClick(e) {
    if (!uaMenuOpen) return;
    if (e.target === uaInput || uaIsClickInsideMenu(e.target)) return;
    uaCloseMenu();
  }

  function uaBuildOption(name, idx) {
    const opt = document.createElement('div');
    opt.className = 'ua-option';
    opt.setAttribute('role', 'option');
    opt.setAttribute('data-index', String(idx));
    opt.setAttribute('title', name);
    opt.textContent = name;
    opt.addEventListener('mouseenter', () => uaSetActiveIndex(idx, true));
    opt.addEventListener('mousedown', (ev) => { ev.preventDefault(); });
    opt.addEventListener('click', () => { uaCommitSelection(idx); });
    return opt;
  }

  // Pull the selected members from scheduler (preferred) or the visible text list.
  function getSelectedMembers() {
    try {
      if (window.scheduler && typeof window.scheduler.getMembers === 'function') {
        const arr = window.scheduler.getMembers() || [];
        return Array.isArray(arr) ? arr.slice() : [];
      }
    } catch {}
    try {
      const el =
        document.getElementById('members') ||
        document.getElementById('members-list') ||
        document.getElementById('member-list');
      if (!el) return [];
      const txt = (el.textContent || '').trim();
      if (!txt) return [];
      return txt.split(',').map(s => s.trim()).filter(Boolean);
    } catch { return []; }
  }

  function uaRenderStickyChips(container) {
    const selected = getSelectedMembers();
    if (!selected.length) return;

    const wrap = document.createElement('div');
    wrap.className = 'ua-sticky-wrap';

    for (const uname of selected) {
      const chip = document.createElement('div');
      chip.className = 'ua-chip';

      const label = document.createElement('span');
      label.className = 'ua-chip-label';
      label.textContent = uname;
      label.title = uname;

      const close = document.createElement('span');
      close.className = 'ua-chip-x';
      close.textContent = '×';
      close.title = 'Remove from selected';
      close.addEventListener('mousedown', (e) => e.preventDefault());
      close.addEventListener('click', () => {
        try {
          if (window.scheduler && typeof window.scheduler.removeMember === 'function') {
            window.scheduler.removeMember(uname);
          }
        } catch {}
        uaUpdateSuggestions();
      });

      chip.appendChild(label);
      chip.appendChild(close);
      wrap.appendChild(chip);
    }

    container.appendChild(wrap);
    const divider = document.createElement('div');
    divider.className = 'ua-divider';
    container.appendChild(divider);
  }

  function uaRenderMenu() {
    if (!uaMenu) return;
    uaMenu.innerHTML = '';

    // Sticky selected members (vertical, full width)
    uaRenderStickyChips(uaMenu);

    if (uaFiltered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ua-empty';
      empty.textContent = 'No matches';
      uaMenu.appendChild(empty);
    } else {
      uaFiltered.forEach((name, i) => uaMenu.appendChild(uaBuildOption(name, i)));
    }
    uaApplyActive();
    uaPositionMenu();
  }

  function uaSetActiveIndex(idx, ensure = false) {
    if (uaFiltered.length === 0) { uaActiveIndex = -1; uaApplyActive(); return; }
    const max = uaFiltered.length - 1;
    if (idx < 0) idx = max;
    if (idx > max) idx = 0;
    uaActiveIndex = idx;
    uaApplyActive(ensure);
  }

  function uaApplyActive(ensure = false) {
    if (!uaMenu) return;
    const kids = uaMenu.querySelectorAll('.ua-option');
    kids.forEach((el, i) => {
      if (i === uaActiveIndex) {
        el.setAttribute('aria-selected', 'true');
        if (ensure) el.scrollIntoView({ block: 'nearest' });
      } else {
        el.removeAttribute('aria-selected');
      }
    });
  }

  function uaCommitSelection(idx) {
    if (idx < 0 || idx >= uaFiltered.length) return;
    const name = uaFiltered[idx];
    uaInput.value = name;
    uaCloseMenu();

    // Prefer triggering the existing add logic
    const btn = document.getElementById('add-user-btn');
    if (btn) {
      try { btn.click(); } catch {}
    }
  }

  function uaComputeFiltered(query) {
    const q = uaNorm(query);
    const selectedSet = new Set(getSelectedMembers().map(uaNorm));
    const available = uaAllFriends.filter(n => !selectedSet.has(uaNorm(n)));

    if (!q) return available.slice(0, MAX_SUGGESTIONS);
    const prefix = available.filter(n => uaNorm(n).startsWith(q));
    if (prefix.length >= MAX_SUGGESTIONS) return prefix.slice(0, MAX_SUGGESTIONS);
    const infix = available.filter(n => !uaNorm(n).startsWith(q) && uaNorm(n).includes(q));
    return prefix.concat(infix).slice(0, MAX_SUGGESTIONS);
  }

  function uaUpdateSuggestions() {
    uaFiltered = uaComputeFiltered(uaInput.value);
    uaRenderMenu();
  }

  function uaOnKeyDown(e) {
    if (!uaMenuOpen) {
      if (e.key === 'ArrowDown') {
        uaOpenMenu();
        e.preventDefault();
        uaSetActiveIndex(0, true);
      }
      return;
    }
    switch (e.key) {
      case 'Tab': {
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        uaSetActiveIndex((uaActiveIndex === -1 ? -1 : uaActiveIndex) + dir, true);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        uaSetActiveIndex((uaActiveIndex === -1 ? 0 : uaActiveIndex + 1), true);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        uaSetActiveIndex((uaActiveIndex === -1 ? 0 : uaActiveIndex - 1), true);
        break;
      }
      case 'Enter': {
        if (uaActiveIndex >= 0) {
          e.preventDefault();
          uaCommitSelection(uaActiveIndex);
        }
        break;
      }
      case 'Escape': {
        e.preventDefault();
        uaCloseMenu();
        break;
      }
      default:
        break;
    }
  }

  function uaOnInput() {
    if (!uaMenuOpen) uaOpenMenu();
    uaUpdateSuggestions();
  }

  function uaOnFocus() {
    (async () => {
      if (uaAllFriends.length === 0) {
        uaAllFriends = await uaFetchFriends();
      }
      uaOpenMenu();
    })();
  }

  function uaOnBlur() {
    setTimeout(() => {
      if (!uaMenuOpen) return;
      const active = document.activeElement;
      if (active === uaInput || uaIsClickInsideMenu(active)) return;
      uaCloseMenu();
    }, 0);
  }

  function initUsernameAutocomplete() {
    uaInput = document.getElementById('add-username');
    if (!uaInput) return;
    uaEnsureMenu();
    uaInput.setAttribute('autocomplete', 'off');
    uaInput.setAttribute('role', 'combobox');
    uaInput.setAttribute('aria-autocomplete', 'list');
    uaInput.setAttribute('aria-expanded', 'false');
    uaInput.addEventListener('keydown', uaOnKeyDown);
    uaInput.addEventListener('input', uaOnInput);
    uaInput.addEventListener('focus', uaOnFocus);
    uaInput.addEventListener('blur', uaOnBlur);

    const ro = new ResizeObserver(() => { if (uaMenuOpen) uaPositionMenu(); });
    ro.observe(document.documentElement);
  }

  document.addEventListener('DOMContentLoaded', () => {
    initUsernameAutocomplete();
  });
})();
