// frontend/src/components/common/Layout.js
import React, { useState, createContext, useContext } from 'react';
import { Outlet, useLocation, useNavigate } from 'react-router-dom';
import Sidebar from './Sidebar';
import { useAuth } from '../../context/AuthContext';
import { useTheme } from '../../context/ThemeContext';

const PAGE_TITLES = {
  '/dashboard': 'Dashboard', '/students': 'Students', '/teachers': 'Employees',
  '/classes': 'Classes', '/attendance': 'Attendance', '/exams': 'Exams & Results',
  '/fees': 'Fee Management', '/timetable': 'Timetable', '/assignments': 'Assignments',
  '/library': 'Library', '/transport': 'Transport', '/notifications': 'Notifications',
  '/admissions': 'Admissions', '/profile': 'My Profile', '/reports': 'Reports',
};

export const PortalTabContext = createContext({ activeTab: 'overview', setTab: () => {} });
export const usePortalTab = () => useContext(PortalTabContext);

// ── Exact letter colors from SchoolName.jpeg ────────────────────────────────
const SCHOOL_LETTER_COLORS = [
  '#E53935','#F57C00','#43A047',null,
  '#43A047','#1565C0','#7B1FA2','#E53935','#43A047','#0097A7',null,
  '#43A047','#E53935','#7B1FA2','#F57C00',null,
  '#43A047','#1565C0','#7B1FA2','#E53935','#F57C00','#1565C0',
];
const SCHOOL_NAME_TEXT = 'The Future Step School';

function RainbowSchoolName({ size = 'md' }) {
  const heights = { sm:30, md:48, lg:56, xl:64, hero:72 };
  const h = heights[size] || 48;
  return (
    <img src="/app-logo.png" alt="The Future Step School"
      style={{ height:h, width:'auto', maxWidth:340, display:'block', objectFit:'contain',
               background:'#fff', padding:'6px 12px', borderRadius:8 }} />
  );
}

// ── School logo component with consistent styling ──────────────────────────────
function SchoolLogo({ size = 34 }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      padding: 2,
      background: 'linear-gradient(135deg, #3949AB, #5C35C9)',
      flexShrink: 0,
      boxShadow: '0 2px 10px rgba(57,73,171,0.35)',
    }}>
      <img
        src="/school-logo.jpeg"
        alt="The Future Step School"
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        onError={e => {
          e.target.style.display = 'none';
          e.target.parentElement.innerHTML = '💎';
          e.target.parentElement.style.display = 'flex';
          e.target.parentElement.style.alignItems = 'center';
          e.target.parentElement.style.justifyContent = 'center';
          e.target.parentElement.style.fontSize = `${size * 0.5}px`;
        }}
      />
    </div>
  );
}

export { RainbowSchoolName, SchoolLogo };

export default function Layout() {
  const location  = useLocation();
  const navigate  = useNavigate();
  const { user }  = useAuth();
  const { isDark, toggleTheme } = useTheme();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [portalTab, setPortalTab]   = useState('overview');

  const now       = new Date();
  const dateStr   = now.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

  return (
    <PortalTabContext.Provider value={{ activeTab: portalTab, setTab: setPortalTab }}>
      <div className={`flex min-h-screen ${isDark ? 'bg-gray-900' : 'bg-warm'}`}>

        {/* Sidebar — desktop */}
        <aside className="hidden lg:flex lg:fixed lg:inset-y-0 lg:left-0 lg:z-50 lg:w-64">
          <Sidebar activePortalTab={portalTab} onPortalTabChange={setPortalTab} />
        </aside>

        {/* Mobile overlay */}
        {mobileOpen && (
          <div className="fixed inset-0 z-50 flex lg:hidden">
            <div className="fixed inset-0 bg-ink/60 backdrop-blur-sm" onClick={() => setMobileOpen(false)} />
            <div className="relative w-64 animate-slide-in">
              <Sidebar
                onClose={() => setMobileOpen(false)}
                activePortalTab={portalTab}
                onPortalTabChange={tab => { setPortalTab(tab); setMobileOpen(false); }}
              />
            </div>
          </div>
        )}

        {/* Main content */}
        <div className="flex-1 lg:ml-64 flex flex-col min-h-screen">

          {/* ── Topbar ── */}
          <header className="sticky top-0 z-40 h-16 flex items-center justify-between px-4 sm:px-6"
            style={{
              background: isDark ? 'rgba(15,21,34,0.72)' : 'rgba(255,255,255,0.72)',
              backdropFilter: 'saturate(180%) blur(12px)',
              WebkitBackdropFilter: 'saturate(180%) blur(12px)',
              borderBottom: '1px solid var(--border)',
              boxShadow: 'var(--shadow-sm)',
            }}>

            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                className="lg:hidden w-9 h-9 flex items-center justify-center rounded-xl border transition-all"
                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; e.currentTarget.style.color = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; e.currentTarget.style.color = 'var(--slate)'; }}
                onClick={() => setMobileOpen(true)}
              >☰</button>

              {/* Logo + School name — centered on the same line */}
              <div className="flex items-center gap-2.5">
                <SchoolLogo size={36} />
                <div className="hidden sm:flex items-center">
                  <RainbowSchoolName size="md" />
                </div>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              {/* Search — quick jump (visual affordance) */}
              <div className="relative hidden md:block">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-sm" style={{ color: 'var(--muted)' }}>🔍</span>
                <input
                  type="text"
                  placeholder="Search…"
                  className="form-input"
                  style={{ paddingLeft: 34, height: 38, width: 200, borderRadius: 10, background: 'var(--warm)' }}
                />
              </div>

              <button
                onClick={toggleTheme}
                className="w-9 h-9 flex items-center justify-center rounded-xl border transition-all text-base"
                style={{ borderColor: 'var(--border)', color: isDark ? '#facc15' : 'var(--slate)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
                title={isDark ? 'Light Mode' : 'Dark Mode'}
              >
                {isDark ? '☀️' : '🌙'}
              </button>

              <button
                onClick={() => navigate('/notifications')}
                className="relative w-9 h-9 flex items-center justify-center rounded-xl border transition-all text-base"
                style={{ borderColor: 'var(--border)', color: 'var(--slate)' }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = 'var(--accent)'; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = 'var(--border)'; }}
              >
                🔔
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">3</span>
              </button>

              <div className="text-sm hidden sm:block" style={{ color: 'var(--muted)' }}>{dateStr}</div>
              <div className="h-7 w-px hidden sm:block" style={{ background: 'var(--border)' }} />

              <button
                onClick={() => navigate('/profile')}
                className="flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all"
                onMouseEnter={e => { e.currentTarget.style.background = 'var(--warm)'; }}
                onMouseLeave={e => { e.currentTarget.style.background = 'transparent'; }}
              >
                <div className="w-8 h-8 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0" style={{ boxShadow: 'var(--shadow-sm)' }}>
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
                <span className="text-sm font-semibold hidden sm:block truncate max-w-24" style={{ color: 'var(--ink)' }}>
                  {user?.name?.split(' ')[0]}
                </span>
              </button>
            </div>
          </header>

          {/* Page content */}
          <main className="flex-1 p-5 lg:p-8 animate-fade-in">
            <Outlet />
          </main>
        </div>
      </div>
    </PortalTabContext.Provider>
  );
}