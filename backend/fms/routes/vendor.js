// backend/fms/routes/vendor.js
//
// Vendor Management — SRS M7 / FR-M7, screens SCR-26 (list), SCR-27 (entry),
// SCR-28 (history), SCR-29 (documents).
//
// RBAC per the matrix: `vendors` gives 'edit' to accountsManager and
// purchaseOfficer — which is the brief's PURCHASE_OFFICER/ACCOUNTS_MGR.

const express = require('express');
const router = express.Router();

const fmsAuthorize = require('../middleware/fmsAuthorize');
const { asyncHandler } = require('../middleware/fmsErrorHandler');
const {
  FmsVendor, FmsVendorDocument, VENDOR_STATUS, VENDOR_TYPE, DOC_TYPE,
} = require('../models/vendor');
const svc = require('../services/vendor/vendorService');
const taxId = require('../services/vendor/taxIdValidation');
const {
  ok, created, paginated, parsePagination, validate, check, errors,
} = require('../utils/apiResponse');

const SORTABLE = ['vendorName', 'vendorCode', 'rating', 'createdAt'];

/** GET /api/fms/vendors — list (SCR-26). */
router.get('/', fmsAuthorize('vendors', 'VIEW'), asyncHandler(async (req, res) => {
  const { page, limit, skip, sort } = parsePagination(req.query, {
    allowedSort: SORTABLE, defaultSort: 'vendorName',
  });

  const filter = { school: req.fmsScope.school };

  if (req.query.vendorStatus) {
    if (!VENDOR_STATUS.includes(req.query.vendorStatus)) {
      throw errors.badRequest(`Unknown status '${req.query.vendorStatus}'`, { allowed: VENDOR_STATUS });
    }
    filter.vendorStatus = req.query.vendorStatus;
  }
  if (req.query.vendorType) {
    if (!VENDOR_TYPE.includes(req.query.vendorType)) {
      throw errors.badRequest(`Unknown type '${req.query.vendorType}'`, { allowed: VENDOR_TYPE });
    }
    filter.vendorType = req.query.vendorType;
  }
  if (req.query.gstRegistered !== undefined) {
    filter.isGstRegistered = req.query.gstRegistered === 'true';
  }
  if (req.query.q) {
    const safe = String(req.query.q).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    filter.$or = [
      { vendorName: new RegExp(safe, 'i') },
      { vendorCode: new RegExp(safe, 'i') },
      { gstin: new RegExp(safe, 'i') },
      { pan: new RegExp(safe, 'i') },
    ];
  }

  const [items, total] = await Promise.all([
    FmsVendor.find(filter).sort(sort).skip(skip).limit(limit).lean(),
    FmsVendor.countDocuments(filter),
  ]);

  return paginated(res, items, { page, limit, total });
}));

/**
 * POST /api/fms/vendors/validate-tax-id
 * Check a GSTIN or PAN without creating anything — useful while typing.
 */
router.post('/validate-tax-id', fmsAuthorize('vendors', 'VIEW'), asyncHandler(async (req, res) => {
  validate(req.body, {
    gstin: { rules: [check.string] },
    pan: { rules: [check.string] },
  });

  if (!req.body.gstin && !req.body.pan) {
    throw errors.badRequest('Supply a gstin, a pan, or both');
  }

  return ok(res, {
    gstin: req.body.gstin ? taxId.validateGstin(req.body.gstin) : null,
    pan: req.body.pan ? taxId.validatePan(req.body.pan) : null,
    pair: taxId.validatePair(req.body.gstin, req.body.pan),
  });
}));

/** GET /api/fms/vendors/documents/expiring — KYC due for renewal. */
router.get('/documents/expiring', fmsAuthorize('vendors', 'VIEW'), asyncHandler(async (req, res) => {
  const days = parseInt(req.query.withinDays, 10);
  return ok(res, await svc.expiringDocuments(
    req.fmsScope.school, Number.isInteger(days) ? days : 30
  ));
}));

/** GET /api/fms/vendors/:id */
router.get('/:id', fmsAuthorize('vendors', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  const doc = await FmsVendor.findOne({ _id: req.params.id, school: req.fmsScope.school }).lean();
  if (!doc) throw errors.notFound('Vendor');

  const documents = await FmsVendorDocument
    .find({ school: req.fmsScope.school, vendor: doc._id }).lean();

  return ok(res, { ...doc, documents });
}));

/** GET /api/fms/vendors/:id/history — purchases and payments (SCR-28). */
router.get('/:id/history', fmsAuthorize('vendors', 'VIEW'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  return ok(res, await svc.history(req.fmsScope.school, req.params.id, {
    from: req.query.from, to: req.query.to,
  }));
}));

/** POST /api/fms/vendors — create as draft (SCR-27). */
router.post('/', fmsAuthorize('vendors', 'CREATE'), asyncHandler(async (req, res) => {
  validate(req.body, {
    vendorName: { required: true, rules: [check.nonEmpty] },
    legalName: { rules: [check.string] },
    vendorType: { rules: [check.enumOf(VENDOR_TYPE)] },
    gstin: { rules: [check.string] },
    pan: { rules: [check.string] },
    email: { rules: [check.string] },
    phone: { rules: [check.string] },
    creditDays: { rules: [check.integer] },
    rating: { rules: [check.integer] },
    notes: { rules: [check.string] },
  });

  if (req.body.rating !== undefined && (req.body.rating < 1 || req.body.rating > 5)) {
    throw errors.validation('Validation failed', { rating: 'must be between 1 and 5' });
  }

  const doc = await svc.create(req.fmsScope.school, req.body, req);
  return created(res, doc, `Vendor ${doc.vendorCode} created as draft`);
}));

/** PATCH /api/fms/vendors/:id */
router.patch('/:id', fmsAuthorize('vendors', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    vendorName: { rules: [check.nonEmpty] },
    vendorType: { rules: [check.enumOf(VENDOR_TYPE)] },
    gstin: { rules: [check.string] },
    pan: { rules: [check.string] },
    creditDays: { rules: [check.integer] },
    rating: { rules: [check.integer] },
  });

  const doc = await svc.update(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: 'Vendor updated' });
}));

/**
 * POST /api/fms/vendors/:id/status
 * Activating requires bank details; holding or blacklisting requires a reason.
 */
router.post('/:id/status', fmsAuthorize('vendors', 'EDIT'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    vendorStatus: { required: true, rules: [check.enumOf(VENDOR_STATUS)] },
    reason: { rules: [check.string] },
  });

  const doc = await svc.setStatus(req.fmsScope.school, req.params.id, req.body, req);
  return ok(res, doc, { message: `Vendor set to ${doc.vendorStatus}` });
}));

/** POST /api/fms/vendors/:id/documents — attach KYC (SCR-29). */
router.post('/:id/documents', fmsAuthorize('vendors', 'CREATE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.id)) throw errors.badRequest('Invalid id');
  validate(req.body, {
    docType: { required: true, rules: [check.enumOf(DOC_TYPE)] },
    fileName: { required: true, rules: [check.nonEmpty] },
    url: { required: true, rules: [check.nonEmpty] },
    docNumber: { rules: [check.string] },
    issueDate: { rules: [check.date] },
    expiryDate: { rules: [check.date] },
  });

  const doc = await svc.addDocument(req.fmsScope.school, req.params.id, req.body, req);
  return created(res, doc, 'Document attached');
}));

/** POST /api/fms/vendors/documents/:docId/verify — a different person must verify. */
router.post('/documents/:docId/verify', fmsAuthorize('vendors', 'APPROVE'), asyncHandler(async (req, res) => {
  if (check.objectId(req.params.docId)) throw errors.badRequest('Invalid document id');
  const doc = await svc.verifyDocument(req.fmsScope.school, req.params.docId, req, req.body?.note);
  return ok(res, doc, { message: 'Document verified' });
}));

module.exports = router;