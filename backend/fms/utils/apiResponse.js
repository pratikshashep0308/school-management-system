// backend/fms/utils/apiResponse.js
//
// Shared response conventions for every FMS endpoint.
//
// The envelope matches the SMS and the OpenAPI spec exactly:
//     { success, message?, count?, data }
//
// Deviating from it would force the frontend to special-case FMS responses,
// which is precisely the kind of seam that makes a plugin feel bolted on.

// ─────────────────────────────────────────────────────────────────────────────
// Errors
//
// Every FMS error carries an HTTP status and a stable machine-readable code.
// Callers branch on `code`, never on the message text — messages are for
// humans and will be reworded.
// ─────────────────────────────────────────────────────────────────────────────

class ApiError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
    this.isApiError = true;
  }
}

const errors = {
  /** 400 — the request itself is malformed (bad ObjectId, unparseable date). */
  badRequest: (message = 'Bad request', details) =>
    new ApiError(400, 'BAD_REQUEST', message, details),

  /** 401 — not authenticated. */
  unauthorized: (message = 'Not authorized. Please login.') =>
    new ApiError(401, 'UNAUTHORIZED', message),

  /** 403 — authenticated but not permitted. */
  forbidden: (message = 'Forbidden', details) =>
    new ApiError(403, 'FORBIDDEN', message, details),

  /** 404 — the resource does not exist, or is out of the caller's branch scope. */
  notFound: (resource = 'Resource') =>
    new ApiError(404, 'NOT_FOUND', `${resource} not found`),

  /** 409 — the request conflicts with current state (duplicate, already posted). */
  conflict: (message = 'Conflict', details) =>
    new ApiError(409, 'CONFLICT', message, details),

  /**
   * 422 — well-formed request, but the content fails a business or schema rule.
   * This is the one that carries field-level detail.
   */
  validation: (message = 'Validation failed', fields) =>
    new ApiError(422, 'VALIDATION_FAILED', message, { fields }),

  /** 500 — unexpected. Details are never sent to the client. */
  internal: (message = 'Internal server error') =>
    new ApiError(500, 'INTERNAL_ERROR', message),
};

// ─────────────────────────────────────────────────────────────────────────────
// Success responses
// ─────────────────────────────────────────────────────────────────────────────

/** 200/201 with `{ success:true, data }`. */
function ok(res, data, { status = 200, message } = {}) {
  const body = { success: true };
  if (message) body.message = message;
  body.data = data;
  return res.status(status).json(body);
}

/** 201 for a created resource. */
function created(res, data, message) {
  return ok(res, data, { status: 201, message });
}

/**
 * A paginated list. `count` is the number of items in THIS page — matching the
 * SMS convention — while total/pages live in `pagination`.
 */
function paginated(res, items, { page, limit, total }) {
  return res.status(200).json({
    success: true,
    count: items.length,
    pagination: {
      page,
      limit,
      total,
      pages: limit > 0 ? Math.ceil(total / limit) : 0,
      hasNext: page * limit < total,
      hasPrev: page > 1,
    },
    data: items,
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// Pagination & sorting
// ─────────────────────────────────────────────────────────────────────────────

const MAX_LIMIT = 200;
const DEFAULT_LIMIT = 25;

/**
 * Parse ?page=&limit=&sort= into Mongoose-ready values.
 *
 * `sort` is a comma-separated list with `-` for descending: `-voucherDate,accountCode`.
 * Fields not in `allowedSort` are REJECTED rather than ignored — silently
 * dropping a sort the caller asked for produces results they will misread.
 *
 * @param {object} query        req.query
 * @param {object} [opts]
 * @param {string[]} [opts.allowedSort]
 * @param {string} [opts.defaultSort]
 */
function parsePagination(query = {}, opts = {}) {
  const { allowedSort = [], defaultSort = '-createdAt' } = opts;

  let page = parseInt(query.page, 10);
  if (Number.isNaN(page) || page < 1) page = 1;

  let limit = parseInt(query.limit ?? query.size, 10);
  if (Number.isNaN(limit) || limit < 1) limit = DEFAULT_LIMIT;
  if (limit > MAX_LIMIT) limit = MAX_LIMIT;

  const raw = (query.sort || defaultSort).split(',').map((s) => s.trim()).filter(Boolean);
  const sort = {};

  for (const token of raw) {
    const desc = token.startsWith('-');
    const field = desc ? token.slice(1) : token;

    if (allowedSort.length && !allowedSort.includes(field)) {
      throw errors.badRequest(
        `Cannot sort by '${field}'`,
        { allowed: allowedSort }
      );
    }
    sort[field] = desc ? -1 : 1;
  }

  return { page, limit, skip: (page - 1) * limit, sort };
}

// ─────────────────────────────────────────────────────────────────────────────
// Request validation
//
// Deliberately small. The SMS already depends on `validator`; adding a schema
// library for the handful of shapes the FMS accepts would be more machinery
// than the problem needs.
// ─────────────────────────────────────────────────────────────────────────────

const OBJECT_ID = /^[0-9a-fA-F]{24}$/;

const check = {
  objectId: (v) => (OBJECT_ID.test(String(v)) ? null : 'must be a 24-character ObjectId'),
  string: (v) => (typeof v === 'string' ? null : 'must be a string'),
  nonEmpty: (v) => (typeof v === 'string' && v.trim() ? null : 'must be a non-empty string'),
  integer: (v) => (Number.isInteger(v) ? null : 'must be an integer'),
  /** Money is ALWAYS integer paise in the FMS. A float here is a bug upstream. */
  paise: (v) => (Number.isInteger(v) && v >= 0 ? null : 'must be a non-negative integer (paise)'),
  boolean: (v) => (typeof v === 'boolean' ? null : 'must be a boolean'),
  date: (v) => (!Number.isNaN(Date.parse(v)) ? null : 'must be a valid date'),
  enumOf: (allowed) => (v) =>
    allowed.includes(v) ? null : `must be one of: ${allowed.join(', ')}`,
  array: (v) => (Array.isArray(v) ? null : 'must be an array'),
};

/**
 * Validate an object against a field spec. Collects ALL failures rather than
 * throwing on the first — one round trip should tell the caller everything
 * that is wrong.
 *
 * @param {object} obj
 * @param {object} spec  { field: { required?, rules: [fn], } }
 * @throws {ApiError} 422 with per-field detail
 */
function validate(obj, spec) {
  const fields = {};

  for (const [name, def] of Object.entries(spec)) {
    const value = obj?.[name];
    const missing = value === undefined || value === null || value === '';

    if (def.required && missing) {
      fields[name] = 'is required';
      continue;
    }
    if (missing) continue;   // optional and absent — nothing to check

    for (const rule of def.rules || []) {
      const problem = rule(value);
      if (problem) { fields[name] = problem; break; }
    }
  }

  if (Object.keys(fields).length) {
    throw errors.validation('Validation failed', fields);
  }
  return true;
}

module.exports = {
  ApiError,
  errors,
  ok,
  created,
  paginated,
  parsePagination,
  validate,
  check,
  MAX_LIMIT,
  DEFAULT_LIMIT,
};