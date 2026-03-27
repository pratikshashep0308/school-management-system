const mongoose = require('mongoose');

// ── CLASS ──
const ClassSchema = new mongoose.Schema({
  name: { type: String, required: true }, // e.g. "Class X"
  grade: { type: Number, required: true }, // e.g. 10
  section: { type: String, required: true }, // e.g. "A"
  classTeacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
  subjects: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Subject' }],
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  capacity: { type: Number, default: 40 },
  room: String,
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});
ClassSchema.index({ grade: 1, section: 1, school: 1 }, { unique: true });

// ── SUBJECT ──
const SubjectSchema = new mongoose.Schema({
  name: { type: String, required: true },
  code: { type: String, unique: true },
  description: String,
  type: { type: String, enum: ['theory', 'practical', 'both'], default: 'theory' },
  classes: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Class' }],
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── ATTENDANCE ──
const AttendanceSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  date: { type: Date, required: true },
  status: { type: String, enum: ['present', 'absent', 'late', 'excused'], required: true },
  markedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  remarks: String,
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});
AttendanceSchema.index({ student: 1, date: 1 }, { unique: true });

// ── EXAM ──
const ExamSchema = new mongoose.Schema({
  name: { type: String, required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  date: Date,
  startTime: String,
  endTime: String,
  totalMarks: { type: Number, default: 100 },
  passingMarks: { type: Number, default: 35 },
  examType: { type: String, enum: ['unit', 'midterm', 'final', 'practical', 'assignment'], default: 'unit' },
  instructions: String,
  isPublished: { type: Boolean, default: false },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// ── RESULT ──
const ResultSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  exam: { type: mongoose.Schema.Types.ObjectId, ref: 'Exam', required: true },
  marksObtained: { type: Number, required: true },
  grade: String,         // Auto-calculated
  percentage: Number,    // Auto-calculated
  remarks: String,
  isAbsent: { type: Boolean, default: false },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  enteredBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  createdAt: { type: Date, default: Date.now }
});

// Auto-calculate grade and percentage before saving
ResultSchema.pre('save', async function(next) {
  const Exam = mongoose.model('Exam');
  const exam = await Exam.findById(this.exam);
  if (exam) {
    this.percentage = Math.round((this.marksObtained / exam.totalMarks) * 100);
    if (this.percentage >= 90)      this.grade = 'A+';
    else if (this.percentage >= 80) this.grade = 'A';
    else if (this.percentage >= 70) this.grade = 'B+';
    else if (this.percentage >= 60) this.grade = 'B';
    else if (this.percentage >= 50) this.grade = 'C';
    else if (this.percentage >= 35) this.grade = 'D';
    else                            this.grade = 'F';
  }
  next();
});

// ── FEE STRUCTURE ──
const FeeStructureSchema = new mongoose.Schema({
  name: { type: String, required: true },
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  amount: { type: Number, required: true },
  frequency: { type: String, enum: ['monthly', 'quarterly', 'annually', 'one-time'], default: 'monthly' },
  dueDay: { type: Number, default: 10 }, // Day of month fee is due
  lateFee: { type: Number, default: 200 },
  description: String,
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── FEE PAYMENT ──
const FeePaymentSchema = new mongoose.Schema({
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student', required: true },
  feeStructure: { type: mongoose.Schema.Types.ObjectId, ref: 'FeeStructure' },
  amount: { type: Number, required: true },
  paidOn: { type: Date, default: Date.now },
  method: { type: String, enum: ['cash', 'online', 'cheque', 'bank', 'upi'], default: 'cash' },
  transactionId: String,
  receiptNumber: { type: String, unique: true },
  status: { type: String, enum: ['paid', 'pending', 'overdue', 'partial'], default: 'paid' },
  month: String,   // e.g. "March 2026"
  year: Number,
  remarks: String,
  collectedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// Auto-generate receipt number
FeePaymentSchema.pre('save', function(next) {
  if (!this.receiptNumber) {
    this.receiptNumber = 'RCP-' + Date.now() + '-' + Math.random().toString(36).substr(2, 5).toUpperCase();
  }
  next();
});

// ── TIMETABLE ──
const TimetableSchema = new mongoose.Schema({
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  day: { type: String, enum: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'], required: true },
  periods: [{
    periodNumber: Number,
    subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
    teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher' },
    startTime: String,  // "09:00"
    endTime: String,    // "09:45"
    room: String
  }],
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── ASSIGNMENT ──
const AssignmentSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  class: { type: mongoose.Schema.Types.ObjectId, ref: 'Class', required: true },
  subject: { type: mongoose.Schema.Types.ObjectId, ref: 'Subject' },
  teacher: { type: mongoose.Schema.Types.ObjectId, ref: 'Teacher', required: true },
  dueDate: { type: Date, required: true },
  attachments: [{ name: String, url: String }],
  totalMarks: { type: Number, default: 10 },
  submissions: [{
    student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
    submittedAt: Date,
    fileUrl: String,
    marksObtained: Number,
    feedback: String,
    status: { type: String, enum: ['submitted', 'late', 'graded'], default: 'submitted' }
  }],
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── BOOK ──
const BookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  isbn: { type: String, unique: true },
  category: String,
  publisher: String,
  publishYear: Number,
  totalCopies: { type: Number, default: 1 },
  availableCopies: { type: Number, default: 1 },
  location: String, // Shelf/rack info
  coverImage: String,
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── BOOK ISSUE ──
const BookIssueSchema = new mongoose.Schema({
  book: { type: mongoose.Schema.Types.ObjectId, ref: 'Book', required: true },
  student: { type: mongoose.Schema.Types.ObjectId, ref: 'Student' },
  user: { type: mongoose.Schema.Types.ObjectId, ref: 'User' }, // For teachers/staff
  issuedDate: { type: Date, default: Date.now },
  dueDate: { type: Date, required: true },
  returnedDate: Date,
  lateFee: { type: Number, default: 0 },
  status: { type: String, enum: ['issued', 'returned', 'overdue'], default: 'issued' },
  issuedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── TRANSPORT ──
const TransportSchema = new mongoose.Schema({
  routeName: { type: String, required: true },
  routeNumber: String,
  vehicleNumber: String,
  vehicleType: { type: String, enum: ['bus', 'van', 'minibus'], default: 'bus' },
  capacity: Number,
  driver: {
    name: String,
    phone: String,
    licenseNumber: String
  },
  conductor: {
    name: String,
    phone: String
  },
  stops: [{ name: String, time: String, order: Number }],
  departureTime: String,
  arrivalTime: String,
  students: [{ type: mongoose.Schema.Types.ObjectId, ref: 'Student' }],
  isActive: { type: Boolean, default: true },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

// ── NOTIFICATION ──
const NotificationSchema = new mongoose.Schema({
  title: { type: String, required: true },
  message: { type: String, required: true },
  type: { type: String, enum: ['announcement', 'reminder', 'alert', 'event'], default: 'announcement' },
  priority: { type: String, enum: ['normal', 'high', 'urgent'], default: 'normal' },
  audience: { type: String, enum: ['all', 'students', 'teachers', 'parents', 'staff'], default: 'all' },
  targetClass: { type: mongoose.Schema.Types.ObjectId, ref: 'Class' },
  readBy: [{ type: mongoose.Schema.Types.ObjectId, ref: 'User' }],
  sentBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  isEmailSent: { type: Boolean, default: false },
  isSMSSent: { type: Boolean, default: false },
  school: { type: mongoose.Schema.Types.ObjectId, ref: 'School' },
  createdAt: { type: Date, default: Date.now }
});

module.exports.Class = mongoose.model('Class', ClassSchema);
module.exports.Subject = mongoose.model('Subject', SubjectSchema);
module.exports.Attendance = mongoose.model('Attendance', AttendanceSchema);
module.exports.Exam = mongoose.model('Exam', ExamSchema);
module.exports.Result = mongoose.model('Result', ResultSchema);
module.exports.FeeStructure = mongoose.model('FeeStructure', FeeStructureSchema);
module.exports.FeePayment = mongoose.model('FeePayment', FeePaymentSchema);
module.exports.Timetable = mongoose.model('Timetable', TimetableSchema);
module.exports.Assignment = mongoose.model('Assignment', AssignmentSchema);
module.exports.Book = mongoose.model('Book', BookSchema);
module.exports.BookIssue = mongoose.model('BookIssue', BookIssueSchema);
module.exports.Transport = mongoose.model('Transport', TransportSchema);
module.exports.Notification = mongoose.model('Notification', NotificationSchema);
module.exports.StudentFee  = mongoose.model('StudentFee',  StudentFeeSchema);













