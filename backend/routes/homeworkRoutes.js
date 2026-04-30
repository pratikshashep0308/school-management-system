const router   = require('express').Router();
const Homework = require('../models/Homework');
const { protect, authorize } = require('../middleware/auth');

const STAFF = ['superAdmin','schoolAdmin','teacher'];
const ALL   = ['superAdmin','schoolAdmin','teacher','student','parent'];

router.use(protect);

// GET all - accessible by all roles
router.get('/', authorize(...ALL), async (req, res) => {
  try {
    const filter = { school: req.user.school };

    // Date filter
    if (req.query.date) {
      const d = new Date(req.query.date);
      const start = new Date(d); start.setHours(0,0,0,0);
      const end   = new Date(d); end.setHours(23,59,59,999);
      filter.assignedDate = { $gte: start, $lte: end };
    }
    if (req.query.class)   filter.class   = req.query.class;
    if (req.query.subject) filter.subject = req.query.subject;
    if (req.query.teacher) filter.teacher = req.query.teacher;

    // Students see only their class homework
    if (req.user.role === 'student') {
      const Student = require('../models/Student');
      const student = await Student.findOne({ user: req.user._id, school: req.user.school });
      if (student?.class) filter.class = student.class;
    }

    // Parents see their child's class homework
    if (req.user.role === 'parent') {
      const Student = require('../models/Student');
      const child = await Student.findOne({ parentEmail: req.user.email, school: req.user.school });
      if (child?.class) filter.class = child.class;
    }

    const hw = await Homework.find(filter)
      .populate('class',   'name section')
      .populate('subject', 'name')
      .populate({ path:'teacher', populate:{ path:'user', select:'name' } })
      .sort({ assignedDate: -1 });

    res.json({ success:true, data:hw });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// POST create - staff only
router.post('/', authorize(...STAFF), async (req, res) => {
  try {
    // Auto-attach teacher if logged in as teacher
    let teacherId = req.body.teacher;
    if (!teacherId && req.user.role === 'teacher') {
      const Teacher = require('../models/Teacher');
      const t = await Teacher.findOne({ user: req.user._id });
      if (t) teacherId = t._id;
    }
    const hw = await Homework.create({
      ...req.body,
      teacher: teacherId || undefined,
      school:  req.user.school,
    });
    const populated = await Homework.findById(hw._id)
      .populate('class','name section')
      .populate('subject','name')
      .populate({ path:'teacher', populate:{ path:'user', select:'name' } });
    res.json({ success:true, data:populated });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// PUT update
router.put('/:id', authorize(...STAFF), async (req, res) => {
  try {
    const hw = await Homework.findOneAndUpdate(
      { _id:req.params.id, school:req.user.school }, req.body, { new:true }
    ).populate('class','name section').populate('subject','name');
    if (!hw) return res.status(404).json({ success:false, message:'Not found' });
    res.json({ success:true, data:hw });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// DELETE
router.delete('/:id', authorize(...STAFF), async (req, res) => {
  try {
    await Homework.findOneAndDelete({ _id:req.params.id, school:req.user.school });
    res.json({ success:true });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;