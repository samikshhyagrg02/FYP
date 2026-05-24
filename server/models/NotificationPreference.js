const mongoose = require('mongoose');

const notificationPreferenceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true,
  },
  // Per-type toggles
  mood_reminder:        { type: Boolean, default: true },
  journal_reminder:     { type: Boolean, default: true },
  meditation_reminder:  { type: Boolean, default: true },
  new_message:          { type: Boolean, default: true },
  message_request:      { type: Boolean, default: true },
  community_activity:   { type: Boolean, default: true },
  achievement_unlocked: { type: Boolean, default: true },
  admin_announcement:   { type: Boolean, default: true },
  report_update:        { type: Boolean, default: true },
  weekly_summary:       { type: Boolean, default: true },
  // Global mute
  muted: { type: Boolean, default: false },
  // Sound
  soundEnabled: { type: Boolean, default: true },
}, { timestamps: true });

module.exports = mongoose.model('NotificationPreference', notificationPreferenceSchema);
