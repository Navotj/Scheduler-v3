// Users utility routes with verbose logging
const express = require('express');
const router = express.Router();
const userModel = require('../models/user');

// GET /users/exists?username=foo
router.get('/exists', async (req, res) => {
  const reqId = req.__reqId || '-';
  try {
    const username = (req.query.username ?? '').toString().trim();
    console.log(`[USERS][${reqId}] exists check`, { username });

    if (!username) {
      console.warn(`[USERS][${reqId}] exists: missing username`);
      return res.status(400).json({ error: 'username required' });
    }

    // prevent any intermediary caching of existence checks
    res.set('Cache-Control', 'no-store');

    // Case-insensitive exact match (e.g., "eeeee" === "EEEEE")
    const found = await userModel
      .findOne({ username })
      .collation({ locale: 'en', strength: 2 })
      .select({ _id: 1 })
      .lean();

    const exists = !!found;

    console.log(`[USERS][${reqId}] exists result`, { username, exists });
    return res.json({ exists });
  } catch (err) {
    console.error(`[USERS][${reqId}] exists error`, err);
    return res.status(500).json({ error: 'internal server error' });
  }
});


module.exports = router;
