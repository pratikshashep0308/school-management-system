const express    = require('express');
const cors       = require('cors');
const helmet     = require('helmet');
const morgan     = require('morgan');
const rateLimit  = require('express-rate-limit');
const http       = require('http');                  // ← NEW: needed for Socket.IO
const { Server } = require('socket.io');             // ← NEW: Socket.IO server
require('dotenv').config();
require('express-async-errors');

const connectDB      = require('./config/db');
const errorHandler   = require('./middleware/errorHandler');

const app = express();
app.set('trust proxy', 1);

// ─────────────────────────────────────────────────────────────────────────────
// 🔒 Security Middleware
// ─────────────────────────────────────────────────────────────────────────────
app.use(helmet());
app.use(rateLimit({ windowMs: 15 * 60 * 1000, max: 100 }));

// ─────────────────────────────────────────────────────────────────────────────
// ✅ CORS — shared config used by both Express and Socket.IO
// ─────────────────────────────────────────────────────────────────────────────
const allowedOrigins = [
  'http://localhost:3000',
  'https://school-management-system-eight-nu.vercel.app',
  'https://school-management-system-k2ncy6iy6-pratikshashep0308s-projects.vercel.app',
];

const corsOptions = {
  origin: function (origin, callback) {
    // Allow requests with no origin (Postman, mobile apps, server-to-server)
    if (!origin) return callback(null, true);
    // Allow all Vercel preview deployments dynamically
    if (origin.includes('vercel.app')) return callback(null, true);
    // Allow explicit origins
    if (allowedOrigins.includes(origin)) return callback(null, true);

    console.log('❌ Blocked by CORS:', origin);
    callback(new Error('Not allowed by CORS'));
  },
  credentials: true,
};

app.use(cors(corsOptions));

// ─────────────────────────────────────────────────────────────────────────────
// 📦 Body Parsers
// ─────────────────────────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// ─────────────────────────────────────────────────────────────────────────────
// 🪵 Logger (dev only)
// ─────────────────────────────────────────────────────────────────────────────
if (process.env.NODE_ENV === 'development') {
  app.use(morgan('dev'));
}

// ─────────────────────────────────────────────────────────────────────────────
// ❤️  Health Check
// ─────────────────────────────────────────────────────────────────────────────
app.get('/api/health', (req, res) => {
  res.json({
    status:    'OK',
    message:   'School Management System API is running',
    timestamp: new Date(),
    socketIO:  'enabled',             // ← confirms Socket.IO is active
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// 📁 Routes — load safely (won't crash server if one file has an error)
// ─────────────────────────────────────────────────────────────────────────────
const routes = [
  ['/api/auth',           './routes/authRoutes'],
  ['/api/students',       './routes/studentRoutes'],
  ['/api/student-portal', './routes/studentPortalRoutes'],
  ['/api/teachers',       './routes/teacherRoutes'],
  ['/api/classes',        './routes/classRoutes'],
  ['/api/subjects',       './routes/subjectRoutes'],
  ['/api/attendance',     './routes/attendanceRoutes'],
  ['/api/exams',          './routes/examRoutes'],
  ['/api/fees',           './routes/feeRoutes'],
  ['/api/timetable',      './routes/timetableRoutes'],
  ['/api/assignments',    './routes/assignmentRoutes'],
  ['/api/library',        './routes/libraryRoutes'],
  // ── Transport routes (new unified router — handles buses, routes, stops,
  //    assignments, trips, fees, GPS, and student/parent portal in one file)
  ['/api/transport',      './routes/transportRoutes'],   // ← replaces old 3-file split
  ['/api/notifications',  './routes/notificationRoutes'],
  ['/api/admissions',     './routes/admissionRoutes'],
  ['/api/dashboard',      './routes/dashboardRoutes'],
];

routes.forEach(([path, file]) => {
  try {
    app.use(path, require(file));
  } catch (err) {
    console.error('❌ Failed to load route', path + ':', err.message);
  }
});

// ─────────────────────────────────────────────────────────────────────────────
// ❌ 404 Handler
// ─────────────────────────────────────────────────────────────────────────────
app.use('*', (req, res) => {
  res.status(404).json({
    success: false,
    message: 'Route ' + req.originalUrl + ' not found',
  });
});

// ─────────────────────────────────────────────────────────────────────────────
// ⚠️  Global Error Handler
// ─────────────────────────────────────────────────────────────────────────────
app.use(errorHandler);

// ─────────────────────────────────────────────────────────────────────────────
// 🔌 Create HTTP server (wraps Express so Socket.IO can share the same port)
// ─────────────────────────────────────────────────────────────────────────────
const httpServer = http.createServer(app);

// ─────────────────────────────────────────────────────────────────────────────
// 🛰️  Socket.IO — real-time GPS tracking for transport management
// ─────────────────────────────────────────────────────────────────────────────
const io = new Server(httpServer, {
  cors: corsOptions,                  // same CORS rules as Express
  transports: ['websocket', 'polling'],
  pingTimeout:  60000,               // 60 s before declaring client gone
  pingInterval: 25000,               // heartbeat every 25 s
});

// Make `io` available inside any Express controller via req.app.get('io')
app.set('io', io);

// Register transport-specific socket event handlers
try {
  require('./sockets/transportSocket')(io);
} catch (err) {
  console.error('❌ Failed to load transport socket:', err.message);
}

// ─────────────────────────────────────────────────────────────────────────────
// 🚀 Start Server
// ─────────────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;

httpServer.listen(PORT, '0.0.0.0', () => {
  console.log('');
  console.log('🚀 Server running on port', PORT);
  console.log('🛰️  Socket.IO ready for real-time GPS');
  console.log('📡 Health check: http://localhost:' + PORT + '/api/health');
  console.log('');
});

// ─────────────────────────────────────────────────────────────────────────────
// 🔗 Connect MongoDB
// ─────────────────────────────────────────────────────────────────────────────
connectDB().catch(err =>
  console.error('❌ MongoDB connection error:', err.message)
);