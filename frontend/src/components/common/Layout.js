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

// ── Rainbow school name — matches the colorful script in SchoolName.jpeg ──────
function RainbowSchoolName({ size = 'md' }) {
  // Letter-by-letter colors cycling through the rainbow like the image
  const COLORS = ['#E53935','#F57C00','#388E3C','#1565C0','#7B1FA2','#00838F','#E53935','#F57C00','#388E3C','#1565C0','#7B1FA2','#00838F','#E53935','#F57C00','#388E3C','#1565C0','#7B1FA2','#00838F','#E53935','#F57C00','#388E3C','#1565C0'];
  const text = 'The Future Step School';

  const sizes = {
    sm:  { fontSize: 13, fontWeight: 900, letterSpacing: '0px'   },
    md:  { fontSize: 16, fontWeight: 900, letterSpacing: '0px'   },
    lg:  { fontSize: 22, fontWeight: 900, letterSpacing: '0px'   },
    xl:  { fontSize: 30, fontWeight: 900, letterSpacing: '0px'   },
  };

  const style = sizes[size] || sizes.md;
  let colorIdx = 0;

  return (
    <span style={{
      ...style,
      fontFamily: "'Georgia', 'Times New Roman', serif",
      fontStyle: 'italic',
      lineHeight: 1.1,
    }}>
      {text.split('').map((ch, i) => {
        if (ch === ' ') return <span key={i}>&nbsp;</span>;
        const color = COLORS[colorIdx % COLORS.length];
        colorIdx++;
        return <span key={i} style={{ color }}>{ch}</span>;
      })}
    </span>
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

  const pageTitle = PAGE_TITLES[location.pathname] || '';
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
          <header className={`sticky top-0 z-40 h-16 flex items-center justify-between px-4 sm:px-6 border-b ${isDark ? 'bg-gray-800 border-gray-700' : 'bg-white border-border'}`}
            style={{ boxShadow: isDark ? 'none' : '0 1px 12px rgba(0,0,0,0.06)' }}>

            <div className="flex items-center gap-3">
              {/* Mobile hamburger */}
              <button
                className={`lg:hidden w-9 h-9 flex items-center justify-center rounded-lg border transition-all ${isDark ? 'border-gray-600 text-gray-300 hover:border-accent hover:text-accent' : 'border-border text-slate hover:border-accent hover:text-accent'}`}
                onClick={() => setMobileOpen(true)}
              >☰</button>

              {/* Logo + School name */}
              <div className="flex items-center gap-2.5">
                <SchoolLogo size={36} />
                <div className="hidden sm:block">
                  <RainbowSchoolName size="md" />
                  {pageTitle && (
                    <div style={{ fontSize: 10, color: isDark ? 'rgba(255,255,255,0.35)' : '#94A3B8', fontWeight: 700, letterSpacing: '0.05em', textTransform: 'uppercase', marginTop: 1 }}>
                      {pageTitle}
                    </div>
                  )}
                </div>
                {/* On mobile, just show page title */}
                <div className="sm:hidden">
                  <div className={`font-bold text-base ${isDark ? 'text-white' : 'text-ink'}`}>{pageTitle || 'EduCore'}</div>
                </div>
              </div>
            </div>

            {/* Right side controls */}
            <div className="flex items-center gap-2">
              <button
                onClick={toggleTheme}
                className={`w-9 h-9 flex items-center justify-center rounded-xl border transition-all text-base ${isDark ? 'border-gray-600 text-yellow-400 hover:border-yellow-400' : 'border-border text-slate hover:border-accent'}`}
                title={isDark ? 'Light Mode' : 'Dark Mode'}
              >
                {isDark ? '☀️' : '🌙'}
              </button>

              <button
                onClick={() => navigate('/notifications')}
                className={`relative w-9 h-9 flex items-center justify-center rounded-xl border transition-all text-base ${isDark ? 'border-gray-600 text-gray-300 hover:border-accent' : 'border-border hover:border-accent'}`}
              >
                🔔
                <span className="absolute -top-1 -right-1 w-4 h-4 bg-accent text-white text-[9px] font-bold rounded-full flex items-center justify-center">3</span>
              </button>

              <div className={`text-sm hidden sm:block ${isDark ? 'text-gray-400' : 'text-muted'}`}>{dateStr}</div>
              <div className={`h-7 w-px hidden sm:block ${isDark ? 'bg-gray-700' : 'bg-border'}`} />

              <button
                onClick={() => navigate('/profile')}
                className={`flex items-center gap-2 rounded-xl px-2.5 py-1.5 transition-all ${isDark ? 'hover:bg-gray-700' : 'hover:bg-warm'}`}
              >
                <div className="w-7 h-7 rounded-full bg-accent flex items-center justify-center text-white text-xs font-bold flex-shrink-0">
                  {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U'}
                </div>
                <span className={`text-sm font-semibold hidden sm:block truncate max-w-24 ${isDark ? 'text-white' : 'text-ink'}`}>
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