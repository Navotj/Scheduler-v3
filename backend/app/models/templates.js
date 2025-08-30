const mongoose = require('mongoose');

const intervalSchema = new mongoose.Schema(
  {
    from: { type: Number, required: true, min: 0, max: 1440 }, // minutes since 00:00
    to: { type: Number, required: true, min: 1, max: 1440 }
  },
  { _id: false }
);

const templateSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
    name: { type: String, required: true, trim: true, minlength: 1, maxlength: 80 },
    tz: { type: String, default: null },           // optional IANA tz at save time (for reference)
    stepMin: { type: Number, default: 30, min: 1 },// slot minutes (e.g., 30)
    hoursStart: { type: Number, default: 0, min: 0, max: 24 },
    hoursEnd: { type: Number, default: 24, min: 0, max: 24 },
    // days[0..6] each is an array of {from,to} minute ranges within [0, 1440]
    days: {
      type: [
        {
          type: [intervalSchema],
          default: []
        }
      ],
      validate: {
        validator: function (v) { return Array.isArray(v) && v.length === 7; },
        message: 'days must be an array of length 7'
      }
    }
  },
  { timestamps: true }
);

templateSchema.index({ userId: 1, name: 1 }, { unique: true });

function clamp(n, lo, hi) { return Math.min(hi, Math.max(lo, n)); }

function normalizeDay(list, hoursStart, hoursEnd) {
  const minBound = clamp(hoursStart, 0, 24) * 60;
  const maxBound = clamp(hoursEnd, 0, 24) * 60;
  const src = Array.isArray(list) ? list : [];
  const cleaned = [];

  for (const it of src) {
    let from = null, to = null;
    if (Array.isArray(it) && it.length >= 2) { from = Number(it[0]); to = Number(it[1]); }
    else if (it && typeof it === 'object') {
      if ('fromMin' in it) { from = Number(it.fromMin); } else if ('from' in it) { from = Number(it.from); }
      if ('toMin' in it) { to = Number(it.toMin); } else if ('to' in it) { to = Number(it.to); }
    }
    if (!Number.isFinite(from) || !Number.isFinite(to)) continue;
    from = clamp(Math.floor(from), 0, 1440);
    to = clamp(Math.floor(to), 0, 1440);
    from = clamp(from, minBound, maxBound);
    to = clamp(to, minBound, maxBound);
    if (to > from) cleaned.push({ from, to });
  }

  cleaned.sort((a, b) => a.from - b.from || a.to - b.to);
  const merged = [];
  for (const cur of cleaned) {
    if (!merged.length) merged.push({ ...cur });
    else {
      const last = merged[merged.length - 1];
      if (cur.from <= last.to) last.to = Math.max(last.to, cur.to);
      else merged.push({ ...cur });
    }
  }
  return merged;
}

templateSchema.pre('validate', function (next) {
  // enforce days length and normalize each day
  if (!Array.isArray(this.days) || this.days.length !== 7) {
    const arr = new Array(7);
    for (let i = 0; i < 7; i++) arr[i] = [];
    this.days = arr;
  }
  const hs = Number.isFinite(this.hoursStart) ? this.hoursStart : 0;
  const he = Number.isFinite(this.hoursEnd) ? this.hoursEnd : 24;
  for (let i = 0; i < 7; i++) {
    this.days[i] = normalizeDay(this.days[i], hs, he);
  }
  next();
});

module.exports = mongoose.model('Template', templateSchema);
