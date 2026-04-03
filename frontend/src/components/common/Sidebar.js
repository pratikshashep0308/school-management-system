// frontend/src/components/common/Sidebar.js
// Sidebar automatically shows/hides items based on user role

import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ADMIN_ROLES   = ['superAdmin', 'schoolAdmin'];
const STAFF_ROLES   = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

// Menu config — each item has a roles array
const MENU_ITEMS = [
  { path: '/dashboard',     icon: '🏠', label: 'Dashboard',     roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },

  // Admin/Staff section
  { path: '/students',      icon: '👥', label: 'Students',      roles: ['superAdmin','schoolAdmin','teacher','accountant'] },
  { path: '/teachers',      icon: '👨‍🏫', label: 'Teachers',      roles: ADMIN_ROLES },
  { path: '/classes',       icon: '🏛', label: 'Classes',       roles: STAFF_ROLES },
  { path: '/attendance',    icon: '📅', label: 'Attendance',    roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/exams',         icon: '📝', label: 'Exams',         roles: STAFF_ROLES },
  { path: '/assignments',   icon: '📋', label: 'Assignments',   roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/fees',          icon: '💰', label: 'Fees',          roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/library',       icon: '📚', label: 'Library',       roles: ['superAdmin','schoolAdmin','librarian'] },
  { path: '/transport',     icon: '🚌', label: 'Transport',     roles: ['superAdmin','schoolAdmin','transportManager'] },
  { path: '/timetable',     icon: '🗓', label: 'Timetable',     roles: STAFF_ROLES },
  { path: '/notifications', icon: '🔔', label: 'Notifications', roles: ADMIN_ROLES },
  { path: '/admissions',    icon: '📄', label: 'Admissions',    roles: ADMIN_ROLES },
  { path: '/profile',       icon: '👤', label: 'My Profile',    roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },
];

// Section labels to group menu items visually
const SECTION_LABELS = {
  '/dashboard':  null,
  '/students':   'Administration',
  '/profile':    null,
};

export default function Sidebar({ isOpen, onClose }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const visibleItems = MENU_ITEMS.filter(item => item.roles.includes(user?.role));

  const roleLabel = {
    superAdmin:       'Super Admin',
    schoolAdmin:      'School Admin',
    teacher:          'Teacher',
    accountant:       'Accountant',
    librarian:        'Librarian',
    transportManager: 'Transport Manager',
    student:          'Student',
    parent:           'Parent',
  }[user?.role] || user?.role;

  const roleColor = {
    superAdmin: '#e87722', schoolAdmin: '#1a3a6b', teacher: '#16a34a',
    accountant: '#dc2626', librarian: '#9333ea',  transportManager: '#0284c7',
    student: '#2563eb',   parent: '#7c3aed',
  }[user?.role] || '#64748b';

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  return (
    <>
      {/* Overlay for mobile */}
      {isOpen && (
        <div onClick={onClose} style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.4)', zIndex: 40, display: 'none' }} className="lg:hidden" />
      )}

      <aside style={{
        width: 240, height: '100vh', background: '#0d2347', position: 'fixed', left: 0, top: 0,
        display: 'flex', flexDirection: 'column', zIndex: 50,
        fontFamily: "'Nunito', sans-serif",
        transform: isOpen === false ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.25s',
        overflowY: 'auto',
      }}>

        {/* Logo */}
        <div style={{ padding: '24px 20px 16px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{ fontSize: 15, fontWeight: 900, color: '#fff' }}>🏫 Future Step School</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>Management Portal</div>
        </div>

        {/* User Badge */}
        <div style={{ padding: '14px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)', display: 'flex', alignItems: 'center', gap: 10 }}>
          <div style={{ width: 36, height: 36, borderRadius: '50%', background: roleColor + '30', border: `2px solid ${roleColor}`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 16, flexShrink: 0 }}>
            {{ superAdmin: '👑', schoolAdmin: '🏫', teacher: '👨‍🏫', accountant: '💼', librarian: '📚', transportManager: '🚌', student: '🎓', parent: '👨‍👩‍👧' }[user?.role] || '👤'}
          </div>
          <div style={{ overflow: 'hidden' }}>
            <div style={{ fontSize: 13, fontWeight: 800, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{user?.name}</div>
            <div style={{ fontSize: 10, fontWeight: 700, color: roleColor }}>{roleLabel}</div>
          </div>
        </div>

        {/* Navigation */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          {visibleItems.map(item => (
            <NavLink
              key={item.path}
              to={item.path}
              onClick={onClose}
              style={({ isActive }) => ({
                display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 10, marginBottom: 2,
                textDecoration: 'none', fontSize: 13, fontWeight: 700,
                transition: 'all 0.15s',
                background: isActive ? 'rgba(232,119,34,0.15)' : 'transparent',
                color:      isActive ? '#e87722' : 'rgba(255,255,255,0.6)',
                borderLeft: isActive ? '3px solid #e87722' : '3px solid transparent',
              })}
            >
              <span style={{ fontSize: 16 }}>{item.icon}</span>
              {item.label}
            </NavLink>
          ))}
        </nav>

        {/* Logout */}
        <div style={{ padding: '12px 10px', borderTop: '1px solid rgba(255,255,255,0.07)' }}>
          <button onClick={handleLogout} style={{
            width: '100%', padding: '10px 12px', borderRadius: 10, border: 'none', cursor: 'pointer',
            background: 'rgba(220,38,38,0.1)', color: '#f87171', fontSize: 13, fontWeight: 700,
            display: 'flex', alignItems: 'center', gap: 10, transition: 'all 0.15s',
          }}>
            🚪 Logout
          </button>
        </div>
      </aside>
    </>
  );
}