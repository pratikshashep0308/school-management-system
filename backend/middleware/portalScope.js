// backend/middleware/portalScope.js
//
// Who is a portal user allowed to see?
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// Before this, every route answered that question for itself. Homework matched
// on `parentEmail`. `attachStudent` tried `parentId`, then `parent`, then
// `parentEmail`. Behaviour notes did not ask at all — they trusted the id in
// the URL.
//
// Three mechanisms means three behaviours and three places to get it wrong, and
// one of them was wrong: a parent could read any student's behaviour notes by
// changing the id in the address bar.
//
// ─── THE RULE THIS ENFORCES ──────────────────────────────────────────────────
// Portal users fail CLOSED. If we cannot establish which children belong to a
// caller, they see nothing — not everything.
//
// That direction matters more than it sounds. The homework route did the
// opposite: when no child matched, it left the class filter unset and returned
// every homework in the school. An access check whose failure mode is "show
// everything" is worse than no check, because it looks like it is working.

const Student = require('../models/Student');

/**
 * Every student a caller may see.
 *
 * @returns {Promise<Array<ObjectId>>} student ids — EMPTY means "nothing",
 *          never "everything". Callers must treat [] as deny.
 */
async function resolveOwnStudents(user) {
  if (!user?._id) return [];

  const school = user.school;

  if (user.role === 'student') {
    const me = await Student.findOne({ user: user._id, school }).select('_id').lean();
    return me ? [me._id] : [];
  }

  if (user.role === 'parent') {
    // `find`, not `findOne`. A parent with two children was only ever shown one
    // of them, because every call site used findOne.
    //
    // The $or covers three linkages that accumulated over time: parentId (the
    // current one), parent (older), and parentEmail (older still, and the only
    // one some records have). All three are scoped to the caller — none of them
    // is a wildcard.
    const kids = await Student.find({
      school,
      $or: [
        { parentId: user._id },
        { parent: user._id },
        { parentEmail: user.email },
      ],
    }).select('_id').lean();

    return kids.map((k) => k._id);
  }

  return [];
}

/**
 * Is this caller a portal user at all?
 *
 * Staff are not scoped by this module — a teacher seeing every homework in the
 * school is intended. This exists so routes can say "scope if portal, otherwise
 * leave alone" without repeating the role list.
 */
function isPortalUser(user) {
  return user?.role === 'student' || user?.role === 'parent';
}

/**
 * Middleware: attach the caller's own student ids to the request.
 *
 * Sets `req.ownStudentIds` (array) and `req.studentDoc` (the first, for routes
 * that predate multi-child support and expect a single document).
 *
 * A portal user with no children is REJECTED here rather than being allowed
 * through with an empty scope, because an empty scope is one forgotten filter
 * away from an unscoped query.
 */
async function attachOwnStudents(req, res, next) {
  try {
    if (!isPortalUser(req.user)) return next();

    const ids = await resolveOwnStudents(req.user);

    if (ids.length === 0) {
      return res.status(403).json({
        success: false,
        message: 'No student record is linked to this account. Please contact the school office.',
      });
    }

    req.ownStudentIds = ids;
    req.studentDoc = await Student.findById(ids[0]);
    return next();
  } catch (err) {
    // Deliberately NOT next() on error. The previous version swallowed failures
    // and continued, which meant a database hiccup produced an unscoped request
    // rather than a refused one.
    return res.status(500).json({
      success: false,
      message: 'Could not verify which student this account may access',
    });
  }
}

/**
 * Guard a route that takes a :studentId (or similar) parameter.
 *
 * Staff pass through. A portal user must own the id in the URL, or they are
 * refused — this is the check whose absence let any parent read any child's
 * behaviour notes.
 *
 * @param {string} [param='studentId'] which route parameter to check
 */
function requireOwnStudent(param = 'studentId') {
  return async (req, res, next) => {
    try {
      if (!isPortalUser(req.user)) return next();

      const requested = String(req.params[param] || req.query[param] || '');
      if (!requested) {
        return res.status(400).json({ success: false, message: 'No student specified' });
      }

      const ids = req.ownStudentIds || (await resolveOwnStudents(req.user));
      const owns = ids.some((id) => String(id) === requested);

      if (!owns) {
        // 404 rather than 403, deliberately: a 403 confirms the student exists,
        // which lets somebody enumerate ids. This says nothing either way.
        return res.status(404).json({ success: false, message: 'Not found' });
      }

      req.ownStudentIds = ids;
      return next();
    } catch (err) {
      return res.status(500).json({
        success: false,
        message: 'Could not verify access to this student',
      });
    }
  };
}

module.exports = {
  resolveOwnStudents,
  isPortalUser,
  attachOwnStudents,
  requireOwnStudent,
};