// backend/routes/classFeeTemplateRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/classFeeTemplateController');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin', 'accountant'];

router.get('/',                authorize(...ADMIN), ctrl.listTemplates);
router.get('/:classId',        authorize(...ADMIN), ctrl.getTemplateByClass);
router.post('/',               authorize(...ADMIN), ctrl.upsertTemplate);
router.delete('/:classId',     authorize(...ADMIN), ctrl.deleteTemplate);
router.post('/:classId/apply', authorize(...ADMIN), ctrl.applyToStudents);

module.exports = router;