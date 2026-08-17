/**
 * FP-036 — advanced exam result provider
 * Requirements: GAP-AE-007, GAP-AE-008, GAP-SIS-006, GAP-AE-001
 * Decisions: D-001 (authority), D-010 (announcement), D-011 (gating)
 * FINAL LLD 1.1 §18.1, §18.2, §22 · Test tier: B — UNIT, models stubbed.
 */
const mongoose = require('mongoose');
require('../../models');
require('../../models/examModels');
const p = require('../../services/examResultProvider');

const oid = () => new mongoose.Types.ObjectId();
const SCHOOL = oid(); const GROUP = oid();
const S1 = oid(); const S2 = oid();
const SUBJ_MATH = oid(); const SUBJ_SCI = oid();

function stub({ group, subjects = [], marks = [], retestGroups = [], classes = [] } = {}) {
  const EG = mongoose.model('ExamGroup');
  const ES = mongoose.model('ExamSubject');
  const EM = mongoose.model('ExamMark');
  const C = mongoose.model('Class');
  const R = mongoose.model('Result');
  const orig = {
    egOne: EG.findOne, egFind: EG.find, esFind: ES.find, emFind: EM.find,
    cFind: C.find, rFind: R.find, rFindOne: R.findOne,
  };
  const legacyReads = [];

  EG.findOne = () => ({ lean: async () => group });
  EG.find = () => ({ lean: async () => retestGroups });
  ES.find = () => ({ lean: async () => subjects });
  EM.find = () => ({ lean: async () => marks });
  C.find = () => ({ select: () => ({ lean: async () => classes }) });
  // D-001: legacy Result must never be consulted by this provider.
  R.find = (...a) => { legacyReads.push(a); return { lean: async () => [] }; };
  R.findOne = (...a) => { legacyReads.push(a); return { lean: async () => null }; };

  return {
    legacyReads,
    restore: () => {
      EG.findOne = orig.egOne; EG.find = orig.egFind; ES.find = orig.esFind;
      EM.find = orig.emFind; C.find = orig.cFind; R.find = orig.rFind; R.findOne = orig.rFindOne;
    },
  };
}

const published = { _id: GROUP, name: 'Annual 2026-27', status: 'published', school: SCHOOL, classes: [] };
const subj = (id, name, passing = 35) => ({ _id: id, name, passingMarks: passing, examGroup: GROUP });
const mark = (student, subject, over = {}) => ({
  _id: oid(), student, examSubject: subject, examGroup: GROUP,
  status: 'published', marksObtained: 50, graceMarks: 0, isAbsent: false, ...over,
});

describe('D-011 gate 1 — the group must be published', () => {
  test('an unpublished group blocks with its own code', async () => {
    const s = stub({ group: { ...published, status: 'draft' } });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.eligible).toBe(false);
      expect(r.code).toBe('PROMOTION_BLOCKED_GROUP_UNPUBLISHED');
      expect(r.message).toMatch(/must be announced/);
    } finally { s.restore(); }
  });

  test('a published group with complete marks is eligible', async () => {
    const s = stub({
      group: published, subjects: [subj(SUBJ_MATH, 'Maths')],
      marks: [mark(S1, SUBJ_MATH)],
    });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.eligible).toBe(true);
      expect(r.missing).toEqual([]);
    } finally { s.restore(); }
  });
});

describe('D-011 gate 2 — a missing mark BLOCKS and names the gap', () => {
  test('a missing mark blocks, and is not treated as a fail', async () => {
    const s = stub({
      group: published,
      subjects: [subj(SUBJ_MATH, 'Maths'), subj(SUBJ_SCI, 'Science')],
      marks: [mark(S1, SUBJ_MATH)], // Science missing
    });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.eligible).toBe(false);
      expect(r.code).toBe('PROMOTION_BLOCKED_MARKS_INCOMPLETE');
      expect(r.missing).toHaveLength(1);
      expect(r.missing[0].subjectName).toBe('Science');
      // Conflating "no data" with "failed" would retain a student because a
      // teacher had not finished entry.
      expect(r.message).toMatch(/not treated as absence or as a fail/);
    } finally { s.restore(); }
  });

  test('every missing student/subject pair is named', async () => {
    const s = stub({
      group: published,
      subjects: [subj(SUBJ_MATH, 'Maths'), subj(SUBJ_SCI, 'Science')],
      marks: [mark(S1, SUBJ_MATH)],
    });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1, S2], schoolId: SCHOOL });
      // S1 missing Science; S2 missing both.
      expect(r.missing).toHaveLength(3);
    } finally { s.restore(); }
  });

  test('a DRAFT mark does not satisfy the gate', async () => {
    // The query filters status:'published', so a draft mark never returns.
    const s = stub({ group: published, subjects: [subj(SUBJ_MATH, 'Maths')], marks: [] });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.eligible).toBe(false);
      expect(r.code).toBe('PROMOTION_BLOCKED_MARKS_INCOMPLETE');
    } finally { s.restore(); }
  });

  test('a group with no subjects blocks rather than passing vacuously', async () => {
    const s = stub({ group: published, subjects: [] });
    try {
      const r = await p.checkEligibility({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.eligible).toBe(false);
      expect(r.message).toMatch(/no subjects/);
    } finally { s.restore(); }
  });
});

describe('D-011 — absence is explicit, never inferred', () => {
  test('isAbsent:true is a fail with reason absent', () => {
    const r = p.evaluateSubject({ isAbsent: true, marksObtained: 0 }, { passingMarks: 35 });
    expect(r.isAbsent).toBe(true);
    expect(r.isPass).toBe(false);
    expect(r.reason).toBe('absent');
  });

  test('a MISSING mark is neither pass nor fail — it has no verdict', () => {
    const r = p.evaluateSubject(null, { passingMarks: 35 });
    expect(r.hasMark).toBe(false);
    expect(r.isPass).toBeNull();
    expect(r.reason).toBe('missing');
  });
});

describe('grace marks are applied BEFORE evaluation', () => {
  test('grace lifts a borderline student over the line', () => {
    const r = p.evaluateSubject({ marksObtained: 33, graceMarks: 2 }, { passingMarks: 35 });
    expect(r.effective).toBe(35);
    expect(r.isPass).toBe(true);
    expect(r.graceMarks).toBe(2);
  });

  test('effectiveMarks sums obtained and grace', () => {
    expect(p.effectiveMarks({ marksObtained: 40, graceMarks: 5 })).toBe(45);
    expect(p.effectiveMarks(null)).toBe(-Infinity);
  });

  test('an explicit isPass from the advanced module is honoured over recomputation', () => {
    const r = p.evaluateSubject({ marksObtained: 10, graceMarks: 0, isPass: true }, { passingMarks: 35 });
    expect(r.isPass).toBe(true);
  });
});

describe('retest resolution — policy sits on the RETEST group', () => {
  const orig = { marksObtained: 30, graceMarks: 0, examGroup: GROUP };
  const rt = (marks, policy, startDate, id = oid()) => ({
    mark: { marksObtained: marks, graceMarks: 0, examGroup: id },
    group: { _id: id, retestPolicy: policy, startDate: new Date(startDate) },
  });

  test('no retest returns the original', () => {
    const r = p.resolveRetestChain(orig, []);
    expect(r.mark.marksObtained).toBe(30);
    expect(r.policy).toBeNull();
  });

  test("'best' selects the highest across original AND retests", () => {
    const r = p.resolveRetestChain(orig, [rt(45, 'best', '2027-05-01')]);
    expect(r.mark.marksObtained).toBe(45);
    expect(r.policy).toBe('best');
  });

  test("'best' keeps the ORIGINAL when the retest is worse", () => {
    const r = p.resolveRetestChain({ marksObtained: 60, graceMarks: 0, examGroup: GROUP },
      [rt(40, 'best', '2027-05-01')]);
    expect(r.mark.marksObtained).toBe(60);
  });

  test("'latest' takes the most recent retest even if lower", () => {
    const r = p.resolveRetestChain(orig, [rt(70, 'latest', '2027-05-01'), rt(38, 'latest', '2027-06-01')]);
    expect(r.mark.marksObtained).toBe(38);
    expect(r.policy).toBe('latest');
  });

  test("'original' discards retests entirely", () => {
    const r = p.resolveRetestChain(orig, [rt(90, 'original', '2027-05-01')]);
    expect(r.mark.marksObtained).toBe(30);
    expect(r.policy).toBe('original');
  });

  test('CHAINED retests resolve against the full set, not pairwise', () => {
    // Pairwise 'best' would compare only the last two and discard the 80.
    const r = p.resolveRetestChain(orig, [
      rt(80, 'best', '2027-05-01'),
      rt(50, 'best', '2027-06-01'),
    ]);
    expect(r.mark.marksObtained).toBe(80);
  });

  test('the governing policy comes from the LAST retest group in the chain', () => {
    const r = p.resolveRetestChain(orig, [
      rt(80, 'best', '2027-05-01'),
      rt(50, 'latest', '2027-06-01'),
    ]);
    expect(r.policy).toBe('latest');
    expect(r.mark.marksObtained).toBe(50);
  });

  test('an unrecognised policy falls back to best rather than throwing', () => {
    const r = p.resolveRetestChain(orig, [rt(45, 'nonsense', '2027-05-01')]);
    expect(r.policy).toBe('best');
  });

  test('the three approved policies are the only ones recognised', () => {
    expect(p.RETEST_POLICIES).toEqual(['best', 'latest', 'original']);
  });
});

describe('D-001 — legacy Result is never consulted', () => {
  test('resultsForPromotion issues no read against the legacy Result model', async () => {
    const s = stub({
      group: published, subjects: [subj(SUBJ_MATH, 'Maths')], marks: [mark(S1, SUBJ_MATH)],
    });
    try {
      await p.resultsForPromotion({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(s.legacyReads).toEqual([]);
    } finally { s.restore(); }
  });

  test('the outcome records provenance so it stays explainable after a correction', async () => {
    const s = stub({
      group: published, subjects: [subj(SUBJ_MATH, 'Maths')],
      marks: [mark(S1, SUBJ_MATH, { marksObtained: 20 })],
    });
    try {
      const [r] = await p.resultsForPromotion({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL });
      expect(r.allPassed).toBe(false);
      expect(r.failedSubjects).toEqual(['Maths']);
      expect(r.computedPassFail.examGroup).toBe(GROUP);
      expect(r.computedPassFail.subjects[0].sourceExamGroup).toBeDefined();
    } finally { s.restore(); }
  });

  test('resultsForPromotion THROWS the block code rather than returning partial data', async () => {
    const s = stub({ group: { ...published, status: 'draft' } });
    try {
      await expect(p.resultsForPromotion({ examGroupId: GROUP, studentIds: [S1], schoolId: SCHOOL }))
        .rejects.toThrow(/must be announced/);
    } finally { s.restore(); }
  });
});

describe('D-010 — announcement scope names every class', () => {
  test('a multi-class group names all affected classes', async () => {
    const c1 = oid(); const c2 = oid(); const c3 = oid();
    const s = stub({
      group: { ...published, status: 'draft', classes: [c1, c2, c3] },
      classes: [
        { _id: c1, name: '6', section: 'A' },
        { _id: c2, name: '6', section: 'B' },
        { _id: c3, name: '6', section: 'C' },
      ],
    });
    try {
      const r = await p.describeAnnouncementScope({ examGroupId: GROUP, schoolId: SCHOOL });
      expect(r.affectedClassCount).toBe(3);
      expect(r.affectedClasses.map((c) => c.label)).toEqual(['6-A', '6-B', '6-C']);
      // Maharashtra schools announce grade-wide on 1 May, so this is the normal
      // case — the notice states scope rather than warning about it.
      expect(r.notice).toMatch(/ALL 3 classes/);
    } finally { s.restore(); }
  });

  test('a single-class group says so', async () => {
    const c1 = oid();
    const s = stub({ group: { ...published, status: 'draft', classes: [c1] },
      classes: [{ _id: c1, name: '7', section: 'A' }] });
    try {
      const r = await p.describeAnnouncementScope({ examGroupId: GROUP, schoolId: SCHOOL });
      expect(r.affectedClassCount).toBe(1);
      expect(r.notice).toMatch(/single class/);
    } finally { s.restore(); }
  });

  test('an already-published group is reported as such — re-announcement is idempotent', async () => {
    const s = stub({ group: { ...published, classes: [] }, classes: [] });
    try {
      const r = await p.describeAnnouncementScope({ examGroupId: GROUP, schoolId: SCHOOL });
      expect(r.alreadyPublished).toBe(true);
    } finally { s.restore(); }
  });
});
