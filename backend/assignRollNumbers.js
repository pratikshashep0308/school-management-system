// assignRollNumbers.js — one-time script to give every student an AUTO-format roll number.
//
// Run on the server:  node assignRollNumbers.js
//
// Format matches the admission controller:  AUTO-<last 6 of admission no>-<random>
//   e.g. AUTO-8-8971-ST24
//
// Behaviour:
//   • Students with NO roll number      → get an AUTO roll number.
//   • Students with a PLAIN number (1,2)→ get an AUTO roll number (converted).
//   • Students already AUTO-xxxx         → kept as-is.
//   • Uses the raw MongoDB driver, so no validation can block it.

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';

function makeAutoRoll(admNo, seed) {
  const base = String(admNo || '').slice(-6) || 'STU';
  const rand = (Date.now() + seed).toString(36).slice(-4).toUpperCase();
  const extra = Math.random().toString(36).slice(-2).toUpperCase();
  return `AUTO-${base}-${rand}${extra}`;
}

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const students = db.collection('students');

    const list = await students
      .find({})
      .project({ _id: 1, rollNumber: 1, admissionNumber: 1, admissionNo: 1 })
      .toArray();

    console.log(`Found ${list.length} student(s) total`);

    let filled = 0;
    let kept = 0;
    let seed = 0;
    for (const st of list) {
      const current = st.rollNumber ? String(st.rollNumber).trim() : '';

      // Already an AUTO roll number → keep it.
      if (current.startsWith('AUTO-')) { kept++; continue; }

      // Everything else (blank OR plain number) → give an AUTO roll number.
      const admNo = st.admissionNumber || st.admissionNo || String(st._id);
      const roll = makeAutoRoll(admNo, seed++);
      await students.updateOne({ _id: st._id }, { $set: { rollNumber: roll } });
      filled++;
    }

    console.log(`\n✅ Done. Generated AUTO roll numbers for ${filled} student(s). Kept ${kept} existing AUTO roll number(s).`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();