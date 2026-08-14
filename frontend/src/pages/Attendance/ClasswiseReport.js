/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_STYLE = {
  present: { bg:'#DCFCE7', color:'#166534' },
  absent:  { bg:'#FEE2E2', color:'#991B1B' },
  leave:   { bg:'#FEF3C7', color:'#92400E' },
  excused: { bg:'#EDE9FE', color:'#5B21B6' },
  late:    { bg:'#FEF3C7', color:'#92400E' },
};

function DonutChart({ present, absent, leave, size = 100 }) {
  const total = present + absent + leave || 1;
  const r = size * 0.28, cx = size / 2, cy = size / 2, circ = 2 * Math.PI * r;
  const pDash = (present / total) * circ;
  const aDash = (absent  / total) * circ;
  const lDash = (leave   / total) * circ;
  return (
    <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
      <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F3F4F6" strokeWidth={10}/>
      {present > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#3B82F6" strokeWidth={10}
        strokeDasharray={`${pDash} ${circ - pDash}`} strokeDashoffset={0} transform={`rotate(-90 ${cx} ${cy})`}/>}
      {absent > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#EF4444" strokeWidth={10}
        strokeDasharray={`${aDash} ${circ - aDash}`} strokeDashoffset={-pDash} transform={`rotate(-90 ${cx} ${cy})`}/>}
      {leave > 0 && <circle cx={cx} cy={cy} r={r} fill="none" stroke="#F59E0B" strokeWidth={10}
        strokeDasharray={`${lDash} ${circ - lDash}`} strokeDashoffset={-(pDash + aDash)} transform={`rotate(-90 ${cx} ${cy})`}/>}
      <text x={cx} y={cy + 1} textAnchor="middle" dominantBaseline="central" fontSize={size * 0.11} fontWeight={700} fill="#111827">
        {Math.round((present / total) * 100)}%
      </text>
    </svg>
  );
}

// ── Drill-down Modal ─────────────────────────────────────────────────────────
function DrillModal({ cls, date, records, onClose }) {
  const dateLabel = new Date(date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const [search, setSearch] = useState('');

  const filtered = records.filter(r => {
    const name = r.student?.user?.name || r.student?.name || '';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  return (
    <div style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(0,0,0,0.45)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}
      onClick={onClose}>
      <div style={{ background:'#fff', borderRadius:18, width:'100%', maxWidth:640, maxHeight:'85vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}
        onClick={e => e.stopPropagation()}>

        {/* Header */}
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800, color:'#111827' }}>{cls.name} {cls.section || ''}</div>
            <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>Attendance report — {dateLabel}</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Summary bar */}
        {records.length > 0 && (() => {
          const present = records.filter(r => r.status === 'present').length;
          const absent  = records.filter(r => r.status === 'absent').length;
          const leave   = records.filter(r => r.status === 'leave' || r.status === 'excused').length;
          return (
            <div style={{ padding:'14px 24px', borderBottom:'1px solid #F3F4F6', display:'flex', gap:24 }}>
              {[
                { label:'Present', val:present, color:'#16A34A', bg:'#DCFCE7' },
                { label:'Absent',  val:absent,  color:'#DC2626', bg:'#FEE2E2' },
                { label:'Leave',   val:leave,   color:'#D97706', bg:'#FEF3C7' },
                { label:'Total',   val:records.length, color:'#374151', bg:'#F3F4F6' },
              ].map(s => (
                <div key={s.label} style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <div style={{ width:32, height:32, borderRadius:8, background:s.bg, display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, color:s.color }}>{s.val}</div>
                  <span style={{ fontSize:12, color:'#6B7280' }}>{s.label}</span>
                </div>
              ))}
              <div style={{ marginLeft:'auto' }}>
                <input value={search} onChange={e => setSearch(e.target.value)}
                  placeholder="Search student…"
                  style={{ padding:'5px 10px', border:'1px solid #E5E7EB', borderRadius:7, fontSize:12, outline:'none', width:160 }} />
              </div>
            </div>
          );
        })()}

        {/* Student list */}
        <div style={{ overflowY:'auto', flex:1 }}>
          {records.length === 0 ? (
            <div style={{ textAlign:'center', padding:'48px 20px', color:'#9CA3AF' }}>
              <div style={{ fontSize:36, marginBottom:8 }}>😔</div>
              <div style={{ fontSize:13 }}>Attendance is not marked yet.</div>
            </div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#', 'Roll', 'Student', 'Status'].map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((rec, i) => {
                  const name = rec.student?.user?.name || rec.student?.name || '—';
                  const roll = rec.student?.rollNumber || '—';
                  const sc   = STATUS_STYLE[rec.status] || { bg:'#F3F4F6', color:'#374151' };
                  return (
                    <tr key={rec._id || i} style={{ borderBottom:'1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                      <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i + 1}</td>
                      <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12 }}>{roll}</td>
                      <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{name}</td>
                      <td style={{ padding:'10px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20, background:sc.bg, color:sc.color, textTransform:'capitalize' }}>
                          {rec.status}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Main Component ───────────────────────────────────────────────────────────
export default function ClasswiseReport() {
  const [date,      setDate]      = useState(TODAY);
  const [classes,   setClasses]   = useState([]);
  const [data,      setData]      = useState({});      // { classId: { present, absent, leave, total, records[] } }
  const [loading,   setLoading]   = useState(false);
  const [selected,  setSelected]  = useState(null);   // { cls, records }

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => { if (classes.length) loadAll(); }, [classes, date]);

  const loadAll = async () => {
    setLoading(true);
    try {
      const results = await Promise.all(
        classes.map(c =>
          attendanceAPI.getByClass(c._id, date)
            .then(r => ({ classId: c._id, records: r.data.data || [] }))
            .catch(() => ({ classId: c._id, records: [] }))
        )
      );
      const map = {};
      results.forEach(({ classId, records }) => {
        const present = records.filter(r => r.status === 'present').length;
        const absent  = records.filter(r => r.status === 'absent').length;
        const leave   = records.filter(r => r.status === 'leave' || r.status === 'excused').length;
        map[classId] = { present, absent, leave, total: records.length, records };
      });
      setData(map);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const dateLabel = new Date(date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' });
  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' };

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 20px' }}>Classwise Attendance Report</h2>

      <div style={{ marginBottom:24 }}>
        <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Date *</label>
        <input type="date" value={date} onChange={e => setDate(e.target.value)} style={{ ...INP, maxWidth:220 }} />
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>⏳ Loading...</div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px, 1fr))', gap:20 }}>
          {classes.map(cls => {
            const d = data[cls._id] || { present:0, absent:0, leave:0, total:0, records:[] };
            const marked = d.total > 0;
            return (
              <div key={cls._id}
                onClick={() => setSelected({ cls, records: d.records })}
                style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, overflow:'hidden', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}
                onMouseEnter={e => { e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e => { e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='translateY(0)'; }}>

                {/* Card header */}
                <div style={{ padding:'14px 18px', borderBottom:'1px solid #F3F4F6' }}>
                  <div style={{ fontSize:12, color:'#6B7280' }}>Attendance report {dateLabel} for</div>
                  <div style={{ fontSize:18, fontWeight:800, color:'#3B5BDB', marginTop:2 }}>{cls.name} {cls.section || ''}</div>
                </div>

                {/* Card body */}
                {!marked ? (
                  <div style={{ padding:'32px 18px', textAlign:'center', color:'#9CA3AF' }}>
                    <div style={{ fontSize:32, marginBottom:8 }}>😔</div>
                    <div style={{ fontSize:13 }}>Attendance is not marked yet.</div>
                  </div>
                ) : (
                  <div style={{ padding:'18px' }}>
                    <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#6B7280', marginBottom:12 }}>
                      {[['#3B82F6','Present'],['#9CA3AF','On-leave'],['#EF4444','Absent']].map(([c,l]) => (
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
                        { label:'Present',  val:d.present, pct: d.total ? Math.round((d.present/d.total)*100) : 0, color:'#3B82F6' },
                        { label:'On-leave', val:d.leave,   pct: d.total ? Math.round((d.leave/d.total)*100)   : 0, color:'#9CA3AF' },
                        { label:'Absent',   val:d.absent,  pct: d.total ? Math.round((d.absent/d.total)*100)  : 0, color:'#EF4444' },
                      ].map(item => (
                        <div key={item.label}>
                          <div style={{ fontSize:11, color:item.color, fontWeight:700 }}>↑ {item.pct}%</div>
                          <div style={{ fontSize:22, fontWeight:800, color:'#111827' }}>{item.val}</div>
                          <div style={{ fontSize:11, color:item.color, fontWeight:600 }}>{item.label}</div>
                        </div>
                      ))}
                    </div>
                    <div style={{ marginTop:12, textAlign:'center', fontSize:11, color:'#9CA3AF' }}>
                      Click to view student details →
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Drill-down modal */}
      {selected && (
        <DrillModal
          cls={selected.cls}
          date={date}
          records={selected.records}
          onClose={() => setSelected(null)}
        />
      )}
    </div>
  );
}