const express = require('express');
const router = express.Router();
const Availability = require('../models/availability');
const User = require('../models/user');
const { verifyToken } = require('../utils/jwt');
const { body, query, validationResult } = require('express-validator');

// auth middleware using JWT cookie
function requireAuth(req, res, next) {
  try {
    const token = req.cookies.token;
    const payload = verifyToken(token);
    req.user = { id: payload.id, email: payload.email, username: payload.username };
    next();
  } catch {
    res.sendStatus(401);
  }
}

// GET intervals for the current user within [from, to) epoch seconds (UTC)
router.get(
  '/get',
  requireAuth,
  query('from').isInt({ min: 0 }).toInt(),
  query('to').isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const from = Number(req.query.from);
    const to = Number(req.query.to);
    if (!(to > from)) return res.status(400).json({ error: '`to` must be greater than `from`' });

    const docs = await Availability
      .find({ userId: req.user.id, from: { $lt: to }, to: { $gt: from } })
      .sort({ from: 1 })
      .lean();

    const intervals = docs.map(d => ({ from: d.from, to: d.to }));
    res.json({ intervals });
  }
);

// POST replace all intervals for the current user within [from, to) with provided intervals (epoch seconds, UTC)
router.post(
  '/save',
  requireAuth,
  body('from').isInt({ min: 0 }).toInt(),
  body('to').isInt({ min: 1 }).toInt(),
  body('intervals').isArray({ min: 0 }),
  body('intervals.*.from').optional().isInt({ min: 0 }).toInt(),
  body('intervals.*.to').optional().isInt({ min: 1 }).toInt(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const rangeFrom = Number(req.body.from);
    const rangeTo = Number(req.body.to);
    if (!(rangeTo > rangeFrom)) return res.status(400).json({ error: '`to` must be greater than `from`' });

    // Normalize & validate intervals
    const raw = Array.isArray(req.body.intervals) ? req.body.intervals : [];
    const cleaned = raw
      .map(it => ({ from: Number(it.from), to: Number(it.to) }))
      .filter(it => Number.isFinite(it.from) && Number.isFinite(it.to) && it.to > it.from);

    // Clamp to range and drop empties
    const clamped = cleaned
      .map(it => ({ from: Math.max(it.from, rangeFrom), to: Math.min(it.to, rangeTo) }))
      .filter(it => it.to > it.from);

    // Coalesce overlapping/adjacent intervals
    clamped.sort((a, b) => a.from - b.from);
    const merged = [];
    for (const cur of clamped) {
      if (!merged.length) merged.push({ ...cur });
      else {
        const last = merged[merged.length - 1];
        if (cur.from <= last.to) last.to = Math.max(last.to, cur.to);
        else merged.push({ ...cur });
      }
    }

    // Replace in range: delete overlapping then insert merged
    await Availability.deleteMany({
      userId: req.user.id,
      from: { $lt: rangeTo },
      to: { $gt: rangeFrom }
    });

    if (merged.length) {
      const docs = merged.map(it => ({
        userId: req.user.id,
        from: it.from,
        to: it.to,
        // expiryAt = 7 days after "to"
        expiryAt: new Date((it.to + 7 * 24 * 60 * 60) * 1000)
      }));
      await Availability.insertMany(docs);
    }

    res.json({ success: true, count: merged.length });
  }
);

// POST fetch intervals for multiple users within [from, to) epoch seconds (UTC)
router.post(
  '/get_many',
  requireAuth,
  body('from').isInt({ min: 0 }).toInt(),
  body('to').isInt({ min: 1 }).toInt(),
  body('usernames').isArray({ min: 1 }),
  body('usernames.*').isString().trim().isLength({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const from = Number(req.body.from);
    const to = Number(req.body.to);
    if (!(to > from)) return res.status(400).json({ error: '`to` must be greater than `from`' });

    const usernames = req.body.usernames.map(s => String(s).trim());
    const users = await User.find({ username: { $in: usernames } }).select('_id username').lean();

    const foundMap = new Map(users.map(u => [u.username, String(u._id)]));
    const foundIds = users.map(u => u._id);
    const notFound = usernames.filter(u => !foundMap.has(u));

    if (foundIds.length === 0) {
      return res.json({ members: [], notFound, intervals: {} });
    }

    const docs = await Availability
      .find({ userId: { $in: foundIds }, from: { $lt: to }, to: { $gt: from } })
      .sort({ userId: 1, from: 1 })
      .lean();

    const byUserId = new Map();
    for (const d of docs) {
      const k = String(d.userId);
      if (!byUserId.has(k)) byUserId.set(k, []);
      byUserId.get(k).push({ from: d.from, to: d.to });
    }

    const intervals = {};
    const members = users.map(u => ({ username: u.username, id: String(u._id) }));
    for (const u of users) {
      intervals[u.username] = byUserId.get(String(u._id)) || [];
    }

    res.json({ members, notFound, intervals });
  }
);

module.exports = router;
