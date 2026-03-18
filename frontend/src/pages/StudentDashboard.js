import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { attendanceAPI, examAPI, assignmentAPI, feeAPI } from '../utils/api';
import { LoadingState, Badge } from '../components/ui';

// Mini donut chart for attendance
function AttendanceDonut({ present, total }) {
  const pct = total > 0 ? Math.round((present / total) * 100) : 0;
  const r = 36, c = 2 * Math.PI * r;
  const dash = (pct / 100) * c;
  const color = pct >= 75 ? '#4a7c59' : pct >= 60 ? '#c9a84c' : '#d4522a';
  return (
    <div className="relative w-24 h-24 flex items-center justify-center">
      <svg className="-rotate-90" width="96" height="96" viewBox="0 0 96 96">
        <circle cx="48" cy="48" r={r} fill="none" stroke="currentColor" strokeWidth="8" className="text-border" />
        <circle cx="48" cy="48" r={r} fill="none" stroke={color} strokeWidth="8"
          strokeDasharray={`${dash} ${c}`} strokeLinecap="round" style={{ transition: 'stroke-dasharray 1s ease' }} />
      </svg>
      <div className="absolute text-center">
        <div className="font-display text-xl text-ink" style={{ color }}>{pct}%</div>
      </div>
    </div>
  );
}

export default function StudentDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [exams, setExams] = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [attendance, setAttendance] = useState({ present: 0, total: 0 });
  const [fees, setFees] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchAll = async () => {
      try {
        const [eRes, aRes, fRes] = await Promise.all([
          examAPI.getAll().catch(() => ({ data: { data: [] } })),
          assignmentAPI.getAll().catch(() => ({ data: { data: [] } })),
          feeAPI.getPayments().catch(() => ({ data: { data: [] } })),
        ]);
        const now = new Date();
        setExams(eRes.data.data.filter(e => e.date && new Date(e.date) >= now).slice(0, 5));
        setAssignments(aRes.data.data.slice(0, 5));
        const allFees = fRes.data.data;
        setFees(allFees.slice(0, 3));
        // Mock attendance (replace with real student attendance API call)
        setAttendance({ present: 78, total: 88 });
      } catch (_) {}
      finally { setLoading(false); }
    };
    fetchAll();
  }, []);

  if (loading) return <LoadingState />;

  const pendingFees = fees.filter(f => f.status === 'pending' || f.status === 'overdue');
  const pendingAssignments = assignments.filter(a => new Date(a.dueDate) >= new Date());

  return (
    <div className="animate-fade-in">
      {/* Welcome */}
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink">
          {new Date().getHours() < 12 ? 'Good morning' : new Date().getHours() < 17 ? 'Good afternoon' : 'Good evening'}, {user?.name?.split(' ')[0]} 👋
        </h1>
        <p className="text-sm text-muted mt-1">Here's your academic overview for today.</p>
      </div>

      {/* Quick stat cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '✓', label: 'Attendance', value: `${Math.round((attendance.present / attendance.total) * 100)}%`, sub: `${attendance.present}/${attendance.total} days`, color: 'text-sage' },
          { icon: '📝', label: 'Upcoming Exams', value: exams.length, sub: 'Scheduled ahead', color: 'text-gold' },
          { icon: '📋', label: 'Assignments Due', value: pendingAssignments.length, sub: 'Active tasks', color: 'text-accent' },
          { icon: '₹', label: 'Fee Status', value: pendingFees.length === 0 ? 'Clear' : `${pendingFees.length} Due`, sub: pendingFees.length === 0 ? 'All paid' : 'Needs attention', color: pendingFees.length === 0 ? 'text-sage' : 'text-accent' },
        ].map(s => (
          <div key={s.label} className="card p-5 relative overflow-hidden hover:-translate-y-0.5 transition-transform">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl mb-3 ${s.color}/10 bg-current`} style={{ backgroundColor: 'transparent' }}>
              <span className="text-2xl">{s.icon}</span>
            </div>
            <div className={`font-display text-3xl ${s.color} leading-none mb-0.5`}>{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
            <div className="text-[11px] text-muted/70">{s.sub}</div>
          </div>
        ))}
      </div>

      <div className="grid xl:grid-cols-3 gap-5 mb-5">
        {/* Attendance card */}
        <div className="card p-6">
          <div className="font-semibold text-ink mb-4">Attendance Overview</div>
          <div className="flex items-center gap-6">
            <AttendanceDonut present={attendance.present} total={attendance.total} />
            <div className="flex-1">
              <div className="space-y-3">
                {[
                  { label: 'Present', value: attendance.present, color: 'bg-sage' },
                  { label: 'Absent', value: attendance.total - attendance.present, color: 'bg-accent' },
                ].map(item => (
                  <div key={item.label}>
                    <div className="flex justify-between text-xs text-muted mb-1">
                      <span>{item.label}</span><span className="font-semibold text-ink">{item.value}</span>
                    </div>
                    <div className="h-1.5 bg-warm rounded-full overflow-hidden">
                      <div className={`h-full ${item.color} rounded-full`} style={{ width: `${(item.value / attendance.total) * 100}%`, transition: 'width 1s ease' }} />
                    </div>
                  </div>
                ))}
              </div>
              {attendance.present / attendance.total < 0.75 && (
                <div className="mt-3 p-2.5 rounded-lg bg-accent/10 border border-accent/20">
                  <p className="text-xs text-accent font-medium">⚠️ Attendance below 75%. Please improve.</p>
                </div>
              )}
            </div>
          </div>
        </div>

        {/* Upcoming exams */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">Upcoming Exams</div>
            <button onClick={() => navigate('/exams')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          {!exams.length ? (
            <div className="py-10 text-center text-muted text-sm">No upcoming exams</div>
          ) : (
            <div className="divide-y divide-border">
              {exams.map(exam => {
                const d = new Date(exam.date);
                const diff = Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24));
                return (
                  <div key={exam._id} className="flex items-center gap-3 px-5 py-3 hover:bg-warm/40 transition-colors">
                    <div className="w-10 h-10 rounded-xl bg-warm flex flex-col items-center justify-center flex-shrink-0">
                      <div className="text-xs font-bold text-ink">{d.getDate()}</div>
                      <div className="text-[9px] text-muted uppercase">{d.toLocaleString('default', { month: 'short' })}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium text-ink truncate">{exam.name}</div>
                      <div className="text-xs text-muted">{exam.subject?.name} · {exam.totalMarks} marks</div>
                    </div>
                    <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${diff <= 3 ? 'bg-accent/10 text-accent' : diff <= 7 ? 'bg-gold/15 text-gold' : 'bg-sage/10 text-sage'}`}>
                      {diff === 0 ? 'Today' : `${diff}d`}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Fee status */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">Fee Status</div>
            <button onClick={() => navigate('/fees')} className="text-xs text-accent hover:underline">View all</button>
          </div>
          {!fees.length ? (
            <div className="py-10 text-center text-muted text-sm">No fee records</div>
          ) : (
            <div className="divide-y divide-border">
              {fees.map(f => (
                <div key={f._id} className="flex items-center gap-3 px-5 py-3 hover:bg-warm/40 transition-colors">
                  <div className="flex-1">
                    <div className="text-sm font-medium text-ink">{f.month}</div>
                    <div className="text-xs text-muted">₹{f.amount?.toLocaleString('en-IN')}</div>
                  </div>
                  <Badge status={f.status} />
                </div>
              ))}
            </div>
          )}
          {pendingFees.length === 0 && fees.length > 0 && (
            <div className="px-5 py-3 bg-sage/5 border-t border-border">
              <p className="text-xs text-sage font-medium">✓ All fees are up to date!</p>
            </div>
          )}
        </div>
      </div>

      {/* Assignments */}
      <div className="card p-0 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="font-semibold text-ink">Active Assignments</div>
          <button onClick={() => navigate('/assignments')} className="text-xs text-accent hover:underline">View all</button>
        </div>
        {!assignments.length ? (
          <div className="py-10 text-center text-muted text-sm">No assignments</div>
        ) : (
          <div className="divide-y divide-border">
            {assignments.map(a => {
              const due = new Date(a.dueDate);
              const diff = Math.ceil((due - new Date()) / (1000 * 60 * 60 * 24));
              const isLate = diff < 0;
              return (
                <div key={a._id} className="flex items-center gap-4 px-5 py-3.5 hover:bg-warm/40 transition-colors">
                  <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isLate ? 'bg-accent' : diff <= 2 ? 'bg-gold' : 'bg-sage'}`} />
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-medium text-ink truncate">{a.title}</div>
                    <div className="text-xs text-muted">{a.subject?.name} · {a.totalMarks} marks</div>
                  </div>
                  <div className={`text-xs font-medium ${isLate ? 'text-accent' : diff <= 2 ? 'text-gold' : 'text-muted'}`}>
                    {isLate ? `${Math.abs(diff)}d overdue` : diff === 0 ? 'Due today' : `Due in ${diff}d`}
                  </div>
                  <button onClick={() => navigate('/assignments')} className="text-xs px-3 py-1.5 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all">Submit</button>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}
