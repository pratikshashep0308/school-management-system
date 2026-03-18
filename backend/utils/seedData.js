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
    name: 'Delhi Public School', address: 'Sector 45, Gurugram, Haryana',
    phone: '0124-1234567', email: 'info@dps.edu.in',
    principalName: 'Dr. Sunita Sharma', board: 'CBSE', establishedYear: 1985
  });

  console.log('👤 Creating users...');
  const superAdmin = await User.create({ name: 'Super Admin', email: 'superadmin@school.com', password: 'Admin@123', role: 'superAdmin', school: school._id });
  const admin = await User.create({ name: 'School Admin', email: 'admin@school.com', password: 'Admin@123', role: 'schoolAdmin', school: school._id });
  const accountant = await User.create({ name: 'Rahul Verma', email: 'accountant@school.com', password: 'Admin@123', role: 'accountant', school: school._id });
  const librarian = await User.create({ name: 'Sunita Rao', email: 'librarian@school.com', password: 'Admin@123', role: 'librarian', school: school._id });
  const transport = await User.create({ name: 'Mohan Das', email: 'transport@school.com', password: 'Admin@123', role: 'transportManager', school: school._id });

  console.log('📚 Creating subjects...');
  const subjects = await Subject.insertMany([
    { name: 'Mathematics', code: 'MATH', type: 'both', school: school._id },
    { name: 'Physics', code: 'PHY', type: 'both', school: school._id },
    { name: 'Chemistry', code: 'CHEM', type: 'both', school: school._id },
    { name: 'Biology', code: 'BIO', type: 'both', school: school._id },
    { name: 'English', code: 'ENG', type: 'theory', school: school._id },
    { name: 'History', code: 'HIST', type: 'theory', school: school._id },
    { name: 'Computer Science', code: 'CS', type: 'both', school: school._id },
  ]);

  console.log('🎓 Creating teachers...');
  const teacherUsers = await User.insertMany([
    { name: 'Mr. Rajesh Sharma', email: 'teacher@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543210', school: school._id },
    { name: 'Dr. Meena Patel', email: 'meena.patel@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543211', school: school._id },
    { name: 'Ms. Lakshmi Iyer', email: 'lakshmi.iyer@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543212', school: school._id },
    { name: 'Mr. Anand Kumar', email: 'anand.kumar@school.com', password: 'Teacher@123', role: 'teacher', phone: '9876543213', school: school._id },
  ]);

  const teachers = await Teacher.insertMany([
    { user: teacherUsers[0]._id, employeeId: 'EMP-001', subjects: [subjects[0]._id], qualification: 'M.Sc Mathematics', experience: 12, school: school._id },
    { user: teacherUsers[1]._id, employeeId: 'EMP-002', subjects: [subjects[1]._id], qualification: 'Ph.D Physics', experience: 15, school: school._id },
    { user: teacherUsers[2]._id, employeeId: 'EMP-003', subjects: [subjects[4]._id], qualification: 'M.A English', experience: 8, school: school._id },
    { user: teacherUsers[3]._id, employeeId: 'EMP-004', subjects: [subjects[2]._id], qualification: 'M.Sc Chemistry', experience: 10, school: school._id },
  ]);

  console.log('🏛 Creating classes...');
  const classes = await Class.insertMany([
    { name: 'Class X', grade: 10, section: 'A', classTeacher: teachers[0]._id, subjects: subjects.slice(0, 5).map(s => s._id), capacity: 40, room: '101', school: school._id },
    { name: 'Class X', grade: 10, section: 'B', classTeacher: teachers[1]._id, subjects: subjects.slice(0, 5).map(s => s._id), capacity: 40, room: '102', school: school._id },
    { name: 'Class IX', grade: 9, section: 'A', classTeacher: teachers[2]._id, subjects: subjects.slice(0, 5).map(s => s._id), capacity: 40, room: '201', school: school._id },
    { name: 'Class XI', grade: 11, section: 'Science', classTeacher: teachers[3]._id, subjects: subjects.slice(0, 4).map(s => s._id), capacity: 35, room: '301', school: school._id },
  ]);

  // Update teacher classTeacherOf
  await Teacher.findByIdAndUpdate(teachers[0]._id, { classTeacherOf: classes[0]._id, classes: [classes[0]._id, classes[1]._id] });
  await Teacher.findByIdAndUpdate(teachers[1]._id, { classTeacherOf: classes[1]._id, classes: [classes[1]._id, classes[3]._id] });
  await Teacher.findByIdAndUpdate(teachers[2]._id, { classTeacherOf: classes[2]._id, classes: [classes[0]._id, classes[2]._id] });
  await Teacher.findByIdAndUpdate(teachers[3]._id, { classTeacherOf: classes[3]._id, classes: [classes[1]._id, classes[3]._id] });

  console.log('👨‍🎓 Creating students...');
  const studentData = [
    { name: 'Aryan Mehta', email: 'student@school.com', admNum: 'STU-2024-001', roll: '01', class: classes[0]._id, gender: 'male', dob: '2008-05-15', parentName: 'Ramesh Mehta', parentPhone: '9800000001' },
    { name: 'Priya Nair', email: 'priya.nair@school.com', admNum: 'STU-2024-002', roll: '02', class: classes[0]._id, gender: 'female', dob: '2008-07-20', parentName: 'Suresh Nair', parentPhone: '9800000002' },
    { name: 'Rohan Das', email: 'rohan.das@school.com', admNum: 'STU-2024-003', roll: '03', class: classes[1]._id, gender: 'male', dob: '2008-03-10', parentName: 'Bikash Das', parentPhone: '9800000003' },
    { name: 'Sneha Joshi', email: 'sneha.joshi@school.com', admNum: 'STU-2024-004', roll: '04', class: classes[2]._id, gender: 'female', dob: '2009-11-25', parentName: 'Vijay Joshi', parentPhone: '9800000004' },
    { name: 'Vikram Singh', email: 'vikram.singh@school.com', admNum: 'STU-2024-005', roll: '05', class: classes[3]._id, gender: 'male', dob: '2007-08-30', parentName: 'Gurpreet Singh', parentPhone: '9800000005' },
    { name: 'Ananya Sharma', email: 'ananya.sharma@school.com', admNum: 'STU-2024-006', roll: '06', class: classes[0]._id, gender: 'female', dob: '2008-01-14', parentName: 'Anil Sharma', parentPhone: '9800000006' },
  ];

  const parentUser = await User.create({ name: 'Ramesh Mehta', email: 'parent@school.com', password: 'Parent@123', role: 'parent', phone: '9800000001', school: school._id });

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
    { name: 'Unit Test I', class: classes[0]._id, subject: subjects[0]._id, date: new Date('2026-03-18'), totalMarks: 50, passingMarks: 18, examType: 'unit', school: school._id, createdBy: admin._id },
    { name: 'Midterm Examination', class: classes[3]._id, subject: subjects[1]._id, date: new Date('2026-04-02'), totalMarks: 100, passingMarks: 35, examType: 'midterm', school: school._id, createdBy: admin._id },
    { name: 'Practical Assessment', class: classes[3]._id, subject: subjects[2]._id, date: new Date('2026-03-25'), totalMarks: 30, passingMarks: 10, examType: 'practical', school: school._id, createdBy: admin._id },
    { name: 'Annual Examination', class: classes[0]._id, subject: subjects[4]._id, date: new Date('2026-05-01'), totalMarks: 100, passingMarks: 35, examType: 'final', school: school._id, createdBy: admin._id },
  ]);

  console.log('💰 Creating fee payments...');
  await FeePayment.insertMany([
    { student: createdStudents[0]._id, amount: 12500, method: 'online', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id },
    { student: createdStudents[1]._id, amount: 12500, method: 'cash', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id },
    { student: createdStudents[2]._id, amount: 12500, method: 'bank', status: 'pending', month: 'February 2026', year: 2026, school: school._id, collectedBy: accountant._id },
    { student: createdStudents[3]._id, amount: 10000, method: 'cash', status: 'overdue', month: 'January 2026', year: 2026, school: school._id, collectedBy: accountant._id },
    { student: createdStudents[4]._id, amount: 15000, method: 'cheque', status: 'paid', month: 'March 2026', year: 2026, school: school._id, collectedBy: accountant._id },
  ]);

  console.log('📚 Creating library books...');
  await Book.insertMany([
    { title: 'Concepts of Physics Vol. 1', author: 'H.C. Verma', isbn: '978-81-89400-00-1', category: 'Science', totalCopies: 10, availableCopies: 7, school: school._id },
    { title: 'Mathematics for Class XII', author: 'R.D. Sharma', isbn: '978-93-5116-000-2', category: 'Mathematics', totalCopies: 12, availableCopies: 9, school: school._id },
    { title: 'English Literature Anthology', author: 'Various Authors', isbn: '978-0-19-000000-3', category: 'Literature', totalCopies: 8, availableCopies: 6, school: school._id },
    { title: 'Modern History of India', author: 'Bipan Chandra', isbn: '978-81-250-000-4', category: 'History', totalCopies: 6, availableCopies: 4, school: school._id },
    { title: 'NCERT Biology Class XI', author: 'NCERT', isbn: '978-81-7450-000-5', category: 'Science', totalCopies: 15, availableCopies: 12, school: school._id },
    { title: 'Computer Science with Python', author: 'Sumita Arora', isbn: '978-81-7650-000-6', category: 'Computer', totalCopies: 8, availableCopies: 5, school: school._id },
  ]);

  console.log('🚌 Creating transport routes...');
  await Transport.insertMany([
    { routeName: 'Route 1 — Sector 45', routeNumber: 'R01', vehicleNumber: 'HR26 AB 1234', vehicleType: 'bus', capacity: 40, driver: { name: 'Prakash Yadav', phone: '9700000001', licenseNumber: 'HR01-20100012345' }, stops: [{ name: 'Sector 45 Gate', time: '7:15 AM', order: 1 }, { name: 'Sector 46 Chowk', time: '7:20 AM', order: 2 }, { name: 'HUDA City Centre', time: '7:30 AM', order: 3 }], departureTime: '7:00 AM', arrivalTime: '8:00 AM', students: [createdStudents[0]._id], school: school._id },
    { routeName: 'Route 2 — Sector 56', routeNumber: 'R02', vehicleNumber: 'HR26 CD 5678', vehicleType: 'bus', capacity: 35, driver: { name: 'Suresh Patil', phone: '9700000002', licenseNumber: 'HR01-20100054321' }, stops: [{ name: 'Sector 56 Market', time: '7:30 AM', order: 1 }, { name: 'Golf Course Road', time: '7:40 AM', order: 2 }], departureTime: '7:15 AM', arrivalTime: '8:10 AM', students: [], school: school._id },
  ]);

  console.log('🔔 Creating notifications...');
  await Notification.insertMany([
    { title: 'Annual Sports Day — March 28', message: 'The Annual Sports Day will be held on March 28, 2026. All students are requested to participate enthusiastically. Venue: School Grounds. Students should report by 8:00 AM in their house colours.', type: 'event', priority: 'normal', audience: 'all', sentBy: admin._id, school: school._id },
    { title: 'Fee Payment Reminder — March Due', message: 'This is a reminder that March 2026 fees are due by March 20, 2026. Late payment will attract a penalty of ₹200 per week. Please pay at the fee counter or via the online portal.', type: 'reminder', priority: 'high', audience: 'parents', sentBy: accountant._id, school: school._id },
    { title: 'PTM Scheduled — April 5', message: 'Parent-Teacher Meeting is scheduled for April 5, 2026 from 10 AM to 1 PM. Parents are requested to attend and meet all subject teachers. Advance intimation required for specific queries.', type: 'announcement', priority: 'normal', audience: 'parents', sentBy: admin._id, school: school._id },
    { title: 'Unit Test Schedule Released', message: 'Unit Test I schedule has been released. Tests begin from March 18, 2026. Students are advised to prepare thoroughly and check the detailed schedule on the notice board.', type: 'announcement', priority: 'normal', audience: 'students', sentBy: admin._id, school: school._id },
  ]);

  console.log('\n✅ Database seeded successfully!\n');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('📋 Test Accounts:');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');
  console.log('Super Admin  : superadmin@school.com  / Admin@123');
  console.log('School Admin : admin@school.com       / Admin@123');
  console.log('Teacher      : teacher@school.com     / Teacher@123');
  console.log('Student      : student@school.com     / Student@123');
  console.log('Parent       : parent@school.com      / Parent@123');
  console.log('Accountant   : accountant@school.com  / Admin@123');
  console.log('Librarian    : librarian@school.com   / Admin@123');
  console.log('Transport    : transport@school.com   / Admin@123');
  console.log('━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━');

  process.exit(0);
};

seed().catch(err => { console.error('❌ Seed error:', err); process.exit(1); });
