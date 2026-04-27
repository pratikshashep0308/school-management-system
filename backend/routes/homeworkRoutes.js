const router   = require('express').Router();
const Homework = require('../models/Homework');
const { protect, authorize } = require('../middleware/auth');

const STAFF = ['superAdmin','schoolAdmin','teacher'];

router.use(protect);

// GET all
router.get('/', async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.class)   filter.class   = req.query.class;
    if (req.query.subject) filter.subject = req.query.subject;
    const hw = await Homework.find(filter)
      .populate('class',   'name section')
      .populate('subject', 'name')
      .populate({ path:'teacher', populate:{ path:'user', select:'name' } })
      .sort({ dueDate: 1 });
    res.json({ success:true, data:hw });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// POST create
router.post('/', authorize(...STAFF), async (req, res) => {
  try {
    const hw = await Homework.create({ ...req.body, school: req.user.school });
    const populated = await hw.populate(['class','subject']);
    res.json({ success:true, data:populated });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// PUT update
router.put('/:id', authorize(...STAFF), async (req, res) => {
  try {
    const hw = await Homework.findOneAndUpdate({ _id:req.params.id, school:req.user.school }, req.body, { new:true })
      .populate('class','name section').populate('subject','name');
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