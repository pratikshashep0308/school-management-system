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
function RecentExams({ exams }) {
  const now     = new Date();
  const weekAgo = new Date(now - 7*24*60*60*1000);

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
        {items.map(e=><ExamCard key={e._id} exam={e} canEdit={false}/>)}
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
// TAB: EXAM TIMETABLE — 2 rows: Row 1 = Subject names, Row 2 = Date & Time
// ══════════════════════════════════════════════════════════════════════════════
function ExamTimetable({ exams, classes, subjects, canEdit, onEdit, onDelete, onAdd }) {
  const [classF,     setClassF]     = useState('');
  const [typeF,      setTypeF]      = useState('');
  const [search,     setSearch]     = useState('');
  const [exporting,  setExporting]  = useState(false);

  const exportPDF = async (rows) => {
    setExporting(true);
    try {
      // Load jsPDF dynamically from CDN
      if (!window.jspdf || !window.jspdf.jsPDF.prototype.autoTable) {
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf/2.5.1/jspdf.umd.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
        await new Promise((res, rej) => {
          const s = document.createElement('script');
          s.src = 'https://cdnjs.cloudflare.com/ajax/libs/jspdf-autotable/3.8.2/jspdf.plugin.autotable.min.js';
          s.onload = res; s.onerror = rej;
          document.head.appendChild(s);
        });
      }

      const { jsPDF } = window.jspdf;
      const doc = new jsPDF({ orientation:'landscape', unit:'mm', format:'a4' });

      // Title
      doc.setFontSize(16);
      doc.setFont(undefined, 'bold');
      doc.text('Exam Timetable', 14, 16);
      doc.setFontSize(10);
      doc.setFont(undefined, 'normal');
      doc.setTextColor(100);
      doc.text(`The Future Step School  ·  Generated: ${new Date().toLocaleDateString('en-IN', { day:'numeric', month:'long', year:'numeric' })}`, 14, 23);
      if (classF) {
        const cls = classes.find(c=>c._id===classF);
        if (cls) doc.text(`Class: ${cls.name} ${cls.section||''}`, 14, 28);
      }

      doc.setTextColor(0);

      // Table
      doc.autoTable({
        startY: classF ? 33 : 28,
        head: [['Date','Day','Subject','Exam Name','Class','Type','Time','Total','Pass','Status']],
        body: rows.map(e => {
          const d    = new Date(e.date);
          const diff = Math.ceil((d - new Date()) / 86400000);
          const past = d < new Date() && d.toDateString() !== new Date().toDateString();
          const status = past ? 'Done' : diff === 0 ? 'Today' : diff <= 3 ? `In ${diff}d (Urgent)` : `In ${diff}d`;
          return [
            `${d.getDate()} ${d.toLocaleString('default',{month:'short'})} ${d.getFullYear()}`,
            d.toLocaleString('default',{weekday:'short'}),
            e.subject?.name || '—',
            e.name,
            `${e.class?.name||''} ${e.class?.section||''}`.trim(),
            e.examType,
            e.startTime ? `${e.startTime}${e.endTime?' – '+e.endTime:''}` : '—',
            e.totalMarks,
            e.passingMarks,
            status,
          ];
        }),
        styles:      { fontSize:9, cellPadding:3 },
        headStyles:  { fillColor:[11,31,74], textColor:255, fontStyle:'bold', fontSize:9 },
        alternateRowStyles: { fillColor:[248,250,252] },
        columnStyles: {
          0: { cellWidth:28 },
          1: { cellWidth:14 },
          2: { cellWidth:26 },
          3: { cellWidth:48 },
          4: { cellWidth:20 },
          5: { cellWidth:20 },
          6: { cellWidth:30 },
          7: { cellWidth:14, halign:'center' },
          8: { cellWidth:12, halign:'center' },
          9: { cellWidth:22 },
        },
        didParseCell: (data) => {
          if (data.section === 'body' && data.column.index === 9) {
            const val = data.cell.text[0] || '';
            if (val === 'Done') data.cell.styles.textColor = [107,114,128];
            else if (val === 'Today') data.cell.styles.textColor = [146,64,14];
            else if (val.includes('Urgent')) data.cell.styles.textColor = [220,38,38];
            else data.cell.styles.textColor = [22,163,74];
          }
        },
      });

      // Footer
      const pageCount = doc.internal.getNumberOfPages();
      for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(8);
        doc.setTextColor(150);
        doc.text(`Page ${i} of ${pageCount}  ·  The Future Step School`, 14, doc.internal.pageSize.height - 8);
      }

      doc.save(`exam-timetable-${new Date().toISOString().split('T')[0]}.pdf`);
      toast.success('PDF downloaded!');
    } catch (err) {
      console.error(err);
      toast.error('PDF export failed');
    } finally { setExporting(false); }
  };

  const rows = exams
    .filter(e => e.date)
    .filter(e => !classF || e.class?._id === classF)
    .filter(e => !typeF  || e.examType === typeF)
    .filter(e => !search || e.name?.toLowerCase().includes(search.toLowerCase()) || e.subject?.name?.toLowerCase().includes(search.toLowerCase()))
    .sort((a,b) => new Date(a.date) - new Date(b.date));

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div>
      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <input placeholder="🔍 Search exam or subject…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ ...SEL, minWidth:200 }}/>
        <select value={classF} onChange={e=>setClassF(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <select value={typeF} onChange={e=>setTypeF(e.target.value)} style={SEL}>
          <option value="">All Types</option>
          {TYPE_LIST.map(t=><option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
        <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:10 }}>
          <span style={{ fontSize:12, color:'#9CA3AF' }}>{rows.length} exams</span>
          {canEdit && (
            <button onClick={onAdd}
              style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700, background:'#1D4ED8', color:'#fff', border:'none', cursor:'pointer' }}>
              + Add Exam
            </button>
          )}
          <button onClick={()=>exportPDF(rows)} disabled={exporting||!rows.length}
            style={{
              padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700,
              background: exporting||!rows.length?'#F3F4F6':'#DC2626',
              color: exporting||!rows.length?'#9CA3AF':'#fff',
              border:'none', cursor: exporting||!rows.length?'not-allowed':'pointer',
              display:'flex', alignItems:'center', gap:6,
            }}>
            {exporting ? '⏳ Generating…' : '⬇ Download PDF'}
          </button>
        </div>
      </div>

      {!rows.length ? (
        <EmptyState icon="🗓" title="No exams found" subtitle="Create exams with dates to see the timetable" />
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
                  const now    = new Date();
                  const diff   = Math.ceil((d - now) / 86400000);
                  const isToday= d.toDateString() === now.toDateString();
                  const past   = d < now && !isToday;
                  const tc     = TYPE_COLORS[e.examType] || TYPE_COLORS.unit;

                  const status = past
                    ? { label:'✅ Done',     bg:'#F3F4F6', color:'#6B7280' }
                    : isToday
                    ? { label:'📌 Today',    bg:'#FEF3C7', color:'#92400E' }
                    : diff <= 3
                    ? { label:`🔴 In ${diff}d`, bg:'#FEF2F2', color:'#DC2626' }
                    : diff <= 7
                    ? { label:`🟡 In ${diff}d`, bg:'#FFFBEB', color:'#D97706' }
                    : { label:`🟢 In ${diff}d`, bg:'#F0FDF4', color:'#16A34A' };

                  return (
                    <tr key={e._id} style={{ borderBottom:'1px solid #F3F4F6', background:isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff' }}
                      onMouseEnter={ev=>ev.currentTarget.style.background=isToday?'#FEF3C7':'#F0F7FF'}
                      onMouseLeave={ev=>ev.currentTarget.style.background=isToday?'#FFFBEB':i%2?'#FAFAFA':'#fff'}>

                      {/* Date */}
                      <td style={{ padding:'12px 16px', whiteSpace:'nowrap' }}>
                        <div style={{ fontWeight:800, fontSize:15, color:'#111827' }}>
                          {d.getDate()} {d.toLocaleString('default',{month:'short'})}
                        </div>
                        <div style={{ fontSize:10, color:'#9CA3AF' }}>{d.getFullYear()}</div>
                      </td>

                      {/* Day */}
                      <td style={{ padding:'12px 16px', color:'#6B7280', fontSize:12, fontWeight:600 }}>
                        {d.toLocaleString('default',{weekday:'short'})}
                      </td>

                      {/* Subject */}
                      <td style={{ padding:'12px 16px', fontWeight:700, color:'#111827' }}>
                        {e.subject?.name || '—'}
                      </td>

                      {/* Exam Name */}
                      <td style={{ padding:'12px 16px' }}>
                        <div style={{ fontWeight:600, color:'#374151' }}>{e.name}</div>
                        {e.instructions && <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>{e.instructions}</div>}
                      </td>

                      {/* Class */}
                      <td style={{ padding:'12px 16px', whiteSpace:'nowrap', color:'#374151' }}>
                        {e.class?.name} {e.class?.section||''}
                      </td>

                      {/* Type */}
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:tc.color, background:tc.bg, border:`1px solid ${tc.border}50`, padding:'3px 10px', borderRadius:20 }}>
                          {e.examType}
                        </span>
                      </td>

                      {/* Time */}
                      <td style={{ padding:'12px 16px', color:'#6B7280', fontSize:12, whiteSpace:'nowrap' }}>
                        {e.startTime||'—'}{e.endTime?` – ${e.endTime}`:''}
                      </td>

                      {/* Marks */}
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontWeight:800, color:'#111827' }}>{e.totalMarks}</span>
                        <span style={{ fontSize:10, color:'#16A34A', marginLeft:4 }}>/{e.passingMarks}</span>
                      </td>

                      {/* Status */}
                      <td style={{ padding:'12px 16px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:status.color, background:status.bg, padding:'4px 10px', borderRadius:20, whiteSpace:'nowrap' }}>
                          {status.label}
                        </span>
                      </td>

                      {/* Actions */}
                      {canEdit&&(
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
        <RecentExams exams={exams} />
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