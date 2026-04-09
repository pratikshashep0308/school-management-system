// frontend/src/pages/Fees.js — COMPLETE REWRITE
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FeeOverview     from './Fees/FeeOverview';
import RecordPayment   from './Fees/RecordPayment';
import FeeRecords      from './Fees/FeeRecords';
import FeeReports      from './Fees/FeeReports';
import FeeStructurePage from './Fees/FeeStructurePage';

export default function Fees() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin', 'schoolAdmin', 'accountant'].includes(user?.role);
  const [tab, setTab] = useState('overview');

  const tabs = [
    { key: 'overview',   label: '📊 Overview',        show: true },
    { key: 'records',    label: '👥 Student Records',  show: isAdmin },
    { key: 'payment',    label: '💳 Record Payment',   show: isAdmin },
    { key: 'reports',    label: '📈 Reports',          show: isAdmin },
    { key: 'structure',  label: '🏷 Fee Structure',    show: true },
  ].filter(t => t.show);

  return (
    <div className="animate-fade-in">
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s',
            background: tab === t.key ? '#1D4ED8' : 'transparent',
            color:      tab === t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>
      {tab === 'overview'   && <FeeOverview   onNavigate={setTab} />}
      {tab === 'records'    && <FeeRecords    onNavigate={setTab} />}
      {tab === 'payment'    && <RecordPayment onNavigate={setTab} />}
      {tab === 'reports'    && <FeeReports    />}
      {tab === 'structure'  && <FeeStructurePage />}
    </div>
  );
}