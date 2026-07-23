// backend/scripts/seedExamSetup.js
// One-time setup: creates the standard exam types and a default grading scheme
// for a school. Safe to re-run — it skips anything that already exists.
require('dotenv').config();
const mongoose = require('mongoose');
const { ExamType, GradingScheme } = require('../models/examModels');
require('../models/index');

const TYPES = [
  { name: 'Unit Test',      code: 'UT',   weightage: 10 },
  { name: 'Weekly Test',    code: 'WT',   weightage: 5  },
  { name: 'Monthly Test',   code: 'MT',   weightage: 10 },
  { name: 'Quarterly Exam', code: 'QE',   weightage: 20 },
  { name: 'Half Yearly',    code: 'HY',   weightage: 25 },
  { name: 'Annual Exam',    code: 'AE',   weightage: 40 },
  { name: 'Prelim Exam',    code: 'PRE',  weightage: 15 },
  { name: 'Practical Exam', code: 'PRAC', weightage: 10 },
  { name: 'Oral Exam',      code: 'ORAL', weightage: 5  },
];

const DEFAULT_BANDS = [
  { grade: 'A+', minPercent: 91, maxPercent: 100,   gradePoint: 10, remark: 'Outstanding',    isFail: false },
  { grade: 'A',  minPercent: 81, maxPercent: 90.99, gradePoint: 9,  remark: 'Excellent',      isFail: false },
  { grade: 'B+', minPercent: 71, maxPercent: 80.99, gradePoint: 8,  remark: 'Very Good',      isFail: false },
  { grade: 'B',  minPercent: 61, maxPercent: 70.99, gradePoint: 7,  remark: 'Good',           isFail: false },
  { grade: 'C+', minPercent: 51, maxPercent: 60.99, gradePoint: 6,  remark: 'Above Average',  isFail: false },
  { grade: 'C',  minPercent: 41, maxPercent: 50.99, gradePoint: 5,  remark: 'Average',        isFail: false },
  { grade: 'D',  minPercent: 35, maxPercent: 40.99, gradePoint: 4,  remark: 'Needs Improvement', isFail: false },
  { grade: 'F',  minPercent: 0,  maxPercent: 34.99, gradePoint: 0,  remark: 'Fail',           isFail: true  },
];

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/school_management');

    // Find the school to seed for
    const School = mongoose.model('School');
    const school = await School.findOne({});
    if (!school) { console.log('No school found — nothing to seed.'); process.exit(1); }
    console.log('Seeding exam setup for:', school.name || school._id);

    let created = 0, skipped = 0;
    for (const t of TYPES) {
      const exists = await ExamType.findOne({ school: school._id, name: t.name });
      if (exists) { skipped++; continue; }
      await ExamType.create({ ...t, school: school._id });
      created++;
    }
    console.log(`Exam types  → created ${created}, already present ${skipped}`);

    const schemeName = 'Standard Grading (A+ to F)';
    const existing = await GradingScheme.findOne({ school: school._id, name: schemeName });
    if (existing) {
      console.log('Grading scheme → already present');
    } else {
      await GradingScheme.create({
        name: schemeName, mode: 'grade', bands: DEFAULT_BANDS,
        passMark: 35, isDefault: true, school: school._id,
      });
      console.log('Grading scheme → created (set as default)');
    }

    console.log('\nDone.');
    await mongoose.disconnect();
    process.exit(0);
  } catch (e) {
    console.error('Seed failed:', e.message);
    process.exit(1);
  }
})();