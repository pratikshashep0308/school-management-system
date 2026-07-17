// frontend/src/components/common/Sidebar.js
import React, { useState, useEffect } from 'react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { permissionAPI } from '../../utils/api';

// Maps each sidebar path to the module key used in the permission matrix.
const PATH_TO_MODULE = {
  '/dashboard': 'dashboard', '/settings': 'settings', '/access-control': 'accessControl',
  '/id-cards': 'idCards', '/students': 'students', '/teachers': 'teachers',
  '/classes': 'classes', '/subjects': 'subjects', '/salary': 'salary',
  '/attendance': 'attendance', '/exams': 'exams', '/assignments': 'assignments',
  '/fees': 'fees', '/expenses': 'expenses', '/library': 'library',
  '/transport': 'transport', '/homework': 'homework', '/timetable': 'timetable',
  '/behaviour-notes': 'behaviourNotes',
  '/meetings': 'meetings', '/notifications': 'notifications', '/admissions': 'admissions',
  '/reports': 'reports',
  // '/profile' has no module key — always visible.
};

const ADMIN_ROLES = ['superAdmin', 'schoolAdmin'];
const STAFF_ROLES = ['superAdmin', 'schoolAdmin', 'teacher', 'accountant', 'librarian', 'transportManager'];

const MENU_ITEMS = [
  { path: '/dashboard',     icon: '⊞',  label: 'Dashboard',     roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },
  { path: '/settings',      icon: '⚙️', label: 'Settings',          roles: ['superAdmin','schoolAdmin'] },
  { path: '/access-control', icon: '🔐', label: 'Access Control',   roles: ['superAdmin','schoolAdmin'] },
  { path: '/id-cards',       icon: '🪪', label: 'ID Cards',         roles: ['superAdmin','schoolAdmin'] },
  { path: '/students',      icon: '👥', label: 'Students',      roles: ['superAdmin','schoolAdmin','teacher','accountant'] },
  { path: '/teachers',      icon: '👤', label: 'Employees',      roles: ADMIN_ROLES },
  { path: '/classes',       icon: '🏛',  label: 'Classes',       roles: STAFF_ROLES },
  { path: '/subjects',      icon: '📖', label: 'Subjects',      roles: ['superAdmin','schoolAdmin'] },
  { path: '/salary',        icon: '💰', label: 'Salary',         roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/attendance',    icon: '📅', label: 'Attendance',    roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/exams',         icon: '📝', label: 'Exams',         roles: STAFF_ROLES },
  { path: '/assignments',   icon: '📋', label: 'Assignments',   roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/fees',          icon: '💳', label: 'Fees',          roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/expenses',      icon: '💸', label: 'Expenses',      roles: ['superAdmin','schoolAdmin','accountant'] },
  { path: '/library',       icon: '📚', label: 'Library',       roles: ['superAdmin','schoolAdmin','librarian'] },
  { path: '/transport',     icon: '🚌', label: 'Transport',     roles: ['superAdmin','schoolAdmin','transportManager'] },
  { path: '/homework',      icon: '📚', label: 'Homework',          roles: ['superAdmin','schoolAdmin','teacher','student','parent'] },
  { path: '/behaviour-notes', icon: '📝', label: 'Behaviour Notes',  roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/timetable',     icon: '🗓',  label: 'Timetable',     roles: STAFF_ROLES },
  { path: '/meetings',      icon: '📅', label: 'Meetings',       roles: ['superAdmin','schoolAdmin','teacher','accountant','librarian','transportManager','student','parent'] },
  { path: '/notifications', icon: '🔔', label: 'Notifications', roles: ['superAdmin','schoolAdmin','teacher'] },
  { path: '/admissions',    icon: '📄', label: 'Admissions',    roles: ['superAdmin','schoolAdmin','teacher'] },
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
      { id: 'homework',    icon: '📚', label: 'Homework' },
      { id: 'meetings',    icon: '📅', label: 'Meetings' },
      { id: 'behaviour',   icon: '📝', label: 'Behaviour Notes' },
      { id: 'notifications', icon: '🔔', label: 'Notifications' },
    ],
  },
  {
    group: 'FINANCE & SERVICES',
    items: [
      { id: 'fees',      icon: '💳', label: 'Fees' },
      { id: 'idcard',    icon: '🪪', label: 'My ID Card', module: 'idCards' },
      { id: 'library',   icon: '📖', label: 'Library' },
      { id: 'transport', icon: '🚌', label: 'Transport' },
    ],
  },
];

const ROLE_META = {
  superAdmin:       { label: 'Super Admin',       emoji: '👑', color: '#d4522a' },
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
      <img src="/app-logo.png" alt="The Future Step School"
        style={{ width:'100%', maxWidth:180, height:'auto', display:'block',
                 objectFit:'contain', background:'#fff', padding:'5px 8px', borderRadius:8 }} />
      <div style={{ fontSize: 9.5, color: 'rgba(255,255,255,0.55)', marginTop: 6, letterSpacing: '0.04em', fontWeight: 600 }}>
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

  // Saved access-control matrix for this school. superAdmin bypasses it entirely.
  const [permMatrix, setPermMatrix] = useState(null);
  useEffect(() => {
    if (!user || user.role === 'superAdmin') return;
    let active = true;
    permissionAPI.get()
      .then(r => { if (active) setPermMatrix(r.data?.matrix || null); })
      .catch(() => { if (active) setPermMatrix(null); });
    return () => { active = false; };
  }, [user]);

  // Base filter: role must be allowed on the item (hardcoded baseline).
  // Extra filter: if a saved permission matrix exists for this role, also
  // require the module to be enabled there. superAdmin always sees everything.
  const visibleItems = MENU_ITEMS.filter(item => {
    // superAdmin always sees everything.
    if (user?.role === 'superAdmin') return true;

    const modKey    = PATH_TO_MODULE[item.path];
    const rolePerms = permMatrix?.[user?.role];

    // Items with no module key (e.g. My Profile) fall back to their hardcoded
    // roles list — they aren't manageable from Access Control.
    if (!modKey) return item.roles.includes(user?.role);

    // If a saved matrix exists for this role, IT IS THE AUTHORITY.
    // An admin who grants a module in Access Control expects the role to see it,
    // even if the hardcoded `roles` list below predates that decision.
    if (rolePerms && Object.prototype.hasOwnProperty.call(rolePerms, modKey)) {
      const lvl = rolePerms[modKey];
      return !(lvl === 'none' || lvl === false || lvl == null);
    }

    // No matrix entry for this module (e.g. a newly added module, or the matrix
    // was never saved) → fall back to the hardcoded default roles.
    return item.roles.includes(user?.role);
  });
  // logout() now performs a hard redirect to /login so the navigate is redundant.
  // Still using await to make sure backend logout call completes if reachable.
  const handleLogout = async () => {
    if (!window.confirm('Are you sure you want to logout?')) return;
    await logout();
  };

  // Portal items that carry a `module` key are gated by the Access Control
  // matrix — e.g. "My ID Card" only appears once an admin grants student/parent
  // access to the ID Cards module. Items without a module key always show.
  const portalAllows = (item) => {
    if (!item.module) return true;
    const rolePerms = permMatrix?.[user?.role];
    if (!rolePerms) return false;                 // no matrix → not granted yet
    const lvl = rolePerms[item.module];
    return !(lvl === undefined || lvl == null || lvl === 'none' || lvl === false);
  };

  const basePortalSections = user?.role === 'parent'
    ? PORTAL_SECTIONS.map((s, i) =>
        i === 1 ? { ...s, items: [...s.items, { id: 'contact', icon: '📞', label: 'Contact' }] } : s
      )
    : PORTAL_SECTIONS;

  const portalSections = basePortalSections
    .map(sec => ({ ...sec, items: sec.items.filter(portalAllows) }))
    .filter(sec => sec.items.length > 0);

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
        background: 'linear-gradient(180deg, #1c1712 0%, #211a13 55%, #26201a 100%)',
        position: 'fixed',
        left: 0, top: 0,
        display: 'flex',
        flexDirection: 'column',
        zIndex: 50,
        fontFamily: "'DM Sans', sans-serif",
        transform: isOpen === false ? 'translateX(-100%)' : 'translateX(0)',
        transition: 'transform 0.3s cubic-bezier(0.4,0,0.2,1)',
        overflowY: 'auto',
        boxShadow: '4px 0 40px rgba(0,0,0,0.35)',
        borderRight: '1px solid rgba(255,255,255,0.04)',
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
                  background: isActive ? 'rgba(212,82,42,0.16)' : 'transparent',
                  color: isActive ? '#d4522a' : 'rgba(255,255,255,0.85)',
                  borderLeft: isActive ? '3px solid #d4522a' : '3px solid transparent',
                })}
              >
                <span style={{ fontSize: 14 }}>👤</span>
                My Profile
              </NavLink>

              {portalSections.map(section => (
                <div key={section.group} style={{ marginBottom: 4 }}>
                  <div style={{
                    fontSize: 8.5, fontWeight: 900, color: 'rgba(255,255,255,0.5)',
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
                          color: isActive ? meta.color : 'rgba(255,255,255,0.85)',
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
                  padding: '9px 11px', borderRadius: 10, marginBottom: 2,
                  textDecoration: 'none', fontSize: 12.5, fontWeight: 600,
                  transition: 'background 0.15s, color 0.15s',
                  background: isActive ? 'rgba(212,82,42,0.16)' : 'transparent',
                  color: isActive ? '#e8846a' : 'rgba(255,255,255,0.72)',
                  borderLeft: isActive ? '3px solid #d4522a' : '3px solid transparent',
                })}
                onMouseEnter={e => { if (!e.currentTarget.className.includes('active')) { e.currentTarget.style.background = 'rgba(255,255,255,0.05)'; e.currentTarget.style.color = 'rgba(255,255,255,0.95)'; } }}
                onMouseLeave={e => { const active = e.currentTarget.getAttribute('aria-current'); if (!active) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.72)'; } }}
              >
                <span style={{ fontSize: 14, width: 18, textAlign: 'center' }}>{item.icon}</span>
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