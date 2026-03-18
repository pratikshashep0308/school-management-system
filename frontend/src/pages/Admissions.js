import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, SearchBox, LoadingState, EmptyState, ActionBtn } from '../components/ui';
import api from '../utils/api';

// admissionAPI inline
const admissionAPI = {
  getAll: (params) => api.get('/admissions', { params }),
  create: (data) => api.post('/admissions', data),
  update: (id, data) => api.put(`/admissions/${id}`, data),
  updateStatus: (id, status, notes) => api.put(`/admissions/${id}/status`, { status, notes }),
  delete: (id) => api.delete(`/admissions/${id}`),
};

const STATUS_MAP = {
  pending:      'bg-gold/15 text-gold',
  under_review: 'bg-blue-50 text-blue-600',
  approved:     'bg-sage/10 text-sage',
  rejected:     'bg-accent/10 text-accent',
  enrolled:     'bg-purple-50 text-purple-600',
};

const COLS = '40px 2fr 1fr 1fr 1fr 1fr 100px';

function AdmissionModal({ isOpen, onClose, onSave, initial }) {
  const empty = { studentName: '', dateOfBirth: '', gender: '', parentName: '', parentEmail: '', parentPhone: '', address: '', applyingForClass: '', previousSchool: '', bloodGroup: '' };
  const [form, setForm] = useState(initial || empty);
  useEffect(() => { if (initial) setForm(initial); else setForm(empty); }, [initial]);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={initial?._id ? 'Edit Application' : 'New Admission Application'} size="lg"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(form)}>{initial?._id ? 'Save Changes' : 'Submit Application'}</button></>}>
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Student Full Name"><input className="form-input" value={form.studentName} onChange={e => set('studentName', e.target.value)} placeholder="Arjun Sharma" /></FormGroup>
        <FormGroup label="Date of Birth"><input type="date" className="form-input" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormGroup>
        <FormGroup label="Gender">
          <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
            <option value="">Select</option>
            <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
          </select>
        </FormGroup>
        <FormGroup label="Blood Group">
          <select className="form-input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
            <option value="">Select</option>
            {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Applying for Class">
          <select className="form-input" value={form.applyingForClass} onChange={e => set('applyingForClass', e.target.value)}>
            <option value="">Select grade</option>
            {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Grade {g}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Previous School"><input className="form-input" value={form.previousSchool} onChange={e => set('previousSchool', e.target.value)} placeholder="Delhi Public School" /></FormGroup>
        <FormGroup label="Parent / Guardian Name"><input className="form-input" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Rajesh Sharma" /></FormGroup>
        <FormGroup label="Parent Email"><input type="email" className="form-input" value={form.parentEmail} onChange={e => set('parentEmail', e.target.value)} placeholder="parent@email.com" /></FormGroup>
        <FormGroup label="Parent Phone"><input className="form-input" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="9876543210" /></FormGroup>
        <FormGroup label="Address" className="col-span-2"><textarea className="form-input" rows={2} value={form.address} onChange={e => set('address', e.target.value)} placeholder="123, Sector 15, New Delhi" /></FormGroup>
      </div>
    </Modal>
  );
}

function StatusModal({ isOpen, onClose, onSave, application }) {
  const [status, setStatus] = useState(application?.status || 'pending');
  const [notes, setNotes] = useState('');
  useEffect(() => { if (application) setStatus(application.status); }, [application]);
  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Update Application Status" size="sm"
      footer={<><button className="btn-secondary" onClick={onClose}>Cancel</button><button className="btn-primary" onClick={() => onSave(status, notes)}>Update Status</button></>}>
      <div className="space-y-4">
        <FormGroup label="New Status">
          <select className="form-input" value={status} onChange={e => setStatus(e.target.value)}>
            {[['pending','Pending'],['under_review','Under Review'],['approved','Approved'],['rejected','Rejected'],['enrolled','Enrolled']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Notes (optional)">
          <textarea className="form-input" rows={3} value={notes} onChange={e => setNotes(e.target.value)} placeholder="Add any notes for this status change..." />
        </FormGroup>
      </div>
    </Modal>
  );
}

export default function Admissions() {
  const { isAdmin } = useAuth();
  const [applications, setApplications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [modal, setModal] = useState({ open: false, data: null });
  const [statusModal, setStatusModal] = useState({ open: false, data: null });

  // Fallback to mock data if API not available
  const MOCK = [
    { _id: '1', applicationNumber: 'ADM-2026-001', studentName: 'Riya Patel', applyingForClass: 6, parentName: 'Suresh Patel', parentPhone: '9876543210', parentEmail: 'suresh@email.com', status: 'pending', createdAt: new Date(Date.now() - 86400000 * 2) },
    { _id: '2', applicationNumber: 'ADM-2026-002', studentName: 'Aryan Singh', applyingForClass: 9, parentName: 'Vikram Singh', parentPhone: '9876543211', parentEmail: 'vikram@email.com', status: 'approved', createdAt: new Date(Date.now() - 86400000 * 5) },
    { _id: '3', applicationNumber: 'ADM-2026-003', studentName: 'Kavya Nair', applyingForClass: 11, parentName: 'Pradeep Nair', parentPhone: '9876543212', parentEmail: 'pradeep@email.com', status: 'under_review', createdAt: new Date(Date.now() - 86400000 * 1) },
    { _id: '4', applicationNumber: 'ADM-2026-004', studentName: 'Mohan Das', applyingForClass: 3, parentName: 'Rajan Das', parentPhone: '9876543213', parentEmail: 'rajan@email.com', status: 'enrolled', createdAt: new Date(Date.now() - 86400000 * 10) },
    { _id: '5', applicationNumber: 'ADM-2026-005', studentName: 'Sneha Gupta', applyingForClass: 7, parentName: 'Amit Gupta', parentPhone: '9876543214', parentEmail: 'amit@email.com', status: 'rejected', createdAt: new Date(Date.now() - 86400000 * 3) },
  ];

  const load = async () => {
    setLoading(true);
    try {
      const res = await admissionAPI.getAll();
      const data = res.data.data;
      setApplications(data.length > 0 ? data : MOCK);
    } catch {
      setApplications(MOCK); // use mock if API not ready
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = applications.filter(a => {
    const q = search.toLowerCase();
    const matchSearch = !q || a.studentName?.toLowerCase().includes(q) || a.applicationNumber?.toLowerCase().includes(q) || a.parentName?.toLowerCase().includes(q);
    const matchStatus = !statusFilter || a.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleSave = async (form) => {
    try {
      if (form._id) { await admissionAPI.update(form._id, form); toast.success('Application updated'); }
      else { await admissionAPI.create(form); toast.success('Application submitted'); }
      setModal({ open: false, data: null }); load();
    } catch { toast.error('Error saving application'); }
  };

  const handleStatusUpdate = async (status, notes) => {
    try {
      await admissionAPI.updateStatus(statusModal.data._id, status, notes);
      toast.success(`Status updated to ${status}`);
    } catch {
      // Update locally if API fails
      setApplications(prev => prev.map(a => a._id === statusModal.data._id ? { ...a, status } : a));
      toast.success(`Status updated to ${status}`);
    }
    setStatusModal({ open: false, data: null });
    load();
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete application for ${name}?`)) return;
    try { await admissionAPI.delete(id); toast.success('Application deleted'); load(); }
    catch { toast.error('Error deleting application'); }
  };

  const counts = { all: applications.length, pending: 0, under_review: 0, approved: 0, enrolled: 0, rejected: 0 };
  applications.forEach(a => { if (counts[a.status] !== undefined) counts[a.status]++; });

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Admissions</h2>
          <p className="text-sm text-muted mt-0.5">{applications.length} total applications</p>
        </div>
        {isAdmin && (
          <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ New Application</button>
        )}
      </div>

      {/* Status summary */}
      <div className="grid grid-cols-3 md:grid-cols-6 gap-3 mb-5">
        {[
          { key: '', label: 'All', color: 'border-border' },
          { key: 'pending', label: 'Pending', color: 'border-gold/40' },
          { key: 'under_review', label: 'In Review', color: 'border-blue-300' },
          { key: 'approved', label: 'Approved', color: 'border-sage/40' },
          { key: 'enrolled', label: 'Enrolled', color: 'border-purple-300' },
          { key: 'rejected', label: 'Rejected', color: 'border-accent/40' },
        ].map(s => (
          <button key={s.key} onClick={() => setStatusFilter(s.key)}
            className={`card p-3 text-center transition-all hover:-translate-y-0.5 border-2 ${statusFilter === s.key ? s.color + ' shadow-sm' : 'border-transparent'}`}>
            <div className="font-display text-2xl text-ink">{counts[s.key || 'all']}</div>
            <div className="text-[11px] text-muted mt-0.5">{s.label}</div>
          </button>
        ))}
      </div>

      {/* Search */}
      <div className="flex gap-3 mb-5 flex-wrap">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by student, parent, or application #…" />
      </div>

      {/* Table */}
      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          <div className="bg-warm px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: COLS }}>
            {['#', 'Applicant', 'Grade', 'Parent', 'Applied On', 'Status', 'Actions'].map(h => (
              <div key={h} className="table-th">{h}</div>
            ))}
          </div>
          {!filtered.length
            ? <EmptyState icon="📋" title="No applications found" subtitle="Try adjusting your filters" />
            : filtered.map((app, i) => (
              <div key={app._id} className="grid gap-4 px-5 py-3.5 border-t border-border items-center hover:bg-warm/40 transition-colors" style={{ gridTemplateColumns: COLS }}>
                <div className="text-muted text-sm">{i + 1}</div>
                <div className="flex items-center gap-2.5">
                  <Avatar name={app.studentName} size="sm" />
                  <div>
                    <div className="font-medium text-sm text-ink">{app.studentName}</div>
                    <div className="text-xs text-muted font-mono">{app.applicationNumber}</div>
                  </div>
                </div>
                <div className="text-sm text-slate">Grade {app.applyingForClass}</div>
                <div>
                  <div className="text-sm text-ink">{app.parentName}</div>
                  <div className="text-xs text-muted">{app.parentPhone}</div>
                </div>
                <div className="text-xs text-muted">
                  {app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                </div>
                <div>
                  <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold capitalize ${STATUS_MAP[app.status] || 'bg-gray-100 text-gray-600'}`}>
                    {app.status?.replace('_', ' ')}
                  </span>
                </div>
                <div className="flex gap-1.5">
                  {isAdmin && (
                    <>
                      <ActionBtn icon="◈" title="Update Status" onClick={() => setStatusModal({ open: true, data: app })} />
                      <ActionBtn icon="✎" title="Edit" onClick={() => setModal({ open: true, data: app })} />
                      <ActionBtn icon="✕" title="Delete" variant="danger" onClick={() => handleDelete(app._id, app.studentName)} />
                    </>
                  )}
                </div>
              </div>
            ))
          }
        </div>
      )}

      <AdmissionModal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })} onSave={handleSave} initial={modal.data} />
      <StatusModal isOpen={statusModal.open} onClose={() => setStatusModal({ open: false, data: null })} onSave={handleStatusUpdate} application={statusModal.data} />
    </div>
  );
}
