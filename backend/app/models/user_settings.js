const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    timezone: { type: String, default: 'auto' },
    clock: { type: String, enum: ['12', '24'], default: '24' },
    weekStart: { type: String, enum: ['sun', 'mon'], default: 'sun' },
    heatmap: {
      type: String,
      enum: ['viridis', 'plasma', 'cividis', 'twilight', 'lava'],
      default: 'viridis'
    },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserSettings', userSettingsSchema);
