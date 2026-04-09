// frontend/src/pages/Exams.js
// Tabs: All Exams | Recent Exams | Exam Timetable
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { examAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const TYPE_COLORS = {
  unit:       { bg:'#FEF3C7', color:'#92400E', border:'#F59E0B' },
  midterm:    { bg:'#FEE2E2', color:'#991B1B', border:'#EF4444' },
  final:      { bg:'#EDE9FE', color:'#5B21B6', border:'#8B5CF6' },
  practical:  { bg:'#D1FAE5', color:'#065F46', border:'#10B981' },
  assignment: { bg:'#DBEAFE', color:'#1E40AF', border:'#3B82F6' },
};
const TYPE_LIST = ['unit','midterm','final','practical','assignment'];
const SUBJECTS_ICON = ['📐','📖','🔬','📜','🎨','🌍','💻','🏃','🎵','📊'];
const FORM_EMPTY = { name:'', class:'', subject:'', examType:'unit', date:'', startTime:'', endTime:'', totalMarks:100, passingMarks:35, instructions:'' };

const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
const daysUntil = (d) => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

// ── Exam card ─────────────────────────────────────────────────────────────────
function ExamCard({ exam, onEdit, onDelete, canEdit }) {
  const d    = exam.date ? new Date(exam.date) : null;
  const past = d && d < new Date();
  const diff = daysUntil(exam.date);
  const tc   = TYPE_COLORS[exam.examType] || TYPE_COLORS.unit;

  const urgency = !past && diff !== null
    ? diff <= 0 ? { bg:'#FEF2F2', color:'#DC2626', text:'Today!' }
    : diff <= 3 ? { bg:'#FEF2F2', color:'#DC2626', text:`In ${diff}d` }
    : diff <= 7 ? { bg:'#FFFBEB', color:'#D97706', text:`In ${diff}d` }
    : { bg:'#F0FDF4', color:'#16A34A', text:`In ${diff}d` }
    : null;

  return (
    <div style={{
      background:'#fff', borderRadius:14,
      border:`1px solid #E5E7EB`,
      borderLeft:`4px solid ${tc.border}`,
      padding:'16px 20px',
      display:'flex', alignItems:'center', gap:16, flexWrap:'wrap',
      transition:'all 0.15s',
      boxShadow:'0 1px 4px rgba(0,0,0,0.04)',
    }}
      onMouseEnter={e=>e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.08)'}
      onMouseLeave={e=>e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.04)'}
    >
      {/* Date box */}
      <div style={{ width:54, height:54, borderRadius:12, background:'#F8FAFC', border:'1px solid #E5E7EB', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#111827', lineHeight:1 }}>{d?.getDate() || '—'}</div>
        <div style={{ fontSize:10, color:'#6B7280', textTransform:'uppercase', fontWeight:700 }}>{d?.toLocaleString('default',{month:'short'})||''}</div>
      </div>

      {/* Info */}
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:5 }}>
          <span style={{ fontWeight:700, fontSize:15, color:'#111827' }}>{exam.name}</span>
          <span style={{ fontSize:11, fontWeight:700, color:tc.color, background:tc.bg, border:`1px solid ${tc.border}50`, padding:'2px 8px', borderRadius:20 }}>
            {exam.examType}
          </span>
          {past && <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:20 }}>Done</span>}
          {exam.isPublished && <span style={{ fontSize:11, fontWeight:700, color:'#16A34A', background:'#F0FDF4', padding:'2px 8px', borderRadius:20 }}>✅ Published</span>}
        </div>
        <div style={{ fontSize:13, color:'#6B7280' }}>
          {exam.class?.name} {exam.class?.section||''} &nbsp;·&nbsp; {exam.subject?.name||'—'}
          {exam.startTime && <span> &nbsp;·&nbsp; ⏰ {exam.startTime}{exam.endTime?` – ${exam.endTime}`:''}</span>}
        </div>
        {exam.instructions && <div style={{ fontSize:12, color:'#9CA3AF', marginTop:3, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>📝 {exam.instructions}</div>}
      </div>

      {/* Marks */}
      <div style={{ textAlign:'center', minWidth:60 }}>
        <div style={{ fontSize:26, fontWeight:900, color:'#111827', lineHeight:1 }}>{exam.totalMarks}</div>
        <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:600 }}>Total</div>
        <div style={{ fontSize:11, fontWeight:700, color:'#16A34A' }}>Pass: {exam.passingMarks}</div>
      </div>

      {/* Urgency badge */}
      {urgency && (
        <span style={{ fontSize:12, fontWeight:800, color:urgency.color, background:urgency.bg, padding:'5px 12px', borderRadius:20, flexShrink:0 }}>
          {urgency.text}
        </span>
      )}

      {/* Actions */}
      {canEdit && (
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={()=>onEdit(exam)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#6B7280' }}>✎</button>
          <button onClick={()=>onDelete(exam._id)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', cursor:'pointer', fontSize:14, display:'flex', alignItems:'center', justifyContent:'center', color:'#DC2626' }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ── Exam form modal ───────────────────────────────────────────────────────────
function ExamModal({ form, setForm, onSave, onClose, saving, classes, subjects }) {
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  return (
    <Modal isOpen onClose={onClose} title={form._id ? '✎ Edit Exam' : '+ Create Exam'} size="lg"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={onSave} disabled={saving}>
          {saving ? '⏳ Saving…' : form._id ? 'Update Exam' : 'Create Exam'}
        </button>
      </>}>
      <div className="grid grid-cols-2 gap-4">
        <FormGroup label="Exam Name *" className="col-span-2">
          <input className="form-input" value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Unit Test 1 — April 2026" />
        </FormGroup>
        <FormGroup label="Class *">
          <select className="form-input" value={form.class} onChange={e=>set('class',e.target.value)}>
            <option value="">Select class</option>
            {classes.map(c=><option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Subject">
          <select className="form-input" value={form.subject} onChange={e=>set('subject',e.target.value)}>
            <option value="">Select subject</option>
            {subjects.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Exam Type">
          <select className="form-input" value={form.examType} onChange={e=>set('examType',e.target.value)}>
            {TYPE_LIST.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
          </select>
        </FormGroup>
        <FormGroup label="Date">
          <input type="date" className="form-input" value={form.date} onChange={e=>set('date',e.target.value)} />
        </FormGroup>
        <FormGroup label="Start Time">
          <input type="time" className="form-input" value={form.startTime} onChange={e=>set('startTime',e.target.value)} />
        </FormGroup>
        <FormGroup label="End Time">
          <input type="time" className="form-input" value={form.endTime} onChange={e=>set('endTime',e.target.value)} />
        </FormGroup>
        <FormGroup label="Total Marks">
          <input type="number" className="form-input" value={form.totalMarks} onChange={e=>set('totalMarks',+e.target.value)} />
        </FormGroup>
        <FormGroup label="Passing Marks">
          <input type="number" className="form-input" value={form.passingMarks} onChange={e=>set('passingMarks',+e.target.value)} />
        </FormGroup>
        <FormGroup label="Instructions" className="col-span-2">
          <textarea className="form-input" rows={2} value={form.instructions} onChange={e=>set('instructions',e.target.value)} placeholder="Any special instructions…" style={{resize:'vertical'}} />
        </FormGroup>
      </div>
    </Modal>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: ALL EXAMS
// ══════════════════════════════════════════════════════════════════════════════
function AllExams({ exams, classes, subjects, onEdit, onDelete, onAdd, canEdit, loading }) {
  const [filter, setFilter] = useState('');
  const [classF, setClassF] = useState('');
  const filtered = exams.filter(e =>
    (!filter || e.examType === filter) &&
    (!classF || e.class?._id === classF)
  );
  const upcoming = filtered.filter(e => e.date && new Date(e.date) >= new Date());
  const past     = filtered.filter(e => e.date && new Date(e.date) < new Date());

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {['','unit','midterm','final','practical','assignment'].map(t=>{
            const tc = t ? TYPE_COLORS[t] : null;
            return (
              <button key={t} onClick={()=>setFilter(t)} style={{
                padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
                border:`1.5px solid ${filter===t?(tc?.border||'#374151'):'#E5E7EB'}`,
                background: filter===t ? (tc?.bg||'#111827') : '#fff',
                color: filter===t ? (tc?.color||'#fff') : '#6B7280',
              }}>
                {t ? t.charAt(0).toUpperCase()+t.slice(1) : 'All'}
              </button>
            );
          })}
        </div>
        <select value={classF} onChange={e=>setClassF(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="📝" title="No exams found" subtitle="Try adjusting the filters or create a new exam" />
      ) : (
        <div>
          {upcoming.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ fontSize:13, fontWeight:800, color:'#374151', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10, display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ background:'#FEF3C7', color:'#92400E', padding:'3px 10px', borderRadius:20, fontSize:11 }}>📅 Upcoming — {upcoming.length}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {upcoming.map(e=><ExamCard key={e._id} exam={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit}/>)}
              </div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div style={{ fontSize:13, fontWeight:800, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.5px', marginBottom:10 }}>
                <span style={{ background:'#F3F4F6', color:'#6B7280', padding:'3px 10px', borderRadius:20, fontSize:11 }}>✓ Completed — {past.length}</span>
              </div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {past.map(e=><ExamCard key={e._id} exam={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit}/>)}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: RECENT EXAMS
// ══════════════════════════════════════════════════════════════════════════════
function RecentExams({ exams, canEdit, onEdit, onDelete }) {
  const now     = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);
  const monthAgo= new Date(now - 30*24*60*60*1000);

  const today    = exams.filter(e => e.date && new Date(e.date).toDateString() === now.toDateString());
  const thisWeek = exams.filter(e => { const d=new Date(e.date); return e.date && d>=weekAgo && d.toDateString()!==now.toDateString() && d<=now; });
  const upcoming7= exams.filter(e => { const d=new Date(e.date); const diff=daysUntil(e.date); return e.date && diff!==null && diff>0 && diff<=7; });
  const next30   = exams.filter(e => { const diff=daysUntil(e.date); return e.date && diff!==null && diff>7 && diff<=30; });

  if (!exams.length) return <EmptyState icon="📝" title="No exams found" />;

  const Section = ({ title, items, badge }) => items.length === 0 ? null : (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:800, color:'#374151' }}>{title}</span>
        <span style={{ fontSize:11, fontWeight:700, background:'#F3F4F6', color:'#6B7280', padding:'2px 8px', borderRadius:20 }}>{items.length}</span>
        {badge && <span style={{ fontSize:11, fontWeight:700, background:badge.bg, color:badge.color, padding:'2px 8px', borderRadius:20 }}>{badge.text}</span>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
        {items.map(e=><ExamCard key={e._id} exam={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit}/>)}
      </div>
    </div>
  );

  return (
    <div>
      <Section title="📅 Today" items={today} badge={{ bg:'#FEF2F2', color:'#DC2626', text:'TODAY' }} />
      <Section title="⏰ Next 7 Days" items={upcoming7} badge={{ bg:'#FFFBEB', color:'#D97706', text:'UPCOMING' }} />
      <Section title="📆 Next 30 Days" items={next30} />
      <Section title="✅ This Week (Past)" items={thisWeek} />
      {!today.length && !upcoming7.length && !next30.length && !thisWeek.length && (
        <EmptyState icon="📅" title="No recent or upcoming exams" subtitle="Exams from the last 7 days and next 30 days appear here" />
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: EXAM TIMETABLE — grid: rows=dates, columns=subjects
// ══════════════════════════════════════════════════════════════════════════════
function ExamTimetable({ exams, classes, subjects, canEdit, onEdit, onDelete, onAdd }) {
  const [classF, setClassF] = useState('');

  // Filter by class
  const filtered = exams
    .filter(e => e.date && (!classF || e.class?._id === classF))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  // All unique subjects in filtered exams
  const subjectIds  = [...new Set(filtered.map(e => e.subject?._id).filter(Boolean))];
  const subjectMap  = {};
  filtered.forEach(e => { if(e.subject?._id) subjectMap[e.subject._id] = e.subject; });
  const cols = subjectIds.map(id => subjectMap[id]);

  // All unique dates
  const dates = [...new Set(filtered.map(e => e.date?.split('T')[0]).filter(Boolean))].sort();

  // Build grid: grid[date][subjectId] = exam
  const grid = {};
  filtered.forEach(e => {
    const d = e.date?.split('T')[0];
    const s = e.subject?._id || '__none__';
    if (!grid[d]) grid[d] = {};
    grid[d][s] = e;
  });

  // Exams with no subject — put in a generic column
  const noSubExams = filtered.filter(e => !e.subject?._id);
  const hasNoSub   = noSubExams.length > 0;

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  const TC = TYPE_COLORS;

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <div>
          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', marginBottom:4, textTransform:'uppercase', letterSpacing:'0.05em' }}>Filter by Class</div>
          <select value={classF} onChange={e=>setClassF(e.target.value)} style={SEL}>
            <option value="">All Classes</option>
            {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
          </select>
        </div>
        <div style={{ display:'flex', gap:8, alignItems:'flex-end', paddingBottom:2 }}>
          {classes.map(c => (
            <button key={c._id} onClick={()=>setClassF(f=>f===c._id?'':c._id)} style={{
              padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer',
              border:`1.5px solid ${classF===c._id?'#1D4ED8':'#E5E7EB'}`,
              background: classF===c._id?'#EFF6FF':'#fff',
              color: classF===c._id?'#1D4ED8':'#6B7280',
            }}>{c.name} {c.section||''}</button>
          ))}
        </div>
        <span style={{ fontSize:12, color:'#9CA3AF', marginLeft:'auto' }}>{filtered.length} exams</span>
      </div>

      {!filtered.length ? (
        <EmptyState icon="🗓" title="No exam timetable" subtitle="Create exams with dates to see the timetable" />
      ) : (
        <div>
          {/* ── Grid timetable ── */}
          <div className="card" style={{ padding:0, overflow:'hidden', marginBottom:24 }}>
            <div style={{ background:'#0B1F4A', padding:'14px 20px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:700, fontSize:15, color:'#fff' }}>🗓 Exam Timetable</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.45)' }}>
                {dates.length} dates · {cols.length + (hasNoSub?1:0)} subjects
              </div>
            </div>

            <div style={{ overflowX:'auto' }}>
              <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth: Math.max(600, (cols.length + (hasNoSub?1:0)) * 180 + 160) }}>
                <thead>
                  {/* Subject header row */}
                  <tr style={{ background:'#162D6A', borderBottom:'2px solid #1D4ED8' }}>
                    <th style={{ padding:'12px 16px', textAlign:'left', color:'rgba(255,255,255,0.5)', fontSize:11, fontWeight:700, textTransform:'uppercase', width:140, position:'sticky', left:0, background:'#162D6A', zIndex:2 }}>
                      Date / Subject
                    </th>
                    {cols.map(sub => (
                      <th key={sub._id} style={{ padding:'12px 16px', textAlign:'center', color:'#fff', fontSize:13, fontWeight:700, minWidth:180, borderLeft:'1px solid rgba(255,255,255,0.08)' }}>
                        <div style={{ fontSize:18, marginBottom:4 }}>{SUBJECTS_ICON[cols.indexOf(sub) % SUBJECTS_ICON.length]}</div>
                        {sub.name}
                        {sub.code && <div style={{ fontSize:10, color:'rgba(255,255,255,0.4)', fontWeight:400 }}>{sub.code}</div>}
                      </th>
                    ))}
                    {hasNoSub && (
                      <th style={{ padding:'12px 16px', textAlign:'center', color:'#fff', fontSize:13, fontWeight:700, minWidth:180, borderLeft:'1px solid rgba(255,255,255,0.08)' }}>
                        📋 General
                      </th>
                    )}
                  </tr>
                </thead>
                <tbody>
                  {dates.map((dateStr, di) => {
                    const dt      = new Date(dateStr);
                    const isToday = dt.toDateString() === new Date().toDateString();
                    const isPast  = dt < new Date() && !isToday;
                    const diff    = Math.ceil((dt - new Date()) / 86400000);

                    return (
                      <tr key={dateStr} style={{
                        borderBottom:'1px solid #F3F4F6',
                        background: isToday ? '#FFFBEB' : di%2 ? '#FAFAFA' : '#fff',
                      }}>
                        {/* Date cell */}
                        <td style={{
                          padding:'14px 16px', verticalAlign:'top',
                          position:'sticky', left:0, zIndex:1,
                          background: isToday ? '#FFFBEB' : di%2 ? '#FAFAFA' : '#fff',
                          borderRight:'2px solid #E5E7EB', minWidth:140,
                        }}>
                          <div style={{ fontWeight:900, fontSize:20, color:'#111827', lineHeight:1 }}>{dt.getDate()}</div>
                          <div style={{ fontSize:11, fontWeight:700, color:'#6B7280', textTransform:'uppercase' }}>
                            {dt.toLocaleString('default',{month:'short'})} {dt.getFullYear()}
                          </div>
                          <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>
                            {dt.toLocaleString('default',{weekday:'long'})}
                          </div>
                          {isToday && <span style={{ fontSize:10, fontWeight:700, color:'#D97706', background:'#FEF3C7', padding:'2px 7px', borderRadius:10, marginTop:4, display:'inline-block' }}>Today</span>}
                          {isPast  && <span style={{ fontSize:10, fontWeight:700, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 7px', borderRadius:10, marginTop:4, display:'inline-block' }}>Done</span>}
                          {!isPast && !isToday && diff !== null && (
                            <span style={{ fontSize:10, fontWeight:700, color:diff<=3?'#DC2626':'#16A34A', background:diff<=3?'#FEF2F2':'#F0FDF4', padding:'2px 7px', borderRadius:10, marginTop:4, display:'inline-block' }}>
                              In {diff}d
                            </span>
                          )}
                        </td>

                        {/* Subject cells */}
                        {cols.map(sub => {
                          const exam = grid[dateStr]?.[sub._id];
                          const tc   = exam ? (TC[exam.examType]||TC.unit) : null;
                          return (
                            <td key={sub._id} style={{ padding:'10px 14px', verticalAlign:'top', borderLeft:'1px solid #F3F4F6', minWidth:180 }}>
                              {exam ? (
                                <div style={{
                                  background: tc.bg, border:`1.5px solid ${tc.border}50`,
                                  borderRadius:10, padding:'10px 12px', position:'relative',
                                }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:'#111827', marginBottom:4 }}>{exam.name}</div>
                                  <span style={{ fontSize:10, fontWeight:700, color:tc.color, background:'#fff', border:`1px solid ${tc.border}50`, padding:'2px 7px', borderRadius:10 }}>
                                    {exam.examType}
                                  </span>
                                  <div style={{ fontSize:11, color:'#6B7280', marginTop:6 }}>
                                    {exam.startTime && <span>⏰ {exam.startTime}{exam.endTime?`–${exam.endTime}`:''}</span>}
                                  </div>
                                  <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginTop:4 }}>
                                    📋 {exam.totalMarks} marks &nbsp;|&nbsp; Pass: {exam.passingMarks}
                                  </div>
                                  {canEdit && (
                                    <div style={{ display:'flex', gap:5, marginTop:8, justifyContent:'flex-end' }}>
                                      <button onClick={()=>onEdit(exam)} style={{ fontSize:11, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 8px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>✎ Edit</button>
                                      <button onClick={()=>onDelete(exam._id)} style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'3px 8px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>✕</button>
                                    </div>
                                  )}
                                </div>
                              ) : (
                                <div style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                  <span style={{ color:'#E5E7EB', fontSize:18 }}>—</span>
                                </div>
                              )}
                            </td>
                          );
                        })}

                        {/* No-subject column */}
                        {hasNoSub && (
                          <td style={{ padding:'10px 14px', verticalAlign:'top', borderLeft:'1px solid #F3F4F6', minWidth:180 }}>
                            {(grid[dateStr]?.['__none__'] ? [grid[dateStr]['__none__']] : []).map(exam => {
                              const tc = TC[exam.examType]||TC.unit;
                              return (
                                <div key={exam._id} style={{ background:tc.bg, border:`1.5px solid ${tc.border}50`, borderRadius:10, padding:'10px 12px' }}>
                                  <div style={{ fontWeight:700, fontSize:13, color:'#111827', marginBottom:4 }}>{exam.name}</div>
                                  <div style={{ fontSize:11, color:'#6B7280' }}>{exam.startTime||''}</div>
                                  <div style={{ fontSize:12, fontWeight:700, color:'#374151', marginTop:4 }}>{exam.totalMarks} marks</div>
                                  {canEdit && (
                                    <div style={{ display:'flex', gap:5, marginTop:8 }}>
                                      <button onClick={()=>onEdit(exam)} style={{ fontSize:11, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'3px 8px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>✎</button>
                                      <button onClick={()=>onDelete(exam._id)} style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'3px 8px', borderRadius:6, cursor:'pointer', fontWeight:700 }}>✕</button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                            {!grid[dateStr]?.['__none__'] && (
                              <div style={{ height:40, display:'flex', alignItems:'center', justifyContent:'center' }}>
                                <span style={{ color:'#E5E7EB', fontSize:18 }}>—</span>
                              </div>
                            )}
                          </td>
                        )}
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            {/* Legend */}
            <div style={{ padding:'12px 20px', borderTop:'1px solid #E5E7EB', display:'flex', gap:12, flexWrap:'wrap', background:'#F8FAFC' }}>
              {Object.entries(TC).map(([t,c])=>(
                <div key={t} style={{ display:'flex', alignItems:'center', gap:5 }}>
                  <div style={{ width:10, height:10, borderRadius:3, background:c.bg, border:`1px solid ${c.border}` }}/>
                  <span style={{ fontSize:11, color:'#6B7280', textTransform:'capitalize' }}>{t}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Add exam hint */}
          {canEdit && (
            <div style={{ textAlign:'center', padding:'16px', background:'#F8FAFC', borderRadius:12, border:'1.5px dashed #E5E7EB' }}>
              <span style={{ fontSize:13, color:'#9CA3AF' }}>Click <strong style={{color:'#1D4ED8'}}>+ Create Exam</strong> (top right) to add exams to the timetable</span>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
export default function Exams() {
  const { isAdmin, isTeacher } = useAuth();
  const [tab,      setTab]     = useState('all');
  const [exams,    setExams]   = useState([]);
  const [classes,  setClasses] = useState([]);
  const [subjects, setSubjects]= useState([]);
  const [loading,  setLoading] = useState(true);
  const [modal,    setModal]   = useState(false);
  const [form,     setForm]    = useState(FORM_EMPTY);
  const [saving,   setSaving]  = useState(false);

  const canEdit = isAdmin || isTeacher;

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, cRes, sRes] = await Promise.all([examAPI.getAll(), classAPI.getAll(), subjectAPI.getAll()]);
      setExams(eRes.data.data || []);
      setClasses(cRes.data.data || []);
      setSubjects(sRes.data.data || []);
    } catch { toast.error('Failed to load exams'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  const openAdd  = () => { setForm(FORM_EMPTY); setModal(true); };
  const openEdit = (exam) => {
    setForm({
      _id: exam._id, name: exam.name||'', class: exam.class?._id||exam.class||'',
      subject: exam.subject?._id||exam.subject||'', examType: exam.examType||'unit',
      date: exam.date?exam.date.split('T')[0]:'', startTime: exam.startTime||'',
      endTime: exam.endTime||'', totalMarks: exam.totalMarks||100,
      passingMarks: exam.passingMarks||35, instructions: exam.instructions||'',
    });
    setModal(true);
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return toast.error('Exam name is required');
    if (!form.class)        return toast.error('Please select a class');
    setSaving(true);
    try {
      if (form._id) { await examAPI.update(form._id, form); toast.success('Exam updated'); }
      else          { await examAPI.create(form);           toast.success('Exam created'); }
      setModal(false); setForm(FORM_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam?')) return;
    try { await examAPI.delete(id); toast.success('Exam deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const upcoming = exams.filter(e => e.date && new Date(e.date) >= new Date());
  const TABS = [
    { key:'all',       label:'📝 All Exams' },
    { key:'recent',    label:'🕐 Recent / Upcoming' },
    { key:'timetable', label:'🗓 Exam Timetable' },
  ];

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">📝 Exams & Results</h2>
          <p className="text-sm text-muted mt-0.5">
            {exams.length} total · {upcoming.length} upcoming
          </p>
        </div>
        {canEdit && (
          <button onClick={openAdd} className="btn-primary">+ Create Exam</button>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)} style={{
            padding:'8px 20px', borderRadius:8, fontSize:13, fontWeight:700,
            border:'none', cursor:'pointer', transition:'all 0.15s',
            background: tab===t.key ? '#1D4ED8' : 'transparent',
            color:      tab===t.key ? '#fff'    : '#6B7280',
          }}>{t.label}</button>
        ))}
      </div>

      {tab === 'all' && (
        <AllExams exams={exams} classes={classes} subjects={subjects}
          onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd}
          canEdit={canEdit} loading={loading} />
      )}
      {tab === 'recent' && (
        <RecentExams exams={exams} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} />
      )}
      {tab === 'timetable' && (
        <ExamTimetable exams={exams} classes={classes} subjects={subjects}
          canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd} />
      )}

      {modal && (
        <ExamModal form={form} setForm={setForm} onSave={handleSave}
          onClose={()=>{setModal(false);setForm(FORM_EMPTY);}}
          saving={saving} classes={classes} subjects={subjects} />
      )}
    </div>
  );
}