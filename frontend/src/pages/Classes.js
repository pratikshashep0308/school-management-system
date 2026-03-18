import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const CLASS_COLORS = ['#d4522a','#c9a84c','#4a7c59','#7c6af5','#2d9cdb','#f2994a'];

export default function Classes() {
  const { isAdmin } = useAuth();
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, tRes, sRes] = await Promise.all([classAPI.getAll(), teacherAPI.getAll(), subjectAPI.getAll()]);
      setClasses(cRes.data.data);
      setTeachers(tRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load classes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (form._id) { await classAPI.update(form._id, form); toast.success('Class updated'); }
      else { await classAPI.create(form); toast.success('Class created'); }
      setModal({ open: false, data: null }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving class'); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Classes</h2>
          <p className="text-sm text-muted mt-0.5">{classes.length} classes across all grades</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Add Class</button>}
      </div>

      {loading ? <LoadingState /> : !classes.length ? <EmptyState icon="🏛" title="No classes yet" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls, i) => (
            <div key={cls._id} className="card p-6 hover:-translate-y-1 transition-transform cursor-pointer relative overflow-hidden">
              <div className="absolute bottom-0 left-0 right-0 h-1 rounded-b-2xl" style={{ background: CLASS_COLORS[i % CLASS_COLORS.length] }} />
              <div className="absolute top-4 right-4 bg-warm px-2 py-1 rounded-md text-xs text-slate font-semibold">{cls.section}</div>
              <div className="font-display text-5xl text-ink leading-none mb-1">{cls.grade}</div>
              <div className="text-sm text-muted mb-4">{cls.name}</div>
              <div className="flex gap-5">
                <div>
                  <div className="text-xl font-bold text-ink">{cls.students?.length || 0}</div>
                  <div className="text-xs text-muted">Students</div>
                </div>
                <div>
                  <div className="text-sm font-semibold text-ink">{cls.classTeacher?.user?.name || '—'}</div>
                  <div className="text-xs text-muted">Class Teacher</div>
                </div>
              </div>
              {isAdmin && (
                <button onClick={() => setModal({ open: true, data: { ...cls, classTeacher: cls.classTeacher?._id } })}
                  className="absolute top-4 left-4 w-7 h-7 flex items-center justify-center rounded-lg border border-border text-muted hover:border-accent hover:text-accent transition-all text-xs">✎</button>
              )}
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data?._id ? 'Edit Class' : 'Add Class'} size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleSave(modal.data || {})}>Save</button></>}>
        {modal.open && <ClassForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} teachers={teachers} subjects={subjects} />}
      </Modal>
    </div>
  );
}

function ClassForm({ data, setData, teachers, subjects }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Class Name"><input className="form-input" value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder="Class X" /></FormGroup>
      <FormGroup label="Grade"><input type="number" className="form-input" value={d.grade || ''} onChange={e => set('grade', e.target.value)} placeholder="10" /></FormGroup>
      <FormGroup label="Section"><input className="form-input" value={d.section || ''} onChange={e => set('section', e.target.value)} placeholder="A" /></FormGroup>
      <FormGroup label="Room"><input className="form-input" value={d.room || ''} onChange={e => set('room', e.target.value)} placeholder="101" /></FormGroup>
      <FormGroup label="Capacity"><input type="number" className="form-input" value={d.capacity || ''} onChange={e => set('capacity', e.target.value)} placeholder="40" /></FormGroup>
      <FormGroup label="Class Teacher">
        <select className="form-input" value={d.classTeacher || ''} onChange={e => set('classTeacher', e.target.value)}>
          <option value="">Select teacher</option>
          {teachers.map(t => <option key={t._id} value={t._id}>{t.user?.name}</option>)}
        </select>
      </FormGroup>
    </div>
  );
}
