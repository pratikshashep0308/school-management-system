// 005 — seed the Chart of Accounts.
//
// ⛔ BLOCKED pending discovery item O3.
//
// The account codes below are PROPOSALS from docs/discovery/04_integration_plan.md
// §8. They have not been reviewed by anyone who understands this school's books.
//
// Why this migration refuses to run rather than seeding the proposals:
// once ledger entries exist against an account, changing that account's code
// means migrating every posting that references it. The denormalised
// `accountCode` snapshot on fms_ledgerentries makes that worse, not better —
// historical entries would carry the old code while the account carries the new
// one. Seeding unreviewed codes is cheap today and expensive in three months.
//
// TO UNBLOCK:
//   1. Have the school's accountant review §8 of 04_integration_plan.md
//   2. Correct the ACCOUNTS table below to match what they confirm
//   3. Delete the `blocked` property from this module
//   4. node fms/migrations/_runner.js up

module.exports = {
  id: '005_seed_chart_of_accounts',
  description: 'Seed the Chart of Accounts (posting heads)',

  // Remove this line once O3 is signed off.
  blocked: 'O3 — Chart of Accounts codes not yet confirmed by the school accountant',

  collections: ['fms_accounts'],

  async up(db) {
    const school = await db.collection('schools').findOne({});
    if (!school) throw new Error('No school document found — cannot scope FMS data.');

    const groups = await db.collection('fms_accountgroups')
      .find({ school: school._id }).toArray();
    const groupId = Object.fromEntries(groups.map((g) => [g.groupCode, g._id]));
    if (!Object.keys(groupId).length) {
      throw new Error('No account groups — run 004 first.');
    }

    // [code, name, groupCode, accountType, normalBalance, {flags}]
    const ACCOUNTS = [
      // ── Assets ──
      ['1101', 'Cash in Hand',                    '1110', 'asset',     'debit',  { isCashAccount: true }],
      ['1102', 'Petty Cash',                      '1110', 'asset',     'debit',  { isCashAccount: true }],
      ['1201', 'Bank — Current A/c',              '1120', 'asset',     'debit',  { isBankAccount: true }],
      ['1202', 'Bank — Online Collections',       '1120', 'asset',     'debit',  { isBankAccount: true }],
      ['1301', 'Advances to Vendors',             '1140', 'asset',     'debit',  {}],
      ['1310', 'Fee Receivable',                  '1130', 'asset',     'debit',  {}],

      // ── Liabilities ──
      ['2101', 'Salary Payable',                  '2110', 'liability', 'credit', {}],
      ['2102', 'PF Payable',                      '2120', 'liability', 'credit', {}],
      ['2103', 'TDS Payable',                     '2120', 'liability', 'credit', {}],
      ['2104', 'Staff Loan Recovery',             '2110', 'liability', 'credit', {}],
      // 2105 / 2106 exist as heads but are never posted from ingest — the SMS
      // SalarySlip has no ESIC or Professional Tax field (discovery G1 / O1).
      ['2105', 'ESIC Payable',                    '2120', 'liability', 'credit', {}],
      ['2106', 'Professional Tax Payable',        '2120', 'liability', 'credit', {}],
      ['2109', 'Other Deductions Payable',        '2110', 'liability', 'credit', {}],
      ['2201', 'Sundry Creditors',                '2130', 'liability', 'credit', {}],
      ['2301', 'Fee Received in Advance',         '2100', 'liability', 'credit', {}],

      // ── Equity ──
      ['3101', 'Capital Fund',                    '3100', 'equity',    'credit', {}],
      ['3201', 'Surplus / Deficit',               '3200', 'equity',    'credit', {}],

      // ── Income (fee heads map to SMS FeeType.category) ──
      ['4101', 'Tuition Fee Income',              '4100', 'income',    'credit', {}],
      ['4102', 'Examination Fee Income',          '4100', 'income',    'credit', {}],
      ['4103', 'Transport Fee Income',            '4100', 'income',    'credit', {}],
      ['4104', 'Uniform Sales Income',            '4100', 'income',    'credit', {}],
      ['4105', 'Library Fee Income',              '4100', 'income',    'credit', {}],
      ['4106', 'Sports Fee Income',               '4100', 'income',    'credit', {}],
      ['4107', 'Other Fee Income',                '4100', 'income',    'credit', {}],
      ['4108', 'Late Fee Income',                 '4100', 'income',    'credit', {}],
      // Payments sourced from StudentFee.paymentHistory carry no feeType, so
      // they land here and are flagged for manual reclassification.
      ['4109', 'Fee Income — Unclassified',       '4100', 'income',    'credit', {}],
      ['4201', 'Donations & Grants',              '4200', 'income',    'credit', {}],
      ['4301', 'Interest Income',                 '4300', 'income',    'credit', {}],
      ['4302', 'Miscellaneous Income',            '4300', 'income',    'credit', {}],

      // ── Expenditure ──
      ['5101', 'Salary & Wages Expense',          '5100', 'expense',   'debit',  {}],
      ['5102', 'Staff Welfare',                   '5100', 'expense',   'debit',  {}],
      ['5201', 'Printing & Stationery',           '5200', 'expense',   'debit',  {}],
      ['5202', 'Office Expenses',                 '5200', 'expense',   'debit',  {}],
      ['5203', 'Professional Fees',               '5200', 'expense',   'debit',  {}],
      ['5301', 'Teaching Materials',              '5300', 'expense',   'debit',  {}],
      ['5302', 'Examination Expenses',            '5300', 'expense',   'debit',  {}],
      ['5401', 'Fuel & Vehicle Running',          '5400', 'expense',   'debit',  {}],
      ['5402', 'Vehicle Maintenance',             '5400', 'expense',   'debit',  {}],
      ['5501', 'Electricity & Water',             '5500', 'expense',   'debit',  {}],
      ['5502', 'Building Maintenance',            '5500', 'expense',   'debit',  {}],
      ['5299', 'Other Expenses',                  '5200', 'expense',   'debit',  {}],
    ];

    const now = new Date();
    for (const [code, name, gCode, type, balance, flags] of ACCOUNTS) {
      if (!groupId[gCode]) throw new Error(`Account ${code}: unknown group ${gCode}`);
      await db.collection('fms_accounts').updateOne(
        { school: school._id, accountCode: code },
        {
          $setOnInsert: {
            school: school._id,
            accountCode: code,
            accountName: name,
            accountGroup: groupId[gCode],
            accountType: type,
            normalBalance: balance,
            isPostable: true,
            isBankAccount: !!flags.isBankAccount,
            isCashAccount: !!flags.isCashAccount,
            openingBalance: 0,
            currentBalance: 0,
            smsFeeTypeId: null,
            smsExpenseCategoryId: null,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
    }
  },

  async down(db) {
    // Refuse to drop accounts that already carry postings — that would orphan
    // ledger entries and make the trial balance unexplainable.
    const used = await db.collection('fms_ledgerentries').distinct('account');
    if (used.length) {
      throw new Error(
        `Cannot roll back: ${used.length} account(s) already have ledger entries. ` +
        'Reverse the vouchers first.'
      );
    }
    await db.collection('fms_accounts').deleteMany({});
  },
};