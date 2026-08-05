// backend/fms/migrations/scripts/backfill-actor-names.js
//
// Fill in actorName / paidByName on records written before those fields existed.
//
//   cd backend && node fms/migrations/scripts/backfill-actor-names.js
//
// ─── WHY THE NAME IS STORED AT ALL ───────────────────────────────────────────
// Approval and payment records held only an actor id and an email. Resolving a
// name meant joining to `users` at read time — which works right up until the
// user is gone.
//
// On 4 August 2026 a database refresh from production replaced the `users`
// collection and removed three finance accounts created only on staging. Any
// history that resolved names by lookup would have gone blank for those actions:
// the approval happened, the record existed, and the system could no longer say
// who did it.
//
// So the name is denormalised at the moment of the action, exactly as
// `requestedByName` already is on the expense request. This script fills in what
// was recorded before that change.
//
// ─── WHAT IT CANNOT RECOVER ──────────────────────────────────────────────────
// Records whose actor no longer exists. Their name was never stored and the
// user is gone; nothing can reconstruct it. Those keep their email, which is at
// least an identifier a person can recognise. The script reports how many.
//
// Read-only on `users`. Idempotent — re-running changes nothing already set.

const mongoose = require('mongoose');
require('dotenv').config();

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;

  // One pass over users, held in memory. 245 documents — a lookup per record
  // would be hundreds of round trips for no benefit.
  const users = await db.collection('users')
    .find({}, { projection: { name: 1, email: 1 } }).toArray();
  const nameById = new Map(users.map((u) => [String(u._id), u.name]));
  const nameByEmail = new Map(users.filter((u) => u.email).map((u) => [u.email, u.name]));

  const resolve = (id, email) =>
    nameById.get(String(id)) || (email ? nameByEmail.get(email) : null) || null;

  let filled = 0;
  let unresolved = 0;

  // ── Approval records ───────────────────────────────────────────────────────
  const approvals = await db.collection('fms_expenseapprovals')
    .find({ actorName: { $in: [null, ''] } }).toArray();

  for (const a of approvals) {
    const name = resolve(a.actor, a.actorEmail);
    if (!name) { unresolved += 1; continue; }
    await db.collection('fms_expenseapprovals')
      .updateOne({ _id: a._id }, { $set: { actorName: name } });
    filled += 1;
  }
  console.log(`approvals: ${filled} filled, ${unresolved} unresolvable`);

  // ── Workflow steps, embedded on the expense request ────────────────────────
  let wfFilled = 0;
  let wfUnresolved = 0;
  const expenses = await db.collection('fms_expenserequests')
    .find({ 'workflow.0': { $exists: true } }).toArray();

  for (const e of expenses) {
    let changed = false;
    const workflow = (e.workflow || []).map((w) => {
      if (w.actorName) return w;
      const name = resolve(w.actor, w.actorEmail);
      if (!name) { wfUnresolved += 1; return w; }
      changed = true; wfFilled += 1;
      return { ...w, actorName: name };
    });
    if (changed) {
      await db.collection('fms_expenserequests')
        .updateOne({ _id: e._id }, { $set: { workflow } });
    }
  }
  console.log(`workflow steps: ${wfFilled} filled, ${wfUnresolved} unresolvable`);

  // ── Payment vouchers ───────────────────────────────────────────────────────
  let payFilled = 0;
  let payUnresolved = 0;
  const payments = await db.collection('fms_paymentvouchers')
    .find({ paidBy: { $ne: null }, paidByName: { $in: [null, ''] } }).toArray();

  for (const p of payments) {
    const name = resolve(p.paidBy, null);
    if (!name) { payUnresolved += 1; continue; }
    await db.collection('fms_paymentvouchers')
      .updateOne({ _id: p._id }, { $set: { paidByName: name } });
    payFilled += 1;
  }
  console.log(`payments: ${payFilled} filled, ${payUnresolved} unresolvable`);

  if (unresolved + wfUnresolved + payUnresolved > 0) {
    console.log(
      '\nUnresolvable records are ones whose actor no longer exists — most likely'
      + '\nthe finance users removed by the 4 Aug database refresh. Their name was'
      + '\nnever stored and cannot be recovered; the email remains on the record.'
    );
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  try { await mongoose.disconnect(); } catch { /* */ }
  process.exit(1);
});
