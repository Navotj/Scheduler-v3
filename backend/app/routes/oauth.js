// OAuth routes: Google, GitHub, Discord (PKCE + state; no external deps)
const express = require('express');
const crypto = require('crypto');
const userModel = require('../models/user');
const { generateToken } = require('../utils/jwt');

const router = express.Router();

router.use((req, res, next) => {
  res.set('Cache-Control', 'no-store');
  next();
});

function isSecure() {
  return String(process.env.COOKIE_SECURE).toLowerCase() === 'true';
}
function setCookie(res, name, value, maxAgeMs) {
  res.cookie(name, value, {
    httpOnly: true,
    sameSite: 'Lax',
    secure: isSecure(),
    path: '/auth/oauth',
    domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com',
    maxAge: maxAgeMs
  });
}
function clearTempCookies(res) {
  ['oauth_state', 'oauth_verifier', 'oauth_return', 'oauth_provider'].forEach((n) =>
    res.clearCookie(n, {
      httpOnly: true,
      sameSite: 'Lax',
      secure: isSecure(),
      path: '/auth/oauth',
      domain: process.env.COOKIE_DOMAIN || '.nat20scheduling.com'
    })
  );
}
function b64url(buf) {
  return Buffer.from(buf).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}
function sha256(input) {
  return crypto.createHash('sha256').update(input).digest();
}
function codeChallenge(verifier) {
  return b64url(sha256(verifier));
}
function randStr(bytes = 32) {
  return b64url(crypto.randomBytes(bytes));
}
function sanitizeReturnTo(input) {
  try {
    if (!input) return '/';
    // Only accept same-origin paths. Strip origin if present.
    const origin = process.env.OAUTH_CALLBACK_ORIGIN || 'https://www.nat20scheduling.com';
    const u = new URL(input, origin);
    if (u.origin !== origin) return '/';
    return u.pathname + (u.search || '') + (u.hash || '');
  } catch {
    return '/';
  }
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
function cbUrl(provider) {
  const origin = process.env.OAUTH_CALLBACK_ORIGIN || 'https://www.nat20scheduling.com';
  return `${origin}/api/auth/oauth/${provider}/callback`;
}

const cfg = {
  google: {
    authUrl: 'https://accounts.google.com/o/oauth2/v2/auth',
    tokenUrl: 'https://oauth2.googleapis.com/token',
    userUrl: 'https://openidconnect.googleapis.com/v1/userinfo',
    scope: 'openid email profile',
    id: process.env.OAUTH_GOOGLE_CLIENT_ID,
    secret: process.env.OAUTH_GOOGLE_CLIENT_SECRET
  },
  github: {
    authUrl: 'https://github.com/login/oauth/authorize',
    tokenUrl: 'https://github.com/login/oauth/access_token',
    userUrl: 'https://api.github.com/user',
    emailsUrl: 'https://api.github.com/user/emails',
    scope: 'read:user user:email',
    id: process.env.OAUTH_GITHUB_CLIENT_ID,
    secret: process.env.OAUTH_GITHUB_CLIENT_SECRET
  },
  discord: {
    authUrl: 'https://discord.com/api/oauth2/authorize',
    tokenUrl: 'https://discord.com/api/oauth2/token',
    userUrl: 'https://discord.com/api/users/@me',
    scope: 'identify email',
    id: process.env.OAUTH_DISCORD_CLIENT_ID,
    secret: process.env.OAUTH_DISCORD_CLIENT_SECRET
  }
};

// ===== Start =====
router.get('/:provider/start', async (req, res) => {
  const reqId = req.__reqId || '-';
  const provider = String(req.params.provider || '').toLowerCase();
  if (!cfg[provider]) return res.status(400).json({ error: 'unknown_provider' });

  const c = cfg[provider];
  if (!c.id || !c.secret) {
    return res.status(500).json({ error: 'provider_not_configured' });
  }

  const state = randStr(24);
  const verifier = randStr(64);
  const challenge = codeChallenge(verifier);
  const returnTo = sanitizeReturnTo(req.query.returnTo);

  setCookie(res, 'oauth_state', state, 10 * 60 * 1000);
  setCookie(res, 'oauth_verifier', verifier, 10 * 60 * 1000);
  setCookie(res, 'oauth_return', returnTo, 10 * 60 * 1000);
  setCookie(res, 'oauth_provider', provider, 10 * 60 * 1000);

  const params = new URLSearchParams({
    client_id: c.id,
    redirect_uri: cbUrl(provider),
    response_type: 'code',
    scope: c.scope,
    state,
    code_challenge: challenge,
    code_challenge_method: 'S256'
  });

  const url = `${c.authUrl}?${params.toString()}`;
  console.log(`[OAUTH][${reqId}] start -> ${provider}`, { returnTo });
  return res.redirect(url);
});

// ===== Callback =====
router.get('/:provider/callback', async (req, res) => {
  const reqId = req.__reqId || '-';
  const provider = String(req.params.provider || '').toLowerCase();
  if (!cfg[provider]) return res.status(400).send('unknown_provider');

  const c = cfg[provider];
  try {
    const storedProvider = req.cookies.oauth_provider;
    const stateCookie = req.cookies.oauth_state;
    const verifier = req.cookies.oauth_verifier;
    const returnTo = req.cookies.oauth_return || '/';

    if (!storedProvider || storedProvider !== provider) {
      return res.status(400).send('provider_mismatch');
    }
    if (!stateCookie || stateCookie !== req.query.state) {
      return res.status(400).send('state_mismatch');
    }
    if (!verifier) {
      return res.status(400).send('missing_verifier');
    }

    const code = String(req.query.code || '');
    if (!code) return res.status(400).send('missing_code');

    let email = null;
    let emailVerified = false;
    let providerId = null;
    let displayName = null;
    let avatarUrl = null;

    // Exchange code -> token
    if (provider === 'google') {
      const resp = await fetch(c.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.id,
          client_secret: c.secret,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: cbUrl('google')
        })
      });
      const tok = await resp.json();
      if (!resp.ok || tok.error) {
        console.error(`[OAUTH][${reqId}] google token error`, tok);
        return res.status(400).send('token_exchange_failed');
      }
      const ui = await fetch(c.userUrl, {
        headers: { Authorization: `Bearer ${tok.access_token}` }
      }).then((r) => r.json());
      email = ui.email || null;
      emailVerified = ui.email_verified === true;
      providerId = ui.sub ? String(ui.sub) : null;
      displayName = ui.name || null;
      avatarUrl = ui.picture || null;
      if (!email || !emailVerified) return res.status(403).send('email_required');
    }

    if (provider === 'github') {
      const resp = await fetch(c.tokenUrl, {
        method: 'POST',
        headers: { 'accept': 'application/json', 'content-type': 'application/json' },
        body: JSON.stringify({
          client_id: c.id,
          client_secret: c.secret,
          code,
          redirect_uri: cbUrl('github'),
          code_verifier: verifier
        })
      });
      const tok = await resp.json();
      if (!resp.ok || tok.error) {
        console.error(`[OAUTH][${reqId}] github token error`, tok);
        return res.status(400).send('token_exchange_failed');
      }
      const headers = { Authorization: `Bearer ${tok.access_token}`, 'User-Agent': 'nat20-scheduling' };
      const profile = await fetch(c.userUrl, { headers }).then((r) => r.json());
      const emails = await fetch(c.emailsUrl, { headers }).then((r) => r.json());
      const primary = Array.isArray(emails) ? (emails.find(e => e.primary && e.verified) || emails.find(e => e.verified) || emails[0]) : null;
      email = primary && primary.email ? String(primary.email) : null;
      emailVerified = !!(primary && primary.verified);
      providerId = profile && profile.id ? String(profile.id) : null;
      displayName = (profile && (profile.name || profile.login)) || null;
      avatarUrl = (profile && profile.avatar_url) || null;
      if (!email || !emailVerified) return res.status(403).send('email_required');
    }

    if (provider === 'discord') {
      const resp = await fetch(c.tokenUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          client_id: c.id,
          client_secret: c.secret,
          code,
          code_verifier: verifier,
          grant_type: 'authorization_code',
          redirect_uri: cbUrl('discord')
        })
      });
      const tok = await resp.json();
      if (!resp.ok || tok.error) {
        console.error(`[OAUTH][${reqId}] discord token error`, tok);
        return res.status(400).send('token_exchange_failed');
      }
      const ui = await fetch(c.userUrl, {
        headers: { Authorization: `Bearer ${tok.access_token}` }
      }).then((r) => r.json());
      providerId = ui && ui.id ? String(ui.id) : null;
      // Discord may omit email if not verified or not granted
      email = ui && ui.email ? String(ui.email) : null;
      const verified = ui && (ui.verified === true);
      emailVerified = !!verified;
      displayName = (ui && (ui.global_name || ui.username)) || null;
      if (ui && ui.avatar) {
        avatarUrl = `https://cdn.discordapp.com/avatars/${ui.id}/${ui.avatar}.png`;
      }
      if (!email || !emailVerified) return res.status(403).send('email_required');
    }

    // Upsert user
    let user = await userModel.findOne({ email });
    if (!user) {
      user = await userModel.create({
        email,
        emailVerifiedAt: emailVerified ? new Date() : null,
        displayName: displayName || null,
        avatarUrl: avatarUrl || null,
        providers: [{ name: provider, id: providerId }]
      });
      console.log(`[OAUTH][${reqId}] user created`, { id: String(user._id), provider, email });
    } else {
      await userModel.updateOne(
        { _id: user._id },
        {
          $set: {
            emailVerifiedAt: user.emailVerifiedAt || (emailVerified ? new Date() : null),
            displayName: user.displayName || (displayName || null),
            avatarUrl: user.avatarUrl || (avatarUrl || null)
          },
          $addToSet: { providers: { name: provider, id: providerId } }
        }
      );
      user = await userModel.findById(user._id);
      console.log(`[OAUTH][${reqId}] user linked`, { id: String(user._id), provider });
    }

    const jwt = generateToken(user);
    setSessionCookie(res, jwt);

    clearTempCookies(res);

    // If username missing, append flag so frontend opens username modal
    let dest = sanitizeReturnTo(returnTo || '/');
    if (!user.username) {
      const u = new URL(dest, process.env.OAUTH_CALLBACK_ORIGIN || 'https://www.nat20scheduling.com');
      u.searchParams.set('needsUsername', '1');
      dest = u.pathname + u.search + u.hash;
    }

    console.log(`[OAUTH][${reqId}] success -> redirect`, { dest, user: String(user._id) });
    return res.redirect(dest);
  } catch (err) {
    console.error(`[OAUTH][${reqId}] callback error`, err);
    try { clearTempCookies(res); } catch (_) {}
    return res.status(500).send('oauth_error');
  }
});

module.exports = router;
