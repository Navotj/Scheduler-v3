// scripts/http_client.js
(() => {
  'use strict';

  // Do NOT override fetch here; your login.js already adds single-flight for /auth/check.
  async function tryFetch(url, opts = {}) {
    const final = {
      credentials: 'include',
      headers: (opts.body
        ? { 'Content-Type': 'application/json', ...(opts.headers || {}) }
        : { ...(opts.headers || {}) }),
      cache: opts.cache || 'no-store',
      ...opts
    };
    return fetch(url, final);
  }

  async function getJson(url) {
    const res = await tryFetch(url, { method: 'GET' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    try { return await res.json(); } catch { return null; }
  }

  async function postJson(url, body) {
    const res = await tryFetch(url, {
      method: 'POST',
      body: body != null ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = '';
      try { msg = await res.text(); } catch {}
      throw new Error(msg || `HTTP ${res.status}`);
    }
    try { return await res.json(); } catch { return null; }
  }

  async function delJson(url, body) {
    const res = await tryFetch(url, {
      method: 'DELETE',
      body: body != null ? JSON.stringify(body) : undefined
    });
    if (!res.ok) {
      let msg = '';
      try { msg = await res.text(); } catch {}
      throw new Error(msg || `HTTP ${res.status}`);
    }
    try { return await res.json(); } catch { return null; }
  }

  // Session helper that respects your /auth/check single-flight from login.js
  async function me() {
    // If your bootstrap has already run, trust it first.
    if (window.ensureAuthReady) {
      try { await window.ensureAuthReady(); } catch {}
      const name = window.auth?.user || null;
      if (name) return { username: name };
    }
    // Fallback: ask backend directly
    try {
      const r = await fetch('/auth/check', { credentials: 'include', cache: 'no-store' });
      if (!r.ok) return null;
      const data = await r.json().catch(() => ({}));
      const u = data?.user?.username || data?.username || null;
      return u ? { username: u } : null;
    } catch {
      return null;
    }
  }

  window.http = { tryFetch, getJson, postJson, delJson, me };
})();
