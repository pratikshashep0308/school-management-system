/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/AccessControl.js — Role × Module permission matrix
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { permissionAPI } from '../utils/api';

export default function AccessControl() {
  const [modules, setModules] = useState([]);
  const [roles,   setRoles]   = useState([]);
  const [levels,  setLevels]  = useState([]);
  const [matrix,  setMatrix]  = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [dirty,   setDirty]   = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const r = await permissionAPI.get();
      setModules(r.data.modules || []);
      setRoles(r.data.roles || []);
      setLevels(r.data.levels || [
        { key:'none', label:'No Access' }, { key:'read', label:'Read Only' },
        { key:'edit', label:'Read/Edit' }, { key:'admin', label:'Admin' },
      ]);
      setMatrix(r.data.matrix || {});
      setDirty(false);
    } catch { toast.error('Failed to load permissions'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const setLevel = (roleKey, modKey, value) => {
    setMatrix(m => ({
      ...m,
      [roleKey]: { ...m[roleKey], [modKey]: value },
    }));
    setDirty(true);
  };

  const setRoleAll = (roleKey, value) => {
    setMatrix(m => {
      const row = {};
      modules.forEach(mod => { row[mod.key] = value; });
      return { ...m, [roleKey]: row };
    });
    setDirty(true);
  };

  const setColAll = (modKey, value) => {
    setMatrix(m => {
      const next = { ...m };
      roles.forEach(r => { next[r.key] = { ...next[r.key], [modKey]: value }; });
      return next;
    });
    setDirty(true);
  };

  const save = async () => {
    setSaving(true);
    try {
      await permissionAPI.save(matrix);
      toast.success('Permissions saved');
      setDirty(false);
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const reset = async () => {
    if (!window.confirm('Reset all roles back to default permissions? Your custom changes will be lost.')) return;
    try {
      await permissionAPI.reset();
      toast.success('Reset to defaults');
      load();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to reset'); }
  };

  const moduleCount = (modKey) => roles.filter(r => (matrix[r.key]?.[modKey] || 'none') !== 'none').length;

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading access matrix…</div>;

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,sans-serif' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>🔐 Matrix Access Control</h1>
          <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Set each role's access level per module: No Access, Read Only, Read/Edit, or Admin. Super Admin always has full access.</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={reset} style={{ padding:'9px 16px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
            ↺ Reset defaults
          </button>
          <button onClick={save} disabled={saving || !dirty}
            style={{ padding:'9px 24px', borderRadius:10, background: dirty ? '#0B1F4A' : '#9CA3AF', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor: dirty ? 'pointer' : 'default', opacity:saving?0.7:1 }}>
            {saving ? '⏳ Saving…' : '💾 Save Changes'}
          </button>
        </div>
      </div>

      {dirty && (
        <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'10px 14px', fontSize:12, color:'#92400E', marginBottom:16 }}>
          ⚠️ You have unsaved changes. Click <strong>Save Changes</strong> to apply them.
        </div>
      )}

      {/* Matrix */}
      <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'auto' }}>
        <table style={{ borderCollapse:'separate', borderSpacing:0, width:'100%', minWidth: 720 }}>
          <thead>
            <tr>
              <th style={{ position:'sticky', left:0, zIndex:2, background:'#0B1F4A', color:'#fff', textAlign:'left', padding:'12px 16px', fontSize:12, fontWeight:800, minWidth:160 }}>
                Module \ Role
              </th>
              {roles.map(r => (
                <th key={r.key} style={{ background:'#0B1F4A', color:'#fff', padding:'10px 8px', fontSize:11, fontWeight:700, whiteSpace:'nowrap', textAlign:'center', verticalAlign:'bottom', minWidth:100 }}>
                  <div style={{ marginBottom:4 }}>{r.label}</div>
                  <div style={{ display:'flex', gap:3, justifyContent:'center' }}>
                    <button onClick={()=>setRoleAll(r.key, 'admin')} title="Set all modules to Admin" style={colBtn('#DCFCE7','#166534')}>✓</button>
                    <button onClick={()=>setRoleAll(r.key, 'none')}  title="Set all modules to No Access" style={colBtn('rgba(255,255,255,0.15)','#fff')}>✕</button>
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {modules.map((mod, mi) => (
              <tr key={mod.key} style={{ background: mi % 2 ? '#F9FAFB' : '#fff' }}>
                <td style={{ position:'sticky', left:0, zIndex:1, background: mi % 2 ? '#F9FAFB' : '#fff', padding:'10px 16px', borderRight:'1px solid #E5E7EB' }}>
                  <div style={{ fontWeight:700, fontSize:13, color:'#0B1F4A' }}>{mod.label}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{moduleCount(mod.key)}/{roles.length} roles</div>
                  <div style={{ display:'flex', gap:4, marginTop:4 }}>
                    <button onClick={()=>setColAll(mod.key, 'admin')} style={rowBtn('#DCFCE7','#166534')}>All Admin</button>
                    <button onClick={()=>setColAll(mod.key, 'none')}  style={rowBtn('#FEE2E2','#B91C1C')}>None</button>
                  </div>
                </td>
                {roles.map(r => {
                  const val = matrix[r.key]?.[mod.key] || 'none';
                  return (
                    <td key={r.key} style={{ textAlign:'center', padding:'6px', borderRight:'1px solid #F3F4F6' }}>
                      <select
                        value={val}
                        onChange={(e)=>setLevel(r.key, mod.key, e.target.value)}
                        aria-label={`${r.label} access to ${mod.label}`}
                        style={{
                          fontSize:11, fontWeight:700, padding:'5px 6px', borderRadius:8, cursor:'pointer',
                          border:'1.5px solid ' + levelBorder(val),
                          background: levelBg(val), color: levelColor(val), outline:'none',
                          minWidth:88, appearance:'none', textAlign:'center', textAlignLast:'center',
                        }}>
                        {levels.map(l => <option key={l.key} value={l.key} style={{ background:'#fff', color:'#111827' }}>{l.label}</option>)}
                      </select>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div style={{ fontSize:12, color:'#9CA3AF', marginTop:12 }}>
        💡 Set each cell's access level. Use the row/column buttons for bulk changes. Changes take effect after saving.
        <span style={{ display:'inline-flex', gap:10, marginLeft:12, flexWrap:'wrap' }}>
          <span style={legendPill('#F3F4F6','#6B7280')}>No Access</span>
          <span style={legendPill('#EFF6FF','#1D4ED8')}>Read Only</span>
          <span style={legendPill('#FEF3C7','#92400E')}>Read/Edit</span>
          <span style={legendPill('#DCFCE7','#166534')}>Admin</span>
        </span>
      </div>
    </div>
  );
}

// Colour coding per access level
function levelBg(v) {
  return v === 'admin' ? '#DCFCE7' : v === 'edit' ? '#FEF3C7' : v === 'read' ? '#EFF6FF' : '#F3F4F6';
}
function levelColor(v) {
  return v === 'admin' ? '#166534' : v === 'edit' ? '#92400E' : v === 'read' ? '#1D4ED8' : '#6B7280';
}
function levelBorder(v) {
  return v === 'admin' ? '#86EFAC' : v === 'edit' ? '#FCD34D' : v === 'read' ? '#BFDBFE' : '#E5E7EB';
}
function legendPill(bg, color) {
  return { background:bg, color, fontSize:11, fontWeight:700, padding:'2px 8px', borderRadius:20 };
}

function colBtn(bg, color) {
  return { width:18, height:18, borderRadius:5, border:'none', cursor:'pointer', background:bg, color, fontSize:10, fontWeight:800, lineHeight:1, padding:0 };
}
function rowBtn(bg, color) {
  return { padding:'2px 8px', borderRadius:6, border:'none', cursor:'pointer', background:bg, color, fontSize:10, fontWeight:700 };
}