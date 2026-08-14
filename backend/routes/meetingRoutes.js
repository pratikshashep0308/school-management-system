// backend/routes/meetingRoutes.js
const router = require('express').Router();
const { protect, authorize } = require('../middleware/auth');
const c = require('../controllers/meetingController');

router.use(protect);

const CREATORS = ['superAdmin', 'schoolAdmin', 'teacher'];

// List + detail are open to all authenticated users — visibility is enforced
// inside the controller (non-admin roles only see meetings they're in).
router.get('/',                  c.list);
router.get('/conflict-check',    c.conflictCheck);
router.get('/:id',               c.get);

// Mutations
router.post('/',                 authorize(...CREATORS), c.create);
router.put('/:id',               c.update);                       // permission check inside
router.delete('/:id',            c.remove);                       // permission check inside

// Actions
router.post('/:id/rsvp',         c.rsvp);                         // any invited user
router.post('/:id/attendance',   c.markAttendance);               // organizer / admin
router.put('/:id/participants',  c.updateParticipants);           // organizer / admin

module.exports = router;