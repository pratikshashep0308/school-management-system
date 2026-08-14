// frontend/src/pages/Reports/FeeCategoryReport.js
//
// The consolidated fee report, rendered INSIDE the Reports Centre.
// Route: /reports/fees
//
// ─── WHY THIS EXISTS ─────────────────────────────────────────────────────────
// The Fees section used to hand off to the Fees module — click a report card,
// end up on a different screen with its own tabs and controls. For a reporting
// hub that is the wrong behaviour: clicking a report should give you a report.
//
// The generic report viewer cannot render it. That one shows flat rows from a
// single pipeline; this report has grouped headers (School Fee / Stationery /
// Bus Fee, each with total, paid and pending) built by joining fee assignments
// to the category breakdown on each receipt.
//
// Everything except the table markup — fetching, filtering, and all four
// exports — lives in utils/feeCategoryReport.js, shared with the Fees module
// page. Two copies would drift, and a CSV that disagrees with the PDF is found
// at the worst possible moment.

import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';

import { classAPI } from '../../utils/api';
import {
  fetchCategoryReport, renderCategoryHTML, categoryCSV, categoryMarkdown, downloadFile,
} from '../../utils/feeReportExports';

const money = (n) => '₹' + Math.round(Number(n) || 0).toLocaleString('en-IN');

const STATUS_TONE = {
  PAID: '#059669', PARTIAL: '#D97706', PENDING: '#DC2626', 'NOT APPLICABLE': '#9CA3AF',
};

const BTN = {
  padding: '8px 14px', borderRadius: 9, border: '1px solid #E5E7EB',
  background: '#fff', fontSize: 12, fontWeight: 700, cursor: 'pointer', color: '#374151',
};

export default function FeeCategoryReport() {
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [classes, setClasses] = useState([]);
  const [classId, setClassId] = useState('');
  const [status, setStatus] = useState('');
  const [feeType, setFeeType] = useState('');
  const [feeTypes, setFeeTypes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    classAPI.getAll?.()
      .then((r) => setClasses(r?.data?.data ?? r?.data ?? []))
      .catch(() => setClasses([]));
  }, []);

  const load = useCallback(async () => {
    setLoading(true); setError(null);
    try {
      const d = await fetchCategoryReport({ classId, status, feeType });
      setData(d);
      // Populate the fee-type filter from the report itself, so it offers only
      // types actually assigned or paid against — never one that would produce
      // an empty report.
      if (!feeType && Array.isArray(d.columns)) setFeeTypes(d.columns);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally { setLoading(false); }
  }, [classId, status, feeType]);

  useEffect(() => { load(); }, [load]);

  const title = () => {
    const cls = classId ? (classes.find((c) => c._id === classId)?.name || 'Class') : 'All Classes';
    return `Fee Report — ${cls}${feeType ? ` — ${feeType} only` : ''}`;
  };

  const doPrint = () => {
    if (!data) return;
    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups'); return; }
    w.document.open();
    w.document.write(renderCategoryHTML(data, title()));
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 600);
  };

  const safeName = () => title().replace(/[^\w]+/g, '_');

  const columns = data?.columns || [];
  const rows = data?.rows || [];
  const totals = data?.totals || {};
  const anyUnalloc = totals.unallocated > 0;

  return (
    <div style={{ padding: 24, maxWidth: 1400, margin: '0 auto' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 6 }}>
        <button onClick={() => navigate('/reports')} style={{ ...BTN, padding: '6px 12px' }}>
          ← Reports
        </button>
        <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#0B1F4A' }}>
          Fee Report — All Categories
        </h1>
      </div>
      <p style={{ fontSize: 12, color: '#6B7280', margin: '0 0 18px 0' }}>
        School Fee, Bus Fee and Stationery per student — total, paid and pending.
      </p>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center', marginBottom: 16 }}>
        <select value={classId} onChange={(e) => setClassId(e.target.value)} style={{ ...BTN, fontWeight: 500 }}>
          <option value="">All Classes</option>
          {classes.map((c) => (
            <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>
          ))}
        </select>

        <select value={feeType} onChange={(e) => setFeeType(e.target.value)} style={{ ...BTN, fontWeight: 500 }}>
          <option value="">All Fee Types</option>
          {feeTypes.map((t) => <option key={t} value={t}>{t} only</option>)}
        </select>

        <select value={status} onChange={(e) => setStatus(e.target.value)} style={{ ...BTN, fontWeight: 500 }}>
          <option value="">All Status</option>
          <option value="PAID">Paid</option>
          <option value="PARTIAL">Partial</option>
          <option value="PENDING">Pending</option>
        </select>

        <div style={{ flex: 1 }} />

        <button onClick={doPrint} disabled={!data} style={{ ...BTN, background: '#DC2626', color: '#fff', border: 'none' }}>
          📄 PDF
        </button>
        <button onClick={doPrint} disabled={!data} style={BTN}>🖨 Print</button>
        <button
          disabled={!data}
          onClick={() => { downloadFile(categoryCSV(data, title()), `${safeName()}.csv`, 'text/csv;charset=utf-8;'); toast.success('CSV downloaded'); }}
          style={BTN}
        >
          📊 Excel
        </button>
        <button
          disabled={!data}
          onClick={() => { downloadFile(categoryMarkdown(data, title()), `${safeName()}.md`, 'text/markdown;charset=utf-8;'); toast.success('Markdown downloaded'); }}
          style={BTN}
        >
          📝 MD
        </button>
      </div>

      {error && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: 14, borderRadius: 10, marginBottom: 16, fontSize: 13 }}>
          {error}
        </div>
      )}

      {loading && <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>}

      {!loading && data && (
        <>
          <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', marginBottom: 16 }}>
            {[
              ['Expected', money(totals.expected)],
              ['Collected', money(totals.paid)],
              ['Pending', money(totals.pending)],
              ['Collection', `${totals.collectionRate}%`],
              ['Students', rows.length],
            ].map(([label, value]) => (
              <div key={label} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: '10px 16px', minWidth: 110 }}>
                <div style={{ fontSize: 10, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.6 }}>{label}</div>
                <div style={{ fontSize: 17, fontWeight: 800, color: '#0B1F4A' }}>{value}</div>
              </div>
            ))}
          </div>

          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
              <thead>
                <tr style={{ background: '#0B1F4A', color: '#fff' }}>
                  <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'left' }}>#</th>
                  <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'left' }}>Roll No</th>
                  <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'left' }}>Student</th>
                  <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'left' }}>Class</th>
                  {columns.map((c) => (
                    <th key={c} colSpan={3} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '2px solid #fff' }}>
                      {c.toUpperCase()}
                    </th>
                  ))}
                  {anyUnalloc && <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'right', borderLeft: '2px solid #fff' }}>Unalloc.</th>}
                  <th colSpan={3} style={{ padding: '8px 6px', textAlign: 'center', borderLeft: '2px solid #fff' }}>OVERALL</th>
                  <th rowSpan={2} style={{ padding: '8px 6px', textAlign: 'left' }}>Status</th>
                </tr>
                <tr style={{ background: '#0B1F4A', color: '#fff' }}>
                  {columns.flatMap((c) => ['Total', 'Paid', 'Pend'].map((h) => (
                    <th key={`${c}-${h}`} style={{ padding: '6px', textAlign: 'right', fontWeight: 500, fontSize: 11 }}>{h}</th>
                  )))}
                  {['Total', 'Paid', 'Pend'].map((h) => (
                    <th key={`o-${h}`} style={{ padding: '6px', textAlign: 'right', fontWeight: 500, fontSize: 11 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.studentId} style={{ background: i % 2 ? '#F9FAFB' : '#fff' }}>
                    <td style={{ padding: '6px' }}>{i + 1}</td>
                    <td style={{ padding: '6px', fontSize: 11 }}>{r.rollNumber}</td>
                    <td style={{ padding: '6px' }}>{r.name}</td>
                    <td style={{ padding: '6px', fontSize: 11 }}>{r.className}</td>
                    {columns.map((c) => {
                      const k = r.categories[c] || { expected: 0, paid: 0, pending: 0 };
                      // Amber where paid exceeds assigned — usually a payment
                      // against something never formally assigned.
                      const over = (r.overpaid || []).includes(c);
                      return (
                        <React.Fragment key={c}>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{money(k.expected)}</td>
                          <td style={{ padding: '6px', textAlign: 'right', color: over ? '#B45309' : undefined }}>{money(k.paid)}</td>
                          <td style={{ padding: '6px', textAlign: 'right' }}>{money(k.pending)}</td>
                        </React.Fragment>
                      );
                    })}
                    {anyUnalloc && (
                      <td style={{ padding: '6px', textAlign: 'right' }}>{r.unallocated ? money(r.unallocated) : '—'}</td>
                    )}
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{money(r.total.expected)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{money(r.total.paid)}</td>
                    <td style={{ padding: '6px', textAlign: 'right', fontWeight: 600 }}>{money(r.total.pending)}</td>
                    <td style={{ padding: '6px', color: STATUS_TONE[r.status] || '#6B7280', fontWeight: 600, fontSize: 11 }}>
                      {r.status}
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#EEF2FF', fontWeight: 800, borderTop: '2px solid #0B1F4A' }}>
                  <td colSpan={4} style={{ padding: '8px 6px' }}>GRAND TOTAL — {rows.length} students</td>
                  {columns.map((c) => {
                    const k = data.byCategory[c] || { expected: 0, paid: 0, pending: 0 };
                    return (
                      <React.Fragment key={c}>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(k.expected)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(k.paid)}</td>
                        <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(k.pending)}</td>
                      </React.Fragment>
                    );
                  })}
                  {anyUnalloc && <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(totals.unallocated)}</td>}
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(totals.expected)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(totals.paid)}</td>
                  <td style={{ padding: '8px 6px', textAlign: 'right' }}>{money(totals.pending)}</td>
                  <td style={{ padding: '8px 6px' }}>{totals.collectionRate}%</td>
                </tr>
              </tfoot>
            </table>
          </div>

          <p style={{ fontSize: 11, color: '#6B7280', marginTop: 12, lineHeight: 1.6 }}>
            Expected comes from fee assignments; paid comes from the category breakdown recorded
            on each receipt.
            {anyUnalloc && (
              <> <span style={{ color: '#B45309' }}>{money(totals.unallocated)} was paid without a
              category breakdown.</span> It is included in Overall Paid but not attributed to any
              category — deliberately not spread across them, since no such split was recorded.</>
            )}
          </p>
        </>
      )}
    </div>
  );
}
