/* global window, fetch */
(function () {
  'use strict';

  async function getMany({ baseUrl = '', from, to, usernames }) {
    const payload = { from, to, usernames };
    const candidates = [
      `${baseUrl}/availability/get_many`,
      `${baseUrl}/availability/availability/get_many`
    ];
    for (const url of candidates) {
      try {
        const res = await fetch(url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          credentials: 'include',
          body: JSON.stringify(payload)
        });
        if (res.status === 404) continue;
        if (!res.ok) continue;
        const data = await res.json();
        return data && data.intervals ? data.intervals : {};
      } catch {}
    }
    return {};
  }

  window.api = window.api || {};
  window.api.availability = { getMany };
})();
