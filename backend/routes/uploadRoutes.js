const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const upload = require('../middleware/uploadAttachment');

router.use(protect);

// POST /api/uploads/attachment  (staff only) — single image/PDF
// Saves to the server's uploads folder and returns { name, url }.
// The URL is absolute so it works in WhatsApp shares and mobile apps too.
router.post(
  '/attachment',
  authorize('superAdmin', 'schoolAdmin', 'teacher'),
  (req, res) => {
    upload.single('file')(req, res, (err) => {
      if (err) {
        return res.status(400).json({ success: false, message: err.message });
      }
      if (!req.file) {
        return res.status(400).json({ success: false, message: 'No file uploaded' });
      }

      // Build an absolute URL (e.g. http://80.225.252.56/uploads/123-diagram.jpg)
      // so the link works when shared outside the app.
      const base = process.env.PUBLIC_URL
        || `${req.protocol}://${req.get('host')}`;
      const url = `${base}/uploads/${req.file.filename}`;

      res.status(201).json({
        success: true,
        data: {
          name: req.file.originalname || 'attachment',
          url,
        },
      });
    });
  }
);

module.exports = router;