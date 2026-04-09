// frontend/src/pages/Timetable.js
// Simple timetable: 2 main columns — Subject | Day & Time
// Admin: full CRUD · Teacher/Student/Parent: read-only

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { timetableAPI, classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { LoadingState, EmptyState, Modal } from '../components/ui';

const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const DAY_COLORS = {
  Monday:'#D4522A', Tuesday:'#C9A84C', Wednesday:'#4A7C59',
  Thursday:'#7C6AF5', Friday:'#2D9CDB', Saturday:'#F2994A',
};
const SUBJECT_COLORS = [
  '#3B82F6','#10B981','#F97316','#8B5CF6','#EF4444',
  '#06B6D4','#F59E0B','#EC4899','#6366F1','#14B8A6',
];
const TYPES = ['lecture','lab','break','lunch','free','assembly'];
const TYPE_LABELS = {
  lecture:'📚 Lecture', lab:'🔬 Lab', break:'☕ Break',
  lunch:'🍽 Lunch', free:'— Free', assembly:'🎓 Assembly',
};
const TODAY = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'][new Date().getDay()];

const fmt12 = t => {
  if (!t) return '—';
  const [h,m] = t.split(':');
  const hh = +h;
  return `${hh>12?hh-12:hh||12}:${m} ${hh>=12?'PM':'AM'}`;
};

function buildColorMap(subjects) {
  const map = {};
  subjects.forEach((s,i) => { map[s._id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
  return map;
}

// Flatten timetable doc → array of period rows sorted by day then period
function flattenTimetable(tt) {
  if (!tt?.schedule) return [];
  const rows = [];
  tt.schedule.forEach(ds => {
    (ds.periods||[]).forEach(p => {
      rows.push({
        day:          ds.day,
        periodNumber: p.periodNumber,
        startTime:    p.startTime,
        endTime:      p.endTime,
        subject:      p.subject,
        teacher:      p.teacher,
        type:         p.type || 'lecture',
        room:         p.room || '',
        _periodId:    p._id,
      });
    });
  });
  return rows.sort((a,b) => {
    const di = DAYS.indexOf(a.day) - DAYS.indexOf(b.day);
    return di !== 0 ? di : a.periodNumber - b.periodNumber;
  });
}

// ── Period add/edit modal ─────────────────────────────────────────────────────
function PeriodModal({ period, onClose, onSave, saving, subjects, teachers, colorMap }) {
  const [form, setForm] = useState({
    day:          period?.day          || 'Monday',
    periodNumber: period?.periodNumber || 1,
    startTime:    period?.startTime    || '09:00',
    endTime:      period?.endTime      || '09:45',
    subject:      period?.subject?._id || period?.subject || '',
    teacher:      period?.teacher?._id || period?.teacher || '',
    type:         period?.type         || 'lecture',
    room:         period?.room         || '',
  });
  const set = (k,v) => setForm(p=>({...p,[k]:v}));
  const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
  const selSub   = subjects.find(s=>s._id===form.subject);
  const subColor = selSub ? (colorMap[selSub._id]||'#1D4ED8') : '#E5E7EB';

  return (
    <Modal isOpen onClose={onClose}
      title={period?._periodId ? '✎ Edit Period' : '+ Add Period'} size="sm"
      footer={<>
        <button onClick={onClose} className="btn-secondary">Cancel</button>
        <button onClick={()=>onSave(form)} disabled={saving} className="btn-primary"
          style={{ background:'#1D4ED8', borderColor:'#1D4ED8' }}>
          {saving ? '⏳ Saving…' : period?._periodId ? 'Update' : 'Add Period'}
        </button>
      </>}>
      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        <div>
          <label style={LBL}>Day *</label>
          <select value={form.day} onChange={e=>set('day',e.target.value)} style={INP}>
            {DAYS.map(d=><option key={d} value={d}>{d}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Period #</label>
          <input type="number" min={1} max={10} value={form.periodNumber}
            onChange={e=>set('periodNumber',+e.target.value)} style={INP}/>
        </div>
        <div>
          <label style={LBL}>Start Time *</label>
          <input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} style={INP}/>
        </div>
        <div>
          <label style={LBL}>End Time *</label>
          <input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} style={INP}/>
        </div>
        <div style={{ gridColumn:'1/-1' }}>
          <label style={LBL}>Subject</label>
          <select value={form.subject} onChange={e=>set('subject',e.target.value)}
            style={{ ...INP, borderColor: form.subject?subColor:'#E5E7EB' }}>
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
    </Modal>
  );
}

// ── Main timetable table ──────────────────────────────────────────────────────
function TimetableTable({ rows, colorMap, canEdit, onAdd, onEdit, onDelete, activeDay, setActiveDay }) {
  const filtered = activeDay === 'All' ? rows : rows.filter(r=>r.day===activeDay);

  if (!rows.length) return (
    <EmptyState icon="🗓" title="No timetable yet"
      subtitle={canEdit ? "Click '+ Add Period' to start building" : "No timetable set for this class yet"} />
  );

  return (
    <div>
      {/* Day filter */}
      <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:16 }}>
        {['All',...DAYS].map(d=>{
          const active  = activeDay===d;
          const isToday = d===TODAY;
          return (
            <button key={d} onClick={()=>setActiveDay(d)} style={{
              padding:'6px 16px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', position:'relative',
              border:`1.5px solid ${active?(DAY_COLORS[d]||'#1D4ED8'):'#E5E7EB'}`,
              background: active?`${DAY_COLORS[d]||'#1D4ED8'}18`:'#fff',
              color: active?(DAY_COLORS[d]||'#1D4ED8'):'#6B7280',
            }}>
              {d}
              {isToday&&d!=='All'&&<span style={{ position:'absolute',top:-3,right:-3,width:8,height:8,borderRadius:'50%',background:'#EF4444',border:'2px solid #fff' }}/>}
            </button>
          );
        })}
      </div>

      <div className="card" style={{ padding:0, overflow:'hidden' }}>
        <div style={{ overflowX:'auto' }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
            <thead>
              <tr style={{ background:'#0B1F4A' }}>
                {[
                  { label:'Day',         w:100 },
                  { label:'Period',      w:60  },
                  { label:'Subject',     w:null },
                  { label:'Day & Time',  w:180 },
                  { label:'Teacher',     w:160 },
                  { label:'Room',        w:80  },
                  ...(canEdit?[{ label:'Actions', w:110 }]:[]),
                ].map(h=>(
                  <th key={h.label} style={{
                    padding:'11px 16px', textAlign: h.label==='Actions'?'right':'left',
                    color:'#E2E8F0', fontSize:11, fontWeight:700,
                    textTransform:'uppercase', letterSpacing:'0.05em',
                    whiteSpace:'nowrap', width:h.w||undefined,
                  }}>{h.label}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {filtered.map((row,i)=>{
                const color   = colorMap[row.subject?._id||row.subject] || '#9CA3AF';
                const isFree  = ['break','lunch','free','assembly'].includes(row.type);
                const isToday = row.day===TODAY;
                const typeBg  = { break:'#FEF3C7', lunch:'#D1FAE5', free:'#F3F4F6', assembly:'#EDE9FE' };
                const typeC   = { break:'#92400E', lunch:'#065F46', free:'#6B7280', assembly:'#5B21B6' };

                return (
                  <tr key={`${row.day}-${row.periodNumber}-${i}`}
                    style={{ borderBottom:'1px solid #F3F4F6', background:isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff', transition:'background 0.1s' }}
                    onMouseEnter={e=>e.currentTarget.style.background=isToday?'#FEF3C7':'#F0F7FF'}
                    onMouseLeave={e=>e.currentTarget.style.background=isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff'}
                  >
                    {/* Day */}
                    <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                      <span style={{
                        fontSize:11, fontWeight:800,
                        color:DAY_COLORS[row.day]||'#374151',
                        background:`${DAY_COLORS[row.day]||'#374151'}15`,
                        padding:'3px 10px', borderRadius:20,
                      }}>
                        {row.day.slice(0,3).toUpperCase()}
                        {isToday&&<span style={{ marginLeft:4,fontSize:9,color:'#DC2626' }}>●</span>}
                      </span>
                    </td>

                    {/* Period # */}
                    <td style={{ padding:'12px 16px' }}>
                      <div style={{
                        width:28, height:28, borderRadius:8,
                        background:`${isFree?'#9CA3AF':color}20`,
                        display:'flex', alignItems:'center', justifyContent:'center',
                        fontWeight:800, fontSize:12, color:isFree?'#9CA3AF':color,
                      }}>{row.periodNumber}</div>
                    </td>

                    {/* Subject — the primary column */}
                    <td style={{ padding:'12px 16px' }}>
                      {isFree ? (
                        <span style={{
                          fontSize:12, fontWeight:700,
                          color:typeC[row.type]||'#6B7280',
                          background:typeBg[row.type]||'#F3F4F6',
                          padding:'5px 14px', borderRadius:20,
                        }}>{TYPE_LABELS[row.type]}</span>
                      ) : (
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:4, height:40, borderRadius:2, background:color, flexShrink:0 }}/>
                          <div>
                            <div style={{ fontWeight:800, fontSize:15, color:'#111827' }}>
                              {row.subject?.name || '—'}
                            </div>
                            {row.subject?.code&&<div style={{ fontSize:11, color:'#9CA3AF' }}>{row.subject.code}</div>}
                          </div>
                        </div>
                      )}
                    </td>

                    {/* Day & Time — the secondary column */}
                    <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                      <div style={{ fontWeight:700, fontSize:13, color:`${DAY_COLORS[row.day]}` }}>
                        📅 {row.day}
                      </div>
                      <div style={{ fontSize:12, color:'#6B7280', marginTop:3, display:'flex', alignItems:'center', gap:4 }}>
                        ⏰ <span style={{ fontWeight:600 }}>{fmt12(row.startTime)}</span>
                        <span style={{ color:'#D1D5DB' }}>–</span>
                        <span style={{ fontWeight:600 }}>{fmt12(row.endTime)}</span>
                      </div>
                    </td>

                    {/* Teacher */}
                    <td style={{ padding:'12px 16px', color:'#374151', fontSize:13 }}>
                      {row.teacher?.user?.name || '—'}
                    </td>

                    {/* Room */}
                    <td style={{ padding:'12px 16px', color:'#9CA3AF', fontSize:12 }}>
                      {row.room || '—'}
                    </td>

                    {/* Actions (admin only) */}
                    {canEdit&&(
                      <td style={{ padding:'12px 16px', textAlign:'right' }}>
                        <div style={{ display:'flex', gap:5, justifyContent:'flex-end' }}>
                          <button onClick={()=>onEdit(row)}
                            style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 10px', borderRadius:6, cursor:'pointer' }}>
                            ✎ Edit
                          </button>
                          <button onClick={()=>onDelete(row)}
                            style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'5px 10px', borderRadius:6, cursor:'pointer' }}>
                            ✕
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {canEdit&&(
          <div style={{ padding:'12px 16px', borderTop:'1px solid #E5E7EB', background:'#FAFAFA' }}>
            <button onClick={onAdd} style={{
              fontSize:12, fontWeight:700, color:'#16A34A', background:'#F0FDF4',
              border:'1.5px dashed #22C55E', padding:'7px 16px', borderRadius:8, cursor:'pointer',
            }}>+ Add Period</button>
          </div>
        )}
      </div>
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
  const [activeDay, setActiveDay] = useState('All');
  const [modal,     setModal]     = useState(null);
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

  const rows = flattenTimetable(timetable);

  const handleSavePeriod = async (form) => {
    if (!form.startTime || !form.endTime) return toast.error('Start and end time required');
    if (!form.subject && !['break','lunch','free','assembly'].includes(form.type))
      return toast.error('Select a subject');
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

      if (editing) {
        // Remove from old day if day changed
        if (modal.period.day !== form.day) {
          const oldD = schedule.find(d=>d.day===modal.period.day);
          if (oldD) oldD.periods = oldD.periods.filter(p=>p._id?.toString()!==editing?.toString());
        }
        // Update in new day
        let dayDoc = schedule.find(d=>d.day===form.day);
        if (!dayDoc) { dayDoc={day:form.day,periods:[]}; schedule.push(dayDoc); }
        const idx = dayDoc.periods.findIndex(p=>p._id?.toString()===editing?.toString());
        if (modal.period.day===form.day && idx>=0) {
          dayDoc.periods[idx] = { ...dayDoc.periods[idx], ...newPeriod };
        } else {
          dayDoc.periods.push(newPeriod);
        }
      } else {
        let dayDoc = schedule.find(d=>d.day===form.day);
        if (!dayDoc) { dayDoc={day:form.day,periods:[]}; schedule.push(dayDoc); }
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

  const handleDelete = async (row) => {
    if (!window.confirm(`Delete ${row.subject?.name||row.type} on ${row.day} Period ${row.periodNumber}?`)) return;
    try {
      const schedule = JSON.parse(JSON.stringify(timetable.schedule));
      const dayDoc   = schedule.find(d=>d.day===row.day);
      if (dayDoc) dayDoc.periods = dayDoc.periods.filter(p=>p._id?.toString()!==row._periodId?.toString());
      await timetableAPI.update(timetable._id, { schedule });
      toast.success('Period deleted');
      loadTimetable();
    } catch { toast.error('Failed to delete'); }
  };

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };
  const todayRows     = rows.filter(r=>r.day===TODAY);
  const subjectCount  = [...new Set(rows.filter(r=>r.subject).map(r=>r.subject?._id||r.subject))].length;
  const selectedClass = classes.find(c=>c._id===classId);

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom:20 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">🗓 Timetable</h2>
          <p className="text-sm text-muted mt-0.5">
            {selectedClass?`${selectedClass.name} ${selectedClass.section||''}`:''} · {rows.length} periods · {subjectCount} subjects
          </p>
        </div>
        {canEdit&&(
          <button onClick={()=>setModal({ period:null })}
            style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
            + Add Period
          </button>
        )}
      </div>

      {/* Class selector */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', alignItems:'flex-end', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:5, textTransform:'uppercase' }}>Class</div>
          <select value={classId} onChange={e=>{ setClassId(e.target.value); setActiveDay('All'); }} style={SEL}>
            {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {classes.map(c=>(
            <button key={c._id} onClick={()=>{ setClassId(c._id); setActiveDay('All'); }} style={{
              padding:'7px 16px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${classId===c._id?'#1D4ED8':'#E5E7EB'}`,
              background: classId===c._id?'#EFF6FF':'#fff',
              color: classId===c._id?'#1D4ED8':'#6B7280',
            }}>{c.name} {c.section||''}</button>
          ))}
        </div>
      </div>

      {/* Today's strip */}
      {todayRows.length>0&&(
        <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:14, padding:'14px 20px', marginBottom:18 }}>
          <div style={{ fontSize:11, color:'rgba(255,255,255,0.4)', fontWeight:700, textTransform:'uppercase', letterSpacing:'1px', marginBottom:10 }}>
            📅 Today — {TODAY} · {todayRows.filter(r=>!['break','lunch','free'].includes(r.type)).length} classes
          </div>
          <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
            {todayRows.map((row,i)=>{
              const color = colorMap[row.subject?._id] || '#9CA3AF';
              const isFree= ['break','lunch','free'].includes(row.type);
              return (
                <div key={i} style={{
                  background:isFree?'rgba(255,255,255,0.05)':`${color}22`,
                  border:`1px solid ${isFree?'rgba(255,255,255,0.08)':`${color}50`}`,
                  borderRadius:10, padding:'8px 14px', minWidth:110,
                }}>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.45)', fontWeight:700 }}>
                    P{row.periodNumber} · {fmt12(row.startTime)}
                  </div>
                  <div style={{ fontSize:13, fontWeight:800, color:isFree?'rgba(255,255,255,0.25)':'#fff', marginTop:2 }}>
                    {isFree?TYPE_LABELS[row.type]:(row.subject?.name||'—')}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : (
        <TimetableTable
          rows={rows}
          colorMap={colorMap}
          canEdit={canEdit}
          onAdd={()=>setModal({ period:null })}
          onEdit={row=>setModal({ period:row })}
          onDelete={handleDelete}
          activeDay={activeDay}
          setActiveDay={setActiveDay}
        />
      )}

      {modal!==null&&(
        <PeriodModal
          period={modal.period}
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