// sm_state.js (ES module)
// Centralized shared state + utilities for schedule matcher.

export const CONST = {
  SLOTS_PER_HOUR: 2,       // 30-minute slots
  HOURS_START: 0,
  HOURS_END: 24,
  SLOT_SEC: 1800           // 30m in seconds
};

export const state = {
  // auth
  isAuthenticated: false,
  currentUsername: null,

  // settings
  DEFAULT_SETTINGS: { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' },
  settings: { timezone: 'auto', clock: '24', weekStart: 'sun', defaultZoom: 1.0, heatmap: 'viridis' },
  tz: (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC',
  hour12: false,
  weekStartIdx: 0, // 0=Sun,1=Mon
  heatmapName: 'viridis',

  // ui/interaction
  weekOffset: 0,           // 0=current week
  zoomFactor: 1.0,
  ZOOM_MIN: 0.6,
  ZOOM_MAX: 2.0,
  ZOOM_STEP: 0.1,

  // data
  members: [],             // [username]
  userSlotSets: new Map(), // username -> Set(epochSec)
  totalMembers: 0,

  // derived (rebuilt by painters)
  counts: [],              // length = WEEK_ROWS, raw availability count per slot
  sets: [],                // length = WEEK_ROWS, Set of users available per slot
};

// ─────────────────────────────────────────────────────────────────────────────
// Utils
// ─────────────────────────────────────────────────────────────────────────────
export function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

export function resolveTimezone(val) {
  if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
  return val;
}

export function loadLocalSettings() {
  try {
    const raw = localStorage.getItem('nat20_settings');
    if (!raw) return null;
    return JSON.parse(raw);
  } catch { return null; }
}

export function tzOffsetMinutes(tzName, date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: tzName,
    hour12: false,
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit'
  }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  const asUTC = Date.UTC(Number(map.year), Number(map.month) - 1, Number(map.day), Number(map.hour), Number(map.minute), Number(map.second));
  return Math.round((asUTC - date.getTime()) / 60000);
}

export function epochFromZoned(y, m, d, hh, mm, tzName) {
  const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
  let off = tzOffsetMinutes(tzName, new Date(guess));
  let ts = guess - off * 60000;
  off = tzOffsetMinutes(tzName, new Date(ts));
  ts = guess - off * 60000;
  return Math.floor(ts / 1000);
}

export function getYMDInTZ(date, tzName) {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
  const map = {};
  for (const p of parts) map[p.type] = p.value;
  return { y: Number(map.year), m: Number(map.month), d: Number(map.day) };
}

export function getTodayYMDInTZ(tzName) { return getYMDInTZ(new Date(), tzName); }

export function ymdAddDays(ymd, add) {
  const tmp = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
  tmp.setUTCDate(tmp.getUTCDate() + add);
  return { y: tmp.getUTCFullYear(), m: tmp.getUTCMonth() + 1, d: tmp.getUTCDate() };
}

export function weekdayIndexInTZ(epochSec, tzName) {
  const wd = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).format(new Date(epochSec * 1000));
  return ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(wd);
}

export function getWeekStartEpochAndYMD() {
  const today = getTodayYMDInTZ(state.tz);
  const todayMid = epochFromZoned(today.y, today.m, today.d, 0, 0, state.tz);
  const todayIdx = weekdayIndexInTZ(todayMid, state.tz);
  const diff = (todayIdx - state.weekStartIdx + 7) % 7;
  const baseYMD = ymdAddDays(today, -diff + state.weekOffset * 7);
  const baseEpoch = epochFromZoned(baseYMD.y, baseYMD.m, baseYMD.d, 0, 0, state.tz);
  return { baseEpoch, baseYMD };
}

export function getDayStartSec(dayIndex) {
  const { baseEpoch } = getWeekStartEpochAndYMD();
  return baseEpoch + dayIndex * 86400;
}

export function rowsPerDay() { return (CONST.HOURS_END - CONST.HOURS_START) * CONST.SLOTS_PER_HOUR; }

export function fmtTime(h, m) {
  if (state.hour12) {
    const ampm = h >= 12 ? 'pm' : 'am';
    let hr = h % 12; if (hr === 0) hr = 12;
    const mm = String(m).padStart(2, '0');
    return `${hr}:${mm} ${ampm}`;
  }
  return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}`;
}

export function fmtRangeSec(startSec, endSec) {
  const a = new Date(startSec * 1000);
  const b = new Date(endSec * 1000);
  const dow = new Intl.DateTimeFormat('en-GB', { timeZone: state.tz, weekday: 'short' }).format(a);
  const s = new Intl.DateTimeFormat('en-GB', { timeZone: state.tz, hour: '2-digit', minute: '2-digit', hour12: state.hour12 }).format(a);
  const e = new Intl.DateTimeFormat('en-GB', { timeZone: state.tz, hour: '2-digit', minute: '2-digit', hour12: state.hour12 }).format(b);
  return `${dow}, ${s} – ${e}`;
}

export function rowHeightPx() {
  const v = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
  return parseFloat(v.replace('px',''));
}

export function gToDayRow(g) {
  const rpd = rowsPerDay();
  const day = Math.floor(g / rpd);
  const row = g % rpd;
  return { day, row };
}
