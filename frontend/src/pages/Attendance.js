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
// TAB 3 — MONTHLY REPORT (eSkooly-style date range table)
// ══════════════════════════════════════════════════════════════════════════════
function MonthlyReport({ classes }) {
  const now = new Date();

  // Default date range: 1st of current month → today
  const firstOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().split('T')[0];
  const todayStr     = now.toISOString().split('T')[0];

  const [selectedClass, setSelectedClass] = useState('');
  const [dateFrom,      setDateFrom]      = useState(firstOfMonth);
  const [dateTo,        setDateTo]        = useState(todayStr);
  const [rows,          setRows]          = useState([]);        // flat list: { date, day, id, name, class, status }
  const [loading,       setLoading]       = useState(false);
  const [search,        setSearch]        = useState('');
  const [sortCol,       setSortCol]       = useState('date');
  const [sortDir,       setSortDir]       = useState('asc');
  const [generated,     setGenerated]     = useState(false);

  useEffect(() => {
    if (classes.length && !selectedClass) setSelectedClass(classes[0]._id);
  }, [classes]);

  const generate = async () => {
    if (!selectedClass) return toast.error('Select a class first');
    setLoading(true);
    setGenerated(false);
    try {
      // Derive month/year from dateFrom for the analytics endpoint
      const from  = new Date(dateFrom);
      const month = from.getMonth() + 1;
      const year  = from.getFullYear();
      const r     = await attendanceAPI.getClassAnalytics(selectedClass, month, year);
      const data  = r.data.data || r.data;

      // Build flat rows from breakdown + days map
      const flatRows = [];
      const fromD = new Date(dateFrom);
      const toD   = new Date(dateTo);

      (data.breakdown || []).forEach(entry => {
        const studentName = entry.student?.name || '—';
        const rollNo      = entry.student?.rollNumber || entry.student?.admissionNumber || '—';
        const cls         = classes.find(c => c._id === selectedClass);
        const className   = cls ? `${cls.name} ${cls.section || ''}`.trim() : '—';

        Object.entries(entry.days || {}).forEach(([day, status]) => {
          const date = new Date(year, month - 1, parseInt(day));
          if (date >= fromD && date <= toD) {
            flatRows.push({
              date,
              dateStr: date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
              day:     date.toLocaleDateString('en-IN', { weekday:'long' }),
              id:      rollNo,
              name:    studentName,
              class:   className,
              status:  status.charAt(0).toUpperCase() + status.slice(1),
            });
          }
        });
      });

      // Sort by date then name by default
      flatRows.sort((a, b) => a.date - b.date || a.name.localeCompare(b.name));
      setRows(flatRows);
      setGenerated(true);
    } catch { toast.error('Failed to load attendance report'); }
    finally { setLoading(false); }
  };

  // Sorting
  const handleSort = (col) => {
    if (sortCol === col) setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  // Filter + sort
  const filtered = rows
    .filter(r => {
      const q = search.toLowerCase();
      return !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) || r.status.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      let av, bv;
      if (sortCol === 'date')   { av = a.date;   bv = b.date; }
      else if (sortCol === 'day')    { av = a.day;    bv = b.day; }
      else if (sortCol === 'id')     { av = a.id;     bv = b.id; }
      else if (sortCol === 'name')   { av = a.name;   bv = b.name; }
      else if (sortCol === 'class')  { av = a.class;  bv = b.class; }
      else if (sortCol === 'status') { av = a.status; bv = b.status; }
      else return 0;
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ?  1 : -1;
      return 0;
    });

  // Export helpers
  const toCSV = () => {
    const header = 'DATE,DAY,ID,NAME,CLASS,STATUS\n';
    const body   = filtered.map(r => `${r.dateStr},${r.day},${r.id},${r.name},${r.class},${r.status}`).join('\n');
    const blob   = new Blob([header + body], { type:'text/csv' });
    const url    = URL.createObjectURL(blob);
    const a      = document.createElement('a'); a.href = url; a.download = 'attendance-report.csv'; a.click();
  };

  const copyTable = () => {
    const text = filtered.map(r => `${r.dateStr}\t${r.day}\t${r.id}\t${r.name}\t${r.class}\t${r.status}`).join('\n');
    navigator.clipboard.writeText(text).then(() => toast.success('Copied to clipboard'));
  };

  const printTable = () => window.print();

  const statusColor = (s) => {
    const sl = s.toLowerCase();
    if (sl === 'present') return { color:'#166534', bg:'#DCFCE7' };
    if (sl === 'absent')  return { color:'#991B1B', bg:'#FEE2E2' };
    if (sl === 'late')    return { color:'#92400E', bg:'#FEF3C7' };
    return { color:'#374151', bg:'#F3F4F6' };
  };

  const SortIcon = ({ col }) => (
    <span style={{ marginLeft:4, opacity: sortCol===col ? 1 : 0.35, fontSize:10 }}>
      {sortCol===col ? (sortDir==='asc' ? '↑' : '↓') : '↕'}
    </span>
  );

  const SEL = { padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, background:'#fff', outline:'none' };
  const BTN = { padding:'5px 14px', borderRadius:6, border:'1px solid #D1D5DB', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Date range bar — eSkooly style */}
      <div style={{ background:'#3B5BDB', borderRadius:10, padding:'10px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
        <span style={{ color:'#fff', fontSize:14 }}>📅</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)}
          style={{ ...SEL, minWidth:140 }} />
        <span style={{ color:'#fff', fontWeight:600 }}>→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)}
          style={{ ...SEL, minWidth:140 }} />
        <select value={selectedClass} onChange={e=>setSelectedClass(e.target.value)} style={{ ...SEL, minWidth:140 }}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <button onClick={generate} disabled={loading}
          style={{ padding:'7px 20px', borderRadius:8, background:'#fff', color:'#3B5BDB', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }}>
          {loading ? '⏳ Loading…' : '⚙ Generate'}
        </button>
      </div>

      {!generated ? (
        <div style={{ textAlign:'center', padding:'60px 20px', color:'#9CA3AF', background:'#fff', borderRadius:12, border:'1px solid #E5E7EB' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:600, fontSize:16, color:'#374151' }}>Select class and date range</div>
          <div style={{ fontSize:13, marginTop:6 }}>Click Generate to load the attendance report</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>

          {/* Toolbar: Copy CSV Excel PDF Print | Search */}
          <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ display:'flex', gap:6 }}>
              <button style={BTN} onClick={copyTable}>Copy</button>
              <button style={BTN} onClick={toCSV}>CSV</button>
              <button style={BTN} onClick={toCSV}>Excel</button>
              <button style={{ ...BTN, background:'#DC2626', color:'#fff', border:'none' }} onClick={printTable}>PDF</button>
              <button style={BTN} onClick={printTable}>Print</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, color:'#6B7280' }}>Search:</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                style={{ padding:'5px 10px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:13, outline:'none', width:180 }}
                placeholder="Name, ID, status…" />
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {[
                    { key:'date',   label:'DATE'   },
                    { key:'day',    label:'DAY'    },
                    { key:'id',     label:'ID'     },
                    { key:'name',   label:'NAME'   },
                    { key:'class',  label:'CLASS'  },
                    { key:'status', label:'STATUS' },
                  ].map(({ key, label }) => (
                    <th key={key} onClick={() => handleSort(key)}
                      style={{ padding:'11px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap', cursor:'pointer', userSelect:'none' }}>
                      {label}<SortIcon col={key} />
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length === 0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:'40px', color:'#9CA3AF', fontSize:13 }}>No data available in table</td></tr>
                ) : filtered.map((r, i) => {
                  const sc = statusColor(r.status);
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background: i%2 ? '#FAFAFA' : '#fff' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                      <td style={{ padding:'10px 14px', color:'#374151', fontWeight:500 }}>{r.dateStr}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.day}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#374151' }}>{r.id}</td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#111827' }}>{r.name}</td>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{r.class}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color }}>
                          {r.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', fontSize:12, color:'#6B7280' }}>
            Showing {filtered.length} of {rows.length} entries
          </div>
        </div>
      )}
    </div>
  );
}


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