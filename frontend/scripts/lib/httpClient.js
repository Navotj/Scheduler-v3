/* global window, fetch, Headers, URL, AbortController */
(function () {
  'use strict';

  /**
   * Centralized HTTP client for plain-browser apps (no bundler).
   * - Same-origin paths by default: call http.get('/api/...') etc.
   * - Sends cookies on every request (credentials: 'include').
   * - Optional Bearer token support via configureHttp({ getAuthToken }).
   * - Safe retries (network errors and 429/502/503/504) for idempotent methods only.
   * - Per-request timeout (default 15s) so calls never hang indefinitely.
   *
   * Usage in your page scripts (after including this file):
   *   const me = await http.get('/api/me');
   *   const created = await http.post('/api/things', { name: 'foo' });
   */

  var DEFAULT_TIMEOUT_MS = 15000;
  var DEFAULT_RETRIES = 2; // total attempts = retries + 1
  var RETRY_STATUS = new Set([429, 502, 503, 504]);
  var IDEMPOTENT = new Set(['GET', 'HEAD', 'OPTIONS']);

  var config = {
    // Optionally set a function returning a token (string or Promise<string>), or null to skip.
    getAuthToken: null,
    onBackoff: function (_attempt, _ms) {},
  };

  /**
   * Configure global client behavior.
   * @param {{getAuthToken?: (() => (string|Promise<string>|null))|null, onBackoff?: (attempt:number, ms:number)=>any}} next
   */
  function configureHttp(next) {
    next = next || {};
    if (Object.prototype.hasOwnProperty.call(next, 'getAuthToken')) {
      config.getAuthToken = next.getAuthToken;
    }
    if (Object.prototype.hasOwnProperty.call(next, 'onBackoff')) {
      config.onBackoff = next.onBackoff || function () {};
    }
  }

  function toUrl(input) {
    if (input && typeof input === 'object' && typeof input.toString === 'function' && input.href) {
      return input.toString();
    }
    if (typeof input !== 'string') throw new TypeError('url must be a string or URL');
    try {
      var u = new URL(input);
      return u.toString();
    } catch (_e) {
      return new URL(input, window.location.origin).toString();
    }
  }

  // Decorrelated jitter backoff
  function jitterDelay(attempt, baseMs, capMs) {
    if (baseMs === void 0) baseMs = 250;
    if (capMs === void 0) capMs = 5000;
    var prev = Math.min(capMs, baseMs * Math.pow(2, Math.max(0, attempt - 2)));
    var min = baseMs;
    var max = Math.min(capMs, prev * 3);
    return Math.floor(min + Math.random() * (max - min + 1));
  }

  function shouldRetry(method, res, err) {
    if (!IDEMPOTENT.has(method)) return false;
    if (err) return true; // network/timeout
    if (!res) return false;
    if (RETRY_STATUS.has(res.status)) return true;
    if (res.status === 408) return true;
    return false;
  }

  function normalizeBodyAndHeaders(body, headers) {
    var h = new Headers(headers || undefined);
    if (body == null) return { body: undefined, headers: h };

    var tag = Object.prototype.toString.call(body);
    var isPojo = tag === '[object Object]' && (body.constructor === Object || Object.getPrototypeOf(body) === null);

    if (isPojo) {
      if (!h.has('Content-Type')) h.set('Content-Type', 'application/json');
      return { body: JSON.stringify(body), headers: h };
    }
    return { body: body, headers: h };
  }

  function httpError(message, res, data) {
    var err = new Error(message);
    err.name = 'HttpError';
    err.status = res ? res.status : undefined;
    err.statusText = res ? res.statusText : undefined;
    err.data = data;
    return err;
  }

  function parseResponse(res) {
    if (res.status === 204) return Promise.resolve(null);
    var ctype = res.headers.get('content-type') || '';
    if (ctype.indexOf('application/json') !== -1) {
      return res.json().catch(function () {
        throw httpError('Invalid JSON in response', res, null);
      });
    }
    return res.text();
  }

  /**
   * Core request
   * @param {string|URL} url
   * @param {{
   *   method?: string,
   *   headers?: HeadersInit,
   *   body?: any,
   *   credentials?: RequestCredentials,
   *   timeoutMs?: number,
   *   retries?: number,
   *   signal?: AbortSignal,
   *   getAuthToken?: (() => (string|Promise<string>|null)) | null,
   *   parse?: boolean
   * }} [options]
   * @returns {Promise<any|Response>}
   */
  async function request(url, options) {
    options = options || {};
    var method = String(options.method || 'GET').toUpperCase();
    var timeoutMs = Number.isFinite(options.timeoutMs) ? options.timeoutMs : DEFAULT_TIMEOUT_MS;
    var retries = Number.isInteger(options.retries) ? options.retries : DEFAULT_RETRIES;
    var parse = options.parse !== false;
    var target = toUrl(url);

    var normalized = normalizeBodyAndHeaders(options.body, options.headers);
    var normBody = normalized.body;
    var headers = normalized.headers;

    var tokenGetter = Object.prototype.hasOwnProperty.call(options, 'getAuthToken')
      ? options.getAuthToken
      : config.getAuthToken;
    if (typeof tokenGetter === 'function') {
      var token = await tokenGetter();
      if (token) headers.set('Authorization', 'Bearer ' + token);
    }

    var credentials = options.credentials || 'include';

    var lastErr = null;
    var attempt = 0;

    while (attempt <= retries) {
      attempt++;
      var ac = new AbortController();
      var timer = setTimeout(function () {
        try { ac.abort(new DOMException('Timeout', 'TimeoutError')); } catch (_e) { ac.abort(); }
      }, timeoutMs);

      var externalAbortCleanup = null;
      if (options.signal) {
        var forwardAbort = function () {
          try { ac.abort(new DOMException('Aborted', 'AbortError')); } catch (_e) { ac.abort(); }
        };
        options.signal.addEventListener('abort', forwardAbort, { once: true });
        externalAbortCleanup = function () { options.signal.removeEventListener('abort', forwardAbort); };
      }

      var res = null;
      try {
        res = await fetch(target, {
          method: method,
          headers: headers,
          body: normBody,
          credentials: credentials,
          signal: ac.signal,
        });

        if (!res.ok) {
          var data = null;
          try { data = await parseResponse(res); } catch (_e) {}

          if (shouldRetry(method, res, null) && attempt <= retries) {
            var delay = jitterDelay(attempt);
            try { await Promise.resolve(config.onBackoff(attempt, delay)); } catch (_e) {}
            await new Promise(function (r) { return setTimeout(r, delay); });
            continue;
          }

          throw httpError('HTTP ' + res.status + (res.statusText ? ' ' + res.statusText : ''), res, data);
        }

        clearTimeout(timer);
        if (externalAbortCleanup) externalAbortCleanup();
        return parse ? parseResponse(res) : res;
      } catch (err) {
        lastErr = err;

        var msg = (err && err.message ? String(err.message).toLowerCase() : '');
        var isAbort = err && (err.name === 'AbortError' || err.name === 'TimeoutError' || msg.includes('abort') || msg.includes('timeout'));

        if (shouldRetry(method, null, err) && attempt <= retries) {
          var _delay = jitterDelay(attempt);
          try { await Promise.resolve(config.onBackoff(attempt, _delay)); } catch (_e2) {}
          await new Promise(function (r) { return setTimeout(r, _delay); });
          continue;
        }

        clearTimeout(timer);
        if (externalAbortCleanup) externalAbortCleanup();

        if (isAbort) {
          var e = new Error('Request timed out');
          e.name = 'TimeoutError';
          // @ts-ignore
          e.cause = err;
          throw e;
        }

        throw err;
      } finally {
        clearTimeout(timer);
      }
    }

    if (lastErr) throw lastErr;
    throw new Error('Request failed (unknown error)');
  }

  var http = {
    get: function (url, opts) { return request(url, Object.assign({}, opts, { method: 'GET' })); },
    post: function (url, body, opts) { return request(url, Object.assign({}, opts, { method: 'POST', body: body })); },
    put: function (url, body, opts) { return request(url, Object.assign({}, opts, { method: 'PUT', body: body })); },
    patch: function (url, body, opts) { return request(url, Object.assign({}, opts, { method: 'PATCH', body: body })); },
    delete: function (url, opts) { return request(url, Object.assign({}, opts, { method: 'DELETE' })); },
  };

  // Expose globals for non-module scripts
  window.http = http;
  window.request = request;
  window.configureHttp = configureHttp;

  // Optional: example to wire a token provider. Remove if you use cookie sessions only.
  // window.configureHttp({ getAuthToken: () => localStorage.getItem('access_token') || null });
})();
