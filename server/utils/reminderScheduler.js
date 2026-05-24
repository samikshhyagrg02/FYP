/**
 * reminderScheduler.js
 *
 * Fires scheduled notifications for:
 *  - mood_reminder       — daily at 20:00, for users who haven't logged mood today
 *  - journal_reminder    — daily at 20:30, for users who haven't journalled in 2+ days
 *  - meditation_reminder — daily at 09:00, for users who haven't done mindfulness today
 *  - weekly_summary      — every Monday at 08:00, with last week's mood + activity stats
 *
 * Call startScheduler(app) once from server.js after DB connects.
 * No external packages needed — uses setInterval with drift correction.
 */

const User        = require('../models/User');
const MoodEntry   = require('../models/MoodEntry');
const JournalEntry = require('../models/JournalEntry');
const { ActivityLog, UserProgress } = require('../models/MindbloomGamification');
const { createNotification } = require('./notificationHelper');

// ── Helpers ───────────────────────────────────────────────────────────────────

/** Returns a Date set to today at HH:MM:00 local time */
function todayAt(hours, minutes) {
  const d = new Date();
  d.setHours(hours, minutes, 0, 0);
  return d;
}

/** ms until the next occurrence of HH:MM (today if still in future, else tomorrow) */
function msUntilNext(hours, minutes) {
  const target = todayAt(hours, minutes);
  const now = Date.now();
  if (target.getTime() > now) return target.getTime() - now;
  // already passed today — schedule for tomorrow
  target.setDate(target.getDate() + 1);
  return target.getTime() - now;
}

/** Start of today (midnight) */
function startOfToday() {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

/** Start of N days ago */
function daysAgo(n) {
  const d = startOfToday();
  d.setDate(d.getDate() - n);
  return d;
}

/** Fetch all non-anonymous, non-banned regular users */
async function getActiveUsers() {
  return User.find({ isAnonymous: false, isBanned: false, role: 'user' }).select('_id username');
}

// ── Job: Mood Reminder (daily 20:00) ─────────────────────────────────────────
async function runMoodReminder(app) {
  try {
    const users = await getActiveUsers();
    const today = startOfToday();

    for (const user of users) {
      const logged = await MoodEntry.findOne({
        userId: user._id,
        createdAt: { $gte: today },
      });
      if (!logged) {
        await createNotification(app, {
          userId:  user._id,
          type:    'mood_reminder',
          title:   "How are you feeling today? 😊",
          message: "You haven't logged your mood yet. Take a moment to check in with yourself.",
          link:    '/mood',
        });
      }
    }
    console.log('[Scheduler] Mood reminders sent');
  } catch (err) {
    console.error('[Scheduler] Mood reminder error:', err);
  }
}

// ── Job: Journal Reminder (daily 20:30) ──────────────────────────────────────
async function runJournalReminder(app) {
  try {
    const users = await getActiveUsers();
    const twoDaysAgo = daysAgo(2);

    for (const user of users) {
      const recent = await JournalEntry.findOne({
        userId: user._id,
        createdAt: { $gte: twoDaysAgo },
      });
      if (!recent) {
        await createNotification(app, {
          userId:  user._id,
          type:    'journal_reminder',
          title:   "Time to write 📝",
          message: "You haven't journalled in a couple of days. Writing helps process your thoughts and emotions.",
          link:    '/journal',
        });
      }
    }
    console.log('[Scheduler] Journal reminders sent');
  } catch (err) {
    console.error('[Scheduler] Journal reminder error:', err);
  }
}

// ── Job: Meditation Reminder (daily 09:00) ────────────────────────────────────
async function runMeditationReminder(app) {
  try {
    const users = await getActiveUsers();
    const today = startOfToday();

    for (const user of users) {
      const activity = await ActivityLog.findOne({
        userId:      user._id,
        completedAt: { $gte: today },
      });
      if (!activity) {
        await createNotification(app, {
          userId:  user._id,
          type:    'meditation_reminder',
          title:   "Start your day mindfully 🧘",
          message: "A few minutes of breathing or meditation can set a calm tone for your whole day.",
          link:    '/mindfulness',
        });
      }
    }
    console.log('[Scheduler] Meditation reminders sent');
  } catch (err) {
    console.error('[Scheduler] Meditation reminder error:', err);
  }
}

// ── Job: Weekly Summary (every Monday 08:00) ──────────────────────────────────
async function runWeeklySummary(app) {
  // Only run on Mondays
  if (new Date().getDay() !== 1) return;

  try {
    const users = await getActiveUsers();

    // Last week: Mon–Sun
    const now       = new Date();
    const monday    = new Date(now);
    monday.setDate(now.getDate() - 7);
    monday.setHours(0, 0, 0, 0);
    const sunday    = new Date(monday);
    sunday.setDate(monday.getDate() + 7);

    for (const user of users) {
      const [moodEntries, activities, progress] = await Promise.all([
        MoodEntry.find({ userId: user._id, createdAt: { $gte: monday, $lt: sunday } }),
        ActivityLog.find({ userId: user._id, completedAt: { $gte: monday, $lt: sunday } }),
        UserProgress.findOne({ userId: user._id }),
      ]);

      const moodCount  = moodEntries.length;
      const avgMood    = moodCount
        ? (moodEntries.reduce((s, e) => s + e.moodValue, 0) / moodCount).toFixed(1)
        : null;
      const actCount   = activities.length;
      const xpEarned   = activities.reduce((s, a) => s + a.xpEarned, 0);
      const streak     = progress?.currentStreak ?? 0;

      // Only send if user had any activity last week
      if (moodCount === 0 && actCount === 0) continue;

      const parts = [];
      if (moodCount > 0) parts.push(`${moodCount} mood log${moodCount > 1 ? 's' : ''} (avg ${avgMood}/5)`);
      if (actCount  > 0) parts.push(`${actCount} mindfulness session${actCount > 1 ? 's' : ''}`);
      if (xpEarned  > 0) parts.push(`${xpEarned} XP earned`);
      if (streak    > 0) parts.push(`${streak}-day streak`);

      await createNotification(app, {
        userId:  user._id,
        type:    'weekly_summary',
        title:   "Your weekly wellness recap 📊",
        message: `Last week: ${parts.join(' · ')}. Keep up the great work!`,
        link:    '/dashboard',
      });
    }
    console.log('[Scheduler] Weekly summaries sent');
  } catch (err) {
    console.error('[Scheduler] Weekly summary error:', err);
  }
}

// ── Schedule a job to run daily at a fixed time ───────────────────────────────
function scheduleDailyJob(name, hours, minutes, fn, app) {
  const run = async () => {
    console.log(`[Scheduler] Running ${name}`);
    await fn(app);
    // Schedule next run in exactly 24 hours
    setTimeout(run, 24 * 60 * 60 * 1000);
  };

  const delay = msUntilNext(hours, minutes);
  const runAt = new Date(Date.now() + delay);
  console.log(`[Scheduler] ${name} scheduled for ${runAt.toLocaleTimeString()} (in ${Math.round(delay / 60000)} min)`);
  setTimeout(run, delay);
}

// ── Public: start all schedulers ─────────────────────────────────────────────
function startScheduler(app) {
  console.log('[Scheduler] Starting reminder scheduler...');
  scheduleDailyJob('MeditationReminder', 9,  0,  runMeditationReminder, app);
  scheduleDailyJob('MoodReminder',       20, 0,  runMoodReminder,       app);
  scheduleDailyJob('JournalReminder',    20, 30, runJournalReminder,    app);
  scheduleDailyJob('WeeklySummary',      8,  0,  runWeeklySummary,      app);
}

module.exports = { startScheduler };
