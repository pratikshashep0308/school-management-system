/**
 * FP-017 / FP-018 / FP-019 — messaging, peer observation, best practice, curriculum, planner
 * Requirements: GAP-PA-001, GAP-PLC-002, GAP-PLC-004, GAP-CCR-001, GAP-CCR-005, GAP-MTP-001/004/005
 * Decisions: D-009 · Test tier: B — UNIT, no database.
 */
const mongoose = require('mongoose');
const MessageThread = require('../../models/MessageThread');
const Message = MessageThread.Message;
const PeerObservation = require('../../models/PeerObservation');
const BestPractice = require('../../models/BestPracticeResource');
const ContentItem = require('../../models/ContentItem');
const LessonPlan = require('../../models/LessonPlan');

const oid = () => new mongoose.Types.ObjectId();
const errs = (d) => { const e = d.validateSync(); return e ? Object.keys(e.errors) : []; };

describe('FP-017 — parent-teacher messaging', () => {
  const thread = (o = {}) => new MessageThread({
    parent: oid(), teacher: oid(), student: oid(), school: oid(), ...o,
  });

  test('a valid thread passes', () => expect(errs(thread())).toEqual([]));

  test('schoolVisible defaults TRUE for safeguarding', () => {
    expect(thread().schoolVisible).toBe(true);
  });

  test('student context is required — a thread without it cannot be reviewed', () => {
    expect(errs(new MessageThread({ parent: oid(), teacher: oid(), school: oid() })))
      .toContain('student');
  });

  test('a sent message cannot be edited', async () => {
    const m = new Message({ thread: oid(), sender: oid(), body: 'original', school: oid() });
    m.isNew = false;
    m.body = 'rewritten';
    // A safeguarding record that can be rewritten after the fact is not a record.
    await expect(m.save()).rejects.toThrow(/MESSAGE_IMMUTABLE/);
  });
});

describe('FP-017 — peer observation privacy', () => {
  const obs = (o = {}) => new PeerObservation({
    observer: oid(), observed: oid(), school: oid(), academicYearId: oid(), ...o,
  });

  test('visibility defaults to private', () => expect(obs().visibility).toBe('private'));

  test('a teacher cannot observe themselves', async () => {
    // pre('validate') middleware runs on validate(), not validateSync().
    const id = oid();
    await expect(obs({ observer: id, observed: id }).validate())
      .rejects.toThrow(/PEER_OBSERVATION_SELF/);
  });

  test('two different teachers are accepted', async () => {
    await expect(obs().validate()).resolves.toBeUndefined();
  });

  test('visibleTo() is the privacy control, and it is a query filter', () => {
    // A `visibility` field callers may ignore protects nobody. The filter does.
    const me = oid();
    const f = PeerObservation.visibleTo(me);
    expect(f.$or).toHaveLength(3);
    expect(f.$or.map((c) => Object.keys(c)[0]).sort())
      .toEqual(['observed', 'observer', 'visibility']);
  });

  test('a non-participant is excluded unless the observation was shared', () => {
    const me = oid();
    const f = PeerObservation.visibleTo(me);
    const shared = f.$or.find((c) => c.visibility);
    expect(shared.visibility).toBe('shared');
  });
});

describe('FP-018 — D-009: BestPracticeResource is a dedicated collection', () => {
  const bp = (o = {}) => new BestPractice({
    title: 'Number talks', contributedBy: oid(), school: oid(), ...o,
  });

  test('a draft passes with minimal fields', () => expect(errs(bp())).toEqual([]));

  test('it is its OWN model, not a ContentItem variant', () => {
    expect(mongoose.models.BestPracticeResource).toBeDefined();
    expect(mongoose.models.BestPracticeResource.modelName).toBe('BestPracticeResource');
    expect(BestPractice.collection.name).not.toBe(ContentItem.collection.name);
  });

  test('ContentItem gained NO type discriminator for it (D-009)', () => {
    const paths = Object.keys(ContentItem.schema.paths);
    expect(paths).not.toContain('bestPractice');
    expect(paths).not.toContain('isBestPractice');
    expect(ContentItem.schema.path('type').enumValues).not.toContain('best-practice');
  });

  test('contentRefs is a REFERENCE, not inheritance', () => {
    const p = BestPractice.schema.path('contentRefs');
    expect(p.instance).toBe('Array');
    expect(p.caster.options.ref).toBe('ContentItem');
  });

  test('publishing requires a summary', async () => {
    await expect(bp({ status: 'published', subject: oid() }).validate())
      .rejects.toThrow(/BEST_PRACTICE_INCOMPLETE/);
  });

  test('publishing requires a subject or a competency, so it can be found', async () => {
    await expect(bp({ status: 'published', summary: 'Short daily routine' }).validate())
      .rejects.toThrow(/BEST_PRACTICE_INCOMPLETE/);
    await expect(bp({ status: 'published', summary: 'x', competencies: [oid()] }).validate())
      .resolves.toBeUndefined();
  });

  test('archived is terminal', () => {
    expect(BestPractice.ALLOWED_TRANSITIONS.archived).toEqual([]);
    expect(bp({ status: 'published' }).canTransitionTo('draft')).toBe(false);
    expect(bp({ status: 'submitted' }).canTransitionTo('published')).toBe(true);
  });
});

describe('FP-019 — ContentItem', () => {
  const ci = (o = {}) => new ContentItem({
    title: 'A story', language: 'Marathi', uploader: oid(), school: oid(), ...o,
  });

  test('language is REQUIRED (GAP-CCR-005)', () => {
    expect(errs(new ContentItem({ title: 'x', uploader: oid(), school: oid() })))
      .toContain('language');
    expect(errs(ci())).toEqual([]);
  });

  test('approvalStatus defaults to pending', () => expect(ci().approvalStatus).toBe('pending'));

  test('a rejection must record why', async () => {
    await expect(ci({ approvalStatus: 'rejected' }).validate())
      .rejects.toThrow(/CONTENT_REJECTION_REASON_REQUIRED/);
    await expect(ci({ approvalStatus: 'rejected', rejectionReason: 'Off-syllabus' }).validate())
      .resolves.toBeUndefined();
  });
});

describe('FP-019 — LessonPlan', () => {
  const lp = (o = {}) => new LessonPlan({
    teacher: oid(), class: oid(), subject: oid(), date: new Date(),
    school: oid(), academicYearId: oid(), ...o,
  });

  test('a valid plan passes', () => expect(errs(lp())).toEqual([]));

  test('it REFERENCES a timetable period rather than duplicating scheduling data', () => {
    const paths = Object.keys(LessonPlan.schema.paths);
    expect(paths).toContain('timetableRef');
    expect(paths).toContain('periodIndex');
    // No copied day/time fields that could diverge from the timetable.
    expect(paths).not.toContain('startTime');
    expect(paths).not.toContain('dayOfWeek');
  });

  test('baseUpdatedAt exists for offline conflict detection', () => {
    expect(Object.keys(LessonPlan.schema.paths)).toContain('baseUpdatedAt');
  });

  test('coverageStatus carries the three GAP-MTP-004 states', () => {
    expect(LessonPlan.schema.path('coverageStatus').enumValues)
      .toEqual(['not_started', 'in_progress', 'completed']);
  });

  test('recording a reflection stamps when', async () => {
    const d = lp();
    d.reflection = 'Pacing was too fast for the second group.';
    await d.save().catch(() => {});
    expect(d.reflectionAt).toBeInstanceOf(Date);
  });

  test('the reflection is one field — the AI assistant extends it, not a parallel store', () => {
    const paths = Object.keys(LessonPlan.schema.paths);
    expect(paths).toContain('reflection');
    expect(paths).not.toContain('aiReflection');
  });
});
