/**
 * FP-024 — additive field extensions
 * Decisions: R-3 (attendance thresholds), M-01 (Meeting validation), R-1 (actionItems)
 * FINAL LLD 1.1 §10.2 · Amendment A-01.2, A-01.3
 * Test tier: B — UNIT. In-memory validation; no database.
 */
const mongoose = require('mongoose');
require('../../models/School');
require('../../models/Meeting');
const School = mongoose.model('School');
const Meeting = mongoose.model('Meeting');

const oid = () => new mongoose.Types.ObjectId();
const school = (thresholds) =>
  new School({ name: 'Test School', ...(thresholds ? { aiThresholds: thresholds } : {}) });
/** school and organizer are pre-existing required fields, unrelated to M-01. */
const meetingErrors = (over = {}) => {
  const d = new Meeting({
    title: 'x', startTime: new Date(), endTime: new Date(),
    school: oid(), organizer: oid(), ...over,
  });
  const e = d.validateSync();
  return e ? Object.keys(e.errors) : [];
};

describe('R-3 — attendance thresholds are configuration, not literals', () => {
  test('both thresholds exist with the approved defaults', () => {
    const s = school();
    expect(s.aiThresholds.attendanceWarningPct).toBe(75);
    expect(s.aiThresholds.attendanceCriticalPct).toBe(60);
  });

  test('business meaning is unchanged — defaults are exactly 75 and 60 (R-3.T4)', () => {
    const paths = School.schema.paths;
    expect(paths['aiThresholds.attendanceWarningPct'].defaultValue).toBe(75);
    expect(paths['aiThresholds.attendanceCriticalPct'].defaultValue).toBe(60);
  });

  test('valid ordering is accepted', async () => {
    await expect(
      school({ attendanceWarningPct: 80, attendanceCriticalPct: 65 }).validate()
    ).resolves.toBeUndefined();
  });

  test('critical equal to warning is rejected (R-3.T1)', async () => {
    await expect(
      school({ attendanceWarningPct: 75, attendanceCriticalPct: 75 }).validate()
    ).rejects.toThrow(/AI_THRESHOLD_ORDER/);
  });

  test('critical above warning is rejected', async () => {
    // Otherwise a student could be "critical" without ever being "warning".
    await expect(
      school({ attendanceWarningPct: 60, attendanceCriticalPct: 75 }).validate()
    ).rejects.toThrow(/AI_THRESHOLD_ORDER/);
  });

  test('out-of-range values are rejected', async () => {
    await expect(
      school({ attendanceWarningPct: 120, attendanceCriticalPct: 60 }).validate()
    ).rejects.toThrow();
    await expect(
      school({ attendanceWarningPct: 75, attendanceCriticalPct: -1 }).validate()
    ).rejects.toThrow();
  });

  test('boundary 0 < 100 is accepted', async () => {
    await expect(
      school({ attendanceWarningPct: 100, attendanceCriticalPct: 0 }).validate()
    ).resolves.toBeUndefined();
  });

  test('thresholds are stored as percentages, never fractions', () => {
    // The defect R-3 corrects: the same rule existed as both 75 and 0.75.
    const s = school();
    expect(s.aiThresholds.attendanceWarningPct).toBeGreaterThan(1);
    expect(s.aiThresholds.attendanceCriticalPct).toBeGreaterThan(1);
  });
});

describe('GAP-CFG-002 — language configuration', () => {
  test('supportedLanguages and defaultParentLanguage default safely', () => {
    const s = school();
    expect(s.supportedLanguages).toEqual(['English']);
    expect(s.defaultParentLanguage).toBe('English');
  });
});

describe('M-01 — Meeting fields explicitly declared, not left to strict:false', () => {
  test('meetingSubtype and lessonStudyCycle are declared paths', () => {
    expect(Meeting.schema.path('meetingSubtype')).toBeDefined();
    expect(Meeting.schema.path('lessonStudyCycle')).toBeDefined();
  });

  test('an invalid meetingSubtype is REJECTED despite strict:false (M-01.T1)', () => {
    // Without explicit declaration this typo would be silently stored and would
    // never match a query.
    expect(meetingErrors({ meetingSubtype: 'PCL' })).toContain('meetingSubtype');
  });

  test('the approved subtype is accepted', () => {
    expect(meetingErrors({ meetingSubtype: 'plc' })).not.toContain('meetingSubtype');
  });

  test('existing Meeting documents remain valid (M-01.T2)', () => {
    // Backward compatibility: documents predating the change carry neither field.
    expect(meetingErrors({})).not.toContain('meetingSubtype');
    expect(meetingErrors({})).not.toContain('lessonStudyCycle');
  });

  test('the enum carries only requirement-defined values — no invented states', () => {
    const vals = Meeting.schema.path('meetingSubtype').enumValues.filter(Boolean);
    expect(vals).toEqual(['plc']);
    ['workshop', 'review', 'standup', 'retro'].forEach((v) =>
      expect(vals).not.toContain(v)
    );
  });

  test('lessonStudyCycle is unconstrained — no invented cycle states', () => {
    expect(meetingErrors({ lessonStudyCycle: { phase: 'anything', n: 1 } }))
      .not.toContain('lessonStudyCycle');
  });

  test('strict:false is retained for genuinely unknown future fields', () => {
    expect(Meeting.schema.options.strict).toBe(false);
  });
});

describe('R-1 — actionItems unchanged', () => {
  test('assignedTo and done retained; owner and status absent', () => {
    const sub = Object.keys(Meeting.schema.path('actionItems').schema.paths);
    expect(sub).toEqual(expect.arrayContaining(['text', 'assignedTo', 'dueDate', 'done']));
    expect(sub).not.toContain('owner');
    expect(sub).not.toContain('status');
  });

  test('no PLC action-item workflow states were invented', () => {
    const path = Meeting.schema.path('actionItems').schema.path('done');
    expect(path.instance).toBe('Boolean');
  });
});
