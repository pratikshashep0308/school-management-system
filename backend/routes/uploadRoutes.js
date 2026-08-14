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

      // Build an absolute URL for the uploaded file.
      // Prefer PUBLIC_URL (set to the public https domain in production) so the
      // link is always correct when shared outside the app (e.g. WhatsApp).
      // Fall back to the forwarded host/proto that nginx passes through.
      const proto = process.env.PUBLIC_URL
        ? null
        : (req.get('x-forwarded-proto') || req.protocol);
      const host = req.get('x-forwarded-host') || req.get('host');
      const base = process.env.PUBLIC_URL || `${proto}://${host}`;
      const url = `${base.replace(/\/$/, '')}/uploads/${req.file.filename}`;

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