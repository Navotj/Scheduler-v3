const mongoose = require('mongoose');

const { Schema } = mongoose;

/**
 * BlockList: one document per user listing all user IDs they have blocked.
 * Mirrors FriendList structure for simplicity.
 */
const BlockListSchema = new Schema(
  {
    user: { type: Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    blocked: { type: [Schema.Types.ObjectId], default: [] }, // array of blocked user _ids
  },
  { versionKey: false }
);

module.exports = mongoose.model('BlockList', BlockListSchema);
