const express = require('express');
const { authenticateToken } = require('../middleware/auth');
const { UserProgress, ActivityLog, AchievementDef } = require('../models/MindbloomGamification');
const { createNotification } = require('../utils/notificationHelper');

const router = express.Router();

// ── GET /api/gamification/me ──────────────────────────────────────────────────
// Returns full user progress (creates record on first call)
router.get('/me', authenticateToken, async (req, res) => {
  try {
    let progress = await UserProgress.findOne({ userId: req.user._id });
    if (!progress) {
      progress = await UserProgress.create({ userId: req.user._id });
    }

    // Refresh daily XP if it's a new day
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const lastGoalDate = progress.dailyGoalDate ? new Date(progress.dailyGoalDate) : null;
    if (lastGoalDate) lastGoalDate.setHours(0, 0, 0, 0);
    if (!lastGoalDate || lastGoalDate.getTime() !== today.getTime()) {
      progress.dailyXp = 0;
      progress.dailyGoalMet = false;
      progress.dailyGoalDate = today;
      await progress.save();
    }

    const achievements = await AchievementDef.find({});
    res.json({ progress, achievements });
  } catch (err) {
    console.error('GET /gamification/me', err);
    res.status(500).json({ error: 'Failed to load gamification data' });
  }
});

// ── POST /api/gamification/activity ──────────────────────────────────────────
// Called when user completes a mindfulness activity
// Body: { type: 'meditation'|'breathing', durationSecs: number }
router.post('/activity', authenticateToken, async (req, res) => {
  try {
    const { type, durationSecs } = req.body;
    if (!['meditation', 'breathing'].includes(type)) {
      return res.status(400).json({ error: 'type must be meditation or breathing' });
    }
    if (typeof durationSecs !== 'number' || durationSecs < 0) {
      return res.status(400).json({ error: 'durationSecs must be a non-negative number' });
    }

    let progress = await UserProgress.findOne({ userId: req.user._id });
    if (!progress) progress = await UserProgress.create({ userId: req.user._id });

    const result = await progress.recordActivity(type, durationSecs);

    res.json({
      message: 'Activity recorded',
      xpEarned: result.xpEarned,
      streakChanged: result.streakChanged,
      dailyGoalJustMet: result.dailyGoalJustMet,
      newAchievements: result.newAchievements,
      progress
    });

    // Fire achievement notifications (after response sent)
    if (result.newAchievements && result.newAchievements.length > 0) {
      for (const ach of result.newAchievements) {
        createNotification(req.app, {
          userId:  req.user._id,
          type:    'achievement_unlocked',
          title:   `Achievement Unlocked: ${ach.name}`,
          message: ach.description || `You earned the "${ach.name}" achievement!`,
          link:    '/achievements',
          meta:    { achievementId: ach.id, icon: ach.icon, bonusXp: ach.bonusXp },
        });
      }
    }
  } catch (err) {
    console.error('POST /gamification/activity', err);
    res.status(500).json({ error: 'Failed to record activity' });
  }
});

// ── GET /api/gamification/history ────────────────────────────────────────────
// Recent activity log
router.get('/history', authenticateToken, async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 20, 50);
    const logs = await ActivityLog.find({ userId: req.user._id })
      .sort({ completedAt: -1 })
      .limit(limit);
    res.json({ logs });
  } catch (err) {
    console.error('GET /gamification/history', err);
    res.status(500).json({ error: 'Failed to load history' });
  }
});

// ── GET /api/gamification/achievements ───────────────────────────────────────
// All achievement definitions
router.get('/achievements', async (req, res) => {
  try {
    const achievements = await AchievementDef.find({}).sort({ 'condition.value': 1 });
    res.json({ achievements });
  } catch (err) {
    console.error('GET /gamification/achievements', err);
    res.status(500).json({ error: 'Failed to load achievements' });
  }
});

// ── POST /api/gamification/streak-freeze ─────────────────────────────────────
// Activate streak freeze (one per user)
router.post('/streak-freeze', authenticateToken, async (req, res) => {
  try {
    let progress = await UserProgress.findOne({ userId: req.user._id });
    if (!progress) progress = await UserProgress.create({ userId: req.user._id });

    if (progress.streakFreezeUsed) {
      return res.status(400).json({ error: 'Streak freeze already used' });
    }
    if (progress.streakFreezeActive) {
      return res.status(400).json({ error: 'Streak freeze already active' });
    }

    progress.streakFreezeActive = true;
    await progress.save();
    res.json({ message: 'Streak freeze activated', progress });
  } catch (err) {
    console.error('POST /gamification/streak-freeze', err);
    res.status(500).json({ error: 'Failed to activate streak freeze' });
  }
});

module.exports = router;
