/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Fees/FeeDefaulters.js
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { classAPI } from '../../utils/api';
import feeAPI from '../../utils/feeAPI';

const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

export default function FeeDefaulters() {
  const [classes,    setClasses]    = useState([]);
  const [classId,    setClassId]    = useState('all');
  const [defaulters, setDefaulters] = useState([]);
  const [loading,    setLoading]    = useState(false);
  const [search,     setSearch]     = useState('');
  const [sortCol,    setSortCol]    = useState('pending');
  const [sortDir,    setSortDir]    = useState('desc');
  const [minAmount,  setMinAmount]  = useState('');

  useEffect(()=>{ classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); },[]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { status:'pending' };
      if (classId!=='all') params.classId = classId;
      const r = await feeAPI.getStudentsFees(params);
      const list = (r.data.data||[]).filter(s=>(s.pendingAmount||0)>0);
      setDefaulters(list);
    } catch { toast.error('Failed to load defaulters'); }
    finally { setLoading(false); }
  }, [classId]);

  useEffect(()=>{ load(); },[load]);

  const handleSort = col => {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('desc'); }
  };

  const filtered = defaulters
    .filter(s=>{
      const name = s.student?.user?.name||'';
      const matchSearch = !search || name.toLowerCase().includes(search.toLowerCase());
      const matchMin    = !minAmount || (s.pendingAmount||0) >= Number(minAmount);
      return matchSearch && matchMin;
    })
    .sort((a,b)=>{
      let av = sortCol==='name' ? (a.student?.user?.name||'') : (a[sortCol]||0);
      let bv = sortCol==='name' ? (b.student?.user?.name||'') : (b[sortCol]||0);
      if (av<bv) return sortDir==='asc'?-1:1;
      if (av>bv) return sortDir==='asc'?1:-1;
      return 0;
    });

  const totalPending = filtered.reduce((a,s)=>a+(s.pendingAmount||0),0);

  const copyTable = () => {
    const txt = filtered.map(s=>`${s.student?.user?.name}\t${s.student?.class?.name||''}\t${s.student?.rollNumber||''}\t${s.student?.parentPhone||''}\t${fmt(s.pendingAmount)}`).join('\n');
    navigator.clipboard.writeText(txt).then(()=>toast.success('Copied!'));
  };

  const printDefaulters = () => {
    const rows = filtered.map((s,i)=>`<tr style="background:${i%2?'#fff':'#fafafa'}">
      <td>${i+1}</td>
      <td style="font-weight:600">${s.student?.user?.name||'—'}</td>
      <td>${s.student?.class?.name||''} ${s.student?.class?.section||''}</td>
      <td>${s.student?.rollNumber||'—'}</td>
      <td>${s.student?.parentPhone||'—'}</td>
      <td style="font-weight:700">${fmt(s.totalFees||0)}</td>
      <td style="color:#16A34A;font-weight:600">${fmt((s.totalFees||0)-(s.pendingAmount||0))}</td>
      <td style="color:#DC2626;font-weight:700">${fmt(s.pendingAmount||0)}</td>
    </tr>`).join('');

    const html = `<!DOCTYPE html><html><head><title>Fee Defaulters</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{font-family:Arial;padding:24px}
    h2{color:#0B1F4A;margin-bottom:4px}p{color:#666;font-size:12px;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;font-size:12px}
    th{background:#0B1F4A;color:#fff;padding:8px 10px;text-align:left;font-size:10px;text-transform:uppercase}
    td{padding:7px 10px;border-bottom:1px solid #eee}
    .total{background:#FEF2F2;font-weight:700;color:#DC2626}
    .footer{margin-top:20px;font-size:11px;color:#999;text-align:right}
    </style></head><body>
    <h2>Fee Defaulters Report — The Future Step School</h2>
    <p>Generated: ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · Total Pending: ${fmt(totalPending)}</p>
    <table>
      <thead><tr><th>#</th><th>Student</th><th>Class</th><th>Roll</th><th>Parent Phone</th><th>Total Fees</th><th>Paid</th><th>Pending</th></tr></thead>
      <tbody>${rows}
        <tr class="total"><td colspan="7" style="text-align:right;padding:10px">Total Pending</td><td style="padding:10px">${fmt(totalPending)}</td></tr>
      </tbody>
    </table>
    <div class="footer">This is a system generated report</div>
    </body></html>`;
    const w=window.open('','_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),400);
  };

  const SI = col => sortCol===col ? (sortDir==='asc'?'↑':'↓') : '↕';
  const BTN = { padding:'5px 14px', borderRadius:6, border:'1px solid #D1D5DB', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' };
  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#0B1F4A', margin:0 }}>⚠️ Fee Defaulters</h2>
        <p style={{ fontSize:13, color:'#9CA3AF', marginTop:4 }}>Students with pending fee payments</p>
      </div>

      {/* Summary */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:12, marginBottom:20 }}>
        {[
          { label:'Total Defaulters', val:filtered.length,       color:'#DC2626', bg:'#FEF2F2', icon:'⚠️' },
          { label:'Total Pending',    val:fmt(totalPending),     color:'#D97706', bg:'#FFFBEB', icon:'💰' },
          { label:'Avg Pending',      val:fmt(filtered.length?Math.round(totalPending/filtered.length):0), color:'#7C3AED', bg:'#EDE9FE', icon:'📊' },
          { label:'Classes Affected', val:new Set(filtered.map(s=>s.student?.class?._id)).size, color:'#0891B2', bg:'#F0F9FF', icon:'🏫' },
        ].map(s=>(
          <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'14px 16px', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:24 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:10, color:s.color, fontWeight:700 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:16 }}>
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="all">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search student…" style={SEL}/>
        <input type="number" value={minAmount} onChange={e=>setMinAmount(e.target.value)} placeholder="Min pending ₹" style={{ ...SEL, width:140 }}/>
        <div style={{ marginLeft:'auto', display:'flex', gap:6 }}>
          <button style={BTN} onClick={copyTable}>Copy</button>
          <button style={{ ...BTN, background:'#DC2626', color:'#fff', border:'none' }} onClick={printDefaulters}>🖨️ Print</button>
        </div>
      </div>

      {/* Table */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading defaulters…</div>
      ) : (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {[['','#'],['name','Student'],['','Class'],['','Roll No'],['','Parent Phone'],['totalFees','Total Fees'],['','Paid'],['pendingAmount','Pending ↓']].map(([k,h])=>(
                  <th key={h} onClick={k?()=>handleSort(k):undefined}
                    style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', cursor:k?'pointer':'default', whiteSpace:'nowrap' }}>
                    {h} {k&&<span style={{ opacity:0.5 }}>{SI(k)}</span>}
                  </th>
                ))}
                <th style={{ padding:'11px 14px', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>Action</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length===0 ? (
                <tr><td colSpan={9} style={{ textAlign:'center', padding:48, color:'#16A34A', fontWeight:700 }}>
                  🎉 No defaulters found! All fees are cleared.
                </td></tr>
              ) : filtered.map((s,i)=>{
                const paid = (s.totalFees||0) - (s.pendingAmount||0);
                const pct  = s.totalFees>0 ? Math.round((paid/s.totalFees)*100) : 0;
                const urgency = s.pendingAmount > 10000 ? '#DC2626' : s.pendingAmount > 5000 ? '#D97706' : '#92400E';
                return (
                  <tr key={s._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#FEF2F2'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, color:'#111827' }}>
                      {s.student?.user?.name||'—'}
                      <div style={{ width:`${pct}%`, height:3, background:'#16A34A', borderRadius:2, marginTop:4, maxWidth:80 }}/>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{s.student?.class?.name||'—'} {s.student?.class?.section||''}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{s.student?.rollNumber||'—'}</td>
                    <td style={{ padding:'10px 14px', color:'#374151', fontFamily:'monospace', fontSize:12 }}>{s.student?.parentPhone||'—'}</td>
                    <td style={{ padding:'10px 14px' }}>{fmt(s.totalFees||0)}</td>
                    <td style={{ padding:'10px 14px', color:'#166534', fontWeight:600 }}>{fmt(paid)}</td>
                    <td style={{ padding:'10px 14px', fontWeight:800, color:urgency, fontSize:14 }}>{fmt(s.pendingAmount||0)}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                        <button onClick={()=>{ const ph=(s.student?.parentPhone||s.student?.user?.phone||'').replace(/\D/g,'').replace(/^0/,'91'); if(!ph){toast.error('No phone number');return;} const msg=encodeURIComponent('Dear Parent, Fees pending: '+fmt(s.pendingAmount)+' for '+s.student?.user?.name+'. Please clear dues at the earliest. - The Future Step School'); window.open('https://wa.me/'+ph+'?text='+msg,'_blank'); }}
                          style={{ padding:'4px 10px', borderRadius:6, border:'none', background:'#DCFCE7', color:'#166534', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                          💬 WhatsApp
                        </button>
                        <button onClick={()=>{ navigator.clipboard.writeText('Dear Parent, Fees pending: '+fmt(s.pendingAmount)+' for '+s.student?.user?.name+'. Please clear dues. - The Future Step School'); toast.success('Message copied!'); }}
                          style={{ padding:'4px 10px', borderRadius:6, border:'none', background:'#EFF6FF', color:'#1D4ED8', fontSize:11, fontWeight:700, cursor:'pointer' }}>
                          📋 Copy
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
              {filtered.length > 0 && (
                <tr style={{ background:'#0B1F4A' }}>
                  <td colSpan={7} style={{ padding:'11px 14px', color:'#fff', fontWeight:700, textAlign:'right' }}>Total Pending</td>
                  <td style={{ padding:'11px 14px', color:'#FCA5A5', fontWeight:900, fontSize:16 }}>{fmt(totalPending)}</td>
                  <td></td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}