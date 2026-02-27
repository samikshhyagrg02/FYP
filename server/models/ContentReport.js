const mongoose = require('mongoose');

const contentReportSchema = new mongoose.Schema({
  reportedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  contentType: {
    type: String,
    required: true,
    enum: ['post', 'comment']
  },
  contentId: {
    type: mongoose.Schema.Types.ObjectId,
    required: true
  },
  reason: {
    type: String,
    required: true,
    enum: [
      'harassment',
      'hate-speech',
      'spam',
      'misinformation',
      'self-harm',
      'inappropriate',
      'other'
    ]
  },
  description: {
    type: String,
    trim: true,
    maxlength: 500
  },
  status: {
    type: String,
    enum: ['pending', 'reviewed', 'action-taken', 'dismissed'],
    default: 'pending'
  },
  reviewedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User'
  },
  reviewedAt: {
    type: Date
  },
  actionTaken: {
    type: String
  }
}, {
  timestamps: true
});

// Indexes for efficient querying
contentReportSchema.index({ contentType: 1, contentId: 1 });
contentReportSchema.index({ status: 1, createdAt: -1 });
contentReportSchema.index({ reportedBy: 1, createdAt: -1 });

// Prevent duplicate reports from same user for same content
contentReportSchema.index({ reportedBy: 1, contentType: 1, contentId: 1 }, { unique: true });

module.exports = mongoose.model('ContentReport', contentReportSchema);
