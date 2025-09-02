const mongoose = require('mongoose');

const providerSubSchema = new mongoose.Schema(
  {
    name: { type: String, enum: ['google', 'github', 'discord'], required: true },
    id:   { type: String, required: true },
    linkedAt: { type: Date, default: Date.now }
  },
  { _id: false }
);

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true,
    trim: true,
    lowercase: true
  },
  // Username is chosen by user after OAuth. It may be null until then.
  username: {
    type: String,
    trim: true,
    minlength: 1,
    maxlength: 80,
    default: null
  },
  providers: {
    type: [providerSubSchema],
    default: []
  },
  emailVerifiedAt: {
    type: Date,
    default: null
  },
  displayName: {
    type: String,
    default: null
  },
  avatarUrl: {
    type: String,
    default: null
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Unique username only when present (partial index)
userSchema.index(
  { username: 1 },
  { unique: true, partialFilterExpression: { username: { $exists: true, $type: 'string' } } }
);

module.exports = mongoose.model('User', userSchema);
