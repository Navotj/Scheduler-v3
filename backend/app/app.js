// Nat20 Scheduling - Backend server with verbose logging
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

// Routers
const authRoutes = require('./routes/auth');                 // /login, /auth/*, /logout
const availabilityRoutes = require('./routes/availability'); // /availability/*
const settingsRoutes = require('./routes/settings');         // /settings (GET/POST)
const usersRoutes = require('./routes/users');               // /users/*

const app = express();

/* ========= Core security & infra ========= */
app.set('trust proxy', true); // behind ALB/CloudFront

app.use(cors({
  origin: ['https://www.nat20scheduling.com', 'https://nat20scheduling.com'],
  credentials: true
}));

app.use(express.json());
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
    // Never log raw passwords or tokens
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
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('[BOOT] FATAL: MONGO_URI is required but not set. Exiting.');
  process.exit(1);
}
const DB_NAME = process.env.MONGO_DB_NAME || 'nat20';

console.log('[BOOT] Connecting to MongoDB...', { dbName: DB_NAME });
mongoose.set('strictQuery', true);

mongoose.connection.on('connecting', () => console.log('[DB] connecting...'));
mongoose.connection.on('connected',  () => console.log('[DB] connected'));
mongoose.connection.on('open',       () => console.log('[DB] connection open'));
mongoose.connection.on('reconnected',() => console.log('[DB] reconnected'));
mongoose.connection.on('disconnected',() => console.warn('[DB] disconnected'));
mongoose.connection.on('error',      (err) => console.error('[DB] error:', err));

mongoose.connect(MONGO_URI, {
  dbName: DB_NAME,
  useNewUrlParser: true,
  useUnifiedTopology: true
})
.then(() => console.log('[BOOT] Mongo connection established'))
.catch((err) => {
  console.error('[BOOT] Failed to connect to MongoDB:', err);
  process.exit(1);
});

/* ========= Health & debug ========= */
app.get('/health', (_req, res) => {
  console.log('[HEALTH] OK');
  res.status(200).json({ ok: true });
});

app.all('/__debug/echo', (req, res) => {
  console.log('[DEBUG] echo endpoint hit');
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
    console.log('[DEBUG] dbping ok:', out);
    res.json({ ok: true, mongo: out });
  } catch (e) {
    console.error('[DEBUG] dbping error:', e);
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
app.listen(PORT, () => {
  console.log(`[BOOT] Backend listening on port ${PORT}`);
});
