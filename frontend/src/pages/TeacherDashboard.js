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
          { icon: '🏛', label: 'My Classes',     value: classes.length || '—',       sub: 'Assigned classes',      color: '#d4522a' },
          { icon: '👤', label: 'Total Students', value: totalStudents || '—',         sub: 'Across all classes',    color: '#c9a84c' },
          { icon: '📝', label: 'Upcoming Exams', value: exams.length,                 sub: 'Scheduled',             color: '#4a7c59' },
          { icon: '📋', label: 'Needs Grading',  value: pendingGrading.length,        sub: 'Submissions pending',   color: pendingGrading.length > 0 ? '#d4522a' : '#4a7c59' },
        ].map(s => (
          <div key={s.label} className="card p-5 hover:-translate-y-0.5 transition-transform">
            <div className="text-2xl mb-3">{s.icon}</div>
            <div className="font-display text-3xl leading-none mb-0.5" style={{ color: s.color }}>{s.value}</div>
            <div className="text-xs text-muted mt-1">{s.label}</div>
            <div className="text-[11px] text-muted/70">{s.sub}</div>
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

        {/* Upcoming exams — full timetable */}
        <div className="card p-0 overflow-hidden">
          <div className="flex items-center justify-between px-5 py-4 border-b border-border">
            <div>
              <div className="font-semibold text-ink">Upcoming Exams</div>
              <div className="text-xs text-muted mt-0.5">All classes · {exams.length} exams</div>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center' }}>
              {exams.length > 0 && (
                <button onClick={async () => {
                  try {
                    if (!window.jspdf || !window.jspdf.jsPDF.prototype.autoTable) {
                      await new Promise((res,rej) => { const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
                      await new Promise((res,rej) => { const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
                    }
                    const { jsPDF } = window.jspdf;
                    const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
                    doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.text('Exam Timetable — All Classes',14,16);
                    doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(100);
                    doc.text('Generated: '+new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}),14,23);
                    doc.setTextColor(0);
                    const sorted = [...exams].sort((a,b)=>new Date(a.date)-new Date(b.date));
                    doc.autoTable({
                      startY:28,
                      head:[['Date','Day','Subject','Exam Name','Class','Type','Time','Total','Pass','Status']],
                      body:sorted.map(e=>{ const d=new Date(e.date); const diff=Math.ceil((d-new Date())/86400000); const past=d<new Date()&&d.toDateString()!==new Date().toDateString(); const status=past?'Done':diff===0?'Today':diff<=3?'In '+diff+'d (Urgent)':'In '+diff+'d'; return [d.getDate()+' '+d.toLocaleString('default',{month:'short'})+' '+d.getFullYear(),d.toLocaleString('default',{weekday:'short'}),e.subject?.name||'—',e.name,(e.class?.name||'')+' '+(e.class?.section||''),e.examType,e.startTime?(e.startTime+(e.endTime?' – '+e.endTime:'')):'—',e.totalMarks,e.passingMarks,status]; }),
                      styles:{fontSize:9,cellPadding:3},
                      headStyles:{fillColor:[11,31,74],textColor:255,fontStyle:'bold'},
                      alternateRowStyles:{fillColor:[248,250,252]},
                      didParseCell:(data)=>{ if(data.section==='body'&&data.column.index===9){ const v=data.cell.text[0]||''; if(v==='Done') data.cell.styles.textColor=[107,114,128]; else if(v==='Today') data.cell.styles.textColor=[146,64,14]; else if(v.includes('Urgent')) data.cell.styles.textColor=[220,38,38]; else data.cell.styles.textColor=[22,163,74]; } },
                    });
                    const pages=doc.internal.getNumberOfPages();
                    for(let i=1;i<=pages;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text('Page '+i+' of '+pages+' · The Future Step School',14,doc.internal.pageSize.height-8); }
                    doc.save('exam-timetable-'+new Date().toISOString().split('T')[0]+'.pdf');
                  } catch(err){ console.error(err); }
                }} className="text-xs border border-red-200 text-red-600 px-3 py-1.5 rounded-lg hover:bg-red-50 transition-all">
                  ⬇ PDF
                </button>
              )}
              <button onClick={() => navigate('/exams')} className="text-xs text-accent hover:underline">View all</button>
            </div>
          </div>
          {!exams.length ? (
            <div className="py-10 text-center">
              <div className="text-3xl mb-2">📝</div>
              <div className="text-sm text-muted">No upcoming exams</div>
              <button onClick={() => navigate('/exams')} className="mt-3 text-xs text-accent hover:underline">Create one →</button>
            </div>
          ) : (
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                <thead>
                  <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                    {['Date','Day','Subject','Exam','Class','Type','Time','Marks','Status'].map(h=>(
                      <th key={h} style={{ padding:'8px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {[...exams].sort((a,b)=>new Date(a.date)-new Date(b.date)).map((exam,i) => {
                    const d    = exam.date ? new Date(exam.date) : null;
                    const diff = d ? Math.ceil((d - new Date()) / 86400000) : null;
                    const isToday = d?.toDateString() === new Date().toDateString();
                    const typeColors = { unit:{bg:'#FEF3C7',color:'#92400E'}, midterm:{bg:'#FEE2E2',color:'#991B1B'}, final:{bg:'#EDE9FE',color:'#5B21B6'}, practical:{bg:'#D1FAE5',color:'#065F46'}, assignment:{bg:'#DBEAFE',color:'#1E40AF'} };
                    const tc = typeColors[exam.examType]||typeColors.unit;
                    const status = !d?null:isToday?{bg:'#FEF3C7',color:'#92400E',label:'Today'}:diff<=3?{bg:'#FEF2F2',color:'#DC2626',label:`In ${diff}d`}:diff<=7?{bg:'#FFFBEB',color:'#D97706',label:`In ${diff}d`}:{bg:'#F0FDF4',color:'#16A34A',label:`In ${diff}d`};
                    return (
                      <tr key={exam._id} style={{ borderBottom:'1px solid #F3F4F6', background:isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff' }}>
                        <td style={{ padding:'9px 12px', fontWeight:700, whiteSpace:'nowrap' }}>
                          <div>{d?.getDate()} {d?.toLocaleString('default',{month:'short'})}</div>
                          <div style={{ fontSize:9, color:'#9CA3AF' }}>{d?.getFullYear()}</div>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#6B7280', fontSize:11 }}>{d?.toLocaleString('default',{weekday:'short'})}</td>
                        <td style={{ padding:'9px 12px', fontWeight:600 }}>{exam.subject?.name||'—'}</td>
                        <td style={{ padding:'9px 12px', color:'#374151' }}>{exam.name}</td>
                        <td style={{ padding:'9px 12px', color:'#6B7280', whiteSpace:'nowrap' }}>{exam.class?.name} {exam.class?.section||''}</td>
                        <td style={{ padding:'9px 12px' }}>
                          <span style={{ fontSize:10, fontWeight:700, color:tc.color, background:tc.bg, padding:'2px 8px', borderRadius:20 }}>{exam.examType}</span>
                        </td>
                        <td style={{ padding:'9px 12px', color:'#6B7280', fontSize:11, whiteSpace:'nowrap' }}>{exam.startTime||'—'}{exam.endTime?` – ${exam.endTime}`:''}</td>
                        <td style={{ padding:'9px 12px', fontWeight:700 }}>{exam.totalMarks}<span style={{ fontSize:9, color:'#16A34A', marginLeft:3 }}>/{exam.passingMarks}</span></td>
                        <td style={{ padding:'9px 12px' }}>
                          {status && <span style={{ fontSize:10, fontWeight:700, color:status.color, background:status.bg, padding:'2px 8px', borderRadius:20, whiteSpace:'nowrap' }}>{status.label}</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
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