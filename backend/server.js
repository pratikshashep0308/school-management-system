// backend/server.js  — ADD these changes to your existing server.js
// ─────────────────────────────────────────────────────────────────
// 1. Replace: const app = express();
//    With the block below to attach Socket.io

const express    = require('express');
const http       = require('http');           // NEW
const { Server } = require('socket.io');      // NEW — npm install socket.io
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
require('dotenv').config();
require('express-async-errors');

const connectDB      = require('./config/db');
const errorHandler   = require('./middleware/errorHandler');
const transportSocket = require('./sockets/transportSocket');  // NEW

connectDB();

const app    = express();
const server = http.createServer(app);          // NEW — wrap in http server

// ── Socket.io setup ──────────────────────────────────────────────────────────
const io = new Server(server, {                 // NEW
  cors: {
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    methods: ['GET', 'POST'],
  },
  pingTimeout: 30000,
  pingInterval: 10000,
});

// Make io accessible in controllers via req.app.get('io')
app.set('io', io);                              // NEW

// Register all transport socket events
transportSocket(io);                            // NEW
// ─────────────────────────────────────────────────────────────────────────────

app.set('trust proxy', 1);
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));
app.use(cors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000', credentials: true }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));
if (process.env.NODE_ENV === 'development') app.use(morgan('dev'));

// ── EXISTING ROUTES ──────────────────────────────────────────────────────────
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
app.use('/api/notifications', require('./routes/notificationRoutes'));
app.use('/api/admissions',    require('./routes/admissionRoutes'));
app.use('/api/dashboard',     require('./routes/dashboardRoutes'));

// ── NEW TRANSPORT MODULE ─────────────────────────────────────────────────────
app.use('/api/transport',     require('./routes/transportRoutes'));

app.get('/api/health', (req, res) => res.json({ status: 'OK', timestamp: new Date() }));
app.use('*', (req, res) => res.status(404).json({ success: false, message: `Route ${req.originalUrl} not found` }));
app.use(errorHandler);

const PORT = process.env.PORT || 5000;

// ── IMPORTANT: use server.listen instead of app.listen for Socket.io ─────────
server.listen(PORT, () => {                     // CHANGED from app.listen
  console.log(`🚀 Server running on port ${PORT}`);
});