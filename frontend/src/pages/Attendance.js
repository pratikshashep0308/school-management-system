// frontend/src/pages/Attendance.js
// Tabs: Mark Attendance | Class Daily View | Monthly Report
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState, Avatar } from '../components/ui';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const TODAY  = new Date().toISOString().split('T')[0];

const STATUS_CONFIG = {
  present: { label:'Present', short:'P', color:'#16A34A', bg:'#F0FDF4', border:'#22C55E', light:'#DCFCE7' },
  absent:  { label:'Absent',  short:'A', color:'#DC2626', bg:'#FEF2F2', border:'#EF4444', light:'#FEE2E2' },
  late:    { label:'Late',    short:'L', color:'#D97706', bg:'#FFFBEB', border:'#F59E0B', light:'#FEF3C7' },
  excused: { label:'Excused', short:'E', color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6', light:'#EDE9FE' },
  unmarked:{ label:'Unmarked',short:'?', color:'#9CA3AF', bg:'#F9FAFB', border:'#E5E7EB', light:'#F3F4F6' },
};

// ── Summary bar ───────────────────────────────────────────────────────────────
function SummaryBar({ counts, total }) {
  const items = [
    { key:'present', label:'Present' },
    { key:'absent',  label:'Absent' },
    { key:'late',    label:'Late' },
    { key:'excused', label:'Excused' },
    { key:'unmarked',label:'Unmarked' },
    { key:'total',   label:'Total', val: total },
  ];
  return (
    <div style={{ display:'flex', gap:16, flexWrap:'wrap', marginBottom:18 }}>
      {items.map(({ key, label, val }) => {
        const c = STATUS_CONFIG[key] || { color:'#374151', bg:'#F3F4F6', border:'#E5E7EB' };
        const v = val !== undefined ? val : counts[key] || 0;
        return (
          <div key={key} style={{ display:'flex', alignItems:'center', gap:7 }}>
            <div style={{ width:10, height:10, borderRadius:'50%', background:c.color, flexShrink:0 }}/>
            <span style={{ fontSize:18, fontWeight:900, color:c.color }}>{v}</span>
            <span style={{ fontSize:12, color:'#6B7280' }}>{label}</span>
          </div>
        );
      })}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — MARK ATTENDANCE
// ══════════════════════════════════════════════════════════════════════════════
function MarkAttendance({ classes }) {
  const { isAdmin, isTeacher } = useAuth();
  const [selectedClass, setSelectedClass] = useState('');
  const [date,          setDate]          = useState(TODAY);
  const [students,      setStudents]      = useState([]);
  const [attendance,    setAttendance]    = useState({});
  const [loading,       setLoading]       = useState(false);
  const [saving,        setSaving]        = useState(false);
  const [search,        setSearch]        = useState('');

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    Promise.all([
      studentAPI.getAll({ class: selectedClass }),
      attendanceAPI.getByClass(selectedClass, date),
    ]).then(([sRes, aRes]) => {
      setStudents(sRes.data.data || []);
      const map = {};
      (aRes.data.data || []).forEach(a => { map[a.student?._id || a.student] = a.status; });
      setAttendance(map);
    }).catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [selectedClass, date]);

  const mark    = (id, status) => setAttendance(p => ({ ...p, [id]: p[id] === status ? 'unmarked' : status }));
  const markAll = (status)     => { const m = {}; students.forEach(s => { m[s._id] = status; }); setAttendance(m); };

  const save = async () => {
    if (!students.length) return toast.error('No students');
    setSaving(true);
    try {
      const attendanceData = students.map(s => ({ studentId: s._id, status: attendance[s._id] || 'absent' }));
      await attendanceAPI.mark({ classId: selectedClass, date, attendanceData });
      toast.success('Attendance saved!');
    } catch { toast.error('Failed to save'); }
    finally { setSaving(false); }
  };

  const counts = { present:0, absent:0, late:0, excused:0, unmarked:0 };
  students.forEach(s => {
    const st = attendance[s._id] || 'unmarked';
    counts[st] = (counts[st]||0) + 1;
  });

  const filteredStudents = search
    ? students.filter(s => s.user?.name?.toLowerCase().includes(search.toLowerCase()) || s.rollNumber?.toString().includes(search))
    : students;

  const pct = students.length > 0 ? Math.round((counts.present / students.length) * 100) : 0;
  const canEdit = isAdmin || isTeacher;
  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      {/* Controls */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} style={SEL}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)}
          max={TODAY} style={SEL} />
        {date === TODAY
          ? <span style={{ fontSize:11, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1px solid #22C55E', padding:'4px 10px', borderRadius:20 }}>📅 Today</span>
          : <span style={{ fontSize:11, fontWeight:700, color:'#D97706', background:'#FFFBEB', border:'1px solid #F59E0B', padding:'4px 10px', borderRadius:20 }}>📅 Past Date</span>}
        <input
          placeholder="🔍 Search student..."
          value={search}
          onChange={e=>setSearch(e.target.value)}
          style={{ padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none', minWidth:180 }}
        />
        {search && (
          <button onClick={()=>setSearch('')} style={{ fontSize:12, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>✕</button>
        )}
        {canEdit && (
          <div style={{ display:'flex', gap:8, marginLeft:'auto', flexWrap:'wrap' }}>
            {['present','absent','late','excused'].map(st => {
              const c = STATUS_CONFIG[st];
              return (
                <button key={st} onClick={() => markAll(st)} style={{
                  padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:700,
                  border:`1.5px solid ${c.border}`, background:c.bg, color:c.color, cursor:'pointer',
                }}>
                  {c.short} All {c.label}
                </button>
              );
            })}
            <button onClick={save} disabled={saving} style={{
              padding:'8px 20px', borderRadius:9, fontSize:13, fontWeight:700,
              background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer',
              opacity:saving?0.6:1,
            }}>
              {saving ? '⏳ Saving…' : '✓ Save'}
            </button>
          </div>
        )}
      </div>

      {/* Attendance % hero */}
      {students.length > 0 && (
        <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:14, padding:'16px 20px', marginBottom:18, display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
          <div>
            <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>Today's Attendance Rate</div>
            <div style={{ fontSize:36, fontWeight:900, color:'#fff', lineHeight:1 }}>{pct}%</div>
          </div>
          <div style={{ flex:1, height:8, background:'rgba(255,255,255,0.1)', borderRadius:4, overflow:'hidden', minWidth:120 }}>
            <div style={{ height:'100%', width:`${pct}%`, background:pct>=75?'#34D399':'#FCD34D', borderRadius:4, transition:'width 0.8s' }}/>
          </div>
          <SummaryBar counts={counts} total={students.length} />
        </div>
      )}

      {loading ? <LoadingState /> : !students.length ? (
        <EmptyState icon="✓" title="No students in this class" />
      ) : !filteredStudents.length ? (
        <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>No students match "{search}"</div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                <th style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', width:40 }}>#</th>
                <th style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>Student</th>
                <th style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', width:80 }}>Roll</th>
                <th style={{ padding:'11px 16px', textAlign:'center', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>Status</th>
                <th style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', width:120 }}>Mark</th>
              </tr>
            </thead>
            <tbody>
              {filteredStudents.map((s, i) => {
                const status = attendance[s._id] || 'unmarked';
                const cfg    = STATUS_CONFIG[status];
                const initials = (s.user?.name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                const colors = ['#D4522A','#185FA5','#534AB7','#0F6E56','#993556'];
                const bg = colors[(s.user?.name||'').charCodeAt(0) % colors.length];
                return (
                  <tr key={s._id} style={{ borderBottom:'0.5px solid #F3F4F6', background: i%2 ? '#FAFAFA' : '#fff', transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                    <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                        <div style={{ width:36, height:36, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{initials}</span>
                        </div>
                        <div style={{ fontWeight:600, fontSize:13, color:'#111827' }}>{s.user?.name}</div>
                      </div>
                    </td>
                    <td style={{ padding:'10px 16px', color:'#6B7280', fontWeight:600 }}>{s.rollNumber||'—'}</td>
                    <td style={{ padding:'10px 16px', textAlign:'center' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}`, padding:'3px 12px', borderRadius:20 }}>
                        {cfg.label}
                      </span>
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', gap:4 }}>
                        {['present','absent','late','excused'].map(st => {
                          const c = STATUS_CONFIG[st];
                          const isActive = status === st;
                          return (
                            <button key={st} onClick={() => canEdit && mark(s._id, st)}
                              title={c.label}
                              style={{
                                width:28, height:28, borderRadius:7, fontSize:11, fontWeight:800,
                                border:`1.5px solid ${c.border}`,
                                background: isActive ? c.color : 'transparent',
                                color: isActive ? '#fff' : c.color,
                                cursor: canEdit ? 'pointer' : 'default',
                                transition:'all 0.12s',
                              }}>
                              {c.short}
                            </button>
                          );
                        })}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — CLASS DAILY VIEW (see any date's attendance)
// ══════════════════════════════════════════════════════════════════════════════
function ClassDailyView({ classes }) {
  const [selectedClass, setSelectedClass] = useState('');
  const [date,          setDate]          = useState(TODAY);
  const [data,          setData]          = useState([]);
  const [meta,          setMeta]          = useState(null);
  const [loading,       setLoading]       = useState(false);

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  const load = useCallback(async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const r = await attendanceAPI.getByClass(selectedClass, date);
      setData(r.data.data || []);
      setMeta(r.data.meta || null);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [selectedClass, date]);

  useEffect(() => { load(); }, [load]);

  const counts = { present:0, absent:0, late:0, excused:0, unmarked:0 };
  data.forEach(d => { const k = d.status||'unmarked'; counts[k]=(counts[k]||0)+1; });
  const pct = data.length > 0 ? Math.round(((counts.present+(counts.late||0))/data.length)*100) : 0;

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} style={SEL}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} max={TODAY} style={SEL} />
        <button onClick={load} style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
          🔍 View
        </button>
      </div>

      {loading ? <LoadingState /> : !data.length ? (
        <EmptyState icon="📅" title="No attendance data" subtitle="No attendance was marked for this class on this date" />
      ) : (
        <div>
          {/* Summary */}
          <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:14, padding:'16px 20px', marginBottom:18 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:12 }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:4 }}>
                  {classes.find(c=>c._id===selectedClass)?.name} · {new Date(date).toLocaleDateString('en-IN',{weekday:'long',day:'numeric',month:'long',year:'numeric'})}
                </div>
                <div style={{ fontSize:32, fontWeight:900, color:'#fff' }}>{pct}% <span style={{ fontSize:14, color:'rgba(255,255,255,0.5)', fontWeight:400 }}>attendance rate</span></div>
              </div>
              <div style={{ display:'flex', gap:14, flexWrap:'wrap' }}>
                {Object.entries(counts).filter(([k])=>k!=='unmarked').map(([k,v])=>{
                  const c = STATUS_CONFIG[k];
                  return (
                    <div key={k} style={{ textAlign:'center' }}>
                      <div style={{ fontSize:20, fontWeight:900, color:'#fff' }}>{v}</div>
                      <div style={{ fontSize:10, color:c?.color||'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{c?.label||k}</div>
                    </div>
                  );
                })}
              </div>
            </div>
            <div style={{ height:6, background:'rgba(255,255,255,0.1)', borderRadius:4, marginTop:12, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${pct}%`, background:pct>=75?'#34D399':'#FCD34D', borderRadius:4, transition:'width 0.8s' }}/>
            </div>
          </div>

          {/* Student list table */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0B1F4A' }}>
                    {['Roll','Student','Status','Time Marked','Remarks','Marked By'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((d,i) => {
                    const cfg = STATUS_CONFIG[d.status||'unmarked'];
                    return (
                      <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                        <td style={{ padding:'10px 14px', color:'#6B7280', fontWeight:600 }}>{d.student?.rollNumber||'—'}</td>
                        <td style={{ padding:'10px 14px' }}>
                          <div style={{ fontWeight:700 }}>{d.student?.user?.name||'—'}</div>
                        </td>
                        <td style={{ padding:'10px 14px' }}>
                          <span style={{ fontSize:12, fontWeight:700, color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}50`, padding:'3px 10px', borderRadius:20 }}>
                            {cfg.label}
                          </span>
                        </td>
                        <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>
                          {d.attendance?.createdAt ? new Date(d.attendance.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}
                        </td>
                        <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{d.attendance?.remarks||'—'}</td>
                        <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{d.attendance?.markedBy?.name||'—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — MONTHLY REPORT (calendar heatmap + student-wise breakdown)
// ══════════════════════════════════════════════════════════════════════════════
function MonthlyReport({ classes }) {
  const now = new Date();
  const [selectedClass, setSelectedClass] = useState('');
  const [month,         setMonth]         = useState(now.getMonth() + 1);
  const [year,          setYear]          = useState(now.getFullYear());
  const [data,          setData]          = useState(null);
  const [loading,       setLoading]       = useState(false);
  const [activeFilter,  setActiveFilter]  = useState('all'); // 'all'|'low'|'top'|'good'

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  const load = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      // Use analytics endpoint — returns summary + breakdown + dailyTrend together
      const r = await attendanceAPI.getClassAnalytics(selectedClass, month, year);
      setData(r.data.data || r.data);
    } catch { toast.error('Failed to load monthly report'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (selectedClass) load(); }, [selectedClass, month, year]);

  const daysInMonth = new Date(year, month, 0).getDate();
  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  const dayColor = (pct) => {
    if (pct === undefined || pct === null) return '#F3F4F6';
    if (pct >= 90) return '#16A34A';
    if (pct >= 75) return '#22C55E';
    if (pct >= 50) return '#F59E0B';
    if (pct > 0)  return '#EF4444';
    return '#FEE2E2';
  };

  return (
    <div>
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} style={SEL}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={load} disabled={loading}
          style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer', opacity:loading?0.6:1 }}>
          {loading ? '⏳' : '🔍'} Generate
        </button>
      </div>

      {loading ? <LoadingState /> : !data ? (
        <EmptyState icon="📊" title="Select class and month" subtitle="Click Generate to load the monthly attendance report" />
      ) : (
        <div>
          {/* Monthly summary */}
          {data.summary && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
              {[
                { icon:'📅', label:'Working Days',   val:data.summary.workingDays||0,                                              color:'#1D4ED8', bg:'#EFF6FF', border:'#3B82F6', filter:null },
                { icon:'👥', label:'All Students',   val:data.summary.totalStudents||0,                                            color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6', filter:'all' },
                { icon:'✅', label:'Good (≥75%)',     val:(data.breakdown||[]).filter(s=>s.percentage>=75).length,                  color:'#16A34A', bg:'#F0FDF4', border:'#22C55E', filter:'good' },
                { icon:'⚠️', label:'Low (<75%)',     val:(data.lowStudents||data.breakdown?.filter(s=>s.percentage<75&&s.total>0)||[]).length, color:'#D97706', bg:'#FFFBEB', border:'#F59E0B', filter:'low' },
                { icon:'🏆', label:'Top (≥90%)',     val:(data.breakdown||[]).filter(s=>s.percentage>=90).length,                  color:'#059669', bg:'#ECFDF5', border:'#10B981', filter:'top' },
              ].map(c=>(
                <div key={c.label}
                  onClick={() => c.filter !== null && setActiveFilter(f => f===c.filter ? 'all' : c.filter)}
                  style={{
                    background: activeFilter===c.filter ? c.border+'22' : c.bg,
                    border: `1.5px solid ${activeFilter===c.filter ? c.border : c.border+'80'}`,
                    borderRadius:12, padding:'14px 16px',
                    cursor: c.filter !== null ? 'pointer' : 'default',
                    transition:'all 0.18s',
                    transform: activeFilter===c.filter ? 'translateY(-2px)' : '',
                    boxShadow: activeFilter===c.filter ? `0 4px 16px ${c.border}40` : '',
                  }}
                  onMouseEnter={e=>{ if(c.filter!==null){ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 4px 16px ${c.border}40`; }}}
                  onMouseLeave={e=>{ if(activeFilter!==c.filter){ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}}
                >
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:6 }}>
                    <div style={{ fontSize:20 }}>{c.icon}</div>
                    {c.filter !== null && <span style={{ fontSize:9, color:c.color, fontWeight:700, opacity:0.6 }}>{activeFilter===c.filter?'✓ Active':'Click'}</span>}
                  </div>
                  <div style={{ fontSize:22, fontWeight:900, color:c.color }}>{c.val}</div>
                  <div style={{ fontSize:11, fontWeight:700, color:'#374151', marginTop:3 }}>{c.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Calendar heatmap */}
          <div className="card" style={{ padding:20, marginBottom:20 }}>
            <div style={{ fontWeight:700, fontSize:14, marginBottom:16, display:'flex', justifyContent:'space-between' }}>
              <span>📅 Daily Attendance Heatmap — {MONTHS[month-1]} {year}</span>
              <div style={{ display:'flex', gap:8, alignItems:'center', fontSize:11 }}>
                {[['#16A34A','≥90%'],['#22C55E','≥75%'],['#F59E0B','≥50%'],['#EF4444','<50%'],['#F3F4F6','No data']].map(([c,l])=>(
                  <div key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                    <div style={{ width:12, height:12, borderRadius:3, background:c }}/>
                    <span style={{ color:'#6B7280' }}>{l}</span>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:6 }}>
              {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
                <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'#9CA3AF', paddingBottom:4 }}>{d}</div>
              ))}
              {/* Empty cells for first day of month */}
              {Array.from({ length: (new Date(year, month-1, 1).getDay() + 6) % 7 }).map((_,i)=>(
                <div key={`e${i}`}/>
              ))}
              {days.map(d => {
                // dailyTrend has date strings like '2026-04-09'
              const dateStr = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
              const dayData = (data.dailyTrend||[]).find(x => x.date === dateStr);
                const pctVal  = dayData?.percentage ?? null;
                const col     = dayColor(pctVal);
                const isToday = d === now.getDate() && month === now.getMonth()+1 && year === now.getFullYear();
                return (
                  <div key={d} title={pctVal !== null ? `Day ${d}: ${pctVal}% attendance` : `Day ${d}: No data`}
                    style={{
                      aspectRatio:'1', borderRadius:8, background:col,
                      display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                      fontSize:10, fontWeight:700, color: col==='#F3F4F6'?'#9CA3AF':'#fff',
                      border: isToday ? '2px solid #1D4ED8' : '1px solid transparent',
                      cursor:'default',
                    }}>
                    {d}
                    {pctVal !== null && <div style={{ fontSize:8, opacity:0.85 }}>{Math.round(pctVal)}%</div>}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Student-wise monthly breakdown */}
          {(data.breakdown || data.data || []).length > 0 && (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                <div style={{ fontWeight:700, fontSize:14 }}>
                  Student-wise Breakdown
                  {activeFilter && activeFilter !== 'all' && (
                    <span style={{ marginLeft:8, fontSize:12, color:'#1D4ED8', fontWeight:600 }}>({activeFilter})</span>
                  )}
                </div>
                {activeFilter && activeFilter !== 'all' && (
                  <button onClick={()=>setActiveFilter('all')} style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'3px 10px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>
                    ✕ Clear Filter
                  </button>
                )}
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#0B1F4A' }}>
                      {['Roll','Student','Present','Absent','Late','Excused','Attendance %','Status'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(data.breakdown || []).filter(r => {
                    if (activeFilter === 'all' || !activeFilter) return true;
                    if (activeFilter === 'low')  return r.percentage < 75 && r.total > 0;
                    if (activeFilter === 'good') return r.percentage >= 75;
                    if (activeFilter === 'top')  return r.percentage >= 90;
                    return true;
                  }).map((r, i) => {
                      const pct  = r.percentage ?? 0;
                      const rc   = pct >= 75 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
                      const name = r.student?.name || '—';
                      const roll = r.student?.rollNumber || '—';
                      return (
                        <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'10px 14px', color:'#6B7280', fontWeight:600 }}>{roll}</td>
                          <td style={{ padding:'10px 14px', fontWeight:700 }}>{name}</td>
                          <td style={{ padding:'10px 14px', color:'#16A34A', fontWeight:700 }}>{r.present??0}</td>
                          <td style={{ padding:'10px 14px', color:'#DC2626', fontWeight:700 }}>{r.absent??0}</td>
                          <td style={{ padding:'10px 14px', color:'#D97706', fontWeight:700 }}>{r.late??0}</td>
                          <td style={{ padding:'10px 14px', color:'#7C3AED', fontWeight:700 }}>{r.excused??0}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ flex:1, height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden', minWidth:60 }}>
                                <div style={{ height:'100%', width:`${Math.min(100,pct)}%`, background:rc, borderRadius:3 }}/>
                              </div>
                              <span style={{ fontSize:12, fontWeight:800, color:rc, minWidth:36 }}>{pct}%</span>
                            </div>
                          </td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{
                              fontSize:11, fontWeight:700,
                              color: pct>=75?'#16A34A':'#DC2626',
                              background: pct>=75?'#F0FDF4':'#FEF2F2',
                              border: `1px solid ${pct>=75?'#22C55E':'#EF4444'}40`,
                              padding:'2px 8px', borderRadius:10,
                            }}>
                              {pct>=75 ? '✅ Good' : pct>=50 ? '⚠️ Low' : '🔴 Critical'}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}


// ══════════════════════════════════════════════════════════════════════════════
// TAB 4 — STUDENT DATE-WISE HISTORY (admin: search any student, see all records)
// ══════════════════════════════════════════════════════════════════════════════
function StudentHistory({ classes }) {
  const [selectedClass, setSelectedClass] = useState('');
  const [students,      setStudents]      = useState([]);
  const [selectedStu,   setSelectedStu]   = useState('');
  const [dateFrom,      setDateFrom]      = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo,        setDateTo]        = useState(TODAY);
  const [records,       setRecords]       = useState([]);
  const [loading,       setLoading]       = useState(false);
  const [summary,       setSummary]       = useState(null);

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  useEffect(() => {
    if (!selectedClass) return;
    studentAPI.getAll({ class: selectedClass })
      .then(r => { setStudents(r.data.data || []); setSelectedStu(''); setRecords([]); setSummary(null); })
      .catch(() => {});
  }, [selectedClass]);

  const load = async () => {
    if (!selectedStu) return toast.error('Select a student');
    setLoading(true);
    try {
      const r = await attendanceAPI.getByStudent(selectedStu, { dateFrom, dateTo });
      const recs = r.data.data || r.data.records || [];
      setRecords(recs);
      // Compute summary
      const present = recs.filter(r => r.status === 'present').length;
      const absent  = recs.filter(r => r.status === 'absent').length;
      const late    = recs.filter(r => r.status === 'late').length;
      const excused = recs.filter(r => r.status === 'excused').length;
      const total   = recs.length;
      const pct     = total > 0 ? Math.round(((present + late) / total) * 100) : 0;
      setSummary({ present, absent, late, excused, total, pct });
    } catch { toast.error('Failed to load history'); }
    finally { setLoading(false); }
  };

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };
  const selectedStudent = students.find(s => s._id === selectedStu);

  return (
    <div>
      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>Class</div>
          <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} style={SEL}>
            {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>Student</div>
          <select value={selectedStu} onChange={e=>setSelectedStu(e.target.value)} style={{ ...SEL, minWidth:180 }}>
            <option value="">— Select Student —</option>
            {students.map(s=><option key={s._id} value={s._id}>{s.user?.name} (Roll {s.rollNumber||'—'})</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>From</div>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} max={TODAY} style={SEL} />
        </div>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>To</div>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} max={TODAY} style={SEL} />
        </div>
        <button onClick={load} disabled={loading || !selectedStu}
          style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor: !selectedStu?'not-allowed':'pointer', opacity: !selectedStu?0.5:1 }}>
          {loading ? '⏳' : '🔍'} Search
        </button>
      </div>

      {loading ? <LoadingState /> : !summary ? (
        <EmptyState icon="👤" title="Search a student" subtitle="Select a class, student and date range then click Search" />
      ) : (
        <div>
          {/* Student info + summary */}
          <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:16, padding:'20px 24px', marginBottom:18 }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:16 }}>
              <div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:6 }}>
                  {selectedStudent?.user?.name} · {new Date(dateFrom).toLocaleDateString('en-IN',{day:'numeric',month:'short'})} – {new Date(dateTo).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                </div>
                <div style={{ fontSize:32, fontWeight:900, color:'#fff' }}>
                  {summary.pct}% <span style={{ fontSize:14, color:'rgba(255,255,255,0.5)', fontWeight:400 }}>attendance</span>
                </div>
                <div style={{ fontSize:12, color:'rgba(255,255,255,0.4)', marginTop:4 }}>
                  {selectedStudent?.class?.name} {selectedStudent?.class?.section||''} · Roll {selectedStudent?.rollNumber||'—'}
                </div>
              </div>
              <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
                {[
                  { label:'Present', val:summary.present, color:'#34D399' },
                  { label:'Absent',  val:summary.absent,  color:'#FCA5A5' },
                  { label:'Late',    val:summary.late,    color:'#FCD34D' },
                  { label:'Excused', val:summary.excused, color:'#C4B5FD' },
                  { label:'Total',   val:summary.total,   color:'rgba(255,255,255,0.6)' },
                ].map(s=>(
                  <div key={s.label} style={{ textAlign:'center' }}>
                    <div style={{ fontSize:22, fontWeight:900, color:'#fff' }}>{s.val}</div>
                    <div style={{ fontSize:9, color:s.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                  </div>
                ))}
              </div>
            </div>
            <div style={{ height:6, background:'rgba(255,255,255,0.1)', borderRadius:4, marginTop:14, overflow:'hidden' }}>
              <div style={{ height:'100%', width:`${Math.min(100,summary.pct)}%`, borderRadius:4,
                background: summary.pct>=75?'#34D399':'#FCD34D', transition:'width 0.8s' }}/>
            </div>
          </div>

          {/* Warning */}
          {summary.pct < 75 && summary.total > 0 && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'12px 16px', marginBottom:16, display:'flex', gap:10, alignItems:'center' }}>
              <span style={{ fontSize:20 }}>⚠️</span>
              <div style={{ fontSize:13, color:'#991B1B', fontWeight:600 }}>
                {selectedStudent?.user?.name}'s attendance is {summary.pct}% — below the required 75%
              </div>
            </div>
          )}

          {/* Date-wise records table */}
          {records.length === 0 ? (
            <EmptyState icon="📅" title="No records found" subtitle="No attendance records for this date range" />
          ) : (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14, display:'flex', justifyContent:'space-between' }}>
                <span>Date-wise Attendance ({records.length} records)</span>
                <span style={{ fontSize:12, color:'#9CA3AF' }}>{new Date(dateFrom).toLocaleDateString('en-IN')} to {new Date(dateTo).toLocaleDateString('en-IN')}</span>
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#0B1F4A' }}>
                      {['#','Date','Day','Status','Remarks','Marked By','Time'].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...records].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>{
                      const cfg = STATUS_CONFIG[r.status]||STATUS_CONFIG.unmarked;
                      const dt  = new Date(r.date);
                      return (
                        <tr key={r._id||i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:11 }}>{records.length-i}</td>
                          <td style={{ padding:'9px 14px', fontWeight:700, whiteSpace:'nowrap' }}>
                            {dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                          </td>
                          <td style={{ padding:'9px 14px', color:'#6B7280' }}>
                            {dt.toLocaleDateString('en-IN',{weekday:'long'})}
                          </td>
                          <td style={{ padding:'9px 14px' }}>
                            <span style={{ fontSize:12, fontWeight:700, color:cfg.color, background:cfg.bg, border:`1px solid ${cfg.border}50`, padding:'3px 10px', borderRadius:20 }}>
                              {cfg.label||r.status}
                            </span>
                          </td>
                          <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:12 }}>{r.remarks||'—'}</td>
                          <td style={{ padding:'9px 14px', color:'#6B7280', fontSize:12 }}>{r.markedBy?.name||'—'}</td>
                          <td style={{ padding:'9px 14px', color:'#6B7280', fontSize:12 }}>
                            {r.createdAt ? new Date(r.createdAt).toLocaleTimeString('en-IN',{hour:'2-digit',minute:'2-digit'}) : '—'}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN — tab controller
// ══════════════════════════════════════════════════════════════════════════════
export default function Attendance() {
  const { isAdmin, isTeacher } = useAuth();
  const [tab,     setTab]     = useState('mark');
  const [classes, setClasses] = useState([]);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  const canEdit = isAdmin || isTeacher;

  const TABS = [
    { key:'mark',    label:'✏️ Mark Attendance',  show: canEdit },
    { key:'daily',   label:'📋 Class Daily View',  show: true },
    { key:'monthly', label:'📊 Monthly Report',    show: true },
    { key:'history', label:'👤 Student History',   show: canEdit },
  ].filter(t => t.show);

  // If teacher only, default to mark
  useEffect(() => {
    if (!canEdit) setTab('daily');
  }, [canEdit]);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">📅 Attendance</h2>
          <p className="text-sm text-muted mt-0.5">Mark, view and analyse class attendance</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', transition:'all 0.15s',
            background: tab===t.key ? '#1D4ED8' : 'transparent',
            color:      tab===t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'mark'    && <MarkAttendance  classes={classes} />}
      {tab === 'daily'   && <ClassDailyView  classes={classes} />}
      {tab === 'monthly' && <MonthlyReport   classes={classes} />}
      {tab === 'history' && <StudentHistory  classes={classes} />}
    </div>
  );
}