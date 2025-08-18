// Auth routes with verbose logging
const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
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

// REGISTER
router.post(
  '/register',
  body('email').isEmail(),
  body('username').isString().notEmpty(),
  body('password').isString().isLength({ min: 6 }),
  async (req, res) => {
    const reqId = req.__reqId || '-';
    try {
      const { email, username } = req.body;
      console.log(`[AUTH][${reqId}] register attempt`, { email, username });

      const existing = await userModel.findOne({ username }).lean();
      if (existing) {
        console.warn(`[AUTH][${reqId}] register conflict: username exists`, { username });
        return res.status(409).json({ error: 'username already exists' });
      }

      const user = new userModel({ email, username });
      await user.setPassword(req.body.password);
      await user.save();

      console.log(`[AUTH][${reqId}] register success`, { id: String(user._id), username });
      return res.json({ success: true, user: { id: String(user._id), username } });
    } catch (err) {
      console.error(`[AUTH][${reqId}] register error`, err);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

// LOGIN
router.post(
  '/login',
  body('username').isString().notEmpty(),
  body('password').notEmpty(),
  async (req, res) => {
    const reqId = req.__reqId || '-';
    try {
      res.set('Cache-Control', 'no-store');

      const { username } = req.body;
      console.log(`[AUTH][${reqId}] login attempt`, { username });

      const user = await userModel.findOne({ username });
      if (!user) {
        console.warn(`[AUTH][${reqId}] login failed: user not found`, { username });
        return res.status(401).json({ error: 'invalid credentials' });
      }

      const ok = await user.validatePassword(req.body.password);
      if (!ok) {
        console.warn(`[AUTH][${reqId}] login failed: bad password`, { username });
        return res.status(401).json({ error: 'invalid credentials' });
      }

      // MISSING BEFORE — generate the JWT
      const token = generateToken(user);

      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: isSecure(),
        path: '/',
        domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com',
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      console.log(`[AUTH][${reqId}] login success`, { username, id: String(user._id) });
      return res.json({
        success: true,
        user: { username: user.username, id: String(user._id || '') }
      });
    } catch (err) {
      console.error(`[AUTH][${reqId}] login error`, err);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

// CHECK
router.get('/check', async (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    res.set('Cache-Control', 'no-store');

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
    return res.json({ success: true, user: { username: decoded.username, id: decoded.id } });
  } catch (err) {
    console.error(`[AUTH][${reqId}] check error`, err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    res.set('Cache-Control', 'no-store');

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

module.exports = router;
