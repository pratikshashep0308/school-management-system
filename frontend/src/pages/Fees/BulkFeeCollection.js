/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Fees/BulkFeeCollection.js
// Collect fees for entire class in one go
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { classAPI } from '../../utils/api';
import feeAPI from '../../utils/feeAPI';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NOW = new Date();
const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

export default function BulkFeeCollection() {
  const [classes,   setClasses]   = useState([]);
  const [classId,   setClassId]   = useState('');
  const [month,     setMonth]     = useState(NOW.getMonth()+1);
  const [year,      setYear]      = useState(NOW.getFullYear());
  const [students,  setStudents]  = useState([]);
  const [selected,  setSelected]  = useState({});  // studentId → {amount, method, checked}
  const [loading,   setLoading]   = useState(false);
  const [saving,    setSaving]    = useState(false);
  const [search,    setSearch]    = useState('');

  useEffect(()=>{ classAPI.getAll().then(r=>{ const cls=r.data.data||[]; setClasses(cls); if(cls.length) setClassId(cls[0]._id); }).catch(()=>{}); },[]);

  const loadStudents = async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const r = await feeAPI.getStudentsFees({ classId });
      const list = r.data.data || [];
      setStudents(list);
      // Pre-fill defaults
      const defaults = {};
      list.forEach(s => {
        defaults[s._id] = { checked: s.pendingAmount > 0, amount: s.pendingAmount || 0, method: 'CASH' };
      });
      setSelected(defaults);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  };

  useEffect(()=>{ if(classId) loadStudents(); },[classId, month, year]);

  const toggleAll = (val) => {
    const next = {...selected};
    filtered.forEach(s=>{ next[s._id] = {...next[s._id], checked: val}; });
    setSelected(next);
  };

  const collectAll = async () => {
    const toCollect = students.filter(s => selected[s._id]?.checked && selected[s._id]?.amount > 0);
    if (!toCollect.length) return toast.error('Select at least one student');
    setSaving(true);
    let success = 0, failed = 0;
    for (const s of toCollect) {
      try {
        await feeAPI.recordPayment({
          studentId: s.student?._id || s._id,
          classId, month, year,
          amount: Number(selected[s._id].amount),
          method: selected[s._id].method,
          totalFees: s.totalFees || 0,
        });
        success++;
      } catch { failed++; }
    }
    setSaving(false);
    if (success) toast.success(`✅ ${success} payments recorded`);
    if (failed)  toast.error(`❌ ${failed} failed`);
    loadStudents();
  };

  const filtered = students.filter(s => {
    const name = s.student?.user?.name || s.name || '';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  const checkedCount = Object.values(selected).filter(v=>v?.checked).length;
  const totalAmount  = students.filter(s=>selected[s._id]?.checked).reduce((a,s)=>a+(Number(selected[s._id]?.amount)||0),0);

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:18, fontWeight:800, color:'#0B1F4A', margin:0 }}>🏫 Bulk Fee Collection</h2>
        <p style={{ fontSize:13, color:'#9CA3AF', marginTop:4 }}>Collect fees for entire class at once</p>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20, background:'#F8FAFC', padding:16, borderRadius:12, border:'1px solid #E5E7EB' }}>
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search student…"
          style={{ ...SEL, minWidth:180 }}/>
      </div>

      {/* Summary bar */}
      {students.length > 0 && (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(150px,1fr))', gap:10, marginBottom:16 }}>
          {[
            { label:'Total Students', val:students.length,                                              color:'#1D4ED8', bg:'#EFF6FF' },
            { label:'Pending',        val:students.filter(s=>s.pendingAmount>0).length,                 color:'#DC2626', bg:'#FEF2F2' },
            { label:'Paid',           val:students.filter(s=>(s.pendingAmount||0)===0).length,          color:'#166534', bg:'#DCFCE7' },
            { label:'Selected',       val:checkedCount,                                                  color:'#7C3AED', bg:'#EDE9FE' },
            { label:'Total Amount',   val:fmt(totalAmount),                                              color:'#0891B2', bg:'#F0F9FF' },
          ].map(s=>(
            <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'10px 14px', textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:900, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:10, color:s.color, fontWeight:700, marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>
      )}

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>⏳ Loading students…</div>
      ) : students.length === 0 ? (
        <div style={{ textAlign:'center', padding:40, color:'#9CA3AF', background:'#fff', borderRadius:12, border:'1px solid #E5E7EB' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>🏫</div>
          <div style={{ fontWeight:700 }}>Select a class to load students</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          {/* Toolbar */}
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', alignItems:'center', gap:10, flexWrap:'wrap' }}>
            <label style={{ display:'flex', alignItems:'center', gap:6, fontSize:13, cursor:'pointer', fontWeight:600 }}>
              <input type="checkbox" onChange={e=>toggleAll(e.target.checked)}
                checked={filtered.every(s=>selected[s._id]?.checked)} style={{ width:16, height:16 }}/>
              Select All
            </label>
            <span style={{ fontSize:12, color:'#9CA3AF' }}>{checkedCount} of {students.length} selected</span>
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <button onClick={()=>toggleAll(false)}
                style={{ padding:'6px 14px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, cursor:'pointer', color:'#374151' }}>
                Clear All
              </button>
              <button onClick={collectAll} disabled={saving || checkedCount===0}
                style={{ padding:'8px 20px', borderRadius:9, background: checkedCount===0?'#E5E7EB':'#16A34A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor: checkedCount===0?'not-allowed':'pointer', opacity:saving?0.7:1 }}>
                {saving ? '⏳ Processing…' : `💳 Collect ${checkedCount} Payments (${fmt(totalAmount)})`}
              </button>
            </div>
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['','Student','Roll No','Total Fees','Paid','Balance','Amount to Collect','Method'].map(h=>(
                  <th key={h} style={{ padding:'10px 12px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((s,i) => {
                const name    = s.student?.user?.name || s.name || '—';
                const rollNo  = s.student?.rollNumber || '—';
                const pending = s.pendingAmount || 0;
                const paid    = (s.totalFees||0) - pending;
                const sel     = selected[s._id] || { checked:false, amount:pending, method:'CASH' };
                const isPaid  = pending === 0;

                return (
                  <tr key={s._id} style={{ borderBottom:'1px solid #F3F4F6', background: isPaid ? '#F0FDF4' : i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 12px' }}>
                      <input type="checkbox" checked={sel.checked} disabled={isPaid}
                        onChange={e=>setSelected(p=>({...p,[s._id]:{...sel,checked:e.target.checked}}))}
                        style={{ width:16, height:16, cursor: isPaid?'not-allowed':'pointer' }}/>
                    </td>
                    <td style={{ padding:'10px 12px', fontWeight:600 }}>{name}</td>
                    <td style={{ padding:'10px 12px', color:'#6B7280' }}>{rollNo}</td>
                    <td style={{ padding:'10px 12px' }}>{fmt(s.totalFees||0)}</td>
                    <td style={{ padding:'10px 12px', color:'#166534', fontWeight:600 }}>{fmt(paid)}</td>
                    <td style={{ padding:'10px 12px', color: pending>0?'#DC2626':'#166534', fontWeight:700 }}>
                      {isPaid ? <span style={{ color:'#166534' }}>✅ Paid</span> : fmt(pending)}
                    </td>
                    <td style={{ padding:'10px 8px' }}>
                      <input type="number" value={sel.amount} disabled={!sel.checked || isPaid}
                        onChange={e=>setSelected(p=>({...p,[s._id]:{...sel,amount:Number(e.target.value)||0}}))}
                        style={{ width:100, padding:'6px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, fontSize:13, outline:'none', background: !sel.checked||isPaid?'#F3F4F6':'#fff' }}/>
                    </td>
                    <td style={{ padding:'10px 8px' }}>
                      <select value={sel.method} disabled={!sel.checked||isPaid}
                        onChange={e=>setSelected(p=>({...p,[s._id]:{...sel,method:e.target.value}}))}
                        style={{ padding:'6px 10px', border:'1.5px solid #E5E7EB', borderRadius:7, fontSize:12, background: !sel.checked||isPaid?'#F3F4F6':'#fff' }}>
                        {['CASH','BANK','UPI','CHEQUE','ONLINE'].map(m=><option key={m}>{m}</option>)}
                      </select>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}