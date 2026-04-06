// frontend/src/pages/Reports/ReportsDashboard.js
import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import reportAPI from '../../utils/reportAPI';
import toast from 'react-hot-toast';

const CARD_STYLES = {
  students:   { bg: '#EFF6FF', border: '#3B82F6', icon: '👥', color: '#1D4ED8' },
  fees:       { bg: '#F0FDF4', border: '#22C55E', icon: '💰', color: '#15803D' },
  pending:    { bg: '#FEF2F2', border: '#EF4444', icon: '⚠️', color: '#B91C1C' },
  attendance: { bg: '#FFF7ED', border: '#F97316', icon: '📅', color: '#C2410C' },
  library:    { bg: '#FAF5FF', border: '#A855F7', icon: '📚', color: '#7E22CE' },
};

function StatCard({ title, value, sub, style }) {
  return (
    <div style={{
      background: style.bg, border: `1.5px solid ${style.border}`,
      borderRadius: 12, padding: '20px 24px', flex: 1, minWidth: 160,
    }}>
      <div style={{ fontSize: 28, marginBottom: 6 }}>{style.icon}</div>
      <div style={{ fontSize: 28, fontWeight: 700, color: style.color }}>{value}</div>
      <div style={{ fontSize: 13, fontWeight: 600, color: '#374151', marginTop: 2 }}>{title}</div>
      {sub && <div style={{ fontSize: 12, color: '#6B7280', marginTop: 4 }}>{sub}</div>}
    </div>
  );
}

export default function ReportsDashboard() {
  const navigate     = useNavigate();
  const [summary, setSummary]       = useState(null);
  const [predefined, setPredefined] = useState([]);
  const [saved, setSaved]           = useState([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    Promise.all([
      reportAPI.getDashboard(),
      reportAPI.getPredefined(),
      reportAPI.list(),
    ]).then(([dash, pre, list]) => {
      setSummary(dash.data.data);
      setPredefined(pre.data.data);
      setSaved(list.data.data);
    }).catch(() => toast.error('Failed to load report dashboard'))
      .finally(() => setLoading(false));
  }, []);

  const fmt = (n) => n !== undefined ? Number(n).toLocaleString('en-IN') : '—';
  const fmtRs = (n) => n !== undefined ? `₹${Number(n).toLocaleString('en-IN')}` : '—';

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 300 }}>
      <div style={{ fontSize: 16, color: '#6B7280' }}>Loading reports...</div>
    </div>
  );

  return (
    <div style={{ padding: '24px', maxWidth: 1200, margin: '0 auto' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 28 }}>
        <div>
          <h1 style={{ fontSize: 26, fontWeight: 700, margin: 0 }}>📊 Reports</h1>
          <p style={{ color: '#6B7280', margin: '4px 0 0' }}>School analytics and data exports</p>
        </div>
        <button
          onClick={() => navigate('/reports/create')}
          style={{
            background: '#1D4ED8', color: '#fff', border: 'none', borderRadius: 8,
            padding: '10px 20px', fontSize: 14, fontWeight: 600, cursor: 'pointer',
          }}
        >
          + Create Report
        </button>
      </div>

      {/* Summary Cards */}
      {summary && (
        <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap', marginBottom: 32 }}>
          <StatCard title="Total Students"    value={fmt(summary.students?.total)}    sub={`${fmt(summary.students?.active)} active`}   style={CARD_STYLES.students} />
          <StatCard title="Fees Collected"    value={fmtRs(summary.fees?.paid)}       sub={`Rate: ${summary.fees?.collectionRate}%`}     style={CARD_STYLES.fees} />
          <StatCard title="Fees Pending"      value={fmtRs(summary.fees?.pending)}    sub="Outstanding balance"                          style={CARD_STYLES.pending} />
          <StatCard title="Today's Attendance" value={`${summary.attendance?.percentage}%`} sub={`${fmt(summary.attendance?.present)} / ${fmt(summary.attendance?.total)} present`} style={CARD_STYLES.attendance} />
          <StatCard title="Library Issues"    value={fmt(summary.library?.activeIssues)} sub="Books currently issued"                    style={CARD_STYLES.library} />
        </div>
      )}

      {/* Predefined Reports */}
      <div style={{ marginBottom: 32 }}>
        <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>⚡ Quick Reports</h2>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 16 }}>
          {predefined.map(r => (
            <div
              key={r.id}
              onClick={() => navigate('/reports/run', { state: { config: r } })}
              style={{
                background: '#fff', border: '1.5px solid #E5E7EB', borderRadius: 10,
                padding: '16px 20px', cursor: 'pointer', transition: 'border-color 0.2s',
              }}
              onMouseEnter={e => e.currentTarget.style.borderColor = '#3B82F6'}
              onMouseLeave={e => e.currentTarget.style.borderColor = '#E5E7EB'}
            >
              <div style={{ fontSize: 13, color: '#6B7280', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>
                {r.module}
              </div>
              <div style={{ fontWeight: 600, fontSize: 15, color: '#111827' }}>{r.name}</div>
              <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 8 }}>
                {r.fields?.length} fields · {r.groupBy ? `grouped by ${r.groupBy}` : 'no grouping'}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Saved Reports */}
      {saved.length > 0 && (
        <div>
          <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>💾 Saved Reports</h2>
          <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 10, overflow: 'hidden' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse' }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Name','Module','Created By','Last Updated','Actions'].map(h => (
                    <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 600, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {saved.map((r, idx) => (
                  <tr key={r._id} style={{ borderBottom: '1px solid #F3F4F6', background: idx % 2 ? '#FAFAFA' : '#fff' }}>
                    <td style={{ padding: '12px 16px', fontWeight: 500, fontSize: 14 }}>
                      {r.isTemplate && <span style={{ background: '#FEF3C7', color: '#92400E', fontSize: 10, padding: '2px 6px', borderRadius: 4, marginRight: 6 }}>TEMPLATE</span>}
                      {r.name}
                    </td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280', textTransform: 'capitalize' }}>{r.module}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{r.createdBy?.name || '—'}</td>
                    <td style={{ padding: '12px 16px', fontSize: 13, color: '#6B7280' }}>{new Date(r.updatedAt).toLocaleDateString()}</td>
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', gap: 8 }}>
                        <ActionBtn label="▶ Run" color="#3B82F6" onClick={() => navigate('/reports/run', { state: { reportId: r._id, config: r } })} />
                        <ActionBtn label="✏ Edit" color="#6B7280" onClick={() => navigate(`/reports/edit/${r._id}`, { state: { report: r } })} />
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

function ActionBtn({ label, color, onClick }) {
  return (
    <button
      onClick={e => { e.stopPropagation(); onClick(); }}
      style={{
        background: 'transparent', border: `1px solid ${color}`, color,
        borderRadius: 6, padding: '4px 10px', fontSize: 12, cursor: 'pointer', fontWeight: 500,
      }}
    >
      {label}
    </button>
  );
}