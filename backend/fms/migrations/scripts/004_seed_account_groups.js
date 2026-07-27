// 004 — seed the standard account-group tree.
//
// Groups are structural (asset/liability/income/expense/equity and their common
// subdivisions). They are NOT the Chart of Accounts — the actual posting heads
// with their codes are migration 005, which is blocked pending sign-off.
//
// This split is deliberate: the group tree is standard double-entry structure
// and does not depend on how this particular school labels its accounts, so it
// can land now without pre-empting the accountant's decisions.

module.exports = {
  id: '004_seed_account_groups',
  description: 'Seed the standard account-group tree',

  collections: ['fms_accountgroups'],

  async up(db) {
    const school = await db.collection('schools').findOne({});
    if (!school) throw new Error('No school document found — cannot scope FMS data.');

    // [groupCode, groupName, accountType, normalBalance, parentCode|null, level]
    const groups = [
      ['1000', 'Assets',                 'asset',     'debit',  null,   1],
      ['1100', 'Current Assets',         'asset',     'debit',  '1000', 2],
      ['1110', 'Cash in Hand',           'asset',     'debit',  '1100', 3],
      ['1120', 'Bank Accounts',          'asset',     'debit',  '1100', 3],
      ['1130', 'Receivables',            'asset',     'debit',  '1100', 3],
      ['1140', 'Advances',               'asset',     'debit',  '1100', 3],
      ['1200', 'Fixed Assets',           'asset',     'debit',  '1000', 2],

      ['2000', 'Liabilities',            'liability', 'credit', null,   1],
      ['2100', 'Current Liabilities',    'liability', 'credit', '2000', 2],
      ['2110', 'Payroll Liabilities',    'liability', 'credit', '2100', 3],
      ['2120', 'Statutory Dues',         'liability', 'credit', '2100', 3],
      ['2130', 'Sundry Creditors',       'liability', 'credit', '2100', 3],
      ['2200', 'Long Term Liabilities',  'liability', 'credit', '2000', 2],

      ['3000', 'Equity & Funds',         'equity',    'credit', null,   1],
      ['3100', 'Corpus / Capital Fund',  'equity',    'credit', '3000', 2],
      ['3200', 'Reserves & Surplus',     'equity',    'credit', '3000', 2],

      ['4000', 'Income',                 'income',    'credit', null,   1],
      ['4100', 'Fee Income',             'income',    'credit', '4000', 2],
      ['4200', 'Grants & Donations',     'income',    'credit', '4000', 2],
      ['4300', 'Other Income',           'income',    'credit', '4000', 2],

      ['5000', 'Expenditure',            'expense',   'debit',  null,   1],
      ['5100', 'Personnel Costs',        'expense',   'debit',  '5000', 2],
      ['5200', 'Administrative Expenses','expense',   'debit',  '5000', 2],
      ['5300', 'Academic Expenses',      'expense',   'debit',  '5000', 2],
      ['5400', 'Transport Expenses',     'expense',   'debit',  '5000', 2],
      ['5500', 'Maintenance & Utilities','expense',   'debit',  '5000', 2],
    ];

    const now = new Date();
    const idByCode = {};

    // Two passes so parents exist before children reference them.
    for (const [code, name, type, balance, , level] of groups) {
      await db.collection('fms_accountgroups').updateOne(
        { school: school._id, groupCode: code },
        {
          $setOnInsert: {
            school: school._id,
            groupCode: code,
            groupName: name,
            accountType: type,
            normalBalance: balance,
            parent: null,
            level,
            isSystem: true,
            status: 'active',
            createdAt: now,
            updatedAt: now,
          },
        },
        { upsert: true }
      );
      const doc = await db.collection('fms_accountgroups').findOne(
        { school: school._id, groupCode: code }, { projection: { _id: 1 } }
      );
      idByCode[code] = doc._id;
    }

    for (const [code, , , , parentCode] of groups) {
      if (!parentCode) continue;
      await db.collection('fms_accountgroups').updateOne(
        { school: school._id, groupCode: code },
        { $set: { parent: idByCode[parentCode], updatedAt: now } }
      );
    }
  },

  async down(db) {
    await db.collection('fms_accountgroups').deleteMany({ isSystem: true });
  },
};