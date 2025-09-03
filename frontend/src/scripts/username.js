(function () {
  'use strict';

  // ====== Config ======
  const API_PREFIX = '/api';
  const MAX_SUGGESTIONS = 8;

  // ====== Inject minimal styles (self-contained; no matcher.css edits) ======
  (function injectStyles() {
    if (document.getElementById('ua-style')) return;
    const css = `
      .ua-menu{position:absolute;z-index:99999;min-width:160px;max-width:280px;max-height:240px;overflow:auto;
        background:var(--bg-1,#0e1117);border:1px solid var(--border,#1a1c20);border-radius:10px;box-shadow:0 8px 28px rgba(0,0,0,.5);padding:6px;display:none}
      .ua-menu[data-open="1"]{display:block}
      .ua-option{padding:6px 10px;border-radius:8px;cursor:pointer;white-space:nowrap;font-size:14px;line-height:1.2}
      .ua-option[aria-selected="true"]{outline:1px solid var(--ring,#3a78ff);background:var(--card,#141820)}
      .ua-empty{padding:6px 10px;color:var(--fg-2,#8b95ae);font-size:13px}
    `;
    const style = document.createElement('style');
    style.id = 'ua-style';
    style.textContent = css;
    document.head.appendChild(style);
  })();

  // ====== DOM ======
  let input = null;
  let addBtn = null;
  let menu = null;

  // ====== State ======
  let allFriends = [];          // ['alice','bob',...], sorted A→Z, case-insensitive
  let filtered = [];            // current suggestions (<= MAX_SUGGESTIONS)
  let activeIndex = -1;         // highlighted option in menu
  let menuOpen = false;
  let repositionRAF = 0;

  // ====== Utils ======
  function ciCmp(a, b) { return a.localeCompare(b, undefined, { sensitivity: 'accent' }); }
  function norm(s) { return (s || '').toLowerCase(); }
  function isClickInsideMenu(target) { return menu && (target === menu || menu.contains(target)); }
  function isVisible(el) { return !!(el && (el.offsetWidth || el.offsetHeight || el.getClientRects().length)); }

  async function fetchFriends() {
    try {
      const res = await fetch(`${API_PREFIX}/friends/list`, { credentials: 'include' });
      if (!res.ok) return [];
      const data = await res.json();
      const names = (data && Array.isArray(data.friends) ? data.friends : [])
        .map(f => f && f.username)
        .filter(Boolean);
      // unique + sort A-Z
      const uniq = Array.from(new Set(names));
      uniq.sort(ciCmp);
      return uniq;
    } catch (_) {
      return [];
    }
  }

  function ensureMenu() {
    if (menu) return;
    menu = document.createElement('div');
    menu.className = 'ua-menu';
    menu.setAttribute('role', 'listbox');
    menu.setAttribute('aria-label', 'Friend suggestions');
    document.body.appendChild(menu);
  }

  function openMenu() {
    if (menuOpen) return;
    ensureMenu();
    menuOpen = true;
    menu.dataset.open = '1';
    activeIndex = -1; // nothing selected yet
    updateSuggestions();
    positionMenu();
    window.addEventListener('resize', onWindowChange, { passive: true });
    window.addEventListener('scroll', onWindowChange, { passive: true, capture: true });
    document.addEventListener('click', onDocClick, true);
  }

  function closeMenu() {
    if (!menuOpen) return;
    menuOpen = false;
    if (menu) {
      delete menu.dataset.open;
      menu.style.display = 'none';
    }
    activeIndex = -1;
    window.removeEventListener('resize', onWindowChange, { passive: true });
    window.removeEventListener('scroll', onWindowChange, { passive: true, capture: true });
    document.removeEventListener('click', onDocClick, true);
  }

  function positionMenu() {
    if (!menuOpen || !menu || !input || !isVisible(input)) return;
    // Ensure it's rendered to measure height
    menu.style.display = 'block';
    const r = input.getBoundingClientRect();
    const mh = Math.min(menu.scrollHeight, 240);
    const gap = 6;
    // Open upwards: top = input.top - gap - menuHeight
    const top = window.scrollY + r.top - gap - mh;
    const left = window.scrollX + r.left;
    const width = Math.max(r.width, 160);
    menu.style.top = `${Math.max(4, top)}px`;
    menu.style.left = `${left}px`;
    menu.style.minWidth = `${width}px`;
    menu.style.maxWidth = `${Math.max(220, r.width)}px`;
    // Cap height and re-measure
    menu.style.maxHeight = '240px';
  }

  function onWindowChange() {
    if (!menuOpen) return;
    cancelAnimationFrame(repositionRAF);
    repositionRAF = requestAnimationFrame(positionMenu);
  }

  function onDocClick(e) {
    if (!menuOpen) return;
    if (e.target === input || isClickInsideMenu(e.target)) return;
    closeMenu();
  }

  function buildOption(name, idx) {
    const opt = document.createElement('div');
    opt.className = 'ua-option';
    opt.setAttribute('role', 'option');
    opt.setAttribute('data-index', String(idx));
    opt.textContent = name;
    opt.addEventListener('mouseenter', () => setActiveIndex(idx, true));
    opt.addEventListener('mousedown', (ev) => {
      // Prevent input blur before we commit
      ev.preventDefault();
    });
    opt.addEventListener('click', () => {
      commitSelection(idx);
    });
    return opt;
  }

  function renderMenu() {
    if (!menu) return;
    menu.innerHTML = '';
    if (filtered.length === 0) {
      const empty = document.createElement('div');
      empty.className = 'ua-empty';
      empty.textContent = 'No matches';
      menu.appendChild(empty);
    } else {
      filtered.forEach((name, i) => menu.appendChild(buildOption(name, i)));
    }
    // Apply highlight
    applyActive();
    positionMenu();
  }

  function setActiveIndex(idx, ensure = false) {
    if (filtered.length === 0) { activeIndex = -1; applyActive(); return; }
    const max = filtered.length - 1;
    if (idx < 0) idx = max;
    if (idx > max) idx = 0;
    activeIndex = idx;
    applyActive(ensure);
  }

  function applyActive(ensure = false) {
    if (!menu) return;
    const kids = menu.querySelectorAll('.ua-option');
    kids.forEach((el, i) => {
      if (i === activeIndex) {
        el.setAttribute('aria-selected', 'true');
        if (ensure) {
          el.scrollIntoView({ block: 'nearest' });
        }
      } else {
        el.removeAttribute('aria-selected');
      }
    });
  }

  function commitSelection(idx) {
    if (idx < 0 || idx >= filtered.length) return;
    input.value = filtered[idx];
    closeMenu();
    // keep focus on input so Enter can trigger existing handlers if any
    input.focus();
  }

  function computeFiltered(query) {
    const q = norm(query);
    if (!q) return allFriends.slice(0, MAX_SUGGESTIONS);
    // Prefer prefix matches; if less than MAX, allow infix to fill
    const prefix = allFriends.filter(n => norm(n).startsWith(q));
    if (prefix.length >= MAX_SUGGESTIONS) return prefix.slice(0, MAX_SUGGESTIONS);
    const infix = allFriends.filter(n => !norm(n).startsWith(q) && norm(n).includes(q));
    return prefix.concat(infix).slice(0, MAX_SUGGESTIONS);
  }

  function updateSuggestions() {
    filtered = computeFiltered(input.value);
    renderMenu();
  }

  function onKeyDown(e) {
    if (!menuOpen) {
      // Open menu on ArrowDown / Tab (forward) / any typing with focus
      if (e.key === 'ArrowDown') {
        openMenu();
        e.preventDefault();
        setActiveIndex(0, true);
      }
      return;
    }

    switch (e.key) {
      case 'Tab': {
        // Cycle without committing; do not move focus away
        e.preventDefault();
        const dir = e.shiftKey ? -1 : 1;
        setActiveIndex((activeIndex === -1 ? -1 : activeIndex) + dir, true);
        break;
      }
      case 'ArrowDown': {
        e.preventDefault();
        setActiveIndex((activeIndex === -1 ? 0 : activeIndex + 1), true);
        break;
      }
      case 'ArrowUp': {
        e.preventDefault();
        setActiveIndex((activeIndex === -1 ? 0 : activeIndex - 1), true);
        break;
      }
      case 'Enter': {
        if (activeIndex >= 0) {
          e.preventDefault();
          commitSelection(activeIndex);
        } // else allow form/default Enter if nothing highlighted
        break;
      }
      case 'Escape': {
        e.preventDefault();
        closeMenu();
        break;
      }
      default:
        // allow normal typing; input handler will filter
        break;
    }
  }

  function onInput() {
    if (!menuOpen) openMenu();
    updateSuggestions();
  }

  function onFocus() {
    // Load friends on first focus if needed, then open menu
    (async () => {
      if (allFriends.length === 0) {
        allFriends = await fetchFriends();
      }
      openMenu();
    })();
  }

  function onBlur() {
    // If blur goes to menu (click), keep open; otherwise close (doc click will also handle)
    setTimeout(() => {
      if (!menuOpen) return;
      const active = document.activeElement;
      if (active === input || isClickInsideMenu(active)) return;
      closeMenu();
    }, 0);
  }

  // ====== Init ======
  document.addEventListener('DOMContentLoaded', () => {
    input = document.getElementById('add-username');
    addBtn = document.getElementById('add-user-btn');
    if (!input) return; // not on matcher page

    ensureMenu();

    input.setAttribute('autocomplete', 'off');
    input.setAttribute('role', 'combobox');
    input.setAttribute('aria-autocomplete', 'list');
    input.setAttribute('aria-expanded', 'false');

    input.addEventListener('keydown', onKeyDown);
    input.addEventListener('input', onInput);
    input.addEventListener('focus', onFocus);
    input.addEventListener('blur', onBlur);

    // Keep ARIA expanded state in sync
    const obs = new MutationObserver(() => {
      input.setAttribute('aria-expanded', menuOpen ? 'true' : 'false');
    });
    obs.observe(document.body, { attributes: true, subtree: false });

    // Ensure menu repositions when the add button or layout changes size
    const ro = new ResizeObserver(() => { if (menuOpen) positionMenu(); });
    ro.observe(document.documentElement);
  });
})();
