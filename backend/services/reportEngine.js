// backend/services/reportEngine.js
// Builds real MongoDB aggregation pipelines from a report config.
// Each module section joins real collections and exposes human-readable fields.

const mongoose = require('mongoose');
const Student  = require('../models/Student');
const Teacher  = require('../models/Teacher');
const User     = require('../models/User');

// Lazy-load index models to avoid circular dependency issues at boot
function getModels() {
  return require('../models/index');
}

// ─── Utility ──────────────────────────────────────────────────────────────────
function toId(id) {
  if (!id) return null;
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

// Build $match from filters object — handles both generic and module-specific keys
function buildMatch(filters = {}, schoolId) {
  const match = { school: toId(schoolId) };

  // Date range — applied to whichever dateField is specified (default: createdAt)
  const df = filters._dateField || 'createdAt';
  if (filters.dateFrom || filters.dateTo) {
    match[df] = {};
    if (filters.dateFrom) match[df].$gte = new Date(filters.dateFrom);
    if (filters.dateTo)   match[df].$lte = new Date(filters.dateTo);
  }

  // Scalar filters — only copy known safe keys, ignore internal helpers
  const skip = new Set(['dateFrom','dateTo','_dateField']);
  for (const [k, v] of Object.entries(filters)) {
    if (skip.has(k) || !v) continue;
    // ObjectId fields
    if (['class','classId'].includes(k)) { match.class = toId(v); continue; }
    if (k === 'studentId')               { match.student = toId(v); continue; }
    if (k === 'examId')                  { match.exam    = toId(v); continue; }
    match[k] = v;
  }

  return { $match: match };
}

// Build $project from field list
function buildProject(fields) {
  if (!fields || !fields.length) return null;
  const p = { _id: 1 };
  fields.forEach(f => { p[f] = 1; });
  return { $project: p };
}

// ─── MODULE PIPELINES ─────────────────────────────────────────────────────────

// Students — joins users + classes
function studentPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const pipeline = [
    buildMatch({ ...filters, _dateField: 'admissionDate' }, schoolId),
    { $lookup: { from: 'users',   localField: 'user',  foreignField: '_id', as: '_user' } },
    { $unwind: { path: '$_user',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'classes', localField: 'class', foreignField: '_id', as: '_class' } },
    { $unwind: { path: '$_class', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        name:            '$_user.name',
        email:           '$_user.email',
        phone:           '$_user.phone',
        className:       '$_class.name',
        grade:           '$_class.grade',
        section:         '$_class.section',
        admissionDateFmt: { $dateToString: { format: '%d/%m/%Y', date: '$admissionDate' } },
        dobFmt:           { $dateToString: { format: '%d/%m/%Y', date: '$dateOfBirth' } },
      },
    },
  ];

  if (groupBy && groupBy !== 'none') {
    const gMap = {
      class:    '$className',
      gender:   '$gender',
      status:   '$status',
      category: '$category',
      grade:    '$grade',
    };
    pipeline.push({
      $group: {
        _id:   gMap[groupBy] || `$${groupBy}`,
        count: { $sum: 1 },
        students: { $push: '$name' },
      },
    });
    pipeline.push({ $sort: { _id: 1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'admissionDate']: sortBy?.order || -1 } });
  }

  return { model: Student, pipeline };
}

// Teachers — joins users + subjects + classes
function teacherPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const pipeline = [
    buildMatch({ ...filters, _dateField: 'joiningDate' }, schoolId),
    { $lookup: { from: 'users', localField: 'user', foreignField: '_id', as: '_user' } },
    { $unwind: { path: '$_user', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'subjects', localField: 'subjects', foreignField: '_id', as: '_subjects' } },
    { $lookup: { from: 'classes',  localField: 'classes',  foreignField: '_id', as: '_classes' } },
    {
      $addFields: {
        name:           '$_user.name',
        email:          '$_user.email',
        phone:          '$_user.phone',
        subjectNames:   '$_subjects.name',
        classNames:     '$_classes.name',
        joiningDateFmt: { $dateToString: { format: '%d/%m/%Y', date: '$joiningDate' } },
      },
    },
  ];

  if (groupBy && groupBy !== 'none') {
    pipeline.push({
      $group: {
        _id:   `$${groupBy}`,
        count: { $sum: 1 },
        avgExperience: { $avg: '$experience' },
      },
    });
    pipeline.push({ $sort: { _id: 1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'createdAt']: sortBy?.order || -1 } });
  }

  return { model: Teacher, pipeline };
}

// Classes
function classPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const { Class } = getModels();
  const pipeline = [
    buildMatch(filters, schoolId),
    { $lookup: { from: 'teachers', localField: 'classTeacher', foreignField: '_id', as: '_ct' } },
    { $unwind: { path: '$_ct', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users', localField: '_ct.user', foreignField: '_id', as: '_ctu' } },
    { $unwind: { path: '$_ctu', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        classTeacherName: '$_ctu.name',
        studentCount:     { $size: { $ifNull: ['$students', []] } },
        subjectCount:     { $size: { $ifNull: ['$subjects', []] } },
      },
    },
    { $sort: { grade: 1, section: 1 } },
  ];
  const proj = buildProject(fields);
  if (proj) pipeline.push(proj);
  return { model: Class, pipeline };
}

// Fees — joins students + users + classes
function feesPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const { FeePayment } = getModels();
  const pipeline = [
    buildMatch({ ...filters, _dateField: 'paidOn' }, schoolId),
    { $lookup: { from: 'students', localField: 'student',       foreignField: '_id', as: '_student' } },
    { $unwind: { path: '$_student', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users',    localField: '_student.user', foreignField: '_id', as: '_suser' } },
    { $unwind: { path: '$_suser',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'classes',  localField: '_student.class',foreignField: '_id', as: '_class' } },
    { $unwind: { path: '$_class',  preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        studentName:     '$_suser.name',
        admissionNumber: '$_student.admissionNumber',
        className:       '$_class.name',
        grade:           '$_class.grade',
        paidOnFmt:       { $dateToString: { format: '%d/%m/%Y', date: '$paidOn' } },
      },
    },
  ];

  if (groupBy && groupBy !== 'none') {
    const gMap = {
      class:         '$className',
      status:        '$status',
      method:        '$method',
      month:         '$month',
      paymentStatus: '$status',
    };
    pipeline.push({
      $group: {
        _id:         gMap[groupBy] || `$${groupBy}`,
        count:       { $sum: 1 },
        totalAmount: { $sum: '$amount' },
        avgAmount:   { $avg: '$amount' },
      },
    });
    pipeline.push({ $sort: { totalAmount: -1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'paidOn']: sortBy?.order || -1 } });
  }

  return { model: FeePayment, pipeline };
}

// Attendance — joins students + users + classes
function attendancePipeline(filters, fields, groupBy, sortBy, schoolId) {
  const { Attendance } = getModels();
  const pipeline = [
    buildMatch({ ...filters, _dateField: 'date' }, schoolId),
    { $lookup: { from: 'students', localField: 'student',       foreignField: '_id', as: '_student' } },
    { $unwind: { path: '$_student', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users',    localField: '_student.user', foreignField: '_id', as: '_suser' } },
    { $unwind: { path: '$_suser',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'classes',  localField: 'class',         foreignField: '_id', as: '_class' } },
    { $unwind: { path: '$_class',  preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        studentName:     '$_suser.name',
        admissionNumber: '$_student.admissionNumber',
        className:       '$_class.name',
        grade:           '$_class.grade',
        dateFmt:         { $dateToString: { format: '%d/%m/%Y', date: '$date' } },
      },
    },
  ];

  if (groupBy === 'student') {
    pipeline.push({
      $group: {
        _id:         '$student',
        studentName: { $first: '$studentName' },
        className:   { $first: '$className' },
        admissionNumber: { $first: '$admissionNumber' },
        total:       { $sum: 1 },
        present:     { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
        absent:      { $sum: { $cond: [{ $eq: ['$status','absent'] },  1, 0] } },
        late:        { $sum: { $cond: [{ $eq: ['$status','late'] },    1, 0] } },
        excused:     { $sum: { $cond: [{ $eq: ['$status','excused'] }, 1, 0] } },
      },
    });
    pipeline.push({
      $addFields: {
        percentage: {
          $round: [
            { $multiply: [{ $divide: ['$present', { $max: ['$total', 1] }] }, 100] },
            1,
          ],
        },
      },
    });
    pipeline.push({ $sort: { percentage: 1 } }); // lowest attendance first
  } else if (groupBy === 'class') {
    pipeline.push({
      $group: {
        _id:       '$_class._id',
        className: { $first: '$className' },
        total:     { $sum: 1 },
        present:   { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
        absent:    { $sum: { $cond: [{ $eq: ['$status','absent'] },  1, 0] } },
      },
    });
    pipeline.push({
      $addFields: {
        percentage: {
          $round: [
            { $multiply: [{ $divide: ['$present', { $max: ['$total', 1] }] }, 100] },
            1,
          ],
        },
      },
    });
    pipeline.push({ $sort: { className: 1 } });
  } else if (groupBy === 'date') {
    pipeline.push({
      $group: {
        _id:     '$dateFmt',
        total:   { $sum: 1 },
        present: { $sum: { $cond: [{ $eq: ['$status','present'] }, 1, 0] } },
        absent:  { $sum: { $cond: [{ $eq: ['$status','absent'] },  1, 0] } },
      },
    });
    pipeline.push({ $sort: { _id: -1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'date']: sortBy?.order || -1 } });
  }

  return { model: Attendance, pipeline };
}

// Exams / Results
function examsPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const { Result } = getModels();
  const pipeline = [
    buildMatch(filters, schoolId),
    { $lookup: { from: 'students', localField: 'student',       foreignField: '_id', as: '_student' } },
    { $unwind: { path: '$_student', preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users',    localField: '_student.user', foreignField: '_id', as: '_suser' } },
    { $unwind: { path: '$_suser',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'exams',    localField: 'exam',          foreignField: '_id', as: '_exam' } },
    { $unwind: { path: '$_exam',   preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'classes',  localField: '_exam.class',   foreignField: '_id', as: '_class' } },
    { $unwind: { path: '$_class',  preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'subjects', localField: '_exam.subject', foreignField: '_id', as: '_subject' } },
    { $unwind: { path: '$_subject', preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        studentName:  '$_suser.name',
        examName:     '$_exam.name',
        examType:     '$_exam.examType',
        totalMarks:   '$_exam.totalMarks',
        passingMarks: '$_exam.passingMarks',
        className:    '$_class.name',
        subjectName:  '$_subject.name',
        passed:       { $gte: ['$marksObtained', '$_exam.passingMarks'] },
      },
    },
  ];

  if (groupBy === 'examType') {
    pipeline.push({
      $group: {
        _id:        '$examType',
        count:      { $sum: 1 },
        avgMarks:   { $avg: '$marksObtained' },
        avgPercent: { $avg: '$percentage' },
        passed:     { $sum: { $cond: ['$passed', 1, 0] } },
        failed:     { $sum: { $cond: ['$passed', 0, 1] } },
      },
    });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'percentage']: sortBy?.order || -1 } });
  }

  return { model: Result, pipeline };
}

// Transport — students with transport route assigned
function transportPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const pipeline = [
    { $match: { school: toId(schoolId), transportRoute: { $exists: true, $ne: null } } },
    { $lookup: { from: 'users',      localField: 'user',           foreignField: '_id', as: '_user' } },
    { $unwind: { path: '$_user',     preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'transports', localField: 'transportRoute', foreignField: '_id', as: '_route' } },
    { $unwind: { path: '$_route',    preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'classes',    localField: 'class',          foreignField: '_id', as: '_class' } },
    { $unwind: { path: '$_class',    preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        studentName:  '$_user.name',
        routeName:    '$_route.routeName',
        vehicleNumber:'$_route.vehicleNumber',
        className:    '$_class.name',
        grade:        '$_class.grade',
        parentPhone:  '$parentPhone',
      },
    },
  ];

  if (groupBy === 'route') {
    pipeline.push({
      $group: {
        _id:       '$_route._id',
        routeName: { $first: '$routeName' },
        vehicle:   { $first: '$vehicleNumber' },
        count:     { $sum: 1 },
        students:  { $push: '$studentName' },
      },
    });
    pipeline.push({ $sort: { routeName: 1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'studentName']: sortBy?.order || 1 } });
  }

  return { model: Student, pipeline };
}

// Library — book issues
function libraryPipeline(filters, fields, groupBy, sortBy, schoolId) {
  const { BookIssue } = getModels();
  const pipeline = [
    buildMatch({ ...filters, _dateField: 'issuedDate' }, schoolId),
    { $lookup: { from: 'books',    localField: 'book',          foreignField: '_id', as: '_book' } },
    { $unwind: { path: '$_book',   preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'students', localField: 'student',       foreignField: '_id', as: '_student' } },
    { $unwind: { path: '$_student',preserveNullAndEmptyArrays: true } },
    { $lookup: { from: 'users',    localField: '_student.user', foreignField: '_id', as: '_suser' } },
    { $unwind: { path: '$_suser',  preserveNullAndEmptyArrays: true } },
    {
      $addFields: {
        bookTitle:      '$_book.title',
        bookAuthor:     '$_book.author',
        bookCategory:   '$_book.category',
        studentName:    '$_suser.name',
        admissionNumber:'$_student.admissionNumber',
        issuedFmt:      { $dateToString: { format: '%d/%m/%Y', date: '$issuedDate' } },
        dueFmt:         { $dateToString: { format: '%d/%m/%Y', date: '$dueDate' } },
        returnedFmt:    { $dateToString: { format: '%d/%m/%Y', date: '$returnedDate' } },
        overdueDays: {
          $cond: [
            { $and: [{ $eq: ['$status','overdue'] }, '$dueDate'] },
            { $ceil: { $divide: [{ $subtract: [new Date(), '$dueDate'] }, 86400000] } },
            0,
          ],
        },
      },
    },
  ];

  if (groupBy === 'status') {
    pipeline.push({
      $group: {
        _id:         '$status',
        count:       { $sum: 1 },
        totalLateFee:{ $sum: '$lateFee' },
      },
    });
  } else if (groupBy === 'book') {
    pipeline.push({
      $group: {
        _id:      '$book',
        bookTitle:{ $first: '$bookTitle' },
        count:    { $sum: 1 },
      },
    });
    pipeline.push({ $sort: { count: -1 } });
  } else {
    const proj = buildProject(fields);
    if (proj) pipeline.push(proj);
    pipeline.push({ $sort: { [sortBy?.field || 'issuedDate']: sortBy?.order || -1 } });
  }

  return { model: BookIssue, pipeline };
}

// ─── Main export ──────────────────────────────────────────────────────────────
exports.buildPipeline = function(config) {
  const { module, fields, filters = {}, groupBy, sortBy, schoolId } = config;
  switch (module) {
    case 'students':   return studentPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'teachers':   return teacherPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'classes':    return classPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'fees':       return feesPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'attendance': return attendancePipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'exams':      return examsPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'transport':  return transportPipeline(filters, fields, groupBy, sortBy, schoolId);
    case 'library':    return libraryPipeline(filters, fields, groupBy, sortBy, schoolId);
    default:           throw new Error(`Unknown module: ${module}`);
  }
};

// ─── Dashboard summary ────────────────────────────────────────────────────────
exports.getDashboardSummary = async (schoolId) => {
  const { Attendance, FeePayment, StudentFee, BookIssue } = getModels();
  const sid   = toId(schoolId);
  const today = new Date();
  const dayStart = new Date(today); dayStart.setHours(0, 0, 0, 0);
  const dayEnd   = new Date(today); dayEnd.setHours(23, 59, 59, 999);
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);

  const [totalStudents, activeStudents, feeAgg, attToday, attMonth, libraryActive, monthFees] = await Promise.all([
    Student.countDocuments({ school: sid }),
    Student.countDocuments({ school: sid, isActive: true, status: 'active' }),

    StudentFee.aggregate([
      { $match: { school: sid } },
      { $group: { _id: null, total: { $sum: '$totalFees' }, paid: { $sum: '$paidAmount' }, pending: { $sum: '$pendingAmount' } } },
    ]).catch(() => []),

    // Today's attendance
    (async () => {
      const recs = await Attendance.find({ school: sid, date: { $gte: dayStart, $lte: dayEnd } }).select('status').lean();
      const present = recs.filter(r => r.status === 'present').length;
      return { total: recs.length, present, percentage: recs.length ? Math.round((present / recs.length) * 100) : 0 };
    })(),

    // This month's attendance
    (async () => {
      const recs = await Attendance.find({ school: sid, date: { $gte: monthStart } }).select('status').lean();
      const present = recs.filter(r => r.status === 'present').length;
      return { total: recs.length, present, percentage: recs.length ? Math.round((present / recs.length) * 100) : 0 };
    })(),

    BookIssue.countDocuments({ school: sid, status: { $in: ['issued','overdue'] } }).catch(() => 0),

    FeePayment.aggregate([
      { $match: { school: sid, status: 'paid', paidOn: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]).catch(() => []),
  ]);

  const fee = feeAgg[0] || { total: 0, paid: 0, pending: 0 };

  return {
    students:         { total: totalStudents, active: activeStudents, inactive: totalStudents - activeStudents },
    fees:             { total: fee.total, paid: fee.paid, pending: fee.pending, collectionRate: fee.total ? Math.round((fee.paid / fee.total) * 100) : 0, collectedThisMonth: monthFees[0]?.total || 0 },
    attendanceToday:  attToday,
    attendanceMonth:  attMonth,
    library:          { activeIssues: libraryActive },
    generatedAt:      new Date(),
  };
};

// ─── Smart search — map natural language query to module + filters ─────────────
exports.smartSearch = function(query = '') {
  const q = query.toLowerCase().trim();
  let module = null;
  const filters = {};
  let groupBy = '';

  // Module detection
  if (/fee|paid|payment|pending|due|overdue|collect/i.test(q))       module = 'fees';
  else if (/attendance|present|absent|late|bunk/i.test(q))           module = 'attendance';
  else if (/student|enroll|admission/i.test(q))                      module = 'students';
  else if (/teacher|staff|faculty/i.test(q))                         module = 'teachers';
  else if (/exam|result|marks|grade|test/i.test(q))                  module = 'exams';
  else if (/library|book|issue|return/i.test(q))                     module = 'library';
  else if (/transport|bus|route|vehicle/i.test(q))                   module = 'transport';
  else if (/class/i.test(q))                                         module = 'classes';

  // Status filters
  if (/unpaid|pending|not paid/i.test(q)) filters.status = 'pending';
  if (/paid|collected/i.test(q) && module === 'fees') filters.status = 'paid';
  if (/overdue/i.test(q))                 filters.status = 'overdue';
  if (/absent/i.test(q))                  filters.status = 'absent';
  if (/present/i.test(q))                 filters.status = 'present';
  if (/active/i.test(q))                  filters.status = 'active';
  if (/male/i.test(q))                    filters.gender = 'male';
  if (/female/i.test(q))                  filters.gender = 'female';

  // Class detection — e.g. "class 10", "10A", "class X"
  const classMatch = q.match(/class\s*(\d{1,2}[A-Za-z]?)/i) || q.match(/\b(\d{1,2}[A-Za-z])\b/);
  if (classMatch) filters._classHint = classMatch[1];

  // Date hints
  const today = new Date();
  if (/today/i.test(q)) {
    filters.dateFrom = new Date(today.setHours(0,0,0,0)).toISOString();
    filters.dateTo   = new Date(today.setHours(23,59,59,999)).toISOString();
  } else if (/this month|monthly/i.test(q)) {
    filters.dateFrom = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
    filters.dateTo   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).toISOString();
  } else if (/last month/i.test(q)) {
    filters.dateFrom = new Date(today.getFullYear(), today.getMonth() - 1, 1).toISOString();
    filters.dateTo   = new Date(today.getFullYear(), today.getMonth(), 0, 23, 59, 59).toISOString();
  } else if (/last 30 days/i.test(q)) {
    filters.dateFrom = new Date(Date.now() - 30 * 86400000).toISOString();
  }

  // Group hints
  if (/class.?wise|by class/i.test(q))   groupBy = 'class';
  if (/student.?wise|by student/i.test(q)) groupBy = 'student';
  if (/gender/i.test(q))                 groupBy = 'gender';
  if (/month/i.test(q) && module === 'fees') groupBy = 'month';

  return { module, filters, groupBy };
};