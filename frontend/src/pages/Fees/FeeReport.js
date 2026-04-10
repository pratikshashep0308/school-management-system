// frontend/src/pages/Fees/FeeReport.js
// 3 views: School-wide → Class-wise → Individual student with payment history

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const fmt  = n => `₹${(n||0).toLocaleString('en-IN')}`;
const pct  = (a,b) => b>0 ? Math.min(100, Math.round((a/b)*100)) : 0;

const STATUS_COLOR = {
  paid:    { bg:'#D1FAE5', color:'#065F46', label:'Paid' },
  partial: { bg:'#DBEAFE', color:'#1E40AF', label:'Partial' },
  not_paid:{ bg:'#FEE2E2', color:'#991B1B', label:'Unpaid' },
  overdue: { bg:'#FEE2E2', color:'#991B1B', label:'Overdue' },
  pending: { bg:'#FEF3C7', color:'#92400E', label:'Pending' },
};

// ── KPI Card ──────────────────────────────────────────────────────────────────
function KPI({ label, value, sub, color }) {
  return (
    <div style={{ background:'#fff', border:`1.5px solid ${color}30`, borderRadius:14, padding:'16px 20px' }}>
      <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:6 }}>{label}</div>
      <div style={{ fontSize:24, fontWeight:900, color }}>{value}</div>
      {sub && <div style={{ fontSize:12, color:'#9CA3AF', marginTop:4 }}>{sub}</div>}
    </div>
  );
}

// ── Progress bar ──────────────────────────────────────────────────────────────
function Bar({ value, color='#16A34A' }) {
  return (
    <div style={{ height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden', minWidth:80 }}>
      <div style={{ height:'100%', width:`${Math.min(100,value)}%`, background:color, borderRadius:3, transition:'width 0.8s' }}/>
    </div>
  );
}

export default function FeeReport() {
  const [view,       setView]       = useState('school');  // school | class | student
  const [loading,    setLoading]    = useState(true);
  const [summary,    setSummary]    = useState(null);   // school-wide
  const [classes,    setClasses]    = useState([]);
  const [selectedClass, setSelectedClass] = useState(null);
  const [students,   setStudents]   = useState([]);
  const [selectedStudent, setSelectedStudent] = useState(null);
  const [studentDetail, setStudentDetail] = useState(null);
  const [search,     setSearch]     = useState('');
  const [statusFilter, setStatusFilter] = useState('');

  // Load school summary + class list
  useEffect(() => {
    Promise.all([
      feeAPI.getClassSummary().catch(()=>({ data:{ data:{ classes:[], totals:{} } } })),
      classAPI.getAll().catch(()=>({ data:{ data:[] } })),
    ]).then(([sRes, cRes]) => {
      setSummary(sRes.data.data);
      setClasses(cRes.data.data || []);
    }).finally(() => setLoading(false));
  }, []);

  // Load students when class selected
  const loadClassStudents = useCallback(async (classId) => {
    setLoading(true);
    try {
      const r = await (feeAPI.getStudentsFees || feeAPI.getStudents)({ classId });
      setStudents(r.data.data || []);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, []);

  // Load individual student
  const loadStudent = useCallback(async (studentId) => {
    setLoading(true);
    try {
      const r = await feeAPI.getStudentFee(studentId);
      setStudentDetail(r.data);
    } catch { toast.error('Failed to load student details'); }
    finally { setLoading(false); }
  }, []);

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };
  const totals = summary?.totals || {};
  const classSummary = summary?.classes || [];
  const collRate = pct(totals.totalCollected, totals.totalExpected);

  // Filter students
  const filteredStudents = students.filter(s => {
    const name = s.student?.user?.name?.toLowerCase() || '';
    const matchSearch = !search || name.includes(search.toLowerCase()) || s.student?.rollNumber?.toString().includes(search);
    const matchStatus = !statusFilter || s.paymentStatus === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div>
      {/* Header + breadcrumb */}
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:20, flexWrap:'wrap' }}>
        <h2 className="font-display text-2xl text-ink">📊 Fee Report</h2>
        <div style={{ display:'flex', gap:4, alignItems:'center', marginLeft:'auto' }}>
          {['school','class','student'].map((v,i) => (
            <React.Fragment key={v}>
              {i>0 && <span style={{ color:'#D1D5DB' }}>›</span>}
              <span style={{ fontSize:13, fontWeight:700, color: view===v?'#1D4ED8':'#9CA3AF', cursor: i===0||(i===1&&selectedClass)||(i===2&&selectedStudent)?'pointer':'default' }}
                onClick={() => {
                  if(i===0){setView('school');setSelectedClass(null);setSelectedStudent(null);}
                  else if(i===1&&selectedClass){setView('class');setSelectedStudent(null);}
                }}>
                {v==='school'?'School':v==='class'?(selectedClass?.name||'Class'):(selectedStudent?.student?.user?.name||'Student')}
              </span>
            </React.Fragment>
          ))}
        </div>
      </div>

      {/* ── SCHOOL VIEW ── */}
      {view === 'school' && (
        <div>
          {loading ? <LoadingState /> : (
            <>
              {/* KPIs */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:14, marginBottom:20 }}>
                <KPI label="Total Expected"  value={fmt(totals.totalExpected)}  color="#1D4ED8" sub={`${totals.totalStudents||0} students`}/>
                <KPI label="Collected"       value={fmt(totals.totalCollected)} color="#16A34A" sub={`${collRate}% collection rate`}/>
                <KPI label="Pending"         value={fmt(totals.totalPending)}   color="#D97706" sub={`${totals.partialCount||0} partial`}/>
                <KPI label="Unpaid"          value={totals.notPaidCount||0}     color="#DC2626" sub="students with no payment"/>
              </div>

              {/* Collection rate bar */}
              <div className="card" style={{ padding:'16px 20px', marginBottom:20 }}>
                <div style={{ display:'flex', justifyContent:'space-between', marginBottom:8 }}>
                  <span style={{ fontSize:13, fontWeight:700 }}>Overall Collection Rate</span>
                  <span style={{ fontSize:16, fontWeight:900, color:collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626' }}>{collRate}%</span>
                </div>
                <Bar value={collRate} color={collRate>=80?'#16A34A':collRate>=50?'#D97706':'#DC2626'}/>
                <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#9CA3AF', marginTop:6 }}>
                  <span>Collected: {fmt(totals.totalCollected)}</span>
                  <span>Remaining: {fmt(totals.totalPending)}</span>
                </div>
              </div>

              {/* Class-wise table */}
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>Class-wise Summary</div>
                <div style={{ overflowX:'auto' }}>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#0B1F4A' }}>
                        {['Class','Students','Expected','Collected','Pending','Rate','Status',''].map(h=>(
                          <th key={h} style={{ padding:'10px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {classSummary.length === 0 ? (
                        <tr><td colSpan={8} style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>No fee data yet</td></tr>
                      ) : classSummary.map((cls,i) => {
                        const rate = pct(cls.totalCollected, cls.totalExpected);
                        return (
                          <tr key={i} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}
                            onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                            onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                            <td style={{ padding:'12px 16px', fontWeight:700, color:'#111827' }}>{cls.className} {cls.section||''}</td>
                            <td style={{ padding:'12px 16px', color:'#374151' }}>{cls.totalStudents}</td>
                            <td style={{ padding:'12px 16px', fontWeight:600, color:'#1D4ED8' }}>{fmt(cls.totalExpected)}</td>
                            <td style={{ padding:'12px 16px', fontWeight:700, color:'#16A34A' }}>{fmt(cls.totalCollected)}</td>
                            <td style={{ padding:'12px 16px', fontWeight:700, color:cls.totalPending>0?'#DC2626':'#16A34A' }}>{fmt(cls.totalPending)}</td>
                            <td style={{ padding:'12px 16px', minWidth:120 }}>
                              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                                <Bar value={rate} color={rate>=80?'#16A34A':rate>=50?'#D97706':'#EF4444'}/>
                                <span style={{ fontSize:12, fontWeight:700, color:rate>=80?'#16A34A':rate>=50?'#D97706':'#DC2626', minWidth:36 }}>{rate}%</span>
                              </div>
                            </td>
                            <td style={{ padding:'12px 16px' }}>
                              <div style={{ display:'flex', gap:4, fontSize:10 }}>
                                <span style={{ background:'#D1FAE5', color:'#065F46', padding:'2px 7px', borderRadius:20, fontWeight:700 }}>{cls.paidCount}✓</span>
                                <span style={{ background:'#FEE2E2', color:'#991B1B', padding:'2px 7px', borderRadius:20, fontWeight:700 }}>{cls.notPaidCount}✗</span>
                              </div>
                            </td>
                            <td style={{ padding:'12px 16px' }}>
                              <button onClick={()=>{ setSelectedClass({ ...cls, _id:cls.classId }); setView('class'); loadClassStudents(cls.classId); }}
                                style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 12px', borderRadius:7, cursor:'pointer', whiteSpace:'nowrap' }}>
                                View →
                              </button>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </div>
      )}

      {/* ── CLASS VIEW ── */}
      {view === 'class' && (
        <div>
          <div style={{ display:'flex', gap:8, marginBottom:16, flexWrap:'wrap', alignItems:'center' }}>
            <button onClick={()=>{ setView('school'); setSelectedClass(null); }}
              style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'6px 14px', borderRadius:8, cursor:'pointer' }}>
              ← Back to School
            </button>
            <div style={{ fontWeight:700, fontSize:16, color:'#111827' }}>{selectedClass?.className} {selectedClass?.section||''}</div>
            <div style={{ marginLeft:'auto', display:'flex', gap:8 }}>
              <input placeholder="🔍 Search student…" value={search} onChange={e=>setSearch(e.target.value)}
                style={{ ...SEL, minWidth:200 }}/>
              <select value={statusFilter} onChange={e=>setStatusFilter(e.target.value)} style={SEL}>
                <option value="">All Status</option>
                <option value="paid">Paid</option>
                <option value="partial">Partial</option>
                <option value="not_paid">Unpaid</option>
              </select>
            </div>
          </div>

          {loading ? <LoadingState /> : (
            <div className="card" style={{ padding:0, overflow:'hidden' }}>
              <div style={{ overflowX:'auto' }}>
                <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                  <thead>
                    <tr style={{ background:'#0B1F4A' }}>
                      {['#','Student','Roll','Total Fees','Paid','Pending','Progress','Status','Actions'].map(h=>(
                        <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {!filteredStudents.length ? (
                      <tr><td colSpan={9} style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>No students found</td></tr>
                    ) : filteredStudents.map((s,i) => {
                      const name = s.student?.user?.name || '—';
                      const rate = pct(s.paidAmount, s.totalFees);
                      const ss   = STATUS_COLOR[s.paymentStatus] || STATUS_COLOR.pending;
                      return (
                        <tr key={s._id} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff', cursor:'pointer' }}
                          onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                          onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                          <td style={{ padding:'11px 14px', color:'#9CA3AF' }}>{i+1}</td>
                          <td style={{ padding:'11px 14px' }}>
                            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                              <div style={{ width:32, height:32, borderRadius:9, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                                <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{name[0]?.toUpperCase()}</span>
                              </div>
                              <span style={{ fontWeight:700, color:'#111827' }}>{name}</span>
                            </div>
                          </td>
                          <td style={{ padding:'11px 14px', color:'#6B7280' }}>{s.student?.rollNumber||'—'}</td>
                          <td style={{ padding:'11px 14px', fontWeight:600, color:'#1D4ED8' }}>{fmt(s.totalFees)}</td>
                          <td style={{ padding:'11px 14px', fontWeight:700, color:'#16A34A' }}>{fmt(s.paidAmount)}</td>
                          <td style={{ padding:'11px 14px', fontWeight:700, color:s.pendingAmount>0?'#DC2626':'#16A34A' }}>{fmt(s.pendingAmount||0)}</td>
                          <td style={{ padding:'11px 14px', minWidth:100 }}>
                            <Bar value={rate} color={rate===100?'#16A34A':rate>50?'#D97706':'#EF4444'}/>
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20 }}>{ss.label}</span>
                          </td>
                          <td style={{ padding:'11px 14px' }}>
                            <button onClick={()=>{ setSelectedStudent(s); setView('student'); loadStudent(s.student?._id); }}
                              style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                              Details →
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── STUDENT VIEW ── */}
      {view === 'student' && (
        <div>
          <button onClick={()=>{ setView('class'); setSelectedStudent(null); setStudentDetail(null); }}
            style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'6px 14px', borderRadius:8, cursor:'pointer', marginBottom:16 }}>
            ← Back to Class
          </button>

          {loading ? <LoadingState /> : !studentDetail ? (
            <EmptyState icon="💰" title="No fee record found"/>
          ) : (
            <div>
              {/* Student header */}
              <div style={{ background:'#0B1F4A', borderRadius:14, padding:'20px 24px', marginBottom:20, display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:16 }}>
                {[
                  { l:'Student',    v:studentDetail.data?.student?.user?.name||'—' },
                  { l:'Class',      v:`${studentDetail.data?.class?.name||''} ${studentDetail.data?.class?.section||''}` },
                  { l:'Total Fees', v:fmt(studentDetail.data?.totalFees), c:'#FCD34D' },
                  { l:'Balance',    v:fmt(studentDetail.data?.pendingAmount||0), c:studentDetail.data?.pendingAmount>0?'#FCA5A5':'#86EFAC' },
                ].map(f=>(
                  <div key={f.l}>
                    <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>{f.l}</div>
                    <div style={{ fontSize:15, fontWeight:700, color:f.c||'#fff' }}>{f.v}</div>
                  </div>
                ))}
              </div>

              {/* Summary cards */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:14, marginBottom:20 }}>
                <KPI label="Total Paid"    value={fmt(studentDetail.data?.paidAmount)}                       color="#16A34A"/>
                <KPI label="Pending"       value={fmt(studentDetail.data?.pendingAmount||0)}                 color="#DC2626"/>
                <KPI label="Payments Made" value={studentDetail.data?.paymentHistory?.length||0}             color="#1D4ED8" sub="transactions"/>
              </div>

              {/* Fee Assignments */}
              {studentDetail.assignments?.length > 0 && (
                <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:20 }}>
                  <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>📋 Fee Assignments</div>
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#F8FAFC' }}>
                        {['Fee Type','Total','Paid','Pending','Due Date','Status'].map(h=>(
                          <th key={h} style={{ padding:'9px 16px', textAlign:'left', fontWeight:700, color:'#6B7280', fontSize:11, textTransform:'uppercase' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {studentDetail.assignments.map((a,i) => {
                        const ss = STATUS_COLOR[a.status] || STATUS_COLOR.pending;
                        const pending = a.pendingAmount ?? (a.finalAmount - a.paidAmount);
                        return (
                          <tr key={i} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                            <td style={{ padding:'10px 16px', fontWeight:600, color:'#111827' }}>{a.feeType?.name||'—'}</td>
                            <td style={{ padding:'10px 16px', color:'#1D4ED8', fontWeight:700 }}>{fmt(a.finalAmount)}</td>
                            <td style={{ padding:'10px 16px', color:'#16A34A', fontWeight:700 }}>{fmt(a.paidAmount)}</td>
                            <td style={{ padding:'10px 16px', color:pending>0?'#DC2626':'#16A34A', fontWeight:700 }}>{fmt(pending)}</td>
                            <td style={{ padding:'10px 16px', color:'#6B7280' }}>{a.dueDate?new Date(a.dueDate).toLocaleDateString('en-IN'):'—'}</td>
                            <td style={{ padding:'10px 16px' }}>
                              <span style={{ fontSize:11, fontWeight:700, color:ss.color, background:ss.bg, padding:'3px 10px', borderRadius:20 }}>{ss.label}</span>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Payment History */}
              <div className="card" style={{ padding:0, overflow:'hidden' }}>
                <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', fontWeight:700, fontSize:14 }}>📜 Payment History</div>
                {!studentDetail.data?.paymentHistory?.length ? (
                  <EmptyState icon="💳" title="No payments yet" subtitle="Payments will appear here after collection"/>
                ) : (
                  <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
                    <thead>
                      <tr style={{ background:'#0B1F4A' }}>
                        {['#','Receipt No','Date','Period','Amount','Method','Collected By'].map(h=>(
                          <th key={h} style={{ padding:'10px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {studentDetail.data.paymentHistory.map((p,i) => (
                        <tr key={i} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                          <td style={{ padding:'10px 14px', color:'#9CA3AF' }}>{i+1}</td>
                          <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#1D4ED8' }}>{p.receiptNumber||'—'}</td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{p.paidOn?new Date(p.paidOn).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):'—'}</td>
                          <td style={{ padding:'10px 14px', color:'#374151' }}>{p.month||'—'}</td>
                          <td style={{ padding:'10px 14px', fontWeight:800, color:'#16A34A', fontSize:14 }}>{fmt(p.amount)}</td>
                          <td style={{ padding:'10px 14px' }}>
                            <span style={{ fontSize:11, fontWeight:700, background:'#EFF6FF', color:'#1E40AF', padding:'2px 8px', borderRadius:20, textTransform:'uppercase' }}>{p.method||'cash'}</span>
                          </td>
                          <td style={{ padding:'10px 14px', color:'#6B7280' }}>{p.collectedBy?.name||'Admin'}</td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr style={{ background:'#F0FDF4' }}>
                        <td colSpan={4} style={{ padding:'10px 14px', fontWeight:700, textAlign:'right', color:'#065F46' }}>Total Paid</td>
                        <td style={{ padding:'10px 14px', fontWeight:900, color:'#16A34A', fontSize:15 }}>
                          {fmt(studentDetail.data.paymentHistory.reduce((s,p)=>s+p.amount,0))}
                        </td>
                        <td colSpan={2}/>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}