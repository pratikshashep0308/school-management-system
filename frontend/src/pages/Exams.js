// frontend/src/pages/Exams.js
import React, { useEffect, useState, useCallback } from 'react';
import { useSearchParams } from 'react-router-dom';
import toast from 'react-hot-toast';
import api, { examAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState } from '../components/ui';
import ExamSetup from './Exams/ExamSetup';
import examAdvAPI from '../utils/examAPI';
import {
  ExamDashboardHome, MarksEntryView, ResultsView,
  ReportsView, DateSheetView, AwardListView,
} from './Exams/DashboardViews';

const TYPE_COLORS = {
  unit:       { bg:'#FEF3C7', color:'#92400E', border:'#F59E0B' },
  midterm:    { bg:'#FEE2E2', color:'#991B1B', border:'#EF4444' },
  final:      { bg:'#EDE9FE', color:'#5B21B6', border:'#8B5CF6' },
  practical:  { bg:'#D1FAE5', color:'#065F46', border:'#10B981' },
  assignment: { bg:'#DBEAFE', color:'#1E40AF', border:'#3B82F6' },
};
const TYPE_LIST  = ['unit','midterm','final','practical','assignment'];
const FORM_EMPTY = { name:'', class:'', subject:'', examType:'unit', date:'', startTime:'', endTime:'', totalMarks:100, passingMarks:35, instructions:'' };
const daysUntil  = d => d ? Math.ceil((new Date(d) - new Date()) / 86400000) : null;

// ── Inline modal (avoids scroll issues with Modal component) ──────────────────
function ExamFormModal({ form, setForm, onSave, onClose, saving, classes, subjects, examTypes = [] }) {
  const set = (k,v) => setForm(f=>({...f,[k]:v}));
  const INP = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
  const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase', letterSpacing:'0.05em' };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)' }}/>
      <div style={{ position:'relative', background:'#fff', borderRadius:18, width:'100%', maxWidth:640, maxHeight:'90vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 64px rgba(0,0,0,0.18)' }}>
        {/* Header */}
        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'20px 28px', borderBottom:'1px solid #E5E7EB', flexShrink:0 }}>
          <h2 style={{ fontSize:20, fontWeight:700, color:'#111827', margin:0 }}>{form._id ? '✎ Edit Exam' : '📝 Create Exam'}</h2>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280' }}>×</button>
        </div>
        {/* Body */}
        <div style={{ padding:'24px 28px', overflowY:'auto', flex:1 }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Exam Name *</label>
              <input value={form.name} onChange={e=>set('name',e.target.value)} placeholder="e.g. Unit Test 1 — April 2026" style={INP}/>
            </div>
            <div>
              <label style={LBL}>Class *</label>
              <select value={form.class} onChange={e=>set('class',e.target.value)} style={INP}>
                <option value="">Select class</option>
                {classes.map(c=><option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Subject</label>
              <select value={form.subject} onChange={e=>set('subject',e.target.value)} style={INP}>
                <option value="">Select subject</option>
                {subjects.map(s=><option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Exam Type</label>
              <select value={form.examType} onChange={e=>set('examType',e.target.value)} style={INP}>
                {/* The school's own exam types. Falls back to the fixed list
                    only if none are configured, so the form still works on a
                    fresh install. */}
                {examTypes.length > 0
                  ? [<option key="" value="">Select a type…</option>,
                     ...examTypes.map(t => <option key={t._id} value={t._id}>{t.name}</option>)]
                  : TYPE_LIST.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>Date</label>
              <input type="date" value={form.date} onChange={e=>set('date',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Start Time</label>
              <input type="time" value={form.startTime} onChange={e=>set('startTime',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>End Time</label>
              <input type="time" value={form.endTime} onChange={e=>set('endTime',e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Total Marks</label>
              <input type="number" value={form.totalMarks} onChange={e=>set('totalMarks',+e.target.value)} style={INP}/>
            </div>
            <div>
              <label style={LBL}>Passing Marks</label>
              <input type="number" value={form.passingMarks} onChange={e=>set('passingMarks',+e.target.value)} style={INP}/>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={LBL}>Instructions</label>
              <textarea value={form.instructions} onChange={e=>set('instructions',e.target.value)} placeholder="Any special instructions…" rows={3} style={{ ...INP, resize:'vertical' }}/>
            </div>
          </div>
        </div>
        {/* Footer */}
        <div style={{ padding:'16px 28px', borderTop:'1px solid #E5E7EB', display:'flex', justifyContent:'flex-end', gap:10, flexShrink:0 }}>
          <button onClick={onClose} style={{ padding:'9px 20px', borderRadius:9, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer', color:'#374151' }}>Cancel</button>
          <button onClick={onSave} disabled={saving} style={{ padding:'9px 24px', borderRadius:9, fontSize:13, fontWeight:700, background:saving?'#9CA3AF':'#1D4ED8', color:'#fff', border:'none', cursor:saving?'not-allowed':'pointer' }}>
            {saving ? '⏳ Saving…' : form._id ? 'Update Exam' : 'Create Exam'}
          </button>
        </div>
      </div>
    </div>
  );
}

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
    <div style={{ background:'#fff', borderRadius:14, border:`1px solid #E5E7EB`, borderLeft:`4px solid ${tc.border}`, padding:'16px 20px', display:'flex', alignItems:'center', gap:16, flexWrap:'wrap' }}>
      <div style={{ width:52, height:52, borderRadius:12, background:'#F8FAFC', border:'1px solid #E5E7EB', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
        <div style={{ fontSize:18, fontWeight:900, color:'#111827', lineHeight:1 }}>{d?.getDate()||'—'}</div>
        <div style={{ fontSize:10, color:'#6B7280', textTransform:'uppercase', fontWeight:700 }}>{d?.toLocaleString('default',{month:'short'})||''}</div>
      </div>
      <div style={{ flex:1, minWidth:0 }}>
        <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
          <span style={{ fontWeight:700, fontSize:15, color:'#111827' }}>{exam.name}</span>
          <span style={{ fontSize:11, fontWeight:700, color:tc.color, background:tc.bg, border:`1px solid ${tc.border}50`, padding:'2px 8px', borderRadius:20 }}>{exam.examType}</span>
          {past && <span style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', background:'#F3F4F6', padding:'2px 8px', borderRadius:20 }}>Done</span>}
        </div>
        <div style={{ fontSize:13, color:'#6B7280' }}>
          {exam.class?.name} {exam.class?.section||''} &nbsp;·&nbsp; {exam.subject?.name||'—'}
          {exam.startTime && <span> &nbsp;·&nbsp; ⏰ {exam.startTime}{exam.endTime?`–${exam.endTime}`:''}</span>}
        </div>
      </div>
      <div style={{ textAlign:'center', minWidth:56 }}>
        <div style={{ fontSize:24, fontWeight:900, color:'#111827' }}>{exam.totalMarks}</div>
        <div style={{ fontSize:10, color:'#9CA3AF' }}>marks</div>
        <div style={{ fontSize:11, fontWeight:700, color:'#16A34A' }}>pass {exam.passingMarks}</div>
      </div>
      {urgency && <span style={{ fontSize:12, fontWeight:800, color:urgency.color, background:urgency.bg, padding:'5px 12px', borderRadius:20, flexShrink:0 }}>{urgency.text}</span>}
      {canEdit && (
        <div style={{ display:'flex', gap:6, flexShrink:0 }}>
          <button onClick={()=>onEdit(exam)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:14, color:'#6B7280' }}>✎</button>
          <button onClick={()=>onDelete(exam._id)} style={{ width:32, height:32, borderRadius:8, border:'1px solid #FCA5A5', background:'#FEF2F2', cursor:'pointer', fontSize:14, color:'#DC2626' }}>✕</button>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 1 — ALL EXAMS (with CRUD)
// ══════════════════════════════════════════════════════════════════════════════
function AllExams({ exams, classes, onEdit, onDelete, onAdd, canEdit, loading, initialClass = '' }) {
  const [filter, setFilter] = useState('');
  const [classF, setClassF] = useState(initialClass);
  const filtered = exams.filter(e => (!filter||e.examType===filter) && (!classF||e.class?._id===classF));
  const upcoming = filtered.filter(e => e.date && new Date(e.date) >= new Date());
  const past     = filtered.filter(e => e.date && new Date(e.date) < new Date());
  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:18 }}>
        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
          {['','unit','midterm','final','practical','assignment'].map(t => {
            const tc = t ? TYPE_COLORS[t] : null;
            return (
              <button key={t} onClick={()=>setFilter(t)} style={{ padding:'6px 14px', borderRadius:20, fontSize:12, fontWeight:700, cursor:'pointer', border:`1.5px solid ${filter===t?(tc?.border||'#374151'):'#E5E7EB'}`, background:filter===t?(tc?.bg||'#111827'):'#fff', color:filter===t?(tc?.color||'#fff'):'#6B7280' }}>
                {t ? t.charAt(0).toUpperCase()+t.slice(1) : 'All'}
              </button>
            );
          })}
        </div>
        <select value={classF} onChange={e=>setClassF(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        {canEdit && (
          <button onClick={onAdd} style={{ marginLeft:'auto', padding:'8px 18px', borderRadius:9, fontSize:13, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
            + Create Exam
          </button>
        )}
      </div>

      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="📝" title="No exams found" subtitle="Try adjusting the filters or create a new exam"/>
      ) : (
        <div>
          {upcoming.length > 0 && (
            <div style={{ marginBottom:20 }}>
              <div style={{ marginBottom:10 }}><span style={{ background:'#FEF3C7', color:'#92400E', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800 }}>📅 Upcoming — {upcoming.length}</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{upcoming.map(e=><ExamCard key={e._id} exam={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit}/>)}</div>
            </div>
          )}
          {past.length > 0 && (
            <div>
              <div style={{ marginBottom:10 }}><span style={{ background:'#F3F4F6', color:'#6B7280', padding:'3px 10px', borderRadius:20, fontSize:11, fontWeight:800 }}>✓ Completed — {past.length}</span></div>
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{past.map(e=><ExamCard key={e._id} exam={e} onEdit={onEdit} onDelete={onDelete} canEdit={canEdit}/>)}</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 2 — RECENT / UPCOMING (view only)
// ══════════════════════════════════════════════════════════════════════════════
function RecentExams({ exams }) {
  const now     = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);
  const today    = exams.filter(e => e.date && new Date(e.date).toDateString() === now.toDateString());
  const thisWeek = exams.filter(e => { const d=new Date(e.date); return e.date && d>=weekAgo && d.toDateString()!==now.toDateString() && d<=now; });
  const upcoming7= exams.filter(e => { const diff=daysUntil(e.date); return e.date && diff!==null && diff>0 && diff<=7; });
  const next30   = exams.filter(e => { const diff=daysUntil(e.date); return e.date && diff!==null && diff>7 && diff<=30; });
  if (!exams.length) return <EmptyState icon="📝" title="No exams found"/>;
  const Section = ({ title, items, badge }) => items.length === 0 ? null : (
    <div style={{ marginBottom:24 }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12 }}>
        <span style={{ fontSize:13, fontWeight:800, color:'#374151' }}>{title}</span>
        <span style={{ fontSize:11, fontWeight:700, background:'#F3F4F6', color:'#6B7280', padding:'2px 8px', borderRadius:20 }}>{items.length}</span>
        {badge && <span style={{ fontSize:11, fontWeight:700, background:badge.bg, color:badge.color, padding:'2px 8px', borderRadius:20 }}>{badge.text}</span>}
      </div>
      <div style={{ display:'flex', flexDirection:'column', gap:10 }}>{items.map(e=><ExamCard key={e._id} exam={e} canEdit={false}/>)}</div>
    </div>
  );
  return (
    <div>
      <Section title="📅 Today"           items={today}    badge={{ bg:'#FEF2F2', color:'#DC2626', text:'TODAY' }}/>
      <Section title="⏰ Next 7 Days"     items={upcoming7} badge={{ bg:'#FFFBEB', color:'#D97706', text:'UPCOMING' }}/>
      <Section title="📆 Next 30 Days"    items={next30}/>
      <Section title="✅ This Week (Past)" items={thisWeek}/>
      {!today.length && !upcoming7.length && !next30.length && !thisWeek.length && (
        <EmptyState icon="📅" title="No recent or upcoming exams" subtitle="Exams from the last 7 days and next 30 days appear here"/>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB 3 — EXAM TIMETABLE (table + PDF)
// ══════════════════════════════════════════════════════════════════════════════

// ── Exam grid: dates as rows, classes as columns ──────────────────────────────
// Mirrors the main Timetable module's layout so the two feel consistent.
// Session bands. An exam day is not a school day of eight periods — papers run
// in long sittings, so three bands cover it without inventing structure.
const EXAM_SESSIONS = [
  // defaultTime pre-fills the form when adding from an empty cell, so the paper
  // lands in the session that was clicked rather than wherever the form defaults.
  { key: 'morning',   label: 'Morning',   time: 'before 12:00',  defaultTime: '09:00' },
  { key: 'midday',    label: 'Midday',    time: '12:00 – 15:00', defaultTime: '12:30' },
  { key: 'afternoon', label: 'Afternoon', time: 'after 15:00',   defaultTime: '15:30' },
];

const sessionOf = (startTime) => {
  if (!startTime) return 'morning';
  const h = parseInt(String(startTime).split(':')[0], 10);
  if (Number.isNaN(h)) return 'morning';
  if (h < 12) return 'morning';
  if (h < 15) return 'midday';
  return 'afternoon';
};

// Exam schedule grid — DATES ACROSS, SESSIONS DOWN.
//
// This was the other way round: one row per date, one column per class, so a
// second paper on the same day had no obvious place to go even though the cell
// could hold it. Turning it matches the Timetable module, where the thing that
// repeats runs down the side and the thing that advances runs across the top.
//
// Class is handled by the FILTER above the grid rather than by a column per
// class. Two dimensions across the top (date AND class) would need a nested
// header and would be unreadable past three classes; the filter already exists
// and answers the same question one class at a time.
function ExamGridView({ rows, classes, classF, canEdit, onEdit, onDelete, onAdd }) {
  const today = new Date(); today.setHours(0, 0, 0, 0);

  // Columns: every date that has an exam, chronological.
  const dateKeys = [...new Set(rows.map(e => new Date(e.date).toDateString()))]
    .sort((a, b) => new Date(a) - new Date(b));

  // date + session -> the papers in it
  const cellFor = (dateStr, session) =>
    rows.filter(e =>
      new Date(e.date).toDateString() === dateStr && sessionOf(e.startTime) === session);

  // Only render session rows that hold something, so a school running mornings
  // only does not get two permanently empty bands.
  const usedSessions = EXAM_SESSIONS.filter(sn =>
    dateKeys.some(dk => cellFor(dk, sn.key).length > 0));
  const sessions = usedSessions.length ? usedSessions : [EXAM_SESSIONS[0]];

  if (!dateKeys.length) {
    return <EmptyState icon="🗓" title="Nothing scheduled yet"
      subtitle="Add an exam and it appears here, on its date" />;
  }

  const classLabel = classF
    ? (classes.find(c => c._id === classF)?.name || 'Selected class')
    : 'All classes';

  return (
    <div className="card" style={{ padding: 0, overflow: 'hidden' }}>
      <div style={{ overflowX: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 640 }}>
          <thead>
            <tr style={{ background: '#0B1F4A' }}>
              <th style={{
                padding: '12px 14px', textAlign: 'center', color: '#94afd4', fontSize: 10,
                fontWeight: 700, textTransform: 'uppercase', width: 110,
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}>
                Session
              </th>
              {dateKeys.map(dk => {
                const d = new Date(dk);
                const isToday = d.toDateString() === today.toDateString();
                return (
                  <th key={dk} style={{
                    padding: '10px 8px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: isToday ? '#FFD700' : '#E2E8F0', minWidth: 150,
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                    borderTop: isToday ? '2px solid #FFD700' : 'none',
                    background: isToday ? '#162D6A' : '#0B1F4A',
                  }}>
                    <div style={{ fontSize: 15, fontWeight: 800 }}>{d.getDate()}</div>
                    <div style={{ fontSize: 9, opacity: 0.75, textTransform: 'uppercase' }}>
                      {d.toLocaleDateString('en-IN', { month: 'short' })} · {d.toLocaleDateString('en-IN', { weekday: 'short' })}
                    </div>
                    {isToday && <div style={{ fontSize: 7.5, color: '#FFD700', fontWeight: 700, marginTop: 2 }}>TODAY</div>}
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {sessions.map(sn => (
              <tr key={sn.key} style={{ borderBottom: '0.5px solid #E5E7EB' }}>
                <td style={{
                  padding: '10px 8px', textAlign: 'center', background: '#0B1F4A',
                  borderRight: '0.5px solid rgba(255,255,255,0.08)', verticalAlign: 'middle',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 800, color: '#fff' }}>{sn.label}</div>
                  <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.45)', marginTop: 2 }}>{sn.time}</div>
                </td>

                {dateKeys.map(dk => {
                  const d = new Date(dk);
                  const isToday = d.toDateString() === today.toDateString();
                  const isPast = d < today && !isToday;
                  const items = cellFor(dk, sn.key);

                  return (
                    <td key={dk} style={{
                      borderRight: '0.5px solid #E5E7EB', verticalAlign: 'top', padding: 6,
                      background: isToday ? '#FFFBEB' : isPast ? '#FAFAFA' : 'transparent',
                    }}>
                      {!items.length ? (
                        /* An empty slot is where a paper GOES, so it offers to
                           add one rather than showing a dash. Only for those who
                           can edit — a dead "+" is worse than a plain blank. */
                        canEdit ? (
                          <div
                            onClick={() => onAdd && onAdd({ date: d, startTime: sn.defaultTime })}
                            title="Add an exam here"
                            style={{
                              minHeight: 58, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', cursor: 'pointer',
                              border: '1px dashed #E5E7EB', borderRadius: 8, color: '#D1D5DB',
                              fontSize: 16, transition: 'all 0.15s',
                            }}
                            onMouseEnter={ev => { ev.currentTarget.style.borderColor = '#93C5FD'; ev.currentTarget.style.color = '#3B82F6'; ev.currentTarget.style.background = '#F0F7FF'; }}
                            onMouseLeave={ev => { ev.currentTarget.style.borderColor = '#E5E7EB'; ev.currentTarget.style.color = '#D1D5DB'; ev.currentTarget.style.background = 'transparent'; }}
                          >
                            +
                          </div>
                        ) : (
                          <div style={{
                            minHeight: 58, display: 'flex', alignItems: 'center',
                            justifyContent: 'center', color: '#D1D5DB', fontSize: 10,
                          }}>—</div>
                        )
                      ) : items.map(e => {
                        const tc = TYPE_COLORS[e.examType] || TYPE_COLORS.unit;
                        return (
                          <div key={e._id}
                            onClick={() => canEdit && onEdit(e)}
                            title={canEdit ? 'Click to edit' : ''}
                            style={{
                              background: '#fff', border: `1px solid ${tc.bg}`,
                              borderLeft: `3px solid ${tc.color}`, borderRadius: 8,
                              padding: '7px 9px', marginBottom: 5,
                              cursor: canEdit ? 'pointer' : 'default',
                              opacity: isPast ? 0.65 : 1,
                            }}>
                            <div style={{
                              fontSize: 12, fontWeight: 700, color: '#111827',
                              whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis',
                            }}>
                              {e.subject?.name || e.name}
                            </div>
                            {/* The class is named on the card, because with the
                                filter set to "all" two classes can share a cell
                                and the column no longer says which is which. */}
                            {!classF && e.class?.name && (
                              <div style={{ fontSize: 10, color: '#4B5563', marginTop: 2, fontWeight: 600 }}>
                                {e.class.name} {e.class.section || ''}
                              </div>
                            )}
                            {(e.startTime || e.endTime) && (
                              <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                                🕐 {e.startTime || '—'}{e.endTime ? ` – ${e.endTime}` : ''}
                              </div>
                            )}
                            <div style={{ display: 'flex', gap: 5, marginTop: 4, flexWrap: 'wrap', alignItems: 'center' }}>
                              <span style={{
                                fontSize: 9, fontWeight: 700, padding: '1px 7px', borderRadius: 999,
                                background: tc.bg, color: tc.color, textTransform: 'capitalize',
                              }}>
                                {e.examType}
                              </span>
                              {e.totalMarks ? (
                                <span style={{ fontSize: 9.5, color: '#9CA3AF' }}>{e.totalMarks} marks</span>
                              ) : null}
                            </div>
                          </div>
                        );
                      })}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Legend — which colour is which exam type. The cards are colour-coded
          and a reader should not have to open one to learn the code. */}
      <div style={{ padding: '10px 14px', borderTop: '0.5px solid #E5E7EB', display: 'flex', flexWrap: 'wrap', gap: 14, alignItems: 'center' }}>
        {[...new Set(rows.map(e => e.examType).filter(Boolean))].map(t => {
          const tc = TYPE_COLORS[t] || TYPE_COLORS.unit;
          return (
            <span key={t} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: '#4B5563' }}>
              <span style={{ width: 10, height: 10, borderRadius: 3, background: tc.color, display: 'inline-block' }} />
              <span style={{ textTransform: 'capitalize' }}>{t}</span>
            </span>
          );
        })}
      </div>

      <div style={{ padding: '8px 14px', fontSize: 10.5, color: '#9CA3AF', borderTop: '0.5px solid #E5E7EB' }}>
        Showing {classLabel}. Papers sit in the session their start time falls in —
        morning before noon, midday to 3pm, afternoon after.
      </div>
    </div>
  );
}

function ExamTimetable({ exams, classes, canEdit, onEdit, onDelete, onAdd, initialClass = '' }) {
  // 'grid' mirrors the main Timetable module (dates as rows, classes as
  // columns); 'list' keeps the original flat table.
  const [view,      setView]      = useState('grid');
  const [classF,    setClassF]    = useState(initialClass);
  const [typeF,     setTypeF]     = useState('');
  const [search,    setSearch]    = useState('');

  const rows = exams
    .filter(e => e.date)
    .filter(e => !classF || e.class?._id === classF)
    .filter(e => !typeF  || e.examType === typeF)
    .filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.subject?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  // Exam timetable PDF.
  //
  // ─── WHY THIS PRINTS RATHER THAN USING jsPDF ────────────────────────────────
  // The previous version fetched jsPDF and its autoTable plugin from a CDN at
  // the moment of the click. That fails in several ways, and did:
  //
  //   · staging is served over HTTP while the scripts are HTTPS — a mixed
  //     content situation no amount of JavaScript can resolve
  //   · if the plugin loads but jsPDF has not finished registering, the guard
  //     passes and doc.autoTable() does not exist
  //   · either way doc.save() had already begun writing, producing the
  //     "file is not valid" a partial PDF gives
  //
  // Every other export in this system prints generated HTML instead — the fee
  // report, the category report. The browser's own engine handles pagination
  // and page numbers, there is nothing to download first, and the result is
  // laid out properly rather than as autoTable's default grid.
  const exportPDF = () => {
    if (!rows.length) { toast.error('Nothing to print'); return; }

    const w = window.open('', '_blank');
    if (!w) { toast.error('Please allow pop-ups to print'); return; }

    const esc = (v) => String(v ?? '')
      .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

    const today = new Date(); today.setHours(0, 0, 0, 0);
    const cls = classF
      ? (classes.find(c => c._id === classF)?.name || 'Class')
      : 'All Classes';

    // Chronological, so the printed sheet reads as a schedule rather than as
    // whatever order the filter happened to produce.
    const sorted = [...rows].sort((a, b) => new Date(a.date) - new Date(b.date));

    const body = sorted.map(e => {
      const d = new Date(e.date);
      const past = d < today && d.toDateString() !== today.toDateString();
      const isToday = d.toDateString() === today.toDateString();
      return `<tr class="${past ? 'past' : ''}${isToday ? ' today' : ''}">
        <td>${d.getDate()} ${esc(d.toLocaleString('en-IN', { month: 'short' }))}</td>
        <td>${esc(d.toLocaleString('en-IN', { weekday: 'short' }))}</td>
        <td class="b">${esc(e.subject?.name || e.name)}</td>
        <td>${esc(`${e.class?.name || ''} ${e.class?.section || ''}`.trim() || '—')}</td>
        <td class="cap">${esc(e.examType || '')}</td>
        <td>${esc(e.startTime || '—')}${e.endTime ? ` – ${esc(e.endTime)}` : ''}</td>
        <td class="n">${e.totalMarks ?? '—'}</td>
        <td class="n">${e.passingMarks ?? '—'}</td>
      </tr>`;
    }).join('');

    const html = `<html><head><title>Exam Timetable — ${esc(cls)}</title><style>
      @page { size: A4 portrait; margin: 12mm; }
      body { font-family: system-ui, Arial, sans-serif; color:#111827; margin:0; }
      h1 { font-size:18px; color:#0B1F4A; margin:0 0 2px; }
      .sub { color:#6B7280; font-size:11px; margin-bottom:14px; }
      table { width:100%; border-collapse:collapse; font-size:11px; }
      th { background:#0B1F4A; color:#fff; padding:7px 8px; text-align:left; font-weight:600; font-size:10px;
           text-transform:uppercase; letter-spacing:0.4px; }
      td { padding:6px 8px; border-bottom:1px solid #F3F4F6; }
      td.b { font-weight:700; }
      td.n { text-align:right; }
      td.cap { text-transform:capitalize; }
      tr.past td { color:#9CA3AF; }
      tr.today td { background:#FFFBEB; font-weight:600; }
      tr:nth-child(even):not(.today) td { background:#F9FAFB; }
      /* Headers repeat on every page and a row never splits across one — a
         continuation sheet starting mid-row is unreadable. */
      thead { display:table-header-group; }
      tr { break-inside:avoid; }
      .foot { margin-top:12px; font-size:9px; color:#9CA3AF; }
    </style></head><body>
      <h1>Exam Timetable</h1>
      <div class="sub">The Future Step School · ${esc(cls)} ·
        ${esc(new Date().toLocaleDateString('en-IN', { day: 'numeric', month: 'long', year: 'numeric' }))} ·
        ${sorted.length} paper${sorted.length === 1 ? '' : 's'}</div>
      <table>
        <thead><tr>
          <th>Date</th><th>Day</th><th>Subject</th><th>Class</th>
          <th>Type</th><th>Time</th><th>Total</th><th>Pass</th>
        </tr></thead>
        <tbody>${body}</tbody>
      </table>
      <div class="foot">Today's papers are highlighted; past papers are greyed.</div>
    </body></html>`;

    w.document.open();
    w.document.write(html);
    w.document.close();
    w.focus();
    setTimeout(() => w.print(), 400);
  };

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <input placeholder="🔍 Search exam or subject…" value={search} onChange={e=>setSearch(e.target.value)} style={{ ...SEL, minWidth:200 }}/>
        <select value={classF} onChange={e=>setClassF(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={SEL}>
          <option value="">All Types</option>
          {TYPE_LIST.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
        <div style={{ display:'flex', gap:2, background:'#F3F4F6', borderRadius:8, padding:3 }}>
          {[['grid','▦ Grid'],['list','☰ List']].map(([k,label])=>(
            <button key={k} onClick={()=>setView(k)}
              style={{ padding:'6px 14px', borderRadius:6, fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
                background: view===k?'#fff':'transparent', color: view===k?'#1D4ED8':'#6B7280',
                boxShadow: view===k?'0 1px 3px rgba(0,0,0,0.1)':'none' }}>
              {label}
            </button>
          ))}
        </div>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, alignItems:'center' }}>
          <span style={{ fontSize:12, color:'#9CA3AF' }}>{rows.length} exams</span>
          {canEdit && (
            <button onClick={onAdd} style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
              + Add Exam
            </button>
          )}
          {/* No longer async — there is nothing to download before printing, so
              the spinner state went with the CDN fetch it was waiting on. */}
          <button onClick={exportPDF} disabled={!rows.length} style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700, background:!rows.length?'#F3F4F6':'#DC2626', color:!rows.length?'#9CA3AF':'#fff', border:'none', cursor:!rows.length?'not-allowed':'pointer' }}>
            🖨 Print / Save as PDF
          </button>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState icon="🗓" title="No exams found" subtitle="Create exams with dates to see the timetable"/>
      ) : view === 'grid' ? (
        <ExamGridView rows={rows} classes={classes} classF={classF} canEdit={canEdit} onEdit={onEdit} onDelete={onDelete} onAdd={onAdd}/>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Date','Day','Subject','Exam Name','Class','Type','Time','Marks','Status',...(canEdit?['Actions']:[])].map(h=>(
                    <th key={h} style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:11, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((e,i) => {
                  const d      = new Date(e.date);
                  const diff   = Math.ceil((d-new Date())/86400000);
                  const isToday= d.toDateString()===new Date().toDateString();
                  const past   = d<new Date()&&!isToday;
                  const tc     = TYPE_COLORS[e.examType]||TYPE_COLORS.unit;
                  const status = past?{ label:'✅ Done', bg:'#F3F4F6', color:'#6B7280' }:isToday?{ label:'📌 Today', bg:'#FEF3C7', color:'#92400E' }:diff<=3?{ label:`🔴 In ${diff}d`, bg:'#FEF2F2', color:'#DC2626' }:diff<=7?{ label:`🟡 In ${diff}d`, bg:'#FFFBEB', color:'#D97706' }:{ label:`🟢 In ${diff}d`, bg:'#F0FDF4', color:'#16A34A' };
                  return (
                    <tr key={e._id} style={{ borderBottom:'1px solid #F3F4F6', background:isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff' }}
                      onMouseEnter={ev=>ev.currentTarget.style.background=isToday?'#FEF3C7':'#F0F7FF'}
                      onMouseLeave={ev=>ev.currentTarget.style.background=isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff'}>
                      <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:800, fontSize:15, color:'#111827' }}>{d.getDate()} {d.toLocaleString('default',{month:'short'})}</div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>{d.getFullYear()}</div>
                      </td>
                      <td style={{ padding:'12px 16px', color:'#6B7280', fontSize:12, fontWeight:600 }}>{d.toLocaleString('default',{weekday:'short'})}</td>
                      <td style={{ padding:'12px 16px', fontWeight:700, color:'#111827' }}>{e.subject?.name||'—'}</td>
                      <td style={{ padding:'12px 16px' }}><div style={{ fontWeight:600, color:'#374151' }}>{e.name}</div></td>
                      <td style={{ padding:'12px 16px', color:'#374151', whiteSpace:'nowrap' }}>{e.class?.name} {e.class?.section||''}</td>
                      <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11, fontWeight:700, color:tc.color, background:tc.bg, border:`1px solid ${tc.border}50`, padding:'3px 10px', borderRadius:20 }}>{e.examType}</span></td>
                      <td style={{ padding:'12px 16px', color:'#6B7280', fontSize:12, whiteSpace:'nowrap' }}>{e.startTime||'—'}{e.endTime?` – ${e.endTime}`:''}</td>
                      <td style={{ padding:'12px 16px' }}><span style={{ fontWeight:800, color:'#111827' }}>{e.totalMarks}</span><span style={{ fontSize:10, color:'#16A34A', marginLeft:4 }}>/{e.passingMarks}</span></td>
                      <td style={{ padding:'12px 16px' }}><span style={{ fontSize:11, fontWeight:700, color:status.color, background:status.bg, padding:'4px 10px', borderRadius:20, whiteSpace:'nowrap' }}>{status.label}</span></td>
                      {canEdit && (
                        <td style={{ padding:'12px 16px' }}>
                          <div style={{ display:'flex', gap:5 }}>
                            <button onClick={()=>onEdit(e)} style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>✎</button>
                            <button onClick={()=>onDelete(e._id)} style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>✕</button>
                          </div>
                        </td>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// MAIN
// ══════════════════════════════════════════════════════════════════════════════
// The Exam Dashboard is the CENTRAL HUB. The global sidebar has ONLY one item
// ("Exams" → /exams); every exam function is reached from inside here through
// the Action Center cards and the segmented internal navigation below — never
// from sidebar submenus.
export default function Exams() {
  const [searchParams] = useSearchParams();
  const initialClass = searchParams.get('class') || '';
  const { isAdmin, isTeacher } = useAuth();
  const canEdit = isAdmin || isTeacher;

  // Which hub section is showing. 'dashboard' is the landing view.
  const [section, setSection] = useState('dashboard');

  // Legacy `exams` collection (used by All Exams / Timetable cards) plus the
  // advanced `examgroups` used by marks, results, reports, date sheet, awards.
  const [examTypes, setExamTypes] = useState([]);
  const [exams,    setExams]   = useState([]);
  const [groups,   setGroups]  = useState([]);
  const [classes,  setClasses] = useState([]);
  const [subjects, setSubjects]= useState([]);
  const [stats,    setStats]   = useState({});
  const [loading,  setLoading] = useState(true);
  const [statsLoading, setStatsLoading] = useState(true);
  const [modal,    setModal]   = useState(false);
  const [form,     setForm]    = useState(FORM_EMPTY);
  const [saving,   setSaving]  = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [eRes, cRes, sRes, tRes, gRes] = await Promise.all([
        examAPI.getAll(),
        classAPI.getAll(),
        subjectAPI.getAll(),
        api.get('/exams-adv/types').catch(() => ({ data: { data: [] } })),
        examAdvAPI.getGroups().catch(() => ({ data: { data: [] } })),
      ]);
      setExams(eRes.data.data || []);
      setClasses(cRes.data.data || []);
      setSubjects(sRes.data.data || []);
      setExamTypes(tRes?.data?.data || []);
      setGroups(gRes?.data?.data || []);
    } catch { toast.error('Failed to load exams'); }
    finally { setLoading(false); }
  }, []);

  const loadStats = useCallback(async () => {
    setStatsLoading(true);
    try {
      const r = await examAdvAPI.dashboard();
      setStats(r.data.data || {});
    } catch { /* stats are best-effort; the hub still works without them */ }
    finally { setStatsLoading(false); }
  }, []);

  useEffect(() => { load(); loadStats(); }, [load, loadStats]);

  // Refresh dashboard stats whenever we return to the landing view, so counts
  // reflect marks just entered in another section.
  useEffect(() => { if (section === 'dashboard') loadStats(); }, [section, loadStats]);

  const openAdd  = (prefill) => {
    setForm({
      ...FORM_EMPTY,
      ...(prefill?.date ? { date: new Date(prefill.date).toISOString().slice(0, 10) } : {}),
      ...(prefill?.startTime ? { startTime: prefill.startTime } : {}),
      ...(initialClass ? { class: initialClass } : {}),
    });
    setModal(true);
  };
  const openEdit = (exam) => {
    setForm({ _id:exam._id, name:exam.name||'', class:exam.class?._id||exam.class||'', subject:exam.subject?._id||exam.subject||'', examType:exam.examType||'unit', date:exam.date?exam.date.split('T')[0]:'', startTime:exam.startTime||'', endTime:exam.endTime||'', totalMarks:exam.totalMarks||100, passingMarks:exam.passingMarks||35, instructions:exam.instructions||'' });
    setModal(true);
  };

  // Creating an exam writes to the ADVANCED module (an ExamGroup plus an
  // ExamSubject inside it), which is what marks, results, publishing and every
  // exam report read from. See the long note kept in git history — the legacy
  // `exams` collection never met the advanced one, so an exam created there
  // could never have marks entered against it.
  const handleSave = async () => {
    if (!form.name?.trim()) return toast.error('Exam name is required');
    if (!form.class)        return toast.error('Please select a class');
    if (!form.subject)      return toast.error('Please select a subject');
    setSaving(true);
    try {
      if (form._id) {
        await examAPI.update(form._id, form);
        toast.success('Exam updated');
      } else {
        const gRes = await api.post('/exams-adv/groups', {
          name: form.name.trim(),
          examType: form.examType || undefined,
          academicYear: form.academicYear || undefined,
          startDate: form.date || undefined,
          endDate: form.date || undefined,
          classes: form.class ? [form.class] : undefined,
          status: 'scheduled',
        });
        const group = gRes?.data?.data;
        if (!group?._id) throw new Error('The exam was not created');
        try {
          await api.post(`/exams-adv/groups/${group._id}/subjects`, {
            subject: form.subject,
            class: form.class,
            date: form.date || undefined,
            startTime: form.startTime || undefined,
            endTime: form.endTime || undefined,
            passingMarks: Number(form.passingMarks) || 35,
            components: { theory: { max: Number(form.totalMarks) || 100, enabled: true } },
          });
          toast.success('Exam created — marks can now be entered against it');
        } catch (subErr) {
          toast.error(
            `Exam "${form.name}" was created but the subject could not be added: `
            + (subErr.response?.data?.message || subErr.message),
            { duration: 9000 }
          );
        }
      }
      setModal(false); setForm(FORM_EMPTY); load(); loadStats();
    } catch(err) { toast.error(err.response?.data?.message||err.message||'Failed to save'); }
    finally { setSaving(false); }
  };
  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam?')) return;
    try { await examAPI.delete(id); toast.success('Deleted'); load(); loadStats(); }
    catch { toast.error('Failed to delete'); }
  };

  // ── The Action Center. Each entry maps to a hub section. `go` switches the
  //    hub; NOTHING here is dummy navigation. ────────────────────────────────
  const ACTIONS = [
    { key:'create',     icon:'➕', label:'Create New Exam',  desc:'Create and configure a new examination.',                 tint:'#1D4ED8', adminOnly:false },
    { key:'setup',      icon:'⚙️', label:'Exam Setup',       desc:'Exam types, grading schemes, weightage and passing marks.', tint:'#6366F1', adminOnly:true  },
    { key:'marks',      icon:'📝', label:'Add / Update Marks',desc:'Enter and manage student marks per subject.',             tint:'#059669', adminOnly:false },
    { key:'results',    icon:'🎓', label:'Result Card',       desc:'Generate individual student result cards.',               tint:'#7C3AED', adminOnly:false },
    { key:'results',    icon:'🏆', label:'Result Sheet',      desc:'Generate ranked class-wise result sheets.',               tint:'#DB2777', adminOnly:false },
    { key:'timetable',  icon:'📅', label:'Exam Schedule',     desc:'Create and manage examination schedules.',                tint:'#D97706', adminOnly:false },
    { key:'datesheet',  icon:'📄', label:'Date Sheet',        desc:'Generate printable student / class date sheets.',         tint:'#0891B2', adminOnly:false },
    { key:'awardlist',  icon:'📋', label:'Blank Award List',  desc:'Generate printable blank award lists for marking.',       tint:'#EA580C', adminOnly:false },
    { key:'setup',      icon:'🎯', label:'Grading Setup',     desc:'Configure grading schemes and grade bands.',              tint:'#16A34A', adminOnly:true  },
    { key:'setup',      icon:'🗂', label:'Exam Types',        desc:'Manage the school\u2019s exam types.',                     tint:'#9333EA', adminOnly:true  },
    { key:'reports',    icon:'📊', label:'Exam Reports',      desc:'Pass rates, averages and grade analytics.',               tint:'#DC2626', adminOnly:false },
  ];

  // Segmented internal navigation (NOT a second sidebar). The active section is
  // highlighted. Admin-only sections are hidden from non-admins.
  const NAV = [
    { key:'dashboard', label:'📊 Dashboard' },
    { key:'all',       label:'📝 All Exams' },
    { key:'create',    label:'➕ Create' },
    { key:'setup',     label:'⚙️ Setup', adminOnly:true },
    { key:'marks',     label:'📝 Marks' },
    { key:'results',   label:'🏆 Results' },
    { key:'timetable', label:'📅 Schedule' },
    { key:'datesheet', label:'📄 Date Sheet' },
    { key:'awardlist', label:'📋 Award List' },
    { key:'reports',   label:'📊 Reports' },
  ].filter(n => !n.adminOnly || isAdmin);

  const upcoming = exams.filter(e => e.date && new Date(e.date) >= new Date());

  return (
    <div className="animate-fade-in">
      <div className="page-header" style={{ marginBottom:16 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">📝 Exam Management</h2>
          <p className="text-sm text-muted mt-0.5">{exams.length} exams · {upcoming.length} upcoming · central hub for the exam module</p>
        </div>
      </div>

      {/* Segmented internal navigation — the exam module's own nav, inside the page */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:22, flexWrap:'wrap' }}>
        {NAV.map(n => (
          <button key={n.key} onClick={()=>setSection(n.key)}
            style={{ padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:700, border:'none', cursor:'pointer', transition:'all 0.15s',
                     background: section===n.key ? '#1D4ED8' : 'transparent',
                     color:      section===n.key ? '#fff' : '#6B7280' }}>
            {n.label}
          </button>
        ))}
      </div>

      {section==='dashboard' && (
        <ExamDashboardHome stats={stats} loading={statsLoading} actions={ACTIONS} isAdmin={isAdmin}
          go={(k)=>setSection(k)} />
      )}

      {section==='all' && (
        <AllExams exams={exams} classes={classes} onEdit={openEdit} onDelete={handleDelete}
          onAdd={openAdd} canEdit={canEdit} loading={loading} initialClass={initialClass}/>
      )}

      {/* "Create" opens All Exams with the create modal — the real exam form */}
      {section==='create' && (
        <>
          {canEdit && (
            <div style={{ marginBottom:16 }}>
              <button onClick={()=>openAdd()} style={{ padding:'10px 20px', borderRadius:9, fontSize:14, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
                ➕ Create New Exam
              </button>
            </div>
          )}
          <AllExams exams={exams} classes={classes} onEdit={openEdit} onDelete={handleDelete}
            onAdd={openAdd} canEdit={canEdit} loading={loading} initialClass={initialClass}/>
        </>
      )}

      {section==='setup'     && isAdmin && <ExamSetup />}
      {section==='marks'     && <MarksEntryView groups={groups} />}
      {section==='results'   && <ResultsView groups={groups} isAdmin={isAdmin} />}
      {section==='timetable' && <ExamTimetable exams={exams} classes={classes} canEdit={canEdit} onEdit={openEdit} onDelete={handleDelete} onAdd={openAdd} initialClass={initialClass}/>}
      {section==='datesheet' && <DateSheetView groups={groups} />}
      {section==='awardlist' && <AwardListView groups={groups} />}
      {section==='reports'   && <ReportsView groups={groups} />}

      {modal && <ExamFormModal form={form} setForm={setForm} onSave={handleSave} onClose={()=>{setModal(false);setForm(FORM_EMPTY);}} saving={saving} classes={classes} subjects={subjects} examTypes={examTypes}/>}
    </div>
  );
}