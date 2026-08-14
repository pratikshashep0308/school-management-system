// frontend/src/pages/Expenses/ExpenseReports.js
import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { expenseAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n || 0);
const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

// ── SVG horizontal bar ────────────────────────────────────────────────────────
function HBar({ value, max, color = '#DC2626', label, sub }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0;
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
        <span style={{ fontWeight:700, color:'#374151' }}>{label}</span>
        <span style={{ fontWeight:800, color }}>{fmt(value)}</span>
      </div>
      <div style={{ height:8, background:'#F3F4F6', borderRadius:4, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background:color, borderRadius:4, transition:'width 0.6s' }} />
      </div>
      {sub && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

export default function ExpenseReports() {
  const [tab,         setTab]         = useState('monthly');
  const [month,       setMonth]       = useState(new Date().getMonth() + 1);
  const [year,        setYear]        = useState(new Date().getFullYear());
  const [reportData,  setReportData]  = useState(null);
  const [finData,     setFinData]     = useState(null);
  const [loading,     setLoading]     = useState(false);
  const [exporting,   setExporting]   = useState('');

  const loadReport = async () => {
    setLoading(true);
    try {
      const r = await expenseAPI.getReport(month, year);
      setReportData(r.data.data);
    } catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  };

  const loadFinance = async () => {
    setLoading(true);
    try {
      const r = await expenseAPI.getFinance({ month, year });
      setFinData(r.data.data);
    } catch { toast.error('Failed to load finance data'); }
    finally { setLoading(false); }
  };

  const handleExport = async (format) => {
    setExporting(format);
    try {
      const token = localStorage.getItem('token');
      const base  = process.env.REACT_APP_API_URL || 'http://localhost:5000/api';
      const url   = `${base}/expenses/export?format=${format}&month=${month}&year=${year}`;
      const res   = await fetch(url, { headers:{ Authorization:`Bearer ${token}` } });
      const blob  = await res.blob();
      const a     = document.createElement('a');
      a.href      = URL.createObjectURL(blob);
      a.download  = `expenses-${year}-${String(month).padStart(2,'0')}.${format}`;
      a.click();
      URL.revokeObjectURL(a.href);
      toast.success(`${format.toUpperCase()} downloaded`);
    } catch { toast.error('Export failed'); }
    finally { setExporting(''); }
  };

  const TAB = (active) => ({
    padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:700,
    border:'none', cursor:'pointer',
    background: active ? '#DC2626' : 'transparent',
    color: active ? '#fff' : '#6B7280',
  });

  return (
    <div>
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📈 Expense Reports</h2>
          <p className="text-sm text-muted">Generate detailed financial reports</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => handleExport('xlsx')} disabled={!!exporting}
            style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#F0FDF4', border:'1.5px solid #22C55E', color:'#15803D', cursor:'pointer', opacity:exporting==='xlsx'?0.6:1 }}>
            {exporting==='xlsx'?'⏳':'⬇'} Excel
          </button>
          <button onClick={() => handleExport('pdf')} disabled={!!exporting}
            style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#FEF2F2', border:'1.5px solid #EF4444', color:'#DC2626', cursor:'pointer', opacity:exporting==='pdf'?0.6:1 }}>
            {exporting==='pdf'?'⏳':'⬇'} PDF
          </button>
        </div>
      </div>

      {/* Tab + filter row */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:16, width:'fit-content' }}>
        <button style={TAB(tab==='monthly')} onClick={() => setTab('monthly')}>📅 Monthly</button>
        <button style={TAB(tab==='finance')} onClick={() => setTab('finance')}>💰 Income vs Expense</button>
      </div>

      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>Month</div>
          <select value={month} onChange={e => setMonth(Number(e.target.value))}
            style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, background:'#fff' }}>
            {MONTHS.map((m,i) => <option key={i+1} value={i+1}>{m}</option>)}
          </select>
        </div>
        <div>
          <div style={{ fontSize:10, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase' }}>Year</div>
          <select value={year} onChange={e => setYear(Number(e.target.value))}
            style={{ padding:'8px 12px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:13, background:'#fff' }}>
            {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
          </select>
        </div>
        <button onClick={tab==='monthly' ? loadReport : loadFinance} disabled={loading}
          className="btn-primary" style={{ background:'#DC2626', borderColor:'#DC2626' }}>
          {loading ? '⏳ Loading…' : '▶ Generate'}
        </button>
      </div>

      {/* Monthly Report */}
      {tab === 'monthly' && (
        loading ? <LoadingState /> : reportData ? (
          <div>
            {/* Summary bar */}
            <div style={{ background:'linear-gradient(135deg,#FEF2F2,#FFF1F1)', border:'1px solid #FECACA', borderRadius:12, padding:'16px 20px', marginBottom:20, display:'flex', gap:20, flexWrap:'wrap', alignItems:'center' }}>
              <div>
                <div style={{ fontSize:11, color:'#DC2626', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>Total Expenses</div>
                <div style={{ fontSize:28, fontWeight:900, color:'#B91C1C' }}>{fmt(reportData.grandTotal)}</div>
              </div>
              <div style={{ height:40, width:1, background:'#FECACA' }} />
              <div>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:700 }}>Month</div>
                <div style={{ fontSize:15, fontWeight:800, color:'#374151' }}>{MONTHS[month-1]} {year}</div>
              </div>
              <div>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:700 }}>Entries</div>
                <div style={{ fontSize:15, fontWeight:800, color:'#374151' }}>{reportData.expenses?.length || 0}</div>
              </div>
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
              {/* By category */}
              <div className="card" style={{ padding:20 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>📂 By Category</div>
                {reportData.byCategory?.length
                  ? reportData.byCategory.map((c,i) => (
                    <HBar key={i} label={`${c.icon||'💰'} ${c.name||'—'}`} value={c.total}
                      max={reportData.grandTotal} color={c.color||'#DC2626'}
                      sub={`${c.count} entries`} />
                  ))
                  : <div style={{ color:'#9CA3AF', fontSize:12 }}>No data</div>}
              </div>

              {/* By method */}
              <div className="card" style={{ padding:20 }}>
                <div style={{ fontWeight:700, fontSize:13, marginBottom:14 }}>💳 By Payment Method</div>
                {reportData.byMethod?.length
                  ? reportData.byMethod.map((m,i) => {
                    const colors = { cash:'#16A34A', upi:'#7C3AED', bank:'#2563EB', cheque:'#D97706', online:'#0891B2' };
                    return <HBar key={i} label={m._id?.charAt(0).toUpperCase()+m._id?.slice(1)||'—'}
                      value={m.total} max={reportData.grandTotal} color={colors[m._id]||'#6B7280'}
                      sub={`${m.count} transactions`} />;
                  })
                  : <div style={{ color:'#9CA3AF', fontSize:12 }}>No data</div>}
              </div>
            </div>

            {/* Expense table */}
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ padding:'12px 16px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:13 }}>
                Expense Entries — {MONTHS[month-1]} {year}
              </div>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
                  <thead>
                    <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                      {['Date','Category','Description','Amount','Method'].map(h => (
                        <th key={h} style={{ padding:'9px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {(reportData.expenses || []).map((e,i) => (
                      <tr key={e._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                        <td style={{ padding:'9px 14px', color:'#6B7280' }}>{new Date(e.date).toLocaleDateString('en-IN',{day:'numeric',month:'short'})}</td>
                        <td style={{ padding:'9px 14px' }}>
                          <span style={{ fontSize:10, fontWeight:700, color:e.category?.color||'#DC2626', background:`${e.category?.color||'#DC2626'}15`, padding:'2px 7px', borderRadius:10 }}>
                            {e.category?.icon} {e.category?.name||'—'}
                          </span>
                        </td>
                        <td style={{ padding:'9px 14px', fontWeight:600 }}>{e.description}</td>
                        <td style={{ padding:'9px 14px', fontWeight:800, color:'#DC2626' }}>{fmt(e.amount)}</td>
                        <td style={{ padding:'9px 14px', color:'#6B7280' }}>{e.paymentMethod}</td>
                      </tr>
                    ))}
                  </tbody>
                  <tfoot>
                    <tr style={{ background:'#FEF2F2', borderTop:'2px solid #FECACA' }}>
                      <td colSpan={3} style={{ padding:'9px 14px', fontWeight:800, color:'#DC2626' }}>TOTAL</td>
                      <td style={{ padding:'9px 14px', fontWeight:900, color:'#DC2626', fontSize:14 }}>{fmt(reportData.grandTotal)}</td>
                      <td />
                    </tr>
                  </tfoot>
                </table>
              </div>
            </div>
          </div>
        ) : (
          <EmptyState icon="📋" title="Generate a report" subtitle="Select month and year, then click Generate" />
        )
      )}

      {/* Income vs Expense */}
      {tab === 'finance' && (
        loading ? <LoadingState /> : finData ? (
          <div>
            {/* P&L summary */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:12, marginBottom:20 }}>
              {[
                { icon:'📥', label:'Total Income', val:finData.totalIncome,    color:'#16A34A', bg:'#F0FDF4' },
                { icon:'📤', label:'Total Expenses', val:finData.totalExpenses, color:'#DC2626', bg:'#FEF2F2' },
                { icon:finData.isProfit?'📈':'📉', label: finData.isProfit?'Net Profit':'Net Deficit',
                  val: Math.abs(finData.profit), color: finData.isProfit?'#16A34A':'#DC2626',
                  bg: finData.isProfit?'#F0FDF4':'#FEF2F2',
                  prefix: finData.isProfit ? '+' : '-' },
              ].map(c => (
                <div key={c.label} className="card" style={{ padding:'18px 20px', borderLeft:`4px solid ${c.color}`, background:c.bg }}>
                  <div style={{ fontSize:24, marginBottom:8 }}>{c.icon}</div>
                  <div style={{ fontSize:24, fontWeight:900, color:c.color }}>{c.prefix||''}{fmt(c.val)}</div>
                  <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginTop:3 }}>{c.label}</div>
                  <div style={{ fontSize:10, color:'#9CA3AF' }}>{c.label === 'Total Income' ? `Fee collections` : c.label === 'Total Expenses' ? `All time` : `${finData.profitPct}% margin`}</div>
                </div>
              ))}
            </div>

            {/* Visual bar */}
            <div className="card" style={{ padding:20, marginBottom:20 }}>
              <div style={{ fontWeight:700, fontSize:14, marginBottom:16 }}>Income vs Expense Overview</div>
              <HBar label="💰 Total Income (Fees Collected)" value={finData.totalIncome} max={Math.max(finData.totalIncome, finData.totalExpenses, 1)} color="#16A34A" />
              <HBar label="💸 Total Expenses" value={finData.totalExpenses} max={Math.max(finData.totalIncome, finData.totalExpenses, 1)} color="#DC2626" />
              <div style={{ marginTop:14, padding:'12px 16px', borderRadius:10, background: finData.isProfit?'#F0FDF4':'#FEF2F2', border:`1px solid ${finData.isProfit?'#22C55E':'#EF4444'}` }}>
                <span style={{ fontWeight:800, color:finData.isProfit?'#15803D':'#B91C1C', fontSize:14 }}>
                  {finData.isProfit ? '✅ School is in profit' : '⚠️ Expenses exceed income'}
                  {' · '}Net: {finData.isProfit?'+':'-'}{fmt(Math.abs(finData.profit))} ({finData.profitPct}%)
                </span>
              </div>
            </div>

            {/* Category breakdown */}
            {finData.categoryBreakdown?.length > 0 && (
              <div className="card" style={{ padding:20 }}>
                <div style={{ fontWeight:700, fontSize:14, marginBottom:14 }}>Expenses by Category</div>
                {finData.categoryBreakdown.map((c,i) => (
                  <HBar key={i} label={`${c.icon||'💰'} ${c.name||'—'}`} value={c.total}
                    max={finData.totalExpenses || 1} color={c.color||'#DC2626'}
                    sub={`${Math.round((c.total/Math.max(finData.totalExpenses,1))*100)}% of expenses`} />
                ))}
              </div>
            )}
          </div>
        ) : (
          <EmptyState icon="💰" title="Generate finance summary" subtitle="Click Generate to see income vs expense analysis" />
        )
      )}
    </div>
  );
}