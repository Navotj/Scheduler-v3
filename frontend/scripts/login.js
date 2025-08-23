// scripts/login.js
(() => {
  'use strict';

  const http = window.http;

  async function login(username, password) {
    await http.postJson('/auth/login', { username, password });
    // read current user after successful login
    try { return await http.me(); } catch { return null; }
  }

  async function logout() {
    try { await http.postJson('/auth/logout', {}); } catch {}
    return true;
  }

  // expose same surface as before
  window.auth = { login, logout, me: http.me };
})();
