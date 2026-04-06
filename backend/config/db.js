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
    try {
      await conn.connection.collection('transportassignments').dropIndex('student_1');
      console.log('✅ Migration: dropped stale unique index on transportassignments.student');
    } catch (_) {
      // Index doesn't exist — nothing to do
    }
  } catch (error) {
    console.error(`❌ MongoDB connection error: ${error.message}`);
    process.exit(1); // Exit process with failure
  }
};

module.exports = connectDB;