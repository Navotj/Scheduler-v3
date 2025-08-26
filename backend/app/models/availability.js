const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  from: { type: Number, required: true }, // Epoch seconds, UTC
  to: { type: Number, required: true },   // Epoch seconds, UTC
  // expiryAt is used for TTL deletion: document expires 7 days after "to"
  expiryAt: { type: Date, required: true }
});

// Query helpers
availabilitySchema.index({ userId: 1, from: 1, to: 1 });
availabilitySchema.index({ expiryAt: 1 }, { expireAfterSeconds: 0 });

// Ensure expiryAt is derived from "to" if not already set
availabilitySchema.pre('validate', function(next) {
  if (typeof this.to === 'number' && (!this.expiryAt || isNaN(this.expiryAt.getTime()))) {
    const ms = (this.to + 7 * 24 * 60 * 60) * 1000;
    this.expiryAt = new Date(ms);
  }
  next();
});

module.exports = mongoose.model('Availability', availabilitySchema);