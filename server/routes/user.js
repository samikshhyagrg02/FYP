const express = require('express');
const { body, validationResult } = require('express-validator');
const { authenticateToken } = require('../middleware/auth');
const User = require('../models/User');

const router = express.Router();

// GET /user/profile
router.get('/profile', authenticateToken, async (req, res) => {
  try {
    res.json({
      user: req.user.toJSON()
    });
  } catch (error) {
    console.error('Profile fetch error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

// PUT /user/profile
router.put('/profile', [
  authenticateToken,
  body('username')
    .optional()
    .isLength({ min: 3, max: 30 })
    .withMessage('Username must be between 3 and 30 characters')
    .matches(/^[a-zA-Z0-9_]+$/)
    .withMessage('Username can only contain letters, numbers, and underscores'),
  body('email')
    .optional()
    .isEmail()
    .withMessage('Please provide a valid email'),
  body('preferences.theme')
    .optional()
    .isIn(['light', 'dark'])
    .withMessage('Theme must be either light or dark'),
  body('preferences.notifications')
    .optional()
    .isBoolean()
    .withMessage('Notifications must be a boolean'),
  body('preferences.moodReminders')
    .optional()
    .isBoolean()
    .withMessage('Mood reminders must be a boolean')
], async (req, res) => {
  try {
    const errors = validationResult(req);
    if (!errors.isEmpty()) {
      return res.status(400).json({ errors: errors.array() });
    }

    const { username, email, preferences } = req.body;
    const userId = req.user._id;

    // Check if username is already taken (if updating username)
    if (username && username !== req.user.username) {
      const existingUser = await User.findOne({ username, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({ error: 'Username already taken' });
      }
    }

    // Check if email is already taken (if updating email)
    if (email && email !== req.user.email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(409).json({ error: 'Email already taken' });
      }
    }

    // Update user
    const updateData = {};
    if (username) updateData.username = username;
    if (email !== undefined) updateData.email = email || undefined;
    if (preferences) {
      updateData.preferences = { ...req.user.preferences, ...preferences };
    }
    // New profile fields
    if (req.body.bio      !== undefined) updateData.bio    = req.body.bio;
    if (req.body.avatar   !== undefined) updateData.avatar = req.body.avatar;
    if (req.body.privacy  !== undefined) updateData.privacy = { ...req.user.privacy, ...req.body.privacy };

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      updateData,
      { new: true, runValidators: true }
    );

    res.json({
      message: 'Profile updated successfully',
      user: updatedUser.toJSON()
    });

  } catch (error) {
    console.error('Profile update error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

// PUT /user/password
router.put('/password', authenticateToken, async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    if (!currentPassword || !newPassword)
      return res.status(400).json({ error: 'currentPassword and newPassword are required' });
    if (newPassword.length < 8)
      return res.status(400).json({ error: 'New password must be at least 8 characters' });
    if (!/^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/.test(newPassword))
      return res.status(400).json({ error: 'Password must contain uppercase, lowercase, and a number' });

    const user = await User.findById(req.user._id);
    const valid = await user.comparePassword(currentPassword);
    if (!valid) return res.status(401).json({ error: 'Current password is incorrect' });

    user.passwordHash = newPassword; // pre-save hook will hash it
    await user.save();
    res.json({ message: 'Password updated successfully' });
  } catch (error) {
    console.error('Password change error:', error);
    res.status(500).json({ error: 'Failed to update password' });
  }
});

// DELETE /user/account
router.delete('/account', authenticateToken, async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    // Anonymous users can delete without password
    if (!user.isAnonymous) {
      const { password } = req.body;
      if (!password) return res.status(400).json({ error: 'Password is required to delete account' });
      const valid = await user.comparePassword(password);
      if (!valid) return res.status(401).json({ error: 'Incorrect password' });
    }

    await User.findByIdAndDelete(req.user._id);
    res.json({ message: 'Account deleted successfully' });
  } catch (error) {
    console.error('Account delete error:', error);
    res.status(500).json({ error: 'Failed to delete account' });
  }
});

module.exports = router;