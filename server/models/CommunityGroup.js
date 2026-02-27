const mongoose = require('mongoose');

const communityGroupSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    unique: true,
    trim: true,
    maxlength: 100
  },
  description: {
    type: String,
    required: true,
    trim: true,
    maxlength: 500
  },
  topic: {
    type: String,
    required: true,
    enum: [
      'anxiety',
      'depression',
      'stress',
      'relationships',
      'self-care',
      'mindfulness',
      'sleep',
      'work-life-balance',
      'general-support'
    ]
  },
  icon: {
    type: String,
    default: '💬'
  },
  color: {
    type: String,
    default: '#8BCF9B'
  },
  memberCount: {
    type: Number,
    default: 0
  },
  postCount: {
    type: Number,
    default: 0
  },
  isActive: {
    type: Boolean,
    default: true
  },
  createdBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  }
}, {
  timestamps: true
});

// Index for efficient querying
communityGroupSchema.index({ topic: 1, isActive: 1 });
communityGroupSchema.index({ name: 1 });

module.exports = mongoose.model('CommunityGroup', communityGroupSchema);
