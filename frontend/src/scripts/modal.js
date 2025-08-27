(function () {
  'use strict';

  // ========= Minimal modal system (shared) =========
  function ensureModalRoot() {
    let ov = document.getElementById('modal-overlay');
    if (ov) return ov;

    ov = document.createElement('div');
    ov.id = 'modal-overlay';
    ov.style.position = 'fixed';
    ov.style.inset = '0';
    ov.style.background = 'rgba(0,0,0,0.5)';
    ov.style.display = 'none';
    ov.style.zIndex = '1000';
    ov.setAttribute('aria-hidden', 'true');

    const box = document.createElement('div');
    box.id = 'modal-container';
    box.style.position = 'absolute';
    box.style.top = '50%';
    box.style.left = '50%';
    box.style.transform = 'translate(-50%, -50%)';
    box.style.width = 'min(420px, 92vw)';
    box.style.maxHeight = '90vh';
    box.style.overflow = 'auto';
    box.style.background = 'var(--card, #121315)';
    box.style.border = '1px solid var(--border, #1a1c20)';
    box.style.borderRadius = '10px';
    box.style.padding = '16px';
    box.style.boxShadow = '0 20px 60px rgba(0,0,0,0.45)';

    ov.appendChild(box);
    document.body.appendChild(ov);

    ov.addEventListener('click', (e) => {
      if (e.target === ov) closeModal();
    });

    return ov;
  }

  function openModal(html) {
    const ov = ensureModalRoot();
    const box = document.getElementById('modal-container');
    box.innerHTML = html;
    ov.style.display = 'block';
    ov.removeAttribute('aria-hidden');
    setTimeout(() => {
      const first = box.querySelector('input, button, select, textarea, a[href]');
      if (first) first.focus();
    }, 0);
  }

  window.openModal = openModal;

  window.closeModal = function closeModal() {
    const ov = document.getElementById('modal-overlay');
    if (!ov) return;
    ov.style.display = 'none';
    ov.setAttribute('aria-hidden', 'true');
    const box = document.getElementById('modal-container');
    if (box) box.innerHTML = '';
  };

  window.swapModal = function swapModal(target) {
    const t = String(target || '').toLowerCase();
    if (t.includes('login')) {
      if (typeof window.openLoginModal === 'function') window.openLoginModal();
    } else {
      if (typeof window.openRegisterModal === 'function') window.openRegisterModal();
    }
  };
})();
