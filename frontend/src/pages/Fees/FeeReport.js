// frontend/src/pages/Fees/FeeReport.js
// Powerful fee report: School / Class / Individual views
// Features: filters, search, status breakdown, history, defaulters, export

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';
import FeeEditRequestModal from '../../components/fees/FeeEditRequestModal';

const fmt   = n  => `₹${Math.round(n||0).toLocaleString('en-IN')}`;
const pct   = (a,b) => b > 0 ? Math.min(100, Math.round((a/b)*100)) : 0;
const today = new Date();

const STATUS = {
  paid:    { bg:'#D1FAE5', color:'#065F46', label:'Paid',    dot:'#16A34A' },
  partial: { bg:'#DBEAFE', color:'#1E40AF', label:'Partial', dot:'#3B82F6' },
  not_paid:{ bg:'#FEE2E2', color:'#991B1B', label:'Unpaid',  dot:'#DC2626' },
  overdue: { bg:'#FEE2E2', color:'#991B1B', label:'Overdue', dot:'#DC2626' },
  pending: { bg:'#FEF3C7', color:'#92400E', label:'Pending', dot:'#D97706' },
};

function Bar({ value, color = '#16A34A', height = 6 }) {
  return (
    <div style={{ height, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
      <div style={{ height:'100%', width:`${Math.min(100,value||0)}%`, background:color, borderRadius:3, transition:'width 0.8s' }}/>
    </div>
  );
}

// ── Payment History Panel ─────────────────────────────────────────────────────
function StudentHistoryPanel({ student, onClose }) {
  const [detail,  setDetail]  = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feeAPI.getStudentFee(student.student?._id)
      .then(r => setDetail(r.data))
      .catch(() => toast.error('Failed to load'))
      .finally(() => setLoading(false));
  }, [student]);

  const name = student.student?.user?.name || '—';
  const payHistory = detail?.data?.paymentHistory || [];
  const assignments = detail?.assignments || [];

  // Local copy so we can remove rows without re-fetching
  const [localPayments, setLocalPayments] = useState([]);
  useEffect(() => { setLocalPayments(payHistory); }, [detail]);

  // Payment selected for an edit request (needs second-admin approval)
  const [editPayment, setEditPayment] = useState(null);

  const handleDeletePayment = async (receiptNumber) => {
    if (!receiptNumber) return toast.error('Receipt number missing');
    if (!window.confirm(`Delete this payment (${receiptNumber})?\n\nThis cannot be undone. The student's balance will be recalculated.`)) return;
    try {
      await feeAPI.deletePayment(receiptNumber);
      setLocalPayments(prev => prev.filter(p => p.receiptNumber !== receiptNumber));
      toast.success('Payment deleted');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}>
      <div onClick={onClose} style={{ flex:1, background:'rgba(0,0,0,0.4)' }}/>
      <div style={{ width:560, background:'#fff', display:'flex', flexDirection:'column', boxShadow:'-8px 0 32px rgba(0,0,0,0.15)', overflowY:'auto' }}>
        {/* Header */}
        <div style={{ background:'#0B1F4A', padding:'20px 24px', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
            <div>
              <div style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
                {student.class?.name} {student.class?.section||''} · Roll {student.student?.rollNumber||'—'}
              </div>
            </div>
            <button onClick={onClose} style={{ background:'rgba(255,255,255,0.1)', border:'none', color:'#fff', width:32, height:32, borderRadius:8, cursor:'pointer', fontSize:18 }}>×</button>
          </div>
          {/* Mini stats */}
          <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginTop:16 }}>
            {[
              { l:'Total Fees',  v:fmt(student.totalFees),      c:'#FCD34D' },
              { l:'Paid',        v:fmt(student.paidAmount),      c:'#86EFAC' },
              { l:'Balance',     v:fmt(student.pendingAmount||0),c:student.pendingAmount>0?'#FCA5A5':'#86EFAC' },
            ].map(f=>(
              <div key={f.l} style={{ background:'rgba(255,255,255,0.08)', borderRadius:9, padding:'10px 12px' }}>
                <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700, textTransform:'uppercase' }}>{f.l}</div>
                <div style={{ fontSize:16, fontWeight:900, color:f.c, marginTop:3 }}>{f.v}</div>
              </div>
            ))}
          </div>
        </div>

        <div style={{ padding:'20px 24px', flex:1 }}>
          {loading ? <LoadingState /> : (
            <>
              {/* Assignments */}
              {assignments.length > 0 && (
                <div style={{ marginBottom:24 }}>
                  <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'#111827' }}>📋 Fee Assignments</div>
                  {assignments.map((a,i) => {
                    const ss = STATUS[a.status] || STATUS.pending;
                    const pending = a.pendingAmount ?? (a.finalAmount - a.paidAmount);
                    return (
                      <div key={i} style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 14px', marginBottom:8, display:'flex', alignItems:'center', gap:12 }}>
                        <div style={{ flex:1 }}>
                          <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{a.feeType?.name||'—'}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{a.dueDate?`Due: ${new Date(a.dueDate).toLocaleDateString('en-IN')}`:''} {a.month||''}</div>
                        </div>
                        <div style={{ textAlign:'right' }}>
                          <div style={{ fontSize:14, fontWeight:800, color:'#111827' }}>{fmt(a.finalAmount)}</div>
                          {pending > 0 && <div style={{ fontSize:11, color:'#DC2626', fontWeight:600 }}>Due: {fmt(pending)}</div>}
                        </div>
                        <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20, flexShrink:0 }}>{ss.label}</span>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* Payment History */}
              <div style={{ fontWeight:700, fontSize:14, marginBottom:12, color:'#111827' }}>
                📜 Payment History ({localPayments.length} transactions)
              </div>
              {!localPayments.length ? (
                <div style={{ textAlign:'center', padding:'30px', color:'#9CA3AF' }}>
                  <div style={{ fontSize:28, marginBottom:8 }}>💳</div>
                  <div>No payments recorded yet</div>
                </div>
              ) : localPayments.map((p,i) => (
                <div key={i} style={{ borderBottom:'0.5px solid #F3F4F6', padding:'12px 0', display:'flex', alignItems:'center', gap:12 }}>
                  <div style={{ width:38, height:38, borderRadius:10, background:'#F0FDF4', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:16 }}>✅</div>
                  <div style={{ flex:1 }}>
                    <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{fmt(p.amount)}</div>
                    <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{p.month||'—'} · {p.paidOn?new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <span style={{ fontSize:11, fontWeight:700, background:'#EFF6FF', color:'#1E40AF', padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>{p.method||'cash'}</span>
                    {p.receiptNumber && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3, fontFamily:'monospace' }}>{p.receiptNumber}</div>}
                  </div>
                  <button
                    onClick={() => setEditPayment(p)}
                    title="Request an edit (needs approval by another admin)"
                    style={{ flexShrink:0, background:'#EFF6FF', border:'1px solid #BFDBFE', color:'#1E40AF', borderRadius:7, padding:'6px 10px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    ✏️
                  </button>
                  <button
                    onClick={() => handleDeletePayment(p.receiptNumber)}
                    title="Delete this payment"
                    style={{ flexShrink:0, background:'#FEF2F2', border:'1px solid #FECACA', color:'#991B1B', borderRadius:7, padding:'6px 10px', fontSize:12, fontWeight:700, cursor:'pointer' }}>
                    🗑
                  </button>
                </div>
              ))}

              {/* Total summary */}
              {localPayments.length > 0 && (
                <div style={{ marginTop:16, background:'#F0FDF4', borderRadius:10, padding:'12px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
                  <span style={{ fontSize:13, fontWeight:700, color:'#065F46' }}>Total Paid</span>
                  <span style={{ fontSize:18, fontWeight:900, color:'#16A34A' }}>{fmt(localPayments.reduce((s,p)=>s+p.amount,0))}</span>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {editPayment && (
        <FeeEditRequestModal
          payment={editPayment}
          onClose={() => setEditPayment(null)}
        />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function FeeReport() {
  const [loading,     setLoading]     = useState(true);
  const [classes,     setClasses]     = useState([]);
  const [students,    setStudents]    = useState([]);
  const [classId,     setClassId]     = useState('');
  const [statusFilter,setStatusFilter]= useState('');
  const [search,      setSearch]      = useState('');
  const [sortBy,      setSortBy]      = useState('name'); // name | paid | pending | roll
  const [activeView,  setActiveView]  = useState('all'); // all | defaulters | paid | partial
  const [section,     setSection]     = useState('school'); // school | classwise | studentwise
  const [panelStudent,setPanelStudent]= useState(null);
  const [summary,     setSummary]     = useState(null);
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [deleting,    setDeleting]    = useState(false);

  const toggleSelect = (id) => {
    setSelectedIds(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };
  const clearSelection = () => setSelectedIds(new Set());

  const handleDeleteSingle = async (s) => {
    const name = s.student?.user?.name || 'this record';
    if (!window.confirm(`Delete fee record for ${name}?\n\nThis removes the entire ledger and all linked payments.\nThis cannot be undone.`)) return;
    setDeleting(true);
    try {
      await feeAPI.deleteLedger(s._id);
      setStudents(prev => prev.filter(x => x._id !== s._id));
      setSelectedIds(prev => { const n = new Set(prev); n.delete(s._id); return n; });
      toast.success('Record deleted');
    } catch (e) {
      toast.error(e.response?.data?.message || 'Delete failed');
    } finally { setDeleting(false); }
  };

  const handleDeleteSelected = async () => {
    const ids = Array.from(selectedIds);
    if (!ids.length) return;
    if (!window.confirm(`Delete ${ids.length} fee record(s)?\n\nThis removes those ledgers and all linked payments.\nThis cannot be undone.`)) return;
    setDeleting(true);
    try {
      const r = await feeAPI.bulkDeleteLedgers(ids);
      setStudents(prev => prev.filter(x => !selectedIds.has(x._id)));
      clearSelection();
      toast.success(`Deleted ${r.data.deletedCount} record(s)`);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Bulk delete failed');
    } finally { setDeleting(false); }
  };

  // Load classes + school summary
  useEffect(() => {
    Promise.all([
      classAPI.getAll().catch(()=>({ data:{ data:[] } })),
      feeAPI.getClassSummary().catch(()=>({ data:{ data:{} } })),
    ]).then(([cRes, sRes]) => {
      setClasses(cRes.data.data || []);
      setSummary(sRes.data.data);
    });
  }, []);

  // Load students
  const loadStudents = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (classId) params.classId = classId;
      if (statusFilter) params.status = statusFilter;
      const fn = feeAPI.getStudentsFees || feeAPI.getStudents || feeAPI.getStudents;
      const r = await fn(params);
      setStudents(r.data.data || []);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [classId, statusFilter]);

  useEffect(() => { loadStudents(); }, [loadStudents]);

  // Compute school totals from students
  const schoolTotal     = students.reduce((s,st)=>s+(st.totalFees||0),0);
  const schoolCollected = students.reduce((s,st)=>s+(st.paidAmount||0),0);
  const schoolPending   = students.reduce((s,st)=>s+(st.pendingAmount||0),0);
  const paidCount       = students.filter(s=>s.paymentStatus==='paid').length;
  const partialCount    = students.filter(s=>s.paymentStatus==='partial').length;
  const unpaidCount     = students.filter(s=>['not_paid','pending'].includes(s.paymentStatus)).length;
  const collRate        = pct(schoolCollected, schoolTotal);

  // Filter + sort + view
  const filtered = students
    .filter(s => {
      const name = s.student?.user?.name?.toLowerCase()||'';
      const matchSearch = !search || name.includes(search.toLowerCase()) || s.student?.rollNumber?.toString().includes(search);
      const matchView =
        activeView==='all'        ? true :
        activeView==='defaulters' ? ['not_paid','pending'].includes(s.paymentStatus) :
        activeView==='paid'       ? s.paymentStatus==='paid' :
        activeView==='partial'    ? s.paymentStatus==='partial' : true;
      return matchSearch && matchView;
    })
    .sort((a,b)=>{
      if (sortBy==='name')    return (a.student?.user?.name||'').localeCompare(b.student?.user?.name||'');
      if (sortBy==='paid')    return (b.paidAmount||0) - (a.paidAmount||0);
      if (sortBy==='pending') return (b.pendingAmount||0) - (a.pendingAmount||0);
      if (sortBy==='roll')    return (a.student?.rollNumber||0) - (b.student?.rollNumber||0);
      return 0;
    });

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  // ── Report exports ─────────────────────────────────────────────────────────
  const reportTitle = () => {
    const cls = classId ? (classes.find(c=>c._id===classId)?.name || 'Class') : 'All Classes';
    const view = activeView==='all' ? 'All Students' : activeView.charAt(0).toUpperCase()+activeView.slice(1);
    return `Fee Report — ${cls} — ${view}`;
  };

  const rowsForExport = () => filtered.map((s,i)=>([
    i+1,
    s.student?.rollNumber || '—',
    s.student?.user?.name || '—',
    `${s.student?.class?.name||''} ${s.student?.class?.section||''}`.trim() || '—',
    Math.round(s.totalFees||0),
    Math.round(s.paidAmount||0),
    Math.round(s.pendingAmount||0),
    (s.paymentStatus||'pending').toUpperCase(),
  ]));

  const COLS = ['#','Roll','Student','Class','Total (₹)','Paid (₹)','Pending (₹)','Status'];

  const escCsv = (v) => { const t=String(v??''); return /[",\n]/.test(t)?`"${t.replace(/"/g,'""')}"`:t; };

  const exportExcel = async () => {
    const d = await fetchCategoryData();
    if (d === null) return;
    const { top, sub, body, grand } = flattenCategory(d);
    const { totals } = d;

    const meta = [
      ['Fee Report', reportTitle()],
      ['Generated', new Date().toLocaleString('en-IN')],
      ['Students', d.rows.length],
      ['Total Expected', Math.round(totals.expected)],
      ['Total Collected', Math.round(totals.paid)],
      ['Total Pending', Math.round(totals.pending)],
      ['Collection Rate', totals.collectionRate + '%'],
      [],
    ];

    // Amounts go out as plain numbers, not "₹9,400" — a spreadsheet cannot sum
    // a formatted string, and summing is why somebody opens the CSV.
    const lines = [
      ...meta.map((r) => r.map(escCsv).join(',')),
      top.map(escCsv).join(','),
      sub.map(escCsv).join(','),
      ...body.map((r) => r.map(escCsv).join(',')),
      grand.map(escCsv).join(','),
    ];

    const blob = new Blob(['\uFEFF' + lines.join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a2 = document.createElement('a');
    a2.href = url;
    a2.download = `${reportTitle().replace(/[^\w]+/g, '_')}_category.csv`;
    a2.click();
    URL.revokeObjectURL(url);
    toast.success('Excel (CSV) downloaded');
  };

  const buildReportHTML = () => {
    const rows = rowsForExport();
    const esc = (v)=>String(v??'').replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    return `<html><head><title>${esc(reportTitle())}</title><style>
      body{font-family:system-ui,Arial,sans-serif;margin:24px;color:#111827;}
      h1{font-size:18px;color:#0B1F4A;margin:0 0 2px;}
      .sub{color:#6B7280;font-size:12px;margin-bottom:14px;}
      .kpis{display:flex;gap:10px;margin-bottom:16px;flex-wrap:wrap;}
      .kpi{border:1px solid #E5E7EB;border-radius:8px;padding:8px 14px;font-size:12px;}
      .kpi b{display:block;font-size:16px;color:#0B1F4A;}
      table{width:100%;border-collapse:collapse;font-size:11px;}
      th{background:#0B1F4A;color:#fff;text-align:left;padding:6px 8px;}
      td{padding:6px 8px;border-bottom:1px solid #F3F4F6;}
      tr:nth-child(even) td{background:#F9FAFB;}
      @media print{body{margin:12mm;}}
    </style></head><body>
      <h1>📊 ${esc(reportTitle())}</h1>
      <div class="sub">The Future Step School · ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})} · ${rows.length} students</div>
      <div class="kpis">
        <div class="kpi">Expected<b>₹${Math.round(schoolTotal).toLocaleString('en-IN')}</b></div>
        <div class="kpi">Collected<b>₹${Math.round(schoolCollected).toLocaleString('en-IN')}</b></div>
        <div class="kpi">Pending<b>₹${Math.round(schoolTotal-schoolCollected).toLocaleString('en-IN')}</b></div>
        <div class="kpi">Rate<b>${collRate}%</b></div>
      </div>
      <table><thead><tr>${COLS.map(c=>`<th>${esc(c)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map(r=>`<tr>${r.map(c=>`<td>${esc(c)}</td>`).join('')}</tr>`).join('')}</tbody></table>
    </body></html>`;
  };


  /**
   * Category-wise PDF — one row per student, every fee category in the same
   * report.
   *
   * Separate from exportPDF() rather than replacing it: the existing summary
   * report is what most people want most of the time, and a nine-column-wide
   * landscape sheet is not an improvement when you only need a total.
   *
   * Fetches its own data. The list on screen carries totals only; category
   * figures need assignments joined to receipt breakdowns, which is what
   * /fees/category-report does.
   */

  /**
   * The category report, fetched once and shaped for whichever export asked.
   *
   * All four exports now show the same figures — the only difference is the
   * format. Building the category logic separately in each would guarantee they
   * drift apart, and a CSV that disagrees with the PDF is worse than not having
   * the CSV.
   *
   * Returns null and shows the reason if it fails, so callers can stop rather
   * than emitting an empty file.
   */
  const fetchCategoryData = async () => {
    try {
      const params = {};
      if (classId) params.classId = classId;
      if (statusFilter) params.status = statusFilter;
      const res = await feeAPI.getCategoryReport(params);
      const d = res?.data?.data ?? res?.data;
      if (!d || !Array.isArray(d.rows)) throw new Error('Unexpected response');
      return d;
    } catch (err) {
      toast.error('Could not load the category report: '
        + String(err?.response?.data?.message || err.message));
      return null;
    }
  };

  /**
   * Flatten to header + rows for the text formats (CSV, Markdown).
   *
   * Two header lines, because a single line cannot express "School Fee" spanning
   * three sub-columns. CSV readers and Markdown both cope with that; a merged
   * cell would not survive either.
   */
  const flattenCategory = (d) => {
    const { columns = [], rows = [], totals = {} } = d;
    const anyUnalloc = totals.unallocated > 0;

    const top = ['', '', '', ''];
    const sub = ['#', 'Roll No', 'Student', 'Class'];
    columns.forEach((c) => { top.push(c, '', ''); sub.push('Total', 'Paid', 'Pending'); });
    if (anyUnalloc) { top.push('Unallocated'); sub.push(''); }
    top.push('Overall', '', ''); sub.push('Total', 'Paid', 'Pending');
    top.push(''); sub.push('Status');

    const body = rows.map((r, i) => {
      const line = [i + 1, r.rollNumber, r.name, r.className];
      columns.forEach((c) => {
        const k = r.categories[c] || { expected: 0, paid: 0, pending: 0 };
        line.push(k.expected, k.paid, k.pending);
      });
      if (anyUnalloc) line.push(r.unallocated || 0);
      line.push(r.total.expected, r.total.paid, r.total.pending, r.status);
      return line;
    });

    // Grand total as a row, so it survives into a spreadsheet rather than being
    // a footer somebody has to retype.
    const grand = ['', '', `GRAND TOTAL — ${rows.length} students`, ''];
    columns.forEach((c) => {
      const k = d.byCategory[c] || { expected: 0, paid: 0, pending: 0 };
      grand.push(k.expected, k.paid, k.pending);
    });
    if (anyUnalloc) grand.push(totals.unallocated);
    grand.push(totals.expected, totals.paid, totals.pending, totals.collectionRate + '%');

    return { top, sub, body, grand, anyUnalloc };
  };

  const exportCategoryPDF = async () => {
    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups'); return; }
    w.document.write('<p style="font-family:system-ui;padding:24px">Preparing the report…</p>');

    try {
      const d = await fetchCategoryData();
      if (d === null) { w.close(); return; }
      const { columns = [], rows = [], totals = {}, byCategory = {} } = d;

      if (rows.length === 0) {
        w.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px">No students matched these filters.</p>';
        return;
      }

      const esc = (v) => String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
      const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');
      const cls = classId ? (classes.find(c => c._id === classId)?.name || 'Class') : 'All Classes';

      // Three sub-columns per category plus four fixed and three overall. Past
      // roughly six categories A4 landscape stops being readable, so the page
      // steps up to A3 rather than shrinking the type to fit.
      const wide = columns.length > 4;
      const anyUnallocated = totals.unallocated > 0;
      const overpaidRows = rows.filter(r => (r.overpaid || []).length > 0);

      const html = `<html><head><title>Fee Report — ${esc(cls)}</title><style>
        @page { size: ${wide ? 'A3' : 'A4'} landscape; margin: 10mm; }
        body { font-family: system-ui, Arial, sans-serif; color:#111827; margin:0; }
        h1 { font-size:17px; color:#0B1F4A; margin:0 0 2px; }
        .sub { color:#6B7280; font-size:11px; margin-bottom:12px; }
        .kpis { display:flex; gap:8px; margin-bottom:10px; flex-wrap:wrap; }
        .kpi { border:1px solid #E5E7EB; border-radius:6px; padding:6px 12px; font-size:10px; }
        .kpi b { display:block; font-size:14px; color:#0B1F4A; }
        table { width:100%; border-collapse:collapse; font-size:9px; }
        th { background:#0B1F4A; color:#fff; padding:4px 5px; text-align:left; font-weight:600; }
        th.grp { text-align:center; border-left:2px solid #fff; }
        td { padding:3px 5px; border-bottom:1px solid #F3F4F6; }
        td.n { text-align:right; font-variant-numeric:tabular-nums; }
        tr:nth-child(even) td { background:#F9FAFB; }
        tfoot td { font-weight:700; border-top:2px solid #0B1F4A; background:#EEF2FF !important; }
        /* Headers repeat on every printed page — a continuation sheet of bare
           numbers is unreadable. */
        thead { display:table-header-group; }
        tr { break-inside:avoid; }
        .note { margin-top:10px; font-size:9px; color:#6B7280; line-height:1.5; }
        .warn { color:#B45309; }
      </style></head><body>
        <h1>Fee Report — ${esc(cls)}</h1>
        <div class="sub">The Future Step School · Academic Year 2026–27 ·
          ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })} ·
          ${rows.length} student${rows.length === 1 ? '' : 's'}</div>

        <div class="kpis">
          <div class="kpi">Expected<b>${money(totals.expected)}</b></div>
          <div class="kpi">Collected<b>${money(totals.paid)}</b></div>
          <div class="kpi">Pending<b>${money(totals.pending)}</b></div>
          <div class="kpi">Collection<b>${totals.collectionRate}%</b></div>
          ${columns.map(c => `<div class="kpi">${esc(c)}<b>${money(byCategory[c]?.paid)}</b>
            <span style="color:#6B7280">of ${money(byCategory[c]?.expected)}</span></div>`).join('')}
        </div>

        <table>
          <thead>
            <tr>
              <th rowspan="2">#</th>
              <th rowspan="2">Roll No</th>
              <th rowspan="2">Student</th>
              <th rowspan="2">Class</th>
              ${columns.map(c => `<th class="grp" colspan="3">${esc(c).toUpperCase()}</th>`).join('')}
              ${anyUnallocated ? '<th class="grp" rowspan="2">Unallocated</th>' : ''}
              <th class="grp" colspan="3">OVERALL</th>
              <th rowspan="2">Status</th>
            </tr>
            <tr>
              ${columns.map(() => '<th>Total</th><th>Paid</th><th>Pending</th>').join('')}
              <th>Total</th><th>Paid</th><th>Pending</th>
            </tr>
          </thead>
          <tbody>
            ${rows.map((r, i) => `<tr>
              <td>${i + 1}</td>
              <td>${esc(r.rollNumber)}</td>
              <td>${esc(r.name)}</td>
              <td>${esc(r.className)}</td>
              ${columns.map(c => {
                const k = r.categories[c] || { expected:0, paid:0, pending:0 };
                const flag = (r.overpaid || []).includes(c) ? ' class="n warn"' : ' class="n"';
                return `<td class="n">${money(k.expected)}</td><td${flag}>${money(k.paid)}</td><td class="n">${money(k.pending)}</td>`;
              }).join('')}
              ${anyUnallocated ? `<td class="n">${r.unallocated ? money(r.unallocated) : '—'}</td>` : ''}
              <td class="n">${money(r.total.expected)}</td>
              <td class="n">${money(r.total.paid)}</td>
              <td class="n">${money(r.total.pending)}</td>
              <td>${esc(r.status)}</td>
            </tr>`).join('')}
          </tbody>
          <tfoot>
            <tr>
              <td colspan="4">GRAND TOTAL — ${rows.length} student${rows.length === 1 ? '' : 's'}</td>
              ${columns.map(c => {
                const k = byCategory[c] || { expected:0, paid:0, pending:0 };
                return `<td class="n">${money(k.expected)}</td><td class="n">${money(k.paid)}</td><td class="n">${money(k.pending)}</td>`;
              }).join('')}
              ${anyUnallocated ? `<td class="n">${money(totals.unallocated)}</td>` : ''}
              <td class="n">${money(totals.expected)}</td>
              <td class="n">${money(totals.paid)}</td>
              <td class="n">${money(totals.pending)}</td>
              <td>${totals.collectionRate}%</td>
            </tr>
          </tfoot>
        </table>

        <div class="note">
          Expected comes from fee assignments; paid comes from the category breakdown
          recorded on each receipt.
          ${anyUnallocated ? `<br><span class="warn">${money(totals.unallocated)} was paid without a category breakdown.</span>
            It is included in Overall Paid but not attributed to any category — deliberately
            not spread across them, since no such split was recorded.` : ''}
          ${overpaidRows.length > 0 ? `<br><span class="warn">${overpaidRows.length} student(s) show more paid than assigned in a
            category (marked in amber).</span> Usually a payment against something never formally assigned — worth checking.` : ''}
        </div>
      </body></html>`;

      w.document.open();
      w.document.write(html);
      w.document.close();
      w.focus();
      setTimeout(() => w.print(), 600);
    } catch (err) {
      w.document.body.innerHTML = '<p style="font-family:system-ui;padding:24px;color:#B91C1C">'
        + 'Could not build the report: ' + String(err?.response?.data?.message || err.message) + '</p>';
      toast.error('Could not build the category report');
    }
  };

  const exportPDF = () => {
    const w = window.open('','_blank');
    if(!w){ toast.error('Please allow pop-ups'); return; }
    w.document.write(buildReportHTML()); w.document.close(); w.focus();
    setTimeout(()=>w.print(), 400);
  };

  const exportMarkdown = async () => {
    const d = await fetchCategoryData();
    if (d === null) return;
    const { body, grand, anyUnalloc } = flattenCategory(d);
    const { columns, totals } = d;

    let md = `# ${reportTitle()}\n\n`;
    md += `**Generated:** ${new Date().toLocaleString('en-IN')}\n\n`;
    md += `- Students: ${d.rows.length}\n`;
    md += `- Total Expected: ₹${Math.round(totals.expected).toLocaleString('en-IN')}\n`;
    md += `- Total Collected: ₹${Math.round(totals.paid).toLocaleString('en-IN')}\n`;
    md += `- Total Pending: ₹${Math.round(totals.pending).toLocaleString('en-IN')}\n`;
    md += `- Collection Rate: ${totals.collectionRate}%\n\n`;

    md += `## By category\n\n| Category | Expected | Collected | Pending |\n|---|---|---|---|\n`;
    columns.forEach((c2) => {
      const k = d.byCategory[c2] || {};
      md += `| ${c2} | ₹${Math.round(k.expected || 0).toLocaleString('en-IN')} `
          + `| ₹${Math.round(k.paid || 0).toLocaleString('en-IN')} `
          + `| ₹${Math.round(k.pending || 0).toLocaleString('en-IN')} |\n`;
    });

    md += `\n## Students\n\n`;

    // Markdown cannot span columns, so the category name folds into each
    // sub-header — "School Fee Paid" rather than a group row that would not render.
    const header = ['#', 'Roll No', 'Student', 'Class'];
    columns.forEach((c2) => header.push(`${c2} Total`, `${c2} Paid`, `${c2} Pending`));
    if (anyUnalloc) header.push('Unallocated');
    header.push('Overall Total', 'Overall Paid', 'Overall Pending', 'Status');

    md += `| ${header.join(' | ')} |\n| ${header.map(() => '---').join(' | ')} |\n`;
    md += body.map((r) => `| ${r.join(' | ')} |`).join('\n');
    md += `\n| ${grand.join(' | ')} |\n`;

    if (totals.unallocated > 0) {
      md += `\n> ₹${Math.round(totals.unallocated).toLocaleString('en-IN')} was paid without a `
          + `category breakdown. It is included in Overall Paid but not attributed to any category.\n`;
    }

    const blob = new Blob([md], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a3 = document.createElement('a');
    a3.href = url;
    a3.download = `${reportTitle().replace(/[^\w]+/g, '_')}_category.md`;
    a3.click();
    URL.revokeObjectURL(url);
    toast.success('Markdown downloaded');
  };

  return (
    <div>
      {/* Title */}
      <div style={{ marginBottom:20, display:'flex', justifyContent:'space-between', alignItems:'flex-start', flexWrap:'wrap', gap:12 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📊 Fee Report</h2>
          <p className="text-sm text-muted mt-0.5">School-wide fee collection overview and student-wise details</p>
        </div>
        <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={exportCategoryPDF} title="Full report — School Fee, Bus Fee and Stationery per student → Save as PDF"
            style={{ padding:'8px 14px', borderRadius:9, border:'none', background:'#DC2626', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>📄 PDF</button>
          <button onClick={exportCategoryPDF} title="Print the full category report"
            style={{ padding:'8px 14px', borderRadius:9, border:'1.5px solid #0B1F4A', background:'#fff', color:'#0B1F4A', fontSize:12, fontWeight:700, cursor:'pointer' }}>🖨️ Print</button>
          <button onClick={exportExcel} title="Download as Excel (CSV)"
            style={{ padding:'8px 14px', borderRadius:9, border:'none', background:'#16A34A', color:'#fff', fontSize:12, fontWeight:700, cursor:'pointer' }}>📊 Excel</button>
          <button onClick={exportMarkdown} title="Download as Markdown"
            style={{ padding:'8px 14px', borderRadius:9, border:'1.5px solid #6B7280', background:'#fff', color:'#374151', fontSize:12, fontWeight:700, cursor:'pointer' }}>📝 MD</button>
        </div>
      </div>

      {/* ── Section tabs: Whole School / Class-wise / Student-wise ── */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:12, padding:4, width:'fit-content', marginBottom:18 }}>
        {[
          { key:'school',      label:'🏫 Whole School' },
          { key:'classwise',   label:'📚 Class-wise' },
          { key:'studentwise', label:'👤 Student-wise' },
        ].map(t=>(
          <button key={t.key} onClick={()=>setSection(t.key)}
            style={{ padding:'8px 18px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
              background: section===t.key ? '#fff' : 'transparent',
              color: section===t.key ? '#1D4ED8' : '#6B7280',
              boxShadow: section===t.key ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── Top KPI strip ── */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(6,1fr)', gap:10, marginBottom:20 }}>
        {[
          { label:'Total Expected',  value:fmt(schoolTotal),     color:'#1D4ED8', bg:'#EFF6FF', view:null },
          { label:'Collected',       value:fmt(schoolCollected),  color:'#16A34A', bg:'#F0FDF4', view:'paid' },
          { label:'Pending',         value:fmt(schoolPending),    color:'#D97706', bg:'#FFFBEB', view:'partial' },
          { label:'Fully Paid',      value:paidCount,             color:'#16A34A', bg:'#F0FDF4', view:'paid' },
          { label:'Partial',         value:partialCount,          color:'#3B82F6', bg:'#EFF6FF', view:'partial' },
          { label:'Defaulters',      value:unpaidCount,           color:'#DC2626', bg:'#FEF2F2', view:'defaulters' },
        ].map(k=>(
          <div key={k.label} onClick={()=>k.view&&setActiveView(k.view===activeView?'all':k.view)}
            style={{ background:k.bg, border:`1.5px solid ${k.color}25`, borderRadius:12, padding:'12px 14px', cursor:k.view?'pointer':'default', transition:'all 0.15s', borderBottom:activeView===k.view?`3px solid ${k.color}`:undefined }}>
            <div style={{ fontSize:20, fontWeight:900, color:k.color }}>{k.value}</div>
            <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* ── Collection progress ── */}
      <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, padding:'14px 18px', marginBottom:20, display:'flex', alignItems:'center', gap:16 }}>
        <div style={{ flex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6, fontSize:12 }}>
            <span style={{ fontWeight:700, color:'#374151' }}>Collection Progress</span>
            <span style={{ fontWeight:900, fontSize:15, color:collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626' }}>{collRate}%</span>
          </div>
          <Bar value={collRate} color={collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626'} height={10}/>
          <div style={{ display:'flex', gap:16, marginTop:6, fontSize:11, color:'#9CA3AF' }}>
            <span>✅ {fmt(schoolCollected)} collected</span>
            <span>⏳ {fmt(schoolPending)} remaining</span>
            <span>👥 {students.length} students total</span>
          </div>
        </div>
        {/* Class breakdown mini pills */}
        <div style={{ display:'flex', gap:6, flexWrap:'wrap', maxWidth:300 }}>
          {(summary?.classes||[]).slice(0,6).map((cls,i)=>{
            const r = pct(cls.totalCollected, cls.totalExpected);
            return (
              <div key={i} onClick={()=>{ setClassId(cls.classId); }}
                style={{ padding:'4px 10px', borderRadius:20, fontSize:11, fontWeight:700, cursor:'pointer',
                  background: r===100?'#D1FAE5':r>50?'#FEF3C7':'#FEE2E2',
                  color: r===100?'#065F46':r>50?'#92400E':'#991B1B',
                  border:`1px solid ${r===100?'#A7F3D0':r>50?'#FDE68A':'#FECACA'}`,
                }}>
                {cls.className} {cls.section||''} {r}%
              </div>
            );
          })}
        </div>
      </div>

      {/* ── CLASS-WISE SECTION ── */}
      {section==='classwise' && (
        <div style={{ background:'#fff', border:'0.5px solid #E5E7EB', borderRadius:12, overflow:'hidden', marginBottom:20 }}>
          <div style={{ background:'#0B1F4A', padding:'11px 16px', color:'#fff', fontWeight:800, fontSize:13 }}>📚 Class-wise Fee Summary</div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:12 }}>
              <thead>
                <tr style={{ background:'#F8FAFC', borderBottom:'1px solid #E5E7EB' }}>
                  {['Class','Students','Expected','Collected','Pending','Paid','Partial','Unpaid','Rate'].map(h=>(
                    <th key={h} style={{ textAlign:'left', padding:'9px 12px', fontSize:10, fontWeight:700, color:'#6B7280', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {(summary?.classes||[]).length===0 ? (
                  <tr><td colSpan={9} style={{ padding:20, textAlign:'center', color:'#9CA3AF' }}>No class data yet.</td></tr>
                ) : (summary?.classes||[]).map((c,i)=>{
                  const rate = pct(c.totalCollected, c.totalExpected);
                  return (
                    <tr key={i} onClick={()=>{ setClassId(c.classId); setSection('studentwise'); }}
                      style={{ borderBottom:'1px solid #F3F4F6', cursor:'pointer', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'10px 12px', fontWeight:700, color:'#0B1F4A' }}>{c.className} {c.section||''}</td>
                      <td style={{ padding:'10px 12px' }}>{c.totalStudents}</td>
                      <td style={{ padding:'10px 12px' }}>{fmt(c.totalExpected)}</td>
                      <td style={{ padding:'10px 12px', color:'#16A34A', fontWeight:700 }}>{fmt(c.totalCollected)}</td>
                      <td style={{ padding:'10px 12px', color:'#DC2626' }}>{fmt(c.totalPending)}</td>
                      <td style={{ padding:'10px 12px' }}><span style={{ background:'#DCFCE7', color:'#166534', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{c.paidCount}</span></td>
                      <td style={{ padding:'10px 12px' }}><span style={{ background:'#FEF3C7', color:'#92400E', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{c.partialCount}</span></td>
                      <td style={{ padding:'10px 12px' }}><span style={{ background:'#FEE2E2', color:'#991B1B', padding:'1px 8px', borderRadius:20, fontSize:11, fontWeight:700 }}>{c.notPaidCount}</span></td>
                      <td style={{ padding:'10px 12px', fontWeight:700, color:rate>=80?'#16A34A':rate>=50?'#D97706':'#DC2626' }}>{rate}%</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', fontSize:11, color:'#9CA3AF', borderTop:'1px solid #F3F4F6' }}>Click a class row to see its students.</div>
        </div>
      )}

      {/* ── Filters bar (student-wise) ── */}
      {section==='studentwise' && (
      <>
      <div style={{ background:'#F8FAFC', borderRadius:12, padding:'14px 16px', marginBottom:16, display:'flex', gap:10, flexWrap:'wrap', alignItems:'center' }}>
        {/* Search */}
        <input placeholder="🔍 Search student name or roll…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ ...SEL, minWidth:220 }}/>

        {/* Class filter */}
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>

        {/* Status filter */}
        <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={SEL}>
          <option value="">All Status</option>
          <option value="paid">Paid</option>
          <option value="partial">Partial</option>
          <option value="not_paid">Unpaid</option>
        </select>

        {/* Sort */}
        <select value={sortBy} onChange={e=>setSortBy(e.target.value)} style={SEL}>
          <option value="name">Sort: Name</option>
          <option value="roll">Sort: Roll No</option>
          <option value="paid">Sort: Most Paid</option>
          <option value="pending">Sort: Most Pending</option>
        </select>

        {/* Quick view buttons */}
        <div style={{ display:'flex', gap:6, marginLeft:'auto' }}>
          {[
            { key:'all',        label:`All (${students.length})` },
            { key:'paid',       label:`✅ Paid (${paidCount})` },
            { key:'partial',    label:`🔵 Partial (${partialCount})` },
            { key:'defaulters', label:`⚠️ Defaulters (${unpaidCount})` },
          ].map(v=>(
            <button key={v.key} onClick={()=>setActiveView(v.key)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${activeView===v.key?'#1D4ED8':'#E5E7EB'}`,
              background:activeView===v.key?'#EFF6FF':'#fff',
              color:activeView===v.key?'#1D4ED8':'#6B7280',
            }}>{v.label}</button>
          ))}
        </div>
      </div>

      {/* ── Results count ── */}
      <div style={{ fontSize:13, color:'#6B7280', marginBottom:10, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span>Showing {filtered.length} of {students.length} students</span>
        {classId && <button onClick={()=>setClassId('')} style={{ fontSize:12, color:'#DC2626', background:'none', border:'none', cursor:'pointer' }}>✕ Clear class filter</button>}
      </div>

      {/* ── Bulk action bar (only shows when something is selected) ── */}
      {selectedIds.size > 0 && (
        <div style={{ background:'#FEF3C7', border:'1px solid #FCD34D', borderRadius:10, padding:'10px 14px', marginBottom:12, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ fontSize:13, color:'#78350F', fontWeight:700 }}>
            {selectedIds.size} record(s) selected
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={clearSelection}
              style={{ fontSize:12, fontWeight:700, color:'#78350F', background:'transparent', border:'1px solid #FCD34D', padding:'6px 14px', borderRadius:7, cursor:'pointer' }}>
              Clear
            </button>
            <button onClick={handleDeleteSelected} disabled={deleting}
              style={{ fontSize:12, fontWeight:700, color:'#fff', background:'#DC2626', border:'none', padding:'6px 16px', borderRadius:7, cursor:'pointer' }}>
              {deleting ? 'Deleting…' : `🗑 Delete ${selectedIds.size}`}
            </button>
          </div>
        </div>
      )}

      {/* ── Student Table ── */}
      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="💰" title="No students found" subtitle="Try adjusting your filters"/>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  <th style={{ padding:'11px 8px', textAlign:'center', color:'#E2E8F0', width:36 }}>
                    <input type="checkbox"
                      checked={filtered.length > 0 && filtered.every(s => selectedIds.has(s._id))}
                      onChange={e => {
                        if (e.target.checked) setSelectedIds(new Set(filtered.map(s => s._id)));
                        else clearSelection();
                      }}
                      title="Select all visible"/>
                  </th>
                  {['#','Student','Roll','Class','Total Fees','Paid','Pending','Progress','Status','History','Delete'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s,i) => {
                  const name     = s.student?.user?.name || '—';
                  const rate    = pct(s.paidAmount, s.totalFees);
                  const ss      = STATUS[s.paymentStatus] || STATUS.pending;
                  const pending = s.pendingAmount || 0;
                  const isOverdue = s.dueDate && new Date(s.dueDate) < today && s.paymentStatus !== 'paid';

                  return (
                    <tr key={s._id||i}
                      style={{ borderBottom:'0.5px solid #F3F4F6', background: selectedIds.has(s._id) ? '#FEF3C7' : (i%2?'#FAFAFA':'#fff'), transition:'background 0.1s' }}
                      onMouseEnter={e=>{ if(!selectedIds.has(s._id)) e.currentTarget.style.background='#F0F7FF'; }}
                      onMouseLeave={e=>{ if(!selectedIds.has(s._id)) e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'; }}>
                      <td style={{ padding:'11px 8px', textAlign:'center' }}>
                        <input type="checkbox" checked={selectedIds.has(s._id)} onChange={() => toggleSelect(s._id)} />
                      </td>
                      <td style={{ padding:'11px 14px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                      <td style={{ padding:'11px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                          <div style={{ width:34, height:34, borderRadius:9, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{name[0]?.toUpperCase()||'?'}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight:700, color:'#111827' }}>{name}</div>
                            {isOverdue && <div style={{ fontSize:10, color:'#DC2626', fontWeight:700 }}>⚠ OVERDUE</div>}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'11px 14px', color:'#6B7280' }}>{s.student?.rollNumber||'—'}</td>
                      <td style={{ padding:'11px 14px', color:'#374151', whiteSpace:'nowrap' }}>{s.class?.name} {s.class?.section||''}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#1D4ED8' }}>{fmt(s.totalFees)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(s.paidAmount)}</td>
                      <td style={{ padding:'11px 14px', fontWeight:700, color:pending>0?'#DC2626':'#16A34A' }}>{fmt(pending)}</td>
                      <td style={{ padding:'11px 14px', minWidth:120 }}>
                        <Bar value={rate} color={rate===100?'#16A34A':rate>50?'#D97706':'#EF4444'} height={6}/>
                        <div style={{ fontSize:10, color:'#9CA3AF', marginTop:3 }}>{rate}%</div>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{ss.label}</span>
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        {s.student?._id ? (
                          <button onClick={()=>setPanelStudent(s)}
                            style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 12px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap' }}>
                            View →
                          </button>
                        ) : (
                          <span style={{ fontSize:11, color:'#9CA3AF', fontStyle:'italic' }}>orphan record</span>
                        )}
                      </td>
                      <td style={{ padding:'11px 14px' }}>
                        <button onClick={() => handleDeleteSingle(s)} disabled={deleting} title="Delete this fee record"
                          style={{ fontSize:12, fontWeight:700, color:'#991B1B', background:'#FEF2F2', border:'1px solid #FECACA', padding:'5px 10px', borderRadius:7, cursor:'pointer' }}>
                          🗑
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>

              {/* Footer totals */}
              <tfoot>
                <tr style={{ background:'#F8FAFC', borderTop:'2px solid #E5E7EB' }}>
                  <td colSpan={5} style={{ padding:'11px 14px', fontWeight:700, color:'#374151' }}>
                    Total ({filtered.length} students)
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#1D4ED8' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.totalFees||0),0))}
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#16A34A' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.paidAmount||0),0))}
                  </td>
                  <td style={{ padding:'11px 14px', fontWeight:900, color:'#DC2626' }}>
                    {fmt(filtered.reduce((s,st)=>s+(st.pendingAmount||0),0))}
                  </td>
                  <td colSpan={4}/>
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
      </>
      )}

      {/* ── Student History Panel (slide-in) ── */}
      {panelStudent && (
        <StudentHistoryPanel student={panelStudent} onClose={()=>setPanelStudent(null)}/>
      )}
    </div>
  );
}