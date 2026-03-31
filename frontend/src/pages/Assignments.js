import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { assignmentAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const FORM_EMPTY = { title: '', description: '', class: '', subject: '', dueDate: '', totalMarks: 10 };

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

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Assignments</h2>
          <p className="text-sm text-muted mt-0.5">{assignments.length} assignments</p>
        </div>
        {(isAdmin || isTeacher) && (
          <button className="btn-primary" onClick={openAdd}>+ Create Assignment</button>
        )}
      </div>

      <div className="flex gap-3 mb-5">
        <select className="form-input w-auto" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !assignments.length ? (
        <EmptyState icon="📋" title="No assignments found" />
      ) : (
        <div className="grid gap-3">
          {assignments.map(a => {
            const due = a.dueDate ? new Date(a.dueDate) : null;
            const isOverdue = due && due < new Date();
            return (
              <div key={a._id} className="card px-6 py-5 flex items-start gap-5">
                <div className="w-12 h-12 rounded-xl bg-accent/10 flex items-center justify-center text-2xl flex-shrink-0">📋</div>
                <div className="flex-1">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <span className="font-semibold text-ink dark:text-white">{a.title}</span>
                    {isOverdue && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-100 text-red-600 uppercase">Overdue</span>}
                  </div>
                  <div className="text-sm text-muted mb-2">
                    {a.class?.name} {a.class?.section} · {a.subject?.name}
                    {a.teacher?.user?.name && <> · By: {a.teacher.user.name}</>}
                  </div>
                  {a.description && <p className="text-sm text-slate line-clamp-2">{a.description}</p>}
                  <div className="flex items-center gap-4 mt-3 text-xs text-muted">
                    <span>📅 Due: <strong className={isOverdue ? 'text-red-500' : 'text-ink dark:text-white'}>{due?.toLocaleDateString('en-IN') || 'TBD'}</strong></span>
                    <span>📊 Marks: <strong className="text-ink dark:text-white">{a.totalMarks}</strong></span>
                    <span>📤 Submissions: <strong className="text-ink dark:text-white">{a.submissions?.length || 0}</strong></span>
                  </div>
                </div>
                {(isAdmin || isTeacher) && (
                  <div className="flex gap-1.5">
                    <button onClick={() => openEdit(a)} className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                    <button onClick={() => handleDelete(a._id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false }); setForm(FORM_EMPTY); }}
        title={form._id ? 'Edit Assignment' : 'Create Assignment'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false }); setForm(FORM_EMPTY); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : form._id ? 'Update' : 'Create'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Title *" className="col-span-2">
            <input className="form-input" value={form.title} onChange={e => set('title', e.target.value)} placeholder="Assignment title" />
          </FormGroup>
          <FormGroup label="Description" className="col-span-2">
            <textarea className="form-input" rows={3} value={form.description} onChange={e => set('description', e.target.value)} placeholder="Assignment details…" style={{ resize: 'vertical' }} />
          </FormGroup>
          <FormGroup label="Class *">
            <select className="form-input" value={form.class} onChange={e => set('class', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Subject">
            <select className="form-input" value={form.subject} onChange={e => set('subject', e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Due Date">
            <input type="date" className="form-input" value={form.dueDate} onChange={e => set('dueDate', e.target.value)} />
          </FormGroup>
          <FormGroup label="Total Marks">
            <input type="number" className="form-input" value={form.totalMarks} onChange={e => set('totalMarks', +e.target.value)} placeholder="10" min="1" />
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}