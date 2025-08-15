const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userModel = require('./user');
const { generateToken, verifyToken } = require('./jwt');
const cookieDomain = '.nat20scheduling.com';

// REGISTER
router.post(
  '/register',
  body('email').isEmail(),
  body('username').isString().notEmpty(),
  body('password').isString().isLength({ min: 6 }),
  async (req, res) => {
    try {
      const { email, username, password } = req.body;

      const existing = await userModel.findOne({ username }).lean();
      if (existing) return res.status(409).json({ error: 'username already exists' });

      const user = new userModel({ email, username });
      await user.setPassword(password);
      await user.save();

      return res.json({ success: true });
    } catch (err) {
      console.error('Register error:', err);
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
    try {
      const { username, password } = req.body;
      const user = await userModel.findOne({ username });
      if (!user || !(await user.validatePassword(password))) {
        return res.status(401).json({ error: 'invalid credentials' });
      }

      const token = generateToken(user);
      const secure = String(process.env.COOKIE_SECURE).toLowerCase() === 'true';

      res.cookie('token', token, {
        httpOnly: true,
        sameSite: 'Lax',
        secure: secure,
        path: '/',
        domain: cookieDomain,
        maxAge: 7 * 24 * 60 * 60 * 1000
      });

      return res.json({
        success: true,
        user: { username: user.username, id: String(user._id || '') }
      });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

// CHECK
router.get('/check', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) return res.status(401).json({ error: 'no session' });

    const decoded = verifyToken(token);
    if (!decoded) return res.status(401).json({ error: 'invalid token' });

    return res.json({ success: true, user: { username: decoded.username, id: decoded.id } });
  } catch (err) {
    console.error('Auth check error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// LOGOUT
router.post('/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
      path: '/',
      domain: cookieDomain
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
