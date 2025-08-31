const mongoose = require('mongoose');

const tokenSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, required: true, index: true },
  type: { type: String, required: true, enum: ['verify', 'reset'], index: true },
  hash: { type: String, required: true, index: true },
  expiresAt: { type: Date, required: true, index: true, expires: 0 },
  usedAt: { type: Date, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Prevent duplicate identical tokens for same type/hash
tokenSchema.index({ type: 1, hash: 1 }, { unique: true });

module.exports = mongoose.model('Token', tokenSchema);
