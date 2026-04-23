/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Salary.js — eSkooly-style salary module
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { salaryAPI, teacherAPI } from '../utils/api';

const MONTHS = ['January','February','March','April','May','June',
                'July','August','September','October','November','December'];
const NOW = new Date();

// ── Salary Slip Print (Detailed) ──────────────────────────────────────────────
function printDetailedReceipt(slip, schoolName) {
  const t    = slip.teacher;
  const name = t?.user?.name || '—';
  const html = `<html><head><title>Salary Slip</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:Arial,sans-serif;padding:30px;color:#111;background:#fff}
    .header{text-align:center;padding-bottom:16px;margin-bottom:20px;border-bottom:2px solid #0B1F4A}
    .header h1{color:#0B1F4A;font-size:22px;margin-bottom:4px}
    .header p{color:#666;font-size:13px}
    .slip-title{background:#0B1F4A;color:#fff;text-align:center;padding:10px;font-size:15px;font-weight:bold;margin-bottom:20px;border-radius:6px}
    .info-grid{display:grid;grid-template-columns:1fr 1fr 1fr;gap:12px;margin-bottom:20px}
    .info-box{background:#f8f8f8;padding:10px 14px;border-radius:6px;border:1px solid #eee}
    .info-box .label{font-size:10px;color:#999;text-transform:uppercase;letter-spacing:0.5px;margin-bottom:4px}
    .info-box .value{font-size:14px;font-weight:bold;color:#111}
    table{width:100%;border-collapse:collapse;margin-bottom:16px}
    th{background:#0B1F4A;color:#fff;padding:9px 14px;text-align:left;font-size:12px}
    td{padding:8px 14px;border-bottom:1px solid #eee;font-size:13px}
    .total-row td{background:#f0f0f0;font-weight:bold}
    .net-box{background:#0B1F4A;color:#fff;padding:16px;text-align:center;border-radius:8px;margin:16px 0}
    .net-box .net-label{font-size:12px;opacity:0.7;margin-bottom:4px}
    .net-box .net-amount{font-size:28px;font-weight:900}
    .footer{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;text-align:center}
    .footer div{border-top:1px solid #999;padding-top:8px;font-size:12px;color:#666}
    .remarks{background:#fffde7;border:1px solid #ffd;padding:10px 14px;border-radius:6px;font-size:12px;margin-bottom:16px}
  </style></head><body>
  <div class="header">
    <h1>${schoolName || 'School'}</h1>
    <p>Salary Slip — ${MONTHS[slip.month-1]} ${slip.year}</p>
  </div>
  <div class="slip-title">EMPLOYEE SALARY SLIP</div>
  <div class="info-grid">
    <div class="info-box"><div class="label">Employee Name</div><div class="value">${name}</div></div>
    <div class="info-box"><div class="label">Employee ID</div><div class="value">${t?.employeeId||'—'}</div></div>
    <div class="info-box"><div class="label">Designation</div><div class="value">${t?.designation||'Teacher'}</div></div>
    <div class="info-box"><div class="label">Salary Month</div><div class="value">${MONTHS[slip.month-1]} ${slip.year}</div></div>
    <div class="info-box"><div class="label">Payment Date</div><div class="value">${(slip.paymentDate ? new Date(slip.paymentDate).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : 'N/A')}</div></div>
    <div class="info-box"><div class="label">Payment Mode</div><div class="value">${(slip.paymentMode||'bank').toUpperCase()}</div></div>
  </div>
  <table>
    <tr><th>Earnings</th><th>Amount (₹)</th><th>Deductions</th><th>Amount (₹)</th></tr>
    <tr><td>Basic / Fixed Salary</td><td>₹${(slip.basicSalary||0).toLocaleString('en-IN')}</td><td>PF</td><td>₹${(slip.deductions?.pf||0).toLocaleString('en-IN')}</td></tr>
    <tr><td>HRA</td><td>₹${(slip.allowances?.hra||0).toLocaleString('en-IN')}</td><td>Income Tax</td><td>₹${(slip.deductions?.tax||0).toLocaleString('en-IN')}</td></tr>
    <tr><td>DA</td><td>₹${(slip.allowances?.da||0).toLocaleString('en-IN')}</td><td>Loan EMI</td><td>₹${(slip.deductions?.loan||0).toLocaleString('en-IN')}</td></tr>
    <tr><td>Bonus / Other</td><td>₹${(slip.allowances?.other||0).toLocaleString('en-IN')}</td><td>Other</td><td>₹${(slip.deductions?.other||0).toLocaleString('en-IN')}</td></tr>
    <tr class="total-row"><td><b>Gross Salary</b></td><td><b>₹${(slip.grossSalary||0).toLocaleString('en-IN')}</b></td><td><b>Total Deductions</b></td><td><b>₹${(Object.values(slip.deductions||{}).reduce((a,b)=>a+b,0)).toLocaleString('en-IN')}</b></td></tr>
  </table>
  ${slip.remarks?`<div class="remarks"><b>Remarks:</b> ${slip.remarks}</div>`:''}
  <div class="net-box">
    <div class="net-label">NET SALARY PAID</div>
    <div class="net-amount">₹${(slip.netSalary||0).toLocaleString('en-IN')}</div>
  </div>
  <div class="footer">
    <div>Employee Signature</div>
    <div>Authorized Signatory</div>
  </div>
  </body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

function printThermalReceipt(slip, schoolName) {
  const name = slip.teacher?.user?.name || '—';
  const html = `<html><head><title>Receipt</title>
  <style>
    body{font-family:'Courier New',monospace;width:280px;margin:0 auto;padding:16px;font-size:12px}
    .center{text-align:center}.bold{font-weight:bold}.line{border-top:1px dashed #000;margin:8px 0}
    .row{display:flex;justify-content:space-between;margin:3px 0}
    .big{font-size:18px;font-weight:900;text-align:center;margin:8px 0}
  </style></head><body>
  <div class="center bold" style="font-size:14px">${schoolName||'School'}</div>
  <div class="center" style="font-size:10px">Salary Receipt</div>
  <div class="line"></div>
  <div class="row"><span>Name:</span><span>${name}</span></div>
  <div class="row"><span>ID:</span><span>${slip.teacher?.employeeId||'—'}</span></div>
  <div class="row"><span>Month:</span><span>${MONTHS[slip.month-1]} ${slip.year}</span></div>
  <div class="row"><span>Date:</span><span>${(slip.paymentDate ? new Date(slip.paymentDate).toLocaleDateString('en-IN') : 'N/A')}</span></div>
  <div class="line"></div>
  <div class="row"><span>Basic Salary:</span><span>₹${(slip.basicSalary||0).toLocaleString('en-IN')}</span></div>
  <div class="row"><span>Bonus:</span><span>₹${(slip.allowances?.other||0).toLocaleString('en-IN')}</span></div>
  <div class="row"><span>Deduction:</span><span>-₹${(Object.values(slip.deductions||{}).reduce((a,b)=>a+b,0)).toLocaleString('en-IN')}</span></div>
  <div class="line"></div>
  <div class="big">₹${(slip.netSalary||0).toLocaleString('en-IN')}</div>
  <div class="center">NET SALARY</div>
  <div class="line"></div>
  <div class="center" style="font-size:10px">Thank you</div>
  </body></html>`;
  const w = window.open('','_blank');
  w.document.write(html);
  w.document.close();
  w.print();
}

// ── Pay Salary Form (eSkooly style) ──────────────────────────────────────────
function PaySalaryTab() {
  const [teachers,    setTeachers]    = useState([]);
  const [search,      setSearch]      = useState('');
  const [showDrop,    setShowDrop]    = useState(false);
  const [selected,    setSelected]    = useState(null);
  const [saving,      setSaving]      = useState(false);
  const [form, setForm] = useState({
    salaryMonth: '',
    paymentDate: NOW.toISOString().split('T')[0],
    fixedSalary: '',
    bonus:       '0',
    deduction:   '0',
    paymentMode: 'bank',
    remarks:     '',
  });

  useEffect(() => {
    teacherAPI.getAll().then(r => setTeachers(r.data.data || [])).catch(()=>{});
  }, []);

  const filtered = teachers.filter(t => {
    const name = t.user?.name || '';
    const id   = t.employeeId || '';
    const q    = search.toLowerCase();
    return name.toLowerCase().includes(q) || id.toLowerCase().includes(q);
  });

  const selectTeacher = (t) => {
    setSelected(t);
    setSearch(t.user?.name || '');
    setShowDrop(false);
    setForm(f => ({ ...f, fixedSalary: String(t.salary || '') }));
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  const submit = async () => {
    if (!selected)            return toast.error('Select an employee');
    if (!form.salaryMonth)    return toast.error('Select salary month');
    if (!form.fixedSalary)    return toast.error('Enter fixed salary');

    const [year, month] = form.salaryMonth.split('-').map(Number);
    const basic   = Number(form.fixedSalary) || 0;
    const bonus   = Number(form.bonus)       || 0;
    const deduct  = Number(form.deduction)   || 0;

    setSaving(true);
    try {
      await salaryAPI.pay({
        teacherId:   selected._id,
        month, year,
        basicSalary: basic,
        allowances:  { hra:0, da:0, ta:0, medical:0, other: bonus },
        deductions:  { pf:0, tax:0, loan:0, other: deduct },
        paymentMode: form.paymentMode,
        paymentDate: form.paymentDate,
        remarks:     form.remarks,
      });
      toast.success(`Salary paid for ${selected.user?.name}!`);
      // Reset
      setSelected(null); setSearch('');
      setForm({ salaryMonth:'', paymentDate: NOW.toISOString().split('T')[0],
                fixedSalary:'', bonus:'0', deduction:'0', paymentMode:'bank', remarks:'' });
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save salary');
    } finally { setSaving(false); }
  };

  const INP = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
    fontSize:13, outline:'none', background:'#fff', color:'#111827' };
  const LBL = { fontSize:11, color:'#9CA3AF', marginBottom:4, display:'block' };

  return (
    <div>
      {/* Breadcrumb */}
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Salary &nbsp;|&nbsp; 🏠 - Pay Salary
      </div>

      {/* Search Employee */}
      <div style={{ maxWidth:500, margin:'0 auto 32px', position:'relative' }}>
        <div style={{ display:'flex', alignItems:'center', border:'1.5px solid #E5E7EB', borderRadius:10, overflow:'visible', background:'#fff' }}>
          <input
            value={search}
            onChange={e=>{ setSearch(e.target.value); setShowDrop(true); setSelected(null); }}
            onFocus={()=>setShowDrop(true)}
            placeholder="Search Employee"
            style={{ flex:1, padding:'12px 16px', border:'none', outline:'none', fontSize:13, background:'transparent' }}
          />
          <div style={{ padding:'0 14px', color:'#9CA3AF', fontSize:16 }}>🔍</div>
        </div>
        {/* Dropdown */}
        {showDrop && filtered.length > 0 && (
          <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff',
            border:'1px solid #E5E7EB', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:100, maxHeight:220, overflowY:'auto' }}>
            {filtered.map(t => (
              <div key={t._id} onClick={()=>selectTeacher(t)}
                style={{ padding:'10px 16px', cursor:'pointer', fontSize:13, borderBottom:'1px solid #F3F4F6',
                  display:'flex', alignItems:'center', gap:8 }}
                onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                onMouseLeave={e=>e.currentTarget.style.background='#fff'}>
                <div style={{ width:32, height:32, borderRadius:'50%', background:'#E0E7FF', display:'flex', alignItems:'center', justifyContent:'center', fontSize:13, fontWeight:700, color:'#4F46E5', flexShrink:0 }}>
                  {(t.user?.name||'?')[0].toUpperCase()}
                </div>
                <div>
                  <div style={{ fontWeight:600, color:'#111827' }}>{t.employeeId} - {t.user?.name}</div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>{t.designation || 'Teacher'}</div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Pay Form */}
      {selected && (
        <div style={{ maxWidth:760, margin:'0 auto', background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
          {/* Header */}
          <div style={{ background:'linear-gradient(135deg,#0B1F4A,#1D3A7A)', padding:'20px 28px' }}>
            <div style={{ fontWeight:800, fontSize:18, color:'#fff' }}>Pay Employee Salary</div>
            <div style={{ display:'flex', gap:6, marginTop:6 }}>
              <span style={{ fontSize:11, background:'rgba(255,255,255,0.15)', color:'rgba(255,255,255,0.9)', padding:'2px 10px', borderRadius:20 }}>● Required</span>
              <span style={{ fontSize:11, background:'rgba(255,255,255,0.08)', color:'rgba(255,255,255,0.5)', padding:'2px 10px', borderRadius:20 }}>○ Optional</span>
            </div>
          </div>

          <div style={{ padding:'24px 28px', display:'flex', flexDirection:'column', gap:20 }}>
            {/* Employee info row */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16, background:'#F8FAFC', padding:16, borderRadius:12 }}>
              <div>
                <label style={LBL}>Employee ID</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ color:'#3B5BDB', fontSize:12 }}>↳</span>
                  <span style={{ fontWeight:700, fontSize:14 }}>{selected.employeeId || '—'}</span>
                </div>
              </div>
              <div>
                <label style={LBL}>Employee Role</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ color:'#3B5BDB', fontSize:12 }}>↳</span>
                  <span style={{ fontWeight:700, fontSize:14 }}>{selected.designation || 'Teacher'}</span>
                </div>
              </div>
              <div>
                <label style={LBL}>Employee Name</label>
                <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                  <span style={{ color:'#3B5BDB', fontSize:12 }}>↳</span>
                  <span style={{ fontWeight:700, fontSize:14 }}>{selected.user?.name}</span>
                </div>
              </div>
            </div>

            {/* Month + Date */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Salary Month <span style={{ color:'#3B5BDB' }}>*</span></label>
                <input type="month" value={form.salaryMonth} onChange={e=>set('salaryMonth',e.target.value)} style={INP}/>
              </div>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Date <span style={{ color:'#3B5BDB' }}>*</span></label>
                <input type="date" value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)} style={INP}/>
              </div>
            </div>

            {/* Salary + Bonus + Deduction */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:16 }}>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Fixed Salary <span style={{ color:'#3B5BDB' }}>*</span></label>
                <input type="number" value={form.fixedSalary} onChange={e=>set('fixedSalary',e.target.value)}
                  placeholder="Fixed salary amount" style={INP}/>
              </div>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Any Bonus</label>
                <input type="number" value={form.bonus} onChange={e=>set('bonus',e.target.value)}
                  placeholder="Bonus amount" style={INP}/>
              </div>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Any Deduction</label>
                <input type="number" value={form.deduction} onChange={e=>set('deduction',e.target.value)}
                  placeholder="Deduction amount" style={INP}/>
              </div>
            </div>

            {/* Payment Mode + Remarks */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Payment Mode</label>
                <select value={form.paymentMode} onChange={e=>set('paymentMode',e.target.value)} style={INP}>
                  <option value="bank">Bank Transfer</option>
                  <option value="cash">Cash</option>
                  <option value="upi">UPI</option>
                  <option value="cheque">Cheque</option>
                </select>
              </div>
              <div>
                <label style={{ ...LBL, color:'#374151' }}>Remarks (Optional)</label>
                <input value={form.remarks} onChange={e=>set('remarks',e.target.value)}
                  placeholder="Optional note" style={INP}/>
              </div>
            </div>

            {/* Net calculation preview */}
            {form.fixedSalary && (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
                {[
                  { label:'Gross Salary', val: (Number(form.fixedSalary)||0)+(Number(form.bonus)||0), color:'#1D4ED8', bg:'#EFF6FF' },
                  { label:'Deduction',    val: Number(form.deduction)||0,                             color:'#DC2626', bg:'#FEF2F2' },
                  { label:'Net Salary',   val: (Number(form.fixedSalary)||0)+(Number(form.bonus)||0)-(Number(form.deduction)||0), color:'#166534', bg:'#DCFCE7' },
                ].map(s=>(
                  <div key={s.label} style={{ background:s.bg, borderRadius:10, padding:'12px 16px', textAlign:'center' }}>
                    <div style={{ fontSize:20, fontWeight:900, color:s.color }}>₹{s.val.toLocaleString('en-IN')}</div>
                    <div style={{ fontSize:11, color:s.color, fontWeight:700, marginTop:2 }}>{s.label}</div>
                  </div>
                ))}
              </div>
            )}

            {/* Submit */}
            <div style={{ textAlign:'center', paddingTop:4 }}>
              <button onClick={submit} disabled={saving}
                style={{ padding:'12px 48px', borderRadius:30, background:'#F59E0B', color:'#fff', border:'none',
                  fontSize:14, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1,
                  boxShadow:'0 4px 12px rgba(245,158,11,0.4)' }}>
                {saving ? '⏳ Saving…' : '✅ Submit Salary'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Salary Paid Slip Tab (eSkooly style) ──────────────────────────────────────
function SalaryPaidSlipTab({ schoolName }) {
  const [month,   setMonth]   = useState(NOW.getMonth()+1);
  const [year,    setYear]    = useState(NOW.getFullYear());
  const [slips,   setSlips]   = useState([]);
  const [loading, setLoading] = useState(false);
  const [selected, setSelected] = useState(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryAPI.getAll({ month, year, status:'paid' });
      setSlips(r.data.data || []);
    } catch { toast.error('Failed to load slips'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Salary &nbsp;|&nbsp; 🏠 - Salary Paid Receipt
      </div>

      {/* Month/Year filter */}
      <div style={{ display:'flex', gap:10, marginBottom:24, flexWrap:'wrap' }}>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading…</div>
      ) : slips.length === 0 ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🧾</div>
          <div style={{ fontWeight:700, fontSize:16 }}>No paid slips for {MONTHS[month-1]} {year}</div>
        </div>
      ) : selected ? (
        /* Single slip detail view */
        <div style={{ maxWidth:600, margin:'0 auto' }}>
          {/* Back */}
          <button onClick={()=>setSelected(null)}
            style={{ marginBottom:16, padding:'6px 16px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>
            ← Back to list
          </button>

          {/* Print buttons */}
          <div style={{ display:'flex', justifyContent:'flex-end', gap:10, marginBottom:16 }}>
            <button onClick={()=>printDetailedReceipt(selected, schoolName)}
              style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #D1D5DB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              🖨️ Print Detailed Receipt
            </button>
            <button onClick={()=>printThermalReceipt(selected, schoolName)}
              style={{ padding:'8px 18px', borderRadius:8, border:'1px solid #D1D5DB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              🔒 Thermal Receipt
            </button>
          </div>

          {/* Slip card */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', padding:'32px 28px', textAlign:'center', boxShadow:'0 4px 20px rgba(0,0,0,0.06)' }}>
            {/* Avatar */}
            <div style={{ width:80, height:80, borderRadius:'50%', background:'#E0E7FF', display:'flex', alignItems:'center', justifyContent:'center',
              fontSize:28, fontWeight:700, color:'#4F46E5', margin:'0 auto 12px' }}>
              {(selected.teacher?.user?.name||'?')[0].toUpperCase()}
            </div>
            <div style={{ fontSize:22, fontWeight:800, color:'#3B5BDB', marginBottom:20 }}>
              {selected.teacher?.user?.name || '—'}
            </div>

            {/* Details */}
            <div style={{ textAlign:'left', display:'flex', flexDirection:'column', gap:10, maxWidth:320, margin:'0 auto' }}>
              {[
                { label:'Registration/ID', value: selected.teacher?.employeeId || '—' },
                { label:'Type',            value: selected.teacher?.designation || 'Teacher' },
                { label:'Salary Month',    value: `${MONTHS[selected.month-1]}, ${selected.year}` },
                { label:'Date of Receiving', value: (selected.paymentDate ? new Date(selected.paymentDate).toLocaleDateString('en-IN',{day:'2-digit',month:'2-digit',year:'numeric'}) : 'N/A') },
                { label:'Bonus',           value: `₹ ${(selected.allowances?.other||0).toLocaleString('en-IN')}` },
                { label:'Deduction',       value: `₹ ${Object.values(selected.deductions||{}).reduce((a,b)=>a+b,0).toLocaleString('en-IN')}` },
              ].map(row=>(
                <div key={row.label} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingBottom:8, borderBottom:'1px solid #F3F4F6' }}>
                  <span style={{ fontSize:13, color:'#6B7280' }}>{row.label}:</span>
                  <span style={{ fontSize:13, fontWeight:700, color:'#111827' }}>{row.value}</span>
                </div>
              ))}
              {/* Net Paid */}
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', paddingTop:4 }}>
                <span style={{ fontSize:13, color:'#6B7280' }}>Net Paid:</span>
                <span style={{ fontSize:18, fontWeight:900, color:'#166534' }}>₹ {(selected.netSalary||0).toLocaleString('en-IN')}</span>
              </div>
            </div>
          </div>
        </div>
      ) : (
        /* Slips list */
        <div style={{ display:'grid', gap:12 }}>
          {slips.map(slip => (
            <div key={slip._id} onClick={()=>setSelected(slip)}
              style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', padding:'16px 20px',
                display:'flex', alignItems:'center', gap:16, cursor:'pointer',
                boxShadow:'0 1px 4px rgba(0,0,0,0.04)', transition:'all 0.15s' }}
              onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.1)'; e.currentTarget.style.transform='translateY(-2px)'; }}
              onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)'; e.currentTarget.style.transform=''; }}>
              {/* Avatar */}
              <div style={{ width:48, height:48, borderRadius:'50%', background:'#E0E7FF', display:'flex', alignItems:'center',
                justifyContent:'center', fontSize:18, fontWeight:700, color:'#4F46E5', flexShrink:0 }}>
                {(slip.teacher?.user?.name||'?')[0].toUpperCase()}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{slip.teacher?.user?.name || '—'}</div>
                <div style={{ fontSize:12, color:'#9CA3AF' }}>{slip.teacher?.employeeId} · {slip.teacher?.designation||'Teacher'}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:18, fontWeight:900, color:'#166534' }}>₹{(slip.netSalary||0).toLocaleString('en-IN')}</div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{MONTHS[slip.month-1]} {slip.year}</div>
              </div>
              <div style={{ fontSize:18, color:'#D1D5DB' }}>›</div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Salary Sheet Tab ──────────────────────────────────────────────────────────
function SalarySheetTab() {
  const [month,   setMonth]   = useState(NOW.getMonth()+1);
  const [year,    setYear]    = useState(NOW.getFullYear());
  const [sheet,   setSheet]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryAPI.getSheet({ month, year });
      setSheet(r.data.data || []);
    } catch { toast.error('Failed to load salary sheet'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };
  const totalNet = sheet.reduce((a,r)=>a+(r.slip?.netSalary||r.teacher?.salary||0),0);

  return (
    <div>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Salary &nbsp;|&nbsp; 🏠 - Salary Sheet
      </div>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20, flexWrap:'wrap' }}>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={()=>window.print()}
          style={{ marginLeft:'auto', padding:'8px 20px', borderRadius:9, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          🖨️ Print Sheet
        </button>
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading…</div> : (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ color:'#fff', fontWeight:700 }}>📋 Salary Sheet — {MONTHS[month-1]} {year}</span>
            <span style={{ color:'rgba(255,255,255,0.6)', fontSize:12 }}>{sheet.filter(r=>r.status==='paid').length}/{sheet.length} paid</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                {['#','Employee','ID','Designation','Fixed Salary','Bonus','Deduction','Net Salary','Status'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.map((row,i)=>{
                const t=row.teacher, s=row.slip;
                const bonus  = s?.allowances?.other || 0;
                const deduct = s ? Object.values(s.deductions||{}).reduce((a,b)=>a+b,0) : 0;
                const net    = s?.netSalary || t?.salary || 0;
                const statusMap = { paid:{bg:'#DCFCE7',color:'#166534'}, pending:{bg:'#FEF9C3',color:'#92400E'} };
                const sc = statusMap[row.status] || statusMap.pending;
                return (
                  <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF' }}>{i+1}</td>
                    <td style={{ padding:'10px 14px', fontWeight:600 }}>{t.user?.name||'—'}</td>
                    <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#6B7280' }}>{t.employeeId||'—'}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{t.designation||'—'}</td>
                    <td style={{ padding:'10px 14px' }}>₹{(s?.basicSalary||t?.salary||0).toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', color:'#166534' }}>+₹{bonus.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', color:'#DC2626' }}>-₹{deduct.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', fontWeight:800, color:'#0B1F4A', fontSize:14 }}>₹{net.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color, textTransform:'capitalize' }}>{row.status}</span>
                    </td>
                  </tr>
                );
              })}
              {/* Total */}
              <tr style={{ background:'#0B1F4A' }}>
                <td colSpan={7} style={{ padding:'12px 14px', color:'#fff', fontWeight:700, textAlign:'right', fontSize:13 }}>TOTAL NET SALARY</td>
                <td style={{ padding:'12px 14px', color:'#FCD34D', fontWeight:900, fontSize:16 }}>₹{totalNet.toLocaleString('en-IN')}</td>
                <td></td>
              </tr>
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ── Salary Report Tab ─────────────────────────────────────────────────────────
function SalaryReportTab() {
  const [month,   setMonth]   = useState(NOW.getMonth()+1);
  const [year,    setYear]    = useState(NOW.getFullYear());
  const [sheet,   setSheet]   = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryAPI.getSheet({ month, year });
      setSheet(r.data.data || []);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => { load(); }, [load]);

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };
  const paid    = sheet.filter(r=>r.status==='paid');
  const pending = sheet.filter(r=>r.status!=='paid');
  const totalPaidAmt = paid.reduce((a,r)=>a+(r.slip?.netSalary||0),0);

  return (
    <div>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>
        Salary &nbsp;|&nbsp; 🏠 - Salary Report
      </div>
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20, flexWrap:'wrap' }}>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        <button onClick={()=>window.print()}
          style={{ marginLeft:'auto', padding:'8px 20px', borderRadius:9, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer' }}>
          🖨️ Print
        </button>
      </div>

      {/* Summary Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14, marginBottom:24 }}>
        {[
          { label:'Total Employees', val:sheet.length,     color:'#1D4ED8', bg:'#EFF6FF', icon:'👥' },
          { label:'Salaries Paid',   val:paid.length,      color:'#166534', bg:'#DCFCE7', icon:'✅' },
          { label:'Pending',         val:pending.length,   color:'#92400E', bg:'#FEF9C3', icon:'⏳' },
          { label:'Total Disbursed', val:`₹${totalPaidAmt.toLocaleString('en-IN')}`, color:'#7C3AED', bg:'#EDE9FE', icon:'💰' },
        ].map(s=>(
          <div key={s.label} style={{ background:s.bg, borderRadius:14, padding:'16px 18px', display:'flex', alignItems:'center', gap:12 }}>
            <span style={{ fontSize:28 }}>{s.icon}</span>
            <div>
              <div style={{ fontSize:22, fontWeight:900, color:s.color }}>{s.val}</div>
              <div style={{ fontSize:11, color:s.color, fontWeight:700 }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {loading ? <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading…</div> : (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'12px 18px' }}>
            <span style={{ color:'#fff', fontWeight:700 }}>📊 Salary Report — {MONTHS[month-1]} {year}</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                {['Employee','Fixed Salary','Bonus','Deduction','Net Salary','Mode','Status'].map(h=>(
                  <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {sheet.map((row,i)=>{
                const s=row.slip, t=row.teacher;
                const bonus  = s?.allowances?.other||0;
                const deduct = s?Object.values(s.deductions||{}).reduce((a,b)=>a+b,0):0;
                const sc = row.status==='paid'?{bg:'#DCFCE7',color:'#166534'}:{bg:'#FEF9C3',color:'#92400E'};
                return (
                  <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700 }}>{t.user?.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{t.employeeId||''} · {t.designation||''}</div>
                    </td>
                    <td style={{ padding:'10px 14px' }}>₹{(s?.basicSalary||t?.salary||0).toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', color:'#166534' }}>+₹{bonus.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', color:'#DC2626' }}>-₹{deduct.toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px', fontWeight:800, color:'#0B1F4A' }}>₹{(s?.netSalary||t?.salary||0).toLocaleString('en-IN')}</td>
                    <td style={{ padding:'10px 14px' }}>{s?.paymentMode?.toUpperCase()||'—'}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color, textTransform:'capitalize' }}>{row.status}</span>
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

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function Salary() {
  const [tab, setTab] = useState('pay');
  const schoolName = 'The Future Step School';

  const TABS = [
    { key:'pay',    label:'Pay Salary' },
    { key:'slips',  label:'Salary Paid Slip' },
    { key:'sheet',  label:'Salary Sheet' },
    { key:'report', label:'Salary Report' },
  ];

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,sans-serif', minHeight:'100vh', background:'#F9FAFB' }}>
      {/* Header */}
      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:24 }}>
        <div style={{ width:40, height:40, borderRadius:10, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20 }}>💰</div>
        <div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>Salary</h1>
          <p style={{ fontSize:12, color:'#9CA3AF', margin:0 }}>Manage employee salaries</p>
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', marginBottom:28, gap:0 }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'10px 20px', border:'none', background:'transparent', fontSize:13, fontWeight:600, cursor:'pointer',
              color: tab===t.key?'#0B1F4A':'#9CA3AF',
              borderBottom: tab===t.key?'2px solid #0B1F4A':'2px solid transparent',
              marginBottom:'-2px', transition:'all 0.15s' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* Tab content */}
      <div>
        {tab==='pay'    && <PaySalaryTab />}
        {tab==='slips'  && <SalaryPaidSlipTab schoolName={schoolName} />}
        {tab==='sheet'  && <SalarySheetTab />}
        {tab==='report' && <SalaryReportTab />}
      </div>
    </div>
  );
}