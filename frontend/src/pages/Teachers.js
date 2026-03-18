import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, ActionBtn, SearchBox, LoadingState, EmptyState } from '../components/ui';

const COLS = '40px 2fr 1fr 1fr 1fr 80px';

export default function Teachers() {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([teacherAPI.getAll(), subjectAPI.getAll()]);
      setTeachers(tRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load teachers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = teachers.filter(t => {
    const q = search.toLowerCase();
    return !q || t.user?.name?.toLowerCase().includes(q) || t.employeeId?.toLowerCase().includes(q);
  });

  const handleSave = async (form) => {
    try {
      if (modal.data?._id) {
        await teacherAPI.update(modal.data._id, form);
        toast.success('Teacher updated');
      } else {
        await teacherAPI.create(form);
        toast.success('Teacher added successfully');
      }
      setModal({ open: false, data: null });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving teacher'); }
  };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Teachers</h2>
          <p className="text-sm text-muted mt-0.5">{teachers.length} staff members</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Add Teacher</button>}
      </div>

      <div className="flex gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name or employee ID…" />
      </div>

      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          <div className="bg-warm px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: COLS }}>
            {['#', 'Teacher', 'Employee ID', 'Subjects', 'Status', 'Actions'].map(h => <div key={h} className="table-th">{h}</div>)}
          </div>
          {!filtered.length
            ? <EmptyState icon="🎓" title="No teachers found" />
            : filtered.map((t, i) => (
              <div key={t._id} className="grid gap-4 px-5 py-3 border-t border-border items-center hover:bg-warm/40 transition-colors" style={{ gridTemplateColumns: COLS }}>
                <div className="text-muted text-sm">{i + 1}</div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={t.user?.name} size="sm" />
                  <div>
                    <div className="font-medium text-sm text-ink">{t.user?.name}</div>
                    <div className="text-xs text-muted">{t.user?.email}</div>
                  </div>
                </div>
                <div className="text-sm text-slate font-mono text-xs">{t.employeeId}</div>
                <div className="text-sm text-slate truncate">{t.subjects?.map(s => s.name).join(', ') || '—'}</div>
                <Badge status={t.isActive ? 'active' : 'inactive'} />
                <div className="flex gap-1.5">
                  {isAdmin && <ActionBtn icon="✎" title="Edit" onClick={() => setModal({ open: true, data: { ...t, name: t.user?.name, email: t.user?.email } })} />}
                </div>
              </div>
            ))
          }
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data?._id ? 'Edit Teacher' : 'Add New Teacher'} size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleSave(modal.data || {})}>Save</button></>}>
        {modal.open && <TeacherForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} subjects={subjects} />}
      </Modal>
    </div>
  );
}

function TeacherForm({ data, setData, subjects }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Full Name"><input className="form-input" value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder="Mr. Rajesh Sharma" /></FormGroup>
      <FormGroup label="Employee ID"><input className="form-input" value={d.employeeId || ''} onChange={e => set('employeeId', e.target.value)} placeholder="EMP-042" /></FormGroup>
      <FormGroup label="Email"><input type="email" className="form-input" value={d.email || ''} onChange={e => set('email', e.target.value)} placeholder="teacher@school.com" /></FormGroup>
      <FormGroup label="Phone"><input className="form-input" value={d.phone || ''} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></FormGroup>
      <FormGroup label="Qualification"><input className="form-input" value={d.qualification || ''} onChange={e => set('qualification', e.target.value)} placeholder="M.Sc Mathematics" /></FormGroup>
      <FormGroup label="Experience (years)"><input type="number" className="form-input" value={d.experience || ''} onChange={e => set('experience', e.target.value)} placeholder="5" /></FormGroup>
    </div>
  );
}
