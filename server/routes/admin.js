const express = require('express');
const { authenticateToken, requireAdmin } = require('../middleware/auth');
const User = require('../models/User');
const CommunityPost = require('../models/CommunityPost');
const CommunityComment = require('../models/CommunityComment');
const ContentReport = require('../models/ContentReport');
const AdminLog = require('../models/AdminLog');

const router = express.Router();

// All admin routes require auth + admin role
router.use(authenticateToken, requireAdmin);

// ── Helper: log admin action ──────────────────────────────────────────────────
async function logAction(adminId, action, targetType, targetId, details = '') {
  try {
    await AdminLog.create({ adminId, action, targetType, targetId: String(targetId), details });
  } catch (e) {
    console.error('AdminLog error', e);
  }
}

// ── GET /api/admin/analytics ──────────────────────────────────────────────────
router.get('/analytics', async (req, res) => {
  try {
    const [
      totalUsers,
      bannedUsers,
      totalPosts,
      reportedPosts,
      totalReports,
      pendingReports,
      recentUsers,
      recentPosts
    ] = await Promise.all([
      User.countDocuments({ isAnonymous: false }),
      User.countDocuments({ isAnonymous: false, isBanned: true }),
      CommunityPost.countDocuments(),
      CommunityPost.countDocuments({ isReported: true }),
      ContentReport.countDocuments(),
      ContentReport.countDocuments({ status: 'pending' }),
      // Last 7 days user registrations
      User.aggregate([
        { $match: { isAnonymous: false, createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ]),
      // Last 7 days posts
      CommunityPost.aggregate([
        { $match: { createdAt: { $gte: new Date(Date.now() - 7 * 86400000) } } },
        { $group: { _id: { $dateToString: { format: '%Y-%m-%d', date: '$createdAt' } }, count: { $sum: 1 } } },
        { $sort: { _id: 1 } }
      ])
    ]);

    // Report reasons breakdown
    const reportReasons = await ContentReport.aggregate([
      { $group: { _id: '$reason', count: { $sum: 1 } } },
      { $sort: { count: -1 } }
    ]);

    res.json({
      overview: {
        totalUsers,
        activeUsers: totalUsers - bannedUsers,
        bannedUsers,
        totalPosts,
        reportedPosts,
        totalReports,
        pendingReports
      },
      charts: {
        recentUsers,
        recentPosts,
        reportReasons
      }
    });
  } catch (err) {
    console.error('Admin analytics error', err);
    res.status(500).json({ error: 'Failed to load analytics' });
  }
});

// ── GET /api/admin/users ──────────────────────────────────────────────────────
router.get('/users', async (req, res) => {
  try {
    const { search = '', status = 'all', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = { isAnonymous: false, role: { $ne: 'admin' } };
    if (search) query.username = { $regex: search, $options: 'i' };
    if (status === 'active')  query.isBanned = false;
    if (status === 'banned')  query.isBanned = true;

    const [users, total] = await Promise.all([
      User.find(query)
        .select('username email role isBanned bannedAt bannedReason createdAt')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      User.countDocuments(query)
    ]);

    res.json({ users, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Admin get users error', err);
    res.status(500).json({ error: 'Failed to load users' });
  }
});

// ── POST /api/admin/ban-user ──────────────────────────────────────────────────
router.post('/ban-user', async (req, res) => {
  try {
    const { userId, reason = 'Violated community guidelines' } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (user.role === 'admin') return res.status(400).json({ error: 'Cannot ban an admin' });
    if (user.isBanned) return res.status(400).json({ error: 'User is already banned' });

    user.isBanned = true;
    user.bannedAt = new Date();
    user.bannedReason = reason;
    await user.save();

    await logAction(req.user._id, 'ban_user', 'user', userId, reason);

    res.json({ message: `User ${user.username} has been banned`, user: user.toJSON() });
  } catch (err) {
    console.error('Ban user error', err);
    res.status(500).json({ error: 'Failed to ban user' });
  }
});

// ── POST /api/admin/unban-user ────────────────────────────────────────────────
router.post('/unban-user', async (req, res) => {
  try {
    const { userId } = req.body;
    if (!userId) return res.status(400).json({ error: 'userId is required' });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ error: 'User not found' });
    if (!user.isBanned) return res.status(400).json({ error: 'User is not banned' });

    user.isBanned = false;
    user.bannedAt = null;
    user.bannedReason = null;
    await user.save();

    await logAction(req.user._id, 'unban_user', 'user', userId);

    res.json({ message: `User ${user.username} has been unbanned`, user: user.toJSON() });
  } catch (err) {
    console.error('Unban user error', err);
    res.status(500).json({ error: 'Failed to unban user' });
  }
});

// ── GET /api/admin/posts ──────────────────────────────────────────────────────
router.get('/posts', async (req, res) => {
  try {
    const { search = '', filter = 'all', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);

    const query = {};
    if (filter === 'reported') query.isReported = true;
    if (filter === 'hidden')   query.isHidden = true;
    if (search) query.content = { $regex: search, $options: 'i' };

    const [posts, total] = await Promise.all([
      CommunityPost.find(query)
        .populate('userId', 'username isBanned')
        .populate('groupId', 'name')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      CommunityPost.countDocuments(query)
    ]);

    res.json({ posts, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    console.error('Admin get posts error', err);
    res.status(500).json({ error: 'Failed to load posts' });
  }
});

// ── DELETE /api/admin/post/:id ────────────────────────────────────────────────
router.delete('/post/:id', async (req, res) => {
  try {
    const post = await CommunityPost.findById(req.params.id);
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await CommunityPost.findByIdAndDelete(req.params.id);
    await CommunityComment.deleteMany({ postId: req.params.id });

    await logAction(req.user._id, 'delete_post', 'post', req.params.id, post.content.substring(0, 100));

    res.json({ message: 'Post deleted successfully' });
  } catch (err) {
    console.error('Admin delete post error', err);
    res.status(500).json({ error: 'Failed to delete post' });
  }
});

// ── POST /api/admin/post/:id/hide ─────────────────────────────────────────────
router.post('/post/:id/hide', async (req, res) => {
  try {
    const { reason = 'Violated community guidelines' } = req.body;
    const post = await CommunityPost.findByIdAndUpdate(
      req.params.id,
      { isHidden: true, hiddenReason: reason },
      { new: true }
    );
    if (!post) return res.status(404).json({ error: 'Post not found' });

    await logAction(req.user._id, 'hide_post', 'post', req.params.id, reason);
    res.json({ message: 'Post hidden', post });
  } catch (err) {
    res.status(500).json({ error: 'Failed to hide post' });
  }
});

// ── GET /api/admin/reports ────────────────────────────────────────────────────
router.get('/reports', async (req, res) => {
  try {
    const { status = 'pending', page = 1, limit = 20 } = req.query;
    const skip = (parseInt(page) - 1) * parseInt(limit);
    const query = status === 'all' ? {} : { status };

    const [reports, total] = await Promise.all([
      ContentReport.find(query)
        .populate('reportedBy', 'username')
        .sort({ createdAt: -1 })
        .skip(skip)
        .limit(parseInt(limit)),
      ContentReport.countDocuments(query)
    ]);

    res.json({ reports, total, page: parseInt(page), pages: Math.ceil(total / parseInt(limit)) });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load reports' });
  }
});

// ── PATCH /api/admin/report/:id ───────────────────────────────────────────────
router.patch('/report/:id', async (req, res) => {
  try {
    const { status, actionTaken } = req.body;
    const report = await ContentReport.findByIdAndUpdate(
      req.params.id,
      { status, actionTaken, reviewedBy: req.user._id, reviewedAt: new Date() },
      { new: true }
    );
    if (!report) return res.status(404).json({ error: 'Report not found' });
    res.json({ message: 'Report updated', report });
  } catch (err) {
    res.status(500).json({ error: 'Failed to update report' });
  }
});

// ── GET /api/admin/logs ───────────────────────────────────────────────────────
router.get('/logs', async (req, res) => {
  try {
    const logs = await AdminLog.find()
      .populate('adminId', 'username')
      .sort({ createdAt: -1 })
      .limit(50);
    res.json({ logs });
  } catch (err) {
    res.status(500).json({ error: 'Failed to load logs' });
  }
});

module.exports = router;
