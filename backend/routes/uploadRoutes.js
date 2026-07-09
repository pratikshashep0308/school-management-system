const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/uploadAttachment');

router.use(protect);

// POST /api/uploads/attachment  (staff only) — single image/PDF
// Returns { name, url } for storing on a homework/assignment.
router.post(
  '/attachment',
  authorize('superAdmin', 'schoolAdmin', 'teacher'),
  (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) return res.status(400).json({ success: false, message: err.message });
      if (!req.file) return res.status(400).json({ success: false, message: 'No file uploaded' });
      res.status(201).json({
        success: true,
        data: {
          name: req.file.originalname || 'attachment',
          url:  req.file.path || req.file.secure_url || req.file.url,
        },
      });
    });
  }
);

module.exports = router;