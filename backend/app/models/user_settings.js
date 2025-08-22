const mongoose = require('mongoose');

const userSettingsSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, required: true, unique: true, index: true },
    timezone: { type: String, default: 'auto' },
    clock: { type: String, enum: ['12', '24'], default: '24' },
    weekStart: { type: String, enum: ['sun', 'mon'], default: 'sun' },
    defaultZoom: { type: Number, default: 1.0, min: 0.6, max: 2.0 },
    highlightWeekends: { type: Boolean, default: false },
    heatmap: {
      type: String,
      enum: ['blackgreen', 'viridis', 'plasma', 'cividis', 'twilight', 'lava'],
      default: 'blackgreen'
    },
    updatedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

module.exports = mongoose.model('UserSettings', userSettingsSchema);
