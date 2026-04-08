// frontend/src/pages/Expenses/AddExpense.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { expenseAPI } from '../../utils/api';
import { LoadingState, Modal } from '../../components/ui';

const CATEGORY_COLORS = [
  '#DC2626','#EA580C','#D97706','#65A30D','#16A34A',
  '#0891B2','#2563EB','#7C3AED','#DB2777','#6B7280',
];
const CATEGORY_ICONS = ['💰','📚','🏫','💡','🚌','🔧','🎉','🏥','📋','📦','👔','💻','🍽️','🌱','🔐'];
const PAYMENT_METHODS = [
  { key:'cash',   label:'Cash',    icon:'💵' },
  { key:'upi',    label:'UPI',     icon:'📱' },
  { key:'bank',   label:'Bank Transfer', icon:'🏦' },
  { key:'cheque', label:'Cheque',  icon:'📄' },
  { key:'online', label:'Online',  icon:'🌐' },
];

// ── Category Modal ────────────────────────────────────────────────────────────
function CategoryModal({ isOpen, onClose, onSaved, editing }) {
  const [form, setForm] = useState({ name:'', description:'', color:CATEGORY_COLORS[0], icon:'💰' });
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (editing) setForm({ name: editing.name, description: editing.description || '', color: editing.color || CATEGORY_COLORS[0], icon: editing.icon || '💰' });
    else setForm({ name:'', description:'', color:CATEGORY_COLORS[0], icon:'💰' });
  }, [editing, isOpen]);

  const handleSave = async () => {
    if (!form.name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      if (editing) {
        await expenseAPI.updateCategory(editing._id, form);
        toast.success('Category updated');
      } else {
        await expenseAPI.createCategory(form);
        toast.success('Category created');
      }
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save category');
    } finally { setSaving(false); }
  };

  const INP = { width:'100%', padding:'9px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box' };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={editing ? 'Edit Category' : '➕ New Category'} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={handleSave} disabled={saving} className="btn-primary" style={{ background:'#DC2626', borderColor:'#DC2626' }}>
          {saving ? '⏳' : editing ? 'Update' : 'Create'}
        </button>
      </>}
    >
      <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151' }}>Name *</label>
          <input value={form.name} onChange={e => setForm(p => ({ ...p, name:e.target.value }))} placeholder="e.g. Salary" style={INP} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151' }}>Description</label>
          <input value={form.description} onChange={e => setForm(p => ({ ...p, description:e.target.value }))} placeholder="Optional" style={INP} />
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:8, color:'#374151' }}>Icon</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {CATEGORY_ICONS.map(ic => (
              <button key={ic} onClick={() => setForm(p => ({ ...p, icon:ic }))} style={{
                width:34, height:34, borderRadius:8, fontSize:18, cursor:'pointer',
                border: form.icon === ic ? '2px solid #DC2626' : '1px solid #E5E7EB',
                background: form.icon === ic ? '#FEF2F2' : 'transparent',
              }}>{ic}</button>
            ))}
          </div>
        </div>
        <div>
          <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:8, color:'#374151' }}>Color</label>
          <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
            {CATEGORY_COLORS.map(c => (
              <button key={c} onClick={() => setForm(p => ({ ...p, color:c }))} style={{
                width:28, height:28, borderRadius:'50%', background:c, cursor:'pointer',
                border: form.color === c ? '3px solid #111' : '2px solid transparent',
                boxShadow: form.color === c ? '0 0 0 2px #fff' : 'none',
              }} />
            ))}
          </div>
        </div>
      </div>
    </Modal>
  );
}

// ── Main AddExpense component ─────────────────────────────────────────────────
export default function AddExpense({ onSaved, editingExpense }) {
  const [categories, setCategories] = useState([]);
  const [catModal,   setCatModal]   = useState(false);
  const [editCat,    setEditCat]    = useState(null);
  const [saving,     setSaving]     = useState(false);
  const [filePreview, setFilePreview] = useState(null);

  const [form, setForm] = useState({
    category: '', amount: '', date: new Date().toISOString().split('T')[0],
    description: '', paymentMethod: 'cash',
    isRecurring: false, recurringType: 'monthly', recurringDay: 1,
    budgetLimit: '',
  });
  const [file, setFile] = useState(null);

  useEffect(() => {
    loadCategories();
    if (editingExpense) {
      setForm({
        category:      editingExpense.category?._id || editingExpense.category || '',
        amount:        editingExpense.amount || '',
        date:          editingExpense.date?.split('T')[0] || new Date().toISOString().split('T')[0],
        description:   editingExpense.description || '',
        paymentMethod: editingExpense.paymentMethod || 'cash',
        isRecurring:   editingExpense.isRecurring || false,
        recurringType: editingExpense.recurringType || 'monthly',
        recurringDay:  editingExpense.recurringDay || 1,
        budgetLimit:   editingExpense.budgetLimit || '',
      });
    }
  }, [editingExpense]);

  const loadCategories = () => {
    expenseAPI.getCategories()
      .then(r => setCategories(r.data.data || []))
      .catch(() => {});
  };

  const handleFileChange = (e) => {
    const f = e.target.files[0];
    if (!f) return;
    setFile(f);
    if (f.type.startsWith('image/')) {
      const reader = new FileReader();
      reader.onload = ev => setFilePreview(ev.target.result);
      reader.readAsDataURL(f);
    } else {
      setFilePreview('pdf');
    }
  };

  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Delete this category?')) return;
    try {
      await expenseAPI.deleteCategory(id);
      toast.success('Category removed');
      loadCategories();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed'); }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.category) return toast.error('Select a category');
    if (!form.amount || Number(form.amount) <= 0) return toast.error('Enter a valid amount');
    if (!form.description.trim()) return toast.error('Description is required');

    setSaving(true);
    try {
      const fd = new FormData();
      Object.entries(form).forEach(([k, v]) => fd.append(k, v));
      if (file) fd.append('attachment', file);

      if (editingExpense) {
        await expenseAPI.update(editingExpense._id, fd);
        toast.success('Expense updated');
      } else {
        await expenseAPI.add(fd);
        toast.success('Expense added!');
      }
      onSaved?.();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const set = (k, v) => setForm(p => ({ ...p, [k]:v }));

  const INP = { width:'100%', padding:'10px 12px', border:'1px solid #E5E7EB', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:6, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };

  return (
    <div>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">{editingExpense ? '✏️ Edit Expense' : '➕ Add Expense'}</h2>
          <p className="text-sm text-muted mt-0.5">Record a school expense with receipt</p>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 280px', gap:20, alignItems:'start' }}>

        {/* Main form */}
        <form onSubmit={handleSubmit} className="card" style={{ padding:24 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>

            {/* Category */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Category *</label>
              <div style={{ display:'flex', gap:8 }}>
                <select value={form.category} onChange={e => set('category', e.target.value)} style={{ ...INP, flex:1 }}>
                  <option value="">— Select Category —</option>
                  {categories.map(c => (
                    <option key={c._id} value={c._id}>{c.icon} {c.name}</option>
                  ))}
                </select>
                <button type="button" onClick={() => { setEditCat(null); setCatModal(true); }}
                  style={{ padding:'10px 14px', background:'#FEF2F2', border:'1px solid #FECACA', borderRadius:9, fontSize:12, fontWeight:700, color:'#DC2626', cursor:'pointer', flexShrink:0 }}>
                  + New
                </button>
              </div>
            </div>

            {/* Amount */}
            <div>
              <label style={LBL}>Amount (₹) *</label>
              <input type="number" min="1" step="0.01" value={form.amount}
                onChange={e => set('amount', e.target.value)} placeholder="0.00" style={INP} />
            </div>

            {/* Date */}
            <div>
              <label style={LBL}>Date *</label>
              <input type="date" value={form.date} onChange={e => set('date', e.target.value)} style={INP} max={new Date().toISOString().split('T')[0]} />
            </div>

            {/* Description */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Description *</label>
              <textarea value={form.description} onChange={e => set('description', e.target.value)}
                placeholder="What was this expense for?" rows={3}
                style={{ ...INP, resize:'vertical', fontFamily:'inherit' }} />
            </div>

            {/* Payment method */}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Payment Method</label>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {PAYMENT_METHODS.map(m => (
                  <button key={m.key} type="button" onClick={() => set('paymentMethod', m.key)}
                    style={{
                      padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                      border: `1.5px solid ${form.paymentMethod === m.key ? '#DC2626' : '#E5E7EB'}`,
                      background: form.paymentMethod === m.key ? '#FEF2F2' : 'transparent',
                      color: form.paymentMethod === m.key ? '#DC2626' : '#6B7280',
                    }}>
                    {m.icon} {m.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Budget limit */}
            <div>
              <label style={LBL}>Monthly Budget Limit (₹)</label>
              <input type="number" min="0" value={form.budgetLimit}
                onChange={e => set('budgetLimit', e.target.value)} placeholder="0 = no limit" style={INP} />
              <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>Alert when category exceeds this monthly amount</div>
            </div>

            {/* Recurring */}
            <div>
              <label style={LBL}>Recurring Expense</label>
              <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                <input type="checkbox" checked={form.isRecurring} onChange={e => set('isRecurring', e.target.checked)}
                  id="recurring" style={{ width:16, height:16 }} />
                <label htmlFor="recurring" style={{ fontSize:13, color:'#374151', cursor:'pointer' }}>Auto-create every period</label>
              </div>
              {form.isRecurring && (
                <div style={{ display:'flex', gap:8 }}>
                  <select value={form.recurringType} onChange={e => set('recurringType', e.target.value)} style={{ ...INP, flex:1 }}>
                    <option value="monthly">Monthly</option>
                    <option value="weekly">Weekly</option>
                    <option value="yearly">Yearly</option>
                  </select>
                  {form.recurringType === 'monthly' && (
                    <input type="number" min="1" max="28" value={form.recurringDay}
                      onChange={e => set('recurringDay', e.target.value)}
                      placeholder="Day" style={{ ...INP, width:80 }} />
                  )}
                </div>
              )}
            </div>

          </div>

          {/* File upload */}
          <div style={{ marginTop:16 }}>
            <label style={LBL}>Attach Receipt / Bill</label>
            <label style={{
              display:'flex', flexDirection:'column', alignItems:'center', gap:8,
              padding:'20px', border:'2px dashed #E5E7EB', borderRadius:10,
              cursor:'pointer', background:'#F9FAFB', transition:'all 0.15s',
            }}
              onMouseEnter={e => e.currentTarget.style.borderColor='#DC2626'}
              onMouseLeave={e => e.currentTarget.style.borderColor='#E5E7EB'}
            >
              <input type="file" accept="image/*,.pdf" onChange={handleFileChange} style={{ display:'none' }} />
              {filePreview ? (
                filePreview === 'pdf'
                  ? <div style={{ fontSize:32 }}>📄</div>
                  : <img src={filePreview} alt="preview" style={{ maxHeight:80, borderRadius:6, objectFit:'cover' }} />
              ) : (
                <>
                  <div style={{ fontSize:28 }}>📎</div>
                  <div style={{ fontSize:12, color:'#9CA3AF' }}>Click to upload image or PDF (max 5MB)</div>
                </>
              )}
              {file && <div style={{ fontSize:11, color:'#DC2626', fontWeight:600 }}>{file.name}</div>}
            </label>
          </div>

          <div style={{ marginTop:20, display:'flex', gap:10 }}>
            <button type="submit" disabled={saving} className="btn-primary" style={{ background:'#DC2626', borderColor:'#DC2626', flex:1 }}>
              {saving ? '⏳ Saving…' : editingExpense ? '✓ Update Expense' : '✓ Add Expense'}
            </button>
            {onSaved && (
              <button type="button" onClick={onSaved} className="btn-secondary">Cancel</button>
            )}
          </div>
        </form>

        {/* Category manager sidebar */}
        <div className="card" style={{ padding:16 }}>
          <div style={{ fontWeight:700, fontSize:13, marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span>📂 Categories</span>
            <button onClick={() => { setEditCat(null); setCatModal(true); }}
              style={{ fontSize:11, color:'#DC2626', background:'none', border:'none', cursor:'pointer', fontWeight:700 }}>
              + Add
            </button>
          </div>
          {categories.length ? categories.map(c => (
            <div key={c._id} style={{ display:'flex', alignItems:'center', gap:8, padding:'7px 8px', borderRadius:8, marginBottom:4, background:'#F9FAFB' }}>
              <span style={{ fontSize:15 }}>{c.icon}</span>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#111', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{c.name}</div>
              </div>
              <div style={{ width:8, height:8, borderRadius:'50%', background:c.color, flexShrink:0 }} />
              <button onClick={() => { setEditCat(c); setCatModal(true); }}
                style={{ fontSize:11, background:'none', border:'none', cursor:'pointer', color:'#6B7280', padding:'2px 4px' }}>✏️</button>
              <button onClick={() => handleDeleteCategory(c._id)}
                style={{ fontSize:11, background:'none', border:'none', cursor:'pointer', color:'#EF4444', padding:'2px 4px' }}>🗑</button>
            </div>
          )) : (
            <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'12px 0' }}>
              No categories yet.<br />Add one to get started.
            </div>
          )}
        </div>
      </div>

      <CategoryModal isOpen={catModal} onClose={() => setCatModal(false)} onSaved={loadCategories} editing={editCat} />
    </div>
  );
}