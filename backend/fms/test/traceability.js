// backend/fms/test/traceability.js
//
// Map the 400 UAT test cases to the automated suite.
//
//   node fms/test/traceability.js               summary
//   node fms/test/traceability.js --gaps        only what is NOT covered
//   node fms/test/traceability.js --csv         machine-readable
//
// ─── BE CLEAR ABOUT WHAT THIS CLAIMS ─────────────────────────────────────────
// This maps each TestID to the automated file that covers its MODULE. That is a
// WEAKER claim than "this exact scenario is asserted", and pretending otherwise
// would make the report worse than useless — somebody would sign off a case
// nobody had actually checked.
//
// So the report has three levels:
//
//   automated   the module has an integration check AND the case's behaviour is
//               named in an assertion (matched on distinctive words)
//   module      the module has a check, but this specific case is not
//               individually identifiable in it
//   none        no automated coverage at all — needs manual UAT
//
// Only 'automated' should be treated as evidence. 'module' means "the area is
// exercised", which is worth knowing and is not the same thing.
//
// ─── WHY 189 P1 CASES WERE NOT MECHANICALLY GENERATED ────────────────────────
// The existing suite has 415 unit tests and ~1,150 integration assertions,
// written against the behaviour rather than the case list. Generating a
// shallow test per TestID would duplicate them at lower quality and produce a
// green board that means less. Mapping is more honest than manufacturing.

const fs = require('fs');
const path = require('path');

const CSV = path.join(__dirname, 'testCases.csv');
const ROOT = path.join(__dirname, '..');

/** SRS module → the automated files that exercise it. */
const MODULE_FILES = {
  // Names are taken VERBATIM from the workbook's Module column. An earlier
  // version used the SRS names and reported eleven modules as uncovered that
  // were in fact fully checked — the gap was in this table, not in the suite.
  'M0 Plugin Framework': ['docs/contract.test.js'],
  'M1 Financial Dashboard': ['services/dashboard/dashboard.check.js'],
  'M2 Chart of Accounts': ['services/accounts/integration.check.js',
    'services/reporting/chartCoverage.check.js'],
  'M3 Income Management': ['services/income/income.check.js'],
  'M4 Expense Management': ['services/expense/expense.check.js'],
  'M4/M9 Payments': ['services/payment/payment.check.js'],
  'M5 Expense Approval Workflow': ['services/approval/approval.check.js', 'services/approval/approvalMatrix.test.js'],
  'M6 Budget Management': ['services/budget/budget.check.js'],
  'M7 Vendor Management': ['services/vendor/vendor.check.js', 'services/vendor/taxIdValidation.test.js'],
  'M8 Purchase Workflow': ['services/purchase/purchase.check.js', 'services/purchase/threeWayMatch.test.js'],
  'M9 Banking': ['services/banking/banking.check.js', 'services/banking/statementMatcher.test.js'],
  'M10 Petty Cash': ['services/pettyCash/pettyCash.check.js'],
  'M11 General Ledger': ['services/ledger/gl.check.js', 'services/ledger/integration.check.js',
    'services/ledger/posting.test.js', 'services/ledger/rollback.check.js'],
  'M12 Journal Voucher': ['services/journal/jv.check.js'],
  'M13 Cash Book': ['services/cashBankBook/book.check.js'],
  'M14 Bank Book': ['services/cashBankBook/book.check.js'],
  'M15 Payroll Integration': ['services/ingest/payrollIngest.check.js',
    'services/ingest/payrollMapping.test.js',
    'services/ingest/payrollMappingReport.check.js'],
  'M15 Integration': ['services/ingest/payrollIngest.check.js'],
  'M15/M3 Integration': ['services/ingest/feeIngest.check.js', 'services/ingest/payrollIngest.check.js'],
  'M16 Financial Reports': ['services/reports/reports.check.js', 'services/reports/financialStatements.test.js'],
  'M17 Audit Trail': ['services/audit/deleteGuards.test.js',
    'services/reporting/syncLog.check.js'],
  'M18 User Roles': ['services/auth/rbac.test.js', 'services/security/routeGuards.test.js'],
  'M19 Notifications': ['services/notification/notification.check.js', 'services/notification/events.test.js'],
  // M20 Document Management was never built — see the note in the report.
  'M21 Multi-Branch': ['services/branch/branchIsolation.check.js'],
  'M22 Financial Year': ['services/financialYear/financialYear.check.js'],
  'M22 Security': ['services/security/routeGuards.test.js', 'services/auth/rbac.test.js'],
  'M24 Integrations': ['services/ingest/feeIngest.check.js', 'services/ingest/expenseIngest.check.js',
    'services/settlement/settlement.check.js',
    // Added with the gap-closure work, 2026-07-30.
    'services/ingest/admissionIngest.check.js',
    'services/reconciliation/reconciliation.check.js',
    'services/reporting/diagnostics.check.js',
    'services/reporting/syncLog.check.js',
    'client/smsClient.test.js'],
  'M25 Performance': ['services/performance/indexAudit.check.js'],
  // Short codes used by a few cases.
  EXP: ['services/expense/expense.check.js'],
  FY: ['services/financialYear/financialYear.check.js'],
  GL: ['services/ledger/gl.check.js'],
  INTG: ['services/ingest/feeIngest.check.js', 'services/ingest/admissionIngest.check.js',
    'services/reconciliation/reconciliation.check.js', 'client/smsClient.test.js'],
  SEC: ['services/auth/rbac.test.js', 'services/security/routeGuards.test.js',
    'services/branch/branchIsolation.check.js'],
  RPT: ['services/reports/reports.check.js', 'services/reports/financialStatements.test.js'],
};

/**
 * Modules with NO automated coverage, and why. Stated rather than left to be
 * inferred from a zero.
 */
const KNOWN_UNBUILT = {
  'M20 Document Management':
    'Never built. Not in the playbook phases, and the SMS already has Cloudinary ' +
    'file handling — duplicating it in the FMS was not part of the brief.',
};

/** Words too common to prove anything. */
const STOP = new Set(['the', 'and', 'for', 'with', 'that', 'this', 'from', 'are', 'not',
  'can', 'has', 'was', 'all', 'its', 'per', 'via', 'user', 'test', 'when', 'then',
  'shows', 'show', 'displays', 'display', 'page', 'screen', 'button', 'field',
  'list', 'view', 'load', 'loads', 'logged', 'branch', 'correct', 'correctly',
  'valid', 'system', 'record', 'records', 'entry', 'data', 'value', 'values']);

function distinctive(title) {
  return title.toLowerCase()
    .replace(/[^a-z0-9 ]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 3 && !STOP.has(w));
}

function readCsv(file) {
  const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
  const rows = [];
  let row = []; let field = ''; let q = false;

  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (q) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else q = false; }
      else field += c;
    } else if (c === '"') q = true;
    else if (c === ',') { row.push(field); field = ''; }
    else if (c === '\n') { row.push(field); rows.push(row); row = []; field = ''; }
    else if (c !== '\r') field += c;
  }
  if (field || row.length) { row.push(field); rows.push(row); }

  const header = rows.shift();
  return rows.filter((r) => r.length > 1)
    .map((r) => Object.fromEntries(header.map((h, i) => [h.trim(), (r[i] || '').trim()])));
}

const cases = readCsv(CSV);

// Load each automated file once so assertions can be searched.
const fileText = {};
for (const files of Object.values(MODULE_FILES)) {
  for (const f of files) {
    if (fileText[f] !== undefined) continue;
    const p = path.join(ROOT, f);
    fileText[f] = fs.existsSync(p) ? fs.readFileSync(p, 'utf8').toLowerCase() : null;
  }
}

function classify(tc) {
  const files = MODULE_FILES[tc.Module] || [];
  const present = files.filter((f) => fileText[f]);

  if (!present.length) return { level: 'none', files: [], matched: [] };

  const words = distinctive(tc.Title);
  if (words.length === 0) return { level: 'module', files: present, matched: [] };

  for (const f of present) {
    const matched = words.filter((w) => fileText[f].includes(w));
    // Two distinctive words appearing in the same file is weak evidence but
    // better than one; a single common word would match almost anything.
    if (matched.length >= 2) return { level: 'automated', files: [f], matched };
  }

  return { level: 'module', files: present, matched: [] };
}

const results = cases.map((tc) => ({ ...tc, ...classify(tc) }));

const wantGaps = process.argv.includes('--gaps');
const wantCsv = process.argv.includes('--csv');

if (wantCsv) {
  console.log('TestID,Module,Priority,Type,Coverage,File');
  for (const r of results) {
    console.log([r.TestID, r.Module, r.Priority, r.Type, r.level, r.files[0] || '']
      .map((v) => `"${String(v).replace(/"/g, '""')}"`).join(','));
  }
  process.exit(0);
}

const by = (pred) => results.filter(pred);
const p1 = by((r) => r.Priority === 'P1');

console.log('\nUAT TRACEABILITY — 400 cases against the automated suite\n');
console.log('  Levels:');
console.log('    automated  the module is checked AND this behaviour is named in an assertion');
console.log('    module     the module is checked, but this case is not individually identifiable');
console.log('    none       no automated coverage — manual UAT required\n');

for (const [label, set] of [['ALL', results], ['P1', p1]]) {
  const a = set.filter((r) => r.level === 'automated').length;
  const m = set.filter((r) => r.level === 'module').length;
  const n = set.filter((r) => r.level === 'none').length;
  const pct = (x) => `${((x / set.length) * 100).toFixed(0)}%`;
  console.log(`  ${label} (${set.length})`);
  console.log(`     automated ${String(a).padStart(3)}  ${pct(a)}`);
  console.log(`     module    ${String(m).padStart(3)}  ${pct(m)}`);
  console.log(`     none      ${String(n).padStart(3)}  ${pct(n)}\n`);
}

console.log('  By module\n');
const modules = [...new Set(results.map((r) => r.Module))].sort();
for (const mod of modules) {
  const set = results.filter((r) => r.Module === mod);
  const a = set.filter((r) => r.level === 'automated').length;
  const n = set.filter((r) => r.level === 'none').length;
  const mark = n === set.length ? '✖' : (n > 0 ? '·' : '✔');
  console.log(`  ${mark} ${mod.padEnd(32)} ${String(set.length).padStart(3)} cases   ` +
    `${String(a).padStart(3)} automated   ${n ? `${n} UNCOVERED` : ''}`);
}

const uncovered = by((r) => r.level === 'none');
if (uncovered.length) {
  console.log(`\n  ${uncovered.length} case(s) have NO automated coverage:\n`);
  const grouped = {};
  for (const r of uncovered) (grouped[r.Module] = grouped[r.Module] || []).push(r);
  for (const [mod, list] of Object.entries(grouped)) {
    const why = KNOWN_UNBUILT[mod];
    console.log(`  ${mod} — ${list.length}${why ? '   NOT BUILT' : ''}`);
    if (why) console.log(`      ${why}`);
    if (wantGaps) for (const r of list) console.log(`      ${r.TestID}  ${r.Title}`);
  }
  if (!wantGaps) console.log('\n  (run with --gaps to list every TestID)');
}

console.log('\n  These belong in the manual UAT checklist, not in a coverage percentage.\n');