// scripts/lib/config.js
(function () {
  const { protocol, hostname } = window.location;
  const baseHost = hostname.replace(/^www\./, "");
  const apiHost  = `api.${baseHost}`;

  window.API_BASE_URL = `${protocol}//${apiHost}`;
})();
