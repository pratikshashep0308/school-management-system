import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { studentAPI, attendanceAPI, examAPI, feeAPI } from '../utils/api';
import { LoadingState, Badge, Avatar } from '../components/ui';

export default function ParentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [children, setChildren] = useState([]);
  const [selectedChild, setSelectedChild] = useState(null);
  const [childData, setChildData] = useState({ exams: [], fees: [], attendance: { present: 0, total: 0 } });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    studentAPI.getAll()
      .then(r => {
        const kids = r.data.data.slice(0, 3); // In real app, filter by parent userId
        setChildren(kids);
        if (kids.length > 0) setSelectedChild(kids[0]);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => {
    if (!selectedChild) return;
    Promise.all([
      examAPI.getAll().catch(() => ({ data: { data: [] } })),
      feeAPI.getPayments().catch(() => ({ data: { data: [] } })),
    ]).then(([eRes, fRes]) => {
      setChildData({
        exams: eRes.data.data.slice(0, 5),
        fees: fRes.data.data.slice(0, 5),
        attendance: { present: 78, total: 88 },
      });
    });
  }, [selectedChild]);

  if (loading) return <LoadingState />;

  const attPct = childData.attendance.total > 0
    ? Math.round((childData.attendance.present / childData.attendance.total) * 100) : 0;
  const pendingFees = childData.fees.filter(f => f.status === 'pending' || f.status === 'overdue');
  const paidFees = childData.fees.filter(f => f.status === 'paid');

  return (
    <div className="animate-fade-in">
      {/* Welcome */}
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink">Parent Dashboard 👨‍👩‍👧</h1>
        <p className="text-sm text-muted mt-1">Monitor your child's academic progress and activities.</p>
      </div>

      {/* Child selector */}
      {children.length > 0 && (
        <div className="mb-6">
          <div className="text-xs font-semibold uppercase tracking-widest text-muted mb-3">Your Children</div>
          <div className="flex gap-3 flex-wrap">
            {children.map(child => (
              <button
                key={child._id}
                onClick={() => setSelectedChild(child)}
                className={`flex items-center gap-3 px-4 py-3 rounded-2xl border-2 transition-all ${selectedChild?._id === child._id ? 'border-accent bg-accent/5' : 'border-border bg-white hover:border-accent/40'}`}
              >
                <Avatar name={child.user?.name} size="sm" />
                <div className="text-left">
                  <div className={`text-sm font-semibold ${selectedChild?._id === child._id ? 'text-accent' : 'text-ink'}`}>{child.user?.name}</div>
                  <div className="text-xs text-muted">{child.class?.name} – {child.class?.section} · Roll {child.rollNumber}</div>
                </div>
              </button>
            ))}
          </div>
        </div>
      )}

      {!selectedChild ? (
        <div className="card py-20 text-center">
          <div className="text-5xl mb-4">👨‍👩‍👧</div>
          <div className="text-ink font-semibold">No children linked to your account</div>
          <div className="text-muted text-sm mt-2">Please contact the school administration.</div>
        </div>
      ) : (
        <>
          {/* Stats */}
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              { icon: '✓', label: 'Attendance', value: `${attPct}%`, sub: `${childData.attendance.present}/${childData.attendance.total} days`, color: attPct >= 75 ? '#4a7c59' : '#d4522a' },
              { icon: '📝', label: 'Exams This Month', value: childData.exams.length, sub: 'Scheduled', color: '#c9a84c' },
              { icon: '₹', label: 'Fees Paid', value: paidFees.length, sub: `${pendingFees.length} pending`, color: '#4a7c59' },
              { icon: '⚠️', label: 'Pending Fees', value: pendingFees.length, sub: pendingFees.length === 0 ? 'All clear' : 'Action needed', color: pendingFees.length > 0 ? '#d4522a' : '#4a7c59' },
            ].map(s => (
              <div key={s.label} className="card p-5 hover:-translate-y-0.5 transition-transform">
                <div className="text-2xl mb-3">{s.icon}</div>
                <div className="font-display text-3xl leading-none mb-0.5" style={{ color: s.color }}>{s.value}</div>
                <div className="text-xs text-muted mt-1">{s.label}</div>
                <div className="text-[11px] text-muted/70">{s.sub}</div>
              </div>
            ))}
          </div>

          {/* Attendance progress */}
          <div className="card p-6 mb-5">
            <div className="flex items-center justify-between mb-4">
              <div className="font-semibold text-ink">Attendance This Term</div>
              <span className={`text-sm font-bold px-3 py-1 rounded-full ${attPct >= 75 ? 'bg-sage/10 text-sage' : 'bg-accent/10 text-accent'}`}>{attPct}%</span>
            </div>
            <div className="h-3 bg-warm rounded-full overflow-hidden mb-3">
              <div className="h-full bg-sage rounded-full transition-all duration-1000" style={{ width: `${attPct}%` }} />
            </div>
            <div className="flex justify-between text-xs text-muted">
              <span>{childData.attendance.present} days present</span>
              <span>{childData.attendance.total - childData.attendance.present} days absent</span>
              <span>{childData.attendance.total} total school days</span>
            </div>
            {attPct < 75 && (
              <div className="mt-3 p-3 rounded-xl bg-accent/10 border border-accent/20">
                <p className="text-sm text-accent font-medium">⚠️ {selectedChild.user?.name}'s attendance is below the 75% requirement. Please ensure regular attendance.</p>
              </div>
            )}
          </div>

          <div className="grid xl:grid-cols-2 gap-5">
            {/* Upcoming exams */}
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="font-semibold text-ink">Upcoming Exams</div>
                <button onClick={() => navigate('/exams')} className="text-xs text-accent hover:underline">View all</button>
              </div>
              {!childData.exams.length ? (
                <div className="py-10 text-center text-muted text-sm">No upcoming exams</div>
              ) : childData.exams.slice(0, 4).map(exam => {
                const d = exam.date ? new Date(exam.date) : null;
                return (
                  <div key={exam._id} className="flex items-center gap-3 px-5 py-3 border-t border-border hover:bg-warm/40 transition-colors">
                    <div className="w-9 h-9 rounded-lg bg-warm flex flex-col items-center justify-center flex-shrink-0">
                      <div className="text-xs font-bold text-ink">{d?.getDate()}</div>
                      <div className="text-[9px] text-muted uppercase">{d?.toLocaleString('default', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1">
                      <div className="text-sm font-medium text-ink">{exam.name}</div>
                      <div className="text-xs text-muted">{exam.subject?.name} · {exam.totalMarks} marks</div>
                    </div>
                    <Badge status={exam.examType} />
                  </div>
                );
              })}
            </div>

            {/* Fee history */}
            <div className="card p-0 overflow-hidden">
              <div className="flex items-center justify-between px-5 py-4 border-b border-border">
                <div className="font-semibold text-ink">Fee Payments</div>
                <button onClick={() => navigate('/fees')} className="text-xs text-accent hover:underline">View all</button>
              </div>
              {!childData.fees.length ? (
                <div className="py-10 text-center text-muted text-sm">No fee records</div>
              ) : childData.fees.map(f => (
                <div key={f._id} className="flex items-center gap-3 px-5 py-3 border-t border-border hover:bg-warm/40 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${f.status === 'paid' ? 'bg-sage' : 'bg-accent'}`} />
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{f.month}</div>
                    <div className="text-xs text-muted">₹{f.amount?.toLocaleString('en-IN')} · {f.method?.toUpperCase()}</div>
                  </div>
                  <Badge status={f.status} />
                </div>
              ))}
              {pendingFees.length > 0 && (
                <div className="px-5 py-3 bg-accent/5 border-t border-border">
                  <button onClick={() => navigate('/fees')} className="text-xs text-accent font-semibold hover:underline">
                    ⚠️ {pendingFees.length} payment(s) pending — Click to view
                  </button>
                </div>
              )}
            </div>
          </div>

          {/* Quick contact */}
          <div className="card p-6 mt-5">
            <div className="font-semibold text-ink mb-4">Need Help?</div>
            <div className="grid sm:grid-cols-3 gap-3">
              {[
                { icon: '📞', label: 'Call School', sub: '+91 11 2345 6789', action: () => {} },
                { icon: '✉️', label: 'Email Admin', sub: 'admin@educore.ac.in', action: () => {} },
                { icon: '💬', label: 'Message Teacher', sub: 'Send a message', action: () => navigate('/notifications') },
              ].map(c => (
                <button key={c.label} onClick={c.action} className="card p-4 text-left hover:-translate-y-0.5 transition-all border-border hover:border-accent/40">
                  <div className="text-2xl mb-2">{c.icon}</div>
                  <div className="font-medium text-sm text-ink">{c.label}</div>
                  <div className="text-xs text-muted mt-0.5">{c.sub}</div>
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
