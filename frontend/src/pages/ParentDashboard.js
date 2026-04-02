// frontend/src/pages/ParentDashboard.js
// Complete Parent Portal — monitors child's data, same UI style as admin
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI, examAPI, notificationAPI } from '../utils/api';
import { LoadingState, EmptyState, Avatar } from '../components/ui';

// ─── Ring chart ───────────────────────────────────────────────────────────────
function Ring({ pct, size = 72, stroke = 7, color }) {
  const r   = (size - stroke) / 2;
  const c   = 2 * Math.PI * r;
  const col = color || (pct >= 75 ? '#4a7c59' : pct >= 50 ? '#c9a84c' : '#d4522a');
  return (
    <div className="relative flex-shrink-0" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round"
          style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color: col }}>{pct}%</span>
      </div>
    </div>
  );
}

function SectionHeader({ title, action, onAction }) {
  return (
    <div className="flex items-center justify-between px-5 py-4 border-b border-border dark:border-gray-700">
      <h3 className="font-semibold text-ink dark:text-white">{title}</h3>
      {action && <button onClick={onAction} className="text-xs text-accent hover:underline font-medium">{action}</button>}
    </div>
  );
}

const TABS = [
  { id: 'overview',   label: 'Overview',   icon: '🏠' },
  { id: 'attendance', label: 'Attendance', icon: '📅' },
  { id: 'exams',      label: 'Exams',      icon: '📝' },
  { id: 'fees',       label: 'Fees',       icon: '💰' },
  { id: 'transport',  label: 'Transport',  icon: '🚌' },
  { id: 'contact',    label: 'Contact',    icon: '📞' },
];

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [tab,         setTab]         = useState('overview');
  const [children,    setChildren]    = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [exams,       setExams]       = useState([]);
  const [notifs,      setNotifs]      = useState([]);
  const [loading,     setLoading]     = useState(true);

  // Mock data per child
  const attendance = { present: 76, total: 90, records: Array.from({ length: 30 }, (_, i) => ({ day: i+1, status: Math.random() > 0.16 ? 'present' : 'absent' })) };
  const fees = [
    { _id: '1', month: 'April 2026',  amount: 3500, status: 'paid',    paidDate: '2026-04-01' },
    { _id: '2', month: 'March 2026',  amount: 3500, status: 'paid',    paidDate: '2026-03-02' },
    { _id: '3', month: 'May 2026',    amount: 3500, status: 'pending', dueDate:  '2026-05-10' },
  ];
  const transport = { routeName: 'Route A – Kothrud', vehicleNumber: 'MH12 AB 1234', driverName: 'Ramesh Kumar', driverPhone: '9876543210', pickupTime: '7:15 AM', dropTime: '2:00 PM', stopName: 'Karve Nagar' };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, eRes, nRes] = await Promise.allSettled([
        studentAPI.getAll(),
        examAPI.getAll(),
        notificationAPI.getAll(),
      ]);
      const kids = sRes.status === 'fulfilled' ? (sRes.value.data.data || []).slice(0, 3) : [];
      setChildren(kids);
      if (kids.length) setSelected(kids[0]);
      if (eRes.status === 'fulfilled') setExams(eRes.value.data.data || []);
      if (nRes.status === 'fulfilled') setNotifs(nRes.value.data.data || []);
    } catch {}
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  if (loading) return <LoadingState />;

  const attPct      = Math.round((attendance.present / attendance.total) * 100);
  const upcoming    = exams.filter(e => e.date && new Date(e.date) >= new Date());
  const pendingFees = fees.filter(f => f.status !== 'paid');

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div>
        <h1 className="font-display text-2xl text-ink dark:text-white">Parent Dashboard 👨‍👩‍👧</h1>
        <p className="text-sm text-muted mt-0.5">Monitor your child's progress and activities.</p>
      </div>

      {/* Child selector */}
      {children.length > 0 && (
        <div>
          <p className="text-xs font-bold text-muted uppercase tracking-widest mb-3">Your Children</p>
          <div className="flex gap-3 flex-wrap">
            {children.map(child => (
              <button key={child._id} onClick={() => setSelected(child)}
                className={'flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ' +
                  (selected?._id === child._id ? 'border-accent bg-accent/5 dark:bg-accent/10' : 'border-border bg-white dark:bg-gray-800 hover:border-accent/40')}>
                <Avatar name={child.user?.name} size="sm" />
                <div className="text-left">
                  <div className={'text-sm font-semibold ' + (selected?._id === child._id ? 'text-accent' : 'text-ink dark:text-white')}>{child.user?.name}</div>
                  <div className="text-xs text-muted">{child.class?.name} {child.class?.section} · Roll {child.rollNumber || '—'}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!selected ? (
        <div className="card py-20 text-center">
          <div className="text-5xl mb-4">👨‍👩‍👧</div>
          <div className="font-semibold text-ink dark:text-white">No children linked to your account</div>
          <div className="text-muted text-sm mt-2">Please contact the school administration.</div>
        </div>
      ) : (
        <>
          {/* Quick stats */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            {[
              { icon: '📅', label: 'Attendance',     value: `${attPct}%`,            sub: `${attendance.present}/${attendance.total} days`, color: attPct >= 75 ? 'bg-green-50 dark:bg-green-900/20 text-green-700' : 'bg-red-50 dark:bg-red-900/20 text-red-600' },
              { icon: '📝', label: 'Upcoming Exams', value: upcoming.length,         sub: 'Scheduled',                                      color: 'bg-amber-50 dark:bg-amber-900/20 text-amber-700' },
              { icon: '💰', label: 'Fees Paid',      value: fees.filter(f=>f.status==='paid').length, sub: `${pendingFees.length} pending`, color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-700' },
              { icon: '⚠️', label: 'Pending Fees',   value: pendingFees.length === 0 ? '✅ Clear' : `${pendingFees.length}`, sub: pendingFees.length === 0 ? 'All paid' : 'Action needed', color: pendingFees.length > 0 ? 'bg-red-50 dark:bg-red-900/20 text-red-600' : 'bg-green-50 dark:bg-green-900/20 text-green-700' },
            ].map(s => (
              <div key={s.label} className="card p-4 flex items-center gap-3">
                <div className={`w-11 h-11 rounded-xl flex items-center justify-center text-xl ${s.color}`}>{s.icon}</div>
                <div>
                  <div className="font-display text-2xl text-ink dark:text-white">{s.value}</div>
                  <div className="text-xs text-muted">{s.label}</div>
                  <div className="text-[10px] text-muted/70">{s.sub}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Tabs */}
          <div className="flex gap-1 p-1 rounded-2xl border border-border bg-warm dark:bg-gray-800 overflow-x-auto">
            {TABS.map(t => (
              <button key={t.id} onClick={() => setTab(t.id)}
                className={'flex items-center gap-1.5 px-3 py-2 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ' +
                  (tab === t.id ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>

          {/* OVERVIEW */}
          {tab === 'overview' && (
            <div className="grid xl:grid-cols-3 gap-5">
              {/* Attendance */}
              <div className="card p-6">
                <h3 className="font-semibold text-ink dark:text-white mb-4">Attendance This Month</h3>
                <div className="flex items-center gap-5">
                  <Ring pct={attPct} size={80} stroke={8} />
                  <div className="flex-1">
                    <div className="h-2.5 bg-warm dark:bg-gray-700 rounded-full overflow-hidden mb-2">
                      <div className="h-full bg-green-500 rounded-full transition-all" style={{ width: `${attPct}%` }} />
                    </div>
                    <div className="flex justify-between text-xs text-muted">
                      <span>✅ {attendance.present} present</span>
                      <span>❌ {attendance.total - attendance.present} absent</span>
                    </div>
                    {attPct < 75 && (
                      <div className="mt-3 p-2.5 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200">
                        <p className="text-xs text-red-600 font-medium">⚠️ {selected.user?.name}'s attendance is below 75%</p>
                      </div>
                    )}
                  </div>
                </div>
              </div>

              {/* Upcoming exams */}
              <div className="card overflow-hidden">
                <SectionHeader title="Upcoming Exams" action="See all" onAction={() => setTab('exams')} />
                {!upcoming.length ? <EmptyState icon="📝" title="No upcoming exams" /> : (
                  <div className="divide-y divide-border dark:divide-gray-700">
                    {upcoming.slice(0, 4).map(exam => {
                      const d    = new Date(exam.date);
                      const diff = Math.ceil((d - new Date()) / 86400000);
                      return (
                        <div key={exam._id} className="flex items-center gap-3 px-5 py-3 hover:bg-warm/40 dark:hover:bg-gray-800/50">
                          <div className="w-10 h-10 rounded-xl bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                            <div className="text-xs font-bold text-ink dark:text-white">{d.getDate()}</div>
                            <div className="text-[9px] text-muted uppercase">{d.toLocaleString('default', { month: 'short' })}</div>
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-ink dark:text-white truncate">{exam.name}</div>
                            <div className="text-xs text-muted">{exam.subject?.name} · {exam.totalMarks} marks</div>
                          </div>
                          <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (diff <= 3 ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700')}>
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
                <SectionHeader title="School Notifications" action="View all" onAction={() => navigate('/notifications')} />
                {!notifs.length ? <EmptyState icon="🔔" title="No notifications" /> : (
                  <div className="divide-y divide-border dark:divide-gray-700">
                    {notifs.slice(0, 5).map(n => (
                      <div key={n._id} className="px-5 py-3 hover:bg-warm/40 dark:hover:bg-gray-800/50">
                        <p className="text-sm font-medium text-ink dark:text-white">{n.title}</p>
                        <p className="text-xs text-muted line-clamp-1">{n.message}</p>
                        <p className="text-[10px] text-muted mt-0.5">{new Date(n.createdAt).toLocaleDateString('en-IN')}</p>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          )}

          {/* ATTENDANCE */}
          {tab === 'attendance' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5 text-center"><div className="text-3xl font-display text-green-600">{attendance.present}</div><div className="text-xs text-muted mt-1">✅ Present</div></div>
                <div className="card p-5 text-center"><div className="text-3xl font-display text-red-500">{attendance.total - attendance.present}</div><div className="text-xs text-muted mt-1">❌ Absent</div></div>
                <div className="card p-5 text-center flex flex-col items-center gap-1"><Ring pct={attPct} size={64} stroke={6} /><div className="text-xs text-muted">Percentage</div></div>
              </div>
              {attPct < 75 && (
                <div className="p-4 rounded-2xl bg-red-50 dark:bg-red-900/20 border border-red-200">
                  <p className="font-semibold text-red-700">⚠️ Attendance Warning</p>
                  <p className="text-sm text-red-600 mt-1">{selected.user?.name}'s attendance is {attPct}%. Minimum 75% required. Please ensure regular school attendance.</p>
                </div>
              )}
              <div className="card p-5">
                <h3 className="font-semibold text-ink dark:text-white mb-4">Monthly Calendar</h3>
                <div className="grid grid-cols-7 gap-1.5">
                  {['S','M','T','W','T','F','S'].map((d,i) => <div key={i} className="text-center text-[10px] text-muted font-bold">{d}</div>)}
                  {Array.from({ length: new Date(new Date().getFullYear(), new Date().getMonth(), 1).getDay() }).map((_,i) => <div key={'e'+i} />)}
                  {attendance.records.map((r, i) => (
                    <div key={i} className={'w-8 h-8 rounded-lg mx-auto flex items-center justify-center text-[11px] font-bold ' +
                      (r.status === 'present' ? 'bg-green-100 dark:bg-green-900/40 text-green-700' : 'bg-red-100 dark:bg-red-900/40 text-red-600')}>
                      {r.day}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* EXAMS */}
          {tab === 'exams' && (
            <div className="space-y-3">
              {!exams.length ? <EmptyState icon="📝" title="No exams found" /> :
                exams.map(exam => {
                  const d    = exam.date ? new Date(exam.date) : null;
                  const past = d && d < new Date();
                  const diff = d ? Math.ceil((d - new Date()) / 86400000) : null;
                  const typeColors = { unit:'bg-amber-100 text-amber-700', midterm:'bg-red-100 text-red-700', final:'bg-purple-100 text-purple-700', practical:'bg-green-100 text-green-700' };
                  return (
                    <div key={exam._id} className="card px-5 py-4 flex items-center gap-5">
                      <div className="w-14 h-14 rounded-xl bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                        <div className="font-bold text-ink dark:text-white">{d?.getDate() || '—'}</div>
                        <div className="text-[9px] text-muted uppercase">{d?.toLocaleString('default', { month: 'short' }) || ''}</div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 flex-wrap mb-1">
                          <span className="font-semibold text-ink dark:text-white">{exam.name}</span>
                          <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (typeColors[exam.examType] || 'bg-gray-100 text-gray-600')}>{exam.examType}</span>
                          {past && <span className="text-[10px] px-2 py-0.5 rounded-full bg-gray-100 text-gray-500">Completed</span>}
                        </div>
                        <div className="text-sm text-muted">{exam.subject?.name} · Total: {exam.totalMarks} marks</div>
                      </div>
                      {!past && diff !== null && (
                        <span className={'text-xs font-bold px-3 py-1 rounded-full ' + (diff <= 3 ? 'bg-red-100 text-red-600' : diff <= 7 ? 'bg-amber-100 text-amber-700' : 'bg-green-100 text-green-700')}>
                          {diff === 0 ? 'Today' : `In ${diff}d`}
                        </span>
                      )}
                    </div>
                  );
                })}
            </div>
          )}

          {/* FEES */}
          {tab === 'fees' && (
            <div className="space-y-4">
              <div className="grid grid-cols-3 gap-4">
                <div className="card p-5 text-center"><div className="text-2xl font-display text-green-600">₹{fees.filter(f=>f.status==='paid').reduce((s,f)=>s+(f.amount||0),0).toLocaleString('en-IN')}</div><div className="text-xs text-muted mt-1">✅ Paid</div></div>
                <div className="card p-5 text-center"><div className="text-2xl font-display text-amber-500">₹{pendingFees.reduce((s,f)=>s+(f.amount||0),0).toLocaleString('en-IN')}</div><div className="text-xs text-muted mt-1">⏳ Pending</div></div>
                <div className="card p-5 text-center"><div className="text-2xl font-display text-ink dark:text-white">{fees.length}</div><div className="text-xs text-muted mt-1">📋 Total</div></div>
              </div>
              <div className="card overflow-hidden">
                <SectionHeader title="Fee Records" />
                <div className="divide-y divide-border dark:divide-gray-700">
                  {fees.map(f => (
                    <div key={f._id} className="px-5 py-4 flex items-center gap-4 hover:bg-warm/40 dark:hover:bg-gray-800/50">
                      <div className={'w-10 h-10 rounded-xl flex items-center justify-center text-lg flex-shrink-0 ' + (f.status === 'paid' ? 'bg-green-100 dark:bg-green-900/30' : 'bg-amber-100 dark:bg-amber-900/30')}>
                        {f.status === 'paid' ? '✅' : '⏳'}
                      </div>
                      <div className="flex-1">
                        <p className="font-semibold text-sm text-ink dark:text-white">{f.month}</p>
                        <p className="text-xs text-muted">{f.status === 'paid' ? `Paid: ${new Date(f.paidDate).toLocaleDateString('en-IN')}` : `Due: ${new Date(f.dueDate).toLocaleDateString('en-IN')}`}</p>
                      </div>
                      <div className="text-right">
                        <div className="font-bold text-ink dark:text-white">₹{(f.amount||0).toLocaleString('en-IN')}</div>
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (f.status === 'paid' ? 'bg-green-100 text-green-700' : 'bg-amber-100 text-amber-700')}>{f.status}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              {pendingFees.length > 0 && (
                <div className="card p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 flex items-center gap-3">
                  <span className="text-2xl">⚠️</span>
                  <div>
                    <p className="font-semibold text-amber-700 dark:text-amber-300 text-sm">{pendingFees.length} Fee Payment{pendingFees.length > 1 ? 's' : ''} Pending</p>
                    <p className="text-xs text-amber-600 dark:text-amber-400">Please visit the school office or pay online to avoid late fees.</p>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TRANSPORT */}
          {tab === 'transport' && (
            <div className="space-y-4">
              <div className="card p-6">
                <div className="flex items-center gap-4 mb-5">
                  <div className="w-14 h-14 rounded-2xl bg-blue-100 dark:bg-blue-900/30 flex items-center justify-center text-3xl">🚌</div>
                  <div>
                    <h3 className="font-bold text-lg text-ink dark:text-white">{transport.routeName}</h3>
                    <p className="text-sm text-muted">{transport.vehicleNumber}</p>
                  </div>
                  <span className="ml-auto text-xs font-semibold px-3 py-1.5 rounded-full bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-300">Active</span>
                </div>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-4">
                  {[
                    { icon: '🧑‍✈️', label: 'Driver',      value: transport.driverName },
                    { icon: '📞', label: 'Driver Phone', value: transport.driverPhone },
                    { icon: '📍', label: 'Child\'s Stop', value: transport.stopName },
                    { icon: '🌅', label: 'Pickup Time',  value: transport.pickupTime },
                    { icon: '🌆', label: 'Drop Time',    value: transport.dropTime },
                  ].map(item => (
                    <div key={item.label} className="bg-warm dark:bg-gray-800 rounded-xl p-3">
                      <p className="text-xs text-muted">{item.icon} {item.label}</p>
                      <p className="font-semibold text-sm text-ink dark:text-white mt-0.5">{item.value}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* CONTACT */}
          {tab === 'contact' && (
            <div className="space-y-4">
              <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {[
                  { icon: '📞', label: 'Call School Office',  sub: '+91 98765 43210',             action: () => {} },
                  { icon: '✉️', label: 'Email Administration', sub: 'info@futurestepschool.in',   action: () => {} },
                  { icon: '💬', label: 'Message Class Teacher', sub: 'Send via notifications',    action: () => navigate('/notifications') },
                  { icon: '🏫', label: 'School Address',       sub: 'Bhaler, Maharashtra',        action: () => {} },
                  { icon: '🚨', label: 'Emergency Contact',    sub: '+91 98765 00000',             action: () => {} },
                  { icon: '📅', label: 'Schedule Meeting',     sub: 'Book a parent-teacher meet', action: () => {} },
                ].map(c => (
                  <button key={c.label} onClick={c.action}
                    className="card p-5 text-left hover:-translate-y-0.5 transition-all hover:border-accent/40 border border-border">
                    <div className="text-3xl mb-3">{c.icon}</div>
                    <div className="font-semibold text-sm text-ink dark:text-white">{c.label}</div>
                    <div className="text-xs text-muted mt-0.5">{c.sub}</div>
                  </button>
                ))}
              </div>
              <div className="card p-5">
                <h3 className="font-semibold text-ink dark:text-white mb-3">School Hours</h3>
                <div className="grid grid-cols-2 gap-3 text-sm">
                  {[
                    { day: 'Monday – Friday', time: '8:00 AM – 3:00 PM' },
                    { day: 'Saturday',        time: '8:00 AM – 1:00 PM' },
                    { day: 'Office Hours',    time: '9:00 AM – 5:00 PM' },
                    { day: 'Sunday',          time: 'Closed' },
                  ].map(h => (
                    <div key={h.day} className="bg-warm dark:bg-gray-800 rounded-xl p-3">
                      <p className="text-xs text-muted">{h.day}</p>
                      <p className="font-semibold text-ink dark:text-white">{h.time}</p>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}