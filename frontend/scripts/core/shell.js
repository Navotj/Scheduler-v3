/* NAT20 — page skeleton, topbar + hamburger nav + modal + auth */
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
    for (const c of children) n.append(c.nodeType ? c : document.createTextNode(String(c)));
    return n;
  }
  function svg(pathD) {
    const s = document.createElementNS('http://www.w3.org/2000/svg','svg');
    s.setAttribute('viewBox','0 0 24 24');
    s.setAttribute('fill','none');
    s.setAttribute('stroke','currentColor');
    s.setAttribute('stroke-width','2');
    s.setAttribute('stroke-linecap','round');
    s.setAttribute('stroke-linejoin','round');
    const p = document.createElementNS('http://www.w3.org/2000/svg','path');
    p.setAttribute('d', pathD);
    s.appendChild(p);
    return s;
  }

  // ---------- Insert modal host (once) ----------
  function ensureModalHost() {
    if (document.getElementById('modal-overlay')) return;
    document.body.append(
      el('div', { id: 'modal-overlay', role: 'dialog', 'aria-modal': 'true' },
        el('div', { id: 'modal-container' })
      )
    );
  }

  // ---------- Modal API (fetch + extract content) ----------
  function attachModalApi() {
    function pickContent(doc) {
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
      return pickContent(doc).innerHTML;
    }
    async function openModal(path) {
      ensureModalHost();
      const overlay = document.getElementById('modal-overlay');
      const box = document.getElementById('modal-container');
      box.innerHTML = await fetchHtml(path);

      // lazily attach settings CSS when opening settings
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

    // expose
    window.openModal = openModal;
    window.swapModal = swapModal;
    window.closeModal = closeModal;
  }

  // ---------- Topbar + hamburger ----------
  function mountTopbar() {
    if (document.querySelector('.topbar')) return;

    const brand = el('div', { class: 'brand', onclick: () => (window.location.href = '/index.html') },
      el('span', { class: 'logo' }), 'NAT20 Scheduling'
    );
    const whoami = el('span', { class: 'whoami', id: 'whoami' }, '');

    const burger = el('button', { class: 'hamburger', 'aria-label': 'Menu', 'aria-expanded': 'false' },
      svg('M3 6h18M3 12h18M3 18h18')
    );

    const bar = el('header', { class: 'topbar' }, brand, el('div', {}, whoami, burger));
    document.body.prepend(bar);

    const menu = el('div', { class: 'nav-panel', id: 'nav-panel' },
      navItem('Home', svg('M3 9l9-7 9 7v11a2 2 0 0 1-2 2h-5V12H10v10H5a2 2 0 0 1-2-2z'), () => go('/index.html')),
      navItem('Availability', svg('M3 4h18M8 2v4M16 2v4M3 8h18M7 11h5M7 16h10'), () => go('/pages/availability_picker.html')),
      navItem('Group Scheduler', svg('M3 12h18M3 18h18M6 6h12'), () => go('/pages/schedule_matcher.html')),
      navItem('Settings', svg('M12 1l2 3 3 .5-2 2 .5 3-3-.5-2 2-2-2-3 .5.5-3-2-2 3-.5z'), () => openModal('/pages/settings.html')),
      navItem('Login', svg('M15 3h6v18h-6M10 17l5-5-5-5M15 12H3'), () => openModal('/pages/login.html')),
      navItem('Register', svg('M12 2a5 5 0 1 1 0 10 5 5 0 0 1 0-10zM3 22a9 9 0 0 1 18 0'), () => openModal('/pages/register.html'))
    );
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

    function navItem(label, icon, onClick) {
      const item = el('div', { class: 'nav-item' }, icon, el('span', {}, label));
      item.addEventListener('click', onClick);
      return item;
    }
    function go(path) { window.location.href = path; }
  }

  // ---------- Auth state ----------
  let isAuthenticated = false;
  let currentUsername = null;

  async function checkAuth() {
    try {
      const controller = new AbortController();
      const t = setTimeout(() => controller.abort(), 3500);
      const res = await fetch('/auth/check', { credentials: 'include', cache: 'no-store', signal: controller.signal });
      clearTimeout(t);
      if (!res.ok) throw new Error('bad');
      const data = await res.json().catch(() => ({}));
      const uname = data && (data.username || data.user || data.name);
      isAuthenticated = !!uname;
      currentUsername = uname || null;
    } catch {
      isAuthenticated = false;
      currentUsername = null;
    }
    updateAuthUI();
    if (window.scheduler && typeof window.scheduler.setAuth === 'function') {
      window.scheduler.setAuth(isAuthenticated, currentUsername || '');
    }
    document.dispatchEvent(new CustomEvent('auth:changed', {
      detail: { isAuthenticated, username: currentUsername }
    }));
  }

  function updateAuthUI() {
    const who = document.getElementById('whoami');
    if (!who) return;
    if (isAuthenticated && currentUsername) {
      who.textContent = `Signed in as ${currentUsername}`;
      who.style.display = 'inline';
    } else {
      who.textContent = '';
      who.style.display = 'none';
    }
  }

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
    attachModalApi();
    checkAuth();
  });
})();
