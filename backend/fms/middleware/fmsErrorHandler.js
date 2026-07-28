// backend/fms/middleware/fmsErrorHandler.js
//
// Terminal error handler for /api/fms/*.
//
// Mounted at the END of the FMS router, so it never touches SMS routes. The
// SMS keeps its own error handling exactly as-is.
//
// Every FMS failure leaves through here in one shape:
//     { success: false, error: { code, message, details? } }

const { ApiError, errors } = require('../utils/apiResponse');
const { PostingError } = require('../services/ledger/LedgerPostingService');

/**
 * Map a LedgerPostingService error code to an HTTP status.
 *
 * The distinction that matters: a caller sending an unbalanced voucher made a
 * mistake (422). A caller posting into a locked financial year is asking for
 * something that conflicts with current state (409). Collapsing both into 400
 * would lose that, and the frontend needs to tell the user different things.
 */
const POSTING_STATUS = {
  // 422 — the request content is wrong
  UNBALANCED: 422,
  TOO_FEW_LEGS: 422,
  BAD_LINE_DIRECTION: 422,
  NOT_INTEGER_PAISE: 422,
  NEGATIVE_AMOUNT: 422,
  ZERO_TOTAL: 422,
  MISSING_ACCOUNT: 422,
  MISSING_SCHOOL: 422,
  MISSING_FY: 422,
  MISSING_POSTED_BY: 422,
  MISSING_SOURCE_ID: 422,
  BAD_VOUCHER_TYPE: 422,
  DATE_OUTSIDE_FY: 422,

  // 404 — referenced thing does not exist
  ACCOUNT_NOT_FOUND: 404,
  FY_NOT_FOUND: 404,
  VOUCHER_NOT_FOUND: 404,

  // 409 — conflicts with current state
  FY_LOCKED: 409,
  BANK_PERIOD_RECONCILED: 409,
  ALREADY_REVERSED: 409,
  NOT_POSTED: 409,
  ACCOUNT_NOT_POSTABLE: 409,
  ACCOUNT_INACTIVE: 409,
  NO_LINES: 409,
};

function fmsErrorHandler(err, req, res, next) {
  if (res.headersSent) return next(err);

  let status = 500;
  let code = 'INTERNAL_ERROR';
  let message = 'Internal server error';
  let details;

  if (err instanceof ApiError || err.isApiError) {
    status = err.status;
    code = err.code;
    message = err.message;
    details = err.details;

  } else if (err instanceof PostingError || err.name === 'PostingError') {
    status = POSTING_STATUS[err.code] || 422;
    code = err.code || 'POSTING_ERROR';
    message = err.message;

  } else if (err.name === 'ValidationError' && err.errors) {
    // Mongoose schema validation
    status = 422;
    code = 'VALIDATION_FAILED';
    message = 'Validation failed';
    details = {
      fields: Object.fromEntries(
        Object.entries(err.errors).map(([k, v]) => [k, v.message])
      ),
    };

  } else if (err.name === 'CastError') {
    status = 400;
    code = 'BAD_REQUEST';
    message = `Invalid value for '${err.path}'`;

  } else if (err.code === 11000) {
    // Duplicate key. This is also how idempotency surfaces under concurrency —
    // a second writer racing for the same fms_ingeststate key lands here.
    status = 409;
    code = 'DUPLICATE_KEY';
    message = 'A record with these values already exists';
    details = { keys: Object.keys(err.keyPattern || {}) };

  } else if (err.message && /transaction|replica set|WriteConflict/i.test(err.message)) {
    status = 503;
    code = 'TRANSACTION_UNAVAILABLE';
    message = 'The database could not complete the transaction. Please retry.';
  }

  // 5xx is our fault and worth logging in full. 4xx is the caller's and would
  // just be noise — a stack trace per bad request buries the real problems.
  if (status >= 500) {
    console.error(`[FMS] ${req.method} ${req.originalUrl} → ${status}`, err);
  }

  const body = { success: false, error: { code, message } };
  if (details) body.error.details = details;

  // Never leak internals. The log has the detail; the client gets the code.
  if (status >= 500 && process.env.NODE_ENV === 'production') {
    body.error.message = 'Internal server error';
  }

  res.status(status).json(body);
}

/**
 * Wrap an async handler so a rejected promise reaches the error handler.
 *
 * The SMS uses `express-async-errors` globally, which already does this. This
 * exists so the FMS keeps working if that dependency is ever removed, and so
 * the intent is visible at each route.
 */
function asyncHandler(fn) {
  return (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);
}

/** FMS-scoped 404, mounted before the error handler. */
function notFoundHandler(req, res, next) {
  next(errors.notFound(`FMS route ${req.originalUrl}`));
}

module.exports = { fmsErrorHandler, asyncHandler, notFoundHandler };