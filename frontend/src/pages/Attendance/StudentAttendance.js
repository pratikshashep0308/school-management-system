/* eslint-disable react-hooks/exhaustive-deps */
// Student attendance — submit → edit → approve workflow.
//   • Nobody is marked by default; every student must be set explicitly.
//   • Once submitted, the Submit button is replaced by an Edit action.
//   • A teacher's edit moves the day to "pending approval"; an admin approves.
//   • Every submit/edit/approval is recorded in an audit log (who, when, what).
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI, studentAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import AttendanceStatusBar from './AttendanceStatusBar';

const TODAY = new Date().toISOString().split('T')[0];

const STATUS_STYLE = {
  present: { bg:'#16A34A', color:'#fff' },
  absent:  { bg:'#DC2626', color:'#fff' },
  leave:   { bg:'#D97706', color:'#fff' },
};

export default function StudentAttendance() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin', 'schoolAdmin'].includes(user?.role);

  const [date,      setDate]      = useState(TODAY);
  const [classes,   setClasses]   = useState([]);
  const [classId,   setClassId]   = useState('');
  const [students,  setStudents]  = useState([]);
  const [statuses,  setStatuses]  = useState({});
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [approving, setApproving] = useState(false);
  const [submission, setSubmission] = useState(null);
  const [editMode,  setEditMode]  = useState(false);
  // Filters only the visible rows — counters and submission still cover everyone
  const [rowSearch, setRowSearch] = useState('');
  // All students, so a name can be searched before a class is chosen
  const [allStudents, setAllStudents] = useState([]);

  useEffect(() => {
    studentAPI.getAll({ limit: 1000 })
      .then(r => {
        const list = r.data.data || [];
        list.sort((a,b) => (a.user?.name || '').localeCompare(b.user?.name || ''));
        setAllStudents(list);
      })
      .catch(() => {});
  }, []);

  useEffect(() => {
    classAPI.getAll().then(r => {
      const cls = r.data.data || [];
      setClasses(cls);
      if (cls.length) setClassId(cls[0]._id);
    }).catch(() => {});
  }, []);

  const loadSubmission = async (cid = classId, d = date) => {
    try {
      const r = await attendanceAPI.getSubmission({ scope: 'student', classId: cid, date: d });
      setSubmission(r.data.data || null);
      return r.data.data;
    } catch { setSubmission(null); return null; }
  };

  const loadStudents = async () => {
    if (!classId || !date) return;
    setLoading(true);
    setEditMode(false);
    try {
      const [r, sub] = await Promise.all([
        attendanceAPI.getByClass(classId, date),
        loadSubmission(),
      ]);
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
      // No default status — only previously saved values are pre-filled.
      const init = {};
      stuList.forEach(s => { if (stuMap[s._id]) init[s._id] = stuMap[s._id]; });
      setStatuses(init);
      if (sub && sub.status === 'draft' && !stuList.length) toast('No students in this class');
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  };

  const setAll = status => {
    const upd = {};
    students.forEach(s => { upd[s._id] = status; });
    setStatuses(upd);
  };

  const status      = submission?.status || 'draft';
  const isSubmitted = status !== 'draft';
  const isLocked    = status === 'approved' && !isAdmin;
  // Editing is only possible in edit mode once submitted (and never when locked)
  const canEditRows = (!isSubmitted || editMode) && !isLocked;

  const visibleStudents = rowSearch.trim()
    ? students.filter(s => {
        const q = rowSearch.toLowerCase();
        return (s.name || '').toLowerCase().includes(q)
            || String(s.rollNumber || '').toLowerCase().includes(q)
            || String(s.admissionNumber || '').toLowerCase().includes(q);
      })
    : students;

  const markedCount = students.filter(s => statuses[s._id]).length;
  const allMarked   = students.length > 0 && markedCount === students.length;

  const handleSave = async () => {
    if (!students.length) return toast.error('No students loaded');
    if (!allMarked) {
      return toast.error(`Please mark all students — ${students.length - markedCount} still unmarked`);
    }
    setSaving(true);
    try {
      const attendanceData = students.map(s => ({ studentId: s._id, status: statuses[s._id] }));
      await attendanceAPI.mark({ classId, date, attendanceData });
      toast.success(isSubmitted
        ? (isAdmin ? 'Attendance updated' : 'Edit saved — sent for approval')
        : 'Attendance submitted');
      setEditMode(false);
      await loadSubmission();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleApprove = async () => {
    setApproving(true);
    try {
      await attendanceAPI.approve({ scope: 'student', classId, date });
      toast.success('Attendance approved');
      await loadSubmission();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to approve'); }
    finally { setApproving(false); }
  };

  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' };
  const selectedClass = classes.find(c => c._id === classId);

  return (
    <div style={{ maxWidth:900 }}>
      <h2 style={{ fontSize:20, fontWeight:800, color:'var(--color-ink,#111827)', margin:'0 0 4px' }}>Mark or update Student Attendance</h2>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Select a class and date, then mark every student.
      </div>

      {/* Class / date picker */}
      <div style={{ background:'var(--color-paper,#fff)', border:'1px solid var(--color-border,#E5E7EB)', borderRadius:14, padding:28, marginBottom:20 }}>
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
          <div>
            {/* Find a student by name and jump straight to their class */}
            <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Or find a student</label>
            <select
              value=""
              onChange={e => {
                const stu = allStudents.find(s => String(s._id) === e.target.value);
                if (stu) setClassId(String(stu.class?._id || stu.class || ''));
              }}
              style={INP}>
              <option value="">
                {allStudents.length ? `Search student (${allStudents.length})…` : 'Loading students…'}
              </option>
              {allStudents.map(s => (
                <option key={s._id} value={s._id}>
                  {s.user?.name}{s.rollNumber ? ` · ${s.rollNumber}` : ''}
                </option>
              ))}
            </select>
          </div>
        </div>
        <button onClick={loadStudents} disabled={loading}
          style={{ padding:'10px 32px', borderRadius:20, background:'#F59E0B', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {loading ? '⏳ Loading…' : '🔍 Load Students'}
        </button>
      </div>

      {/* Workflow status + audit history */}
      {students.length > 0 && (
        <AttendanceStatusBar submission={submission} onApprove={handleApprove} approving={approving} />
      )}

      {students.length > 0 && (
        <div style={{ background:'var(--color-paper,#fff)', border:'1px solid var(--color-border,#E5E7EB)', borderRadius:14, overflow:'hidden' }}>

          <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:14, color:'var(--color-ink,#111827)' }}>
              {selectedClass ? `${selectedClass.name} ${selectedClass.section || ''}` : 'Students'} — {students.length} students
              <span style={{ fontSize:12, color:'#6B7280', fontWeight:400, marginLeft:8 }}>{date}</span>
              <span style={{ fontSize:12, fontWeight:700, marginLeft:10, color: allMarked ? '#16A34A' : '#D97706' }}>
                {markedCount}/{students.length} marked
              </span>
            </div>
            <div style={{ display:'flex', gap:8, alignItems:'center', flexWrap:'wrap' }}>
              {/* Find a student quickly in a large class. Filtering only hides
                  rows — every student still counts toward the marked total. */}
              <input
                value={rowSearch}
                onChange={e => setRowSearch(e.target.value)}
                placeholder="🔍 Find student…"
                style={{ padding:'6px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12.5, outline:'none', minWidth:180, background:'#fff' }}
              />
              {rowSearch && (
                <button onClick={() => setRowSearch('')}
                  style={{ padding:'6px 10px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', color:'#6B7280', fontSize:12, fontWeight:600, cursor:'pointer' }}>
                  ✕
                </button>
              )}
            </div>
          </div>

          {rowSearch && (
            <div style={{ padding:'8px 20px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', fontSize:12, color:'#92400E' }}>
              Showing {visibleStudents.length} of {students.length} — clear the search before submitting to review everyone.
            </div>
          )}

          <div style={{ padding:'10px 20px', borderBottom:'1px solid #F3F4F6' }}>
            {canEditRows && (
              <div style={{ display:'flex', gap:6 }}>
                {['present', 'absent', 'leave'].map(s => (
                  <button key={s} onClick={() => setAll(s)}
                    style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background:STATUS_STYLE[s].bg, color:'#fff', textTransform:'capitalize' }}>
                    All {s}
                  </button>
                ))}
              </div>
            )}
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['#', 'Admission No', 'Roll No', 'Name', 'Status', 'Actions'].map(h => (
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleStudents.map((s, i) => {
                const st = statuses[s._id];
                return (
                  <tr key={s._id} style={{ borderBottom:'1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                    <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i + 1}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12, color:'#374151' }}>{s.admissionNumber || '—'}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12 }}>{s.rollNumber}</td>
                    <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{s.name}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20,
                        background: st ? STATUS_STYLE[st]?.bg : '#F3F4F6',
                        color:      st ? STATUS_STYLE[st]?.color : '#9CA3AF',
                        textTransform:'capitalize',
                        border: st ? 'none' : '1px dashed #D1D5DB' }}>
                        {st || 'Not marked'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        {['present', 'absent', 'leave'].map(opt => (
                          <button key={opt}
                            onClick={() => canEditRows && setStatuses(p => ({ ...p, [s._id]: opt }))}
                            disabled={!canEditRows}
                            style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, border:'2px solid',
                              cursor: canEditRows ? 'pointer' : 'not-allowed',
                              opacity: canEditRows ? 1 : 0.55,
                              borderColor: st === opt ? STATUS_STYLE[opt].bg : '#E5E7EB',
                              background:  st === opt ? STATUS_STYLE[opt].bg : '#fff',
                              color:       st === opt ? '#fff' : '#374151',
                            }}>
                            {opt.charAt(0).toUpperCase()}
                          </button>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          {/* Footer action bar — Submit only when not yet submitted */}
          <div style={{ padding:'16px 20px', borderTop:'1px solid #F3F4F6', display:'flex', justifyContent:'flex-end', gap:12, alignItems:'center' }}>
            {isLocked && (
              <span style={{ fontSize:12.5, color:'#6B7280' }}>
                🔒 Approved — contact an administrator to make changes.
              </span>
            )}

            {!isSubmitted && (
              <button onClick={handleSave} disabled={saving || !allMarked}
                title={!allMarked ? 'Mark every student first' : ''}
                style={{ padding:'10px 32px', borderRadius:20, background: allMarked ? '#F59E0B' : '#D1D5DB',
                  color:'#fff', border:'none', fontSize:13, fontWeight:700,
                  cursor: (saving || !allMarked) ? 'not-allowed' : 'pointer' }}>
                {saving ? 'Submitting…' : '✔ Submit Attendance'}
              </button>
            )}

            {isSubmitted && !editMode && !isLocked && (
              <button onClick={() => setEditMode(true)}
                style={{ padding:'10px 26px', borderRadius:20, background:'var(--color-paper,#fff)',
                  color:'#0B1F4A', border:'1.5px solid #0B1F4A', fontSize:13, fontWeight:700, cursor:'pointer' }}>
                ✏️ Edit Attendance
              </button>
            )}

            {isSubmitted && editMode && (
              <>
                <button onClick={() => { setEditMode(false); loadStudents(); }}
                  style={{ padding:'10px 20px', borderRadius:20, background:'transparent', color:'#6B7280',
                    border:'1px solid #E5E7EB', fontSize:13, fontWeight:600, cursor:'pointer' }}>
                  Cancel
                </button>
                <button onClick={handleSave} disabled={saving || !allMarked}
                  style={{ padding:'10px 26px', borderRadius:20, background: allMarked ? '#0B1F4A' : '#D1D5DB',
                    color:'#fff', border:'none', fontSize:13, fontWeight:700,
                    cursor:(saving || !allMarked) ? 'not-allowed' : 'pointer' }}>
                  {saving ? 'Saving…' : (isAdmin ? '💾 Save Changes' : '💾 Save & Send for Approval')}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}