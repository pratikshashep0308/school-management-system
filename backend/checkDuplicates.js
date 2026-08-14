// checkDuplicates.js — READ-ONLY diagnostic. Finds likely duplicate students.
// It does NOT modify anything. Run:  node checkDuplicates.js
//
// Detects duplicates by several signals, because a "duplicate" can look
// different depending on how it was created:
//   1. Same admission number (should be impossible — it's unique — but checks anyway)
//   2. Same name + same class
//   3. Same name + same date of birth
//   4. Same parent phone + same name
//   5. Same Aadhaar number (if that field exists / has been populated)

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  const uri = process.env.MONGO_URI || process.env.MONGODB_URI || 'mongodb://localhost:27017/school_management';
  await mongoose.connect(uri);
  console.log('✅ Connected to', uri.replace(/\/\/.*@/, '//***@'), '\n');

  const db = mongoose.connection.db;
  const students = db.collection('students');
  const users = db.collection('users');

  // Pull all students with their linked user name/phone.
  const all = await students.aggregate([
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: 'u' } },
    { $unwind: { path: '$u', preserveNullAndEmptyArrays: true } },
    { $project: {
        _id: 1, admissionNumber: 1, rollNumber: 1, class: 1,
        dateOfBirth: 1, parentPhone: 1, parentName: 1,
        aadhaarNumber: 1,
        name: '$u.name', email: '$u.email', status: 1,
    } },
  ]).toArray();

  console.log(`Total student records: ${all.length}\n`);

  const norm = (s) => String(s || '').trim().toLowerCase().replace(/\s+/g, ' ');
  const groups = {};

  const addTo = (map, key, rec) => {
    if (!key) return;
    (map[key] = map[key] || []).push(rec);
  };

  // Build the different duplicate signals
  const byAdm = {}, byNameClass = {}, byNameDob = {}, byPhoneName = {}, byAadhaar = {};
  for (const s of all) {
    addTo(byAdm, norm(s.admissionNumber), s);
    addTo(byNameClass, `${norm(s.name)}|${String(s.class || '')}`, s);
    if (s.dateOfBirth) addTo(byNameDob, `${norm(s.name)}|${new Date(s.dateOfBirth).toISOString().slice(0,10)}`, s);
    if (s.parentPhone) addTo(byPhoneName, `${norm(s.parentPhone)}|${norm(s.name)}`, s);
    if (s.aadhaarNumber) addTo(byAadhaar, norm(s.aadhaarNumber), s);
  }

  const report = (title, map, showKey = true) => {
    const dupes = Object.entries(map).filter(([, arr]) => arr.length > 1);
    console.log(`\n━━━ ${title} ━━━`);
    if (!dupes.length) { console.log('  ✅ None found.'); return 0; }
    let count = 0;
    for (const [key, arr] of dupes) {
      count += arr.length;
      console.log(`\n  ⚠️  ${showKey ? key : ''} — ${arr.length} records:`);
      for (const s of arr) {
        console.log(`     • ${s.name || '(no name)'}  | adm:${s.admissionNumber || '—'}  | roll:${s.rollNumber || '—'}  | class:${s.class || '—'}  | status:${s.status || '—'}  | _id:${s._id}`);
      }
    }
    return count;
  };

  report('Same ADMISSION NUMBER (critical)', byAdm);
  report('Same NAME + CLASS (likely duplicate person)', byNameClass);
  report('Same NAME + DATE OF BIRTH', byNameDob);
  report('Same PARENT PHONE + NAME', byPhoneName);
  report('Same AADHAAR NUMBER', byAadhaar);

  // Also: users with duplicate email (a common cause of duplicate-account bugs)
  const dupEmails = await users.aggregate([
    { $match: { email: { $ne: null } } },
    { $group: { _id: { $toLower: '$email' }, count: { $sum: 1 }, ids: { $push: '$_id' } } },
    { $match: { count: { $gt: 1 } } },
  ]).toArray();
  console.log(`\n━━━ Users with duplicate EMAIL ━━━`);
  if (!dupEmails.length) console.log('  ✅ None found.');
  else dupEmails.forEach(e => console.log(`  ⚠️  ${e._id} — ${e.count} accounts`));

  console.log('\n\n📋 SUMMARY');
  console.log('  Review the groups above. Records that are the SAME real student');
  console.log('  are true duplicates — attendance/fees may split across them.');
  console.log('  Nothing was changed. Share this output to decide which to merge/remove.\n');

  await mongoose.disconnect();
  process.exit(0);
})().catch(e => { console.error('❌', e.message); process.exit(1); });