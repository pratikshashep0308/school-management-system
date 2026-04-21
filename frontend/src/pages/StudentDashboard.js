// frontend/src/pages/StudentDashboard.js
// Student Portal — admin-dashboard style, shows only the student's own data
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import StudentAttendanceSection from './Attendance/StudentAttendanceSection';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import api, { timetableAPI, classAPI } from '../utils/api';
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


// ─── StudentTimetableView — shows only student's own class timetable ──────────
function StudentTimetableView({ classId, className }) {
  const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const TIMES = ['9:00–9:45','9:45–10:30','10:30–11:15','11:15–12:00','12:00–12:45','12:45–1:30','1:30–2:15','2:15–3:00'];
  const DAY_COLORS = { Monday:'#D4522A',Tuesday:'#C9A84C',Wednesday:'#4A7C59',Thursday:'#7C6AF5',Friday:'#2D9CDB',Saturday:'#F2994A' };
  const SUB_COLORS = ['#3B82F6','#10B981','#F97316','#8B5CF6','#EF4444','#06B6D4','#F59E0B','#EC4899','#6366F1','#14B8A6'];

  const [ttData,   setTtData]   = useState([]);
  const [colorMap, setColorMap] = useState({});
  const [loading,  setLoading]  = useState(false);

  useEffect(() => {
    if (!classId) return;
    setLoading(true);
    timetableAPI.getClass(classId).then(r => {
      const schedule = r.data.data?.schedule || [];
      setTtData(schedule);
      const subs = {};
      schedule.forEach(ds => ds.periods?.forEach(p => { if(p.subject?._id) subs[p.subject._id] = p.subject; }));
      const cm = {};
      Object.keys(subs).forEach((id,i) => { cm[id] = SUB_COLORS[i % SUB_COLORS.length]; });
      setColorMap(cm);
    }).catch(()=>setTtData([])).finally(()=>setLoading(false));
  }, [classId]);

  const ttMap = {};
  ttData.forEach(ds => { ttMap[ds.day] = {}; ds.periods?.forEach(p => { ttMap[ds.day][p.periodNumber] = p; }); });

  if (loading) return <div style={{ textAlign:'center', padding:32, color:'#9CA3AF' }}>Loading timetable…</div>;

  if (!ttData.length) return (
    <EmptyState icon="🗓" title="No timetable set" subtitle={`Timetable for ${className} hasn't been configured yet`} />
  );

  return (
    <div style={{ background:'#fff', borderRadius:16, overflow:'hidden', boxShadow:'0 2px 16px rgba(0,0,0,0.06)', border:'1px solid #E5E7EB' }}>
      <div style={{ background:'#0B1F4A', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:700, fontSize:15, color:'#fff' }}>🗓 {className} — Weekly Timetable</div>
        <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Your Class</span>
      </div>
      <div style={{ overflowX:'auto' }}>
        <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:700 }}>
          <thead>
            <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E5E7EB' }}>
              <th style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', width:100, position:'sticky', left:0, background:'#F8FAFC', zIndex:2 }}>Day</th>
              {[1,2,3,4,5,6,7,8].map((p) => {
                // Get time from first day that has this period
                const sampleDay = ttData.find(ds => ds.periods?.find(pr => pr.periodNumber === p));
                const sampleP   = sampleDay?.periods?.find(pr => pr.periodNumber === p);
                const timeStr   = sampleP ? `${sampleP.startTime}–${sampleP.endTime}` : '';
                return (
                  <th key={p} style={{ padding:'10px 12px', textAlign:'center', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', minWidth:110 }}>
                    <div>P{p}</div>
                    <div style={{ fontSize:9, fontWeight:400, color:'#9CA3AF', marginTop:2 }}>{timeStr}</div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {DAYS.map((day,di) => (
              <tr key={day} style={{ borderBottom:'1px solid #F3F4F6', background:di%2?'#FAFAFA':'#fff' }}>
                <td style={{ padding:'12px 16px', position:'sticky', left:0, background:di%2?'#FAFAFA':'#fff', zIndex:1, borderRight:'2px solid #E5E7EB' }}>
                  <div style={{ fontWeight:800, fontSize:12, color:DAY_COLORS[day]||'#374151', textTransform:'uppercase' }}>{day.slice(0,3)}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF' }}>{day}</div>
                </td>
                {[1,2,3,4,5,6,7,8].filter(p => ttData.some(ds => ds.periods?.some(pr => pr.periodNumber === p))).map(p => {
                  const period = ttMap[day]?.[p];
                  const subColor = period?.subject?._id ? (colorMap[period.subject._id]||'#6B7280') : null;
                  return (
                    <td key={p} style={{ padding:'8px 10px', textAlign:'center', borderLeft:'1px solid #F3F4F6' }}>
                      {period?.subject?.name ? (
                        <div style={{ background:`${subColor}15`, border:`1px solid ${subColor}40`, borderRadius:8, padding:'6px 8px' }}>
                          <div style={{ fontSize:12, fontWeight:700, color:subColor, lineHeight:1.2 }}>{period.subject.name}</div>
                          {period.teacher?.user?.name && (
                            <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>{period.teacher.user.name.split(' ')[0]}</div>
                          )}
                        </div>
                      ) : period?.type && period.type !== 'regular' ? (
                        <div style={{ background:'#F3F4F6', borderRadius:8, padding:'4px 6px', fontSize:10, color:'#9CA3AF', fontWeight:600 }}>
                          {period.type==='break'?'☕ Break':period.type==='lunch'?'🍽 Lunch':'Free'}
                        </div>
                      ) : (
                        <span style={{ color:'#E5E7EB', fontSize:16 }}>—</span>
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── Assignments Section with filters ─────────────────────────────────────────
function AssignmentsSection({ assignments, dueAssignments }) {
  const [filter, setFilter] = React.useState('all'); // all | pending | submitted | overdue
  const [search, setSearch] = React.useState('');

  const filtered = assignments.filter(a => {
    const now    = new Date();
    const isOver = a.dueDate && new Date(a.dueDate) < now;
    const matchFilter =
      filter === 'all'       ? true :
      filter === 'pending'   ? (!a.submitted && !isOver) :
      filter === 'submitted' ? a.submitted :
      filter === 'overdue'   ? (isOver && !a.submitted) : true;
    const matchSearch = !search ||
      a.title?.toLowerCase().includes(search.toLowerCase()) ||
      a.subject?.name?.toLowerCase().includes(search.toLowerCase());
    return matchFilter && matchSearch;
  });

  const overdue = assignments.filter(a => a.dueDate && new Date(a.dueDate) < new Date() && !a.submitted);

  const FILTERS = [
    { key:'all',       label:`All (${assignments.length})` },
    { key:'pending',   label:`⏳ Pending (${dueAssignments.length})` },
    { key:'submitted', label:`✅ Submitted (${assignments.filter(a=>a.submitted).length})` },
    { key:'overdue',   label:`⚠️ Overdue (${overdue.length})` },
  ];

  return (
    <div className="space-y-4">
      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-3">
        {[
          { label:'Total',     val:assignments.length,                          color:'#1D4ED8', bg:'#EFF6FF', onClick:()=>setFilter('all') },
          { label:'Pending',   val:dueAssignments.length,                       color:'#D97706', bg:'#FFFBEB', onClick:()=>setFilter('pending') },
          { label:'Submitted', val:assignments.filter(a=>a.submitted).length,   color:'#16A34A', bg:'#F0FDF4', onClick:()=>setFilter('submitted') },
          { label:'Overdue',   val:overdue.length,                              color:'#DC2626', bg:'#FEF2F2', onClick:()=>setFilter('overdue') },
        ].map(c => (
          <div key={c.label} onClick={c.onClick}
            style={{ background:filter===c.key.toLowerCase()||filter==='all'?c.bg:'#fff', border:`1.5px solid ${c.color}30`, borderRadius:12, padding:'12px 14px', cursor:'pointer', transition:'all 0.15s' }}
            className="hover:-translate-y-0.5 hover:shadow-sm">
            <div style={{ fontSize:20, fontWeight:900, color:c.color }}>{c.val}</div>
            <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginTop:3 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Search + filter bar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center' }}>
        <input placeholder="🔍 Search assignments…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, outline:'none', minWidth:200 }}/>
        <div style={{ display:'flex', gap:6 }}>
          {FILTERS.map(f => (
            <button key={f.key} onClick={()=>setFilter(f.key)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${filter===f.key?'#1D4ED8':'#E5E7EB'}`,
              background:filter===f.key?'#EFF6FF':'#fff',
              color:filter===f.key?'#1D4ED8':'#6B7280',
            }}>{f.label}</button>
          ))}
        </div>
      </div>

      {!filtered.length ? (
        <div className="card p-8 text-center">
          <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
          <div className="font-semibold text-ink">No assignments found</div>
          <div className="text-sm text-muted mt-1">Try changing the filter</div>
        </div>
      ) : (
        <div className="space-y-3">
          {filtered.map(a => {
            const due    = a.dueDate ? new Date(a.dueDate) : null;
            const isOver = due && due < new Date();
            const diff   = due ? Math.ceil((due - new Date()) / 86400000) : null;
            return (
              <div key={a._id} className={'card px-6 py-5 flex items-start gap-5 transition-colors ' +
                (a.submitted?'border-green-200':isOver?'border-red-200':'hover:border-accent/30')}>
                <div className={'w-12 h-12 rounded-xl flex items-center justify-center text-2xl flex-shrink-0 ' +
                  (a.submitted?'bg-green-100':isOver?'bg-red-100':'bg-accent/10')}>
                  {a.submitted ? '✅' : isOver ? '⚠️' : '📋'}
                </div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-ink">{a.title}</span>
                    {a.subject?.name && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">{a.subject.name}</span>}
                    {a.submitted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-green-100 text-green-700">✓ Submitted</span>}
                    {isOver && !a.submitted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600">Overdue</span>}
                  </div>
                  {a.description && <p className="text-sm text-muted line-clamp-2">{a.description}</p>}
                  <div className="flex flex-wrap gap-4 mt-1.5 text-xs text-muted">
                    {due && <span>📅 Due: <strong className={isOver&&!a.submitted?'text-red-500':'text-ink'}>{due.toLocaleDateString('en-IN')}</strong></span>}
                    {a.totalMarks && <span>⭐ {a.totalMarks} marks</span>}
                    {a.teacher?.user?.name && <span>👨‍🏫 {a.teacher.user.name}</span>}
                    {a.mySubmission?.marksObtained != null && <span className="font-bold text-green-600">🏆 {a.mySubmission.marksObtained}/{a.totalMarks}</span>}
                  </div>
                </div>
                {!a.submitted && diff !== null && diff >= 0 && (
                  <span className={'text-xs font-bold px-3 py-1.5 rounded-full flex-shrink-0 ' +
                    (diff<=1?'bg-red-100 text-red-600':diff<=3?'bg-amber-100 text-amber-700':'bg-blue-100 text-blue-700')}>
                    {diff===0?'Due today!':diff+'d left'}
                  </span>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}


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


  const exportExamPDF = async (rows, title, subtitle) => {
    try {
      if (!window.jspdf || !window.jspdf.jsPDF.prototype.autoTable) {
        await new Promise((res,rej) => { const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
        await new Promise((res,rej) => { const s=document.createElement('script'); s.src='https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js'; s.onload=res; s.onerror=rej; document.head.appendChild(s); });
      }
      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });
      doc.setFontSize(15); doc.setFont(undefined,'bold'); doc.text(title,14,16);
      doc.setFontSize(10); doc.setFont(undefined,'normal'); doc.setTextColor(100);
      doc.text(subtitle+' · The Future Step School',14,23);
      doc.text('Generated: '+new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}),14,28);
      doc.setTextColor(0);
      doc.autoTable({
        startY:33,
        head:[['Date','Day','Subject','Exam Name','Type','Time','Total','Pass','Status']],
        body:rows.map(e=>{
          const d=new Date(e.date); const diff=Math.ceil((d-new Date())/86400000);
          const past=d<new Date()&&d.toDateString()!==new Date().toDateString();
          const status=past?'Done':diff===0?'Today':diff<=3?'In '+diff+'d (Urgent)':'In '+diff+'d';
          return [d.getDate()+' '+d.toLocaleString('default',{month:'short'})+' '+d.getFullYear(),d.toLocaleString('default',{weekday:'short'}),e.subject?.name||'—',e.name,e.examType,e.startTime?(e.startTime+(e.endTime?' – '+e.endTime:'')):'—',e.totalMarks,e.passingMarks,status];
        }),
        styles:{fontSize:9,cellPadding:3},
        headStyles:{fillColor:[11,31,74],textColor:255,fontStyle:'bold'},
        alternateRowStyles:{fillColor:[248,250,252]},
        didParseCell:(data)=>{ if(data.section==='body'&&data.column.index===8){ const v=data.cell.text[0]||''; if(v==='Done') data.cell.styles.textColor=[107,114,128]; else if(v==='Today') data.cell.styles.textColor=[146,64,14]; else if(v.includes('Urgent')) data.cell.styles.textColor=[220,38,38]; else data.cell.styles.textColor=[22,163,74]; } },
      });
      const pages=doc.internal.getNumberOfPages();
      for(let i=1;i<=pages;i++){ doc.setPage(i); doc.setFontSize(8); doc.setTextColor(150); doc.text('Page '+i+' of '+pages+' · The Future Step School',14,doc.internal.pageSize.height-8); }
      doc.save('exam-timetable-'+new Date().toISOString().split('T')[0]+'.pdf');
      toast.success('PDF downloaded!');
    } catch(err){ console.error(err); toast.error('PDF export failed'); }
  };

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
        {[
          { icon:'📅', value:`${attPct}%`,         label:'Attendance',     change:`${attendance.present}/${attTotal} days`, changeType:attPct>=75?'up':'down', color:'sage',   tab:'attendance' },
          { icon:'📝', value:upcoming.length,       label:'Upcoming Exams', change:'Scheduled',                             changeType:'up',                   color:'gold',   tab:'exams' },
          { icon:'📋', value:dueAssignments.length, label:'Due Assignments',change:dueAssignments.length>0?'Need attention':'All clear', changeType:dueAssignments.length>0?'down':'up', color:'accent', tab:'assignments' },
          { icon:'💰', value:pendingFees.length===0?'✅':pendingFees.length, label:'Fee Status', change:pendingFees.length===0?'All paid':`${pendingFees.length} pending`, changeType:pendingFees.length>0?'down':'up', color:'purple', tab:'fees' },
        ].map(s => (
          <div key={s.label} onClick={()=>setTab(s.tab)}
            style={{ cursor:'pointer', transition:'all 0.15s', userSelect:'none' }}
            className="hover:-translate-y-1 hover:shadow-md">
            <StatCard icon={s.icon} value={s.value} label={s.label} change={s.change} changeType={s.changeType} color={s.color}/>
          </div>
        ))}
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
          <div className="card p-6" onClick={()=>setTab('attendance')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.12)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
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
          <div className="card overflow-hidden" onClick={()=>setTab('exams')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.12)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
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
          <div className="card overflow-hidden" onClick={()=>setTab('assignments')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.12)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
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
              <button onClick={(e)=>{e.stopPropagation();setTab('transport');}} className="mt-3 w-full text-xs font-semibold text-accent hover:underline text-left">
                Full details →
              </button>
            </div>
          )}

          {/* Fee summary */}
          <div className="card p-6" onClick={()=>setTab('fees')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.12)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
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
        <StudentAttendanceSection dashboardAttendance={attendance} studentId={student?._id} />
      )}
      {tab === 'timetable' && (
        <div>
          <StudentTimetableView
            classId={student?.class?._id}
            className={`${student?.class?.name || ''} ${student?.class?.section || ''}`.trim()}
          />
          {false && !timetable.length ? (
            <EmptyState icon="🗓" title="No timetable set" subtitle="Admin hasn't configured the timetable for your class yet" />
          ) : false && (
            <div className="card overflow-x-auto" style={{ padding:0 }}>
              <div style={{ background:'#0B1F4A', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:700, fontSize:15, color:'#fff' }}>🗓 Weekly Timetable</div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>{student.class?.name} {student.class?.section||''}</div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'separate', borderSpacing:4, minWidth:900, padding:8 }}>
                  <thead>
                    <tr>
                      <th style={{ textAlign:'left', padding:'8px 12px', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', width:100 }}>Day</th>
                      {TIMES.map((t,i) => (
                        <th key={i} style={{ textAlign:'center', padding:'8px 6px', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>
                          <div>P{i+1}</div>
                          <div style={{ fontSize:9, fontWeight:400, color:'#9CA3AF' }}>{t}</div>
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {DAYS.map(day => (
                      <tr key={day}>
                        <td style={{ padding:'4px 12px', verticalAlign:'middle' }}>
                          <div style={{ fontWeight:800, fontSize:12, color:DAY_COLORS[day] }}>{day.slice(0,3).toUpperCase()}</div>
                          <div style={{ fontSize:10, color:'#9CA3AF' }}>{day}</div>
                        </td>
                        {[1,2,3,4,5,6,7,8].map(p => {
                          const period = ttMap[day]?.[p];
                          const colors = ['#3B82F6','#10B981','#F97316','#8B5CF6','#EF4444','#06B6D4','#F59E0B','#EC4899'];
                          const subIdx = period?.subject?.name ? Math.abs(period.subject.name.charCodeAt(0)) % colors.length : 0;
                          const subColor = colors[subIdx];
                          return (
                            <td key={p} style={{ verticalAlign:'top', minWidth:110, padding:2 }}>
                              {period ? (
                                <div style={{ minHeight:68, borderRadius:8, padding:'8px 10px', background:`${subColor}12`, borderLeft:`3px solid ${subColor}`, border:`1px solid ${subColor}25` }}>
                                  <div style={{ fontWeight:700, fontSize:12, color:'#111827' }}>{period.subject?.name||'—'}</div>
                                  <div style={{ fontSize:10, color:'#6B7280', marginTop:3 }}>{period.teacher?.user?.name?.split(' ').slice(-1)[0]||''}</div>
                                  {period.room && <div style={{ fontSize:9, color:'#9CA3AF', marginTop:2 }}>🚪 {period.room}</div>}
                                </div>
                              ) : (
                                <div style={{ minHeight:68, borderRadius:8, background:'#F9FAFB', border:'1px dashed #E5E7EB', display:'flex', alignItems:'center', justifyContent:'center', color:'#E5E7EB', fontSize:14 }}>—</div>
                              )}
                            </td>
                          );
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
      {/* ════════════════════ EXAMS ════════════════════ */}
      {tab === 'exams' && (
        <div className="space-y-4">
          {/* Summary cards */}
          <div className="grid grid-cols-3 gap-4">
            <div className="card p-5 text-center">
              <div className="font-display text-3xl text-amber-500">{upcoming.length}</div>
              <div className="text-xs text-muted mt-1">📅 Upcoming</div>
            </div>
            <div className="card p-5 text-center">
              <div className="font-display text-3xl text-muted">{exams.length - upcoming.length}</div>
              <div className="text-xs text-muted mt-1">✅ Completed</div>
            </div>
            <div className="card p-5 text-center">
              <div className="font-display text-3xl text-ink dark:text-white">{exams.length}</div>
              <div className="text-xs text-muted mt-1">📝 Total</div>
            </div>
          </div>

          {/* Upcoming exam timetable — only this student's class */}
          {upcoming.length > 0 ? (
            <div className="card overflow-hidden" style={{ padding:0 }}>
              <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', padding:'14px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#fff' }}>📅 Upcoming Exam Timetable</div>
                  <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', marginTop:2 }}>
                    {student.class?.name} {student.class?.section||''} — Your class only
                  </div>
                </div>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <span style={{ fontSize:12, color:'rgba(255,255,255,0.5)', background:'rgba(255,255,255,0.1)', padding:'3px 10px', borderRadius:20 }}>{upcoming.length} exams</span>
                  <button onClick={()=>exportExamPDF([...upcoming].sort((a,b)=>new Date(a.date)-new Date(b.date)), 'Exam Timetable', student.class?.name+' '+( student.class?.section||''))}
                    style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'rgba(220,38,38,0.15)', border:'1px solid rgba(220,38,38,0.3)', padding:'4px 10px', borderRadius:8, cursor:'pointer' }}>
                    ⬇ PDF
                  </button>
                </div>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'2px solid #E5E7EB' }}>
                      {['Date','Day','Exam Name','Subject','Type','Time','Total Marks','Pass Marks'].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...upcoming].sort((a,b)=>new Date(a.date)-new Date(b.date)).map((exam,i) => {
                      const d    = new Date(exam.date);
                      const diff = Math.ceil((d - new Date()) / 86400000);
                      const isToday = d.toDateString() === new Date().toDateString();
                      const typeColors = { unit:{bg:'#FEF3C7',color:'#92400E',border:'#F59E0B'}, midterm:{bg:'#FEE2E2',color:'#991B1B',border:'#EF4444'}, final:{bg:'#EDE9FE',color:'#5B21B6',border:'#8B5CF6'}, practical:{bg:'#D1FAE5',color:'#065F46',border:'#10B981'}, assignment:{bg:'#DBEAFE',color:'#1E40AF',border:'#3B82F6'} };
                      const tc = typeColors[exam.examType]||typeColors.unit;
                      return (
                        <tr key={exam._id} style={{ borderBottom:'1px solid #F3F4F6', background: isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'10px 14px', fontWeight:700 }}>
                            <div style={{ fontSize:15, color:'#111827' }}>{d.getDate()} {d.toLocaleString('default',{month:'short'})}</div>
                            <div style={{ fontSize:10, color:'#9CA3AF' }}>{d.getFullYear()}</div>
                          </td>
                          <td style={{ padding:'10px 14px', color:'#6B7280' }}>{d.toLocaleString('default',{weekday:'long'})}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ fontWeight:700, color:'#111827' }}>{exam.name}</div>
                            {exam.instructions && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{exam.instructions}</div>}
                          </td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{exam.subject?.name||'—'}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:11, fontWeight:700, color:tc.color, background:tc.bg, border:`1px solid ${tc.border}50`, padding:'3px 9px', borderRadius:20 }}>{exam.examType}</span>
                          </td>
                          <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12, whiteSpace:'nowrap' }}>
                            {exam.startTime||'—'}{exam.endTime?` – ${exam.endTime}`:''}
                          </td>
                          <td style={{ padding:'10px 14px', fontWeight:800, color:'#111827' }}>{exam.totalMarks}</td>
                          <td style={{ padding:'10px 14px', fontWeight:700, color:'#16A34A' }}>{exam.passingMarks}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          ) : (
            <div className="card p-8 text-center">
              <div style={{ fontSize:36, marginBottom:8 }}>✅</div>
              <div className="font-semibold text-ink">No upcoming exams</div>
              <div className="text-sm text-muted mt-1">All clear! No exams scheduled for your class.</div>
            </div>
          )}

          {/* Completed exams */}
          {exams.filter(e => e.date && new Date(e.date) < new Date()).length > 0 && (
            <div className="card overflow-hidden" style={{ padding:0 }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14, color:'#374151', display:'flex', justifyContent:'space-between' }}>
                <span>✅ Completed Exams</span>
                <span style={{ fontSize:12, color:'#9CA3AF' }}>{exams.filter(e=>e.date&&new Date(e.date)<new Date()).length} exams</span>
              </div>
              {exams.filter(e=>e.date&&new Date(e.date)<new Date()).sort((a,b)=>new Date(b.date)-new Date(a.date)).map((exam,i) => {
                const d = new Date(exam.date);
                const typeColors = { unit:'#F59E0B', midterm:'#EF4444', final:'#8B5CF6', practical:'#10B981', assignment:'#3B82F6' };
                return (
                  <div key={exam._id} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <div style={{ width:42, height:42, borderRadius:10, background:'#F3F4F6', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <div style={{ fontSize:14, fontWeight:900, color:'#6B7280' }}>{d.getDate()}</div>
                      <div style={{ fontSize:9, color:'#9CA3AF', textTransform:'uppercase' }}>{d.toLocaleString('default',{month:'short'})}</div>
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{exam.name}</div>
                      <div style={{ fontSize:11, color:'#6B7280' }}>
                        {exam.subject?.name||'—'} &nbsp;·&nbsp; {exam.totalMarks} marks &nbsp;·&nbsp;
                        <span style={{ color:typeColors[exam.examType]||'#6B7280', fontWeight:700 }}>{exam.examType}</span>
                      </div>
                    </div>
                    <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', background:'#F3F4F6', padding:'3px 9px', borderRadius:10 }}>Done</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
      {tab === 'assignments' && (
        <AssignmentsSection assignments={assignments} dueAssignments={dueAssignments}/>
      )}
      {false && tab === 'assignments_old' && (
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

              {/* GPS Live Location */}
              <div className="card p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <span style={{ fontSize:20 }}>📡</span>
                    <div>
                      <div className="font-bold text-sm text-ink dark:text-white">Live Bus Location</div>
                      <div className="text-xs text-muted">Updates every 30 seconds</div>
                    </div>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:'#059669', background:'#D1FAE5', padding:'3px 10px', borderRadius:20 }}>
                    🟢 Live  
                  </span>
                </div>
                {transport.currentLocation?.lat && transport.currentLocation?.lng ? (
                  <div>
                    <iframe
                      title="Bus Live Location"
                      width="100%"
                      height="220"
                      style={{ border:'none', borderRadius:12 }}
                      src={`https://maps.google.com/maps?q=${transport.currentLocation.lat},${transport.currentLocation.lng}&z=15&output=embed`}
                    />
                    <div className="flex items-center gap-2 mt-3 text-xs text-muted">
                      <span>📍</span>
                      <span>Lat: {transport.currentLocation.lat?.toFixed(5)}, Lng: {transport.currentLocation.lng?.toFixed(5)}</span>
                    </div>
                  </div>
                ) : (
                  <div style={{ background:'#F8FAFC', borderRadius:12, padding:'32px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:36, marginBottom:8 }}>🗺️</div>
                    <div style={{ fontSize:13, fontWeight:600, color:'#374151', marginBottom:4 }}>GPS location not available</div>
                    <div style={{ fontSize:12, color:'#9CA3AF' }}>Location will appear here once the bus device is active</div>
                  </div>
                )}
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