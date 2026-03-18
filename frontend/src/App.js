import React from 'react';
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import Layout from './components/common/Layout';

// Pages
import Landing from './pages/Landing';
import Login from './pages/Login';
import Dashboard from './pages/Dashboard';
import Students from './pages/Students';
import Teachers from './pages/Teachers';
import Classes from './pages/Classes';
import Attendance from './pages/Attendance';
import Exams from './pages/Exams';
import Fees from './pages/Fees';
import Timetable from './pages/Timetable';
import Assignments from './pages/Assignments';
import Library from './pages/Library';
import Transport from './pages/Transport';
import Notifications from './pages/Notifications';
import Admissions from './pages/Admissions';
import Profile from './pages/Profile';

const ProtectedRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return (
    <div className="min-h-screen flex items-center justify-center bg-warm dark:bg-gray-900">
      <div className="text-center">
        <div className="text-4xl font-display text-ink dark:text-white mb-3">Edu<span className="text-accent">Core</span></div>
        <div className="w-8 h-8 border-2 border-accent border-t-transparent rounded-full animate-spin mx-auto" />
      </div>
    </div>
  );
  return user ? children : <Navigate to="/login" replace />;
};

const PublicRoute = ({ children }) => {
  const { user, loading } = useAuth();
  if (loading) return null;
  return !user ? children : <Navigate to="/dashboard" replace />;
};

function AppRoutes() {
  return (
    <Routes>
      {/* Public landing page */}
      <Route path="/" element={<Landing />} />
      {/* Auth */}
      <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
      {/* Protected shell */}
      <Route path="/" element={<ProtectedRoute><Layout /></ProtectedRoute>}>
        <Route path="dashboard" element={<Dashboard />} />
        <Route path="students" element={<Students />} />
        <Route path="teachers" element={<Teachers />} />
        <Route path="classes" element={<Classes />} />
        <Route path="attendance" element={<Attendance />} />
        <Route path="exams" element={<Exams />} />
        <Route path="fees" element={<Fees />} />
        <Route path="timetable" element={<Timetable />} />
        <Route path="assignments" element={<Assignments />} />
        <Route path="library" element={<Library />} />
        <Route path="transport" element={<Transport />} />
        <Route path="notifications" element={<Notifications />} />
        <Route path="admissions" element={<Admissions />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<Navigate to="/" replace />} />
    </Routes>
  );
}

function App() {
  return (
    <BrowserRouter>
      <ThemeProvider>
        <AuthProvider>
          <AppRoutes />
          <Toaster position="bottom-right" toastOptions={{ duration: 3000, style: { background: '#0f0e17', color: '#faf8f4', borderRadius: '12px', fontSize: '14px', fontFamily: 'DM Sans, sans-serif', padding: '12px 18px' }, success: { iconTheme: { primary: '#4a7c59', secondary: '#faf8f4' } }, error: { iconTheme: { primary: '#d4522a', secondary: '#faf8f4' } } }} />
        </AuthProvider>
      </ThemeProvider>
    </BrowserRouter>
  );
}

export default App;
