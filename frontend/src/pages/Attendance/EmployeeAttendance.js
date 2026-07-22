/* eslint-disable react-hooks/exhaustive-deps */
// Employee attendance — same submit → edit → approve workflow as students.
//   • Nobody is marked by default.
//   • Once submitted, Submit is replaced by Edit.
//   • A non-admin edit goes to "pending approval"; an admin approves.
//   • Every action is captured in the audit log (who, when, what changed).
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import api, { teacherAPI, attendanceAPI } from '../../utils/api';
import { useAuth } from '../../context/AuthContext';
import AttendanceStatusBar from './AttendanceStatusBar';

const TODAY = new Date().toISOString().split('T')[0];
const STATUS_STYLE = {
  present: { bg:'#16A34A', color:'#fff' },
  absent:  { bg:'#DC2626', color:'#fff' },
  leave:   { bg:'#D97706', color:'#fff' },
};

export default function EmployeeAttendance() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin', 'schoolAdmin'].includes(user?.role);

  const [date,     setDate]     = useState(TODAY);
  const [teachers, setTeachers] = useState([]);
  const [statuses, setStatuses] = useState({});
  const [loading,  setLoading]  = useState(false);
  const [saving,   setSaving]   = useState(false);
  const [approving,setApproving]= useState(false);
  const [submission, setSubmission] = useState(null);
  const [editMode, setEditMode] = useState(false);
  // Filters visible rows only — counters and submission still cover everyone
  const [rowSearch, setRowSearch] = useState('');

  const loadSubmission = async (d = date) => {
    try {
      const r = await attendanceAPI.getSubmission({ scope: 'employee', date: d });
      setSubmission(r.data.data || null);
      return r.data.data;
    } catch { setSubmission(null); return null; }
  };

  const loadTeachers = async () => {
    setLoading(true);
    setEditMode(false);
    try {
      const [r, existRes] = await Promise.all([
        teacherAPI.getAll(),
        api.get('/teachers/attendance', { params: { date } }).catch(() => ({ data: { data: [] } })),
      ]);
      await loadSubmission();
      const list = r.data.data || [];
      setTeachers(list);
      // Pre-fill only what was actually saved — no defaults.
      const saved = {};
      (existRes.data?.data || []).forEach(rec => {
        const id = rec.teacher?._id || rec.teacher;
        if (id) saved[String(id)] = rec.status;
      });
      const init = {};
      list.forEach(t => { if (saved[String(t._id)]) init[t._id] = saved[String(t._id)]; });
      setStatuses(init);
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  };

  const setAll = (status) => {
    const upd = {};
    teachers.forEach(t => { upd[t._id] = status; });
    setStatuses(upd);
  };

  const status      = submission?.status || 'draft';
  const isSubmitted = status !== 'draft';
  const isLocked    = status === 'approved' && !isAdmin;
  const canEditRows = (!isSubmitted || editMode) && !isLocked;

  const visibleTeachers = rowSearch.trim()
    ? teachers.filter(t => {
        const q = rowSearch.toLowerCase();
        return (t.user?.name || '').toLowerCase().includes(q)
            || String(t.employeeId || '').toLowerCase().includes(q);
      })
    : teachers;

  const markedCount = teachers.filter(t => statuses[t._id]).length;
  const allMarked   = teachers.length > 0 && markedCount === teachers.length;

  const handleSave = async () => {
    if (!allMarked) {
      return toast.error(`Please mark all employees — ${teachers.length - markedCount} still unmarked`);
    }
    setSaving(true);
    try {
      const records = teachers.map(t => ({ teacherId: t._id, date, status: statuses[t._id] }));
      await api.post('/teachers/attendance', { date, records });
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
      await attendanceAPI.approve({ scope: 'employee', date });
      toast.success('Attendance approved');
      await loadSubmission();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to approve'); }
    finally { setApproving(false); }
  };

  const INP = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', width:'100%', boxSizing:'border-box' };

  return (
    <div style={{ maxWidth:860 }}>
      <h2 style={{ fontSize:20, fontWeight:800, color:'var(--color-ink,#111827)', margin:'0 0 4px' }}>Mark or update Employees Attendance</h2>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Pick a date, load employees, then mark each one.
      </div>

      <div style={{ background:'var(--color-paper,#fff)', border:'1px solid var(--color-border,#E5E7EB)', borderRadius:14, padding:28, marginBottom:20 }}>
        <div style={{ marginBottom:20 }}>
          <label style={{ fontSize:11, fontWeight:700, color:'#3B5BDB', display:'block', marginBottom:6 }}>Date *</label>
          <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={{ ...INP, maxWidth:260 }} />
        </div>
        <button onClick={loadTeachers} disabled={loading}
          style={{ padding:'10px 32px', borderRadius:20, background:'#F59E0B', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {loading ? '⏳ Loading…' : '🔍 Load Employees'}
        </button>
      </div>

      {teachers.length > 0 && (
        <AttendanceStatusBar submission={submission} onApprove={handleApprove} approving={approving} />
      )}

      {teachers.length > 0 && (
        <div style={{ background:'var(--color-paper,#fff)', border:'1px solid var(--color-border,#E5E7EB)', borderRadius:14, overflow:'hidden' }}>
          <div style={{ padding:'12px 20px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10 }}>
            <div style={{ fontWeight:700, fontSize:14 }}>
              Employees — {teachers.length} <span style={{ fontSize:12, color:'#6B7280', fontWeight:400 }}>{date}</span>
              <span style={{ fontSize:12, fontWeight:700, marginLeft:10, color: allMarked ? '#16A34A' : '#D97706' }}>
                {markedCount}/{teachers.length} marked
              </span>
            </div>
            <input
              value={rowSearch}
              onChange={e => setRowSearch(e.target.value)}
              placeholder="🔍 Find employee…"
              style={{ padding:'6px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12.5, outline:'none', minWidth:180, background:'#fff' }}
            />
            {canEditRows && (
              <div style={{ display:'flex', gap:6 }}>
                {['present','absent','leave'].map(s=>(
                  <button key={s} onClick={()=>setAll(s)}
                    style={{ padding:'5px 14px', borderRadius:20, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', background: STATUS_STYLE[s].bg, color:'#fff', textTransform:'capitalize' }}>
                    All {s}
                  </button>
                ))}
              </div>
            )}
          </div>
          {rowSearch && (
            <div style={{ padding:'8px 20px', background:'#FFFBEB', borderBottom:'1px solid #FDE68A', fontSize:12, color:'#92400E' }}>
              Showing {visibleTeachers.length} of {teachers.length} — clear the search before submitting to review everyone.
            </div>
          )}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['#','Employee ID','Name','Subject','Status','Actions'].map(h=>(
                  <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visibleTeachers.map((t,i)=>{
                const st = statuses[t._id];
                return (
                  <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 16px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'10px 16px', fontFamily:'monospace', fontSize:12 }}>{t.employeeId||'—'}</td>
                    <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{t.user?.name||'—'}</td>
                    <td style={{ padding:'10px 16px', color:'#6B7280', fontSize:12 }}>{t.subjects?.map(s=>s.name||s).join(', ')||'—'}</td>
                    <td style={{ padding:'10px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 12px', borderRadius:20,
                        background: st ? STATUS_STYLE[st]?.bg : '#F3F4F6',
                        color: st ? STATUS_STYLE[st]?.color : '#9CA3AF',
                        textTransform:'capitalize',
                        border: st ? 'none' : '1px dashed #D1D5DB' }}>
                        {st || 'Not marked'}
                      </span>
                    </td>
                    <td style={{ padding:'10px 16px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        {['present','absent','leave'].map(opt=>(
                          <button key={opt}
                            onClick={()=> canEditRows && setStatuses(p=>({...p,[t._id]:opt}))}
                            disabled={!canEditRows}
                            style={{ padding:'4px 10px', borderRadius:6, fontSize:11, fontWeight:700, border:'2px solid',
                              cursor: canEditRows ? 'pointer' : 'not-allowed',
                              opacity: canEditRows ? 1 : 0.55,
                              borderColor: st===opt ? STATUS_STYLE[opt].bg : '#E5E7EB',
                              background:  st===opt ? STATUS_STYLE[opt].bg : '#fff',
                              color:       st===opt ? '#fff' : '#374151',
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

          <div style={{ padding:'16px 20px', borderTop:'1px solid #F3F4F6', display:'flex', justifyContent:'flex-end', gap:12, alignItems:'center' }}>
            {isLocked && (
              <span style={{ fontSize:12.5, color:'#6B7280' }}>🔒 Approved — contact an administrator to make changes.</span>
            )}

            {!isSubmitted && (
              <button onClick={handleSave} disabled={saving || !allMarked}
                title={!allMarked ? 'Mark every employee first' : ''}
                style={{ padding:'10px 32px', borderRadius:20, background: allMarked ? '#F59E0B' : '#D1D5DB',
                  color:'#fff', border:'none', fontSize:13, fontWeight:700,
                  cursor:(saving || !allMarked) ? 'not-allowed' : 'pointer' }}>
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
                <button onClick={() => { setEditMode(false); loadTeachers(); }}
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