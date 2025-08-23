/* Topbar loader with Shadow DOM encapsulation.
   Renders /templates/topbar.html with /styles/topbar.css and keeps padding/width consistent across pages.
   Exposes: window.topbar.refreshAuth(isAuthed?, username?), window.setAuthState(isAuthed, username)
*/
(() => {
  let shadowRoot = null;
  let state = { isAuthed: false, username: null };

  async function fetchText(url) {
    const res = await fetch(url, { cache: 'no-cache', credentials: 'same-origin' });
    if (!res.ok) throw new Error(`Failed to fetch ${url}`);
    return res.text();
  }

  function hardResetCSS() {
    return `
      :host, * { box-sizing: border-box; }
      :host { all: initial; display:block; }
      *, *::before, *::after { box-sizing: inherit; }
      ._root { all: unset; display:block; }
    `;
  }

  async function mount() {
    const host = document.getElementById('topbar-root');
    if (!host) return;

    const html = await fetchText('/templates/topbar.html').catch(() => fetchText('../templates/topbar.html'));
    const css = await fetchText('/styles/topbar.css').catch(() => fetchText('../styles/topbar.css'));

    shadowRoot = host.attachShadow({ mode: 'open' });
    const styleReset = document.createElement('style');
    styleReset.textContent = hardResetCSS();
    const style = document.createElement('style');
    style.textContent = css;

    const wrapper = document.createElement('div');
    wrapper.className = '_root';
    wrapper.innerHTML = html;

    shadowRoot.appendChild(styleReset);
    shadowRoot.appendChild(style);
    shadowRoot.appendChild(wrapper);

    applyTitle();
    wireAuthUI();
  }

  function applyTitle() {
    const host = document.getElementById('topbar-root');
    const title = (host && host.dataset.title) || document.title || 'NAT20';
    const el = shadowRoot && shadowRoot.getElementById('topbar-title');
    if (el) el.textContent = title;
  }

  function wireAuthUI() {
    const userLabel = shadowRoot.getElementById('user-label');
    const authButton = shadowRoot.getElementById('auth-button');

    function render() {
      if (!authButton || !userLabel) return;
      if (state.isAuthed) {
        userLabel.textContent = `Signed in as ${state.username}`;
        userLabel.style.display = 'inline';
        authButton.textContent = 'Logout';
        authButton.onclick = () => {
          state = { isAuthed: false, username: null };
          if (typeof window.onAuthStateChange === 'function') window.onAuthStateChange(false, null);
          render();
        };
      } else {
        userLabel.textContent = '';
        userLabel.style.display = 'none';
        authButton.textContent = 'Login';
        authButton.onclick = () => {
          if (typeof window.openModal === 'function') {
            window.openModal('/pages/login.html');
          } else {
            location.href = '/pages/login.html';
          }
        };
      }
    }
    render();

    window.setAuthState = (isAuthed, username) => {
      state = { isAuthed: !!isAuthed, username: isAuthed ? username : null };
      if (typeof window.onAuthStateChange === 'function') window.onAuthStateChange(state.isAuthed, state.username);
      render();
    };

    window.topbar = {
      refreshAuth(isAuthed, username) {
        if (typeof isAuthed !== 'undefined') {
          state = { isAuthed: !!isAuthed, username: isAuthed ? username : null };
        }
        render();
        applyTitle();
      }
    };
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', mount);
  } else {
    mount();
  }
})();
