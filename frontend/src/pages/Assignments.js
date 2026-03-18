import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { assignmentAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

export default function Assignments() {
  const { isAdmin, isTeacher, isStudent } = useAuth();
  const [assignments, setAssignments] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [filterClass, setFilterClass] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const params = filterClass ? { classId: filterClass } : {};
      const [aRes, cRes, sRes] = await Promise.all([assignmentAPI.getAll(params), classAPI.getAll(), subjectAPI.getAll()]);
      setAssignments(aRes.data.data);
      setClasses(cRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load assignments'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, [filterClass]);

  const handleSave = async (form) => {
    try {
      if (form._id) { await assignmentAPI.update(form._id, form); toast.success('Assignment updated'); }
      else { await assignmentAPI.create(form); toast.success('Assignment created'); }
      setModal({ open: false, data: null }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving assignment'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this assignment?')) return;
    try { await assignmentAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Assignments</h2>
          <p className="text-sm text-muted mt-0.5">{assignments.length} assignments</p>
        </div>
        {(isAdmin || isTeacher) && <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Create Assignment</button>}
      </div>

      <div className="flex gap-3 mb-5">
        <select className="form-input w-auto" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !assignments.length ? <EmptyState icon="📋" title="No assignments found" /> : (
        <div className="grid gap-3">
          {assignments.map(a => {
            const due = a.dueDate ? new Date(a.dueDate) : null;
            const isOverdue = due && due < new Date();
            return (
              <div key={a._id} className="card px-6 py-5 flex items-start gap-5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">📋</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-ink">{a.title}</span>
                    {isOverdue && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-accent/10 text-accent uppercase">Overdue</span>}
                  </div>
                  <div className="text-sm text-muted mb-2">{a.class?.name} {a.class?.section} · {a.subject?.name} · By: {a.teacher?.user?.name}</div>
                  {a.description && <p className="text-sm text-slate line-clamp-2">{a.description}</p>}
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                    <span>📅 Due: <strong className={isOverdue ? 'text-accent' : 'text-ink'}>{due?.toLocaleDateString('en-IN') || 'TBD'}</strong></span>
                    <span>📊 Marks: <strong className="text-ink">{a.totalMarks}</strong></span>
                    <span>📤 Submissions: <strong className="text-ink">{a.submissions?.length || 0}</strong></span>
                  </div>
                </div>
                {(isAdmin || isTeacher) && (
                  <div className="flex gap-1.5">
                    <button onClick={() => setModal({ open: true, data: { ...a, class: a.class?._id, subject: a.subject?._id, dueDate: a.dueDate?.split('T')[0] } })}
                      className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                    <button onClick={() => handleDelete(a._id)}
                      className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data?._id ? 'Edit Assignment' : 'Create Assignment'} size="lg"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleSave(modal.data || {})}>Save</button></>}>
        {modal.open && <AssignForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} classes={classes} subjects={subjects} />}
      </Modal>
    </div>
  );
}

function AssignForm({ data, setData, classes, subjects }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Title" className="col-span-2"><input className="form-input" value={d.title || ''} onChange={e => set('title', e.target.value)} placeholder="Assignment title" /></FormGroup>
      <FormGroup label="Description" className="col-span-2"><textarea className="form-input" rows={3} value={d.description || ''} onChange={e => set('description', e.target.value)} placeholder="Assignment details…" /></FormGroup>
      <FormGroup label="Class">
        <select className="form-input" value={d.class || ''} onChange={e => set('class', e.target.value)}>
          <option value="">Select class</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Subject">
        <select className="form-input" value={d.subject || ''} onChange={e => set('subject', e.target.value)}>
          <option value="">Select subject</option>
          {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Due Date"><input type="date" className="form-input" value={d.dueDate || ''} onChange={e => set('dueDate', e.target.value)} /></FormGroup>
      <FormGroup label="Total Marks"><input type="number" className="form-input" value={d.totalMarks || ''} onChange={e => set('totalMarks', e.target.value)} placeholder="10" /></FormGroup>
    </div>
  );
}
