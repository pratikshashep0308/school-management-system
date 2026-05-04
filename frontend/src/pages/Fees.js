// frontend/src/pages/Fees.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import FeesDashboard  from './Fees/FeesDashboard';
import CollectFees    from './Fees/CollectFees';
import FeesPaidSlip   from './Fees/FeesPaidSlip';
import FeeReport          from './Fees/FeeReport';
import BulkFeeCollection  from './Fees/BulkFeeCollection';
import ClassFeeDefaults   from './Fees/ClassFeeDefaults';

export default function Fees() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin','schoolAdmin','accountant'].includes(user?.role);
  const [tab, setTab] = useState('dashboard');

  const tabs = [
    { key:'dashboard',  label:'📊 Dashboard',         show:true     },
    { key:'defaults',   label:'🏷️ Class Defaults',    show:isAdmin  },
    { key:'collect',    label:'💳 Collect Fees',       show:isAdmin  },
    { key:'slip',       label:'🧾 Fees Paid Slip',     show:isAdmin  },
    { key:'report',     label:'📊 Fee Report',         show:isAdmin  },
    { key:'bulk',       label:'🏫 Bulk Collection',    show:isAdmin  },
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
      {tab==='dashboard'  && <FeesDashboard onNavigate={setTab}/>}
      {tab==='defaults'   && <ClassFeeDefaults />}
      {tab==='collect'    && <CollectFees />}
      {tab==='slip'       && <FeesPaidSlip />}
      {tab==='report'     && <FeeReport />}
      {tab==='bulk'       && <BulkFeeCollection />}
    </div>
  );
}