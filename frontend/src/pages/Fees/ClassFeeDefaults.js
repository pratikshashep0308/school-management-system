/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Fees/ClassFeeDefaults.js
// Per-class default fees that auto-apply when a student is enrolled.
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI, studentAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const INP = { width:'100%', padding:'8px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:4, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
const BTN_PRIMARY = { padding:'9px 18px', borderRadius:8, background:'#1D4ED8', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' };
const BTN_LIGHT   = { padding:'9px 14px', borderRadius:8, background:'#F3F4F6', color:'#374151', border:'1px solid #E5E7EB', fontSize:13, fontWeight:600, cursor:'pointer' };
const BTN_DANGER  = { padding:'7px 12px', borderRadius:8, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FECACA', fontSize:12, fontWeight:600, cursor:'pointer' };
const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

const blankLine = () => ({ feeType:'', annualAmount:'', notes:'' });

export default function ClassFeeDefaults() {
  const [classes,   setClasses]   = useState([]);
  const [feeTypes,  setFeeTypes]  = useState([]);
  const [classId,   setClassId]   = useState('');
  const [template,  setTemplate]  = useState(null);
  const [lines,     setLines]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [typeMgrOpen, setTypeMgrOpen] = useState(false);

  const reloadFeeTypes = async () => {
    try {
      const r = await feeAPI.getFeeTypes();
      setFeeTypes(r.data.data || []);
    } catch {}
  };

  // ── Load classes and fee types on mount ─────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      classAPI.getAll().catch(()=>({ data:{ data:[] }})),
      feeAPI.getFeeTypes().catch(()=>({ data:{ data:[] }})),
    ]).then(([cRes, fRes]) => {
      const cls = cRes.data.data || [];
      setClasses(cls);
      setFeeTypes(fRes.data.data || []);
      if (cls.length) setClassId(cls[0]._id);
    }).finally(() => setLoading(false));
  }, []);

  // ── Load this class's template whenever class changes ──────────────
  useEffect(() => {
    if (!classId) return;
    // Reset immediately so old class's lines don't linger during fetch
    setTemplate(null);
    setLines([]);
    feeAPI.getClassTemplate(classId).then(r => {
      const tpl = r.data.data;
      setTemplate(tpl);
      if (tpl && tpl.lines?.length) {
        setLines(tpl.lines.map(l => ({
          feeType:      l.feeType?._id || l.feeType,
          annualAmount: l.annualAmount,
          notes:        l.notes || '',
        })));
      } else {
        setLines([blankLine()]);
      }
    }).catch(() => {
      setTemplate(null);
      setLines([blankLine()]);
    });
  }, [classId]);

  const totalAnnual    = useMemo(() => lines.reduce((s,l) => s + (Number(l.annualAmount)||0), 0), [lines]);
  const totalHalfYear  = totalAnnual / 2;

  const setLine = (i, k, v) => setLines(prev => prev.map((l, idx) => idx===i ? { ...l, [k]: v } : l));
  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const valid = lines.filter(l => l.feeType && Number(l.annualAmount) > 0);
    if (!valid.length) return toast.error('Add at least one valid fee line');
    setSaving(true);
    try {
      await feeAPI.saveClassTemplate({
        classId,
        lines: valid.map(l => ({
          feeType:      l.feeType,
          annualAmount: Number(l.annualAmount),
          notes:        l.notes || '',
        })),
      });
      toast.success('Class default fees saved');
      // Reload to pick up populated data
      const r = await feeAPI.getClassTemplate(classId);
      setTemplate(r.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async () => {
    if (!template) return;
    if (!window.confirm('Remove default fees for this class? Existing student fees won\'t be affected.')) return;
    try {
      await feeAPI.deleteClassTemplate(classId);
      setTemplate(null);
      setLines([blankLine()]);
      toast.success('Defaults removed');
    } catch { toast.error('Delete failed'); }
  };

  if (loading) return <LoadingState />;

  if (!classes.length) {
    return <EmptyState icon="🏫" title="No classes yet" subtitle="Create a class first, then come back here to set its default fees." />;
  }

  const selectedClass = classes.find(c => c._id === classId);

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-end', flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:0 }}>Class Default Fees</h2>
          <p style={{ fontSize:13, color:'#6B7280', margin:'4px 0 0' }}>
            Set the standard fees for each class. Every new student enrolled into the class gets these fees automatically.
          </p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button style={BTN_LIGHT} onClick={() => setTypeMgrOpen(true)}>
            ⚙ Manage fee types
          </button>
          <button style={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : (template ? 'Save changes' : 'Save defaults')}
          </button>
        </div>
      </div>

      {/* ── Class picker + summary cards ── */}
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:14 }}>
          <div style={LBL}>Class</div>
          <select style={INP} value={classId} onChange={e => setClassId(e.target.value)}>
            {classes.map(c => (
              <option key={c._id} value={c._id}>
                {c.name} {c.section ? `— ${c.section}` : ''}
              </option>
            ))}
          </select>
          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>
            {template ? '✓ Default fees configured' : 'No defaults yet'}
          </div>
        </div>
        <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#1E40AF', textTransform:'uppercase' }}>Yearly Total (12 mo)</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#1E3A8A', marginTop:4 }}>{fmt(totalAnnual)}</div>
          <div style={{ fontSize:11, color:'#3B82F6', marginTop:2 }}>Per student / year</div>
        </div>
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#166534', textTransform:'uppercase' }}>Half-Yearly (6 mo)</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#14532D', marginTop:4 }}>{fmt(totalHalfYear)}</div>
          <div style={{ fontSize:11, color:'#16A34A', marginTop:2 }}>Auto = yearly ÷ 2</div>
        </div>
      </div>

      {/* ── Fee lines table ── */}
      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
        <div style={{ background:'#0B1F4A', color:'#fff', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:14, fontWeight:700 }}>
            💰 Fee lines for {selectedClass?.name} {selectedClass?.section || ''}
          </div>
          <button onClick={addLine}
            style={{ padding:'6px 14px', borderRadius:7, background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            + Add line
          </button>
        </div>

        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:680 }}>
            <thead>
              <tr style={{ background:'#F9FAFB' }}>
                <th style={th}>Fee Type</th>
                <th style={th}>Yearly Amount (₹)</th>
                <th style={th}>Half-Yearly (auto)</th>
                <th style={th}>Notes</th>
                <th style={{ ...th, width:60 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={5} style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No fee lines. Click "Add line" to start.</td></tr>
              )}
              {lines.map((l, i) => {
                const annual = Number(l.annualAmount) || 0;
                const halfYear = annual / 2;
                return (
                  <tr key={i} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={td}>
                      <select style={INP} value={l.feeType} onChange={e => setLine(i, 'feeType', e.target.value)}>
                        <option value="">— Select —</option>
                        {feeTypes.map(t => (
                          <option key={t._id} value={t._id}>{t.name}</option>
                        ))}
                      </select>
                    </td>
                    <td style={td}>
                      <input type="number" min="0" style={INP} value={l.annualAmount}
                        onChange={e => setLine(i, 'annualAmount', e.target.value)} placeholder="0" />
                    </td>
                    <td style={td}>
                      <div style={{ ...INP, background:'#F9FAFB', color:'#6B7280', cursor:'not-allowed' }}>
                        {annual > 0 ? `₹${halfYear.toLocaleString('en-IN')}` : '—'}
                      </div>
                    </td>
                    <td style={td}>
                      <input style={INP} value={l.notes}
                        onChange={e => setLine(i, 'notes', e.target.value)} placeholder="Optional" />
                    </td>
                    <td style={td}>
                      <button onClick={() => removeLine(i)} style={BTN_DANGER} title="Remove">✕</button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* ── Existing template footer (delete option) ── */}
      {template && (
        <div style={{ display:'flex', justifyContent:'flex-end' }}>
          <button onClick={handleDelete}
            style={{ padding:'8px 14px', borderRadius:8, background:'transparent', color:'#991B1B', border:'1px solid transparent', fontSize:12, fontWeight:600, cursor:'pointer' }}>
            Delete this template
          </button>
        </div>
      )}

      {/* ── "Manage fee types" modal ── */}
      {typeMgrOpen && (
        <FeeTypeManagerModal
          feeTypes={feeTypes}
          onChange={reloadFeeTypes}
          onClose={() => setTypeMgrOpen(false)}
        />
      )}
    </div>
  );
}

// ── Helpers ──
const th = { padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em' };
const td = { padding:'8px 10px', verticalAlign:'top' };

// ── Sub-component: manage fee types (add / rename / delete) ────────────────
function FeeTypeManagerModal({ feeTypes, onChange, onClose }) {
  const [name,        setName]        = useState('');
  const [category,    setCategory]    = useState('other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [defaultAmt,  setDefaultAmt]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [editingId,   setEditingId]   = useState(null);
  const formRef = React.useRef(null);
  const nameInputRef = React.useRef(null);

  const startEdit = (t) => {
    setEditingId(t._id);
    setName(t.name);
    setCategory(t.category || 'other');
    setIsRecurring(!!t.isRecurring);
    setDefaultAmt(t.defaultAmount || '');
    // Scroll the form into view + focus the name field so user sees it filled
    setTimeout(() => {
      formRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }, 50);
  };

  const reset = () => {
    setEditingId(null);
    setName(''); setCategory('other'); setIsRecurring(false); setDefaultAmt('');
  };

  const handleSave = async () => {
    if (!name.trim()) return toast.error('Name is required');
    setSaving(true);
    try {
      const payload = {
        name:          name.trim(),
        category,
        isRecurring,
        frequency:     isRecurring ? 'monthly' : 'one-time',
        defaultAmount: Number(defaultAmt) || 0,
        isActive:      true,
      };
      if (editingId) {
        await feeAPI.updateFeeType(editingId, payload);
        toast.success('Fee type updated');
      } else {
        await feeAPI.createFeeType(payload);
        toast.success('Fee type added');
      }
      reset();
      await onChange();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Save failed');
    } finally { setSaving(false); }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete fee type "${t.name}"? Existing fees won't be affected.`)) return;
    try {
      await feeAPI.deleteFeeType(t._id);
      toast.success('Fee type removed');
      if (editingId === t._id) reset();
      await onChange();
    } catch { toast.error('Delete failed'); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:720, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#111827' }}>Manage fee types</div>
            <div style={{ fontSize:12, color:'#6B7280' }}>Add new categories, rename, or remove duplicates. Removed types stay on already-assigned fees but disappear from new dropdowns.</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6B7280' }}>✕</button>
        </div>

        {/* Add / Edit form */}
        <div ref={formRef} style={{
          padding:14,
          borderBottom:'1px solid #F3F4F6',
          background: editingId ? '#FEF3C7' : '#F9FAFB',
          borderLeft: editingId ? '4px solid #F59E0B' : '4px solid transparent',
          transition: 'background 0.2s, border-color 0.2s',
        }}>
          <div style={{ fontSize:12, fontWeight:700, color: editingId ? '#92400E' : '#374151', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
            {editingId ? `✏️ Editing fee type — make changes below and click Update` : 'Add new fee type'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr auto', gap:8, alignItems:'end' }}>
            <div>
              <div style={LBL}>Name</div>
              <input ref={nameInputRef} style={INP} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Sports Fee" />
            </div>
            <div>
              <div style={LBL}>Category</div>
              <select style={INP} value={category} onChange={e=>setCategory(e.target.value)}>
                <option value="tuition">Tuition</option>
                <option value="exam">Exam</option>
                <option value="transport">Transport</option>
                <option value="uniform">Uniform</option>
                <option value="library">Library</option>
                <option value="sports">Sports</option>
                <option value="other">Other</option>
              </select>
            </div>
            <div>
              <div style={LBL}>Default ₹</div>
              <input type="number" min="0" style={INP} value={defaultAmt} onChange={e=>setDefaultAmt(e.target.value)} placeholder="0" />
            </div>
            <div>
              <div style={LBL}>Recurring?</div>
              <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:12, color:'#374151', padding:'9px 0' }}>
                <input type="checkbox" checked={isRecurring} onChange={e=>setIsRecurring(e.target.checked)} />
                Monthly
              </label>
            </div>
            <div style={{ display:'flex', gap:6 }}>
              {editingId && <button style={BTN_LIGHT} onClick={reset}>Cancel</button>}
              <button style={BTN_PRIMARY} onClick={handleSave} disabled={saving}>
                {saving ? '...' : (editingId ? 'Update' : 'Add')}
              </button>
            </div>
          </div>
        </div>

        {/* List of existing types */}
        <div style={{ flex:1, overflowY:'auto' }}>
          {feeTypes.length === 0 ? (
            <div style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No fee types yet. Add your first one above.</div>
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB' }}>
                  <th style={th}>Name</th>
                  <th style={th}>Category</th>
                  <th style={th}>Frequency</th>
                  <th style={th}>Default</th>
                  <th style={{ ...th, width:120 }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {feeTypes.map(t => (
                  <tr key={t._id} style={{ borderTop:'1px solid #F3F4F6', background: editingId === t._id ? '#FEF3C7' : 'transparent' }}>
                    <td style={td}>
                      <div style={{ fontWeight:700, color:'#111827' }}>{t.name}</div>
                    </td>
                    <td style={td}>
                      <span style={{ display:'inline-block', padding:'2px 8px', borderRadius:6, background:'#F3F4F6', fontSize:11, fontWeight:600, color:'#374151', textTransform:'capitalize' }}>
                        {t.category || 'other'}
                      </span>
                    </td>
                    <td style={td}>
                      {t.isRecurring || t.frequency === 'monthly' ? (
                        <span style={{ color:'#1E40AF', fontWeight:600 }}>Monthly</span>
                      ) : (
                        <span style={{ color:'#374151' }}>One-time</span>
                      )}
                    </td>
                    <td style={td}>
                      {t.defaultAmount ? fmt(t.defaultAmount) : <span style={{ color:'#9CA3AF' }}>—</span>}
                    </td>
                    <td style={td}>
                      <div style={{ display:'flex', gap:4 }}>
                        <button onClick={() => startEdit(t)}
                          style={{ padding:'5px 10px', borderRadius:6, background:'#EFF6FF', color:'#1D4ED8', border:'1px solid #BFDBFE', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                          Edit
                        </button>
                        <button onClick={() => handleDelete(t)} style={BTN_DANGER}>Delete</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding:'12px 18px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end' }}>
          <button style={BTN_LIGHT} onClick={onClose}>Done</button>
        </div>
      </div>
    </div>
  );
}