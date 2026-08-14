// backend/utils/seedReports.js
// Run once to insert sample report templates for your school.
// Usage: node utils/seedReports.js
// Requires: MONGO_URI in .env, and at least one schoolAdmin user to exist.

require('dotenv').config();
const mongoose = require('mongoose');

async function seed() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('Connected to MongoDB');

  const User   = require('../models/User');
  const Report = require('../models/Report');

  // Find first schoolAdmin to own the templates
  const admin = await User.findOne({ role: { $in: ['schoolAdmin', 'superAdmin'] } });
  if (!admin) {
    console.error('No admin user found. Run seedData.js first.');
    process.exit(1);
  }
  const school = admin.school;
  if (!school) {
    console.error('Admin has no school assigned.');
    process.exit(1);
  }

  // Remove existing templates for a clean seed
  await Report.deleteMany({ school, isTemplate: true });

  const today      = new Date();
  const monthStart = new Date(today.getFullYear(), today.getMonth(), 1);
  const monthEnd   = new Date(today.getFullYear(), today.getMonth() + 1, 0, 23, 59, 59);

  const templates = [
    {
      name:        'Students — Class & Gender Summary',
      description: 'All active students grouped by class with gender breakdown',
      module:      'students',
      fields:      ['name', 'admissionNumber', 'className', 'grade', 'classSection', 'gender', 'status', 'parentName', 'parentPhone'],
      filters:     { status: 'active' },
      groupBy:     'class',
      sortBy:      { field: 'className', order: 1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: '_id', yAxis: 'count' },
      isTemplate:  true,
    },
    {
      name:        'Fee Collection — This Month',
      description: 'All payments received in the current month with receipt details',
      module:      'fees',
      fields:      ['studentName', 'admissionNumber', 'className', 'amount', 'paidOnFmt', 'method', 'receiptNumber', 'month', 'status'],
      filters:     { dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString() },
      groupBy:     '',
      sortBy:      { field: 'paidOn', order: -1 },
      chartConfig: { enabled: false, type: 'bar', xAxis: 'paidOnFmt', yAxis: 'amount' },
      isTemplate:  true,
      scheduleFrequency: 'monthly',
    },
    {
      name:        'Pending Fees — Class Wise',
      description: 'Students with pending or partial fee payments grouped by class',
      module:      'fees',
      fields:      ['studentName', 'admissionNumber', 'className', 'amount', 'status', 'month'],
      filters:     { status: 'pending' },
      groupBy:     'class',
      sortBy:      { field: 'className', order: 1 },
      chartConfig: { enabled: true, type: 'doughnut', xAxis: '_id', yAxis: 'totalAmount' },
      isTemplate:  true,
    },
    {
      name:        'Attendance — Student Wise Monthly',
      description: 'Each student\'s attendance count and percentage for the current month',
      module:      'attendance',
      fields:      ['studentName', 'className', 'total', 'present', 'absent', 'late', 'attendancePercentage'],
      filters:     { dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString() },
      groupBy:     'student',
      sortBy:      { field: 'attendancePercentage', order: 1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: 'studentName', yAxis: 'attendancePercentage' },
      isTemplate:  true,
      scheduleFrequency: 'monthly',
    },
    {
      name:        'Attendance — Low Attendance Alert',
      description: 'Students with attendance below 75% this month',
      module:      'attendance',
      fields:      ['studentName', 'className', 'total', 'present', 'absent', 'attendancePercentage'],
      filters:     { dateFrom: monthStart.toISOString(), dateTo: monthEnd.toISOString() },
      groupBy:     'student',
      sortBy:      { field: 'attendancePercentage', order: 1 },
      chartConfig: { enabled: false },
      isTemplate:  true,
    },
    {
      name:        'Library — Overdue Books',
      description: 'All books currently overdue with student contact info',
      module:      'library',
      fields:      ['bookTitle', 'bookAuthor', 'studentName', 'issuedDateFmt', 'dueDateFmt', 'status', 'lateFee'],
      filters:     { status: 'overdue' },
      groupBy:     '',
      sortBy:      { field: 'dueDate', order: 1 },
      chartConfig: { enabled: false },
      isTemplate:  true,
    },
    {
      name:        'Transport — Route Wise Students',
      description: 'All students using school transport grouped by route',
      module:      'transport',
      fields:      ['studentName', 'className', 'routeName', 'vehicleNumber', 'parentName', 'parentPhone'],
      filters:     {},
      groupBy:     'route',
      sortBy:      { field: 'routeName', order: 1 },
      chartConfig: { enabled: true, type: 'pie', xAxis: '_id', yAxis: 'count' },
      isTemplate:  true,
    },
    {
      name:        'Exam Results — Pass/Fail Summary',
      description: 'All exam results with marks, grade, and pass/fail status',
      module:      'exams',
      fields:      ['studentName', 'examName', 'examType', 'marksObtained', 'totalMarks', 'percentage', 'grade', 'passed'],
      filters:     {},
      groupBy:     'examType',
      sortBy:      { field: 'percentage', order: -1 },
      chartConfig: { enabled: true, type: 'bar', xAxis: 'examType', yAxis: 'avgMarks' },
      isTemplate:  true,
    },
  ];

  const inserted = await Report.insertMany(
    templates.map(t => ({ ...t, createdBy: admin._id, school }))
  );

  console.log(`\n✅ Seeded ${inserted.length} report templates`);
  inserted.forEach(r => console.log(`   • ${r.name}`));
  await mongoose.disconnect();
}

seed().catch(err => { console.error(err); process.exit(1); });