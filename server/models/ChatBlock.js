const mongoose = require('mongoose');

/**
 * ChatBlock — tracks which users have blocked whom.
 * blockerId blocked targetId.
 */
const chatBlockSchema = new mongoose.Schema({
  blockerId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  targetId:  { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { timestamps: true });

// Ensure a user can only block another user once
chatBlockSchema.index({ blockerId: 1, targetId: 1 }, { unique: true });

module.exports = mongoose.model('ChatBlock', chatBlockSchema);
