// frontend/src/pages/Reports/ReportBuilder.js
// Core field selector + filter builder component — used by CreateReport and edit flow
import React from 'react';

const INPUT_STYLE = {
  width: '100%', padding: '8px 12px', border: '1px solid #D1D5DB',
  borderRadius: 8, fontSize: 14, outline: 'none', background: '#fff', boxSizing: 'border-box',
};
const LABEL_STYLE = { display: 'block', fontSize: 13, fontWeight: 600, color: '#374151', marginBottom: 6 };
const SECTION_STYLE = {
  background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, padding: 20, marginBottom: 16,
};

export default function ReportBuilder({ meta, config, onChange }) {
  const { module, fields, filters, groupBy, sortBy, chartConfig } = config;
  const moduleMeta = meta[module] || {};
  const availableFields  = moduleMeta.fields  || [];
  const availableFilters = moduleMeta.filters  || [];
  const availableGroups  = moduleMeta.groupBy  || [];

  const set = (key, val) => onChange({ ...config, [key]: val });
  const setFilter = (k, v) => onChange({ ...config, filters: { ...filters, [k]: v } });
  const setChart  = (k, v) => onChange({ ...config, chartConfig: { ...chartConfig, [k]: v } });

  const toggleField = (fieldKey) => {
    const next = fields.includes(fieldKey)
      ? fields.filter(f => f !== fieldKey)
      : [...fields, fieldKey];
    set('fields', next);
  };

  return (
    <div>
      {/* Module selector */}
      <div style={SECTION_STYLE}>
        <label style={LABEL_STYLE}>Module *</label>
        <select
          value={module}
          onChange={e => onChange({ ...config, module: e.target.value, fields: [], filters: {}, groupBy: '' })}
          style={INPUT_STYLE}
        >
          <option value="">— Select Module —</option>
          {Object.entries(meta).map(([key, m]) => (
            <option key={key} value={key}>{m.label}</option>
          ))}
        </select>
      </div>

      {module && (
        <>
          {/* Field selector */}
          <div style={SECTION_STYLE}>
            <label style={LABEL_STYLE}>Select Fields <span style={{ color: '#6B7280', fontWeight: 400 }}>({fields.length} selected)</span></label>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 10 }}>
              <button type="button" style={chipBtn('#3B82F6')} onClick={() => set('fields', availableFields.map(f => f.key))}>
                Select All
              </button>
              <button type="button" style={chipBtn('#6B7280')} onClick={() => set('fields', [])}>
                Clear
              </button>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 8 }}>
              {availableFields.map(f => {
                const selected = fields.includes(f.key);
                return (
                  <label
                    key={f.key}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '8px 12px',
                      border: `1.5px solid ${selected ? '#3B82F6' : '#E5E7EB'}`,
                      borderRadius: 8, cursor: 'pointer', fontSize: 13,
                      background: selected ? '#EFF6FF' : '#FAFAFA',
                      transition: 'all 0.15s',
                    }}
                  >
                    <input
                      type="checkbox" checked={selected}
                      onChange={() => toggleField(f.key)}
                      style={{ accentColor: '#3B82F6' }}
                    />
                    <span style={{ color: selected ? '#1D4ED8' : '#374151', fontWeight: selected ? 600 : 400 }}>
                      {f.label}
                    </span>
                  </label>
                );
              })}
            </div>
          </div>

          {/* Filters */}
          <div style={SECTION_STYLE}>
            <label style={LABEL_STYLE}>Filters</label>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 16 }}>
              {availableFilters.includes('dateFrom') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Date From</label>
                  <input type="date" value={filters.dateFrom?.split('T')[0] || ''} style={INPUT_STYLE}
                    onChange={e => setFilter('dateFrom', e.target.value ? new Date(e.target.value).toISOString() : '')} />
                </div>
              )}
              {availableFilters.includes('dateTo') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Date To</label>
                  <input type="date" value={filters.dateTo?.split('T')[0] || ''} style={INPUT_STYLE}
                    onChange={e => setFilter('dateTo', e.target.value ? new Date(e.target.value + 'T23:59:59').toISOString() : '')} />
                </div>
              )}
              {availableFilters.includes('classId') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Class ID</label>
                  <input placeholder="MongoDB ObjectId of class" value={filters.classId || ''} style={INPUT_STYLE}
                    onChange={e => setFilter('classId', e.target.value)} />
                </div>
              )}
              {availableFilters.includes('section') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Section</label>
                  <input placeholder="e.g. A, B, C" value={filters.section || ''} style={INPUT_STYLE}
                    onChange={e => setFilter('section', e.target.value)} />
                </div>
              )}
              {availableFilters.includes('gender') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Gender</label>
                  <select value={filters.gender || ''} style={INPUT_STYLE} onChange={e => setFilter('gender', e.target.value)}>
                    <option value="">All</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </div>
              )}
              {availableFilters.includes('status') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Status</label>
                  <input placeholder="e.g. active, inactive, issued" value={filters.status || ''} style={INPUT_STYLE}
                    onChange={e => setFilter('status', e.target.value)} />
                </div>
              )}
              {availableFilters.includes('method') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Payment Method</label>
                  <select value={filters.method || ''} style={INPUT_STYLE} onChange={e => setFilter('method', e.target.value)}>
                    <option value="">All</option>
                    {['cash','online','cheque','bank','upi'].map(m => <option key={m} value={m}>{m.toUpperCase()}</option>)}
                  </select>
                </div>
              )}
              {availableFilters.includes('paymentStatus') && (
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Payment Status</label>
                  <select value={filters.paymentStatus || ''} style={INPUT_STYLE} onChange={e => setFilter('paymentStatus', e.target.value)}>
                    <option value="">All</option>
                    {['paid','pending','overdue','partial'].map(s => <option key={s} value={s}>{s}</option>)}
                  </select>
                </div>
              )}
            </div>
          </div>

          {/* Group By + Sort By */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16, marginBottom: 16 }}>
            <div style={{ ...SECTION_STYLE, marginBottom: 0 }}>
              <label style={LABEL_STYLE}>Group By</label>
              <select value={groupBy || ''} onChange={e => set('groupBy', e.target.value)} style={INPUT_STYLE}>
                <option value="">— No Grouping —</option>
                {availableGroups.map(g => <option key={g} value={g}>{g}</option>)}
              </select>
            </div>
            <div style={{ ...SECTION_STYLE, marginBottom: 0 }}>
              <label style={LABEL_STYLE}>Sort Field</label>
              <select value={sortBy?.field || 'createdAt'} onChange={e => set('sortBy', { ...sortBy, field: e.target.value })} style={INPUT_STYLE}>
                {availableFields.map(f => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div style={{ ...SECTION_STYLE, marginBottom: 0 }}>
              <label style={LABEL_STYLE}>Sort Order</label>
              <select value={sortBy?.order || -1} onChange={e => set('sortBy', { ...sortBy, order: Number(e.target.value) })} style={INPUT_STYLE}>
                <option value={-1}>Descending (newest first)</option>
                <option value={1}>Ascending (oldest first)</option>
              </select>
            </div>
          </div>

          {/* Chart Config */}
          <div style={SECTION_STYLE}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: chartConfig?.enabled ? 16 : 0 }}>
              <label style={LABEL_STYLE}>Enable Chart</label>
              <input type="checkbox" checked={chartConfig?.enabled || false}
                onChange={e => setChart('enabled', e.target.checked)}
                style={{ accentColor: '#3B82F6', width: 16, height: 16 }} />
            </div>
            {chartConfig?.enabled && (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 16 }}>
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Chart Type</label>
                  <select value={chartConfig?.type || 'bar'} onChange={e => setChart('type', e.target.value)} style={INPUT_STYLE}>
                    {['bar','pie','line','doughnut'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
                  </select>
                </div>
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>X Axis Field</label>
                  <input placeholder="e.g. _id, className" value={chartConfig?.xAxis || ''} style={INPUT_STYLE}
                    onChange={e => setChart('xAxis', e.target.value)} />
                </div>
                <div>
                  <label style={{ ...LABEL_STYLE, fontWeight: 400 }}>Y Axis Field</label>
                  <input placeholder="e.g. count, totalAmount" value={chartConfig?.yAxis || ''} style={INPUT_STYLE}
                    onChange={e => setChart('yAxis', e.target.value)} />
                </div>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

function chipBtn(color) {
  return {
    background: 'transparent', border: `1px solid ${color}`, color,
    borderRadius: 6, padding: '4px 12px', fontSize: 12, cursor: 'pointer', fontWeight: 600,
  };
}