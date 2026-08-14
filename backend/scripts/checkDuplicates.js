require('dotenv').config();
const mongoose = require('mongoose');
const Student = require('../models/Student');
const User    = require('../models/User');
require('../models/index');

(async () => {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/school_management');

  const students = await Student.find({ status: 'active' }).lean();

  // Fetch linked user names in one go (avoids populate/model-registration issues)
  const userIds = students.map(s => s.user).filter(Boolean);
  const users = await User.find({ _id: { $in: userIds } }, { name: 1, email: 1 }).lean();
  const userMap = new Map(users.map(u => [String(u._id), u]));

  const nameOf = (s) => userMap.get(String(s.user))?.name || s.name || s.fullName || '';

  const groups = {};
  students.forEach(s => {
    const nm = nameOf(s).toLowerCase().replace(/\s+/g, ' ').trim();
    if (!nm) return;
    (groups[nm] = groups[nm] || []).push(s);
  });

  const dupes = Object.entries(groups).filter(([, list]) => list.length > 1);
  console.log(`\nTotal active students: ${students.length}`);
  console.log(`Names with more than one record: ${dupes.length}\n`);

  dupes.forEach(([nm, list]) => {
    console.log(`── "${nm}" — ${list.length} records`);
    list.forEach(s => {
      console.log(`   _id:       ${s._id}`);
      console.log(`   name:      ${nameOf(s)}`);
      console.log(`   admission: ${s.admissionNumber || '—'}`);
      console.log(`   roll:      ${s.rollNumber || '—'}`);
      console.log(`   classId:   ${s.class || '—'}`);
      console.log(`   father:    ${s.fatherName || '—'}  mother: ${s.motherName || '—'}`);
      console.log(`   dob:       ${s.dateOfBirth ? new Date(s.dateOfBirth).toDateString() : '—'}`);
      console.log(`   phone:     ${s.parentPhone || s.phone || '—'}`);
      console.log(`   created:   ${s.createdAt ? new Date(s.createdAt).toLocaleString() : '—'}`);
      console.log('');
    });
  });

  await mongoose.disconnect();
  process.exit(0);
})();