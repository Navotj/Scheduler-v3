// scripts/register.js
(() => {
  'use strict';

  const http = window.http;

  async function register(username, password) {
    await http.postJson('/auth/register', { username, password });
    // some backends auto-login; either way, try to read session
    try { return await http.me(); } catch { return null; }
  }

  window.authRegister = { register };
})();
