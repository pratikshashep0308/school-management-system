// frontend/src/utils/feeCategoryReport.js
//
// The consolidated fee report — fetching, shaping and exporting.
//
// ─── WHY THIS IS SHARED ──────────────────────────────────────────────────────
// Two screens show this report: the Fees module page, and the Reports Centre.
// Building the export logic separately in each would guarantee they drift, and
// a CSV that disagrees with the PDF is the kind of thing discovered at the worst
// possible moment. One copy, two callers.
//
// ─── WHERE THE NUMBERS COME FROM ─────────────────────────────────────────────
// EXPECTED comes from fee assignments. PAID comes from the category breakdown
// recorded on each receipt — FeeAssignment.paidAmount exists but is zero on
// every record, because payments are written to StudentFee.paymentHistory and
// never posted back.
//
// Two sources means the category columns may not sum to the overall total. That
// is reported honestly rather than smoothed over: money paid without a
// breakdown appears as `unallocated`, never spread across categories to make
// the arithmetic look tidy.

import feeAPI from './feeAPI';

const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
const esc = (v) => String(v ?? '')
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escCsv = (v) => {
  const t = String(v ?? '');
  return /[",\n]/.test(t) ? `"${t.replace(/"/g, '""')}"` : t;
};

/**
 * Fetch the report, optionally narrowed to one fee type.
 *
 * Filtering happens here rather than server-side so a single request serves
 * either view, and so the totals below are always computed from the same rows
 * the table shows.
 */
export async function fetchCategoryReport({ classId, status, feeType } = {}) {
  const params = {};
  if (classId) params.classId = classId;
  if (status) params.status = status;

  const res = await feeAPI.getCategoryReport(params);
  const d = res?.data?.data ?? res?.data;
  if (!d || !Array.isArray(d.rows)) throw new Error('Unexpected response from the fee report');

  if (!feeType || !d.columns.includes(feeType)) return d;

  const only = feeType;
  const rows = d.rows.map((r) => {
    const k = r.categories[only] || { expected: 0, paid: 0, pending: 0 };
    let status2;
    if (k.expected === 0) status2 = 'NOT APPLICABLE';
    else if (k.paid <= 0) status2 = 'PENDING';
    else if (k.pending <= 0) status2 = 'PAID';
    else status2 = 'PARTIAL';
    return {
      ...r,
      categories: { [only]: k },
      // Dropped deliberately: money with no category breakdown cannot be
      // claimed by a single-category report.
      unallocated: 0,
      total: { expected: k.expected, paid: k.paid, pending: k.pending },
      status: status2,
    };
  });
  const cat = d.byCategory[only] || { expected: 0, paid: 0, pending: 0 };

  return {
    ...d,
    columns: [only],
    rows,
    byCategory: { [only]: cat },
    totals: {
      ...d.totals,
      expected: cat.expected, paid: cat.paid, pending: cat.pending,
      unallocated: 0, students: rows.length,
      collectionRate: cat.expected > 0
        ? Math.round((cat.paid / cat.expected) * 1000) / 10 : 0,
    },
    filteredTo: only,
  };
}

/**
 * Flatten to header + rows for the text formats.
 *
 * Two header lines, because one line cannot express "School Fee" spanning three
 * sub-columns. CSV readers and Markdown both cope; a merged cell would not
 * survive either.
 */
export function flattenCategory(d) {
  const { columns = [], rows = [], totals = {} } = d;
  const anyUnalloc = totals.unallocated > 0;

  const top = ['', '', '', ''];
  const sub = ['#', 'Roll No', 'Student', 'Class'];
  columns.forEach((c) => { top.push(c, '', ''); sub.push('Total', 'Paid', 'Pending'); });
  if (anyUnalloc) { top.push('Unallocated'); sub.push(''); }
  top.push('Overall', '', ''); sub.push('Total', 'Paid', 'Pending');
  top.push(''); sub.push('Status');

  const body = rows.map((r, i) => {
    const line = [i + 1, r.rollNumber, r.name, r.className];
    columns.forEach((c) => {
      const k = r.categories[c] || { expected: 0, paid: 0, pending: 0 };
      line.push(k.expected, k.paid, k.pending);
    });
    if (anyUnalloc) line.push(r.unallocated || 0);
    line.push(r.total.expected, r.total.paid, r.total.pending, r.status);
    return line;
  });

  // Grand total as a row, so it survives into a spreadsheet rather than being a
  // footer somebody has to retype.
  const grand = ['', '', `GRAND TOTAL — ${rows.length} students`, ''];
  columns.forEach((c) => {
    const k = d.byCategory[c] || { expected: 0, paid: 0, pending: 0 };
    grand.push(k.expected, k.paid, k.pending);
  });
  if (anyUnalloc) grand.push(totals.unallocated);
  grand.push(totals.expected, totals.paid, totals.pending, `${totals.collectionRate}%`);

  return { top, sub, body, grand, anyUnalloc };
}

/** Print / save as PDF. Opens a window; the caller passes it in already open. */
export function renderCategoryHTML(d, title) {
  const { columns = [], rows = [], totals = {}, byCategory = {} } = d;

  // Three sub-columns per category plus fixed ones. Past roughly four
  // categories A4 landscape stops being readable, so the page steps up to A3
  // rather than shrinking the type to fit.
  const wide = columns.length > 4;
  const anyUnallocated = totals.unallocated > 0;
  const overpaidRows = rows.filter((r) => (r.overpaid || []).length > 0);

  return `<html><head><title>${esc(title)}</title><style>
    @page { size: ${wide ? 'A3' : 'A4'} landscape; margin: 10mm; }
    body { font-family: system-ui, Arial, sans-serif; color:#111827; margin:0; }
    h1 { font-size:17px; color:#0B1F4A; margin:0 0 2px; }
    .sub { color:#6B7280; font-size:11px; margin-bottom:12px; }
    .kpis { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
    .kpi { border:1px solid #E5E7EB; border-radius:6px; padding:6px 12px; font-size:10px; }
    .kpi b { display:block; font-size:14px; color:#0B1F4A; }
    table { width:100%; border-collapse:collapse; font-size:9px; }
    th { background:#0B1F4A; color:#fff; padding:4px 5px; text-align:left; font-weight:600; }
    th.grp { text-align:center; border-left:2px solid #fff; }
    td { padding:3px 5px; border-bottom:1px solid #F3F4F6; }
    td.n { text-align:right; font-variant-numeric:tabular-nums; }
    tr:nth-child(even) td { background:#F9FAFB; }
    tfoot td { font-weight:700; border-top:2px solid #0B1F4A; background:#EEF2FF !important; }
    thead { display:table-header-group; }
    tr { break-inside:avoid; }
    .note { margin-top:10px; font-size:9px; color:#6B7280; line-height:1.5; }
    .warn { color:#B45309; }
  </style></head><body>
    <h1>${esc(title)}</h1>
    <div class="sub">The Future Step School · Academic Year 2026–27 ·
      ${new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })} ·
      ${rows.length} student${rows.length === 1 ? '' : 's'}</div>

    <div class="kpis">
      <div class="kpi">Expected<b>${money(totals.expected)}</b></div>
      <div class="kpi">Collected<b>${money(totals.paid)}</b></div>
      <div class="kpi">Pending<b>${money(totals.pending)}</b></div>
      <div class="kpi">Collection<b>${totals.collectionRate}%</b></div>
      ${columns.map((c) => `<div class="kpi">${esc(c)}<b>${money(byCategory[c]?.paid)}</b>
        <span style="color:#6B7280">of ${money(byCategory[c]?.expected)}</span></div>`).join('')}
    </div>

    <table>
      <thead>
        <tr>
          <th rowspan="2">#</th><th rowspan="2">Roll No</th>
          <th rowspan="2">Student</th><th rowspan="2">Class</th>
          ${columns.map((c) => `<th class="grp" colspan="3">${esc(c).toUpperCase()}</th>`).join('')}
          ${anyUnallocated ? '<th class="grp" rowspan="2">Unallocated</th>' : ''}
          <th class="grp" colspan="3">OVERALL</th>
          <th rowspan="2">Status</th>
        </tr>
        <tr>
          ${columns.map(() => '<th>Total</th><th>Paid</th><th>Pending</th>').join('')}
          <th>Total</th><th>Paid</th><th>Pending</th>
        </tr>
      </thead>
      <tbody>
        ${rows.map((r, i) => `<tr>
          <td>${i + 1}</td><td>${esc(r.rollNumber)}</td>
          <td>${esc(r.name)}</td><td>${esc(r.className)}</td>
          ${columns.map((c) => {
            const k = r.categories[c] || { expected: 0, paid: 0, pending: 0 };
            const flag = (r.overpaid || []).includes(c) ? ' class="n warn"' : ' class="n"';
            return `<td class="n">${money(k.expected)}</td><td${flag}>${money(k.paid)}</td><td class="n">${money(k.pending)}</td>`;
          }).join('')}
          ${anyUnallocated ? `<td class="n">${r.unallocated ? money(r.unallocated) : '—'}</td>` : ''}
          <td class="n">${money(r.total.expected)}</td>
          <td class="n">${money(r.total.paid)}</td>
          <td class="n">${money(r.total.pending)}</td>
          <td>${esc(r.status)}</td>
        </tr>`).join('')}
      </tbody>
      <tfoot>
        <tr>
          <td colspan="4">GRAND TOTAL — ${rows.length} student${rows.length === 1 ? '' : 's'}</td>
          ${columns.map((c) => {
            const k = byCategory[c] || { expected: 0, paid: 0, pending: 0 };
            return `<td class="n">${money(k.expected)}</td><td class="n">${money(k.paid)}</td><td class="n">${money(k.pending)}</td>`;
          }).join('')}
          ${anyUnallocated ? `<td class="n">${money(totals.unallocated)}</td>` : ''}
          <td class="n">${money(totals.expected)}</td>
          <td class="n">${money(totals.paid)}</td>
          <td class="n">${money(totals.pending)}</td>
          <td>${totals.collectionRate}%</td>
        </tr>
      </tfoot>
    </table>

    <div class="note">
      Expected comes from fee assignments; paid comes from the category breakdown
      recorded on each receipt.
      ${anyUnallocated ? `<br><span class="warn">${money(totals.unallocated)} was paid without a
        category breakdown.</span> It is included in Overall Paid but not attributed to any
        category — deliberately not spread across them, since no such split was recorded.` : ''}
      ${overpaidRows.length > 0 ? `<br><span class="warn">${overpaidRows.length} student(s) show more
        paid than assigned in a category (marked in amber).</span> Usually a payment against
        something never formally assigned — worth checking.` : ''}
    </div>
  </body></html>`;
}

/** CSV. Amounts go out as plain numbers — a spreadsheet cannot sum "₹9,400". */
export function categoryCSV(d, title) {
  const { top, sub, body, grand } = flattenCategory(d);
  const { totals } = d;

  const meta = [
    ['Fee Report', title],
    ['Generated', new Date().toLocaleString('en-IN')],
    ['Students', d.rows.length],
    ['Total Expected', Math.round(totals.expected)],
    ['Total Collected', Math.round(totals.paid)],
    ['Total Pending', Math.round(totals.pending)],
    ['Collection Rate', `${totals.collectionRate}%`],
    [],
  ];

  return '\uFEFF' + [
    ...meta.map((r) => r.map(escCsv).join(',')),
    top.map(escCsv).join(','),
    sub.map(escCsv).join(','),
    ...body.map((r) => r.map(escCsv).join(',')),
    grand.map(escCsv).join(','),
  ].join('\n');
}

/** Markdown. No column spanning, so the category folds into each sub-header. */
export function categoryMarkdown(d, title) {
  const { body, grand, anyUnalloc } = flattenCategory(d);
  const { columns, totals } = d;

  let md = `# ${title}\n\n**Generated:** ${new Date().toLocaleString('en-IN')}\n\n`;
  md += `- Students: ${d.rows.length}\n`;
  md += `- Total Expected: ${money(totals.expected)}\n`;
  md += `- Total Collected: ${money(totals.paid)}\n`;
  md += `- Total Pending: ${money(totals.pending)}\n`;
  md += `- Collection Rate: ${totals.collectionRate}%\n\n`;

  md += `## By category\n\n| Category | Expected | Collected | Pending |\n|---|---|---|---|\n`;
  columns.forEach((c) => {
    const k = d.byCategory[c] || {};
    md += `| ${c} | ${money(k.expected)} | ${money(k.paid)} | ${money(k.pending)} |\n`;
  });

  md += `\n## Students\n\n`;
  const header = ['#', 'Roll No', 'Student', 'Class'];
  columns.forEach((c) => header.push(`${c} Total`, `${c} Paid`, `${c} Pending`));
  if (anyUnalloc) header.push('Unallocated');
  header.push('Overall Total', 'Overall Paid', 'Overall Pending', 'Status');

  md += `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
  md += body.map((r) => `| ${r.join(' | ')} |`).join('\n');
  md += `\n| ${grand.join(' | ')} |\n`;

  if (totals.unallocated > 0) {
    md += `\n> ${money(totals.unallocated)} was paid without a category breakdown. `
        + `It is included in Overall Paid but not attributed to any category.\n`;
  }
  return md;
}

/** Trigger a browser download. */
export function downloadFile(content, filename, mime) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
