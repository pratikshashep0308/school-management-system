// backend/routes/questionPaperRoutes.js
//
// Question Paper Management API. Mounted at /api/question-papers under the
// 'examsAdvanced' Access-Control module key (see config/routeTable.js), so it
// inherits the same matrix governance as the rest of the advanced exam module —
// no new module key, no matrix migration. Each route additionally enforces its
// own authorize() as a second line of defence, matching examAdvancedRoutes.js.
//
// Everything is scoped to req.user.school. References existing collections
// (ExamGroup, Class, Subject, AcademicYear) and reuses protect/authorize — no
// duplicate APIs, no mock data.

const express = require('express');
const router  = express.Router();
const { protect, authorize } = require('../middleware/auth');
const { QuestionPaper, QuestionBankItem, QUESTION_TYPES, DIFFICULTIES } =
  require('../models/questionPaperModels');

router.use(protect);

const ADMIN = ['superAdmin', 'schoolAdmin'];
const STAFF = ['superAdmin', 'schoolAdmin', 'teacher'];

// Re-sequence a questions array by its current order, so `order` is always a
// clean 0..n-1 after any reorder/insert/delete the client sends.
function resequence(questions = []) {
  return questions
    .slice()
    .sort((a, b) => (a.order ?? 0) - (b.order ?? 0))
    .map((q, i) => ({ ...q, order: i }));
}

// ═══════════════════════════════════════════════════════════════ META ════════
// Enums for the form (types + difficulties) so the frontend never hardcodes them.
router.get('/meta', (req, res) => {
  res.json({ success: true, data: { questionTypes: QUESTION_TYPES, difficulties: DIFFICULTIES } });
});

// ═══════════════════════════════════════════════════════ QUESTION PAPERS ═════
// List with optional filters: class, subject, examGroup, status.
router.get('/', async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.class)     filter.class     = req.query.class;
    if (req.query.subject)   filter.subject   = req.query.subject;
    if (req.query.examGroup) filter.examGroup = req.query.examGroup;
    if (req.query.status)    filter.status    = req.query.status;

    const papers = await QuestionPaper.find(filter)
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('examGroup', 'name')
      .populate('academicYear', 'name')
      .sort({ updatedAt: -1 })
      .lean({ virtuals: true });

    res.json({ success: true, count: papers.length, data: papers });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Single paper, fully populated, for editing / preview / print.
router.get('/:id', async (req, res) => {
  try {
    const paper = await QuestionPaper.findOne({ _id: req.params.id, school: req.user.school })
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .populate('examGroup', 'name')
      .populate('academicYear', 'name')
      .lean({ virtuals: true });
    if (!paper) return res.status(404).json({ success: false, message: 'Question paper not found' });
    res.json({ success: true, data: paper });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Create.
router.post('/', authorize(...STAFF), async (req, res) => {
  try {
    const body = req.body || {};
    if (!body.title?.trim()) return res.status(400).json({ success: false, message: 'Title is required' });
    if (!body.class)   return res.status(400).json({ success: false, message: 'Class is required' });
    if (!body.subject) return res.status(400).json({ success: false, message: 'Subject is required' });

    const paper = await QuestionPaper.create({
      ...body,
      questions: resequence(body.questions || []),
      school: req.user.school,
      createdBy: req.user._id,
      status: 'draft',
    });
    res.status(201).json({ success: true, data: paper });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Update (title, context, questions, instructions, duration). Re-sequences.
router.put('/:id', authorize(...STAFF), async (req, res) => {
  try {
    const paper = await QuestionPaper.findOne({ _id: req.params.id, school: req.user.school });
    if (!paper) return res.status(404).json({ success: false, message: 'Question paper not found' });

    const b = req.body || {};
    const fields = ['title', 'academicYear', 'examGroup', 'class', 'section', 'subject',
                    'durationMinutes', 'generalInstructions'];
    fields.forEach(f => { if (f in b) paper[f] = b[f]; });
    if ('questions' in b) paper.questions = resequence(b.questions || []);

    await paper.save();
    res.json({ success: true, data: paper });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Publish / unpublish.
router.put('/:id/publish', authorize(...ADMIN), async (req, res) => {
  try {
    const publish = req.body.publish !== false;
    const paper = await QuestionPaper.findOne({ _id: req.params.id, school: req.user.school });
    if (!paper) return res.status(404).json({ success: false, message: 'Question paper not found' });
    if (publish && !(paper.questions || []).length) {
      return res.status(400).json({ success: false, message: 'Cannot publish an empty paper — add questions first.' });
    }
    paper.status = publish ? 'published' : 'draft';
    paper.publishedAt = publish ? new Date() : undefined;
    await paper.save();
    res.json({ success: true, data: paper });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Duplicate — deep-copies content into a new draft. Never carries publish state.
router.post('/:id/duplicate', authorize(...STAFF), async (req, res) => {
  try {
    const src = await QuestionPaper.findOne({ _id: req.params.id, school: req.user.school }).lean();
    if (!src) return res.status(404).json({ success: false, message: 'Question paper not found' });

    const { _id, createdAt, updatedAt, publishedAt, status, __v, ...rest } = src;
    const copy = await QuestionPaper.create({
      ...rest,
      title: `${src.title} (Copy)`,
      questions: resequence((src.questions || []).map(({ _id, ...q }) => q)),
      status: 'draft',
      school: req.user.school,
      createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: copy });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Delete.
router.delete('/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const r = await QuestionPaper.deleteOne({ _id: req.params.id, school: req.user.school });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Question paper not found' });
    res.json({ success: true, message: 'Question paper deleted' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// ═══════════════════════════════════════════════════════════ QUESTION BANK ═══
// Reusable questions. Filter by class, subject, type, difficulty, and a text q.
router.get('/bank/items', async (req, res) => {
  try {
    const filter = { school: req.user.school };
    if (req.query.class)      filter.class      = req.query.class;
    if (req.query.subject)    filter.subject    = req.query.subject;
    if (req.query.type)       filter.type       = req.query.type;
    if (req.query.difficulty) filter.difficulty = req.query.difficulty;
    if (req.query.q)          filter.text = { $regex: String(req.query.q).trim(), $options: 'i' };

    const items = await QuestionBankItem.find(filter)
      .populate('class', 'name section')
      .populate('subject', 'name code')
      .sort({ updatedAt: -1 })
      .limit(500)
      .lean();
    res.json({ success: true, count: items.length, data: items });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

// Add a question to the bank (either typed directly, or "save to bank" from a paper).
router.post('/bank/items', authorize(...STAFF), async (req, res) => {
  try {
    const b = req.body || {};
    if (!b.text?.trim()) return res.status(400).json({ success: false, message: 'Question text is required' });
    const item = await QuestionBankItem.create({
      ...b, school: req.user.school, createdBy: req.user._id,
    });
    res.status(201).json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.put('/bank/items/:id', authorize(...STAFF), async (req, res) => {
  try {
    const item = await QuestionBankItem.findOneAndUpdate(
      { _id: req.params.id, school: req.user.school }, req.body, { new: true });
    if (!item) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, data: item });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

router.delete('/bank/items/:id', authorize(...ADMIN), async (req, res) => {
  try {
    const r = await QuestionBankItem.deleteOne({ _id: req.params.id, school: req.user.school });
    if (!r.deletedCount) return res.status(404).json({ success: false, message: 'Question not found' });
    res.json({ success: true, message: 'Question removed from bank' });
  } catch (e) { res.status(500).json({ success: false, message: e.message }); }
});

module.exports = router;
