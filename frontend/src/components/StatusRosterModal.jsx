import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';

/**
 * Reusable per-student status roster for Homework or Assignments.
 * Props:
 *   open        : boolean
 *   onClose     : () => void
 *   title       : string (item title)
 *   getStatuses : () => Promise  → api call returning { data: { data: [{student,name,rollNumber,status}] } }
 *   setStatus   : (studentId, status) => Promise
 *   readOnly    : boolean (students view only)
 */
const OPTIONS = [
  { key: 'completed',      label: 'Completed',      bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
  { key: 'not_completed',  label: 'Not Completed',  bg: '#FEF3C7', color: '#92400E', border: '#FCD34D' },
  { key: 'not_applicable', label: 'Not Applicable', bg: '#F3F4F6', color: '#6B7280', border: '#E5E7EB' },
];

export default function StatusRosterModal({ open, onClose, title, getStatuses, setStatus, readOnly = false }) {
  const [roster, setRoster] = useState([]);
  const [loading, setLoading] = useState(false);
  const [savingId, setSavingId] = useState(null);

  useEffect(() => {
    if (!open) return;
    let active = true;
    setLoading(true);
    getStatuses()
      .then(r => { if (active) setRoster(r.data?.data || []); })
      .catch(() => { if (active) toast.error('Failed to load student list'); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [open]); // eslint-disable-line

  const change = async (studentId, status) => {
    setSavingId(studentId);
    // optimistic update
    setRoster(rs => rs.map(r => r.student === studentId ? { ...r, status } : r));
    try {
      await setStatus(studentId, status);
      toast.success('Status updated');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to update');
    } finally { setSavingId(null); }
  };

  if (!open) return null;

  const opt = (k) => OPTIONS.find(o => o.key === k) || OPTIONS[1];

  return (
    <div
      onClick={onClose}
      style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', zIndex:9999, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:16 }}
    >
      <div
        onClick={e => e.stopPropagation()}
        style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:560, marginTop:24, overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.25)' }}
      >
        <div style={{ background:'#0B1F4A', padding:'16px 22px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ minWidth:0 }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>✅ Completion Status</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{title}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:8, width:30, height:30, cursor:'pointer', fontSize:16, flexShrink:0 }}>×</button>
        </div>

        <div style={{ padding:18, maxHeight:'60vh', overflowY:'auto' }}>
          {loading ? (
            <div style={{ textAlign:'center', color:'#9CA3AF', padding:28 }}>⏳ Loading students…</div>
          ) : roster.length === 0 ? (
            <div style={{ textAlign:'center', color:'#9CA3AF', padding:28 }}>No students found for this class.</div>
          ) : (
            <div style={{ display:'grid', gap:8 }}>
              {roster.map((r, i) => {
                const o = opt(r.status);
                return (
                  <div key={r.student || i} style={{ display:'flex', alignItems:'center', gap:12, padding:'10px 12px', border:'1px solid #E5E7EB', borderRadius:12 }}>
                    <div style={{ width:34, height:34, borderRadius:'50%', background:'#EEF2FF', color:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:13, flexShrink:0 }}>
                      {(r.name || 'S')[0].toUpperCase()}
                    </div>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13, color:'#0B1F4A', whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{r.name}</div>
                      {r.rollNumber ? <div style={{ fontSize:11, color:'#9CA3AF' }}>Roll: {r.rollNumber}</div> : null}
                    </div>
                    {readOnly ? (
                      <span style={{ fontSize:11, fontWeight:700, padding:'5px 10px', borderRadius:8, background:o.bg, color:o.color, border:'1.5px solid '+o.border }}>{o.label}</span>
                    ) : (
                      <select
                        value={r.status}
                        disabled={savingId === r.student}
                        onChange={e => change(r.student, e.target.value)}
                        style={{ fontSize:12, fontWeight:700, padding:'6px 8px', borderRadius:8, cursor:'pointer', outline:'none', minWidth:130, background:o.bg, color:o.color, border:'1.5px solid '+o.border, textAlignLast:'center' }}
                      >
                        {OPTIONS.map(op => <option key={op.key} value={op.key} style={{ background:'#fff', color:'#111827' }}>{op.label}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}