const express = require('express');
const router = express.Router();
const Template = require('../models/templates');
const { verifyToken } = require('../utils/jwt');
const { body, query, validationResult } = require('express-validator');

// auth middleware using JWT cookie (same pattern as availability)
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

function toClient(doc, includeDays) {
  const base = {
    id: String(doc._id),
    name: doc.name,
    tz: doc.tz || null,
    stepMin: doc.stepMin,
    hoursStart: doc.hoursStart,
    hoursEnd: doc.hoursEnd,
    updatedAt: doc.updatedAt
  };
  if (includeDays) {
    // return days as arrays of [from,to] pairs for easy client use
    base.days = (doc.days || []).map(day => day.map(iv => [iv.from, iv.to]));
  }
  return base;
}

// GET /templates/list -> list user templates (no heavy payload)
router.get(
  '/list',
  requireAuth,
  async (req, res) => {
    const docs = await Template.find({ userId: req.user.id })
      .sort({ updatedAt: -1, name: 1 })
      .select('name tz stepMin hoursStart hoursEnd updatedAt')
      .lean();

    const templates = docs.map(d => ({
      id: String(d._id),
      name: d.name,
      tz: d.tz || null,
      stepMin: d.stepMin,
      hoursStart: d.hoursStart,
      hoursEnd: d.hoursEnd,
      updatedAt: d.updatedAt
    }));

    res.json({ templates });
  }
);

// GET /templates/get?id=... OR /templates/get?name=...
router.get(
  '/get',
  requireAuth,
  query('id').optional().isMongoId(),
  query('name').optional().isString().trim().isLength({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const id = req.query.id;
    const name = req.query.name && String(req.query.name).trim();
    if (!id && !name) return res.status(400).json({ error: 'id or name is required' });

    const where = id
      ? { _id: id, userId: req.user.id }
      : { name, userId: req.user.id };

    const doc = await Template.findOne(where).lean();
    if (!doc) return res.status(404).json({ error: 'not_found' });

    res.json({ template: toClient(doc, true) });
  }
);

// POST /templates/save
// Create or update a template. If id is provided, updates that doc (must belong to user).
// If id is not provided, upserts by (userId,name).
router.post(
  '/save',
  requireAuth,
  body('id').optional().isMongoId(),
  body('name').isString().trim().isLength({ min: 1, max: 80 }),
  body('tz').optional().isString().trim().isLength({ min: 1 }),
  body('stepMin').optional().isInt({ min: 1, max: 240 }).toInt(),
  body('hoursStart').optional().isInt({ min: 0, max: 24 }).toInt(),
  body('hoursEnd').optional().isInt({ min: 0, max: 24 }).toInt(),
  body('days').isArray({ min: 7, max: 7 }),
  body('days.*').isArray(),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const id = req.body.id ? String(req.body.id) : null;
    const userId = req.user.id;
    const name = String(req.body.name).trim();

    const payload = {
      userId,
      name,
      tz: req.body.tz || null,
      stepMin: Number.isFinite(req.body.stepMin) ? req.body.stepMin : 30,
      hoursStart: Number.isFinite(req.body.hoursStart) ? req.body.hoursStart : 0,
      hoursEnd: Number.isFinite(req.body.hoursEnd) ? req.body.hoursEnd : 24,
      days: Array.isArray(req.body.days) ? req.body.days : new Array(7).fill([])
    };

    if (!(payload.hoursEnd > payload.hoursStart)) {
      return res.status(400).json({ error: '`hoursEnd` must be greater than `hoursStart`' });
    }

    // Normalize incoming days into [{from,to}] objects; leave full normalization to model pre('validate')
    payload.days = payload.days.map(day =>
      Array.isArray(day)
        ? day.map(it => {
            if (Array.isArray(it) && it.length >= 2) return { from: Number(it[0]), to: Number(it[1]) };
            if (it && typeof it === 'object') {
              const f = 'fromMin' in it ? it.fromMin : it.from;
              const t = 'toMin' in it ? it.toMin : it.to;
              return { from: Number(f), to: Number(t) };
            }
            return null;
          }).filter(Boolean)
        : []
    );

    let doc;
    if (id) {
      doc = await Template.findOne({ _id: id, userId });
      if (!doc) return res.status(404).json({ error: 'not_found' });
      doc.name = payload.name;
      doc.tz = payload.tz;
      doc.stepMin = payload.stepMin;
      doc.hoursStart = payload.hoursStart;
      doc.hoursEnd = payload.hoursEnd;
      doc.days = payload.days;
      await doc.save();
    } else {
      // upsert by (userId,name)
      doc = await Template.findOne({ userId, name });
      if (doc) {
        doc.tz = payload.tz;
        doc.stepMin = payload.stepMin;
        doc.hoursStart = payload.hoursStart;
        doc.hoursEnd = payload.hoursEnd;
        doc.days = payload.days;
        await doc.save();
      } else {
        doc = await Template.create(payload);
      }
    }

    res.json({ success: true, template: toClient(doc, true) });
  }
);

// POST /templates/delete
router.post(
  '/delete',
  requireAuth,
  body('id').optional().isMongoId(),
  body('name').optional().isString().trim().isLength({ min: 1 }),
  async (req, res) => {
    const errors = validationResult(req);
    if (!errors.isEmpty()) return res.status(400).json({ errors: errors.array() });

    const id = req.body.id ? String(req.body.id) : null;
    const name = req.body.name ? String(req.body.name).trim() : null;
    if (!id && !name) return res.status(400).json({ error: 'id or name is required' });

    const where = id
      ? { _id: id, userId: req.user.id }
      : { name, userId: req.user.id };

    const doc = await Template.findOne(where);
    if (!doc) return res.status(404).json({ error: 'not_found' });

    await Template.deleteOne({ _id: doc._id, userId: req.user.id });
    res.json({ success: true });
  }
);

module.exports = router;
