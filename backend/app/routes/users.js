const express = require('express');
const router = express.Router();
const userModel = require('../models/user');

// GET /users/exists?username=NAME  -> { exists: true|false }
router.get('/exists', async (req, res) => {
  try {
    const raw = (req.query.username || '').trim();
    if (!raw) return res.status(400).json({ error: 'username required' });
    // usernames are stored as provided (trimmed) — match exact
    const found = await userModel.findOne({ username: raw }).select('_id').lean();
    res.json({ exists: !!found });
  } catch (e) {
    res.status(500).json({ error: 'lookup failed' });
  }
});

module.exports = router;
