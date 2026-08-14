// frontend/src/pages/Reports/ReportViewer.js
import React, { useEffect, useState, useRef, useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reportAPI, classAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const CHART_COLORS = ['#3B82F6','#10B981','#F97316','#8B5CF6','#EF4444','#06B6D4','#F59E0B','#EC4899','#6366F1','#14B8A6'];

export default function ReportViewer() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const chartRef  = useRef(null);
  const chartInst = useRef(null);

  const { reportId, config: initConfig } = location.state || {};
  const [config,   setConfig]   = useState(initConfig || {});
  const [data,     setData]     = useState([]);
  const [count,    setCount]    = useState(0);
  const [loading,  setLoading]  = useState(false);
  const [ran,      setRan]      = useState(false);
  const [exporting, setExporting] = useState('');

  // Runtime filter overrides
  const [rfFrom,   setRfFrom]   = useState('');
  const [rfTo,     setRfTo]     = useState('');
  const [rfClass,  setRfClass]  = useState('');
  const [classList, setClassList] = useState([]);
  const [rfStatus, setRfStatus] = useState('');
  const [rfLimit,  setRfLimit]  = useState(500);

  const runReport = useCallback(async () => {
    if (!config.module) return toast.error('No module configured');
    setLoading(true);
    try {
      const runtimeFilters = {
        ...(rfFrom   && { dateFrom: new Date(rfFrom).toISOString() }),
        ...(rfTo     && { dateTo:   new Date(rfTo + 'T23:59:59').toISOString() }),
        ...(rfClass  && { classId:  rfClass }),
        ...(rfStatus && { status:   rfStatus }),
      };

      const payload = reportId
        ? { reportId, filters: runtimeFilters, limit: rfLimit }
        : { ...config, filters: { ...(config.filters || {}), ...runtimeFilters }, limit: rfLimit };

      const r = await reportAPI.run(payload);
      setData(r.data.data);
      setCount(r.data.count);
      setRan(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Report failed');
    } finally {
      setLoading(false);
    }
  }, [config, reportId, rfFrom, rfTo, rfClass, rfStatus, rfLimit]);

  // Run on mount
  useEffect(() => { runReport(); }, []); // eslint-disable-line

  // Draw chart
  useEffect(() => {
    const cc = config?.chartConfig;
    if (!cc?.enabled || !chartRef.current || !data.length || !cc.xAxis || !cc.yAxis) return;

    // Dynamic import Chart.js
    import('chart.js/auto').then(({ default: Chart }) => {
      if (chartInst.current) chartInst.current.destroy();
      const labels = data.map(r => String(r[cc.xAxis] ?? '—')).slice(0, 30);
      const values = data.map(r => Number(r[cc.yAxis]) || 0).slice(0, 30);

      chartInst.current = new Chart(chartRef.current, {
        type: cc.type || 'bar',
        data: {
          labels,
          datasets: [{
            label: cc.yAxis,
            data:  values,
            backgroundColor: (cc.type === 'pie' || cc.type === 'doughnut')
              ? CHART_COLORS.slice(0, labels.length)
              : '#3B82F6',
            borderRadius: cc.type === 'bar' ? 4 : 0,
          }],
        },
        options: {
          responsive: true,
          plugins: { legend: { position: 'top' }, tooltip: { mode: 'index' } },
          ...(cc.type !== 'pie' && cc.type !== 'doughnut' && {
            scales: { y: { beginAtZero: true } },
          }),
        },
      });
    }).catch(() => {});

    return () => { if (chartInst.current) { chartInst.current.destroy(); chartInst.current = null; } };
  }, [data, config?.chartConfig]);

  const handleExport = async (format) => {
    setExporting(format);
    try {
      await reportAPI.export({
        format,
        reportId,
        module:    config.module,
        fields:    config.fields,
        filters:   config.filters,
        groupBy:   config.groupBy,
        sortBy:    config.sortBy,
        reportName: config.name || config.module,
      });
      toast.success(`${format.toUpperCase()} downloading…`);
    } catch {
      toast.error('Export failed');
    } finally {
      setExporting('');
    }
  };

  // `_id` is normally a Mongo internal and hidden. But in a GROUPED report it is
  // the group itself — the class name, the month, the category — and dropping it
  // left a table of bare counts with nothing to say what each count was of.
  const isGrouped = Boolean(config?.groupBy) && config.groupBy !== 'none';

  // Classes for the filter dropdown. Loaded once; a failure leaves the list
  // empty and the filter simply offers "All classes", which is harmless.
  useEffect(() => {
    classAPI.getAll?.()
      .then((r) => setClassList(r?.data?.data ?? r?.data ?? []))
      .catch(() => setClassList([]));
  }, []);

  // A grouped report's `_id` is the group — usually a label worth showing, like
  // the class name or the month. Sometimes it is the raw ObjectId the pipeline
  // grouped on, as attendance does with `$student`, and a column of 24-character
  // hex strings is noise next to the name that sits beside it.
  //
  // Detected by shape rather than by module, so it holds for any report that
  // groups on an id — including ones not written yet. Only suppressed when the
  // row carries a readable field: with nothing else to identify the group, an
  // ugly id beats no identifier at all.
  const idLooksLikeObjectId = isGrouped
    && data.length > 0
    && /^[a-f0-9]{24}$/i.test(String(data[0]._id ?? ''))
    && Object.keys(data[0]).some(k => /name|title|label/i.test(k));

  const cols = data.length
    ? Object.keys(data[0]).filter(k => (k === '_id' ? (isGrouped && !idLooksLikeObjectId) : k !== '__v'))
    : [];

  // Grouped reports read better with the group first.
  if (isGrouped && cols.includes('_id')) {
    cols.splice(cols.indexOf('_id'), 1);
    cols.unshift('_id');
  }

  // …and "_id" is a poor column heading for something the reader thinks of as
  // the class or the month.
  const headingFor = (k) => (k === '_id' && isGrouped
    ? String(config.groupBy).replace(/([A-Z])/g, ' $1').replace(/^./, (c) => c.toUpperCase())
    : k);

  // Column totals for numeric fields
  const totals = {};
  if (data.length) {
    cols.forEach(c => {
      if (data.every(r => typeof r[c] === 'number')) {
        totals[c] = data.reduce((s, r) => s + (r[c] || 0), 0);
      }
    });
  }

  return (
    <div style={{ padding: 24, maxWidth: 1280, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 20 }}>
        <div>
          <button onClick={() => navigate('/reports')}
            style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 4 }}>
            ← Reports
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 800, margin: 0, color: '#111827' }}>
            {config?.name || `${config?.module} Report`}
          </h1>
          {ran && (
            <p style={{ fontSize: 13, color: '#6B7280', margin: '3px 0 0' }}>
              {count} records · {config?.module}
              {config?.groupBy ? ` · grouped by ${config.groupBy}` : ''}
            </p>
          )}
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
          <button onClick={() => navigate('/reports/create', { state: { config } })}
            style={{ fontSize: 12, color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: 8, padding: '7px 14px', cursor: 'pointer', fontWeight: 600 }}>
            ✏ Edit
          </button>
          {[
            { fmt: 'csv',  label: 'CSV',   color: '#059669' },
            { fmt: 'xlsx', label: 'Excel', color: '#2563EB' },
            { fmt: 'pdf',  label: 'PDF',   color: '#DC2626' },
          ].map(({ fmt, label, color }) => (
            <button key={fmt} onClick={() => handleExport(fmt)} disabled={!!exporting}
              style={{
                background: exporting === fmt ? '#F3F4F6' : '#fff',
                border: `1.5px solid ${color}`, color,
                borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700,
                cursor: exporting ? 'not-allowed' : 'pointer',
                opacity: exporting && exporting !== fmt ? 0.5 : 1,
              }}>
              {exporting === fmt ? '⏳' : `⬇ ${label}`}
            </button>
          ))}
        </div>
      </div>

      {/* Runtime filters */}
      <div style={{
        background: '#F8FAFC', border: '1px solid #E5E7EB', borderRadius: 10,
        padding: '14px 18px', marginBottom: 16,
        display: 'flex', gap: 14, flexWrap: 'wrap', alignItems: 'flex-end',
      }}>
        {[
          { label: 'From',   type: 'date',   val: rfFrom,   set: setRfFrom },
          { label: 'To',     type: 'date',   val: rfTo,     set: setRfTo   },
          { label: 'Status', type: 'text',   val: rfStatus, set: setRfStatus, placeholder: 'e.g. paid, absent' },
        ].map(({ label, type, val, set, placeholder }) => (
          <div key={label}>
            <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>{label}</div>
            <input type={type} value={val} placeholder={placeholder || ''} onChange={e => set(e.target.value)}
              style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13, width: type === 'text' ? 180 : 140, color: '#111827' }} />
          </div>
        ))}
        {/* Class — a dropdown, not an id box. Asking somebody to paste a
            24-character hex string is a developer field that reached a user
            screen; nobody in the office can answer it. */}
        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Class</div>
          <select value={rfClass} onChange={e => setRfClass(e.target.value)}
            style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13, minWidth: 150 }}>
            <option value="">All classes</option>
            {classList.map(c => (
              <option key={c._id} value={c._id}>
                {c.name}{c.section ? ` ${c.section}` : ''}
              </option>
            ))}
          </select>
        </div>

        <div>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', marginBottom: 4, textTransform: 'uppercase' }}>Rows</div>
          <select value={rfLimit} onChange={e => setRfLimit(Number(e.target.value))}
            style={{ padding: '7px 10px', border: '1px solid #D1D5DB', borderRadius: 7, fontSize: 13 }}>
            {[100,250,500,1000,2000].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button onClick={runReport} disabled={loading}
          style={{
            background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8,
            padding: '8px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
            opacity: loading ? 0.6 : 1, marginTop: 'auto',
          }}>
          {loading ? '⏳' : '▶ Run'}
        </button>
        {ran && (
          <span style={{ marginTop: 'auto', fontSize: 12, color: '#9CA3AF', paddingBottom: 2 }}>
            {count} rows
          </span>
        )}
      </div>

      {/* Chart */}
      {config?.chartConfig?.enabled && ran && data.length > 0 && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, marginBottom: 16, maxHeight: 360 }}>
          <canvas ref={chartRef} />
        </div>
      )}

      {/* Loading */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 80, color: '#6B7280' }}>
          <div style={{ fontSize: 32, marginBottom: 12 }}>⏳</div>
          <div style={{ fontSize: 15 }}>Running report…</div>
        </div>
      )}

      {/* Data Table */}
      {ran && !loading && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
          {data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 80, color: '#6B7280' }}>
              <div style={{ fontSize: 40, marginBottom: 12 }}>📭</div>
              <div style={{ fontSize: 15, fontWeight: 600 }}>No data for the selected filters</div>
              <div style={{ fontSize: 13, marginTop: 6 }}>Try removing filters or expanding the date range</div>
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: '#1E3A8A' }}>
                    <th style={{ ...TH, width: 44, color: '#94A3B8' }}>#</th>
                    {cols.map(c => (
                      <th key={c} style={{ ...TH, color: '#E2E8F0' }}>
                        {headingFor(c).replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {data.map((row, i) => (
                    <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#F8FAFC' : '#fff' }}>
                      <td style={{ ...TD, color: '#CBD5E1', fontSize: 11 }}>{i + 1}</td>
                      {cols.map(c => <td key={c} style={TD}><CellValue v={c === '_id' && (row[c] === null || row[c] === '') ? '(none)' : row[c]} col={c} /></td>)}
                    </tr>
                  ))}
                </tbody>
                {Object.keys(totals).length > 0 && (
                  <tfoot>
                    <tr style={{ background: '#F1F5F9', borderTop: '2px solid #E2E8F0' }}>
                      <td style={{ padding: '10px 14px', fontWeight: 800, fontSize: 12, color: '#374151' }}>Σ</td>
                      {cols.map(c => (
                        <td key={c} style={{ padding: '10px 14px', fontWeight: 700, fontSize: 12, color: '#1D4ED8' }}>
                          {totals[c] !== undefined
                            ? (c.toLowerCase().includes('amount') || c.toLowerCase().includes('fee')
                              ? `₹${Number(totals[c]).toLocaleString('en-IN')}`
                              : Number(totals[c]).toLocaleString('en-IN'))
                            : ''}
                        </td>
                      ))}
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
          )}
          {/* Footer */}
          <div style={{ padding: '10px 16px', background: '#F8FAFC', borderTop: '1px solid #E5E7EB', display: 'flex', justifyContent: 'space-between', fontSize: 12, color: '#6B7280' }}>
            <span>
              Showing <strong>{data.length}</strong> of <strong>{count}</strong> rows
              {count > rfLimit && <span style={{ color: '#F97316' }}> · increase limit to see more</span>}
            </span>
            <span>Generated {new Date().toLocaleString('en-IN')}</span>
          </div>
        </div>
      )}
    </div>
  );
}

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 700, fontSize: 11, whiteSpace: 'nowrap', letterSpacing: 0.4 };
const TD = { padding: '9px 14px', color: '#374151', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function CellValue({ v, col }) {
  if (v === null || v === undefined) return <span style={{ color: '#D1D5DB' }}>—</span>;
  if (typeof v === 'boolean') return <span style={{ color: v ? '#059669' : '#DC2626', fontWeight: 700 }}>{v ? '✓ Yes' : '✗ No'}</span>;
  if (typeof v === 'object' && Array.isArray(v)) return <span style={{ color: '#6B7280' }}>{v.join(', ')}</span>;
  if (typeof v === 'object') return <span style={{ color: '#9CA3AF', fontSize: 11 }}>{JSON.stringify(v)}</span>;

  const colL = col.toLowerCase();
  if ((colL.includes('amount') || colL.includes('fee') || colL.includes('salary')) && typeof v === 'number') {
    return <span style={{ fontWeight: 600, color: '#111827' }}>₹{Number(v).toLocaleString('en-IN')}</span>;
  }
  if ((colL.includes('percentage') || colL === 'percent') && typeof v === 'number') {
    const color = v >= 75 ? '#059669' : v >= 50 ? '#D97706' : '#DC2626';
    return <span style={{ color, fontWeight: 700 }}>{Number(v).toFixed(1)}%</span>;
  }
  if (colL === 'status') {
    const colors = { present:'#059669', paid:'#059669', issued:'#3B82F6', active:'#059669', absent:'#DC2626', pending:'#F97316', overdue:'#DC2626', returned:'#6B7280', inactive:'#9CA3AF' };
    const c = colors[String(v).toLowerCase()] || '#6B7280';
    return (
      <span style={{ color: c, background: c + '15', padding: '2px 8px', borderRadius: 10, fontSize: 11, fontWeight: 700 }}>
        {String(v)}
      </span>
    );
  }
  return <span>{String(v)}</span>;
}