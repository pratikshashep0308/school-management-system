/**
 * academicCalendarController — FP-050 · GAP-CAL-002…009 · FINAL LLD 1.1 §20, §42
 *
 * REST surface over AcademicYear, Holiday, SpecialEvent and the calendar helpers.
 * Business rules live in the models and calendarService; this controller
 * validates input, enforces the write rules that are genuinely HTTP-layer
 * concerns, and shapes responses. It does not reimplement calendar logic.
 *
 * ── The one write rule enforced here ────────────────────────────────────────
 * Exactly one AcademicYear per school may be active (BR-CAL-01). Activating a
 * year deactivates the previous active one in the same operation. This is an
 * API-layer concern because it spans documents on an explicit user action; the
 * model cannot enforce a cross-document invariant on its own.
 */
const mongoose = require('mongoose');
const AcademicYear = require('../models/AcademicYear');
const Holiday = require('../models/Holiday');
const SpecialEvent = require('../models/SpecialEvent');
const calendarService = require('../services/calendarService');
const auditService = require('../services/auditService');

/** GET /api/academic-calendar/years */
exports.listYears = async (req, res) => {
  try {
    const years = await AcademicYear.find({ school: req.user.school })
      .sort({ startDate: -1 })
      .lean();
    res.json({ success: true, years });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/academic-calendar/years */
exports.createYear = async (req, res) => {
  try {
    const { name, startDate, endDate, terms } = req.body;
    if (!name || !startDate || !endDate) {
      return res.status(400).json({
        success: false,
        message: 'name, startDate and endDate are required.',
      });
    }
    if (new Date(startDate) >= new Date(endDate)) {
      return res.status(400).json({ success: false, message: 'startDate must be before endDate.' });
    }

    const year = await AcademicYear.create({
      name, startDate, endDate,
      terms: Array.isArray(terms) ? terms : [],
      isActive: false,
      status: 'draft',
      school: req.user.school,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, year });
  } catch (err) {
    if (err.code === 11000) {
      return res.status(409).json({ success: false, message: 'An academic year with that name already exists.' });
    }
    res.status(400).json({ success: false, message: err.message });
  }
};

/**
 * POST /api/academic-calendar/years/:id/activate
 *
 * BR-CAL-01 — exactly one active year. Deactivate the current active year and
 * activate this one, in a transaction so the school is never left with zero or
 * two active years.
 */
exports.activateYear = async (req, res) => {
  const session = await mongoose.startSession().catch(() => null);
  try {
    const { id } = req.params;
    const target = await AcademicYear.findOne({ _id: id, school: req.user.school });
    if (!target) return res.status(404).json({ success: false, message: 'Academic year not found.' });

    const apply = async (s) => {
      await AcademicYear.updateMany(
        { school: req.user.school, isActive: true, _id: { $ne: id } },
        { $set: { isActive: false } },
        s ? { session: s } : {}
      );
      target.isActive = true;
      target.status = 'active';
      await target.save(s ? { session: s } : {});
    };

    if (session) {
      await session.withTransaction(async () => apply(session));
    } else {
      // No replica set in this environment. The two writes are not atomic; the
      // narrow risk window is documented rather than hidden. ENVIRONMENT PENDING.
      await apply(null);
    }

    await auditService.audit({
      actor: req.user._id,
      actorRoleSnapshot: req.user.role,
      action: 'academicYear.activate',
      module: 'academicCalendar',
      recordRef: { collectionName: 'AcademicYear', id: target._id },
      after: { name: target.name, isActive: true },
      source: 'route',
      school: req.user.school,
    });

    res.json({ success: true, year: target });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  } finally {
    if (session) await session.endSession();
  }
};

/** GET /api/academic-calendar/holidays?yearId= */
exports.listHolidays = async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.yearId) filter.academicYearId = req.query.yearId;
    const holidays = await Holiday.find(filter).sort({ date: 1 }).lean();
    res.json({ success: true, holidays });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/** POST /api/academic-calendar/holidays */
exports.createHoliday = async (req, res) => {
  try {
    const { label, date, endDate, recurringAnnually, type, academicYearId } = req.body;
    if (!label || !date || !academicYearId) {
      return res.status(400).json({
        success: false,
        message: 'label, date and academicYearId are required.',
      });
    }
    const holiday = await Holiday.create({
      label, date, endDate: endDate || null,
      recurringAnnually: Boolean(recurringAnnually),
      type: type || 'school',
      academicYearId,
      school: req.user.school,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, holiday });
  } catch (err) {
    res.status(400).json({ success: false, message: err.message });
  }
};

/** DELETE /api/academic-calendar/holidays/:id */
exports.deleteHoliday = async (req, res) => {
  try {
    const holiday = await Holiday.findOneAndDelete({ _id: req.params.id, school: req.user.school });
    if (!holiday) return res.status(404).json({ success: false, message: 'Holiday not found.' });
    res.json({ success: true });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};

/**
 * GET /api/academic-calendar/day-status?date=&classId=
 *
 * Whether a given date is instructional, delegating entirely to calendarService
 * so the API and the attendance guard share one source of truth.
 */
exports.dayStatus = async (req, res) => {
  try {
    const { date } = req.query;
    if (!date) return res.status(400).json({ success: false, message: 'date is required.' });

    const status = await calendarService.isNonInstructionalDay(new Date(date), req.user.school);
    res.json({ success: true, date, ...status });
  } catch (err) {
    // Calendar failures are handled fail-closed inside the service; surface a 500
    // rather than a misleading "instructional day".
    res.status(500).json({ success: false, message: err.message });
  }
};

/** GET /api/academic-calendar/working-days?yearId= */
exports.workingDays = async (req, res) => {
  try {
    const year = await AcademicYear.findOne({
      _id: req.query.yearId, school: req.user.school,
    }).lean();
    if (!year) return res.status(404).json({ success: false, message: 'Academic year not found.' });

    const count = await calendarService.countWorkingDays(
      year.startDate, year.endDate, req.user.school
    );
    res.json({ success: true, yearId: year._id, workingDays: count });
  } catch (err) {
    res.status(500).json({ success: false, message: err.message });
  }
};
