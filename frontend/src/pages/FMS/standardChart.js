// frontend/src/pages/FMS/standardChart.js
//
// The standard chart of accounts, for review and approval by the school's
// accountant. This is open item O3 — the single thing blocking the whole
// finance system.
//
// ─── THIS MIRRORS backend/fms/migrations/scripts/005_seed_chart_of_accounts.js ─
// The two must stay in step. It is duplicated here rather than fetched because
// migration 005 is deliberately BLOCKED pending sign-off, so the backend does
// not serve this list from anywhere yet.
//
// Creating accounts from this screen goes through the ordinary POST /fms/accounts
// endpoint — so every account is created with an audit record and an author,
// which running a migration would not give.
//
// ─── THE GROUPS ALREADY EXIST ────────────────────────────────────────────────
// Migration 004 seeded the account GROUPS and has been applied. Only the account
// heads below are outstanding.

/** Accounts awaiting approval. group is the groupCode from migration 004. */
export const STANDARD_ACCOUNTS = [
  // ── Assets ─────────────────────────────────────────────────────────────────
  { code: '1101', name: 'Cash in Hand',              group: '1110', type: 'asset',     normalBalance: 'debit',  isCashAccount: true },
  { code: '1102', name: 'Petty Cash',                group: '1110', type: 'asset',     normalBalance: 'debit',  isCashAccount: true },
  { code: '1201', name: 'Bank — Current A/c',        group: '1120', type: 'asset',     normalBalance: 'debit',  isBankAccount: true },
  {
    code: '1202', name: 'Bank — Online Collections', group: '1120', type: 'asset',     normalBalance: 'debit',  isBankAccount: true,
    note: 'Online and UPI fee payments land here, NOT in the bank account, because the money has not settled yet. Somebody must settle them against the bank credit each week — otherwise this balance grows and the bank balance reads low.',
  },
  { code: '1301', name: 'Advances to Vendors',       group: '1140', type: 'asset',     normalBalance: 'debit' },
  { code: '1310', name: 'Fee Receivable',            group: '1130', type: 'asset',     normalBalance: 'debit' },

  // ── Liabilities ────────────────────────────────────────────────────────────
  { code: '2101', name: 'Salary Payable',            group: '2110', type: 'liability', normalBalance: 'credit' },
  { code: '2102', name: 'PF Payable',                group: '2120', type: 'liability', normalBalance: 'credit' },
  { code: '2103', name: 'TDS Payable',               group: '2120', type: 'liability', normalBalance: 'credit' },
  { code: '2104', name: 'Staff Loan Recovery',       group: '2110', type: 'liability', normalBalance: 'credit' },
  {
    code: '2105', name: 'ESIC Payable',              group: '2120', type: 'liability', normalBalance: 'credit',
    decision: true,
    note: 'The salary records in the school system have NO field for ESIC, so nothing can post here automatically. Please confirm whether the school deducts ESIC. If it does, the amount is currently inside "other deductions" and cannot be separated without a change to the salary system. (Open item O1.)',
  },
  {
    code: '2106', name: 'Professional Tax Payable',  group: '2120', type: 'liability', normalBalance: 'credit',
    decision: true,
    note: 'As above — the salary records have no Professional Tax field. Please confirm whether the school deducts it.',
  },
  { code: '2109', name: 'Other Deductions Payable',  group: '2110', type: 'liability', normalBalance: 'credit' },
  { code: '2201', name: 'Sundry Creditors',          group: '2130', type: 'liability', normalBalance: 'credit' },
  { code: '2301', name: 'Fee Received in Advance',   group: '2100', type: 'liability', normalBalance: 'credit' },

  // ── Equity ─────────────────────────────────────────────────────────────────
  { code: '3101', name: 'Capital Fund',              group: '3100', type: 'equity',    normalBalance: 'credit' },
  { code: '3201', name: 'Surplus / Deficit',         group: '3200', type: 'equity',    normalBalance: 'credit' },

  // ── Income ─────────────────────────────────────────────────────────────────
  { code: '4101', name: 'Tuition Fee Income',        group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4102', name: 'Examination Fee Income',    group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4103', name: 'Transport Fee Income',      group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4104', name: 'Uniform Sales Income',      group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4105', name: 'Library Fee Income',        group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4106', name: 'Sports Fee Income',         group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4107', name: 'Other Fee Income',          group: '4100', type: 'income',    normalBalance: 'credit' },
  { code: '4108', name: 'Late Fee Income',           group: '4100', type: 'income',    normalBalance: 'credit' },
  {
    code: '4109', name: 'Fee Income — Unclassified', group: '4100', type: 'income',    normalBalance: 'credit',
    note: 'Some older fee payments in the school system do not record which fee type they were for. Those land here and are flagged so somebody can reclassify them later. It is not an error.',
  },
  { code: '4201', name: 'Donations & Grants',        group: '4200', type: 'income',    normalBalance: 'credit' },
  { code: '4301', name: 'Interest Income',           group: '4300', type: 'income',    normalBalance: 'credit' },
  { code: '4302', name: 'Miscellaneous Income',      group: '4300', type: 'income',    normalBalance: 'credit' },

  // ── Expenditure ────────────────────────────────────────────────────────────
  { code: '5101', name: 'Salary & Wages Expense',    group: '5100', type: 'expense',   normalBalance: 'debit' },
  { code: '5102', name: 'Staff Welfare',             group: '5100', type: 'expense',   normalBalance: 'debit' },
  { code: '5201', name: 'Printing & Stationery',     group: '5200', type: 'expense',   normalBalance: 'debit' },
  { code: '5202', name: 'Office Expenses',           group: '5200', type: 'expense',   normalBalance: 'debit' },
  { code: '5203', name: 'Professional Fees',         group: '5200', type: 'expense',   normalBalance: 'debit' },
  { code: '5299', name: 'Other Expenses',            group: '5200', type: 'expense',   normalBalance: 'debit' },
  { code: '5301', name: 'Teaching Materials',        group: '5300', type: 'expense',   normalBalance: 'debit' },
  { code: '5302', name: 'Examination Expenses',      group: '5300', type: 'expense',   normalBalance: 'debit' },
  { code: '5401', name: 'Fuel & Vehicle Running',    group: '5400', type: 'expense',   normalBalance: 'debit' },
  { code: '5402', name: 'Vehicle Maintenance',       group: '5400', type: 'expense',   normalBalance: 'debit' },
  { code: '5501', name: 'Electricity & Water',       group: '5500', type: 'expense',   normalBalance: 'debit' },
  { code: '5502', name: 'Building Maintenance',      group: '5500', type: 'expense',   normalBalance: 'debit' },
];

/** Plain-language headings for the review screen. */
export const TYPE_LABEL = {
  asset: 'Assets — what the school owns or is owed',
  liability: 'Liabilities — what the school owes',
  equity: 'Funds — the school\'s own money',
  income: 'Income — money coming in',
  expense: 'Expenditure — money going out',
};

export const TYPE_ORDER = ['asset', 'liability', 'equity', 'income', 'expense'];