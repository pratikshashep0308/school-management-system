// backend/routes/studentRoutes.js — Enhanced
const express = require('express');
const router  = express.Router();
const {
  getStudents, getStudent, createStudent, updateStudent, deleteStudent,
  getMyProfile, getStudentStats, linkParent, resetStudentPassword, resetParentPassword, seedTestStudent,
} = require('../controllers/studentController');
const { protect, authorize } = require('../middleware/auth');

router.use(protect);

// POST /api/students/assign-roll-numbers  — admin: number a class's students 1,2,3…
// body: { classId }  → assigns roll numbers by admission order (oldest first)
router.post('/assign-roll-numbers', authorize('superAdmin', 'schoolAdmin'), async (req, res) => {
  try {
    const Student = require('../models/Student');
    const { classId } = req.body;

    // If a specific class is given, number just that class.
    // If not, number every class in the school separately (each starts at 1).
    let classIds;
    if (classId) {
      classIds = [classId];
    } else {
      const distinct = await Student.distinct('class', { school: req.user.school });
      classIds = distinct.filter(Boolean);
    }

    if (!classIds.length) {
      return res.status(404).json({ success: false, message: 'No students found' });
    }

    let total = 0;
    let filled = 0;
    for (const cid of classIds) {
      const students = await Student.find({ class: cid, school: req.user.school })
        .sort({ createdAt: 1, _id: 1 })
        .select('_id rollNumber');

      // Find the highest roll number already used in this class, so new ones continue after it.
      let maxUsed = 0;
      for (const st of students) {
        const num = parseInt(st.rollNumber, 10);
        if (!isNaN(num) && num > maxUsed) maxUsed = num;
      }

      // Assign only to students with a blank/missing roll number.
      // Use updateOne (not save) so we only touch rollNumber and don't trip
      // validation on other (possibly incomplete) fields.
      let n = maxUsed + 1;
      for (const st of students) {
        total++;
        const hasRoll = st.rollNumber && String(st.rollNumber).trim() !== '';
        if (hasRoll) continue; // keep existing
        await Student.updateOne({ _id: st._id }, { $set: { rollNumber: String(n) } });
        n++;
        filled++;
      }
    }

    res.json({
      success: true,
      message: `Filled roll numbers for ${filled} student(s) without one (existing roll numbers kept), across ${classIds.length} class(es)`,
      count: filled,
    });
  } catch (e) {
    res.status(500).json({ success: false, message: e.message });
  }
});

// Student views own profile
router.get('/my-profile', getMyProfile);

// Admin/teacher routes
router.get('/',     authorize('superAdmin','schoolAdmin','teacher','accountant'), getStudents);
router.get('/:id',  getStudent);
router.get('/:id/stats', getStudentStats);
router.post('/:id/link-parent', authorize('superAdmin', 'schoolAdmin'), linkParent);
router.post('/',    authorize('superAdmin','schoolAdmin'), createStudent);
router.put('/:id',  authorize('superAdmin','schoolAdmin'), updateStudent);
router.delete('/:id', authorize('superAdmin','schoolAdmin'), deleteStudent);
router.put('/:id/reset-password',         authorize('superAdmin','schoolAdmin'), resetStudentPassword);
router.put('/:id/reset-parent-password',  authorize('superAdmin','schoolAdmin'), resetParentPassword);
router.post('/seed-test', authorize('superAdmin','schoolAdmin'), seedTestStudent);

module.exports = router;