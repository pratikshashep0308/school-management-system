/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Salary.js
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { salaryAPI, teacherAPI } from '../utils/api';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const FULL_MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const NOW = new Date();

const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, outline:'none', boxSizing:'border-box', background:'#fff' };
const LBL = { fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:4, display:'block' };

function fmt(n) { return '₹' + (Number(n)||0).toLocaleString('en-IN'); }
function statusBadge(s) {
  const map = { paid:{bg:'#DCFCE7',color:'#166534'}, pending:{bg:'#FEF9C3',color:'#92400E'}, hold:{bg:'#FEE2E2',color:'#991B1B'} };
  const m = map[s]||map.pending;
  return <span style={{fontSize:11,fontWeight:700,padding:'3px 10px',borderRadius:20,background:m.bg,color:m.color,textTransform:'capitalize'}}>{s}</span>;
}

// ── Pay Salary Modal ─────────────────────────────────────────────────────────
function PayModal({ teacher, month, year, existing, onClose, onSave }) {
  const base = teacher?.salary || 0;
  const [form, setForm] = useState({
    basicSalary: existing?.basicSalary ?? base,
    allowances:  { hra: existing?.allowances?.hra??0, da: existing?.allowances?.da??0, ta: existing?.allowances?.ta??0, medical: existing?.allowances?.medical??0, other: existing?.allowances?.other??0 },
    deductions:  { pf: existing?.deductions?.pf??0, tax: existing?.deductions?.tax??0, loan: existing?.deductions?.loan??0, other: existing?.deductions?.other??0 },
    paymentMode: existing?.paymentMode||'bank',
    paymentDate: existing?.paymentDate ? existing.paymentDate.split('T')[0] : new Date().toISOString().split('T')[0],
    remarks:     existing?.remarks||'',
  });
  const [saving, setSaving] = useState(false);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setA = (k, v) => setForm(f => ({ ...f, allowances: { ...f.allowances, [k]: Number(v)||0 } }));
  const setD = (k, v) => setForm(f => ({ ...f, deductions: { ...f.deductions, [k]: Number(v)||0 } }));

  const totalAllow  = Object.values(form.allowances).reduce((a,b)=>a+b,0);
  const totalDeduct = Object.values(form.deductions).reduce((a,b)=>a+b,0);
  const gross = (Number(form.basicSalary)||0) + totalAllow;
  const net   = gross - totalDeduct;

  const save = async () => {
    setSaving(true);
    try {
      if (existing?._id) {
        await salaryAPI.update(existing._id, { ...form, month, year, teacherId: teacher._id });
      } else {
        await salaryAPI.pay({ ...form, month, year, teacherId: teacher._id });
      }
      toast.success('Salary saved!');
      onSave();
    } catch { toast.error('Failed to save salary'); }
    finally { setSaving(false); }
  };

  const name = teacher?.user?.name || teacher?.name || '—';

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
      onClick={e => e.target===e.currentTarget && onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>

        {/* Header */}
        <div style={{ background:'linear-gradient(135deg,#0B1F4A,#1D3A7A)', padding:'20px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>💰 Pay Salary</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)', marginTop:2 }}>{name} · {FULL_MONTHS[month-1]} {year}</div>
          </div>
          <button onClick={onClose} style={{ background:'rgba(255,255,255,0.15)', border:'none', borderRadius:8, color:'#fff', fontSize:18, width:32, height:32, cursor:'pointer' }}>✕</button>
        </div>

        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:20 }}>
          {/* Basic */}
          <div style={{ background:'#F8FAFC', borderRadius:12, padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:12 }}>💼 Basic Details</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              <div>
                <label style={LBL}>Basic Salary (₹)</label>
                <input style={INP} type="number" value={form.basicSalary} onChange={e=>set('basicSalary',Number(e.target.value)||0)}/>
              </div>
              <div>
                <label style={LBL}>Payment Mode</label>
                <select style={INP} value={form.paymentMode} onChange={e=>set('paymentMode',e.target.value)}>
                  {['bank','cash','upi','cheque'].map(m=><option key={m} value={m}>{m.toUpperCase()}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Payment Date</label>
                <input style={INP} type="date" value={form.paymentDate} onChange={e=>set('paymentDate',e.target.value)}/>
              </div>
              <div>
                <label style={LBL}>Remarks</label>
                <input style={INP} value={form.remarks} onChange={e=>set('remarks',e.target.value)} placeholder="Optional note"/>
              </div>
            </div>
          </div>

          {/* Allowances */}
          <div style={{ background:'#F0FDF4', borderRadius:12, padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#166534', marginBottom:12 }}>✅ Allowances</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {[['hra','HRA'],['da','DA'],['ta','TA'],['medical','Medical'],['other','Other Allow.']].map(([k,l])=>(
                <div key={k}>
                  <label style={LBL}>{l} (₹)</label>
                  <input style={INP} type="number" value={form.allowances[k]} onChange={e=>setA(k,e.target.value)}/>
                </div>
              ))}
              <div style={{ background:'#DCFCE7', borderRadius:8, padding:'9px 12px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:11, color:'#166534', fontWeight:700 }}>TOTAL ALLOWANCES</div>
                <div style={{ fontSize:16, fontWeight:900, color:'#166534' }}>{fmt(totalAllow)}</div>
              </div>
            </div>
          </div>

          {/* Deductions */}
          <div style={{ background:'#FEF2F2', borderRadius:12, padding:16 }}>
            <div style={{ fontWeight:700, fontSize:13, color:'#991B1B', marginBottom:12 }}>❌ Deductions</div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10 }}>
              {[['pf','PF'],['tax','Income Tax'],['loan','Loan EMI'],['other','Other Deduct.']].map(([k,l])=>(
                <div key={k}>
                  <label style={LBL}>{l} (₹)</label>
                  <input style={INP} type="number" value={form.deductions[k]} onChange={e=>setD(k,e.target.value)}/>
                </div>
              ))}
              <div style={{ background:'#FEE2E2', borderRadius:8, padding:'9px 12px', display:'flex', flexDirection:'column', justifyContent:'center' }}>
                <div style={{ fontSize:11, color:'#991B1B', fontWeight:700 }}>TOTAL DEDUCTIONS</div>
                <div style={{ fontSize:16, fontWeight:900, color:'#991B1B' }}>{fmt(totalDeduct)}</div>
              </div>
            </div>
          </div>

          {/* Summary */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12 }}>
            {[
              { label:'Gross Salary', val:gross, color:'#1D4ED8', bg:'#EFF6FF' },
              { label:'Total Deductions', val:totalDeduct, color:'#DC2626', bg:'#FEF2F2' },
              { label:'Net Salary', val:net, color:'#166534', bg:'#DCFCE7' },
            ].map(s=>(
              <div key={s.label} style={{ background:s.bg, borderRadius:12, padding:'14px 16px', textAlign:'center' }}>
                <div style={{ fontSize:20, fontWeight:900, color:s.color }}>{fmt(s.val)}</div>
                <div style={{ fontSize:11, color:s.color, fontWeight:700, marginTop:3 }}>{s.label}</div>
              </div>
            ))}
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
            <button onClick={onClose} style={{ padding:'10px 24px', borderRadius:9, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>Cancel</button>
            <button onClick={save} disabled={saving} style={{ padding:'10px 28px', borderRadius:9, border:'none', background:'#166534', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? '⏳ Saving…' : '✅ Pay Salary'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Salary Slip Print ─────────────────────────────────────────────────────────
function printSlip(slip, schoolName) {
  const t  = slip.teacher;
  const name = t?.user?.name || '—';
  const html = `
    <html><head><title>Salary Slip</title>
    <style>
      body{font-family:Arial,sans-serif;padding:30px;color:#111;}
      .header{text-align:center;border-bottom:2px solid #0B1F4A;padding-bottom:12px;margin-bottom:20px;}
      .header h2{margin:0;color:#0B1F4A;font-size:20px;}
      .header p{margin:4px 0;font-size:12px;color:#555;}
      .slip-title{background:#0B1F4A;color:#fff;text-align:center;padding:8px;font-weight:bold;margin-bottom:16px;}
      .info{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin-bottom:16px;}
      .info div{font-size:12px;} .info span{font-weight:bold;}
      table{width:100%;border-collapse:collapse;font-size:13px;}
      th{background:#0B1F4A;color:#fff;padding:8px 12px;text-align:left;}
      td{padding:7px 12px;border-bottom:1px solid #eee;}
      .total-row{background:#f0f0f0;font-weight:bold;}
      .net{background:#0B1F4A;color:#fff;font-size:16px;text-align:center;padding:12px;margin-top:16px;border-radius:6px;}
      .footer{margin-top:30px;display:grid;grid-template-columns:1fr 1fr;text-align:center;font-size:11px;color:#555;}
      .footer div{border-top:1px solid #999;padding-top:6px;margin:0 20px;}
    </style></head><body>
    <div class="header"><h2>${schoolName || 'School'}</h2><p>Salary Slip</p></div>
    <div class="slip-title">SALARY SLIP — ${FULL_MONTHS[slip.month-1]} ${slip.year}</div>
    <div class="info">
      <div>Employee Name: <span>${name}</span></div>
      <div>Employee ID: <span>${t?.employeeId||'—'}</span></div>
      <div>Designation: <span>${t?.designation||'—'}</span></div>
      <div>Payment Mode: <span>${slip.paymentMode?.toUpperCase()}</span></div>
      <div>Payment Date: <span>${new Date(slip.paymentDate).toLocaleDateString('en-IN')}</span></div>
      <div>Status: <span>${slip.status?.toUpperCase()}</span></div>
    </div>
    <table>
      <tr><th>Earnings</th><th>Amount</th><th>Deductions</th><th>Amount</th></tr>
      <tr><td>Basic Salary</td><td>₹${slip.basicSalary?.toLocaleString('en-IN')}</td><td>PF</td><td>₹${(slip.deductions?.pf||0).toLocaleString('en-IN')}</td></tr>
      <tr><td>HRA</td><td>₹${(slip.allowances?.hra||0).toLocaleString('en-IN')}</td><td>Income Tax</td><td>₹${(slip.deductions?.tax||0).toLocaleString('en-IN')}</td></tr>
      <tr><td>DA</td><td>₹${(slip.allowances?.da||0).toLocaleString('en-IN')}</td><td>Loan EMI</td><td>₹${(slip.deductions?.loan||0).toLocaleString('en-IN')}</td></tr>
      <tr><td>TA</td><td>₹${(slip.allowances?.ta||0).toLocaleString('en-IN')}</td><td>Other</td><td>₹${(slip.deductions?.other||0).toLocaleString('en-IN')}</td></tr>
      <tr><td>Medical</td><td>₹${(slip.allowances?.medical||0).toLocaleString('en-IN')}</td><td></td><td></td></tr>
      <tr><td>Other</td><td>₹${(slip.allowances?.other||0).toLocaleString('en-IN')}</td><td></td><td></td></tr>
      <tr class="total-row"><td>Gross Salary</td><td>₹${slip.grossSalary?.toLocaleString('en-IN')}</td><td>Total Deductions</td><td>₹${(Object.values(slip.deductions||{}).reduce((a,b)=>a+b,0)).toLocaleString('en-IN')}</td></tr>
    </table>
    <div class="net">Net Salary: ₹${slip.netSalary?.toLocaleString('en-IN')}</div>
    ${slip.remarks?`<p style="font-size:12px;margin-top:12px;color:#555">Remarks: ${slip.remarks}</p>`:''}
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

// ── Main Salary Page ──────────────────────────────────────────────────────────
export default function Salary() {
  const [tab,       setTab]       = useState('pay');        // pay | slips | sheet | report
  const [month,     setMonth]     = useState(NOW.getMonth()+1);
  const [year,      setYear]      = useState(NOW.getFullYear());
  const [teachers,  setTeachers]  = useState([]);
  const [slips,     setSlips]     = useState([]);
  const [sheet,     setSheet]     = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [modal,     setModal]     = useState(null);  // {teacher, existing}
  const [search,    setSearch]    = useState('');

  // Load teachers once
  useEffect(() => {
    teacherAPI.getAll().then(r => setTeachers(r.data.data || [])).catch(()=>{});
  }, []);

  const loadSlips = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryAPI.getAll({ month, year });
      setSlips(r.data.data || []);
    } catch { toast.error('Failed to load slips'); }
    finally { setLoading(false); }
  }, [month, year]);

  const loadSheet = useCallback(async () => {
    setLoading(true);
    try {
      const r = await salaryAPI.getSheet({ month, year });
      setSheet(r.data.data || []);
    } catch { toast.error('Failed to load salary sheet'); }
    finally { setLoading(false); }
  }, [month, year]);

  useEffect(() => {
    if (tab === 'pay' || tab === 'slips') loadSlips();
    if (tab === 'sheet' || tab === 'report') loadSheet();
  }, [tab, month, year]);

  const deleteSlip = async (id) => {
    if (!window.confirm('Delete this salary slip?')) return;
    try { await salaryAPI.remove(id); toast.success('Deleted'); loadSlips(); }
    catch { toast.error('Failed'); }
  };

  const slipMap = {};
  slips.forEach(s => { slipMap[(s.teacher?._id || s.teacher)?.toString()] = s; });

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };
  const TABS = [
    { key:'pay',    icon:'💰', label:'Pay Salary' },
    { key:'slips',  icon:'🧾', label:'Salary Paid Slip' },
    { key:'sheet',  icon:'📋', label:'Salary Sheet' },
    { key:'report', icon:'📊', label:'Salary Report' },
  ];

  // Summary stats
  const totalPaid   = slips.filter(s=>s.status==='paid').reduce((a,s)=>a+s.netSalary,0);
  const totalPending = teachers.length - slips.filter(s=>s.status==='paid').length;

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,sans-serif' }}>
      {/* Page Header */}
      <div style={{ marginBottom:20 }}>
        <h1 style={{ fontSize:24, fontWeight:900, color:'#0B1F4A', margin:0 }}>💰 Salary Management</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Manage employee salaries, slips and reports</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', padding:4, borderRadius:12, marginBottom:20, width:'fit-content' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
              background:tab===t.key?'#fff':'transparent',
              color:tab===t.key?'#0B1F4A':'#6B7280',
              boxShadow:tab===t.key?'0 2px 8px rgba(0,0,0,0.1)':'none' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* Month/Year picker */}
      <div style={{ display:'flex', gap:10, alignItems:'center', marginBottom:20, flexWrap:'wrap' }}>
        <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={SEL}>
          {FULL_MONTHS.map((m,i)=><option key={i+1} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e=>setYear(Number(e.target.value))} style={SEL}>
          {[2023,2024,2025,2026,2027].map(y=><option key={y} value={y}>{y}</option>)}
        </select>
        {(tab==='pay'||tab==='slips') && (
          <div style={{ display:'flex', gap:12, marginLeft:'auto', flexWrap:'wrap' }}>
            <div style={{ background:'#EFF6FF', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:900, color:'#1D4ED8' }}>{slips.filter(s=>s.status==='paid').length}</div>
              <div style={{ fontSize:10, color:'#1D4ED8', fontWeight:700 }}>PAID</div>
            </div>
            <div style={{ background:'#FEF9C3', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:18, fontWeight:900, color:'#92400E' }}>{totalPending}</div>
              <div style={{ fontSize:10, color:'#92400E', fontWeight:700 }}>PENDING</div>
            </div>
            <div style={{ background:'#DCFCE7', borderRadius:10, padding:'8px 16px', textAlign:'center' }}>
              <div style={{ fontSize:16, fontWeight:900, color:'#166534' }}>{fmt(totalPaid)}</div>
              <div style={{ fontSize:10, color:'#166534', fontWeight:700 }}>TOTAL PAID</div>
            </div>
          </div>
        )}
      </div>

      {/* ── TAB: Pay Salary ── */}
      {tab === 'pay' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search employee…"
              style={{ ...SEL, minWidth:220 }}/>
            <span style={{ fontSize:12, color:'#6B7280' }}>{teachers.length} employees</span>
          </div>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {['#','Employee','Designation','Basic Salary','Month Status','Actions'].map(h=>(
                  <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {teachers.filter(t=>{
                const name = t.user?.name || '';
                return !search || name.toLowerCase().includes(search.toLowerCase()) || (t.employeeId||'').toLowerCase().includes(search.toLowerCase());
              }).map((t,i)=>{
                const slip = slipMap[t._id?.toString()];
                return (
                  <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                    <td style={{ padding:'10px 14px', color:'#9CA3AF' }}>{i+1}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700, color:'#111827' }}>{t.user?.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{t.employeeId||'No ID'}</div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{t.designation||'—'}</td>
                    <td style={{ padding:'10px 14px', fontWeight:700, color:'#1D4ED8' }}>{fmt(t.salary||0)}</td>
                    <td style={{ padding:'10px 14px' }}>{slip ? statusBadge(slip.status) : <span style={{ fontSize:11, color:'#9CA3AF' }}>Not paid</span>}</td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={()=>setModal({teacher:t, existing:slip})}
                          style={{ padding:'5px 12px', borderRadius:7, border:'none', background: slip?'#EFF6FF':'#0B1F4A', color:slip?'#1D4ED8':'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                          {slip ? '✏️ Edit' : '💳 Pay'}
                        </button>
                        {slip && (
                          <>
                            <button onClick={()=>printSlip(slip, 'The Future Step School')} style={{ padding:'5px 10px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, cursor:'pointer' }}>🖨️</button>
                            <button onClick={()=>deleteSlip(slip._id)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>🗑️</button>
                          </>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* ── TAB: Salary Paid Slips ── */}
      {tab === 'slips' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', borderBottom:'1px solid #F3F4F6' }}>
            <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search slips…" style={{ ...SEL, minWidth:220 }}/>
          </div>
          {loading ? <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading…</div>
          : slips.filter(s=>s.status==='paid').length === 0
          ? <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>
              <div style={{ fontSize:40, marginBottom:8 }}>🧾</div>
              <div style={{ fontWeight:700 }}>No paid slips for {FULL_MONTHS[month-1]} {year}</div>
            </div>
          : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Employee','Month','Basic','Gross','Deductions','Net Salary','Mode','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {slips.filter(s=>s.status==='paid').filter(s=>{
                  const name=s.teacher?.user?.name||'';
                  return !search || name.toLowerCase().includes(search.toLowerCase());
                }).map((s,i)=>(
                  <tr key={s._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ fontWeight:700 }}>{s.teacher?.user?.name||'—'}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{s.teacher?.employeeId||''}</div>
                    </td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{MONTHS[s.month-1]} {s.year}</td>
                    <td style={{ padding:'10px 14px' }}>{fmt(s.basicSalary)}</td>
                    <td style={{ padding:'10px 14px' }}>{fmt(s.grossSalary)}</td>
                    <td style={{ padding:'10px 14px', color:'#DC2626' }}>-{fmt(Object.values(s.deductions||{}).reduce((a,b)=>a+b,0))}</td>
                    <td style={{ padding:'10px 14px', fontWeight:800, color:'#166534', fontSize:14 }}>{fmt(s.netSalary)}</td>
                    <td style={{ padding:'10px 14px' }}><span style={{ fontSize:11, padding:'3px 8px', borderRadius:6, background:'#EFF6FF', color:'#1D4ED8', fontWeight:700 }}>{s.paymentMode?.toUpperCase()}</span></td>
                    <td style={{ padding:'10px 14px' }}>
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={()=>printSlip(s, 'The Future Step School')} style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>🖨️ Print</button>
                        <button onClick={()=>deleteSlip(s._id)} style={{ padding:'5px 10px', borderRadius:7, border:'none', background:'#FEF2F2', color:'#DC2626', fontSize:12, cursor:'pointer' }}>🗑️</button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: Salary Sheet ── */}
      {tab === 'sheet' && (
        <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', background:'#0B1F4A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <span style={{ fontWeight:700, color:'#fff', fontSize:14 }}>📋 Salary Sheet — {FULL_MONTHS[month-1]} {year}</span>
            <button onClick={()=>window.print()} style={{ padding:'6px 16px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>🖨️ Print Sheet</button>
          </div>
          {loading ? <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading…</div> : (
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {['#','Employee','ID','Designation','Basic','Allowances','Deductions','Net Salary','Status'].map(h=>(
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.map((row,i)=>{
                  const t = row.teacher;
                  const s = row.slip;
                  const totalAllow = s ? Object.values(s.allowances||{}).reduce((a,b)=>a+b,0) : 0;
                  const totalDeduct = s ? Object.values(s.deductions||{}).reduce((a,b)=>a+b,0) : 0;
                  return (
                    <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 14px', color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'10px 14px', fontWeight:700 }}>{t.user?.name||'—'}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12 }}>{t.employeeId||'—'}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{t.designation||'—'}</td>
                      <td style={{ padding:'10px 14px' }}>{fmt(s?.basicSalary||t.salary||0)}</td>
                      <td style={{ padding:'10px 14px', color:'#166534' }}>+{fmt(totalAllow)}</td>
                      <td style={{ padding:'10px 14px', color:'#DC2626' }}>-{fmt(totalDeduct)}</td>
                      <td style={{ padding:'10px 14px', fontWeight:800, color:'#0B1F4A', fontSize:14 }}>{fmt(s?.netSalary||t.salary||0)}</td>
                      <td style={{ padding:'10px 14px' }}>{statusBadge(row.status)}</td>
                    </tr>
                  );
                })}
                {/* Total row */}
                <tr style={{ background:'#0B1F4A' }}>
                  <td colSpan={7} style={{ padding:'12px 14px', color:'#fff', fontWeight:700, textAlign:'right' }}>TOTAL NET SALARY</td>
                  <td style={{ padding:'12px 14px', color:'#FCD34D', fontWeight:900, fontSize:16 }}>
                    {fmt(sheet.reduce((a,r)=>a+(r.slip?.netSalary||r.teacher?.salary||0),0))}
                  </td>
                  <td style={{ padding:'12px 14px', color:'rgba(255,255,255,0.6)', fontSize:12 }}>{sheet.filter(r=>r.status==='paid').length}/{sheet.length} paid</td>
                </tr>
              </tbody>
            </table>
          )}
        </div>
      )}

      {/* ── TAB: Salary Report ── */}
      {tab === 'report' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {/* Summary Cards */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:14 }}>
            {[
              { label:'Total Employees', val:sheet.length, color:'#1D4ED8', bg:'#EFF6FF', icon:'👥' },
              { label:'Salaries Paid',   val:sheet.filter(r=>r.status==='paid').length, color:'#166534', bg:'#DCFCE7', icon:'✅' },
              { label:'Pending',         val:sheet.filter(r=>r.status==='pending').length, color:'#92400E', bg:'#FEF9C3', icon:'⏳' },
              { label:'Total Disbursed', val:fmt(sheet.reduce((a,r)=>a+(r.slip?.netSalary||0),0)), color:'#7C3AED', bg:'#EDE9FE', icon:'💰' },
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

          {/* Report Table */}
          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ padding:'12px 16px', background:'#0B1F4A', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <span style={{ fontWeight:700, color:'#fff' }}>📊 Salary Report — {FULL_MONTHS[month-1]} {year}</span>
              <button onClick={()=>window.print()} style={{ padding:'6px 16px', borderRadius:8, border:'none', background:'rgba(255,255,255,0.15)', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>🖨️ Print</button>
            </div>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {['Employee','Basic','HRA','DA','TA','PF','Tax','Net','Payment Mode','Status'].map(h=>(
                    <th key={h} style={{ padding:'10px 12px', textAlign:'left', fontSize:10, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sheet.map((row,i)=>{
                  const s=row.slip;
                  return (
                    <tr key={row.teacher._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'9px 12px', fontWeight:700 }}>{row.teacher.user?.name||'—'}</td>
                      <td style={{ padding:'9px 12px' }}>{fmt(s?.basicSalary||row.teacher.salary||0)}</td>
                      <td style={{ padding:'9px 12px', color:'#166534' }}>{fmt(s?.allowances?.hra||0)}</td>
                      <td style={{ padding:'9px 12px', color:'#166534' }}>{fmt(s?.allowances?.da||0)}</td>
                      <td style={{ padding:'9px 12px', color:'#166534' }}>{fmt(s?.allowances?.ta||0)}</td>
                      <td style={{ padding:'9px 12px', color:'#DC2626' }}>{fmt(s?.deductions?.pf||0)}</td>
                      <td style={{ padding:'9px 12px', color:'#DC2626' }}>{fmt(s?.deductions?.tax||0)}</td>
                      <td style={{ padding:'9px 12px', fontWeight:800, color:'#0B1F4A' }}>{fmt(s?.netSalary||row.teacher.salary||0)}</td>
                      <td style={{ padding:'9px 12px' }}>{s?.paymentMode?.toUpperCase()||'—'}</td>
                      <td style={{ padding:'9px 12px' }}>{statusBadge(row.status)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Pay Modal */}
      {modal && (
        <PayModal
          teacher={modal.teacher}
          month={month} year={year}
          existing={modal.existing}
          onClose={()=>setModal(null)}
          onSave={()=>{ setModal(null); loadSlips(); }}
        />
      )}
    </div>
  );
}