const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

const userSchema = new mongoose.Schema({
  email: {
    type: String,
    unique: true,
    required: true
  },
  passwordHash: {
    type: String,
    required: true
  },
  isVerified: {
    type: Boolean,
    default: true // change to false if you plan to implement email verification
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

userSchema.methods.setPassword = async function (password) {
  this.passwordHash = await bcrypt.hash(password, 12);
};

userSchema.methods.validatePassword = async function (password) {
  return bcrypt.compare(password, this.passwordHash);
};

module.exports = mongoose.model('User', userSchema);
