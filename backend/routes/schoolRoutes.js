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
    const allowed = [
      // Basic
      'name','shortName','schoolCode','udiseCode','affiliationNumber','board','medium','schoolType','establishedYear',
      // Management
      'principalName','vicePrincipal','chairman','trustName','registrationNumber',
      // Contact
      'phone','altMobile','landline','email','website',
      // Address
      'address','area','city','district','state','country','pincode',
      // Branding
      'logo','banner','principalSignature','stamp','favicon',
      // Academic
      'academicYear','currentSession','admissionStartDate','admissionEndDate','workingDays','weeklyOff','timeZone',
      // Identity
      'gstNumber','panNumber','registrationCertNumber','recognitionNumber',
      // Communication
      'smsSenderId','emailSenderName','whatsappNumber','emergencyContact',
      // Regional
      'currency','language','dateFormat','timeFormat',
      // Social
      'facebook','instagram','youtube','linkedin','twitter',
      // Location
      'googleMapsUrl','latitude','longitude',
      // Status
      'status','licenseExpiryDate',
    ];
    const update  = {};
    allowed.forEach(k => { if (req.body[k] !== undefined) update[k] = req.body[k]; });
    const school = await School.findByIdAndUpdate(req.user.school, update, { new:true, runValidators:true });
    res.json({ success:true, data:school });
  } catch(e) { res.status(500).json({ success:false, message:e.message }); }
});

module.exports = router;