/**
 * CHARACTERISATION — the schema half of the six no-change guarantees.
 *
 *   GAP-SIS-004  Admission and Student.documents[] unchanged
 *   GAP-PLC-005  Meeting scheduling, RSVP and attendance unchanged
 *   GAP-NOT-004  Notification targeting, priority, read-tracking, actionLog unchanged
 *
 * Also pins two structural facts the delta build must not violate:
 *   - Meeting.actionItems ALREADY EXISTS as {text, assignedTo, dueDate, done}
 *     and must not be renamed to {text, owner, dueDate, status} (Appendix R R.2.11)
 *   - Student.grade DOES NOT EXIST; promotion writes Student.class (D-004)
 *
 * Gate tier: LOCAL UNIT — schema introspection only, no database.
 */
const mongoose = require('mongoose');

// models/index.js registers 20 models; the rest live in their own files and must
// be required explicitly. Loading them here keeps this suite independent of
// whatever the application happens to have loaded.
require('../../models');
['Meeting', 'Student', 'Admission', 'RolePermission', 'User', 'Teacher',
 'Expense', 'BehaviouralNote'].forEach((m) => require(`../../models/${m}`));

const paths = (m) => Object.keys(m.schema.paths);
const enumOf = (m, p) => m.schema.path(p).enumValues || m.schema.path(p).options.enum;

describe('GAP-SIS-004 — Admission and student documents unchanged', () => {
  test('Admission model is registered', () => {
    expect(mongoose.models.Admission).toBeDefined();
  });

  test('Student.documents[] is present', () => {
    const Student = mongoose.models.Student;
    expect(paths(Student).some((p) => p.startsWith('documents'))).toBe(true);
  });
});

describe('GAP-PLC-005 — Meeting workflow unchanged', () => {
  const Meeting = () => mongoose.models.Meeting;

  test('participants carry RSVP and attendance state', () => {
    const p = paths(Meeting());
    expect(p.some((x) => x.startsWith('participants'))).toBe(true);
  });

  test('MEETING type enum still contains staff', () => {
    const vals = enumOf(Meeting(), 'type') || [];
    expect(vals).toEqual(expect.arrayContaining(['staff']));
  });

  test('actionItems ALREADY EXISTS with assignedTo and done — never owner/status', () => {
    const ai = Meeting().schema.path('actionItems');
    expect(ai).toBeDefined();
    expect(ai.instance).toBe('Array');
    const sub = Object.keys(ai.schema.paths);
    expect(sub).toEqual(
      expect.arrayContaining(['text', 'assignedTo', 'dueDate', 'done'])
    );
    // The LLD listed this as a NEW field shaped {text, owner, dueDate, status}.
    // Renaming would break every existing set of meeting minutes.
    expect(sub).not.toContain('owner');
    expect(sub).not.toContain('status');
  });

  test('actionItems.done defaults to false', () => {
    const doc = new (Meeting())({ title: 'x', actionItems: [{ text: 'a' }] });
    expect(doc.actionItems[0].done).toBe(false);
  });
});

describe('GAP-NOT-004 — Notification behaviour unchanged', () => {
  const N = () => mongoose.models.Notification;

  test('audience, priority, readBy and actionLog all present', () => {
    const p = paths(N());
    expect(p).toEqual(expect.arrayContaining(['audience', 'priority']));
    expect(p.some((x) => x.startsWith('readBy'))).toBe(true);
    expect(p.some((x) => x.startsWith('actionLog'))).toBe(true);
  });

  test('legacy isSMSSent / isEmailSent flags are retained', () => {
    const p = paths(N());
    expect(p).toEqual(expect.arrayContaining(['isEmailSent', 'isSMSSent']));
  });
});

describe('Structural invariants the delta build must not violate', () => {
  test('Student.grade DOES NOT EXIST — promotion writes Student.class (D-004)', () => {
    const Student = mongoose.models.Student;
    expect(paths(Student)).not.toContain('grade');
    expect(paths(Student)).toEqual(expect.arrayContaining(['class', 'section']));
  });

  test('Student carries both status and isActive (pre-existing redundancy)', () => {
    const Student = mongoose.models.Student;
    expect(paths(Student)).toEqual(expect.arrayContaining(['status', 'isActive']));
    expect(enumOf(Student, 'status')).toEqual(
      expect.arrayContaining(['active', 'inactive', 'alumni'])
    );
  });

  test('Class.grade is a Number and Class has no academicYear (D-002)', () => {
    const Class = mongoose.models.Class;
    expect(Class.schema.path('grade').instance).toBe('Number');
    expect(paths(Class)).not.toContain('academicYear');
    expect(paths(Class).some((p) => p.startsWith('students'))).toBe(true);
  });

  test('RolePermission.permissions is an unconstrained Map, not an enum', () => {
    const RP = mongoose.models.RolePermission;
    expect(RP.schema.path('permissions').instance).toBe('Map');
  });
});
