// assignRollNumbers.js — one-time script to fill roll numbers for existing students.
// Run on the server:  node assignRollNumbers.js
//
// - Numbers students per class (each class starts at 1) by admission order (oldest first).
// - ONLY fills blank roll numbers; keeps any existing ones and continues after the highest.
// - Uses the raw MongoDB driver, so no Mongoose validation can block it.

const mongoose = require('mongoose');

const MONGO_URI = process.env.MONGO_URI || 'mongodb://localhost:27017/school_management';

(async () => {
  try {
    await mongoose.connect(MONGO_URI);
    console.log('✅ Connected to MongoDB');

    const db = mongoose.connection.db;
    const students = db.collection('students');

    // Get every distinct class that has students
    const classIds = await students.distinct('class');
    console.log(`Found ${classIds.length} class(es) with students`);

    let totalFilled = 0;

    for (const cid of classIds) {
      if (!cid) continue;

      // Oldest first (admission order)
      const list = await students
        .find({ class: cid })
        .sort({ createdAt: 1, _id: 1 })
        .project({ _id: 1, rollNumber: 1 })
        .toArray();

      // Highest roll number already used in this class
      let maxUsed = 0;
      for (const st of list) {
        const num = parseInt(st.rollNumber, 10);
        if (!isNaN(num) && num > maxUsed) maxUsed = num;
      }

      // Fill only the blanks
      let n = maxUsed + 1;
      let filledInClass = 0;
      for (const st of list) {
        const hasRoll = st.rollNumber && String(st.rollNumber).trim() !== '';
        if (hasRoll) continue;
        await students.updateOne({ _id: st._id }, { $set: { rollNumber: String(n) } });
        n++;
        filledInClass++;
        totalFilled++;
      }
      console.log(`  Class ${cid}: filled ${filledInClass} (started at ${maxUsed + 1})`);
    }

    console.log(`\n✅ Done. Filled roll numbers for ${totalFilled} student(s). Existing roll numbers kept.`);
    await mongoose.disconnect();
    process.exit(0);
  } catch (err) {
    console.error('❌ Error:', err.message);
    process.exit(1);
  }
})();