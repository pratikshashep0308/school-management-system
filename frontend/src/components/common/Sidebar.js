// frontend/src/components/common/Sidebar.js
import React from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin'];
const STAFF_ROLES = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

const MENU_ITEMS = [
  { path: '/dashboard',     icon: '⊞',  label: 'Dashboard',     roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },
  { path: '/settings',      icon: '⚙️', label: 'Settings',          roles: ['superAdmin','schoolAdmin'] },
  { path: '/id-cards',       icon: '🪪', label: 'ID Cards',         roles: ['superAdmin','schoolAdmin'] },
  { path: '/students',      icon: '👥', label: 'Students',      roles: ['superAdmin','schoolAdmin','teacher','accountant'] },
  { path: '/teachers',      icon: '👤', label: 'Employees',      roles: ADMIN_ROLES },
  { path: '/classes',       icon: '🏛',  label: 'Classes',       roles: STAFF_ROLES },
  { path: '/salary',        icon: '💰', label: 'Salary',         roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/attendance',    icon: '📅', label: 'Attendance',    roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/exams',         icon: '📝', label: 'Exams',         roles: STAFF_ROLES },
  { path: '/assignments',   icon: '📋', label: 'Assignments',   roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/fees',          icon: '💳', label: 'Fees',          roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/expenses',      icon: '💸', label: 'Expenses',      roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/library',       icon: '📚', label: 'Library',       roles: ['superAdmin','schoolAdmin','librarian'] },
  { path: '/transport',     icon: '🚌', label: 'Transport',     roles: ['superAdmin','schoolAdmin','transportManager'] },
  { path: '/homework',      icon: '📚', label: 'Homework',          roles: ['superAdmin','schoolAdmin','teacher','student','parent'] },
  { path: '/timetable',     icon: '🗓',  label: 'Timetable',     roles: STAFF_ROLES },
  { path: '/notifications', icon: '🔔', label: 'Notifications', roles: ADMIN_ROLES },
  { path: '/admissions',    icon: '📄', label: 'Admissions',    roles: ADMIN_ROLES },
  { path: '/reports',       icon: '📊', label: 'Reports',       roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager'] },
  { path: '/profile',       icon: '👤', label: 'My Profile',    roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },
];

const PORTAL_SECTIONS = [
  {
    group: 'ACADEMICS',
    items: [
      { id: 'overview',    icon: '⊞',  label: 'Overview' },
      { id: 'attendance',  icon: '📅', label: 'Attendance' },
      { id: 'timetable',   icon: '🗓',  label: 'Timetable' },
      { id: 'exams',       icon: '📝', label: 'Exams' },
      { id: 'assignments', icon: '📋', label: 'Assignments' },
    ],
  },
  {
    group: 'FINANCE & SERVICES',
    items: [
      { id: 'fees',      icon: '💳', label: 'Fees' },
      { id: 'transport', icon: '🚌', label: 'Transport' },
    ],
  },
];

const ROLE_META = {
  superAdmin:       { label: 'Super Admin',       emoji: '👑', color: '#e87722' },
  schoolAdmin:      { label: 'School Admin',      emoji: '🏫', color: '#3b82f6' },
  teacher:          { label: 'Employee',           emoji: '🎓', color: '#16a34a' },
  accountant:       { label: 'Accountant',        emoji: '💼', color: '#dc2626' },
  librarian:        { label: 'Librarian',         emoji: '📚', color: '#9333ea' },
  transportManager: { label: 'Transport Manager', emoji: '🚌', color: '#0284c7' },
  student:          { label: 'Student',           emoji: '🎒', color: '#2563eb' },
  parent:           { label: 'Parent',            emoji: '👨‍👩‍👧', color: '#7c3aed' },
};

// ── Sidebar rainbow name — compact version ────────────────────────────────────
function SidebarSchoolName() {
  return (
    <div style={{ lineHeight: 1.15 }}>
      <div style={{ fontFamily: "'Merriweather', Georgia, serif", fontWeight: 900, fontSize: 13.5, display: 'flex', flexWrap: 'wrap', gap: 0 }}>
        <span style={{ color: '#EF5350' }}>The&nbsp;</span>
        <span style={{ color: '#66BB6A' }}>Future&nbsp;</span>
        <span style={{ color: '#AB47BC' }}>Step&nbsp;</span>
        <span style={{ color: '#FFA726' }}>School</span>
      </div>
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.28)', marginTop: 2, letterSpacing: '0.04em', fontWeight: 600 }}>
        Management Portal
      </div>
    </div>
  );
}

export default function Sidebar({ isOpen, onClose, activePortalTab, onPortalTabChange }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const meta = ROLE_META[user?.role] || { label: user?.role, emoji: '👤', color: '#64748b' };
  const isPortalUser = user?.role === 'student' || user?.role === 'parent';
  const visibleItems = MENU_ITEMS.filter(item => item.roles.includes(user?.role));
  const handleLogout = () => { logout(); navigate('/login'); };

  const portalSections = user?.role === 'parent'
    ? PORTAL_SECTIONS.map((s, i) =>
        i === 1 ? { ...s, items: [...s.items, { id: 'contact', icon: '📞', label: 'Contact' }] } : s
      )
    : PORTAL_SECTIONS;

  return (
    <>
      {isOpen && (
        <div onClick={onClose}
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 40 }}
          className="lg:hidden"
        />
      )}

      <aside style={{
        width: 240,
        height: '100vh',
        background: 'linear-gradient(180deg, #07101f 0%, #0a1628 60%, #0c1c34 100%)',
        position: 'fixed',
        left: 0, top: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        fontFamily: "'Nunito', sans-serif",
        transform: isOpen === false ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto',
        boxShadow: '4px 0 40px rgba(0,0,0,0.5)',
      }}>

        {/* ── School Logo + Name ── */}
        <div style={{
          padding: '18px 16px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.06)',
          background: 'rgba(255,255,255,0.02)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            {/* Real school logo with indigo ring */}
            <div style={{
              width: 44, height: 44, borderRadius: '50%',
              padding: 2.5,
              background: 'linear-gradient(135deg, #5C6BC0, #3949AB, #283593)',
              flexShrink: 0,
              boxShadow: '0 4px 18px rgba(57,73,171,0.5)',
            }}>
              <img
                src="/school-logo.jpeg"
                alt="The Future Step School"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                onError={e => {
                  e.target.style.display = 'none';
                  e.target.parentElement.style.display = 'flex';
                  e.target.parentElement.style.alignItems = 'center';
                  e.target.parentElement.style.justifyContent = 'center';
                  e.target.parentElement.style.fontSize = '20px';
                  e.target.parentElement.innerHTML = '💎';
                }}
              />
            </div>
            <SidebarSchoolName />
          </div>
        </div>

        {/* ── User Profile Badge ── */}
        <div style={{
          padding: '12px 14px',
          borderBottom: '1px solid rgba(255,255,255,0.05)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', gap: 10,
            padding: '9px 11px', borderRadius: 11,
            background: `${meta.color}12`,
            border: `1px solid ${meta.color}25`,
          }}>
            <div style={{
              width: 36, height: 36, borderRadius: '50%',
              background: `${meta.color}20`,
              border: `2px solid ${meta.color}50`,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 16, flexShrink: 0,
            }}>
              {meta.emoji}
            </div>
            <div style={{ overflow: 'hidden', flex: 1 }}>
              <div style={{
                fontSize: 12.5, fontWeight: 800, color: '#fff',
                whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
              }}>
                {user?.name}
              </div>
              <div style={{
                fontSize: 9.5, fontWeight: 800, color: meta.color,
                textTransform: 'uppercase', letterSpacing: '0.7px', marginTop: 1,
              }}>
                {meta.label}
              </div>
            </div>
          </div>
        </div>

        {/* ── Navigation ── */}
        <nav style={{ flex: 1, padding: '8px 8px 4px', overflowY: 'auto' }}>
          {isPortalUser ? (
            <>
              <NavLink
                to="/profile"
                onClick={onClose}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 11px', borderRadius: 9, marginBottom: 6,
                  textDecoration: 'none', fontSize: 12.5, fontWeight: 700,
                  transition: 'all 0.15s',
                  background: isActive ? 'rgba(232,119,34,0.14)' : 'transparent',
                  color: isActive ? '#e87722' : 'rgba(255,255,255,0.45)',
                  borderLeft: isActive ? '3px solid #e87722' : '3px solid transparent',
                })}
              >
                <span style={{ fontSize: 14 }}>👤</span>
                My Profile
              </NavLink>

              {portalSections.map(section => (
                <div key={section.group} style={{ marginBottom: 4 }}>
                  <div style={{
                    fontSize: 8.5, fontWeight: 900, color: 'rgba(255,255,255,0.2)',
                    letterSpacing: '1.5px', textTransform: 'uppercase',
                    padding: '5px 14px 3px',
                  }}>
                    {section.group}
                  </div>
                  {section.items.map(item => {
                    const isActive = activePortalTab === item.id;
                    return (
                      <button
                        key={item.id}
                        onClick={() => {
                          if (onPortalTabChange) onPortalTabChange(item.id);
                          if (onClose) onClose();
                          navigate('/dashboard');
                        }}
                        style={{
                          display: 'flex', alignItems: 'center', gap: 10,
                          width: '100%', padding: '8px 11px', borderRadius: 9, marginBottom: 1,
                          border: 'none', cursor: 'pointer', textAlign: 'left',
                          fontSize: 12.5, fontWeight: 700, transition: 'all 0.15s',
                          background: isActive ? `${meta.color}18` : 'transparent',
                          color: isActive ? meta.color : 'rgba(255,255,255,0.45)',
                          borderLeft: isActive ? `3px solid ${meta.color}` : '3px solid transparent',
                        }}
                      >
                        <span style={{ fontSize: 14 }}>{item.icon}</span>
                        <span style={{ flex: 1 }}>{item.label}</span>
                        {isActive && (
                          <span style={{
                            width: 5, height: 5, borderRadius: '50%',
                            background: meta.color,
                            boxShadow: `0 0 8px ${meta.color}`,
                            flexShrink: 0,
                          }} />
                        )}
                      </button>
                    );
                  })}
                </div>
              ))}
            </>
          ) : (
            visibleItems.map(item => (
              <NavLink
                key={item.path}
                to={item.path}
                onClick={onClose}
                style={({ isActive }) => ({
                  display: 'flex', alignItems: 'center', gap: 10,
                  padding: '8px 11px', borderRadius: 9, marginBottom: 1,
                  textDecoration: 'none', fontSize: 12.5, fontWeight: 700,
                  transition: 'all 0.15s',
                  background: isActive ? 'rgba(232,119,34,0.14)' : 'transparent',
                  color: isActive ? '#e87722' : 'rgba(255,255,255,0.45)',
                  borderLeft: isActive ? '3px solid #e87722' : '3px solid transparent',
                })}
              >
                <span style={{ fontSize: 14 }}>{item.icon}</span>
                {item.label}
              </NavLink>
            ))
          )}
        </nav>

        {/* ── Logout ── */}
        <div style={{ padding: '8px 8px 14px', borderTop: '1px solid rgba(255,255,255,0.05)' }}>
          <button
            onClick={handleLogout}
            style={{
              width: '100%', padding: '9px 11px', borderRadius: 9,
              border: '1px solid rgba(239,68,68,0.15)', cursor: 'pointer',
              background: 'rgba(239,68,68,0.07)', color: '#f87171',
              fontSize: 12.5, fontWeight: 700,
              display: 'flex', alignItems: 'center', gap: 10,
              transition: 'all 0.15s',
            }}
            onMouseEnter={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.15)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.3)'; }}
            onMouseLeave={e => { e.currentTarget.style.background = 'rgba(239,68,68,0.07)'; e.currentTarget.style.borderColor = 'rgba(239,68,68,0.15)'; }}
          >
            <span>🚪</span> Logout
          </button>
        </div>
      </aside>
    </>
  );
}