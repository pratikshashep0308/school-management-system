// backend/services/expenseService.js
// Analytics engine, recurring expense cron, export helpers, alert system

const mongoose = require('mongoose');

function toId(id) {
  try { return new mongoose.Types.ObjectId(id); } catch { return null; }
}

// ─── ANALYTICS ───────────────────────────────────────────────────────────────

/**
 * getDashboardAnalytics
 * Returns all stats needed for the expenses dashboard:
 * - totals (all time, this month, today)
 * - category breakdown
 * - monthly trend (last 6 months)
 * - income vs expense (from StudentFee)
 */
exports.getDashboardAnalytics = async (schoolId) => {
  const { Expense } = require('../models/Expense');
  const { StudentFee } = require('../models/index');

  const sid = toId(schoolId);
  const now = new Date();

  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);
  const monthEnd   = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
  const todayStart = new Date(now); todayStart.setHours(0,0,0,0);
  const todayEnd   = new Date(now); todayEnd.setHours(23,59,59,999);
  const yearStart  = new Date(now.getFullYear(), 0, 1);

  const [
    allTimeAgg,
    monthAgg,
    todayAgg,
    yearAgg,
    categoryAgg,
    monthlyTrend,
    incomeAgg,
  ] = await Promise.all([

    // All-time total
    Expense.aggregate([
      { $match: { school: sid } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // This month
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: monthStart, $lte: monthEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Today
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: todayStart, $lte: todayEnd } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // This year
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: yearStart } } },
      { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } },
    ]),

    // Category breakdown (all time)
    Expense.aggregate([
      { $match: { school: sid } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: {
        categoryId: '$_id', name: '$cat.name', color: '$cat.color', icon: '$cat.icon',
        total: 1, count: 1,
      }},
      { $sort: { total: -1 } },
    ]),

    // Monthly trend (last 6 months)
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: new Date(now.getFullYear(), now.getMonth() - 5, 1) } } },
      { $group: {
        _id: { year: { $year: '$date' }, month: { $month: '$date' } },
        total: { $sum: '$amount' },
        count: { $sum: 1 },
      }},
      { $sort: { '_id.year': 1, '_id.month': 1 } },
    ]),

    // Total income from StudentFee (paidAmount)
    StudentFee.aggregate([
      { $match: { school: sid } },
      { $group: { _id: null, totalIncome: { $sum: '$paidAmount' } } },
    ]),
  ]);

  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  const totalExpenses = allTimeAgg[0]?.total || 0;
  const totalIncome   = incomeAgg[0]?.totalIncome || 0;

  return {
    totals: {
      allTime:  { amount: totalExpenses, count: allTimeAgg[0]?.count || 0 },
      thisMonth:{ amount: monthAgg[0]?.total || 0,  count: monthAgg[0]?.count || 0 },
      today:    { amount: todayAgg[0]?.total || 0,  count: todayAgg[0]?.count || 0 },
      thisYear: { amount: yearAgg[0]?.total || 0,   count: yearAgg[0]?.count || 0 },
    },
    categoryBreakdown: categoryAgg,
    monthlyTrend: monthlyTrend.map(m => ({
      label: `${MONTHS[m._id.month - 1]} ${m._id.year}`,
      month: m._id.month,
      year:  m._id.year,
      total: m.total,
      count: m.count,
    })),
    incomeVsExpense: {
      totalIncome,
      totalExpenses,
      profit:      totalIncome - totalExpenses,
      isProfit:    totalIncome >= totalExpenses,
      profitPct:   totalIncome > 0 ? Math.round(((totalIncome - totalExpenses) / totalIncome) * 100) : 0,
    },
  };
};

/**
 * getMonthlyReport
 * Full breakdown for a specific month — per-category, per-day, by payment method
 */
exports.getMonthlyReport = async (schoolId, month, year) => {
  const { Expense } = require('../models/Expense');
  const sid = toId(schoolId);

  const start = new Date(year, month - 1, 1);
  const end   = new Date(year, month, 0, 23, 59, 59);

  const [byCategory, byDay, byMethod, expenses] = await Promise.all([
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$category', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $lookup: { from: 'expensecategories', localField: '_id', foreignField: '_id', as: 'cat' } },
      { $unwind: { path: '$cat', preserveNullAndEmptyArrays: true } },
      { $project: { name: '$cat.name', color: '$cat.color', icon: '$cat.icon', total: 1, count: 1 } },
      { $sort: { total: -1 } },
    ]),
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: start, $lte: end } } },
      { $group: {
        _id: { $dayOfMonth: '$date' },
        total: { $sum: '$amount' }, count: { $sum: 1 },
      }},
      { $sort: { _id: 1 } },
    ]),
    Expense.aggregate([
      { $match: { school: sid, date: { $gte: start, $lte: end } } },
      { $group: { _id: '$paymentMethod', total: { $sum: '$amount' }, count: { $sum: 1 } } },
      { $sort: { total: -1 } },
    ]),
    Expense.find({ school: sid, date: { $gte: start, $lte: end } })
      .populate('category', 'name color icon')
      .populate('createdBy', 'name')
      .sort({ date: -1 })
      .lean(),
  ]);

  const grandTotal = expenses.reduce((s, e) => s + e.amount, 0);

  return { byCategory, byDay, byMethod, expenses, grandTotal, month, year };
};

// ─── RECURRING EXPENSE PROCESSOR ─────────────────────────────────────────────

/**
 * processRecurringExpenses
 * Called by cron job daily. Creates new expense records from recurring templates
 * whose nextDueDate has passed.
 */
exports.processRecurringExpenses = async () => {
  const { Expense }    = require('../models/Expense');
  const { Notification } = require('../models/index');

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Find all active recurring templates due today or earlier
  const templates = await Expense.find({
    isRecurring: true,
    nextDueDate: { $lte: new Date() },
  }).lean();

  let created = 0;
  for (const tmpl of templates) {
    try {
      // Create the expense copy
      await Expense.create({
        category:      tmpl.category,
        amount:        tmpl.amount,
        date:          new Date(),
        description:   `[Auto] ${tmpl.description}`,
        paymentMethod: tmpl.paymentMethod,
        parentExpense: tmpl._id,
        isRecurring:   false,
        createdBy:     tmpl.createdBy,
        school:        tmpl.school,
      });

      // Advance nextDueDate
      const next = new Date(tmpl.nextDueDate);
      if (tmpl.recurringType === 'monthly') {
        next.setMonth(next.getMonth() + 1);
      } else if (tmpl.recurringType === 'weekly') {
        next.setDate(next.getDate() + 7);
      } else if (tmpl.recurringType === 'yearly') {
        next.setFullYear(next.getFullYear() + 1);
      }

      await Expense.findByIdAndUpdate(tmpl._id, { nextDueDate: next });
      created++;
    } catch (err) {
      console.error(`Recurring expense error for ${tmpl._id}:`, err.message);
    }
  }

  return created;
};

// ─── ALERT SYSTEM ─────────────────────────────────────────────────────────────

/**
 * checkBudgetAlerts
 * After adding an expense, checks if category spending exceeds budget
 * and creates a Notification if so.
 */
exports.checkBudgetAlerts = async (expense, school, sentBy) => {
  const { Expense } = require('../models/Expense');
  const { Notification } = require('../models/index');

  const sid = toId(school);
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  try {
    // Monthly spend in this category
    const agg = await Expense.aggregate([
      { $match: { school: sid, category: expense.category, date: { $gte: monthStart } } },
      { $group: { _id: null, total: { $sum: '$amount' } } },
    ]);
    const monthlySpend = agg[0]?.total || 0;

    // If budget limit is set on this expense and monthly spend exceeds it
    if (expense.budgetLimit > 0 && monthlySpend > expense.budgetLimit) {
      await Notification.create({
        title:    `⚠️ Budget Alert: Category Overspend`,
        message:  `Monthly expenses for this category have reached ₹${monthlySpend.toLocaleString('en-IN')}, exceeding the budget limit of ₹${expense.budgetLimit.toLocaleString('en-IN')}.`,
        type:     'alert',
        priority: 'high',
        audience: 'staff',
        sentBy:   toId(sentBy),
        school:   sid,
      });
    }
  } catch { /* non-fatal */ }
};

// ─── EXPORT HELPERS ───────────────────────────────────────────────────────────

exports.buildExcelReport = async (expenses, meta) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'EduCore Expense System';

  const ws = wb.addWorksheet('Expenses Report', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

  // Title
  ws.mergeCells('A1:G1');
  ws.getCell('A1').value = `Expense Report — ${meta.title || ''}`;
  ws.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Summary row
  ws.mergeCells('A2:G2');
  ws.getCell('A2').value = `Total: ₹${meta.total?.toLocaleString('en-IN') || 0} | Entries: ${expenses.length} | Generated: ${new Date().toLocaleDateString('en-IN')}`;
  ws.getCell('A2').font  = { italic: true, size: 10 };
  ws.getCell('A2').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFEF2F2' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };

  // Headers
  const headers = ['Date', 'Category', 'Description', 'Amount (₹)', 'Payment Method', 'Added By', 'Attachment'];
  const hr = ws.addRow(headers);
  hr.eachCell(cell => {
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFDC2626' } };
    cell.alignment = { horizontal: 'center' };
  });
  hr.height = 20;

  // Data
  expenses.forEach((e, i) => {
    const r = ws.addRow([
      new Date(e.date).toLocaleDateString('en-IN'),
      e.category?.name || '—',
      e.description,
      e.amount,
      e.paymentMethod,
      e.createdBy?.name || '—',
      e.attachmentUrl ? 'Yes' : 'No',
    ]);
    if (i % 2 === 0) {
      r.eachCell(cell => {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFFFF1F1' } };
      });
    }
    r.getCell(4).font = { bold: true, color: { argb: 'FFDC2626' } };
    r.getCell(4).numFmt = '#,##0';
    r.getCell(4).alignment = { horizontal: 'right' };
  });

  ws.columns = [
    { width: 14 }, { width: 20 }, { width: 36 },
    { width: 14 }, { width: 16 }, { width: 20 }, { width: 12 },
  ];

  return wb.xlsx.writeBuffer();
};

exports.buildPDFReport = (res, expenses, meta) => {
  const PDFDoc = require('pdfkit');
  const doc = new PDFDoc({ margin: 36, size: 'A4', layout: 'landscape' });
  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="expenses-${meta.month || 'all'}-${meta.year || ''}.pdf"`);
  doc.pipe(res);

  // Title
  doc.fontSize(16).font('Helvetica-Bold').fillColor('#DC2626')
    .text(`Expense Report — ${meta.title || ''}`, { align: 'center' });
  doc.fontSize(10).font('Helvetica').fillColor('#6B7280')
    .text(`Total: ₹${(meta.total || 0).toLocaleString('en-IN')} | ${expenses.length} entries | ${new Date().toLocaleDateString('en-IN')}`, { align: 'center' });
  doc.moveDown(0.8);

  const pageW = doc.page.width - 72;
  const cols  = [80, 100, 220, 80, 90, 120];
  const hdrs  = ['Date', 'Category', 'Description', 'Amount', 'Method', 'Added By'];
  const startX = 36;
  let y = doc.y;

  // Header
  doc.rect(startX, y, pageW, 22).fill('#DC2626');
  doc.fill('#fff').fontSize(9).font('Helvetica-Bold');
  let x = startX;
  hdrs.forEach((h, i) => {
    doc.text(h, x + 3, y + 6, { width: cols[i] - 6, align: 'center' });
    x += cols[i];
  });
  doc.fill('#000'); y += 22;

  expenses.forEach((e, idx) => {
    if (y > doc.page.height - 60) { doc.addPage({ layout: 'landscape' }); y = 36; }
    const rh = 18;
    if (idx % 2 === 0) doc.rect(startX, y, pageW, rh).fill('#FFF1F1');
    doc.fill('#111827').fontSize(8).font('Helvetica');
    const vals = [
      new Date(e.date).toLocaleDateString('en-IN'),
      e.category?.name || '—',
      e.description?.slice(0, 40) || '—',
      `₹${e.amount?.toLocaleString('en-IN')}`,
      e.paymentMethod,
      e.createdBy?.name || '—',
    ];
    x = startX;
    vals.forEach((v, i) => {
      if (i === 3) doc.fill('#DC2626').font('Helvetica-Bold');
      doc.text(String(v), x + 3, y + 4, { width: cols[i] - 6, align: i === 3 ? 'right' : 'left', ellipsis: true });
      doc.fill('#111827').font('Helvetica');
      x += cols[i];
    });
    doc.moveTo(startX, y + rh).lineTo(startX + pageW, y + rh).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
    y += rh;
  });

  doc.end();
};