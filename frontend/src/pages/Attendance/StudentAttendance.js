/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_STYLE = {
  present: { bg:'#16A34A', color:'#fff' },
  absent:  { bg:'#DC2626', color:'#fff' },
  leave:   { bg:'#D97706', color:'#fff' },
};

export default function StudentAttendance() {
  const [date,      setDate]      = useState(TODAY);
  const [classes,   setClasses]   = useState([]);
  const [classId,   setClassId]   = useState('');
  const [students,  setStudents]  = useState([]);
  const [statuses,  setStatuses]  = useState({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [submitted, setSubmit]    = useState(false);

  useEffect(() => {
    classAPI.getAll().then(r => {
      const cls = r.data.data || [];
      setClasses(cls);
      if (cls.length) setClassId(cls[0]._id);
    }).catch(() => {});
  }, []);

  const loadStudents = async () => {
    if (!classId || !date) return;
    setLoading(true); setSubmit(false);
    try {
      const r = await attendanceAPI.getByClass(classId, date);
      const existing = r.data.data || [];
      const stuMap = {};
      existing.forEach(rec => { stuMap[rec.student?._id || rec.student] = rec.status; });
      const stuList = existing.map(rec => ({
        _id:             rec.student?._id || rec.student,
        name:            rec.student?.user?.name || rec.student?.name || '—',
        rollNumber:      rec.student?.rollNumber || '—',
        admissionNumber: rec.student?.admissionNumber || '',
        class:           rec.student?.class?.name || '',
      }));
      setStudents(stuList);
      const init = {};
      stuList.forEach(s => { init[s._id] = stuMap[s._id] || 'present'; });
      setStatuses(init);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  };

  const setAll = status => {
    const upd = {};
    students.forEach(s => { upd[s._id] = status; });
    setStatuses(upd);
  };

  const handleSave = async () => {
    if (!students.length) return toast.error('No students loaded');
    setSaving(true);
    try {
      const attendanceData = students.map(s => ({ studentId: s._id, status: statuses[s._id] || 'present' }));
      await attendanceAPI.mark({ classId, date, attendanceData });
      toast.success('Attendance saved!');
      setSubmit(true);
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' };
  const selectedClass = classes.find(c => c._id === classId);

  return (
    <div style={{ maxWidth:900 }}>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 4px' }}>Mark or update Student Attendance</h2>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20, display:'flex', gap:16 }}>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#3B5BDB', display:'inline-block' }}/> Required
        </span>
        <span style={{ display:'flex', alignItems:'center', gap:4 }}>
          <span style={{ width:8, height:8, borderRadius:'50%', background:'#D1D5DB', display:'inline-block' }}/> Optional
        </span>
      </div>

      {/* Form card — same style as Employee */}
      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:28, marginBottom:20 }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Date *</label>
            <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INP} />
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Search Class *</label>
            <select value={classId} onChange={e => setClassId(e.target.value)} style={INP}>
              <option value="">Select Class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
            </select>
          </div>
        </div>
        <button onClick={loadStudents} disabled={loading}
          style={{ padding:'10px 32px', borderRadius:20, background:'#F59E0B', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {loading ? '⏳ Loading…' : '✔ Submit'}
        </button>
      </div>

      {/* Student list — same structure as Employee table */}
      {students.length > 0 && (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, overflow:'hidden' }}>

          {/* Table header bar */}
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>
              {selectedClass ? `${selectedClass.name} ${selectedClass.section || ''}` : 'Students'} — {students.length} students
              <span style={{ fontSize:12, color:'#6B7280', fontWeight:400, marginLeft:8 }}>{date}</span>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {['present', 'absent', 'leave'].map(s => (
                <button key={s} onClick={() => setAll(s)}
                  style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background:STATUS_STYLE[s].bg, color:'#fff', textTransform:'capitalize' }}>
                  All {s}
                </button>
              ))}
            </div>
          </div>

          {/* Table — same columns order as Employee */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['#', 'Admission No', 'Roll No', 'Name', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s._id} style={{ borderBottom:'1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                  <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i + 1}</td>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12, color:'#374151' }}>{s.admissionNumber || '—'}</td>
                  <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12 }}>{s.rollNumber}</td>
                  <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{s.name}</td>
                  <td style={{ padding:'10px 16px' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20,
                      background: STATUS_STYLE[statuses[s._id]]?.bg || '#F3F4F6',
                      color:      STATUS_STYLE[statuses[s._id]]?.color || '#9CA3AF',
                      textTransform:'capitalize' }}>
                      {statuses[s._id] || 'present'}
                    </span>
                  </td>
                  <td style={{ padding:'10px 16px' }}>
                    <div style={{ display:'flex', gap:6 }}>
                      {['present', 'absent', 'leave'].map(st => (
                        <button key={st} onClick={() => setStatuses(p => ({ ...p, [s._id]: st }))}
                          style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, border:'2px solid', cursor:'pointer',
                            borderColor: statuses[s._id] === st ? STATUS_STYLE[st].bg : '#E5E7EB',
                            background:  statuses[s._id] === st ? STATUS_STYLE[st].bg : '#fff',
                            color:       statuses[s._id] === st ? '#fff' : '#374151',
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

          {/* Footer save bar */}
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