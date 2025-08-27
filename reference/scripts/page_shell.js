// page_shell.js
export function create_page_shell(opts = {}) {
  const { title = 'nat20 scheduling', home_href = '/index.html' } = opts;

  const root = document.getElementById('app-root') || document.body;

  const shell = document.createElement('div');
  shell.className = 'page-shell';

  const header = document.createElement('header');
  header.className = 'topbar';

  const left = document.createElement('div');
  left.className = 'topbar-left';

  const home = document.createElement('a');
  home.href = home_href;
  home.className = 'topbar-home';
  home.textContent = '← home';

  const h1 = document.createElement('h1');
  h1.className = 'topbar-title';
  h1.textContent = title;

  left.appendChild(home);
  left.appendChild(h1);

  const right = document.createElement('div');
  right.className = 'topbar-right';

  header.appendChild(left);
  header.appendChild(right);

  const main = document.createElement('div');
  main.className = 'container';

  shell.appendChild(header);
  shell.appendChild(main);

  root.replaceChildren(shell);

  return { main };
}
