// frontend/src/pages/Fees/FeesPaidSlip.js
// Search fee records by month + student → view printable slip

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { studentAPI, classAPI } from '../../utils/api';
import PrintableReceipt from '../../components/fees/PrintableReceipt';

const fmt = n => `₹${(n||0).toLocaleString('en-IN')}`;

export default function FeesPaidSlip() {
  // Stored as 4-digit year string (e.g. "2026") — was previously YYYY-MM.
  const [feesYear,    setFeesYear]    = useState(String(new Date().getFullYear()));
  const [classes,     setClasses]     = useState([]);
  const [classFilter, setClassFilter] = useState('');
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [feeRecord,   setFeeRecord]   = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [viewReceipt, setViewReceipt] = useState(null);     // currently-open receipt object
  const [loadingRcp,  setLoadingRcp]  = useState(false);

  const openReceipt = async (receiptNumber) => {
    setLoadingRcp(true);
    try {
      const r = await feeAPI.getReceipt(receiptNumber);
      setViewReceipt(r.data.data);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Could not load receipt');
    } finally { setLoadingRcp(false); }
  };

  // Class list for the filter dropdown
  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  // When a class is picked, preload that class's students so the user can pick
  // one without typing; typing then narrows within the chosen class.
  useEffect(() => {
    if (!classFilter) { setSuggestions([]); return; }
    if (query.length >= 1) return;   // typing takes over below
    studentAPI.getAll({ class: classFilter, limit: 500 })
      .then(r => {
        const list = (r.data.data || [])
          .filter(s => String(s.class?._id || s.class) === String(classFilter));
        setSuggestions(list);
      })
      .catch(() => setSuggestions([]));
  }, [classFilter, query]);

  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return; }
    const t = setTimeout(async () => {
      try {
        const params = { search: query };
        if (classFilter) params.class = classFilter;
        const r = await studentAPI.getAll(params);
        let list = r.data.data || [];
        // Belt-and-braces: never show students outside the chosen class
        if (classFilter) list = list.filter(s => String(s.class?._id || s.class) === String(classFilter));
        setSuggestions(list.slice(0, 8));
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(t);
  }, [query]);

  const selectStudent = (s) => {
    setSelected(s);
    setQuery(`${s.rollNumber} - ${s.user?.name}`);
    setSuggestions([]);
  };

  const handleSubmit = async () => {
    if (!selected) return toast.error('Select a student');
    setLoading(true);
    try {
      const r = await feeAPI.getStudentFee(selected._id);
      setFeeRecord(r.data.data);
    } catch { toast.error('No fee record found for this student'); setFeeRecord(null); }
    finally { setLoading(false); }
  };

  // Filter payment history to entries from the selected year. p.month is like "April 2026".
  const yearLabel = feesYear || '';
  const payments = feeRecord?.paymentHistory?.filter(p => !yearLabel || (p.month || '').includes(yearLabel)) || [];

  const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none', background:'#fff' };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 className="font-display text-2xl text-ink">🧾 Fees Paid Slip</h2>
        <p className="text-sm text-muted mt-0.5">Search paid fee records and print receipts</p>
      </div>

      {/* Search form */}
      <div className="card" style={{ padding:'24px', marginBottom:20, maxWidth:600 }}>
        <div style={{ display:'flex', gap:14, flexDirection:'column' }}>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', marginBottom:6 }}>Fees Year *</div>
            <select value={feesYear} onChange={e=>setFeesYear(e.target.value)} style={INP}>
              {(() => {
                const now = new Date().getFullYear();
                // Show 5 years back to 2 years ahead — covers reissued slips and advance payments
                const years = [];
                for (let y = now - 5; y <= now + 2; y++) years.push(y);
                return years.reverse().map(y => <option key={y} value={String(y)}>{y}</option>);
              })()}
            </select>
          </div>
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', marginBottom:6 }}>Filter by Class</div>
            <select value={classFilter}
              onChange={e => { setClassFilter(e.target.value); setQuery(''); setSelected(null); }}
              style={INP}>
              <option value="">All classes</option>
              {classes.map(c => (
                <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>
              ))}
            </select>
          </div>
          <div style={{ position:'relative' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', marginBottom:6 }}>Search Student *</div>
            <input value={query} onChange={e=>{ setQuery(e.target.value); setSelected(null); }}
              placeholder={classFilter ? 'Pick from the list or type to narrow…' : 'Search student by name or roll…'}
              style={INP}/>
            {suggestions.length > 0 && (
              <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:50, marginTop:4, maxHeight:280, overflowY:'auto' }}>
                {suggestions.map(s=>(
                  <div key={s._id} onClick={()=>selectStudent(s)}
                    style={{ padding:'10px 16px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F3F4F6' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#EFF6FF'}
                    onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                    <span style={{ fontWeight:600 }}>{s.rollNumber} – {s.user?.name}</span>
                    <span style={{ color:'#9CA3AF', marginLeft:8 }}>– {s.class?.name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
          <button onClick={handleSubmit} disabled={loading}
            style={{ padding:'11px', borderRadius:9, fontSize:14, fontWeight:700, background:'#D97706', color:'#fff', border:'none', cursor:'pointer' }}>
            {loading ? '⏳ Loading…' : '📋 View Record'}
          </button>
        </div>
      </div>

      {/* Results */}
      {feeRecord && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {/* Student header */}
          <div style={{ background:'#0B1F4A', padding:'16px 24px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
            {[
              { label:'Student', value:feeRecord.student?.user?.name },
              { label:'Class', value:`${feeRecord.class?.name||''} ${feeRecord.class?.section||''}` },
              { label:'Total Fees', value:fmt(feeRecord.totalFees) },
              { label:'Balance', value:fmt(feeRecord.pendingAmount||0), color:feeRecord.pendingAmount>0?'#FCA5A5':'#86EFAC' },
            ].map(f=>(
              <div key={f.label}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{f.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:f.color||'#fff' }}>{f.value}</div>
              </div>
            ))}
          </div>

          {/* Payment history table */}
          <div style={{ padding:'20px 24px' }}>
            <div style={{ marginBottom:14, fontWeight:700, fontSize:15 }}>
              Payment History {yearLabel && `— ${yearLabel}`}
              <span style={{ fontSize:11, fontWeight:500, color:'#6B7280', marginLeft:8 }}>
                Click "View" to open the printable receipt
              </span>
            </div>

            {!payments.length ? (
              <div style={{ textAlign:'center', padding:'40px', color:'#9CA3AF' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📭</div>
                <div>No payments found for {yearLabel || 'this year'}</div>
              </div>
            ) : (
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                <thead>
                  <tr style={{ background:'#0B1F4A' }}>
                    {['Sr#','Receipt No','Date','Month','Amount','Method','Balance','Action'].map(h=>(
                      <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {payments.map((p,i)=>(
                    <tr key={i} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{i+1}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#1D4ED8' }}>{p.receiptNumber}</td>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{new Date(p.paidOn).toLocaleDateString('en-IN')}</td>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{p.month||'—'}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(p.amount)}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, background:'#EFF6FF', color:'#1D4ED8', padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>{p.method||'cash'}</span>
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:700, color:'#DC2626' }}>
                        {fmt((feeRecord.totalFees||0) - payments.slice(0,i+1).reduce((s,x)=>s+x.amount,0))}
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        <button onClick={() => openReceipt(p.receiptNumber)} disabled={loadingRcp}
                          style={{ fontSize:11, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                          {loadingRcp ? '…' : '👁 View'}
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}

      {/* Receipt modal */}
      {viewReceipt && (
        <PrintableReceipt receipt={viewReceipt} onClose={() => setViewReceipt(null)} />
      )}
    </div>
  );
}