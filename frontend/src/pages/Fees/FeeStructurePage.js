// frontend/src/pages/Fees/FeeStructure.js
// Beautiful fee structure page matching the provided HTML design
// Tabs: Stationery · School Fee · Bus Fee · Fee Estimator

import React, { useState } from 'react';

const fmt = n => '₹ ' + Number(n).toLocaleString('en-IN');

// ── Fee data (edit these values to update fees) ───────────────────────────────
const STATIONERY = [
  { grade: 'Nursery',     badge: 'blue',  amount: 1350 },
  { grade: 'Jr. KG',      badge: 'gold',  amount: 1450 },
  { grade: 'Sr. KG',      badge: 'teal',  amount: 1600 },
  { grade: 'LKG',         badge: 'green', amount: 1650 },
  { grade: 'UKG',         badge: 'green', amount: 1650 },
  { grade: 'Grade 1',     badge: 'green', amount: 1650 },
  { grade: 'Grade 2 – 4', badge: 'green', amount: 1650 },
];

const TUITION = [
  { grade: 'Nursery',     badge: 'blue',  amount: 9000  },
  { grade: 'Jr. KG',      badge: 'gold',  amount: 9000  },
  { grade: 'Sr. KG',      badge: 'teal',  amount: 10000 },
  { grade: 'LKG',         badge: 'green', amount: 10500 },
  { grade: 'UKG',         badge: 'green', amount: 11000 },
  { grade: 'Grade 1',     badge: 'green', amount: 11000 },
  { grade: 'Grade 2 – 4', badge: 'green', amount: 12000 },
];

const BUS_OPTIONS = [
  { dist: 'Nearby Village',  icon: '🟢', amount: 3000, desc: 'Within 5 km radius' },
  { dist: 'Medium Distance', icon: '🟡', amount: 4000, desc: '5 – 15 km from school' },
  { dist: 'Far Distance',    icon: '🔴', amount: 5000, desc: 'Above 15 km from school' },
];

const EST_DATA = {
  nursery: { stationery: 1350, tuition: 9000,  label: 'Nursery' },
  jrkg:    { stationery: 1450, tuition: 9000,  label: 'Jr. KG' },
  srkg:    { stationery: 1600, tuition: 10000, label: 'Sr. KG' },
  lkg:     { stationery: 1650, tuition: 10500, label: 'LKG' },
  ukg:     { stationery: 1650, tuition: 11000, label: 'UKG' },
  g1:      { stationery: 1650, tuition: 11000, label: 'Grade 1' },
  g2_4:    { stationery: 1650, tuition: 12000, label: 'Grade 2 – 4' },
};

// ── Style helpers ─────────────────────────────────────────────────────────────
const BADGE_STYLES = {
  blue:  { background: '#EBF5FB', color: '#1A3A8F' },
  gold:  { background: '#FDF3E0', color: '#7C5A0F' },
  teal:  { background: '#E0F7FB', color: '#065F69' },
  green: { background: '#D1FAE5', color: '#047857' },
};

function GradeBadge({ grade, badge }) {
  const s = BADGE_STYLES[badge] || BADGE_STYLES.blue;
  return (
    <span style={{ ...s, fontSize: 12, fontWeight: 700, padding: '3px 10px', borderRadius: 6, display: 'inline-block' }}>
      {grade}
    </span>
  );
}

function FeeTable({ rows, highlight }) {
  return (
    <div style={{ borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 16px rgba(11,31,74,0.08)', marginBottom: 16 }}>
      <table style={{ width: '100%', borderCollapse: 'collapse', background: '#fff', fontSize: 14 }}>
        <thead>
          <tr style={{ background: '#0B1F4A' }}>
            <th style={{ padding: '12px 18px', textAlign: 'left', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>Class / Grade</th>
            <th style={{ padding: '12px 18px', textAlign: 'right', color: '#fff', fontSize: 11, fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase' }}>Annual Fee</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r, i) => (
            <tr key={i} style={{
              borderBottom: i < rows.length - 1 ? '1px solid #DDE3F0' : 'none',
              background: r.grade === highlight ? '#F0F5FF' : (i % 2 === 1 ? '#FAFBFF' : '#fff'),
              transition: 'background 0.15s',
            }}
              onMouseEnter={e => { e.currentTarget.style.background = '#F0F5FF'; }}
              onMouseLeave={e => { e.currentTarget.style.background = r.grade === highlight ? '#F0F5FF' : (i % 2 === 1 ? '#FAFBFF' : '#fff'); }}
            >
              <td style={{ padding: '13px 18px', color: '#334155', verticalAlign: 'middle' }}>
                <GradeBadge grade={r.grade} badge={r.badge} />
              </td>
              <td style={{ padding: '13px 18px', textAlign: 'right', fontWeight: 700, color: '#0B1F4A', fontSize: 15 }}>
                <span style={{ fontSize: 12, opacity: 0.5, marginRight: 2 }}>₹</span>
                {r.amount.toLocaleString('en-IN')}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function NoteBox({ children, color = '#1A56DB' }) {
  return (
    <div style={{
      background: `${color}10`, border: `1px solid ${color}30`,
      borderRadius: 10, padding: '12px 16px',
      fontSize: 12.5, color: '#334155', lineHeight: 1.6,
    }}>
      {children}
    </div>
  );
}

function ExtraCard({ label, sub, amount }) {
  return (
    <div style={{
      background: '#fff', borderRadius: 12, borderLeft: '4px solid #C9952A',
      padding: '14px 18px', display: 'flex', alignItems: 'center',
      justifyContent: 'space-between', gap: 12,
      boxShadow: '0 1px 8px rgba(11,31,74,0.06)', marginBottom: 12,
    }}>
      <div>
        <div style={{ fontSize: 13.5, color: '#334155', fontWeight: 500 }}>{label}</div>
        {sub && <div style={{ fontSize: 11, color: '#64748B', marginTop: 3 }}>{sub}</div>}
      </div>
      <div style={{ fontSize: 20, fontWeight: 800, color: '#C9952A', whiteSpace: 'nowrap' }}>₹ {amount.toLocaleString('en-IN')}</div>
    </div>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function FeeStructure() {
  const [tab, setTab] = useState('stationery');
  const [grade, setGrade] = useState('g1');
  const [bus, setBus] = useState(0);

  const est = EST_DATA[grade] || EST_DATA.g1;
  const total = est.stationery + est.tuition + 120 + parseInt(bus);

  const TABS = [
    { key: 'stationery', label: '📚 Stationery Fee' },
    { key: 'tuition',    label: '🏫 School Fee' },
    { key: 'bus',        label: '🚌 Bus Fee' },
    { key: 'estimator',  label: '🧮 Fee Estimator' },
  ];

  const TAB_BTN = (key) => ({
    padding: '8px 18px', borderRadius: 30, border: '1.5px solid',
    fontSize: 13, fontWeight: 600, cursor: 'pointer', transition: 'all 0.2s',
    borderColor: tab === key ? '#0B1F4A' : '#DDE3F0',
    background:  tab === key ? '#0B1F4A' : '#fff',
    color:       tab === key ? '#fff'    : '#64748B',
  });

  const SEL = {
    padding: '8px 12px', border: '1.5px solid #DDE3F0', borderRadius: 8,
    fontSize: 13, background: '#fff', color: '#334155', outline: 'none',
    cursor: 'pointer',
  };

  return (
    <div style={{ fontFamily: "'Mulish', 'Nunito', sans-serif" }}>

      {/* Hero */}
      <div style={{
        background: 'linear-gradient(135deg, #0B1F4A 0%, #162D6A 100%)',
        borderRadius: 16, padding: '32px 24px', textAlign: 'center',
        marginBottom: 24, position: 'relative', overflow: 'hidden',
      }}>
        {/* Decorative circles */}
        <div style={{ position: 'absolute', width: 200, height: 200, borderRadius: '50%', background: 'rgba(201,149,42,0.1)', top: -60, right: -40, pointerEvents: 'none' }} />
        <div style={{ position: 'absolute', width: 120, height: 120, borderRadius: '50%', background: 'rgba(255,255,255,0.05)', bottom: -40, left: -20, pointerEvents: 'none' }} />

        {/* Logo */}
        <div style={{
          width: 68, height: 68, borderRadius: '50%',
          background: 'linear-gradient(135deg, #C9952A, #E8B44A)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          margin: '0 auto 14px', fontSize: 28,
          boxShadow: '0 0 0 6px rgba(201,149,42,0.2)',
          position: 'relative', zIndex: 1,
        }}>
          <img src="/school-logo.jpeg" alt="School" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover' }}
            onError={e => { e.target.style.display = 'none'; e.target.parentElement.innerHTML = '🌟'; }} />
        </div>

        <h1 style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 'clamp(18px,4vw,26px)', fontWeight: 700, color: '#fff', margin: 0, position: 'relative', zIndex: 1 }}>
          The Future Step School
        </h1>
        <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)', letterSpacing: '2px', textTransform: 'uppercase', marginTop: 5, position: 'relative', zIndex: 1 }}>
          Bhaler · Fee Structure
        </div>
        <div style={{ width: 48, height: 3, background: '#C9952A', borderRadius: 2, margin: '14px auto 0', position: 'relative', zIndex: 1 }} />
        <div style={{
          display: 'inline-block', marginTop: 12,
          background: 'rgba(201,149,42,0.18)', border: '1px solid rgba(201,149,42,0.4)',
          color: '#E8C97A', fontSize: 11, letterSpacing: '1.5px', textTransform: 'uppercase',
          padding: '4px 14px', borderRadius: 20, fontWeight: 600, position: 'relative', zIndex: 1,
        }}>
          Academic Year 2025–26
        </div>
      </div>

      {/* Tab bar */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 24 }}>
        {TABS.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={TAB_BTN(t.key)}>{t.label}</button>
        ))}
      </div>

      {/* ── Stationery Tab ── */}
      {tab === 'stationery' && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#EBF5FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>📚</div>
            <div>
              <div style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0B1F4A' }}>Stationery Fee</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>One-time annual fee covering all learning materials provided to students.</div>
            </div>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 18 }}>
            {['👕 Uniform (1 set)', '🩳 Sports Dress', '📓 Notebooks', '📗 Books'].map(c => (
              <span key={c} style={{ background: '#EBF5FB', color: '#1A3A8F', fontSize: 11.5, fontWeight: 600, padding: '4px 12px', borderRadius: 20 }}>{c}</span>
            ))}
          </div>
          <FeeTable rows={STATIONERY} />
          <ExtraCard label="ID Card Fee" sub="Charged separately for all students" amount={120} />
          <NoteBox>⚠️ Fee structure may be revised. Please confirm at the school office before payment.</NoteBox>
        </div>
      )}

      {/* ── Tuition Tab ── */}
      {tab === 'tuition' && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 18 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#FDF3E0', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🏫</div>
            <div>
              <div style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0B1F4A' }}>School Tuition Fee</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>Annual tuition fee for classroom education and academic activities.</div>
            </div>
          </div>
          <FeeTable rows={TUITION} highlight="Grade 2 – 4" />
          <NoteBox color="#047857">ℹ️ Tuition fee covers all regular classroom teaching, examinations, and school activities for the full academic year.</NoteBox>
        </div>
      )}

      {/* ── Bus Tab ── */}
      {tab === 'bus' && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#E0F7FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🚌</div>
            <div>
              <div style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0B1F4A' }}>Bus / Transport Fee</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3, lineHeight: 1.5 }}>Annual transport fee based on distance from school.</div>
            </div>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(160px,1fr))', gap: 14, marginBottom: 18 }}>
            {BUS_OPTIONS.map((b, i) => (
              <div key={i} style={{
                background: '#fff', borderRadius: 14, padding: '22px 16px', textAlign: 'center',
                boxShadow: '0 2px 16px rgba(11,31,74,0.08)',
                border: `2px solid ${i === 0 ? '#D1FAE5' : i === 1 ? '#FEF3C7' : '#FEE2E2'}`,
              }}>
                <div style={{ fontSize: 32, marginBottom: 8 }}>🚌</div>
                <div style={{ fontWeight: 700, fontSize: 14, color: '#0B1F4A', marginBottom: 2 }}>{b.dist}</div>
                <div style={{ fontSize: 11, color: '#64748B', marginBottom: 10 }}>{b.desc}</div>
                <div style={{ fontSize: 26, fontWeight: 900, color: i === 0 ? '#047857' : i === 1 ? '#C9952A' : '#DC2626' }}>
                  <sup style={{ fontSize: 14 }}>₹</sup>{b.amount.toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 3 }}>per year</div>
              </div>
            ))}
          </div>
          <NoteBox color="#0891B2">🗺️ Exact distance slab for your village will be confirmed by school administration at time of admission.</NoteBox>
        </div>
      )}

      {/* ── Estimator Tab ── */}
      {tab === 'estimator' && (
        <div>
          <div style={{ display: 'flex', gap: 14, alignItems: 'flex-start', marginBottom: 20 }}>
            <div style={{ width: 46, height: 46, borderRadius: 12, background: '#EBF5FB', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 22, flexShrink: 0 }}>🧮</div>
            <div>
              <div style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 20, fontWeight: 700, color: '#0B1F4A' }}>Fee Estimator</div>
              <div style={{ fontSize: 12.5, color: '#64748B', marginTop: 3 }}>Select class and bus option to calculate total annual fee.</div>
            </div>
          </div>

          <div style={{ background: '#fff', borderRadius: 14, overflow: 'hidden', boxShadow: '0 2px 16px rgba(11,31,74,0.08)' }}>
            {/* Header */}
            <div style={{ background: '#0B1F4A', padding: '14px 20px', fontSize: 13, fontWeight: 700, color: '#fff', letterSpacing: '0.5px' }}>
              Calculate Total Fees
            </div>

            {/* Rows */}
            {[
              {
                label: '📚 Class / Grade', isSelect: true,
                selectEl: (
                  <select value={grade} onChange={e => setGrade(e.target.value)} style={SEL}>
                    {Object.entries(EST_DATA).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </select>
                ),
                value: fmt(est.stationery),
              },
              { label: '🏫 Tuition Fee',  value: fmt(est.tuition) },
              { label: '🪪 ID Card Fee',  value: '₹ 120' },
              {
                label: '🚌 Bus Fee', isSelect: true,
                selectEl: (
                  <select value={bus} onChange={e => setBus(e.target.value)} style={SEL}>
                    <option value={0}>No Bus</option>
                    <option value={3000}>Nearby – ₹3,000</option>
                    <option value={4000}>Medium – ₹4,000</option>
                    <option value={5000}>Far – ₹5,000</option>
                  </select>
                ),
                value: fmt(parseInt(bus)),
              },
            ].map((row, i) => (
              <div key={i} style={{
                display: 'grid', gridTemplateColumns: '1fr auto auto',
                alignItems: 'center', gap: 12,
                padding: '14px 20px', borderBottom: '1px solid #F1F5F9',
              }}>
                <div style={{ fontSize: 13.5, color: '#334155', fontWeight: 500 }}>{row.label}</div>
                <div>{row.selectEl || null}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#0B1F4A', textAlign: 'right', minWidth: 90 }}>{row.value}</div>
              </div>
            ))}

            {/* Total strip */}
            <div style={{
              background: 'linear-gradient(135deg, #0B1F4A, #162D6A)',
              padding: '18px 20px', display: 'flex',
              alignItems: 'center', justifyContent: 'space-between',
            }}>
              <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', fontWeight: 600, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                Estimated Annual Total
              </div>
              <div style={{ fontFamily: 'Merriweather, Georgia, serif', fontSize: 28, fontWeight: 700, color: '#F6D57A' }}>
                <sup style={{ fontSize: 14 }}>₹</sup>{total.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          {/* Monthly breakdown */}
          <div style={{ background: '#F0F9FF', border: '1px solid #BAE6FD', borderRadius: 12, padding: '14px 18px', marginTop: 14 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: '#0284C7', marginBottom: 8, textTransform: 'uppercase', letterSpacing: '0.5px' }}>Monthly Equivalent</div>
            <div style={{ display: 'flex', gap: 20, flexWrap: 'wrap' }}>
              {[
                { label: '10 months', val: Math.round(total / 10) },
                { label: '12 months', val: Math.round(total / 12) },
              ].map(m => (
                <div key={m.label}>
                  <div style={{ fontSize: 20, fontWeight: 900, color: '#0B1F4A' }}>₹{m.val.toLocaleString('en-IN')}</div>
                  <div style={{ fontSize: 11, color: '#64748B' }}>per month ({m.label})</div>
                </div>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <NoteBox>ℹ️ This is an estimate based on the current fee structure. Final fees will be communicated by the school office.</NoteBox>
          </div>
        </div>
      )}

      {/* Footer note */}
      <div style={{ textAlign: 'center', marginTop: 24, paddingTop: 16, borderTop: '1px solid #E5E7EB', fontSize: 12, color: '#94A3B8' }}>
        <strong style={{ color: '#334155' }}>The Future Step School, Bhaler</strong> &nbsp;·&nbsp; Fee Structure 2025–26 &nbsp;·&nbsp; For queries, contact the school office.
      </div>
    </div>
  );
}