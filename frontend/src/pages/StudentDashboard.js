// frontend/src/pages/StudentDashboard.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalAPI } from '../utils/studentPortalAPI';
import toast from 'react-hot-toast';

// ── Stat Card ────────────────────────────────────────────────────────────────
function StatCard({ icon, label, value, sub, color }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 16, padding: '20px 24px',
      boxShadow: '0 2px 12px rgba(0,0,0,0.07)', display: 'flex', alignItems: 'center', gap: 16,
    }}>
      <div style={{
        width: 52, height: 52, borderRadius: 14, background: color + '18',
        display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 24, flexShrink: 0,
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>{label}</div>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#1e293b' }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: '#94a3b8' }}>{sub}</div>}
      </div>
    </div>
  );
}

// ── Attendance Bar ───────────────────────────────────────────────────────────
function AttendanceBar({ percentage }) {
  const color = percentage >= 75 ? '#16a34a' : percentage >= 60 ? '#f59e0b' : '#dc2626';
  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 6 }}>
        <span style={{ fontSize: 13, fontWeight: 600, color: '#64748b' }}>Attendance</span>
        <span style={{ fontSize: 13, fontWeight: 800, color }}>{percentage}%</span>
      </div>
      <div style={{ height: 8, background: '#f1f5f9', borderRadius: 99 }}>
        <div style={{ height: '100%', width: `${percentage}%`, background: color, borderRadius: 99, transition: 'width 0.6s' }} />
      </div>
      {percentage < 75 && (
        <div style={{ fontSize: 11, color: '#dc2626', marginTop: 4 }}>⚠️ Below 75% minimum required</div>
      )}
    </div>
  );
}

// ── Main Dashboard ───────────────────────────────────────────────────────────
export default function StudentDashboard() {
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
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '60vh' }}>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>📚</div>
        <div style={{ color: '#64748b', fontWeight: 600 }}>Loading your dashboard...</div>
      </div>
    </div>
  );

  if (!data) return null;

  const { student, stats, recentAttendance, recentResults, recentFees, upcomingAssignments, notifications } = data;
  const isParent = user.role === 'parent';

  const TABS = ['overview', 'attendance', 'results', 'fees', 'assignments'];

  return (
    <div style={{ padding: '24px', maxWidth: 1100, margin: '0 auto', fontFamily: "'Nunito', sans-serif" }}>

      {/* Header */}
      <div style={{
        background: 'linear-gradient(135deg, #1a3a6b, #2563eb)',
        borderRadius: 20, padding: '28px 32px', marginBottom: 24, color: '#fff',
        display: 'flex', alignItems: 'center', gap: 20,
      }}>
        <div style={{
          width: 64, height: 64, borderRadius: '50%',
          background: 'rgba(255,255,255,0.2)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 28,
        }}>
          {student?.user?.profileImage
            ? <img src={student.user.profileImage} alt="" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }} />
            : (isParent ? '👨‍👩‍👧' : '🎓')}
        </div>
        <div>
          <div style={{ fontSize: 11, opacity: 0.7, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            {isParent ? "Parent Dashboard — Viewing" : "Student Dashboard"}
          </div>
          <div style={{ fontSize: 24, fontWeight: 900 }}>{student?.user?.name}</div>
          <div style={{ fontSize: 13, opacity: 0.8 }}>
            {student?.class?.name} • Roll No: {student?.rollNumber} • {student?.admissionNumber}
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div style={{ display: 'flex', gap: 8, marginBottom: 24, flexWrap: 'wrap' }}>
        {TABS.map(t => (
          <button key={t} onClick={() => setTab(t)} style={{
            padding: '8px 20px', borderRadius: 10, border: 'none', cursor: 'pointer', fontWeight: 700,
            fontSize: 13, textTransform: 'capitalize', transition: 'all 0.15s',
            background: tab === t ? '#1a3a6b' : '#f1f5f9',
            color:      tab === t ? '#fff'    : '#64748b',
          }}>
            {{ overview: '🏠', attendance: '📅', results: '📊', fees: '💰', assignments: '📝' }[t]} {t}
          </button>
        ))}
      </div>

      {/* ── OVERVIEW TAB ── */}
      {tab === 'overview' && (
        <div>
          {/* Stat Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16, marginBottom: 24 }}>
            <StatCard icon="📅" label="Attendance" value={`${stats.attendancePercentage}%`} color="#16a34a" />
            <StatCard icon="💰" label="Fee Paid"   value={`₹${stats.feePaid.toLocaleString()}`} sub={stats.feePending > 0 ? `₹${stats.feePending.toLocaleString()} pending` : 'All clear!'} color="#2563eb" />
            <StatCard icon="📊" label="Results"    value={stats.totalResults} sub="exams recorded" color="#9333ea" />
            <StatCard icon="📝" label="Assignments" value={stats.pendingAssignments} sub="upcoming" color="#f59e0b" />
          </div>

          {/* Attendance Bar */}
          <div style={{ background: '#fff', borderRadius: 16, padding: 24, marginBottom: 20, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
            <AttendanceBar percentage={stats.attendancePercentage} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
            {/* Recent Attendance */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, marginBottom: 16, color: '#1e293b' }}>📅 Recent Attendance</div>
              {recentAttendance.slice(0, 7).map((r, i) => (
                <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <span style={{ fontSize: 13, color: '#64748b' }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 99,
                    background: r.status === 'present' ? '#dcfce7' : r.status === 'absent' ? '#fee2e2' : '#fef9c3',
                    color:      r.status === 'present' ? '#16a34a' : r.status === 'absent' ? '#dc2626' : '#b45309',
                  }}>{r.status.toUpperCase()}</span>
                </div>
              ))}
            </div>

            {/* Notifications */}
            <div style={{ background: '#fff', borderRadius: 16, padding: 24, boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
              <div style={{ fontWeight: 800, marginBottom: 16, color: '#1e293b' }}>🔔 Notifications</div>
              {notifications.length === 0 && <div style={{ color: '#94a3b8', fontSize: 13 }}>No notifications</div>}
              {notifications.map((n, i) => (
                <div key={i} style={{ padding: '10px 0', borderBottom: '1px solid #f1f5f9' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1e293b' }}>{n.title}</div>
                  <div style={{ fontSize: 12, color: '#64748b', marginTop: 2 }}>{n.message.slice(0, 80)}...</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 4 }}>{new Date(n.createdAt).toLocaleDateString()}</div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* ── ATTENDANCE TAB ── */}
      {tab === 'attendance' && <AttendanceTab studentId={data.student?._id} />}

      {/* ── RESULTS TAB ── */}
      {tab === 'results' && <ResultsTab />}

      {/* ── FEES TAB ── */}
      {tab === 'fees' && <FeesTab />}

      {/* ── ASSIGNMENTS TAB ── */}
      {tab === 'assignments' && <AssignmentsTab />}
    </div>
  );
}

// ── ATTENDANCE TAB ───────────────────────────────────────────────────────────
function AttendanceTab() {
  const [data, setData]     = useState(null);
  const [month, setMonth]   = useState(new Date().getMonth() + 1);
  const [year, setYear]     = useState(new Date().getFullYear());

  useEffect(() => {
    studentPortalAPI.getAttendance(month, year)
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load attendance'));
  }, [month, year]);

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  const { summary, records } = data;

  return (
    <div>
      {/* Filter */}
      <div style={{ display: 'flex', gap: 12, marginBottom: 20 }}>
        <select value={month} onChange={e => setMonth(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontWeight: 600 }}>
          {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
            <option key={i} value={i+1}>{m}</option>
          ))}
        </select>
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '8px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontWeight: 600 }}>
          {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Days', value: summary.total, color: '#2563eb' },
          { label: 'Present',    value: summary.present, color: '#16a34a' },
          { label: 'Absent',     value: summary.absent,  color: '#dc2626' },
          { label: 'Percentage', value: `${summary.percentage}%`, color: summary.percentage >= 75 ? '#16a34a' : '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: c.color }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Records Table */}
      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              {['Date', 'Day', 'Status', 'Remarks'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={4} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No records for this period</td></tr>
            )}
            {records.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long' })}</td>
                <td style={{ padding: '12px 16px' }}>
                  <span style={{
                    fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                    background: r.status === 'present' ? '#dcfce7' : r.status === 'absent' ? '#fee2e2' : '#fef9c3',
                    color:      r.status === 'present' ? '#16a34a' : r.status === 'absent' ? '#dc2626' : '#b45309',
                  }}>{r.status.toUpperCase()}</span>
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

// ── RESULTS TAB ──────────────────────────────────────────────────────────────
function ResultsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getResults()
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load results'));
  }, []);

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  const { summary, results } = data;

  const gradeColor = g => ({ 'A+': '#16a34a', A: '#16a34a', 'B+': '#2563eb', B: '#2563eb', C: '#f59e0b', D: '#f97316', F: '#dc2626' }[g] || '#64748b');

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 24 }}>
        {[
          { label: 'Total Exams', value: summary.total },
          { label: 'Passed',      value: summary.passed,  color: '#16a34a' },
          { label: 'Failed',      value: summary.failed,  color: '#dc2626' },
          { label: 'Average',     value: `${summary.average}%`, color: summary.average >= 60 ? '#16a34a' : '#dc2626' },
        ].map(c => (
          <div key={c.label} style={{ background: '#fff', borderRadius: 14, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', textAlign: 'center' }}>
            <div style={{ fontSize: 28, fontWeight: 900, color: c.color || '#1e293b' }}>{c.value}</div>
            <div style={{ fontSize: 12, color: '#94a3b8', fontWeight: 600 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results.length === 0 && <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', color: '#94a3b8' }}>No results yet</div>}
        {results.map((r, i) => (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '16px 20px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div>
              <div style={{ fontWeight: 800, color: '#1e293b' }}>{r.exam?.name}</div>
              <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 2 }}>
                {r.exam?.subject?.name} • {r.exam?.examType?.toUpperCase()} • {r.exam?.date ? new Date(r.exam.date).toLocaleDateString('en-IN') : ''}
              </div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 16 }}>
              <div style={{ textAlign: 'right' }}>
                <div style={{ fontWeight: 900, fontSize: 18, color: '#1e293b' }}>{r.marksObtained}/{r.exam?.totalMarks}</div>
                <div style={{ fontSize: 12, color: '#64748b' }}>{r.percentage}%</div>
              </div>
              <div style={{ width: 40, height: 40, borderRadius: '50%', background: gradeColor(r.grade) + '18', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: gradeColor(r.grade), fontSize: 14 }}>
                {r.grade}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── FEES TAB ─────────────────────────────────────────────────────────────────
function FeesTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getFees()
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load fees'));
  }, []);

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;
  const { summary, payments } = data;

  const statusStyle = s => ({
    paid:    { bg: '#dcfce7', color: '#16a34a' },
    pending: { bg: '#fef9c3', color: '#b45309' },
    overdue: { bg: '#fee2e2', color: '#dc2626' },
    partial: { bg: '#e0f2fe', color: '#0284c7' },
  }[s] || { bg: '#f1f5f9', color: '#64748b' });

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 12, marginBottom: 24 }}>
        <StatCard icon="✅" label="Total Paid"    value={`₹${summary.paid.toLocaleString()}`}    color="#16a34a" />
        <StatCard icon="⏳" label="Pending"        value={`₹${summary.pending.toLocaleString()}`} color="#f59e0b" />
        <StatCard icon="⚠️" label="Overdue"        value={`₹${summary.overdue.toLocaleString()}`} color="#dc2626" />
      </div>

      <div style={{ background: '#fff', borderRadius: 16, overflow: 'hidden', boxShadow: '0 2px 12px rgba(0,0,0,0.07)' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              {['Receipt No', 'Month', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 16px', textAlign: 'left', fontSize: 12, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments.length === 0 && (
              <tr><td colSpan={6} style={{ padding: 32, textAlign: 'center', color: '#94a3b8' }}>No payment records</td></tr>
            )}
            {payments.map((p, i) => {
              const s = statusStyle(p.status);
              return (
                <tr key={i} style={{ borderTop: '1px solid #f1f5f9' }}>
                  <td style={{ padding: '12px 16px', fontSize: 12, fontFamily: 'monospace', color: '#64748b' }}>{p.receiptNumber || '—'}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>{p.month}</td>
                  <td style={{ padding: '12px 16px', fontWeight: 800, color: '#1e293b' }}>₹{p.amount.toLocaleString()}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{p.method}</td>
                  <td style={{ padding: '12px 16px', fontSize: 13, color: '#64748b' }}>{p.paidOn ? new Date(p.paidOn).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '12px 16px' }}>
                    <span style={{ fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99, background: s.bg, color: s.color }}>{p.status.toUpperCase()}</span>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ── ASSIGNMENTS TAB ──────────────────────────────────────────────────────────
function AssignmentsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getAssignments()
      .then(res => setData(res.data.data))
      .catch(() => toast.error('Failed to load assignments'));
  }, []);

  if (!data) return <div style={{ textAlign: 'center', padding: 40 }}>Loading...</div>;

  const now = new Date();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      {data.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 16, padding: 32, textAlign: 'center', color: '#94a3b8' }}>No assignments yet</div>
      )}
      {data.map((a, i) => {
        const due      = new Date(a.dueDate);
        const overdue  = due < now && !a.submitted;
        const daysLeft = Math.ceil((due - now) / (1000*60*60*24));

        return (
          <div key={i} style={{ background: '#fff', borderRadius: 16, padding: '20px 24px', boxShadow: '0 2px 8px rgba(0,0,0,0.06)', borderLeft: `4px solid ${a.submitted ? '#16a34a' : overdue ? '#dc2626' : '#2563eb'}` }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
              <div>
                <div style={{ fontWeight: 800, color: '#1e293b', fontSize: 15 }}>{a.title}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>{a.subject?.name} • Due: {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</div>
                {a.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 8 }}>{a.description}</div>}
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 6 }}>
                <span style={{
                  fontSize: 11, fontWeight: 700, padding: '4px 12px', borderRadius: 99,
                  background: a.submitted ? '#dcfce7' : overdue ? '#fee2e2' : '#e0f2fe',
                  color:      a.submitted ? '#16a34a' : overdue ? '#dc2626' : '#0284c7',
                }}>
                  {a.submitted ? '✅ Submitted' : overdue ? '❌ Overdue' : `⏳ ${daysLeft}d left`}
                </span>
                {a.totalMarks && <span style={{ fontSize: 11, color: '#94a3b8' }}>Max: {a.totalMarks} marks</span>}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}