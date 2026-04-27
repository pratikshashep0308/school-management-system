// frontend/src/pages/Expenses.js
import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';
import ExpensesDashboard from './Expenses/ExpensesDashboard';
import ExpenseList       from './Expenses/ExpenseList';
import AddExpense        from './Expenses/AddExpense';
import ExpenseReports    from './Expenses/ExpenseReports';

export default function Expenses() {
  const { user } = useAuth();
  const isAdmin = ['superAdmin', 'schoolAdmin', 'accountant'].includes(user?.role);
  const [tab, setTab] = useState('dashboard');
  const [listFilter, setListFilter] = useState('all');

  const tabs = [
    { key: 'dashboard', label: '📊 Dashboard', show: true },
    { key: 'list',      label: '📋 All Expenses', show: true },
    { key: 'add',       label: '➕ Add Expense', show: isAdmin },
    { key: 'reports',   label: '📈 Reports', show: isAdmin },
  ].filter(t => t.show);

  return (
    <div className="animate-fade-in">
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {tabs.map(t => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', transition:'all 0.15s',
            background: tab === t.key ? '#DC2626' : 'transparent',
            color:      tab === t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'dashboard' && <ExpensesDashboard onAdd={() => setTab('add')} onNavigate={(t,f)=>{ setListFilter(f); setTab(t); }} />}
      {tab === 'list'      && <ExpenseList onAdd={() => setTab('add')} initialFilter={listFilter} />}
      {tab === 'add'       && <AddExpense onSaved={() => setTab('list')} />}
      {tab === 'reports'   && <ExpenseReports />}
    </div>
  );
}