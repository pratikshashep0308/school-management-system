// frontend/src/pages/Expenses/ExpenseList.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { expenseAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => new Intl.NumberFormat('en-IN', { style:'currency', currency:'INR', maximumFractionDigits:0 }).format(n || 0);

const PAYMENT_COLORS = { cash:'#16A34A', upi:'#7C3AED', bank:'#2563EB', cheque:'#D97706', online:'#0891B2' };

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];

export default function ExpenseList({ onAdd, initialFilter = 'all' }) {
  const [expenses,    setExpenses]    = useState([]);
  const [categories,  setCategories]  = useState([]);
  const [loading,     setLoading]     = useState(false);
  const [total,       setTotal]       = useState(0);
  const [grandTotal,  setGrandTotal]  = useState(0);
  const [page,        setPage]        = useState(1);
  const [pages,       setPages]       = useState(1);
  const [deleting,    setDeleting]    = useState(null);
  const [viewAtt,     setViewAtt]     = useState(null); // attachment preview

  // Apply initialFilter from dashboard card click
  const getInitialDates = () => {
    const now = new Date();
    if (initialFilter === 'today') return { month: now.getMonth()+1, year: now.getFullYear() };
    if (initialFilter === 'month') return { month: now.getMonth()+1, year: now.getFullYear() };
    if (initialFilter === 'year')  return { month: '',                year: now.getFullYear() };
    return { month: now.getMonth()+1, year: now.getFullYear() };
  };

  const [filters, setFilters] = useState({
    category: '', paymentMethod: '',
    ...getInitialDates(),
    search: '',
  });

  useEffect(() => {
    expenseAPI.getCategories().then(r => setCategories(r.data.data || [])).catch(() => {});
  }, []);

  const loadExpenses = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit: 20, ...filters };
      if (!params.category)      delete params.category;
      if (!params.paymentMethod) delete params.paymentMethod;
      if (!params.search)        delete params.search;
      const r = await expenseAPI.getAll(params);
      setExpenses(r.data.data || []);
      setTotal(r.data.total || 0);
      setPages(r.data.pages || 1);
      setGrandTotal(r.data.grandTotal || 0);
    } catch { toast.error('Failed to load expenses'); }
    finally { setLoading(false); }
  }, [filters, page]);

  useEffect(() => { loadExpenses(); }, [loadExpenses]);

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this expense?')) return;
    setDeleting(id);
    try {
      await expenseAPI.delete(id);
      toast.success('Expense deleted');
      loadExpenses();
    } catch { toast.error('Failed to delete'); }
    finally { setDeleting(null); }
  };

  const setF = (k, v) => { setFilters(p => ({ ...p, [k]:v })); setPage(1); };

  const INP = { padding:'7px 10px', border:'1px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div className="page-header" style={{ flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📋 Expenses</h2>
          <p className="text-sm text-muted">{total} entries · Total: <strong style={{ color:'#DC2626' }}>{fmt(grandTotal)}</strong></p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => expenseAPI.export({ month:filters.month, year:filters.year, format:'xlsx' }).then(r => {
            const url = URL.createObjectURL(new Blob([r.data]));
            const a = document.createElement('a'); a.href = url;
            a.download = `expenses-${filters.year}-${filters.month}.xlsx`; a.click(); URL.revokeObjectURL(url);
          }).catch(() => toast.error('Export failed'))}
            style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#F0FDF4', border:'1.5px solid #22C55E', color:'#15803D', cursor:'pointer' }}>
            ⬇ Excel
          </button>
          <button onClick={() => {
            const token = localStorage.getItem('token');
            const url = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/expenses/export?format=pdf&month=${filters.month}&year=${filters.year}`;
            fetch(url, { headers:{ Authorization:`Bearer ${token}` } }).then(r => r.blob()).then(blob => {
              const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download='expenses.pdf'; a.click();
            }).catch(() => toast.error('PDF export failed'));
          }} style={{ padding:'8px 14px', borderRadius:8, fontSize:12, fontWeight:700, background:'#FEF2F2', border:'1.5px solid #EF4444', color:'#DC2626', cursor:'pointer' }}>
            ⬇ PDF
          </button>
          <button onClick={onAdd} className="btn-primary" style={{ background:'#DC2626', borderColor:'#DC2626' }}>➕ Add</button>
        </div>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:16 }}>
        <input placeholder="🔍 Search…" value={filters.search} onChange={e => setF('search', e.target.value)}
          style={{ ...INP, width:160 }} />

        <select value={filters.category} onChange={e => setF('category', e.target.value)} style={INP}>
          <option value="">All Categories</option>
          {categories.map(c => <option key={c._id} value={c._id}>{c.icon} {c.name}</option>)}
        </select>

        <select value={filters.paymentMethod} onChange={e => setF('paymentMethod', e.target.value)} style={INP}>
          <option value="">All Methods</option>
          {['cash','upi','bank','cheque','online'].map(m => <option key={m} value={m}>{m.charAt(0).toUpperCase()+m.slice(1)}</option>)}
        </select>

        <select value={filters.month} onChange={e => setF('month', Number(e.target.value))} style={INP}>
          {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
        </select>

        <select value={filters.year} onChange={e => setF('year', Number(e.target.value))} style={INP}>
          {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
        </select>
      </div>

      {/* Table */}
      {loading ? <LoadingState /> : !expenses.length ? (
        <EmptyState icon="💸" title="No expenses found" subtitle="Add your first expense or adjust filters" />
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#1E3A8A' }}>
                  {['Date','Category','Description','Amount','Method','Receipt','Added By','Actions'].map(h => (
                    <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {expenses.map((e, i) => {
                  const cat = e.category;
                  return (
                    <tr key={e._id} style={{ borderBottom:'1px solid #F3F4F6', background: i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 14px', color:'#6B7280', whiteSpace:'nowrap' }}>
                        {new Date(e.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' })}
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        {cat ? (
                          <span style={{ display:'inline-flex', alignItems:'center', gap:5, padding:'3px 10px', borderRadius:20, background:`${cat.color}18`, color:cat.color, fontSize:11, fontWeight:700 }}>
                            {cat.icon} {cat.name}
                          </span>
                        ) : '—'}
                      </td>
                      <td style={{ padding:'10px 14px', maxWidth:220 }}>
                        <div style={{ overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap', fontWeight:600 }}>{e.description}</div>
                        {e.isRecurring && <span style={{ fontSize:9, color:'#7C3AED', fontWeight:800 }}>🔄 RECURRING</span>}
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:800, color:'#DC2626', whiteSpace:'nowrap' }}>{fmt(e.amount)}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color: PAYMENT_COLORS[e.paymentMethod] || '#374151', background:`${PAYMENT_COLORS[e.paymentMethod]}18`, padding:'2px 8px', borderRadius:10 }}>
                          {e.paymentMethod}
                        </span>
                      </td>
                      <td style={{ padding:'10px 14px' }}>
                        {e.attachmentUrl ? (
                          <button onClick={() => setViewAtt(e)} style={{ fontSize:11, color:'#2563EB', background:'#EFF6FF', border:'none', padding:'3px 8px', borderRadius:6, cursor:'pointer', fontWeight:600 }}>
                            {e.attachmentType === 'pdf' ? '📄 PDF' : '🖼 View'}
                          </button>
                        ) : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:11 }}>{e.createdBy?.name || '—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={() => handleDelete(e._id)} disabled={deleting===e._id}
                            style={{ fontSize:12, color:'#DC2626', background:'#FEF2F2', border:'none', padding:'4px 8px', borderRadius:6, cursor:'pointer' }}>
                            {deleting===e._id ? '⏳' : '🗑'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr style={{ background:'#FEF2F2', borderTop:'2px solid #FECACA' }}>
                  <td colSpan={3} style={{ padding:'10px 14px', fontWeight:800, color:'#DC2626' }}>TOTAL</td>
                  <td style={{ padding:'10px 14px', fontWeight:900, color:'#DC2626', fontSize:14 }}>{fmt(grandTotal)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>

          {/* Pagination */}
          {pages > 1 && (
            <div style={{ display:'flex', justifyContent:'center', gap:6, padding:'14px', borderTop:'1px solid #E5E7EB' }}>
              <button disabled={page===1} onClick={() => setPage(p => p-1)}
                style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #E5E7EB', cursor:page===1?'not-allowed':'pointer', background:'#fff', fontSize:12, opacity:page===1?0.5:1 }}>← Prev</button>
              <span style={{ padding:'5px 10px', fontSize:12, color:'#6B7280' }}>Page {page} of {pages}</span>
              <button disabled={page===pages} onClick={() => setPage(p => p+1)}
                style={{ padding:'5px 12px', borderRadius:7, border:'1px solid #E5E7EB', cursor:page===pages?'not-allowed':'pointer', background:'#fff', fontSize:12, opacity:page===pages?0.5:1 }}>Next →</button>
            </div>
          )}
        </div>
      )}

      {/* Attachment preview modal */}
      {viewAtt && (
        <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.7)', zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:20 }}
          onClick={() => setViewAtt(null)}>
          <div style={{ background:'#fff', borderRadius:14, padding:20, maxWidth:600, width:'100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
              <div style={{ fontWeight:700, fontSize:14 }}>Receipt — {viewAtt.description}</div>
              <button onClick={() => setViewAtt(null)} style={{ background:'none', border:'none', fontSize:20, cursor:'pointer' }}>×</button>
            </div>
            {viewAtt.attachmentType === 'pdf' ? (
              <a href={viewAtt.attachmentUrl} target="_blank" rel="noreferrer"
                style={{ display:'block', textAlign:'center', padding:20, color:'#2563EB', fontWeight:700, fontSize:14 }}>
                📄 Open PDF in new tab
              </a>
            ) : (
              <img src={viewAtt.attachmentUrl} alt="Receipt" style={{ width:'100%', borderRadius:8, objectFit:'contain', maxHeight:400 }} />
            )}
            <div style={{ marginTop:10, fontSize:12, color:'#9CA3AF', display:'flex', justifyContent:'space-between' }}>
              <span>{new Date(viewAtt.date).toLocaleDateString('en-IN')}</span>
              <span style={{ fontWeight:700, color:'#DC2626' }}>₹{viewAtt.amount?.toLocaleString('en-IN')}</span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}