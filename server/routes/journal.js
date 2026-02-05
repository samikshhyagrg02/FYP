const express = require('express');
const { body, validationResult, param } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const JournalEntry = require('../models/JournalEntry');

const router = express.Router();

// Validation rules
const createJournalValidation = [
  body('title')
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('content')
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be between 1 and 10000 characters'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Maximum 10 tags allowed'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters'),
  body('mood')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Mood must be between 1 and 5')
];

const updateJournalValidation = [
  body('title')
    .optional()
    .trim()
    .isLength({ min: 1, max: 200 })
    .withMessage('Title must be between 1 and 200 characters'),
  body('content')
    .optional()
    .trim()
    .isLength({ min: 1, max: 10000 })
    .withMessage('Content must be between 1 and 10000 characters'),
  body('tags')
    .optional()
    .isArray({ max: 10 })
    .withMessage('Maximum 10 tags allowed'),
  body('tags.*')
    .optional()
    .trim()
    .isLength({ max: 30 })
    .withMessage('Each tag cannot exceed 30 characters'),
  body('mood')
    .optional()
    .isInt({ min: 1, max: 5 })
    .withMessage('Mood must be between 1 and 5'),
  body('isShared')
    .optional()
    .isBoolean()
    .withMessage('isShared must be a boolean')
];

// POST /api/journal - Create new journal entry
router.post('/', [authenticateToken, ...createJournalValidation], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { title, content, tags, mood } = req.body;

    const journalEntry = new JournalEntry({
      userId: req.user._id,
      title,
      content,
      tags: tags || [],
      mood: mood || undefined
    });

    await journalEntry.save();

    res.status(201).json({
      message: 'Journal entry created successfully',
      entry: journalEntry.toJSON()
    });

  } catch (error) {
    console.error('Journal creation error:', error);
    res.status(500).json({ error: 'Failed to create journal entry' });
  }
});

// GET /api/journal - Get user's journal entries
router.get('/', authenticateToken, async (req, res) => {
  try {
    const { limit = 20, skip = 0, sortBy = '-createdAt' } = req.query;

    const entries = await JournalEntry.getUserEntries(req.user._id, {
      limit: parseInt(limit),
      skip: parseInt(skip),
      sortBy
    });

    const total = await JournalEntry.countDocuments({ userId: req.user._id });

    res.json({
      entries: entries.map(entry => entry.toJSON()),
      total,
      hasMore: total > parseInt(skip) + entries.length
    });

  } catch (error) {
    console.error('Journal fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch journal entries' });
  }
});

// GET /api/journal/shared - Get shared journal entries (anonymous)
router.get('/shared', async (req, res) => {
  try {
    const { limit = 20, skip = 0 } = req.query;

    const entries = await JournalEntry.getSharedEntries({
      limit: parseInt(limit),
      skip: parseInt(skip)
    });

    const total = await JournalEntry.countDocuments({ isShared: true });

    res.json({
      entries: entries.map(entry => entry.toJSON()),
      total,
      hasMore: total > parseInt(skip) + entries.length
    });

  } catch (error) {
    console.error('Shared entries fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch shared entries' });
  }
});

// GET /api/journal/:id - Get specific journal entry
router.get('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid journal ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json({ entry: entry.toJSON() });

  } catch (error) {
    console.error('Journal fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch journal entry' });
  }
});

// PUT /api/journal/:id - Update journal entry
router.put('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid journal ID'),
  ...updateJournalValidation
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    const { title, content, tags, mood, isShared } = req.body;

    if (title !== undefined) entry.title = title;
    if (content !== undefined) entry.content = content;
    if (tags !== undefined) entry.tags = tags;
    if (mood !== undefined) entry.mood = mood;
    if (isShared !== undefined) {
      entry.isShared = isShared;
      if (isShared && !entry.sharedAt) {
        entry.sharedAt = new Date();
      }
    }

    entry.lastEditedAt = new Date();
    await entry.save();

    res.json({
      message: 'Journal entry updated successfully',
      entry: entry.toJSON()
    });

  } catch (error) {
    console.error('Journal update error:', error);
    res.status(500).json({ error: 'Failed to update journal entry' });
  }
});

// DELETE /api/journal/:id - Delete journal entry
router.delete('/:id', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid journal ID')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const entry = await JournalEntry.findOneAndDelete({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    res.json({ message: 'Journal entry deleted successfully' });

  } catch (error) {
    console.error('Journal delete error:', error);
    res.status(500).json({ error: 'Failed to delete journal entry' });
  }
});

// PATCH /api/journal/:id/autosave - Auto-save journal entry
router.patch('/:id/autosave', [
  authenticateToken,
  param('id').isMongoId().withMessage('Invalid journal ID'),
  body('content')
    .trim()
    .isLength({ min: 0, max: 10000 })
    .withMessage('Content cannot exceed 10000 characters')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const entry = await JournalEntry.findOne({
      _id: req.params.id,
      userId: req.user._id
    });

    if (!entry) {
      return res.status(404).json({ error: 'Journal entry not found' });
    }

    entry.content = req.body.content;
    entry.lastEditedAt = new Date();
    await entry.save();

    res.json({
      message: 'Auto-saved successfully',
      lastEditedAt: entry.lastEditedAt
    });

  } catch (error) {
    console.error('Auto-save error:', error);
    res.status(500).json({ error: 'Auto-save failed' });
  }
});

module.exports = router;
