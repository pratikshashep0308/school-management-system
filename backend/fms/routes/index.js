// backend/fms/routes/index.js
//
// The FMS router. Mounted at /api/fms by server.js ONLY when FMS_ENABLED=true.
// When the flag is off this file is never required, so /api/fms/* falls through
// to the SMS 404 handler.
//
// Deliberately NOT wrapped in the SMS `checkPermission` middleware — see
// fms/middleware/fmsAuthorize.js for why.

const express = require('express');
const router = express.Router();

const config = require('../config');
const smsClient = require('../client/smsClient');
const openapi = require('../docs/openapi');
const { fmsErrorHandler, notFoundHandler } = require('../middleware/fmsErrorHandler');

// The SMS's own JWT verifier. Reused as-is: the FMS does not reimplement
// authentication, only authorization.
const { protect } = require('../../middleware/auth');

// ─────────────────────────────────────────────────────────────────────────────
// Public — no authentication
// ─────────────────────────────────────────────────────────────────────────────

router.get('/status', (req, res) => {
  res.json({
    success: true,
    data: {
      enabled: true,               // if this handler runs, the plugin is mounted
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

  // Transactions need a replica set. A standalone mongod cannot run the ledger
  // posting engine at all, so surface it here rather than at first posting.
  let replicaSet = 'unknown';
  try {
    const info = await mongoose.connection.db.admin().command({ hello: 1 });
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
    ...(transactionsAvailable ? {} : {
      message:
        'MongoDB is not a replica set. FMS ledger postings require transactions ' +
        'and will not run.',
    }),
  });
});

router.get('/health/sms', async (req, res) => {
  const result = await smsClient.health();
  res.status(result.reachable ? 200 : 503).json({ success: result.reachable, data: result });
});

// ─────────────────────────────────────────────────────────────────────────────
// Living documentation
// ─────────────────────────────────────────────────────────────────────────────

router.get('/docs/openapi.json', (req, res) => {
  res.json(openapi);
});

router.get('/docs', (req, res) => {
  // helmet sets `script-src 'self'` globally, which would block the Redoc
  // bundle. Relaxed HERE ONLY, on a route that renders no user data and
  // accepts no input. The SMS's CSP is untouched everywhere else.
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; " +
    "script-src 'self' 'unsafe-inline' https://cdn.redoc.ly; " +
    "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; " +
    "font-src 'self' https://fonts.gstatic.com data:; " +
    "img-src 'self' data: https://cdn.redoc.ly; " +
    "worker-src 'self' blob:;"
  );

  res.type('html').send(`<!DOCTYPE html>
<html>
  <head>
    <title>FMS API — v${openapi.info.version}</title>
    <meta charset="utf-8"/>
    <meta name="viewport" content="width=device-width, initial-scale=1"/>
    <meta name="robots" content="noindex, nofollow"/>
    <style>body { margin: 0; padding: 0; }</style>
  </head>
  <body>
    <redoc spec-url="./docs/openapi.json"></redoc>
    <script src="https://cdn.redoc.ly/redoc/latest/bundles/redoc.standalone.js"></script>
  </body>
</html>`);
});

// ─────────────────────────────────────────────────────────────────────────────
// Authenticated domain routes
//
// `protect` verifies the JWT and loads req.user. Each route then applies
// fmsAuthorize(moduleKey, action), which denies unless an active
// fms_roleassignments row grants the required level.
// ─────────────────────────────────────────────────────────────────────────────

router.use('/financial-years', protect, require('./financialYear'));
router.use('/accounts', protect, require('./accounts'));           // Chart of Accounts (P2.1)
router.use('/ledger',   protect, require('./ledger'));             // General Ledger, READ-ONLY (P2.2)
router.use('/journal',  protect, require('./journal'));            // Journal Vouchers (P2.3)
router.use('/books',    protect, require('./books'));              // Cash & Bank Book (P2.4)
router.use('/income',   protect, require('./income'));             // Income Management (P3.1)
router.use('/expenses', protect, require('./expense'));            // Expense Requests (P3.2)
router.use('/approvals',protect, require('./approval'));           // Approval Workflow (P3.3)

// Mounted as their phases land. Listed so the mount points and permission
// module keys are fixed now.
//
// P3.4  router.use('/payments',      protect, require('./payments'));       // 'payments'
// P4.1  router.use('/budgets',       protect, require('./budget'));         // 'budgets'
// P4.2  router.use('/vendors',       protect, require('./vendor'));         // 'vendors'
// P4.3  router.use('/purchase',      protect, require('./purchase'));       // 'purchase'
// P4.4  router.use('/banking',       protect, require('./banking'));        // 'banking'
// P4.5  router.use('/petty-cash',    protect, require('./pettyCash'));      // 'pettyCash'
// P5.x  router.use('/integrations',  protect, require('./integrations'));   // 'ledger'
// P6.1  router.use('/reports',       protect, require('./reports'));        // 'financialReports'
// P6.2  router.use('/audit',         protect, require('./audit'));          // 'audit'

// ─────────────────────────────────────────────────────────────────────────────
// Terminal handlers. Order matters: 404 first, then the error handler.
// Both are scoped to this router, so SMS error handling is untouched.
// ─────────────────────────────────────────────────────────────────────────────
router.use(notFoundHandler);
router.use(fmsErrorHandler);

module.exports = router;