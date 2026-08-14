// 002 — seed the current financial year and baseline plugin settings.
//
// The SMS has no financial-year concept at all, so this is entirely FMS-owned.
// Indian FY: 1 April – 31 March.
//
// The school id is read from the SMS `schools` collection — a READ, never a
// write. This is the one place the runner touches an SMS collection, and it is
// read-only by construction (find, no update). Everything it WRITES is fms_,
// which is what the runner's guard checks.

const config = require('../../config');

module.exports = {
  id: '002_seed_financial_year',
  description: 'Seed current financial year + baseline fms_settings',

  collections: ['fms_financialyears', 'fms_settings'],

  async up(db) {
    // Read the tenant. Single-school deployment today, but scoped properly.
    const school = await db.collection('schools').findOne({});
    if (!school) {
      throw new Error(
        'No document in the SMS `schools` collection — cannot scope FMS data. ' +
        'Every FMS document requires a school id.'
      );
    }

    const fy = config.financialYear.current();
    const yearCode = fy.code.replace(/^FY/, '');   // 'FY2026-27' → '2026-27'
    const now = new Date();

    await db.collection('fms_financialyears').updateOne(
      { school: school._id, yearCode },
      {
        $setOnInsert: {
          school: school._id,
          yearCode,
          startDate: fy.startDate,
          endDate: fy.endDate,
          fyStatus: 'open',
          isCurrent: true,
          openingBalancesPosted: false,
          lockedModules: [],
          status: 'active',
          createdAt: now,
          updatedAt: now,
        },
      },
      { upsert: true }
    );

    const settings = [
      { key: 'plugin.version', value: config.version, description: 'FMS plugin version at seed time' },
      { key: 'sms.baseUrl', value: config.sms.baseUrl, description: 'SMS REST base URL' },
      { key: 'ingest.cadence.fees', value: config.ingest.fees, description: 'Cron for fee ingest' },
      { key: 'ingest.cadence.payroll', value: config.ingest.payroll, description: 'Cron for payroll ingest' },
      { key: 'ingest.cadence.expenses', value: config.ingest.expenses, description: 'Cron for expense ingest' },
      { key: 'ingest.cadence.reconciliation', value: config.ingest.reconciliation, description: 'Cron for reconciliation' },
      {
        key: 'ingest.idempotencyKey.fees',
        value: 'receiptNumber',
        description:
          'Verified on production 2026-07-27: 0 duplicates, 0 null/blank across ' +
          'studentfees.paymentHistory and feeassignments.payments (discovery O4)',
      },
      {
        key: 'ingest.source.fees',
        value: 'union:studentfees.paymentHistory + feeassignments.payments',
        description:
          'Deviation from DATA_DICTIONARY §9. payAssignment mirrors into StudentFee ' +
          'only when a ledger already exists, so assignment-only payments would be ' +
          'missed by the single-source design (discovery P0.3 F1)',
      },
    ];

    for (const s of settings) {
      await db.collection('fms_settings').updateOne(
        { school: null, key: s.key },
        {
          $set: { value: s.value, description: s.description, updatedAt: now },
          $setOnInsert: { school: null, key: s.key, createdAt: now },
        },
        { upsert: true }
      );
    }
  },

  async down(db) {
    const school = await db.collection('schools').findOne({});
    if (school) {
      await db.collection('fms_financialyears').deleteMany({ school: school._id });
    }
    // Leave `migrations.applied` alone — the runner owns that key.
    await db.collection('fms_settings').deleteMany({
      school: null,
      key: { $ne: 'migrations.applied' },
    });
  },
};