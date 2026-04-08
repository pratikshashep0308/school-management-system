// backend/routes/expenseRoutes.js
const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const ctrl = require('../controllers/expenseController');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin', 'accountant'];

// ── Named routes FIRST (before /:id) ─────────────────────────────────────────

// Dashboard & analytics
router.get('/dashboard',  authorize(...ADMIN), ctrl.getDashboard);
router.get('/finance',    authorize(...ADMIN), ctrl.getFinanceSummary);
router.get('/report',     authorize(...ADMIN), ctrl.getReport);
router.get('/export',     authorize(...ADMIN), ctrl.exportExpenses);
router.get('/recurring',  authorize(...ADMIN), ctrl.getRecurring);

// Categories
router.get('/categories',        ctrl.getCategories);
router.post('/categories',       authorize(...ADMIN), ctrl.createCategory);
router.put('/categories/:id',    authorize(...ADMIN), ctrl.updateCategory);
router.delete('/categories/:id', authorize(...ADMIN), ctrl.deleteCategory);

// Expenses list + create
router.get('/',   ctrl.getExpenses);
router.post('/',  authorize(...ADMIN),
  ctrl.upload.single('attachment'),   // optional file upload
  ctrl.addExpense
);

// Single expense — /:id LAST
router.get   ('/:id', ctrl.getExpense);
router.put   ('/:id', authorize(...ADMIN), ctrl.upload.single('attachment'), ctrl.updateExpense);
router.delete('/:id', authorize(...ADMIN), ctrl.deleteExpense);

module.exports = router;