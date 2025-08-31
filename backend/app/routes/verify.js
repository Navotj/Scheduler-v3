const express = require('express');
const crypto = require('crypto');
const Token = require('../models/token');
const User = require('../models/user');

const router = express.Router();

function hashToken(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}

router.get('/verify', async (req, res) => {
  const reqId = req.__reqId || '-';
  const raw = String(req.query.token || '');
  if (!raw) return res.status(400).send('missing token');

  try {
    const hashed = hashToken(raw);
    const tok = await Token.findOne({ type: 'verify', hash: hashed, usedAt: null }).lean();
    if (!tok || (tok.expiresAt && tok.expiresAt < new Date())) {
      console.warn(`[AUTH][${reqId}] verify: invalid/expired`);
      const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?verified=invalid';
      return res.redirect(302, dest);
    }

    const user = await User.findById(tok.userId);
    if (!user) {
      console.warn(`[AUTH][${reqId}] verify: user not found`);
      const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?verified=invalid';
      return res.redirect(302, dest);
    }

    user.isVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    await Token.updateOne({ _id: tok._id }, { $set: { usedAt: new Date() } });

    console.log(`[AUTH][${reqId}] verify: success`, { id: String(user._id), username: user.username });
    const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?verified=success';
    return res.redirect(302, dest);
  } catch (e) {
    console.error(`[AUTH] verify error`, e);
    return res.status(500).send('internal server error');
  }
});

router.post('/verify', async (req, res) => {
  const reqId = req.__reqId || '-';
  const raw = String((req.body && req.body.token) || '');
  if (!raw) return res.status(400).json({ error: 'missing token' });
  try {
    const hashed = hashToken(raw);
    const tok = await Token.findOne({ type: 'verify', hash: hashed, usedAt: null }).lean();
    if (!tok || (tok.expiresAt && tok.expiresAt < new Date())) {
      console.warn(`[AUTH][${reqId}] verify: invalid/expired`);
      return res.status(400).json({ error: 'invalid or expired token' });
    }
    const user = await User.findById(tok.userId);
    if (!user) return res.status(400).json({ error: 'invalid token' });

    user.isVerified = true;
    user.emailVerifiedAt = new Date();
    await user.save();
    await Token.updateOne({ _id: tok._id }, { $set: { usedAt: new Date() } });

    return res.json({ success: true });
  } catch (e) {
    console.error(`[AUTH][${reqId}] verify error`, e);
    return res.status(500).json({ error: 'internal server error' });
  }
});

module.exports = router;
