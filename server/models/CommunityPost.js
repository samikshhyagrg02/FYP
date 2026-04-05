const mongoose = require('mongoose');

const communityPostSchema = new mongoose.Schema({
  groupId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'CommunityGroup',
    required: true
  },
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  content: {
    type: String,
    required: true,
    trim: true,
    maxlength: 2000
  },
  isAnonymous: {
    type: Boolean,
    default: false
  },
  likes: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }],
  likeCount: {
    type: Number,
    default: 0
  },
  commentCount: {
    type: Number,
    default: 0
  },
  isReported: {
    type: Boolean,
    default: false
  },
  reportCount: {
    type: Number,
    default: 0
  },
  isHidden: {
    type: Boolean,
    default: false
  },
  hiddenReason: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
communityPostSchema.index({ groupId: 1, createdAt: -1 });
communityPostSchema.index({ userId: 1, createdAt: -1 });
communityPostSchema.index({ isHidden: 1, createdAt: -1 });

// Virtual for author info (with anonymous support)
communityPostSchema.virtual('author', {
  ref: 'User',
  localField: 'userId',
  foreignField: '_id',
  justOne: true
});

// Method to check if user has liked
communityPostSchema.methods.isLikedBy = function(userId) {
  return this.likes.some(id => id.toString() === userId.toString());
};

// Static method to get posts with author info
communityPostSchema.statics.getPostsWithAuthor = async function(query, options = {}) {
  const { limit = 20, skip = 0, sortBy = '-createdAt' } = options;
  
  return this.find(query)
    .populate('userId', 'username isAnonymous avatar')
    .populate('groupId', 'name icon color')
    .sort(sortBy)
    .limit(limit)
    .skip(skip);
};

module.exports = mongoose.model('CommunityPost', communityPostSchema);
