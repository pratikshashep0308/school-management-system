const mongoose = require('mongoose');

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(process.env.MONGO_URI, {
      // These options silence Mongoose deprecation warnings
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    // ── Drop stale unique index on TransportAssignment.student ──────────────
    // Older schema versions added unique:true on student field.
    // That index prevents re-assigning the same student to a new route.
    // Drop stale indexes
    const drops = [
      ['transportassignments', 'student_1'],
      ['buses', 'school_1_busNumber_1'],
      ['buses', 'busNumber_1'],
      ['buses', 'school_1_registrationNo_1'],
      ['buses', 'registrationNo_1'],
      ['busroutes', 'school_1_code_1'],
      ['busroutes', 'code_1'],
      ['busroutes', 'school_1'],
    ];
    for (const [col, idx] of drops) {
      try {
        await conn.connection.collection(col).dropIndex(idx);
        console.log('✅ Dropped index:', col, idx);
      } catch (_) {}
    }
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;