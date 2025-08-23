// schedule_matcher_page.js (ES module)
import { create_page_shell } from '../page_shell.js';
import { create_sm_buttons } from '../components/sm_buttons.js';
import { create_sm_table } from '../components/sm_table.js';
import { create_sm_members_panel } from '../components/sm_members.js';
import { create_sm_filters_panel } from '../components/sm_filters.js';
import { create_sm_results_panel } from '../components/sm_results.js';
import { initScheduler } from '../sm_scheduler.js';

// Build page shell (top bar + padded container)
const { main } = create_page_shell({
  title: 'group scheduler',
  home_href: '/index.html'
});

// Two-column layout
const twoCol = document.createElement('div');
twoCol.className = 'two-col';

// Left column (controls + table)
const left = document.createElement('div');
left.className = 'left-col';
left.appendChild(create_sm_buttons());
left.appendChild(create_sm_table());

// Right column (members + filters + results)
const right = document.createElement('div');
right.className = 'right-col';
right.id = 'right-col';
right.appendChild(create_sm_members_panel());
right.appendChild(create_sm_filters_panel());
right.appendChild(create_sm_results_panel());

// Mount layout
twoCol.append(left, right);
main.appendChild(twoCol);

// Tooltip container used by core
const tip = document.createElement('div');
tip.id = 'cell-tooltip';
tip.className = 'cell-tooltip';
tip.style.display = 'none';
document.body.appendChild(tip);

// Initialize modular scheduler
initScheduler();
