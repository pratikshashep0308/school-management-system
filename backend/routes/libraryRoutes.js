const express = require('express');
const { protect, authorize } = require('../middleware/auth');
const { Book, BookIssue } = require('../models/index');

const router = express.Router();
router.use(protect);

router.get('/books', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.category) filter.category = req.query.category;
  if (req.query.search) filter.title = { $regex: req.query.search, $options: 'i' };
  const books = await Book.find(filter).sort({ title: 1 });
  res.json({ success: true, data: books });
});

router.post('/books', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const book = await Book.create({ ...req.body, availableCopies: req.body.totalCopies, school: req.user.school });
  res.status(201).json({ success: true, data: book });
});

router.put('/books/:id', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const book = await Book.findByIdAndUpdate(req.params.id, req.body, { new: true });
  res.json({ success: true, data: book });
});

router.get('/issues', async (req, res) => {
  const filter = { school: req.user.school };
  if (req.query.status) filter.status = req.query.status;
  const issues = await BookIssue.find(filter)
    .populate('book', 'title author isbn')
    .populate({ path: 'student', populate: { path: 'user', select: 'name' } })
    .sort({ issuedDate: -1 });
  res.json({ success: true, data: issues });
});

router.post('/issue', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const book = await Book.findById(req.body.bookId);
  if (!book || book.availableCopies < 1) {
    return res.status(400).json({ success: false, message: 'Book not available for issue' });
  }
  await Book.findByIdAndUpdate(req.body.bookId, { $inc: { availableCopies: -1 } });
  const dueDate = new Date();
  dueDate.setDate(dueDate.getDate() + (req.body.days || 14));
  const issue = await BookIssue.create({
    book: req.body.bookId,
    student: req.body.studentId,
    dueDate,
    issuedBy: req.user.id,
    school: req.user.school
  });
  res.status(201).json({ success: true, data: issue });
});

router.put('/return/:issueId', authorize('superAdmin', 'schoolAdmin', 'librarian'), async (req, res) => {
  const issue = await BookIssue.findById(req.params.issueId);
  if (!issue) return res.status(404).json({ success: false, message: 'Issue record not found' });
  const daysLate = Math.max(0, Math.floor((new Date() - issue.dueDate) / (1000 * 60 * 60 * 24)));
  const lateFee = daysLate * 5; // ₹5 per day
  await BookIssue.findByIdAndUpdate(req.params.issueId, {
    returnedDate: new Date(), status: 'returned', lateFee
  });
  await Book.findByIdAndUpdate(issue.book, { $inc: { availableCopies: 1 } });
  res.json({ success: true, message: `Book returned. Late fee: ₹${lateFee}`, lateFee });
});

module.exports = router;
