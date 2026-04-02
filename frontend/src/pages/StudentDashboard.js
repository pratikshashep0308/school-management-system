// frontend/src/pages/StudentDashboard.js
import React, { useState, useEffect } from 'react';
import { useAuth } from '../context/AuthContext';
import { studentPortalAPI } from '../utils/studentPortalAPI';
import toast from 'react-hot-toast';

/* ─── Design Tokens ─────────────────────────────────────────────────────────── */
const C = {
  navy:    '#0d1b3e',
  blue:    '#1a3a6b',
  accent:  '#e87722',
  indigo:  '#4f46e5',
  emerald: '#10b981',
  amber:   '#f59e0b',
  rose:    '#f43f5e',
  violet:  '#8b5cf6',
  cyan:    '#06b6d4',
  slate:   '#64748b',
  light:   '#f8faff',
};

const MODULES = [
  { id: 'overview',      icon: '⚡', label: 'Overview',      color: C.indigo },
  { id: 'attendance',    icon: '📅', label: 'Attendance',    color: C.emerald },
  { id: 'results',       icon: '🏆', label: 'Results',       color: C.amber },
  { id: 'fees',          icon: '💳', label: 'Fees',          color: C.blue },
  { id: 'assignments',   icon: '📝', label: 'Assignments',   color: C.violet },
  { id: 'timetable',    icon: '🗓', label: 'Timetable',     color: C.rose },
  { id: 'transport',     icon: '🚌', label: 'Transport',     color: C.accent },
  { id: 'library',      icon: '📚', label: 'Library',       color: C.cyan },
  { id: 'notifications', icon: '🔔', label: 'Notifications', color: C.rose },
];

/* ─── Helpers ────────────────────────────────────────────────────────────────── */
const badge = (text, bg, color) => (
  <span style={{ fontSize: 11, fontWeight: 800, padding: '3px 10px', borderRadius: 99, background: bg, color, letterSpacing: '0.04em' }}>{text}</span>
);

const statusBadge = (s) => ({
  present: badge('PRESENT', '#d1fae5', '#065f46'),
  absent:  badge('ABSENT',  '#fee2e2', '#991b1b'),
  late:    badge('LATE',    '#fef3c7', '#92400e'),
}[s] || badge(s?.toUpperCase(), '#f1f5f9', '#475569'));

/* ─── Stat Card ──────────────────────────────────────────────────────────────── */
function StatCard({ icon, label, value, sub, color, gradient }) {
  return (
    <div style={{
      background: gradient || '#fff',
      borderRadius: 20,
      padding: '22px 24px',
      boxShadow: gradient ? `0 8px 32px ${color}30` : '0 2px 16px rgba(0,0,0,0.06)',
      display: 'flex', alignItems: 'center', gap: 16,
      border: gradient ? 'none' : '1px solid #f1f5f9',
      transition: 'transform 0.18s, box-shadow 0.18s',
      cursor: 'default',
    }}
      onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = gradient ? `0 16px 40px ${color}40` : '0 8px 24px rgba(0,0,0,0.1)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = gradient ? `0 8px 32px ${color}30` : '0 2px 16px rgba(0,0,0,0.06)'; }}
    >
      <div style={{
        width: 54, height: 54, borderRadius: 16,
        background: gradient ? 'rgba(255,255,255,0.2)' : color + '15',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: 26, flexShrink: 0,
        boxShadow: gradient ? 'inset 0 1px 2px rgba(255,255,255,0.3)' : 'none',
      }}>{icon}</div>
      <div>
        <div style={{ fontSize: 12, fontWeight: 700, color: gradient ? 'rgba(255,255,255,0.7)' : '#94a3b8', letterSpacing: '0.05em', textTransform: 'uppercase', marginBottom: 2 }}>{label}</div>
        <div style={{ fontSize: 26, fontWeight: 900, color: gradient ? '#fff' : '#0f172a', lineHeight: 1 }}>{value}</div>
        {sub && <div style={{ fontSize: 12, color: gradient ? 'rgba(255,255,255,0.6)' : '#94a3b8', marginTop: 3 }}>{sub}</div>}
      </div>
    </div>
  );
}

/* ─── Section Header ─────────────────────────────────────────────────────────── */
function SectionHeader({ icon, title, subtitle }) {
  return (
    <div style={{ marginBottom: 24 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 4 }}>
        <span style={{ fontSize: 24 }}>{icon}</span>
        <h2 style={{ margin: 0, fontSize: 22, fontWeight: 900, color: '#0f172a' }}>{title}</h2>
      </div>
      {subtitle && <p style={{ margin: 0, fontSize: 14, color: '#94a3b8' }}>{subtitle}</p>}
    </div>
  );
}

/* ─── Loading Spinner ────────────────────────────────────────────────────────── */
function Loading({ text = 'Loading...' }) {
  return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: 280, flexDirection: 'column', gap: 16 }}>
      <div style={{ width: 48, height: 48, border: `4px solid #e2e8f0`, borderTopColor: C.indigo, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <div style={{ color: '#94a3b8', fontWeight: 600, fontSize: 14 }}>{text}</div>
      <style>{`@keyframes spin { to { transform: rotate(360deg) }}`}</style>
    </div>
  );
}

/* ─── Empty State ────────────────────────────────────────────────────────────── */
function Empty({ icon, text }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '48px 24px', color: '#cbd5e1' }}>
      <div style={{ fontSize: 48, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontWeight: 700, color: '#94a3b8' }}>{text}</div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MODULE VIEWS
══════════════════════════════════════════════════════════════════════════════ */

/* ── Overview ─────────────────────────────────────────────────────────────────── */
function OverviewTab({ data }) {
  if (!data) return <Loading />;
  const { stats, recentAttendance, notifications } = data;
  const attPct = stats.attendancePercentage;
  const attColor = attPct >= 75 ? C.emerald : attPct >= 60 ? C.amber : C.rose;

  return (
    <div>
      {/* Hero Stats */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 16, marginBottom: 28 }}>
        <StatCard icon="📅" label="Attendance" value={`${attPct}%`} sub={attPct < 75 ? '⚠️ Below minimum' : '✅ Good standing'} color={attColor} gradient={`linear-gradient(135deg, ${attColor}, ${attColor}dd)`} />
        <StatCard icon="💳" label="Fee Paid" value={`₹${stats.feePaid?.toLocaleString()}`} sub={stats.feePending > 0 ? `₹${stats.feePending?.toLocaleString()} pending` : '✅ All clear'} color={C.blue} gradient={`linear-gradient(135deg, #1a3a6b, #2563eb)`} />
        <StatCard icon="🏆" label="Exams" value={stats.totalResults} sub="results recorded" color={C.amber} gradient={`linear-gradient(135deg, #d97706, #f59e0b)`} />
        <StatCard icon="📝" label="Assignments" value={stats.pendingAssignments} sub="due upcoming" color={C.violet} gradient={`linear-gradient(135deg, #7c3aed, #8b5cf6)`} />
      </div>

      {/* Attendance Bar */}
      <div style={{ background: '#fff', borderRadius: 20, padding: '24px 28px', marginBottom: 20, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>Attendance Overview</div>
          <span style={{ fontWeight: 900, fontSize: 22, color: attColor }}>{attPct}%</span>
        </div>
        <div style={{ height: 12, background: '#f1f5f9', borderRadius: 99, overflow: 'hidden' }}>
          <div style={{ height: '100%', width: `${attPct}%`, background: `linear-gradient(90deg, ${attColor}, ${attColor}bb)`, borderRadius: 99, transition: 'width 1s ease' }} />
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10 }}>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>0%</span>
          <span style={{ fontSize: 12, color: '#94a3b8', fontWeight: 700 }}>75% required</span>
          <span style={{ fontSize: 12, color: '#94a3b8' }}>100%</span>
        </div>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Recent Attendance */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>📅 Recent Attendance</div>
          {recentAttendance?.length === 0 && <Empty icon="📭" text="No recent records" />}
          {recentAttendance?.slice(0, 7).map((r, i) => (
            <div key={i} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: i < 6 ? '1px solid #f8faff' : 'none' }}>
              <span style={{ fontSize: 13, fontWeight: 600, color: '#475569' }}>
                {new Date(r.date).toLocaleDateString('en-IN', { weekday: 'short', day: 'numeric', month: 'short' })}
              </span>
              {statusBadge(r.status)}
            </div>
          ))}
        </div>

        {/* Notifications */}
        <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}>
          <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a', marginBottom: 16 }}>🔔 Notifications</div>
          {notifications?.length === 0 && <Empty icon="🔕" text="No notifications" />}
          {notifications?.slice(0, 4).map((n, i) => (
            <div key={i} style={{ padding: '12px 0', borderBottom: i < notifications.length - 1 ? '1px solid #f8faff' : 'none' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a' }}>{n.title}</div>
                {n.priority === 'high' && badge('HIGH', '#fee2e2', '#dc2626')}
              </div>
              <div style={{ fontSize: 12, color: '#64748b', marginTop: 4, lineHeight: 1.5 }}>{n.message?.slice(0, 90)}{n.message?.length > 90 ? '…' : ''}</div>
              <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 6 }}>{new Date(n.createdAt).toLocaleDateString('en-IN')}</div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

/* ── Attendance ───────────────────────────────────────────────────────────────── */
function AttendanceTab() {
  const [data, setData] = useState(null);
  const [month, setMonth] = useState(new Date().getMonth() + 1);
  const [year, setYear] = useState(new Date().getFullYear());

  useEffect(() => {
    setData(null);
    studentPortalAPI.getAttendance(month, year)
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load attendance'));
  }, [month, year]);

  if (!data) return <Loading text="Loading attendance..." />;
  const { summary, records } = data;
  const pct = summary.percentage;

  return (
    <div>
      <SectionHeader icon="📅" title="Attendance" subtitle="Your monthly attendance records" />

      {/* Month Filters */}
      <div style={{ display: 'flex', gap: 10, marginBottom: 24 }}>
        {['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'].map((m, i) => (
          <button key={i} onClick={() => setMonth(i + 1)} style={{
            padding: '6px 14px', borderRadius: 10, border: 'none', cursor: 'pointer',
            fontWeight: 700, fontSize: 12, transition: 'all 0.15s',
            background: month === i + 1 ? C.emerald : '#f1f5f9',
            color: month === i + 1 ? '#fff' : '#64748b',
          }}>{m}</button>
        ))}
        <select value={year} onChange={e => setYear(e.target.value)} style={{ padding: '6px 12px', borderRadius: 10, border: '2px solid #e2e8f0', fontWeight: 700, fontSize: 12 }}>
          {[2024, 2025, 2026].map(y => <option key={y}>{y}</option>)}
        </select>
      </div>

      {/* Summary Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 24 }}>
        {[
          { label: 'Total Days', value: summary.total, gradient: `linear-gradient(135deg, #334155, #475569)` },
          { label: 'Present', value: summary.present, gradient: `linear-gradient(135deg, #059669, #10b981)` },
          { label: 'Absent', value: summary.absent, gradient: `linear-gradient(135deg, #dc2626, #ef4444)` },
          { label: 'Percentage', value: `${pct}%`, gradient: `linear-gradient(135deg, ${pct >= 75 ? '#059669' : '#dc2626'}, ${pct >= 75 ? '#10b981' : '#ef4444'})` },
        ].map(c => (
          <div key={c.label} style={{ background: c.gradient, borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.15)' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      {/* Records */}
      <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '18px 24px', borderBottom: '1px solid #f8faff', background: '#fafbff' }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Daily Records</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              {['Date', 'Day', 'Status', 'Remarks'].map(h => (
                <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {records.length === 0 && (
              <tr><td colSpan={4}><Empty icon="📭" text="No records for this period" /></td></tr>
            )}
            {records.map((r, i) => (
              <tr key={i} style={{ borderTop: '1px solid #f8faff', transition: 'background 0.1s' }}
                onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
              >
                <td style={{ padding: '13px 20px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{new Date(r.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}</td>
                <td style={{ padding: '13px 20px', fontSize: 13, color: '#64748b' }}>{new Date(r.date).toLocaleDateString('en-IN', { weekday: 'long' })}</td>
                <td style={{ padding: '13px 20px' }}>{statusBadge(r.status)}</td>
                <td style={{ padding: '13px 20px', fontSize: 13, color: '#94a3b8' }}>{r.remarks || '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Results ─────────────────────────────────────────────────────────────────── */
function ResultsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getResults().then(r => setData(r.data.data)).catch(() => toast.error('Failed to load results'));
  }, []);

  if (!data) return <Loading text="Loading results..." />;
  const { summary, results } = data;

  const gradeGradient = g => ({
    'A+': 'linear-gradient(135deg, #059669, #10b981)',
    'A':  'linear-gradient(135deg, #059669, #10b981)',
    'B+': 'linear-gradient(135deg, #2563eb, #3b82f6)',
    'B':  'linear-gradient(135deg, #2563eb, #3b82f6)',
    'C':  'linear-gradient(135deg, #d97706, #f59e0b)',
    'D':  'linear-gradient(135deg, #ea580c, #f97316)',
    'F':  'linear-gradient(135deg, #dc2626, #ef4444)',
  }[g] || 'linear-gradient(135deg, #64748b, #94a3b8)');

  return (
    <div>
      <SectionHeader icon="🏆" title="Exam Results" subtitle="Your academic performance records" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 14, marginBottom: 28 }}>
        {[
          { label: 'Total Exams', value: summary.total, gradient: 'linear-gradient(135deg, #334155, #475569)' },
          { label: 'Passed', value: summary.passed, gradient: 'linear-gradient(135deg, #059669, #10b981)' },
          { label: 'Failed', value: summary.failed, gradient: 'linear-gradient(135deg, #dc2626, #ef4444)' },
          { label: 'Average', value: `${summary.average}%`, gradient: summary.average >= 60 ? 'linear-gradient(135deg, #059669, #10b981)' : 'linear-gradient(135deg, #dc2626, #ef4444)' },
        ].map(c => (
          <div key={c.label} style={{ background: c.gradient, borderRadius: 16, padding: '20px', textAlign: 'center', boxShadow: '0 4px 20px rgba(0,0,0,0.12)' }}>
            <div style={{ fontSize: 30, fontWeight: 900, color: '#fff' }}>{c.value}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.7)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginTop: 4 }}>{c.label}</div>
          </div>
        ))}
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {results?.length === 0 && (
          <div style={{ background: '#fff', borderRadius: 20, padding: 40, textAlign: 'center' }}>
            <Empty icon="📊" text="No results yet" />
          </div>
        )}
        {results?.map((r, i) => {
          const pct = r.percentage;
          const passColor = pct >= 35 ? C.emerald : C.rose;
          return (
            <div key={i} style={{
              background: '#fff', borderRadius: 18, padding: '20px 24px',
              border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              display: 'flex', alignItems: 'center', gap: 20, transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 8px 24px rgba(0,0,0,0.1)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateY(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'; }}
            >
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: gradeGradient(r.grade), display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 900, color: '#fff', fontSize: 18, flexShrink: 0, boxShadow: '0 4px 12px rgba(0,0,0,0.15)' }}>
                {r.grade}
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 800, color: '#0f172a', fontSize: 15 }}>{r.exam?.name}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 3 }}>
                  {r.exam?.subject?.name} &nbsp;•&nbsp; {r.exam?.examType?.toUpperCase()} &nbsp;•&nbsp; {r.exam?.date ? new Date(r.exam.date).toLocaleDateString('en-IN') : ''}
                </div>
                {/* Progress Bar */}
                <div style={{ height: 6, background: '#f1f5f9', borderRadius: 99, marginTop: 10, overflow: 'hidden' }}>
                  <div style={{ height: '100%', width: `${pct}%`, background: passColor, borderRadius: 99 }} />
                </div>
              </div>
              <div style={{ textAlign: 'right', flexShrink: 0 }}>
                <div style={{ fontWeight: 900, fontSize: 20, color: '#0f172a' }}>{r.marksObtained}<span style={{ fontSize: 13, fontWeight: 600, color: '#94a3b8' }}>/{r.exam?.totalMarks}</span></div>
                <div style={{ fontSize: 13, fontWeight: 800, color: passColor }}>{pct}%</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Fees ─────────────────────────────────────────────────────────────────────── */
function FeesTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getFees().then(r => setData(r.data.data)).catch(() => toast.error('Failed to load fees'));
  }, []);

  if (!data) return <Loading text="Loading fees..." />;
  const { summary, payments } = data;

  const statusStyle = s => ({
    paid:    { bg: '#d1fae5', color: '#065f46' },
    pending: { bg: '#fef3c7', color: '#92400e' },
    overdue: { bg: '#fee2e2', color: '#991b1b' },
    partial: { bg: '#e0f2fe', color: '#0369a1' },
  }[s] || { bg: '#f1f5f9', color: '#475569' });

  return (
    <div>
      <SectionHeader icon="💳" title="Fee Management" subtitle="Your payment history and dues" />

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16, marginBottom: 28 }}>
        <StatCard icon="✅" label="Total Paid" value={`₹${summary.paid?.toLocaleString()}`} color={C.emerald} gradient="linear-gradient(135deg, #059669, #10b981)" />
        <StatCard icon="⏳" label="Pending" value={`₹${summary.pending?.toLocaleString()}`} color={C.amber} gradient="linear-gradient(135deg, #d97706, #f59e0b)" />
        <StatCard icon="⚠️" label="Overdue" value={`₹${summary.overdue?.toLocaleString()}`} color={C.rose} gradient="linear-gradient(135deg, #dc2626, #ef4444)" />
      </div>

      <div style={{ background: '#fff', borderRadius: 20, overflow: 'hidden', border: '1px solid #f1f5f9', boxShadow: '0 2px 16px rgba(0,0,0,0.05)' }}>
        <div style={{ padding: '18px 24px', background: '#fafbff', borderBottom: '1px solid #f1f5f9' }}>
          <div style={{ fontWeight: 800, color: '#0f172a' }}>Payment History</div>
        </div>
        <table style={{ width: '100%', borderCollapse: 'collapse' }}>
          <thead>
            <tr style={{ background: '#f8faff' }}>
              {['Receipt No', 'Month', 'Amount', 'Method', 'Date', 'Status'].map(h => (
                <th key={h} style={{ padding: '12px 20px', textAlign: 'left', fontSize: 11, fontWeight: 800, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.06em' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {payments?.length === 0 && <tr><td colSpan={6}><Empty icon="💸" text="No payment records" /></td></tr>}
            {payments?.map((p, i) => {
              const s = statusStyle(p.status);
              return (
                <tr key={i} style={{ borderTop: '1px solid #f8faff', transition: 'background 0.1s' }}
                  onMouseEnter={e => e.currentTarget.style.background = '#f8faff'}
                  onMouseLeave={e => e.currentTarget.style.background = 'transparent'}
                >
                  <td style={{ padding: '13px 20px', fontSize: 12, fontFamily: 'monospace', color: '#94a3b8' }}>{p.receiptNumber || '—'}</td>
                  <td style={{ padding: '13px 20px', fontSize: 13, fontWeight: 700, color: '#0f172a' }}>{p.month}</td>
                  <td style={{ padding: '13px 20px', fontWeight: 900, color: '#0f172a' }}>₹{p.amount?.toLocaleString()}</td>
                  <td style={{ padding: '13px 20px', fontSize: 13, color: '#64748b', textTransform: 'capitalize' }}>{p.method}</td>
                  <td style={{ padding: '13px 20px', fontSize: 13, color: '#64748b' }}>{p.paidOn ? new Date(p.paidOn).toLocaleDateString('en-IN') : '—'}</td>
                  <td style={{ padding: '13px 20px' }}>{badge(p.status?.toUpperCase(), s.bg, s.color)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

/* ── Assignments ──────────────────────────────────────────────────────────────── */
function AssignmentsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getAssignments().then(r => setData(r.data.data)).catch(() => toast.error('Failed to load assignments'));
  }, []);

  if (!data) return <Loading text="Loading assignments..." />;
  const now = new Date();

  return (
    <div>
      <SectionHeader icon="📝" title="Assignments" subtitle="Track your pending and submitted work" />
      {data.length === 0 && (
        <div style={{ background: '#fff', borderRadius: 20, padding: 48, textAlign: 'center' }}>
          <Empty icon="✅" text="No assignments! Enjoy your free time." />
        </div>
      )}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {data.map((a, i) => {
          const due = new Date(a.dueDate);
          const overdue = due < now && !a.submitted;
          const daysLeft = Math.ceil((due - now) / (1000 * 60 * 60 * 24));
          const accentColor = a.submitted ? C.emerald : overdue ? C.rose : C.indigo;

          return (
            <div key={i} style={{
              background: '#fff', borderRadius: 18, padding: '20px 24px',
              border: '1px solid #f1f5f9', borderLeft: `5px solid ${accentColor}`,
              boxShadow: '0 2px 12px rgba(0,0,0,0.05)',
              transition: 'transform 0.15s, box-shadow 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'translateX(4px)'; e.currentTarget.style.boxShadow = `0 6px 20px ${accentColor}20`; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'translateX(0)'; e.currentTarget.style.boxShadow = '0 2px 12px rgba(0,0,0,0.05)'; }}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 16 }}>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 800, fontSize: 15, color: '#0f172a' }}>{a.title}</div>
                  <div style={{ fontSize: 12, color: '#94a3b8', marginTop: 4 }}>
                    📖 {a.subject?.name} &nbsp;•&nbsp; 📅 Due: {due.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}
                    {a.totalMarks && <>&nbsp;•&nbsp; 🏅 {a.totalMarks} marks</>}
                  </div>
                  {a.description && <div style={{ fontSize: 13, color: '#64748b', marginTop: 10, lineHeight: 1.6 }}>{a.description}</div>}
                </div>
                <div style={{ flexShrink: 0 }}>
                  {a.submitted
                    ? badge('✅ Submitted', '#d1fae5', '#065f46')
                    : overdue
                    ? badge('❌ Overdue', '#fee2e2', '#991b1b')
                    : badge(`⏳ ${daysLeft}d left`, '#ede9fe', '#5b21b6')
                  }
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ── Timetable ────────────────────────────────────────────────────────────────── */
function TimetableTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getTimetable().then(r => setData(r.data.data)).catch(() => setData([]));
  }, []);

  if (!data) return <Loading text="Loading timetable..." />;

  const days = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const dayColors = ['#4f46e5', '#0d9488', '#d97706', '#dc2626', '#7c3aed', '#0369a1'];

  return (
    <div>
      <SectionHeader icon="🗓" title="Timetable" subtitle="Your weekly class schedule" />
      {data.length === 0 ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: 48 }}><Empty icon="🗓" text="No timetable set yet" /></div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
          {days.map((day, di) => {
            const periods = data.filter(d => d.day === day);
            if (periods.length === 0) return null;
            return (
              <div key={day} style={{ background: '#fff', borderRadius: 18, overflow: 'hidden', border: '1px solid #f1f5f9' }}>
                <div style={{ padding: '14px 20px', background: `linear-gradient(135deg, ${dayColors[di]}, ${dayColors[di]}cc)`, display: 'flex', alignItems: 'center', gap: 10 }}>
                  <div style={{ fontWeight: 900, color: '#fff', fontSize: 15 }}>{day}</div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)' }}>{periods.length} periods</div>
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 12, padding: 16 }}>
                  {periods.sort((a, b) => a.period - b.period).map((p, i) => (
                    <div key={i} style={{ background: `${dayColors[di]}10`, borderRadius: 12, padding: '10px 16px', border: `1px solid ${dayColors[di]}30` }}>
                      <div style={{ fontSize: 11, fontWeight: 700, color: dayColors[di] }}>Period {p.period} • {p.startTime}–{p.endTime}</div>
                      <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 2 }}>{p.subject?.name}</div>
                      <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 1 }}>{p.teacher?.name}</div>
                    </div>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ── Transport ────────────────────────────────────────────────────────────────── */
function TransportTab({ studentData }) {
  const transport = studentData?.student?.transport;
  return (
    <div>
      <SectionHeader icon="🚌" title="Transport" subtitle="Your bus route and stop information" />
      {!transport ? (
        <div style={{ background: '#fff', borderRadius: 20, padding: 48 }}><Empty icon="🚌" text="No transport assigned to your account" /></div>
      ) : (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
          <div style={{ background: 'linear-gradient(135deg, #e87722, #f97316)', borderRadius: 20, padding: 28, color: '#fff' }}>
            <div style={{ fontSize: 14, opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Your Route</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{transport.route?.name || 'Route N/A'}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>{transport.route?.description}</div>
          </div>
          <div style={{ background: 'linear-gradient(135deg, #0d2347, #1a3a6b)', borderRadius: 20, padding: 28, color: '#fff' }}>
            <div style={{ fontSize: 14, opacity: 0.8, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.1em', marginBottom: 6 }}>Bus Stop</div>
            <div style={{ fontSize: 28, fontWeight: 900 }}>{transport.stopName || 'Stop N/A'}</div>
            <div style={{ fontSize: 14, opacity: 0.7, marginTop: 6 }}>Pickup: {transport.pickupTime || '—'} &nbsp;•&nbsp; Drop: {transport.dropTime || '—'}</div>
          </div>
          {transport.vehicle && (
            <div style={{ background: '#fff', borderRadius: 20, padding: 24, border: '1px solid #f1f5f9', gridColumn: '1 / -1' }}>
              <div style={{ fontWeight: 800, fontSize: 15, marginBottom: 16, color: '#0f172a' }}>🚐 Vehicle Details</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 16 }}>
                {[
                  { label: 'Vehicle No', value: transport.vehicle.vehicleNumber },
                  { label: 'Driver', value: transport.vehicle.driverName },
                  { label: 'Contact', value: transport.vehicle.driverContact },
                ].map(f => (
                  <div key={f.label} style={{ background: '#f8faff', borderRadius: 12, padding: '14px 18px' }}>
                    <div style={{ fontSize: 11, color: '#94a3b8', fontWeight: 700, textTransform: 'uppercase' }}>{f.label}</div>
                    <div style={{ fontWeight: 800, color: '#0f172a', marginTop: 4 }}>{f.value || '—'}</div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ── Library ─────────────────────────────────────────────────────────────────── */
function LibraryTab() {
  return (
    <div>
      <SectionHeader icon="📚" title="Library" subtitle="Books issued and library records" />
      <div style={{ background: 'linear-gradient(135deg, #0d9488, #06b6d4)', borderRadius: 20, padding: 32, color: '#fff', textAlign: 'center' }}>
        <div style={{ fontSize: 56, marginBottom: 12 }}>📖</div>
        <div style={{ fontWeight: 900, fontSize: 20, marginBottom: 8 }}>Library Portal</div>
        <div style={{ opacity: 0.8, fontSize: 14 }}>Visit the school library or contact the librarian to see your issued books and reading history.</div>
      </div>
    </div>
  );
}

/* ── Notifications ────────────────────────────────────────────────────────────── */
function NotificationsTab() {
  const [data, setData] = useState(null);
  useEffect(() => {
    studentPortalAPI.getNotifications().then(r => setData(r.data.data)).catch(() => setData([]));
  }, []);

  if (!data) return <Loading text="Loading notifications..." />;

  const priorityStyle = p => ({
    high:   { bg: '#fee2e2', color: '#991b1b', dot: C.rose },
    medium: { bg: '#fef3c7', color: '#92400e', dot: C.amber },
    low:    { bg: '#f0fdf4', color: '#166534', dot: C.emerald },
  }[p] || { bg: '#f8faff', color: '#475569', dot: '#94a3b8' });

  return (
    <div>
      <SectionHeader icon="🔔" title="Notifications" subtitle={`${data.length} school announcements`} />
      {data.length === 0 && <div style={{ background: '#fff', borderRadius: 20, padding: 48 }}><Empty icon="🔕" text="No notifications" /></div>}
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {data.map((n, i) => {
          const ps = priorityStyle(n.priority);
          return (
            <div key={i} style={{
              background: '#fff', borderRadius: 18, padding: '20px 24px',
              border: '1px solid #f1f5f9', boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
              display: 'flex', gap: 16, alignItems: 'flex-start',
            }}>
              <div style={{ width: 10, height: 10, borderRadius: '50%', background: ps.dot, flexShrink: 0, marginTop: 5 }} />
              <div style={{ flex: 1 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 6 }}>
                  <div style={{ fontWeight: 800, fontSize: 14, color: '#0f172a' }}>{n.title}</div>
                  {badge(n.priority?.toUpperCase(), ps.bg, ps.color)}
                </div>
                <div style={{ fontSize: 13, color: '#64748b', lineHeight: 1.6 }}>{n.message}</div>
                <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 8 }}>{new Date(n.createdAt).toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' })}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/* ═══════════════════════════════════════════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════════════════════════════════════════ */
export default function StudentDashboard() {
  const { user } = useAuth();
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [activeModule, setActiveModule] = useState('overview');

  useEffect(() => {
    studentPortalAPI.getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => toast.error('Failed to load dashboard'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return (
    <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '70vh', flexDirection: 'column', gap: 20, fontFamily: "'Nunito', sans-serif" }}>
      <div style={{ fontSize: 52 }}>🎓</div>
      <div style={{ fontWeight: 800, color: C.blue, fontSize: 18 }}>Loading your dashboard…</div>
      <div style={{ width: 48, height: 48, border: `4px solid #e2e8f0`, borderTopColor: C.blue, borderRadius: '50%', animation: 'spin 0.8s linear infinite' }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg) }}`}</style>
    </div>
  );

  const student = data?.student;
  const isParent = user.role === 'parent';

  const renderModule = () => {
    switch (activeModule) {
      case 'overview':      return <OverviewTab data={data} />;
      case 'attendance':    return <AttendanceTab />;
      case 'results':       return <ResultsTab />;
      case 'fees':          return <FeesTab />;
      case 'assignments':   return <AssignmentsTab />;
      case 'timetable':    return <TimetableTab />;
      case 'transport':     return <TransportTab studentData={data} />;
      case 'library':      return <LibraryTab />;
      case 'notifications': return <NotificationsTab />;
      default:              return <OverviewTab data={data} />;
    }
  };

  return (
    <div style={{ display: 'flex', gap: 0, minHeight: 'calc(100vh - 64px)', fontFamily: "'Nunito', sans-serif", margin: '-24px -24px', background: C.light }}>

      {/* ── Left Module Navigation ── */}
      <div style={{
        width: 220, flexShrink: 0,
        background: C.navy,
        display: 'flex', flexDirection: 'column',
        padding: '0 0 20px 0',
        borderRight: '1px solid rgba(255,255,255,0.06)',
      }}>

        {/* Student Profile Card */}
        <div style={{ padding: '24px 20px 20px', borderBottom: '1px solid rgba(255,255,255,0.07)' }}>
          <div style={{
            width: 56, height: 56, borderRadius: '50%', margin: '0 auto 12px',
            background: isParent ? 'linear-gradient(135deg, #7c3aed, #9333ea)' : 'linear-gradient(135deg, #1a3a6b, #2563eb)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 26, boxShadow: '0 4px 16px rgba(0,0,0,0.3)',
            border: '3px solid rgba(255,255,255,0.15)',
          }}>
            {isParent ? '👨‍👩‍👧' : '🎓'}
          </div>
          <div style={{ textAlign: 'center' }}>
            <div style={{ fontWeight: 900, color: '#fff', fontSize: 14, lineHeight: 1.3 }}>{student?.user?.name || user.name}</div>
            <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', marginTop: 4 }}>{student?.class?.name}</div>
            <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.35)', marginTop: 2 }}>Roll: {student?.rollNumber} • {student?.admissionNumber}</div>
          </div>
          {isParent && (
            <div style={{ marginTop: 10, background: 'rgba(124,58,237,0.2)', borderRadius: 8, padding: '6px 10px', textAlign: 'center' }}>
              <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>PARENT VIEW</div>
              <div style={{ fontSize: 11, color: '#c4b5fd', fontWeight: 800 }}>{user.name}</div>
            </div>
          )}
        </div>

        {/* Module Nav */}
        <nav style={{ flex: 1, padding: '12px 10px', overflowY: 'auto' }}>
          <div style={{ fontSize: 9, fontWeight: 800, color: 'rgba(255,255,255,0.25)', letterSpacing: '0.15em', textTransform: 'uppercase', padding: '8px 10px 6px' }}>MODULES</div>
          {MODULES.map(mod => {
            const isActive = activeModule === mod.id;
            return (
              <button key={mod.id} onClick={() => setActiveModule(mod.id)} style={{
                width: '100%', display: 'flex', alignItems: 'center', gap: 10,
                padding: '10px 12px', borderRadius: 12, border: 'none', cursor: 'pointer',
                fontFamily: "'Nunito', sans-serif",
                marginBottom: 2, textAlign: 'left', transition: 'all 0.15s',
                background: isActive ? `${mod.color}25` : 'transparent',
                color: isActive ? mod.color : 'rgba(255,255,255,0.55)',
                fontWeight: isActive ? 800 : 600, fontSize: 13,
                borderLeft: isActive ? `3px solid ${mod.color}` : '3px solid transparent',
              }}
                onMouseEnter={e => { if (!isActive) { e.currentTarget.style.background = 'rgba(255,255,255,0.06)'; e.currentTarget.style.color = 'rgba(255,255,255,0.85)'; } }}
                onMouseLeave={e => { if (!isActive) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = 'rgba(255,255,255,0.55)'; } }}
              >
                <span style={{ fontSize: 18, width: 26, textAlign: 'center', flexShrink: 0 }}>{mod.icon}</span>
                {mod.label}
              </button>
            );
          })}
        </nav>

        {/* Attendance Quick Stat */}
        {data?.stats && (
          <div style={{ margin: '0 10px', padding: '14px 16px', background: 'rgba(255,255,255,0.05)', borderRadius: 14, border: '1px solid rgba(255,255,255,0.08)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
              <span style={{ fontSize: 11, color: 'rgba(255,255,255,0.5)', fontWeight: 700 }}>ATTENDANCE</span>
              <span style={{ fontSize: 14, fontWeight: 900, color: data.stats.attendancePercentage >= 75 ? C.emerald : C.rose }}>{data.stats.attendancePercentage}%</span>
            </div>
            <div style={{ height: 4, background: 'rgba(255,255,255,0.1)', borderRadius: 99 }}>
              <div style={{ height: '100%', width: `${data.stats.attendancePercentage}%`, background: data.stats.attendancePercentage >= 75 ? C.emerald : C.rose, borderRadius: 99, transition: 'width 1s' }} />
            </div>
          </div>
        )}
      </div>

      {/* ── Main Content ── */}
      <div style={{ flex: 1, padding: '28px 32px', overflowY: 'auto' }}>

        {/* Page Title */}
        <div style={{ marginBottom: 28, display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 800, color: '#94a3b8', letterSpacing: '0.12em', textTransform: 'uppercase', marginBottom: 4 }}>
              {isParent ? 'Parent Portal' : 'Student Portal'}
            </div>
            <h1 style={{ margin: 0, fontSize: 28, fontWeight: 900, color: '#0f172a' }}>
              {MODULES.find(m => m.id === activeModule)?.icon} {MODULES.find(m => m.id === activeModule)?.label}
            </h1>
          </div>
          <div style={{ fontSize: 13, color: '#94a3b8', fontWeight: 600 }}>
            {new Date().toLocaleDateString('en-IN', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}
          </div>
        </div>

        {renderModule()}
      </div>
    </div>
  );
}