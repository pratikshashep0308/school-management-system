/**
 * CHARACTERISATION — GAP-AE-006
 * "Existing marks-and-grade workflow, report cards and Result schema remain fully intact."
 *
 * Pins the CURRENT behaviour of the Result pre-save grade hook. Competency mastery
 * (GAP-AE-002/003) is an additional parallel view and must never alter this.
 *
 * Gate tier: LOCAL UNIT — the hook is invoked directly against an in-memory
 * document with a stubbed Exam lookup, so no database is required.
 */
const mongoose = require('mongoose');
require('../../models');

const { Result } = mongoose.models;

/** Invoke the registered pre-save hook against a document, with Exam stubbed. */
async function runGradeHook(marksObtained, totalMarks) {
  const doc = new Result({
    student: new mongoose.Types.ObjectId(),
    exam: new mongoose.Types.ObjectId(),
    marksObtained,
  });

  const ExamModel = mongoose.model('Exam');
  const original = ExamModel.findById;
  ExamModel.findById = async () => ({ totalMarks });
  try {
    // Mongoose registers internal pre-save hooks alongside the schema's own.
    // Select the application hook by its distinguishing source, so this test
    // pins OUR grading logic and is not affected by mongoose internals.
    const hooks = Result.schema.s.hooks._pres.get('save') || [];
    const gradeHook = hooks
      .map((h) => h.fn)
      .find((fn) => typeof fn === 'function' && /percentage/.test(fn.toString()));
    expect(gradeHook).toBeDefined();
    await new Promise((resolve, reject) =>
      gradeHook.call(doc, (err) => (err ? reject(err) : resolve()))
    );
  } finally {
    ExamModel.findById = original;
  }
  return doc;
}

describe('GAP-AE-006 — Result pre-save grade hook (characterisation)', () => {
  test('schema field set is unchanged', () => {
    const paths = Object.keys(Result.schema.paths).sort();
    expect(paths).toEqual(
      expect.arrayContaining([
        'student', 'exam', 'marksObtained', 'grade', 'percentage',
        'remarks', 'isAbsent', 'school', 'enteredBy', 'createdAt',
      ])
    );
  });

  test.each([
    [95, 100, 95, 'A+'],
    [90, 100, 90, 'A+'],
    [85, 100, 85, 'A'],
    [80, 100, 80, 'A'],
    [75, 100, 75, 'B+'],
    [70, 100, 70, 'B+'],
    [65, 100, 65, 'B'],
    [60, 100, 60, 'B'],
    [55, 100, 55, 'C'],
    [50, 100, 50, 'C'],
    [40, 100, 40, 'D'],
    [35, 100, 35, 'D'],
    [34, 100, 34, 'F'],
    [0, 100, 0, 'F'],
  ])(
    'marks %i of %i yields percentage %i and grade %s',
    async (marks, total, expectedPct, expectedGrade) => {
      const doc = await runGradeHook(marks, total);
      expect(doc.percentage).toBe(expectedPct);
      expect(doc.grade).toBe(expectedGrade);
    }
  );

  test('percentage is rounded, not truncated', async () => {
    // 2/3 = 66.67 -> 67
    const doc = await runGradeHook(2, 3);
    expect(doc.percentage).toBe(67);
    expect(doc.grade).toBe('B');
  });

  test('isAbsent defaults to false', () => {
    const doc = new Result({
      student: new mongoose.Types.ObjectId(),
      exam: new mongoose.Types.ObjectId(),
      marksObtained: 0,
    });
    expect(doc.isAbsent).toBe(false);
  });
});
