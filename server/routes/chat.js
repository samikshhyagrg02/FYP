const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const ChatMessage = require('../models/ChatMessage');
const ChatBlock   = require('../models/ChatBlock');
const User        = require('../models/User');

const router = express.Router();

// All chat routes require authentication
router.use(authenticateToken);

// ── GET /api/chat/users ───────────────────────────────────────────────────────
// Returns conversations for the sidebar with unread count per conversation.
router.get('/users', async (req, res) => {
  try {
    const myId = req.user._id;

    const messages = await ChatMessage.find({
      $or: [
        { senderId: myId },
        { receiverId: myId, isRequest: false },
      ],
    })
      .sort({ createdAt: -1 })
      .populate('senderId',   'username')
      .populate('receiverId', 'username');

    const convMap = new Map();
    for (const msg of messages) {
      const isMe      = String(msg.senderId._id) === String(myId);
      const partnerId = isMe ? String(msg.receiverId._id) : String(msg.senderId._id);
      if (!convMap.has(partnerId)) {
        convMap.set(partnerId, {
          userId:      partnerId,
          username:    isMe ? msg.receiverId.username : msg.senderId.username,
          lastMessage: msg.content,
          lastAt:      msg.createdAt,
          // Track whether the last message was sent by the other person and not yet seen
          lastMessageIsIncoming: !isMe,
          lastMessageStatus: msg.status,
        });
      }
    }

    // Count unread messages per conversation (messages sent TO me, not yet seen)
    const unreadCounts = await ChatMessage.aggregate([
      {
        $match: {
          receiverId: myId,
          isRequest:  false,
          status:     { $in: ['sent', 'delivered'] },
        },
      },
      { $group: { _id: '$senderId', count: { $sum: 1 } } },
    ]);

    const unreadMap = {};
    for (const row of unreadCounts) {
      unreadMap[String(row._id)] = row.count;
    }

    const conversations = Array.from(convMap.values()).map(conv => ({
      ...conv,
      unreadCount: unreadMap[conv.userId] || 0,
    }));

    res.json({ conversations });
  } catch (err) {
    console.error('Chat users error', err);
    res.status(500).json({ error: 'Failed to load conversations' });
  }
});

// ── GET /api/chat/requests ────────────────────────────────────────────────────
// Pending message requests received by the current user
router.get('/requests', async (req, res) => {
  try {
    const myId = req.user._id;

    const grouped = await ChatMessage.aggregate([
      { $match: { receiverId: myId, isRequest: true } },
      { $sort:  { createdAt: 1 } },
      { $group: { _id: '$senderId', content: { $first: '$content' }, createdAt: { $first: '$createdAt' } } },
    ]);

    const senderIds = grouped.map(g => g._id);
    const senders   = await User.find({ _id: { $in: senderIds } }).select('username');
    const nameMap   = Object.fromEntries(senders.map(s => [String(s._id), s.username]));

    const requests = grouped.map(g => ({
      senderId:  String(g._id),
      username:  nameMap[String(g._id)] || 'Unknown',
      preview:   g.content,
      createdAt: g.createdAt,
    }));

    res.json({ requests });
  } catch (err) {
    console.error('Chat requests error', err);
    res.status(500).json({ error: 'Failed to load requests' });
  }
});

// ── POST /api/chat/requests/accept ────────────────────────────────────────────
router.post('/requests/accept', async (req, res) => {
  try {
    const { senderId } = req.body;
    if (!senderId) return res.status(400).json({ error: 'senderId required' });
    await ChatMessage.updateMany(
      { senderId, receiverId: req.user._id, isRequest: true },
      { $set: { isRequest: false } }
    );
    res.json({ message: 'Request accepted' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to accept request' });
  }
});

// ── POST /api/chat/requests/reject ────────────────────────────────────────────
router.post('/requests/reject', async (req, res) => {
  try {
    const { senderId } = req.body;
    if (!senderId) return res.status(400).json({ error: 'senderId required' });
    await ChatMessage.deleteMany({ senderId, receiverId: req.user._id, isRequest: true });
    res.json({ message: 'Request rejected' });
  } catch (err) {
    res.status(500).json({ error: 'Failed to reject request' });
  }
});

// ── GET /api/chat/search?q=username ──────────────────────────────────────────
// Search users — excludes admins, anonymous, banned
router.get('/search', async (req, res) => {
  try {
    const { q = '' } = req.query;

    const filter = {
      _id:         { $ne: req.user._id },
      isAnonymous: false,
      isBanned:    { $ne: true },
      role:        { $ne: 'admin' },   // exclude admin accounts
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
// Accepted messages only
router.get('/history/:userId', async (req, res) => {
  try {
    const myId    = req.user._id;
    const otherId = req.params.userId;
    const page    = parseInt(req.query.page || '1');
    const limit   = 50;
    const skip    = (page - 1) * limit;

    const messages = await ChatMessage.find({
      $or: [
        { senderId: myId,    receiverId: otherId },          // I sent — always show
        { senderId: otherId, receiverId: myId, isRequest: false }, // they sent — accepted only
      ],
    })
      .sort({ createdAt: -1 })
      .skip(skip)
      .limit(limit)
      .populate('senderId',   'username')
      .populate('receiverId', 'username');

    await ChatMessage.updateMany(
      { senderId: otherId, receiverId: myId, status: 'sent', isRequest: false },
      { $set: { status: 'delivered' } }
    );

    res.json({ messages: messages.reverse() });
  } catch (err) {
    console.error('Chat history error', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── POST /api/chat/seen/:userId ───────────────────────────────────────────────
router.post('/seen/:userId', async (req, res) => {
  try {
    await ChatMessage.updateMany(
      { senderId: req.params.userId, receiverId: req.user._id, status: { $ne: 'seen' }, isRequest: false },
      { $set: { status: 'seen' } }
    );
    res.json({ ok: true });
  } catch (err) {
    res.status(500).json({ error: 'Failed to mark seen' });
  }
});

// ── GET /api/chat/online ──────────────────────────────────────────────────────
router.get('/online', (req, res) => {
  const onlineUsers = req.app.get('onlineUsers') || new Set();
  res.json({ onlineUsers: Array.from(onlineUsers) });
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
