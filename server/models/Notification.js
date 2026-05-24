const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    index: true,
  },
  type: {
    type: String,
    enum: [
      'mood_reminder',
      'journal_reminder',
      'meditation_reminder',
      'new_message',
      'message_request',
      'community_activity',
      'achievement_unlocked',
      'admin_announcement',
      'report_update',
      'weekly_summary',
    ],
    required: true,
  },
  title: { type: String, required: true, maxlength: 200 },
  message: { type: String, required: true, maxlength: 1000 },
  isRead: { type: Boolean, default: false, index: true },
  // Optional: link to navigate to when clicked
  link: { type: String, default: null },
  // Optional: metadata (e.g. senderId for messages, achievementId, etc.)
  meta: { type: mongoose.Schema.Types.Mixed, default: {} },
  // Who triggered this notification (null = system)
  fromUserId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },
}, { timestamps: true });

// Compound index for efficient per-user queries
notificationSchema.index({ userId: 1, createdAt: -1 });
notificationSchema.index({ userId: 1, isRead: 1, createdAt: -1 });

module.exports = mongoose.model('Notification', notificationSchema);
