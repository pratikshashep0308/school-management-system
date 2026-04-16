/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';

const TODAY = new Date().toISOString().split('T')[0];

function DonutChart({ present, absent, leave, size=80 }) {
  const total = present + absent + leave || 1;
  const pPct = (present/total)*100;
  const aPct = (absent/total)*100;
  const lPct = (leave/total)*100;
  const r = 28, cx = size/2, cy = size/2, circ = 2*Math.PI*r;

  const presentDash = (pPct/100)*circ;
  const absentDash  = (aPct/100)*circ;
  const leaveDash   = (lPct/100)*circ;

  const pOffset = 0;
  const aOffset = -presentDash;
  const lOffset = -(presentDash + absentDash);

  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={10}/>
      {present>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3B82F6" strokeWidth={10}
        strokeDasharray={`${presentDash} ${circ-presentDash}`} strokeDashoffset={pOffset}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      {absent>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth={10}
        strokeDasharray={`${absentDash} ${circ-absentDash}`} strokeDashoffset={aOffset}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      {leave>0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F59E0B" strokeWidth={10}
        strokeDasharray={`${leaveDash} ${circ-leaveDash}`} strokeDashoffset={lOffset}
        transform={`rotate(-90 ${cx} ${cy})`}/>}
      <text x={cx} y={cy+1} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#111827">
        {Math.round(pPct)}%
      </text>
    </svg>
  );
}

export default function ClasswiseReport() {
  const [date,    setDate]    = useState(TODAY);
  const [classes, setClasses] = useState([]);
  const [data,    setData]    = useState({});
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data||[])).catch(()=>{});
  }, []);

  useEffect(() => { if (classes.length) loadAll(); }, [classes, date]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        classes.map(c => attendanceAPI.getByClass(c._id, date).then(r=>({ classId:c._id, records:r.data.data||[] })).catch(()=>({ classId:c._id, records:[] })))
      );
      const map = {};
      results.forEach(({ classId, records }) => {
        const present = records.filter(r=>r.status==='present').length;
        const absent  = records.filter(r=>r.status==='absent').length;
        const leave   = records.filter(r=>r.status==='leave'||r.status==='excused').length;
        map[classId] = { present, absent, leave, total: records.length };
      });
      setData(map);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' };

  const d = new Date(date);
  const dateLabel = d.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 20px' }}>Classwise Attendance Report</h2>
      <div style={{ marginBottom:24 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Date *</label>
        <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...INP, maxWidth:220 }} />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>⏳ Loading...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20 }}>
          {classes.map(cls => {
            const d = data[cls._id] || { present:0, absent:0, leave:0, total:0 };
            const marked = d.total > 0;
            return (
              <div key={cls._id} style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)' }}>
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
                  <div style={{ fontSize:12, color:'#6B7280' }}>Attendance report {dateLabel} for</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#3B5BDB', marginTop:2 }}>{cls.name} {cls.section||''}</div>
                </div>
                {!marked ? (
                  <div style={{ padding:'32px 18px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>😔</div>
                    <div style={{ fontSize:13 }}>Attendance is not marked yet.</div>
                  </div>
                ) : (
                  <div style={{ padding:'18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6B7280', marginBottom:12 }}>
                      {[['#3B82F6','Present'],['#9CA3AF','On-leave'],['#EF4444','Absent']].map(([c,l])=>(
                        <span key={l} style={{ display:'flex', alignItems:'center', gap:4 }}>
                          <span style={{ width:10, height:10, borderRadius:'50%', background:c, display:'inline-block' }}/>
                          {l}
                        </span>
                      ))}
                    </div>
                    <div style={{ display:'flex', justifyContent:'center', marginBottom:16 }}>
                      <DonutChart present={d.present} absent={d.absent} leave={d.leave} size={100}/>
                    </div>
                    <div style={{ display:'flex', justifyContent:'space-around', textAlign:'center' }}>
                      {[
                        { label:'Present', val:d.present, pct:d.total?Math.round((d.present/d.total)*100):0, color:'#3B82F6' },
                        { label:'On-leave', val:d.leave,  pct:d.total?Math.round((d.leave/d.total)*100):0,   color:'#9CA3AF' },
                        { label:'Absent',  val:d.absent,  pct:d.total?Math.round((d.absent/d.total)*100):0,  color:'#EF4444' },
                      ].map(item=>(
                        <div key={item.label}>
                          <div style={{ fontSize:11, color:item.color, fontWeight:700 }}>↑ {item.pct}%</div>
                          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>{item.val}</div>
                          <div style={{ fontSize:11, color:item.color, fontWeight:600 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}