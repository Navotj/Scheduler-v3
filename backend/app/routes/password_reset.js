const express = require('express');
const { body } = require('express-validator');
const crypto = require('crypto');
const User = require('../models/user');
const Token = require('../models/token');
const { sendPasswordResetEmail } = require('../utils/mailer');

const router = express.Router();

// accept form posts from the HTML page this router serves
router.use(express.urlencoded({ extended: false }));

function urlSafeBase64(buf) {
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function genTokenStr() {
  return urlSafeBase64(crypto.randomBytes(32));
}
function hashToken(str) {
  return crypto.createHash('sha256').update(str).digest('hex');
}
function ttlMinutes(envKey, fallback) {
  const n = Number(process.env[envKey]);
  return Number.isFinite(n) && n > 0 ? n : fallback;
}
function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
}
function wantsHtml(req) {
  const ct = String(req.headers['content-type'] || '').toLowerCase();
  const acc = String(req.headers['accept'] || '').toLowerCase();
  return ct.includes('application/x-www-form-urlencoded') || acc.includes('text/html');
}
function isSecure() {
  return String(process.env.COOKIE_SECURE).toLowerCase() === 'true';
}

// ================================
// Request password reset (idempotent)
// ================================
router.post(
  '/request-reset',
  body('email').optional().isEmail(),
  body('username').optional().isString().notEmpty(),
  async (req, res) => {
    const reqId = req.__reqId || '-';
    try {
      const { email, username } = req.body || {};
      let user = null;
      if (email) user = await User.findOne({ email }).lean();
      else if (username) user = await User.findOne({ username }).lean();

      if (user) {
        try {
          const raw = genTokenStr();
          const hashed = hashToken(raw);
          const expiresAt = new Date(Date.now() + ttlMinutes('RESET_TOKEN_TTL_MIN', 30) * 60000);
          await Token.create({ userId: user._id, type: 'reset', hash: hashed, expiresAt });
          await sendPasswordResetEmail(user, raw, reqId);
          console.log(`[AUTH][${reqId}] reset email queued`, { username: user.username });
        } catch (e) {
          console.error(`[AUTH][${reqId}] reset email error`, e);
        }
      } else {
        console.warn(`[AUTH][${reqId}] request-reset: user not found`);
      }

      // Always return generic success to avoid account enumeration
      return res.json({ success: true });
    } catch (e) {
      console.error(`[AUTH][${reqId}] request-reset error`, e);
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

// ================================
// Simple HTML reset form (served by backend)
// ================================
router.get('/reset', async (req, res) => {
  const token = String(req.query.token || '');
  if (!token) return res.status(400).send('missing token');
  const html = `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Reset password</title>
</head>
<body style="margin:0;background:#0a0b0d;color:#e7eaf2;font-family:system-ui,-apple-system,Segoe UI,Roboto,Ubuntu,Arial,sans-serif">
  <div style="max-width:420px;margin:48px auto;background:#121315;border:1px solid #1a1c20;border-radius:10px;padding:16px">
    <h1 style="margin:0 0 12px 0;font-size:20px">Set a new password</h1>
    <form method="POST" action="/auth/reset" style="display:grid;gap:10px">
      <input type="hidden" name="token" value="${escapeHtml(token)}">
      <label>New password
        <input name="password" type="password" required minlength="6" style="width:100%;height:36px;border-radius:8px;border:1px solid #1a1c20;background:#0c0d10;color:#e7eaf2;padding:0 10px">
      </label>
      <label>Confirm password
        <input name="confirm" type="password" required minlength="6" style="width:100%;height:36px;border-radius:8px;border:1px solid #1a1c20;background:#0c0d10;color:#e7eaf2;padding:0 10px">
      </label>
      <div style="display:flex;gap:8px;justify-content:flex-end">
        <button type="submit" style="height:34px;padding:0 14px;border-radius:8px;border:1px solid rgba(124,92,255,0.5);background:rgba(124,92,255,0.15);color:#e7eaf2;cursor:pointer">Update password</button>
      </div>
    </form>
  </div>
</body></html>`;
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.send(html);
});

// ================================
// Consume reset token and set new password
// Supports both JSON and form POST
// ================================
router.post(
  '/reset',
  body('token').isString().notEmpty(),
  body('password').isString().isLength({ min: 6 }),
  async (req, res) => {
    const reqId = req.__reqId || '-';
    try {
      const tokenRaw = String((req.body && req.body.token) || '');
      const password = String((req.body && req.body.password) || '');
      const confirm = String((req.body && req.body.confirm) || '');

      if (confirm && confirm !== password) {
        if (wantsHtml(req)) {
          const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?reset=nomatch';
          return res.redirect(302, dest);
        }
        return res.status(400).json({ error: 'passwords do not match' });
      }

      const hashed = hashToken(tokenRaw);
      const tok = await Token.findOne({ type: 'reset', hash: hashed, usedAt: null });
      if (!tok || (tok.expiresAt && tok.expiresAt < new Date())) {
        console.warn(`[AUTH][${reqId}] reset: invalid/expired`);
        if (wantsHtml(req)) {
          const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?reset=invalid';
          return res.redirect(302, dest);
        }
        return res.status(400).json({ error: 'invalid or expired token' });
      }

      const user = await User.findById(tok.userId);
      if (!user) {
        console.warn(`[AUTH][${reqId}] reset: user not found`);
        if (wantsHtml(req)) {
          const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?reset=invalid';
          return res.redirect(302, dest);
        }
        return res.status(400).json({ error: 'invalid token' });
      }

      await user.setPassword(password);
      await user.save();
      tok.usedAt = new Date();
      await tok.save();

      // best-effort: clear any existing session cookie
      try {
        res.clearCookie('token', {
          httpOnly: true,
          sameSite: 'Lax',
          secure: isSecure(),
          path: '/',
          domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com'
        });
      } catch (_) {}

      if (wantsHtml(req)) {
        const dest = (process.env.PUBLIC_FRONTEND_URL || '/') + '?reset=success';
        return res.redirect(302, dest);
      }
      return res.json({ success: true });
    } catch (e) {
      console.error(`[AUTH][${reqId}] reset error`, e);
      if (wantsHtml(req)) return res.redirect(302, (process.env.PUBLIC_FRONTEND_URL || '/') + '?reset=error');
      return res.status(500).json({ error: 'internal server error' });
    }
  }
);

module.exports = router;
