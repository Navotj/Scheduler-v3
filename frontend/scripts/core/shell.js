/* NAT20 — shared page skeleton: topbar + hamburger nav + modal + auth state */
(function () {
  'use strict';

  // ---------- DOM helpers ----------
  function el(tag, attrs, ...children) {
    const n = document.createElement(tag);
    if (attrs) for (const [k, v] of Object.entries(attrs)) {
      if (k === 'class') n.className = v;
      else if (k === 'style') Object.assign(n.style, v);
      else if (k.startsWith('on') && typeof v === 'function') n.addEventListener(k.slice(2), v);
      else n.setAttribute(k, v);
    }
    for (const c of children) n.append(c && c.nodeType ? c : document.createTextNode(String(c ?? '')));
    return n;
  }
  function svgPath(d) {
    const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('viewBox','0 0 24 24');
    s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor');
    s.setAttribute('stroke-width','2');
    s.setAttribute('stroke-linecap','round');
    s.setAttribute('stroke-linejoin','round');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', d);
    s.appendChild(p);
    return s;
  }
  const ICON = {
    home: () => svgPath('M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-5V12H10v10H5a2 2 0 0 1-2-2z'),
    calendar: () => svgPath('M7 2v4M17 2v4M3 8h18M5 8V6a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v2M5 8v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8M8 12h3M13 12h3M8 16h8'),
    search: () => svgPath('M21 21l-4.3-4.3M10 18a8 8 0 1 1 0-16 8 8 0 0 1 0 16'),
    settings: () => svgPath('M12 3l1.2 2.4 2.6.4-1.9 1.9.5 2.6-2.4-1.2-2.4 1.2.5-2.6L8.2 5.8l2.6-.4L12 3zM4 14a2 2 0 1 0 0 4 2 2 0 0 0 0-4zm16-2a2 2 0 1 0 .001 4.001A2 2 0 0 0 20 12z'),
    user: () => svgPath('M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2M16 7a4 4 0 1 1-8 0 4 4 0 0 1 8 0'),
    login: () => svgPath('M15 3h6v18h-6M10 17l5-5-5-5M15 12H3'),
    logout: () => svgPath('M21 12H9M13 7l-5 5 5 5M15 3h6v18h-6')
  };

  // ---------- Modal host ----------
  function ensureModalHost() {
    if (document.getElementById('modal-overlay')) return;
    document.body.append(
      el('div', { id: 'modal-overlay', role: 'dialog', 'aria-modal': 'true', style: 'display:none' },
        el('div', { id: 'modal-container' })
      )
    );
  }

  // ---------- Modal API ----------
  function pickModalContent(doc) {
    return doc.querySelector('[data-modal-root]') ||
           doc.getElementById('settings-panel') ||
           doc.querySelector('main') ||
           doc.body;
  }
  async function fetchHtml(path) {
    const res = await fetch(path, { cache: 'no-store', credentials: 'include' });
    const text = await res.text();
    const parser = new DOMParser();
    const doc = parser.parseFromString(text, 'text/html');
    return pickModalContent(doc).innerHTML;
  }
  async function openModal(path) {
    ensureModalHost();
    const overlay = document.getElementById('modal-overlay');
    const box = document.getElementById('modal-container');
    box.innerHTML = await fetchHtml(path);

    if (/settings\.html$/.test(path) && !document.getElementById('settings-css')) {
      const link = el('link', { id: 'settings-css', rel: 'stylesheet', href: '/styles/settings.css' });
      document.head.append(link);
    }

    document.body.classList.add('modal-active');
    overlay.style.display = 'flex';
    runModalInit(path);
  }
  async function swapModal(path) {
    const box = document.getElementById('modal-container');
    box.innerHTML = await fetchHtml(path);
    runModalInit(path);
  }
  function closeModal() {
    const overlay = document.getElementById('modal-overlay');
    if (!overlay) return;
    overlay.style.display = 'none';
    document.body.classList.remove('modal-active');
    document.getElementById('modal-container').innerHTML = '';
  }
  window.openModal = openModal;
  window.swapModal = swapModal;
  window.closeModal = closeModal;

  // ---------- Topbar + hamburger ----------
  let menu, burger, whoamiEl;
  function mountTopbar() {
    if (document.querySelector('.topbar')) return;

    const brand = el('div', { class: 'brand', onclick: () => (window.location.href = '/index.html') },
      el('span', { class: 'logo' }), 'NAT20 Scheduling'
    );
    whoamiEl = el('span', { class: 'whoami', id: 'whoami' }, '');

    burger = el('button', { class: 'hamburger', 'aria-label': 'Menu', 'aria-expanded': 'false' },
      svgPath('M3 6h18M3 12h18M3 18h18')
    );

    const bar = el('header', { class: 'topbar' }, brand, el('div', {}, whoamiEl, burger));
    document.body.prepend(bar);

    menu = el('div', { class: 'nav-panel', id: 'nav-panel' });
    document.body.append(menu);

    burger.addEventListener('click', () => {
      const open = menu.classList.toggle('open');
      burger.setAttribute('aria-expanded', open ? 'true' : 'false');
    });
    document.addEventListener('click', (e) => {
      if (!menu.classList.contains('open')) return;
      const within = e.target.closest('#nav-panel') || e.target.closest('.hamburger');
      if (!within) {
        menu.classList.remove('open');
        burger.setAttribute('aria-expanded', 'false');
      }
    });

    populateMenu(); // initial
  }

  function navItem(label, iconFn, onClick) {
    const item = el('div', { class: 'nav-item' }, iconFn(), el('span', {}, label));
    item.addEventListener('click', onClick);
    return item;
  }

  function populateMenu() {
    if (!menu) return;
    menu.innerHTML = '';
    menu.append(
      navItem('Home', ICON.home, () => go('/index.html')),
      navItem('Availability', ICON.calendar, () => go('/pages/availability_picker.html')),
      navItem('Group Scheduler', ICON.search, () => go('/pages/schedule_matcher.html')),
      navItem('Settings', ICON.settings, () => openModal('/pages/settings.html')),
      ...(isAuthenticated
        ? [navItem('Logout', ICON.logout, doLogout)]
        : [
            navItem('Login', ICON.login, () => openModal('/pages/login.html')),
            navItem('Register', ICON.user, () => openModal('/pages/register.html'))
          ])
    );
  }

  function go(path) { window.location.href = path; }

  // ---------- Auth state ----------
  let isAuthenticated = false;
  let currentUsername = null;

  function extractUsername(data) {
    if (!data) return null;
    if (typeof data === 'string') return data;
    if (typeof data.username === 'string') return data.username;
    if (typeof data.name === 'string') return data.name;
    if (data.user) {
      if (typeof data.user === 'string') return data.user;
      if (typeof data.user.username === 'string') return data.user.username;
      if (typeof data.user.name === 'string') return data.user.name;
    }
    if (Array.isArray(data) && data.length && typeof data[0] === 'string') return data[0];
    return null;
  }

  async function checkAuth() {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-store', signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('bad');
      const data = await res.json().catch(() => ({}));
      const uname = extractUsername(data);
      isAuthenticated = !!uname || data.authenticated === true;
      currentUsername = uname || null;
    } catch {
      isAuthenticated = false;
      currentUsername = null;
    }
    updateAuthUI();
    populateMenu();
    if (window.scheduler && typeof window.scheduler.setAuth === 'function') {
      window.scheduler.setAuth(isAuthenticated, currentUsername || '');
    }
    document.dispatchEvent(new CustomEvent('auth:changed', {
      detail: { isAuthenticated, username: currentUsername }
    }));
  }

  function updateAuthUI() {
    if (!whoamiEl) return;
    if (isAuthenticated && currentUsername) {
      whoamiEl.textContent = `Signed in as ${currentUsername}`;
      whoamiEl.style.display = 'inline';
    } else {
      whoamiEl.textContent = '';
      whoamiEl.style.display = 'none';
    }
  }

  async function doLogout() {
    try {
      await fetch('/auth/logout', { method: 'POST', credentials: 'include' });
    } catch {}
    isAuthenticated = false;
    currentUsername = null;
    updateAuthUI();
    populateMenu();
    document.dispatchEvent(new CustomEvent('auth:changed', {
      detail: { isAuthenticated: false, username: null }
    }));
    // Optionally return to home
    try { if (location.pathname !== '/index.html') go('/index.html'); } catch {}
  }

  // allow login.js to notify auth changes explicitly
  window.setAuthState = function (auth, username) {
    isAuthenticated = !!auth;
    currentUsername = username || null;
    updateAuthUI();
    populateMenu();
  };

  // ---------- Modal init routing ----------
  function runModalInit(path) {
    if (path.endsWith('/pages/login.html') && typeof window.initLoginForm === 'function') {
      window.initLoginForm();
    } else if (path.endsWith('/pages/register.html') && typeof window.initRegisterForm === 'function') {
      window.initRegisterForm();
    } else if (path.endsWith('/pages/settings.html') && typeof window.initSettingsPanel === 'function') {
      window.initSettingsPanel(document.getElementById('modal-container'));
    }
  }
  window.runModalInit = runModalInit;

  // ---------- Boot ----------
  document.addEventListener('DOMContentLoaded', () => {
    mountTopbar();
    ensureModalHost();
    checkAuth();
  });
})();
