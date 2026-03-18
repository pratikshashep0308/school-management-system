const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
require('express-async-errors');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

// Connect to MongoDB
connectDB();

const app = express();

// Security headers
app.use(helmet());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100,
  message: 'Too many requests from this IP, please try again after 15 minutes'
});
app.use('/api/', limiter);

// CORS
app.use(cors({
  origin: process.env.FRONTEND_URL || 'http://localhost:3000',
  credentials: true
}));

// Body parser
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Logging in development
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ── ROUTES ──
app.use('/api/auth',          require('./routes/authRoutes'));
app.use('/api/students',      require('./routes/studentRoutes'));
app.use('/api/teachers',      require('./routes/teacherRoutes'));
app.use('/api/classes',       require('./routes/classRoutes'));
app.use('/api/subjects',      require('./routes/subjectRoutes'));
app.use('/api/attendance',    require('./routes/attendanceRoutes'));
app.use('/api/exams',         require('./routes/examRoutes'));
app.use('/api/fees',          require('./routes/feeRoutes'));
app.use('/api/timetable',     require('./routes/timetableRoutes'));
app.use('/api/assignments',   require('./routes/assignmentRoutes'));
app.use('/api/library',       require('./routes/libraryRoutes'));
app.use('/api/transport',     require('./routes/transportRoutes'));
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admissions',   require('./routes/admissionRoutes'));
app.use('/api/dashboard',     require('./routes/dashboardRoutes'));

// Health check
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'School Management System API is running', timestamp: new Date() });
});

// Handle unmatched routes
app.use('*', (req, res) => {
  res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` });
});

// Global error handler (must be last)
app.use(errorHandler);

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT} in ${process.env.NODE_ENV} mode`);
});
