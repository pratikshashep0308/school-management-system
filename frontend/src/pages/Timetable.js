// frontend/src/pages/Timetable.js
// 7-day grid: columns = Mon–Sun, rows = periods
// Admin: full CRUD | Teacher/Student/Parent: read-only

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { timetableAPI, classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { LoadingState, EmptyState } from '../components/ui';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday','Sunday'];
const DAY_SHORT = { Monday:'Mon', Tuesday:'Tue', Wednesday:'Wed', Thursday:'Thu', Friday:'Fri', Saturday:'Sat', Sunday:'Sun' };
const DAY_COLORS = {
  Monday:'#993C1D', Tuesday:'#854F0B', Wednesday:'#3B6D11',
  Thursday:'#534AB7', Friday:'#185FA5', Saturday:'#993556', Sunday:'#A32D2D',
};
const SUBJECT_COLORS = [
  '#185FA5','#0F6E56','#534AB7','#993C1D','#854F0B',
  '#993556','#1D9E75','#D85A30','#7F77DD','#3B6D11',
];
const TYPES = ['lecture','lab','break','lunch','free','assembly'];
const TYPE_LABELS = { lecture:'Lecture', lab:'Lab', break:'Break', lunch:'Lunch', free:'Free', assembly:'Assembly' };
const TODAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

const fmt12 = t => {
  if (!t) return '';
  const [h,m] = t.split(':');
  const hh = +h;
  return `${hh>12?hh-12:hh||12}:${m}${hh>=12?'pm':'am'}`;
};

function buildColorMap(subjects) {
  const map = {};
  subjects.forEach((s,i) => { map[s._id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
  return map;
}

// Build a lookup: day → periodNumber → period object
function buildGrid(timetable) {
  const grid = {};
  DAYS.forEach(d => { grid[d] = {}; });
  if (!timetable?.schedule) return grid;
  timetable.schedule.forEach(ds => {
    (ds.periods || []).forEach(p => {
      if (!grid[ds.day]) grid[ds.day] = {};
      grid[ds.day][p.periodNumber] = p;
    });
  });
  return grid;
}

// Get sorted unique period numbers across all days
function getPeriodNumbers(timetable) {
  const nums = new Set();
  if (!timetable?.schedule) return [1,2,3,4,5,6,7,8];
  timetable.schedule.forEach(ds => {
    (ds.periods||[]).forEach(p => nums.add(p.periodNumber));
  });
  return nums.size ? [...nums].sort((a,b)=>a-b) : [1,2,3,4,5,6,7,8];
}

// ── Period add/edit modal ─────────────────────────────────────────────────────
function PeriodModal({ period, onClose, onSave, saving, subjects, teachers, colorMap, defaultDay }) {
  const [form, setForm] = useState({
    day:          period?.day          || defaultDay || 'Monday',
    periodNumber: period?.periodNumber || 1,
    startTime:    period?.startTime    || '09:00',
    endTime:      period?.endTime      || '09:45',
    subject:      period?.subject?._id || period?.subject || '',
    teacher:      period?.teacher?._id || period?.teacher || '',
    type:         period?.type         || 'lecture',
    room:         period?.room         || '',
  });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const INP = { width:'100%', padding:'8px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:4, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
  const selSub = subjects.find(s=>s._id===form.subject);
  const subColor = selSub ? (colorMap[selSub._id]||'#1D4ED8') : '#E5E7EB';

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.4)' }}/>
      <div style={{ position:'relative', background:'#fff', borderRadius:16, width:'100%', maxWidth:520, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 20px 60px rgba(0,0,0,0.15)' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center', flexShrink:0 }}>
          <h3 style={{ fontSize:17, fontWeight:700, color:'#111827', margin:0 }}>
            {period?._periodId ? '✎ Edit Period' : '+ Add Period'}
          </h3>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16, color:'#6B7280' }}>×</button>
        </div>
        <div style={{ padding:'20px 24px', overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={LBL}>Day</label>
              <select value={form.day} onChange={e=>set('day',e.target.value)} style={INP}>
                {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Period #</label>
              <input type="number" min={1} max={10} value={form.periodNumber} onChange={e=>set('periodNumber',+e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Start Time</label>
              <input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>End Time</label>
              <input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} style={INP}/>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Subject</label>
              <select value={form.subject} onChange={e=>set('subject',e.target.value)} style={{ ...INP, borderColor:form.subject?subColor:'#E5E7EB' }}>
                <option value="">— Select Subject —</option>
                {subjects.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Teacher</label>
              <select value={form.teacher} onChange={e=>set('teacher',e.target.value)} style={INP}>
                <option value="">— Select Teacher —</option>
                {teachers.map(t=><option key={t._id} value={t._id}>{t.user?.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Type</label>
              <select value={form.type} onChange={e=>set('type',e.target.value)} style={INP}>
                {TYPES.map(t=><option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Room</label>
              <input value={form.room} onChange={e=>set('room',e.target.value)} placeholder="e.g. A101" style={INP}/>
            </div>
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:10, flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'8px 18px', borderRadius:8, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer', color:'#374151' }}>Cancel</button>
          <button onClick={()=>onSave(form)} disabled={saving} style={{ padding:'8px 22px', borderRadius:8, fontSize:13, fontWeight:700, background:saving?'#9CA3AF':'#1D4ED8', color:'#fff', border:'none', cursor:saving?'not-allowed':'pointer' }}>
            {saving ? '⏳ Saving…' : period?._periodId ? 'Update' : 'Add Period'}
          </button>
        </div>
      </div>
    </div>
  );
}

// ── Grid Cell ─────────────────────────────────────────────────────────────────
function GridCell({ period, canEdit, onEdit, onDelete, onAdd, day, periodNum, colorMap }) {
  const isFree = !period || ['break','lunch','free','assembly'].includes(period.type);
  const typeStyle = {
    break:    { bg:'#FEF3C7', color:'#92400E', label:'Break' },
    lunch:    { bg:'#D1FAE5', color:'#065F46', label:'Lunch' },
    free:     { bg:'#F3F4F6', color:'#9CA3AF', label:'Free' },
    assembly: { bg:'#EDE9FE', color:'#5B21B6', label:'Assembly' },
  };

  if (!period) {
    return (
      <div style={{ minHeight:72, display:'flex', alignItems:'center', justifyContent:'center', padding:6 }}>
        {canEdit ? (
          <button onClick={()=>onAdd(day, periodNum)} style={{
            width:28, height:28, borderRadius:8, border:'1.5px dashed #D1D5DB',
            background:'transparent', cursor:'pointer', color:'#9CA3AF', fontSize:18, display:'flex', alignItems:'center', justifyContent:'center',
          }}>+</button>
        ) : (
          <span style={{ fontSize:10, color:'#D1D5DB' }}>—</span>
        )}
      </div>
    );
  }

  if (isFree) {
    const ts = typeStyle[period.type] || { bg:'#F3F4F6', color:'#9CA3AF', label:'Free' };
    return (
      <div style={{ minHeight:72, display:'flex', alignItems:'center', justifyContent:'center', background:ts.bg, padding:6 }}>
        <span style={{ fontSize:11, fontWeight:700, color:ts.color }}>{ts.label}</span>
        {canEdit && (
          <button onClick={()=>onDelete(period)} style={{ position:'absolute', top:4, right:4, width:16, height:16, borderRadius:4, border:'none', background:'rgba(0,0,0,0.1)', cursor:'pointer', fontSize:10, color:ts.color, display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        )}
      </div>
    );
  }

  const color = colorMap[period.subject?._id || period.subject] || '#6B7280';
  const subjName = period.subject?.name || '—';
  const teacherName = period.teacher?.user?.name || '';

  return (
    <div onClick={canEdit ? ()=>onEdit(day, period) : undefined}
      style={{
        minHeight:72, padding:'7px 8px', borderLeft:`3px solid ${color}`,
        background:`${color}12`, cursor:canEdit?'pointer':'default',
        position:'relative', transition:'background 0.1s',
      }}
      onMouseEnter={e=>{ if(canEdit) e.currentTarget.style.background=`${color}22`; }}
      onMouseLeave={e=>{ e.currentTarget.style.background=`${color}12`; }}>
      <div style={{ fontSize:12, fontWeight:700, color, lineHeight:1.3, marginBottom:3 }}>{subjName}</div>
      {teacherName && <div style={{ fontSize:10, color:'#6B7280' }}>{teacherName}</div>}
      {period.room && <div style={{ fontSize:9, color:'#9CA3AF', marginTop:1 }}>{period.room}</div>}
      {canEdit && (
        <button onClick={e=>{ e.stopPropagation(); onDelete(period); }}
          style={{ position:'absolute', top:3, right:3, width:16, height:16, borderRadius:4, border:'none', background:'rgba(220,38,38,0.12)', cursor:'pointer', fontSize:10, color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center', opacity:0 }}
          onMouseEnter={e=>e.currentTarget.style.opacity=1}
          onMouseLeave={e=>e.currentTarget.style.opacity=0}
          className="del-btn">×</button>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function Timetable() {
  const { isAdmin } = useAuth();
  const canEdit = isAdmin;

  const [classes,   setClasses]   = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [teachers,  setTeachers]  = useState([]);
  const [classId,   setClassId]   = useState('');
  const [timetable, setTimetable] = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [colorMap,  setColorMap]  = useState({});
  const [modal,     setModal]     = useState(null); // { period?, day?, periodNum? }
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    Promise.all([
      classAPI.getAll(),
      subjectAPI.getAll(),
      isAdmin ? teacherAPI.getAll() : Promise.resolve({ data:{ data:[] } }),
    ]).then(([cRes, sRes, tRes]) => {
      setClasses(cRes.data.data || []);
      setSubjects(sRes.data.data || []);
      setTeachers(tRes.data.data || []);
      setColorMap(buildColorMap(sRes.data.data || []));
    }).catch(()=>{});
  }, [isAdmin]);

  useEffect(() => {
    if (classes.length && !classId) setClassId(classes[0]._id);
  }, [classes]);

  const loadTimetable = useCallback(async () => {
    if (!classId) return;
    setLoading(true);
    try {
      const r = await timetableAPI.getClass(classId);
      setTimetable(r.data.data || null);
    } catch (err) {
      if (err.response?.status === 404) setTimetable(null);
      else toast.error('Failed to load timetable');
    } finally { setLoading(false); }
  }, [classId]);

  useEffect(() => { loadTimetable(); }, [loadTimetable]);

  const grid       = buildGrid(timetable);
  const periodNums = getPeriodNumbers(timetable);

  // Get start/end times per period number (from any day)
  const periodTimes = {};
  if (timetable?.schedule) {
    timetable.schedule.forEach(ds => {
      (ds.periods||[]).forEach(p => {
        if (!periodTimes[p.periodNumber]) {
          periodTimes[p.periodNumber] = { start: p.startTime, end: p.endTime };
        }
      });
    });
  }

  const handleSavePeriod = async (form) => {
    if (!form.startTime || !form.endTime) return toast.error('Start and end time required');
    setSaving(true);
    try {
      let schedule = timetable?.schedule
        ? JSON.parse(JSON.stringify(timetable.schedule))
        : [];

      const newPeriod = {
        periodNumber: form.periodNumber,
        startTime:    form.startTime,
        endTime:      form.endTime,
        subject:      form.subject || null,
        teacher:      form.teacher || null,
        type:         form.type,
        room:         form.room,
      };

      const editing = modal?.period?._periodId;

      if (editing && modal.period.day !== form.day) {
        const oldD = schedule.find(d=>d.day===modal.period.day);
        if (oldD) oldD.periods = oldD.periods.filter(p=>p._id?.toString()!==editing?.toString());
      }

      let dayDoc = schedule.find(d=>d.day===form.day);
      if (!dayDoc) { dayDoc = { day:form.day, periods:[] }; schedule.push(dayDoc); }

      if (editing && modal.period.day === form.day) {
        const idx = dayDoc.periods.findIndex(p=>p._id?.toString()===editing?.toString());
        if (idx>=0) dayDoc.periods[idx] = { ...dayDoc.periods[idx], ...newPeriod };
        else dayDoc.periods.push(newPeriod);
      } else {
        dayDoc.periods.push(newPeriod);
      }

      if (timetable?._id) {
        await timetableAPI.update(timetable._id, { schedule });
        toast.success(editing ? 'Period updated!' : 'Period added!');
      } else {
        await timetableAPI.create({ class:classId, schedule, label:'Main Timetable', isActive:true });
        toast.success('Timetable created!');
      }
      setModal(null);
      loadTimetable();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const handleDelete = async (day, period) => {
    if (!window.confirm(`Delete ${period.subject?.name||period.type} on ${day}?`)) return;
    try {
      const schedule = JSON.parse(JSON.stringify(timetable.schedule));
      const dayDoc   = schedule.find(d=>d.day===day);
      if (dayDoc) dayDoc.periods = dayDoc.periods.filter(p=>p._id?.toString()!==period._id?.toString());
      await timetableAPI.update(timetable._id, { schedule });
      toast.success('Period deleted');
      loadTimetable();
    } catch { toast.error('Failed to delete'); }
  };

  const selectedClass = classes.find(c=>c._id===classId);
  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, background:'#fff', outline:'none' };

  // Today strip
  const todayPeriods = DAYS.includes(TODAY)
    ? (periodNums.map(pn => grid[TODAY]?.[pn]).filter(p=>p&&p.subject)).slice(0,6)
    : [];

  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">🗓 Timetable</h2>
          <p className="text-sm text-muted mt-0.5">
            {selectedClass ? `${selectedClass.name} ${selectedClass.section||''}` : ''}
            {' '} · Weekly schedule
          </p>
        </div>
        {canEdit && (
          <button onClick={()=>setModal({ period:null, day:'Monday', periodNum:1 })}
            style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
            + Add Period
          </button>
        )}
      </div>

      {/* Class selector */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <select value={classId} onChange={e=>{ setClassId(e.target.value); }} style={SEL}>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {classes.map(c=>(
            <button key={c._id} onClick={()=>setClassId(c._id)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${classId===c._id?'#1D4ED8':'#E5E7EB'}`,
              background:classId===c._id?'#EFF6FF':'#fff',
              color:classId===c._id?'#1D4ED8':'#6B7280',
            }}>{c.name} {c.section||''}</button>
          ))}
        </div>
      </div>

      {/* Today strip */}
      {todayPeriods.length > 0 && (
        <div style={{ background:'#0B1F4A', borderRadius:14, padding:'14px 20px', marginBottom:16 }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>
            Today — {TODAY} · {todayPeriods.length} classes
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {todayPeriods.map((p,i)=>{
              const color = colorMap[p.subject?._id] || '#9CA3AF';
              return (
                <div key={i} style={{ background:`${color}22`, border:`1px solid ${color}50`, borderRadius:10, padding:'8px 14px', minWidth:110 }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700 }}>P{p.periodNumber} · {fmt12(p.startTime)}</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#fff', marginTop:2 }}>{p.subject?.name||'—'}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Grid */}
      {loading ? <LoadingState /> : !timetable && !canEdit ? (
        <EmptyState icon="🗓" title="No timetable set" subtitle="Admin hasn't configured the timetable yet"/>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', minWidth:700 }}>
              {/* Header row — days as columns */}
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  <th style={{ padding:'12px 14px', textAlign:'center', color:'#94afd4', fontSize:10, fontWeight:700, textTransform:'uppercase', width:72, borderRight:'1px solid rgba(255,255,255,0.08)' }}>
                    Period
                  </th>
                  {DAYS.map(d => {
                    const isToday = d === TODAY;
                    return (
                      <th key={d} style={{
                        padding:'12px 10px', textAlign:'center', fontSize:11, fontWeight:700,
                        color: isToday ? '#FFD700' : '#c8d8ef',
                        borderRight:'1px solid rgba(255,255,255,0.08)',
                        borderTop: isToday ? '2px solid #FFD700' : 'none',
                        minWidth:110,
                      }}>
                        {DAY_SHORT[d]}
                        {isToday && <div style={{ fontSize:8, color:'#FFD700', fontWeight:500, marginTop:2 }}>TODAY</div>}
                      </th>
                    );
                  })}
                </tr>
              </thead>

              {/* Body rows — periods */}
              <tbody>
                {(periodNums.length ? periodNums : [1,2,3,4,5,6,7,8]).map(pn => {
                  const times = periodTimes[pn];
                  return (
                    <tr key={pn} style={{ borderBottom:'0.5px solid #F3F4F6' }}>
                      {/* Period label cell */}
                      <td style={{ padding:'8px 6px', textAlign:'center', background:'#F8FAFC', borderRight:'0.5px solid #E5E7EB', verticalAlign:'middle' }}>
                        <div style={{ width:30, height:30, borderRadius:8, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 3px' }}>
                          <span style={{ fontSize:12, fontWeight:700, color:'#fff' }}>P{pn}</span>
                        </div>
                        {times && <>
                          <div style={{ fontSize:9, color:'#9CA3AF' }}>{fmt12(times.start)}</div>
                          <div style={{ fontSize:9, color:'#9CA3AF' }}>{fmt12(times.end)}</div>
                        </>}
                      </td>

                      {/* Day cells */}
                      {DAYS.map(d => {
                        const isToday = d === TODAY;
                        const period  = grid[d]?.[pn];
                        return (
                          <td key={d} style={{
                            borderRight:'0.5px solid #F3F4F6', verticalAlign:'top',
                            background: isToday ? '#FFFBEB' : 'transparent',
                            position:'relative',
                          }}>
                            {d === 'Sunday' ? (
                              <div style={{ minHeight:72, display:'flex', alignItems:'center', justifyContent:'center', background:'#F9FAFB' }}>
                                <span style={{ fontSize:10, color:'#D1D5DB' }}>Holiday</span>
                              </div>
                            ) : (
                              <GridCell
                                period={period}
                                canEdit={canEdit}
                                onEdit={(day, p) => setModal({ period:{ ...p, _periodId:p._id, day }, day })}
                                onDelete={(p) => handleDelete(d, p)}
                                onAdd={(day, pNum) => setModal({ period:null, day, periodNum:pNum })}
                                day={d}
                                periodNum={pn}
                                colorMap={colorMap}
                              />
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}

                {/* Add row button for admin */}
                {canEdit && (
                  <tr>
                    <td colSpan={8} style={{ padding:'10px 14px', background:'#FAFAFA', borderTop:'0.5px solid #E5E7EB' }}>
                      <button onClick={()=>setModal({ period:null, day:'Monday', periodNum:(periodNums[periodNums.length-1]||8)+1 })}
                        style={{ fontSize:12, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1.5px dashed #22C55E', padding:'6px 16px', borderRadius:8, cursor:'pointer' }}>
                        + Add Period
                      </button>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Legend */}
          {subjects.length > 0 && (
            <div style={{ padding:'12px 16px', borderTop:'0.5px solid #E5E7EB', display:'flex', gap:12, flexWrap:'wrap', background:'#FAFAFA' }}>
              {subjects.slice(0,8).map(s=>(
                <div key={s._id} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:colorMap[s._id]||'#6B7280' }}/>
                  <span style={{ fontSize:11, color:'#6B7280' }}>{s.name}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Period modal */}
      {modal !== null && (
        <PeriodModal
          period={modal.period}
          defaultDay={modal.day}
          onClose={()=>setModal(null)}
          onSave={handleSavePeriod}
          saving={saving}
          subjects={subjects}
          teachers={teachers}
          colorMap={colorMap}
        />
      )}
    </div>
  );
}