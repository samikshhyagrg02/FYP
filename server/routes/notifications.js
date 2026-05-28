const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

const router = express.Router();

// All routes require authentication
router.use(authenticateToken);

// ── Helper: emit real-time notification via Socket.IO ─────────────────────────
// Attach `io` to app so routes can access it
function emitNotification(req, userId, notification) {
  const io = req.app.get('io');
  if (io) {
    io.to(String(userId)).emit('notification:new', notification);
  }
}

// ── GET /api/notifications ────────────────────────────────────────────────────
// Fetch paginated notifications for the current user
router.get('/', async (req, res) => {
  try {
    const userId = req.user._id;
    const page   = Math.max(1, parseInt(req.query.page  || '1'));
    const limit  = Math.min(50, parseInt(req.query.limit || '20'));
    const skip   = (page - 1) * limit;
    const filter = req.query.filter || 'all'; // all | unread | messages | reminders | community | system

    const query = { userId };

    if (filter === 'unread') {
      query.isRead = false;
    } else if (filter === 'messages') {
      query.type = { $in: ['new_message', 'message_request'] };
    } else if (filter === 'reminders') {
      query.type = { $in: ['mood_reminder', 'journal_reminder', 'meditation_reminder'] };
    } else if (filter === 'community') {
      query.type = { $in: ['community_activity'] };
    } else if (filter === 'system') {
      query.type = { $in: ['admin_announcement', 'report_update', 'weekly_summary', 'achievement_unlocked'] };
    }

    const [notifications, total, unreadCount] = await Promise.all([
      Notification.find(query)
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(limit)
        .populate('fromUserId', 'username avatar')
        .lean(),
      Notification.countDocuments(query),
      Notification.countDocuments({ userId, isRead: false }),
    ]);

    res.json({
      notifications,
      pagination: {
        page,
        limit,
        total,
        pages: Math.ceil(total / limit),
        hasMore: skip + notifications.length < total,
      },
      unreadCount,
    });
  } catch (err) {
    console.error('Fetch notifications error:', err);
    res.status(500).json({ error: 'Failed to fetch notifications' });
  }
});

// ── GET /api/notifications/unread-count ───────────────────────────────────────
router.get('/unread-count', async (req, res) => {
  try {
    const count = await Notification.countDocuments({
      userId: req.user._id,
      isRead: false,
    });
    res.json({ count });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get unread count' });
  }
});

// ── POST /api/notifications ───────────────────────────────────────────────────
// Create a notification (internal use — also callable by admin/system)
router.post('/', async (req, res) => {
  try {
    const { userId, type, title, message, link, meta, fromUserId } = req.body;

    // Only admins can create notifications for other users
    if (String(userId) !== String(req.user._id) && req.user.role !== 'admin') {
      return res.status(403).json({ error: 'Forbidden' });
    }

    // Check user preferences
    const prefs = await NotificationPreference.findOne({ userId });
    if (prefs && prefs.muted) {
      return res.status(200).json({ message: 'Notifications muted for this user', skipped: true });
    }
    if (prefs && prefs[type] === false) {
      return res.status(200).json({ message: 'Notification type disabled', skipped: true });
    }

    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      link: link || null,
      meta: meta || {},
      fromUserId: fromUserId || null,
    });

    const populated = await notification.populate('fromUserId', 'username avatar');

    // Emit real-time event
    emitNotification(req, userId, populated);

    res.status(201).json({ notification: populated });
  } catch (err) {
    console.error('Create notification error:', err);
    res.status(500).json({ error: 'Failed to create notification' });
  }
});

// ── PATCH /api/notifications/read-all ────────────────────────────────────────
router.patch('/read-all', async (req, res) => {
  try {
    await Notification.updateMany(
      { userId: req.user._id, isRead: false },
      { isRead: true }
    );
    res.json({ message: 'All notifications marked as read' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark all as read' });
  }
});

// ── PATCH /api/notifications/:id/read ────────────────────────────────────────
router.patch('/:id/read', async (req, res) => {
  try {
    const notification = await Notification.findOneAndUpdate(
      { _id: req.params.id, userId: req.user._id },
      { isRead: true },
      { new: true }
    );
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ notification });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark as read' });
  }
});

// ── DELETE /api/notifications/clear-all ──────────────────────────────────────
router.delete('/clear-all', async (req, res) => {
  try {
    await Notification.deleteMany({ userId: req.user._id });
    res.json({ message: 'All notifications cleared' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to clear notifications' });
  }
});

// ── DELETE /api/notifications/:id ────────────────────────────────────────────
router.delete('/:id', async (req, res) => {
  try {
    const notification = await Notification.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id,
    });
    if (!notification) return res.status(404).json({ error: 'Notification not found' });
    res.json({ message: 'Notification deleted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to delete notification' });
  }
});

// ── GET /api/notifications/preferences ───────────────────────────────────────
router.get('/preferences', async (req, res) => {
  try {
    let prefs = await NotificationPreference.findOne({ userId: req.user._id });
    if (!prefs) {
      prefs = await NotificationPreference.create({ userId: req.user._id });
    }
    res.json({ preferences: prefs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to get preferences' });
  }
});

// ── PUT /api/notifications/preferences ───────────────────────────────────────
router.put('/preferences', async (req, res) => {
  try {
    const allowed = [
      'mood_reminder', 'journal_reminder', 'meditation_reminder',
      'new_message', 'message_request', 'community_activity',
      'achievement_unlocked', 'admin_announcement', 'report_update',
      'weekly_summary', 'muted', 'soundEnabled',
    ];
    const update = {};
    for (const key of allowed) {
      if (req.body[key] !== undefined) update[key] = req.body[key];
    }

    const prefs = await NotificationPreference.findOneAndUpdate(
      { userId: req.user._id },
      { $set: update },
      { new: true, upsert: true }
    );
    res.json({ preferences: prefs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update preferences' });
  }
});

module.exports = router;
