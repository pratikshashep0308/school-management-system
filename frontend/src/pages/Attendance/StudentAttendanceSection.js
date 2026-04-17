/* eslint-disable react-hooks/exhaustive-deps */
// Student & Parent portal attendance view
// Uses studentPortalAPI - returns only the student's own data
import React, { useEffect, useState, useCallback } from 'react';
import { studentPortalAPI } from '../../utils/studentPortalAPI';
import { LoadingState } from '../../components/ui';
import toast from 'react-hot-toast';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

const STATUS = {
  present: { color:'#16A34A', bg:'#F0FDF4', border:'#22C55E', label:'Present' },
  absent:  { color:'#DC2626', bg:'#FEF2F2', border:'#EF4444', label:'Absent'  },
  late:    { color:'#D97706', bg:'#FFFBEB', border:'#F59E0B', label:'Late'    },
  excused: { color:'#7C3AED', bg:'#F5F3FF', border:'#8B5CF6', label:'Excused' },
};

// ── Ring chart ────────────────────────────────────────────────────────────────
function Ring({ pct, size = 100, stroke = 10 }) {
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const fill = (pct / 100) * c;
  const col = pct >= 75 ? '#16A34A' : pct >= 50 ? '#F59E0B' : '#DC2626';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{ transform:'rotate(-90deg)' }}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
        strokeDasharray={`${fill} ${c - fill}`} strokeLinecap="round"/>
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{ transform:'rotate(90deg)', transformOrigin:'center', fontSize: size*0.18, fontWeight:900, fill:'#fff' }}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Calendar heatmap ──────────────────────────────────────────────────────────
function CalendarHeatmap({ records, month, year }) {
  const daysInMonth    = new Date(year, month, 0).getDate();
  const firstDayOfWeek = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const recordMap      = {};
  records.forEach(r => {
    const d = new Date(r.date);
    if (d.getMonth() + 1 === month && d.getFullYear() === year) {
      recordMap[d.getDate()] = r.status;
    }
  });

  const textColor = (status) => STATUS[status]?.color || '#9CA3AF';

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4, marginBottom:4 }}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:10, fontWeight:700, color:'rgba(255,255,255,0.4)', padding:'2px 0' }}>{d}</div>
        ))}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:4 }}>
        {Array.from({ length: firstDayOfWeek }).map((_,i) => <div key={'e'+i}/>)}
        {Array.from({ length: daysInMonth }, (_,i) => i+1).map(d => {
          const status = recordMap[d];
          const isToday = d === new Date().getDate() &&
                          month === new Date().getMonth()+1 &&
                          year  === new Date().getFullYear();
          return (
            <div key={d} title={status ? `${d}: ${STATUS[status]?.label}` : `${d}: Not marked`}
              style={{
                aspectRatio:'1', borderRadius:6, display:'flex', alignItems:'center', justifyContent:'center',
                fontSize:11, fontWeight:700,
                background: status ? STATUS[status].bg : 'rgba(255,255,255,0.06)',
                color: status ? textColor(status) : 'rgba(255,255,255,0.3)',
                border: isToday ? '2px solid rgba(255,255,255,0.5)' : `1px solid ${status ? STATUS[status].border+'40' : 'transparent'}`,
              }}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function StudentAttendanceSection({ dashboardAttendance, studentId }) {
  const now  = new Date();
  const [month,   setMonth]   = useState(now.getMonth() + 1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view,    setView]    = useState('calendar');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await studentPortalAPI.getAttendance(month, year);
      const d = r.data.data;
      setRecords(d?.records || []);
      setSummary(d?.summary || null);
    } catch (err) {
      // 403 fallback — use dashboard data
      if (err?.response?.status === 403 && dashboardAttendance) {
        setRecords(dashboardAttendance.records || []);
        setSummary({
          present:    dashboardAttendance.present    || 0,
          absent:     dashboardAttendance.absent     || 0,
          late:       dashboardAttendance.late       || 0,
          total:      dashboardAttendance.total      || 0,
          percentage: dashboardAttendance.percentage || 0,
        });
      } else if (err?.response?.status !== 403) {
        toast.error('Failed to load attendance');
      }
    } finally { setLoading(false); }
  }, [month, year, dashboardAttendance]);

  useEffect(() => { load(); }, [load]);

  const sum = summary || dashboardAttendance || { present:0, absent:0, late:0, total:0, percentage:0 };
  const pct = sum.percentage || (sum.total > 0 ? Math.round(((sum.present + (sum.late||0)) / sum.total) * 100) : 0);

  // Month records only
  const monthRecords = records.filter(r => {
    const d = new Date(r.date);
    return d.getMonth()+1 === month && d.getFullYear() === year;
  });

  const SEL = { padding:'7px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none', cursor:'pointer' };

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:16 }}>

      {/* Controls */}
      <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', justifyContent:'space-between' }}>
        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
            {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={()=>{ if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1); }}
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>←</button>
          <button onClick={()=>{ if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1); }}
            disabled={month===now.getMonth()+1 && year===now.getFullYear()}
            style={{ padding:'6px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13,
              opacity: month===now.getMonth()+1 && year===now.getFullYear() ? 0.4 : 1 }}>→</button>
        </div>
        <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:8, padding:3 }}>
          {[['calendar','📅 Calendar'],['list','📋 List']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{
              padding:'5px 12px', borderRadius:6, fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
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
              <Ring pct={pct} size={110} stroke={12}/>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>
                  {MONTHS[month-1]} {year} · Attendance Summary
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                  {[
                    { label:'Present',  val: sum.present||0,  color:'#34D399' },
                    { label:'Absent',   val: sum.absent||0,   color:'#FCA5A5' },
                    { label:'Late',     val: sum.late||0,     color:'#FCD34D' },
                    { label:'Total',    val: sum.total||monthRecords.length||0, color:'rgba(255,255,255,0.6)' },
                  ].map(s=>(
                    <div key={s.label}>
                      <div style={{ fontSize:22, fontWeight:900, color:'#fff' }}>{s.val}</div>
                      <div style={{ fontSize:10, color:s.color, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {pct < 75 && (
              <div style={{ marginTop:14, padding:'10px 14px', background:'rgba(239,68,68,0.2)', borderRadius:10, border:'1px solid rgba(239,68,68,0.3)', fontSize:12, color:'#FCA5A5' }}>
                ⚠️ Your attendance is {pct}%. Minimum 75% required. Please attend more classes.
              </div>
            )}
          </div>

          {/* Calendar or List view */}
          {view === 'calendar' ? (
            <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:16, padding:'20px 24px' }}>
              <div style={{ fontWeight:700, fontSize:14, color:'#fff', marginBottom:16 }}>
                📅 {MONTHS[month-1]} {year} — Calendar
              </div>
              <CalendarHeatmap records={records} month={month} year={year}/>
              <div style={{ display:'flex', gap:12, marginTop:14, flexWrap:'wrap' }}>
                {Object.entries(STATUS).map(([k,v])=>(
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:5 }}>
                    <div style={{ width:10, height:10, borderRadius:3, background:v.bg, border:`1px solid ${v.border}50` }}/>
                    <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>{v.label}</span>
                  </div>
                ))}
                <div style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:'rgba(255,255,255,0.06)' }}/>
                  <span style={{ fontSize:11, color:'rgba(255,255,255,0.5)' }}>Not Marked</span>
                </div>
              </div>
            </div>
          ) : (
            /* List view */
            monthRecords.length === 0 ? (
              <div style={{ textAlign:'center', padding:'32px 20px', color:'#9CA3AF', background:'#fff', borderRadius:12, border:'1px solid #E5E7EB' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📅</div>
                <div style={{ fontWeight:600 }}>No attendance records for {MONTHS[month-1]} {year}</div>
              </div>
            ) : (
              <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
                <div style={{ padding:'12px 18px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>
                  📋 {MONTHS[month-1]} {year} — Attendance Records ({monthRecords.length})
                </div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#0B1F4A' }}>
                        {['Date','Day','Status','Remarks'].map(h=>(
                          <th key={h} style={{ padding:'9px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {[...monthRecords].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>{
                        const s  = STATUS[r.status] || STATUS.present;
                        const dt = new Date(r.date);
                        return (
                          <tr key={r._id||i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                            <td style={{ padding:'9px 14px', fontWeight:700 }}>
                              {dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}
                            </td>
                            <td style={{ padding:'9px 14px', color:'#6B7280' }}>
                              {dt.toLocaleDateString('en-IN',{weekday:'short'})}
                            </td>
                            <td style={{ padding:'9px 14px' }}>
                              <span style={{ fontSize:12, fontWeight:700, color:s.color, background:s.bg, border:`1px solid ${s.border}50`, padding:'3px 10px', borderRadius:20 }}>
                                {s.label}
                              </span>
                            </td>
                            <td style={{ padding:'9px 14px', color:'#9CA3AF', fontSize:12 }}>{r.remarks||'—'}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            )
          )}

          {/* Stats bar */}
          {monthRecords.length > 0 && (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))', gap:10 }}>
              {[
                { label:'Days Present',  val:monthRecords.filter(r=>r.status==='present').length,  color:'#16A34A', bg:'#F0FDF4', icon:'✅' },
                { label:'Days Absent',   val:monthRecords.filter(r=>r.status==='absent').length,   color:'#DC2626', bg:'#FEF2F2', icon:'❌' },
                { label:'Days Late',     val:monthRecords.filter(r=>r.status==='late').length,     color:'#D97706', bg:'#FFFBEB', icon:'⏰' },
                { label:'Total Marked',  val:monthRecords.length,                                   color:'#1D4ED8', bg:'#EFF6FF', icon:'📋' },
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