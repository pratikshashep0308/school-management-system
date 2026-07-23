// frontend/src/pages/Exams/ExamSetup.jsx
// Admin configuration for the exam module: exam types and grading schemes.
// Grade bands were previously hardcoded in the backend; they're editable here.
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import examAdvAPI from '../../utils/examAPI';
import { LoadingState, EmptyState } from '../../components/ui';

const INP = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB',
  borderRadius: 9, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const LBL = {
  display: 'block', fontSize: 10.5, fontWeight: 700, color: '#6B7280',
  textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5,
};
const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 20 };

const EMPTY_BAND = { grade: '', minPercent: '', maxPercent: '', gradePoint: '', remark: '', isFail: false };

export default function ExamSetup() {
  const [tab, setTab] = useState('types');

  // ── Exam types ──
  const [types, setTypes]       = useState([]);
  const [typeForm, setTypeForm] = useState({ name: '', code: '', weightage: '' });
  const [editingType, setEditingType] = useState(null);

  // ── Grading schemes ──
  const [schemes, setSchemes]   = useState([]);
  const [schemeForm, setSchemeForm] = useState({
    name: '', mode: 'grade', passMark: 35, isDefault: false, bands: [ { ...EMPTY_BAND } ],
  });
  const [editingScheme, setEditingScheme] = useState(null);

  const [loading, setLoading] = useState(true);
  const [saving, setSaving]   = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [t, s] = await Promise.all([examAdvAPI.getTypes(), examAdvAPI.getSchemes()]);
      setTypes(t.data.data || []);
      setSchemes(s.data.data || []);
    } catch { toast.error('Failed to load exam setup'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // ── Exam type handlers ──
  const saveType = async () => {
    if (!typeForm.name.trim()) return toast.error('Exam type name is required');
    setSaving(true);
    try {
      if (editingType) await examAdvAPI.updateType(editingType, typeForm);
      else             await examAdvAPI.createType(typeForm);
      toast.success(editingType ? 'Exam type updated' : 'Exam type created');
      setTypeForm({ name: '', code: '', weightage: '' });
      setEditingType(null);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const removeType = async (id, name) => {
    if (!window.confirm(`Remove exam type "${name}"?\n\nExisting exams using it are not affected.`)) return;
    try { await examAdvAPI.deleteType(id); toast.success('Removed'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to remove'); }
  };

  // ── Grading scheme handlers ──
  const setBand = (i, key, val) => {
    setSchemeForm(f => {
      const bands = [...f.bands];
      bands[i] = { ...bands[i], [key]: val };
      return { ...f, bands };
    });
  };
  const addBand    = () => setSchemeForm(f => ({ ...f, bands: [...f.bands, { ...EMPTY_BAND }] }));
  const removeBand = (i) => setSchemeForm(f => ({ ...f, bands: f.bands.filter((_, j) => j !== i) }));

  const saveScheme = async () => {
    if (!schemeForm.name.trim()) return toast.error('Scheme name is required');
    const bands = schemeForm.bands
      .filter(b => b.grade && b.minPercent !== '' && b.maxPercent !== '')
      .map(b => ({
        grade: b.grade.trim(),
        minPercent: Number(b.minPercent),
        maxPercent: Number(b.maxPercent),
        gradePoint: Number(b.gradePoint || 0),
        remark: b.remark || '',
        isFail: !!b.isFail,
      }));
    if (!bands.length) return toast.error('Add at least one grade band');

    // Catch obvious mistakes before the server rejects them
    for (const b of bands) {
      if (b.minPercent > b.maxPercent) {
        return toast.error(`Band "${b.grade}": minimum is greater than maximum`);
      }
    }

    setSaving(true);
    try {
      const payload = { ...schemeForm, bands, passMark: Number(schemeForm.passMark) };
      if (editingScheme) await examAdvAPI.updateScheme(editingScheme, payload);
      else               await examAdvAPI.createScheme(payload);
      toast.success(editingScheme ? 'Scheme updated' : 'Scheme created');
      setSchemeForm({ name: '', mode: 'grade', passMark: 35, isDefault: false, bands: [ { ...EMPTY_BAND } ] });
      setEditingScheme(null);
      load();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const editScheme = (s) => {
    setEditingScheme(s._id);
    setSchemeForm({
      name: s.name, mode: s.mode, passMark: s.passMark,
      isDefault: s.isDefault, bands: s.bands?.length ? s.bands : [ { ...EMPTY_BAND } ],
    });
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const removeScheme = async (id, name) => {
    if (!window.confirm(`Remove grading scheme "${name}"?`)) return;
    try { await examAdvAPI.deleteScheme(id); toast.success('Removed'); load(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to remove'); }
  };

  if (loading) return <LoadingState rows={4} />;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
      <div>
        <h3 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>⚙️ Exam Setup</h3>
        <p style={{ fontSize: 12.5, color: '#6B7280', marginTop: 3 }}>
          Define the exam types your school runs and how marks translate into grades.
        </p>
      </div>

      <div style={{ display: 'flex', gap: 6 }}>
        {[['types', '📋 Exam Types'], ['grading', '🎯 Grading Schemes']].map(([k, label]) => (
          <button key={k} onClick={() => setTab(k)}
            style={{ padding: '8px 16px', borderRadius: 9, fontSize: 13, fontWeight: 700, cursor: 'pointer',
              border: '1px solid #E5E7EB',
              background: tab === k ? '#1D4ED8' : '#fff',
              color:      tab === k ? '#fff'    : '#4B5563' }}>
            {label}
          </button>
        ))}
      </div>

      {/* ══ EXAM TYPES ══ */}
      {tab === 'types' && (
        <>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              {editingType ? 'Edit exam type' : 'Add an exam type'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, alignItems: 'end' }}>
              <div>
                <label style={LBL}>Name *</label>
                <input style={INP} value={typeForm.name}
                  onChange={e => setTypeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Half Yearly" />
              </div>
              <div>
                <label style={LBL}>Short code</label>
                <input style={INP} value={typeForm.code}
                  onChange={e => setTypeForm(f => ({ ...f, code: e.target.value }))}
                  placeholder="HY" />
              </div>
              <div>
                <label style={LBL}>Weightage (%)</label>
                <input type="number" style={INP} value={typeForm.weightage}
                  onChange={e => setTypeForm(f => ({ ...f, weightage: e.target.value }))}
                  placeholder="25" />
              </div>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={saveType} disabled={saving}
                  style={{ padding: '9px 18px', borderRadius: 9, border: 'none', background: '#1D4ED8',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : editingType ? 'Update' : 'Add'}
                </button>
                {editingType && (
                  <button onClick={() => { setEditingType(null); setTypeForm({ name: '', code: '', weightage: '' }); }}
                    style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid #E5E7EB',
                      background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
              </div>
            </div>
          </div>

          {types.length === 0 ? (
            <EmptyState icon="📋" title="No exam types yet"
              subtitle="Add your first exam type above, or run the seed script to create the standard set." />
          ) : (
            <div style={{ ...CARD, padding: 0, overflow: 'hidden' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#F9FAFB' }}>
                    {['Name', 'Code', 'Weightage', ''].map(h => (
                      <th key={h} style={{ textAlign: 'left', padding: '11px 16px', fontSize: 10.5,
                        fontWeight: 700, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {types.map(t => (
                    <tr key={t._id} style={{ borderTop: '1px solid #F3F4F6' }}>
                      <td style={{ padding: '11px 16px', fontWeight: 600 }}>{t.name}</td>
                      <td style={{ padding: '11px 16px', fontFamily: 'monospace', color: '#6B7280' }}>{t.code || '—'}</td>
                      <td style={{ padding: '11px 16px', color: '#6B7280' }}>{t.weightage ? `${t.weightage}%` : '—'}</td>
                      <td style={{ padding: '11px 16px', textAlign: 'right' }}>
                        <button onClick={() => { setEditingType(t._id); setTypeForm({ name: t.name, code: t.code || '', weightage: t.weightage || '' }); }}
                          style={{ marginRight: 6, padding: '5px 11px', borderRadius: 7, border: '1px solid #E5E7EB',
                            background: '#fff', fontSize: 12, cursor: 'pointer' }}>✏️</button>
                        <button onClick={() => removeType(t._id, t.name)}
                          style={{ padding: '5px 11px', borderRadius: 7, border: '1px solid #FECACA',
                            background: '#FEF2F2', color: '#991B1B', fontSize: 12, cursor: 'pointer' }}>🗑</button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* ══ GRADING SCHEMES ══ */}
      {tab === 'grading' && (
        <>
          <div style={CARD}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 14 }}>
              {editingScheme ? 'Edit grading scheme' : 'Create a grading scheme'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 12, marginBottom: 16 }}>
              <div>
                <label style={LBL}>Scheme name *</label>
                <input style={INP} value={schemeForm.name}
                  onChange={e => setSchemeForm(f => ({ ...f, name: e.target.value }))}
                  placeholder="e.g. Primary Grading" />
              </div>
              <div>
                <label style={LBL}>Display as</label>
                <select style={INP} value={schemeForm.mode}
                  onChange={e => setSchemeForm(f => ({ ...f, mode: e.target.value }))}>
                  <option value="grade">Letter grade</option>
                  <option value="percentage">Percentage</option>
                  <option value="cgpa">CGPA</option>
                  <option value="gpa">GPA</option>
                </select>
              </div>
              <div>
                <label style={LBL}>Pass mark (%)</label>
                <input type="number" style={INP} value={schemeForm.passMark}
                  onChange={e => setSchemeForm(f => ({ ...f, passMark: e.target.value }))} />
              </div>
              <div style={{ display: 'flex', alignItems: 'flex-end' }}>
                <label style={{ display: 'flex', alignItems: 'center', gap: 7, fontSize: 13, cursor: 'pointer' }}>
                  <input type="checkbox" checked={schemeForm.isDefault}
                    onChange={e => setSchemeForm(f => ({ ...f, isDefault: e.target.checked }))} />
                  Use as default
                </label>
              </div>
            </div>

            <div style={{ fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>
              Grade bands
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {schemeForm.bands.map((b, i) => (
                <div key={i} style={{ display: 'grid', gridTemplateColumns: '90px 90px 90px 90px 1fr 70px 40px', gap: 8, alignItems: 'center' }}>
                  <input style={INP} placeholder="A+" value={b.grade}
                    onChange={e => setBand(i, 'grade', e.target.value)} />
                  <input style={INP} type="number" placeholder="Min %" value={b.minPercent}
                    onChange={e => setBand(i, 'minPercent', e.target.value)} />
                  <input style={INP} type="number" placeholder="Max %" value={b.maxPercent}
                    onChange={e => setBand(i, 'maxPercent', e.target.value)} />
                  <input style={INP} type="number" placeholder="Points" value={b.gradePoint}
                    onChange={e => setBand(i, 'gradePoint', e.target.value)} />
                  <input style={INP} placeholder="Remark (e.g. Excellent)" value={b.remark}
                    onChange={e => setBand(i, 'remark', e.target.value)} />
                  <label style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 12, color: '#991B1B', cursor: 'pointer' }}>
                    <input type="checkbox" checked={b.isFail}
                      onChange={e => setBand(i, 'isFail', e.target.checked)} />
                    Fail
                  </label>
                  <button onClick={() => removeBand(i)}
                    style={{ padding: '7px', borderRadius: 7, border: '1px solid #FECACA',
                      background: '#FEF2F2', color: '#991B1B', fontSize: 12, cursor: 'pointer' }}>✕</button>
                </div>
              ))}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 14, flexWrap: 'wrap', gap: 10 }}>
              <button onClick={addBand}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px dashed #C7D2FE',
                  background: '#EEF2FF', color: '#3730A3', fontSize: 12.5, fontWeight: 600, cursor: 'pointer' }}>
                + Add band
              </button>
              <div style={{ display: 'flex', gap: 8 }}>
                {editingScheme && (
                  <button onClick={() => { setEditingScheme(null); setSchemeForm({ name: '', mode: 'grade', passMark: 35, isDefault: false, bands: [ { ...EMPTY_BAND } ] }); }}
                    style={{ padding: '9px 14px', borderRadius: 9, border: '1px solid #E5E7EB',
                      background: '#fff', color: '#6B7280', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
                    Cancel
                  </button>
                )}
                <button onClick={saveScheme} disabled={saving}
                  style={{ padding: '9px 20px', borderRadius: 9, border: 'none', background: '#1D4ED8',
                    color: '#fff', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  {saving ? 'Saving…' : editingScheme ? 'Update scheme' : 'Create scheme'}
                </button>
              </div>
            </div>
          </div>

          {schemes.length === 0 ? (
            <EmptyState icon="🎯" title="No grading schemes"
              subtitle="Without one, results fall back to a standard A+ to F scale." />
          ) : schemes.map(s => (
            <div key={s._id} style={CARD}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 10, marginBottom: 12 }}>
                <div>
                  <span style={{ fontWeight: 700, fontSize: 14 }}>{s.name}</span>
                  {s.isDefault && (
                    <span style={{ marginLeft: 8, fontSize: 10.5, fontWeight: 700, padding: '2px 9px',
                      borderRadius: 999, background: '#DCFCE7', color: '#166534' }}>DEFAULT</span>
                  )}
                  <div style={{ fontSize: 12, color: '#6B7280', marginTop: 3 }}>
                    {s.mode} · pass at {s.passMark}% · {s.bands?.length || 0} bands
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }}>
                  <button onClick={() => editScheme(s)}
                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #E5E7EB',
                      background: '#fff', fontSize: 12, cursor: 'pointer' }}>✏️ Edit</button>
                  <button onClick={() => removeScheme(s._id, s.name)}
                    style={{ padding: '6px 12px', borderRadius: 7, border: '1px solid #FECACA',
                      background: '#FEF2F2', color: '#991B1B', fontSize: 12, cursor: 'pointer' }}>🗑</button>
                </div>
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                {(s.bands || []).map((b, i) => (
                  <span key={i} style={{
                    fontSize: 11.5, padding: '4px 10px', borderRadius: 8,
                    background: b.isFail ? '#FEF2F2' : '#F9FAFB',
                    border: `1px solid ${b.isFail ? '#FECACA' : '#E5E7EB'}`,
                    color: b.isFail ? '#991B1B' : '#4B5563',
                  }}>
                    <b>{b.grade}</b> {b.minPercent}–{b.maxPercent}%
                    {b.gradePoint ? ` · ${b.gradePoint}pt` : ''}
                  </span>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}