// backend/services/feeService.js
// Business logic: receipt PDF, Excel export, auto late-fee check, notifications

const mongoose = require('mongoose');

// ── Receipt number generator ──────────────────────────────────────────────────
exports.genReceiptNumber = () =>
  'RCP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();

// ── Format currency ───────────────────────────────────────────────────────────
exports.fmt = (n = 0) =>
  new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR', maximumFractionDigits: 0 }).format(n);

// ── Calculate final amount after discount ────────────────────────────────────
exports.calcFinalAmount = (baseAmount, discountPct = 0, discountAmt = 0) => {
  const pctDiscount = (baseAmount * discountPct) / 100;
  return Math.max(0, baseAmount - pctDiscount - discountAmt);
};

// ── Build installment schedule ─────────────────────────────────────────────────
exports.buildInstallments = (totalAmount, count, firstDueDate) => {
  const perInstallment = Math.floor(totalAmount / count);
  const remainder      = totalAmount - perInstallment * count;
  const installments   = [];
  const start          = new Date(firstDueDate);

  for (let i = 1; i <= count; i++) {
    const due = new Date(start);
    due.setMonth(due.getMonth() + (i - 1));
    installments.push({
      number:  i,
      amount:  i === count ? perInstallment + remainder : perInstallment, // add remainder to last
      dueDate: due,
      paidAmount: 0,
      status: 'pending',
    });
  }
  return installments;
};

// ── Generate PDF Receipt ───────────────────────────────────────────────────────
exports.buildReceiptPDF = (res, data) => {
  const PDFDoc = require('pdfkit');
  const doc = new PDFDoc({ margin: 40, size: 'A5' });

  res.setHeader('Content-Type', 'application/pdf');
  res.setHeader('Content-Disposition', `attachment; filename="receipt-${data.receiptNumber}.pdf"`);
  doc.pipe(res);

  // Header band
  doc.rect(0, 0, doc.page.width, 90).fill('#1E3A8A');
  doc.fill('#fff').fontSize(16).font('Helvetica-Bold')
    .text('The Future Step School', 40, 18, { align: 'center' });
  doc.fontSize(9).font('Helvetica')
    .text('K V P S Sanstha Bhaler, Nandurbar, Maharashtra', 40, 38, { align: 'center' });
  doc.fontSize(11).font('Helvetica-Bold')
    .text('FEE RECEIPT', 40, 58, { align: 'center' });

  // Receipt number badge
  doc.roundedRect(doc.page.width / 2 - 70, 72, 140, 22, 6).fill('rgba(255,255,255,0.2)');
  doc.fill('#fff').fontSize(9)
    .text(data.receiptNumber, doc.page.width / 2 - 70, 78, { width: 140, align: 'center' });

  doc.fill('#000');
  let y = 110;

  // Student info section
  const infoRows = [
    ['Student Name', data.studentName],
    ['Admission No',  data.admissionNo],
    ['Class',         data.className],
    ['Payment Date',  data.paidOn ? new Date(data.paidOn).toLocaleDateString('en-IN') : '—'],
    ['Payment Mode',  (data.method || '—').toUpperCase()],
  ];
  if (data.transactionId) infoRows.push(['Transaction ID', data.transactionId]);
  if (data.month)         infoRows.push(['Period',         data.month]);

  doc.fontSize(8).font('Helvetica-Bold').fill('#6B7280')
    .text('STUDENT DETAILS', 40, y, { characterSpacing: 1 });
  y += 14;

  infoRows.forEach(([key, val]) => {
    doc.rect(40, y, doc.page.width - 80, 18).fill('#F8FAFC');
    doc.fill('#374151').font('Helvetica').fontSize(9).text(key + ':', 48, y + 4, { width: 90 });
    doc.font('Helvetica-Bold').text(val || '—', 150, y + 4, { width: doc.page.width - 200 });
    y += 20;
  });

  y += 10;

  // Amount box
  doc.rect(40, y, doc.page.width - 80, 56).fill('#F0FDF4').stroke('#22C55E');
  doc.fill('#166534').font('Helvetica-Bold').fontSize(9)
    .text('AMOUNT PAID', 40, y + 8, { width: doc.page.width - 80, align: 'center' });
  doc.fontSize(26).text(exports.fmt(data.amount), 40, y + 20, { width: doc.page.width - 80, align: 'center' });
  y += 66;

  // Fee summary
  const summaryRows = [
    ['Total Fees',     exports.fmt(data.totalFees)],
    ['Amount Paid',    exports.fmt(data.paidAmount)],
    ['Balance Due',    exports.fmt(data.pendingAmount)],
  ];
  if (data.feeType) summaryRows.unshift(['Fee Type', data.feeType]);

  y += 6;
  doc.fontSize(8).font('Helvetica-Bold').fill('#6B7280')
    .text('FEE SUMMARY', 40, y, { characterSpacing: 1 });
  y += 12;

  summaryRows.forEach(([key, val], i) => {
    doc.rect(40, y, doc.page.width - 80, 18).fill(i % 2 ? '#fff' : '#F8FAFC');
    doc.fill('#374151').font('Helvetica').fontSize(9).text(key, 48, y + 4, { width: 100 });
    const isBalance = key === 'Balance Due';
    doc.font('Helvetica-Bold').fill(isBalance && data.pendingAmount > 0 ? '#DC2626' : '#111')
      .text(val, 40, y + 4, { width: doc.page.width - 90, align: 'right' });
    doc.fill('#000');
    y += 20;
  });

  // Remarks
  if (data.remarks) {
    y += 6;
    doc.fontSize(8).font('Helvetica').fill('#6B7280').text(`Remarks: ${data.remarks}`, 40, y);
    y += 14;
  }

  // Footer
  y = Math.max(y + 20, doc.page.height - 80);
  doc.moveTo(40, y).lineTo(doc.page.width - 40, y).strokeColor('#E5E7EB').lineWidth(0.5).stroke();
  y += 8;
  doc.fontSize(8).font('Helvetica').fill('#9CA3AF')
    .text(`Collected by: ${data.collectedBy || 'System'}`, 40, y)
    .text('This is a computer-generated receipt.', 40, y + 12, { align: 'center', width: doc.page.width - 80 })
    .text('The Future Step School, Bhaler, Nandurbar', 40, y + 24, { align: 'center', width: doc.page.width - 80 });

  doc.end();
};

// ── Generate Excel Report ──────────────────────────────────────────────────────
exports.buildFeeExcel = async (data, meta) => {
  const ExcelJS = require('exceljs');
  const wb = new ExcelJS.Workbook();
  wb.creator = 'The Future Step School — EduCore';
  wb.created = new Date();

  const ws = wb.addWorksheet('Fee Report', { pageSetup: { paperSize: 9, orientation: 'landscape' } });

  // Title
  ws.mergeCells('A1:J1');
  ws.getCell('A1').value = `Fee Report — ${meta.title || 'School'} — ${meta.period || ''}`;
  ws.getCell('A1').font  = { bold: true, size: 14, color: { argb: 'FFFFFFFF' } };
  ws.getCell('A1').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
  ws.getCell('A1').alignment = { horizontal: 'center', vertical: 'middle' };
  ws.getRow(1).height = 28;

  // Summary row
  ws.mergeCells('A2:J2');
  ws.getCell('A2').value = `Total Students: ${meta.totalStudents || 0} | Total Expected: ₹${meta.totalExpected?.toLocaleString('en-IN') || 0} | Collected: ₹${meta.totalCollected?.toLocaleString('en-IN') || 0} | Pending: ₹${meta.totalPending?.toLocaleString('en-IN') || 0}`;
  ws.getCell('A2').font  = { italic: true, size: 9 };
  ws.getCell('A2').fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE8F0FE' } };
  ws.getCell('A2').alignment = { horizontal: 'center' };
  ws.getRow(2).height = 16;

  const headers = ['#', 'Student Name', 'Admission No', 'Class', 'Fee Type', 'Total Fees', 'Paid', 'Pending', 'Status', 'Last Payment'];
  const hRow = ws.addRow(headers);
  hRow.eachCell(cell => {
    cell.font  = { bold: true, color: { argb: 'FFFFFFFF' } };
    cell.fill  = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
    cell.alignment = { horizontal: 'center' };
  });
  hRow.height = 20;

  data.forEach((row, i) => {
    const r = ws.addRow([
      i + 1,
      row.studentName || '',
      row.admissionNo || '',
      row.className   || '',
      row.feeType     || 'General',
      row.totalFees   || 0,
      row.paidAmount  || 0,
      row.pendingAmount || 0,
      (row.status || '').toUpperCase(),
      row.lastPayment ? new Date(row.lastPayment).toLocaleDateString('en-IN') : '—',
    ]);

    if (i % 2 === 0) r.eachCell(c => { c.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF1F5F9' } }; });

    const statusCell = r.getCell(9);
    statusCell.font = {
      bold: true,
      color: { argb: row.status === 'paid' ? 'FF16A34A' : row.status === 'partial' ? 'FFD97706' : 'FFDC2626' },
    };
    statusCell.alignment = { horizontal: 'center' };

    // Color pending cell red if > 0
    const pendingCell = r.getCell(8);
    if ((row.pendingAmount || 0) > 0) {
      pendingCell.font = { bold: true, color: { argb: 'FFDC2626' } };
    }
  });

  ws.columns = [
    { width: 5 }, { width: 28 }, { width: 14 }, { width: 14 },
    { width: 16 }, { width: 12 }, { width: 12 }, { width: 12 },
    { width: 12 }, { width: 14 },
  ];

  return wb.xlsx.writeBuffer();
};

// ── Check and mark overdue assignments ────────────────────────────────────────
exports.checkOverdueAssignments = async (schoolId) => {
  const FeeAssignment = require('../models/FeeAssignment');
  const { Notification } = require('../models/index');

  const today    = new Date();
  const overdue  = await FeeAssignment.find({
    school:   schoolId,
    dueDate:  { $lt: today },
    status:   { $in: ['pending', 'partial'] },
  }).populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .populate('feeType', 'name');

  let notifCount = 0;
  for (const assignment of overdue) {
    // Mark as overdue
    if (assignment.status === 'pending') assignment.status = 'overdue';

    // Create notification (fire-and-forget)
    await Notification.create({
      title:    `Fee Overdue: ${assignment.feeType?.name || 'Fee'}`,
      message:  `${assignment.student?.user?.name}'s ${assignment.feeType?.name} of ₹${assignment.pendingAmount} is overdue.`,
      type:     'alert',
      priority: 'urgent',
      audience: 'parents',
      sentBy:   null,
      school:   schoolId,
    }).catch(() => {});

    notifCount++;
  }

  return notifCount;
};