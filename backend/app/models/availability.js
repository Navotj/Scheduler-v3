const mongoose = require('mongoose');

const availabilitySchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  from: { type: Number, required: true }, // Epoch seconds, UTC
  to: { type: Number, required: true },   // Epoch seconds, UTC
  createdAt: { type: Number, default: () => Math.floor(Date.now() / 1000) },
  sourceTimezone: { type: String }
});

availabilitySchema.index({ userId: 1, from: 1, to: 1 });

module.exports = mongoose.model('Availability', availabilitySchema);
