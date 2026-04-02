require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const User = require('../models/User');
const Student = require('../models/Student');
const Teacher = require('../models/Teacher');
const School = require('../models/School');
const {
  Class, Subject, Exam, FeePayment, Book, Transport, Notification, Attendance
} = require('../models/index');

const connectDB = async () => {
  await mongoose.connect(process.env.MONGO_URI);
  console.log('✅ Connected to MongoDB');
};

const seed = async () => {
  await connectDB();

  console.log('🧹 Clearing existing data...');
  await Promise.all([
    User.deleteMany({}), Student.deleteMany({}), Teacher.deleteMany({}),
    School.deleteMany({}), Class.deleteMany({}), Subject.deleteMany({}),
    Exam.deleteMany({}), FeePayment.deleteMany({}), Book.deleteMany({}),
    Transport.deleteMany({}), Notification.deleteMany({}), Attendance.deleteMany({})
  ]);

  console.log('🏫 Creating school...');
  const school = await School.create({
    name: 'The Future Step School',
    address: 'Smt. K. P. Patil School Compound, Shindgavhan Road, A/P Bhaler, Tal/Dist. Nandurbar, M.S.',
    phone: '+91 9404820296',
    email: 'inquiry@thefuturestepschool.in',
    principalName: 'Dr. Suresh Patil',
    board: 'State Board',
    establishedYear: 2018
  });

  console.log('👤 Creating users...');
  const superAdmin = await User.create({ name: 'Super Admin', email: 'superadmin@school.com', password: 'Admin@123', role: 'superAdmin', school: school._id });
  const admin = await User.create({ name: 'School Admin', email: 'admin@school.com', password: 'Admin@123', role: 'schoolAdmin', school: school._id });
  const accountant = await User.create({ name: 'Rahul Deshmukh', email: 'accountant@school.com', password: 'Admin@123', role: 'accountant', school: school._id });
  const librarian = await User.create({ name: 'Sunita Patil', email: 'librarian@school.com', password: 'Admin@123', role: 'librarian', school: school._id });
  const transport = await User.create({ name: 'Mohan Rathod', email: 'transport@school.com', password: 'Admin@123', role: 'transportManager', school: school._id });

  console.log('📚 Creating subjects...');
  const subjects = await Subject.insertMany([
    { name: 'Mathematics', code: 'MATH', type: 'both', school: school._id },
    { name: 'Science', code: 'SCI', type: 'both', school: school._id },
    { name: 'English', code: 'ENG', type: 'theory', school: school._id },
    { name: 'Marathi', code: 'MAR', type: 'theory', school: school._id },
    { name: 'Hindi', code: 'HIN', type: 'theory', school: school._id },
    { name: 'Social Science', code: 'SST', type: 'theory', school: school._id },
    { name: 'General Knowledge', code: 'GK', type: 'theory', school: school._id },
  ]);

  console.log('🎓 Creating teachers...');
  const teacherUsers = await Promise.all([
    User.create({ name: 'Mr. Vijay Chaudhari', email: 'teacher@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543210', school: school._id }),
    User.create({ name: 'Mrs. Rekha Nikam', email: 'rekha.nikam@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543211', school: school._id }),
    User.create({ name: 'Mr. Santosh Borse', email: 'santosh.borse@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543212', school: school._id }),
    User.create({ name: 'Mrs. Priya Sonawane', email: 'priya.sonawane@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543213', school: school._id }),
  ]);

  const teachers = await Teacher.insertMany([
    { user: teacherUsers[0]._id, employeeId: 'TFS-EMP-001', subjects: [subjects[0]._id], qualification: 'M.Sc Mathematics', experience: 8, school: school._id },
    { user: teacherUsers[1]._id, employeeId: 'TFS-EMP-002', subjects: [subjects[1]._id], qualification: 'M.Sc Science', experience: 10, school: school._id },
    { user: teacherUsers[2]._id, employeeId: 'TFS-EMP-003', subjects: [subjects[2]._id], qualification: 'M.A English', experience: 6, school: school._id },
    { user: teacherUsers[3]._id, employeeId: 'TFS-EMP-004', subjects: [subjects[3]._id], qualification: 'M.A Marathi', experience: 7, school: school._id },
  ]);

  console.log('🏛 Creating classes...');
  const classes = await Class.insertMany([
    { name: 'Class LKG', grade: 0, section: 'A', classTeacher: teachers[0]._id, subjects: subjects.slice(0, 3).map(s => s._id), capacity: 30, room: '101', school: school._id },
    { name: 'Class UKG', grade: 0, section: 'B', classTeacher: teachers[1]._id, subjects: subjects.slice(0, 3).map(s => s._id), capacity: 30, room: '102', school: school._id },
    { name: 'Class I', grade: 1, section: 'A', classTeacher: teachers[2]._id, subjects: subjects.slice(0, 5).map(s => s._id), capacity: 35, room: '201', school: school._id },
    { name: 'Class V', grade: 5, section: 'A', classTeacher: teachers[3]._id, subjects: subjects.map(s => s._id), capacity: 35, room: '301', school: school._id },
  ]);

  await Teacher.findByIdAndUpdate(teachers[0]._id, { classTeacherOf: classes[0]._id, classes: [classes[0]._id, classes[2]._id] });
  await Teacher.findByIdAndUpdate(teachers[1]._id, { classTeacherOf: classes[1]._id, classes: [classes[1]._id, classes[3]._id] });
  await Teacher.findByIdAndUpdate(teachers[2]._id, { classTeacherOf: classes[2]._id, classes: [classes[0]._id, classes[2]._id] });
  await Teacher.findByIdAndUpdate(teachers[3]._id, { classTeacherOf: classes[3]._id, classes: [classes[1]._id, classes[3]._id] });

  console.log('👨‍🎓 Creating students...');
  const studentData = [
    { name: 'Rohan Patil', email: 'student@school.com', admNum: 'TFS-2024-001', roll: '01', class: classes[2]._id, gender: 'male', dob: '2018-05-15', parentName: 'Suresh Patil', parentPhone: '9800000001' },
    { name: 'Priya Chaudhari', email: 'priya.c@school.com', admNum: 'TFS-2024-002', roll: '02', class: classes[2]._id, gender: 'female', dob: '2018-07-20', parentName: 'Ramesh Chaudhari', parentPhone: '9800000002' },
    { name: 'Aditya Nikam', email: 'aditya.n@school.com', admNum: 'TFS-2024-003', roll: '03', class: classes[3]._id, gender: 'male', dob: '2016-03-10', parentName: 'Prakash Nikam', parentPhone: '9800000003' },
    { name: 'Sneha Borse', email: 'sneha.b@school.com', admNum: 'TFS-2024-004', roll: '04', class: classes[0]._id, gender: 'female', dob: '2020-11-25', parentName: 'Vijay Borse', parentPhone: '9800000004' },
    { name: 'Rahul Sonawane', email: 'rahul.s@school.com', admNum: 'TFS-2024-005', roll: '05', class: classes[1]._id, gender: 'male', dob: '2020-08-30', parentName: 'Ganesh Sonawane', parentPhone: '9800000005' },
    { name: 'Pooja Rathod', email: 'pooja.r@school.com', admNum: 'TFS-2024-006', roll: '06', class: classes[2]._id, gender: 'female', dob: '2018-01-14', parentName: 'Dilip Rathod', parentPhone: '9800000006' },
  ];

  const parentUser = await User.create({ name: 'Suresh Patil', email: 'parent@school.com', password: 'Parent@123', role: 'parent', phone: '9800000001', school: school._id });

  const createdStudents = [];
  for (let i = 0; i < studentData.length; i++) {
    const sd = studentData[i];
    const u = await User.create({ name: sd.name, email: sd.email, password: 'Student@123', role: 'student', school: school._id });
    const s = await Student.create({
      user: u._id, admissionNumber: sd.admNum, rollNumber: sd.roll,
      class: sd.class, gender: sd.gender, dateOfBirth: sd.dob,
      parentName: sd.parentName, parentPhone: sd.parentPhone,
      parent: i === 0 ? parentUser._id : undefined,
      school: school._id
    });
    await Class.findByIdAndUpdate(sd.class, { $push: { students: s._id } });
    createdStudents.push(s);
  }

  console.log('📝 Creating exams...');
  await Exam.insertMany([
    { name: 'Unit Test I', class: classes[2]._id, subject: subjects[0]._id, date: new Date('2026-03-18'), totalMarks: 50, passingMarks: 18, examType: 'unit', school: school._id, createdBy: admin._id },
    { name: 'Half-Yearly Examination', class: classes[3]._id, subject: subjects[1]._id, date: new Date('2026-04-02'), totalMarks: 100, passingMarks: 35, examType: 'midterm', school: school._id, createdBy: admin._id },
    { name: 'Practical Assessment', class: classes[3]._id, subject: subjects[1]._id, date: new Date('2026-03-25'), totalMarks: 30, passingMarks: 10, examType: 'practical', school: school._id, createdBy: admin._id },
    { name: 'Annual Examination', class: classes[2]._id, subject: subjects[2]._id, date: new Date('2026-05-01'), totalMarks: 100, passingMarks: 35, examType: 'final', school: school._id, createdBy: admin._id },
  ]);

  console.log('💰 Creating fee payments...');
  await FeePayment.insertMany([
    { student: createdStudents[0]._id, amount: 8500, method: 'online', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id, receiptNumber: 'REC-2026-001' },
    { student: createdStudents[1]._id, amount: 8500, method: 'cash', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id, receiptNumber: 'REC-2026-002' },
    { student: createdStudents[2]._id, amount: 8500, method: 'bank', status: 'pending', month: 'February 2026', year: 2026, school: school._id, collectedBy: accountant._id, receiptNumber: 'REC-2026-003' },
    { student: createdStudents[3]._id, amount: 7000, method: 'cash', status: 'overdue', month: 'January 2026', year: 2026, school: school._id, collectedBy: accountant._id, receiptNumber: 'REC-2026-004' },
    { student: createdStudents[4]._id, amount: 9000, method: 'cheque', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id, receiptNumber: 'REC-2026-005' },
  ]);

  console.log('📚 Creating library books...');
  await Book.insertMany([
    { title: 'Mathematics for Class V', author: 'NCERT', isbn: '978-81-7450-001-1', category: 'Mathematics', totalCopies: 20, availableCopies: 14, school: school._id },
    { title: 'Science & Technology Class IV', author: 'Balbharati', isbn: '978-81-7450-002-2', category: 'Science', totalCopies: 20, availableCopies: 16, school: school._id },
    { title: 'English Reader Class III', author: 'Balbharati', isbn: '978-81-7450-003-3', category: 'Language', totalCopies: 15, availableCopies: 11, school: school._id },
    { title: 'Marathi Sulabhbharati', author: 'Balbharati', isbn: '978-81-7450-004-4', category: 'Language', totalCopies: 18, availableCopies: 13, school: school._id },
    { title: 'General Knowledge Workbook', author: 'Various', isbn: '978-81-7450-005-5', category: 'General', totalCopies: 12, availableCopies: 9, school: school._id },
    { title: 'Moral Science for Kids', author: 'Various', isbn: '978-81-7450-006-6', category: 'General', totalCopies: 10, availableCopies: 7, school: school._id },
  ]);

  console.log('🚌 Creating transport routes...');
  await Transport.insertMany([
    {
      routeName: 'Route 1 — Bhaler to Nandurbar', routeNumber: 'TFS-R01',
      vehicleNumber: 'MH-20 AB 1234', vehicleType: 'bus', capacity: 30,
      driver: { name: 'Prakash Valvi', phone: '9700000001', licenseNumber: 'MH20-20180012345' },
      stops: [
        { name: 'Bhaler Village', time: '7:00 AM', order: 1 },
        { name: 'Shindgavhan Phata', time: '7:10 AM', order: 2 },
        { name: 'School Gate', time: '7:20 AM', order: 3 }
      ],
      departureTime: '6:50 AM', arrivalTime: '7:25 AM',
      students: [createdStudents[0]._id], school: school._id
    },
    {
      routeName: 'Route 2 — Nandurbar Town', routeNumber: 'TFS-R02',
      vehicleNumber: 'MH-20 CD 5678', vehicleType: 'van', capacity: 15,
      driver: { name: 'Suresh Gavit', phone: '9700000002', licenseNumber: 'MH20-20190054321' },
      stops: [
        { name: 'Station Road', time: '7:15 AM', order: 1 },
        { name: 'Market Chowk', time: '7:22 AM', order: 2 }
      ],
      departureTime: '7:10 AM', arrivalTime: '7:30 AM',
      students: [], school: school._id
    },
  ]);

  console.log('🔔 Creating notifications...');
  await Notification.insertMany([
    {
      title: 'Annual Sports Day — March 28',
      message: 'The Annual Sports Day will be held on March 28, 2026. All students are requested to participate enthusiastically. Students should report by 8:00 AM in their house colours.',
      type: 'event', priority: 'normal', audience: 'all', sentBy: admin._id, school: school._id
    },
    {
      title: 'Fee Payment Reminder — March Due',
      message: 'March 2026 fees are due by March 20, 2026. Late payment will attract a penalty. Please pay at the fee counter or via the online portal.',
      type: 'reminder', priority: 'high', audience: 'parents', sentBy: accountant._id, school: school._id
    },
    {
      title: 'PTM Scheduled — April 5',
      message: 'Parent-Teacher Meeting is scheduled for April 5, 2026 from 10 AM to 1 PM. Parents are requested to attend and meet all subject teachers.',
      type: 'announcement', priority: 'normal', audience: 'parents', sentBy: admin._id, school: school._id
    },
    {
      title: 'Admissions Open — LKG, UKG & Class 1',
      message: 'Admissions are now open for LKG, UKG and Class 1 for the academic year 2026-27. Contact the school office or fill the online form.',
      type: 'announcement', priority: 'high', audience: 'all', sentBy: admin._id, school: school._id
    },
  ]);

  console.log('\n✅ The Future Step School — Database seeded successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('🏫 School: The Future Step School, Bhaler, Nandurbar');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test Accounts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Super Admin  : superadmin@school.com  / Admin@123');
  console.log('School Admin : admin@school.com       / Admin@123');
  console.log('Teacher      : teacher@school.com     / Teacher@123');
  console.log('Student      : student@school.com     / Student@123');
  console.log('Parent       : parent@school.com      / Parent@123');
  console.log('Accountant   : accountant@school.com  / Admin@123');
  console.log('Librarian    : librarian@school.com   / Admin@123');
  console.log('Transport    : transport@school.com   / Admin@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
};

seed().catch(err => { console.error('❌ Seed error:', err); process.exit(1); });