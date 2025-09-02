const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * FriendRequest: directed pending request from one user to another.
 * Only one pending request per (from,to) pair is allowed.
 * Requests are deleted on accept/decline.
 */
const friendRequestSchema = new Schema(
  {
    from: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    to: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    createdAt: { type: Date, default: Date.now },
  },
  { timestamps: true }
);

// Enforce single pending per direction
friendRequestSchema.index({ from: 1, to: 1 }, { unique: true });

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
