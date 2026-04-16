/* eslint-disable no-unused-vars, react-hooks/exhaustive-deps */
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { assignmentAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const FORM_EMPTY = { title: '', description: '', class: '', subject: '', dueDate: '', totalMarks: 10 };

const INPUT = { width:'100%', border:'1.5px solid #E5E7EB', borderRadius:8, padding:'7px 10px', fontSize:13, outline:'none', boxSizing:'border-box', fontFamily:'inherit', background:'#fff' };

export default function Assignments() {
  const { isAdmin, isTeacher } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [classes,     setClasses]     = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [modal,       setModal]       = useState({ open: false });
  const [form,        setForm]        = useState(FORM_EMPTY);
  const [saving,      setSaving]      = useState(false);
  const [filterClass, setFilterClass] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = filterClass ? { classId: filterClass } : {};
      const [aRes, cRes, sRes] = await Promise.all([
        assignmentAPI.getAll(params), classAPI.getAll(), subjectAPI.getAll(),
      ]);
      setAssignments(aRes.data.data);
      setClasses(cRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load assignments'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterClass]);

  const openAdd  = () => { setForm(FORM_EMPTY); setModal({ open: true }); };
  const openEdit = (a) => {
    setForm({
      _id: a._id,
      title: a.title || '',
      description: a.description || '',
      class: a.class?._id || a.class || '',
      subject: a.subject?._id || a.subject || '',
      dueDate: a.dueDate ? a.dueDate.split('T')[0] : '',
      totalMarks: a.totalMarks || 10,
    });
    setModal({ open: true });
  };

  const handleSave = async () => {
    if (!form.title?.trim()) return toast.error('Assignment title is required');
    if (!form.class)         return toast.error('Please select a class');
    setSaving(true);
    try {
      if (form._id) { await assignmentAPI.update(form._id, form); toast.success('Assignment updated'); }
      else          { await assignmentAPI.create(form);           toast.success('Assignment created'); }
      setModal({ open: false }); setForm(FORM_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving assignment'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try { await assignmentAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const closeModal = () => { setModal({ open: false }); setForm(FORM_EMPTY); };
  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div style={{ display:'flex', flexDirection:'column', gap:20 }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:800, color:'#111827', margin:0 }}>Assignments</h2>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>{assignments.length} assignments</p>
        </div>
        {(isAdmin || isTeacher) && (
          <button onClick={openAdd}
            style={{ padding:'10px 20px', borderRadius:10, background:'#D4522A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + Create Assignment
          </button>
        )}
      </div>

      {/* Filter */}
      <div>
        <select value={filterClass} onChange={e => setFilterClass(e.target.value)}
          style={{ ...INPUT, width:'auto', minWidth:160 }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>

      {/* List */}
      {loading ? <LoadingState /> : !assignments.length ? (
        <EmptyState icon="📋" title="No assignments found" />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
          {assignments.map(a => {
            const due = a.dueDate ? new Date(a.dueDate) : null;
            const isOverdue = due && due < new Date();
            return (
              <div key={a._id}
                onClick={() => (isAdmin || isTeacher) && openEdit(a)}
                style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:16, padding:'20px 24px', display:'flex', alignItems:'flex-start', gap:20, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', cursor: (isAdmin || isTeacher) ? 'pointer' : 'default' }}
                onMouseEnter={e => e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.10)'}
                onMouseLeave={e => e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'}>

                {/* Icon */}
                <div style={{ width:48, height:48, borderRadius:12, background:'#FEF3C7', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, flexShrink:0 }}>📋</div>

                {/* Content */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                    <span style={{ fontWeight:700, fontSize:15, color:'#111827' }}>{a.title}</span>
                    {isOverdue && (
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:'#FEE2E2', color:'#DC2626', textTransform:'uppercase' }}>Overdue</span>
                    )}
                  </div>
                  <div style={{ fontSize:13, color:'#6B7280', marginBottom:6 }}>
                    {a.class?.name} {a.class?.section} · {a.subject?.name}
                    {a.teacher?.user?.name && <> · By: {a.teacher.user.name}</>}
                  </div>
                  {a.description && (
                    <p style={{ fontSize:13, color:'#374151', margin:'0 0 8px', overflow:'hidden', display:'-webkit-box', WebkitLineClamp:2, WebkitBoxOrient:'vertical' }}>{a.description}</p>
                  )}
                  <div style={{ display:'flex', alignItems:'center', gap:16, fontSize:12, color:'#6B7280' }}>
                    <span>📅 Due: <strong style={{ color: isOverdue ? '#DC2626' : '#111827' }}>{due?.toLocaleDateString('en-IN') || 'TBD'}</strong></span>
                    <span>📊 Marks: <strong style={{ color:'#111827' }}>{a.totalMarks}</strong></span>
                    <span>📤 Submissions: <strong style={{ color:'#111827' }}>{a.submissions?.length || 0}</strong></span>
                  </div>
                </div>

                {/* Action buttons */}
                {(isAdmin || isTeacher) && (
                  <div style={{ display:'flex', gap:6 }} onClick={e => e.stopPropagation()}>
                    <button onClick={() => openEdit(a)}
                      style={{ width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', color:'#374151', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✎</button>
                    <button onClick={() => handleDelete(a._id)}
                      style={{ width:32, height:32, borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center' }}>✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Modal */}
      <Modal isOpen={modal.open} onClose={closeModal}
        title={form._id ? 'Edit Assignment' : 'Create Assignment'} size="lg"
        footer={<>
          <button onClick={closeModal}
            style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer', color:'#374151' }}>
            Cancel
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#2563EB', border:'none', cursor:'pointer', color:'#fff', opacity: saving ? 0.7 : 1 }}>
            {saving ? 'Saving…' : form._id ? 'Update' : 'Create'}
          </button>
        </>}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
          <FormGroup label="Title *" style={{ gridColumn:'1/-1' }}>
            <input style={INPUT} value={form.title} onChange={e => set('title', e.target.value)} placeholder="Assignment title" />
          </FormGroup>
          <FormGroup label="Description" style={{ gridColumn:'1/-1' }}>
            <textarea style={{ ...INPUT, resize:'vertical' }} rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Assignment details…" />
          </FormGroup>
          <FormGroup label="Class *">
            <select style={INPUT} value={form.class} onChange={e => set('class', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Subject">
            <select style={INPUT} value={form.subject} onChange={e => set('subject', e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Due Date">
            <input type="date" style={INPUT} value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FormGroup>
          <FormGroup label="Total Marks">
            <input type="number" style={INPUT} value={form.totalMarks} onChange={e => set('totalMarks', +e.target.value)} placeholder="10" min="1" />
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}