const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();
require('express-async-errors');

const connectDB = require('./config/db');
const errorHandler = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);

app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// Health check registered EARLY so Render detects port immediately
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'School Management System API is running', timestamp: new Date() });
});

// Load routes safely — one bad file won't crash the whole server
const routes = [
  ['/api/auth',               './routes/authRoutes'],
  ['/api/students',           './routes/studentRoutes'],
  ['/api/teachers',           './routes/teacherRoutes'],
  ['/api/classes',            './routes/classRoutes'],
  ['/api/subjects',           './routes/subjectRoutes'],
  ['/api/attendance',         './routes/attendanceRoutes'],
  ['/api/exams',              './routes/examRoutes'],
  ['/api/fees',               './routes/feeRoutes'],
  ['/api/timetable',          './routes/timetableRoutes'],
  ['/api/assignments',        './routes/assignmentRoutes'],
  ['/api/library',            './routes/libraryRoutes'],
  ['/api/transport',          './routes/transportRoutes'],
  ['/api/transport/vehicles', './routes/vehicleRoutes'],
  ['/api/transport/fees',     './routes/transportFeeRoutes'],
  ['/api/notifications',      './routes/notificationRoutes'],
  ['/api/admissions',         './routes/admissionRoutes'],
  ['/api/dashboard',          './routes/dashboardRoutes'],
];

routes.forEach(([path, file]) => {
  try {
    app.use(path, require(file));
  } catch (err) {
    console.error('Failed to load route ' + path + ':', err.message);
  }
});

app.use('*', (req, res) => res.status(404).json({ success: false, message: 'Route ' + req.originalUrl + ' not found' }));
app.use(errorHandler);

// Listen FIRST — then connect DB
// This ensures port is open before Render's scan timeout
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('Server running on port ' + PORT);
});

connectDB().catch(err => console.error('MongoDB connection error:', err.message));