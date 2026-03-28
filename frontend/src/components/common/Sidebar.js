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
    { to: '/transport',          icon: '🚌', label: 'Transport',          roles: ['superAdmin','schoolAdmin','transportManager','student','parent'] },
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
    superAdmin: '#e87722', schoolAdmin: '#1a3a6b', teacher: '#16a34a',
    student: '#2563eb', parent: '#9333ea', accountant: '#dc2626',
    librarian: '#0891b2', transportManager: '#ca8a04',
  };
  const avatarColor = roleColors[user?.role] || '#1a3a6b';

  const ROLE_LABELS = {
    superAdmin: 'Super Admin', schoolAdmin: 'School Admin', teacher: 'Teacher',
    student: 'Student', parent: 'Parent', accountant: 'Accountant',
    librarian: 'Librarian', transportManager: 'Transport Mgr',
  };

  return (
    <div className="w-64 flex flex-col h-full" style={{ background: 'linear-gradient(180deg, #0d2347 0%, #1a3a6b 100%)' }}>
      <style>{`
        .tfs-nav-active {
          background: linear-gradient(135deg, #e87722, #c75e0a) !important;
          color: white !important;
          font-weight: 700;
          box-shadow: 0 4px 14px rgba(232,119,34,0.35);
        }
        .tfs-nav-link {
          color: rgba(255,255,255,0.55);
          transition: all 0.18s ease;
        }
        .tfs-nav-link:hover {
          color: white;
          background: rgba(255,255,255,0.08);
        }
        .tfs-sidebar-logo {
          background: linear-gradient(135deg, #e87722, #f59e0b);
          -webkit-background-clip: text;
          -webkit-text-fill-color: transparent;
          background-clip: text;
        }
        @keyframes tfsGlow {
          0%,100% { box-shadow: 0 0 0 0 rgba(232,119,34,0); }
          50% { box-shadow: 0 0 0 6px rgba(232,119,34,0.15); }
        }
        .tfs-logo-ring { animation: tfsGlow 3s ease-in-out infinite; }
      `}</style>

      {/* Brand */}
      <div className="px-5 py-6 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <div className="tfs-logo-ring w-11 h-11 rounded-full flex items-center justify-center font-black text-sm" style={{ background: 'linear-gradient(135deg, #e87722, #f59e0b)', color: '#fff', fontFamily: 'Georgia, serif', letterSpacing: '-0.5px' }}>
            TFS
          </div>
          <div>
            <div className="text-white font-bold text-sm leading-tight">The Future Step</div>
            <div className="text-xs font-semibold" style={{ color: '#e87722' }}>School</div>
          </div>
        </div>
        <div className="text-[9px] text-white/20 mt-3 uppercase tracking-widest pl-0.5 font-semibold">School Management System</div>
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto py-3 px-3" style={{ scrollbarWidth: 'none' }}>
        {NAV.map(({ section, items }) => {
          const visible = items.filter(i => i.roles === 'all' || can(i.roles));
          if (!visible.length) return null;
          return (
            <div key={section} className="mb-5">
              <div className="text-[9px] font-black uppercase tracking-widest px-3 mb-2" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.12em' }}>{section}</div>
              {visible.map(({ to, icon, label }) => (
                <NavLink
                  key={to}
                  to={to}
                  onClick={onClose}
                  className={({ isActive }) =>
                    `tfs-nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl mb-0.5 text-sm ${isActive ? 'tfs-nav-active' : ''}`
                  }
                >
                  <span className="text-base w-5 text-center flex-shrink-0">{icon}</span>
                  <span className="font-semibold">{label}</span>
                </NavLink>
              ))}
            </div>
          );
        })}

        <div className="mb-2">
          <NavLink
            to="/profile"
            onClick={onClose}
            className={({ isActive }) =>
              `tfs-nav-link flex items-center gap-3 px-3 py-2.5 rounded-xl text-sm ${isActive ? 'tfs-nav-active' : ''}`
            }
          >
            <span className="text-base w-5 text-center">👤</span>
            <span className="font-semibold">My Profile</span>
          </NavLink>
        </div>
      </nav>

      {/* User footer */}
      <div className="px-4 py-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
        <div className="flex items-center gap-3">
          <button
            onClick={() => { navigate('/profile'); if (onClose) onClose(); }}
            className="w-9 h-9 rounded-full flex items-center justify-center text-white font-bold text-xs flex-shrink-0 hover:opacity-90 transition-opacity ring-2 ring-white/10"
            style={{ background: avatarColor }}
          >
            {initials}
          </button>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-bold text-white truncate">{user?.name}</div>
            <div className="text-[11px]" style={{ color: 'rgba(255,255,255,0.35)' }}>{ROLE_LABELS[user?.role] || user?.role}</div>
          </div>
          <button
            onClick={handleLogout}
            className="hover:text-orange-400 transition-colors text-lg"
            style={{ color: 'rgba(255,255,255,0.25)' }}
            title="Logout"
          >⏻</button>
        </div>

        <button
          onClick={toggleTheme}
          className="mt-3 w-full flex items-center gap-2 px-3 py-2 rounded-xl transition-all text-xs font-semibold"
          style={{ color: 'rgba(255,255,255,0.3)', background: 'rgba(255,255,255,0.04)' }}
        >
          <span>{isDark ? '☀️' : '🌙'}</span>
          <span>{isDark ? 'Light Mode' : 'Dark Mode'}</span>
        </button>
      </div>
    </div>
  );
}