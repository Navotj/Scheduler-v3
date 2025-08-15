const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const { generateToken, verifyToken } = require('../utils/jwt');
const { body, validationResult } = require('express-validator');

// register new user
router.post(
  '/register',
  body('email').isEmail(),
  body('username').isLength({ min: 3 }),
  body('password').isLength({ min: 6 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const { email, username, password } = req.body;

    const existingEmail = await userModel.findOne({ email });
    if (existingEmail) return res.status(400).json({ error: 'email already registered' });

    const existingUsername = await userModel.findOne({ username });
    if (existingUsername) return res.status(400).json({ error: 'username already taken' });

    const user = new userModel({
      email: email.trim().toLowerCase(),
      username: username.trim()
    });

    await user.setPassword(password);
    await user.save();

    res.status(201).json({ success: true });
  }
);

// login and set jwt cookie
router.post(
  '/login',
  body('username').isString().notEmpty(),
  body('password').notEmpty(),
  async (req, res) => {
    const { username, password } = req.body;
    const user = await userModel.findOne({ username });
    if (!user || !(await user.validatePassword(password)))
      return res.status(401).json({ error: 'invalid credentials' });

    const token = generateToken(user);

    // Ensure app.js has: app.set('trust proxy', true);
    // COOKIE_SECURE must be "true" in .env so cookie is marked Secure.
    const secure = String(process.env.COOKIE_SECURE).toLowerCase() === 'true';

    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: secure,
      path: '/',
      // Explicit domain ensures cookie is scoped correctly
      domain: '.nat20scheduling.com'
    });

    res.json({ success: true });
  }
);


// check jwt validity (returns username to populate UI)
router.get('/auth/check', async (req, res) => {
  const token = req.cookies.token;
  try {
    const payload = verifyToken(token);
    const user = await userModel.findById(payload.id).select('username email').lean();
    if (!user) return res.sendStatus(401);
    res.status(200).json({ username: user.username, email: user.email });
  } catch {
    res.sendStatus(401);
  }
});

// logout
router.post('/logout', (req, res) => {
  res.clearCookie('token', { path: '/' });
  res.json({ success: true });
});

module.exports = router;
