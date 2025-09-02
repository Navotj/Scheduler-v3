// Auth routes (OAuth-first) with verbose logging
const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const { generateToken, verifyToken } = require('../utils/jwt');

// make all /auth/* responses non-cacheable
router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function isSecure() {
  return String(process.env.COOKIE_SECURE).toLowerCase() === 'true';
}

function setSessionCookie(res, token) {
  res.cookie('token', token, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure(),
    path: '/',
    domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com',
    maxAge: 7 * 24 * 60 * 60 * 1000
  });
}

// CHECK (JWT cookie)
router.get('/check', async (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    const token = req.cookies.token;
    if (!token) {
      console.warn(`[AUTH][${reqId}] check: no cookie`);
      return res.status(401).json({ error: 'no session' });
    }

    const decoded = verifyToken(token);
    if (!decoded) {
      console.warn(`[AUTH][${reqId}] check: invalid token`);
      return res.status(401).json({ error: 'invalid token' });
    }

    console.log(`[AUTH][${reqId}] check: ok`, { username: decoded.username, id: decoded.id });
    return res.json({ success: true, user: { username: decoded.username || null, id: decoded.id } });
  } catch (err) {
    console.error(`[AUTH][${reqId}] check error`, err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecure(),
      path: '/',
      domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com'
    });
    console.log(`[AUTH][${reqId}] logout success`);
    return res.json({ success: true });
  } catch (err) {
    console.error(`[AUTH][${reqId}] logout error`, err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// Set username (once, after OAuth). Enforces uniqueness.
router.post('/username', async (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'no session' });
    const decoded = verifyToken(token);
    if (!decoded || !decoded.id) return res.status(401).json({ error: 'invalid token' });

    const desired = String((req.body && req.body.username) || '').trim();
    // Basic policy: 3..24 chars, letters/digits/underscore
    if (!/^[A-Za-z0-9_]{3,24}$/.test(desired)) {
      return res.status(400).json({ error: 'invalid_username' });
    }

    const user = await userModel.findById(decoded.id);
    if (!user) return res.status(401).json({ error: 'invalid session' });
    if (user.username) {
      return res.status(409).json({ error: 'username_already_set' });
    }

    const conflict = await userModel.findOne({ username: desired }).lean();
    if (conflict) {
      return res.status(409).json({ error: 'username_taken' });
    }

    user.username = desired;
    await user.save();

    const newJwt = generateToken(user);
    setSessionCookie(res, newJwt);

    console.log(`[AUTH][${reqId}] username set`, { id: String(user._id), username: user.username });
    return res.json({ success: true, user: { id: String(user._id), username: user.username } });
  } catch (err) {
    console.error(`[AUTH][${reqId}] username error`, err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
