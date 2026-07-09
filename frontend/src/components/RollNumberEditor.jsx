import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { studentAPI } from '../utils/api';

/**
 * Inline Roll No editor for the student detail view.
 * Props:
 *   studentId    : string
 *   initialValue : string
 *   canEdit      : boolean (admin only)
 *   onSaved      : (newRoll) => void  (optional, to update parent state)
 */
export default function RollNumberEditor({ studentId, initialValue = '', canEdit = false, onSaved }) {
  const [value, setValue]     = useState(initialValue || '');
  const [editing, setEditing] = useState(false);
  const [saving, setSaving]   = useState(false);

  const save = async () => {
    setSaving(true);
    try {
      await studentAPI.update(studentId, { rollNumber: value.trim() });
      toast.success('Roll number saved');
      setEditing(false);
      onSaved && onSaved(value.trim());
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save roll number');
    } finally { setSaving(false); }
  };

  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:'12px 16px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap' }}>
      <span style={{ fontSize:13, fontWeight:700, color:'#0B1F4A' }}>🔢 Roll No:</span>

      {!editing ? (
        <>
          <span style={{ fontSize:13, color: value ? '#374151' : '#9CA3AF', fontWeight:600 }}>{value || 'Not set'}</span>
          {canEdit && (
            <button onClick={() => setEditing(true)}
              style={{ marginLeft:'auto', padding:'5px 12px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#0B1F4A', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              ✎ Edit
            </button>
          )}
        </>
      ) : (
        <>
          <input
            value={value}
            onChange={e => setValue(e.target.value)}
            placeholder="e.g. 12"
            autoFocus
            style={{ padding:'6px 10px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none', width:120 }}
          />
          <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
            <button onClick={() => { setValue(initialValue || ''); setEditing(false); }}
              style={{ padding:'6px 12px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', color:'#6B7280', fontSize:12, fontWeight:700, cursor:'pointer' }}>
              Cancel
            </button>
            <button onClick={save} disabled={saving}
              style={{ padding:'6px 16px', borderRadius:8, border:'none', background:'#0B1F4A', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? '⏳' : '💾 Save'}
            </button>
          </div>
        </>
      )}
    </div>
  );
}