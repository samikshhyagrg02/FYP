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

/** Fetch all non-anonymous, non-banned users (any role) */
async function getActiveUsers() {
  const allUsers = await User.find({ isAnonymous: false }).select('_id username isBanned');
  const active = allUsers.filter(u => !u.isBanned);
  const banned = allUsers.filter(u => u.isBanned);

  console.log(`[Scheduler] Total non-anonymous users: ${allUsers.length}`);
  console.log(`[Scheduler] Active (not banned): ${active.length} →`, active.map(u => u.username));
  if (banned.length) console.log(`[Scheduler] Banned (excluded): ${banned.length} →`, banned.map(u => u.username));

  // Also log how many anonymous users exist (excluded by design)
  const anonCount = await User.countDocuments({ isAnonymous: true });
  console.log(`[Scheduler] Anonymous users (excluded by design): ${anonCount}`);

  return active;
}

// ── Job: Mood Reminder (daily 20:00) ─────────────────────────────────────────
async function runMoodReminder(app, { force = false, scheduledRun = false } = {}) {
  try {
    const users = await getActiveUsers();
    const today = startOfToday();
    console.log(`[Scheduler] MoodReminder: checking ${users.length} users, today starts at ${today.toISOString()}, force=${force}`);
    let sent = 0;

    for (const user of users) {
      if (!force) {
        const logged = await MoodEntry.findOne({
          userId: user._id,
          createdAt: { $gte: today },
        });
        console.log(`[Scheduler] MoodReminder: user ${user.username} — logged today: ${!!logged}`);
        if (logged) continue;
      }
      const result = await createNotification(app, {
        userId:  user._id,
        type:    'mood_reminder',
        title:   "How are you feeling today? 😊",
        message: "You haven't logged your mood yet. Take a moment to check in with yourself.",
        link:    '/mood',
      });
      console.log(`[Scheduler] MoodReminder: notification for ${user.username} — result: ${result ? 'sent' : 'skipped (prefs)'}`);
      if (result) sent++;
    }
    console.log(`[Scheduler] Mood reminders sent to ${sent}/${users.length} users`);
    return sent;
  } catch (err) {
    console.error('[Scheduler] Mood reminder error:', err);
    throw err;
  }
}

// ── Job: Journal Reminder (daily 20:30) ──────────────────────────────────────
async function runJournalReminder(app, { force = false } = {}) {
  try {
    const users = await getActiveUsers();
    const twoDaysAgo = daysAgo(2);
    let sent = 0;

    for (const user of users) {
      if (!force) {
        const recent = await JournalEntry.findOne({
          userId: user._id,
          createdAt: { $gte: twoDaysAgo },
        });
        if (recent) continue;
      }
      const result = await createNotification(app, {
        userId:  user._id,
        type:    'journal_reminder',
        title:   "Time to write 📝",
        message: "You haven't journalled in a couple of days. Writing helps process your thoughts and emotions.",
        link:    '/journal',
      });
      if (result) sent++;
    }
    console.log(`[Scheduler] Journal reminders sent to ${sent}/${users.length} users`);
    return sent;
  } catch (err) {
    console.error('[Scheduler] Journal reminder error:', err);
    throw err;
  }
}

// ── Job: Meditation Reminder (daily 09:00) ────────────────────────────────────
async function runMeditationReminder(app, { force = false } = {}) {
  try {
    const users = await getActiveUsers();
    const today = startOfToday();
    let sent = 0;

    for (const user of users) {
      if (!force) {
        const activity = await ActivityLog.findOne({
          userId:      user._id,
          completedAt: { $gte: today },
        });
        if (activity) continue;
      }
      const result = await createNotification(app, {
        userId:  user._id,
        type:    'meditation_reminder',
        title:   "Start your day mindfully 🧘",
        message: "A few minutes of breathing or meditation can set a calm tone for your whole day.",
        link:    '/mindfulness',
      });
      if (result) sent++;
    }
    console.log(`[Scheduler] Meditation reminders sent to ${sent}/${users.length} users`);
    return sent;
  } catch (err) {
    console.error('[Scheduler] Meditation reminder error:', err);
    throw err;
  }
}



// ── Schedule a job to run daily at a fixed time ───────────────────────────────
function scheduleDailyJob(name, hours, minutes, fn, app) {
  const run = async () => {
    console.log(`[Scheduler] Running ${name}`);
    await fn(app, { force: false, scheduledRun: true });
    setTimeout(run, 24 * 60 * 60 * 1000);
  };

  const delay = msUntilNext(hours, minutes);
  const runAt = new Date(Date.now() + delay);
  console.log(`[Scheduler] ${name} scheduled for ${runAt.toLocaleTimeString()} (in ${Math.round(delay / 60000)} min)`);
  setTimeout(run, delay);
}

function startScheduler(app) {
  console.log('[Scheduler] Starting reminder scheduler...');
  scheduleDailyJob('MeditationReminder', 9,  0,  runMeditationReminder, app);
  scheduleDailyJob('MoodReminder',       20, 0,  runMoodReminder,       app);
  scheduleDailyJob('JournalReminder',    20, 30, runJournalReminder,    app);
}

module.exports = {
  startScheduler,
  runMoodReminder,
  runJournalReminder,
  runMeditationReminder,
};
