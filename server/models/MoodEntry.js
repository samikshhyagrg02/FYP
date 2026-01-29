const mongoose = require('mongoose');

const moodEntrySchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  moodValue: {
    type: Number,
    required: true,
    min: 1,
    max: 5,
    validate: {
      validator: Number.isInteger,
      message: 'Mood value must be an integer between 1 and 5'
    }
  },
  moodEmoji: {
    type: String,
    enum: ['😢', '😕', '😐', '😊', '😄'],
    required: true
  },
  notes: {
    type: String,
    maxlength: 500,
    trim: true
  },
  tags: [{
    type: String,
    trim: true,
    maxlength: 20
  }],
  createdAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

// Index for efficient querying
moodEntrySchema.index({ userId: 1, createdAt: -1 });
moodEntrySchema.index({ userId: 1, createdAt: 1 });

// Static method to get mood analytics
moodEntrySchema.statics.getWeeklyAnalytics = async function(userId, startDate) {
  const endDate = new Date(startDate);
  endDate.setDate(endDate.getDate() + 7);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lt: endDate }
      }
    },
    {
      $group: {
        _id: {
          $dateToString: { format: "%Y-%m-%d", date: "$createdAt" }
        },
        averageMood: { $avg: "$moodValue" },
        count: { $sum: 1 },
        moods: { $push: { value: "$moodValue", emoji: "$moodEmoji", time: "$createdAt" } }
      }
    },
    { $sort: { "_id": 1 } }
  ]);
};

moodEntrySchema.statics.getMonthlyAnalytics = async function(userId, year, month) {
  const startDate = new Date(year, month - 1, 1);
  const endDate = new Date(year, month, 0, 23, 59, 59);
  
  return this.aggregate([
    {
      $match: {
        userId: new mongoose.Types.ObjectId(userId),
        createdAt: { $gte: startDate, $lte: endDate }
      }
    },
    {
      $group: {
        _id: {
          week: { $week: "$createdAt" },
          year: { $year: "$createdAt" }
        },
        averageMood: { $avg: "$moodValue" },
        count: { $sum: 1 },
        moodDistribution: {
          $push: "$moodValue"
        }
      }
    },
    { $sort: { "_id.week": 1 } }
  ]);
};

module.exports = mongoose.model('MoodEntry', moodEntrySchema);