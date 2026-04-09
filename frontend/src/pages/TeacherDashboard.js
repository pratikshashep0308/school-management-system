// frontend/src/pages/TeacherDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { classAPI, attendanceAPI, examAPI, assignmentAPI, studentAPI, teacherAPI, timetableAPI } from '../utils/api';
import { LoadingState, Badge } from '../components/ui';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_COLORS = { Monday:'#d4522a', Tuesday:'#c9a84c', Wednesday:'#4a7c59', Thursday:'#7c6af5', Friday:'#2d9cdb', Saturday:'#f2994a' };
const TODAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

const SUBJECT_COLORS = [
  '#3B82F6','#10B981','#F97316','#8B5CF6',
  '#EF4444','#06B6D4','#F59E0B','#EC4899',
  '#6366F1','#14B8A6','#84CC16','#A855F7',
];

export default function TeacherDashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [classes,      setClasses]      = useState([]);
  const [exams,        setExams]        = useState([]);
  const [assignments,  setAssignments]  = useState([]);
  const [studentCount, setStudentCount] = useState(0);
  const [timetableView,setTimetableView]= useState(null); // { Monday: [...], Tuesday: [...] }
  const [loading,      setLoading]      = useState(true);
  const [ttLoading,    setTtLoading]    = useState(true);

  // Build subject → color map from timetable data
  const [subjectColorMap, setSubjectColorMap] = useState({});

  useEffect(() => {
    Promise.all([
      classAPI.getAll().catch(() => ({ data: { data: [] } })),
      examAPI.getAll().catch(() => ({ data: { data: [] } })),
      assignmentAPI.getAll().catch(() => ({ data: { data: [] } })),
      studentAPI.getAll().catch(() => ({ data: { data: [] } })),
    ]).then(([cRes, eRes, aRes, sRes]) => {
      setClasses(cRes.data.data);
      setExams(eRes.data.data.filter(e => e.date && new Date(e.date) >= new Date()).slice(0, 5));
      setAssignments(aRes.data.data.slice(0, 5));
      setStudentCount(sRes.data.data.length);
    }).finally(() => setLoading(false));
  }, []);

  // Load teacher's personal timetable
  useEffect(() => {
    teacherAPI.getMyProfile()
      .then(r => {
        const tid = r.data?.data?._id;
        if (!tid) { setTtLoading(false); return; }
        return timetableAPI.getTeacher(tid);
      })
      .then(r => {
        if (!r) return;
        const view = r.data?.data || {};
        setTimetableView(view);

        // Build color map from unique subjects in the view
        const seen = {};
        let colorIdx = 0;
        Object.values(view).forEach(daySlots => {
          daySlots.forEach(slot => {
            const sid = slot.subject?._id || slot.subject;
            if (sid && !seen[sid]) {
              seen[sid] = SUBJECT_COLORS[colorIdx % SUBJECT_COLORS.length];
              colorIdx++;
            }
          });
        });
        setSubjectColorMap(seen);
      })
      .catch(() => {})
      .finally(() => setTtLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const totalStudents  = classes.reduce((s, c) => s + (c.students?.length || 0), 0) || studentCount;
  const pendingGrading = assignments.filter(a => a.submissions?.some(s => s.status === 'submitted' && !s.marksObtained));

  // Today's schedule from timetable view
  const todaySlots = timetableView?.[TODAY] || [];

  return (
    <div className="animate-fade-in">
      {/* Welcome */}
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink">Welcome, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted mt-1">Here's your teaching overview for {TODAY}.</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
        {[
          { icon: '🏛', label: 'My Classes',     value: classes.length || '—',       sub: 'Assigned classes',      color: '#d4522a', to: '/classes' },
          { icon: '👤', label: 'Total Students', value: totalStudents || '—',         sub: 'Across all classes',    color: '#c9a84c', to: '/students' },
          { icon: '📝', label: 'Upcoming Exams', value: exams.length,                 sub: 'Scheduled',             color: '#4a7c59', to: '/exams' },
          { icon: '📋', label: 'Needs Grading',  value: pendingGrading.length,        sub: 'Submissions pending',   color: pendingGrading.length > 0 ? '#d4522a' : '#4a7c59', to: '/assignments' },
        ].map(s => (
          <div key={s.label} onClick={() => navigate(s.to)}
            className="card p-5 hover:-translate-y-1 transition-all cursor-pointer hover:shadow-md">
            <div className="text-2xl mb-3">{s.icon}</div>
            <div className="font-display text-3xl leading-none mb-0.5" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
            <div className="text-[11px] text-muted/70">{s.sub}</div>
            <div style={{ fontSize:10, color:s.color, marginTop:5, fontWeight:700, opacity:0.7 }}>View →</div>
          </div>
        ))}
      </div>

      {/* Today's Timetable */}
      <div className="card p-0 overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div>
            <div className="font-semibold text-ink">📅 Today's Schedule</div>
            <div className="text-xs text-muted mt-0.5" style={{ color: DAY_COLORS[TODAY] }}>{TODAY}</div>
          </div>
          <button onClick={() => navigate('/timetable')} className="text-xs text-accent hover:underline">
            Full Timetable →
          </button>
        </div>

        {ttLoading ? (
          <div className="py-8 text-center text-muted text-sm">Loading schedule…</div>
        ) : !todaySlots.length ? (
          <div className="py-8 text-center">
            <div className="text-3xl mb-2">🎉</div>
            <div className="text-sm text-muted font-medium">No classes today</div>
            <div className="text-xs text-muted mt-1">Enjoy your free day!</div>
          </div>
        ) : (
          <div className="divide-y divide-border">
            {todaySlots.map((slot, i) => {
              const subId = slot.subject?._id || slot.subject;
              const color = subjectColorMap[subId] || '#6B7280';
              return (
                <div key={i} className="flex items-center gap-4 px-5 py-3.5 hover:bg-warm/40 transition-colors">
                  {/* Period number */}
                  <div className="w-8 h-8 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0"
                    style={{ background: `${color}20`, color }}>
                    P{slot.periodNumber}
                  </div>
                  {/* Time */}
                  <div className="text-xs text-muted w-24 flex-shrink-0">
                    {slot.startTime} – {slot.endTime}
                  </div>
                  {/* Subject & Class */}
                  <div className="flex-1 min-w-0">
                    <div className="text-sm font-semibold text-ink truncate">
                      {slot.subject?.name || '—'}
                      {slot.isSubstitute && (
                        <span className="ml-2 text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">SUB</span>
                      )}
                    </div>
                    <div className="text-xs text-muted">{slot.className}</div>
                  </div>
                  {/* Room */}
                  {slot.room && (
                    <div className="text-xs text-muted flex-shrink-0">Rm {slot.room}</div>
                  )}
                  {/* Type badge */}
                  <div className="text-[10px] px-2 py-0.5 rounded-full flex-shrink-0"
                    style={{ background: `${color}15`, color }}>
                    {slot.type || 'lecture'}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Weekly Timetable Grid */}
      {timetableView && Object.values(timetableView).some(d => d.length > 0) && (
        <div className="card p-0 overflow-hidden mb-5">
          <div className="px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">🗓 Weekly Schedule</div>
            <div className="text-xs text-muted mt-0.5">All your classes this week</div>
          </div>
          <div className="overflow-x-auto p-4">
            <table className="w-full text-xs min-w-[600px]" style={{ borderCollapse: 'separate', borderSpacing: 3 }}>
              <thead>
                <tr>
                  <th className="text-left p-2 text-muted font-bold w-20">Day</th>
                  {[1,2,3,4,5,6,7,8].map(p => (
                    <th key={p} className="text-center p-2 text-muted font-bold">P{p}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => {
                  const slots = timetableView[day] || [];
                  const slotMap = {};
                  slots.forEach(s => { slotMap[s.periodNumber] = s; });
                  const isToday = day === TODAY;

                  return (
                    <tr key={day}>
                      <td className="p-2" style={{ verticalAlign: 'middle' }}>
                        <div className="font-bold" style={{ color: DAY_COLORS[day], fontSize: 11 }}>
                          {day.slice(0,3).toUpperCase()}
                          {isToday && <span className="ml-1 text-[9px] bg-accent text-white px-1 rounded">TODAY</span>}
                        </div>
                      </td>
                      {[1,2,3,4,5,6,7,8].map(p => {
                        const slot = slotMap[p];
                        const subId = slot?.subject?._id || slot?.subject;
                        const color = subjectColorMap[subId] || '#6B7280';

                        return (
                          <td key={p} style={{ verticalAlign: 'top', minWidth: 90 }}>
                            {slot ? (
                              <div style={{
                                borderRadius: 6, padding: '5px 7px',
                                background: `${color}15`,
                                borderLeft: `3px solid ${color}`,
                              }}>
                                <div style={{ fontWeight: 700, color, fontSize: 11, lineHeight: 1.2 }}>
                                  {slot.subject?.name || '—'}
                                </div>
                                <div style={{ color: '#6B7280', fontSize: 10, marginTop: 2 }}>
                                  {slot.className}
                                </div>
                                {slot.isSubstitute && (
                                  <div style={{ fontSize: 9, fontWeight: 800, color: '#92400E', marginTop: 2 }}>SUB</div>
                                )}
                              </div>
                            ) : (
                              <div style={{
                                borderRadius: 6, padding: '5px 7px',
                                background: '#F9FAFB', border: '1px dashed #E5E7EB',
                                color: '#D1D5DB', textAlign: 'center', fontSize: 12,
                              }}>—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      <div className="grid xl:grid-cols-2 gap-5 mb-5">
        {/* My classes */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">My Classes</div>
            <button onClick={() => navigate('/classes')} className="text-xs text-accent hover:underline">Manage</button>
          </div>
          {!classes.length ? (
            <div className="py-10 text-center text-muted text-sm">No classes assigned yet</div>
          ) : classes.slice(0, 5).map(cls => (
            <div key={cls._id} className="flex items-center gap-4 px-5 py-3.5 border-t border-border hover:bg-warm/40 transition-colors">
              <div className="w-10 h-10 rounded-xl flex items-center justify-center font-bold text-white text-sm flex-shrink-0"
                style={{ background: DAY_COLORS[['Monday','Tuesday','Wednesday','Thursday','Friday'][cls.grade % 5]] || '#d4522a' }}>
                {cls.grade}
              </div>
              <div className="flex-1">
                <div className="font-medium text-sm text-ink">{cls.name} – {cls.section}</div>
                <div className="text-xs text-muted">{cls.students?.length || 0} students · Room {cls.room || 'TBD'}</div>
              </div>
              <button onClick={() => navigate('/attendance')}
                className="text-xs px-3 py-1.5 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all">
                Take Attendance
              </button>
            </div>
          ))}
        </div>

        {/* Upcoming exams */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div className="font-semibold text-ink">Upcoming Exams</div>
            <button onClick={() => navigate('/exams')} className="text-xs text-accent hover:underline">Create exam</button>
          </div>
          {!exams.length ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2">📝</div>
              <div className="text-sm text-muted">No upcoming exams</div>
              <button onClick={() => navigate('/exams')} className="mt-3 text-xs text-accent hover:underline">Create one →</button>
            </div>
          ) : exams.map(exam => {
            const d = exam.date ? new Date(exam.date) : null;
            const diff = d ? Math.ceil((d - new Date()) / (1000 * 60 * 60 * 24)) : null;
            return (
              <div key={exam._id} className="flex items-center gap-3 px-5 py-3.5 border-t border-border hover:bg-warm/40 transition-colors">
                <div className="w-10 h-10 rounded-xl bg-warm flex flex-col items-center justify-center flex-shrink-0">
                  <div className="text-xs font-bold text-ink">{d?.getDate()}</div>
                  <div className="text-[9px] text-muted uppercase">{d?.toLocaleString('default', { month: 'short' })}</div>
                </div>
                <div className="flex-1">
                  <div className="text-sm font-medium text-ink">{exam.name}</div>
                  <div className="text-xs text-muted">{exam.class?.name} · {exam.subject?.name}</div>
                </div>
                {diff !== null && (
                  <div className={`text-xs font-bold px-2 py-0.5 rounded-full ${diff <= 3 ? 'bg-accent/10 text-accent' : 'bg-sage/10 text-sage'}`}>
                    {diff === 0 ? 'Today' : `${diff}d`}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Assignments needing grading */}
      <div className="card p-0 overflow-hidden mb-5">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="font-semibold text-ink">Assignments</div>
          <button onClick={() => navigate('/assignments')} className="text-xs text-accent hover:underline">View all</button>
        </div>
        {!assignments.length ? (
          <div className="py-10 text-center text-muted text-sm">No assignments created yet</div>
        ) : assignments.map(a => {
          const due = new Date(a.dueDate);
          const isPast = due < new Date();
          const subCount = a.submissions?.length || 0;
          return (
            <div key={a._id} className="flex items-center gap-4 px-5 py-3.5 border-t border-border hover:bg-warm/40 transition-colors">
              <div className={`w-2 h-2 rounded-full flex-shrink-0 ${isPast ? 'bg-accent' : 'bg-sage'}`} />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-ink truncate">{a.title}</div>
                <div className="text-xs text-muted">{a.subject?.name} · Due {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</div>
              </div>
              <div className="text-right">
                <div className="text-sm font-semibold text-ink">{subCount}</div>
                <div className="text-xs text-muted">submissions</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Quick actions */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { icon: '✓', label: 'Mark Attendance', to: '/attendance',    color: 'bg-sage/10 text-sage' },
          { icon: '📝', label: 'Create Exam',     to: '/exams',         color: 'bg-gold/15 text-gold' },
          { icon: '📋', label: 'New Assignment',  to: '/assignments',   color: 'bg-accent/10 text-accent' },
          { icon: '🗓', label: 'View Timetable',  to: '/timetable',    color: 'bg-purple-50 text-purple-600' },
        ].map(({ icon, label, to, color }) => (
          <button key={to + label} onClick={() => navigate(to)}
            className="card px-4 py-5 flex flex-col items-center gap-2 hover:-translate-y-0.5 transition-all">
            <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${color}`}>{icon}</div>
            <div className="text-sm font-medium text-ink">{label}</div>
          </button>
        ))}
      </div>
    </div>
  );
}