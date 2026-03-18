import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { examAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, LoadingState, EmptyState } from '../components/ui';

const TYPE_COLORS = { unit: 'bg-gold/15 text-gold', midterm: 'bg-accent/10 text-accent', final: 'bg-purple-50 text-purple-600', practical: 'bg-sage/10 text-sage', assignment: 'bg-blue-50 text-blue-600' };

export default function Exams() {
  const { isAdmin, isTeacher } = useAuth();
  const [exams, setExams] = useState([]);
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [loading, setLoading] = useState(true);
  const [modal, setModal] = useState({ open: false, data: null });
  const [filter, setFilter] = useState('');

  const load = async () => {
    setLoading(true);
    try {
      const [eRes, cRes, sRes] = await Promise.all([examAPI.getAll(), classAPI.getAll(), subjectAPI.getAll()]);
      setExams(eRes.data.data);
      setClasses(cRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load exams'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const handleSave = async (form) => {
    try {
      if (form._id) { await examAPI.update(form._id, form); toast.success('Exam updated'); }
      else { await examAPI.create(form); toast.success('Exam created'); }
      setModal({ open: false, data: null }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving exam'); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam?')) return;
    try { await examAPI.delete(id); toast.success('Exam deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const filtered = exams.filter(e => !filter || e.examType === filter);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Exams & Results</h2>
          <p className="text-sm text-muted mt-0.5">{exams.length} exams scheduled</p>
        </div>
        {(isAdmin || isTeacher) && <button className="btn-primary" onClick={() => setModal({ open: true, data: null })}>+ Create Exam</button>}
      </div>

      {/* Filter tabs */}
      <div className="flex gap-2 mb-5 flex-wrap">
        {['', 'unit', 'midterm', 'final', 'practical'].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${filter === t ? 'bg-ink text-white' : 'bg-white border border-border text-slate hover:border-accent'}`}>
            {t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : !filtered.length ? <EmptyState icon="📝" title="No exams found" /> : (
        <div className="flex flex-col gap-3">
          {filtered.map(exam => {
            const d = exam.date ? new Date(exam.date) : null;
            const isPast = d && d < new Date();
            return (
              <div key={exam._id} className="card overflow-hidden" style={{ borderLeft: `4px solid ${exam.examType === 'unit' ? '#c9a84c' : exam.examType === 'midterm' ? '#d4522a' : exam.examType === 'practical' ? '#4a7c59' : '#7c6af5'}` }}>
                <div className="flex items-center gap-5 px-6 py-5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold text-ink">{exam.name}</span>
                      <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full uppercase ${TYPE_COLORS[exam.examType] || 'bg-gray-100 text-gray-600'}`}>{exam.examType}</span>
                      {isPast && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-muted/15 text-muted uppercase">Past</span>}
                    </div>
                    <div className="text-sm text-muted">{exam.class?.name} {exam.class?.section ? `— ${exam.class.section}` : ''} · {exam.subject?.name}</div>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="text-xs text-muted mb-1">Date</div>
                    <div className="font-medium text-sm text-ink">{d?.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) || 'TBD'}</div>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="text-xs text-muted mb-1">Total Marks</div>
                    <div className="font-display text-3xl text-ink">{exam.totalMarks}</div>
                  </div>
                  <div className="text-center hidden md:block">
                    <div className="text-xs text-muted mb-1">Passing</div>
                    <div className="font-medium text-sage">{exam.passingMarks}</div>
                  </div>
                  {(isAdmin || isTeacher) && (
                    <div className="flex gap-1.5">
                      <button onClick={() => setModal({ open: true, data: { ...exam, class: exam.class?._id, subject: exam.subject?._id, date: exam.date?.split('T')[0] } })}
                        className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                      <button onClick={() => handleDelete(exam._id)}
                        className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => setModal({ open: false, data: null })}
        title={modal.data?._id ? 'Edit Exam' : 'Create Exam'} size="md"
        footer={<><button className="btn-secondary" onClick={() => setModal({ open: false, data: null })}>Cancel</button>
          <button className="btn-primary" onClick={() => handleSave(modal.data || {})}>Save</button></>}>
        {modal.open && <ExamForm data={modal.data} setData={d => setModal(p => ({ ...p, data: d }))} classes={classes} subjects={subjects} />}
      </Modal>
    </div>
  );
}

function ExamForm({ data, setData, classes, subjects }) {
  const set = (k, v) => setData(p => ({ ...p, [k]: v }));
  const d = data || {};
  return (
    <div className="grid grid-cols-2 gap-4">
      <FormGroup label="Exam Name" className="col-span-2"><input className="form-input" value={d.name || ''} onChange={e => set('name', e.target.value)} placeholder="Midterm Examination 2026" /></FormGroup>
      <FormGroup label="Class">
        <select className="form-input" value={d.class || ''} onChange={e => set('class', e.target.value)}>
          <option value="">Select class</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Subject">
        <select className="form-input" value={d.subject || ''} onChange={e => set('subject', e.target.value)}>
          <option value="">Select subject</option>
          {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Exam Type">
        <select className="form-input" value={d.examType || ''} onChange={e => set('examType', e.target.value)}>
          <option value="">Select type</option>
          {['unit','midterm','final','practical','assignment'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
        </select>
      </FormGroup>
      <FormGroup label="Date"><input type="date" className="form-input" value={d.date || ''} onChange={e => set('date', e.target.value)} /></FormGroup>
      <FormGroup label="Total Marks"><input type="number" className="form-input" value={d.totalMarks || ''} onChange={e => set('totalMarks', e.target.value)} placeholder="100" /></FormGroup>
      <FormGroup label="Passing Marks"><input type="number" className="form-input" value={d.passingMarks || ''} onChange={e => set('passingMarks', e.target.value)} placeholder="35" /></FormGroup>
    </div>
  );
}
