import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { dashboardAPI } from '../utils/api';
import { StatCard, LoadingState } from '../components/ui';

const WEEK_ATT = [
  { day: 'Mon', present: 85, absent: 15 },
  { day: 'Tue', present: 92, absent: 8 },
  { day: 'Wed', present: 88, absent: 12 },
  { day: 'Thu', present: 96, absent: 4 },
  { day: 'Fri', present: 90, absent: 10 },
];

const EVENTS = [
  { day: '18', month: 'Mar', title: 'Unit Test — Class X', sub: 'Mathematics & Science', tag: 'Exam', tagColor: 'bg-gold/15 text-gold' },
  { day: '21', month: 'Mar', title: 'Holi — School Holiday', sub: 'School closed', tag: 'Holiday', tagColor: 'bg-sage/10 text-sage' },
  { day: '26', month: 'Mar', title: 'Annual Science Fair', sub: 'All classes — Main Hall', tag: 'Event', tagColor: 'bg-purple-50 text-purple-600' },
  { day: '28', month: 'Mar', title: 'Annual Sports Day', sub: 'School Grounds, 8:00 AM', tag: 'Event', tagColor: 'bg-purple-50 text-purple-600' },
];

const ACTIVITY = [
  { dot: '#4a7c59', text: 'Attendance marked for Class X-A by Mr. Sharma', time: '2 min ago' },
  { dot: '#c9a84c', text: 'Fee payment received — Aryan Mehta (STU-001) ₹12,500', time: '18 min ago' },
  { dot: '#7c6af5', text: 'New student enrolled — Priya Nair, Class VIII-B', time: '1 hr ago' },
  { dot: '#d4522a', text: 'Exam results published — Midterm 2025, Class XII', time: '3 hrs ago' },
  { dot: '#2d9cdb', text: 'Library book issued — "Physics Concepts" to Rohan Das', time: '5 hrs ago' },
];

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

  const maxBar = Math.max(...WEEK_ATT.map(d => d.present));

  return (
    <div className="animate-fade-in">
      <div className="mb-7">
        <h1 className="font-display text-3xl text-ink dark:text-white">{greeting()}, {user?.name?.split(' ')[0]} 👋</h1>
        <p className="text-sm text-muted mt-1">Here's what's happening at school today.</p>
      </div>

      {loading ? <LoadingState /> : (
        <>
          <div className="grid grid-cols-2 xl:grid-cols-4 gap-4 mb-6">
            <StatCard icon="👤" value={stats?.totalStudents?.toLocaleString() || '1,284'} label="Total Students" change="12 new this month" changeType="up" color="accent" route="/students" />
            <StatCard icon="🎓" value={stats?.totalTeachers || '86'} label="Teachers" change="3 new this term" changeType="up" color="gold" route="/teachers" />
            <StatCard icon="✓" value={`${stats?.attendanceRate || 94}%`} label="Avg Attendance" change="1.4% vs last week" changeType="up" color="sage" route="/attendance" />
            <StatCard icon="₹" value="₹8.4L" label="Fees Collected" change="₹1.2L pending" changeType="down" color="purple" route="/fees" />
          </div>

          <div className="grid xl:grid-cols-5 gap-5 mb-5">
            <div className="xl:col-span-3 card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden">
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
                <div className="flex items-end gap-3 h-32">
                  {WEEK_ATT.map(d => (
                    <div key={d.day} className="flex-1 flex flex-col items-center gap-1">
                      <div className="w-full flex items-end gap-0.5" style={{ height: '100px' }}>
                        <div className="flex-1 rounded-t-md bg-sage transition-all hover:opacity-80" style={{ height: `${(d.present / maxBar) * 95}%` }} />
                        <div className="flex-1 rounded-t-md transition-all hover:opacity-80" style={{ height: `${(d.absent / maxBar) * 95}%`, background: 'rgba(212,82,42,0.25)' }} />
                      </div>
                      <div className="text-[10px] text-muted">{d.day}</div>
                    </div>
                  ))}
                </div>
              </div>
            </div>

            <div className="xl:col-span-2 card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden">
              <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
                <div className="font-semibold text-ink dark:text-white">Upcoming Events</div>
              </div>
              <div className="divide-y divide-border dark:divide-gray-700">
                {EVENTS.map((ev, i) => (
                  <div key={i} className="flex gap-3 px-5 py-3.5 items-start hover:bg-warm/50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="w-10 h-10 rounded-lg bg-warm dark:bg-gray-700 flex flex-col items-center justify-center flex-shrink-0">
                      <div className="font-bold text-sm text-ink dark:text-white leading-none">{ev.day}</div>
                      <div className="text-[9px] text-muted uppercase">{ev.month}</div>
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <div className="font-medium text-sm text-ink dark:text-white truncate">{ev.title}</div>
                        <span className={`text-[10px] font-semibold px-2 py-0.5 rounded-full ${ev.tagColor}`}>{ev.tag}</span>
                      </div>
                      <div className="text-xs text-muted mt-0.5">{ev.sub}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="card dark:bg-gray-800 dark:border-gray-700 p-0 overflow-hidden mb-5">
            <div className="flex items-center justify-between px-6 py-4 border-b border-border dark:border-gray-700">
              <div className="font-semibold text-ink dark:text-white">Recent Activity</div>
            </div>
            <div className="divide-y divide-border dark:divide-gray-700">
              {ACTIVITY.map((a, i) => (
                <div key={i} className="flex items-center gap-3 px-6 py-3 hover:bg-warm/50 dark:hover:bg-gray-700/50 transition-colors">
                  <div className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: a.dot }} />
                  <div className="flex-1 text-sm text-ink dark:text-gray-300">{a.text}</div>
                  <div className="text-xs text-muted whitespace-nowrap">{a.time}</div>
                </div>
              ))}
            </div>
          </div>

          {(isAdmin || isTeacher) && (
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {[
                { icon: '✓', label: 'Mark Attendance', to: '/attendance', color: 'bg-sage/10 text-sage' },
                { icon: '👤', label: 'Add Student', to: '/students', color: 'bg-accent/10 text-accent' },
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