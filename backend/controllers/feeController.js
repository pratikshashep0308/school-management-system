const mongoose = require('mongoose');
// const { StudentFee, FeeStructure, FeePayment } = require('../models/feeModels');
// NEW - importing from index.js
const { StudentFee, FeeStructure, FeePayment } = require('../models/index');

// ─────────────────────────────────────────────
// Helper: generate receipt number
// ─────────────────────────────────────────────
const genReceipt = () =>
  'RCP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();

// ─────────────────────────────────────────────
// GET /fees/class-summary
// Returns per-class breakdown: totals + student payment status counts
// ─────────────────────────────────────────────
exports.getClassSummary = async (req, res) => {
  const school = req.user.school;

  // Aggregate StudentFee grouped by class
  const summary = await StudentFee.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(school) } },
    {
      $group: {
        _id: '$class',
        totalStudents:    { $sum: 1 },
        totalExpected:    { $sum: '$totalFees' },
        totalCollected:   { $sum: '$paidAmount' },
        totalPending:     { $sum: '$pendingAmount' },
        paidCount:        { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] },    1, 0] } },
        partialCount:     { $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] } },
        notPaidCount:     { $sum: { $cond: [{ $eq: ['$paymentStatus', 'not_paid']},1, 0] } },
      }
    },
    {
  $lookup: {
    from: 'classes',
    localField: '_id',
    foreignField: '_id',
    as: 'classInfo'
  }
},
{
  $unwind: {
    path: '$classInfo',
    preserveNullAndEmptyArrays: true
  }
},
    {
      $project: {
        classId:        '$_id',
        className:      '$classInfo.name',
        grade:          '$classInfo.grade',
        section:        '$classInfo.section',
        totalStudents:  1,
        totalExpected:  1,
        totalCollected: 1,
        totalPending:   1,
        paidCount:      1,
        partialCount:   1,
        notPaidCount:   1,
        collectionRate: {
          $cond: [
            { $gt: ['$totalExpected', 0] },
            { $multiply: [{ $divide: ['$totalCollected', '$totalExpected'] }, 100] },
            0
          ]
        }
      }
    },
    { $sort: { grade: 1, section: 1 } }
  ]);

  // Overall school totals
  const totals = summary.reduce(
    (acc, c) => {
      acc.totalStudents  += c.totalStudents;
      acc.totalExpected  += c.totalExpected;
      acc.totalCollected += c.totalCollected;
      acc.totalPending   += c.totalPending;
      acc.paidCount      += c.paidCount;
      acc.partialCount   += c.partialCount;
      acc.notPaidCount   += c.notPaidCount;
      return acc;
    },
    { totalStudents: 0, totalExpected: 0, totalCollected: 0, totalPending: 0, paidCount: 0, partialCount: 0, notPaidCount: 0 }
  );

  res.json({ success: true, data: { classes: summary, totals } });
};

// ─────────────────────────────────────────────
// GET /fees/students
// All students with fee status — supports filters: classId, section, status
// ─────────────────────────────────────────────
exports.getStudentsFees = async (req, res) => {
  const school = req.user.school;
  const { classId, section, status, page = 1, limit = 50 } = req.query;

  const filter = { school };
  if (classId) filter.class = classId;
  if (section) filter.section = section;
  if (status)  filter.paymentStatus = status;

  const [records, total] = await Promise.all([
    StudentFee.find(filter)
      .populate({ path: 'student', populate: { path: 'user', select: 'name email profileImage' } })
      .populate('class', 'name grade section')
      .sort({ 'class': 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    StudentFee.countDocuments(filter)
  ]);

  res.json({ success: true, data: records, total, page: Number(page), pages: Math.ceil(total / limit) });
};

// ─────────────────────────────────────────────
// GET /fees/student/:studentId
// Full ledger for one student — fee summary + payment history
// ─────────────────────────────────────────────
exports.getStudentFee = async (req, res) => {
  const { studentId } = req.params;

  const record = await StudentFee.findOne({ student: studentId, school: req.user.school })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email profileImage' } })
    .populate('class', 'name grade section')
    .populate('paymentHistory.collectedBy', 'name')
    .populate('paymentHistory.feeStructure', 'name');

  if (!record) {
    return res.status(404).json({ success: false, message: 'Fee record not found for this student' });
  }

  res.json({ success: true, data: record });
};

// ─────────────────────────────────────────────
// POST /fees/pay
// Record a payment (full or partial). Creates StudentFee if first-time.
// Body: { studentId, classId, section, totalFees, amount, method, transactionId, month, year, remarks, feeStructureId }
// ─────────────────────────────────────────────
exports.recordPayment = async (req, res) => {
  const {
    studentId, classId, section, totalFees,
    amount, method, transactionId, month, year, remarks, feeStructureId
  } = req.body;

  if (!studentId || !amount || amount <= 0) {
    return res.status(400).json({ success: false, message: 'studentId and a positive amount are required' });
  }

  // Upsert the StudentFee ledger
  let record = await StudentFee.findOne({ student: studentId, school: req.user.school });

  if (!record) {
    if (!classId || !totalFees) {
      return res.status(400).json({ success: false, message: 'classId and totalFees required for first payment' });
    }
    record = new StudentFee({
      student: studentId,
      class:   classId,
      section: section || '',
      school:  req.user.school,
      totalFees
    });
  }

  // Update totalFees if provided (allows correction)
  if (totalFees) record.totalFees = totalFees;

  const receiptNumber = genReceipt();

  record.paymentHistory.push({
    amount:       Number(amount),
    paidOn:       new Date(),
    method:       method || 'cash',
    transactionId,
    receiptNumber,
    month,
    year,
    remarks,
    collectedBy:  req.user.id,
    feeStructure: feeStructureId || null
  });

  await record.save(); // pre-save hook recalculates paidAmount, pendingAmount, paymentStatus

  // Also write to legacy FeePayment collection for backward compat
  await FeePayment.create({
    student:      studentId,
    feeStructure: feeStructureId || null,
    amount:       Number(amount),
    method:       method || 'cash',
    transactionId,
    receiptNumber,
    status:       record.paymentStatus === 'paid' ? 'paid' : 'partial',
    month,
    year,
    remarks,
    collectedBy:  req.user.id,
    school:       req.user.school
  });

  // Return updated record with the new payment entry
  const updated = await StudentFee.findById(record._id)
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .populate('class', 'name grade section');

  res.status(201).json({ success: true, data: updated, receiptNumber });
};

// ─────────────────────────────────────────────
// GET /fees/receipt/:receiptNumber
// Return all data needed to render a printable receipt
// ─────────────────────────────────────────────
exports.getReceipt = async (req, res) => {
  const { receiptNumber } = req.params;

  // Find in StudentFee.paymentHistory
  const record = await StudentFee.findOne(
    { 'paymentHistory.receiptNumber': receiptNumber, school: req.user.school },
    { 'paymentHistory.$': 1, student: 1, class: 1, totalFees: 1, paidAmount: 1, pendingAmount: 1 }
  )
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .populate('class', 'name grade section')
    .populate('paymentHistory.collectedBy', 'name');

  if (!record || !record.paymentHistory.length) {
    return res.status(404).json({ success: false, message: 'Receipt not found' });
  }

  const payment = record.paymentHistory[0];

  res.json({
    success: true,
    data: {
      receiptNumber:  payment.receiptNumber,
      studentName:    record.student?.user?.name || 'N/A',
      admissionNo:    record.student?.admissionNumber || 'N/A',
      className:      record.class ? `${record.class.name} - ${record.class.section}` : 'N/A',
      amount:         payment.amount,
      method:         payment.method,
      transactionId:  payment.transactionId,
      paidOn:         payment.paidOn,
      month:          payment.month,
      collectedBy:    payment.collectedBy?.name || 'System',
      totalFees:      record.totalFees,
      paidAmount:     record.paidAmount,
      pendingAmount:  record.pendingAmount,
      remarks:        payment.remarks
    }
  });
};

// ─────────────────────────────────────────────
// GET /fees/summary  (overall school stats card)
// ─────────────────────────────────────────────
exports.getOverallSummary = async (req, res) => {
  const school = new mongoose.Types.ObjectId(req.user.school);

  const [stats] = await StudentFee.aggregate([
    { $match: { school } },
    {
      $group: {
        _id: null,
        totalStudents:    { $sum: 1 },
        totalExpected:    { $sum: '$totalFees' },
        totalCollected:   { $sum: '$paidAmount' },
        totalPending:     { $sum: '$pendingAmount' },
        paidCount:        { $sum: { $cond: [{ $eq: ['$paymentStatus', 'paid'] },    1, 0] } },
        partialCount:     { $sum: { $cond: [{ $eq: ['$paymentStatus', 'partial'] }, 1, 0] } },
        notPaidCount:     { $sum: { $cond: [{ $eq: ['$paymentStatus', 'not_paid']},1, 0] } }
      }
    }
  ]);

  res.json({ success: true, data: stats || {} });
};

// ─────────────────────────────────────────────
// POST /fees/setup-ledger
// One-time: create StudentFee records for all students in a class
// Body: { classId, totalFees }
// ─────────────────────────────────────────────
exports.setupClassLedger = async (req, res) => {
  const { classId, totalFees } = req.body;
  if (!classId || !totalFees) {
    return res.status(400).json({ success: false, message: 'classId and totalFees required' });
  }

  // Get the Student model (it's in a separate file)
  const Student = require('../models/Student');
  const students = await Student.find({ class: classId, school: req.user.school, isActive: true });

  const ops = students.map(s => ({
    updateOne: {
      filter: { student: s._id, school: req.user.school },
      update: {
        $setOnInsert: {
          student:  s._id,
          class:    classId,
          section:  s.section || '',
          school:   req.user.school,
          totalFees,
          paidAmount: 0,
          pendingAmount: totalFees,
          paymentStatus: 'not_paid'
        }
      },
      upsert: true
    }
  }));

  const result = await StudentFee.bulkWrite(ops);
  res.json({ success: true, message: `Ledger setup: ${result.upsertedCount} new records, ${result.matchedCount} already existed` });
};

// ─────────────────────────────────────────────
// GET /fees/structures   (pass-through for fee structure CRUD)
// ─────────────────────────────────────────────
exports.getStructures = async (req, res) => {
  const structures = await FeeStructure.find({ school: req.user.school })
    .populate('class', 'name grade section');
  res.json({ success: true, data: structures });
};

exports.createStructure = async (req, res) => {
  const structure = await FeeStructure.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: structure });
};

exports.updateStructure = async (req, res) => {
  const structure = await FeeStructure.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: structure });
};
