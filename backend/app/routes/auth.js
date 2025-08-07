const express = require('express');
const router = express.Router();
const userModel = require('../models/user');
const { generateToken, verifyToken } = require('../utils/jwt');
const { body, validationResult } = require('express-validator');

// register new user
router.post('/register',
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

    console.log('Saving user:', user);
    
    await user.setPassword(password);
    await user.save();

    res.status(201).json({ success: true });
  }
);

// login and set jwt cookie -
router.post('/login',
  body('email').isEmail(),
  body('password').notEmpty(),
  async (req, res) => {
    const { email, password } = req.body;
    const user = await userModel.findOne({ email });
    if (!user || !(await user.validatePassword(password)))
      return res.status(401).json({ error: 'invalid credentials' });

    const token = generateToken(user);
    res.cookie('token', token, {
      httpOnly: true,
      sameSite: 'Strict',
      secure: true
    });

    res.json({ success: true });
  }
);

// check jwt validity
router.get('/auth/check', (req, res) => {
  const token = req.cookies.token;
  try {
    verifyToken(token);
    res.sendStatus(200);
  } catch {
    res.sendStatus(401);
  }
});

// logout
router.post('/logout', (req, res) => {
  res.clearCookie('token');
  res.json({ success: true });
});

module.exports = router;
