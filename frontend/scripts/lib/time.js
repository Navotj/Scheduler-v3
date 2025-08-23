/* global window */
(function () {
  'use strict';

  function resolveTimezone(val) {
    if (!val || val === 'auto') return (Intl.DateTimeFormat().resolvedOptions().timeZone) || 'UTC';
    return val;
  }

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  function tzOffsetMinutes(tzName, date) {
    const parts = new Intl.DateTimeFormat('en-US', {
      timeZone: tzName, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    }).formatToParts(date);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    const asUTC = Date.UTC(+m.year, +m.month - 1, +m.day, +m.hour, +m.minute, +m.second);
    return Math.round((asUTC - date.getTime()) / 60000);
  }

  function epochFromZoned(y, m, d, hh, mm, tzName) {
    const guess = Date.UTC(y, m - 1, d, hh, mm, 0, 0);
    let off = tzOffsetMinutes(tzName, new Date(guess));
    let ts = guess - off * 60000;
    off = tzOffsetMinutes(tzName, new Date(ts));
    ts = guess - off * 60000;
    return Math.floor(ts / 1000);
  }

  function getYMDInTZ(date, tzName) {
    const parts = new Intl.DateTimeFormat('en-US', { timeZone: tzName, year: 'numeric', month: '2-digit', day: '2-digit' }).formatToParts(date);
    const m = {};
    for (const p of parts) m[p.type] = p.value;
    return { y: +m.year, m: +m.month, d: +m.day };
  }
  function getTodayYMDInTZ(tzName) { return getYMDInTZ(new Date(), tzName); }

  function ymdAddDays(ymd, add) {
    const tmp = new Date(Date.UTC(ymd.y, ymd.m - 1, ymd.d));
    tmp.setUTCDate(tmp.getUTCDate() + add);
    return { y: tmp.getUTCFullYear(), m: tmp.getUTCMonth() + 1, d: tmp.getUTCDate() };
  }

  function weekdayIndexInTZ(epochSec, tzName) {
    const wd = new Intl.DateTimeFormat('en-US', { timeZone: tzName, weekday: 'short' }).format(new Date(epochSec * 1000));
    return ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].indexOf(wd);
  }

  function fmtTime(h, m, hour12) {
    if (hour12) {
      const ampm = h >= 12 ? 'PM' : 'AM';
      let hr = h % 12; if (hr === 0) hr = 12;
      return `${hr}:${String(m).padStart(2,'0')} ${ampm}`;
    }
    return `${String(h).padStart(2,'0')}:${String(m).padStart(2,'0')}`;
  }

  function fmtRangeSec(startSec, endSec, tz, hour12) {
    const a = new Date(startSec * 1000);
    const b = new Date(endSec * 1000);
    const dow = new Intl.DateTimeFormat('en-GB', { timeZone: tz, weekday: 'short' }).format(a);
    const s = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12 }).format(a);
    const e = new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hour12 }).format(b);
    return `${dow}, ${s} – ${e}`;
  }

  function rowHeightPx() {
    const v = getComputedStyle(document.documentElement).getPropertyValue('--row-height').trim();
    const n = parseFloat(v.replace('px',''));
    return Number.isFinite(n) ? n : 18;
  }

  window.time = {
    resolveTimezone, clamp, tzOffsetMinutes, epochFromZoned,
    getYMDInTZ, getTodayYMDInTZ, ymdAddDays, weekdayIndexInTZ,
    fmtTime, fmtRangeSec, rowHeightPx
  };
})();
