// frontend/src/pages/StudentDashboard.js
// Student Portal — admin-dashboard style, shows only the student's own data
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api from '../utils/api';
import { LoadingState, EmptyState, StatCard } from '../components/ui';
import { usePortalTab } from '../components/common/Layout';

// ─── Attendance Ring ────────────────────────────────────────────────────────────
function Ring({ pct, size = 80, stroke = 8, color }) {
  const r   = (size - stroke) / 2;
  const c   = 2 * Math.PI * r;
  const col = color || (pct >= 75 ? '#4a7c59' : pct >= 50 ? '#c9a84c' : '#d4522a');
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1.2s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-sm font-black" style={{ color: col }}>{pct}%</span>
      </div>
    </div>
  );
}

function CardHeader({ title, subtitle, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
      <div>
        <div className="font-semibold text-ink dark:text-white">{title}</div>
        {subtitle && <div className="text-xs text-muted mt-0.5">{subtitle}</div>}
      </div>
      {action && (
        <button onClick={onAction} className="text-xs font-semibold text-accent hover:underline">{action}</button>
      )}
    </div>
  );
}

const TABS = [
  { id: 'overview',    label: 'Overview',    icon: '🏠' },
  { id: 'attendance',  label: 'Attendance',  icon: '📅' },
  { id: 'timetable',   label: 'Timetable',   icon: '🗓' },
  { id: 'exams',       label: 'Exams',       icon: '📝' },
  { id: 'assignments', label: 'Assignments', icon: '📋' },
  { id: 'fees',        label: 'Fees',        icon: '💰' },
  { id: 'transport',   label: 'Transport',   icon: '🚌' },
];

const DAYS  = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const TIMES = ['9:00','9:45','10:30','11:15','12:00','12:45','1:30','2:15'];
const DAY_COLORS = {
  Monday:'#d4522a', Tuesday:'#c9a84c', Wednesday:'#4a7c59',
  Thursday:'#7c6af5', Friday:'#2d9cdb', Saturday:'#f2994a',
};

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const { activeTab: tab, setTab } = usePortalTab();
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState('');

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  const load = useCallback(async () => {
    setLoading(true); setError('');
    try {
      const res = await api.get('/student-portal/dashboard');
      setData(res.data.data);
    } catch (e) {
      setError(e.response?.data?.message || 'Failed to load your data.');
    } finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;
  if (error) return (
    <div className="animate-fade-in">
      <div className="card p-10 text-center">
        <div className="text-5xl mb-4">⚠️</div>
        <div className="font-semibold text-ink dark:text-white mb-2">Couldn't load your data</div>
        <p className="text-sm text-muted mb-4">{error}</p>
        <button className="btn-primary" onClick={load}>Retry</button>
      </div>
    </div>
  );

  const student     = data?.student      || {};
  const attendance  = data?.attendance   || { present: 0, absent: 0, total: 0, records: [] };
  const exams       = data?.exams        || [];
  const fees        = data?.fees         || [];
  // timetable is now a single object with schedule:[{day, periods[]}]
  const timetableDoc = data?.timetable || null;
  const timetable    = timetableDoc?.schedule || [];
  const assignments = data?.assignments  || [];
  const transport   = data?.transport    || null;
  const notifications = data?.notifications || [];

  const attTotal  = attendance.present + attendance.absent;
  const attPct    = attTotal > 0 ? Math.round((attendance.present / attTotal) * 100) : 0;
  const upcoming  = exams.filter(e => e.date && new Date(e.date) >= new Date());
  const pendingFees = fees.filter(f => f.status !== 'paid');
  const dueAssignments = assignments.filter(a => a.dueDate && new Date(a.dueDate) >= new Date() && !a.submitted);

  // Build timetable lookup from schedule array
  const ttMap = {};
  DAYS.forEach(d => { ttMap[d] = {}; });
  timetable.forEach(ds => {
    (ds.periods || []).forEach(p => {
      if (ttMap[ds.day]) ttMap[ds.day][p.periodNumber] = p;
    });
  });

  return (
    <div className="animate-fade-in space-y-5">

      {/* ── Header ── */}
      <div className="flex items-start justify-between flex-wrap gap-3">
        <div>
          <h1 className="font-display text-3xl text-ink dark:text-white">
            {greeting()}, {user?.name?.split(' ')[0]} 👋
          </h1>
          <p className="text-sm text-muted mt-1">
            {student.class?.name} {student.class?.section}&nbsp;·&nbsp;Roll No.&nbsp;{student.rollNumber || '—'}
          </p>
        </div>
        <button onClick={() => navigate('/profile')}
          className="flex items-center gap-2 px-4 py-2 rounded-xl border border-border bg-white dark:bg-gray-800 text-sm font-semibold text-ink dark:text-white hover:border-accent/50 transition-all">
          👤 My Profile
        </button>
      </div>

      {/* ── Stat Cards ── */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        <StatCard icon="📅" value={`${attPct}%`}          label="Attendance"          route="/dashboard"
          change={`${attendance.present}/${attTotal} days`}
          changeType={attPct >= 75 ? 'up' : 'down'} color="sage" />
        <StatCard icon="📝" value={upcoming.length}        label="Upcoming Exams"      route="/dashboard"
          change="Scheduled" changeType="up" color="gold" />
        <StatCard icon="📋" value={dueAssignments.length}  label="Due Assignments"     route="/dashboard"
          change={dueAssignments.length > 0 ? 'Need attention' : 'All clear'}
          changeType={dueAssignments.length > 0 ? 'down' : 'up'} color="accent" />
        <StatCard icon="💰" value={pendingFees.length === 0 ? '✅' : pendingFees.length}
          label="Fee Status"
          change={pendingFees.length === 0 ? 'All paid' : `${pendingFees.length} pending`}
          changeType={pendingFees.length > 0 ? 'down' : 'up'} color="purple" />
      </div>

      {/* ── Active Section Indicator ── */}
      {tab !== 'overview' && (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, paddingBottom: 2 }}>
          <button onClick={() => setTab('overview')} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 12, color: '#94a3b8', fontWeight: 600, padding: 0 }}>
            Overview
          </button>
          <span style={{ color: '#94a3b8', fontSize: 12 }}>›</span>
          <span style={{ fontSize: 12, fontWeight: 800, color: '#e87722', textTransform: 'capitalize' }}>{tab}</span>
        </div>
      )}

      {/* ════════════════════ OVERVIEW ════════════════════ */}
      {tab === 'overview' && (
        <div className="grid xl:grid-cols-3 gap-5">

          {/* Attendance */}
          <div className="card p-6">
            <h3 className="font-semibold text-ink dark:text-white mb-4">📅 Attendance This Month</h3>
            <div className="flex items-center gap-5">
              <Ring pct={attPct} size={90} stroke={9} />
              <div className="flex-1">
                <div className="h-2.5 bg-warm dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                  <div className="h-full bg-sage rounded-full transition-all duration-1000" style={{ width: `${attPct}%` }} />
                </div>
                <div className="flex justify-between text-xs text-muted">
                  <span>✅ {attendance.present} present</span>
                  <span>❌ {attendance.absent} absent</span>
                </div>
                {attPct < 75 && (
                  <div className="mt-2 p-2 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200">
                    <p className="text-xs text-red-600 font-medium">⚠️ Below 75% — warning</p>
                  </div>
                )}
              </div>
            </div>
          </div>

          {/* Upcoming exams */}
          <div className="card overflow-hidden">
            <CardHeader title="Upcoming Exams" subtitle={`${upcoming.length} scheduled`}
              action="All exams" onAction={() => setTab('exams')} />
            {!upcoming.length ? <EmptyState icon="📝" title="No upcoming exams" /> : (
              <div className="divide-y divide-border dark:divide-gray-700">
                {upcoming.slice(0, 4).map(exam => {
                  const d    = new Date(exam.date);
                  const diff = Math.ceil((d - new Date()) / 86400000);
                  return (
                    <div key={exam._id} className="flex items-center gap-3 px-5 py-3 hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="w-10 h-10 rounded-xl bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                        <div className="text-xs font-bold text-ink dark:text-white">{d.getDate()}</div>
                        <div className="text-[9px] text-muted uppercase">{d.toLocaleString('default',{month:'short'})}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink dark:text-white truncate">{exam.name}</div>
                        <div className="text-xs text-muted">{exam.subject?.name} · {exam.totalMarks} marks</div>
                      </div>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' +
                        (diff <= 3 ? 'bg-red-100 text-red-600' : diff <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                        {diff === 0 ? 'Today' : `${diff}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Notifications */}
          <div className="card overflow-hidden">
            <CardHeader title="School Notifications" subtitle="Latest announcements"
              action="View all" onAction={() => navigate('/notifications')} />
            {!notifications.length ? <EmptyState icon="🔔" title="No notifications" /> : (
              <div className="divide-y divide-border dark:divide-gray-700">
                {notifications.slice(0, 5).map(n => (
                  <div key={n._id} className="px-5 py-3 hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors">
                    <p className="text-sm font-semibold text-ink dark:text-white">{n.title}</p>
                    <p className="text-xs text-muted line-clamp-1">{n.message}</p>
                    <p className="text-[10px] text-muted/70 mt-0.5">{new Date(n.createdAt).toLocaleDateString('en-IN')}</p>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Pending assignments */}
          <div className="card overflow-hidden">
            <CardHeader title="Pending Assignments" subtitle={`${dueAssignments.length} due`}
              action="All assignments" onAction={() => setTab('assignments')} />
            {!dueAssignments.length ? (
              <div className="px-5 py-8 text-center">
                <div className="text-3xl mb-2">🎉</div>
                <div className="text-sm font-semibold text-ink dark:text-white">All caught up!</div>
                <div className="text-xs text-muted mt-1">No pending assignments</div>
              </div>
            ) : (
              <div className="divide-y divide-border dark:divide-gray-700">
                {dueAssignments.slice(0, 4).map(a => {
                  const due  = new Date(a.dueDate);
                  const diff = Math.ceil((due - new Date()) / 86400000);
                  return (
                    <div key={a._id} className="flex items-center gap-3 px-5 py-3 hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors">
                      <div className="w-9 h-9 rounded-xl bg-accent/10 flex items-center justify-center text-lg flex-shrink-0">📋</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm font-semibold text-ink dark:text-white truncate">{a.title}</div>
                        <div className="text-xs text-muted">
                          {a.subject?.name}{a.teacher?.user?.name ? ` · ${a.teacher.user.name}` : ''}
                        </div>
                      </div>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' +
                        (diff <= 1 ? 'bg-red-100 text-red-600' : diff <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        {diff <= 0 ? 'Due!' : `${diff}d`}
                      </span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Transport */}
          {transport && (
            <div className="card p-6">
              <h3 className="font-semibold text-ink dark:text-white mb-4">🚌 My Transport</h3>
              <div className="space-y-0">
                {[
                  { label: 'Route',   value: transport.routeName || transport.route?.name },
                  { label: 'Vehicle', value: transport.vehicleNumber },
                  { label: 'Driver',  value: transport.driverName },
                  { label: 'Pickup',  value: transport.pickupTime },
                  { label: 'Drop',    value: transport.dropTime },
                ].filter(i => i.value).map(item => (
                  <div key={item.label} className="flex justify-between py-2 border-b border-border dark:border-gray-700 last:border-0">
                    <span className="text-xs text-muted">{item.label}</span>
                    <span className="text-xs font-semibold text-ink dark:text-white">{item.value}</span>
                  </div>
                ))}
              </div>
              <button onClick={() => setTab('transport')} className="mt-3 w-full text-xs font-semibold text-accent hover:underline text-left">
                Full details →
              </button>
            </div>
          )}

          {/* Fee summary */}
          <div className="card p-6">
            <h3 className="font-semibold text-ink dark:text-white mb-4">💰 Fee Summary</h3>
            <div className="space-y-0">
              <div className="flex justify-between py-2 border-b border-border dark:border-gray-700">
                <span className="text-xs text-muted">Records</span>
                <span className="text-xs font-bold text-ink dark:text-white">{fees.length}</span>
              </div>
              <div className="flex justify-between py-2 border-b border-border dark:border-gray-700">
                <span className="text-xs text-muted">Paid</span>
                <span className="text-xs font-bold text-green-600">
                  ₹{fees.filter(f=>f.status==='paid').reduce((s,f)=>s+(f.paidAmount||f.totalAmount||0),0).toLocaleString('en-IN')}
                </span>
              </div>
              <div className="flex justify-between py-2">
                <span className="text-xs text-muted">Pending</span>
                <span className={'text-xs font-bold ' + (pendingFees.length > 0 ? 'text-amber-500' : 'text-green-600')}>
                  {pendingFees.length > 0
                    ? `₹${pendingFees.reduce((s,f)=>s+(f.dueAmount||f.totalAmount||0),0).toLocaleString('en-IN')}`
                    : '✅ Clear'}
                </span>
              </div>
            </div>
            <button onClick={() => setTab('fees')} className="mt-3 w-full text-xs font-semibold text-accent hover:underline text-left">
              View all fees →
            </button>
          </div>
        </div>
      )}

      {/* ════════════════════ ATTENDANCE ════════════════════ */}
      {tab === 'attendance' && (
        <div className="space-y-5">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <div className="font-display text-4xl text-sage mb-1">{attendance.present}</div>
              <div className="text-xs text-muted">✅ Present</div>
            </div>
            <div className="card p-5 text-center">
              <div className="font-display text-4xl text-accent mb-1">{attendance.absent}</div>
              <div className="text-xs text-muted">❌ Absent</div>
            </div>
            <div className="card p-5 flex flex-col items-center gap-1">
              <Ring pct={attPct} size={64} stroke={6} />
              <div className="text-xs text-muted">Percentage</div>
            </div>
          </div>

          {attPct < 75 && (
            <div className="card p-4 bg-red-50 dark:bg-red-900/20 border border-red-200">
              <p className="font-semibold text-red-700 dark:text-red-300">⚠️ Attendance Warning</p>
              <p className="text-sm text-red-600 dark:text-red-400 mt-1">
                Your attendance is {attPct}%. Minimum 75% is required. Please attend classes regularly.
              </p>
            </div>
          )}

          {attendance.records?.length > 0 && (
            <div className="card p-6">
              <h3 className="font-semibold text-ink dark:text-white mb-4">Monthly Calendar</h3>
              <div className="grid grid-cols-7 gap-1.5">
                {['S','M','T','W','T','F','S'].map((d,i) => (
                  <div key={i} className="text-center text-[10px] text-muted font-bold py-1">{d}</div>
                ))}
                {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() }).map((_,i) => (
                  <div key={'e'+i} />
                ))}
                {attendance.records.map((r, i) => (
                  <div key={i} className={'w-8 h-8 rounded-lg mx-auto flex items-center justify-center text-[11px] font-bold ' +
                    (r.status === 'present' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' :
                     r.status === 'absent'  ? 'bg-red-100 dark:bg-red-900/40 text-red-600' :
                                              'bg-gray-100 dark:bg-gray-700 text-muted')}>
                    {r.day || i+1}
                  </div>
                ))}
              </div>
              <div className="flex gap-5 mt-4">
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3 h-3 rounded bg-green-200 inline-block" /> Present</span>
                <span className="flex items-center gap-1.5 text-xs text-muted"><span className="w-3 h-3 rounded bg-red-200 inline-block" /> Absent</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ TIMETABLE ════════════════════ */}
      {tab === 'timetable' && (
        <div>
          {!timetable.length ? (
            <EmptyState icon="🗓" title="No timetable set" subtitle="Admin hasn't configured the timetable for your class yet" />
          ) : (
            <div className="card overflow-x-auto">
              <CardHeader title="Weekly Timetable" subtitle={`${student.class?.name || ''} ${student.class?.section || ''}`} />
              <table className="w-full text-sm min-w-[700px]">
                <thead>
                  <tr className="bg-warm dark:bg-gray-800/50">
                    <th className="text-left px-4 py-3 text-xs font-bold text-muted uppercase tracking-wide w-28">Day</th>
                    {[1,2,3,4,5,6,7,8].map((p, i) => (
                      <th key={p} className="text-left px-3 py-3 text-xs font-bold text-muted uppercase tracking-wide">
                        <div>P{p}</div>
                        <div className="text-[9px] normal-case font-normal">{TIMES[i]}</div>
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {DAYS.map(day => (
                    <tr key={day} className="border-t border-border dark:border-gray-700 hover:bg-warm/40 dark:hover:bg-gray-800/40 transition-colors">
                      <td className="px-4 py-3">
                        <div className="font-bold text-xs" style={{ color: DAY_COLORS[day] }}>{day.slice(0,3).toUpperCase()}</div>
                        <div className="text-[10px] text-muted">{day}</div>
                      </td>
                      {[1,2,3,4,5,6,7,8].map(p => {
                        const period = ttMap[day]?.[p];
                        return (
                          <td key={p} className="px-3 py-2">
                            {period ? (
                              <div className="min-w-[80px]">
                                <div className="text-xs font-semibold text-ink dark:text-white">{period.subject?.name || '—'}</div>
                                <div className="text-[10px] text-muted truncate">{period.teacher?.user?.name || ''}</div>
                              </div>
                            ) : <span className="text-[10px] text-muted/30">—</span>}
                          </td>
                        );
                      })}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}

      {/* ════════════════════ EXAMS ════════════════════ */}
      {tab === 'exams' && (
        <div className="space-y-3">
          {!exams.length ? <EmptyState icon="📝" title="No exams found" /> : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-amber-500">{upcoming.length}</div>
                  <div className="text-xs text-muted mt-1">Upcoming</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-muted">{exams.length - upcoming.length}</div>
                  <div className="text-xs text-muted mt-1">Completed</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-ink dark:text-white">{exams.length}</div>
                  <div className="text-xs text-muted mt-1">Total</div>
                </div>
              </div>
              {exams.map(exam => {
                const d    = exam.date ? new Date(exam.date) : null;
                const past = d && d < new Date();
                const diff = d ? Math.ceil((d - new Date()) / 86400000) : null;
                const typeColors = {
                  unit: 'bg-amber-100 text-amber-700',
                  midterm: 'bg-red-100 text-red-700',
                  final: 'bg-purple-100 text-purple-700',
                  practical: 'bg-green-100 text-green-700',
                };
                return (
                  <div key={exam._id} className="card px-5 py-4 flex items-center gap-5 hover:border-accent/30 transition-colors">
                    <div className="w-14 h-14 rounded-xl bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                      <div className="font-bold text-ink dark:text-white">{d?.getDate() || '—'}</div>
                      <div className="text-[9px] text-muted uppercase">{d?.toLocaleString('default',{month:'short'}) || ''}</div>
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-ink dark:text-white">{exam.name}</span>
                        {exam.examType && (
                          <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (typeColors[exam.examType] || 'bg-gray-100 text-gray-600')}>
                            {exam.examType}
                          </span>
                        )}
                        {past && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 dark:bg-gray-700 text-gray-500">Done</span>}
                      </div>
                      <div className="text-sm text-muted">{exam.subject?.name} · {exam.totalMarks} marks</div>
                      {exam.venue && <div className="text-xs text-muted/70 mt-0.5">📍 {exam.venue}</div>}
                    </div>
                    {!past && diff !== null && (
                      <span className={'text-xs font-bold px-3 py-1.5 rounded-full ' +
                        (diff <= 0 ? 'bg-red-100 text-red-600' : diff <= 3 ? 'bg-red-100 text-red-600' : diff <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                        {diff === 0 ? 'Today!' : `In ${diff}d`}
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ════════════════════ ASSIGNMENTS ════════════════════ */}
      {tab === 'assignments' && (
        <div className="space-y-3">
          {!assignments.length ? <EmptyState icon="📋" title="No assignments found" /> : (
            <>
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-accent">{dueAssignments.length}</div>
                  <div className="text-xs text-muted mt-1">⏳ Pending</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-muted">{assignments.length - dueAssignments.length}</div>
                  <div className="text-xs text-muted mt-1">✅ Past</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="font-display text-3xl text-ink dark:text-white">{assignments.length}</div>
                  <div className="text-xs text-muted mt-1">📋 Total</div>
                </div>
              </div>
              {assignments.map(a => {
                const due    = a.dueDate ? new Date(a.dueDate) : null;
                const isOver = due && due < new Date();
                const diff   = due ? Math.ceil((due - new Date()) / 86400000) : null;
                const teacherName = a.teacher?.user?.name;
                return (
                  <div key={a._id} className={'card px-6 py-5 flex items-start gap-5 transition-colors ' +
                    (a.submitted ? 'border-green-200 dark:border-green-800/40' :
                     isOver ? 'border-red-200 dark:border-red-800/40' : 'hover:border-accent/30')}>
                    <div className={'w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ' +
                      (a.submitted ? 'bg-green-100 dark:bg-green-900/30' :
                       isOver ? 'bg-red-100 dark:bg-red-900/20' : 'bg-accent/10')}>
                      {a.submitted ? '✅' : isOver ? '⚠️' : '📋'}
                    </div>
                    <div className="flex-1">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="font-semibold text-ink dark:text-white">{a.title}</span>
                        {a.subject?.name && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/30 text-blue-700">
                            {a.subject.name}
                          </span>
                        )}
                        {a.submitted && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700">
                            ✓ Submitted
                          </span>
                        )}
                        {isOver && !a.submitted && (
                          <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">
                            Overdue
                          </span>
                        )}
                      </div>
                      {a.description && <p className="text-sm text-muted line-clamp-2">{a.description}</p>}
                      <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted">
                        {due && <span>📅 Due: <strong className={isOver && !a.submitted ? 'text-red-500' : 'text-ink dark:text-white'}>{due.toLocaleDateString('en-IN')}</strong></span>}
                        {a.totalMarks && <span>⭐ {a.totalMarks} marks</span>}
                        {teacherName && <span>👨‍🏫 {teacherName}</span>}
                        {a.mySubmission?.marksObtained != null && (
                          <span className="font-bold text-green-600">🏆 Marks: {a.mySubmission.marksObtained}/{a.totalMarks}</span>
                        )}
                      </div>
                    </div>
                    {!a.submitted && !isOver && diff !== null && (
                      <span className={'text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ' +
                        (diff <= 1 ? 'bg-red-100 text-red-600' : diff <= 3 ? 'bg-amber-100 text-amber-700' : 'bg-blue-100 text-blue-700')}>
                        {diff <= 0 ? 'Due today!' : `${diff}d left`}
                      </span>
                    )}
                    {a.submitted && a.mySubmission?.status === 'graded' && (
                      <span className="text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 bg-green-100 text-green-700">
                        Graded
                      </span>
                    )}
                  </div>
                );
              })}
            </>
          )}
        </div>
      )}

      {/* ════════════════════ FEES ════════════════════ */}
      {tab === 'fees' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <div className="font-display text-2xl text-sage">
                ₹{fees.filter(f=>f.status==='paid').reduce((s,f)=>s+(f.paidAmount||f.totalAmount||0),0).toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-muted mt-1">✅ Paid</div>
            </div>
            <div className="card p-5 text-center">
              <div className="font-display text-2xl text-amber-500">
                ₹{pendingFees.reduce((s,f)=>s+(f.dueAmount||f.totalAmount||0),0).toLocaleString('en-IN')}
              </div>
              <div className="text-xs text-muted mt-1">⏳ Pending</div>
            </div>
            <div className="card p-5 text-center">
              <div className="font-display text-2xl text-ink dark:text-white">{fees.length}</div>
              <div className="text-xs text-muted mt-1">📋 Total Records</div>
            </div>
          </div>

          {pendingFees.length > 0 && (
            <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 flex items-center gap-3">
              <span className="text-2xl flex-shrink-0">⚠️</span>
              <div>
                <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm">
                  {pendingFees.length} Payment{pendingFees.length > 1 ? 's' : ''} Pending
                </p>
                <p className="text-xs text-amber-600 dark:text-amber-400 mt-0.5">
                  Please visit the school office to clear dues and avoid penalties.
                </p>
              </div>
            </div>
          )}

          <div className="card overflow-hidden">
            <CardHeader title="Fee Records" subtitle={`Academic year ${new Date().getFullYear()}`} />
            {!fees.length ? <EmptyState icon="💰" title="No fee records" /> : (
              <div className="divide-y divide-border dark:divide-gray-700">
                {fees.map((f, i) => (
                  <div key={f._id || i} className="px-6 py-4 flex items-center gap-4 hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors">
                    <div className={'w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ' +
                      (f.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30' :
                       f.status === 'partial' ? 'bg-blue-100 dark:bg-blue-900/30' : 'bg-amber-100 dark:bg-amber-900/30')}>
                      {f.status === 'paid' ? '✅' : f.status === 'partial' ? '🔵' : '⏳'}
                    </div>
                    <div className="flex-1">
                      <p className="font-semibold text-sm text-ink dark:text-white">
                        {f.month ? `${f.month} ${f.year || ''}` : f.feeType || 'Fee Record'}
                      </p>
                      <p className="text-xs text-muted">
                        {f.status === 'paid'
                          ? `Paid: ${f.paymentDate ? new Date(f.paymentDate).toLocaleDateString('en-IN') : '—'}`
                          : f.dueDate ? `Due: ${new Date(f.dueDate).toLocaleDateString('en-IN')}` : '—'}
                      </p>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-sm text-ink dark:text-white">
                        ₹{(f.totalAmount || f.amount || 0).toLocaleString('en-IN')}
                      </div>
                      <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' +
                        (f.status === 'paid' ? 'bg-green-100 text-green-700' :
                         f.status === 'partial' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
                        {f.status}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ════════════════════ TRANSPORT ════════════════════ */}
      {tab === 'transport' && (
        <div className="space-y-4">
          {!transport ? (
            <EmptyState icon="🚌" title="No transport assigned"
              subtitle="You are not assigned to any transport route. Contact the school office for details." />
          ) : (
            <>
              <div className="card p-6">
                <div className="flex items-center gap-4 mb-6">
                  <div className="w-16 h-16 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-4xl flex-shrink-0">🚌</div>
                  <div>
                    <h3 className="font-bold text-xl text-ink dark:text-white">
                      {transport.routeName || transport.route?.name || 'Assigned Route'}
                    </h3>
                    <p className="text-sm text-muted">{transport.vehicleNumber || 'Vehicle assigned'}</p>
                  </div>
                  <span className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300">Active</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { icon: '🧑‍✈️', label: 'Driver',       value: transport.driverName },
                    { icon: '📞', label: 'Driver Phone',  value: transport.driverPhone },
                    { icon: '📍', label: 'My Stop',       value: transport.stopName || transport.stop },
                    { icon: '🌅', label: 'Pickup Time',   value: transport.pickupTime },
                    { icon: '🌆', label: 'Drop Time',     value: transport.dropTime },
                    { icon: '🚐', label: 'Vehicle No.',   value: transport.vehicleNumber },
                  ].filter(i => i.value).map(item => (
                    <div key={item.label} className="bg-warm dark:bg-gray-800 rounded-xl p-4">
                      <p className="text-xs text-muted mb-1">{item.icon} {item.label}</p>
                      <p className="font-semibold text-sm text-ink dark:text-white">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
              <div className="card p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200">
                <p className="font-semibold text-blue-700 dark:text-blue-300 text-sm">🔔 Reminder</p>
                <p className="text-xs text-blue-600 dark:text-blue-400 mt-1">
                  Be at your stop 5 minutes before pickup time. Contact the driver for any schedule changes.
                </p>
              </div>
            </>
          )}
        </div>
      )}

    </div>
  );
}