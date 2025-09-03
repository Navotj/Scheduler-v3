const mongoose = require('mongoose');

const FriendListSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, unique: true, index: true },
    friends: { type: [mongoose.Schema.Types.ObjectId], default: [] }, // store user _ids
  },
  { versionKey: false } // minimal footprint; no __v, no timestamps
);

module.exports = mongoose.model('FriendList', FriendListSchema);
