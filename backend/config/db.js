const mongoose = require('mongoose');

// ── BP-000: fail fast on missing configuration ────────────────────────────────
// The connection URI is read from the environment only. It is never hardcoded
// and never committed. Exiting here is deliberate: silently falling back to a
// default localhost URI would let a misconfigured deployment start and write to
// the wrong database.
const requireMongoUri = () => {
  const uri = process.env.MONGO_URI;
  if (!uri || !uri.trim()) {
    console.error(
      '❌ MONGO_URI is not set. Copy backend/.env.example to backend/.env and set it.'
    );
    process.exit(1);
  }
  return uri;
};

// ── BP-000: transaction capability assertion ──────────────────────────────────
// Approved decision D-004 requires promotion to run inside a single
// multi-document transaction. Those are unavailable on a standalone mongod, so a
// standalone deployment must be detected at BOOT rather than midway through a
// promotion batch. A single-node replica set is sufficient.
const assertTransactionSupport = async (conn) => {
  try {
    const session = await conn.startSession();
    await session.endSession();
    console.log('✅ Transactions available (deployment supports sessions)');
    return true;
  } catch (err) {
    console.error(
      '❌ This deployment does not support sessions, so multi-document ' +
      'transactions are unavailable. Promotion (D-004) cannot run safely. ' +
      'Start mongod with --replSet and run rs.initiate(), or use Atlas.'
    );
    console.error(`   Reason: ${err.message}`);
    process.exit(1);
  }
};

const connectDB = async () => {
  try {
    const conn = await mongoose.connect(requireMongoUri(), {
      // These options silence Mongoose deprecation warnings
    });
    console.log(`✅ MongoDB Connected: ${conn.connection.host}`);

    await assertTransactionSupport(conn.connection.getClient());

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