// frontend/src/components/MeetingsWidget.js
//
// Portal-embedded meetings view. Used inside StudentDashboard, ParentDashboard,
// and TeacherDashboard so each portal has its own dedicated "Meetings" section
// without leaving the dashboard layout.
//
// Differences from the standalone Meetings page:
//   - No "create new meeting" button by default (toggle with `canCreate` prop —
//     teachers/admins get it, students/parents don't)
//   - No calendar/list toggle (calendar is the default at-a-glance view; list
//     view available on a sub-tab if needed)
//   - Compact RSVP-focused list — most of the value for students/parents is
//     just seeing what's coming and clicking ✓
//   - Detail view opens in a drawer same as the full module

/* eslint-disable react-hooks/exhaustive-deps */
import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import { useNavigate } from 'react-router-dom';
import { meetingAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const TYPE_LABELS = {
  staff: 'Staff Meeting', parent: 'Parent Meeting', ptm: 'PTM',
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

const fmtTime = (d) => new Date(d).toLocaleTimeString('en-IN', { hour:'2-digit', minute:'2-digit' });
const fmtDateTime = (d) => `${new Date(d).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'})} · ${fmtTime(d)}`;

export default function MeetingsWidget({ portalLabel = 'My Meetings', emptyHint }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [meetings, setMeetings] = useState([]);
  const [loading,  setLoading]  = useState(true);
  const [filter,   setFilter]   = useState('upcoming'); // upcoming | past | all
  const [openMeeting, setOpenMeeting] = useState(null);

  const myUserId = user?.id || user?._id;

  const load = async () => {
    setLoading(true);
    try {
      const res = await meetingAPI.list();
      setMeetings(res.data?.data || []);
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to load meetings');
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  const now = new Date();
  const filtered = useMemo(() => {
    if (filter === 'upcoming') return meetings.filter(m => new Date(m.endTime) >= now && m.status !== 'cancelled');
    if (filter === 'past')     return meetings.filter(m => new Date(m.endTime) <  now);
    return meetings;
  }, [meetings, filter]);

  // Pending-RSVP nudge — biggest user value: surface unanswered invites loudly.
  const pendingInvites = useMemo(() => meetings.filter(m => {
    if (new Date(m.endTime) < now || m.status === 'cancelled') return false;
    const me = m.participants?.find(p => (p.user?._id || p.user) === myUserId);
    return me && me.rsvp === 'pending';
  }), [meetings, myUserId]);

  const updateRsvp = async (m, status, e) => {
    e?.stopPropagation();
    try {
      await meetingAPI.rsvp(m._id, status);
      const me = m.participants.find(p => (p.user?._id || p.user) === myUserId);
      if (me) {
        me.rsvp   = status;
        me.rsvpAt = new Date();
      }
      setMeetings(prev => prev.map(x => x._id === m._id ? { ...m } : x));
      toast.success(`RSVP: ${RSVP_LABELS[status]}`);
    } catch (err) {
      toast.error(err.response?.data?.message || 'RSVP failed');
    }
  };

  return (
    <div>
      {/* Header strip */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">📅 {portalLabel}</h2>
          <p className="text-sm text-muted">
            {pendingInvites.length > 0
              ? <><strong style={{ color:'#D97706' }}>{pendingInvites.length} invite{pendingInvites.length>1?'s':''} awaiting your reply</strong> · {filtered.length} total</>
              : <>{filtered.length} meeting{filtered.length===1?'':'s'}</>}
          </p>
        </div>
        <div style={{ display:'flex', gap:6 }}>
          {[
            { id:'upcoming', label:'⏰ Upcoming' },
            { id:'past',     label:'✓ Past' },
            { id:'all',      label:'📋 All' },
          ].map(f => (
            <button key={f.id} onClick={()=>setFilter(f.id)}
              style={{ padding:'6px 12px', borderRadius:20, border:'1px solid',
                borderColor: filter===f.id?'#3B5BDB':'#E5E7EB',
                background:  filter===f.id?'#EFF6FF':'#fff',
                color:       filter===f.id?'#1D4ED8':'#6B7280',
                fontSize:11, fontWeight:700, cursor:'pointer' }}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Pending invite highlight */}
      {pendingInvites.length > 0 && filter === 'upcoming' && (
        <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:20 }}>👋</span>
          <div style={{ flex:1 }}>
            <div style={{ fontSize:13, fontWeight:700, color:'#92400E' }}>You have {pendingInvites.length} meeting invite{pendingInvites.length>1?'s':''} to respond to</div>
            <div style={{ fontSize:11, color:'#92400E' }}>Tap ✓ Going, ? Maybe, or ✕ Not going below.</div>
          </div>
        </div>
      )}

      {loading ? (
        <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>Loading meetings…</div>
      ) : filtered.length === 0 ? (
        <div style={{ padding:'40px 20px', textAlign:'center', background:'#F9FAFB', borderRadius:12, border:'1px dashed #E5E7EB' }}>
          <div style={{ fontSize:40, marginBottom:8 }}>📅</div>
          <div style={{ fontWeight:700, color:'#374151', marginBottom:4 }}>No meetings</div>
          <div style={{ fontSize:12, color:'#6B7280' }}>{emptyHint || 'No meetings to show here.'}</div>
        </div>
      ) : (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, overflow:'hidden' }}>
          {filtered.map((m, i) => {
            const me = m.participants?.find(p => (p.user?._id || p.user) === myUserId);
            const isPast = new Date(m.endTime) < now;
            return (
              <div key={m._id}
                onClick={()=>setOpenMeeting(m)}
                style={{
                  padding:'14px 18px',
                  borderBottom: i === filtered.length-1 ? 'none' : '1px solid #F3F4F6',
                  cursor:'pointer',
                  background: m.status==='cancelled' ? '#FEF2F2' : '#fff',
                  opacity: isPast ? 0.75 : 1,
                }}>
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
                      {m.isOnline && <span style={{ fontSize:11 }} title="Online">🎥</span>}
                      {me && (
                        <span style={{ fontSize:10, fontWeight:700, color: RSVP_COLORS[me.rsvp], background: RSVP_COLORS[me.rsvp]+'15', padding:'2px 8px', borderRadius:10 }}>
                          {RSVP_LABELS[me.rsvp]}
                        </span>
                      )}
                    </div>
                    <div style={{ fontWeight:700, fontSize:14, color:'#111827', marginBottom:2 }}>{m.title}</div>
                    <div style={{ fontSize:11, color:'#6B7280' }}>
                      Organized by <strong>{m.organizer?.name || '—'}</strong> · {m.durationMin} min
                      {m.location && <> · 📍 {m.location}</>}
                    </div>
                  </div>

                  {/* RSVP actions (only for upcoming + I'm invited + not cancelled) */}
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
      )}

      {/* Footer: link to full meetings page if user wants more */}
      {filtered.length > 0 && (
        <div style={{ marginTop:12, textAlign:'center' }}>
          <button onClick={()=>navigate('/meetings')}
            style={{ background:'none', border:'none', color:'#3B5BDB', fontSize:12, fontWeight:700, cursor:'pointer' }}>
            Open full Meetings page →
          </button>
        </div>
      )}

      {openMeeting && (
        <MiniDetailDrawer
          meeting={openMeeting}
          currentUserId={myUserId}
          onClose={()=>setOpenMeeting(null)}
        />
      )}
    </div>
  );
}

// ── Small read-only drawer for portal users — no MOM editing, no admin tools.
function MiniDetailDrawer({ meeting: m, currentUserId, onClose }) {
  const me = m.participants?.find(p => (p.user?._id || p.user) === currentUserId);

  return (
    <div style={{ position:'fixed', inset:0, zIndex:1000, background:'rgba(0,0,0,0.5)', display:'flex', flexDirection:'column' }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ width:'100vw', height:'100vh', background:'#fff', display:'flex', flexDirection:'column', overflow:'hidden', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:'#0B1F4A', padding:'18px 22px', color:'#fff', flexShrink:0 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', gap:10 }}>
            <div style={{ flex:1, minWidth:0 }}>
              <span style={{ fontSize:10, fontWeight:700, background: TYPE_COLORS[m.type], padding:'2px 8px', borderRadius:10, textTransform:'uppercase' }}>{TYPE_LABELS[m.type]}</span>
              <div style={{ fontWeight:800, fontSize:18, marginTop:6 }}>{m.title}</div>
              <div style={{ fontSize:12, opacity:0.7, marginTop:2 }}>{fmtDateTime(m.startTime)} · {m.durationMin} min</div>
            </div>
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
        </div>

        <div style={{ flex:1, overflowY:'auto', padding:'18px 22px' }}>
          <div style={{ maxWidth:760, margin:'0 auto', display:'flex', flexDirection:'column', gap:14 }}>
          {m.status === 'cancelled' && (
            <div style={{ background:'#FEE2E2', border:'1px solid #FCA5A5', color:'#991B1B', padding:'10px 14px', borderRadius:8, fontWeight:700, fontSize:13 }}>
              ✕ This meeting has been cancelled
            </div>
          )}

          {m.meetingLink && (
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>🎥 ONLINE LINK</div>
              <a href={m.meetingLink} target="_blank" rel="noreferrer"
                style={{ display:'inline-block', padding:'10px 18px', background:'#16A34A', color:'#fff', borderRadius:8, fontWeight:700, fontSize:14, textDecoration:'none' }}>
                Join Meeting ↗
              </a>
            </div>
          )}

          {m.location && (
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>📍 LOCATION</div>
              <div style={{ fontSize:14 }}>{m.location}</div>
            </div>
          )}

          <div>
            <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>👤 ORGANIZER</div>
            <div style={{ fontSize:14 }}>{m.organizer?.name || '—'}</div>
          </div>

          {m.description && (
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>📝 DESCRIPTION</div>
              <div style={{ fontSize:13, whiteSpace:'pre-wrap' }}>{m.description}</div>
            </div>
          )}

          {m.agenda && (
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>📋 AGENDA</div>
              <div style={{ fontSize:13, whiteSpace:'pre-wrap' }}>{m.agenda}</div>
            </div>
          )}

          {me && (
            <div style={{ background:'#F9FAFB', borderRadius:10, padding:'12px 14px', border:'1px solid #E5E7EB' }}>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:6 }}>YOUR RSVP</div>
              <div style={{ display:'inline-block', fontSize:13, fontWeight:700, color: RSVP_COLORS[me.rsvp], background: RSVP_COLORS[me.rsvp]+'15', padding:'4px 12px', borderRadius:12 }}>
                {RSVP_LABELS[me.rsvp]}
              </div>
            </div>
          )}

          {/* Show MOM if the meeting is done and notes exist */}
          {m.notes && new Date(m.endTime) < new Date() && (
            <div>
              <div style={{ fontSize:11, color:'#6B7280', fontWeight:700, marginBottom:4 }}>📝 MINUTES OF MEETING</div>
              <div style={{ fontSize:13, whiteSpace:'pre-wrap', background:'#F9FAFB', padding:12, borderRadius:8, border:'1px solid #E5E7EB' }}>{m.notes}</div>
            </div>
          )}
          </div>
        </div>
      </div>
    </div>
  );
}