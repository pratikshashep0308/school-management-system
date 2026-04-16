import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../utils/api';
import { StatCard, LoadingState } from '../components/ui';

const CARD = {
  background: '#fff', border: '1px solid #E5E7EB',
  borderRadius: 16, boxShadow: '0 1px 4px rgba(0,0,0,0.06)', overflow: 'hidden',
};

function timeAgo(date) {
  const diff = Math.floor((new Date() - new Date(date)) / 1000);
  if (diff < 60)    return 'just now';
  if (diff < 3600)  return `${Math.floor(diff / 60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)} hr ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

export default function AdminDashboard() {
  const { user, isAdmin, isTeacher } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats]     = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getStats()
      .then(r => setStats(r.data.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
      {/* Header */}
      <div>
        <h1 style={{ fontSize: 28, fontWeight: 800, color: '#111827', margin: 0 }}>
          {greeting()}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p style={{ fontSize: 13, color: '#6B7280', marginTop: 4 }}>Here's what's happening at school today.</p>
      </div>

      {loading ? <LoadingState /> : (
        <>
          {/* ── Stat Cards ── */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
            {[
              { icon: '👤', value: stats?.totalStudents?.toLocaleString() || '0', label: 'Total Students', change: '12 new this month',  changeType: 'up', color: 'accent', to: '/students'   },
              { icon: '🎓', value: stats?.totalTeachers || '0',                   label: 'Teachers',       change: '3 new this term',    changeType: 'up', color: 'gold',   to: '/teachers'   },
              { icon: '✓',  value: `${stats?.attendanceRate || 0}%`,              label: 'Avg Attendance', change: "Today's rate",        changeType: 'up', color: 'sage',   to: '/attendance' },
              { icon: '₹',  value: stats?.feesCollected ? `₹${(stats.feesCollected / 100000).toFixed(1)}L` : '₹0', label: 'Fees Collected', change: stats?.feesCollected ? 'This month' : 'No payments', changeType: 'up', color: 'purple', to: '/fees' },
            ].map(s => (
              <div key={s.label}
                onClick={() => navigate(s.to)}
                style={{ cursor: 'pointer', borderRadius: 16, transition: 'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'translateY(0)'; }}>
                <StatCard icon={s.icon} value={s.value} label={s.label} change={s.change} changeType={s.changeType} color={s.color} />
              </div>
            ))}
          </div>

          {/* ── Attendance + Exams Row ── */}
          <div style={{ display: 'grid', gridTemplateColumns: '3fr 2fr', gap: 20 }}>

            {/* Weekly Attendance */}
            <div style={{ ...CARD, cursor: 'pointer' }}
              onClick={() => navigate('/attendance')}
              onMouseEnter={e => e.currentTarget.style.boxShadow = '0 4px 16px rgba(0,0,0,0.10)'}
              onMouseLeave={e => e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
                <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>Weekly Attendance Overview</div>
                <div style={{ fontSize: 11, color: '#9CA3AF' }}>Mon – Fri this week</div>
              </div>
              <div style={{ padding: '20px 24px 24px' }}>
                <div style={{ display: 'flex', gap: 16, marginBottom: 20 }}>
                  {[['#4a7c59', 'Present'], ['rgba(212,82,42,0.25)', 'Absent']].map(([c, l]) => (
                    <div key={l} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: '#6B7280' }}>
                      <span style={{ width: 10, height: 10, borderRadius: 2, display: 'inline-block', background: c }} /> {l}
                    </div>
                  ))}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 100, flexDirection: 'column', gap: 8 }}>
                  <div style={{ fontSize: 36, fontWeight: 900, color: '#4a7c59' }}>{stats?.attendanceRate || 0}%</div>
                  <div style={{ fontSize: 13, color: '#6B7280' }}>Today's attendance rate</div>
                  <div style={{ width: '100%', height: 8, background: '#F3F4F6', borderRadius: 4, overflow: 'hidden', marginTop: 4 }}>
                    <div style={{ height: '100%', width: `${stats?.attendanceRate || 0}%`, background: '#4a7c59', borderRadius: 4, transition: 'width 1s' }} />
                  </div>
                  <div style={{ display: 'flex', gap: 16, fontSize: 12, color: '#6B7280' }}>
                    <span>✅ Present: {stats?.todayPresent || 0}</span>
                    <span>👥 Total: {stats?.totalStudents || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            {/* Upcoming Exams */}
            <div style={CARD}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
                <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>Upcoming Exams</div>
                <button onClick={() => navigate('/exams')}
                  style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                  View all
                </button>
              </div>
              <div>
                {!stats?.upcomingExams?.length ? (
                  <div style={{ padding: '32px 20px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No upcoming exams scheduled</div>
                ) : stats.upcomingExams.map((exam, i) => {
                  const d = exam.date ? new Date(exam.date) : null;
                  return (
                    <div key={i}
                      onClick={() => navigate('/exams')}
                      style={{ display: 'flex', gap: 12, padding: '14px 20px', alignItems: 'flex-start', borderBottom: '1px solid #F9FAFB', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                      onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                      <div style={{ width: 40, height: 40, borderRadius: 10, background: '#F3F4F6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                        <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', lineHeight: 1 }}>{d?.getDate()}</div>
                        <div style={{ fontSize: 9, color: '#9CA3AF', textTransform: 'uppercase' }}>{d?.toLocaleString('default', { month: 'short' })}</div>
                      </div>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap' }}>
                          <div style={{ fontWeight: 600, fontSize: 13, color: '#111827' }}>{exam.name}</div>
                          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 999, background: '#FEF9C3', color: '#92400E' }}>{exam.examType}</span>
                        </div>
                        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{exam.class?.name} {exam.class?.section || ''} · {exam.subject?.name || '—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* ── Recent Notifications ── */}
          <div style={CARD}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '16px 24px', borderBottom: '1px solid #F3F4F6' }}>
              <div style={{ fontWeight: 700, color: '#111827', fontSize: 14 }}>Recent Notifications</div>
              <button onClick={() => navigate('/notifications')}
                style={{ fontSize: 12, color: '#2563EB', background: 'none', border: 'none', cursor: 'pointer', fontWeight: 600 }}>
                View all
              </button>
            </div>
            <div>
              {!stats?.recentNotifications?.length ? (
                <div style={{ padding: '32px 24px', textAlign: 'center', color: '#9CA3AF', fontSize: 13 }}>No recent notifications</div>
              ) : stats.recentNotifications.map((n, i) => (
                <div key={i}
                  onClick={() => navigate('/notifications')}
                  style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '12px 24px', borderBottom: '1px solid #F9FAFB', cursor: 'pointer' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#F9FAFB'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}>
                  <div style={{ width: 8, height: 8, borderRadius: '50%', flexShrink: 0, background: n.type === 'warning' ? '#d4522a' : n.type === 'success' ? '#4a7c59' : '#7c6af5' }} />
                  <div style={{ flex: 1, fontSize: 13, color: '#374151' }}>
                    {n.title}{n.message ? ` — ${n.message.slice(0, 60)}${n.message.length > 60 ? '…' : ''}` : ''}
                  </div>
                  <div style={{ fontSize: 11, color: '#9CA3AF', whiteSpace: 'nowrap' }}>{timeAgo(n.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* ── Quick Actions ── */}
          {(isAdmin || isTeacher) && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
              {[
                { icon: '✓',  label: 'Mark Attendance',   to: '/attendance',   bg: '#F0FDF4', color: '#166534' },
                { icon: '👤', label: 'Add Student',        to: '/students',     bg: '#EFF6FF', color: '#1D4ED8' },
                { icon: '📋', label: 'New Admission',      to: '/admissions',   bg: '#FEFCE8', color: '#92400E' },
                { icon: '🔔', label: 'Send Notification',  to: '/notifications',bg: '#F5F3FF', color: '#5B21B6' },
              ].map(({ icon, label, to, bg, color }) => (
                <button key={to} onClick={() => navigate(to)}
                  style={{ ...CARD, padding: '20px 16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, cursor: 'pointer', border: '1px solid #E5E7EB', transition: 'transform 0.15s, box-shadow 0.15s' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 16px rgba(0,0,0,0.10)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}>
                  <div style={{ width: 40, height: 40, borderRadius: 12, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, background: bg, color }}>
                    {icon}
                  </div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: '#111827' }}>{label}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}