// backend/controllers/reportController.js
const Report  = require('../models/Report');
const { buildPipeline, getDashboardSummary, smartSearch } = require('../services/reportEngine');

// ── Role → allowed modules ────────────────────────────────────────────────────
const ROLE_MODULES = {
  superAdmin:       ['students','teachers','classes','fees','attendance','exams','transport','library'],
  schoolAdmin:      ['students','teachers','classes','fees','attendance','exams','transport','library'],
  teacher:          ['students','classes','attendance','exams'],
  accountant:       ['students','fees'],
  librarian:        ['students','library'],
  transportManager: ['students','transport'],
  parent:           ['attendance','fees','exams'],
  student:          ['attendance','fees','exams'],
};

// Complete field definitions for each module — these drive the builder UI
const MODULE_META = {
  students: {
    label: 'Students',
    collection: 'students',
    fields: [
      { key: 'name',             label: 'Full Name',        type: 'string' },
      { key: 'admissionNumber',  label: 'Admission No.',    type: 'string' },
      { key: 'email',            label: 'Email',            type: 'string' },
      { key: 'phone',            label: 'Phone',            type: 'string' },
      { key: 'className',        label: 'Class',            type: 'string' },
      { key: 'grade',            label: 'Grade',            type: 'number' },
      { key: 'section',          label: 'Section',          type: 'string' },
      { key: 'gender',           label: 'Gender',           type: 'string' },
      { key: 'status',           label: 'Status',           type: 'string' },
      { key: 'admissionDateFmt', label: 'Admission Date',   type: 'date' },
      { key: 'dobFmt',           label: 'Date of Birth',    type: 'date' },
      { key: 'bloodGroup',       label: 'Blood Group',      type: 'string' },
      { key: 'category',         label: 'Category',         type: 'string' },
      { key: 'parentName',       label: 'Parent Name',      type: 'string' },
      { key: 'parentPhone',      label: 'Parent Phone',     type: 'string' },
      { key: 'parentEmail',      label: 'Parent Email',     type: 'string' },
    ],
    filters: [
      { key: 'gender',   label: 'Gender',  type: 'select', options: ['male','female','other'] },
      { key: 'status',   label: 'Status',  type: 'select', options: ['active','inactive','alumni'] },
      { key: 'category', label: 'Category',type: 'select', options: ['General','OBC','SC','ST','Other'] },
      { key: 'classId',  label: 'Class',   type: 'classSelect' },
      { key: 'section',  label: 'Section', type: 'text' },
      { key: 'dateFrom', label: 'Admission From', type: 'date' },
      { key: 'dateTo',   label: 'Admission To',   type: 'date' },
    ],
    groupBy: ['class','gender','status','category','grade'],
    sortBy:  ['name','admissionDateFmt','grade'],
  },
  teachers: {
    label: 'Teachers',
    collection: 'teachers',
    fields: [
      { key: 'name',           label: 'Full Name',        type: 'string' },
      { key: 'email',          label: 'Email',            type: 'string' },
      { key: 'phone',          label: 'Phone',            type: 'string' },
      { key: 'employeeId',     label: 'Employee ID',      type: 'string' },
      { key: 'designation',    label: 'Designation',      type: 'string' },
      { key: 'qualification',  label: 'Qualification',    type: 'string' },
      { key: 'experience',     label: 'Experience (yrs)', type: 'number' },
      { key: 'salary',         label: 'Salary (₹)',       type: 'number' },
      { key: 'subjectNames',   label: 'Subjects',         type: 'array' },
      { key: 'classNames',     label: 'Classes',          type: 'array' },
      { key: 'joiningDateFmt', label: 'Joining Date',     type: 'date' },
      { key: 'isActive',       label: 'Active',           type: 'boolean' },
    ],
    filters: [
      { key: 'isActive',  label: 'Active',       type: 'select', options: ['true','false'] },
      { key: 'dateFrom',  label: 'Joining From', type: 'date' },
      { key: 'dateTo',    label: 'Joining To',   type: 'date' },
    ],
    groupBy: ['designation','isActive'],
    sortBy:  ['name','experience','joiningDateFmt'],
  },
  classes: {
    label: 'Classes',
    collection: 'classes',
    fields: [
      { key: 'name',             label: 'Class Name',      type: 'string' },
      { key: 'grade',            label: 'Grade',           type: 'number' },
      { key: 'section',          label: 'Section',         type: 'string' },
      { key: 'room',             label: 'Room',            type: 'string' },
      { key: 'capacity',         label: 'Capacity',        type: 'number' },
      { key: 'studentCount',     label: 'Student Count',   type: 'number' },
      { key: 'subjectCount',     label: 'Subject Count',   type: 'number' },
      { key: 'classTeacherName', label: 'Class Teacher',   type: 'string' },
    ],
    filters: [
      { key: 'grade', label: 'Grade', type: 'number' },
    ],
    groupBy: ['grade'],
    sortBy:  ['grade','section','studentCount'],
  },
  fees: {
    label: 'Fee Collection',
    collection: 'feepayments',
    fields: [
      { key: 'studentName',     label: 'Student Name',     type: 'string' },
      { key: 'admissionNumber', label: 'Admission No.',    type: 'string' },
      { key: 'className',       label: 'Class',            type: 'string' },
      { key: 'grade',           label: 'Grade',            type: 'number' },
      { key: 'amount',          label: 'Amount (₹)',       type: 'currency' },
      { key: 'paidOnFmt',       label: 'Paid On',          type: 'date' },
      { key: 'method',          label: 'Payment Method',   type: 'string' },
      { key: 'receiptNumber',   label: 'Receipt No.',      type: 'string' },
      { key: 'month',           label: 'Month',            type: 'string' },
      { key: 'status',          label: 'Status',           type: 'string' },
      { key: 'transactionId',   label: 'Transaction ID',   type: 'string' },
      { key: 'remarks',         label: 'Remarks',          type: 'string' },
    ],
    filters: [
      { key: 'status',  label: 'Status', type: 'select', options: ['paid','pending','overdue','partial'] },
      { key: 'method',  label: 'Method', type: 'select', options: ['cash','online','cheque','bank','upi'] },
      { key: 'classId', label: 'Class',  type: 'classSelect' },
      { key: 'dateFrom',label: 'Paid From', type: 'date' },
      { key: 'dateTo',  label: 'Paid To',   type: 'date' },
    ],
    groupBy: ['class','status','method','month'],
    sortBy:  ['paidOnFmt','amount','studentName'],
  },
  attendance: {
    label: 'Attendance',
    collection: 'attendances',
    fields: [
      { key: 'studentName',     label: 'Student Name',   type: 'string' },
      { key: 'admissionNumber', label: 'Admission No.',  type: 'string' },
      { key: 'className',       label: 'Class',          type: 'string' },
      { key: 'dateFmt',         label: 'Date',           type: 'date' },
      { key: 'status',          label: 'Status',         type: 'string' },
      { key: 'remarks',         label: 'Remarks',        type: 'string' },
    ],
    filters: [
      { key: 'status',  label: 'Status', type: 'select', options: ['present','absent','late','excused'] },
      { key: 'classId', label: 'Class',  type: 'classSelect' },
      { key: 'dateFrom',label: 'Date From', type: 'date' },
      { key: 'dateTo',  label: 'Date To',   type: 'date' },
    ],
    groupBy: ['student','class','date','status'],
    sortBy:  ['dateFmt','studentName','status'],
  },
  exams: {
    label: 'Exams & Results',
    collection: 'results',
    fields: [
      { key: 'studentName',  label: 'Student Name',    type: 'string' },
      { key: 'examName',     label: 'Exam Name',       type: 'string' },
      { key: 'examType',     label: 'Exam Type',       type: 'string' },
      { key: 'subjectName',  label: 'Subject',         type: 'string' },
      { key: 'className',    label: 'Class',           type: 'string' },
      { key: 'marksObtained',label: 'Marks Obtained',  type: 'number' },
      { key: 'totalMarks',   label: 'Total Marks',     type: 'number' },
      { key: 'percentage',   label: 'Percentage (%)',  type: 'number' },
      { key: 'grade',        label: 'Grade',           type: 'string' },
      { key: 'passed',       label: 'Passed',          type: 'boolean' },
      { key: 'isAbsent',     label: 'Absent',          type: 'boolean' },
    ],
    filters: [
      { key: 'classId', label: 'Class',     type: 'classSelect' },
      { key: 'dateFrom',label: 'From Date', type: 'date' },
      { key: 'dateTo',  label: 'To Date',   type: 'date' },
    ],
    groupBy: ['examType','className'],
    sortBy:  ['percentage','marksObtained','studentName'],
  },
  transport: {
    label: 'Transport',
    collection: 'students',
    fields: [
      { key: 'studentName',   label: 'Student Name',  type: 'string' },
      { key: 'admissionNumber',label: 'Admission No.', type: 'string' },
      { key: 'className',     label: 'Class',         type: 'string' },
      { key: 'grade',         label: 'Grade',         type: 'number' },
      { key: 'routeName',     label: 'Route Name',    type: 'string' },
      { key: 'vehicleNumber', label: 'Vehicle No.',   type: 'string' },
      { key: 'parentName',    label: 'Parent Name',   type: 'string' },
      { key: 'parentPhone',   label: 'Parent Phone',  type: 'string' },
    ],
    filters: [
      { key: 'classId', label: 'Class', type: 'classSelect' },
    ],
    groupBy: ['route','grade'],
    sortBy:  ['studentName','routeName'],
  },
  library: {
    label: 'Library',
    collection: 'bookissues',
    fields: [
      { key: 'bookTitle',      label: 'Book Title',    type: 'string' },
      { key: 'bookAuthor',     label: 'Author',        type: 'string' },
      { key: 'bookCategory',   label: 'Category',      type: 'string' },
      { key: 'studentName',    label: 'Student Name',  type: 'string' },
      { key: 'admissionNumber',label: 'Admission No.', type: 'string' },
      { key: 'issuedFmt',      label: 'Issue Date',    type: 'date' },
      { key: 'dueFmt',         label: 'Due Date',      type: 'date' },
      { key: 'returnedFmt',    label: 'Return Date',   type: 'date' },
      { key: 'status',         label: 'Status',        type: 'string' },
      { key: 'lateFee',        label: 'Late Fee (₹)',  type: 'currency' },
      { key: 'overdueDays',    label: 'Overdue Days',  type: 'number' },
    ],
    filters: [
      { key: 'status',  label: 'Status', type: 'select', options: ['issued','returned','overdue'] },
      { key: 'dateFrom',label: 'Issue From', type: 'date' },
      { key: 'dateTo',  label: 'Issue To',   type: 'date' },
    ],
    groupBy: ['status','book'],
    sortBy:  ['issuedFmt','dueFmt','studentName'],
  },
};

function getAllowedMeta(role) {
  const allowed = ROLE_MODULES[role] || [];
  const result = {};
  allowed.forEach(m => { if (MODULE_META[m]) result[m] = MODULE_META[m]; });
  return result;
}

function canAccess(role, module) {
  return (ROLE_MODULES[role] || []).includes(module);
}

// ── GET /api/reports/meta ─────────────────────────────────────────────────────
exports.getMeta = async (req, res) => {
  const meta = getAllowedMeta(req.user.role);
  res.json({ success: true, data: meta });
};

// ── GET /api/reports/dashboard ────────────────────────────────────────────────
exports.getDashboard = async (req, res) => {
  const data = await getDashboardSummary(req.user.school);
  res.json({ success: true, data });
};

// ── GET /api/reports/predefined ───────────────────────────────────────────────
exports.getPredefined = async (req, res) => {
  const today = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1).toISOString();
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59).toISOString();
  const dayStart   = new Date(today.setHours(0,0,0,0)).toISOString();
  const dayEnd     = new Date(today.setHours(23,59,59,999)).toISOString();

  const ALL = [
    {
      id: 'students-all-active', module: 'students', category: 'Students',
      name: 'All Active Students',
      description: 'Complete list of enrolled students with contact info',
      fields: ['name','admissionNumber','className','grade','section','gender','parentPhone','status'],
      filters: { status: 'active' }, groupBy: '', sortBy: { field: 'name', order: 1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'students-class-wise', module: 'students', category: 'Students',
      name: 'Students — Class Wise Count',
      description: 'Number of students in each class',
      fields: ['name','className','grade','gender'],
      filters: { status: 'active' }, groupBy: 'class', sortBy: { field: 'grade', order: 1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: '_id', yAxis: 'count' },
    },
    {
      id: 'students-gender-wise', module: 'students', category: 'Students',
      name: 'Students — Gender Distribution',
      description: 'Male vs female student breakdown',
      fields: ['name','gender','className'],
      filters: { status: 'active' }, groupBy: 'gender', sortBy: { field: 'gender', order: 1 },
      chartConfig: { enabled: true, type: 'pie', xAxis: '_id', yAxis: 'count' },
    },
    {
      id: 'fees-collected-month', module: 'fees', category: 'Fees',
      name: 'Fee Collection — This Month',
      description: 'All payments collected in the current month',
      fields: ['studentName','admissionNumber','className','amount','paidOnFmt','method','receiptNumber'],
      filters: { status: 'paid', dateFrom: monthStart, dateTo: monthEnd },
      groupBy: '', sortBy: { field: 'paidOnFmt', order: -1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'fees-pending', module: 'fees', category: 'Fees',
      name: 'Pending Fees — All Classes',
      description: 'Students with outstanding fee payments',
      fields: ['studentName','admissionNumber','className','amount','status','month'],
      filters: { status: 'pending' }, groupBy: 'class', sortBy: { field: 'amount', order: -1 },
      chartConfig: { enabled: true, type: 'doughnut', xAxis: '_id', yAxis: 'totalAmount' },
    },
    {
      id: 'fees-overdue', module: 'fees', category: 'Fees',
      name: 'Overdue Fees',
      description: 'Fee payments past due date',
      fields: ['studentName','admissionNumber','className','amount','status','month'],
      filters: { status: 'overdue' }, groupBy: '', sortBy: { field: 'amount', order: -1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'attendance-today', module: 'attendance', category: 'Attendance',
      name: "Today's Attendance",
      description: "All attendance records for today",
      fields: ['studentName','className','dateFmt','status'],
      filters: { dateFrom: dayStart, dateTo: dayEnd },
      groupBy: 'class', sortBy: { field: 'status', order: 1 },
      chartConfig: { enabled: true, type: 'pie', xAxis: '_id', yAxis: 'count' },
    },
    {
      id: 'attendance-student-monthly', module: 'attendance', category: 'Attendance',
      name: 'Attendance — Student Wise (This Month)',
      description: 'Attendance percentage for each student this month',
      fields: ['studentName','className','total','present','absent','late','percentage'],
      filters: { dateFrom: monthStart, dateTo: monthEnd },
      groupBy: 'student', sortBy: { field: 'percentage', order: 1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: 'studentName', yAxis: 'percentage' },
    },
    {
      id: 'attendance-low', module: 'attendance', category: 'Attendance',
      name: 'Low Attendance Alert (< 75%)',
      description: 'Students with attendance below 75% this month',
      fields: ['studentName','className','total','present','absent','percentage'],
      filters: { dateFrom: monthStart, dateTo: monthEnd },
      groupBy: 'student', sortBy: { field: 'percentage', order: 1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'exams-results', module: 'exams', category: 'Exams',
      name: 'Exam Results — All',
      description: 'All student results with marks and grade',
      fields: ['studentName','examName','examType','subjectName','className','marksObtained','totalMarks','percentage','grade','passed'],
      filters: {}, groupBy: '', sortBy: { field: 'percentage', order: -1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'exams-top-students', module: 'exams', category: 'Exams',
      name: 'Top Performing Students',
      description: 'Students ranked by marks obtained (highest first)',
      fields: ['studentName','examName','className','marksObtained','totalMarks','percentage','grade'],
      filters: {}, groupBy: '', sortBy: { field: 'percentage', order: -1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: 'studentName', yAxis: 'percentage' },
    },
    {
      id: 'library-active', module: 'library', category: 'Library',
      name: 'Active Book Issues',
      description: 'All books currently issued and not returned',
      fields: ['bookTitle','bookAuthor','studentName','issuedFmt','dueFmt','status','overdueDays'],
      filters: { status: 'issued' }, groupBy: '', sortBy: { field: 'dueFmt', order: 1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'library-overdue', module: 'library', category: 'Library',
      name: 'Overdue Books',
      description: 'Books that are past their return date',
      fields: ['bookTitle','bookAuthor','studentName','dueFmt','status','lateFee','overdueDays'],
      filters: { status: 'overdue' }, groupBy: '', sortBy: { field: 'overdueDays', order: -1 },
      chartConfig: { enabled: false },
    },
    {
      id: 'transport-route-wise', module: 'transport', category: 'Transport',
      name: 'Transport — Route Wise Students',
      description: 'Students grouped by transport route',
      fields: ['studentName','className','routeName','vehicleNumber','parentPhone'],
      filters: {}, groupBy: 'route', sortBy: { field: 'routeName', order: 1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: 'routeName', yAxis: 'count' },
    },
    {
      id: 'teachers-all', module: 'teachers', category: 'Teachers',
      name: 'All Teaching Staff',
      description: 'Complete teacher directory with subjects',
      fields: ['name','email','phone','designation','qualification','experience','subjectNames','joiningDateFmt'],
      filters: { isActive: 'true' }, groupBy: '', sortBy: { field: 'name', order: 1 },
      chartConfig: { enabled: false },
    },
  ];

  const allowed = ROLE_MODULES[req.user.role] || [];
  res.json({ success: true, data: ALL.filter(r => allowed.includes(r.module)) });
};

// ── GET /api/reports/templates ────────────────────────────────────────────────
exports.getTemplates = async (req, res) => {
  const templates = await Report.find({ school: req.user.school, isTemplate: true })
    .populate('createdBy', 'name')
    .sort({ name: 1 });
  res.json({ success: true, data: templates });
};

// ── POST /api/reports/run ─────────────────────────────────────────────────────
exports.runReport = async (req, res) => {
  let cfg;

  if (req.body.reportId) {
    const saved = await Report.findOne({ _id: req.body.reportId, school: req.user.school });
    if (!saved) return res.status(404).json({ success: false, message: 'Saved report not found' });
    cfg = {
      module:  saved.module,
      fields:  saved.fields,
      filters: { ...saved.filters, ...(req.body.filters || {}) },
      groupBy: saved.groupBy,
      sortBy:  saved.sortBy,
    };
  } else {
    cfg = {
      module:  req.body.module,
      fields:  req.body.fields  || [],
      filters: req.body.filters || {},
      groupBy: req.body.groupBy || '',
      sortBy:  req.body.sortBy  || { field: 'createdAt', order: -1 },
    };
  }

  if (!cfg.module) return res.status(400).json({ success: false, message: 'module is required' });

  if (!canAccess(req.user.role, cfg.module)) {
    return res.status(403).json({ success: false, message: `Your role cannot access '${cfg.module}' reports` });
  }

  const { model, pipeline } = buildPipeline({ ...cfg, schoolId: req.user.school });
  const limit = Math.min(parseInt(req.body.limit) || 500, 2000);
  pipeline.push({ $limit: limit });

  const data = await model.aggregate(pipeline).allowDiskUse(true);

  res.json({
    success: true,
    module:  cfg.module,
    count:   data.length,
    groupBy: cfg.groupBy,
    data,
  });
};

// ── POST /api/reports/smart-search ───────────────────────────────────────────
exports.smartSearchReport = async (req, res) => {
  const { query } = req.body;
  if (!query) return res.status(400).json({ success: false, message: 'query is required' });

  const parsed = smartSearch(query);

  if (!parsed.module) {
    return res.json({
      success: true,
      interpreted: parsed,
      message: 'Could not determine module from query. Please specify module manually.',
      data: [],
      count: 0,
    });
  }

  if (!canAccess(req.user.role, parsed.module)) {
    return res.status(403).json({ success: false, message: `Your role cannot access '${parsed.module}' reports` });
  }

  const meta = MODULE_META[parsed.module];
  const fields = meta ? meta.fields.map(f => f.key) : [];

  const { model, pipeline } = buildPipeline({
    module:   parsed.module,
    fields,
    filters:  parsed.filters,
    groupBy:  parsed.groupBy,
    sortBy:   { field: 'createdAt', order: -1 },
    schoolId: req.user.school,
  });
  pipeline.push({ $limit: 200 });

  const data = await model.aggregate(pipeline).allowDiskUse(true);

  res.json({
    success: true,
    interpreted: parsed,
    query,
    module:  parsed.module,
    count:   data.length,
    groupBy: parsed.groupBy,
    data,
  });
};

// ── CRUD ──────────────────────────────────────────────────────────────────────
exports.getReports = async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.module)     filter.module     = req.query.module;
  if (req.query.isTemplate) filter.isTemplate = req.query.isTemplate === 'true';
  if (!['superAdmin','schoolAdmin'].includes(req.user.role)) {
    filter.$or = [{ createdBy: req.user._id }, { isTemplate: true }];
  }
  const reports = await Report.find(filter).populate('createdBy','name email').sort({ updatedAt: -1 });
  res.json({ success: true, count: reports.length, data: reports });
};

exports.getReport = async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, school: req.user.school })
    .populate('createdBy','name')
    .populate('downloadHistory.exportedBy','name');
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  res.json({ success: true, data: report });
};

exports.createReport = async (req, res) => {
  const { name, description, module, fields, filters, groupBy, sortBy, chartConfig, isTemplate, scheduleFrequency } = req.body;
  if (!canAccess(req.user.role, module)) {
    return res.status(403).json({ success: false, message: `Cannot create ${module} reports` });
  }
  const report = await Report.create({
    name, description, module, fields, filters, groupBy, sortBy,
    chartConfig, isTemplate, scheduleFrequency,
    createdBy: req.user._id,
    school:    req.user.school,
  });
  res.status(201).json({ success: true, data: report });
};

exports.updateReport = async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, school: req.user.school });
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  const isOwner = report.createdBy.toString() === req.user._id.toString();
  if (!isOwner && !['superAdmin','schoolAdmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You can only edit your own reports' });
  }
  ['name','description','fields','filters','groupBy','sortBy','chartConfig','isTemplate','scheduleFrequency'].forEach(k => {
    if (req.body[k] !== undefined) report[k] = req.body[k];
  });
  await report.save();
  res.json({ success: true, data: report });
};

exports.deleteReport = async (req, res) => {
  const report = await Report.findOne({ _id: req.params.id, school: req.user.school });
  if (!report) return res.status(404).json({ success: false, message: 'Report not found' });
  const isOwner = report.createdBy.toString() === req.user._id.toString();
  if (!isOwner && !['superAdmin','schoolAdmin'].includes(req.user.role)) {
    return res.status(403).json({ success: false, message: 'You can only delete your own reports' });
  }
  await report.deleteOne();
  res.json({ success: true, message: 'Report deleted' });
};

// ── POST /api/reports/export ──────────────────────────────────────────────────
exports.exportReport = async (req, res) => {
  const { format, reportId, module: mod, fields, filters, groupBy, sortBy } = req.body;
  if (!['pdf','xlsx','csv'].includes(format)) {
    return res.status(400).json({ success: false, message: 'format must be pdf, xlsx, or csv' });
  }

  let cfg, reportDoc;
  if (reportId) {
    reportDoc = await Report.findOne({ _id: reportId, school: req.user.school });
    if (!reportDoc) return res.status(404).json({ success: false, message: 'Report not found' });
    cfg = { module: reportDoc.module, fields: reportDoc.fields, filters: { ...reportDoc.filters, ...(filters || {}) }, groupBy: reportDoc.groupBy, sortBy: reportDoc.sortBy };
  } else {
    cfg = { module: mod, fields: fields || [], filters: filters || {}, groupBy: groupBy || '', sortBy };
  }

  if (!canAccess(req.user.role, cfg.module)) {
    return res.status(403).json({ success: false, message: 'Access denied' });
  }

  const { model, pipeline } = buildPipeline({ ...cfg, schoolId: req.user.school });
  pipeline.push({ $limit: 5000 });
  const rows = await model.aggregate(pipeline).allowDiskUse(true);

  if (reportDoc) {
    reportDoc.downloadHistory.unshift({ exportedBy: req.user._id, format, rowCount: rows.length });
    if (reportDoc.downloadHistory.length > 20) reportDoc.downloadHistory.pop();
    await reportDoc.save();
  }

  const reportName = (reportDoc?.name || `${cfg.module}-report`).replace(/\s+/g, '-');
  const timestamp  = new Date().toISOString().split('T')[0];
  const filename   = `${reportName}-${timestamp}`;
  const columns    = cfg.fields?.length
    ? cfg.fields
    : Object.keys(rows[0] || {}).filter(k => !['_id','__v'].includes(k));

  if (format === 'csv') {
    const { Parser } = require('json2csv');
    const csv = new Parser({ fields: columns }).parse(rows);
    res.setHeader('Content-Type', 'text/csv');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.csv"`);
    return res.send(csv);
  }

  if (format === 'xlsx') {
    const ExcelJS = require('exceljs');
    const wb = new ExcelJS.Workbook();
    wb.creator = 'EduCore Reports';
    wb.created = new Date();
    const ws = wb.addWorksheet(reportName, { pageSetup: { paperSize: 9, orientation: 'landscape' } });
    ws.addRow(columns.map(c => c.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())));
    ws.getRow(1).font = { bold: true, color: { argb: 'FFFFFFFF' } };
    ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    rows.forEach((row, i) => {
      const vals = columns.map(c => { const v = row[c]; if (v === null || v === undefined) return ''; if (typeof v === 'object') return JSON.stringify(v); return v; });
      const r = ws.addRow(vals);
      if (i % 2 === 0) r.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } };
    });
    ws.columns.forEach(col => { col.width = Math.max(16, (col.header?.length || 0) + 4); });
    ws.addRow([]);
    ws.addRow([`Total: ${rows.length} rows`, `Generated: ${new Date().toLocaleString('en-IN')}`]);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.xlsx"`);
    await wb.xlsx.write(res);
    return res.end();
  }

  if (format === 'pdf') {
    const PDFDoc = require('pdfkit');
    const doc = new PDFDoc({ margin: 40, size: 'A4', layout: 'landscape' });
    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}.pdf"`);
    doc.pipe(res);
    doc.fontSize(16).font('Helvetica-Bold').text(reportName, { align: 'center' });
    doc.fontSize(9).font('Helvetica').text(`Generated: ${new Date().toLocaleString('en-IN')} | Rows: ${rows.length}`, { align: 'center' });
    doc.moveDown(0.5);
    const pageW = doc.page.width - 80;
    const colW  = Math.max(55, Math.floor(pageW / columns.length));
    let y = doc.y;
    doc.rect(40, y, pageW, 18).fill('#1E3A8A');
    doc.fill('#ffffff').fontSize(8).font('Helvetica-Bold');
    columns.forEach((c, i) => {
      doc.text(c.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase()), 40 + i * colW + 3, y + 4, { width: colW - 6, ellipsis: true });
    });
    doc.fill('#000000');
    y += 18;
    rows.slice(0, 300).forEach((row, idx) => {
      if (y > doc.page.height - 60) { doc.addPage({ layout: 'landscape' }); y = 40; }
      const rh = 16;
      if (idx % 2 === 0) doc.rect(40, y, pageW, rh).fill('#F8FAFC');
      doc.fill('#111827').fontSize(7.5).font('Helvetica');
      columns.forEach((c, i) => {
        let v = row[c]; if (v === null || v === undefined) v = '';
        if (typeof v === 'boolean') v = v ? 'Yes' : 'No';
        if (typeof v === 'object') v = JSON.stringify(v);
        doc.text(String(v), 40 + i * colW + 3, y + 3, { width: colW - 6, ellipsis: true });
      });
      y += rh;
    });
    if (rows.length > 300) doc.moveDown().fontSize(9).text(`... and ${rows.length - 300} more rows. Download as Excel for full data.`, { align: 'center' });
    doc.end();
  }
};