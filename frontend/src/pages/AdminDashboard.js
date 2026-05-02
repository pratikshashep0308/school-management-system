import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../utils/api';
import { StatCard, LoadingState } from '../components/ui';

const WEEK_DAYS = ['Mon','Tue','Wed','Thu','Fri'];

function timeAgo(date) {
  const diff = Math.floor((new Date() - new Date(date)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff/60)} min ago`;
  if (diff < 86400) return `${Math.floor(diff/3600)} hr ago`;
  return `${Math.floor(diff/86400)}d ago`;
}

export default function AdminDashboard() {
  const { user, isAdmin, isTeacher } = useAuth();
  const navigate = useNavigate();
  const [stats, setStats] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    dashboardAPI.getStats()
      .then(r => setStats(r.data.data))
      .catch(() => setStats(null))
      .finally(() => setLoading(false));
  }, []);

  const greeting = () => {
    const h = new Date().getHours();
    if (h < 12) return 'Good morning';
    if (h < 17) return 'Good afternoon';
    return 'Good evening';
  };

  return (
    <div className="animate-fade-in">
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink dark:text-white">{greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted mt-1">Here's what's happening at school today.</p>
      </div>

      {/* ── Quick Actions ── */}
      <div style={{ display:'flex', gap:10, marginBottom:22, flexWrap:'wrap' }}>
        {[
          { icon:'✅', label:'Mark Attendance', color:'#166534', bg:'#DCFCE7', path:'/attendance'    },
          { icon:'💳', label:'Collect Fee',      color:'#1D4ED8', bg:'#EFF6FF', path:'/fees'          },
          { icon:'👤', label:'Add Student',      color:'#7C3AED', bg:'#EDE9FE', path:'/admissions'    },
          { icon:'👥', label:'Add Employee',     color:'#0369A1', bg:'#E0F2FE', path:'/teachers'      },
          { icon:'🔔', label:'Send Notice',      color:'#D97706', bg:'#FFFBEB', path:'/notifications' },
          { icon:'📊', label:'View Reports',     color:'#DC2626', bg:'#FEF2F2', path:'/reports'       },
        ].map(a=>(
          <button key={a.label} onClick={()=>navigate(a.path)}
            style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 16px', borderRadius:10,
              background:a.bg, border:`1.5px solid ${a.color}30`, cursor:'pointer',
              fontSize:13, fontWeight:700, color:a.color, transition:'all 0.15s', flexShrink:0 }}
            onMouseEnter={e=>{ e.currentTarget.style.transform='translateY(-2px)'; e.currentTarget.style.boxShadow=`0 4px 14px ${a.color}30`; }}
            onMouseLeave={e=>{ e.currentTarget.style.transform=''; e.currentTarget.style.boxShadow=''; }}>
            <span style={{ fontSize:16 }}>{a.icon}</span>{a.label}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            {[
              { icon:'👤', value:stats?.totalStudents?.toLocaleString()||'0',  label:'Total Students', change:'12 new this month',  changeType:'up',   color:'accent', to:'/students'   },
              { icon:'👤', value:stats?.totalTeachers||'0',                    label:'Employees',       change:'3 new this term',    changeType:'up',   color:'gold',   to:'/teachers'   },
              { icon:'✓',  value:`${stats?.attendanceRate||0}%`,               label:'Avg Attendance', change:"Today's rate",       changeType:'up',   color:'sage',   to:'/attendance' },
              { icon:'₹',  value:stats?.feesCollected?`₹${(stats.feesCollected/100000).toFixed(1)}L`:'₹0', label:'Fees Collected', change:stats?.feesCollected?'This month':'No payments', changeType:'up', color:'purple', to:'/fees' },
            ].map(s => (
              <div key={s.label} onClick={()=>navigate(s.to)} className="cursor-pointer hover:-translate-y-1 hover:shadow-md transition-all">
                <StatCard icon={s.icon} value={s.value} label={s.label} change={s.change} changeType={s.changeType} color={s.color}/>
              </div>
            ))}
          </div>

          <div className="grid xl:grid-cols-5 gap-5 mb-5">
            <div className="xl:col-span-3 card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden" onClick={()=>navigate('/attendance')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
                <div className="font-semibold text-ink dark:text-white">Weekly Attendance Overview</div>
                <div className="text-xs text-muted">Mon – Fri this week</div>
              </div>
              <div className="px-6 pt-5 pb-6">
                <div className="flex gap-4 mb-5">
                  {[['#4a7c59', 'Present'], ['rgba(212,82,42,0.25)', 'Absent']].map(([c, l]) => (
                    <div key={l} className="flex items-center gap-1.5 text-xs text-slate">
                      <span className="w-2.5 h-2.5 rounded-sm inline-block" style={{ background: c }} /> {l}
                    </div>
                  ))}
                </div>
                {/* Attendance bar chart - today's rate shown as info */}
                <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:100, flexDirection:'column', gap:8 }}>
                  <div style={{ fontSize:36, fontWeight:900, color:'#4a7c59' }}>{stats?.attendanceRate || 0}%</div>
                  <div style={{ fontSize:13, color:'#6B7280' }}>Today's attendance rate</div>
                  <div style={{ width:'100%', height:8, background:'#F3F4F6', borderRadius:4, overflow:'hidden', marginTop:4 }}>
                    <div style={{ height:'100%', width:`${stats?.attendanceRate||0}%`, background:'#4a7c59', borderRadius:4, transition:'width 1s' }}/>
                  </div>
                  <div style={{ display:'flex', gap:16, fontSize:12, color:'#6B7280' }}>
                    <span>✅ Present: {stats?.todayPresent || 0}</span>
                    <span>👥 Total: {stats?.totalStudents || 0}</span>
                  </div>
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden" onClick={()=>navigate('/exams')} style={{cursor:'pointer',transition:'box-shadow 0.15s'}} onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 20px rgba(0,0,0,0.1)'} onMouseLeave={e=>e.currentTarget.style.boxShadow=''}>
              <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
                <div className="font-semibold text-ink dark:text-white">Upcoming Exams</div>
                <button onClick={(e)=>{e.stopPropagation();navigate('/exams');}} className="text-xs text-accent hover:underline">View all</button>
              </div>
              <div className="divide-y divide-border dark:divide-gray-700">
                {!stats?.upcomingExams?.length ? (
                  <div className="px-5 py-8 text-center text-muted text-sm">No upcoming exams scheduled</div>
                ) : stats.upcomingExams.map((exam, i) => {
                  const d = exam.date ? new Date(exam.date) : null;
                  return (
                    <div key={i} className="flex gap-3 px-5 py-3.5 items-start hover:bg-warm/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={()=>navigate('/exams')}>
                      <div className="w-10 h-10 rounded-lg bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                        <div className="font-bold text-sm text-ink dark:text-white leading-none">{d?.getDate()}</div>
                        <div className="text-[9px] text-muted uppercase">{d?.toLocaleString('default',{month:'short'})}</div>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-1.5 flex-wrap">
                          <div className="font-medium text-sm text-ink dark:text-white truncate">{exam.name}</div>
                          <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-gold/15 text-gold">{exam.examType}</span>
                        </div>
                        <div className="text-xs text-muted mt-0.5">{exam.class?.name} {exam.class?.section||''} · {exam.subject?.name||'—'}</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          <div className="card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden mb-5">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
              <div className="font-semibold text-ink dark:text-white">Recent Notifications</div>
              <button onClick={()=>navigate('/notifications')} className="text-xs text-accent hover:underline">View all</button>
            </div>
            <div className="divide-y divide-border dark:divide-gray-700">
              {!stats?.recentNotifications?.length ? (
                <div className="px-6 py-8 text-center text-muted text-sm">No recent notifications</div>
              ) : stats.recentNotifications.map((n, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-3 hover:bg-warm/50 dark:hover:bg-gray-700/50 transition-colors cursor-pointer" onClick={()=>navigate('/notifications')}>
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: n.type==='warning'?'#d4522a':n.type==='success'?'#4a7c59':'#7c6af5' }} />
                  <div className="flex-1 text-sm text-ink dark:text-gray-300">{n.title}{n.message ? ` — ${n.message.slice(0,60)}${n.message.length>60?'…':''}` : ''}</div>
                  <div className="text-xs text-muted whitespace-nowrap">{timeAgo(n.createdAt)}</div>
                </div>
              ))}
            </div>
          </div>

          {(isAdmin || isTeacher) && (
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
              {[
                { icon: '✓', label: 'Mark Attendance', to: '/attendance', color: 'bg-sage/10 text-sage' },
                { icon: '📋', label: 'New Admission', to: '/admissions', color: 'bg-gold/15 text-gold' },
                { icon: '🔔', label: 'Send Notification', to: '/notifications', color: 'bg-purple-50 text-purple-600' },
              ].map(({ icon, label, to, color }) => (
                <button key={to} onClick={() => navigate(to)} className="card dark:bg-gray-800 dark:border-gray-700 px-4 py-5 flex flex-col items-center gap-2 hover:-translate-y-0.5 transition-transform">
                  <div className={`w-10 h-10 rounded-xl flex items-center justify-center text-xl ${color}`}>{icon}</div>
                  <div className="text-sm font-medium text-ink dark:text-white">{label}</div>
                </button>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}