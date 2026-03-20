/**
 * Creates an admin user.
 * Usage: node server/scripts/create-admin.js
 * Set ADMIN_USERNAME, ADMIN_PASSWORD, ADMIN_EMAIL env vars or edit defaults below.
 */
const mongoose = require('mongoose');
const User = require('../models/User');
require('dotenv').config({ path: require('path').join(__dirname, '../.env') });

const ADMIN_USERNAME = process.env.ADMIN_USERNAME || 'admin';
const ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin@123456';
const ADMIN_EMAIL    = process.env.ADMIN_EMAIL    || 'admin@mindbloom.com';

async function run() {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/mindbloom');
  console.log('Connected to MongoDB');

  const existing = await User.findOne({ username: ADMIN_USERNAME });
  if (existing) {
    if (existing.role !== 'admin') {
      existing.role = 'admin';
      await existing.save();
      console.log(`Upgraded existing user "${ADMIN_USERNAME}" to admin`);
    } else {
      console.log(`Admin user "${ADMIN_USERNAME}" already exists`);
    }
    await mongoose.disconnect();
    return;
  }

  const admin = new User({
    username: ADMIN_USERNAME,
    email: ADMIN_EMAIL,
    passwordHash: ADMIN_PASSWORD,
    isAnonymous: false,
    role: 'admin'
  });

  await admin.save();
  console.log(`✅ Admin user created: ${ADMIN_USERNAME} / ${ADMIN_PASSWORD}`);
  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });
