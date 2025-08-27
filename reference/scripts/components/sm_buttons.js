// sm_buttons.js
export function create_sm_buttons() {
  const controls = document.createElement('div');
  controls.id = 'controls';
  controls.className = 'controls';

  const prev = document.createElement('button');
  prev.id = 'prev-week';
  prev.className = 'btn btn-secondary';
  prev.title = 'previous week';
  prev.textContent = '← previous week';

  const next = document.createElement('button');
  next.id = 'next-week';
  next.className = 'btn btn-secondary';
  next.title = 'next week';
  next.textContent = 'next week →';

  const helper = document.createElement('span');
  helper.className = 'muted helper';
  helper.textContent = 'shift+scroll = vertical zoom, scroll = pan';

  controls.append(prev, next, helper);
  return controls;
}
