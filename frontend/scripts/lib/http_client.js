// frontend/scripts/lib/http_client.js
(function () {
  'use strict';

  // You can override at runtime with: window.API_BASE = '/some/other/prefix'
  const API_BASE = (window.API_BASE || '/api').replace(/\/+$/, '');

  async function tryFetch(paths, init) {
    let lastErr;
    for (const p of paths) {
      try {
        const res = await fetch(p, init);
        if (res.ok) return res;
        lastErr = new Error(`${res.status} ${res.statusText}`);
      } catch (e) {
        lastErr = e;
      }
    }
    throw lastErr || new Error('Network error');
  }

  async function asJson(res) {
    const ct = res.headers.get('content-type') || '';
    if (ct.includes('application/json')) return res.json();
    const t = await res.text();
    try { return JSON.parse(t); } catch { return { ok: false, text: t }; }
  }

  class HttpClient {
    // --- Auth ---
    async me() {
      const res = await tryFetch(
        [`${API_BASE}/auth/me`, `/auth/me`],
        { credentials: 'include', cache: 'no-cache' }
      );
      return asJson(res);
    }
    async login(body) {
      const res = await tryFetch(
        [`${API_BASE}/auth/login`, `/auth/login`],
        {
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body)
        }
      );
      return asJson(res);
    }
    async logout() {
      await tryFetch(
        [`${API_BASE}/auth/logout`, `/auth/logout`],
        { method: 'POST', credentials: 'include' }
      );
    }

    // --- Users ---
    async userExists(username) {
      const q = `?username=${encodeURIComponent(username)}`;
      const res = await tryFetch(
        [`${API_BASE}/users/exists${q}`, `/users/exists${q}`],
        { credentials: 'include', cache: 'no-cache' }
      );
      return asJson(res);
    }

    // --- Availability (mine) ---
    async availabilityGetMine(from, to) {
      const init = {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to })
      };
      const res = await tryFetch(
        [`${API_BASE}/availability/get`, `/availability/get`],
        init
      );
      return asJson(res);
    }

    async availabilitySave(intervals) {
      const init = {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ intervals })
      };
      const res = await tryFetch(
        [`${API_BASE}/availability/save`, `/availability/save`],
        init
      );
      return asJson(res);
    }

    // --- Availability (many, used by matcher) ---
    async availabilityGetMany(from, to, usernames) {
      const init = {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ from, to, usernames })
      };
      const res = await tryFetch(
        [
          `${API_BASE}/availability/get_many`,
          `/availability/get_many`,
          // legacy fallback path some servers exposed:
          `${API_BASE}/availability/availability/get_many`
        ],
        init
      );
      return asJson(res);
    }
  }

  window.httpClient = new HttpClient();
})();
