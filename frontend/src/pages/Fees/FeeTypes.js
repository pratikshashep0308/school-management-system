// frontend/src/pages/Fees/FeeTypes.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { LoadingState, EmptyState, Modal } from '../../components/ui';

const CATEGORIES = ['tuition','exam','transport','uniform','library','sports','other'];
const FREQUENCIES = ['monthly','quarterly','annually','one-time'];

const CATEGORY_COLORS = {
  tuition:'#1D4ED8', exam:'#7C3AED', transport:'#0284C7',
  uniform:'#D97706', library:'#9333EA', sports:'#16A34A', other:'#6B7280',
};

const CATEGORY_ICONS = {
  tuition:'📚', exam:'📝', transport:'🚌',
  uniform:'👕', library:'📖', sports:'⚽', other:'💼',
};

function TypeModal({ type, onClose, onSaved }) {
  const [form, setForm] = useState({
    name:          type?.name          || '',
    description:   type?.description   || '',
    category:      type?.category      || 'tuition',
    isRecurring:   type?.isRecurring   || false,
    frequency:     type?.frequency     || 'one-time',
    defaultAmount: type?.defaultAmount || '',
  });
  const [saving, setSaving] = useState(false);
  const INPUT = { width:'100%', padding:'8px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box' };

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (type?._id) await feeAPI.updateFeeType(type._id, form);
      else            await feeAPI.createFeeType(form);
      toast.success(type?._id ? 'Fee type updated' : 'Fee type created');
      onSaved();
    } catch (err) { toast.error(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  return (
    <Modal isOpen onClose={onClose} title={type?._id ? '✏️ Edit Fee Type' : '+ New Fee Type'} size="md"
      footer={<><button onClick={onClose} className="btn-secondary">Cancel</button><button onClick={handleSave} disabled={saving} className="btn-primary">{saving?'⏳ Saving…':'Save Fee Type'}</button></>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5 }}>Name *</label>
          <input value={form.name} onChange={e => setForm(p=>({...p,name:e.target.value}))} placeholder="e.g. Tuition Fee" style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5 }}>Category</label>
          <select value={form.category} onChange={e => setForm(p=>({...p,category:e.target.value}))} style={INPUT}>
            {CATEGORIES.map(c => <option key={c} value={c}>{c.charAt(0).toUpperCase()+c.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5 }}>Frequency</label>
          <select value={form.frequency} onChange={e => setForm(p=>({...p,frequency:e.target.value}))} style={INPUT}>
            {FREQUENCIES.map(f => <option key={f} value={f}>{f.charAt(0).toUpperCase()+f.slice(1)}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5 }}>Default Amount (₹)</label>
          <input type="number" value={form.defaultAmount} onChange={e => setForm(p=>({...p,defaultAmount:e.target.value}))} placeholder="0" style={INPUT} />
        </div>
        <div style={{ display:'flex', alignItems:'center', gap:8, paddingTop:20 }}>
          <input type="checkbox" checked={form.isRecurring} onChange={e => setForm(p=>({...p,isRecurring:e.target.checked}))} id="recurring" />
          <label htmlFor="recurring" style={{ fontSize:13, fontWeight:600 }}>Recurring fee</label>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5 }}>Description</label>
          <textarea value={form.description} onChange={e => setForm(p=>({...p,description:e.target.value}))} rows={2} placeholder="Optional description…" style={{ ...INPUT, resize:'vertical' }} />
        </div>
      </div>
    </Modal>
  );
}

export default function FeeTypes() {
  const [types,   setTypes]   = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal,   setModal]   = useState(null); // null | 'new' | typeObj

  const load = () => {
    setLoading(true);
    feeAPI.getFeeTypes().then(r => setTypes(r.data.data||[])).catch(()=>toast.error('Failed to load')).finally(()=>setLoading(false));
  };
  useEffect(load, []);

  const handleDelete = async (id) => {
    if (!window.confirm('Deactivate this fee type?')) return;
    await feeAPI.deleteFeeType(id).catch(()=>toast.error('Failed'));
    toast.success('Fee type deactivated');
    load();
  };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">🏷 Fee Types</h2>
          <p className="text-sm text-muted">Create and manage fee categories</p>
        </div>
        <button className="btn-primary" onClick={() => setModal('new')}>+ New Fee Type</button>
      </div>

      {loading ? <LoadingState /> : !types.length ? (
        <EmptyState icon="🏷" title="No fee types" subtitle="Create fee types like Tuition, Exam, Transport…" action={<button className="btn-primary" onClick={() => setModal('new')}>Create First Fee Type</button>} />
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:14 }}>
          {types.map(t => {
            const color = CATEGORY_COLORS[t.category] || '#6B7280';
            const icon  = CATEGORY_ICONS[t.category]  || '💼';
            return (
              <div key={t._id} className="card" style={{ padding:18, borderTop:`4px solid ${color}` }}>
                <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:10 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:`${color}15`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:18 }}>{icon}</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontSize:14, fontWeight:800, color:'#111' }}>{t.name}</div>
                    <div style={{ fontSize:10, fontWeight:700, color, textTransform:'uppercase', letterSpacing:'0.05em' }}>{t.category}</div>
                  </div>
                </div>
                {t.description && <div style={{ fontSize:12, color:'#6B7280', marginBottom:10 }}>{t.description}</div>}
                <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:12 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:`${color}15`, color }}>{t.frequency}</span>
                  {t.isRecurring && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#FEF3C7', color:'#92400E' }}>🔁 Recurring</span>}
                  {t.defaultAmount>0 && <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:10, background:'#F0FDF4', color:'#166534' }}>₹{t.defaultAmount.toLocaleString('en-IN')}</span>}
                </div>
                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => setModal(t)} style={{ flex:1, padding:'6px 0', borderRadius:7, fontSize:12, fontWeight:700, background:'#F8FAFC', border:'1px solid #E5E7EB', cursor:'pointer' }}>✏️ Edit</button>
                  <button onClick={() => handleDelete(t._id)} style={{ padding:'6px 12px', borderRadius:7, fontSize:12, fontWeight:700, background:'#FEF2F2', border:'1px solid #FCA5A5', color:'#DC2626', cursor:'pointer' }}>🗑</button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {modal && <TypeModal type={modal === 'new' ? null : modal} onClose={() => setModal(null)} onSaved={() => { setModal(null); load(); }} />}
    </div>
  );
}