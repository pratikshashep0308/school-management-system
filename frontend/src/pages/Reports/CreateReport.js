// frontend/src/pages/Reports/CreateReport.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import reportAPI from '../../utils/reportAPI';
import ReportBuilder from './ReportBuilder';
import toast from 'react-hot-toast';

const DEFAULT_CONFIG = {
  module: '', fields: [], filters: {}, groupBy: '',
  sortBy: { field: 'createdAt', order: -1 },
  chartConfig: { enabled: false, type: 'bar', xAxis: '', yAxis: '' },
};

export default function CreateReport() {
  const navigate  = useNavigate();
  const location  = useLocation();
  const existing  = location.state?.report;   // passed when editing
  const prefill   = location.state?.config;   // passed from predefined click

  const [meta,   setMeta]   = useState({});
  const [name,   setName]   = useState(existing?.name   || prefill?.name   || '');
  const [desc,   setDesc]   = useState(existing?.description || '');
  const [isTpl,  setIsTpl]  = useState(existing?.isTemplate || false);
  const [config, setConfig] = useState(() => {
    if (existing) return {
      module: existing.module, fields: existing.fields, filters: existing.filters,
      groupBy: existing.groupBy, sortBy: existing.sortBy, chartConfig: existing.chartConfig || DEFAULT_CONFIG.chartConfig,
    };
    if (prefill) return {
      module: prefill.module, fields: prefill.fields || [], filters: prefill.filters || {},
      groupBy: prefill.groupBy || '', sortBy: prefill.sortBy || DEFAULT_CONFIG.sortBy,
      chartConfig: prefill.chartConfig || DEFAULT_CONFIG.chartConfig,
    };
    return DEFAULT_CONFIG;
  });
  const [saving,  setSaving]  = useState(false);
  const [running, setRunning] = useState(false);
  const [preview, setPreview] = useState(null);

  useEffect(() => {
    reportAPI.getMeta()
      .then(r => setMeta(r.data.data))
      .catch(() => toast.error('Failed to load report metadata'));
  }, []);

  const handleSave = async () => {
    if (!name.trim())    return toast.error('Report name is required');
    if (!config.module)  return toast.error('Please select a module');
    if (!config.fields.length) return toast.error('Please select at least one field');
    setSaving(true);
    try {
      const payload = { name, description: desc, isTemplate: isTpl, ...config };
      if (existing?._id) {
        await reportAPI.update(existing._id, payload);
        toast.success('Report updated');
      } else {
        await reportAPI.create(payload);
        toast.success('Report saved');
      }
      navigate('/reports');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const handlePreview = async () => {
    if (!config.module) return toast.error('Select a module first');
    setRunning(true);
    try {
      const r = await reportAPI.run({ ...config, limit: 20 });
      setPreview(r.data);
      toast.success(`Preview: ${r.data.count} rows`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Preview failed');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button onClick={() => navigate('/reports')}
            style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 14, padding: 0, marginBottom: 4 }}>
            ← Back to Reports
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0 }}>
            {existing ? '✏️ Edit Report' : '+ Create Report'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePreview} disabled={running}
            style={{ ...btnStyle('#fff','#3B82F6','#3B82F6'), opacity: running ? 0.6 : 1 }}>
            {running ? '⏳ Running...' : '▶ Preview (20 rows)'}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ ...btnStyle('#1D4ED8','#1D4ED8','#fff'), opacity: saving ? 0.6 : 1 }}>
            {saving ? '⏳ Saving...' : (existing ? '💾 Update' : '💾 Save Report')}
          </button>
        </div>
      </div>

      {/* Name & options */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 20, marginBottom: 16 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: 16 }}>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Report Name *</label>
            <input value={name} onChange={e => setName(e.target.value)}
              placeholder="e.g. Monthly Fee Collection Report"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
          <div>
            <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 }}>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)}
              placeholder="Optional description"
              style={{ width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB', borderRadius: 8, fontSize: 14, boxSizing: 'border-box' }} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 14, cursor: 'pointer', fontSize: 14 }}>
          <input type="checkbox" checked={isTpl} onChange={e => setIsTpl(e.target.checked)} style={{ accentColor: '#3B82F6' }} />
          <span>Save as template (visible to all admins in this school)</span>
        </label>
      </div>

      {/* Builder */}
      <ReportBuilder meta={meta} config={config} onChange={setConfig} />

      {/* Preview table */}
      {preview && (
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 20, marginTop: 16, overflow: 'auto' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <h3 style={{ margin: 0, fontSize: 16, fontWeight: 700 }}>Preview — {preview.count} rows</h3>
            <span style={{ fontSize: 12, color: '#6B7280' }}>Showing up to 20 rows</span>
          </div>
          <PreviewTable data={preview.data} />
        </div>
      )}
    </div>
  );
}

function PreviewTable({ data }) {
  if (!data?.length) return <div style={{ color: '#6B7280', textAlign: 'center', padding: 24 }}>No data returned</div>;
  const cols = Object.keys(data[0]).filter(k => k !== '_id' && k !== '__v');
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {cols.map(c => (
              <th key={c} style={{ padding: '8px 12px', textAlign: 'left', fontWeight: 600, color: '#374151', borderBottom: '1px solid #E5E7EB', whiteSpace: 'nowrap' }}>
                {c.replace(/([A-Z])/g, ' $1').replace(/^./, s => s.toUpperCase())}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '8px 12px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {formatCell(row[c])}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function formatCell(v) {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'boolean') return v ? '✓ Yes' : '✗ No';
  if (typeof v === 'object')  return JSON.stringify(v);
  if (typeof v === 'number' && v > 1e10) return new Date(v).toLocaleDateString();
  return String(v);
}

function btnStyle(bg, border, color) {
  return {
    background: bg, border: `1.5px solid ${border}`, color,
    borderRadius: 8, padding: '8px 18px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
  };
}