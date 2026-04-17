/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useState, useCallback } from 'react';
import { studentPortalAPI } from '../../utils/studentPortalAPI';
import { LoadingState } from '../../components/ui';
import toast from 'react-hot-toast';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const STATUS = {
  present: { color:'#16A34A', bg:'#DCFCE7', border:'#22C55E', label:'Present' },
  absent:  { color:'#DC2626', bg:'#FEE2E2', border:'#EF4444', label:'Absent'  },
  late:    { color:'#D97706', bg:'#FEF3C7', border:'#F59E0B', label:'Late'    },
  excused: { color:'#7C3AED', bg:'#EDE9FE', border:'#8B5CF6', label:'Excused' },
};

// ── Compact ring ──────────────────────────────────────────────────────────────
function Ring({ pct, size=80, stroke=8 }) {
  const r = (size-stroke)/2, c = 2*Math.PI*r;
  const fill = (pct/100)*c;
  const col  = pct>=75?'#16A34A':pct>=50?'#F59E0B':'#DC2626';
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} style={{transform:'rotate(-90deg)',flexShrink:0}}>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="rgba(255,255,255,0.15)" strokeWidth={stroke}/>
      <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
        strokeDasharray={`${fill} ${c-fill}`} strokeLinecap="round"/>
      <text x="50%" y="50%" dominantBaseline="central" textAnchor="middle"
        style={{transform:'rotate(90deg)',transformOrigin:'center',fontSize:size*0.2,fontWeight:900,fill:'#fff'}}>
        {pct}%
      </text>
    </svg>
  );
}

// ── Compact calendar — fixed 36px cells ───────────────────────────────────────
function CalendarGrid({ records, month, year, onDayClick }) {
  const dim        = new Date(year, month, 0).getDate();
  const firstDow   = (new Date(year, month-1, 1).getDay()+6)%7; // Mon=0
  const today      = new Date();
  const recordMap  = {};
  records.forEach(r => {
    const d = new Date(r.date);
    if (d.getMonth()+1===month && d.getFullYear()===year)
      recordMap[d.getDate()] = r.status;
  });

  const CELL = 36;

  return (
    <div style={{width:'100%'}}>
      {/* Day headers */}
      <div style={{display:'grid',gridTemplateColumns:`repeat(7,${CELL}px)`,gap:3,marginBottom:4,justifyContent:'center'}}>
        {['Mo','Tu','We','Th','Fr','Sa','Su'].map(d=>(
          <div key={d} style={{width:CELL,textAlign:'center',fontSize:10,fontWeight:700,color:'rgba(255,255,255,0.45)'}}>
            {d}
          </div>
        ))}
      </div>
      {/* Day cells */}
      <div style={{display:'grid',gridTemplateColumns:`repeat(7,${CELL}px)`,gap:3,justifyContent:'center'}}>
        {Array.from({length:firstDow}).map((_,i)=><div key={'e'+i} style={{width:CELL,height:CELL}}/>)}
        {Array.from({length:dim},(_,i)=>i+1).map(d=>{
          const status  = recordMap[d];
          const isToday = d===today.getDate() && month===today.getMonth()+1 && year===today.getFullYear();
          const s       = STATUS[status];
          return (
            <div key={d}
              title={s ? `${d} ${MONTHS[month-1]}: ${s.label}` : `${d} ${MONTHS[month-1]}: Not marked`}
              onClick={() => s && onDayClick && onDayClick(d)}
              style={{
                width:CELL,height:CELL,borderRadius:8,
                display:'flex',alignItems:'center',justifyContent:'center',
                fontSize:12,fontWeight:700,
                background: s ? s.bg : 'rgba(255,255,255,0.07)',
                color:      s ? s.color : 'rgba(255,255,255,0.3)',
                border: isToday
                  ? '2px solid rgba(255,255,255,0.6)'
                  : s ? `1px solid ${s.border}50` : '1px solid transparent',
                cursor: s ? 'pointer' : 'default',
                transition:'transform 0.1s',
              }}
              onMouseEnter={e=>{ if(s) e.currentTarget.style.transform='scale(1.15)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.transform='scale(1)'; }}>
              {d}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function StudentAttendanceSection({ dashboardAttendance }) {
  const now = new Date();
  const [month,   setMonth]   = useState(now.getMonth()+1);
  const [year,    setYear]    = useState(now.getFullYear());
  const [records, setRecords] = useState([]);
  const [summary, setSummary] = useState(null);
  const [loading, setLoading] = useState(false);
  const [view,    setView]    = useState('calendar');
  const [selectedDay, setSelectedDay] = useState(null);
  const [statusFilter, setStatusFilter] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await studentPortalAPI.getAttendance(month, year);
      const d = r.data.data;
      setRecords(d?.records || []);
      setSummary(d?.summary || null);
    } catch (err) {
      if (err?.response?.status===403 && dashboardAttendance) {
        setRecords(dashboardAttendance.records || []);
        setSummary({ present:dashboardAttendance.present||0, absent:dashboardAttendance.absent||0,
          late:dashboardAttendance.late||0, total:dashboardAttendance.total||0,
          percentage:dashboardAttendance.percentage||0 });
      } else if (err?.response?.status!==403) {
        toast.error('Failed to load attendance');
      }
    } finally { setLoading(false); }
  }, [month, year, dashboardAttendance]);

  useEffect(()=>{ load(); },[load]);

  const sum = summary || dashboardAttendance || {present:0,absent:0,late:0,total:0,percentage:0};
  const pct = sum.percentage || (sum.total>0 ? Math.round(((sum.present+(sum.late||0))/sum.total)*100) : 0);

  const monthRecs = records.filter(r=>{
    const d=new Date(r.date);
    return d.getMonth()+1===month && d.getFullYear()===year;
  });
  const filteredRecs = monthRecs.filter(r=>{
    const d=new Date(r.date);
    if(selectedDay && d.getDate()!==selectedDay) return false;
    if(statusFilter && r.status!==statusFilter) return false;
    return true;
  });
  // eslint-disable-next-line no-unused-vars
  const _monthRecs2 = records.filter(r=>{
    const d=new Date(r.date);
    return d.getMonth()+1===month && d.getFullYear()===year;
  });

  const SEL = {padding:'6px 10px',border:'1.5px solid #E5E7EB',borderRadius:8,fontSize:12,background:'#fff',outline:'none',cursor:'pointer'};

  return (
    <div style={{display:'flex',flexDirection:'column',gap:14}}>

      {/* Top bar: month/year + view toggle */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:8}}>
        <div style={{display:'flex',gap:6,alignItems:'center'}}>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
            {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
          </select>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
            {[2024,2025,2026].map(y=><option key={y} value={y}>{y}</option>)}
          </select>
          <button onClick={()=>{if(month===1){setMonth(12);setYear(y=>y-1);}else setMonth(m=>m-1);}}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #E5E7EB',background:'#fff',cursor:'pointer',fontSize:13}}>←</button>
          <button onClick={()=>{if(month===12){setMonth(1);setYear(y=>y+1);}else setMonth(m=>m+1);}}
            disabled={month===now.getMonth()+1&&year===now.getFullYear()}
            style={{padding:'6px 10px',borderRadius:7,border:'1px solid #E5E7EB',background:'#fff',cursor:'pointer',fontSize:13,
              opacity:month===now.getMonth()+1&&year===now.getFullYear()?0.4:1}}>→</button>
        </div>
        {/* View toggle — top right */}
        <div style={{display:'flex',gap:4,background:'#F3F4F6',borderRadius:8,padding:3}}>
          {[['calendar','📅 Calendar'],['list','📋 List']].map(([k,l])=>(
            <button key={k} onClick={()=>setView(k)} style={{
              padding:'5px 12px',borderRadius:6,fontSize:12,fontWeight:700,border:'none',cursor:'pointer',
              background:view===k?'#fff':'transparent',
              color:view===k?'#1D4ED8':'#6B7280',
              boxShadow:view===k?'0 1px 4px rgba(0,0,0,0.08)':'none',
            }}>{l}</button>
          ))}
        </div>
      </div>

      {loading ? <LoadingState/> : (
        <>
          {/* Summary card — compact */}
          <div style={{background:'linear-gradient(135deg,#0B1F4A,#162D6A)',borderRadius:14,padding:'16px 20px'}}>
            <div style={{display:'flex',alignItems:'center',gap:20,flexWrap:'wrap'}}>
              <Ring pct={pct} size={80} stroke={8}/>
              <div style={{flex:1}}>
                <div style={{fontSize:10,color:'rgba(255,255,255,0.4)',fontWeight:700,textTransform:'uppercase',letterSpacing:'1px',marginBottom:8}}>
                  {MONTHS[month-1]} {year} · Attendance Summary
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:10}}>
                  {[
                    {label:'Present', val:sum.present||0,  color:'#34D399', filter:'present'},
                    {label:'Absent',  val:sum.absent||0,   color:'#FCA5A5', filter:'absent'},
                    {label:'Late',    val:sum.late||0,      color:'#FCD34D', filter:'late'},
                    {label:'Total',   val:sum.total||monthRecs.length||0, color:'rgba(255,255,255,0.6)', filter:null},
                  ].map(s=>(
                    <div key={s.label}
                      onClick={()=>{ if(s.filter){ setView('list'); setSelectedDay(null); setStatusFilter(s.filter); } }}
                      style={{cursor:s.filter?'pointer':'default',borderRadius:8,padding:'4px 6px',
                        transition:'background 0.15s',
                        background:statusFilter===s.filter?'rgba(255,255,255,0.1)':'transparent'}}
                      onMouseEnter={e=>{ if(s.filter) e.currentTarget.style.background='rgba(255,255,255,0.1)'; }}
                      onMouseLeave={e=>{ if(statusFilter!==s.filter) e.currentTarget.style.background='transparent'; }}>
                      <div style={{fontSize:18,fontWeight:900,color:'#fff'}}>{s.val}</div>
                      <div style={{fontSize:9,color:s.color,fontWeight:700,textTransform:'uppercase',letterSpacing:'0.5px'}}>{s.label}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            {pct<75 && (
              <div style={{marginTop:12,padding:'8px 12px',background:'rgba(239,68,68,0.2)',borderRadius:8,border:'1px solid rgba(239,68,68,0.3)',fontSize:12,color:'#FCA5A5'}}>
                ⚠️ Your attendance is {pct}%. Minimum 75% required. Please attend more classes.
              </div>
            )}
          </div>

          {/* Calendar view */}
          {view==='calendar' && (
            <div style={{background:'linear-gradient(135deg,#0B1F4A,#162D6A)',borderRadius:14,padding:'16px 20px'}}>
              <div style={{fontWeight:700,fontSize:13,color:'#fff',marginBottom:14}}>
                📅 {MONTHS[month-1]} {year} — Calendar
              </div>
              <CalendarGrid records={records} month={month} year={year} onDayClick={(d)=>{ setView('list'); setSelectedDay(d); }}/>
              {/* Legend */}
              <div style={{display:'flex',gap:12,marginTop:12,flexWrap:'wrap'}}>
                {Object.entries(STATUS).map(([k,v])=>(
                  <div key={k} style={{display:'flex',alignItems:'center',gap:4}}>
                    <div style={{width:10,height:10,borderRadius:3,background:v.bg,border:`1px solid ${v.border}50`}}/>
                    <span style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>{v.label}</span>
                  </div>
                ))}
                <div style={{display:'flex',alignItems:'center',gap:4}}>
                  <div style={{width:10,height:10,borderRadius:3,background:'rgba(255,255,255,0.07)'}}/>
                  <span style={{fontSize:11,color:'rgba(255,255,255,0.5)'}}>Not Marked</span>
                </div>
              </div>
            </div>
          )}

          {/* List view */}
          {view==='list' && (
            monthRecs.length===0 ? (
              <div style={{textAlign:'center',padding:'32px 20px',color:'#9CA3AF',background:'#fff',borderRadius:12,border:'1px solid #E5E7EB'}}>
                <div style={{fontSize:32,marginBottom:8}}>📅</div>
                <div style={{fontWeight:600}}>No records for {MONTHS[month-1]} {year}</div>
              </div>
            ) : (
              <div style={{background:'#fff',borderRadius:12,border:'1px solid #E5E7EB',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid #E5E7EB',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                  <span style={{fontWeight:700,fontSize:13}}>
                    📋 {MONTHS[month-1]} {year} — {filteredRecs.length} records
                    {(selectedDay||statusFilter) && <span style={{fontSize:11,color:'#6B7280',fontWeight:400,marginLeft:6}}>
                      {selectedDay?`(Day ${selectedDay})`:''}{statusFilter?` (${statusFilter})`:''}
                    </span>}
                  </span>
                  {(selectedDay||statusFilter) && (
                    <button onClick={()=>{setSelectedDay(null);setStatusFilter(null);}}
                      style={{fontSize:11,color:'#DC2626',background:'#FEF2F2',border:'1px solid #FECACA',padding:'3px 10px',borderRadius:6,cursor:'pointer',fontWeight:700}}>
                      ✕ Clear
                    </button>
                  )}
                </div>
                <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
                  <thead>
                    <tr style={{background:'#0B1F4A'}}>
                      {['Date','Day','Status','Remarks'].map(h=>(
                        <th key={h} style={{padding:'9px 14px',textAlign:'left',color:'#E2E8F0',fontSize:11,fontWeight:700,textTransform:'uppercase'}}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {[...filteredRecs].sort((a,b)=>new Date(b.date)-new Date(a.date)).map((r,i)=>{
                      const s=STATUS[r.status]||STATUS.present;
                      const dt=new Date(r.date);
                      return (
                        <tr key={r._id||i} style={{borderBottom:'1px solid #F3F4F6',background:i%2?'#FAFAFA':'#fff'}}>
                          <td style={{padding:'9px 14px',fontWeight:600}}>{dt.toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'})}</td>
                          <td style={{padding:'9px 14px',color:'#6B7280'}}>{dt.toLocaleDateString('en-IN',{weekday:'short'})}</td>
                          <td style={{padding:'9px 14px'}}>
                            <span style={{fontSize:12,fontWeight:700,color:s.color,background:s.bg,border:`1px solid ${s.border}50`,padding:'3px 10px',borderRadius:20}}>{s.label}</span>
                          </td>
                          <td style={{padding:'9px 14px',color:'#9CA3AF',fontSize:12}}>{r.remarks||'—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )
          )}

          {/* Stats bar */}
          {monthRecs.length>0 && (
            <div style={{display:'grid',gridTemplateColumns:'repeat(auto-fit,minmax(120px,1fr))',gap:10}}>
              {[
                {label:'Days Present', val:monthRecs.filter(r=>r.status==='present').length, color:'#16A34A',bg:'#F0FDF4',icon:'✅', filter:'present'},
                {label:'Days Absent',  val:monthRecs.filter(r=>r.status==='absent').length,  color:'#DC2626',bg:'#FEF2F2',icon:'❌', filter:'absent'},
                {label:'Days Late',    val:monthRecs.filter(r=>r.status==='late').length,    color:'#D97706',bg:'#FFFBEB',icon:'⏰', filter:'late'},
                {label:'Total Marked', val:monthRecs.length,                                  color:'#1D4ED8',bg:'#EFF6FF',icon:'📋', filter:null},
              ].map(s=>(
                <div key={s.label}
                  onClick={()=>{ if(s.filter){ setView('list'); setSelectedDay(null); setStatusFilter(s.filter); }}}
                  style={{background: statusFilter===s.filter?s.color+'22':s.bg, borderRadius:12,padding:'12px 14px',
                    display:'flex',alignItems:'center',gap:10,
                    cursor:s.filter?'pointer':'default',
                    border:`2px solid ${statusFilter===s.filter?s.color:'transparent'}`,
                    transition:'all 0.15s'}}
                  onMouseEnter={e=>{ if(s.filter){ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 4px 12px ${s.color}40`; }}}
                  onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
                  <span style={{fontSize:18}}>{s.icon}</span>
                  <div>
                    <div style={{fontSize:18,fontWeight:900,color:s.color}}>{s.val}</div>
                    <div style={{fontSize:10,color:'#6B7280',fontWeight:600}}>{s.label}</div>
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