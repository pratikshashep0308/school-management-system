// frontend/src/pages/ParentDashboard.js
// Parents see exactly the same data as students — same API, different header styling
// The backend automatically returns the linked child's data based on JWT token

import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalAPI } from '../utils/studentPortalAPI';
import toast from 'react-hot-toast';

export default function ParentDashboard() {
  const { user } = useAuth();
  const [data, setData]       = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('overview');

  useEffect(() => {
    studentPortalAPI.getDashboard()
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh', fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>👨‍👩‍👧</div>
        <div style={{ color: '#64748b', fontWeight: 600 }}>Loading your child's information...</div>
      </div>
    </div>
  );

  if (!data) return null;
  const { student, stats, recentAttendance, recentResults, recentFees, notifications } = data;

  const TABS = ['overview', 'attendance', 'results', 'fees'];

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: "'Nunito', sans-serif" }}>

      {/* Parent Header */}
      <div style={{ background: 'linear-gradient(135deg, #7c3aed, #9333ea)', borderRadius: 20, padding: '28px 32px', marginBottom: 24, color: '#fff' }}>
        <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', marginBottom: 4 }}>
          Parent Portal — Logged in as {user.name}
        </div>
        <div style={{ fontSize: 18, fontWeight: 900, marginBottom: 12 }}>👨‍👩‍👧 Your Child's Information</div>

        {/* Child Info Card */}
        <div style={{ background: 'rgba(255,255,255,0.15)', borderRadius: 14, padding: '16px 20px', display: 'flex', gap: 20, alignItems: 'center' }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'rgba(255,255,255,0.2)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24 }}>🎓</div>
          <div>
            <div style={{ fontWeight: 900, fontSize: 20 }}>{student?.user?.name}</div>
            <div style={{ fontSize: 13, opacity: 0.8 }}>
              {student?.class?.name} &nbsp;•&nbsp; Roll No: {student?.rollNumber} &nbsp;•&nbsp; Adm: {student?.admissionNumber}
            </div>
            <div style={{ fontSize: 12, opacity: 0.65, marginTop: 2 }}>{student?.user?.email}</div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700,
            fontSize: 13, textTransform: 'capitalize', transition: 'all 0.15s',
            background: tab === t ? '#7c3aed' : '#f1f5f9',
            color:      tab === t ? '#fff'    : '#64748b',
          }}>
            {{ overview: '🏠', attendance: '📅', results: '📊', fees: '💰' }[t]} {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW ── */}
      {tab === 'overview' && (
        <div>
          {/* Quick Stats */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            {[
              { icon: '📅', label: 'Attendance', value: `${stats.attendancePercentage}%`, color: stats.attendancePercentage >= 75 ? '#16a34a' : '#dc2626' },
              { icon: '💰', label: 'Fee Paid',   value: `₹${stats.feePaid.toLocaleString()}`, color: '#2563eb' },
              { icon: '⚠️', label: 'Fee Due',    value: `₹${stats.feePending.toLocaleString()}`, color: stats.feePending > 0 ? '#dc2626' : '#16a34a' },
              { icon: '📊', label: 'Exams',      value: stats.totalResults, color: '#9333ea' },
            ].map(c => (
              <div key={c.label} style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 12px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 16 }}>
                <div style={{ width: 48, height: 48, borderRadius: 12, background: c.color + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22 }}>{c.icon}</div>
                <div>
                  <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
                  <div style={{ fontSize: 22, fontWeight: 900, color: c.color }}>{c.value}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Attendance Warning */}
          {stats.attendancePercentage < 75 && (
            <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 14, padding: '14px 20px', marginBottom: 20, color: '#dc2626', fontWeight: 700 }}>
              ⚠️ Your child's attendance is below 75% ({stats.attendancePercentage}%). Please ensure regular attendance.
            </div>
          )}

          {/* Fee Alert */}
          {stats.feePending > 0 && (
            <div style={{ background: '#fef9c3', border: '1px solid #fde047', borderRadius: 14, padding: '14px 20px', marginBottom: 20, color: '#b45309', fontWeight: 700 }}>
              💰 Fee pending: ₹{stats.feePending.toLocaleString()}. Please clear dues to avoid penalties.
            </div>
          )}

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Recent Attendance */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, marginBottom: 16, color: '#1e293b' }}>📅 Recent Attendance</div>
              {recentAttendance.slice(0, 7).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                    background: r.status === 'present' ? '#dcfce7' : '#fee2e2',
                    color:      r.status === 'present' ? '#16a34a' : '#dc2626',
                  }}>{r.status.toUpperCase()}</span>
                </div>
              ))}
            </div>

            {/* Recent Results */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, marginBottom: 16, color: '#1e293b' }}>📊 Recent Results</div>
              {recentResults.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No results yet</div>}
              {recentResults.slice(0, 5).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div>
                    <div style={{ fontSize: 13, fontWeight: 700 }}>{r.exam?.name}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>{r.exam?.subject?.name}</div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <div style={{ fontWeight: 900, color: r.percentage >= 35 ? '#16a34a' : '#dc2626' }}>{r.marksObtained}/{r.exam?.totalMarks}</div>
                    <div style={{ fontSize: 11, color: '#94a3b8' }}>Grade: {r.grade}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* School Notifications */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)', marginTop: 20 }}>
            <div style={{ fontWeight: 800, marginBottom: 16, color: '#1e293b' }}>🔔 School Notifications</div>
            {notifications.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No notifications</div>}
            {notifications.map((n, i) => (
              <div key={i} style={{ padding: '12px 0', borderBottom: '1px solid #f1f5f9' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: '#1e293b' }}>{n.title}</div>
                  <span style={{
                    fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 99, flexShrink: 0, marginLeft: 12,
                    background: n.priority === 'high' ? '#fee2e2' : '#f1f5f9',
                    color:      n.priority === 'high' ? '#dc2626' : '#64748b',
                  }}>{n.priority?.toUpperCase()}</span>
                </div>
                <div style={{ fontSize: 13, color: '#64748b', marginTop: 4 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 6 }}>{new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Other tabs reuse same components as Student Dashboard */}
      {tab === 'attendance' && <ParentAttendanceTab />}
      {tab === 'results'    && <ParentResultsTab />}
      {tab === 'fees'       && <ParentFeesTab />}
    </div>
  );
}

function ParentAttendanceTab() {
  const [data, setData]   = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear]   = useState(new Date().getFullYear());

  useEffect(() => {
    studentPortalAPI.getAttendance(month, year)
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load attendance'));
  }, [month, year]);

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  const { summary, records } = data;

  return (
    <div>
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontWeight: 600 }}>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m,i) => <option key={i} value={i+1}>{m}</option>)}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontWeight: 600 }}>
          {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Total',      value: summary.total },
          { label: 'Present',   value: summary.present,    color: '#16a34a' },
          { label: 'Absent',    value: summary.absent,     color: '#dc2626' },
          { label: '%',         value: `${summary.percentage}%`, color: summary.percentage >= 75 ? '#16a34a' : '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '16px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 26, fontWeight: 900, color: c.color || '#1e293b' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8faff' }}>
            {['Date','Day','Status','Remarks'].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {records.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: 13 }}>{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long' })}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: r.status === 'present' ? '#dcfce7' : '#fee2e2', color: r.status === 'present' ? '#16a34a' : '#dc2626' }}>{r.status.toUpperCase()}</span>
                </td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#94a3b8' }}>{r.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function ParentResultsTab() {
  const [data, setData] = useState(null);
  useEffect(() => { studentPortalAPI.getResults().then(r => setData(r.data.data)).catch(() => toast.error('Failed to load')); }, []);
  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.results?.map((r, i) => (
        <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800 }}>{r.exam?.name}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{r.exam?.subject?.name} • {r.exam?.examType}</div>
          </div>
          <div style={{ textAlign: 'right' }}>
            <div style={{ fontWeight: 900, fontSize: 18 }}>{r.marksObtained}/{r.exam?.totalMarks}</div>
            <div style={{ fontSize: 12, color: r.percentage >= 35 ? '#16a34a' : '#dc2626', fontWeight: 700 }}>{r.percentage}% — {r.grade}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ParentFeesTab() {
  const [data, setData] = useState(null);
  useEffect(() => { studentPortalAPI.getFees().then(r => setData(r.data.data)).catch(() => toast.error('Failed to load')); }, []);
  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>
        {[
          { label: 'Paid',    value: `₹${data.summary.paid.toLocaleString()}`,    color: '#16a34a' },
          { label: 'Pending', value: `₹${data.summary.pending.toLocaleString()}`, color: '#f59e0b' },
          { label: 'Overdue', value: `₹${data.summary.overdue.toLocaleString()}`, color: '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '16px', textAlign: 'center', boxShadow: '0 2px 8px rgba(0,0,0,0.06)' }}>
            <div style={{ fontSize: 24, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8' }}>{c.label}</div>
          </div>
        ))}
      </div>
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead><tr style={{ background: '#f8faff' }}>
            {['Month','Amount','Method','Date','Status'].map(h => <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#94a3b8' }}>{h}</th>)}
          </tr></thead>
          <tbody>
            {data.payments.map((p, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontWeight: 600 }}>{p.month}</td>
                <td style={{ padding: '12px 16px', fontWeight: 800 }}>₹{p.amount.toLocaleString()}</td>
                <td style={{ padding: '12px 16px', color: '#64748b', textTransform: 'capitalize' }}>{p.method}</td>
                <td style={{ padding: '12px 16px', color: '#64748b' }}>{p.paidOn ? new Date(p.paidOn).toLocaleDateString('en-IN') : '—'}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: p.status === 'paid' ? '#dcfce7' : '#fee2e2', color: p.status === 'paid' ? '#16a34a' : '#dc2626' }}>{p.status.toUpperCase()}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}