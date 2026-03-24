const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');
const ChatBlock   = require('../models/ChatBlock');
const User        = require('../models/User');

const router = express.Router();

// All chat routes require authentication
router.use(authenticateToken);

// ── GET /api/chat/users ───────────────────────────────────────────────────────
// Returns list of users the current user has had conversations with,
// plus their latest message (for the chat list sidebar).
router.get('/users', async (req, res) => {
  try {
    const myId = req.user._id;

    // Find all messages involving this user
    const messages = await ChatMessage.find({
      $or: [{ senderId: myId }, { receiverId: myId }]
    })
      .sort({ createdAt: -1 })
      .populate('senderId',   'username')
      .populate('receiverId', 'username');

    // Build a map of conversationPartnerId → latest message
    const convMap = new Map();
    for (const msg of messages) {
      const partnerId = String(msg.senderId._id) === String(myId)
        ? String(msg.receiverId._id)
        : String(msg.senderId._id);
      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          userId:   partnerId,
          username: String(msg.senderId._id) === String(myId)
            ? msg.receiverId.username
            : msg.senderId.username,
          lastMessage: msg.content,
          lastAt:      msg.createdAt,
        });
      }
    }

    res.json({ conversations: Array.from(convMap.values()) });
  } catch (err) {
    console.error('Chat users error', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// ── GET /api/chat/search?q=username ──────────────────────────────────────────
// Search users to start a new chat with — empty q returns all users
router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;

    const filter = {
      _id:         { $ne: req.user._id },
      isAnonymous: false,
      isBanned:    { $ne: true },
    };

    if (q.trim()) {
      filter.username = { $regex: q.trim(), $options: 'i' };
    }

    const users = await User.find(filter)
      .select('username')
      .sort({ username: 1 })
      .limit(20);

    res.json({ users });
  } catch (err) {
    res.status(500).json({ error: 'Search failed' });
  }
});

// ── GET /api/chat/history/:userId ─────────────────────────────────────────────
// Returns paginated message history between current user and :userId
router.get('/history/:userId', async (req, res) => {
  try {
    const myId     = req.user._id;
    const otherId  = req.params.userId;
    const page     = parseInt(req.query.page || '1');
    const limit    = 50;
    const skip     = (page - 1) * limit;

    const messages = await ChatMessage.find({
      $or: [
        { senderId: myId,    receiverId: otherId },
        { senderId: otherId, receiverId: myId    },
      ]
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId',   'username')
      .populate('receiverId', 'username');

    // Mark unread messages as delivered
    await ChatMessage.updateMany(
      { senderId: otherId, receiverId: myId, status: 'sent' },
      { status: 'delivered' }
    );

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Chat history error', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── POST /api/chat/block ──────────────────────────────────────────────────────
router.post('/block', async (req, res) => {
  try {
    const { targetId } = req.body;
    if (!targetId) return res.status(400).json({ error: 'targetId required' });

    await ChatBlock.findOneAndUpdate(
      { blockerId: req.user._id, targetId },
      { blockerId: req.user._id, targetId },
      { upsert: true, new: true }
    );

    res.json({ message: 'User blocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to block user' });
  }
});

// ── POST /api/chat/unblock ────────────────────────────────────────────────────
router.post('/unblock', async (req, res) => {
  try {
    const { targetId } = req.body;
    await ChatBlock.findOneAndDelete({ blockerId: req.user._id, targetId });
    res.json({ message: 'User unblocked' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to unblock user' });
  }
});

// ── GET /api/chat/block-status/:userId ────────────────────────────────────────
// Returns whether current user blocked them, or they blocked current user
router.get('/block-status/:userId', async (req, res) => {
  try {
    const myId    = req.user._id;
    const otherId = req.params.userId;

    const [iBlocked, theyBlocked] = await Promise.all([
      ChatBlock.findOne({ blockerId: myId,    targetId: otherId }),
      ChatBlock.findOne({ blockerId: otherId, targetId: myId    }),
    ]);

    res.json({ iBlocked: !!iBlocked, theyBlocked: !!theyBlocked });
  } catch (err) {
    res.status(500).json({ error: 'Failed to check block status' });
  }
});

module.exports = router;
