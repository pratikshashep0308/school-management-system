// backend/scripts/resetAdmin.js
require('dotenv').config();
const mongoose = require('mongoose');
const User = require('../models/User');

// ── Edit these two values ──
const NEW_EMAIL    = 'pratikshashep0308@gmail.com';
const NEW_PASSWORD = 'School@123';
// ───────────────────────────

(async () => {
  try {
    const uri = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';
    await mongoose.connect(uri);

    // Grab the existing superAdmin account
    const admin = await User.findOne({ role: 'superAdmin' });
    if (!admin) { console.log('No superAdmin found.'); process.exit(1); }

    console.log(`Updating: ${admin.email}  →  ${NEW_EMAIL}`);
    admin.email    = NEW_EMAIL;
    admin.password = NEW_PASSWORD;   // pre-save hook hashes it
    await admin.save();

    console.log('\n✅ Done. Log in with:');
    console.log(`   Email:    ${NEW_EMAIL}`);
    console.log(`   Password: ${NEW_PASSWORD}\n`);

    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Error:', e.message);
    process.exit(1);
  }
})();