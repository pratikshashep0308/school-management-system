import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { studentAPI, classAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, ActionBtn, SearchBox, LoadingState, EmptyState } from '../components/ui';

const COLS = '40px 2fr 1fr 1fr 1fr 1fr 80px';

function StudentModal({ isOpen, onClose, onSave, initial, classes }) {
  const [form, setForm] = useState(initial || { name: '', email: '', phone: '', admissionNumber: '', rollNumber: '', classId: '', gender: '', dateOfBirth: '', parentName: '', parentPhone: '', parentEmail: '', bloodGroup: '' });
  useEffect(() => { if (initial) setForm(initial); }, [initial]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSave = async () => {
    if (!form.name || !form.email || !form.admissionNumber) { toast.error('Name, email, and admission number are required'); return; }
    await onSave(form);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial?._id ? 'Edit Student' : 'Add New Student'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={handleSave}>{initial?._id ? 'Save Changes' : 'Add Student'}</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Full Name"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Arjun Sharma" /></FormGroup>
        <FormGroup label="Email"><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@school.com" /></FormGroup>
        <FormGroup label="Admission Number"><input className="form-input" value={form.admissionNumber} onChange={e => set('admissionNumber', e.target.value)} placeholder="STU-2024-001" /></FormGroup>
        <FormGroup label="Roll Number"><input className="form-input" value={form.rollNumber} onChange={e => set('rollNumber', e.target.value)} placeholder="01" /></FormGroup>
        <FormGroup label="Class">
          <select className="form-input" value={form.classId} onChange={e => set('classId', e.target.value)}>
            <option value="">Select class</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Gender">
          <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
            <option value="">Select gender</option>
            <option value="male">Male</option>
            <option value="female">Female</option>
            <option value="other">Other</option>
          </select>
        </FormGroup>
        <FormGroup label="Date of Birth"><input type="date" className="form-input" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormGroup>
        <FormGroup label="Blood Group">
          <select className="form-input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
            <option value="">Select</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Parent Name"><input className="form-input" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Rajesh Sharma" /></FormGroup>
        <FormGroup label="Parent Phone"><input className="form-input" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="9876543210" /></FormGroup>
      </div>
    </Modal>
  );
}

export default function Students() {
  const { isAdmin } = useAuth();
  const [students, setStudents] = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [filterClass, setFilterClass] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([studentAPI.getAll(), classAPI.getAll()]);
      setStudents(sRes.data.data);
      setClasses(cRes.data.data);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const name = s.user?.name?.toLowerCase() || '';
    const id = s.admissionNumber?.toLowerCase() || '';
    const cls = s.class?.name?.toLowerCase() || '';
    const matchSearch = !q || name.includes(q) || id.includes(q) || cls.includes(q);
    const matchClass = !filterClass || s.class?._id === filterClass;
    return matchSearch && matchClass;
  });

  const handleSave = async (form) => {
    try {
      if (modal.data?._id) {
        await studentAPI.update(modal.data._id, form);
        toast.success('Student updated');
      } else {
        await studentAPI.create(form);
        toast.success('Student added successfully');
      }
      setModal({ open: false, data: null });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving student'); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Deactivate ${name}?`)) return;
    try {
      await studentAPI.delete(id);
      toast.success('Student deactivated');
      load();
    } catch { toast.error('Failed to deactivate student'); }
  };

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Students</h2>
          <p className="text-sm text-muted mt-0.5">{students.length} total students enrolled</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Add Student</button>
        )}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name, ID, class…" />
        <select className="form-input w-auto" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          {/* Head */}
          <div className={`bg-warm px-5 py-3 grid gap-4 border-b border-border`} style={{ gridTemplateColumns: COLS }}>
            {['#', 'Student', 'Class', 'Roll No', 'Status', 'Admission No', 'Actions'].map(h => (
              <div key={h} className="table-th">{h}</div>
            ))}
          </div>

          {!filtered.length
            ? <EmptyState icon="👤" title="No students found" subtitle="Try adjusting your search or filters" />
            : filtered.map((s, i) => (
              <div key={s._id} className="grid gap-4 px-5 py-3 border-t border-border items-center hover:bg-warm/40 transition-colors" style={{ gridTemplateColumns: COLS }}>
                <div className="text-muted text-sm">{i + 1}</div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={s.user?.name} size="sm" />
                  <div>
                    <div className="font-medium text-sm text-ink">{s.user?.name}</div>
                    <div className="text-xs text-muted">{s.user?.email}</div>
                  </div>
                </div>
                <div className="text-sm text-slate">{s.class ? `${s.class.name} — ${s.class.section}` : '—'}</div>
                <div className="text-sm text-slate">{s.rollNumber || '—'}</div>
                <Badge status={s.isActive ? 'active' : 'inactive'} />
                <div className="text-sm text-slate font-mono text-xs">{s.admissionNumber}</div>
                <div className="flex gap-1.5">
                  {isAdmin && <ActionBtn icon="✎" title="Edit" onClick={() => setModal({ open: true, data: { ...s, name: s.user?.name, email: s.user?.email, classId: s.class?._id } })} />}
                  {isAdmin && <ActionBtn icon="✕" title="Deactivate" variant="danger" onClick={() => handleDelete(s._id, s.user?.name)} />}
                </div>
              </div>
            ))
          }
        </div>
      )}

      <StudentModal
        isOpen={modal.open}
        onClose={() => setModal({ open: false, data: null })}
        onSave={handleSave}
        initial={modal.data}
        classes={classes}
      />
    </div>
  );
}
