// backend/scripts/checkFeeSystems.js
//
// P0.2 findings §3.1 + open questions 1, 2, 4 — answers what static code cannot:
//   • Which of the parallel fee systems does PRODUCTION actually populate?
//   • Do StudentFee and FeePayment agree, or have they already drifted?
//   • Is transport billed via TransportFee2 or FeeAssignment?
//
// 100% READ-ONLY. Runs counts and aggregates only. Writes nothing.
//
// Run from the backend folder:   node scripts/checkFeeSystems.js

require('dotenv').config();
const mongoose = require('mongoose');

const money = n => '₹' + (n || 0).toLocaleString('en-IN', { maximumFractionDigits: 2 });
const line = () => console.log('─'.repeat(62));

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log('✅ Connected:', mongoose.connection.host, '\n');

    const db = mongoose.connection.db;
    const col = name => db.collection(name);

    // ── 1. Which fee collections hold data? ──────────────────────────────
    console.log('1. FEE COLLECTION ROW COUNTS');
    line();

    const collections = [
      ['studentfees',     'StudentFee      (System A - ledger)'],
      ['feepayments',     'FeePayment      (System B - parallel)'],
      ['feestructures',   'FeeStructure    (System B)'],
      ['feeassignments',  'FeeAssignment   (System C)'],
      ['feetypes',        'FeeType         (System C)'],
      ['feeeditrequests', 'FeeEditRequest  (maker-checker)'],
      ['classfeetemplates','ClassFeeTemplate'],
      ['transportfee2s',  'TransportFee2   (4th money store)'],
    ];

    const counts = {};
    for (const [name, label] of collections) {
      let c = 0;
      try { c = await col(name).countDocuments(); } catch { c = -1; }
      counts[name] = c;
      const flag = c > 0 ? '● IN USE' : c === 0 ? '○ empty' : '? missing';
      console.log(`   ${label.padEnd(38)} ${String(c).padStart(7)}  ${flag}`);
    }

    // ── 2. Embedded receipt counts ───────────────────────────────────────
    console.log('\n2. WHERE DO RECEIPTS ACTUALLY LIVE?');
    line();

    const sfAgg = await col('studentfees').aggregate([
      { $project: { n: { $size: { $ifNull: ['$paymentHistory', []] } },
                    paid: '$paidAmount', total: '$totalFees' } },
      { $group: { _id: null, receipts: { $sum: '$n' },
                  paid: { $sum: '$paid' }, billed: { $sum: '$total' } } },
    ]).toArray().catch(() => []);

    const faAgg = await col('feeassignments').aggregate([
      { $project: { n: { $size: { $ifNull: ['$payments', []] } }, paid: '$paidAmount' } },
      { $group: { _id: null, receipts: { $sum: '$n' }, paid: { $sum: '$paid' } } },
    ]).toArray().catch(() => []);

    const fpAgg = await col('feepayments').aggregate([
      { $group: { _id: null, n: { $sum: 1 }, amt: { $sum: '$amount' } } },
    ]).toArray().catch(() => []);

    const sf = sfAgg[0] || { receipts: 0, paid: 0, billed: 0 };
    const fa = faAgg[0] || { receipts: 0, paid: 0 };
    const fp = fpAgg[0] || { n: 0, amt: 0 };

    console.log(`   StudentFee.paymentHistory[]  ${String(sf.receipts).padStart(7)} receipts  ${money(sf.paid)}`);
    console.log(`   FeePayment documents         ${String(fp.n).padStart(7)} receipts  ${money(fp.amt)}`);
    console.log(`   FeeAssignment.payments[]     ${String(fa.receipts).padStart(7)} receipts  ${money(fa.paid)}`);
    console.log(`\n   StudentFee total billed:     ${money(sf.billed)}`);

    // ── 3. Do the dual-written systems reconcile? ────────────────────────
    console.log('\n3. RECONCILIATION: StudentFee vs FeePayment');
    line();
    console.log('   (recordPayment writes BOTH with no transaction — do they agree?)\n');

    const diffCount = sf.receipts - fp.n;
    const diffAmt   = (sf.paid || 0) - (fp.amt || 0);

    console.log(`   Receipt count difference:  ${diffCount}`);
    console.log(`   Amount difference:         ${money(diffAmt)}`);

    if (sf.receipts === 0 && fp.n === 0) {
      console.log('\n   ⚪ No payment data yet — nothing to reconcile.');
    } else if (diffCount === 0 && Math.abs(diffAmt) < 0.01) {
      console.log('\n   ✅ IN SYNC. Either source could seed the ledger.');
    } else {
      console.log('\n   🔴 DRIFT DETECTED. The two systems already disagree.');
      console.log('      Opening ledger balance must be agreed with the school');
      console.log('      before any FMS posting begins.');
    }

    // ── 4. Float-precision check (P0.1 finding ①) ────────────────────────
    console.log('\n4. FLOAT PRECISION IN EXISTING MONEY DATA');
    line();

    const fractional = await col('studentfees').aggregate([
      { $unwind: { path: '$paymentHistory', preserveNullAndEmptyArrays: false } },
      { $project: { amt: '$paymentHistory.amount',
                    paise: { $subtract: [
                      { $multiply: ['$paymentHistory.amount', 100] },
                      { $floor: { $multiply: ['$paymentHistory.amount', 100] } } ] } } },
      { $match: { paise: { $gt: 0.0000001 } } },
      { $count: 'n' },
    ]).toArray().catch(() => []);

    const badRows = fractional[0]?.n || 0;
    if (badRows === 0) {
      console.log('   ✅ All payment amounts are exact to the paise.');
      console.log('      Rupee→paise conversion will be clean.');
    } else {
      console.log(`   🔴 ${badRows} payment(s) are NOT exactly representable in paise.`);
      console.log('      These need a documented rounding decision before migration.');
    }

    // ── 5. Transport: which store? ───────────────────────────────────────
    console.log('\n5. TRANSPORT FEES — WHICH STORE IS LIVE?');
    line();

    const tf2 = counts['transportfee2s'] || 0;
    const faTransport = await col('feeassignments')
      .countDocuments({ transportRoute: { $ne: null } }).catch(() => 0);

    console.log(`   TransportFee2 documents:              ${tf2}`);
    console.log(`   FeeAssignment with transportRoute:    ${faTransport}`);

    if (tf2 > 0 && faTransport > 0)      console.log('\n   🔴 BOTH in use — must pick one before posting.');
    else if (tf2 > 0)                    console.log('\n   → TransportFee2 is the live store.');
    else if (faTransport > 0)            console.log('\n   → FeeAssignment.transportRoute is the live store.');
    else                                 console.log('\n   ⚪ Neither populated yet.');

    // ── 6. Other unrecorded income ───────────────────────────────────────
    console.log('\n6. INCOME NOT VISIBLE TO ANY EXISTING REPORT');
    line();

    const libAgg = await col('bookissues').aggregate([
      { $group: { _id: null, total: { $sum: '$lateFee' } } },
    ]).toArray().catch(() => []);

    const admAgg = await col('admissions').aggregate([
      { $match: { 'registrationFee.paid': true } },
      { $group: { _id: null, n: { $sum: 1 }, total: { $sum: '$registrationFee.amount' } } },
    ]).toArray().catch(() => []);

    console.log(`   Library late fees collected:   ${money(libAgg[0]?.total)}`);
    console.log(`   Admission registration fees:   ${money(admAgg[0]?.total)}  (${admAgg[0]?.n || 0} paid)`);
    console.log('\n   Neither appears in GET /api/expenses/finance.');

    // ── 7. Payroll ───────────────────────────────────────────────────────
    console.log('\n7. PAYROLL');
    line();

    const slips = await col('salaryslips').countDocuments().catch(() => 0);
    const paidAgg = await col('salaryslips').aggregate([
      { $match: { status: 'paid' } },
      { $group: { _id: null, n: { $sum: 1 }, net: { $sum: '$netSalary' } } },
    ]).toArray().catch(() => []);

    console.log(`   SalarySlip documents:  ${slips}`);
    console.log(`   Marked paid:           ${paidAgg[0]?.n || 0}   ${money(paidAgg[0]?.net)}`);
    console.log('\n   This cost appears in NO existing profit figure.');

    // ── 8. Multi-tenancy ─────────────────────────────────────────────────
    console.log('\n8. MULTI-TENANCY');
    line();
    const schools = await col('schools').countDocuments().catch(() => 0);
    console.log(`   School documents: ${schools}` +
      (schools > 1 ? '  🔴 multi-tenant — scope every FMS query' : '  (single school)'));

    // ── Verdict ──────────────────────────────────────────────────────────
    console.log('\n' + '='.repeat(62));
    console.log('ANSWERS FOR P0.3 / P0.4');
    console.log('='.repeat(62));

    const live = [];
    if (sf.receipts > 0) live.push('StudentFee.paymentHistory[]');
    if (fp.n > 0)        live.push('FeePayment');
    if (fa.receipts > 0) live.push('FeeAssignment.payments[]');

    console.log('Receipt stores holding data: ' + (live.length ? live.join(', ') : 'none yet'));
    if (live.length > 1) {
      console.log('→ Multiple stores are live. Post the ledger from ONE only,');
      console.log('  or every receipt gets double-counted.');
    }
    console.log('='.repeat(62));
  } catch (err) {
    console.error('❌ Fatal:', err.message);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect().catch(() => {});
  }
})();