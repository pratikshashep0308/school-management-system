/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI } from '../../utils/api';
import api from '../../utils/api';

const TODAY = new Date().toISOString().split('T')[0];
const STATUS_STYLE = {
  present: { bg:'#16A34A', color:'#fff' },
  absent:  { bg:'#DC2626', color:'#fff' },
  leave:   { bg:'#D97706', color:'#fff' },
};

export default function EmployeeAttendance() {
  const [date,     setDate]     = useState(TODAY);
  const [teachers, setTeachers] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [submitted,setSubmit]   = useState(false);

  const loadTeachers = async () => {
    setLoading(true);
    try {
      const r = await teacherAPI.getAll();
      const list = r.data.data || [];
      setTeachers(list);
      const init = {};
      list.forEach(t => { init[t._id] = 'present'; });
      setStatuses(init);
    } catch { toast.error('Failed to load teachers'); }
    finally { setLoading(false); }
  };

  const setAll = (status) => {
    const upd = {};
    teachers.forEach(t => { upd[t._id] = status; });
    setStatuses(upd);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const records = teachers.map(t => ({ teacherId: t._id, date, status: statuses[t._id] || 'present' }));
      await api.post('/teachers/attendance', { date, records });
      toast.success('Employee attendance saved!');
      setSubmit(true);
    } catch { toast.error('Failed to save — endpoint may not exist yet'); }
    finally { setSaving(false); }
  };

  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' };

  return (
    <div style={{ maxWidth:860 }}>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 4px' }}>Mark or update Employees Attendance</h2>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20, display:'flex', gap:16 }}>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'#3B5BDB', display:'inline-block' }}/> Required</span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}><span style={{ width:8, height:8, borderRadius:'50%', background:'#D1D5DB', display:'inline-block' }}/> Optional</span>
      </div>

      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:28, marginBottom:20 }}>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Date *</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...INP, maxWidth:260 }} />
        </div>
        <button onClick={loadTeachers} disabled={loading}
          style={{ padding:'10px 32px', borderRadius:20, background:'#F59E0B', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {loading ? '⏳ Loading…' : '✔ Submit'}
        </button>
      </div>

      {teachers.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>Teachers — {teachers.length} employees <span style={{ fontSize:12, color:'#6B7280', fontWeight:400 }}>{date}</span></div>
            <div style={{ display:'flex', gap:6 }}>
              {['present','absent','leave'].map(s=>(
                <button key={s} onClick={()=>setAll(s)}
                  style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background: STATUS_STYLE[s].bg, color:'#fff', textTransform:'capitalize' }}>
                  All {s}
                </button>
              ))}
            </div>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['#','Employee ID','Name','Subject','Status','Actions'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.map((t,i)=>(
                <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2?'#FAFAFA':'#fff' }}>
                  <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12 }}>{t.employeeId||'—'}</td>
                  <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{t.user?.name||'—'}</td>
                  <td style={{ padding:'10px 16px', color:'#6B7280', fontSize:12 }}>{t.subjects?.map(s=>s.name||s).join(', ')||'—'}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20, background: STATUS_STYLE[statuses[t._id]]?.bg||'#F3F4F6', color: STATUS_STYLE[statuses[t._id]]?.color||'#9CA3AF', textTransform:'capitalize' }}>
                      {statuses[t._id]||'present'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      {['present','absent','leave'].map(st=>(
                        <button key={st} onClick={()=>setStatuses(p=>({...p,[t._id]:st}))}
                          style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, border:'2px solid', cursor:'pointer',
                            borderColor: statuses[t._id]===st ? STATUS_STYLE[st].bg : '#E5E7EB',
                            background:  statuses[t._id]===st ? STATUS_STYLE[st].bg : '#fff',
                            color:       statuses[t._id]===st ? '#fff' : '#374151',
                          }}>
                          {st.charAt(0).toUpperCase()}
                        </button>
                      ))}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div style={{ padding:'16px 20px', borderTop:'1px solid #F3F4F6', display:'flex', justifyContent:'flex-end', gap:12 }}>
            {submitted && <span style={{ fontSize:13, color:'#16A34A', fontWeight:600, alignSelf:'center' }}>✅ Saved</span>}
            <button onClick={handleSave} disabled={saving}
              style={{ padding:'10px 32px', borderRadius:20, background:'#F59E0B', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              {saving ? 'Saving…' : '✔ Save Attendance'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}