// backend/routes/libraryRoutes.js
const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Book, BookIssue } = require('../models/index');

const router = express.Router();
router.use(protect);

const librarian = authorize('superAdmin', 'schoolAdmin', 'librarian');

// ── GET all books ─────────────────────────────────────────────────────────────
router.get('/books', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search)   filter.$or = [
    { title:  { $regex: req.query.search, $options: 'i' } },
    { author: { $regex: req.query.search, $options: 'i' } },
    { isbn:   { $regex: req.query.search, $options: 'i' } },
  ];
  const books = await Book.find(filter).sort({ title: 1 });
  res.json({ success: true, data: books });
});

// ── ADD book ──────────────────────────────────────────────────────────────────
router.post('/books', librarian, async (req, res) => {
  const copies = Number(req.body.totalCopies) || 1;
  const book = await Book.create({
    ...req.body,
    totalCopies: copies,
    availableCopies: copies,
    school: req.user.school,
  });
  res.status(201).json({ success: true, data: book });
});

// ── UPDATE book ───────────────────────────────────────────────────────────────
router.put('/books/:id', librarian, async (req, res) => {
  const book = await Book.findOneAndUpdate(
    { _id: req.params.id, school: req.user.school },
    req.body,
    { new: true }
  );
  if (!book) return res.status(404).json({ success: false, message: 'Book not found' });
  res.json({ success: true, data: book });
});

// ── DELETE book ───────────────────────────────────────────────────────────────
router.delete('/books/:id', librarian, async (req, res) => {
  const inUse = await BookIssue.exists({ book: req.params.id, status: 'issued' });
  if (inUse) return res.status(400).json({ success: false, message: 'Book has active issues — return all copies first' });
  await Book.findOneAndDelete({ _id: req.params.id, school: req.user.school });
  res.json({ success: true, message: 'Book removed from library' });
});

// ── GET issues ────────────────────────────────────────────────────────────────
router.get('/issues', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.status) filter.status = req.query.status;
  if (req.query.student) filter.student = req.query.student;

  // Auto-mark overdue
  await BookIssue.updateMany(
    { school: req.user.school, status: 'issued', dueDate: { $lt: new Date() } },
    { $set: { status: 'overdue' } }
  );

  const issues = await BookIssue.find(filter)
    .populate('book', 'title author isbn')
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .populate('issuedBy', 'name')
    .sort({ issuedDate: -1 })
    .limit(200);

  res.json({ success: true, data: issues });
});

// ── ISSUE book ────────────────────────────────────────────────────────────────
router.post('/issue', librarian, async (req, res) => {
  const book = await Book.findOne({ _id: req.body.bookId, school: req.user.school });
  if (!book || book.availableCopies < 1) {
    return res.status(400).json({ success: false, message: 'Book not available for issue' });
  }
  // Check student doesn't already have this book
  const alreadyIssued = await BookIssue.exists({ book: req.body.bookId, student: req.body.studentId, status: { $in: ['issued', 'overdue'] } });
  if (alreadyIssued) return res.status(400).json({ success: false, message: 'Student already has this book' });

  await Book.findByIdAndUpdate(req.body.bookId, { $inc: { availableCopies: -1 } });

  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (Number(req.body.days) || 14));

  const issue = await BookIssue.create({
    book:      req.body.bookId,
    student:   req.body.studentId,
    dueDate,
    issuedBy:  req.user.id,
    school:    req.user.school,
  });

  await issue.populate([
    { path: 'book',    select: 'title author' },
    { path: 'student', populate: { path: 'user', select: 'name' } },
  ]);

  res.status(201).json({ success: true, data: issue });
});

// ── RETURN book ───────────────────────────────────────────────────────────────
router.put('/return/:issueId', librarian, async (req, res) => {
  const issue = await BookIssue.findOne({ _id: req.params.issueId, school: req.user.school });
  if (!issue) return res.status(404).json({ success: false, message: 'Issue record not found' });
  if (issue.status === 'returned') return res.status(400).json({ success: false, message: 'Book already returned' });

  const daysLate = Math.max(0, Math.floor((new Date() - issue.dueDate) / (1000 * 60 * 60 * 24)));
  const lateFee  = daysLate * 5; // ₹5 per day

  await BookIssue.findByIdAndUpdate(req.params.issueId, {
    returnedDate: new Date(),
    status: 'returned',
    lateFee,
  });
  await Book.findByIdAndUpdate(issue.book, { $inc: { availableCopies: 1 } });

  res.json({ success: true, message: 'Book returned' + (lateFee > 0 ? `. Late fee: ₹${lateFee}` : ''), lateFee });
});

// ── STATS ─────────────────────────────────────────────────────────────────────
router.get('/stats', async (req, res) => {
  const school = req.user.school;
  const [totalBooks, totalCopies, issued, overdue, lateFees] = await Promise.all([
    Book.countDocuments({ school }),
    Book.aggregate([{ $match: { school } }, { $group: { _id: null, total: { $sum: '$totalCopies' }, available: { $sum: '$availableCopies' } } }]),
    BookIssue.countDocuments({ school, status: 'issued' }),
    BookIssue.countDocuments({ school, status: 'issued', dueDate: { $lt: new Date() } }),
    BookIssue.aggregate([{ $match: { school } }, { $group: { _id: null, total: { $sum: '$lateFee' } } }]),
  ]);
  res.json({ success: true, data: {
    totalTitles: totalBooks,
    totalCopies: totalCopies[0]?.total || 0,
    available:   totalCopies[0]?.available || 0,
    issued, overdue,
    lateFeeCollected: lateFees[0]?.total || 0,
  }});
});

module.exports = router;