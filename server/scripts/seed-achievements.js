/**
 * Seeds achievement definitions into MongoDB.
 * Run: node server/scripts/seed-achievements.js
 */
const mongoose = require('mongoose');
const { AchievementDef } = require('../models/MindbloomGamification');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const achievements = [
  // ── Streak achievements ──────────────────────────────────────────────────
  {
    id: 'streak_3',
    name: 'First Habit',
    description: 'Complete activities 3 days in a row',
    icon: '🔥',
    bonusXp: 15,
    condition: { type: 'streak', value: 3 }
  },
  {
    id: 'streak_7',
    name: 'Week Warrior',
    description: 'Maintain a 7-day activity streak',
    icon: '⭐',
    bonusXp: 30,
    condition: { type: 'streak', value: 7 }
  },
  {
    id: 'streak_30',
    name: 'Monthly Master',
    description: 'Maintain a 30-day activity streak',
    icon: '👑',
    bonusXp: 100,
    condition: { type: 'streak', value: 30 }
  },
  // ── Total activities ─────────────────────────────────────────────────────
  {
    id: 'activities_10',
    name: 'Getting Started',
    description: 'Complete 10 mindfulness activities',
    icon: '🌱',
    bonusXp: 20,
    condition: { type: 'total_activities', value: 10 }
  },
  {
    id: 'activities_30',
    name: 'Mindful Explorer',
    description: 'Complete 30 mindfulness activities',
    icon: '🧘',
    bonusXp: 50,
    condition: { type: 'total_activities', value: 30 }
  },
  {
    id: 'activities_100',
    name: 'Zen Champion',
    description: 'Complete 100 mindfulness activities',
    icon: '🏆',
    bonusXp: 150,
    condition: { type: 'total_activities', value: 100 }
  },
  // ── Meditation specific ──────────────────────────────────────────────────
  {
    id: 'meditation_5',
    name: 'Calm Seeker',
    description: 'Complete 5 meditation sessions',
    icon: '🕯️',
    bonusXp: 15,
    condition: { type: 'activity_type_count', value: 5, activityType: 'meditation' }
  },
  {
    id: 'meditation_20',
    name: 'Deep Thinker',
    description: 'Complete 20 meditation sessions',
    icon: '🌙',
    bonusXp: 40,
    condition: { type: 'activity_type_count', value: 20, activityType: 'meditation' }
  },
  // ── Breathing specific ───────────────────────────────────────────────────
  {
    id: 'breathing_5',
    name: 'Breath Aware',
    description: 'Complete 5 breathing exercises',
    icon: '🌬️',
    bonusXp: 10,
    condition: { type: 'activity_type_count', value: 5, activityType: 'breathing' }
  },
  {
    id: 'breathing_20',
    name: 'Breath Master',
    description: 'Complete 20 breathing exercises',
    icon: '💨',
    bonusXp: 35,
    condition: { type: 'activity_type_count', value: 20, activityType: 'breathing' }
  },
  // ── XP milestones ────────────────────────────────────────────────────────
  {
    id: 'xp_100',
    name: 'Point Collector',
    description: 'Earn 100 total XP',
    icon: '✨',
    bonusXp: 10,
    condition: { type: 'total_xp', value: 100 }
  },
  {
    id: 'xp_500',
    name: 'XP Veteran',
    description: 'Earn 500 total XP',
    icon: '💎',
    bonusXp: 50,
    condition: { type: 'total_xp', value: 500 }
  }
];

async function seed() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbloom');
  console.log('Connected to MongoDB');

  for (const ach of achievements) {
    await AchievementDef.findOneAndUpdate({ id: ach.id }, ach, { upsert: true, new: true });
  }

  console.log(`Seeded ${achievements.length} achievements`);
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });
