// backend/fms/routes/index.js
//
// The FMS router. Mounted at /api/fms by server.js ONLY when FMS_ENABLED=true.
// When the flag is off this file is never required, so /api/fms/* falls through
// to the SMS 404 handler — which is the required behaviour.
//
// This router is deliberately NOT wrapped in the SMS `checkPermission`
// middleware (see fms/middleware/fmsAuthorize.js for why).

const express = require('express');
const router = express.Router();

const config = require('../config');
const smsClient = require('../client/smsClient');

// ─────────────────────────────────────────────────────────────────────────────
// Public plugin endpoints — no auth.
// The UI calls /status to decide whether to render FMS navigation at all.
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: true, // if this handler runs at all, the plugin is mounted
      version: config.version,
      currency: config.currency.code,
      financialYear: config.financialYear.current().code,
    },
  });
});

router.get('/health', async (req, res) => {
  const mongoose = require('mongoose');

  const states = ['disconnected', 'connected', 'connecting', 'disconnecting'];
  const dbState = states[mongoose.connection.readyState] || 'unknown';

  // Transactions need a replica set. Standalone mongod cannot run the ledger
  // posting engine at all, so surface it here rather than failing at P1.4.
  let replicaSet = 'unknown';
  try {
    const admin = mongoose.connection.db.admin();
    const info = await admin.command({ hello: 1 });
    replicaSet = info.setName ? `rs:${info.setName}` : 'standalone';
  } catch (err) {
    replicaSet = `unavailable (${err.message})`;
  }

  const transactionsAvailable = replicaSet.startsWith('rs:');

  res.status(transactionsAvailable ? 200 : 503).json({
    success: transactionsAvailable,
    data: {
      status: transactionsAvailable ? 'OK' : 'DEGRADED',
      version: config.version,
      database: dbState,
      replicaSet,
      transactionsAvailable,
      ingestEnabled: config.ingest.enabled,
      timestamp: new Date().toISOString(),
    },
    ...(transactionsAvailable
      ? {}
      : {
          message:
            'MongoDB is not a replica set. FMS ledger postings require transactions and will not run.',
        }),
  });
});

// Deeper probe — also checks the SMS REST boundary. Separate from /health so a
// slow or unreachable SMS never makes the plugin itself look down.
router.get('/health/sms', async (req, res) => {
  const result = await smsClient.health();
  res.status(result.reachable ? 200 : 503).json({ success: result.reachable, data: result });
});

// ─────────────────────────────────────────────────────────────────────────────
// Domain routes — mounted from Phase 2 onward.
//
// Each is scaffolded but not implemented. They are listed here (commented) so
// the mount points and their FMS permission module keys are fixed now and the
// later prompts have an unambiguous place to attach.
//
// Every one of these will pass through fmsAuthorize(moduleKey, level).
// ─────────────────────────────────────────────────────────────────────────────

// P2.1  router.use('/accounts',        require('./accounts'));            // 'accounts'
// P2.2  router.use('/ledger',          require('./ledger'));              // 'ledger'
// P2.3  router.use('/journal',         require('./journal'));             // 'journal'
// P2.4  router.use('/books',           require('./cashBankBook'));        // 'ledger'
// P3.1  router.use('/income',          require('./income'));              // 'income'
// P3.2  router.use('/expenses',        require('./expense'));             // 'expenses'
// P3.3  router.use('/approvals',       require('./approval'));            // 'approvals'
// P3.4  router.use('/payments',        require('./payments'));            // 'payments'
// P4.1  router.use('/budgets',         require('./budget'));              // 'budgets'
// P4.2  router.use('/vendors',         require('./vendor'));              // 'vendors'
// P4.3  router.use('/purchase',        require('./purchase'));            // 'purchase'
// P4.4  router.use('/banking',         require('./banking'));             // 'banking'
// P4.5  router.use('/petty-cash',      require('./pettyCash'));           // 'pettyCash'
// P5.x  router.use('/integrations',    require('./integrations'));        // 'ledger'
// P6.1  router.use('/reports',         require('./reports'));             // 'financialReports'
// P6.2  router.use('/audit',           require('./audit'));               // 'audit'
// P6.3  router.use('/notifications',   require('./notifications'));       // 'financialReports'
// P7.1  router.use('/financial-years', require('./financialYear'));       // 'financialYear'

// ─────────────────────────────────────────────────────────────────────────────
// FMS-scoped 404. Keeps unknown /api/fms/* paths inside the plugin's own
// response shape instead of falling through to the SMS handler.
// ─────────────────────────────────────────────────────────────────────────────
router.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: `FMS route ${req.originalUrl} not found`,
  });
});

module.exports = router;