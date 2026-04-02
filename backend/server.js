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

// 🔐 Security Middleware
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ✅ ✅ FIXED CORS CONFIG (Production Ready)
const allowedOrigins = [
  'http://localhost:3000',
  'https://school-management-system-eight-nu.vercel.app',
  'https://school-management-system-k2ncy6iy6-pratikshashep0308s-projects.vercel.app'
];

app.use(cors({
  origin: function (origin, callback) {
    // Allow requests without origin (Postman, mobile apps)
    if (!origin) return callback(null, true);

    // Allow Vercel preview deployments dynamically
    if (origin.includes('vercel.app')) {
      return callback(null, true);
    }

    // Allow specific origins
    if (allowedOrigins.includes(origin)) {
      return callback(null, true);
    }

    console.log('❌ Blocked by CORS:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true
}));

// 📦 Body Parsers
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// 🪵 Logger (dev only)
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ❤️ Health Check
app.get('/api/health', (req, res) => {
  res.json({
    status: 'OK',
    message: 'School Management System API is running',
    timestamp: new Date()
  });
});

// 📁 Routes
const routes = [
  ['/api/auth',               './routes/authRoutes'],
  ['/api/students',           './routes/studentRoutes'],
  ['/api/student-portal',     './routes/studentPortalRoutes'],
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

// 🔁 Load routes safely
routes.forEach(([path, file]) => {
  try {
    app.use(path, require(file));
  } catch (err) {
    console.error('❌ Failed to load route ' + path + ':', err.message);
  }
});

// ❌ 404 Handler
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route ' + req.originalUrl + ' not found'
  });
});

// ⚠️ Error Handler
app.use(errorHandler);

// 🚀 Start Server FIRST
const PORT = process.env.PORT || 5000;
app.listen(PORT, '0.0.0.0', () => {
  console.log('🚀 Server running on port ' + PORT);
});

// 🔗 Connect DB
connectDB().catch(err =>
  console.error('❌ MongoDB connection error:', err.message)
);
