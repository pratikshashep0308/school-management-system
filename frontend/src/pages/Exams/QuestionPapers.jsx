// frontend/src/pages/Exams/QuestionPapers.jsx
//
// Question Paper Management — an internal section of the Exam Dashboard hub (not
// a sidebar item). Full flow, all against the real /api/question-papers API:
//
//   • List existing papers with filters (class, subject, exam, type, difficulty)
//   • Create / Edit a paper: pick Academic Year → Exam → Class → Section →
//     Subject; add questions of any supported type; reorder; live totals
//   • Question types: MCQ, True/False, Fill-in-the-blank, Short, Long, Match
//   • Duplicate, Delete, Save Draft, Publish
//   • Preview and Print / Download PDF (browser print, no CDN needed)
//   • Question Bank: browse/filter reusable questions and pull them into a paper;
//     save a paper's question back to the bank for reuse
//
// RBAC is enforced server-side (create/edit = staff, publish/delete = admin);
// the UI also hides admin-only actions from non-admins via `isAdmin`.

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import examAdvAPI from '../../utils/examAPI';
import { classAPI, subjectAPI, uploadAPI } from '../../utils/api';
import { calendarAPI } from '../../utils/tfsAPI';
import { LoadingState, EmptyState } from '../../components/ui';

const CARD = { background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:20 };
const INP  = { width:'100%', padding:'9px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' };
const LBL  = { display:'block', fontSize:10.5, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 };
const BTN  = { padding:'9px 18px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer', background:'#1D4ED8', color:'#fff' };
const GHOST= { ...BTN, background:'#fff', color:'#374151', border:'1.5px solid #E5E7EB' };

const TYPE_LABELS = {
  mcq:'MCQ', truefalse:'True / False', fillblank:'Fill in the Blank',
  short:'Short Answer', long:'Long Answer', match:'Match the Following',
};
const DIFF_TINT = { easy:'#059669', medium:'#D97706', hard:'#DC2626' };

const emptyQuestion = (order = 0) => ({
  text:'', type:'mcq', marks:1, difficulty:'medium', instructions:'', imageUrl:'',
  options:['', '', '', ''], correctAnswer:'', matchPairs:[{ left:'', right:'' }], order,
});

function printPaper(paper) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Please allow pop-ups to print'); return; }
  const totalMarks = (paper.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);
  const rows = (paper.questions || []).map((q, i) => {
    let body = '';
    if (q.type === 'mcq') {
      body = '<ol type="A" class="opts">' + (q.options || []).filter(Boolean).map(o => `<li>${esc(o)}</li>`).join('') + '</ol>';
    } else if (q.type === 'truefalse') {
      body = '<div class="opts">True &nbsp;/&nbsp; False</div>';
    } else if (q.type === 'match') {
      body = '<table class="match"><tr><th>Column A</th><th>Column B</th></tr>' +
        (q.matchPairs || []).map(p => `<tr><td>${esc(p.left)}</td><td>${esc(p.right)}</td></tr>`).join('') + '</table>';
    }
    const instr = q.instructions ? `<div class="instr">${esc(q.instructions)}</div>` : '';
    const img = q.imageUrl ? `<div class="qimg"><img src="${esc(q.imageUrl)}" alt=""/></div>` : '';
    return `<div class="q"><div class="qhead"><span class="qno">Q${i + 1}.</span>
      <span class="qtext">${esc(q.text)}</span><span class="qmarks">[${q.marks}]</span></div>${instr}${img}${body}</div>`;
  }).join('');
  w.document.write(`<html><head><title>${esc(paper.title)}</title><style>
    *{font-family:'Times New Roman',serif;} body{margin:32px;}
    .head{text-align:center;border-bottom:2px solid #000;padding-bottom:8px;margin-bottom:12px;}
    .head h1{margin:0;font-size:20px;} .meta{display:flex;justify-content:space-between;font-size:13px;margin:8px 0 16px;}
    .gi{font-size:12px;font-style:italic;margin-bottom:16px;border:1px solid #ccc;padding:8px;}
    .q{margin-bottom:14px;} .qhead{display:flex;gap:8px;font-size:14px;}
    .qno{font-weight:bold;} .qtext{flex:1;} .qmarks{font-weight:bold;}
    .opts{margin:4px 0 0 32px;font-size:13px;} .instr{margin-left:32px;font-size:12px;color:#444;font-style:italic;}
    .qimg{margin:6px 0 0 32px;} .qimg img{max-width:320px;max-height:240px;border:1px solid #ccc;}
    table.match{margin:6px 0 0 32px;border-collapse:collapse;font-size:13px;}
    table.match th,table.match td{border:1px solid #999;padding:4px 12px;text-align:left;}
    @media print{.noprint{display:none;}} .noprint{margin-bottom:12px;} button{padding:6px 14px;cursor:pointer;}
  </style></head><body>
    <div class="noprint"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
    <div class="head"><h1>${esc(paper.title)}</h1>
      <div>${esc(paper.class?.name || '')} ${esc(paper.class?.section || paper.section || '')} · ${esc(paper.subject?.name || '')}</div></div>
    <div class="meta"><span>Time: ${paper.durationMinutes || '__'} min</span><span>Maximum Marks: ${totalMarks}</span></div>
    ${paper.generalInstructions ? `<div class="gi">${esc(paper.generalInstructions)}</div>` : ''}
    ${rows}
  </body></html>`);
  w.document.close();
}
function esc(s) { return String(s ?? '').replace(/[&<>]/g, c => ({ '&':'&amp;','<':'&lt;','>':'&gt;' }[c])); }

// ══════════════════════════════════════════════════════ QUESTION EDITOR ══════
function QuestionEditor({ q, index, onChange, onRemove, onMove, onSaveToBank, isFirst, isLast }) {
  const [uploading, setUploading] = useState(false);
  const set = (patch) => onChange({ ...q, ...patch });
  const setOpt = (i, v) => { const o = [...(q.options || [])]; o[i] = v; set({ options:o }); };
  const setPair = (i, k, v) => { const p = [...(q.matchPairs || [])]; p[i] = { ...p[i], [k]:v }; set({ matchPairs:p }); };

  const uploadImage = async (file) => {
    if (!file) return;
    if (!file.type.startsWith('image/')) return toast.error('Please choose an image file');
    setUploading(true);
    try {
      const r = await uploadAPI.attachment(file);
      set({ imageUrl: r.data.data?.url || '' });
      toast.success('Image added');
    } catch (e) { toast.error(e.response?.data?.message || 'Upload failed'); }
    finally { setUploading(false); }
  };

  return (
    <div style={{ ...CARD, padding:16, borderLeft:`4px solid ${DIFF_TINT[q.difficulty] || '#9CA3AF'}` }}>
      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:12, flexWrap:'wrap' }}>
        <span style={{ fontWeight:800, fontSize:14 }}>Q{index + 1}</span>
        <select value={q.type} onChange={e=>set({ type:e.target.value })} style={{ ...INP, width:'auto', padding:'5px 8px' }}>
          {Object.entries(TYPE_LABELS).map(([k,v]) => <option key={k} value={k}>{v}</option>)}
        </select>
        <select value={q.difficulty} onChange={e=>set({ difficulty:e.target.value })} style={{ ...INP, width:'auto', padding:'5px 8px' }}>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        <label style={{ fontSize:12, color:'#6B7280', display:'flex', alignItems:'center', gap:4 }}>
          Marks <input type="number" min="0" value={q.marks} onChange={e=>set({ marks:Number(e.target.value) })} style={{ ...INP, width:60, padding:'5px 8px' }}/>
        </label>
        <div style={{ marginLeft:'auto', display:'flex', gap:4 }}>
          <button title="Move up"   disabled={isFirst} onClick={()=>onMove(index, -1)} style={{ ...GHOST, padding:'5px 9px', opacity:isFirst?0.4:1 }}>↑</button>
          <button title="Move down" disabled={isLast}  onClick={()=>onMove(index, 1)}  style={{ ...GHOST, padding:'5px 9px', opacity:isLast?0.4:1 }}>↓</button>
          <button title="Save to bank" onClick={()=>onSaveToBank(q)} style={{ ...GHOST, padding:'5px 9px' }}>🏦</button>
          <button title="Remove" onClick={()=>onRemove(index)} style={{ ...GHOST, padding:'5px 9px', color:'#DC2626', borderColor:'#FCA5A5', background:'#FEF2F2' }}>✕</button>
        </div>
      </div>

      <textarea value={q.text} onChange={e=>set({ text:e.target.value })} placeholder="Question text…"
        rows={2} style={{ ...INP, resize:'vertical', marginBottom:10 }}/>

      {/* Optional image — uploaded via the shared /uploads endpoint. Any type. */}
      <div style={{ marginBottom:10 }}>
        {q.imageUrl ? (
          <div style={{ display:'flex', alignItems:'flex-start', gap:10 }}>
            <img src={q.imageUrl} alt="" style={{ maxWidth:180, maxHeight:130, borderRadius:8, border:'1px solid #E5E7EB' }}/>
            <button onClick={()=>set({ imageUrl:'' })} style={{ ...GHOST, padding:'5px 10px', fontSize:12, color:'#DC2626', borderColor:'#FCA5A5', background:'#FEF2F2' }}>Remove image</button>
          </div>
        ) : (
          <label style={{ ...GHOST, display:'inline-flex', alignItems:'center', gap:6, padding:'6px 12px', fontSize:12, cursor:'pointer' }}>
            {uploading ? 'Uploading…' : '🖼 Add image'}
            <input type="file" accept="image/*" style={{ display:'none' }} disabled={uploading}
              onChange={e=>{ uploadImage(e.target.files?.[0]); e.target.value=''; }}/>
          </label>
        )}
      </div>

      {q.type === 'mcq' && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:10 }}>
          {(q.options || ['', '', '', '']).map((opt, i) => (
            <div key={i} style={{ display:'flex', alignItems:'center', gap:6 }}>
              <input type="radio" name={`correct-${q.order}`} checked={q.correctAnswer === String(i)}
                onChange={()=>set({ correctAnswer:String(i) })} title="Mark correct"/>
              <input value={opt} onChange={e=>setOpt(i, e.target.value)} placeholder={`Option ${String.fromCharCode(65 + i)}`} style={INP}/>
            </div>
          ))}
        </div>
      )}

      {q.type === 'truefalse' && (
        <div style={{ display:'flex', gap:16, marginBottom:10, fontSize:13 }}>
          {['True','False'].map(v => (
            <label key={v} style={{ display:'flex', alignItems:'center', gap:5 }}>
              <input type="radio" name={`tf-${q.order}`} checked={q.correctAnswer === v} onChange={()=>set({ correctAnswer:v })}/> {v}
            </label>
          ))}
        </div>
      )}

      {(q.type === 'fillblank' || q.type === 'short' || q.type === 'long') && (
        <input value={q.correctAnswer} onChange={e=>set({ correctAnswer:e.target.value })}
          placeholder={q.type === 'long' ? 'Model answer / key points (optional)' : 'Correct answer (optional)'}
          style={{ ...INP, marginBottom:10 }}/>
      )}

      {q.type === 'match' && (
        <div style={{ marginBottom:10 }}>
          {(q.matchPairs || []).map((p, i) => (
            <div key={i} style={{ display:'flex', gap:8, marginBottom:6 }}>
              <input value={p.left}  onChange={e=>setPair(i,'left',e.target.value)}  placeholder="Column A" style={INP}/>
              <input value={p.right} onChange={e=>setPair(i,'right',e.target.value)} placeholder="Column B" style={INP}/>
              <button onClick={()=>set({ matchPairs:q.matchPairs.filter((_,x)=>x!==i) })} style={{ ...GHOST, padding:'5px 10px' }}>✕</button>
            </div>
          ))}
          <button onClick={()=>set({ matchPairs:[...(q.matchPairs||[]), { left:'', right:'' }] })} style={{ ...GHOST, padding:'5px 12px', fontSize:12 }}>+ Add pair</button>
        </div>
      )}

      <input value={q.instructions} onChange={e=>set({ instructions:e.target.value })}
        placeholder="Instructions for this question (optional)" style={{ ...INP, fontSize:12 }}/>
    </div>
  );
}

// ══════════════════════════════════════════════════════════ BANK PICKER ══════
function BankPicker({ open, onClose, onPick, defaultClass, defaultSubject, meta }) {
  const [items, setItems]   = useState([]);
  const [loading, setLoad]  = useState(false);
  const [f, setF] = useState({ class:defaultClass || '', subject:defaultSubject || '', type:'', difficulty:'', q:'' });

  const load = useCallback(async () => {
    setLoad(true);
    try {
      const params = {};
      Object.entries(f).forEach(([k,v]) => { if (v) params[k] = v; });
      const r = await examAdvAPI.bankList(params);
      setItems(r.data.data || []);
    } catch { toast.error('Failed to load question bank'); }
    finally { setLoad(false); }
  }, [f]);

  useEffect(() => { if (open) load(); }, [open, load]);
  if (!open) return null;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:400, display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div onClick={onClose} style={{ position:'absolute', inset:0, background:'rgba(0,0,0,0.45)' }}/>
      <div style={{ position:'relative', background:'#fff', borderRadius:16, width:'100%', maxWidth:720, maxHeight:'88vh', display:'flex', flexDirection:'column' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'16px 22px', borderBottom:'1px solid #E5E7EB' }}>
          <h3 style={{ margin:0, fontSize:17, fontWeight:800 }}>🏦 Question Bank</h3>
          <button onClick={onClose} style={{ ...GHOST, padding:'4px 10px' }}>×</button>
        </div>
        <div style={{ padding:'12px 22px', borderBottom:'1px solid #F3F4F6', display:'flex', gap:8, flexWrap:'wrap' }}>
          <input placeholder="Search text…" value={f.q} onChange={e=>setF({ ...f, q:e.target.value })} style={{ ...INP, width:180 }}/>
          <select value={f.type} onChange={e=>setF({ ...f, type:e.target.value })} style={{ ...INP, width:'auto' }}>
            <option value="">Any type</option>
            {(meta.questionTypes || []).map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
          </select>
          <select value={f.difficulty} onChange={e=>setF({ ...f, difficulty:e.target.value })} style={{ ...INP, width:'auto' }}>
            <option value="">Any difficulty</option>
            <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
          </select>
        </div>
        <div style={{ padding:'12px 22px', overflowY:'auto', flex:1 }}>
          {loading ? <LoadingState /> : !items.length ? (
            <EmptyState icon="🏦" title="No questions" subtitle="No bank questions match — add some from the editor with the 🏦 button" />
          ) : items.map(it => (
            <div key={it._id} style={{ ...CARD, padding:12, marginBottom:8, display:'flex', gap:12, alignItems:'center' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ fontSize:13, fontWeight:600 }}>{it.text}</div>
                <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>
                  {TYPE_LABELS[it.type] || it.type} · {it.difficulty} · {it.marks} mark(s)
                  {it.subject?.name ? ` · ${it.subject.name}` : ''}
                </div>
              </div>
              <button onClick={()=>onPick(it)} style={{ ...BTN, padding:'6px 14px' }}>+ Add</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

// ══════════════════════════════════════════════════════════════ EDITOR ═══════
function PaperEditor({ paper, onBack, onSaved, classes, subjects, groups, years, meta, isAdmin }) {
  const isNew = !paper?._id;
  const [form, setForm] = useState(() => paper?._id ? {
    ...paper,
    academicYear: paper.academicYear?._id || paper.academicYear || '',
    examGroup:    paper.examGroup?._id || paper.examGroup || '',
    class:        paper.class?._id || paper.class || '',
    subject:      paper.subject?._id || paper.subject || '',
  } : {
    title:'', academicYear:'', examGroup:'', class:'', section:'', subject:'',
    durationMinutes:180, generalInstructions:'', questions:[], status:'draft',
  });
  const [saving, setSaving] = useState(false);
  const [bankOpen, setBankOpen] = useState(false);

  const set = (patch) => setForm(f => ({ ...f, ...patch }));
  const totalMarks = (form.questions || []).reduce((s, q) => s + (Number(q.marks) || 0), 0);

  const setQuestion = (i, q) => setForm(f => ({ ...f, questions:f.questions.map((x, idx) => idx === i ? q : x) }));
  const addQuestion = () => setForm(f => ({ ...f, questions:[...f.questions, emptyQuestion(f.questions.length)] }));
  const removeQuestion = (i) => setForm(f => ({ ...f, questions:f.questions.filter((_, idx) => idx !== i) }));
  const moveQuestion = (i, dir) => setForm(f => {
    const arr = [...f.questions]; const j = i + dir;
    if (j < 0 || j >= arr.length) return f;
    [arr[i], arr[j]] = [arr[j], arr[i]];
    return { ...f, questions:arr };
  });

  const pickFromBank = (it) => {
    const q = {
      text:it.text, type:it.type, marks:it.marks, difficulty:it.difficulty,
      instructions:it.instructions || '', imageUrl:it.imageUrl || '', options:it.options || ['', '', '', ''],
      correctAnswer:it.correctAnswer || '', matchPairs:it.matchPairs || [{ left:'', right:'' }],
      order:(form.questions || []).length,
    };
    setForm(f => ({ ...f, questions:[...f.questions, q] }));
    toast.success('Question added from bank');
  };

  const saveToBank = async (q) => {
    if (!q.text?.trim()) return toast.error('Add question text before saving to bank');
    try {
      await examAdvAPI.bankCreate({
        text:q.text, type:q.type, marks:q.marks, difficulty:q.difficulty,
        instructions:q.instructions, imageUrl:q.imageUrl, options:q.options, correctAnswer:q.correctAnswer,
        matchPairs:q.matchPairs, class:form.class || undefined, subject:form.subject || undefined,
      });
      toast.success('Saved to question bank');
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to save to bank'); }
  };

  const save = async (publish = false) => {
    if (!form.title?.trim()) return toast.error('Title is required');
    if (!form.class)   return toast.error('Please select a class');
    if (!form.subject) return toast.error('Please select a subject');
    setSaving(true);
    try {
      const payload = {
        ...form,
        academicYear:form.academicYear || undefined,
        examGroup:form.examGroup || undefined,
      };
      let saved;
      if (isNew) saved = (await examAdvAPI.qpCreate(payload)).data.data;
      else       saved = (await examAdvAPI.qpUpdate(form._id, payload)).data.data;

      if (publish) {
        await examAdvAPI.qpPublish(saved._id, true);
        toast.success('Question paper published');
      } else {
        toast.success(isNew ? 'Draft created' : 'Draft saved');
      }
      onSaved();
    } catch (e) { toast.error(e.response?.data?.message || 'Failed to save'); }
    finally { setSaving(false); }
  };

  const preview = () => {
    const cls = classes.find(c => c._id === form.class);
    const subj = subjects.find(s => s._id === form.subject);
    printPaper({ ...form, class:cls, subject:subj });
  };

  return (
    <div>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, flexWrap:'wrap' }}>
        <button onClick={onBack} style={GHOST}>← Back</button>
        <h3 style={{ margin:0, fontSize:18, fontWeight:800 }}>{isNew ? 'New Question Paper' : 'Edit Question Paper'}</h3>
        <div style={{ marginLeft:'auto', display:'flex', gap:8, flexWrap:'wrap' }}>
          <button onClick={()=>setBankOpen(true)} style={GHOST}>🏦 Question Bank</button>
          <button onClick={preview} style={GHOST}>👁 Preview / PDF</button>
          <button onClick={()=>save(false)} disabled={saving} style={GHOST}>{saving ? 'Saving…' : '💾 Save Draft'}</button>
          {isAdmin && <button onClick={()=>save(true)} disabled={saving} style={BTN}>✅ Publish</button>}
        </div>
      </div>

      {/* Context: Academic Year → Exam → Class → Section → Subject */}
      <div style={{ ...CARD, marginBottom:16 }}>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(160px,1fr))', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={LBL}>Paper Title *</label>
            <input value={form.title} onChange={e=>set({ title:e.target.value })} placeholder="e.g. Mathematics — Unit Test 1" style={INP}/>
          </div>
          <div>
            <label style={LBL}>Academic Year</label>
            <select value={form.academicYear} onChange={e=>set({ academicYear:e.target.value })} style={INP}>
              <option value="">—</option>
              {years.map(y => <option key={y._id} value={y._id}>{y.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Exam</label>
            <select value={form.examGroup} onChange={e=>set({ examGroup:e.target.value })} style={INP}>
              <option value="">—</option>
              {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Class *</label>
            <select value={form.class} onChange={e=>set({ class:e.target.value })} style={INP}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Section</label>
            <input value={form.section} onChange={e=>set({ section:e.target.value })} placeholder="optional" style={INP}/>
          </div>
          <div>
            <label style={LBL}>Subject *</label>
            <select value={form.subject} onChange={e=>set({ subject:e.target.value })} style={INP}>
              <option value="">Select subject</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </div>
          <div>
            <label style={LBL}>Duration (min)</label>
            <input type="number" min="0" value={form.durationMinutes} onChange={e=>set({ durationMinutes:Number(e.target.value) })} style={INP}/>
          </div>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={LBL}>General Instructions</label>
            <textarea rows={2} value={form.generalInstructions} onChange={e=>set({ generalInstructions:e.target.value })} style={{ ...INP, resize:'vertical' }}/>
          </div>
        </div>
      </div>

      {/* Summary bar */}
      <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
        {[['Total Questions', (form.questions || []).length], ['Total Marks', totalMarks], ['Duration', `${form.durationMinutes || 0} min`]].map(([l, v]) => (
          <div key={l} style={{ ...CARD, padding:'12px 20px', flex:1, minWidth:140 }}>
            <div style={{ fontSize:22, fontWeight:900, color:'#1D4ED8' }}>{v}</div>
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>{l}</div>
          </div>
        ))}
      </div>

      {/* Questions */}
      <div style={{ display:'flex', flexDirection:'column', gap:12 }}>
        {(form.questions || []).map((q, i) => (
          <QuestionEditor key={i} q={q} index={i}
            onChange={(nq)=>setQuestion(i, nq)} onRemove={removeQuestion} onMove={moveQuestion}
            onSaveToBank={saveToBank} isFirst={i === 0} isLast={i === form.questions.length - 1}/>
        ))}
      </div>

      <div style={{ display:'flex', gap:10, marginTop:14 }}>
        <button onClick={addQuestion} style={BTN}>+ Add Question</button>
        <button onClick={()=>setBankOpen(true)} style={GHOST}>🏦 Pull from Bank</button>
      </div>

      <BankPicker open={bankOpen} onClose={()=>setBankOpen(false)} onPick={pickFromBank}
        defaultClass={form.class} defaultSubject={form.subject} meta={meta}/>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════ MAIN ════════
export default function QuestionPapers({ groups, isAdmin, canEdit }) {
  const [papers, setPapers]   = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [years, setYears]     = useState([]);
  const [meta, setMeta]       = useState({ questionTypes:[], difficulties:[] });
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);   // paper object or {} for new, or null for list
  const [filters, setFilters] = useState({ class:'', subject:'', examGroup:'', type:'', difficulty:'' });

  const loadPapers = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      ['class','subject','examGroup','status'].forEach(k => { if (filters[k]) params[k] = filters[k]; });
      const r = await examAdvAPI.qpList(params);
      setPapers(r.data.data || []);
    } catch { toast.error('Failed to load question papers'); }
    finally { setLoading(false); }
  }, [filters]);

  useEffect(() => {
    (async () => {
      try {
        const [c, s, m] = await Promise.all([classAPI.getAll(), subjectAPI.getAll(), examAdvAPI.qpMeta()]);
        setClasses(c.data.data || []);
        setSubjects(s.data.data || []);
        setMeta(m.data.data || { questionTypes:[], difficulties:[] });
      } catch { /* selectors degrade gracefully */ }
      try { const y = await calendarAPI.listYears(); setYears(y.data.data || y.data.years || []); }
      catch { setYears([]); }
    })();
  }, []);

  useEffect(() => { loadPapers(); }, [loadPapers]);

  // Client-side type/difficulty filter (paper matches if ANY question matches),
  // since those live inside the embedded questions.
  const visible = papers.filter(p => {
    if (filters.type && !(p.questions || []).some(q => q.type === filters.type)) return false;
    if (filters.difficulty && !(p.questions || []).some(q => q.difficulty === filters.difficulty)) return false;
    return true;
  });

  const doDuplicate = async (id) => {
    try { await examAdvAPI.qpDuplicate(id); toast.success('Paper duplicated'); loadPapers(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to duplicate'); }
  };
  const doDelete = async (p) => {
    if (!window.confirm(`Delete "${p.title}"? This cannot be undone.`)) return;
    try { await examAdvAPI.qpDelete(p._id); toast.success('Deleted'); loadPapers(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed to delete'); }
  };
  const doPublishToggle = async (p) => {
    try { await examAdvAPI.qpPublish(p._id, p.status !== 'published'); toast.success('Updated'); loadPapers(); }
    catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
  };
  const openPrint = async (p) => {
    try { const r = await examAdvAPI.qpGet(p._id); printPaper(r.data.data); }
    catch { toast.error('Failed to open paper'); }
  };
  const openEdit = async (p) => {
    try { const r = await examAdvAPI.qpGet(p._id); setEditing(r.data.data); }
    catch { toast.error('Failed to open paper'); }
  };

  if (editing !== null) {
    return (
      <PaperEditor paper={editing} onBack={()=>setEditing(null)}
        onSaved={()=>{ setEditing(null); loadPapers(); }}
        classes={classes} subjects={subjects} groups={groups} years={years} meta={meta} isAdmin={isAdmin}/>
    );
  }

  const SEL = { ...INP, width:'auto' };
  return (
    <div>
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', alignItems:'center', marginBottom:16 }}>
        <select value={filters.class} onChange={e=>setFilters({ ...filters, class:e.target.value })} style={SEL}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
        </select>
        <select value={filters.subject} onChange={e=>setFilters({ ...filters, subject:e.target.value })} style={SEL}>
          <option value="">All Subjects</option>
          {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
        <select value={filters.examGroup} onChange={e=>setFilters({ ...filters, examGroup:e.target.value })} style={SEL}>
          <option value="">All Exams</option>
          {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
        <select value={filters.type} onChange={e=>setFilters({ ...filters, type:e.target.value })} style={SEL}>
          <option value="">All Types</option>
          {(meta.questionTypes || []).map(t => <option key={t} value={t}>{TYPE_LABELS[t] || t}</option>)}
        </select>
        <select value={filters.difficulty} onChange={e=>setFilters({ ...filters, difficulty:e.target.value })} style={SEL}>
          <option value="">All Difficulty</option>
          <option value="easy">Easy</option><option value="medium">Medium</option><option value="hard">Hard</option>
        </select>
        {canEdit && <button onClick={()=>setEditing({})} style={{ ...BTN, marginLeft:'auto' }}>+ Create Question Paper</button>}
      </div>

      {loading ? <LoadingState /> : !visible.length ? (
        <EmptyState icon="📄" title="No question papers" subtitle="Create a question paper, or adjust the filters" />
      ) : (
        <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
          {visible.map(p => (
            <div key={p._id} style={{ ...CARD, display:'flex', alignItems:'center', gap:16, flexWrap:'wrap', padding:'16px 20px' }}>
              <div style={{ flex:1, minWidth:0 }}>
                <div style={{ display:'flex', alignItems:'center', gap:8, flexWrap:'wrap', marginBottom:4 }}>
                  <span style={{ fontWeight:700, fontSize:15 }}>{p.title}</span>
                  <span style={{ fontSize:11, fontWeight:700, color:'#fff', background:p.status === 'published' ? '#7C3AED' : '#6B7280', padding:'2px 8px', borderRadius:20 }}>{p.status}</span>
                </div>
                <div style={{ fontSize:13, color:'#6B7280' }}>
                  {p.class?.name || ''} {p.class?.section || p.section || ''} · {p.subject?.name || ''}
                  {p.examGroup?.name ? ` · ${p.examGroup.name}` : ''}
                  &nbsp;·&nbsp; {p.totalQuestions ?? (p.questions || []).length} Qs · {p.totalMarks ?? 0} marks · {p.durationMinutes || 0} min
                </div>
              </div>
              <div style={{ display:'flex', gap:6, flexShrink:0, flexWrap:'wrap' }}>
                <button onClick={()=>openPrint(p)} style={{ ...GHOST, padding:'6px 12px', fontSize:12 }}>👁 PDF</button>
                {canEdit && <button onClick={()=>openEdit(p)} style={{ ...GHOST, padding:'6px 12px', fontSize:12 }}>✎ Edit</button>}
                {canEdit && <button onClick={()=>doDuplicate(p._id)} style={{ ...GHOST, padding:'6px 12px', fontSize:12 }}>⧉ Duplicate</button>}
                {isAdmin && <button onClick={()=>doPublishToggle(p)} style={{ ...GHOST, padding:'6px 12px', fontSize:12 }}>{p.status === 'published' ? '↩ Unpublish' : '✅ Publish'}</button>}
                {isAdmin && <button onClick={()=>doDelete(p)} style={{ ...GHOST, padding:'6px 12px', fontSize:12, color:'#DC2626', borderColor:'#FCA5A5', background:'#FEF2F2' }}>✕</button>}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
