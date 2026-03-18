import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';
import toast from 'react-hot-toast';

const NAV = [
  { section: 'Overview', items: [
    { to: '/dashboard', icon: '◫', label: 'Dashboard', roles: 'all' },
  ]},
  { section: 'Academics', items: [
    { to: '/students',    icon: '👤', label: 'Students',        roles: ['superAdmin','schoolAdmin','teacher','accountant'] },
    { to: '/teachers',    icon: '🎓', label: 'Teachers',        roles: ['superAdmin','schoolAdmin'] },
    { to: '/classes',     icon: '🏛',  label: 'Classes',         roles: ['superAdmin','schoolAdmin','teacher'] },
    { to: '/attendance',  icon: '✓',  label: 'Attendance',      roles: 'all' },
    { to: '/exams',       icon: '📝', label: 'Exams & Results', roles: 'all' },
    { to: '/assignments', icon: '📋', label: 'Assignments',     roles: 'all' },
    { to: '/timetable',   icon: '🗓',  label: 'Timetable',       roles: 'all' },
  ]},
  { section: 'Administration', items: [
    { to: '/admissions',   icon: '📩', label: 'Admissions',      roles: ['superAdmin','schoolAdmin'] },
    { to: '/fees',         icon: '₹',  label: 'Fee Management',  roles: ['superAdmin','schoolAdmin','accountant','student','parent'] },
    { to: '/library',      icon: '📚', label: 'Library',         roles: 'all' },
    { to: '/transport',    icon: '🚌', label: 'Transport',       roles: ['superAdmin','schoolAdmin','transportManager','student','parent'] },
    { to: '/notifications',icon: '🔔', label: 'Notifications',   roles: 'all' },
  ]},
];

export default function Sidebar({ onClose }) {
  const { user, logout, can } = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const handleLogout = () => {
    logout();
    toast.success('Logged out successfully');
    navigate('/login');
  };

  const initials = user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  const roleColors = {
    superAdmin: '#7c6af5', schoolAdmin: '#d4522a', teacher: '#4a7c59',
    student: '#2d9cdb', parent: '#c9a84c', accountant: '#f2994a',
    librarian: '#e91e8c', transportManager: '#00bcd4',
  };
  const avatarColor = roleColors[user?.role] || '#d4522a';

  const ROLE_LABELS = {
    superAdmin: 'Super Admin', schoolAdmin: 'School Admin', teacher: 'Teacher',
    student: 'Student', parent: 'Parent', accountant: 'Accountant',
    librarian: 'Librarian', transportManager: 'Transport Mgr',
  };

  return (
    <div className="w-64 bg-ink flex flex-col h-full">
      {/* Brand */}
      <div className="px-6 py-7 border-b border-white/10">
        <div className="font-display text-2xl text-white leading-none">
          Edu<span className="text-accent">Core</span>
        </div>
        <div className="text-[10px] text-white/30 mt-1 tracking-widest uppercase">School Management</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3">
        {NAV.map(({ section, items }) => {
          const visible = items.filter(i => i.roles === 'all' || can(i.roles));
          if (!visible.length) return null;
          return (
            <div key={section} className="mb-4">
              <div className="text-[10px] font-semibold uppercase tracking-widest text-white/25 px-3 mb-2">{section}</div>
              {visible.map(({ to, icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `flex items-center gap-3 px-3 py-2.5 rounded-lg mb-0.5 text-sm transition-all duration-150 ${
                      isActive
                        ? 'bg-accent text-white font-medium'
                        : 'text-white/50 hover:text-white hover:bg-white/7'
                    }`
                  }
                >
                  <span className="text-base w-5 text-center">{icon}</span>
                  {label}
                </NavLink>
              ))}
            </div>
          );
        })}

        {/* Profile link */}
        <div className="mb-2">
          <NavLink
            to="/profile"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm transition-all duration-150 ${
                isActive ? 'bg-accent text-white font-medium' : 'text-white/50 hover:text-white hover:bg-white/7'
              }`
            }
          >
            <span className="text-base w-5 text-center">👤</span>
            My Profile
          </NavLink>
        </div>
      </nav>

      {/* User */}
      <div className="px-4 py-4 border-t border-white/10">
        <div className="flex items-center gap-3">
          <button
            onClick={() => { navigate('/profile'); if (onClose) onClose(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0 hover:opacity-90 transition-opacity"
            style={{ background: avatarColor }}
          >
            {initials}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-semibold text-white truncate">{user?.name}</div>
            <div className="text-[11px] text-white/35">{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="text-white/30 hover:text-accent transition-colors text-lg"
            title="Logout"
          >⏻</button>
        </div>

        {/* Theme toggle in sidebar */}
        <button
          onClick={toggleTheme}
          className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-lg text-white/30 hover:text-white/60 hover:bg-white/5 transition-all text-xs"
        >
          <span>{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  );
}
