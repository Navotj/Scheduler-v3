// Nat20 Scheduling - Backend server with verbose logging
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');


// replace function (dotenv load + validation)
(() => {
  const fs = require('fs');
  const path = require('path');
  // Prefer absolute .env created by user-data
  const envPathPrimary = '/opt/app/.env';
  const envPathFallback = path.join(process.cwd(), '.env');

  const chosen = fs.existsSync(envPathPrimary) ? envPathPrimary : envPathFallback;
  const result = require('dotenv').config({ path: chosen });

  // Log which file we used and how many keys we parsed
  const parsedCount = result.parsed ? Object.keys(result.parsed).length : 0;
  console.log(`[BOOT][dotenv] file="${chosen}" keys=${parsedCount}`);

  // If zero keys parsed, forcefully fail fast so we don't run with wrong defaults
  if (parsedCount === 0) {
    console.error('[BOOT][dotenv] No variables loaded from .env. Ensure the service can read /opt/app/.env and that it has KEY=VALUE lines.');
    // Optional: dump a tiny hint if the file exists but unreadable
    try {
      const st = fs.statSync(envPathPrimary);
      console.error(`[BOOT][dotenv] /opt/app/.env exists: mode=${(st.mode & 0o777).toString(8)} owner=${st.uid}:${st.gid}`);
    } catch (_) {}
    process.exit(1);
  }
})();


// Routers
const authRoutes = require('./routes/auth');                 // /login, /auth/*, /logout, /check
const availabilityRoutes = require('./routes/availability'); // /availability/*
const settingsRoutes = require('./routes/settings');         // /settings (GET/POST)
const usersRoutes = require('./routes/users');               // /users/*
const templatesRouter = require('./routes/templates');
const verifyRoutes = require('./routes/verify');
const passwordResetRoutes = require('./routes/password_reset');
const app = express();

/* ========= Core security & infra ========= */
app.set('trust proxy', 1); // behind ALB/CloudFront, ensure correct scheme/IP for cookies, etc.

// CORS (explicit, credentials-enabled)
const corsOptions = {
  origin: ['https://www.nat20scheduling.com'],
  credentials: true,
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

// Replaced this line ↓ (Express 5 `*` pattern trips path-to-regexp)
// app.options('*', cors(corsOptions));
app.use((req, res, next) => {
  if (req.method === 'OPTIONS') {
    res.set('Access-Control-Allow-Origin', req.headers.origin || 'https://www.nat20scheduling.com');
    res.set('Access-Control-Allow-Credentials', 'true');
    res.set('Access-Control-Allow-Methods', 'GET,HEAD,OPTIONS,POST,PUT,PATCH,DELETE');
    res.set('Access-Control-Allow-Headers', 'Content-Type,X-Requested-With');
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: '1mb' }));
app.use(cookieParser());

/* ========= Process-level logging ========= */
process.on('unhandledRejection', (reason) => {
  console.error('[PROCESS][unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[PROCESS][uncaughtException]', err);
});

/* ========= Request logger (very verbose) ========= */
app.use((req, res, next) => {
  const start = Date.now();
  const reqId = Math.random().toString(36).slice(2, 10);
  req.__reqId = reqId;

  const safeBody = (() => {
    try {
      if (!req.body || typeof req.body !== 'object') return req.body;
      const clone = JSON.parse(JSON.stringify(req.body));
      if (clone.password) clone.password = '***';
      if (clone.token) clone.token = '***';
      return clone;
    } catch {
      return undefined;
    }
  })();

  console.log(`[REQ ${reqId}] ${req.method} ${req.originalUrl}`);
  if (Object.keys(req.query || {}).length) console.log(`[REQ ${reqId}] query:`, req.query);
  if (safeBody !== undefined) console.log(`[REQ ${reqId}] body:`, safeBody);
  if (req.headers['x-forwarded-for'] || req.ip) {
    console.log(`[REQ ${reqId}] ip:`, req.headers['x-forwarded-for'] || req.ip);
  }

  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[RES ${reqId}] ${res.statusCode} ${req.method} ${req.originalUrl} (${ms}ms)`);
  });

  next();
});

/* ========= MongoDB connection =========
   REQUIRE: MONGO_URI provided in .env; we do NOT compose it here.
   The URI must include db name (expected "appdb") and authSource=admin for auth in admin.
*/
const MONGO_URI = (process.env.MONGO_URI || '').trim();

if (!MONGO_URI) {
  console.error('[BOOT] FATAL: MONGO_URI is required but not set in environment (.env). Exiting.');
  process.exit(1);
}

console.log('[BOOT] Connecting to MongoDB using provided MONGO_URI');

mongoose.connection.on('connecting', () => console.log('[DB] connecting...'));
mongoose.connection.on('connected',  () => console.log('[DB] connected'));
mongoose.connection.on('open',       () => console.log('[DB] connection open'));
mongoose.connection.on('reconnected',() => console.log('[DB] reconnected'));
mongoose.connection.on('disconnected',() => console.warn('[DB] disconnected'));
mongoose.connection.on('error',      (err) => console.error('[DB] error:', err));

mongoose.connect(MONGO_URI, {})
.then(() => console.log('[BOOT] Mongo connection established'))
.catch((err) => {
  console.error('[BOOT] Failed to connect to MongoDB:', err);
  process.exit(1);
});

/* ========= Health & debug ========= */
// ALB Target Group health check endpoint (PERSISTENTLY /health)
app.get('/health', (_req, res) => {
  res.status(200).json({ ok: true });
});

// Simple echo & Mongo ping for troubleshooting
app.all('/__debug/echo', (req, res) => {
  res.json({
    ok: true,
    method: req.method,
    url: req.originalUrl,
    headers: req.headers,
    cookies: req.cookies || {},
    time: new Date().toISOString()
  });
});

app.get('/__debug/dbping', async (_req, res) => {
  try {
    const admin = mongoose.connection.getClient().db().admin();
    const out = await admin.ping();
    res.json({ ok: true, mongo: out });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* ========= Routes =========
   Note: Do NOT mount the auth router at root without a path llkkkfilter; some auth routers end with a catch-all 404 which would swallow other routes.
*/
app.use('/auth', authRoutes);
app.use('/auth', verifyRoutes);
app.use('/auth', passwordResetRoutes);
app.use('/availability', availabilityRoutes);
app.use(settingsRoutes);
app.use('/users', usersRoutes);
app.use('/templates', templatesRouter);

// Root-level compatibility for specific auth endpoints only
app.use(['/login', '/logout', '/check'], authRoutes);

/* ========= Final error handler ========= */
app.use((err, _req, res, _next) => {
  console.error('[EXPRESS][error]', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'internal server error' });
});

/* ========= Start ========= */
const PORT = Number(process.env.PORT || 3000);
const server = app.listen(PORT, () => {
  console.log(`[BOOT] Backend listening on port ${PORT}`);
});

/* ========= HTTP server timeouts ========= */
server.keepAliveTimeout = 65000; // > 60000 (ALB idle)
server.headersTimeout   = 66000; // a bit higher than keepAliveTimeout
server.requestTimeout   = 0;     // disable per-request timeout
