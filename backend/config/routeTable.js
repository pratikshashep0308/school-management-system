/**
 * ROUTE_TABLE — extracted from server.js by BP-002.
 *
 * Third element is the Access Control module key. When present, the saved
 * permission matrix is enforced on that route group:
 *   'none' -> 403 on everything      'read' -> 403 on POST/PUT/PATCH/DELETE
 *   'edit'/'admin' -> allowed        (superAdmin always bypasses)
 * Routes with no module key (auth, portals, school, permissions, uploads) are
 * never matrix-gated and rely on authorize() inside the route file.
 *
 * Extracted so the startup assertion in utils/assertModuleKeys.js can be unit
 * tested without booting the server. server.js requires this module; the table
 * itself is byte-for-byte the same as before.
 */
const ROUTE_TABLE = [
  ['/api/auth',           './routes/authRoutes'],
  ['/api/students',       './routes/studentRoutes',      'students'],
  ['/api/student-portal', './routes/studentPortalRoutes'],
  ['/api/teachers',       './routes/teacherRoutes',      'teachers'],
  ['/api/classes',        './routes/classRoutes',        'classes'],
  ['/api/subjects',       './routes/subjectRoutes',      'subjects'],
  ['/api/attendance',     './routes/attendanceRoutes',   'attendance'],
  ['/api/exams',          './routes/examRoutes',         'exams'],
  // FP-040: the advanced module moves to its OWN moduleKey. Previously it shared
  // 'exams' with the legacy module, so the matrix could not grant advanced-mark
  // entry without also granting legacy access. examsAdvanced mirrors the exams
  // grant in DEFAULT_GRANTS, so no existing user loses access on deploy.
  ['/api/exams-adv',      './routes/examAdvancedRoutes', 'examsAdvanced'],

  // ── TFS-EOS delta API routes (FP-050, FP-052) ──────────────────────────────
  ['/api/academic-calendar', './routes/academicCalendarRoutes', 'academicCalendar'],
  ['/api/sis',            './routes/sisRoutes',          'promotion'],

  // ── TFS-EOS delta API (FP-053..FP-059) ─────────────────────────────────────
  // Each sub-router is exported from routes/tfsApiRoutes.js; server.js resolves
  // the named export. moduleKeys already registered in permissionRoutes MODULES.
  ['/api/curriculum',     ['./routes/tfsApiRoutes', 'curriculumRouter'],   'curriculum'],
  ['/api/lesson-plans',   ['./routes/tfsApiRoutes', 'plannerRouter'],      'lessonPlans'],
  ['/api/passport',       ['./routes/tfsApiRoutes', 'passportRouter'],     'passport'],
  ['/api/subject-modules',['./routes/tfsApiRoutes', 'subjectRouter'],      'subjectModules'],
  ['/api/quality',        ['./routes/tfsApiRoutes', 'qualityRouter'],      'quality'],
  ['/api/notification-config', ['./routes/tfsApiRoutes', 'notificationRouter'], 'notificationConfig'],
  ['/api/audit-console',  ['./routes/tfsApiRoutes', 'auditRouter'],        'auditConsole'],
  // FP-071 offline sync — no moduleKey: the per-operation handlers enforce
  // their own authorization, so a matrix gate on the batch endpoint would be
  // both redundant and wrong (it would gate on one key for many op types).
  ['/api/sync',           './routes/syncRoutes',         null],
  ['/api/fees',           './routes/feeRoutes',          'fees'],
  ['/api/expenses',       './routes/expenseRoutes',      'expenses'],
  ['/api/homework',       './routes/homeworkRoutes',     'homework'],
  ['/api/school',         './routes/schoolRoutes'],
  ['/api/salary',         './routes/salaryRoutes',       'salary'],
  ['/api/timetable',      './routes/timetableRoutes',    'timetable'],
  ['/api/assignments',    './routes/assignmentRoutes',   'assignments'],
  ['/api/library',        './routes/libraryRoutes',      'library'],
  ['/api/transport',      './routes/transportRoutes',    'transport'],
  ['/api/notifications',  './routes/notificationRoutes', 'notifications'],
  ['/api/admissions',     './routes/admissionRoutes',    'admissions'],
  ['/api/dashboard',      './routes/dashboardRoutes',    'dashboard'],
  ['/api/reports',        './routes/reportRoutes',       'reports'],
  ['/api/class-fee-templates', './routes/classFeeTemplateRoutes', 'fees'],
  ['/api/meetings',       './routes/meetingRoutes',      'meetings'],
  ['/api/admins',         './routes/adminRoutes',        'settings'],
  ['/api/permissions',    './routes/permissionRoutes'],   // NOT matrix-gated:
  //   every role must be able to READ its own permissions or the sidebar breaks.
  //   Write access (PUT/POST) is restricted inside the route by authorize().
  ['/api/behavioural-notes', './routes/behaviouralNoteRoutes', 'behaviourNotes'],
  ['/api/uploads',        './routes/uploadRoutes'],
];

module.exports = { ROUTE_TABLE };
