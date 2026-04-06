// frontend/src/pages/Reports/ReportViewer.js
// Full report runner with export, chart, and filter overrides
import React, { useEffect, useState, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import reportAPI from '../../utils/reportAPI';
import toast from 'react-hot-toast';

// Chart.js — loaded only when a chart is rendered
let Chart;
try { Chart = require('chart.js/auto').default; } catch { Chart = null; }

const CHART_COLORS = [
  '#3B82F6','#22C55E','#F97316','#A855F7','#EF4444',
  '#06B6D4','#FBBF24','#EC4899','#10B981','#6366F1',
];

export default function ReportViewer() {
  const navigate   = useNavigate();
  const location   = useLocation();
  const chartRef   = useRef(null);
  const chartInst  = useRef(null);

  const { reportId, config: preConfig } = location.state || {};

  const [config,  setConfig]  = useState(preConfig || {});
  const [data,    setData]    = useState([]);
  const [loading, setLoading] = useState(false);
  const [ran,     setRan]     = useState(false);
  const [count,   setCount]   = useState(0);

  // Runtime filter overrides
  const [rfDateFrom, setRfDateFrom] = useState('');
  const [rfDateTo,   setRfDateTo]   = useState('');
  const [rfClass,    setRfClass]    = useState('');
  const [rfLimit,    setRfLimit]    = useState(500);

  const runReport = async () => {
    setLoading(true);
    try {
      const runtimeFilters = {
        ...(rfDateFrom && { dateFrom: new Date(rfDateFrom).toISOString() }),
        ...(rfDateTo   && { dateTo:   new Date(rfDateTo + 'T23:59:59').toISOString() }),
        ...(rfClass    && { classId:  rfClass }),
      };
      const payload = reportId
        ? { reportId, filters: runtimeFilters, limit: rfLimit }
        : { ...config, filters: { ...(config.filters || {}), ...runtimeFilters }, limit: rfLimit };

      const r = await reportAPI.run(payload);
      setData(r.data.data);
      setCount(r.data.count);
      setRan(true);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to run report');
    } finally {
      setLoading(false);
    }
  };

  // Run automatically on mount
  useEffect(() => { runReport(); }, []); // eslint-disable-line

  // Render chart when data + chartConfig is present
  useEffect(() => {
    const cc = config?.chartConfig;
    if (!cc?.enabled || !Chart || !chartRef.current || !data.length || !cc.xAxis || !cc.yAxis) return;

    if (chartInst.current) chartInst.current.destroy();

    const labels = data.map(r => String(r[cc.xAxis] ?? '—'));
    const values = data.map(r => Number(r[cc.yAxis]) || 0);

    chartInst.current = new Chart(chartRef.current, {
      type: cc.type || 'bar',
      data: {
        labels,
        datasets: [{
          label: cc.yAxis,
          data:  values,
          backgroundColor: cc.type === 'pie' || cc.type === 'doughnut'
            ? CHART_COLORS.slice(0, labels.length)
            : '#3B82F6',
          borderRadius: 4,
        }],
      },
      options: {
        responsive: true,
        plugins: { legend: { position: 'top' } },
        ...(cc.type !== 'pie' && cc.type !== 'doughnut' && {
          scales: { y: { beginAtZero: true } },
        }),
      },
    });
    return () => { if (chartInst.current) chartInst.current.destroy(); };
  }, [data, config?.chartConfig]);

  const handleExport = async (format) => {
    try {
      await reportAPI.export({
        format,
        reportId,
        module:   config.module,
        fields:   config.fields,
        filters:  config.filters,
        groupBy:  config.groupBy,
        sortBy:   config.sortBy,
        reportName: config.name || 'report',
      });
      toast.success(`Downloading ${format.toUpperCase()}...`);
    } catch {
      toast.error('Export failed');
    }
  };

  const cols = data.length ? Object.keys(data[0]).filter(k => k !== '_id' && k !== '__v') : [];

  return (
    <div style={{ padding: 24, maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
        <div>
          <button onClick={() => navigate('/reports')}
            style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 4 }}>
            ← Back to Reports
          </button>
          <h1 style={{ fontSize: 20, fontWeight: 700, margin: 0 }}>
            {config?.name || `${config?.module} Report`}
          </h1>
          {ran && (
            <span style={{ fontSize: 13, color: '#6B7280' }}>
              {count} rows · {config?.module} · {config?.groupBy ? `grouped by ${config.groupBy}` : 'no grouping'}
            </span>
          )}
        </div>

        {/* Export buttons */}
        <div style={{ display: 'flex', gap: 8 }}>
          {[
            { fmt: 'csv',  label: '⬇ CSV',   color: '#059669' },
            { fmt: 'xlsx', label: '⬇ Excel',  color: '#2563EB' },
            { fmt: 'pdf',  label: '⬇ PDF',   color: '#DC2626' },
          ].map(({ fmt, label, color }) => (
            <button key={fmt} onClick={() => handleExport(fmt)}
              style={{ background: '#fff', border: `1.5px solid ${color}`, color, borderRadius: 8, padding: '7px 14px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* Runtime filters */}
      <div style={{ background: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 10, padding: '14px 20px', marginBottom: 16, display: 'flex', gap: 16, flexWrap: 'wrap', alignItems: 'flex-end' }}>
        {[
          { label: 'From',  type: 'date', val: rfDateFrom, set: setRfDateFrom },
          { label: 'To',    type: 'date', val: rfDateTo,   set: setRfDateTo },
          { label: 'Class ID', type: 'text', val: rfClass, set: setRfClass, placeholder: 'Mongo ObjectId' },
        ].map(({ label, type, val, set, placeholder }) => (
          <div key={label}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>{label}</div>
            <input type={type} value={val} placeholder={placeholder || ''} onChange={e => set(e.target.value)}
              style={{ padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13, width: type === 'text' ? 180 : 140 }} />
          </div>
        ))}
        <div>
          <div style={{ fontSize: 12, fontWeight: 600, color: '#6B7280', marginBottom: 4 }}>Row Limit</div>
          <select value={rfLimit} onChange={e => setRfLimit(Number(e.target.value))}
            style={{ padding: '6px 10px', border: '1px solid #D1D5DB', borderRadius: 6, fontSize: 13 }}>
            {[100,250,500,1000,2000].map(n => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        <button onClick={runReport} disabled={loading}
          style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, padding: '8px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer', opacity: loading ? 0.6 : 1 }}>
          {loading ? '⏳' : '▶ Run'}
        </button>
      </div>

      {/* Chart */}
      {config?.chartConfig?.enabled && ran && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 20, marginBottom: 16, maxHeight: 380 }}>
          <canvas ref={chartRef} />
        </div>
      )}

      {/* Data Table */}
      {loading && (
        <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>⏳ Running report...</div>
      )}

      {ran && !loading && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'auto' }}>
          {data.length === 0 ? (
            <div style={{ textAlign: 'center', padding: 60, color: '#6B7280' }}>
              No data found for the selected filters.
            </div>
          ) : (
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#1E3A8A', position: 'sticky', top: 0 }}>
                  <th style={{ ...TH, width: 40, color: '#fff' }}>#</th>
                  {cols.map(c => (
                    <th key={c} style={{ ...TH, color: '#fff' }}>
                      {c.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {data.map((row, i) => (
                  <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#F8FAFC' : '#fff' }}>
                    <td style={{ ...TD, color: '#9CA3AF', fontSize: 12 }}>{i + 1}</td>
                    {cols.map(c => (
                      <td key={c} style={TD}>
                        <CellValue val={row[c]} colKey={c} />
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr style={{ background: '#F1F5F9', borderTop: '2px solid #E5E7EB' }}>
                  <td colSpan={cols.length + 1} style={{ padding: '10px 16px', fontSize: 12, color: '#6B7280', fontWeight: 600 }}>
                    Total: {count} rows {count > data.length ? `(showing ${data.length})` : ''}
                  </td>
                </tr>
              </tfoot>
            </table>
          )}
        </div>
      )}
    </div>
  );
}

const TH = { padding: '10px 14px', textAlign: 'left', fontWeight: 600, fontSize: 12, whiteSpace: 'nowrap', letterSpacing: 0.3 };
const TD = { padding: '9px 14px', color: '#374151', maxWidth: 220, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' };

function CellValue({ val, colKey }) {
  if (val === null || val === undefined) return <span style={{ color: '#D1D5DB' }}>—</span>;
  if (typeof val === 'boolean') return <span style={{ color: val ? '#059669' : '#DC2626', fontWeight: 600 }}>{val ? '✓ Yes' : '✗ No'}</span>;
  if (colKey.toLowerCase().includes('amount') || colKey.toLowerCase().includes('fee')) {
    const n = Number(val);
    if (!isNaN(n)) return <span style={{ fontWeight: 500 }}>₹{n.toLocaleString('en-IN')}</span>;
  }
  if (colKey.toLowerCase().includes('percentage')) {
    const n = Number(val);
    if (!isNaN(n)) {
      const color = n >= 75 ? '#059669' : n >= 50 ? '#D97706' : '#DC2626';
      return <span style={{ color, fontWeight: 600 }}>{n.toFixed(1)}%</span>;
    }
  }
  if (typeof val === 'object') return <span style={{ color: '#6B7280', fontSize: 11 }}>{JSON.stringify(val)}</span>;
  return <span>{String(val)}</span>;
}