const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * Block: blocker prevents blocked from sending requests.
 * If a block exists in either direction, treat as "user not found" for discovery.
 */
const blockSchema = new Schema(
  {
    blocker: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    blocked: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Unique per pair (blocker -> blocked)
blockSchema.index({ blocker: 1, blocked: 1 }, { unique: true });

module.exports = mongoose.model('Block', blockSchema);
