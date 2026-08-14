# `_allRoutes.js.unused` — quarantined dead code (BP-002)

`_allRoutes.js` exported a full set of stub routers — teacher, class, subject,
attendance, exam, fee, timetable, assignment, library, transport, notification,
dashboard — that **`server.js` never mounted**. Every one of those paths resolves
to a dedicated route file instead (`teacherRoutes.js`, `classRoutes.js`, and so on).

It was a live trap: editing `_allRoutes.js` to extend an endpoint would look
correct, pass review, and have no effect whatsoever at runtime. That failure mode
is exactly the kind of silent no-op the TFS-EOS delta build is meant to eliminate,
and the file duplicated logic that had already diverged from the live routes.

Renamed rather than deleted so the history stays inspectable. Nothing requires it —
verified by grep across `server.js`, `routes/`, `controllers/` and `services/`.

Delete it once the delta build is released.
