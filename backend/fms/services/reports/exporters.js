// backend/fms/services/reports/exporters.js
//
// PDF and Excel export. SRS M16, `?format=pdf|excel`.
//
// ─── LAZY REQUIRES ───────────────────────────────────────────────────────────
// pdfkit and exceljs are declared by the SMS, so they are present in a normal
// deployment. They are required INSIDE the export functions anyway, so that a
// deployment missing them degrades to "PDF export is unavailable" rather than
// taking the whole FMS router down at mount time. A reporting library should
// never be able to stop somebody recording a receipt.
//
// ─── MONEY IN REPORTS ────────────────────────────────────────────────────────
// Everything internal is integer paise. Everything a person reads is rupees,
// formatted Indian-style. The conversion happens HERE and nowhere else, so
// there is one place to check when a figure looks wrong.

const money = require('../../utils/money');

/** ₹ with Indian digit grouping, for display only. */
function rupees(paise) {
  if (paise === null || paise === undefined) return '';
  const neg = paise < 0;
  const abs = Math.abs(paise);
  const whole = Math.floor(abs / 100);
  const p = String(abs % 100).padStart(2, '0');

  // Indian grouping: last three digits, then pairs.
  const s = String(whole);
  const last3 = s.slice(-3);
  const rest = s.slice(0, -3);
  const grouped = rest ? rest.replace(/\B(?=(\d{2})+(?!\d))/g, ',') + ',' + last3 : last3;

  return `${neg ? '-' : ''}${grouped}.${p}`;
}

function dateStr(d) {
  if (!d) return '';
  return new Date(d).toLocaleDateString('en-IN', {
    day: '2-digit', month: 'short', year: 'numeric', timeZone: 'UTC',
  });
}

/**
 * Flatten a report into titled tables.
 *
 * Both exporters consume this, so a report added to one appears in the other —
 * rather than PDF and Excel drifting into showing different things.
 */
function tabulate(report) {
  const t = [];

  const moneyRows = (rows, cols) => rows.map((r) => cols.map((c) =>
    (c.money ? rupees(r[c.key]) : (r[c.key] ?? ''))));

  const ACCOUNT_COLS = [
    { key: 'accountCode', label: 'Code' },
    { key: 'accountName', label: 'Account' },
    { key: 'amount', label: 'Amount (₹)', money: true, right: true },
  ];

  switch (report.statement || report.report) {
    case 'balanceSheet':
      t.push({ title: 'Assets', columns: ACCOUNT_COLS,
        rows: moneyRows(report.assets.rows, ACCOUNT_COLS),
        total: ['', 'Total Assets', rupees(report.assets.total)] });
      t.push({ title: 'Liabilities', columns: ACCOUNT_COLS,
        rows: moneyRows(report.liabilities.rows, ACCOUNT_COLS),
        total: ['', 'Total Liabilities', rupees(report.liabilities.total)] });
      t.push({ title: 'Equity', columns: ACCOUNT_COLS,
        rows: moneyRows(report.equity.rows, ACCOUNT_COLS),
        total: ['', 'Total Equity', rupees(report.equity.total)] });
      t.push({ title: 'Balance', columns: [{ key: 'a', label: '' }, { key: 'b', label: '' }],
        rows: [
          ['Total Assets', rupees(report.totals.assets)],
          ['Total Liabilities and Equity', rupees(report.totals.liabilitiesAndEquity)],
          ['Difference', rupees(report.totals.difference)],
        ],
        note: report.totals.balanced ? 'Balanced' : report.note });
      break;

    case 'profitAndLoss':
      t.push({ title: 'Income', columns: ACCOUNT_COLS,
        rows: moneyRows(report.income.rows, ACCOUNT_COLS),
        total: ['', 'Total Income', rupees(report.income.total)] });
      t.push({ title: 'Expenditure', columns: ACCOUNT_COLS,
        rows: moneyRows(report.expenditure.rows, ACCOUNT_COLS),
        total: ['', 'Total Expenditure', rupees(report.expenditure.total)] });
      t.push({ title: report.label, columns: [{ key: 'a', label: '' }, { key: 'b', label: '' }],
        rows: [[report.label, rupees(report.surplus)]] });
      break;

    case 'cashMovement': {
      const COLS = [
        { key: 'head', label: 'Head' },
        { key: 'amount', label: 'Amount (₹)', money: true, right: true },
      ];
      t.push({ title: 'Opening', columns: [{ key: 'a', label: '' }, { key: 'b', label: '' }],
        rows: [['Opening cash and bank', rupees(report.openingCash)]] });
      t.push({ title: 'Money in', columns: COLS,
        rows: moneyRows(report.inflows.rows, COLS),
        total: ['Total in', rupees(report.inflows.total)] });
      t.push({ title: 'Money out', columns: COLS,
        rows: moneyRows(report.outflows.rows, COLS),
        total: ['Total out', rupees(report.outflows.total)] });
      t.push({ title: 'Closing', columns: [{ key: 'a', label: '' }, { key: 'b', label: '' }],
        rows: [
          ['Net movement', rupees(report.netMovement)],
          ['Closing cash and bank', rupees(report.closingCash)],
        ],
        note: report.reconciles ? undefined : 'Does not reconcile to the ledger' });
      break;
    }

    default: {
      // Trial balance and anything else with a `lines` array.
      const lines = report.lines || report.rows || [];
      const COLS = [
        { key: 'accountCode', label: 'Code' },
        { key: 'accountName', label: 'Account' },
        { key: 'totalDebit', label: 'Debit (₹)', money: true, right: true },
        { key: 'totalCredit', label: 'Credit (₹)', money: true, right: true },
      ];
      t.push({
        title: report.report || report.statement || 'Report',
        columns: COLS,
        rows: moneyRows(lines, COLS),
        total: report.totals
          ? ['', 'Total', rupees(report.totals.totalDebit), rupees(report.totals.totalCredit)]
          : undefined,
      });
    }
  }

  return t;
}

function heading(report, meta = {}) {
  const p = report.period || {};
  const range = report.asAt
    ? `As at ${dateStr(report.asAt)}`
    : (p.from && p.to ? `${dateStr(p.from)} to ${dateStr(p.to)}` : '');

  return {
    school: meta.schoolName || 'The Future Step School',
    title: meta.title || report.statement || report.report || 'Financial Report',
    range,
    generatedAt: new Date(),
  };
}

/**
 * Excel. Returns a Buffer.
 *
 * Amounts go in as NUMBERS with a display format, not as strings — a
 * spreadsheet whose figures cannot be summed is a picture of a report.
 */
async function toExcel(report, meta = {}) {
  let ExcelJS;
  try {
    ExcelJS = require('exceljs');
  } catch (_) {
    const err = new Error("Excel export is unavailable — the 'exceljs' package is not installed");
    err.exportUnavailable = 'excel';
    throw err;
  }

  const h = heading(report, meta);
  const tables = tabulate(report);

  const wb = new ExcelJS.Workbook();
  wb.creator = 'FMS';
  wb.created = h.generatedAt;

  const ws = wb.addWorksheet(String(h.title).slice(0, 31));

  ws.addRow([h.school]).font = { bold: true, size: 14 };
  ws.addRow([h.title]).font = { bold: true, size: 12 };
  if (h.range) ws.addRow([h.range]);
  ws.addRow([`Generated ${dateStr(h.generatedAt)}`]).font = { size: 9, color: { argb: 'FF888888' } };
  ws.addRow([]);

  for (const table of tables) {
    ws.addRow([table.title]).font = { bold: true, size: 11 };

    const header = ws.addRow(table.columns.map((c) => c.label));
    header.font = { bold: true };
    header.eachCell((cell) => {
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFEFEFEF' } };
      cell.border = { bottom: { style: 'thin' } };
    });

    for (const r of table.rows) {
      const row = ws.addRow(r.map((v, i) => {
        // Money columns become real numbers so they can be summed.
        if (table.columns[i]?.money && typeof v === 'string' && v !== '') {
          const n = Number(v.replace(/,/g, ''));
          return Number.isFinite(n) ? n : v;
        }
        return v;
      }));
      row.eachCell((cell, i) => {
        if (table.columns[i - 1]?.money) {
          cell.numFmt = '#,##,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
    }

    if (table.total) {
      const tr = ws.addRow(table.total.map((v, i) => {
        if (table.columns[i]?.money && typeof v === 'string' && v !== '') {
          const n = Number(v.replace(/,/g, ''));
          return Number.isFinite(n) ? n : v;
        }
        return v;
      }));
      tr.font = { bold: true };
      tr.eachCell((cell, i) => {
        cell.border = { top: { style: 'thin' } };
        if (table.columns[i - 1]?.money) {
          cell.numFmt = '#,##,##0.00';
          cell.alignment = { horizontal: 'right' };
        }
      });
    }

    if (table.note) {
      ws.addRow([table.note]).font = { italic: true, size: 9 };
    }
    ws.addRow([]);
  }

  ws.columns.forEach((c) => { c.width = c.width || 24; });
  ws.getColumn(1).width = 12;
  ws.getColumn(2).width = 36;

  return wb.xlsx.writeBuffer();
}

/**
 * PDF. Returns a Buffer.
 *
 * Deliberately plain: a financial statement is read, not admired, and a report
 * that prints legibly on the school's printer beats one that looks good on a
 * designer's screen.
 */
async function toPdf(report, meta = {}) {
  let PDFDocument;
  try {
    PDFDocument = require('pdfkit');
  } catch (_) {
    const err = new Error("PDF export is unavailable — the 'pdfkit' package is not installed");
    err.exportUnavailable = 'pdf';
    throw err;
  }

  const h = heading(report, meta);
  const tables = tabulate(report);

  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 42 });
    const chunks = [];
    doc.on('data', (c) => chunks.push(c));
    doc.on('end', () => resolve(Buffer.concat(chunks)));
    doc.on('error', reject);

    const W = doc.page.width - doc.options.margin * 2;

    doc.fontSize(15).text(h.school, { align: 'center' });
    doc.fontSize(12).text(h.title, { align: 'center' });
    if (h.range) doc.fontSize(9).fillColor('#555').text(h.range, { align: 'center' });
    doc.fillColor('#000').moveDown(1);

    for (const table of tables) {
      if (doc.y > doc.page.height - 140) doc.addPage();

      doc.fontSize(11).text(table.title, { underline: false });
      doc.moveDown(0.3);

      const cols = table.columns;
      const widths = cols.map((c, i) =>
        (i === 1 ? W * 0.42 : (c.money ? W * 0.20 : W * 0.18)));

      const drawRow = (cells, opts = {}) => {
        if (doc.y > doc.page.height - 70) doc.addPage();
        const y = doc.y;
        let x = doc.options.margin;
        doc.fontSize(opts.bold ? 9.5 : 9);
        cells.forEach((cell, i) => {
          const w = widths[i] || W * 0.2;
          doc.text(String(cell ?? ''), x, y, {
            width: w - 6,
            align: cols[i]?.money ? 'right' : 'left',
          });
          x += w;
        });
        doc.y = y + 14;
      };

      drawRow(cols.map((c) => c.label), { bold: true });
      doc.moveTo(doc.options.margin, doc.y - 3)
        .lineTo(doc.options.margin + W, doc.y - 3).strokeColor('#bbb').stroke();

      for (const r of table.rows) drawRow(r);

      if (table.total) {
        doc.moveTo(doc.options.margin, doc.y).lineTo(doc.options.margin + W, doc.y)
          .strokeColor('#666').stroke();
        doc.y += 3;
        drawRow(table.total, { bold: true });
      }

      if (table.note) {
        doc.fontSize(8).fillColor('#666').text(table.note, doc.options.margin, doc.y);
        doc.fillColor('#000');
        doc.y += 12;
      }

      doc.moveDown(0.8);
    }

    doc.fontSize(7.5).fillColor('#888')
      .text(`Generated ${dateStr(h.generatedAt)} — computed from the general ledger`,
        doc.options.margin, doc.page.height - 55, { width: W, align: 'center' });

    doc.end();
  });
}

module.exports = { toExcel, toPdf, tabulate, heading, rupees, dateStr };