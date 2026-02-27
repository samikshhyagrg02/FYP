const mongoose = require('mongoose');

const groupMembershipSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityGroup',
    required: true
  },
  role: {
    type: String,
    enum: ['member', 'moderator', 'admin', 'creator'],
    default: 'member'
  },
  joinedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
groupMembershipSchema.index({ userId: 1, groupId: 1 }, { unique: true });
groupMembershipSchema.index({ groupId: 1, joinedAt: -1 });
groupMembershipSchema.index({ userId: 1, joinedAt: -1 });

module.exports = mongoose.model('GroupMembership', groupMembershipSchema);
