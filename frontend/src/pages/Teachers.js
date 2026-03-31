import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, ActionBtn, SearchBox, LoadingState, EmptyState } from '../components/ui';

const COLS = '40px 2fr 1fr 1fr 1fr 80px';
const FORM_EMPTY = { name: '', email: '', phone: '', employeeId: '', qualification: '', experience: '', designation: '' };

export default function Teachers() {
  const { isAdmin } = useAuth();
  const [teachers, setTeachers] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [search,   setSearch]   = useState('');
  const [modal,    setModal]    = useState({ open: false, data: null });
  const [form,     setForm]     = useState(FORM_EMPTY);
  const [saving,   setSaving]   = useState(false);

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

  const openAdd = () => {
    setForm(FORM_EMPTY);
    setModal({ open: true, data: null });
  };

  const openEdit = (t) => {
    setForm({
      _id:           t._id,
      name:          t.user?.name        || '',
      email:         t.user?.email       || '',
      phone:         t.user?.phone       || '',
      employeeId:    t.employeeId        || '',
      qualification: t.qualification     || '',
      experience:    t.experience        || '',
      designation:   t.designation       || '',
    });
    setModal({ open: true, data: t });
  };

  const handleSave = async () => {
    if (!form.name?.trim())  return toast.error('Teacher name is required');
    if (!form.email?.trim()) return toast.error('Email is required');
    setSaving(true);
    try {
      if (form._id) {
        await teacherAPI.update(form._id, form);
        toast.success('Teacher updated');
      } else {
        await teacherAPI.create(form);
        toast.success('Teacher added successfully');
      }
      setModal({ open: false, data: null });
      setForm(FORM_EMPTY);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving teacher');
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Teachers</h2>
          <p className="text-sm text-muted mt-0.5">{teachers.length} staff members</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={openAdd}>+ Add Teacher</button>}
      </div>

      <div className="flex gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name or employee ID…" />
      </div>

      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          <div className="bg-warm dark:bg-gray-800 px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: COLS }}>
            {['#', 'Teacher', 'Employee ID', 'Subjects', 'Status', 'Actions'].map(h => (
              <div key={h} className="table-th">{h}</div>
            ))}
          </div>
          {!filtered.length ? <EmptyState icon="🎓" title="No teachers found" /> : (
            filtered.map((t, i) => (
              <div key={t._id} className="grid gap-4 px-5 py-3 border-t border-border items-center hover:bg-warm/40 dark:hover:bg-gray-800/50 transition-colors" style={{ gridTemplateColumns: COLS }}>
                <div className="text-muted text-sm">{i + 1}</div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={t.user?.name} size="sm" />
                  <div>
                    <div className="font-medium text-sm text-ink dark:text-white">{t.user?.name}</div>
                    <div className="text-xs text-muted">{t.user?.email}</div>
                  </div>
                </div>
                <div className="text-sm text-slate dark:text-gray-300 font-mono text-xs">{t.employeeId || '—'}</div>
                <div className="text-sm text-slate dark:text-gray-300 truncate">{t.subjects?.map(s => s.name).join(', ') || '—'}</div>
                <Badge status={t.isActive ? 'active' : 'inactive'} />
                <div className="flex gap-1.5">
                  {isAdmin && <ActionBtn icon="✎" title="Edit" onClick={() => openEdit(t)} />}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      <Modal
        isOpen={modal.open}
        onClose={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}
        title={form._id ? 'Edit Teacher' : 'Add New Teacher'}
        size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : form._id ? 'Save Changes' : 'Add Teacher'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Full Name *" className="col-span-2">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mr. Rajesh Sharma" />
          </FormGroup>
          <FormGroup label="Email *">
            <input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="teacher@school.com" />
          </FormGroup>
          <FormGroup label="Phone">
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" />
          </FormGroup>
          <FormGroup label="Employee ID">
            <input className="form-input" value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="EMP-042" />
          </FormGroup>
          <FormGroup label="Designation">
            <input className="form-input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Senior Teacher" />
          </FormGroup>
          <FormGroup label="Qualification">
            <input className="form-input" value={form.qualification} onChange={e => set('qualification', e.target.value)} placeholder="M.Sc Mathematics" />
          </FormGroup>
          <FormGroup label="Experience (years)">
            <input type="number" className="form-input" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="5" min="0" />
          </FormGroup>
          {!form._id && (
            <div className="col-span-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-xs text-blue-700 dark:text-blue-300">
              💡 Default password: <strong>Teacher@123</strong> — teacher can change after first login.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}