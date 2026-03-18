import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { feeAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, LoadingState, EmptyState, SearchBox } from '../components/ui';

const COLS = '40px 2fr 1fr 1fr 1fr 1fr 70px';

export default function Fees() {
  const { isAdmin, can } = useAuth();
  const [payments, setPayments] = useState([]);
  const [summary, setSummary] = useState({});
  const [students, setStudents] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState(false);
  const [form, setForm] = useState({ student: '', amount: '', method: 'cash', month: '', status: 'paid' });

  const load = async () => {
    setLoading(true);
    try {
      const [pRes, sRes] = await Promise.all([feeAPI.getPayments(), studentAPI.getAll()]);
      setPayments(pRes.data.data);
      setStudents(sRes.data.data);
    } catch { toast.error('Failed to load fees'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = payments.filter(p => {
    const q = search.toLowerCase();
    return !q || p.student?.user?.name?.toLowerCase().includes(q) || p.receiptNumber?.toLowerCase().includes(q);
  });

  const totalCollected = payments.filter(p => p.status === 'paid').reduce((s, p) => s + p.amount, 0);
  const totalPending = payments.filter(p => p.status === 'pending').reduce((s, p) => s + p.amount, 0);
  const totalOverdue = payments.filter(p => p.status === 'overdue').reduce((s, p) => s + p.amount, 0);

  const handleRecord = async () => {
    if (!form.student || !form.amount) { toast.error('Student and amount are required'); return; }
    try {
      await feeAPI.recordPayment(form);
      toast.success('Payment recorded');
      setModal(false);
      setForm({ student: '', amount: '', method: 'cash', month: '', status: 'paid' });
      load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error recording payment'); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));
  const months = ['January 2026','February 2026','March 2026','April 2026','May 2026','June 2026','July 2026','August 2026','September 2026','October 2026','November 2026','December 2026'];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Fee Management</h2>
          <p className="text-sm text-muted mt-0.5">Track and manage all fee payments</p>
        </div>
        {can(['superAdmin','schoolAdmin','accountant']) && (
          <button className="btn-primary" onClick={() => setModal(true)}>+ Record Payment</button>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
        {[
          { label: 'Total Collected', value: `₹${totalCollected.toLocaleString('en-IN')}`, color: 'text-sage', border: 'border-sage/30' },
          { label: 'Pending', value: `₹${totalPending.toLocaleString('en-IN')}`, color: 'text-gold', border: 'border-gold/30' },
          { label: 'Overdue', value: `₹${totalOverdue.toLocaleString('en-IN')}`, color: 'text-accent', border: 'border-accent/30' },
        ].map(({ label, value, color, border }) => (
          <div key={label} className={`card p-5 border-2 ${border}`}>
            <div className="text-sm text-muted mb-2 font-medium">{label}</div>
            <div className={`font-display text-3xl ${color}`}>{value}</div>
          </div>
        ))}
      </div>

      <div className="flex gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by student name or receipt…" />
      </div>

      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          <div className="bg-warm px-5 py-3 grid gap-4 border-b border-border" style={{ gridTemplateColumns: COLS }}>
            {['#','Student','Amount','Month','Method','Status','Actions'].map(h => <div key={h} className="table-th">{h}</div>)}
          </div>
          {!filtered.length ? <EmptyState icon="₹" title="No payments found" /> : filtered.map((p, i) => (
            <div key={p._id} className="grid gap-4 px-5 py-3 border-t border-border items-center hover:bg-warm/40 transition-colors" style={{ gridTemplateColumns: COLS }}>
              <div className="text-muted text-sm">{i + 1}</div>
              <div className="flex items-center gap-2.5">
                <Avatar name={p.student?.user?.name} size="sm" />
                <div>
                  <div className="font-medium text-sm text-ink">{p.student?.user?.name}</div>
                  <div className="text-xs text-muted font-mono">{p.receiptNumber}</div>
                </div>
              </div>
              <div className="font-semibold text-sm text-ink">₹{p.amount?.toLocaleString('en-IN')}</div>
              <div className="text-sm text-slate">{p.month}</div>
              <div className="text-sm text-slate capitalize">{p.method}</div>
              <Badge status={p.status} />
              <div>
                <button onClick={() => toast.success(`Receipt: ${p.receiptNumber}`)}
                  className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">🖨</button>
              </div>
            </div>
          ))}
        </div>
      )}

      <Modal isOpen={modal} onClose={() => setModal(false)} title="Record Fee Payment" size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal(false)}>Cancel</button><button className="btn-primary" onClick={handleRecord}>Record Payment</button></>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Student" className="col-span-2">
            <select className="form-input" value={form.student} onChange={e => set('student', e.target.value)}>
              <option value="">Select student</option>
              {students.map(s => <option key={s._id} value={s._id}>{s.user?.name} ({s.admissionNumber})</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Amount (₹)"><input type="number" className="form-input" value={form.amount} onChange={e => set('amount', e.target.value)} placeholder="12500" /></FormGroup>
          <FormGroup label="Payment Method">
            <select className="form-input" value={form.method} onChange={e => set('method', e.target.value)}>
              {['cash','online','cheque','bank','upi'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Month">
            <select className="form-input" value={form.month} onChange={e => set('month', e.target.value)}>
              <option value="">Select month</option>
              {months.map(m => <option key={m}>{m}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Status">
            <select className="form-input" value={form.status} onChange={e => set('status', e.target.value)}>
              {['paid','pending','overdue','partial'].map(s => <option key={s}>{s}</option>)}
            </select>
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}
