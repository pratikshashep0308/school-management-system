// frontend/src/pages/Attendance/StudentAttendanceSection.js
// Rich attendance view for Student and Parent portals
// Shows: summary ring, monthly calendar heatmap, record list, month switcher
import React, { useEffect, useState, useCallback } from 'react';
import { studentPortalAPI } from '../../utils/studentPortalAPI';
import { attendanceAPI } from '../../utils/api';
import { LoadingState } from '../../components/ui';
import toast from 'react-hot-toast';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS = {
  present: { color:'#16A34A', bg:'#F0FDF4', border:'#22C55E', label:'Present',  dot:'#16A34A' },
  absent:  { color:'#DC2626', bg:'#FEF2F2', border:'#EF4444', label:'Absent',   dot:'#DC2626' },
  late:    { color:'#D97706', bg:'#FFFBEB', border:'#F59E0B', label:'Late',     dot:'#F59E0B' },
  excused: { color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6', label:'Excused',  dot:'#8B5CF6' },
};

// ── Animated ring chart ───────────────────────────────────────────────────────
function Ring({ pct, size = 120, stroke = 12 }) {
  const R    = (size - stroke) / 2;
  const cx   = size / 2, cy = size / 2;
  const circ = 2 * Math.PI * R;
  const color = pct >= 75 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke="#F3F4F6" strokeWidth={stroke}/>
      <circle cx={cx} cy={cy} r={R} fill="none" stroke={color} strokeWidth={stroke}
        strokeDasharray={`${(pct/100)*circ} ${circ}`}
        strokeDashoffset={circ * 0.25}
        strokeLinecap="round"
        style={{ transition:'stroke-dasharray 1s ease' }}/>
      <text x={cx} y={cy - 8} textAnchor="middle" fontSize={size*0.18} fontWeight="900" fill={color}>{pct}%</text>
      <text x={cx} y={cy + 10} textAnchor="middle" fontSize={size*0.09} fill="#9CA3AF">Attendance</text>
    </svg>
  );
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────
function CalendarHeatmap({ records, month, year }) {
  const daysInMonth  = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7; // Mon=0

  // Build day → status map
  const dayMap = {};
  records.forEach(r => {
    const d = new Date(r.date);
    dayMap[d.getDate()] = r.status;
  });

  const days = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const empties = Array.from({ length: firstDayOfWeek });

  const bgColor = (status) => {
    if (!status) return '#F3F4F6';
    return STATUS[status]?.bg || '#F3F4F6';
  };
  const textColor = (status) => {
    if (!status) return '#9CA3AF';
    return STATUS[status]?.color || '#6B7280';
  };

  return (
    <div>
      {/* Day headers */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
        {['Mon','Tue','Wed','Thu','Fri','Sat','Sun'].map(d=>(
          <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'#9CA3AF', padding:'2px 0' }}>{d}</div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {empties.map((_,i) => <div key={`e${i}`}/>)}
        {days.map(d => {
          const status  = dayMap[d];
          const isToday = d === new Date().getDate() &&
                          month === new Date().getMonth()+1 &&
                          year  === new Date().getFullYear();
          return (
            <div key={d} title={status ? `${d} ${MONTHS[month-1]}: ${STATUS[status]?.label}` : `${d} ${MONTHS[month-1]}: Not marked`}
              style={{
                aspectRatio:'1', borderRadius:8,
                background: bgColor(status),
                border: isToday ? '2px solid #1D4ED8' : `1px solid ${status ? STATUS[status]?.border+'40' : '#E5E7EB'}`,
                display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center',
                cursor:'default',
              }}>
              <span style={{ fontSize:11, fontWeight:700, color:textColor(status) }}>{d}</span>
              {status && <span style={{ fontSize:8, fontWeight:800, color:textColor(status), opacity:0.8 }}>{STATUS[status]?.label[0]}</span>}
            </div>
          );
        })}
      </div>
      {/* Legend */}
      <div style={{ display:'flex', gap:12, marginTop:12, flexWrap:'wrap' }}>
        {Object.entries(STATUS).map(([k,v])=>(
          <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
            <div style={{ width:10, height:10, borderRadius:3, background:v.bg, border:`1px solid ${v.border}50` }}/>
            <span style={{ fontSize:11, color:'#6B7280' }}>{v.label}</span>
          </div>
        ))}
        <div style={{ display:'flex', alignItems:'center', gap:5 }}>
          <div style={{ width:10, height:10, borderRadius:3, background:'#F3F4F6', border:'1px solid #E5E7EB' }}/>
          <span style={{ fontSize:11, color:'#6B7280' }}>Not Marked</span>
        </div>
      </div>
    </div>
  );
}


// ── Date-wise history sub-component ──────────────────────────────────────────
function DateWiseHistory({ studentId, dashboardAttendance }) {
  const now = new Date();
  const [dateFrom, setDateFrom] = useState(() => {
    const d = new Date(); d.setMonth(d.getMonth() - 1);
    return d.toISOString().split('T')[0];
  });
  const [dateTo,   setDateTo]   = useState(now.toISOString().split('T')[0]);
  const [records,  setRecords]  = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [summary,  setSummary]  = useState(null);
  const [loaded,   setLoaded]   = useState(false);

  const STATUS = {
    present: { color:'#16A34A', bg:'#F0FDF4', border:'#22C55E', label:'Present' },
    absent:  { color:'#DC2626', bg:'#FEF2F2', border:'#EF4444', label:'Absent'  },
    late:    { color:'#D97706', bg:'#FFFBEB', border:'#F59E0B', label:'Late'    },
    excused: { color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6', label:'Excused' },
  };

  const load = async () => {
    setLoading(true);
    try {
      // Use studentPortalAPI for student/parent — it only returns their own data
      const r = await studentPortalAPI.getAttendance(null, null);
      // Filter by date range client-side since portal API supports month/year not date range
      const all = r.data.data?.records || [];
      const from = new Date(dateFrom); from.setHours(0,0,0,0);
      const to   = new Date(dateTo);   to.setHours(23,59,59,999);
      const filtered = all.filter(rec => {
        const d = new Date(rec.date);
        return d >= from && d <= to;
      });
      setRecords(filtered.sort((a,b) => new Date(b.date)-new Date(a.date)));
      const present = filtered.filter(r=>r.status==='present').length;
      const absent  = filtered.filter(r=>r.status==='absent').length;
      const late    = filtered.filter(r=>r.status==='late').length;
      const excused = filtered.filter(r=>r.status==='excused').length;
      const total   = filtered.length;
      const pct     = total>0 ? Math.round(((present+late)/total)*100) : 0;
      setSummary({ present, absent, late, excused, total, pct });
      setLoaded(true);
    } catch {
      // fallback — just use dashboard data
      setRecords([]);
      setSummary(null);
      setLoaded(true);
    } finally { setLoading(false); }
  };

  const SEL = { padding:'7px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'flex-end', marginBottom:16 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>From Date</div>
          <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} max={dateTo} style={SEL} />
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>To Date</div>
          <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} max={now.toISOString().split('T')[0]} style={SEL} />
        </div>
        <button onClick={load} disabled={loading} style={{
          padding:'8px 18px', borderRadius:8, fontSize:12, fontWeight:700,
          background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer', opacity:loading?0.6:1,
        }}>
          {loading ? '⏳' : '🔍'} Search
        </button>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:24, color:'#9CA3AF' }}>Loading…</div>
      ) : !loaded ? (
        <div style={{ textAlign:'center', padding:24, color:'#9CA3AF' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📆</div>
          <div style={{ fontWeight:600, color:'#374151' }}>Select date range and click Search</div>
        </div>
      ) : records.length === 0 ? (
        <div style={{ textAlign:'center', padding:24, color:'#9CA3AF' }}>
          <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
          <div style={{ fontWeight:600, color:'#374151' }}>No records in this date range</div>
        </div>
      ) : (
        <div>
          {/* Summary strip */}
          {summary && (
            <div style={{ display:'flex', gap:12, flexWrap:'wrap', background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:12, padding:'14px 18px', marginBottom:14 }}>
              {[
                { label:'Present', val:summary.present, color:'#34D399' },
                { label:'Absent',  val:summary.absent,  color:'#FCA5A5' },
                { label:'Late',    val:summary.late,    color:'#FCD34D' },
                { label:'Total',   val:summary.total,   color:'rgba(255,255,255,0.6)' },
                { label:'Rate',    val:`${summary.pct}%`, color:summary.pct>=75?'#34D399':'#FCD34D' },
              ].map(s=>(
                <div key={s.label} style={{ textAlign:'center', minWidth:50 }}>
                  <div style={{ fontSize:18, fontWeight:900, color:'#fff' }}>{s.val}</div>
                  <div style={{ fontSize:9, color:s.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                </div>
              ))}
            </div>
          )}

          {/* Table */}
          <div className="card" style={{ padding:0, overflow:'hidden' }}>
            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0B1F4A' }}>
                    {['#','Date','Day','Status','Remarks','Marked By'].map(h=>(
                      <th key={h} style={{ padding:'9px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {records.map((r,i)=>{
                    const s  = STATUS[r.status]||STATUS.present;
                    const dt = new Date(r.date);
                    return (
                      <tr key={r._id||i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                        <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:11 }}>{i+1}</td>
                        <td style={{ padding:'9px 14px', fontWeight:700, whiteSpace:'nowrap' }}>
                          {dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                        </td>
                        <td style={{ padding:'9px 14px', color:'#6B7280' }}>
                          {dt.toLocaleDateString('en-IN',{weekday:'long'})}
                        </td>
                        <td style={{ padding:'9px 14px' }}>
                          <span style={{ fontSize:12, fontWeight:700, color:s.color, background:s.bg, border:`1px solid ${s.border}50`, padding:'3px 10px', borderRadius:20 }}>
                            {s.label}
                          </span>
                        </td>
                        <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:12 }}>{r.remarks||'—'}</td>
                        <td style={{ padding:'9px 14px', color:'#6B7280', fontSize:12 }}>{r.markedBy?.name||'—'}</td>
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

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentAttendanceSection({ dashboardAttendance, studentId }) {
  const now   = new Date();
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(false);
  const [view,    setView]    = useState('calendar'); // 'calendar' | 'list' | 'history'

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await studentPortalAPI.getAttendance(month, year);
      setData(r.data.data);
    } catch { toast.error('Failed to load attendance'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const summary  = data?.summary || dashboardAttendance || { present:0, absent:0, late:0, total:0, percentage:0 };
  const records  = data?.records || [];
  const pct      = summary.percentage || (summary.total > 0 ? Math.round(((summary.present+(summary.late||0))/summary.total)*100) : 0);

  const SEL = { padding:'7px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none', cursor:'pointer' };

  return (
    <div className="space-y-5">

      {/* Month selector */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
            {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          {/* Prev / Next arrows */}
          <button onClick={()=>{ if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); }}
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>←</button>
          <button onClick={()=>{ if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); }}
            disabled={month===now.getMonth()+1&&year===now.getFullYear()}
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, opacity:month===now.getMonth()+1&&year===now.getFullYear()?0.4:1 }}>→</button>
        </div>
        {/* View toggle */}
        <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:8, padding:3 }}>
          {[['calendar','📅 Calendar'],['list','📋 List'],['history','📆 History']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{
              padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:700,
              border:'none', cursor:'pointer',
              background: view===k ? '#fff' : 'transparent',
              color:      view===k ? '#1D4ED8' : '#6B7280',
              boxShadow:  view===k ? '0 1px 4px rgba(0,0,0,0.08)' : 'none',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState /> : (
        <>
          {/* Summary card */}
          <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:16, padding:'20px 24px' }}>
            <div style={{ display:'flex', alignItems:'center', gap:20, flexWrap:'wrap' }}>
              <Ring pct={pct} size={110} stroke={12} />
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>
                  {MONTHS[month-1]} {year} · Attendance Summary
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                  {[
                    { label:'Present',  val:summary.present||0,      color:'#34D399' },
                    { label:'Absent',   val:summary.absent||0,       color:'#FCA5A5' },
                    { label:'Late',     val:summary.late||0,          color:'#FCD34D' },
                    { label:'Total Days',val:summary.total||records.length||0, color:'rgba(255,255,255,0.6)' },
                  ].map(s=>(
                    <div key={s.label}>
                      <div style={{ fontSize:22, fontWeight:900, color:'#fff' }}>{s.val}</div>
                      <div style={{ fontSize:10, color:s.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>

                {/* Progress bar */}
                <div style={{ marginTop:14 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.45)' }}>Attendance Rate</span>
                    <span style={{ fontSize:11, fontWeight:800, color: pct>=75?'#34D399':'#FCD34D' }}>{pct}% {pct>=75?'✅':'⚠️'}</span>
                  </div>
                  <div style={{ height:6, background:'rgba(255,255,255,0.1)', borderRadius:4, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:pct>=75?'#34D399':'#FCD34D', borderRadius:4, transition:'width 1s' }}/>
                  </div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.3)', marginTop:4 }}>Minimum required: 75%</div>
                </div>
              </div>
            </div>
          </div>

          {/* Warning if low */}
          {pct < 75 && pct > 0 && (
            <div style={{ background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:12, padding:'14px 16px', display:'flex', gap:10 }}>
              <span style={{ fontSize:22, flexShrink:0 }}>⚠️</span>
              <div>
                <div style={{ fontWeight:700, fontSize:14, color:'#991B1B' }}>Attendance Warning</div>
                <div style={{ fontSize:13, color:'#B91C1C', marginTop:3 }}>
                  Your attendance is {pct}%. Minimum 75% is required. You need to attend more classes to avoid shortfall.
                </div>
              </div>
            </div>
          )}

          {/* Calendar / List view */}
          {records.length === 0 ? (
            <div style={{ textAlign:'center', padding:'32px', color:'#9CA3AF' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>📅</div>
              <div style={{ fontSize:15, fontWeight:700, color:'#374151' }}>No attendance data</div>
              <div style={{ fontSize:13, marginTop:4 }}>No attendance records found for {MONTHS[month-1]} {year}</div>
            </div>
          ) : view === 'history' ? null : view === 'calendar' ? (
            <div className="card" style={{ padding:20 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>📅 {MONTHS[month-1]} {year} — Calendar View</div>
              <CalendarHeatmap records={records} month={month} year={year} />
            </div>
          ) : (
            /* List view */
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>
                📋 {MONTHS[month-1]} {year} — Attendance Records ({records.length})
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#0B1F4A' }}>
                      {['Date','Day','Status','Remarks','Marked By'].map(h=>(
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...records].sort((a,b) => new Date(b.date)-new Date(a.date)).map((r,i)=>{
                      const s   = STATUS[r.status] || STATUS.present;
                      const dt  = new Date(r.date);
                      return (
                        <tr key={r._id||i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'9px 14px', fontWeight:600, whiteSpace:'nowrap' }}>
                            {dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                          </td>
                          <td style={{ padding:'9px 14px', color:'#6B7280' }}>
                            {dt.toLocaleDateString('en-IN',{weekday:'short'})}
                          </td>
                          <td style={{ padding:'9px 14px' }}>
                            <span style={{
                              fontSize:12, fontWeight:700, color:s.color,
                              background:s.bg, border:`1px solid ${s.border}50`,
                              padding:'3px 10px', borderRadius:20,
                            }}>{s.label}</span>
                          </td>
                          <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:12 }}>{r.remarks||'—'}</td>
                          <td style={{ padding:'9px 14px', color:'#6B7280', fontSize:12 }}>{r.markedBy?.name||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* ── Date-wise History view ── */}
          {view === 'history' && (
            <DateWiseHistory studentId={studentId} dashboardAttendance={dashboardAttendance} />
          )}

          {/* Quick stats bar */}
          {view !== 'history' && records.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
              {[
                { label:'Days Present',  val:summary.present||0,  color:'#16A34A', bg:'#F0FDF4', icon:'✅' },
                { label:'Days Absent',   val:summary.absent||0,   color:'#DC2626', bg:'#FEF2F2', icon:'❌' },
                { label:'Days Late',     val:summary.late||0,     color:'#D97706', bg:'#FFFBEB', icon:'⏰' },
                { label:'Total Marked',  val:summary.total||records.length, color:'#1D4ED8', bg:'#EFF6FF', icon:'📋' },
              ].map(s=>(
                <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'12px 14px', display:'flex', alignItems:'center', gap:10 }}>
                  <span style={{ fontSize:18 }}>{s.icon}</span>
                  <div>
                    <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
                    <div style={{ fontSize:10, color:'#6B7280', fontWeight:600 }}>{s.label}</div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}
