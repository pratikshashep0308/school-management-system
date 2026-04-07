// frontend/src/pages/Reports/ReportsDashboard.js
import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { reportAPI } from '../../utils/api';
import toast from 'react-hot-toast';

// ─── Stat card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color, onClick }) {
  return (
    <div
      onClick={onClick}
      style={{
        background: '#fff', borderRadius: 14, padding: '20px 22px',
        border: `1.5px solid ${color}30`, flex: 1, minWidth: 160,
        cursor: onClick ? 'pointer' : 'default',
        transition: 'transform 0.15s, box-shadow 0.15s',
        boxShadow: '0 1px 4px rgba(0,0,0,0.06)',
      }}
      onMouseEnter={e => { if (onClick) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${color}25`; } }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = '0 1px 4px rgba(0,0,0,0.06)'; }}
    >
      <div style={{ fontSize: 26, marginBottom: 8 }}>{icon}</div>
      <div style={{ fontSize: 26, fontWeight: 800, color, lineHeight: 1 }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 4 }}>{label}</div>
      {sub && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 3 }}>{sub}</div>}
    </div>
  );
}

// ─── Category badge ───────────────────────────────────────────────────────────
const CATEGORY_COLORS = {
  Students: '#3B82F6', Fees: '#10B981', Attendance: '#F97316',
  Exams: '#8B5CF6', Library: '#06B6D4', Transport: '#F59E0B',
  Teachers: '#EC4899', Classes: '#6366F1',
};

export default function ReportsDashboard() {
  const navigate = useNavigate();
  const [summary,    setSummary]    = useState(null);
  const [predefined, setPredefined] = useState([]);
  const [saved,      setSaved]      = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [searchQ,    setSearchQ]    = useState('');
  const [searching,  setSearching]  = useState(false);
  const [searchResult, setSearchResult] = useState(null);
  const [activeCategory, setActiveCategory] = useState('All');

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [dash, pre, list] = await Promise.all([
        reportAPI.getDashboard(),
        reportAPI.getPredefined(),
        reportAPI.getAll(),
      ]);
      setSummary(dash.data.data);
      setPredefined(pre.data.data);
      setSaved(list.data.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load reports');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const handleSmartSearch = async (e) => {
    e.preventDefault();
    if (!searchQ.trim()) return;
    setSearching(true);
    setSearchResult(null);
    try {
      const r = await reportAPI.smartSearch(searchQ);
      setSearchResult(r.data);
      if (r.data.count === 0) toast('No data found for this query', { icon: '🔍' });
      else toast.success(`Found ${r.data.count} results`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Search failed');
    } finally {
      setSearching(false);
    }
  };

  const fmt    = n  => (n !== undefined && n !== null) ? Number(n).toLocaleString('en-IN') : '—';
  const fmtRs  = n  => (n !== undefined && n !== null) ? `₹${Number(n).toLocaleString('en-IN')}` : '—';
  const fmtPct = n  => (n !== undefined && n !== null) ? `${n}%` : '—';

  const categories = ['All', ...new Set(predefined.map(r => r.category))];
  const filtered   = activeCategory === 'All' ? predefined : predefined.filter(r => r.category === activeCategory);

  return (
    <div style={{ padding: '24px', maxWidth: 1280, margin: '0 auto' }}>

      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 800, margin: 0, color: '#111827' }}>📊 Report Centre</h1>
          <p style={{ color: '#6B7280', margin: '5px 0 0', fontSize: 14 }}>Live school analytics · generate, export, schedule</p>
        </div>
        <button
          onClick={() => navigate('/reports/create')}
          style={{
            background: 'linear-gradient(135deg,#1D4ED8,#2563EB)', color: '#fff',
            border: 'none', borderRadius: 10, padding: '10px 22px',
            fontSize: 14, fontWeight: 700, cursor: 'pointer',
            boxShadow: '0 4px 14px rgba(29,78,216,0.4)',
          }}
        >
          + Build Report
        </button>
      </div>

      {/* Smart Search */}
      <form onSubmit={handleSmartSearch} style={{ marginBottom: 28 }}>
        <div style={{
          display: 'flex', gap: 10,
          background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 12,
          padding: '6px 8px',
          boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
        }}>
          <span style={{ fontSize: 18, padding: '6px 4px' }}>🔍</span>
          <input
            value={searchQ}
            onChange={e => setSearchQ(e.target.value)}
            placeholder='Ask anything — e.g. "show pending fees for class 10" or "absent students today"'
            style={{
              flex: 1, border: 'none', outline: 'none', fontSize: 14,
              color: '#111827', background: 'transparent',
            }}
          />
          <button
            type="submit"
            disabled={searching || !searchQ.trim()}
            style={{
              background: searching ? '#94A3B8' : '#1D4ED8', color: '#fff',
              border: 'none', borderRadius: 8, padding: '8px 20px',
              fontSize: 13, fontWeight: 700, cursor: searching ? 'not-allowed' : 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {searching ? '⏳ Searching…' : 'Search'}
          </button>
        </div>
      </form>

      {/* Smart search result */}
      {searchResult && (
        <div style={{ background: '#fff', border: '1.5px solid #3B82F6', borderRadius: 12, padding: 20, marginBottom: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div>
              <span style={{ fontSize: 13, color: '#6B7280' }}>Interpreted: </span>
              <span style={{ fontSize: 13, fontWeight: 700, color: '#1D4ED8' }}>
                module={searchResult.interpreted?.module || '?'} · {searchResult.count} rows
              </span>
              {searchResult.interpreted?.groupBy && (
                <span style={{ fontSize: 13, color: '#6B7280' }}> · grouped by {searchResult.interpreted.groupBy}</span>
              )}
            </div>
            <button
              onClick={() => navigate('/reports/run', { state: { config: { module: searchResult.module, fields: [], filters: searchResult.interpreted?.filters || {}, groupBy: searchResult.interpreted?.groupBy || '', name: `Search: ${searchQ}` } } })}
              style={{ fontSize: 12, color: '#1D4ED8', background: 'none', border: '1px solid #1D4ED8', borderRadius: 6, padding: '4px 12px', cursor: 'pointer' }}
            >
              Open Full Report
            </button>
          </div>
          <SmallTable data={searchResult.data.slice(0, 10)} />
          {searchResult.count > 10 && (
            <p style={{ fontSize: 12, color: '#9CA3AF', margin: '8px 0 0', textAlign: 'center' }}>
              Showing 10 of {searchResult.count} rows — open full report to see all
            </p>
          )}
        </div>
      )}

      {/* Live Summary Cards */}
      {loading ? (
        <div style={{ display: 'flex', gap: 16, marginBottom: 32, flexWrap: 'wrap' }}>
          {[...Array(5)].map((_, i) => (
            <div key={i} style={{ flex: 1, minWidth: 160, height: 104, background: '#F3F4F6', borderRadius: 14, animation: 'pulse 1.5s infinite' }} />
          ))}
        </div>
      ) : summary && (
        <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 32 }}>
          <StatCard icon="👥" label="Total Students"     color="#3B82F6" value={fmt(summary.students?.total)}        sub={`${fmt(summary.students?.active)} active`} />
          <StatCard icon="💰" label="Fees Collected"     color="#10B981" value={fmtRs(summary.fees?.paid)}           sub={`Rate: ${fmtPct(summary.fees?.collectionRate)}`} />
          <StatCard icon="⚠️" label="Fees Pending"       color="#EF4444" value={fmtRs(summary.fees?.pending)}        sub="Outstanding balance" onClick={() => navigate('/reports/run', { state: { config: predefined.find(p => p.id === 'fees-pending') || {} } })} />
          <StatCard icon="📅" label="Today's Attendance" color="#F97316" value={fmtPct(summary.attendanceToday?.percentage)} sub={`${fmt(summary.attendanceToday?.present)} / ${fmt(summary.attendanceToday?.total)} present`} />
          <StatCard icon="📚" label="Library Issues"     color="#8B5CF6" value={fmt(summary.library?.activeIssues)}  sub="Books currently out" />
          <StatCard icon="📈" label="This Month Collected" color="#06B6D4" value={fmtRs(summary.fees?.collectedThisMonth)} sub="Fee collection MTD" />
        </div>
      )}

      {/* Quick Reports */}
      <div style={{ marginBottom: 32 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
          <h2 style={{ fontSize: 17, fontWeight: 800, margin: 0 }}>⚡ Quick Reports</h2>
          <div style={{ display: 'flex', gap: 6 }}>
            {categories.map(cat => (
              <button
                key={cat}
                onClick={() => setActiveCategory(cat)}
                style={{
                  background: activeCategory === cat ? '#1D4ED8' : 'transparent',
                  color: activeCategory === cat ? '#fff' : '#6B7280',
                  border: `1px solid ${activeCategory === cat ? '#1D4ED8' : '#E5E7EB'}`,
                  borderRadius: 20, padding: '4px 14px', fontSize: 12,
                  fontWeight: 600, cursor: 'pointer',
                }}
              >
                {cat}
              </button>
            ))}
          </div>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(270px,1fr))', gap: 14 }}>
          {filtered.map(r => {
            const catColor = CATEGORY_COLORS[r.category] || '#6B7280';
            return (
              <div
                key={r.id}
                onClick={() => navigate('/reports/run', { state: { config: r } })}
                style={{
                  background: '#fff', border: '1.5px solid #F3F4F6',
                  borderRadius: 12, padding: '16px 18px', cursor: 'pointer',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
                }}
                onMouseEnter={e => { e.currentTarget.style.borderColor = catColor; e.currentTarget.style.boxShadow = `0 4px 16px ${catColor}20`; }}
                onMouseLeave={e => { e.currentTarget.style.borderColor = '#F3F4F6'; e.currentTarget.style.boxShadow = '0 1px 3px rgba(0,0,0,0.05)'; }}
              >
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                  <span style={{
                    fontSize: 10, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8,
                    color: catColor, background: `${catColor}12`, padding: '3px 8px', borderRadius: 20,
                  }}>
                    {r.category}
                  </span>
                  {r.chartConfig?.enabled && <span style={{ fontSize: 12 }}>📊</span>}
                </div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 6 }}>{r.name}</div>
                <div style={{ fontSize: 12, color: '#9CA3AF', lineHeight: 1.4 }}>{r.description}</div>
                <div style={{ marginTop: 10, display: 'flex', gap: 6 }}>
                  <span style={{ fontSize: 10, color: '#6B7280', background: '#F9FAFB', padding: '2px 8px', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                    {r.fields?.length} fields
                  </span>
                  {r.groupBy && (
                    <span style={{ fontSize: 10, color: '#6B7280', background: '#F9FAFB', padding: '2px 8px', borderRadius: 10, border: '1px solid #E5E7EB' }}>
                      grouped
                    </span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Saved Reports */}
      {saved.length > 0 && (
        <div>
          <h2 style={{ fontSize: 17, fontWeight: 800, marginBottom: 14 }}>💾 Saved Reports</h2>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F8FAFC', borderBottom: '1px solid #E5E7EB' }}>
                  {['Report Name','Module','By','Updated','Actions'].map(h => (
                    <th key={h} style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5 }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saved.map((r, i) => (
                  <tr key={r._id} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                    <td style={{ padding: '11px 16px', fontWeight: 600, color: '#111827' }}>
                      {r.isTemplate && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 9, padding: '2px 6px', borderRadius: 4, marginRight: 6, fontWeight: 700 }}>TPL</span>}
                      {r.name}
                    </td>
                    <td style={{ padding: '11px 16px' }}>
                      <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'capitalize', color: CATEGORY_COLORS[r.module] || '#6B7280', background: `${CATEGORY_COLORS[r.module] || '#6B7280'}10`, padding: '2px 8px', borderRadius: 10 }}>
                        {r.module}
                      </span>
                    </td>
                    <td style={{ padding: '11px 16px', color: '#6B7280' }}>{r.createdBy?.name || '—'}</td>
                    <td style={{ padding: '11px 16px', color: '#6B7280' }}>{new Date(r.updatedAt).toLocaleDateString('en-IN')}</td>
                    <td style={{ padding: '11px 16px' }}>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <TinyBtn label="▶ Run"  color="#3B82F6" onClick={() => navigate('/reports/run',  { state: { reportId: r._id, config: r } })} />
                        <TinyBtn label="✏ Edit" color="#6B7280" onClick={() => navigate('/reports/edit/' + r._id, { state: { report: r } })} />
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function TinyBtn({ label, color, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{ background: 'none', border: `1px solid ${color}`, color, borderRadius: 6, padding: '4px 10px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}
    >
      {label}
    </button>
  );
}

function SmallTable({ data }) {
  if (!data?.length) return <p style={{ color: '#9CA3AF', fontSize: 13 }}>No results.</p>;
  const cols = Object.keys(data[0]).filter(k => !['_id','__v'].includes(k)).slice(0, 8);
  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
        <thead>
          <tr style={{ background: '#F1F5F9' }}>
            {cols.map(c => <th key={c} style={{ padding: '6px 10px', textAlign: 'left', fontWeight: 700, color: '#374151', whiteSpace: 'nowrap' }}>{c.replace(/([A-Z])/g,' $1').replace(/^./,s=>s.toUpperCase())}</th>)}
          </tr>
        </thead>
        <tbody>
          {data.map((row, i) => (
            <tr key={i} style={{ borderBottom: '1px solid #F3F4F6' }}>
              {cols.map(c => (
                <td key={c} style={{ padding: '6px 10px', color: '#374151', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {(() => { const v = row[c]; if (v === null || v === undefined) return '—'; if (typeof v === 'boolean') return v ? '✓' : '✗'; if (typeof v === 'object') return JSON.stringify(v); return String(v); })()}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}