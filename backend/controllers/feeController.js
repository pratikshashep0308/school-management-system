// backend/controllers/feeController.js
// Complete advanced fee management — builds on existing StudentFee ledger
// Adds: FeeType CRUD, FeeAssignment, installments, discounts,
//       transport fee integration, PDF receipt, Excel export, overdue tracking

const mongoose  = require('mongoose');
const { StudentFee, FeeStructure, FeePayment, Notification } = require('../models/index');
const Student   = require('../models/Student');
const FeeType   = require('../models/FeeType');
const FeeAssignment = require('../models/FeeAssignment');
const {
  genReceiptNumber, fmt, calcFinalAmount, buildInstallments,
  buildReceiptPDF, buildFeeExcel, checkOverdueAssignments,
} = require('../services/feeService');

// ─── Existing endpoints (kept 100% backward compatible) ──────────────────────

const genReceipt = genReceiptNumber; // alias

exports.getClassSummary = async (req, res) => {
  const school = req.user.school;
  const summary = await StudentFee.aggregate([
    { $match: { school: new mongoose.Types.ObjectId(school) } },
    { $group: {
      _id: '$class',
      totalStudents:  { $sum: 1 },
      totalExpected:  { $sum: '$totalFees' },
      totalCollected: { $sum: '$paidAmount' },
      totalPending:   { $sum: '$pendingAmount' },
      paidCount:    { $sum: { $cond: [{ $eq: ['$paymentStatus','paid']    }, 1, 0] } },
      partialCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','partial'] }, 1, 0] } },
      notPaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','not_paid']}, 1, 0] } },
    }},
    { $lookup: { from: 'classes', localField: '_id', foreignField: '_id', as: 'classInfo' } },
    { $unwind: { path: '$classInfo', preserveNullAndEmptyArrays: true } },
    { $project: {
      classId: '$_id', className: '$classInfo.name', grade: '$classInfo.grade',
      section: '$classInfo.section', totalStudents: 1, totalExpected: 1,
      totalCollected: 1, totalPending: 1, paidCount: 1, partialCount: 1, notPaidCount: 1,
      collectionRate: { $cond: [{ $gt: ['$totalExpected', 0] },
        { $multiply: [{ $divide: ['$totalCollected', '$totalExpected'] }, 100] }, 0] }
    }},
    { $sort: { grade: 1, section: 1 } }
  ]);

  const totals = summary.reduce((acc, c) => {
    acc.totalStudents  += c.totalStudents;
    acc.totalExpected  += c.totalExpected;
    acc.totalCollected += c.totalCollected;
    acc.totalPending   += c.totalPending;
    acc.paidCount      += c.paidCount;
    acc.partialCount   += c.partialCount;
    acc.notPaidCount   += c.notPaidCount;
    return acc;
  }, { totalStudents:0, totalExpected:0, totalCollected:0, totalPending:0, paidCount:0, partialCount:0, notPaidCount:0 });

  res.json({ success: true, data: { classes: summary, totals } });
};

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
      .sort({ class: 1 })
      .skip((page - 1) * limit)
      .limit(Number(limit)),
    StudentFee.countDocuments(filter)
  ]);
  res.json({ success: true, data: records, total, page: Number(page), pages: Math.ceil(total / limit) });
};

exports.getStudentFee = async (req, res) => {
  const { studentId } = req.params;
  const record = await StudentFee.findOne({ student: studentId, school: req.user.school })
    .populate({ path: 'student', populate: { path: 'user', select: 'name email profileImage' } })
    .populate('class', 'name grade section')
    .populate('paymentHistory.collectedBy', 'name')
    .populate('paymentHistory.feeStructure', 'name');
  if (!record) return res.status(404).json({ success: false, message: 'Fee record not found' });

  // Also fetch FeeAssignments for this student
  const assignments = await FeeAssignment.find({ student: studentId, school: req.user.school })
    .populate('feeType', 'name category')
    .populate('transportRoute', 'routeName routeNumber')
    .sort({ createdAt: -1 });

  res.json({ success: true, data: record, assignments });
};

exports.recordPayment = async (req, res) => {
  const { studentId, classId, section, totalFees, amount, method, transactionId, month, year, remarks, feeStructureId, assignmentId } = req.body;
  if (!studentId || !amount || amount <= 0)
    return res.status(400).json({ success: false, message: 'studentId and a positive amount are required' });

  let record = await StudentFee.findOne({ student: studentId, school: req.user.school });
  if (!record) {
    if (!classId || !totalFees)
      return res.status(400).json({ success: false, message: 'classId and totalFees required for first payment' });
    record = new StudentFee({ student: studentId, class: classId, section: section || '', school: req.user.school, totalFees });
  }
  if (totalFees) record.totalFees = totalFees;

  const receiptNumber = genReceipt();
  record.paymentHistory.push({ amount: Number(amount), paidOn: new Date(), method: method || 'cash', transactionId, receiptNumber, month, year, remarks, collectedBy: req.user._id, feeStructure: feeStructureId || null });
  await record.save();

  // If tied to a FeeAssignment, update that too
  if (assignmentId) {
    const assignment = await FeeAssignment.findOne({ _id: assignmentId, school: req.user.school });
    if (assignment) {
      assignment.payments.push({ amount: Number(amount), paidOn: new Date(), method: method || 'cash', transactionId, receiptNumber, remarks, collectedBy: req.user._id });
      await assignment.save();
    }
  }

  await FeePayment.create({ student: studentId, feeStructure: feeStructureId || null, amount: Number(amount), method: method || 'cash', transactionId, receiptNumber, status: record.paymentStatus === 'paid' ? 'paid' : 'partial', month, year, remarks, collectedBy: req.user._id, school: req.user.school });

  const updated = await StudentFee.findById(record._id)
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .populate('class', 'name grade section');

  res.status(201).json({ success: true, data: updated, receiptNumber });
};

exports.getReceipt = async (req, res) => {
  const { receiptNumber } = req.params;
  const { format } = req.query;  // ?format=pdf

  const record = await StudentFee.findOne(
    { 'paymentHistory.receiptNumber': receiptNumber, school: req.user.school },
    { 'paymentHistory.$': 1, student: 1, class: 1, totalFees: 1, paidAmount: 1, pendingAmount: 1 }
  ).populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
   .populate('class', 'name grade section')
   .populate('paymentHistory.collectedBy', 'name');

  if (!record?.paymentHistory?.length)
    return res.status(404).json({ success: false, message: 'Receipt not found' });

  const payment = record.paymentHistory[0];
  const data = {
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
    remarks:        payment.remarks,
  };

  if (format === 'pdf') return buildReceiptPDF(res, data);
  res.json({ success: true, data });
};

exports.getOverallSummary = async (req, res) => {
  const school = new mongoose.Types.ObjectId(req.user.school);
  const [stats] = await StudentFee.aggregate([
    { $match: { school } },
    { $group: {
      _id: null,
      totalStudents:  { $sum: 1 },
      totalExpected:  { $sum: '$totalFees' },
      totalCollected: { $sum: '$paidAmount' },
      totalPending:   { $sum: '$pendingAmount' },
      paidCount:    { $sum: { $cond: [{ $eq: ['$paymentStatus','paid']    }, 1, 0] } },
      partialCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','partial'] }, 1, 0] } },
      notPaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','not_paid']}, 1, 0] } },
    }}
  ]);
  res.json({ success: true, data: stats || {} });
};

exports.setupClassLedger = async (req, res) => {
  const { classId, totalFees } = req.body;
  if (!classId || !totalFees)
    return res.status(400).json({ success: false, message: 'classId and totalFees required' });

  const students = await Student.find({ class: classId, school: req.user.school, isActive: true });
  const ops = students.map(s => ({
    updateOne: {
      filter: { student: s._id, school: req.user.school },
      update: { $setOnInsert: { student: s._id, class: classId, section: s.section || '', school: req.user.school, totalFees, paidAmount: 0, pendingAmount: totalFees, paymentStatus: 'not_paid' } },
      upsert: true,
    }
  }));

  const result = await StudentFee.bulkWrite(ops);
  res.json({ success: true, message: `Ledger setup: ${result.upsertedCount} new, ${result.matchedCount} existing` });
};

exports.getStructures = async (req, res) => {
  const structures = await FeeStructure.find({ school: req.user.school }).populate('class', 'name grade section');
  res.json({ success: true, data: structures });
};
exports.createStructure = async (req, res) => {
  const s = await FeeStructure.create({ ...req.body, school: req.user.school });
  res.status(201).json({ success: true, data: s });
};
exports.updateStructure = async (req, res) => {
  const s = await FeeStructure.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: s });
};

// ─── NEW: Fee Types ───────────────────────────────────────────────────────────

exports.getFeeTypes = async (req, res) => {
  const types = await FeeType.find({ school: req.user.school, isActive: true }).sort({ name: 1 });
  res.json({ success: true, data: types });
};

exports.createFeeType = async (req, res) => {
  const type = await FeeType.create({ ...req.body, school: req.user.school, createdBy: req.user._id });
  res.status(201).json({ success: true, data: type });
};

exports.updateFeeType = async (req, res) => {
  const type = await FeeType.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, req.body, { new: true });
  if (!type) return res.status(404).json({ success: false, message: 'Fee type not found' });
  res.json({ success: true, data: type });
};

exports.deleteFeeType = async (req, res) => {
  await FeeType.findOneAndUpdate({ _id: req.params.id, school: req.user.school }, { isActive: false });
  res.json({ success: true, message: 'Fee type deactivated' });
};

// ─── NEW: Fee Assignments ──────────────────────────────────────────────────────

exports.getAssignments = async (req, res) => {
  const { studentId, classId, feeTypeId, status } = req.query;
  const filter = { school: req.user.school };
  if (studentId) filter.student = studentId;
  if (classId)   filter.class   = classId;
  if (feeTypeId) filter.feeType = feeTypeId;
  if (status)    filter.status  = status;

  const assignments = await FeeAssignment.find(filter)
    .populate('feeType', 'name category')
    .populate({ path: 'student', populate: { path: 'user', select: 'name email' } })
    .populate('class', 'name grade section')
    .populate('transportRoute', 'routeName routeNumber')
    .sort({ createdAt: -1 });

  res.json({ success: true, count: assignments.length, data: assignments });
};

exports.createAssignment = async (req, res) => {
  const {
    studentId, classId, section, feeTypeId, baseAmount,
    discountPct, discountAmt, discountReason, dueDate,
    month, year, lateFeePerDay, transportRouteId,
    hasInstallments, installmentCount, firstDueDate, label,
  } = req.body;

  if (!feeTypeId || !baseAmount)
    return res.status(400).json({ success: false, message: 'feeTypeId and baseAmount required' });
  if (!studentId && !classId)
    return res.status(400).json({ success: false, message: 'Either studentId or classId required' });

  const finalAmount = calcFinalAmount(baseAmount, discountPct || 0, discountAmt || 0);

  const baseDoc = {
    feeType:       feeTypeId,
    baseAmount,
    discountPct:   discountPct   || 0,
    discountAmt:   discountAmt   || 0,
    discountReason: discountReason || '',
    finalAmount,
    lateFeePerDay: lateFeePerDay || 0,
    transportRoute: transportRouteId || null,
    dueDate:       dueDate ? new Date(dueDate) : null,
    month, year,
    school:        req.user.school,
    createdBy:     req.user._id,
    hasInstallments: !!hasInstallments,
    installments:  hasInstallments ? buildInstallments(finalAmount, parseInt(installmentCount) || 2, firstDueDate || dueDate) : [],
    pendingAmount: finalAmount,
  };

  // ── Assign to individual student ──────────────────────────────────────────
  if (studentId) {
    const assignment = await FeeAssignment.create({ ...baseDoc, student: studentId, class: classId || null, section });

    // Also update StudentFee ledger total
    await StudentFee.findOneAndUpdate(
      { student: studentId, school: req.user.school },
      { $inc: { totalFees: finalAmount, pendingAmount: finalAmount } },
      { upsert: false }
    );

    return res.status(201).json({ success: true, count: 1, data: assignment });
  }

  // ── Bulk assign to entire class ───────────────────────────────────────────
  const students = await Student.find({ class: classId, school: req.user.school, isActive: true });
  if (!students.length)
    return res.status(404).json({ success: false, message: 'No active students found in this class' });

  const docs = students.map(s => ({ ...baseDoc, student: s._id, class: classId, section: s.section || section || '' }));
  await FeeAssignment.insertMany(docs);

  // Update each student's ledger
  const ledgerOps = students.map(s => ({
    updateOne: {
      filter: { student: s._id, school: req.user.school },
      update: { $inc: { totalFees: finalAmount, pendingAmount: finalAmount } },
    }
  }));
  await StudentFee.bulkWrite(ledgerOps);

  res.status(201).json({ success: true, count: students.length, message: `Fee assigned to ${students.length} students` });
};

exports.updateAssignment = async (req, res) => {
  const assignment = await FeeAssignment.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { ...req.body, updatedAt: new Date() },
    { new: true }
  ).populate('feeType', 'name');
  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, data: assignment });
};

exports.deleteAssignment = async (req, res) => {
  const a = await FeeAssignment.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  if (!a) return res.status(404).json({ success: false, message: 'Assignment not found' });
  res.json({ success: true, message: 'Assignment deleted' });
};

// ─── NEW: Pay against a specific assignment ───────────────────────────────────

exports.payAssignment = async (req, res) => {
  const { amount, method, transactionId, remarks, installmentNumber } = req.body;
  if (!amount || amount <= 0)
    return res.status(400).json({ success: false, message: 'Valid amount required' });

  const assignment = await FeeAssignment.findOne({ _id: req.params.id, school: req.user.school })
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .populate('feeType', 'name');

  if (!assignment) return res.status(404).json({ success: false, message: 'Assignment not found' });
  if (assignment.status === 'paid')
    return res.status(400).json({ success: false, message: 'This fee is already fully paid' });

  const receiptNumber = genReceipt();

  // Add payment to assignment
  assignment.payments.push({ amount: Number(amount), paidOn: new Date(), method: method || 'cash', transactionId, receiptNumber, remarks, collectedBy: req.user._id, installmentNumber });

  // Update installment if specified
  if (installmentNumber && assignment.hasInstallments) {
    const inst = assignment.installments.find(i => i.number === installmentNumber);
    if (inst) {
      inst.paidAmount += Number(amount);
      inst.paidOn     = new Date();
      inst.status     = inst.paidAmount >= inst.amount ? 'paid' : 'partial';
      inst.receiptNumber = receiptNumber;
    }
  }

  await assignment.save();

  // Sync to StudentFee ledger
  if (assignment.student) {
    const ledger = await StudentFee.findOne({ student: assignment.student._id || assignment.student, school: req.user.school });
    if (ledger) {
      ledger.paymentHistory.push({ amount: Number(amount), paidOn: new Date(), method: method || 'cash', transactionId, receiptNumber, remarks, collectedBy: req.user._id });
      await ledger.save();
    }
  }

  res.status(201).json({ success: true, data: assignment, receiptNumber });
};

// ─── NEW: Dashboard with today's collection ────────────────────────────────────

exports.getDashboard = async (req, res) => {
  const school = new mongoose.Types.ObjectId(req.user.school);
  const today  = new Date();
  const todayStart = new Date(today); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(today); todayEnd.setHours(23,59,59,999);

  const [summary, todayPayments, overdueCount, feeTypes] = await Promise.all([
    // School-wide totals
    StudentFee.aggregate([
      { $match: { school } },
      { $group: { _id: null,
        totalStudents:  { $sum: 1 },
        totalExpected:  { $sum: '$totalFees' },
        totalCollected: { $sum: '$paidAmount' },
        totalPending:   { $sum: '$pendingAmount' },
        paidCount:    { $sum: { $cond: [{ $eq: ['$paymentStatus','paid']    }, 1, 0] } },
        partialCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','partial'] }, 1, 0] } },
        notPaidCount: { $sum: { $cond: [{ $eq: ['$paymentStatus','not_paid']}, 1, 0] } },
      }}
    ]),
    // Today's payments from FeePayment
    FeePayment.find({ school, createdAt: { $gte: todayStart, $lte: todayEnd } }),
    // Overdue assignments
    FeeAssignment.countDocuments({ school, status: 'overdue' }),
    // Active fee types count
    FeeType.countDocuments({ school, isActive: true }),
  ]);

  const todayCollection  = todayPayments.reduce((s, p) => s + p.amount, 0);
  const todayCount       = todayPayments.length;

  res.json({
    success: true,
    data: {
      ...(summary[0] || {}),
      todayCollection,
      todayCount,
      overdueCount,
      feeTypeCount: feeTypes,
    },
  });
};

// ─── NEW: Export fees report ──────────────────────────────────────────────────

exports.exportFees = async (req, res) => {
  const { classId, status, format = 'xlsx' } = req.query;
  const filter = { school: req.user.school };
  if (classId) filter.class = classId;
  if (status)  filter.paymentStatus = status;

  const records = await StudentFee.find(filter)
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .populate('class', 'name grade section')
    .lean();

  const data = records.map(r => ({
    studentName:    r.student?.user?.name || '',
    admissionNo:    r.student?.admissionNumber || '',
    className:      r.class ? `${r.class.name} ${r.class.section}` : '',
    feeType:        'General',
    totalFees:      r.totalFees,
    paidAmount:     r.paidAmount,
    pendingAmount:  r.pendingAmount,
    status:         r.paymentStatus,
    lastPayment:    r.paymentHistory?.slice(-1)[0]?.paidOn,
  }));

  const cls = classId
    ? await require('../models/index').Class?.findById(classId).lean().catch(() => null)
    : null;

  const meta = {
    title: cls ? `${cls.name} ${cls.section}` : 'All Classes',
    period: new Date().toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }),
    totalStudents:  data.length,
    totalExpected:  data.reduce((s, r) => s + r.totalFees, 0),
    totalCollected: data.reduce((s, r) => s + r.paidAmount, 0),
    totalPending:   data.reduce((s, r) => s + r.pendingAmount, 0),
  };

  if (format === 'xlsx') {
    const buffer = await buildFeeExcel(data, meta);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="fees-report-${Date.now()}.xlsx"`);
    return res.send(buffer);
  }

  if (format === 'pdf') {
    return buildReceiptPDF(res, { ...meta, receiptNumber: 'REPORT-' + Date.now(), studentName: meta.title, amount: meta.totalCollected, totalFees: meta.totalExpected, pendingAmount: meta.totalPending, paidAmount: meta.totalCollected, collectedBy: req.user.name });
  }

  res.status(400).json({ success: false, message: 'format must be xlsx or pdf' });
};

// ─── NEW: Receipt PDF download ────────────────────────────────────────────────

exports.downloadReceipt = async (req, res) => {
  const { receiptNumber } = req.params;
  const record = await StudentFee.findOne(
    { 'paymentHistory.receiptNumber': receiptNumber, school: req.user.school },
    { 'paymentHistory.$': 1, student: 1, class: 1, totalFees: 1, paidAmount: 1, pendingAmount: 1 }
  ).populate({ path: 'student', populate: { path: 'user', select: 'name' } })
   .populate('class', 'name grade section')
   .populate('paymentHistory.collectedBy', 'name');

  if (!record?.paymentHistory?.length)
    return res.status(404).json({ success: false, message: 'Receipt not found' });

  const payment = record.paymentHistory[0];
  buildReceiptPDF(res, {
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
    remarks:        payment.remarks,
  });
};