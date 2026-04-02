// ╔══════════════════════════════════════════════════════════════════╗
// ║  StudentDashboard.js  —  Drop-in replacement                    ║
// ║  Just replace your existing file. No new installs needed.       ║
// ║  Uses: React, react-hot-toast (already in your project)         ║
// ╚══════════════════════════════════════════════════════════════════╝

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalAPI } from '../utils/studentPortalAPI';
import toast from 'react-hot-toast';

// ─── Design Tokens ────────────────────────────────────────────────────────────
const C = {
  blue:    '#2563eb',
  indigo:  '#4f46e5',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  violet:  '#8b5cf6',
  slate:   '#64748b',
  navy:    '#0f172a',
  light:   '#f8fafc',
};

// ─── Sidebar modules config ───────────────────────────────────────────────────
const MODULES = [
  { id: 'overview',      label: 'Overview',       icon: '⊞' },
  { id: 'attendance',    label: 'Attendance',      icon: '📅' },
  { id: 'results',       label: 'Results',         icon: '🏆' },
  { id: 'fees',          label: 'Fees',            icon: '💳' },
  { id: 'assignments',   label: 'Assignments',     icon: '📝' },
  { id: 'timetable',     label: 'Timetable',       icon: '🕐' },
  { id: 'transport',     label: 'Transport',       icon: '🚌' },
  { id: 'library',       label: 'Library',         icon: '📚' },
  { id: 'notifications', label: 'Notifications',   icon: '🔔' },
];

// ─── Inline CSS injected once ─────────────────────────────────────────────────
const GLOBAL_CSS = `
  @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
  .sms-dash * { box-sizing: border-box; font-family: 'Inter', sans-serif; }
  .sms-dash { display: flex; height: 100vh; overflow: hidden; background: #f8fafc; }
  .sms-dash.dark { background: #0f172a; }

  /* Sidebar */
  .sms-sidebar {
    width: 220px; flex-shrink: 0; display: flex; flex-direction: column;
    background: #1e293b; border-right: 1px solid rgba(255,255,255,0.06);
    transition: width 0.2s;
  }
  .sms-sidebar.collapsed { width: 60px; }
  .sms-sidebar.collapsed .sms-nav-label,
  .sms-sidebar.collapsed .sms-profile-info,
  .sms-sidebar.collapsed .sms-att-bar-wrap,
  .sms-sidebar.collapsed .sms-logo-text { display: none; }
  .sms-sidebar.collapsed .sms-nav-btn { justify-content: center; padding: 10px 0; }
  .sms-sidebar.collapsed .sms-notif-badge { display: none; }

  /* Nav buttons */
  .sms-nav-btn {
    width: 100%; display: flex; align-items: center; gap: 10px;
    padding: 9px 12px; border-radius: 10px; border: none; cursor: pointer;
    font-size: 13px; font-weight: 500; text-align: left;
    background: transparent; color: rgba(255,255,255,0.5);
    transition: background 0.15s, color 0.15s;
    margin-bottom: 2px;
  }
  .sms-nav-btn:hover { background: rgba(255,255,255,0.07); color: rgba(255,255,255,0.9); }
  .sms-nav-btn.active { background: rgba(37,99,235,0.25); color: #93c5fd; font-weight: 700; border-left: 3px solid #3b82f6; }
  .sms-nav-icon { font-size: 17px; flex-shrink: 0; width: 22px; text-align: center; }
  .sms-notif-badge {
    margin-left: auto; background: #ef4444; color: white;
    font-size: 10px; font-weight: 800; border-radius: 99px;
    padding: 2px 6px; line-height: 1;
  }

  /* Main area */
  .sms-main { flex: 1; display: flex; flex-direction: column; overflow: hidden; }
  .sms-header {
    flex-shrink: 0; background: white; border-bottom: 1px solid #f1f5f9;
    padding: 12px 24px; display: flex; align-items: center; gap: 12px;
  }
  .dark .sms-header { background: #1e293b; border-color: rgba(255,255,255,0.06); }
  .sms-content { flex: 1; overflow-y: auto; padding: 24px; }
  .sms-content::-webkit-scrollbar { width: 4px; }
  .sms-content::-webkit-scrollbar-thumb { background: #e2e8f0; border-radius: 99px; }

  /* Cards */
  .sms-card {
    background: white; border-radius: 16px;
    border: 1px solid #f1f5f9; overflow: hidden;
  }
  .dark .sms-card { background: #1e293b; border-color: rgba(255,255,255,0.08); }
  .sms-card-header {
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 18px; border-bottom: 1px solid #f8fafc; font-size: 13px;
    font-weight: 700; color: #374151;
  }
  .dark .sms-card-header { border-color: rgba(255,255,255,0.06); color: #cbd5e1; }
  .sms-card-body { padding: 16px 18px; }

  /* Stat cards */
  .sms-stat-card {
    background: white; border-radius: 16px; padding: 16px 18px;
    border: 1px solid #f1f5f9;
    transition: transform 0.18s, box-shadow 0.18s;
    cursor: default;
  }
  .sms-stat-card:hover { transform: translateY(-3px); box-shadow: 0 8px 24px rgba(0,0,0,0.08); }
  .dark .sms-stat-card { background: #1e293b; border-color: rgba(255,255,255,0.08); }

  /* Progress bar */
  .sms-bar-bg { height: 6px; background: #f1f5f9; border-radius: 99px; overflow: hidden; }
  .dark .sms-bar-bg { background: #334155; }
  .sms-bar-fill { height: 100%; border-radius: 99px; transition: width 1s ease; }

  /* Badge */
  .sms-badge { display: inline-flex; align-items: center; font-size: 11px; font-weight: 700; padding: 3px 8px; border-radius: 99px; }

  /* Skeleton */
  @keyframes sms-shimmer { 0% { background-position: -600px 0 } 100% { background-position: 600px 0 } }
  .sms-skeleton {
    background: linear-gradient(90deg,#f1f5f9 25%,#e2e8f0 50%,#f1f5f9 75%);
    background-size: 1200px 100%; animation: sms-shimmer 1.5s infinite; border-radius: 10px;
  }
  .dark .sms-skeleton { background: linear-gradient(90deg,#1e293b 25%,#334155 50%,#1e293b 75%); background-size: 1200px 100%; animation: sms-shimmer 1.5s infinite; }

  /* Attendance ring */
  @keyframes sms-ring { from { stroke-dasharray: 0 226; } }
  .sms-ring-anim { animation: sms-ring 1.2s ease forwards; }

  /* Dark mode text helpers */
  .dark .sms-text-primary { color: #f1f5f9; }
  .dark .sms-text-secondary { color: #94a3b8; }
  .sms-text-primary { color: #0f172a; }
  .sms-text-secondary { color: #64748b; }

  /* Table */
  .sms-table { width: 100%; border-collapse: collapse; }
  .sms-table th { padding: 10px 16px; text-align: left; font-size: 11px; font-weight: 700; color: #94a3b8; text-transform: uppercase; letter-spacing: 0.07em; background: #f8fafc; }
  .dark .sms-table th { background: #0f172a; }
  .sms-table td { padding: 12px 16px; font-size: 13px; border-top: 1px solid #f8fafc; }
  .dark .sms-table td { border-color: rgba(255,255,255,0.05); color: #cbd5e1; }
  .sms-table tr:hover td { background: #f8fafc; }
  .dark .sms-table tr:hover td { background: rgba(255,255,255,0.03); }

  /* Responsive */
  @media (max-width: 768px) {
    .sms-sidebar { position: fixed; z-index: 100; height: 100vh; left: -220px; transition: left 0.25s; }
    .sms-sidebar.mobile-open { left: 0; }
    .sms-mobile-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.4); z-index: 99; }
    .sms-mobile-overlay.show { display: block; }
    .sms-content { padding: 14px; }
  }
`;

// ─── Inject styles once ───────────────────────────────────────────────────────
if (!document.getElementById('sms-styles')) {
  const s = document.createElement('style');
  s.id = 'sms-styles';
  s.textContent = GLOBAL_CSS;
  document.head.appendChild(s);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
const fmtINR   = n => `₹${Number(n || 0).toLocaleString('en-IN')}`;
const fmtDate  = d => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' });
const fmtShort = d => new Date(d).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' });

function Badge({ text, bg, color }) {
  return <span className="sms-badge" style={{ background: bg, color }}>{text}</span>;
}

function StatusBadge({ status }) {
  const map = {
    present: ['✓ Present', '#dcfce7', '#166534'],
    absent:  ['✗ Absent',  '#fee2e2', '#991b1b'],
    late:    ['~ Late',    '#fef9c3', '#854d0e'],
  };
  const [text, bg, color] = map[status] || [status, '#f1f5f9', '#475569'];
  return <Badge text={text} bg={bg} color={color} />;
}

// ─── Skeleton Loader ──────────────────────────────────────────────────────────
function SkeletonCards() {
  return (
    <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(160px,1fr))', gap: 14, marginBottom: 20 }}>
      {[...Array(6)].map((_, i) => (
        <div key={i} className="sms-stat-card" style={{ height: 100 }}>
          <div className="sms-skeleton" style={{ height: 12, width: 60, marginBottom: 12 }} />
          <div className="sms-skeleton" style={{ height: 24, width: 80, marginBottom: 8 }} />
          <div className="sms-skeleton" style={{ height: 10, width: 100 }} />
        </div>
      ))}
    </div>
  );
}

function SkeletonRows({ count = 5 }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      {[...Array(count)].map((_, i) => (
        <div key={i} className="sms-skeleton" style={{ height: 52, opacity: 1 - i * 0.15 }} />
      ))}
    </div>
  );
}

// ─── Attendance SVG Ring ──────────────────────────────────────────────────────
function AttRing({ pct }) {
  const r = 38, circ = 2 * Math.PI * r;
  const dash = (pct / 100) * circ;
  const color = pct >= 75 ? C.emerald : pct >= 60 ? C.amber : C.rose;
  return (
    <svg width={96} height={96} viewBox="0 0 96 96">
      <circle cx={48} cy={48} r={r} fill="none" stroke="#f1f5f9" strokeWidth={8} />
      <circle cx={48} cy={48} r={r} fill="none" stroke={color} strokeWidth={8}
        strokeDasharray={`${dash} ${circ}`} strokeLinecap="round"
        transform="rotate(-90 48 48)" className="sms-ring-anim" />
      <text x={48} y={48} textAnchor="middle" dy="0.35em" fontSize={15} fontWeight={800} fill={color}>{pct}%</text>
    </svg>
  );
}

// ─── OVERVIEW TAB ─────────────────────────────────────────────────────────────
function OverviewTab({ data, dark, onNavigate }) {
  if (!data) return <><SkeletonCards /><SkeletonRows /></>;
  const { stats, recentAttendance, notifications, timetableToday, announcements } = data;
  const att     = stats?.attendancePercentage ?? 0;
  const paid    = stats?.feePaid    ?? 0;
  const pending = stats?.feePending ?? 0;
  const feePct  = paid + pending > 0 ? Math.round((paid / (paid + pending)) * 100) : 0;
  const attColor = att >= 75 ? C.emerald : att >= 60 ? C.amber : C.rose;

  const statCards = [
    { icon: '📅', label: 'Attendance',      value: `${att}%`,                        sub: att >= 75 ? 'Good standing ✓' : '⚠ Below minimum', urgent: att < 75,      iconBg: att >= 75 ? '#dcfce7' : '#fee2e2' },
    { icon: '💳', label: 'Fees Pending',    value: fmtINR(pending),                   sub: pending > 0 ? 'Due this month' : 'All clear ✓',    urgent: pending > 0,  iconBg: '#fef9c3' },
    { icon: '📝', label: 'Assignments',     value: stats?.pendingAssignments ?? 0,    sub: 'Pending submission',                               urgent: false,        iconBg: '#ede9fe' },
    { icon: '🏆', label: 'Results',         value: stats?.totalResults ?? 0,          sub: 'Across all exams',                                 urgent: false,        iconBg: '#dbeafe' },
    { icon: '🔔', label: 'Notifications',   value: stats?.notificationCount ?? 0,     sub: 'Unread',                                           urgent: false,        iconBg: '#ffe4e6' },
    { icon: '📖', label: 'Library Books',   value: stats?.libraryBooks ?? 0,          sub: 'Currently issued',                                 urgent: false,        iconBg: '#ccfbf1' },
  ];

  const priColor = { high: ['#fee2e2','#991b1b','#ef4444'], medium: ['#fef9c3','#854d0e','#f59e0b'], low: ['#dbeafe','#1e40af','#3b82f6'] };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>

      {/* KPI grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(155px,1fr))', gap: 14 }}>
        {statCards.map((c, i) => (
          <div key={i} className="sms-stat-card" style={{ outline: c.urgent ? '2px solid #fca5a5' : 'none' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10 }}>
              <span style={{ fontSize: 22, background: c.iconBg, borderRadius: 10, padding: '4px 7px' }}>{c.icon}</span>
              {c.urgent && <span className="sms-badge" style={{ background: '#fee2e2', color: '#dc2626', fontSize: 10 }}>!</span>}
            </div>
            <div className="sms-text-primary" style={{ fontSize: 22, fontWeight: 800, lineHeight: 1 }}>{c.value}</div>
            <div className="sms-text-secondary" style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', marginTop: 4 }}>{c.label}</div>
            <div className="sms-text-secondary" style={{ fontSize: 11, marginTop: 3 }}>{c.sub}</div>
          </div>
        ))}
      </div>

      {/* Attendance + Fee row */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Attendance */}
        <div className="sms-card">
          <div className="sms-card-header">📅 Attendance Overview</div>
          <div className="sms-card-body">
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginBottom: 16 }}>
              <AttRing pct={att} />
              <div>
                <div className="sms-text-primary" style={{ fontWeight: 800, fontSize: 15 }}>{att >= 75 ? 'On track' : 'Needs attention'}</div>
                <div className="sms-text-secondary" style={{ fontSize: 12, marginTop: 3 }}>Min. required: 75%</div>
                {att < 75 && <div style={{ color: C.rose, fontSize: 12, fontWeight: 700, marginTop: 5 }}>⚠ Below threshold</div>}
              </div>
            </div>
            {(recentAttendance ?? []).slice(0, 5).map((r, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: i < 4 ? '1px solid #f8fafc' : 'none' }}>
                <span className="sms-text-secondary" style={{ fontSize: 13 }}>{fmtShort(r.date)}</span>
                <StatusBadge status={r.status} />
              </div>
            ))}
          </div>
        </div>

        {/* Fees */}
        <div className="sms-card">
          <div className="sms-card-header">💳 Fee Summary</div>
          <div className="sms-card-body">
            {[
              { label: 'Total Paid', value: fmtINR(paid),    bg: '#dcfce7', color: '#166534', dot: C.emerald },
              { label: 'Pending',    value: fmtINR(pending), bg: '#fef9c3', color: '#854d0e', dot: C.amber   },
            ].map((row, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 14px', borderRadius: 12, background: row.bg, marginBottom: 10 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: row.dot }} />
                  <span style={{ fontSize: 13, fontWeight: 600, color: row.color }}>{row.label}</span>
                </div>
                <span style={{ fontSize: 14, fontWeight: 800, color: row.color }}>{row.value}</span>
              </div>
            ))}
            <div style={{ marginTop: 8 }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                <span className="sms-text-secondary" style={{ fontSize: 12 }}>Payment progress</span>
                <span className="sms-text-secondary" style={{ fontSize: 12 }}>{feePct}%</span>
              </div>
              <div className="sms-bar-bg">
                <div className="sms-bar-fill" style={{ width: `${feePct}%`, background: C.emerald }} />
              </div>
            </div>
            <div style={{ marginTop: 14, padding: '12px 14px', borderRadius: 12, background: '#dbeafe' }}>
              <div style={{ fontSize: 11, color: '#1e40af', fontWeight: 700, marginBottom: 3 }}>Next payment due</div>
              <div style={{ fontSize: 14, fontWeight: 800, color: '#1e3a8a' }}>April 10, 2026</div>
              <div style={{ fontSize: 12, color: '#3b82f6', marginTop: 2 }}>{fmtINR(pending)} · Monthly fees</div>
            </div>
          </div>
        </div>
      </div>

      {/* Bottom grid */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        {/* Notifications */}
        <div className="sms-card">
          <div className="sms-card-header">
            🔔 Notifications
            <button onClick={() => onNavigate('notifications')} style={{ fontSize: 12, color: C.blue, fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer' }}>View all →</button>
          </div>
          <div className="sms-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(notifications ?? []).slice(0, 3).map((n, i) => {
              const [bg, tc, dot] = priColor[n.priority] ?? priColor.low;
              return (
                <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12, background: bg, border: `1px solid ${dot}30` }}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', background: dot, flexShrink: 0, marginTop: 4 }} />
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: tc, marginBottom: 2 }}>{n.title}</div>
                    <div style={{ fontSize: 12, color: tc, opacity: 0.8, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>{n.message}</div>
                    <div style={{ fontSize: 11, color: tc, opacity: 0.6, marginTop: 4 }}>{fmtDate(n.createdAt)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Timetable today */}
        <div className="sms-card">
          <div className="sms-card-header">🕐 Today's Timetable</div>
          <div className="sms-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {!(timetableToday ?? []).length
              ? <div className="sms-text-secondary" style={{ textAlign: 'center', padding: 24, fontSize: 13 }}>No classes today</div>
              : (timetableToday ?? []).slice(0, 5).map((p, i) => (
                <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px', borderRadius: 12, background: i === 2 ? '#dbeafe' : '#f8fafc' }}>
                  <div style={{ width: 30, height: 30, borderRadius: 8, background: i === 2 ? C.blue : '#e2e8f0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 12, fontWeight: 800, color: i === 2 ? 'white' : '#64748b', flexShrink: 0 }}>{p.period}</div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontSize: 13, fontWeight: 700, color: i === 2 ? '#1e40af' : '#0f172a', overflow: 'hidden', whiteSpace: 'nowrap', textOverflow: 'ellipsis' }}>{p.subject?.name ?? p.subject ?? 'Subject'}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{p.teacher?.name ?? p.teacher ?? ''}</div>
                  </div>
                  <div style={{ fontSize: 11, color: '#94a3b8', flexShrink: 0 }}>{p.startTime}</div>
                </div>
              ))
            }
          </div>
        </div>

        {/* Announcements */}
        <div className="sms-card">
          <div className="sms-card-header">⚡ Announcements</div>
          <div className="sms-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {(announcements ?? [
              { title: 'Mid-Term Exams', date: 'Apr 20–28', desc: 'Exam schedule released. Check the Results section.' },
              { title: 'PTM', date: 'Apr 10', desc: 'Parent-Teacher meeting for all classes.' },
            ]).map((a, i) => (
              <div key={i} style={{ display: 'flex', gap: 10, padding: '10px 12px', borderRadius: 12, background: '#eff6ff', border: '1px solid #bfdbfe' }}>
                <div style={{ width: 6, height: 6, borderRadius: '50%', background: C.blue, flexShrink: 0, marginTop: 6 }} />
                <div>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e3a8a' }}>{a.title}</div>
                  {a.date && <div style={{ fontSize: 11, color: '#3b82f6', fontWeight: 600, marginTop: 1 }}>{a.date}</div>}
                  <div style={{ fontSize: 12, color: '#1e40af', marginTop: 3 }}>{a.desc}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Upcoming Events */}
        <div className="sms-card">
          <div className="sms-card-header">📆 Upcoming Events</div>
          <div className="sms-card-body" style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {[
              { name: 'Mid-Term Exams',         date: 'Apr 20–28', bg: '#fee2e2', color: '#991b1b' },
              { name: 'Parent-Teacher Meeting', date: 'Apr 10',    bg: '#ede9fe', color: '#5b21b6' },
              { name: 'Annual Sports Day',      date: 'Apr 15',    bg: '#fef9c3', color: '#854d0e' },
              { name: 'School Picnic',          date: 'May 3',     bg: '#ccfbf1', color: '#134e4a' },
            ].map((ev, i) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '9px 12px', borderRadius: 12, background: ev.bg }}>
                <span style={{ fontSize: 13, fontWeight: 700, color: ev.color }}>{ev.name}</span>
                <span style={{ fontSize: 12, fontWeight: 700, color: ev.color }}>{ev.date}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── ATTENDANCE TAB ───────────────────────────────────────────────────────────
function AttendanceTab() {
  const [data, setData]   = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());

  useEffect(() => {
    setData(null);
    studentPortalAPI.getAttendance(month, year)
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load attendance'));
  }, [month, year]);

  const months = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];

  if (!data) return <SkeletonRows count={8} />;
  const { summary, records } = data;
  const pct = summary?.percentage ?? 0;
  const attColor = pct >= 75 ? C.emerald : C.rose;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      {/* Month selector */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {months.map((m, i) => (
          <button key={i} onClick={() => setMonth(i + 1)} style={{ padding: '5px 12px', borderRadius: 99, border: 'none', cursor: 'pointer', fontWeight: 700, fontSize: 12, background: month === i + 1 ? C.blue : '#f1f5f9', color: month === i + 1 ? 'white' : '#64748b', transition: 'all 0.15s' }}>{m}</button>
        ))}
        <select value={year} onChange={e => setYear(+e.target.value)} style={{ padding: '5px 10px', borderRadius: 99, border: '1px solid #e2e8f0', fontSize: 12, fontWeight: 700 }}>
          {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label: 'Total', value: summary?.total ?? 0,   bg: '#f1f5f9', color: '#334155' },
          { label: 'Present', value: summary?.present ?? 0, bg: '#dcfce7', color: '#166534' },
          { label: 'Absent',  value: summary?.absent ?? 0,  bg: '#fee2e2', color: '#991b1b' },
          { label: `${pct}%`, value: 'Attendance', bg: pct >= 75 ? '#dcfce7' : '#fee2e2', color: pct >= 75 ? '#166534' : '#991b1b' },
        ].map((c, i) => (
          <div key={i} style={{ background: c.bg, borderRadius: 14, padding: '16px 18px', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 11, fontWeight: 700, color: c.color, opacity: 0.75, marginTop: 4, textTransform: 'uppercase', letterSpacing: '0.05em' }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Records table */}
      <div className="sms-card">
        <div className="sms-card-header">Daily Records</div>
        <table className="sms-table">
          <thead><tr>{['Date','Day','Status','Remarks'].map(h => <th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {!records?.length && <tr><td colSpan={4} style={{ textAlign: 'center', color: '#94a3b8', padding: 32 }}>No records for this period</td></tr>}
            {records?.map((r, i) => (
              <tr key={i}>
                <td style={{ fontWeight: 700 }}>{fmtDate(r.date)}</td>
                <td>{new Date(r.date).toLocaleDateString('en-IN',{weekday:'long'})}</td>
                <td><StatusBadge status={r.status} /></td>
                <td style={{ color: '#94a3b8' }}>{r.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── RESULTS TAB ──────────────────────────────────────────────────────────────
function ResultsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getResults()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load results'));
  }, []);

  if (!data) return <SkeletonRows count={6} />;
  const { summary, results } = data;
  const gradeColor = g => ({ 'A+':C.emerald,'A':C.emerald,'B+':C.blue,'B':C.blue,'C':C.amber,'D':C.amber,'F':C.rose }[g] ?? C.slate);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 14 }}>
        {[
          { label:'Total', value: summary?.total ?? 0,   bg:'#f1f5f9', color:'#334155' },
          { label:'Passed', value: summary?.passed ?? 0, bg:'#dcfce7', color:'#166534' },
          { label:'Failed', value: summary?.failed ?? 0, bg:'#fee2e2', color:'#991b1b' },
          { label:'Average', value:`${summary?.average ?? 0}%`, bg:(summary?.average ?? 0)>=60?'#dcfce7':'#fee2e2', color:(summary?.average ?? 0)>=60?'#166534':'#991b1b' },
        ].map((c,i)=>(
          <div key={i} style={{ background:c.bg, borderRadius:14, padding:'16px 18px', textAlign:'center' }}>
            <div style={{ fontSize:26, fontWeight:900, color:c.color }}>{c.value}</div>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, opacity:0.75, marginTop:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {(results??[]).map((r,i)=>{
          const pct = r.percentage ?? 0;
          const col = pct>=35?C.emerald:C.rose;
          return (
            <div key={i} className="sms-card" style={{ display:'flex', alignItems:'center', gap:16, padding:'16px 20px' }}>
              <div style={{ width:48, height:48, borderRadius:'50%', background:gradeColor(r.grade), display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:900, fontSize:16, flexShrink:0 }}>{r.grade}</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div className="sms-text-primary" style={{ fontWeight:700, fontSize:14 }}>{r.exam?.name}</div>
                <div className="sms-text-secondary" style={{ fontSize:12, marginTop:2 }}>{r.exam?.subject?.name} · {r.exam?.examType?.toUpperCase()}</div>
                <div className="sms-bar-bg" style={{ marginTop:8 }}>
                  <div className="sms-bar-fill" style={{ width:`${pct}%`, background:col }} />
                </div>
              </div>
              <div style={{ textAlign:'right', flexShrink:0 }}>
                <div className="sms-text-primary" style={{ fontWeight:900, fontSize:18 }}>{r.marksObtained}<span className="sms-text-secondary" style={{ fontSize:12 }}>/{r.exam?.totalMarks}</span></div>
                <div style={{ fontSize:13, fontWeight:800, color:col }}>{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ─── FEES TAB ─────────────────────────────────────────────────────────────────
function FeesTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getFees()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load fees'));
  }, []);

  if (!data) return <SkeletonRows />;
  const { summary, payments } = data;

  const statusMap = {
    paid:    ['#dcfce7','#166534'],
    pending: ['#fef9c3','#854d0e'],
    overdue: ['#fee2e2','#991b1b'],
    partial: ['#dbeafe','#1e40af'],
  };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:18 }}>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14 }}>
        {[
          { label:'Paid',    value:fmtINR(summary?.paid),    bg:'#dcfce7', color:'#166534' },
          { label:'Pending', value:fmtINR(summary?.pending), bg:'#fef9c3', color:'#854d0e' },
          { label:'Overdue', value:fmtINR(summary?.overdue), bg:'#fee2e2', color:'#991b1b' },
        ].map((c,i)=>(
          <div key={i} style={{ background:c.bg, borderRadius:14, padding:'16px 20px' }}>
            <div style={{ fontSize:24, fontWeight:900, color:c.color }}>{c.value}</div>
            <div style={{ fontSize:11, fontWeight:700, color:c.color, opacity:0.75, marginTop:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div className="sms-card">
        <div className="sms-card-header">Payment History</div>
        <table className="sms-table">
          <thead><tr>{['Receipt','Month','Amount','Method','Date','Status'].map(h=><th key={h}>{h}</th>)}</tr></thead>
          <tbody>
            {!(payments??[]).length && <tr><td colSpan={6} style={{ textAlign:'center', color:'#94a3b8', padding:32 }}>No payment records</td></tr>}
            {(payments??[]).map((p,i)=>{
              const [bg,color] = statusMap[p.status] ?? ['#f1f5f9','#475569'];
              return (
                <tr key={i}>
                  <td style={{ fontFamily:'monospace', fontSize:12, color:'#94a3b8' }}>{p.receiptNumber||'—'}</td>
                  <td style={{ fontWeight:700 }}>{p.month}</td>
                  <td style={{ fontWeight:800 }}>{fmtINR(p.amount)}</td>
                  <td style={{ textTransform:'capitalize', color:'#64748b' }}>{p.method}</td>
                  <td>{p.paidOn ? fmtDate(p.paidOn) : '—'}</td>
                  <td><Badge text={p.status?.toUpperCase()} bg={bg} color={color} /></td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── ASSIGNMENTS TAB ──────────────────────────────────────────────────────────
function AssignmentsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getAssignments()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load assignments'));
  }, []);

  if (!data) return <SkeletonRows />;
  const now = new Date();

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {!data.length && <div className="sms-card"><div style={{ textAlign:'center', padding:48, color:'#94a3b8', fontSize:14 }}>✅ No assignments! Enjoy your free time.</div></div>}
      {data.map((a,i) => {
        const due = new Date(a.dueDate);
        const overdue = due < now && !a.submitted;
        const daysLeft = Math.ceil((due - now)/(1000*60*60*24));
        const accentColor = a.submitted ? C.emerald : overdue ? C.rose : C.indigo;
        return (
          <div key={i} className="sms-card" style={{ borderLeft:`4px solid ${accentColor}`, padding:'16px 20px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12 }}>
              <div>
                <div className="sms-text-primary" style={{ fontWeight:700, fontSize:14 }}>{a.title}</div>
                <div className="sms-text-secondary" style={{ fontSize:12, marginTop:4 }}>📖 {a.subject?.name} · Due {due.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}{a.totalMarks?` · ${a.totalMarks} marks`:''}</div>
                {a.description && <div className="sms-text-secondary" style={{ fontSize:13, marginTop:8, lineHeight:1.5 }}>{a.description}</div>}
              </div>
              <div style={{ flexShrink:0 }}>
                {a.submitted
                  ? <Badge text="✅ Submitted" bg="#dcfce7" color="#166534" />
                  : overdue
                  ? <Badge text="❌ Overdue" bg="#fee2e2" color="#991b1b" />
                  : <Badge text={`⏳ ${daysLeft}d left`} bg="#ede9fe" color="#5b21b6" />
                }
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TIMETABLE TAB ────────────────────────────────────────────────────────────
function TimetableTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getTimetable()
      .then(r => setData(r.data.data))
      .catch(() => setData([]));
  }, []);

  if (!data) return <SkeletonRows />;
  const days = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dayColors = [C.indigo,'#0d9488',C.amber,C.rose,C.violet,C.blue];

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
      {!data.length && <div className="sms-card"><div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>No timetable set yet</div></div>}
      {days.map((day,di) => {
        const periods = data.filter(d => d.day === day);
        if (!periods.length) return null;
        return (
          <div key={day} className="sms-card">
            <div style={{ padding:'12px 18px', background:`linear-gradient(135deg,${dayColors[di]},${dayColors[di]}cc)`, display:'flex', alignItems:'center', gap:10 }}>
              <span style={{ fontWeight:900, color:'white', fontSize:14 }}>{day}</span>
              <span style={{ fontSize:12, color:'rgba(255,255,255,0.7)' }}>{periods.length} periods</span>
            </div>
            <div style={{ display:'flex', flexWrap:'wrap', gap:10, padding:14 }}>
              {periods.sort((a,b)=>a.period-b.period).map((p,i)=>(
                <div key={i} style={{ background:`${dayColors[di]}12`, borderRadius:12, padding:'10px 14px', border:`1px solid ${dayColors[di]}30` }}>
                  <div style={{ fontSize:11, fontWeight:700, color:dayColors[di] }}>Period {p.period} · {p.startTime}–{p.endTime}</div>
                  <div className="sms-text-primary" style={{ fontWeight:800, marginTop:2 }}>{p.subject?.name}</div>
                  <div style={{ fontSize:11, color:'#94a3b8', marginTop:1 }}>{p.teacher?.name}</div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── TRANSPORT TAB ────────────────────────────────────────────────────────────
function TransportTab({ studentData }) {
  const transport = studentData?.student?.transport;
  if (!transport) return (
    <div className="sms-card"><div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>🚌 No transport assigned</div></div>
  );
  return (
    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
      {[
        { label:'Your Route', value:transport.route?.name||'N/A', sub:transport.route?.description, bg:`linear-gradient(135deg,#e87722,#f97316)` },
        { label:'Bus Stop',   value:transport.stopName||'N/A',   sub:`Pickup ${transport.pickupTime||'—'} · Drop ${transport.dropTime||'—'}`, bg:`linear-gradient(135deg,#1e293b,#334155)` },
      ].map((c,i)=>(
        <div key={i} style={{ background:c.bg, borderRadius:16, padding:24, color:'white' }}>
          <div style={{ fontSize:12, opacity:0.75, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:6 }}>{c.label}</div>
          <div style={{ fontSize:24, fontWeight:900 }}>{c.value}</div>
          <div style={{ fontSize:13, opacity:0.7, marginTop:5 }}>{c.sub}</div>
        </div>
      ))}
      {transport.vehicle && (
        <div className="sms-card" style={{ gridColumn:'1/-1' }}>
          <div className="sms-card-header">🚐 Vehicle Details</div>
          <div className="sms-card-body" style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { label:'Vehicle No', value:transport.vehicle.vehicleNumber },
              { label:'Driver',     value:transport.vehicle.driverName },
              { label:'Contact',    value:transport.vehicle.driverContact },
            ].map((f,i)=>(
              <div key={i} style={{ background:'#f8fafc', borderRadius:12, padding:'12px 16px' }}>
                <div style={{ fontSize:11, color:'#94a3b8', fontWeight:700, textTransform:'uppercase' }}>{f.label}</div>
                <div className="sms-text-primary" style={{ fontWeight:700, marginTop:4 }}>{f.value||'—'}</div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── LIBRARY TAB ─────────────────────────────────────────────────────────────
function LibraryTab() {
  return (
    <div className="sms-card" style={{ padding:40, textAlign:'center', background:'linear-gradient(135deg,#0d9488,#0891b2)', color:'white' }}>
      <div style={{ fontSize:52, marginBottom:12 }}>📖</div>
      <div style={{ fontSize:20, fontWeight:900, marginBottom:8 }}>Library Portal</div>
      <div style={{ opacity:0.8, fontSize:14, maxWidth:360, margin:'0 auto' }}>Visit the school library or contact the librarian to see your issued books and reading history.</div>
    </div>
  );
}

// ─── NOTIFICATIONS TAB ────────────────────────────────────────────────────────
function NotificationsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getNotifications()
      .then(r => setData(r.data.data))
      .catch(() => setData([]));
  }, []);

  if (!data) return <SkeletonRows />;
  const priColor = { high:['#fee2e2','#991b1b','#ef4444'], medium:['#fef9c3','#854d0e','#f59e0b'], low:['#dcfce7','#166534','#22c55e'] };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
      {!data.length && <div className="sms-card"><div style={{ textAlign:'center', padding:48, color:'#94a3b8' }}>🔕 No notifications</div></div>}
      {data.map((n,i) => {
        const [bg,tc,dot] = priColor[n.priority] ?? priColor.low;
        return (
          <div key={i} className="sms-card" style={{ display:'flex', gap:14, padding:'16px 20px' }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:dot, flexShrink:0, marginTop:4 }} />
            <div style={{ flex:1 }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:12, marginBottom:6 }}>
                <div className="sms-text-primary" style={{ fontWeight:700, fontSize:14 }}>{n.title}</div>
                <Badge text={n.priority?.toUpperCase()} bg={bg} color={tc} />
              </div>
              <div className="sms-text-secondary" style={{ fontSize:13, lineHeight:1.6 }}>{n.message}</div>
              <div style={{ fontSize:11, color:'#cbd5e1', marginTop:8 }}>{fmtDate(n.createdAt)}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
  const { user, logout } = useAuth();
  const [data,         setData]         = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [activeModule, setActiveModule] = useState('overview');
  const [dark,         setDark]         = useState(() => localStorage.getItem('sms-theme') === 'dark');
  const [sidebarOpen,  setSidebarOpen]  = useState(false);
  const [collapsed,    setCollapsed]    = useState(false);
  const [notifOpen,    setNotifOpen]    = useState(false);

  useEffect(() => {
    localStorage.setItem('sms-theme', dark ? 'dark' : 'light');
  }, [dark]);

  useEffect(() => {
    studentPortalAPI.getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const navigate = (id) => { setActiveModule(id); setSidebarOpen(false); setNotifOpen(false); };

  if (loading) return (
    <div className={`sms-dash ${dark ? 'dark' : ''}`} style={{ justifyContent:'center', alignItems:'center', flexDirection:'column', gap:20 }}>
      <div style={{ fontSize:52 }}>🎓</div>
      <div style={{ fontWeight:800, color:C.blue, fontSize:18 }}>Loading your dashboard…</div>
      <div style={{ width:180, height:4, background:'#e2e8f0', borderRadius:99, overflow:'hidden' }}>
        <div style={{ height:'100%', width:'60%', background:C.blue, borderRadius:99, animation:'none' }} />
      </div>
    </div>
  );

  const student   = data?.student;
  const stats     = data?.stats;
  const attPct    = stats?.attendancePercentage ?? 0;
  const notifCount= stats?.notificationCount ?? 0;
  const activeLabel = MODULES.find(m => m.id === activeModule)?.label ?? 'Overview';

  const renderTab = () => {
    switch (activeModule) {
      case 'overview':       return <OverviewTab data={data} dark={dark} onNavigate={navigate} />;
      case 'attendance':     return <AttendanceTab />;
      case 'results':        return <ResultsTab />;
      case 'fees':           return <FeesTab />;
      case 'assignments':    return <AssignmentsTab />;
      case 'timetable':      return <TimetableTab />;
      case 'transport':      return <TransportTab studentData={data} />;
      case 'library':        return <LibraryTab />;
      case 'notifications':  return <NotificationsTab />;
      default:               return <OverviewTab data={data} dark={dark} onNavigate={navigate} />;
    }
  };

  /* ── Sidebar ── */
  const SidebarContent = () => (
    <>
      {/* Logo */}
      <div style={{ padding:'16px 14px 14px', borderBottom:'1px solid rgba(255,255,255,0.07)', display:'flex', alignItems:'center', gap:10 }}>
        <div style={{ width:34, height:34, borderRadius:10, background:C.blue, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>⚡</div>
        <div className="sms-logo-text">
          <div style={{ fontWeight:800, color:'white', fontSize:13 }}>Future Step</div>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)' }}>School Portal</div>
        </div>
      </div>

      {/* Profile */}
      <div style={{ padding:'14px', borderBottom:'1px solid rgba(255,255,255,0.07)' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:14, flexShrink:0 }}>
            {(student?.user?.name ?? user?.name ?? 'S')[0]}
          </div>
          <div className="sms-profile-info" style={{ minWidth:0 }}>
            <div style={{ fontWeight:700, color:'white', fontSize:13, overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{student?.user?.name ?? user?.name}</div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', overflow:'hidden', whiteSpace:'nowrap', textOverflow:'ellipsis' }}>{student?.class?.name} · Roll {student?.rollNumber}</div>
          </div>
        </div>
        <div className="sms-att-bar-wrap" style={{ marginTop:12 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
            <span style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:600 }}>Attendance</span>
            <span style={{ fontSize:11, fontWeight:800, color: attPct >= 75 ? C.emerald : C.rose }}>{attPct}%</span>
          </div>
          <div style={{ height:4, background:'rgba(255,255,255,0.1)', borderRadius:99 }}>
            <div style={{ height:'100%', width:`${attPct}%`, background: attPct >= 75 ? C.emerald : C.rose, borderRadius:99, transition:'width 1s' }} />
          </div>
        </div>
      </div>

      {/* Nav */}
      <nav style={{ flex:1, padding:'10px 8px', overflowY:'auto' }}>
        <div style={{ fontSize:9, fontWeight:800, color:'rgba(255,255,255,0.25)', letterSpacing:'0.15em', textTransform:'uppercase', padding:'6px 10px 4px', display: collapsed ? 'none' : 'block' }}>MODULES</div>
        {MODULES.map(({ id, label, icon }) => {
          const active = activeModule === id;
          const badge  = id === 'notifications' && notifCount > 0;
          return (
            <button key={id} onClick={() => navigate(id)} className={`sms-nav-btn ${active ? 'active' : ''}`}>
              <span className="sms-nav-icon">{icon}</span>
              <span className="sms-nav-label">{label}</span>
              {badge && <span className="sms-notif-badge">{notifCount}</span>}
            </button>
          );
        })}
      </nav>

      {/* Logout */}
      <div style={{ padding:'10px 8px', borderTop:'1px solid rgba(255,255,255,0.07)' }}>
        <button onClick={logout} className="sms-nav-btn" style={{ color:'rgba(255,255,255,0.4)' }}>
          <span className="sms-nav-icon">↩</span>
          <span className="sms-nav-label">Logout</span>
        </button>
      </div>
    </>
  );

  return (
    <div className={`sms-dash ${dark ? 'dark' : ''}`} style={{ margin:'-24px -24px', fontFamily:"'Inter',sans-serif" }}>

      {/* Desktop sidebar */}
      <div className={`sms-sidebar ${collapsed ? 'collapsed' : ''}`} style={{ display:'flex', flexDirection:'column' }}>
        <SidebarContent />
      </div>

      {/* Mobile overlay + sidebar */}
      <div className={`sms-mobile-overlay ${sidebarOpen ? 'show' : ''}`} onClick={() => setSidebarOpen(false)} />
      <div className="sms-sidebar" style={{ display:'flex', flexDirection:'column', left: sidebarOpen ? 0 : undefined }}>
        <SidebarContent />
      </div>

      {/* Main content */}
      <div className="sms-main">
        {/* Header */}
        <div className="sms-header">
          {/* Mobile hamburger */}
          <button onClick={() => setSidebarOpen(o => !o)} style={{ display:'none', background:'none', border:'none', cursor:'pointer', fontSize:20, padding:4 }} className="sms-hamburger">☰</button>
          {/* Collapse toggle (desktop) */}
          <button onClick={() => setCollapsed(c => !c)} style={{ background:'none', border:'none', cursor:'pointer', fontSize:18, color:'#94a3b8', padding:4 }}>{collapsed ? '▶' : '◀'}</button>

          <div style={{ flex:1 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#94a3b8', textTransform:'uppercase', letterSpacing:'0.1em', marginBottom:2 }}>Student Portal</div>
            <h1 style={{ margin:0, fontSize:20, fontWeight:800, color: dark ? '#f1f5f9' : C.navy }}>{activeLabel}</h1>
          </div>

          <div style={{ display:'flex', alignItems:'center', gap:10, flexShrink:0 }}>
            <span style={{ fontSize:12, color:'#94a3b8', fontWeight:500 }}>
              {new Date().toLocaleDateString('en-IN',{weekday:'short',day:'numeric',month:'short',year:'numeric'})}
            </span>

            {/* Notification bell */}
            <div style={{ position:'relative' }}>
              <button onClick={() => setNotifOpen(o => !o)} style={{ position:'relative', background:'#f8fafc', border:'none', borderRadius:10, padding:'7px 9px', cursor:'pointer', fontSize:16 }}>
                🔔
                {notifCount > 0 && <span style={{ position:'absolute', top:4, right:4, width:8, height:8, borderRadius:'50%', background:'#ef4444' }} />}
              </button>

              {notifOpen && (
                <div style={{ position:'absolute', right:0, top:44, width:300, background: dark ? '#1e293b' : 'white', borderRadius:16, boxShadow:'0 20px 60px rgba(0,0,0,0.15)', border:'1px solid #f1f5f9', padding:16, zIndex:999 }}>
                  <div style={{ fontWeight:700, fontSize:13, marginBottom:12, color: dark ? '#f1f5f9' : '#0f172a' }}>Notifications</div>
                  <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                    {(data?.notifications ?? []).slice(0,3).map((n,i) => (
                      <div key={i} style={{ display:'flex', gap:8, padding:'8px 10px', borderRadius:10, background:'#f8fafc', fontSize:12 }}>
                        <div style={{ width:7, height:7, borderRadius:'50%', background: n.priority==='high'?C.rose:n.priority==='medium'?C.amber:C.blue, flexShrink:0, marginTop:3 }} />
                        <div><div style={{ fontWeight:700, color: dark?'#f1f5f9':'#0f172a', marginBottom:2 }}>{n.title}</div><div style={{ color:'#64748b' }}>{n.message?.slice(0,70)}…</div></div>
                      </div>
                    ))}
                  </div>
                  <button onClick={() => navigate('notifications')} style={{ marginTop:10, width:'100%', textAlign:'center', fontSize:12, color:C.blue, fontWeight:600, background:'none', border:'none', cursor:'pointer' }}>View all →</button>
                </div>
              )}
            </div>

            {/* Dark mode */}
            <button onClick={() => setDark(d => !d)} style={{ background:'#f8fafc', border:'none', borderRadius:10, padding:'7px 9px', cursor:'pointer', fontSize:16 }}>
              {dark ? '☀️' : '🌙'}
            </button>

            {/* Avatar */}
            <div style={{ width:34, height:34, borderRadius:10, background:'linear-gradient(135deg,#3b82f6,#6366f1)', display:'flex', alignItems:'center', justifyContent:'center', color:'white', fontWeight:800, fontSize:14, flexShrink:0 }}>
              {(student?.user?.name ?? user?.name ?? 'S')[0]}
            </div>
          </div>
        </div>

        {/* Scrollable content */}
        <div className="sms-content">
          {renderTab()}
        </div>
      </div>

      {/* Mobile CSS patch */}
      <style>{`
        @media (max-width: 768px) {
          .sms-hamburger { display: block !important; }
          .sms-sidebar:not(.mobile-open) { left: -220px !important; }
          ${sidebarOpen ? '.sms-sidebar { left: 0 !important; }' : ''}
        }
      `}</style>
    </div>
  );
}