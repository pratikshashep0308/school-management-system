import React from 'react';
import { useAuth } from '../context/AuthContext';
import AdminDashboard from './AdminDashboard';
import StudentDashboard from './StudentDashboard';
import ParentDashboard from './ParentDashboard';
import AccountantDashboard from './AccountantDashboard';
import TeacherDashboard from './TeacherDashboard';

// Smart role-router — renders the correct dashboard per user role
export default function Dashboard() {
  const { user } = useAuth();
  const role = user?.role;

  if (role === 'student') return <StudentDashboard />;
  if (role === 'parent') return <ParentDashboard />;
  if (role === 'accountant') return <AccountantDashboard />;
  if (role === 'teacher') return <TeacherDashboard />;
  // superAdmin, schoolAdmin, librarian, transportManager → Admin dashboard
  return <AdminDashboard />;
}
