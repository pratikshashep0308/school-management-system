// frontend/src/pages/Fees.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FeesDashboard  from './Fees/FeesDashboard';
import CollectFees    from './Fees/CollectFees';
import FeesPaidSlip   from './Fees/FeesPaidSlip';
import AssignFees     from './Fees/AssignFees';
import StudentFees    from './Fees/StudentFees';
import PaymentHistory from './Fees/PaymentHistory';
import FeesAnalytics  from './Fees/FeesAnalytics';

export default function Fees() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin','schoolAdmin','accountant'].includes(user?.role);
  const [tab, setTab] = useState('dashboard');

  const tabs = [
    { key:'dashboard', label:'📊 Dashboard',     show:true     },
    { key:'collect',   label:'💳 Collect Fees',   show:isAdmin  },
    { key:'slip',      label:'🧾 Fees Paid Slip', show:isAdmin  },
    { key:'assign',    label:'📋 Assign Fees',    show:isAdmin  },
    { key:'students',  label:'👥 Students',       show:isAdmin  },
    { key:'history',   label:'📜 History',        show:true     },
    { key:'analytics', label:'📈 Analytics',     show:isAdmin  },
  ].filter(t => t.show);

  return (
    <div className="animate-fade-in">
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s',
            background: tab===t.key ? '#1D4ED8' : 'transparent',
            color:      tab===t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>
      {tab==='dashboard' && <FeesDashboard onNavigate={setTab}/>}
      {tab==='collect'   && <CollectFees />}
      {tab==='slip'      && <FeesPaidSlip />}
      {tab==='assign'    && <AssignFees />}
      {tab==='students'  && <StudentFees />}
      {tab==='history'   && <PaymentHistory />}
      {tab==='analytics' && <FeesAnalytics />}
    </div>
  );
}