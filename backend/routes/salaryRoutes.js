const express    = require('express');
const router     = express.Router();
const auth       = require('../middleware/auth');

const ADMIN = ['superAdmin', 'schoolAdmin', 'accountant'];

// Lazy load controller to avoid require-time errors
function ctrl() { return require('../controllers/salaryController'); }

router.get   ('/',      auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().getAll(req,res));
router.post  ('/',      auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().pay(req,res));
router.get   ('/sheet', auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().getSalarySheet(req,res));
router.get   ('/:id',   auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().getOne(req,res));
router.put   ('/:id',   auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().update(req,res));
router.delete('/:id',   auth.protect, auth.authorize(...ADMIN), (req,res) => ctrl().remove(req,res));

module.exports = router;