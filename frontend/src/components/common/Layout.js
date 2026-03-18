import React, { useState } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard', '/students': 'Students', '/teachers': 'Teachers',
  '/classes': 'Classes', '/attendance': 'Attendance', '/exams': 'Exams & Results',
  '/fees': 'Fee Management', '/timetable': 'Timetable', '/assignments': 'Assignments',
  '/library': 'Library', '/transport': 'Transport', '/notifications': 'Notifications',
  '/admissions': 'Admissions', '/profile': 'My Profile',
};

export default function Layout() {
  const location = useLocation();
  const navigate = useNavigate();
  const { user } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);

  const title = PAGE_TITLES[location.pathname] || 'EduCore';
  const now = new Date();
  const dateStr = now.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <div className={`flex min-h-screen ${isDark ? 'bg-gray-900' : 'bg-warm'}`}>
      {/* Sidebar — desktop */}
      <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:w-64">
        <Sidebar />
      </aside>

      {/* Mobile overlay */}
      {mobileOpen && (
        <div className="fixed inset-0 z-50 flex lg:hidden">
          <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
          <div className="relative w-64 animate-slide-in">
            <Sidebar onClose={() => setMobileOpen(false)} />
          </div>
        </div>
      )}

      {/* Main content */}
      <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">
        {/* Topbar */}
        <header className={`sticky top-0 z-40 h-16 flex items-center justify-between px-6 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-border'}`}>
          <div className="flex items-center gap-4">
            <button
              className={`lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${isDark ? 'border-gray-600 text-gray-300 hover:border-accent hover:text-accent' : 'border-border text-slate hover:border-accent hover:text-accent'}`}
              onClick={() => setMobileOpen(true)}
            >☰</button>
            <h1 className={`font-display text-xl ${isDark ? 'text-white' : 'text-ink'}`}>{title}</h1>
          </div>

          <div className="flex items-center gap-2">
            {/* Theme toggle */}
            <button
              onClick={toggleTheme}
              className={`w-10 h-10 flex items-center justify-center rounded-xl border transition-all text-lg ${isDark ? 'border-gray-600 text-yellow-400 hover:border-yellow-400' : 'border-border text-slate hover:border-accent'}`}
              title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
            >
              {isDark ? '☀️' : '🌙'}
            </button>

            {/* Notifications */}
            <button
              onClick={() => navigate('/notifications')}
              className={`relative w-10 h-10 flex items-center justify-center rounded-xl border transition-all text-lg ${isDark ? 'border-gray-600 text-gray-300 hover:border-accent' : 'border-border hover:border-accent'}`}
            >
              🔔
              <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">3</span>
            </button>

            <div className={`text-sm hidden sm:block ${isDark ? 'text-gray-400' : 'text-muted'}`}>{dateStr}</div>
            <div className={`h-8 w-px hidden sm:block ${isDark ? 'bg-gray-700' : 'bg-border'}`} />

            {/* Profile button */}
            <button
              onClick={() => navigate('/profile')}
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 transition-all ${isDark ? 'hover:bg-gray-700' : 'hover:bg-warm'}`}
            >
              <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold">
                {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
              </div>
              <div className={`text-sm font-medium hidden sm:block truncate max-w-28 ${isDark ? 'text-white' : 'text-ink'}`}>{user?.name?.split(' ')[0]}</div>
            </button>
          </div>
        </header>

        {/* Page content */}
        <main className="flex-1 p-6 lg:p-8 animate-fade-in">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
