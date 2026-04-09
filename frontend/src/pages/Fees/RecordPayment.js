// frontend/src/pages/Fees/RecordPayment.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n||0);
const METHODS = [
  { key:'cash',   label:'💵 Cash'   },
  { key:'upi',    label:'📱 UPI'    },
  { key:'bank',   label:'🏦 Bank'   },
  { key:'cheque', label:'📄 Cheque' },
  { key:'online', label:'🌐 Online' },
];
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function RecordPayment({ onNavigate }) {
  const now = new Date();
  const [classes,    setClasses]    = useState([]);
  const [students,   setStudents]   = useState([]);
  const [selected,   setSelected]   = useState(null); // StudentFee record
  const [classId,    setClassId]    = useState('');
  const [search,     setSearch]     = useState('');
  const [saving,     setSaving]     = useState(false);
  const [success,    setSuccess]    = useState(null);
  const [form, setForm] = useState({
    amount:'', method:'cash', transactionId:'',
    month: MONTHS[now.getMonth()], year: now.getFullYear(), remarks:'',
  });

  useEffect(() => { classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); }, []);

  useEffect(() => {
    if (!classId) { setStudents([]); setSelected(null); return; }
    feeAPI.getStudents({ classId, limit:200 }).then(r=>setStudents(r.data.data||[])).catch(()=>{});
  }, [classId]);

  const filtered = students.filter(s => !search || s.student?.user?.name?.toLowerCase().includes(search.toLowerCase()));
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const pending = selected?.pendingAmount || 0;

  const handlePay = async () => {
    if (!selected) return toast.error('Select a student first');
    if (!form.amount || parseFloat(form.amount)<=0) return toast.error('Enter a valid amount');
    if (parseFloat(form.amount) > pending) return toast.error(`Amount cannot exceed pending amount (${fmt(pending)})`);
    setSaving(true);
    try {
      const res = await feeAPI.recordPayment({
        studentId:     selected.student?._id || selected.student,
        amount:        parseFloat(form.amount),
        method:        form.method,
        transactionId: form.transactionId||undefined,
        month:         form.month,
        year:          form.year,
        remarks:       form.remarks||undefined,
        classId:       selected.class?._id || selected.class,
        totalFees:     selected.totalFees,
      });
      toast.success('Payment recorded successfully!');
      setSuccess({ student: selected.student?.user?.name, amount: parseFloat(form.amount), receipt: res.data?.data?.receiptNumber || res.data?.receiptNumber });
      setSelected(null);
      setForm({ amount:'', method:'cash', transactionId:'', month:MONTHS[now.getMonth()], year:now.getFullYear(), remarks:'' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to record payment'); }
    finally { setSaving(false); }
  };

  const INP = { width:'100%', padding:'10px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:6, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };

  return (
    <div>
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">💳 Record Payment</h2>
          <p className="text-sm text-muted">Select a student and enter payment details</p>
        </div>
      </div>

      {success && (
        <div style={{ background:'#F0FDF4', border:'2px solid #22C55E', borderRadius:14, padding:'20px 24px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
          <div style={{ fontSize:36 }}>✅</div>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:16, fontWeight:800, color:'#15803D' }}>Payment Recorded!</div>
            <div style={{ fontSize:13, color:'#16A34A', marginTop:3 }}>
              {success.student} · {fmt(success.amount)}
              {success.receipt && <span style={{marginLeft:10, fontSize:12, color:'#6B7280'}}>Receipt: #{success.receipt}</span>}
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {success.receipt && (
              <button onClick={async () => {
                const token = localStorage.getItem('token');
                const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
                const res   = await fetch(`${base}/fees/receipt/${success.receipt}/pdf`, { headers:{ Authorization:`Bearer ${token}` } });
                const blob  = await res.blob();
                const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download=`receipt-${success.receipt}.pdf`; a.click();
                toast.success('Receipt downloaded');
              }} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
                ⬇ Receipt
              </button>
            )}
            <button onClick={()=>setSuccess(null)} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#fff', border:'1px solid #E5E7EB', cursor:'pointer' }}>
              New Payment
            </button>
          </div>
        </div>
      )}

      <div style={{ display:'grid', gridTemplateColumns:'1fr 360px', gap:20, alignItems:'start' }}>

        {/* Student selector */}
        <div className="card" style={{ padding:22 }}>
          <div style={{ fontWeight:700, fontSize:15, marginBottom:16, color:'#0B1F4A' }}>1. Select Student</div>
          <div style={{ display:'flex', gap:10, marginBottom:14 }}>
            <div style={{ flex:1 }}>
              <label style={LBL}>Class</label>
              <select value={classId} onChange={e=>{ setClassId(e.target.value); setSelected(null); setSearch(''); }} style={INP}>
                <option value="">— Select Class —</option>
                {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
              </select>
            </div>
            <div style={{ flex:1 }}>
              <label style={LBL}>Search Student</label>
              <input placeholder="Type name…" value={search} onChange={e=>setSearch(e.target.value)} style={INP} disabled={!classId} />
            </div>
          </div>

          {filtered.length > 0 ? (
            <div style={{ maxHeight:340, overflowY:'auto', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
              {filtered.map((r,i) => {
                const isSel = selected?._id === r._id;
                return (
                  <div key={r._id} onClick={() => setSelected(r)} style={{
                    display:'flex', alignItems:'center', gap:12, padding:'12px 14px',
                    cursor:'pointer', background: isSel?'#EFF6FF':'#fff',
                    borderBottom: i<filtered.length-1?'1px solid #F3F4F6':'none',
                    borderLeft: isSel?'3px solid #1D4ED8':'3px solid transparent',
                    transition:'all 0.15s',
                  }}>
                    <div style={{ width:36, height:36, borderRadius:10, background:isSel?'#1D4ED8':'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:14, fontWeight:900, color:isSel?'#fff':'#6B7280', flexShrink:0 }}>
                      {r.student?.user?.name?.split(' ').map(n=>n[0]).join('').toUpperCase().slice(0,2)||'?'}
                    </div>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:13, fontWeight:700, color:isSel?'#1D4ED8':'#111827' }}>{r.student?.user?.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>Adm: {r.student?.admissionNumber||'—'}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:12, fontWeight:800, color: r.pendingAmount>0?'#DC2626':'#16A34A' }}>{fmt(r.pendingAmount)} pending</div>
                      <div style={{ fontSize:10, color:'#9CA3AF' }}>Paid: {fmt(r.paidAmount)}</div>
                    </div>
                  </div>
                );
              })}
            </div>
          ) : classId ? (
            <div style={{ textAlign:'center', padding:'24px', color:'#9CA3AF', fontSize:13 }}>
              {search ? 'No students match your search' : 'No students with pending dues'}
            </div>
          ) : (
            <div style={{ textAlign:'center', padding:'24px', color:'#9CA3AF', fontSize:13 }}>
              👆 Select a class to see students
            </div>
          )}
        </div>

        {/* Payment form */}
        <div>
          <div className="card" style={{ padding:22 }}>
            <div style={{ fontWeight:700, fontSize:15, marginBottom:16, color:'#0B1F4A' }}>2. Payment Details</div>

            {selected ? (
              <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:12, padding:'14px 16px', marginBottom:16 }}>
                <div style={{ fontSize:14, fontWeight:800, color:'#fff' }}>{selected.student?.user?.name}</div>
                <div style={{ fontSize:11, color:'rgba(255,255,255,0.5)', marginTop:3 }}>{selected.class?.name} {selected.class?.section||''}</div>
                <div style={{ display:'flex', gap:12, marginTop:10 }}>
                  <div><div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Total</div><div style={{fontSize:14,fontWeight:900,color:'#fff'}}>{fmt(selected.totalFees)}</div></div>
                  <div><div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Paid</div><div style={{fontSize:14,fontWeight:900,color:'#34D399'}}>{fmt(selected.paidAmount)}</div></div>
                  <div><div style={{fontSize:9,color:'rgba(255,255,255,0.4)',textTransform:'uppercase',letterSpacing:'0.5px'}}>Pending</div><div style={{fontSize:14,fontWeight:900,color:'#FCA5A5'}}>{fmt(selected.pendingAmount)}</div></div>
                </div>
              </div>
            ) : (
              <div style={{ textAlign:'center', padding:'20px', background:'#F9FAFB', borderRadius:10, marginBottom:16, color:'#9CA3AF', fontSize:13 }}>
                ← Select a student first
              </div>
            )}

            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              <div>
                <label style={LBL}>Amount (₹) *</label>
                <input type="number" value={form.amount} onChange={e=>set('amount',e.target.value)} placeholder={pending>0?`Max ₹${pending.toLocaleString('en-IN')}`:'0'} style={INP} disabled={!selected} />
                {pending>0 && (
                  <div style={{ display:'flex', gap:5, marginTop:6, flexWrap:'wrap' }}>
                    {[pending, Math.ceil(pending/4), Math.ceil(pending/2)].filter((v,i,a)=>v>0&&a.indexOf(v)===i).map(v=>(
                      <button key={v} onClick={()=>set('amount',v)} style={{ fontSize:11, padding:'4px 8px', borderRadius:6, border:'1px solid #E5E7EB', background:'#F9FAFB', cursor:'pointer', fontWeight:600 }}>
                        ₹{v.toLocaleString('en-IN')}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div>
                <label style={LBL}>Payment Method</label>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6 }}>
                  {METHODS.map(m=>(
                    <button key={m.key} onClick={()=>set('method',m.key)} style={{
                      padding:'8px 10px', borderRadius:8, fontSize:12, fontWeight:700, cursor:'pointer',
                      border:`1.5px solid ${form.method===m.key?'#1D4ED8':'#E5E7EB'}`,
                      background: form.method===m.key?'#EFF6FF':'#fff',
                      color: form.method===m.key?'#1D4ED8':'#6B7280',
                      textAlign:'center',
                    }}>{m.label}</button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={LBL}>Month</label>
                  <select value={form.month} onChange={e=>set('month',e.target.value)} style={INP}>
                    {MONTHS.map(m=><option key={m} value={m}>{m}</option>)}
                  </select>
                </div>
                <div>
                  <label style={LBL}>Year</label>
                  <select value={form.year} onChange={e=>set('year',e.target.value)} style={INP}>
                    {[2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
                  </select>
                </div>
              </div>

              <div>
                <label style={LBL}>Transaction ID / Ref</label>
                <input value={form.transactionId} onChange={e=>set('transactionId',e.target.value)} placeholder="Optional" style={INP} />
              </div>

              <div>
                <label style={LBL}>Remarks</label>
                <input value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional note" style={INP} />
              </div>

              <button onClick={handlePay} disabled={saving||!selected} style={{
                padding:'13px', borderRadius:10, fontWeight:800, fontSize:14,
                background: saving||!selected?'#9CA3AF':'linear-gradient(135deg,#1D4ED8,#2563EB)',
                color:'#fff', border:'none', cursor: saving||!selected?'not-allowed':'pointer',
                display:'flex', alignItems:'center', justifyContent:'center', gap:8,
              }}>
                {saving ? <><div style={{width:16,height:16,border:'2px solid rgba(255,255,255,0.4)',borderTopColor:'#fff',borderRadius:'50%',animation:'spin 0.7s linear infinite'}}/> Recording…</> : '💳 Record Payment'}
              </button>
            </div>
          </div>
        </div>
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}