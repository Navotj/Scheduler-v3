const express = require('express');
const router = express.Router();
const { body } = require('express-validator');
const userModel = require('./user');
const { generateToken, verifyToken } = require('./jwt');

// login and set jwt cookie
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
        domain: '.nat20scheduling.com',
        maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
      });

      return res.json({ success: true });
    } catch (err) {
      console.error('Login error:', err);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

// check session
router.get('/check', async (req, res) => {
  try {
    const token = req.cookies.token;
    if (!token) {
      return res.status(401).json({ error: 'no session' });
    }
    const decoded = verifyToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'invalid token' });
    }
    return res.json({ success: true, user: decoded });
  } catch (err) {
    console.error('Auth check error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

// logout and clear cookie
router.post('/logout', (req, res) => {
  try {
    res.clearCookie('token', {
      httpOnly: true,
      sameSite: 'Lax',
      secure: String(process.env.COOKIE_SECURE).toLowerCase() === 'true',
      path: '/',
      domain: '.nat20scheduling.com'
    });
    return res.json({ success: true });
  } catch (err) {
    console.error('Logout error:', err);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
