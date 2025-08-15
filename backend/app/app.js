// Core server setup for Nat20 Scheduling backend (HTTPS behind CloudFront/ALB)
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const cookieParser = require('cookie-parser');
require('dotenv').config();

const authRoutes = require('./auth');                 // exposes /login, /check, /logout
const availabilityRoutes = require('./availability'); // exposes /availability/*
const settingsRoutes = require('./settings');         // exposes /settings GET/POST
const usersRoutes = require('./users');               // exposes /users/*

const app = express();

/* IMPORTANT: we are behind ALB/CloudFront; trust proxy so Express respects X-Forwarded-Proto */
app.set('trust proxy', true);

/* CORS: lock to your public site only */
app.use(cors({
  origin: ['https://www.nat20scheduling.com', 'https://nat20scheduling.com'],
  credentials: true
}));

app.use(express.json());
app.use(cookieParser());

/* ===== MongoDB connection =====
   MONGO_URI is generated on the instance by user_data from SSM and written to /opt/nat20/backend/.env
   Fail fast if it's missing to avoid accidental public defaults.
*/
const MONGO_URI = process.env.MONGO_URI;
if (!MONGO_URI) {
  console.error('FATAL: MONGO_URI is required but not set. Refusing to start.');
  process.exit(1);
}
const DB_NAME = process.env.MONGO_DB_NAME || 'nat20';

mongoose.connect(MONGO_URI, {
  dbName: DB_NAME,
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch((err) => {
  console.error('Failed to connect to MongoDB:', err);
  process.exit(1);
});

/* ===== Temporary request logger (remove after debugging) ===== */
app.use((req, res, next) => {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.originalUrl} -> ${res.statusCode} (${ms}ms)`);
  });
  next();
});

/* Health check for ALB */
app.get('/health', (_req, res) => res.status(200).json({ ok: true }));

/* Routes
   NOTE: We mount authRoutes both at root and /auth to support existing callers of /login and /auth/check.
*/
app.use(authRoutes);
app.use('/auth', authRoutes);
app.use('/availability', availabilityRoutes);
app.use(settingsRoutes);           // provides /settings
app.use('/users', usersRoutes);    // provides /users/*

/* ===== Temporary debug endpoints (remove once stable) ===== */
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
    console.error('[dbping] error', e);
    res.status(500).json({ ok: false, error: e.message });
  }
});

/* Final error handler (server logs only; generic message to clients) */
app.use((err, _req, res, _next) => {
  console.error('[express:error]', err && err.stack ? err.stack : err);
  res.status(500).json({ error: 'internal server error' });
});

/* Start server */
const PORT = Number(process.env.PORT || 3000);
app.listen(PORT, () => {
  console.log(`Backend listening on port ${PORT}`);
});
