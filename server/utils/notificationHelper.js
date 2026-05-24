/**
 * notificationHelper.js
 * 
 * Utility to create and emit notifications from any route.
 * Usage:
 *   const { createNotification } = require('../utils/notificationHelper');
 *   await createNotification(req.app, {
 *     userId, type, title, message, link, meta, fromUserId
 *   });
 */

const Notification = require('../models/Notification');
const NotificationPreference = require('../models/NotificationPreference');

/**
 * Create a notification and emit it via Socket.IO.
 * @param {import('express').Application} app - Express app (for io access)
 * @param {Object} opts
 * @param {string|ObjectId} opts.userId       - Recipient user ID
 * @param {string}          opts.type         - Notification type
 * @param {string}          opts.title        - Short title
 * @param {string}          opts.message      - Longer description
 * @param {string}          [opts.link]       - Navigation link
 * @param {Object}          [opts.meta]       - Extra metadata
 * @param {string|ObjectId} [opts.fromUserId] - Sender user ID (null = system)
 * @returns {Promise<Object|null>} Created notification or null if skipped
 */
async function createNotification(app, { userId, type, title, message, link, meta, fromUserId }) {
  try {
    // Check user preferences
    const prefs = await NotificationPreference.findOne({ userId });
    if (prefs) {
      if (prefs.muted) return null;
      if (prefs[type] === false) return null;
    }

    const notification = await Notification.create({
      userId,
      type,
      title,
      message,
      link:       link       || null,
      meta:       meta       || {},
      fromUserId: fromUserId || null,
    });

    const populated = await notification.populate('fromUserId', 'username avatar');

    // Emit real-time event
    const io = app.get('io');
    if (io) {
      io.to(String(userId)).emit('notification:new', populated);
    }

    return populated;
  } catch (err) {
    console.error('createNotification error:', err);
    return null;
  }
}

/**
 * Broadcast an admin announcement to all users.
 * @param {import('express').Application} app
 * @param {Object} opts
 * @param {string} opts.title
 * @param {string} opts.message
 * @param {string} [opts.link]
 * @param {string|ObjectId} [opts.fromUserId]
 * @param {Array}  userIds - Array of user IDs to notify
 */
async function broadcastNotification(app, { title, message, link, fromUserId }, userIds) {
  const results = await Promise.allSettled(
    userIds.map(userId =>
      createNotification(app, {
        userId,
        type: 'admin_announcement',
        title,
        message,
        link,
        fromUserId,
      })
    )
  );
  return results;
}

module.exports = { createNotification, broadcastNotification };
