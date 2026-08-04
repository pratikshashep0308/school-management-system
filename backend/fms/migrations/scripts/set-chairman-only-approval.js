// backend/fms/migrations/scripts/set-chairman-only-approval.js
//
// Chairman approves every expense, at every amount.
//
//   cd backend && node fms/migrations/scripts/set-chairman-only-approval.js
//
// ─── WHAT THIS CHANGES ───────────────────────────────────────────────────────
// The seeded matrix escalates by amount:
//
//   ≤ ₹10,000            deptHead
//   ₹10,001 – ₹50,000    principal
//   ₹50,001 – ₹2,00,000  principal + chairman
//   > ₹2,00,000          principal + chairman + trustee
//
// This school has decided the chairman approves everything. After this, every
// tier lists chairman alone.
//
// ─── WHY IT IS A SCRIPT AND NOT A HAND EDIT ──────────────────────────────────
// The matrix is a governance record. Changing who may approve school spending
// by typing into a database shell leaves no trace of who decided it or when.
// This writes an audit entry, bumps the version, and can be re-read later.
//
// ─── THE CONSEQUENCE TO UNDERSTAND BEFORE RUNNING IT ─────────────────────────
// Nobody may approve their own request — that rule is enforced regardless of
// the matrix. With chairman as the ONLY approver at every tier, an expense
// raised BY the chairman can never be approved by anyone. It would sit
// submitted indefinitely.
//
// That is acceptable only if the chairman never raises expenses — the
// accountant always does. If that changes, add a second approver at some tier
// or those requests will be stuck with no way forward but cancellation.
//
// Reversible: re-run with --restore to put the graduated tiers back.

const mongoose = require('mongoose');
require('dotenv').config();

const RESTORE = process.argv.includes('--restore');

const CHAIRMAN_ONLY = [
  { tier: 1, minAmount: 0,        maxAmount: 1000000,  approvers: ['chairman'], label: 'Up to ₹10,000' },
  { tier: 2, minAmount: 1000001,  maxAmount: 5000000,  approvers: ['chairman'], label: '₹10,001 – ₹50,000' },
  { tier: 3, minAmount: 5000001,  maxAmount: 20000000, approvers: ['chairman'], label: '₹50,001 – ₹2,00,000' },
  { tier: 4, minAmount: 20000001, maxAmount: null,     approvers: ['chairman'], label: 'Above ₹2,00,000' },
];

const GRADUATED = [
  { tier: 1, minAmount: 0,        maxAmount: 1000000,  approvers: ['deptHead'], label: 'Up to ₹10,000' },
  { tier: 2, minAmount: 1000001,  maxAmount: 5000000,  approvers: ['principal'], label: '₹10,001 – ₹50,000' },
  { tier: 3, minAmount: 5000001,  maxAmount: 20000000, approvers: ['principal', 'chairman'], label: '₹50,001 – ₹2,00,000' },
  { tier: 4, minAmount: 20000001, maxAmount: null,     approvers: ['principal', 'chairman', 'trustee'], label: 'Above ₹2,00,000' },
];

async function main() {
  const uri = process.env.MONGO_URI;
  if (!uri) throw new Error('MONGO_URI not set — run from backend/');

  await mongoose.connect(uri);
  const db = mongoose.connection.db;
  const matrices = db.collection('fms_approvalmatrix');
  const audit = db.collection('fms_audittrail');

  const tiers = RESTORE ? GRADUATED : CHAIRMAN_ONLY;
  const label = RESTORE ? 'graduated (deptHead → principal → chairman → trustee)' : 'chairman only';

  const existing = await matrices.find({}).toArray();
  if (existing.length === 0) {
    console.error('No approval matrix found. Run the migrations first.');
    process.exit(1);
  }

  console.log(`\nBefore:`);
  existing.forEach((m) => (m.tiers || []).forEach((t) =>
    console.log(`  tier ${t.tier}  ${t.label || ''}  →  ${(t.approvers || []).join(', ')}`)));

  for (const m of existing) {
    await matrices.updateOne(
      { _id: m._id },
      {
        $set: {
          tiers,
          version: (m.version || 1) + 1,
          notes: `Approval routing set to ${label} on ${new Date().toISOString().slice(0, 10)}`,
          updatedAt: new Date(),
        },
      }
    );

    // The matrix decides who may authorise school spending. A change to it
    // belongs in the audit trail as much as any voucher does.
    await audit.insertOne({
      school: m.school,
      entity: 'fms_approvalmatrix',
      entityId: m._id,
      action: 'update',
      before: { tiers: m.tiers, version: m.version || 1 },
      after: { tiers, version: (m.version || 1) + 1 },
      notes: `Approval routing changed to ${label}`,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
  }

  const after = await matrices.find({}).toArray();
  console.log(`\nAfter:`);
  after.forEach((m) => (m.tiers || []).forEach((t) =>
    console.log(`  tier ${t.tier}  ${t.label || ''}  →  ${(t.approvers || []).join(', ')}`)));

  if (!RESTORE) {
    console.log('\n⚠  The chairman cannot approve an expense they raised themselves.');
    console.log('   With chairman as the only approver, any expense raised BY the chairman');
    console.log('   will sit submitted with nobody able to act on it. The accountant should');
    console.log('   raise all expense requests.');
    console.log('\n   To undo:  node fms/migrations/scripts/set-chairman-only-approval.js --restore');
  }

  await mongoose.disconnect();
  process.exit(0);
}

main().catch(async (e) => {
  console.error('\nFAILED:', e.message);
  try { await mongoose.disconnect(); } catch { /* */ }
  process.exit(1);
});
