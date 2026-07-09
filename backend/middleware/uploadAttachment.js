// Shared Cloudinary uploader for homework/assignment attachments.
// Mirrors the config already used by expenses. Supports images + PDFs.
let upload;
try {
  const cloudinary = require('cloudinary').v2;
  const multer = require('multer');
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder: 'school-homework',
      resource_type: 'auto',          // supports pdf + images
      allowed_formats: ['jpg', 'jpeg', 'png', 'pdf', 'webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images (jpg/png/webp) and PDFs are allowed'));
    },
  });
} catch (err) {
  console.warn('⚠️  Cloudinary/multer not configured — homework upload disabled:', err.message);
  upload = { single: () => (req, _res, next) => next(), array: () => (req, _res, next) => next() };
}

module.exports = upload;