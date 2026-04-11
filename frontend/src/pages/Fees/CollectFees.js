// frontend/src/pages/Fees/CollectFees.js
// Only Half Yearly (5% off) and Yearly (10% off)
// Pre-fills amounts from assigned fees — editable
// Generates printable receipt

import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { studentAPI } from '../../utils/api';

const fmt = n => `₹${Math.round(n||0).toLocaleString('en-IN')}`;

const PERIODS = {
  halfyearly: { months:6,  discount:5,  label:'Half Yearly',     sub:'6 months fee',         badge:'Save 5%'  },
  yearly:     { months:12, discount:10, label:'Yearly / Annual', sub:'12 months — best value', badge:'Save 10%' },
};

const DEFAULT_FEE_ITEMS = [
  { key:'tuition',      label:'Tuition Fee',       amount:'' },
  { key:'admission',    label:'Admission Fee',      amount:'' },
  { key:'registration', label:'Registration Fee',   amount:'' },
  { key:'exam',         label:'Exam Fee',           amount:'' },
  { key:'transport',    label:'Transport Fee',      amount:'' },
  { key:'library',      label:'Library Fee',        amount:'' },
  { key:'sports',       label:'Sports Fee',         amount:'' },
  { key:'uniform',      label:'Uniform',            amount:'' },
  { key:'books',        label:'Books',              amount:'' },
  { key:'artMaterial',  label:'Art Material',       amount:'' },
  { key:'fine',         label:'Fine',               amount:'' },
  { key:'others',       label:'Others',             amount:'' },
  { key:'prevBalance',  label:'Previous Balance',   amount:'' },
  { key:'discount',     label:'Discount',           amount:'', isDiscount:true },
];

// ── Receipt Modal ─────────────────────────────────────────────────────────────
function ReceiptModal({ receipt, onClose }) {
  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.6)', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:700, maxHeight:'92vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.3)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 24px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <div>
            <h3 style={{ fontSize:17, fontWeight:700, margin:0, color:'#16A34A' }}>✅ Payment Successful</h3>
            <div style={{ fontSize:12, color:'#16A34A', marginTop:2 }}>{receipt.periodLabel} · {receipt.periodCovered} · #{receipt.receiptNumber}</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={()=>{
              const content = document.getElementById('printable-receipt').innerHTML;
              const win = window.open('','_blank','width=800,height=900');
              win.document.write(`
                <html><head><title>Fee Receipt</title>
                <style>
                  body { font-family: Arial, sans-serif; margin: 20px; color: #000; }
                  table { width:100%; border-collapse:collapse; font-size:13px; }
                  td,th { border:1px solid #ccc; padding:7px 10px; }
                  th { background:#f3f4f6; font-weight:700; }
                  @page { margin: 15mm; size: A4; }
                  @media print { body { margin:0; } }
                </style></head>
                <body>${content}</body></html>
              `);
              win.document.close();
              win.focus();
              setTimeout(()=>{ win.print(); win.close(); }, 500);
            }} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>🖨 Print</button>
            <button onClick={onClose} style={{ padding:'7px 16px', borderRadius:8, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer' }}>Close</button>
          </div>
        </div>

        <div id="printable-receipt" style={{ overflowY:'auto', flex:1, padding:'24px', fontFamily:'Arial, sans-serif' }}>
          <div style={{ textAlign:'center', marginBottom:16 }}>
            <div style={{ fontSize:20, fontWeight:900, color:'#0B1F4A' }}>The Future Step School</div>
            <div style={{ fontSize:12, color:'#6B7280' }}>Securing Future By Adaptive Learning</div>
            <div style={{ fontSize:14, fontWeight:700, color:'#D4522A', marginTop:10, borderBottom:'2px solid #D4522A', paddingBottom:6 }}>Fees Paid Receipt</div>
          </div>

          {receipt.periodMonths > 1 && (
            <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:13, color:'#1E40AF', fontWeight:600 }}>
              {receipt.periodLabel} — covers {receipt.periodMonths} months ({receipt.periodCovered}){receipt.discountPct > 0 ? ` · ${receipt.discountPct}% discount applied` : ''}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8, marginBottom:16, background:'#F8FAFC', borderRadius:10, padding:'12px 16px' }}>
            {[
              { label:'Registration No',   value:receipt.rollNumber },
              { label:'Serial No',         value:receipt.receiptNumber },
              { label:'Total Amount',      value:fmt(receipt.totalAmount), color:'#0B1F4A' },
              { label:'Your Amount',       value:fmt(receipt.deposit),     color:'#16A34A' },
              { label:'Student Name',      value:receipt.studentName },
              { label:'Date',              value:receipt.date },
              { label:'Deposit Amount',    value:fmt(receipt.deposit),     color:'#16A34A' },
              { label:'Balance',           value:fmt(receipt.balance),     color:receipt.balance>0?'#DC2626':'#16A34A' },
              { label:'Guardian Name',     value:receipt.parentName },
              { label:'Period',            value:receipt.periodLabel },
              { label:'Months Covered',    value:receipt.periodCovered },
              { label:'Class',             value:receipt.className },
            ].map(f=>(
              <div key={f.label}>
                <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600 }}>{f.label}</div>
                <div style={{ fontSize:13, fontWeight:700, color:f.color||'#111827', marginTop:2 }}>{f.value}</div>
              </div>
            ))}
          </div>

          <table style={{ width:'100%', borderCollapse:'collapse', marginBottom:14, fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F3F4F6' }}>
                <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB', width:40 }}>Sr.</th>
                <th style={{ padding:'8px 12px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB' }}>Particulars</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:100 }}>Per Month</th>
                <th style={{ padding:'8px 12px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:110 }}>Total</th>
              </tr>
            </thead>
            <tbody>
              {receipt.items.map((item,i)=>(
                <tr key={i}>
                  <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'center' }}>{i+1}</td>
                  <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB' }}>{item.label.toUpperCase()}{receipt.periodMonths>1?` × ${receipt.periodMonths}`:''}</td>
                  <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', color:'#6B7280' }}>{fmt(item.perMonth)}</td>
                  <td style={{ padding:'7px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:600 }}>{fmt(item.total)}</td>
                </tr>
              ))}
            </tbody>
            <tfoot>
              <tr style={{ background:'#F8FAFC' }}>
                <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>SUBTOTAL</td>
                <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>{fmt(receipt.subtotal)}</td>
              </tr>
              {receipt.discountAmt > 0 && (
                <tr style={{ background:'#F0FDF4' }}>
                  <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{receipt.periodLabel} Discount ({receipt.discountPct}%)</td>
                  <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>-{fmt(receipt.discountAmt)}</td>
                </tr>
              )}
              <tr style={{ background:'#EFF6FF' }}>
                <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#1E40AF' }}>TOTAL</td>
                <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:'#1E40AF' }}>{fmt(receipt.totalAmount)}</td>
              </tr>
              <tr>
                <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>DEPOSIT</td>
                <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700, color:'#16A34A' }}>{fmt(receipt.deposit)}</td>
              </tr>
              <tr style={{ background:receipt.balance>0?'#FEF2F2':'#F0FDF4' }}>
                <td colSpan={3} style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:700 }}>DUE-ABLE BALANCE</td>
                <td style={{ padding:'8px 12px', border:'1px solid #E5E7EB', textAlign:'right', fontWeight:900, fontSize:15, color:receipt.balance>0?'#DC2626':'#16A34A' }}>{fmt(receipt.balance)}</td>
              </tr>
            </tfoot>
          </table>

          {receipt.history?.length > 0 && (
            <>
              <div style={{ fontSize:13, fontWeight:700, marginBottom:8, color:'#0B1F4A' }}>Fee Submission Statement Of <span style={{ color:'#D4522A' }}>{receipt.studentName}</span></div>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12, marginBottom:16 }}>
                <thead>
                  <tr style={{ background:'#F3F4F6' }}>
                    {['Sr#','Date','Period','Total','Deposit','Due'].map(h=>(
                      <th key={h} style={{ padding:'7px 10px', border:'1px solid #E5E7EB', fontWeight:700 }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {receipt.history.map((h,i)=>(
                    <tr key={i}>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'center' }}>{i+1}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB' }}>{h.date}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB' }}>{h.period}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right' }}>{fmt(h.total)}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right', color:'#16A34A' }}>{fmt(h.deposit)}</td>
                      <td style={{ padding:'6px 10px', border:'1px solid #E5E7EB', textAlign:'right', color:'#DC2626' }}>{fmt(h.due)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </>
          )}

          <div style={{ display:'flex', justifyContent:'space-between', marginTop:20, paddingTop:14, borderTop:'1px solid #E5E7EB', fontSize:12 }}>
            <div><div style={{ marginBottom:20 }}>Prepared By:</div><div style={{ color:'#1D4ED8', fontWeight:600 }}>The Future Step School</div></div>
            <div style={{ textAlign:'center' }}><div style={{ marginBottom:20 }}>Checked By:</div><div style={{ borderBottom:'1px solid #374151', minWidth:160 }}>&nbsp;</div></div>
            <div style={{ textAlign:'right' }}><div style={{ fontWeight:700 }}>Accounts Department</div><div style={{ color:'#6B7280' }}>The Future Step School</div></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function CollectFees() {
  const [query,       setQuery]       = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [selected,    setSelected]    = useState(null);
  const [feeRecord,   setFeeRecord]   = useState(null);
  const [assignments, setAssignments] = useState([]);
  const [feeItems,    setFeeItems]    = useState(DEFAULT_FEE_ITEMS.map(f=>({...f})));
  const [period,      setPeriod]      = useState('halfyearly');
  const [feesMonth,   setFeesMonth]   = useState('');
  const [payDate,     setPayDate]     = useState(new Date().toISOString().split('T')[0]);
  const [deposit,         setDeposit]         = useState('');
  const [customDiscount,  setCustomDiscount]  = useState('');
  const [method,      setMethod]      = useState('cash');
  const [transId,     setTransId]     = useState('');
  const [submitting,  setSubmitting]  = useState(false);
  const [receipt,     setReceipt]     = useState(null);

  const pd = PERIODS[period];
  // Reset custom discount when period changes
  React.useEffect(()=>{ setCustomDiscount(''); }, [period]);

  // Student search
  useEffect(() => {
    if (query.length < 1) { setSuggestions([]); return; }
    const timer = setTimeout(async () => {
      try {
        const r = await studentAPI.getAll({ search: query });
        setSuggestions(r.data.data?.slice(0,8) || []);
      } catch { setSuggestions([]); }
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  const selectStudent = async (student) => {
    setSelected(student);
    setQuery(`${student.rollNumber} - ${student.user?.name} - ${student.class?.name||''} ${student.class?.section||''}`);
    setSuggestions([]);
    try {
      const r = await feeAPI.getStudentFee(student._id);
      setFeeRecord(r.data.data);
      const asgn = r.data.assignments || [];
      setAssignments(asgn);

      // Pre-fill fee items directly from assignments
      if (asgn.length > 0) {
        // Build fee items from actual assignments - don't try to match keys
        const fromAssignments = asgn
          .filter(a => a.status !== 'paid')
          .map(a => ({
            key:        a._id,
            label:      a.feeType?.name || 'Fee',
            amount:     Math.round(a.pendingAmount || a.finalAmount || 0),
            assignmentId: a._id,
          }));
        // Also keep extra items for fine/others/discount/prevBalance
        const extras = [
          { key:'fine',        label:'Fine',             amount:0 },
          { key:'others',      label:'Others',           amount:0 },
          { key:'prevBalance', label:'Previous Balance', amount:0 },
          { key:'discount',    label:'Discount',         amount:0, isDiscount:true },
        ];
        setFeeItems([...fromAssignments, ...extras]);
        const total = fromAssignments.reduce((s,f)=>s+f.amount, 0);
        setDeposit(String(Math.round(total)));
      } else {
        // No assignments - show default empty items
        setFeeItems(DEFAULT_FEE_ITEMS.map(f=>({...f})));
      }
    } catch {
      setFeeRecord(null);
      setAssignments([]);
      setFeeItems(DEFAULT_FEE_ITEMS.map(f=>({...f})));
    }
  };

  // Build months covered
  const getMonthsCovered = () => {
    if (!feesMonth) return [];
    const [y,m] = feesMonth.split('-').map(Number);
    const months = [];
    for (let i = 0; i < pd.months; i++) {
      const d = new Date(y, m-1+i, 1);
      months.push(d.toLocaleString('default', { month:'long', year:'numeric' }));
    }
    return months;
  };

  const baseTotal = feeItems.reduce((s,f) => {
    const v = f.total !== undefined && f.total !== '' ? +f.total : ((+f.amount||0) * pd.months);
    return f.isDiscount ? s - v : s + v;
  }, 0);
  const subtotal = Math.max(0, baseTotal);
  const discAmt = customDiscount !== '' 
    ? Math.round(+customDiscount) 
    : Math.round(subtotal * (pd.discount / 100));
  const totalAmount = subtotal - discAmt;
  const dueBalance  = totalAmount - (+deposit||0);
  const months      = getMonthsCovered();

  const handleSubmit = async () => {
    if (!selected)               return toast.error('Please select a student');
    if (!feesMonth)              return toast.error('Please select starting month');
    if (!deposit || +deposit<=0) return toast.error('Enter deposit amount');
    setSubmitting(true);
    try {
      const [y] = feesMonth.split('-');
      const periodCovered = months.length === 1 ? months[0] : `${months[0]} – ${months[months.length-1]}`;

      const r = await feeAPI.recordPayment({
        studentId:     selected._id,
        classId:       selected.class?._id,
        amount:        +deposit,
        totalFees:     totalAmount,
        method,
        transactionId: transId,
        month:         periodCovered,
        year:          +y,
        remarks:       `${pd.label} plan · ${feeItems.filter(f=>f.amount>0).map(f=>`${f.label}:${f.amount}`).join(', ')}`,
      });

      const history = feeRecord?.paymentHistory || [];
      setReceipt({
        receiptNumber:  r.data.receiptNumber,
        studentName:    selected.user?.name,
        parentName:     selected.parentName || selected.fatherName || '—',
        className:      `${selected.class?.name||''} ${selected.class?.section||''}`.trim(),
        rollNumber:     selected.rollNumber,
        periodLabel:    pd.label,
        periodMonths:   pd.months,
        periodCovered,
        discountPct:    pd.discount,
        discountAmt:    discAmt,
        subtotal,
        totalAmount,
        deposit:        +deposit,
        balance:        dueBalance,
        date:           new Date(payDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}),
        items:          feeItems.filter(f=>f.amount>0).map(f=>({ label:f.label, perMonth:f.amount, total:f.isDiscount?-f.amount*pd.months:f.amount*pd.months })),
        history: [...history.map(h=>({ date:new Date(h.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}), period:h.month||'—', total:totalAmount, deposit:h.amount, due:totalAmount-h.amount })),
          { date:new Date(payDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}), period:periodCovered, total:totalAmount, deposit:+deposit, due:dueBalance }],
      });
      toast.success('Payment recorded!');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to record payment');
    } finally { setSubmitting(false); }
  };

  const reset = () => {
    setSelected(null); setQuery(''); setSuggestions([]); setAssignments([]);
    setFeeItems(DEFAULT_FEE_ITEMS.map(f=>({...f, amount:''}))); setPeriod('halfyearly');
    setFeesMonth(''); setDeposit(''); setTransId(''); setReceipt(null); setFeeRecord(null);
  };

  const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', background:'#fff' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };

  return (
    <div>
      <div style={{ marginBottom:20 }}>
        <h2 className="font-display text-2xl text-ink">💳 Collect Fees</h2>
        <p className="text-sm text-muted mt-0.5">Search student → select period → enter amounts → submit</p>
      </div>

      {/* Student search */}
      <div className="card" style={{ padding:'20px 24px', marginBottom:16 }}>
        <div style={{ fontSize:15, fontWeight:700, marginBottom:10, color:'#111827' }}>Collect Fees of a Student</div>
        <div style={{ display:'flex', gap:8, marginBottom:12 }}>
          <span style={{ fontSize:11, fontWeight:700, background:'#1D4ED8', color:'#fff', padding:'2px 10px', borderRadius:20 }}>Required *</span>
          <span style={{ fontSize:11, fontWeight:700, background:'#F3F4F6', color:'#6B7280', padding:'2px 10px', borderRadius:20 }}>Optional</span>
        </div>
        <label style={LBL}>Search Student *</label>
        <div style={{ position:'relative' }}>
          <input value={query} onChange={e=>{ setQuery(e.target.value); setSelected(null); }}
            placeholder="Type student name or roll number…" style={{ ...INP, fontSize:14 }}/>
          {suggestions.length > 0 && (
            <div style={{ position:'absolute', top:'100%', left:0, right:0, background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.1)', zIndex:50, marginTop:4 }}>
              {suggestions.map(s=>(
                <div key={s._id} onClick={()=>selectStudent(s)}
                  style={{ padding:'10px 16px', cursor:'pointer', fontSize:13, borderBottom:'0.5px solid #F3F4F6', display:'flex', alignItems:'center', gap:10 }}
                  onMouseEnter={e=>e.currentTarget.style.background='#EFF6FF'}
                  onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                  <div style={{ width:30, height:30, borderRadius:8, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                    <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>{(s.user?.name||'?')[0].toUpperCase()}</span>
                  </div>
                  <div>
                    <span style={{ fontWeight:700, color:'#111827' }}>{s.rollNumber} – {s.user?.name}</span>
                    <span style={{ color:'#9CA3AF', marginLeft:8 }}>– {s.class?.name} {s.class?.section||''}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {selected && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {/* Student header */}
          <div style={{ background:'#0B1F4A', padding:'14px 24px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14 }}>
            {[
              { l:'Registration', v:selected.rollNumber||'—' },
              { l:'Student Name', v:selected.user?.name },
              { l:'Guardian',     v:selected.parentName||selected.fatherName||'—' },
              { l:'Class',        v:`${selected.class?.name||''} ${selected.class?.section||''}` },
            ].map(f=>(
              <div key={f.l}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:3 }}>{f.l}</div>
                <div style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{f.v}</div>
              </div>
            ))}
          </div>

          {/* Period selector — only 2 options */}
          <div style={{ padding:'20px 24px', borderBottom:'1px solid #E5E7EB' }}>
            <label style={{ ...LBL, color:'#1D4ED8', marginBottom:12 }}>Select Fee Period *</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {Object.entries(PERIODS).map(([key, p]) => {
                const active = period === key;
                return (
                  <div key={key} onClick={()=>setPeriod(key)} style={{
                    padding:'16px 20px', borderRadius:12, cursor:'pointer', transition:'all 0.15s',
                    border:`2px solid ${active?'#1D4ED8':'#E5E7EB'}`,
                    background:active?'#EFF6FF':'#fff',
                  }}>
                    <div style={{ fontSize:16, fontWeight:700, color:active?'#1E40AF':'#111827' }}>{p.label}</div>
                    <div style={{ fontSize:12, color:active?'#3B82F6':'#9CA3AF', marginTop:2 }}>{p.sub}</div>
                    <span style={{ display:'inline-block', marginTop:8, fontSize:11, fontWeight:700, background:'#D1FAE5', color:'#065F46', padding:'3px 10px', borderRadius:20 }}>{p.badge}</span>
                  </div>
                );
              })}
            </div>

            {/* Months preview */}
            {feesMonth && months.length > 0 && (
              <div style={{ marginTop:14, background:'#F8FAFC', borderRadius:9, padding:'12px 14px' }}>
                <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:8 }}>Months covered ({pd.months} months)</div>
                <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                  {months.map(m=>(
                    <span key={m} style={{ fontSize:11, fontWeight:700, background:'#E6F1FB', color:'#185FA5', padding:'3px 10px', borderRadius:20 }}>{m}</span>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Date only */}
          <div style={{ padding:'16px 24px', borderBottom:'1px solid #E5E7EB', maxWidth:300 }}>
            <label style={LBL}>Date</label>
            <input type="date" value={payDate} onChange={e=>setPayDate(e.target.value)} style={INP}/>
          </div>

          {/* Assigned fees notice */}
          {assignments.length > 0 && (
            <div style={{ margin:'12px 24px 0', background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:9, padding:'10px 14px', fontSize:12, color:'#1E40AF' }}>
              ℹ️ Amounts pre-filled from {assignments.length} assigned fee(s). You can edit any amount below.
            </div>
          )}

          {/* Fee items table */}
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, marginTop:4 }}>
            <thead>
              <tr style={{ background:'#F8FAFC' }}>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB', width:40, color:'#6B7280' }}>Sr.</th>
                <th style={{ padding:'10px 14px', textAlign:'left', fontWeight:700, border:'1px solid #E5E7EB', color:'#6B7280' }}>Particulars <span style={{ fontSize:10, color:'#9CA3AF', fontWeight:400 }}>(click to edit)</span></th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:150, color:'#6B7280' }}>Paid (₹)</th>
                <th style={{ padding:'10px 14px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', width:160, color:'#1D4ED8' }}>Total ({pd.months} mo)</th>
                <th style={{ padding:'10px 14px', width:36, border:'1px solid #E5E7EB' }}></th>
              </tr>
            </thead>
            <tbody>
              {feeItems.map((item,i)=>{
                const hasVal = item.amount !== '' && +item.amount > 0;
                const autoTotal = hasVal ? +item.amount * pd.months : null;
                const rowTotal = item.total !== undefined && item.total !== '' ? +item.total : autoTotal;
                return (
                <tr key={item.key} style={{ borderBottom:'0.5px solid #F3F4F6', background:hasVal?'#FAFFFE':'#fff' }}>
                  <td style={{ padding:'8px 14px', textAlign:'center', color:'#9CA3AF', width:40 }}>{i+1}</td>
                  <td style={{ padding:'6px 10px', width:220 }}>
                    <input value={item.label}
                      onChange={e=>setFeeItems(prev=>prev.map((f,fi)=>fi===i?{...f,label:e.target.value}:f))}
                      style={{ width:'100%', padding:'5px 9px', border:'1px solid transparent', borderRadius:6, fontSize:12, textTransform:'uppercase', fontWeight:hasVal?700:400, color:'#374151', background:'transparent', outline:'none', cursor:'text' }}
                      onFocus={e=>e.target.style.borderColor='#BFDBFE'}
                      onBlur={e=>e.target.style.borderColor='transparent'}/>
                  </td>
                  <td style={{ padding:'6px 10px', textAlign:'right' }}>
                    <input type="number" min="0" value={item.amount} placeholder="—"
                      onChange={e=>setFeeItems(prev=>prev.map((f,fi)=>fi===i?{...f,amount:e.target.value}:f))}
                      style={{ width:110, padding:'6px 10px', border:`1.5px solid ${hasVal?'#10B981':'#E5E7EB'}`, borderRadius:7, fontSize:13, textAlign:'right', outline:'none', background:hasVal?'#F0FDF4':'#fff', fontWeight:hasVal?700:400 }}/>
                  </td>
                  <td style={{ padding:'6px 10px', textAlign:'right' }}>
                    <input type="number" min="0" value={item.total !== undefined ? item.total : (rowTotal !== null ? rowTotal : '')} placeholder="—"
                      onChange={e=>setFeeItems(prev=>prev.map((f,fi)=>fi===i?{...f,total:e.target.value}:f))}
                      style={{ width:120, padding:'6px 10px', border:`1.5px solid ${hasVal?'#3B82F6':'#E5E7EB'}`, borderRadius:7, fontSize:13, textAlign:'right', outline:'none', background:hasVal?'#EFF6FF':'#fff', fontWeight:hasVal?700:400, color:'#1D4ED8' }}/>
                  </td>
                  <td style={{ padding:'6px 8px', textAlign:'center', width:36 }}>
                    <button onClick={()=>setFeeItems(prev=>prev.filter((_,fi)=>fi!==i))}
                      style={{ width:24, height:24, borderRadius:6, border:'1px solid #FECACA', background:'#FEF2F2', color:'#DC2626', cursor:'pointer', fontSize:14, lineHeight:1, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
                  </td>
                </tr>
                );
              })}
              {/* Add row button */}
              <tr>
                <td colSpan={5} style={{ padding:'8px 14px' }}>
                  <button onClick={()=>setFeeItems(prev=>[...prev, { key:'custom_'+Date.now(), label:'New Fee', amount:'', isDiscount:false }])}
                    style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px dashed #BFDBFE', padding:'6px 16px', borderRadius:8, cursor:'pointer', width:'100%' }}>
                    + Add Fee Item
                  </button>
                </td>
              </tr>
            </tbody>
            <tfoot>
              <tr style={{ background:'#F8FAFC' }}>
                <td colSpan={4} style={{ padding:'10px 24px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB' }}>Subtotal</td>
                <td style={{ padding:'10px 16px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', fontSize:15, color:'#0B1F4A' }}>{fmt(subtotal)}</td>
              </tr>
              <tr style={{ background:'#F0FDF4' }}>
                  <td colSpan={4} style={{ padding:'9px 24px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', color:'#16A34A' }}>
                    Discount {pd.discount > 0 ? `(${pd.discount}% auto)` : ''}
                  </td>
                  <td style={{ padding:'5px 10px', border:'1px solid #E5E7EB' }}>
                    <input type="number" min="0"
                      value={customDiscount !== '' ? customDiscount : (pd.discount > 0 ? discAmt : '')}
                      placeholder={pd.discount > 0 ? fmt(discAmt) : '0'}
                      onChange={e=>setCustomDiscount(e.target.value)}
                      style={{ width:'100%', padding:'5px 10px', border:'1.5px solid #10B981', borderRadius:7, fontSize:13, textAlign:'right', outline:'none', background:'#F0FDF4', fontWeight:700, color:'#16A34A' }}/>
                  </td>
                </tr>
              <tr style={{ background:'#EFF6FF' }}>
                <td colSpan={4} style={{ padding:'11px 24px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', color:'#1E40AF', fontSize:14 }}>TOTAL</td>
                <td style={{ padding:'11px 16px', textAlign:'right', fontWeight:900, border:'1px solid #E5E7EB', fontSize:17, color:'#1E40AF' }}>{fmt(totalAmount)}</td>
              </tr>
              <tr>
                <td colSpan={4} style={{ padding:'9px 24px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB' }}>DEPOSIT</td>
                <td style={{ padding:'5px 10px', border:'1px solid #E5E7EB' }}>
                  <input type="number" min="0" value={deposit} onChange={e=>setDeposit(e.target.value)}
                    style={{ width:'100%', padding:'7px 10px', border:'1.5px solid #16A34A', borderRadius:7, fontSize:14, textAlign:'right', outline:'none', color:'#16A34A', fontWeight:700 }}/>
                </td>
              </tr>
              <tr style={{ background:dueBalance>0?'#FEF2F2':'#F0FDF4' }}>
                <td colSpan={4} style={{ padding:'11px 24px', textAlign:'right', fontWeight:700, border:'1px solid #E5E7EB', fontSize:14 }}>Due-able Balance</td>
                <td style={{ padding:'11px 16px', textAlign:'right', fontWeight:900, border:'1px solid #E5E7EB', fontSize:16, color:dueBalance>0?'#DC2626':'#16A34A' }}>{fmt(dueBalance)}</td>
              </tr>
            </tfoot>
          </table>

          {/* Submit bar */}
          <div style={{ display:'flex', gap:14, alignItems:'flex-end', padding:'18px 24px', flexWrap:'wrap', borderTop:'1px solid #E5E7EB' }}>
            <div>
              <label style={LBL}>Payment Method</label>
              <select value={method} onChange={e=>setMethod(e.target.value)}
                style={{ padding:'9px 14px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, outline:'none' }}>
                <option value="cash">Cash</option>
                <option value="upi">UPI</option>
                <option value="bank_transfer">Bank Transfer</option>
                <option value="cheque">Cheque</option>
                <option value="card">Card</option>
              </select>
            </div>
            <div style={{ flex:1, minWidth:200 }}>
              <label style={LBL}>Transaction ID (optional)</label>
              <input value={transId} onChange={e=>setTransId(e.target.value)} placeholder="UPI / Bank ref no."
                style={{ ...INP, maxWidth:300 }}/>
            </div>
            <button onClick={handleSubmit} disabled={submitting} style={{
              padding:'12px 32px', borderRadius:10, fontSize:14, fontWeight:700,
              background:submitting?'#9CA3AF':'#D97706', color:'#fff', border:'none', cursor:submitting?'not-allowed':'pointer',
            }}>
              {submitting ? '⏳ Processing…' : '✅ Submit Fees'}
            </button>
          </div>
        </div>
      )}

      {receipt && <ReceiptModal receipt={receipt} onClose={()=>{ setReceipt(null); reset(); }}/>}
    </div>
  );
}