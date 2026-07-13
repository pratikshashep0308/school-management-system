/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import api, { classAPI, subjectAPI, homeworkAPI as hwStatusAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import StatusRosterModal from '../components/StatusRosterModal';
import { shareOnWhatsApp, shareFilesToWhatsApp, canShareFiles } from '../utils/whatsappShare';
import { AttachmentUploader, AttachmentList } from '../components/Attachments';

const homeworkAPI = {
  getAll:  (p)    => api.get('/homework', { params: p }),
  create:  (d)    => api.post('/homework', d),
  update:  (id,d) => api.put(`/homework/${id}`, d),
  remove:  (id)   => api.delete(`/homework/${id}`),
};

const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', color:'#111827' };
const LBL = { fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:5, textTransform:'uppercase', letterSpacing:'0.3px' };

const STATUS_LABEL = {
  completed:      'Completed',
  not_completed:  'Not Completed',
  not_applicable: 'Not Applicable',
  active:         'Not Completed',
  cancelled:      'Not Applicable',
};
function statusColor(s) {
  if (s === 'completed')      return { bg:'#DCFCE7', text:'#166534', border:'#86EFAC' };
  if (s === 'not_applicable' || s === 'cancelled') return { bg:'#F3F4F6', text:'#6B7280', border:'#E5E7EB' };
  return { bg:'#FEF3C7', text:'#92400E', border:'#FCD34D' }; // not_completed / active
}

function statusBadge(hw) {
  const now = new Date();
  const due = new Date(hw.dueDate);
  if (hw.status === 'completed') return { label:'Completed', color:'#166534', bg:'#DCFCE7' };
  if (due < now) return { label:'Overdue', color:'#DC2626', bg:'#FEF2F2' };
  const d = Math.ceil((due - now) / 86400000);
  if (d === 0) return { label:'Due Today', color:'#D97706', bg:'#FFFBEB' };
  if (d === 1) return { label:'Due Tomorrow', color:'#D97706', bg:'#FFFBEB' };
  return { label:`${d} days left`, color:'#166534', bg:'#DCFCE7' };
}

export default function Homework() {
  const { user } = useAuth();
  const isStaff   = ['teacher','schoolAdmin','superAdmin'].includes(user?.role);
  const isStudent = user?.role === 'student';
  const isParent  = user?.role === 'parent';
  const viewOnly  = isStudent || isParent;

  const today = new Date().toISOString().split('T')[0];

  const [hw,          setHw]          = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [showModal,   setShowModal]   = useState(false);
  const [rosterHw,    setRosterHw]    = useState(null); // homework whose per-student status is open
  const [saving,      setSaving]      = useState(false);

  // Filters (eSkooly style)
  const [filterDate,    setFilterDate]    = useState('');
  const [filterClass,   setFilterClass]   = useState('');
  const [filterSubject, setFilterSubject] = useState('');

  const [form, setForm] = useState({
    date: today, classId: '', subjectId: '', detail: '', attachments: []
  });

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (filterDate)    params.date    = filterDate;
      if (filterClass)   params.class   = filterClass;
      if (filterSubject) params.subject = filterSubject;
      const r = await homeworkAPI.getAll(params);
      setHw(r.data.data || []);
    } catch { toast.error('Failed to load homework'); }
    finally { setLoading(false); }
  }, [filterDate, filterClass, filterSubject]);

  useEffect(() => {
    load();
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
    subjectAPI.getAll().then(r => setSubjects(r.data.data || [])).catch(() => {});
  }, [load]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const save = async () => {
    if (!form.classId)  return toast.error('Select a class');
    if (!form.detail)   return toast.error('Enter homework detail');
    if (!form.date)     return toast.error('Select date');
    setSaving(true);
    try {
      await homeworkAPI.create({
        title:       form.detail.substring(0, 60),
        description: form.detail,
        class:       form.classId,
        subject:     form.subjectId || undefined,
        assignedDate:form.date,
        dueDate:     form.date,
        attachments: form.attachments || [],
      });
      toast.success('Homework added!');
      setShowModal(false);
      setForm({ date: today, classId: '', subjectId: '', detail: '', attachments: [] });
      load();
    } catch (e) { toast.error(e?.response?.data?.message || 'Failed'); }
    finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this homework?')) return;
    try { await homeworkAPI.remove(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed'); }
  };

  const setStatus = async (id, status) => {
    try { await homeworkAPI.update(id, { status }); toast.success('Status updated'); load(); }
    catch { toast.error('Failed to update status'); }
  };

  return (
    <div style={{ fontFamily:'Inter,sans-serif', padding:'0 0 40px' }}>

      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#0B1F4A', margin:0 }}>📚 Homework</h2>
          <p style={{ fontSize:12, color:'#9CA3AF', marginTop:3 }}>
            {viewOnly ? 'View homework assigned to your class' : 'Manage and assign homework'}
          </p>
        </div>
        {isStaff && (
          <button onClick={() => setShowModal(true)}
            style={{ padding:'10px 20px', borderRadius:8, background:'#7C3AED', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
            + Add Homework
          </button>
        )}
      </div>

      {/* eSkooly-style filter bar */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', padding:'16px 20px', marginBottom:20 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div style={{ flex:1, minWidth:160 }}>
            <label style={LBL}>Homework Date</label>
            <input type="date" style={INP} value={filterDate} onChange={e => setFilterDate(e.target.value)}/>
          </div>
          <div style={{ flex:1, minWidth:160 }}>
            <label style={LBL}>Class</label>
            <select style={INP} value={filterClass} onChange={e => setFilterClass(e.target.value)}>
              <option value="">All Classes</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.section ? ' '+c.section : ''}</option>)}
            </select>
          </div>
          <div style={{ flex:1, minWidth:160 }}>
            <label style={LBL}>Subject</label>
            <select style={INP} value={filterSubject} onChange={e => setFilterSubject(e.target.value)}>
              <option value="">All Subjects</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={load}
              style={{ padding:'10px 22px', borderRadius:8, background:'#7C3AED', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              Search
            </button>
            <button onClick={() => { setFilterDate(''); setFilterClass(''); setFilterSubject(''); }}
              style={{ padding:'10px 16px', borderRadius:8, background:'#F3F4F6', color:'#374151', border:'1px solid #E5E7EB', fontSize:13, cursor:'pointer' }}>
              Clear
            </button>
          </div>
        </div>
      </div>

      {/* Homework Table */}
      <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
        <div style={{ background:'#0B1F4A', padding:'12px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <span style={{ color:'#fff', fontWeight:700, fontSize:14 }}>📋 Homeworks</span>
          <span style={{ color:'rgba(255,255,255,0.5)', fontSize:12 }}>{hw.length} records</span>
        </div>

        {loading ? (
          <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading…</div>
        ) : hw.length === 0 ? (
          <div style={{ padding:60, textAlign:'center', color:'#9CA3AF' }}>
            <div style={{ fontSize:40, marginBottom:12 }}>📭</div>
            <div style={{ fontWeight:700 }}>No data found!</div>
            <div style={{ fontSize:12, marginTop:6 }}>
              {filterDate || filterClass || filterSubject
                ? 'Try changing your filters'
                : isStaff ? 'Click "+ Add Homework" to assign' : 'No homework assigned yet'}
            </div>
          </div>
        ) : (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {['#','Date','Class','Subject','Homework Detail','Set By','Status', isStaff ? 'Actions' : ''].filter(Boolean).map(h => (
                    <th key={h} style={{ padding:'10px 16px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {hw.map((h, i) => {
                  const sb = statusBadge(h);
                  const cls = h.class ? `${h.class.name}${h.class.section ? ' '+h.class.section : ''}` : '—';
                  const sub = h.subject?.name || '—';
                  const tName = h.teacher?.user?.name || h.createdByName || '—';
                  const date = h.assignedDate
                    ? new Date(h.assignedDate).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' })
                    : '—';
                  return (
                    <tr key={h._id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2 ? '#FAFAFA' : '#fff' }}>
                      <td style={{ padding:'12px 16px', color:'#9CA3AF', fontWeight:600 }}>{i+1}</td>
                      <td style={{ padding:'12px 16px', color:'#374151', whiteSpace:'nowrap' }}>{date}</td>
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ background:'#EDE9FE', color:'#7C3AED', padding:'3px 10px', borderRadius:20, fontSize:12, fontWeight:700 }}>{cls}</span>
                      </td>
                      <td style={{ padding:'12px 16px', color:'#374151' }}>{sub}</td>
                      <td style={{ padding:'12px 16px', maxWidth:300 }}>
                        <div style={{ fontWeight:600, color:'#111827', marginBottom:2 }}>{h.title}</div>
                        {h.description && h.description !== h.title && (
                          <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.5 }}>{h.description}</div>
                        )}
                        {h.attachments?.length > 0 && <AttachmentList attachments={h.attachments} />}
                      </td>
                      <td style={{ padding:'12px 16px', color:'#374151', whiteSpace:'nowrap' }}>{tName}</td>
                      <td style={{ padding:'12px 16px' }}>
                        {isStaff ? (
                          <select
                            value={h.status}
                            onChange={e => setStatus(h._id, e.target.value)}
                            style={{
                              fontSize:12, fontWeight:700, padding:'5px 8px', borderRadius:8, cursor:'pointer', outline:'none',
                              border:'1.5px solid ' + statusColor(h.status).border,
                              background: statusColor(h.status).bg, color: statusColor(h.status).text,
                            }}>
                            <option value="completed">Completed</option>
                            <option value="not_completed">Not Completed</option>
                            <option value="not_applicable">Not Applicable</option>
                          </select>
                        ) : (
                          <span style={{ fontSize:11, fontWeight:700, padding:'4px 10px', borderRadius:20, background:statusColor(h.status).bg, color:statusColor(h.status).text }}>
                            {STATUS_LABEL[h.status] || sb.label}
                          </span>
                        )}
                      </td>
                      {isStaff && (
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', gap:6 }}>
                            <button onClick={() => shareOnWhatsApp({ kind:'Homework', title:h.title, subject:sub, class:cls, dueDate:h.dueDate, description:h.description, attachments:h.attachments })}
                              title="Share text on WhatsApp"
                              style={{ padding:'4px 10px', borderRadius:6, border:'1.5px solid #25D366', background:'#25D366', color:'#fff', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                              🟢 WhatsApp
                            </button>
                            {h.attachments?.length > 0 && canShareFiles() && (
                              <button onClick={() => shareFilesToWhatsApp({ kind:'Homework', title:h.title, subject:sub, class:cls, dueDate:h.dueDate, description:h.description, attachments:h.attachments })}
                                title="Share file (image/PDF) via WhatsApp"
                                style={{ padding:'4px 10px', borderRadius:6, border:'1.5px solid #128C7E', background:'#fff', color:'#128C7E', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                                📎 Send file
                              </button>
                            )}
                            <button onClick={() => setRosterHw(h)}
                              style={{ padding:'4px 10px', borderRadius:6, border:'1.5px solid #E5E7EB', background:'#fff', color:'#0B1F4A', fontSize:11, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                              👥 Students
                            </button>
                            <button onClick={() => remove(h._id)}
                              style={{ padding:'4px 10px', borderRadius:6, border:'none', background:'#FEF2F2', color:'#DC2626', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                              🗑
                            </button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Homework Modal */}
      {showModal && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
          onClick={e => e.target === e.currentTarget && setShowModal(false)}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:520, boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}>
            {/* Modal Header */}
            <div style={{ background:'#7C3AED', padding:'16px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:800, fontSize:15, color:'#fff' }}>Add Homework or Assignment</span>
              <button onClick={() => setShowModal(false)}
                style={{ width:28, height:28, borderRadius:'50%', background:'rgba(255,255,255,0.2)', border:'none', color:'#fff', cursor:'pointer', fontSize:16, fontWeight:700 }}>×</button>
            </div>

            {/* Modal Body */}
            <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
              <div>
                <label style={LBL}>Homework Date *</label>
                <input type="date" style={INP} value={form.date} onChange={e => set('date', e.target.value)}/>
              </div>
              <div>
                <label style={LBL}>Set By</label>
                <input style={{ ...INP, background:'#F9FAFB', color:'#6B7280' }} value={user?.name || 'Admin'} readOnly/>
              </div>
              <div>
                <label style={LBL}>Class *</label>
                <select style={INP} value={form.classId} onChange={e => set('classId', e.target.value)}>
                  <option value="">-- Select Class --</option>
                  {classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.section ? ' '+c.section : ''}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Subject</label>
                <select style={INP} value={form.subjectId} onChange={e => set('subjectId', e.target.value)}>
                  <option value="">-- Select Subject --</option>
                  {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
                </select>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={LBL}>Homework Detail *</label>
                <textarea style={{ ...INP, minHeight:120, resize:'vertical', fontFamily:'inherit' }}
                  value={form.detail} onChange={e => set('detail', e.target.value)}
                  placeholder="Enter homework details, instructions, or assignment description…"/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={LBL}>Attachments (diagrams / tables / worksheets)</label>
                <AttachmentUploader value={form.attachments} onChange={(a) => set('attachments', a)} />
              </div>
            </div>

            {/* Modal Footer */}
            <div style={{ padding:'0 24px 20px', display:'flex', justifyContent:'flex-end', gap:10 }}>
              <button onClick={() => setShowModal(false)}
                style={{ padding:'10px 20px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
                Close
              </button>
              <button onClick={save} disabled={saving}
                style={{ padding:'10px 24px', borderRadius:8, background:'#7C3AED', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                {saving ? '⏳ Saving…' : '+ Add Homework'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Per-student completion status */}
      {rosterHw && (
        <StatusRosterModal
          open={!!rosterHw}
          onClose={() => setRosterHw(null)}
          title={rosterHw.title}
          getStatuses={() => hwStatusAPI.getStatuses(rosterHw._id)}
          setStatus={(studentId, status) => hwStatusAPI.setStatus(rosterHw._id, studentId, status)}
        />
      )}
    </div>
  );
}