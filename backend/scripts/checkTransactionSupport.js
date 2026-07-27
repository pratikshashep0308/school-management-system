// backend/scripts/checkTransactionSupport.js
//
// P0.1 finding ④ — verifies whether this MongoDB deployment can run the
// multi-document transactions the FMS double-entry ledger depends on.
//
// Run from the backend folder:   node scripts/checkTransactionSupport.js
//
// READ-ONLY on your real data. It creates a throwaway collection
// (`__fms_txn_probe`), commits one transaction, aborts another to confirm
// rollback works, then drops the collection.

require('dotenv').config();
const mongoose = require('mongoose');

(async () => {
  let exitCode = 0;

  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected:', mongoose.connection.host);

    const admin = mongoose.connection.db.admin();

    // ── 1. Server version ────────────────────────────────────────────────
    const info = await admin.serverStatus();
    console.log('   MongoDB server version:', info.version);

    // ── 2. Topology: standalone or replica set? ───────────────────────────
    const hello = await admin.command({ hello: 1 });
    const isReplicaSet = Boolean(hello.setName);

    if (isReplicaSet) {
      console.log(`✅ Replica set detected: "${hello.setName}"`);
      console.log('   Primary:', hello.primary || '(none — election in progress?)');
    } else {
      console.log('❌ STANDALONE deployment — no replica set name reported.');
      console.log('   Multi-document transactions are NOT available.');
    }

    // ── 3. Prove a transaction commits ───────────────────────────────────
    const Probe = mongoose.model(
      '__FmsTxnProbe',
      new mongoose.Schema({ tag: String, n: Number }, { collection: '__fms_txn_probe' })
    );

    console.log('\n── Commit test ──');
    let committed = false;
    const s1 = await mongoose.startSession();
    try {
      await s1.withTransaction(async () => {
        await Probe.create([{ tag: 'commit', n: 1 }], { session: s1 });
        await Probe.create([{ tag: 'commit', n: 2 }], { session: s1 });
      });
      committed = true;
      const count = await Probe.countDocuments({ tag: 'commit' });
      console.log(`✅ Transaction committed — ${count} docs written (expected 2).`);
    } catch (err) {
      console.log('❌ Commit test FAILED:', err.message);
      exitCode = 1;
    } finally {
      await s1.endSession();
    }

    // ── 4. Prove a transaction rolls back ────────────────────────────────
    if (committed) {
      console.log('\n── Rollback test ──');
      const s2 = await mongoose.startSession();
      try {
        await s2.withTransaction(async () => {
          await Probe.create([{ tag: 'rollback', n: 99 }], { session: s2 });
          throw new Error('intentional abort');
        });
        console.log('❌ Expected an abort but the transaction committed.');
        exitCode = 1;
      } catch (err) {
        if (err.message === 'intentional abort') {
          const leaked = await Probe.countDocuments({ tag: 'rollback' });
          if (leaked === 0) {
            console.log('✅ Transaction rolled back cleanly — 0 docs leaked.');
          } else {
            console.log(`❌ Rollback leaked ${leaked} docs. Atomicity is broken.`);
            exitCode = 1;
          }
        } else {
          console.log('❌ Rollback test errored unexpectedly:', err.message);
          exitCode = 1;
        }
      } finally {
        await s2.endSession();
      }
    }

    // ── 5. Clean up ──────────────────────────────────────────────────────
    await mongoose.connection.db.collection('__fms_txn_probe').drop().catch(() => {});

    // ── 6. Verdict ───────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(58));
    if (exitCode === 0 && isReplicaSet) {
      console.log('VERDICT: ✅ Transactions work. FMS Phase 1 is unblocked.');
    } else {
      console.log('VERDICT: ❌ Transactions unavailable. FMS Phase 1 is BLOCKED.');
      console.log('         Convert mongod to a single-node replica set,');
      console.log('         then re-run this script.');
      exitCode = 1;
    }
    console.log('='.repeat(58));
  } catch (err) {
    console.error('❌ Fatal:', err.message);
    exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
    process.exit(exitCode);
  }
})();