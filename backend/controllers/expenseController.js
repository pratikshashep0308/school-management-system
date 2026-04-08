// backend/controllers/expenseController.js
const path    = require('path');
const { Expense, ExpenseCategory } = require('../models/Expense');
const {
  getDashboardAnalytics,
  getMonthlyReport,
  checkBudgetAlerts,
  buildExcelReport,
  buildPDFReport,
} = require('../services/expenseService');

// ── Cloudinary upload (already configured in the project) ─────────────────────
let cloudinary, upload;
try {
  cloudinary = require('cloudinary').v2;
  const multer = require('multer');
  const { CloudinaryStorage } = require('multer-storage-cloudinary');

  const storage = new CloudinaryStorage({
    cloudinary,
    params: {
      folder:    'school-expenses',
      resource_type: 'auto',          // supports pdf + images
      allowed_formats: ['jpg','jpeg','png','pdf','webp'],
      transformation: [{ quality: 'auto', fetch_format: 'auto' }],
    },
  });

  upload = multer({
    storage,
    limits: { fileSize: 5 * 1024 * 1024 }, // 5 MB max
    fileFilter: (_req, file, cb) => {
      const allowed = ['image/jpeg','image/png','image/webp','application/pdf'];
      if (allowed.includes(file.mimetype)) cb(null, true);
      else cb(new Error('Only images (jpg/png/webp) and PDFs are allowed'));
    },
  });
} catch (err) {
  console.warn('⚠️  Cloudinary/multer not configured — file upload disabled:', err.message);
  upload = { single: () => (req, _res, next) => next() };
}

exports.upload = upload;

// ─── CATEGORIES ───────────────────────────────────────────────────────────────

// GET /api/expenses/categories
exports.getCategories = async (req, res) => {
  const cats = await ExpenseCategory.find({ school: req.user.school, isActive: true })
    .sort({ name: 1 });
  res.json({ success: true, data: cats });
};

// POST /api/expenses/categories
exports.createCategory = async (req, res) => {
  const { name, description, color, icon } = req.body;
  if (!name) return res.status(400).json({ success: false, message: 'name is required' });

  const existing = await ExpenseCategory.findOne({ school: req.user.school, name: name.trim() });
  if (existing) return res.status(409).json({ success: false, message: `Category "${name}" already exists` });

  const cat = await ExpenseCategory.create({
    name: name.trim(), description, color: color || '#6B7280',
    icon: icon || '💰', school: req.user.school, createdBy: req.user._id,
  });
  res.status(201).json({ success: true, data: cat });
};

// PUT /api/expenses/categories/:id
exports.updateCategory = async (req, res) => {
  const cat = await ExpenseCategory.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    { ...req.body, updatedAt: Date.now() },
    { new: true }
  );
  if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });
  res.json({ success: true, data: cat });
};

// DELETE /api/expenses/categories/:id
exports.deleteCategory = async (req, res) => {
  // Soft delete — check if any expenses use this category
  const count = await Expense.countDocuments({ category: req.params.id, school: req.user.school });
  if (count > 0) {
    // Soft-delete: mark inactive instead of hard delete
    await ExpenseCategory.findByIdAndUpdate(req.params.id, { isActive: false });
    return res.json({ success: true, message: `Category deactivated (${count} expense(s) use it)` });
  }
  await ExpenseCategory.findByIdAndDelete(req.params.id);
  res.json({ success: true, message: 'Category deleted' });
};

// ─── EXPENSES ─────────────────────────────────────────────────────────────────

// GET /api/expenses — list with filters
exports.getExpenses = async (req, res) => {
  const {
    category, paymentMethod,
    dateFrom, dateTo,
    month, year,
    page = 1, limit = 50,
    search,
  } = req.query;

  const filter = { school: req.user.school };

  if (category)      filter.category      = category;
  if (paymentMethod) filter.paymentMethod = paymentMethod;
  if (search)        filter.description   = { $regex: search, $options: 'i' };

  if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo)   filter.date.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
  } else if (month && year) {
    filter.date = {
      $gte: new Date(year, month - 1, 1),
      $lte: new Date(year, month, 0, 23, 59, 59),
    };
  }

  const skip  = (parseInt(page) - 1) * parseInt(limit);
  const total = await Expense.countDocuments(filter);

  const expenses = await Expense.find(filter)
    .populate('category', 'name color icon')
    .populate('createdBy', 'name')
    .populate('updatedBy', 'name')
    .sort({ date: -1 })
    .skip(skip)
    .limit(parseInt(limit));

  const grandTotal = await Expense.aggregate([
    { $match: filter },
    { $group: { _id: null, total: { $sum: '$amount' } } },
  ]);

  res.json({
    success: true,
    count:   expenses.length,
    total,
    pages:   Math.ceil(total / parseInt(limit)),
    page:    parseInt(page),
    grandTotal: grandTotal[0]?.total || 0,
    data:    expenses,
  });
};

// GET /api/expenses/:id
exports.getExpense = async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, school: req.user.school })
    .populate('category', 'name color icon description')
    .populate('createdBy', 'name email')
    .populate('updatedBy', 'name')
    .populate('editHistory.editedBy', 'name');
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
  res.json({ success: true, data: expense });
};

// POST /api/expenses — add expense (with optional file upload)
exports.addExpense = async (req, res) => {
  const {
    category, amount, date, description,
    paymentMethod, isRecurring, recurringType,
    recurringDay, budgetLimit,
  } = req.body;

  if (!category)    return res.status(400).json({ success: false, message: 'category is required' });
  if (!amount)      return res.status(400).json({ success: false, message: 'amount is required' });
  if (!description) return res.status(400).json({ success: false, message: 'description is required' });

  // Verify category belongs to this school
  const cat = await ExpenseCategory.findOne({ _id: category, school: req.user.school });
  if (!cat) return res.status(404).json({ success: false, message: 'Category not found' });

  // Cloudinary upload (if file attached)
  let attachmentUrl  = '';
  let attachmentType = '';
  if (req.file) {
    attachmentUrl  = req.file.path || req.file.secure_url || '';
    attachmentType = req.file.mimetype?.includes('pdf') ? 'pdf' : 'image';
  }

  // Recurring: compute first nextDueDate
  let nextDueDate = null;
  if (isRecurring === 'true' || isRecurring === true) {
    const d = new Date(date || new Date());
    if (recurringType === 'monthly') {
      nextDueDate = new Date(d.getFullYear(), d.getMonth() + 1, parseInt(recurringDay) || 1);
    } else if (recurringType === 'weekly') {
      nextDueDate = new Date(d.getTime() + 7 * 24 * 60 * 60 * 1000);
    } else if (recurringType === 'yearly') {
      nextDueDate = new Date(d.getFullYear() + 1, d.getMonth(), d.getDate());
    }
  }

  const expense = await Expense.create({
    category,
    amount:        Number(amount),
    date:          date ? new Date(date) : new Date(),
    description:   description.trim(),
    paymentMethod: paymentMethod || 'cash',
    attachmentUrl,
    attachmentType,
    isRecurring:   isRecurring === 'true' || isRecurring === true,
    recurringType: recurringType || '',
    recurringDay:  parseInt(recurringDay) || 1,
    nextDueDate,
    budgetLimit:   parseInt(budgetLimit) || 0,
    createdBy:     req.user._id,
    school:        req.user.school,
  });

  await expense.populate('category', 'name color icon');

  // Fire-and-forget budget alert check
  checkBudgetAlerts({ ...expense.toObject(), budgetLimit: parseInt(budgetLimit) || 0 }, req.user.school, req.user._id)
    .catch(() => {});

  res.status(201).json({ success: true, data: expense, message: 'Expense added successfully' });
};

// PUT /api/expenses/:id — update expense
exports.updateExpense = async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, school: req.user.school });
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });

  // Store audit trail
  if (req.body.amount && req.body.amount !== expense.amount) {
    expense.editHistory.push({
      editedBy:  req.user._id,
      editedAt:  new Date(),
      oldAmount: expense.amount,
      oldDesc:   expense.description,
      note:      req.body.editNote || '',
    });
  }

  const allowed = ['category','amount','date','description','paymentMethod','budgetLimit'];
  allowed.forEach(k => { if (req.body[k] !== undefined) expense[k] = req.body[k]; });

  if (req.file) {
    expense.attachmentUrl  = req.file.path || req.file.secure_url || '';
    expense.attachmentType = req.file.mimetype?.includes('pdf') ? 'pdf' : 'image';
  }

  expense.updatedBy = req.user._id;
  await expense.save();
  await expense.populate('category', 'name color icon');
  await expense.populate('createdBy', 'name');

  res.json({ success: true, data: expense });
};

// DELETE /api/expenses/:id
exports.deleteExpense = async (req, res) => {
  const expense = await Expense.findOne({ _id: req.params.id, school: req.user.school });
  if (!expense) return res.status(404).json({ success: false, message: 'Expense not found' });
  await expense.deleteOne();
  res.json({ success: true, message: 'Expense deleted' });
};

// ─── DASHBOARD ────────────────────────────────────────────────────────────────

// GET /api/expenses/dashboard
exports.getDashboard = async (req, res) => {
  const data = await getDashboardAnalytics(req.user.school);
  res.json({ success: true, data });
};

// ─── REPORTS ─────────────────────────────────────────────────────────────────

// GET /api/expenses/report?month=&year=
exports.getReport = async (req, res) => {
  const { month = new Date().getMonth() + 1, year = new Date().getFullYear() } = req.query;
  const data = await getMonthlyReport(req.user.school, parseInt(month), parseInt(year));
  res.json({ success: true, data });
};

// GET /api/expenses/export?format=xlsx|pdf&month=&year=&dateFrom=&dateTo=
exports.exportExpenses = async (req, res) => {
  const { format = 'xlsx', month, year, dateFrom, dateTo } = req.query;

  const filter = { school: req.user.school };
  if (month && year) {
    filter.date = {
      $gte: new Date(year, month - 1, 1),
      $lte: new Date(year, month, 0, 23, 59, 59),
    };
  } else if (dateFrom || dateTo) {
    filter.date = {};
    if (dateFrom) filter.date.$gte = new Date(dateFrom);
    if (dateTo)   filter.date.$lte = new Date(new Date(dateTo).setHours(23,59,59,999));
  }

  const expenses = await Expense.find(filter)
    .populate('category', 'name color')
    .populate('createdBy', 'name')
    .sort({ date: -1 })
    .lean();

  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  const meta = {
    title: month && year ? `${MONTHS[month - 1]} ${year}` : (dateFrom ? `${dateFrom} to ${dateTo}` : 'All Time'),
    total: grandTotal,
    month, year,
  };

  if (format === 'xlsx') {
    const buffer = await buildExcelReport(expenses, meta);
    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="expenses-${meta.title.replace(/\s/g,'-')}.xlsx"`);
    return res.send(buffer);
  }

  if (format === 'pdf') {
    return buildPDFReport(res, expenses, meta);
  }

  res.status(400).json({ success: false, message: 'format must be xlsx or pdf' });
};

// ─── INCOME VS EXPENSE ────────────────────────────────────────────────────────

// GET /api/expenses/finance — combined income + expense P&L summary
exports.getFinanceSummary = async (req, res) => {
  const { month, year } = req.query;
  const data = await getDashboardAnalytics(req.user.school);

  let periodExpenses = data.totals.allTime.amount;
  let periodLabel    = 'All Time';

  if (month && year) {
    const report = await getMonthlyReport(req.user.school, parseInt(month), parseInt(year));
    periodExpenses = report.grandTotal;
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    periodLabel = `${MONTHS[month - 1]} ${year}`;
  }

  res.json({
    success: true,
    data: {
      ...data.incomeVsExpense,
      periodExpenses,
      periodLabel,
      categoryBreakdown: data.categoryBreakdown,
      monthlyTrend: data.monthlyTrend,
    },
  });
};

// ─── RECURRING EXPENSE TEMPLATES ─────────────────────────────────────────────

// GET /api/expenses/recurring — list all recurring templates
exports.getRecurring = async (req, res) => {
  const templates = await Expense.find({ school: req.user.school, isRecurring: true })
    .populate('category', 'name color icon')
    .sort({ nextDueDate: 1 });
  res.json({ success: true, data: templates });
};