/**
 * migrateParents.js
 * One-time migration: backfill parentId on Student documents that have a
 * parentEmail but no parentId, creating parent User accounts where missing.
 *
 * Run once: node utils/migrateParents.js
 */

require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt   = require('bcryptjs');

async function run() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  // Lazy-load models after connection
  const User    = require('../models/User');
  const Student = require('../models/Student');

  // Find every student that has a parentEmail but no parentId set
  const students = await Student.find({
    parentEmail: { $exists: true, $ne: '' },
    parentId:    { $exists: false },
  }).populate('user', 'name');

  console.log(`Found ${students.length} student(s) needing parent migration`);

  let created = 0, linked = 0, skipped = 0;

  for (const student of students) {
    const email = student.parentEmail?.trim().toLowerCase();
    if (!email) { skipped++; continue; }

    try {
      let parentUser = await User.findOne({ email });

      if (!parentUser) {
        // Hash password manually since we're calling User.create which triggers pre-save hook
        parentUser = await User.create({
          name:     student.parentName || student.guardianName || `Parent of ${student.user?.name || 'Student'}`,
          email,
          phone:    student.parentPhone || student.guardianPhone || '',
          password: 'Parent@123',
          role:     'parent',
          school:   student.school,
          isActive: true,
        });
        created++;
        console.log(`  CREATED parent: ${email} for student ${student.admissionNumber}`);
      } else {
        linked++;
        console.log(`  LINKED existing user: ${email} for student ${student.admissionNumber}`);
      }

      await Student.findByIdAndUpdate(student._id, {
        parentId: parentUser._id,
        parent:   parentUser._id,
      });
    } catch (err) {
      console.error(`  ERROR on ${student.admissionNumber} (${email}): ${err.message}`);
      skipped++;
    }
  }

  console.log(`\nMigration complete:`);
  console.log(`  Created : ${created} new parent accounts`);
  console.log(`  Linked  : ${linked} existing accounts`);
  console.log(`  Skipped : ${skipped}`);

  await mongoose.disconnect();
}

run().catch(err => { console.error(err); process.exit(1); });