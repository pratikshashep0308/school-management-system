/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Fees/ClassFeeDefaults.js
// Wrapper that toggles between two modes:
//   1. STANDARD — set per-class default fees that auto-apply on enrollment
//   2. AD-HOC   — assign one-off fees to a class or specific students
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI, studentAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';
import AdHocFeeAssignment from './AdHocFeeAssignment';

const INP = { width:'100%', padding:'8px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:4, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
const BTN_PRIMARY = { padding:'9px 18px', borderRadius:8, background:'#1D4ED8', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' };
const BTN_LIGHT   = { padding:'9px 14px', borderRadius:8, background:'#F3F4F6', color:'#374151', border:'1px solid #E5E7EB', fontSize:13, fontWeight:600, cursor:'pointer' };
const BTN_DANGER  = { padding:'7px 12px', borderRadius:8, background:'#FEF2F2', color:'#991B1B', border:'1px solid #FECACA', fontSize:12, fontWeight:600, cursor:'pointer' };
const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

const blankLine = () => ({ feeType:'', amount:'', dueDay:5, dueDate:'', lateFeePerDay:0, notes:'' });

const SWITCH_BTN = {
  padding:'10px 18px', fontSize:13, fontWeight:700, border:'none',
  cursor:'pointer', transition:'all 0.15s', flex:1,
};

export default function ClassFeeDefaults() {
  const [mode, setMode] = useState('standard');

  return (
    <div className="space-y-4">
      {/* ── Mode switcher ── */}
      <div style={{ display:'flex', background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden', maxWidth:680 }}>
        <button onClick={() => setMode('standard')}
          style={{
            ...SWITCH_BTN,
            background: mode==='standard' ? '#1D4ED8' : '#fff',
            color:      mode==='standard' ? '#fff'    : '#374151',
            borderRight:'1px solid #E5E7EB',
          }}>
          🏷️ Standard Defaults
          <div style={{ fontSize:10, fontWeight:500, opacity:0.85, marginTop:2 }}>
            Auto-apply to new students
          </div>
        </button>
        <button onClick={() => setMode('adhoc')}
          style={{
            ...SWITCH_BTN,
            background: mode==='adhoc' ? '#1D4ED8' : '#fff',
            color:      mode==='adhoc' ? '#fff'    : '#374151',
          }}>
          ⚡ One-off Fee
          <div style={{ fontSize:10, fontWeight:500, opacity:0.85, marginTop:2 }}>
            Field trips, fines, special charges
          </div>
        </button>
      </div>

      {mode === 'standard' && <StandardClassDefaults />}
      {mode === 'adhoc'    && <AdHocFeeAssignment />}
    </div>
  );
}

// ── STANDARD mode: per-class default fee templates ──────────────────────────
function StandardClassDefaults() {
  const [classes,   setClasses]   = useState([]);
  const [feeTypes,  setFeeTypes]  = useState([]);
  const [classId,   setClassId]   = useState('');
  const [template,  setTemplate]  = useState(null);
  const [lines,     setLines]     = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [saving,    setSaving]    = useState(false);
  const [applyOpen, setApplyOpen] = useState(false);
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
    feeAPI.getClassTemplate(classId).then(r => {
      const tpl = r.data.data;
      setTemplate(tpl);
      if (tpl && tpl.lines?.length) {
        setLines(tpl.lines.map(l => ({
          feeType:       l.feeType?._id || l.feeType,
          amount:        l.amount,
          dueDay:        l.dueDay || 5,
          dueDate:       l.dueDate ? l.dueDate.split('T')[0] : '',
          lateFeePerDay: l.lateFeePerDay || 0,
          notes:         l.notes || '',
        })));
      } else {
        setLines([blankLine()]);
      }
    }).catch(() => {
      setTemplate(null);
      setLines([blankLine()]);
    });
  }, [classId]);

  const totalMonthly  = useMemo(() => lines.filter(l => isRecurring(l, feeTypes)).reduce((s,l) => s + (Number(l.amount)||0), 0), [lines, feeTypes]);
  const totalOneTime  = useMemo(() => lines.filter(l => !isRecurring(l, feeTypes)).reduce((s,l) => s + (Number(l.amount)||0), 0), [lines, feeTypes]);

  const setLine = (i, k, v) => setLines(prev => prev.map((l, idx) => idx===i ? { ...l, [k]: v } : l));
  const addLine = () => setLines(prev => [...prev, blankLine()]);
  const removeLine = (i) => setLines(prev => prev.filter((_, idx) => idx !== i));

  const handleSave = async () => {
    const valid = lines.filter(l => l.feeType && Number(l.amount) > 0);
    if (!valid.length) return toast.error('Add at least one valid fee line');
    setSaving(true);
    try {
      await feeAPI.saveClassTemplate({ classId, lines: valid });
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
          {template && (
            <button style={BTN_LIGHT} onClick={() => setApplyOpen(true)}>
              ↻ Apply to existing students
            </button>
          )}
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
          <div style={{ fontSize:11, fontWeight:700, color:'#1E40AF', textTransform:'uppercase' }}>Monthly Recurring</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#1E3A8A', marginTop:4 }}>{fmt(totalMonthly)}</div>
          <div style={{ fontSize:11, color:'#3B82F6', marginTop:2 }}>Per student / month</div>
        </div>
        <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:10, padding:14 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#166534', textTransform:'uppercase' }}>One-time Fees</div>
          <div style={{ fontSize:22, fontWeight:800, color:'#14532D', marginTop:4 }}>{fmt(totalOneTime)}</div>
          <div style={{ fontSize:11, color:'#16A34A', marginTop:2 }}>Per student / once</div>
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
          <table style={{ width:'100%', borderCollapse:'collapse', minWidth:780 }}>
            <thead>
              <tr style={{ background:'#F9FAFB' }}>
                <th style={th}>Fee Type</th>
                <th style={th}>Amount (₹)</th>
                <th style={th}>Due Day / Date</th>
                <th style={th}>Late Fee/day</th>
                <th style={th}>Notes</th>
                <th style={{ ...th, width:60 }}></th>
              </tr>
            </thead>
            <tbody>
              {lines.length === 0 && (
                <tr><td colSpan={6} style={{ padding:30, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>No fee lines. Click "Add line" to start.</td></tr>
              )}
              {lines.map((l, i) => {
                const ft = feeTypes.find(t => t._id === l.feeType);
                const recurring = ft?.isRecurring || ft?.frequency === 'monthly';
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
                      <input type="number" min="0" style={INP} value={l.amount}
                        onChange={e => setLine(i, 'amount', e.target.value)} placeholder="0" />
                    </td>
                    <td style={td}>
                      {recurring ? (
                        <input type="number" min="1" max="28" style={INP} value={l.dueDay}
                          onChange={e => setLine(i, 'dueDay', e.target.value)} placeholder="5" title="Day of month" />
                      ) : (
                        <input type="date" style={INP} value={l.dueDate}
                          onChange={e => setLine(i, 'dueDate', e.target.value)} />
                      )}
                    </td>
                    <td style={td}>
                      <input type="number" min="0" style={INP} value={l.lateFeePerDay}
                        onChange={e => setLine(i, 'lateFeePerDay', e.target.value)} placeholder="0" />
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

      {/* ── "Apply to existing students" modal ── */}
      {applyOpen && (
        <ApplyToStudentsModal
          classId={classId}
          className={`${selectedClass?.name||''} ${selectedClass?.section||''}`}
          template={template}
          onClose={() => setApplyOpen(false)}
        />
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
function isRecurring(line, feeTypes) {
  const ft = feeTypes.find(t => t._id === (line.feeType?._id || line.feeType));
  return !!(ft?.isRecurring || ft?.frequency === 'monthly');
}

const th = { padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em' };
const td = { padding:'8px 10px', verticalAlign:'top' };

// ── Sub-component: apply to existing students with per-student override ───────
function ApplyToStudentsModal({ classId, className, template, onClose }) {
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [applying, setApplying] = useState(false);
  // per-student per-feeType override map: { studentId: { feeTypeId: { amount, skip } } }
  const [overrides, setOverrides] = useState({});
  const [selected,  setSelected]  = useState({}); // studentId -> bool

  useEffect(() => {
    studentAPI.getAll({ classId }).then(r => {
      const list = (r.data.data || []).filter(s => s.isActive !== false);
      setStudents(list);
      // Default: all selected
      const sel = {};
      list.forEach(s => { sel[s._id] = true; });
      setSelected(sel);
    }).catch(()=>{}).finally(() => setLoading(false));
  }, [classId]);

  const setOverride = (studentId, feeTypeId, key, val) => {
    setOverrides(prev => ({
      ...prev,
      [studentId]: { ...(prev[studentId] || {}), [feeTypeId]: { ...((prev[studentId]||{})[feeTypeId] || {}), [key]: val } },
    }));
  };

  const apply = async () => {
    const studentIds = Object.keys(selected).filter(id => selected[id]);
    if (!studentIds.length) return toast.error('Select at least one student');
    setApplying(true);
    try {
      // Send a single call per-student so each can have its own overrides.
      // For students with no overrides, send the empty map (template applies as-is).
      let totalApplied = 0, totalSkipped = 0;
      for (const sid of studentIds) {
        const ov = overrides[sid] || {};
        const r = await feeAPI.applyClassTemplate(classId, { studentIds: [sid], overrides: ov });
        totalApplied += r.data.summary?.totalApplied || 0;
        totalSkipped += r.data.summary?.totalSkipped || 0;
      }
      toast.success(`Applied ${totalApplied} fee${totalApplied === 1 ? '' : 's'} (${totalSkipped} skipped)`);
      onClose();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Apply failed');
    } finally { setApplying(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:100, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:12, width:'100%', maxWidth:880, maxHeight:'90vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>
        <div style={{ padding:'14px 18px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#111827' }}>Apply defaults to students of {className}</div>
            <div style={{ fontSize:12, color:'#6B7280' }}>Tweak amounts per student before applying. Existing duplicate fees are skipped.</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer', color:'#6B7280' }}>✕</button>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:14 }}>
          {loading ? <LoadingState /> : students.length === 0 ? (
            <EmptyState icon="👥" title="No students" subtitle="No active students in this class." />
          ) : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#F9FAFB' }}>
                  <th style={{ ...th, width:32 }}>
                    <input type="checkbox"
                      checked={students.every(s => selected[s._id])}
                      onChange={e => {
                        const v = e.target.checked;
                        const sel = {};
                        students.forEach(s => { sel[s._id] = v; });
                        setSelected(sel);
                      }} />
                  </th>
                  <th style={th}>Student</th>
                  {template?.lines?.map((l, i) => (
                    <th key={i} style={th}>
                      {l.feeType?.name || 'Fee'}
                      <div style={{ fontSize:9, color:'#9CA3AF', fontWeight:400 }}>Default {fmt(l.amount)}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.map(s => (
                  <tr key={s._id} style={{ borderTop:'1px solid #F3F4F6' }}>
                    <td style={td}>
                      <input type="checkbox" checked={!!selected[s._id]}
                        onChange={e => setSelected(prev => ({ ...prev, [s._id]: e.target.checked }))} />
                    </td>
                    <td style={td}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{s.user?.name || '—'}</div>
                      <div style={{ fontSize:11, color:'#6B7280' }}>{s.admissionNumber || ''}</div>
                    </td>
                    {template?.lines?.map(l => {
                      const ftId = l.feeType?._id || l.feeType;
                      const cur = overrides[s._id]?.[ftId] || {};
                      return (
                        <td key={ftId} style={td}>
                          <input type="number" min="0" disabled={!selected[s._id] || cur.skip}
                            placeholder={String(l.amount)}
                            style={{ ...INP, padding:'5px 8px', fontSize:12 }}
                            value={cur.amount ?? ''}
                            onChange={e => setOverride(s._id, ftId, 'amount', e.target.value)} />
                          <label style={{ display:'flex', alignItems:'center', gap:4, fontSize:10, color:'#9CA3AF', marginTop:3 }}>
                            <input type="checkbox" checked={!!cur.skip}
                              onChange={e => setOverride(s._id, ftId, 'skip', e.target.checked)} />
                            Skip
                          </label>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div style={{ padding:'12px 18px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:8 }}>
          <button style={BTN_LIGHT} onClick={onClose}>Cancel</button>
          <button style={BTN_PRIMARY} onClick={apply} disabled={applying}>
            {applying ? 'Applying…' : 'Apply now'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Sub-component: manage fee types (add / rename / delete) ────────────────
function FeeTypeManagerModal({ feeTypes, onChange, onClose }) {
  const [name,        setName]        = useState('');
  const [category,    setCategory]    = useState('other');
  const [isRecurring, setIsRecurring] = useState(false);
  const [defaultAmt,  setDefaultAmt]  = useState('');
  const [saving,      setSaving]      = useState(false);
  const [editingId,   setEditingId]   = useState(null);

  const startEdit = (t) => {
    setEditingId(t._id);
    setName(t.name);
    setCategory(t.category || 'other');
    setIsRecurring(!!t.isRecurring);
    setDefaultAmt(t.defaultAmount || '');
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
        <div style={{ padding:14, borderBottom:'1px solid #F3F4F6', background:'#F9FAFB' }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em', marginBottom:8 }}>
            {editingId ? 'Edit fee type' : 'Add new fee type'}
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1.3fr 1fr 1fr auto', gap:8, alignItems:'end' }}>
            <div>
              <div style={LBL}>Name</div>
              <input style={INP} value={name} onChange={e=>setName(e.target.value)} placeholder="e.g. Sports Fee" />
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
                  <tr key={t._id} style={{ borderTop:'1px solid #F3F4F6' }}>
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