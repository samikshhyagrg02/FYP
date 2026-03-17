const mongoose = require('mongoose');

// ── Activity Log ──────────────────────────────────────────────────────────────
const activityLogSchema = new mongoose.Schema({
  userId:       { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  type:         { type: String, enum: ['meditation', 'breathing'], required: true },
  durationSecs: { type: Number, required: true, min: 0 },
  xpEarned:     { type: Number, required: true, min: 0 },
  completedAt:  { type: Date, default: Date.now }
}, { timestamps: false });

activityLogSchema.index({ userId: 1, completedAt: -1 });
activityLogSchema.index({ userId: 1, completedAt: 1 }); // for daily queries

const ActivityLog = mongoose.model('ActivityLog', activityLogSchema);

// ── Achievement Definition ────────────────────────────────────────────────────
const achievementDefSchema = new mongoose.Schema({
  id:          { type: String, required: true, unique: true },
  name:        { type: String, required: true },
  description: { type: String, required: true },
  icon:        { type: String, required: true },
  bonusXp:     { type: Number, default: 0 },
  condition:   {
    type:  { type: String, enum: ['streak', 'total_activities', 'total_xp', 'activity_type_count'], required: true },
    value: { type: Number, required: true },
    activityType: String // for activity_type_count
  }
}, { timestamps: false });

const AchievementDef = mongoose.model('AchievementDef', achievementDefSchema);

// ── User Progress ─────────────────────────────────────────────────────────────
const userProgressSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId, ref: 'User',
    required: true, unique: true
  },
  totalXp:            { type: Number, default: 0, min: 0 },
  currentStreak:      { type: Number, default: 0, min: 0 },
  longestStreak:      { type: Number, default: 0, min: 0 },
  lastActivityDate:   { type: Date, default: null },   // date of last completed activity
  streakFreezeUsed:   { type: Boolean, default: false },
  streakFreezeActive: { type: Boolean, default: false },
  totalActivities:    { type: Number, default: 0, min: 0 },
  meditationCount:    { type: Number, default: 0, min: 0 },
  breathingCount:     { type: Number, default: 0, min: 0 },
  earnedAchievements: [{
    achievementId: String,
    earnedAt:      { type: Date, default: Date.now }
  }],
  // Daily goal tracking (reset each day)
  dailyXp:       { type: Number, default: 0, min: 0 },
  dailyGoal:     { type: Number, default: 20 },
  dailyGoalDate: { type: Date, default: null }, // which day dailyXp belongs to
  dailyGoalMet:  { type: Boolean, default: false }
}, { timestamps: true });

userProgressSchema.index({ userId: 1 });
userProgressSchema.index({ totalXp: -1 });
userProgressSchema.index({ currentStreak: -1 });

// ── Helpers ───────────────────────────────────────────────────────────────────
function toDateOnly(d) {
  const dt = new Date(d);
  dt.setHours(0, 0, 0, 0);
  return dt;
}

// ── Methods ───────────────────────────────────────────────────────────────────

/**
 * Call after a completed activity. Awards XP, updates streak, daily goal.
 * Returns { xpEarned, streakChanged, dailyGoalJustMet, newAchievements }
 */
userProgressSchema.methods.recordActivity = async function(type, durationSecs) {
  const XP_MAP = { meditation: 10, breathing: 5 };
  const xpEarned = XP_MAP[type] || 5;

  const today = toDateOnly(new Date());

  // ── Daily XP reset ──
  const lastGoalDate = this.dailyGoalDate ? toDateOnly(this.dailyGoalDate) : null;
  if (!lastGoalDate || lastGoalDate.getTime() !== today.getTime()) {
    this.dailyXp = 0;
    this.dailyGoalMet = false;
    this.dailyGoalDate = today;
  }

  // ── Streak logic ──
  let streakChanged = false;
  const lastAct = this.lastActivityDate ? toDateOnly(this.lastActivityDate) : null;

  if (!lastAct) {
    this.currentStreak = 1;
    this.longestStreak = 1;
    streakChanged = true;
  } else {
    const diffDays = Math.round((today - lastAct) / 86400000);
    if (diffDays === 0) {
      // same day – streak unchanged
    } else if (diffDays === 1) {
      this.currentStreak += 1;
      if (this.currentStreak > this.longestStreak) this.longestStreak = this.currentStreak;
      streakChanged = true;
    } else {
      // missed day(s)
      if (this.streakFreezeActive && !this.streakFreezeUsed && diffDays === 2) {
        // freeze absorbs one missed day
        this.streakFreezeUsed = true;
        this.streakFreezeActive = false;
      } else {
        this.currentStreak = 1;
        streakChanged = true;
      }
    }
  }
  this.lastActivityDate = today;

  // ── XP & counters ──
  this.totalXp += xpEarned;
  this.dailyXp += xpEarned;
  this.totalActivities += 1;
  if (type === 'meditation') this.meditationCount += 1;
  if (type === 'breathing')  this.breathingCount  += 1;

  // ── Daily goal ──
  let dailyGoalJustMet = false;
  if (!this.dailyGoalMet && this.dailyXp >= this.dailyGoal) {
    this.dailyGoalMet = true;
    dailyGoalJustMet = true;
  }

  // ── Achievements ──
  const newAchievements = await this._checkAchievements();

  await this.save();

  // ── Log the activity ──
  await ActivityLog.create({ userId: this.userId, type, durationSecs, xpEarned });

  return { xpEarned, streakChanged, dailyGoalJustMet, newAchievements };
};

userProgressSchema.methods._checkAchievements = async function() {
  const earned = this.earnedAchievements.map(e => e.achievementId);
  const all = await AchievementDef.find({ id: { $nin: earned } });
  const newOnes = [];

  for (const ach of all) {
    let met = false;
    const { type, value, activityType } = ach.condition;
    if (type === 'streak')               met = this.currentStreak >= value;
    if (type === 'total_activities')     met = this.totalActivities >= value;
    if (type === 'total_xp')             met = this.totalXp >= value;
    if (type === 'activity_type_count') {
      const count = activityType === 'meditation' ? this.meditationCount : this.breathingCount;
      met = count >= value;
    }
    if (met) {
      this.earnedAchievements.push({ achievementId: ach.id, earnedAt: new Date() });
      this.totalXp += ach.bonusXp;
      newOnes.push(ach);
    }
  }
  return newOnes;
};

const UserProgress = mongoose.model('UserProgress', userProgressSchema);

module.exports = { UserProgress, ActivityLog, AchievementDef };
