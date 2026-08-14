/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Subjects.js — Subject configuration
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { subjectAPI } from '../utils/api';

const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
  fontSize:13, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' };
const LBL = { fontSize:11, color:'#374151', marginBottom:5, display:'block', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px' };

const TYPES = ['theory', 'practical', 'both'];

export default function Subjects() {
  const [subjects, setSubjects] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [editId,   setEditId]   = useState(null);
  const [form,     setForm]     = useState({ name:'', code:'', type:'theory', description:'' });

  const load = async () => {
    setLoading(true);
    try {
      const r = await subjectAPI.getAll();
      setSubjects(r.data.data || []);
    } catch { toast.error('Failed to load subjects'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const resetForm = () => { setForm({ name:'', code:'', type:'theory', description:'' }); setEditId(null); };

  const save = async () => {
    if (!form.name.trim()) return toast.error('Subject name is required');
    // Build payload — omit empty code so the unique index doesn't clash on ""
    const payload = { name: form.name.trim(), type: form.type, description: form.description.trim() };
    if (form.code.trim()) payload.code = form.code.trim();

    setSaving(true);
    try {
      if (editId) {
        await subjectAPI.update(editId, payload);
        toast.success('Subject updated');
      } else {
        await subjectAPI.create(payload);
        toast.success('Subject added');
      }
      resetForm();
      load();
    } catch(e) {
      const msg = e?.response?.data?.message || 'Failed to save subject';
      // Friendlier message for duplicate code
      toast.error(/duplicate|E11000/i.test(msg) ? 'That subject code is already in use' : msg);
    }
    finally { setSaving(false); }
  };

  const startEdit = (s) => {
    setEditId(s._id);
    setForm({ name:s.name||'', code:s.code||'', type:s.type||'theory', description:s.description||'' });
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete subject "${s.name}"? This cannot be undone.`)) return;
    try {
      await subjectAPI.delete(s._id);
      toast.success('Subject deleted');
      if (editId === s._id) resetForm();
      load();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to delete'); }
  };

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,sans-serif', maxWidth:900 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>📖 Subjects</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Add and manage subjects used in Homework, Timetable and Exams</p>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:20, alignItems:'start' }}>
        {/* Add / Edit form */}
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 20px' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>{editId ? '✏️ Edit Subject' : '➕ Add Subject'}</div>
          </div>
          <div style={{ padding:20, display:'grid', gap:14 }}>
            <div>
              <label style={LBL}>Subject Name *</label>
              <input style={INP} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Mathematics"/>
            </div>
            <div>
              <label style={LBL}>Code</label>
              <input style={INP} value={form.code} onChange={e=>set('code',e.target.value)} placeholder="e.g. MATH (optional)"/>
            </div>
            <div>
              <label style={LBL}>Type</label>
              <select style={INP} value={form.type} onChange={e=>set('type',e.target.value)}>
                {TYPES.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Description</label>
              <input style={INP} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Optional note"/>
            </div>
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={save} disabled={saving}
                style={{ flex:1, padding:'10px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                {saving ? '⏳ Saving…' : (editId ? '💾 Update' : '➕ Add Subject')}
              </button>
              {editId && (
                <button onClick={resetForm}
                  style={{ padding:'10px 16px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
                  Cancel
                </button>
              )}
            </div>
          </div>
        </div>

        {/* Subject list */}
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>📚 All Subjects</div>
            <span style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{subjects.length} total</span>
          </div>
          <div style={{ padding:20 }}>
            {loading ? (
              <div style={{ textAlign:'center', color:'#9CA3AF', padding:24 }}>⏳ Loading…</div>
            ) : subjects.length === 0 ? (
              <div style={{ textAlign:'center', color:'#9CA3AF', padding:24 }}>
                No subjects yet. Add your first subject on the left — then it will appear in Homework and Timetable.
              </div>
            ) : (
              <div style={{ display:'grid', gap:10 }}>
                {subjects.map(s=>(
                  <div key={s._id} style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 14px', border:'1px solid #E5E7EB', borderRadius:12 }}>
                    <div style={{ width:38, height:38, borderRadius:10, background:'#EEF2FF', color:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:14, flexShrink:0 }}>
                      {s.name?.[0]?.toUpperCase() || 'S'}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:14, color:'#0B1F4A' }}>
                        {s.name}
                        {s.code && <span style={{ marginLeft:8, fontSize:11, fontWeight:700, color:'#6B7280' }}>({s.code})</span>}
                      </div>
                      <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>
                        <span style={{ textTransform:'capitalize' }}>{s.type || 'theory'}</span>
                        {s.description ? ` · ${s.description}` : ''}
                      </div>
                    </div>
                    <button onClick={()=>startEdit(s)} style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:'#374151', flexShrink:0 }}>
                      ✏️ Edit
                    </button>
                    <button onClick={()=>remove(s)} style={{ padding:'6px 12px', borderRadius:8, border:'none', background:'#FEE2E2', fontSize:12, fontWeight:700, cursor:'pointer', color:'#B91C1C', flexShrink:0 }}>
                      Delete
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}