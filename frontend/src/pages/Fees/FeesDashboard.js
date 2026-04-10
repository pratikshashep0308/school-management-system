// frontend/src/pages/Fees/FeesDashboard.js
import React, { useEffect, useState } from 'react';
import { feeAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt = n => `₹${(n||0).toLocaleString('en-IN')}`;
const pct = (a,b) => b>0 ? Math.round((a/b)*100) : 0;

const STATUS_STYLE = {
  paid:    { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  partial: { bg:'#DBEAFE', color:'#1E40AF', label:'Partial' },
  pending: { bg:'#FEF3C7', color:'#92400E', label:'Pending' },
  overdue: { bg:'#FEE2E2', color:'#991B1B', label:'Overdue' },
  waived:  { bg:'#F3F4F6', color:'#374151', label:'Waived' },
};

export default function FeesDashboard({ onNavigate }) {
  const [data,    setData]    = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    feeAPI.getDashboard()
      .then(r => setData(r.data.data))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, []);

  if (loading) return <LoadingState />;

  const totalAssigned  = data?.totalAssigned  || 0;
  const totalCollected = data?.totalCollected  || 0;
  const totalPending   = data?.totalPending    || 0;
  const totalOverdue   = data?.totalOverdue    || 0;
  const todayCollection= data?.todayCollection || 0;
  const recentPayments = data?.recentPayments  || [];
  const overdueList    = data?.overdueList     || [];
  const collectionRate = pct(totalCollected, totalAssigned);

  const KPI = ({ label, value, sub, color, bg, onClick }) => (
    <div onClick={onClick} style={{ background:bg||'#fff', border:`1.5px solid ${color}30`, borderRadius:14, padding:'18px 20px', cursor:onClick?'pointer':'default', transition:'all 0.15s' }}
      className={onClick?"hover:-translate-y-1 hover:shadow-md":""}>
      <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:26, fontWeight:900, color }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>{sub}</div>}
    </div>
  );

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">💰 Fee Dashboard</h2>
          <p className="text-sm text-muted mt-0.5">Overview of school fee collection</p>
        </div>
        <div style={{ textAlign:'right' }}>
          <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase' }}>Today's Collection</div>
          <div style={{ fontSize:24, fontWeight:900, color:'#16A34A' }}>{fmt(todayCollection)}</div>
        </div>
      </div>

      {/* KPI Cards */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:24 }}>
        <KPI label="Total Assigned"  value={fmt(totalAssigned)}   color="#1D4ED8" bg="#EFF6FF" sub={`${data?.totalStudents||0} students`}/>
        <KPI label="Collected"       value={fmt(totalCollected)}  color="#16A34A" bg="#F0FDF4" sub={`${collectionRate}% collection rate`} onClick={()=>onNavigate?.('history')}/>
        <KPI label="Pending"         value={fmt(totalPending)}    color="#D97706" bg="#FFFBEB" sub={`${data?.pendingCount||0} assignments`} onClick={()=>onNavigate?.('students')}/>
        <KPI label="Overdue"         value={fmt(totalOverdue)}    color="#DC2626" bg="#FEF2F2" sub={`${data?.overdueCount||0} students`} onClick={()=>onNavigate?.('students')}/>
      </div>

      {/* Collection Rate Bar */}
      <div className="card" style={{ padding:'16px 20px', marginBottom:20 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
          <span style={{ fontSize:13, fontWeight:700, color:'#374151' }}>Collection Rate</span>
          <span style={{ fontSize:15, fontWeight:900, color: collectionRate>=80?'#16A34A':collectionRate>=50?'#D97706':'#DC2626' }}>{collectionRate}%</span>
        </div>
        <div style={{ height:10, background:'#F3F4F6', borderRadius:5, overflow:'hidden' }}>
          <div style={{ height:'100%', width:`${collectionRate}%`, background: collectionRate>=80?'#16A34A':collectionRate>=50?'#D97706':'#DC2626', borderRadius:5, transition:'width 1s' }}/>
        </div>
        <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9CA3AF', marginTop:6 }}>
          <span>Collected: {fmt(totalCollected)}</span>
          <span>Remaining: {fmt(totalPending + totalOverdue)}</span>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:20 }}>
        {/* Recent Payments */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid #E5E7EB' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>Recent Payments</span>
            <button onClick={()=>onNavigate?.('history')} style={{ fontSize:12, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>View all →</button>
          </div>
          {!recentPayments.length ? (
            <EmptyState icon="💳" title="No payments yet" subtitle="Payments will appear here"/>
          ) : recentPayments.map((p,i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', borderBottom:'0.5px solid #F3F4F6' }}>
              <div style={{ width:38, height:38, borderRadius:10, background:'#D1FAE5', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>✅</div>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontWeight:600, fontSize:13, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {p.studentName || p.student?.user?.name || '—'}
                </div>
                <div style={{ fontSize:11, color:'#9CA3AF' }}>{p.feeType} · {p.paidOn ? new Date(p.paidOn).toLocaleDateString('en-IN') : '—'}</div>
              </div>
              <div style={{ fontWeight:800, fontSize:14, color:'#16A34A', flexShrink:0 }}>{fmt(p.amount)}</div>
            </div>
          ))}
        </div>

        {/* Overdue / Pending */}
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'14px 18px', borderBottom:'1px solid #E5E7EB' }}>
            <span style={{ fontWeight:700, fontSize:14 }}>⚠️ Overdue / Pending</span>
            <button onClick={()=>onNavigate?.('students')} style={{ fontSize:12, color:'#1D4ED8', background:'none', border:'none', cursor:'pointer', fontWeight:600 }}>Manage →</button>
          </div>
          {!overdueList.length ? (
            <EmptyState icon="✅" title="No overdue fees!" subtitle="All students are up to date"/>
          ) : overdueList.map((a,i) => {
            const ss = STATUS_STYLE[a.status] || STATUS_STYLE.pending;
            return (
              <div key={i} style={{ display:'flex', alignItems:'center', gap:12, padding:'12px 18px', borderBottom:'0.5px solid #F3F4F6' }}>
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ fontWeight:600, fontSize:13, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                    {a.student?.user?.name || '—'}
                  </div>
                  <div style={{ fontSize:11, color:'#9CA3AF' }}>{a.feeType?.name} · Due {a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-IN') : '—'}</div>
                </div>
                <div style={{ textAlign:'right', flexShrink:0 }}>
                  <div style={{ fontWeight:800, fontSize:13, color:'#DC2626' }}>{fmt(a.pendingAmount || a.finalAmount)}</div>
                  <span style={{ fontSize:10, fontWeight:700, color:ss.color, background:ss.bg, padding:'2px 8px', borderRadius:20 }}>{ss.label}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}