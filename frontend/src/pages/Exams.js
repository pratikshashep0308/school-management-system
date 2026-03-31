import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { examAPI, classAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const TYPE_COLORS = {
  unit:       'bg-amber-100 text-amber-700',
  midterm:    'bg-red-100 text-red-700',
  final:      'bg-purple-100 text-purple-700',
  practical:  'bg-green-100 text-green-700',
  assignment: 'bg-blue-100 text-blue-700',
};
const FORM_EMPTY = { name: '', class: '', subject: '', examType: 'unit', date: '', startTime: '', endTime: '', totalMarks: 100, passingMarks: 35, instructions: '' };

export default function Exams() {
  const { isAdmin, isTeacher } = useAuth();
  const [exams,    setExams]   = useState([]);
  const [classes,  setClasses] = useState([]);
  const [subjects, setSubjects]= useState([]);
  const [loading,  setLoading] = useState(true);
  const [modal,    setModal]   = useState({ open: false });
  const [form,     setForm]    = useState(FORM_EMPTY);
  const [saving,   setSaving]  = useState(false);
  const [filter,   setFilter]  = useState('');

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

  const openAdd  = () => { setForm(FORM_EMPTY); setModal({ open: true }); };
  const openEdit = (exam) => {
    setForm({
      _id: exam._id,
      name: exam.name || '',
      class: exam.class?._id || exam.class || '',
      subject: exam.subject?._id || exam.subject || '',
      examType: exam.examType || 'unit',
      date: exam.date ? exam.date.split('T')[0] : '',
      startTime: exam.startTime || '',
      endTime: exam.endTime || '',
      totalMarks: exam.totalMarks || 100,
      passingMarks: exam.passingMarks || 35,
      instructions: exam.instructions || '',
    });
    setModal({ open: true });
  };

  const handleSave = async () => {
    if (!form.name?.trim()) return toast.error('Exam name is required');
    if (!form.class)        return toast.error('Please select a class');
    setSaving(true);
    try {
      if (form._id) { await examAPI.update(form._id, form); toast.success('Exam updated'); }
      else          { await examAPI.create(form);           toast.success('Exam created'); }
      setModal({ open: false }); setForm(FORM_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving exam'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this exam?')) return;
    try { await examAPI.delete(id); toast.success('Exam deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const filtered = exams.filter(e => !filter || e.examType === filter);

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Exams & Results</h2>
          <p className="text-sm text-muted mt-0.5">{exams.length} exams scheduled</p>
        </div>
        {(isAdmin || isTeacher) && <button className="btn-primary" onClick={openAdd}>+ Create Exam</button>}
      </div>

      <div className="flex gap-2 mb-5 flex-wrap">
        {['', 'unit', 'midterm', 'final', 'practical', 'assignment'].map(t => (
          <button key={t} onClick={() => setFilter(t)}
            className={"px-3 py-1.5 rounded-lg text-sm font-medium transition-all " + (filter === t ? 'bg-ink text-white dark:bg-white dark:text-ink' : 'bg-white dark:bg-gray-800 border border-border text-slate hover:border-accent')}>
            {t ? t.charAt(0).toUpperCase() + t.slice(1) : 'All'}
          </button>
        ))}
      </div>

      {loading ? <LoadingState /> : !filtered.length ? <EmptyState icon="📝" title="No exams found" /> : (
        <div className="flex flex-col gap-3">
          {filtered.map(exam => {
            const d = exam.date ? new Date(exam.date) : null;
            const isPast = d && d < new Date();
            const borderColors = { unit:'#c9a84c', midterm:'#d4522a', final:'#7c6af5', practical:'#4a7c59', assignment:'#2d9cdb' };
            return (
              <div key={exam._id} className="card overflow-hidden" style={{ borderLeft: "4px solid " + (borderColors[exam.examType] || '#ccc') }}>
                <div className="flex items-center gap-5 px-6 py-5">
                  <div className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap mb-1.5">
                      <span className="font-semibold text-ink dark:text-white">{exam.name}</span>
                      <span className={"text-[10px] font-bold px-2 py-0.5 rounded-full uppercase " + (TYPE_COLORS[exam.examType] || 'bg-gray-100 text-gray-600')}>{exam.examType}</span>
                      {isPast && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-500 uppercase">Past</span>}
                    </div>
                    <div className="text-sm text-muted">{exam.class?.name} {exam.class?.section ? "— " + exam.class.section : ""} · {exam.subject?.name}</div>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="text-xs text-muted mb-1">Date</div>
                    <div className="font-medium text-sm text-ink dark:text-white">{d?.toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) || 'TBD'}</div>
                  </div>
                  <div className="text-center hidden sm:block">
                    <div className="text-xs text-muted mb-1">Total Marks</div>
                    <div className="font-display text-3xl text-ink dark:text-white">{exam.totalMarks}</div>
                  </div>
                  <div className="text-center hidden md:block">
                    <div className="text-xs text-muted mb-1">Passing</div>
                    <div className="font-medium text-green-600">{exam.passingMarks}</div>
                  </div>
                  {(isAdmin || isTeacher) && (
                    <div className="flex gap-1.5">
                      <button onClick={() => openEdit(exam)} className="w-8 h-8 rounded-lg border border-border text-slate hover:border-accent hover:text-accent transition-all flex items-center justify-center text-sm">✎</button>
                      <button onClick={() => handleDelete(exam._id)} className="w-8 h-8 rounded-lg border border-red-200 text-red-400 hover:border-red-400 hover:text-red-600 transition-all flex items-center justify-center text-sm">✕</button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false }); setForm(FORM_EMPTY); }}
        title={form._id ? 'Edit Exam' : 'Create Exam'} size="lg"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false }); setForm(FORM_EMPTY); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : form._id ? 'Update Exam' : 'Create Exam'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Exam Name *" className="col-span-2">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Midterm Examination 2026" />
          </FormGroup>
          <FormGroup label="Class *">
            <select className="form-input" value={form.class} onChange={e => set('class', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Subject">
            <select className="form-input" value={form.subject} onChange={e => set('subject', e.target.value)}>
              <option value="">Select subject</option>
              {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Exam Type">
            <select className="form-input" value={form.examType} onChange={e => set('examType', e.target.value)}>
              {['unit','midterm','final','practical','assignment'].map(t => <option key={t} value={t}>{t.charAt(0).toUpperCase()+t.slice(1)}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Date">
            <input type="date" className="form-input" value={form.date} onChange={e => set('date', e.target.value)} />
          </FormGroup>
          <FormGroup label="Start Time">
            <input type="time" className="form-input" value={form.startTime} onChange={e => set('startTime', e.target.value)} />
          </FormGroup>
          <FormGroup label="End Time">
            <input type="time" className="form-input" value={form.endTime} onChange={e => set('endTime', e.target.value)} />
          </FormGroup>
          <FormGroup label="Total Marks">
            <input type="number" className="form-input" value={form.totalMarks} onChange={e => set('totalMarks', +e.target.value)} placeholder="100" />
          </FormGroup>
          <FormGroup label="Passing Marks">
            <input type="number" className="form-input" value={form.passingMarks} onChange={e => set('passingMarks', +e.target.value)} placeholder="35" />
          </FormGroup>
          <FormGroup label="Instructions" className="col-span-2">
            <textarea className="form-input" rows={3} value={form.instructions} onChange={e => set('instructions', e.target.value)} placeholder="Any special instructions for students..." style={{ resize: 'vertical' }} />
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}