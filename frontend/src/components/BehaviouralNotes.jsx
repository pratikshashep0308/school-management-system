import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { behaviouralNoteAPI } from '../utils/api';

/**
 * Behavioural Notes for Today + history.
 * Props:
 *   studentId : string
 *   canEdit   : boolean (staff true, student/parent false)
 */
const CATS = [
  { key: 'general',  label: 'General',  bg:'#EEF2FF', color:'#3730A3' },
  { key: 'positive', label: 'Positive', bg:'#DCFCE7', color:'#166534' },
  { key: 'concern',  label: 'Concern',  bg:'#FEE2E2', color:'#B91C1C' },
];

export default function BehaviouralNotes({ studentId, canEdit = false }) {
  const [today,    setToday]    = useState(null);
  const [note,     setNote]     = useState('');
  const [category, setCategory] = useState('general');
  const [history,  setHistory]  = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [saving,   setSaving]   = useState(false);
  const [showHistory, setShowHistory] = useState(false);

  const load = useCallback(async () => {
    if (!studentId) return;
    setLoading(true);
    try {
      const [t, h] = await Promise.all([
        behaviouralNoteAPI.getToday(studentId).catch(() => ({ data:{ data:null } })),
        behaviouralNoteAPI.getHistory(studentId).catch(() => ({ data:{ data:[] } })),
      ]);
      const td = t.data?.data || null;
      setToday(td);
      setNote(td?.note || '');
      setCategory(td?.category || 'general');
      setHistory(h.data?.data || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [studentId]);

  useEffect(() => { load(); }, [load]);

  const save = async () => {
    if (!note.trim()) { toast.error('Note cannot be empty'); return; }
    setSaving(true);
    try {
      await behaviouralNoteAPI.save({ studentId, note: note.trim(), category });
      toast.success('Behavioural note saved');
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save note');
    } finally { setSaving(false); }
  };

  const catStyle = (k) => CATS.find(c => c.key === k) || CATS[0];
  const todayStr = new Date().toLocaleDateString('en-IN', { weekday:'long', day:'numeric', month:'long', year:'numeric' });

  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:16, overflow:'hidden' }}>
      <div style={{ background:'#0B1F4A', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <div style={{ fontWeight:800, fontSize:14, color:'#fff' }}>📝 Behavioural Notes for Today</div>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.6)' }}>{todayStr}</div>
      </div>

      <div style={{ padding:18 }}>
        {loading ? (
          <div style={{ textAlign:'center', color:'#9CA3AF', padding:16, fontSize:13 }}>⏳ Loading…</div>
        ) : (
          <>
            {canEdit ? (
              <>
                <div style={{ display:'flex', gap:8, marginBottom:10, flexWrap:'wrap' }}>
                  {CATS.map(c => (
                    <button key={c.key} onClick={() => setCategory(c.key)}
                      style={{ fontSize:11, fontWeight:700, padding:'5px 12px', borderRadius:20, cursor:'pointer',
                        border: category===c.key ? '1.5px solid '+c.color : '1.5px solid #E5E7EB',
                        background: category===c.key ? c.bg : '#fff', color: category===c.key ? c.color : '#6B7280' }}>
                      {c.label}
                    </button>
                  ))}
                </div>
                <textarea
                  value={note}
                  onChange={e => setNote(e.target.value)}
                  rows={4}
                  placeholder="Write today's behavioural remark for this student…"
                  style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:12, fontSize:13, outline:'none', resize:'vertical', boxSizing:'border-box', fontFamily:'inherit' }}
                />
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10 }}>
                  <span style={{ fontSize:11, color:'#9CA3AF' }}>{today ? 'Editing today\u2019s note' : 'New note for today'}</span>
                  <button onClick={save} disabled={saving}
                    style={{ padding:'9px 22px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
                    {saving ? '⏳ Saving…' : (today ? '💾 Update Note' : '➕ Save Note')}
                  </button>
                </div>
              </>
            ) : (
              today ? (
                <div style={{ padding:'12px 14px', border:'1px solid #E5E7EB', borderRadius:12 }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:catStyle(today.category).bg, color:catStyle(today.category).color, textTransform:'uppercase' }}>{catStyle(today.category).label}</span>
                  <p style={{ fontSize:13, color:'#374151', marginTop:8, whiteSpace:'pre-wrap' }}>{today.note}</p>
                </div>
              ) : (
                <div style={{ textAlign:'center', color:'#9CA3AF', padding:16, fontSize:13 }}>No behavioural note for today.</div>
              )
            )}

            {/* History */}
            {history.length > 0 && (
              <div style={{ marginTop:16, borderTop:'1px solid #F3F4F6', paddingTop:12 }}>
                <button onClick={() => setShowHistory(s => !s)}
                  style={{ background:'none', border:'none', color:'#0B1F4A', fontSize:12, fontWeight:700, cursor:'pointer', padding:0 }}>
                  {showHistory ? '▾' : '▸'} Past notes ({history.length})
                </button>
                {showHistory && (
                  <div style={{ display:'grid', gap:8, marginTop:10 }}>
                    {history.map(h => (
                      <div key={h._id} style={{ padding:'10px 12px', border:'1px solid #E5E7EB', borderRadius:10 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
                          <span style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>{new Date(h.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}</span>
                          <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background:catStyle(h.category).bg, color:catStyle(h.category).color, textTransform:'uppercase' }}>{catStyle(h.category).label}</span>
                        </div>
                        <p style={{ fontSize:12.5, color:'#374151', margin:0, whiteSpace:'pre-wrap' }}>{h.note}</p>
                        {h.createdByName ? <p style={{ fontSize:10, color:'#9CA3AF', margin:'4px 0 0' }}>— {h.createdByName}</p> : null}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}