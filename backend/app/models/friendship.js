const mongoose = require('mongoose');

const { Schema, Types } = mongoose;

/**
 * Friendship: undirected relation between two users.
 * We store the pair in sorted order (u1 < u2) to ensure uniqueness.
 */
const friendshipSchema = new Schema(
  {
    u1: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    u2: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    since: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Unique pair
friendshipSchema.index({ u1: 1, u2: 1 }, { unique: true });

/**
 * Normalize two user ids into sorted [u1, u2]
 */
function normalizePair(a, b) {
  const sa = a.toString();
  const sb = b.toString();
  return sa < sb ? [a, b] : [b, a];
}

friendshipSchema.statics.normalizePair = normalizePair;

module.exports = mongoose.model('Friendship', friendshipSchema);
