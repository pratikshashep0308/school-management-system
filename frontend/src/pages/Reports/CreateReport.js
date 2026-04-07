// frontend/src/pages/Reports/CreateReport.js
import React, { useEffect, useState } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { reportAPI } from '../../utils/api';
import toast from 'react-hot-toast';

const INPUT = {
  width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB',
  borderRadius: 8, fontSize: 13, outline: 'none', boxSizing: 'border-box',
  background: '#fff', color: '#111827',
};
const LABEL = { display: 'block', fontSize: 12, fontWeight: 700, color: '#374151', marginBottom: 6, textTransform: 'uppercase', letterSpacing: 0.5 };
const CARD  = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, padding: 20, marginBottom: 16 };

export default function CreateReport() {
  const navigate = useNavigate();
  const location = useLocation();
  const existing = location.state?.report;
  const prefill  = location.state?.config;

  const [meta,    setMeta]    = useState({});
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [previewing, setPreviewing] = useState(false);
  const [preview, setPreview] = useState(null);

  // Form state
  const [name,      setName]      = useState(existing?.name || prefill?.name || '');
  const [desc,      setDesc]      = useState(existing?.description || '');
  const [isTpl,     setIsTpl]     = useState(existing?.isTemplate || false);
  const [schedule,  setSchedule]  = useState(existing?.scheduleFrequency || '');
  const [module,    setModule]    = useState(existing?.module || prefill?.module || '');
  const [fields,    setFields]    = useState(existing?.fields || prefill?.fields || []);
  const [filters,   setFilters]   = useState(existing?.filters || prefill?.filters || {});
  const [groupBy,   setGroupBy]   = useState(existing?.groupBy || prefill?.groupBy || '');
  const [sortField, setSortField] = useState(existing?.sortBy?.field || prefill?.sortBy?.field || 'createdAt');
  const [sortOrder, setSortOrder] = useState(existing?.sortBy?.order || prefill?.sortBy?.order || -1);
  const [chartOn,   setChartOn]   = useState(existing?.chartConfig?.enabled || prefill?.chartConfig?.enabled || false);
  const [chartType, setChartType] = useState(existing?.chartConfig?.type   || prefill?.chartConfig?.type   || 'bar');
  const [chartX,    setChartX]    = useState(existing?.chartConfig?.xAxis  || prefill?.chartConfig?.xAxis  || '');
  const [chartY,    setChartY]    = useState(existing?.chartConfig?.yAxis  || prefill?.chartConfig?.yAxis  || '');

  useEffect(() => {
    reportAPI.getMeta()
      .then(r => setMeta(r.data.data))
      .catch(() => toast.error('Failed to load module definitions'))
      .finally(() => setLoading(false));
  }, []);

  const moduleMeta     = meta[module] || {};
  const availableFields  = moduleMeta.fields  || [];
  const availableFilters = moduleMeta.filters  || [];
  const availableGroups  = moduleMeta.groupBy  || [];
  const availableSorts   = moduleMeta.sortBy   || [];

  const toggleField = (key) => {
    setFields(prev => prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]);
  };

  const handleModuleChange = (val) => {
    setModule(val);
    setFields([]);
    setFilters({});
    setGroupBy('');
  };

  const handlePreview = async () => {
    if (!module) return toast.error('Select a module first');
    setPreviewing(true);
    setPreview(null);
    try {
      const r = await reportAPI.run({ module, fields, filters, groupBy, sortBy: { field: sortField, order: sortOrder }, limit: 15 });
      setPreview(r.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Preview failed');
    } finally {
      setPreviewing(false);
    }
  };

  const handleSave = async () => {
    if (!name.trim())  return toast.error('Report name is required');
    if (!module)       return toast.error('Select a module');
    if (!fields.length) return toast.error('Select at least one field');
    setSaving(true);
    try {
      const payload = {
        name, description: desc, module, fields, filters,
        groupBy, sortBy: { field: sortField, order: sortOrder },
        chartConfig: { enabled: chartOn, type: chartType, xAxis: chartX, yAxis: chartY },
        isTemplate: isTpl, scheduleFrequency: schedule,
      };
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

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300, color: '#6B7280' }}>
      ⏳ Loading module definitions…
    </div>
  );

  return (
    <div style={{ padding: 24, maxWidth: 1100, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <div>
          <button onClick={() => navigate('/reports')} style={{ background: 'none', border: 'none', color: '#6B7280', cursor: 'pointer', fontSize: 13, padding: 0, marginBottom: 4 }}>
            ← Back
          </button>
          <h1 style={{ fontSize: 22, fontWeight: 800, margin: 0 }}>
            {existing ? '✏️ Edit Report' : '+ Build Report'}
          </h1>
        </div>
        <div style={{ display: 'flex', gap: 10 }}>
          <button onClick={handlePreview} disabled={previewing || !module}
            style={{ background: '#fff', border: '1.5px solid #3B82F6', color: '#3B82F6', borderRadius: 8, padding: '9px 18px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: previewing ? 0.6 : 1 }}>
            {previewing ? '⏳ Loading…' : '▶ Preview'}
          </button>
          <button onClick={handleSave} disabled={saving}
            style={{ background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8, padding: '9px 22px', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.6 : 1 }}>
            {saving ? '⏳ Saving…' : (existing ? '💾 Update' : '💾 Save')}
          </button>
        </div>
      </div>

      {/* Basic info */}
      <div style={CARD}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
          <div>
            <label style={LABEL}>Report Name *</label>
            <input value={name} onChange={e => setName(e.target.value)} placeholder="e.g. Monthly Fee Collection" style={INPUT} />
          </div>
          <div>
            <label style={LABEL}>Description</label>
            <input value={desc} onChange={e => setDesc(e.target.value)} placeholder="Optional description" style={INPUT} />
          </div>
        </div>
        <div style={{ display: 'flex', gap: 24, marginTop: 14, flexWrap: 'wrap' }}>
          <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
            <input type="checkbox" checked={isTpl} onChange={e => setIsTpl(e.target.checked)} style={{ accentColor: '#3B82F6' }} />
            Save as Template
          </label>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <label style={{ fontSize: 13, color: '#374151', fontWeight: 600 }}>Schedule:</label>
            <select value={schedule} onChange={e => setSchedule(e.target.value)}
              style={{ padding: '5px 10px', border: '1px solid #E5E7EB', borderRadius: 6, fontSize: 13 }}>
              <option value="">None</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="monthly">Monthly</option>
            </select>
          </div>
        </div>
      </div>

      {/* Module selector */}
      <div style={CARD}>
        <label style={LABEL}>Module *</label>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px,1fr))', gap: 10 }}>
          {Object.entries(meta).map(([key, m]) => (
            <button
              key={key}
              onClick={() => handleModuleChange(key)}
              style={{
                padding: '12px 8px', borderRadius: 10, border: `2px solid ${module === key ? '#1D4ED8' : '#E5E7EB'}`,
                background: module === key ? '#EFF6FF' : '#FAFAFA',
                color: module === key ? '#1D4ED8' : '#374151',
                fontWeight: module === key ? 800 : 500,
                fontSize: 13, cursor: 'pointer', textAlign: 'center',
                transition: 'all 0.15s',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>
        {!Object.keys(meta).length && (
          <p style={{ color: '#EF4444', fontSize: 13, margin: '8px 0 0' }}>
            ⚠️ No modules loaded — ensure /api/reports/meta is returning data and you are logged in.
          </p>
        )}
      </div>

      {module && (
        <>
          {/* Field selector */}
          <div style={CARD}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <label style={{ ...LABEL, marginBottom: 0 }}>Fields <span style={{ fontWeight: 400, color: '#9CA3AF' }}>({fields.length} selected)</span></label>
              <div style={{ display: 'flex', gap: 8 }}>
                <button onClick={() => setFields(availableFields.map(f => f.key))}
                  style={{ fontSize: 11, color: '#3B82F6', background: 'none', border: '1px solid #3B82F6', borderRadius: 6, padding: '3px 10px', cursor: 'pointer', fontWeight: 700 }}>
                  All
                </button>
                <button onClick={() => setFields([])}
                  style={{ fontSize: 11, color: '#6B7280', background: 'none', border: '1px solid #E5E7EB', borderRadius: 6, padding: '3px 10px', cursor: 'pointer' }}>
                  Clear
                </button>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px,1fr))', gap: 8 }}>
              {availableFields.map(f => {
                const on = fields.includes(f.key);
                return (
                  <label key={f.key} style={{
                    display: 'flex', alignItems: 'center', gap: 8, padding: '9px 12px',
                    border: `1.5px solid ${on ? '#3B82F6' : '#E5E7EB'}`, borderRadius: 8, cursor: 'pointer',
                    background: on ? '#EFF6FF' : '#FAFAFA', transition: 'all 0.15s',
                    fontSize: 13, fontWeight: on ? 700 : 400, color: on ? '#1D4ED8' : '#374151',
                  }}>
                    <input type="checkbox" checked={on} onChange={() => toggleField(f.key)} style={{ accentColor: '#3B82F6' }} />
                    {f.label}
                    <span style={{ fontSize: 10, color: '#9CA3AF', marginLeft: 'auto' }}>{f.type}</span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div style={CARD}>
            <label style={LABEL}>Filters</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px,1fr))', gap: 16 }}>
              {availableFilters.map(f => (
                <div key={f.key}>
                  <label style={{ fontSize: 12, color: '#374151', marginBottom: 5, display: 'block' }}>{f.label}</label>
                  {f.type === 'select' ? (
                    <select value={filters[f.key] || ''} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))} style={INPUT}>
                      <option value="">All</option>
                      {f.options.map(o => <option key={o} value={o}>{o}</option>)}
                    </select>
                  ) : f.type === 'date' ? (
                    <input type="date" value={filters[f.key]?.split('T')[0] || ''} style={INPUT}
                      onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value ? new Date(e.target.value).toISOString() : '' }))} />
                  ) : (
                    <input type={f.type === 'number' ? 'number' : 'text'} value={filters[f.key] || ''} style={INPUT}
                      placeholder={f.label} onChange={e => setFilters(p => ({ ...p, [f.key]: e.target.value }))} />
                  )}
                </div>
              ))}
            </div>
          </div>

          {/* Group, Sort, Chart */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 16 }}>
            <div style={CARD}>
              <label style={LABEL}>Group By</label>
              <select value={groupBy} onChange={e => setGroupBy(e.target.value)} style={INPUT}>
                <option value="">No grouping</option>
                {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={CARD}>
              <label style={LABEL}>Sort Field</label>
              <select value={sortField} onChange={e => setSortField(e.target.value)} style={INPUT}>
                <option value="createdAt">Created At</option>
                {availableSorts.map(s => <option key={s} value={s}>{s}</option>)}
              </select>
            </div>
            <div style={CARD}>
              <label style={LABEL}>Sort Order</label>
              <select value={sortOrder} onChange={e => setSortOrder(Number(e.target.value))} style={INPUT}>
                <option value={-1}>Descending ↓</option>
                <option value={1}>Ascending ↑</option>
              </select>
            </div>
          </div>

          {/* Chart config */}
          <div style={CARD}>
            <label style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer', marginBottom: chartOn ? 16 : 0 }}>
              <input type="checkbox" checked={chartOn} onChange={e => setChartOn(e.target.checked)} style={{ accentColor: '#3B82F6', width: 15, height: 15 }} />
              <span style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>Enable Chart Visualization</span>
            </label>
            {chartOn && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14 }}>
                <div>
                  <label style={{ ...LABEL, fontWeight: 500 }}>Chart Type</label>
                  <select value={chartType} onChange={e => setChartType(e.target.value)} style={INPUT}>
                    {['bar','pie','line','doughnut'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...LABEL, fontWeight: 500 }}>X Axis (label field)</label>
                  <input value={chartX} onChange={e => setChartX(e.target.value)} placeholder="e.g. _id, className" style={INPUT} />
                </div>
                <div>
                  <label style={{ ...LABEL, fontWeight: 500 }}>Y Axis (value field)</label>
                  <input value={chartY} onChange={e => setChartY(e.target.value)} placeholder="e.g. count, totalAmount" style={INPUT} />
                </div>
              </div>
            )}
          </div>
        </>
      )}

      {/* Preview */}
      {preview && (
        <div style={{ background: '#fff', border: '1.5px solid #3B82F6', borderRadius: 12, padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Preview — {preview.count} rows</span>
            <button onClick={() => navigate('/reports/run', { state: { config: { module, fields, filters, groupBy, sortBy: { field: sortField, order: sortOrder }, name, chartConfig: { enabled: chartOn, type: chartType, xAxis: chartX, yAxis: chartY } } } })}
              style={{ fontSize: 12, color: '#1D4ED8', background: 'none', border: '1px solid #1D4ED8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}>
              Run Full Report
            </button>
          </div>
          <PreviewTable data={preview.data} />
        </div>
      )}
    </div>
  );
}

function PreviewTable({ data }) {
  if (!data?.length) return <p style={{ color: '#9CA3AF', textAlign: 'center', padding: 24 }}>No data returned.</p>;
  const cols = Object.keys(data[0]).filter(k => !['_id','__v'].includes(k));
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#1E3A8A' }}>
            {cols.map(c => <th key={c} style={{ padding: '8px 12px', textAlign: 'left', color: '#fff', fontWeight: 700, whiteSpace: 'nowrap' }}>{c.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
              {cols.map(c => {
                const v = row[c];
                let display = '—';
                if (v !== null && v !== undefined) {
                  if (typeof v === 'boolean') display = v ? '✓' : '✗';
                  else if (typeof v === 'object') display = JSON.stringify(v);
                  else display = String(v);
                }
                return <td key={c} style={{ padding: '7px 12px', color: '#374151', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{display}</td>;
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}