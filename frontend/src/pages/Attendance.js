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
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:12 }}>
          {students.map(s => {
            const status = attendance[s._id] || 'unmarked';
            const cfg    = STATUS_CONFIG[status];
            return (
              <div key={s._id} style={{
                background:cfg.bg, border:`2px solid ${cfg.border}`,
                borderRadius:14, padding:'16px 12px', textAlign:'center',
                transition:'all 0.15s',
              }}>
                <Avatar name={s.user?.name} size="md" />
                <div style={{ fontWeight:700, fontSize:13, color:'#111827', marginTop:8, lineHeight:1.3 }}>{s.user?.name}</div>
                <div style={{ fontSize:11, color:'#9CA3AF', marginBottom:10 }}>Roll {s.rollNumber||'—'}</div>
                <div style={{ display:'flex', gap:4 }}>
                  {['present','absent','late','excused'].map(st => {
                    const c = STATUS_CONFIG[st];
                    const isActive = status === st;
                    return (
                      <button key={st} onClick={() => canEdit && mark(s._id, st)}
                        title={c.label}
                        style={{
                          flex:1, padding:'5px 0', borderRadius:7, fontSize:11, fontWeight:800,
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
              </div>
            );
          })}
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

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  const load = async () => {
    if (!selectedClass) return;
    setLoading(true);
    try {
      const r = await attendanceAPI.getMonthlyReport(selectedClass, month, year);
      setData(r.data);
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
          {data.meta && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(150px,1fr))', gap:12, marginBottom:20 }}>
              {[
                { icon:'📅', label:'Working Days',    val:data.meta.workingDays||0,                          color:'#1D4ED8', bg:'#EFF6FF', border:'#3B82F6' },
                { icon:'✅', label:'Avg Present',      val:`${data.meta.avgPresentPct||0}%`,                  color:'#16A34A', bg:'#F0FDF4', border:'#22C55E' },
                { icon:'❌', label:'Avg Absent',       val:`${data.meta.avgAbsentPct||0}%`,                   color:'#DC2626', bg:'#FEF2F2', border:'#EF4444' },
                { icon:'👥', label:'Total Students',   val:data.meta.totalStudents||0,                        color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6' },
                { icon:'⚠️', label:'Low Attendance',  val:data.meta.lowAttendanceCount||0,                    color:'#D97706', bg:'#FFFBEB', border:'#F59E0B' },
              ].map(c=>(
                <div key={c.label} style={{ background:c.bg, border:`1.5px solid ${c.border}`, borderRadius:12, padding:'14px 16px' }}>
                  <div style={{ fontSize:20, marginBottom:6 }}>{c.icon}</div>
                  <div style={{ fontSize:20, fontWeight:900, color:c.color }}>{c.val}</div>
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
                const dayData = data.data?.find?.(x => x.day === d) || data.breakdown?.find?.(x => x.day === d);
                const pctVal  = dayData?.presentPct ?? dayData?.percentage ?? null;
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
              <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>
                Student-wise Monthly Breakdown
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
                    {(data.breakdown || data.data || []).filter(r => r.studentName || r.student).map((r, i) => {
                      const pct  = r.presentPct ?? r.percentage ?? (r.totalDays > 0 ? Math.round((r.present/r.totalDays)*100) : 0);
                      const rc   = pct >= 75 ? '#16A34A' : pct >= 50 ? '#D97706' : '#DC2626';
                      const name = r.studentName || r.student?.user?.name || '—';
                      const roll = r.rollNumber  || r.student?.rollNumber  || '—';
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
    </div>
  );
}