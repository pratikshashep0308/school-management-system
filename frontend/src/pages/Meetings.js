// frontend/src/pages/Meetings.js
//
// One-file Meetings module. Structure:
//   - <Meetings />           page shell, list/calendar toggle, role-aware actions
//   - <MeetingListView />    table of meetings with quick RSVP buttons
//   - <MeetingCalendar />    month grid; click date to filter
//   - <CreateMeetingModal /> form for new meeting (admin/teacher only)
//   - <MeetingDetailDrawer/> right-side drawer with tabs: Info / Participants / Attendance / MOM
//
// Notable choices:
//   - Calendar is hand-rolled (no FullCalendar dep) — keeps bundle small.
//   - Participants are picked from a list of all school users grouped by role.
//   - Audit & RSVP buttons are inline on the list — fastest path.

/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { meetingAPI, teacherAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState } from '../components/ui';

const TYPE_LABELS = {
  staff: 'Staff Meeting', parent: 'Parent Meeting', ptm: 'PTM (Parent-Teacher)',
  principal: 'Principal Meeting', department: 'Department', counseling: 'Counseling',
  online_lecture: 'Online Lecture', emergency: 'Emergency', other: 'Other',
};
const TYPE_COLORS = {
  staff: '#1D4ED8', parent: '#0F6E56', ptm: '#7C3AED', principal: '#B45309',
  department: '#0369A1', counseling: '#993556', online_lecture: '#16A34A',
  emergency: '#DC2626', other: '#6B7280',
};

const RSVP_LABELS = { pending: 'No reply', accepted: 'Going', declined: 'Not going', maybe: 'Maybe' };
const RSVP_COLORS = { pending: '#9CA3AF', accepted: '#16A34A', declined: '#DC2626', maybe: '#D97706' };

// Date helpers — avoid pulling in moment/dayjs for a few utilities.
const fmtDate = (d) => new Date(d).toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
const fmtDateTime = (d) => `${fmtDate(d)} · ${fmtTime(d)}`;
const sameDay = (a, b) => {
  const da = new Date(a), db = new Date(b);
  return da.getFullYear()===db.getFullYear() && da.getMonth()===db.getMonth() && da.getDate()===db.getDate();
};

export default function Meetings() {
  const { user } = useAuth();
  const canCreate = ['superAdmin', 'schoolAdmin', 'teacher'].includes(user?.role);

  const [meetings,  setMeetings]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [view,      setView]      = useState('list');     // 'list' | 'calendar'
  const [filter,    setFilter]    = useState('upcoming'); // 'upcoming' | 'past' | 'all' | 'mine'
  const [selectedDate, setSelectedDate] = useState(null);
  const [creating,  setCreating]  = useState(false);
  const [openMeeting, setOpenMeeting] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const params = {};
      if (filter === 'mine') params.mine = '1';
      const res = await meetingAPI.list(params);
      setMeetings(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load meetings');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filter]);

  // Filter on the client for fast tab switching without re-fetching.
  const now = new Date();
  const filtered = useMemo(() => {
    let out = meetings;
    if (filter === 'upcoming') out = out.filter(m => new Date(m.endTime) >= now && m.status !== 'cancelled');
    if (filter === 'past')     out = out.filter(m => new Date(m.endTime) <  now);
    if (selectedDate)          out = out.filter(m => sameDay(m.startTime, selectedDate));
    return out;
  }, [meetings, filter, selectedDate]);

  const handleCreated = (m) => {
    setMeetings(prev => [m, ...prev]);
    setCreating(false);
    toast.success('Meeting created');
  };
  const handleUpdated = (m) => {
    setMeetings(prev => prev.map(x => x._id === m._id ? m : x));
  };
  const handleRemoved = (id) => {
    setMeetings(prev => prev.filter(x => x._id !== id));
    setOpenMeeting(null);
    toast.success('Meeting deleted');
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">📅 Meetings</h2>
          <p className="text-sm text-muted">{filtered.length} meeting{filtered.length===1?'':'s'} shown</p>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          {/* View toggle */}
          <div style={{ display:'inline-flex', background:'#F3F4F6', borderRadius:8, padding:2 }}>
            {['list','calendar'].map(v => (
              <button key={v} onClick={()=>setView(v)}
                style={{ padding:'6px 14px', borderRadius:6, border:'none', fontSize:12, fontWeight:700,
                  background: view===v ? '#fff' : 'transparent',
                  color: view===v ? '#111827' : '#6B7280',
                  boxShadow: view===v ? '0 1px 2px rgba(0,0,0,0.06)' : 'none', cursor:'pointer' }}>
                {v==='list' ? '☰ List' : '📅 Calendar'}
              </button>
            ))}
          </div>
          {canCreate && (
            <button onClick={()=>setCreating(true)}
              style={{ padding:'8px 16px', borderRadius:8, border:'none', background:'#3B5BDB', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              + New Meeting
            </button>
          )}
        </div>
      </div>

      {/* Filter tabs */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
        {[
          { id:'upcoming', label:'⏰ Upcoming' },
          { id:'past',     label:'✓ Past' },
          { id:'mine',     label:'👤 My Meetings' },
          { id:'all',      label:'📋 All' },
        ].map(f => (
          <button key={f.id} onClick={()=>{ setFilter(f.id); setSelectedDate(null); }}
            style={{ padding:'7px 14px', borderRadius:20, border:'1px solid',
              borderColor: filter===f.id?'#3B5BDB':'#E5E7EB',
              background:  filter===f.id?'#EFF6FF':'#fff',
              color:       filter===f.id?'#1D4ED8':'#6B7280',
              fontSize:12, fontWeight:700, cursor:'pointer' }}>
            {f.label}
          </button>
        ))}
        {selectedDate && (
          <button onClick={()=>setSelectedDate(null)}
            style={{ padding:'7px 14px', borderRadius:20, border:'1px solid #FCA5A5', background:'#FEF2F2', color:'#DC2626', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Date: {fmtDate(selectedDate)} ✕
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <LoadingState />
      ) : view === 'calendar' ? (
        <MeetingCalendar
          meetings={meetings}
          onPickDate={setSelectedDate}
          selectedDate={selectedDate}
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon="📅"
          title="No meetings yet"
          description={canCreate ? 'Click "+ New Meeting" to schedule one.' : 'You have no meetings in this view.'}
        />
      ) : (
        <MeetingListView meetings={filtered} currentUserId={user?.id || user?._id} onOpen={setOpenMeeting} onChanged={handleUpdated} />
      )}

      {creating && (
        <CreateMeetingModal
          onClose={()=>setCreating(false)}
          onCreated={handleCreated}
        />
      )}

      {openMeeting && (
        <MeetingDetailDrawer
          meeting={openMeeting}
          currentUser={user}
          onClose={()=>setOpenMeeting(null)}
          onUpdated={(m)=>{ handleUpdated(m); setOpenMeeting(m); }}
          onRemoved={handleRemoved}
        />
      )}
    </div>
  );
}

// ── List view ───────────────────────────────────────────────────────────────
function MeetingListView({ meetings, currentUserId, onOpen, onChanged }) {
  const updateRsvp = async (m, status, e) => {
    e?.stopPropagation();
    try {
      await meetingAPI.rsvp(m._id, status);
      // Optimistic local update
      const me = m.participants.find(p => (p.user?._id || p.user) === currentUserId);
      if (me) {
        me.rsvp = status;
        me.rsvpAt = new Date();
      }
      onChanged({ ...m });
      toast.success(`RSVP: ${RSVP_LABELS[status]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'RSVP failed');
    }
  };

  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, overflow:'hidden' }}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr', gap:0 }}>
        {meetings.map((m, i) => {
          const me = m.participants.find(p => (p.user?._id || p.user) === currentUserId);
          const isPast = new Date(m.endTime) < new Date();
          const accepted = m.participants.filter(p => p.rsvp === 'accepted').length;
          return (
            <div key={m._id}
              onClick={()=>onOpen(m)}
              style={{
                padding:'14px 18px',
                borderBottom: i === meetings.length-1 ? 'none' : '1px solid #F3F4F6',
                cursor:'pointer',
                background: m.status==='cancelled' ? '#FEF2F2' : '#fff',
                opacity: isPast ? 0.75 : 1,
                transition: 'background 0.15s',
              }}
              onMouseEnter={e=>e.currentTarget.style.background = m.status==='cancelled' ? '#FEE2E2' : '#F9FAFB'}
              onMouseLeave={e=>e.currentTarget.style.background = m.status==='cancelled' ? '#FEF2F2' : '#fff'}
            >
              <div style={{ display:'flex', gap:14, alignItems:'flex-start' }}>
                {/* Date block */}
                <div style={{ textAlign:'center', minWidth:60, padding:'8px 0', background:'#F3F4F6', borderRadius:8 }}>
                  <div style={{ fontSize:10, color:'#6B7280', fontWeight:700, textTransform:'uppercase' }}>
                    {new Date(m.startTime).toLocaleDateString('en-IN', { month:'short' })}
                  </div>
                  <div style={{ fontSize:20, fontWeight:900, color:'#111827', lineHeight:1.1 }}>
                    {new Date(m.startTime).getDate()}
                  </div>
                  <div style={{ fontSize:10, color:'#6B7280' }}>{fmtTime(m.startTime)}</div>
                </div>

                {/* Main */}
                <div style={{ flex:1, minWidth:0 }}>
                  <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:4, flexWrap:'wrap' }}>
                    <span style={{ fontSize:10, fontWeight:700, color:'#fff', background: TYPE_COLORS[m.type] || '#6B7280', padding:'2px 8px', borderRadius:10, textTransform:'uppercase', letterSpacing:'0.03em' }}>
                      {TYPE_LABELS[m.type] || m.type}
                    </span>
                    {m.status === 'cancelled' && (
                      <span style={{ fontSize:10, fontWeight:700, color:'#DC2626', background:'#FEE2E2', padding:'2px 8px', borderRadius:10 }}>CANCELLED</span>
                    )}
                    {m.isOnline && <span style={{ fontSize:11 }}>🎥</span>}
                  </div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#111827', marginBottom:2 }}>{m.title}</div>
                  <div style={{ fontSize:11, color:'#6B7280' }}>
                    Organized by <strong>{m.organizer?.name || '—'}</strong> · {accepted}/{m.participants.length} accepted · {m.durationMin} min
                  </div>
                  {m.location && <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>📍 {m.location}</div>}
                </div>

                {/* RSVP actions (only if I'm invited and not past) */}
                {me && !isPast && m.status !== 'cancelled' && (
                  <div style={{ display:'flex', gap:4 }} onClick={e=>e.stopPropagation()}>
                    {['accepted','maybe','declined'].map(s => (
                      <button key={s}
                        onClick={(e)=>updateRsvp(m, s, e)}
                        title={RSVP_LABELS[s]}
                        style={{
                          padding:'6px 10px', borderRadius:6, fontSize:11, fontWeight:700,
                          border: `1px solid ${me.rsvp===s ? RSVP_COLORS[s] : '#E5E7EB'}`,
                          background: me.rsvp===s ? RSVP_COLORS[s]+'15' : '#fff',
                          color: me.rsvp===s ? RSVP_COLORS[s] : '#6B7280',
                          cursor:'pointer',
                        }}>
                        {s==='accepted'?'✓':s==='maybe'?'?':'✕'}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Calendar view ───────────────────────────────────────────────────────────
function MeetingCalendar({ meetings, onPickDate, selectedDate }) {
  const [cursor, setCursor] = useState(new Date());

  // Build a 6-week grid for `cursor`'s month.
  const year  = cursor.getFullYear();
  const month = cursor.getMonth();
  const first = new Date(year, month, 1);
  const startWeekday = first.getDay();
  const daysInMonth  = new Date(year, month+1, 0).getDate();
  const cells = [];
  for (let i = 0; i < startWeekday; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);

  // Group meetings by their date string for O(1) day lookup.
  const meetingsByDay = useMemo(() => {
    const map = {};
    meetings.forEach(m => {
      const key = new Date(m.startTime).toDateString();
      (map[key] ||= []).push(m);
    });
    return map;
  }, [meetings]);

  const today = new Date();
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:16 }}>
      <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
        <button onClick={()=>setCursor(new Date(year, month-1, 1))} style={{ padding:'6px 12px', background:'#F3F4F6', border:'none', borderRadius:6, cursor:'pointer', fontSize:12 }}>← Prev</button>
        <div style={{ fontWeight:800, fontSize:16 }}>{cursor.toLocaleDateString('en-IN', { month:'long', year:'numeric' })}</div>
        <button onClick={()=>setCursor(new Date(year, month+1, 1))} style={{ padding:'6px 12px', background:'#F3F4F6', border:'none', borderRadius:6, cursor:'pointer', fontSize:12 }}>Next →</button>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 1fr)', gap:4 }}>
        {['Sun','Mon','Tue','Wed','Thu','Fri','Sat'].map(d => (
          <div key={d} style={{ fontSize:11, fontWeight:700, color:'#6B7280', textAlign:'center', padding:'6px 0' }}>{d}</div>
        ))}
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const dayMeetings = meetingsByDay[c.toDateString()] || [];
          const isToday    = sameDay(c, today);
          const isSelected = selectedDate && sameDay(c, selectedDate);
          return (
            <div key={i}
              onClick={()=>onPickDate(isSelected ? null : c)}
              style={{
                minHeight: 78, padding:6, borderRadius:8, cursor:'pointer',
                background: isSelected ? '#EFF6FF' : '#F9FAFB',
                border: isSelected ? '2px solid #3B5BDB' : isToday ? '2px solid #16A34A' : '1px solid transparent',
              }}>
              <div style={{ fontSize:11, fontWeight: isToday?900:600, color: isToday?'#16A34A':'#374151', marginBottom:4 }}>
                {c.getDate()}
              </div>
              {dayMeetings.slice(0,2).map(m => (
                <div key={m._id} title={m.title}
                  style={{ fontSize:9, padding:'2px 5px', borderRadius:4, marginBottom:2, background: TYPE_COLORS[m.type]||'#6B7280', color:'#fff', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                  {fmtTime(m.startTime)} {m.title}
                </div>
              ))}
              {dayMeetings.length > 2 && (
                <div style={{ fontSize:9, color:'#9CA3AF' }}>+{dayMeetings.length-2} more</div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ── Create Modal ────────────────────────────────────────────────────────────
function CreateMeetingModal({ onClose, onCreated }) {
  const [form, setForm] = useState({
    title:'', description:'', type:'staff',
    startTime: '', durationMin: 30,
    location:'', meetingLink:'', isOnline:false,
    agenda:'',
    groups: [],
    participantUserIds: [],
  });
  const [users,   setUsers]   = useState([]);    // pickable people
  const [saving,  setSaving]  = useState(false);
  const [search,  setSearch]  = useState('');
  const set = (k,v) => setForm(f => ({ ...f, [k]: v }));

  // Load all teachers + students+parents from existing endpoints so we don't
  // need a new "users" listing endpoint.
  useEffect(() => {
    (async () => {
      try {
        const [ts, ss] = await Promise.all([
          teacherAPI.getAll().catch(()=>({ data:{ data:[] }})),
          studentAPI.getAll().catch(()=>({ data:{ data:[] }})),
        ]);
        const teachers = (ts.data?.data || []).map(t => ({
          id: t.user?._id || t.user,
          name: t.user?.name || '—',
          role: 'teacher',
          email: t.user?.email,
        })).filter(u => u.id);
        const studentUsers = (ss.data?.data || []).map(s => ({
          id: s.user?._id || s.user,
          name: s.user?.name || '—',
          role: 'student',
          email: s.user?.email,
        })).filter(u => u.id);
        const parentUsers = (ss.data?.data || []).map(s => s.parentId && ({
          id: typeof s.parentId === 'object' ? s.parentId._id : s.parentId,
          name: s.parentName || s.admissionSnapshot?.parentName || `Parent of ${s.user?.name||'student'}`,
          role: 'parent',
          email: s.parentEmail || s.admissionSnapshot?.parentEmail,
        })).filter(Boolean);

        // Dedupe by id
        const seen = new Set();
        const merged = [...teachers, ...studentUsers, ...parentUsers].filter(u => {
          const k = String(u.id);
          if (seen.has(k)) return false;
          seen.add(k); return true;
        });
        setUsers(merged);
      } catch (err) {
        console.error('Failed to load users for picker:', err);
      }
    })();
  }, []);

  const toggle = (id) => set('participantUserIds',
    form.participantUserIds.includes(id)
      ? form.participantUserIds.filter(x => x !== id)
      : [...form.participantUserIds, id]
  );
  const toggleGroup = (g) => set('groups',
    form.groups.includes(g) ? form.groups.filter(x=>x!==g) : [...form.groups, g]
  );

  const submit = async () => {
    if (!form.title.trim())     return toast.error('Title required');
    if (!form.startTime)        return toast.error('Start time required');
    if (form.groups.length === 0 && form.participantUserIds.length === 0)
      return toast.error('Pick at least one participant or group');
    setSaving(true);
    try {
      const res = await meetingAPI.create({
        ...form,
        isOnline: form.isOnline || !!form.meetingLink,
      });
      onCreated(res.data?.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to create meeting');
    } finally { setSaving(false); }
  };

  const visibleUsers = users.filter(u =>
    !search || u.name?.toLowerCase().includes(search.toLowerCase()) || u.email?.toLowerCase().includes(search.toLowerCase())
  );
  const usersByRole = {
    teacher: visibleUsers.filter(u => u.role === 'teacher'),
    parent:  visibleUsers.filter(u => u.role === 'parent'),
    student: visibleUsers.filter(u => u.role === 'student'),
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:880, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ position:'sticky', top:0, zIndex:1, background:'#0B1F4A', padding:'18px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>📅 New Meeting</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Schedule and invite participants</div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
        </div>

        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:18 }}>

          {/* Basic info */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:12 }}>Basic Info</div>
            <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr', gap:12 }}>
              <div>
                <label style={LBL}>Title *</label>
                <input style={INP} value={form.title} onChange={e=>set('title',e.target.value)} placeholder="e.g. Term 1 PTM"/>
              </div>
              <div>
                <label style={LBL}>Type</label>
                <select style={INP} value={form.type} onChange={e=>set('type',e.target.value)}>
                  {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Start Date & Time *</label>
                <input style={INP} type="datetime-local" value={form.startTime} onChange={e=>set('startTime',e.target.value)} />
              </div>
              <div>
                <label style={LBL}>Duration (min)</label>
                <input style={INP} type="number" min="1" value={form.durationMin} onChange={e=>set('durationMin',e.target.value)}/>
              </div>
              <div>
                <label style={LBL}>Location (physical)</label>
                <input style={INP} value={form.location} onChange={e=>set('location',e.target.value)} placeholder="e.g. Principal's Office"/>
              </div>
              <div>
                <label style={LBL}>Meeting Link (Zoom / Meet / Teams URL)</label>
                <input style={INP} value={form.meetingLink} onChange={e=>set('meetingLink',e.target.value)} placeholder="https://meet.google.com/abc-xyz"/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={LBL}>Description</label>
                <textarea style={{ ...INP, minHeight:50, resize:'vertical' }} value={form.description} onChange={e=>set('description',e.target.value)} placeholder="Short summary"/>
              </div>
              <div style={{ gridColumn:'span 2' }}>
                <label style={LBL}>Agenda</label>
                <textarea style={{ ...INP, minHeight:80, resize:'vertical' }} value={form.agenda} onChange={e=>set('agenda',e.target.value)} placeholder="• Discuss term 1 results&#10;• Plan for term 2&#10;• Q&A"/>
              </div>
            </div>
          </div>

          {/* Participants */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:12 }}>Participants</div>

            {/* Quick groups */}
            <div style={{ marginBottom:12 }}>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:600, marginBottom:6 }}>Quick add groups</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {[
                  ['all_teachers','👨‍🏫 All Teachers'],
                  ['all_staff','👥 All Staff'],
                  ['all_parents','👪 All Parents'],
                  ['all_students','🎓 All Students'],
                ].map(([k,label]) => (
                  <button key={k} type="button" onClick={()=>toggleGroup(k)}
                    style={{ padding:'6px 12px', borderRadius:20, border:'1px solid',
                      borderColor: form.groups.includes(k) ? '#3B5BDB' : '#E5E7EB',
                      background:  form.groups.includes(k) ? '#EFF6FF' : '#fff',
                      color:       form.groups.includes(k) ? '#1D4ED8' : '#6B7280',
                      fontSize:11, fontWeight:700, cursor:'pointer' }}>
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {/* Individual picker */}
            <div>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:6 }}>
                <div style={{ fontSize:11, color:'#6B7280', fontWeight:600 }}>Or pick individuals ({form.participantUserIds.length} selected)</div>
                <input style={{ ...INP, padding:'6px 10px', fontSize:12, width:220 }} placeholder="Search name…" value={search} onChange={e=>setSearch(e.target.value)}/>
              </div>
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, maxHeight:240, overflowY:'auto', border:'1px solid #E5E7EB', borderRadius:8, padding:10, background:'#FAFAFA' }}>
                {['teacher','parent','student'].map(role => (
                  <div key={role}>
                    <div style={{ fontSize:10, color:'#6B7280', fontWeight:700, textTransform:'uppercase', marginBottom:6 }}>
                      {role}s ({usersByRole[role].length})
                    </div>
                    <div style={{ display:'flex', flexDirection:'column', gap:4 }}>
                      {usersByRole[role].map(u => (
                        <label key={u.id} style={{ display:'flex', alignItems:'center', gap:6, padding:'3px 6px', borderRadius:5, fontSize:12, cursor:'pointer', background: form.participantUserIds.includes(u.id) ? '#EFF6FF' : 'transparent' }}>
                          <input type="checkbox" checked={form.participantUserIds.includes(u.id)} onChange={()=>toggle(u.id)} />
                          <span style={{ flex:1, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{u.name}</span>
                        </label>
                      ))}
                      {!usersByRole[role].length && <div style={{ fontSize:11, color:'#9CA3AF', fontStyle:'italic' }}>None</div>}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', paddingTop:4 }}>
            <button onClick={onClose} style={{ padding:'10px 28px', borderRadius:24, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>Cancel</button>
            <button onClick={submit} disabled={saving} style={{ padding:'10px 32px', borderRadius:24, border:'none', background:'#3B5BDB', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving ? '⏳ Creating…' : '✔ Create & Send Invites'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Detail Drawer ───────────────────────────────────────────────────────────
function MeetingDetailDrawer({ meeting: m, currentUser, onClose, onUpdated, onRemoved }) {
  const [tab,  setTab]  = useState('info');
  const [data, setData] = useState(m);
  const [notesDraft, setNotesDraft] = useState(m.notes || '');
  const [savingNotes, setSavingNotes] = useState(false);

  const isAdmin     = ['superAdmin','schoolAdmin'].includes(currentUser?.role);
  const isOrganizer = data.organizer?._id === currentUser?._id || data.organizer?._id === currentUser?.id;
  const canManage   = isAdmin || isOrganizer;

  // Refetch fresh to get any concurrent updates (e.g. someone else RSVPed)
  useEffect(() => {
    (async () => {
      try {
        const res = await meetingAPI.get(m._id);
        if (res.data?.data) {
          setData(res.data.data);
          setNotesDraft(res.data.data.notes || '');
        }
      } catch {}
    })();
  }, [m._id]);

  const saveNotes = async () => {
    setSavingNotes(true);
    try {
      const res = await meetingAPI.update(data._id, { notes: notesDraft });
      setData(res.data?.data);
      onUpdated(res.data?.data);
      toast.success('Notes saved');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Save failed');
    } finally { setSavingNotes(false); }
  };

  const toggleAttended = async (userId, attended) => {
    try {
      const res = await meetingAPI.markAttendance(data._id, [{ userId, attended }]);
      setData(res.data?.data);
      onUpdated(res.data?.data);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const cancelMeeting = async () => {
    if (!window.confirm('Cancel this meeting? Participants will see it as cancelled.')) return;
    try {
      const res = await meetingAPI.update(data._id, { status: 'cancelled' });
      setData(res.data?.data);
      onUpdated(res.data?.data);
      toast.success('Meeting cancelled');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const deleteMeeting = async () => {
    if (!window.confirm('Delete this meeting permanently? This cannot be undone.')) return;
    try {
      await meetingAPI.remove(data._id);
      onRemoved(data._id);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed');
    }
  };

  const accepted  = data.participants.filter(p => p.rsvp === 'accepted').length;
  const declined  = data.participants.filter(p => p.rsvp === 'declined').length;
  const maybe     = data.participants.filter(p => p.rsvp === 'maybe').length;
  const pending   = data.participants.filter(p => p.rsvp === 'pending').length;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, display:'flex', justifyContent:'flex-end' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.4)' }} onClick={onClose} />
      <div style={{ width:520, maxWidth:'100%', background:'#fff', display:'flex', flexDirection:'column', height:'100vh', overflowY:'auto', boxShadow:'-20px 0 60px rgba(0,0,0,0.2)' }}>
        {/* Header */}
        <div style={{ background:'#0B1F4A', padding:'18px 22px', color:'#fff', position:'sticky', top:0, zIndex:1 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ fontSize:10, fontWeight:700, background: TYPE_COLORS[data.type], padding:'2px 8px', borderRadius:10, textTransform:'uppercase' }}>{TYPE_LABELS[data.type]}</span>
              <div style={{ fontWeight:800, fontSize:18, marginTop:6 }}>{data.title}</div>
              <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>{fmtDateTime(data.startTime)} · {data.durationMin} min</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
          {/* Tabs */}
          <div style={{ display:'flex', gap:4, marginTop:14 }}>
            {[
              ['info','📋 Info'],
              ['participants',`👥 People (${data.participants.length})`],
              ['attendance','✓ Attendance'],
              ['mom','📝 Minutes'],
            ].map(([k,label]) => (
              <button key={k} onClick={()=>setTab(k)}
                style={{ padding:'6px 12px', fontSize:11, fontWeight:700, borderRadius:6, border:'none',
                  background: tab===k?'rgba(255,255,255,0.2)':'transparent',
                  color: tab===k?'#fff':'rgba(255,255,255,0.65)', cursor:'pointer' }}>
                {label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:'18px 22px', flex:1 }}>
          {tab === 'info' && (
            <div style={{ display:'flex', flexDirection:'column', gap:14 }}>
              {data.status === 'cancelled' && (
                <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#991B1B', padding:'10px 14px', borderRadius:8, fontWeight:700, fontSize:13 }}>
                  ✕ This meeting has been cancelled
                </div>
              )}
              {data.meetingLink && (
                <div>
                  <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>🎥 ONLINE LINK</div>
                  <a href={data.meetingLink} target="_blank" rel="noreferrer"
                    style={{ display:'inline-block', padding:'8px 16px', background:'#16A34A', color:'#fff', borderRadius:8, fontWeight:700, fontSize:13, textDecoration:'none' }}>
                    Join Meeting ↗
                  </a>
                  <div style={{ fontSize:11, color:'#9CA3AF', marginTop:4, wordBreak:'break-all' }}>{data.meetingLink}</div>
                </div>
              )}
              {data.location && (
                <Field label="📍 LOCATION" value={data.location} />
              )}
              <Field label="👤 ORGANIZER" value={data.organizer?.name} />
              <Field label="📝 DESCRIPTION" value={data.description || '—'} />
              <Field label="📋 AGENDA" value={data.agenda || '—'} multiline />

              {/* RSVP counts */}
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:6 }}>
                {[['Accepted',accepted,'#16A34A'],['Maybe',maybe,'#D97706'],['Declined',declined,'#DC2626'],['No reply',pending,'#9CA3AF']].map(([l,n,c]) => (
                  <div key={l} style={{ background:c+'15', borderRadius:8, padding:'8px 10px', textAlign:'center' }}>
                    <div style={{ fontSize:18, fontWeight:900, color:c }}>{n}</div>
                    <div style={{ fontSize:10, color:c, fontWeight:700, textTransform:'uppercase' }}>{l}</div>
                  </div>
                ))}
              </div>

              {canManage && data.status !== 'cancelled' && (
                <div style={{ display:'flex', gap:8, paddingTop:8, borderTop:'1px solid #E5E7EB' }}>
                  <button onClick={cancelMeeting} style={{ flex:1, padding:'8px', background:'#FEF3C7', color:'#92400E', border:'1px solid #FDE68A', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    ⊘ Cancel Meeting
                  </button>
                  <button onClick={deleteMeeting} style={{ flex:1, padding:'8px', background:'#FEE2E2', color:'#991B1B', border:'1px solid #FCA5A5', borderRadius:8, fontWeight:700, fontSize:12, cursor:'pointer' }}>
                    🗑 Delete
                  </button>
                </div>
              )}
            </div>
          )}

          {tab === 'participants' && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {data.participants.map(p => (
                <div key={p.user?._id || p.user} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#F9FAFB', borderRadius:8 }}>
                  <div style={{ flex:1, minWidth:0 }}>
                    <div style={{ fontWeight:700, fontSize:13 }}>{p.user?.name || p.nameAtInvite}</div>
                    <div style={{ fontSize:11, color:'#6B7280' }}>{p.user?.email} · {p.roleAtInvite || p.user?.role}</div>
                  </div>
                  <span style={{ fontSize:10, fontWeight:700, color: RSVP_COLORS[p.rsvp], background: RSVP_COLORS[p.rsvp]+'15', padding:'4px 10px', borderRadius:12 }}>
                    {RSVP_LABELS[p.rsvp]}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tab === 'attendance' && (
            <div style={{ display:'flex', flexDirection:'column', gap:6 }}>
              {!canManage && (
                <div style={{ fontSize:12, color:'#6B7280', fontStyle:'italic', marginBottom:8 }}>
                  Only the organizer or admin can mark attendance.
                </div>
              )}
              {data.participants.map(p => {
                const id = p.user?._id || p.user;
                return (
                  <div key={id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 10px', background:'#F9FAFB', borderRadius:8 }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{p.user?.name || p.nameAtInvite}</div>
                      <div style={{ fontSize:11, color:'#6B7280' }}>{p.roleAtInvite || p.user?.role}</div>
                    </div>
                    <div style={{ display:'flex', gap:4 }}>
                      <button disabled={!canManage} onClick={()=>toggleAttended(id, true)}
                        style={{ padding:'6px 12px', borderRadius:6, fontSize:11, fontWeight:700,
                          border: `1px solid ${p.attended===true ? '#16A34A' : '#E5E7EB'}`,
                          background: p.attended===true ? '#16A34A15' : '#fff',
                          color:      p.attended===true ? '#16A34A'    : '#6B7280',
                          cursor: canManage?'pointer':'not-allowed', opacity: canManage?1:0.5 }}>
                        ✓ Present
                      </button>
                      <button disabled={!canManage} onClick={()=>toggleAttended(id, false)}
                        style={{ padding:'6px 12px', borderRadius:6, fontSize:11, fontWeight:700,
                          border: `1px solid ${p.attended===false ? '#DC2626' : '#E5E7EB'}`,
                          background: p.attended===false ? '#DC262615' : '#fff',
                          color:      p.attended===false ? '#DC2626'    : '#6B7280',
                          cursor: canManage?'pointer':'not-allowed', opacity: canManage?1:0.5 }}>
                        ✕ Absent
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {tab === 'mom' && (
            <div>
              <div style={{ fontSize:12, color:'#6B7280', marginBottom:8 }}>
                {canManage ? 'Type the minutes of meeting and any action items here.' : 'Minutes of meeting (read-only)'}
              </div>
              <textarea
                value={notesDraft}
                onChange={e=>setNotesDraft(e.target.value)}
                disabled={!canManage}
                placeholder="What was discussed? Decisions? Action items?"
                style={{ width:'100%', minHeight:280, padding:12, border:'1px solid #E5E7EB', borderRadius:10, fontSize:13, fontFamily:'inherit', resize:'vertical', background: canManage?'#fff':'#F9FAFB' }}
              />
              {canManage && (
                <button onClick={saveNotes} disabled={savingNotes}
                  style={{ marginTop:10, padding:'10px 24px', background:'#3B5BDB', color:'#fff', border:'none', borderRadius:8, fontWeight:700, fontSize:13, cursor:'pointer', opacity: savingNotes?0.7:1 }}>
                  {savingNotes ? 'Saving…' : '💾 Save Minutes'}
                </button>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Field({ label, value, multiline }) {
  return (
    <div>
      <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:13, color:'#111827', whiteSpace: multiline?'pre-wrap':'normal', wordBreak:'break-word' }}>{value}</div>
    </div>
  );
}

// Shared input styles
const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
  fontSize:13, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' };
const LBL = { fontSize:11, color:'#6B7280', marginBottom:4, display:'block', fontWeight:600 };