const express  = require('express');
const router   = express.Router();
const School   = require('../models/School');
const { protect, authorize } = require('../middleware/auth');

const ADMIN = ['superAdmin', 'schoolAdmin'];

// GET school info
router.get('/', protect, async (req, res) => {
  try {
    const school = await School.findById(req.user.school);
    if (!school) return res.status(404).json({ success:false, message:'School not found' });
    res.json({ success:true, data:school });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

// PUT update school settings
router.put('/', protect, authorize(...ADMIN), async (req, res) => {
  try {
    const allowed = ['name','address','phone','email','logo','website','principalName','establishedYear','board','academicYear'];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const school = await School.findByIdAndUpdate(req.user.school, update, { new:true, runValidators:true });
    res.json({ success:true, data:school });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;