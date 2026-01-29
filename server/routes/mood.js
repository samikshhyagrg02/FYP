const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const MoodEntry = require('../models/MoodEntry');

const router = express.Router();

// Mood emoji mapping
const moodEmojiMap = {
  1: '😢',
  2: '😕', 
  3: '😐',
  4: '😊',
  5: '😄'
};

// POST /api/mood/log
router.post('/log', [
  authenticateToken,
  body('moodValue')
    .isInt({ min: 1, max: 5 })
    .withMessage('Mood value must be an integer between 1 and 5'),
  body('notes')
    .optional()
    .isLength({ max: 500 })
    .withMessage('Notes cannot exceed 500 characters'),
  body('tags')
    .optional()
    .isArray({ max: 5 })
    .withMessage('Maximum 5 tags allowed'),
  body('tags.*')
    .optional()
    .isLength({ max: 20 })
    .withMessage('Each tag cannot exceed 20 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { moodValue, notes, tags } = req.body;
    const userId = req.user._id;

    const moodEntry = new MoodEntry({
      userId,
      moodValue,
      moodEmoji: moodEmojiMap[moodValue],
      notes: notes || '',
      tags: tags || []
    });

    await moodEntry.save();

    res.status(201).json({
      message: 'Mood logged successfully',
      moodEntry
    });

  } catch (error) {
    console.error('Mood logging error:', error);
    res.status(500).json({ error: 'Failed to log mood' });
  }
});

// GET /api/mood/weekly
router.get('/weekly', authenticateToken, async (req, res) => {
  try {
    const { date } = req.query;
    const startDate = date ? new Date(date) : new Date();
    
    // Set to beginning of week (Monday)
    const dayOfWeek = startDate.getDay();
    const diff = startDate.getDate() - dayOfWeek + (dayOfWeek === 0 ? -6 : 1);
    startDate.setDate(diff);
    startDate.setHours(0, 0, 0, 0);

    const analytics = await MoodEntry.getWeeklyAnalytics(req.user._id, startDate);

    // Fill in missing days with null values
    const weekData = [];
    for (let i = 0; i < 7; i++) {
      const currentDate = new Date(startDate);
      currentDate.setDate(startDate.getDate() + i);
      const dateString = currentDate.toISOString().split('T')[0];
      
      const dayData = analytics.find(item => item._id === dateString);
      weekData.push({
        date: dateString,
        averageMood: dayData ? dayData.averageMood : null,
        count: dayData ? dayData.count : 0,
        moods: dayData ? dayData.moods : []
      });
    }

    res.json({
      weekStart: startDate.toISOString().split('T')[0],
      data: weekData
    });

  } catch (error) {
    console.error('Weekly analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch weekly analytics' });
  }
});

// GET /api/mood/monthly
router.get('/monthly', authenticateToken, async (req, res) => {
  try {
    const { year, month } = req.query;
    const currentDate = new Date();
    const targetYear = year ? parseInt(year) : currentDate.getFullYear();
    const targetMonth = month ? parseInt(month) : currentDate.getMonth() + 1;

    const analytics = await MoodEntry.getMonthlyAnalytics(req.user._id, targetYear, targetMonth);

    // Calculate overall statistics
    const allEntries = await MoodEntry.find({
      userId: req.user._id,
      createdAt: {
        $gte: new Date(targetYear, targetMonth - 1, 1),
        $lte: new Date(targetYear, targetMonth, 0, 23, 59, 59)
      }
    });

    const totalEntries = allEntries.length;
    const averageMood = totalEntries > 0 
      ? allEntries.reduce((sum, entry) => sum + entry.moodValue, 0) / totalEntries 
      : 0;

    // Mood distribution
    const moodDistribution = {
      1: 0, 2: 0, 3: 0, 4: 0, 5: 0
    };
    allEntries.forEach(entry => {
      moodDistribution[entry.moodValue]++;
    });

    res.json({
      year: targetYear,
      month: targetMonth,
      totalEntries,
      averageMood: Math.round(averageMood * 100) / 100,
      moodDistribution,
      weeklyData: analytics
    });

  } catch (error) {
    console.error('Monthly analytics error:', error);
    res.status(500).json({ error: 'Failed to fetch monthly analytics' });
  }
});

// GET /api/mood/recent
router.get('/recent', authenticateToken, async (req, res) => {
  try {
    const limit = parseInt(req.query.limit) || 10;
    
    const recentMoods = await MoodEntry.find({ userId: req.user._id })
      .sort({ createdAt: -1 })
      .limit(limit);

    res.json({
      moods: recentMoods
    });

  } catch (error) {
    console.error('Recent moods error:', error);
    res.status(500).json({ error: 'Failed to fetch recent moods' });
  }
});

module.exports = router;