/**
 * scripts/backfillAdmissionSnapshot.js
 *
 * One-shot backfill: for every Student that has no admissionSnapshot, find the
 * matching Admission record and copy its data onto the student. Safe to re-run —
 * skips students that already have a snapshot.
 *
 * USAGE:
 *   cd backend
 *   node scripts/backfillAdmissionSnapshot.js
 *
 * Picks up MONGODB_URI from your normal backend env (.env / process.env), so no
 * extra config needed. Run from the same shell where your backend runs.
 */

require('dotenv').config();           // load backend/.env if present
const mongoose = require('mongoose');
const Student   = require('../models/Student');
const Admission = require('../models/Admission');

const MONGODB_URI = process.env.MONGODB_URI || process.env.MONGO_URI || process.env.DATABASE_URL;

if (!MONGODB_URI) {
  console.error('MONGODB_URI not set. Run from backend/ with your usual env.');
  process.exit(1);
}

(async () => {
  console.log('connecting...');
  await mongoose.connect(MONGODB_URI);
  console.log('connected\n');

  const students = await Student.find({
    $or: [
      { admissionSnapshot: { $exists: false } },
      { admissionSnapshot: null },
    ],
  }).lean();

  console.log(`Found ${students.length} student(s) without a snapshot.\n`);

  let matched = 0, missing = 0, errored = 0;

  for (const stu of students) {
    try {
      const adm = await Admission.findOne({ applicationNumber: stu.admissionNumber }).lean();

      if (!adm) {
        missing++;
        console.log(`  [skip] ${stu.admissionNumber} - no admission record found`);
        continue;
      }

      const snap = { ...adm };
      delete snap._id; delete snap.__v;
      delete snap.timeline; delete snap.processedBy;

      await Student.updateOne(
        { _id: stu._id },
        { $set: { admissionSnapshot: snap } }
      );

      matched++;
      console.log(`  [ok]   ${stu.admissionNumber} - backfilled (${Object.keys(snap).length} fields)`);
    } catch (err) {
      errored++;
      console.error(`  [err]  ${stu.admissionNumber} - ${err.message}`);
    }
  }

  console.log(`\n----------------------------------------------`);
  console.log(`Done. Backfilled ${matched}, no-match ${missing}, errored ${errored}.`);

  await mongoose.disconnect();
  process.exit(0);
})().catch(err => {
  console.error('Fatal:', err);
  process.exit(1);
});