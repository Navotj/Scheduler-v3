'use strict';

/**
 * JWT utilities: RS256 (preferred) with env-configurable claims and TTLs.
 * Requires: npm install jsonwebtoken
 */

const jwt = require('jsonwebtoken');

// ---- Configuration via ENV ----
const ALG = (process.env.JWT_ALG || 'RS256').toUpperCase(); // 'RS256' or 'HS256'
const ISS = process.env.JWT_ISS || 'https://api.nat20scheduling.com';
const AUD = process.env.JWT_AUD || 'nat20';
const ACCESS_TTL = process.env.JWT_ACCESS_TTL || '15m';
const REFRESH_TTL = process.env.JWT_REFRESH_TTL || '7d';
const KID = process.env.JWT_KID || 'v1';

// Keys/secret
let signKey;
let verifyKeys = [];

/* RS256 preferred: private key for signing, public key(s) for verification.
   - JWT_PRIVATE_KEY_PEM: PEM string for signing
   - JWT_PUBLIC_KEY_PEM: PEM string for verification (single)
   - JWT_PUBLIC_KEYS_PEM: multiple PEMs joined by \n-----END PUBLIC KEY-----\n-----BEGIN PUBLIC KEY-----\n
*/
if (ALG === 'RS256') {
  const priv = process.env.JWT_PRIVATE_KEY_PEM;
  const pubSingle = process.env.JWT_PUBLIC_KEY_PEM;
  const pubMulti = process.env.JWT_PUBLIC_KEYS_PEM;

  if (!priv || !(pubSingle || pubMulti)) {
    throw new Error('RS256 selected but JWT_PRIVATE_KEY_PEM and JWT_PUBLIC_KEY_PEM(S) not fully provided');
  }
  signKey = priv;
  if (pubMulti && pubMulti.trim()) {
    // split by PEM boundary safely
    verifyKeys = pubMulti
      .split(/-----END PUBLIC KEY-----\s*-----BEGIN PUBLIC KEY-----/g)
      .map((chunk, idx, arr) => {
        if (!chunk.includes('BEGIN PUBLIC KEY')) chunk = '-----BEGIN PUBLIC KEY-----\n' + chunk;
        if (!chunk.includes('END PUBLIC KEY')) chunk = chunk + '\n-----END PUBLIC KEY-----\n';
        return chunk;
      });
  } else {
    verifyKeys = [pubSingle];
  }
} else if (ALG === 'HS256') {
  const secret = process.env.JWT_SECRET;
  if (!secret) throw new Error('HS256 selected but JWT_SECRET not set');
  signKey = secret;
  verifyKeys = [secret];
} else {
  throw new Error(`Unsupported JWT_ALG: ${ALG}`);
}

const commonHeaders = { alg: ALG, typ: 'JWT', kid: KID };
const verifyOptions = {
  algorithms: [ALG],
  audience: AUD,
  issuer: ISS,
  clockTolerance: 5, // seconds
  complete: false
};

function basePayload(userOrSub, extra = {}) {
  const sub = typeof userOrSub === 'string' ? userOrSub : String(userOrSub?._id || userOrSub?.id || '');
  if (!sub) throw new Error('Cannot issue token without subject');
  return {
    iss: ISS,
    aud: AUD,
    sub,
    jti: extra.jti || require('crypto').randomUUID(),
    ...extra
  };
}

// ----- Issue tokens -----
function issueAccessToken(user, extra = {}) {
  const payload = basePayload(user, extra);
  return jwt.sign(payload, signKey, {
    algorithm: ALG,
    audience: AUD,
    issuer: ISS,
    expiresIn: ACCESS_TTL,
    header: commonHeaders
  });
}

function issueRefreshToken(userOrSub, extra = {}) {
  const payload = basePayload(userOrSub, extra);
  return jwt.sign(payload, signKey, {
    algorithm: ALG,
    audience: AUD,
    issuer: ISS,
    expiresIn: REFRESH_TTL,
    header: { ...commonHeaders, typ: 'JWT' }
  });
}

// ----- Verify tokens (try each verify key for rotation support) -----
function verifyToken(token) {
  let lastErr;
  for (const k of verifyKeys) {
    try {
      return jwt.verify(token, k, verifyOptions);
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr || new Error('JWT verification failed');
}

function verifyAccessToken(token) {
  return verifyToken(token);
}
function verifyRefreshToken(token) {
  return verifyToken(token);
}

// ----- Extract from request -----
// Order: Authorization: Bearer <token> -> cookie "token" -> query ?token= (debug only)
function parseTokenFromReq(req) {
  const h = req.headers?.authorization || '';
  const m = /^Bearer\s+(.+)$/i.exec(h);
  if (m) return m[1];
  if (req.cookies && typeof req.cookies.token === 'string' && req.cookies.token.trim()) {
    return req.cookies.token.trim();
  }
  if (process.env.ALLOW_QUERY_TOKEN === 'true' && req.query && typeof req.query.token === 'string') {
    return req.query.token.trim();
  }
  return null;
}

// ----- Express middleware -----
function requireAuth(req, res, next) {
  try {
    const token = parseTokenFromReq(req);
    if (!token) return res.status(401).json({ error: 'missing token' });
    const payload = verifyAccessToken(token);
    // Attach to req: subject and claims
    req.auth = { sub: payload.sub, jti: payload.jti, claims: payload };
    return next();
  } catch (e) {
    return res.status(401).json({ error: 'invalid token' });
  }
}

module.exports = {
  issueAccessToken,
  issueRefreshToken,
  verifyAccessToken,
  verifyRefreshToken,
  parseTokenFromReq,
  requireAuth,
};
