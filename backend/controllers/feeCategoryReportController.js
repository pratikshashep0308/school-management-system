// backend/controllers/feeCategoryReportController.js
//
// GET /api/fees/category-report
//
// One row per student, with expected/paid/pending for every fee category.
//
// ─── WHY THIS IS A NEW ENDPOINT ──────────────────────────────────────────────
// The existing /fees/students powers the current report and several screens.
// Reshaping it to carry category breakdowns would put that work in the path of
// every caller, including ones that only need a total. This is additive: the
// existing report is untouched.
//
// ─── WHERE THE NUMBERS COME FROM, AND WHY THEY DISAGREE ──────────────────────
// EXPECTED comes from FeeAssignment.finalAmount, grouped by fee type. Clean and
// authoritative — 444 assignments across School Fee, Stationary and Transport.
//
// PAID cannot come from the same place. FeeAssignment.paidAmount exists on the
// schema and is ZERO on all 444 records — payments are written to
// StudentFee.paymentHistory and never posted back. So paid is derived from the
// per-receipt breakdown in paymentHistory[].items[], whose labels ("School
// Fee", "Stationary", "Transport Fee") match the fee type names exactly.
//
// Two sources means two things this report does NOT do:
//
//   1. It does not spread an unallocated payment across categories to make the
//      columns add up. Five receipts totalling ~₹9,300 record an amount with no
//      item breakdown; those appear under `unallocated`. Spreading them would
//      be inventing a figure that no one recorded.
//
//   2. It does not hide a category where paid exceeds expected. That can happen
//      legitimately — a payment against something never formally assigned — and
//      it is flagged rather than clamped, because it is worth somebody looking
//      at.

const StudentFee = require('../models/index').StudentFee;
const FeeAssignment = require('../models/FeeAssignment');
const FeeType = require('../models/FeeType');
const Student = require('../models/Student');

/** Normalise a label for matching: case and spacing vary between records. */
const key = (s) => String(s || '').trim().toLowerCase();

exports.getCategoryReport = async (req, res) => {
  const { classId, section, status } = req.query;
  const school = req.user.school;

  // ── The categories, from the fee types actually in use ────────────────────
  // Taken from the database rather than hardcoded: a school that adds "Exam
  // Fee" should see a column for it without anybody editing this file.
  const feeTypes = await FeeType.find({ school }).select('name category').lean();
  const typeByName = new Map(feeTypes.map((t) => [key(t.name), t]));

  // ── Which students ────────────────────────────────────────────────────────
  const studentFilter = { school };
  if (classId) studentFilter.class = classId;
  if (section) studentFilter.section = section;

  const students = await Student.find(studentFilter)
    .populate('user', 'name')
    .populate('class', 'name grade section')
    .sort({ rollNumber: 1 })
    .lean();

  const studentIds = students.map((s) => s._id);

  // ── Expected, per student per fee type ────────────────────────────────────
  const assignments = await FeeAssignment.find({
    school, student: { $in: studentIds },
  }).populate('feeType', 'name category').lean();

  const expectedBy = new Map();          // studentId -> { typeName -> amount }
  for (const a of assignments) {
    const sid = String(a.student);
    const name = a.feeType?.name || 'Unspecified';
    if (!expectedBy.has(sid)) expectedBy.set(sid, {});
    const row = expectedBy.get(sid);
    row[name] = (row[name] || 0) + (a.finalAmount || 0);
  }

  // ── Paid, per student per fee type, from the receipt breakdowns ───────────
  const ledgers = await StudentFee.find({
    school, student: { $in: studentIds },
  }).select('student paymentHistory').lean();

  const paidBy = new Map();              // studentId -> { typeName -> amount }
  const unallocatedBy = new Map();       // studentId -> amount with no breakdown

  for (const led of ledgers) {
    const sid = String(led.student);
    if (!paidBy.has(sid)) paidBy.set(sid, {});
    const row = paidBy.get(sid);

    for (const p of led.paymentHistory || []) {
      const amount = Number(p.amount) || 0;
      let itemised = 0;

      for (const item of p.items || []) {
        const paying = Number(item.payingNow) || 0;
        if (paying <= 0) continue;

        // Resolve the label to a real fee type. An unrecognised label is NOT
        // silently dropped — it becomes its own column, so a typo in a receipt
        // shows up rather than quietly reducing the totals.
        const match = typeByName.get(key(item.label));
        const name = match ? match.name : (item.label || 'Unspecified');
        row[name] = (row[name] || 0) + paying;
        itemised += paying;
      }

      // Whatever the breakdown did not cover.
      const gap = amount - itemised;
      if (gap > 0) unallocatedBy.set(sid, (unallocatedBy.get(sid) || 0) + gap);
    }
  }

  // ── Column set: every type assigned or paid against, in a stable order ────
  const columns = [];
  const seen = new Set();
  for (const t of feeTypes) {
    const used = assignments.some((a) => a.feeType?.name === t.name)
      || [...paidBy.values()].some((r) => r[t.name] > 0);
    if (used && !seen.has(t.name)) { columns.push(t.name); seen.add(t.name); }
  }
  // Labels that matched no fee type at all.
  for (const r of paidBy.values()) {
    for (const name of Object.keys(r)) {
      if (!seen.has(name)) { columns.push(name); seen.add(name); }
    }
  }

  // ── Build the rows ────────────────────────────────────────────────────────
  const rows = [];
  const totals = { expected: 0, paid: 0, pending: 0, unallocated: 0 };
  const byCategory = {};
  columns.forEach((c) => { byCategory[c] = { expected: 0, paid: 0, pending: 0 }; });

  for (const s of students) {
    const sid = String(s._id);
    const exp = expectedBy.get(sid) || {};
    const paid = paidBy.get(sid) || {};
    const unallocated = unallocatedBy.get(sid) || 0;

    const categories = {};
    let rowExpected = 0;
    let rowPaid = 0;
    const overpaid = [];

    for (const c of columns) {
      const e = exp[c] || 0;
      const p = paid[c] || 0;
      // Pending floors at zero: a negative "pending" is not a real figure. The
      // fact of overpayment is recorded separately rather than as a negative.
      const pending = Math.max(0, e - p);
      if (p > e) overpaid.push(c);

      categories[c] = { expected: e, paid: p, pending };
      rowExpected += e;
      rowPaid += p;

      byCategory[c].expected += e;
      byCategory[c].paid += p;
      byCategory[c].pending += pending;
    }

    rowPaid += unallocated;
    const rowPending = Math.max(0, rowExpected - rowPaid);

    let rowStatus;
    if (rowExpected === 0) rowStatus = 'NOT APPLICABLE';
    else if (rowPaid <= 0) rowStatus = 'PENDING';
    else if (rowPending <= 0) rowStatus = 'PAID';
    else rowStatus = 'PARTIAL';

    const row = {
      studentId: s._id,
      rollNumber: s.rollNumber || s.admissionNumber || '—',
      admissionNumber: s.admissionNumber || '',
      name: s.user?.name || s.parentName || 'Unnamed',
      className: [s.class?.name, s.class?.section].filter(Boolean).join(' '),
      categories,
      unallocated,
      overpaid,
      total: { expected: rowExpected, paid: rowPaid, pending: rowPending },
      status: rowStatus,
    };

    // Applied AFTER computing, so the status filter matches what the report shows
    // rather than a stored field that may not agree with it.
    if (status && rowStatus !== String(status).toUpperCase()) continue;

    rows.push(row);
    totals.expected += rowExpected;
    totals.paid += rowPaid;
    totals.pending += rowPending;
    totals.unallocated += unallocated;
  }

  res.json({
    success: true,
    data: {
      columns,
      rows,
      totals: {
        ...totals,
        students: rows.length,
        collectionRate: totals.expected > 0
          ? Math.round((totals.paid / totals.expected) * 1000) / 10
          : 0,
      },
      byCategory,
      // Stated in the response so the PDF can print it rather than the reader
      // having to wonder why the category columns may not sum to the total.
      notes: {
        paidSource: 'receipt breakdowns (paymentHistory.items)',
        expectedSource: 'fee assignments',
        unallocatedExplained:
          'Payments recorded without a category breakdown. Included in Overall Paid '
          + 'but not attributed to any category — deliberately not spread across them.',
      },
    },
  });
};
