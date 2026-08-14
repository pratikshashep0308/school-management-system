// backend/scripts/listUsers.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    await mongoose.connect(uri);
    const users = await User.find({}, { email: 1, role: 1, name: 1 }).lean();
    console.log(`\nFound ${users.length} user(s):\n`);
    users.forEach(u => console.log(`  ${u.role?.padEnd(16) || '?'}  ${u.email || '(no email)'}  —  ${u.name || ''}`));
    console.log('');
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();