// frontend/src/App.js
// Replace your existing App.js with this — adds role-based routing

import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';

// Pages
import Login           from './pages/Login';
import Landing         from './pages/Landing';
import AdminDashboard  from './pages/AdminDashboard';
import StudentDashboard from './pages/StudentDashboard';
import ParentDashboard  from './pages/ParentDashboard';
import TeacherDashboard from './pages/TeacherDashboard';

// Admin pages (existing)
import Students    from './pages/Students';
import Teachers    from './pages/Teachers';
import Classes     from './pages/Classes';
import Attendance  from './pages/Attendance';
import Exams       from './pages/Exams';
import Fees        from './pages/Fees';
import Library     from './pages/Library';
import Transport   from './pages/Transport';
import Timetable   from './pages/Timetable';
import Assignments from './pages/Assignments';
import Notifications from './pages/Notifications';
import Profile     from './pages/Profile';
import Admissions  from './pages/Admissions';

import Layout from './components/common/Layout';

// ── ProtectedRoute: redirect to login if not authenticated ────────────────────
function ProtectedRoute({ children }) {
  const { user, loading } = useAuth();
  if (loading) return <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh', fontSize: 24 }}>⏳</div>;
  if (!user)   return <Navigate to="/login" replace />;
  return children;
}

// ── RoleRoute: redirect if role not allowed ───────────────────────────────────
function RoleRoute({ children, roles }) {
  const { user } = useAuth();
  if (!roles.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

// ── Smart Dashboard: redirect to role-appropriate dashboard ──────────────────
function SmartDashboard() {
  const { user } = useAuth();
  if (user?.role === 'student')  return <StudentDashboard />;
  if (user?.role === 'parent')   return <ParentDashboard />;
  if (user?.role === 'teacher')  return <TeacherDashboard />;
  return <AdminDashboard />;  // superAdmin, schoolAdmin, accountant, etc.
}

// ── Admin-only guard ──────────────────────────────────────────────────────────
const ADMIN_ROLES = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

function AdminRoute({ children }) {
  const { user } = useAuth();
  if (!ADMIN_ROLES.includes(user?.role)) return <Navigate to="/dashboard" replace />;
  return children;
}

export default function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
      <AuthProvider>
        <Toaster position="top-right" />
        <Routes>
          {/* Public */}
          <Route path="/"      element={<Landing />} />
          <Route path="/login" element={<Login />}   />

          {/* Protected — all roles */}
          <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>

            {/* Smart dashboard — renders based on role */}
            <Route path="dashboard" element={<SmartDashboard />} />

            {/* Profile — all roles */}
            <Route path="profile" element={<Profile />} />

            {/* ── ADMIN-ONLY routes ── */}
            <Route path="students"    element={<AdminRoute><Students /></AdminRoute>} />
            <Route path="teachers"    element={<AdminRoute><Teachers /></AdminRoute>} />
            <Route path="classes"     element={<AdminRoute><Classes /></AdminRoute>} />
            <Route path="attendance"  element={<AdminRoute><Attendance /></AdminRoute>} />
            <Route path="exams"       element={<AdminRoute><Exams /></AdminRoute>} />
            <Route path="fees"        element={<AdminRoute><Fees /></AdminRoute>} />
            <Route path="library"     element={<AdminRoute><Library /></AdminRoute>} />
            <Route path="transport"   element={<AdminRoute><Transport /></AdminRoute>} />
            <Route path="timetable"   element={<AdminRoute><Timetable /></AdminRoute>} />
            <Route path="assignments" element={<AdminRoute><Assignments /></AdminRoute>} />
            <Route path="notifications" element={<AdminRoute><Notifications /></AdminRoute>} />
            <Route path="admissions"  element={<AdminRoute><Admissions /></AdminRoute>} />

          </Route>

          {/* Fallback */}
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}