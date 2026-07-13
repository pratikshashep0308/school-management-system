// Local disk uploader for homework/assignment attachments.
// Files are saved to  <project>/backend/uploads/  and served by nginx at  /uploads/<file>
// No third-party service, no API keys — everything stays on your own server.

const path   = require('path');
const fs     = require('fs');
const multer = require('multer');

// Where files land on disk. Created automatically if missing.
const UPLOAD_DIR = path.join(__dirname, '..', 'uploads');
if (!fs.existsSync(UPLOAD_DIR)) {
  fs.mkdirSync(UPLOAD_DIR, { recursive: true });
}

const storage = multer.diskStorage({
  destination: (_req, _file, cb) => cb(null, UPLOAD_DIR),
  filename: (_req, file, cb) => {
    // Unique, safe filename: <timestamp>-<random>-<original name>
    const ext  = path.extname(file.originalname || '').toLowerCase();
    const base = path
      .basename(file.originalname || 'file', ext)
      .replace(/[^a-zA-Z0-9._-]/g, '_')   // strip anything unsafe
      .slice(0, 40);
    const unique = `${Date.now()}-${Math.round(Math.random() * 1e6)}`;
    cb(null, `${unique}-${base}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },   // 10 MB per file
  fileFilter: (_req, file, cb) => {
    const allowed = [
      'image/jpeg', 'image/jpg', 'image/png', 'image/webp', 'image/gif',
      'application/pdf',
    ];
    if (allowed.includes(file.mimetype)) cb(null, true);
    else cb(new Error('Only images (jpg/png/webp/gif) and PDFs are allowed'));
  },
});

// Export the multer instance plus the public URL helper, so routes can build
// the URL that the browser will use to fetch the file back.
module.exports = upload;
module.exports.UPLOAD_DIR = UPLOAD_DIR;
module.exports.publicUrl  = (filename) => `/uploads/${filename}`;