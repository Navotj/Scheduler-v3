// Nat20 Scheduling - Backend server with verbose logging
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Routers
const authRoutes = require('./routes/auth');                 // /login, /auth/*, /logout, /check
const availabilityRoutes = require('./routes/availability'); // /availability/*
const settingsRoutes = require('./routes/settings');         // /settings (GET/POST)
const usersRoutes = require('./routes/users');               // /users/*

const app = express();

/* ========= Core security & infra ========= */
app.set('trust proxy', 1); // behind ALB/CloudFront, ensure correct scheme/IP for cookies, etc.

// CORS (explicit, credentials-enabled)
const corsOptions = {
  origin: ['https://www.nat20scheduling.com', 'https://nat20scheduling.com'],
  credentials: true,
  methods: ['GET', 'HEAD', 'OPTIONS', 'POST', 'PUT', 'PATCH', 'DELETE'],
  allowedHeaders: ['Content-Type', 'X-Requested-With'],
  optionsSuccessStatus: 204
};
app.use(cors(corsOptions));

app.options('/:path(.*)', cors(corsOptions));


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

/* ========= MongoDB connection ========= */
const buildMongoUri = () => {
  // Prefer explicit URI if provided
  if (process.env.MONGO_URI && process.env.MONGO_URI.trim().length > 0) {
    return process.env.MONGO_URI.trim();
  }
  // Otherwise compose from parts
  const user = process.env.MONGO_USER ? encodeURIComponent(process.env.MONGO_USER) : '';
  const pass = process.env.MONGO_PASS ? encodeURIComponent(process.env.MONGO_PASS) : '';
  const auth = user && pass ? `${user}:${pass}@` : '';
  const host = (process.env.MONGO_HOST && process.env.MONGO_HOST.trim()) || 'mongo.nat20.svc.cluster.local';
  const port = process.env.MONGO_PORT || '27017';
  const dbNameFromEnv = process.env.MONGO_DB || process.env.MONGO_DB_NAME || 'nat20';
  return `mongodb://${auth}${host}:${port}/${dbNameFromEnv}?authSource=admin`;
};

const MONGO_URI = buildMongoUri();
const DB_NAME = process.env.MONGO_DB_NAME || process.env.MONGO_DB || 'nat20';

if (!MONGO_URI) {
  console.error('[BOOT] FATAL: MONGO_URI is required but not set. Exiting.');
  process.exit(1);
}

console.log('[BOOT] Connecting to MongoDB...', { dbName: DB_NAME });

mongoose.connection.on('connecting', () => console.log('[DB] connecting...'));
mongoose.connection.on('connected',  () => console.log('[DB] connected'));
mongoose.connection.on('open',       () => console.log('[DB] connection open'));
mongoose.connection.on('reconnected',() => console.log('[DB] reconnected'));
mongoose.connection.on('disconnected',() => console.warn('[DB] disconnected'));
mongoose.connection.on('error',      (err) => console.error('[DB] error:', err));

mongoose.connect(MONGO_URI, {
  dbName: DB_NAME,
})

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
   We mount auth routes at both root and /auth to support callers of /login and /auth/check.
*/
app.use(authRoutes);
app.use('/auth', authRoutes);
app.use('/availability', availabilityRoutes);
app.use(settingsRoutes);
app.use('/users', usersRoutes);

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

/* ========= HTTP server timeouts (help avoid intermittent 50% timeouts via ALB) =========
   Keep-Alive must exceed ALB idle timeout (default 60s).
*/
server.keepAliveTimeout = 65000; // > 60000 (ALB idle)
server.headersTimeout   = 66000; // a bit higher than keepAliveTimeout
server.requestTimeout   = 0;     // disable per-request timeout to avoid premature closes
