const express = require('express');
const router = express.Router();
const { verifyToken } = require('../utils/jwt');
const { body, validationResult } = require('express-validator');
const UserSettings = require('../models/user_settings');

function requireAuth(req, res, next) {
  const reqId = req.__reqId || '-';
  const token = req.cookies?.token || null;
  const payload = token ? verifyToken(token) : null;

  if (!payload) {
    console.warn(`[AUTH][${reqId}] requireAuth: no/invalid token`);
    return res.status(401).json({ error: 'unauthorized' });
  }

  req.user = { id: String(payload.id), email: payload.email, username: payload.username };
  res.set('Cache-Control', 'no-store');
  return next();
}


const DEFAULTS = {
  timezone: 'auto',
  clock: '24',
  weekStart: 'sun',
  defaultZoom: 1.0,
  highlightWeekends: false
};

router.get('/settings', requireAuth, async (req, res) => {
  const doc = await UserSettings.findOne({ userId: req.user.id }).lean();
  if (!doc) return res.json({ ...DEFAULTS });
  const { timezone, clock, weekStart, defaultZoom, highlightWeekends } = doc;
  res.json({ timezone, clock, weekStart, defaultZoom, highlightWeekends });
});

router.post(
  '/settings',
  requireAuth,
  body('timezone').optional().isString(),
  body('clock').optional().isIn(['12', '24']),
  body('weekStart').optional().isIn(['sun', 'mon']),
  body('defaultZoom').optional().isFloat({ min: 0.6, max: 2.0 }).toFloat(),
  body('highlightWeekends').optional().isBoolean().toBoolean(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const payload = {
      timezone: typeof req.body.timezone === 'string' ? req.body.timezone : undefined,
      clock: req.body.clock,
      weekStart: req.body.weekStart,
      defaultZoom: typeof req.body.defaultZoom === 'number' ? req.body.defaultZoom : undefined,
      highlightWeekends: typeof req.body.highlightWeekends === 'boolean' ? req.body.highlightWeekends : undefined,
      updatedAt: new Date()
    };

    Object.keys(payload).forEach(k => payload[k] === undefined && delete payload[k]);

    const doc = await UserSettings.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { ...payload, userId: req.user.id } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    ).lean();

    const { timezone, clock, weekStart, defaultZoom, highlightWeekends } = doc;
    res.json({ timezone, clock, weekStart, defaultZoom, highlightWeekends });
  }
);

module.exports = router;
