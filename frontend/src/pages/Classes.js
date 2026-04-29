import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';

const CLASS_COLORS = ['#d4522a','#c9a84c','#4a7c59','#7c6af5','#2d9cdb','#f2994a','#e91e8c','#00bcd4'];
const FORM_EMPTY = { name: '', grade: '', section: '', room: '', capacity: '', classTeacher: '' };

// ── Class Detail Drawer ───────────────────────────────────────────────────────
function ClassDrawer({ cls, color, onClose, onEdit, canEdit, navigate }) {
  if (!cls) return null;
  const studentCount = cls.students?.length || 0;
  const subjectCount = cls.subjects?.length || 0;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)' }} onClick={onClose}/>
      <div style={{ width:'100%', maxWidth:540, background:'#fff', height:'100%', overflowY:'auto', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)' }}>

        {/* Header with class color */}
        <div style={{ background:'#0B1F4A', padding:'24px 28px', borderBottom:`4px solid ${color}` }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Class Details</div>
            <div style={{ display:'flex', gap:8 }}>
              {canEdit && (
                <button onClick={onEdit} style={{ padding:'7px 18px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.1)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff' }}>✎ Edit</button>
              )}
              <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <div style={{ width:80, height:80, borderRadius:20, background:color, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
              <span style={{ fontSize:34, fontWeight:900, color:'#fff' }}>{cls.grade}</span>
            </div>
            <div>
              <div style={{ fontSize:24, fontWeight:700, color:'#fff' }}>{cls.name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)', marginTop:4 }}>Section {cls.section} {cls.room ? `· Room ${cls.room}` : ''}</div>
              <div style={{ display:'flex', gap:10, marginTop:12 }}>
                <div style={{ textAlign:'center', background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 16px' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{studentCount}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Students</div>
                </div>
                <div style={{ textAlign:'center', background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 16px' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{subjectCount}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Subjects</div>
                </div>
                <div style={{ textAlign:'center', background:'rgba(255,255,255,0.1)', borderRadius:10, padding:'8px 16px' }}>
                  <div style={{ fontSize:20, fontWeight:700, color:'#fff' }}>{cls.capacity || '—'}</div>
                  <div style={{ fontSize:10, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Capacity</div>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Content */}
        <div style={{ padding:'24px 28px' }}>

          {/* Class Teacher */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Class Teacher</div>
            {cls.classTeacher ? (
              <div style={{ display:'flex', alignItems:'center', gap:14, background:'#F8FAFC', borderRadius:12, padding:'14px 16px', border:'1px solid #E5E7EB' }}>
                <div style={{ width:44, height:44, borderRadius:12, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  <span style={{ fontSize:18, fontWeight:700, color:'#fff' }}>{(cls.classTeacher?.user?.name||'?')[0]}</span>
                </div>
                <div>
                  <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{cls.classTeacher?.user?.name || '—'}</div>
                  <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{cls.classTeacher?.user?.email || ''}</div>
                </div>
              </div>
            ) : (
              <div style={{ background:'#F9FAFB', borderRadius:12, padding:'14px 16px', border:'1.5px dashed #E5E7EB', textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                No class teacher assigned
              </div>
            )}
          </div>

          {/* Subjects */}
          {cls.subjects?.length > 0 && (
            <div style={{ marginBottom:24 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Subjects ({cls.subjects.length})</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {cls.subjects.map(s => (
                  <span key={s._id||s} style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'5px 14px', borderRadius:20 }}>
                    {s.name || s}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Quick Actions */}
          <div style={{ marginBottom:24 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Quick Actions</div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
              {[
                { icon:'👥', label:'View Students', action:()=>{ navigate('/students'); onClose(); } },
                { icon:'🗓', label:'Timetable', action:()=>{ navigate('/timetable'); onClose(); } },
                { icon:'📅', label:'Attendance', action:()=>{ navigate('/attendance'); onClose(); } },
                { icon:'📊', label:'Exams', action:()=>{ navigate('/exams'); onClose(); } },
              ].map(a => (
                <button key={a.label} onClick={a.action} style={{ display:'flex', alignItems:'center', gap:10, padding:'12px 16px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, fontWeight:600, color:'#374151', transition:'all 0.15s' }}
                  onMouseEnter={e=>{ e.currentTarget.style.borderColor=color; e.currentTarget.style.background='#F8FAFC'; }}
                  onMouseLeave={e=>{ e.currentTarget.style.borderColor='#E5E7EB'; e.currentTarget.style.background='#fff'; }}>
                  <span style={{ fontSize:20 }}>{a.icon}</span>
                  {a.label}
                </button>
              ))}
            </div>
          </div>

          {/* Class Info */}
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Class Information</div>
            {[
              { label:'Class Name', value:cls.name },
              { label:'Grade', value:cls.grade },
              { label:'Section', value:cls.section },
              { label:'Room', value:cls.room || '—' },
              { label:'Capacity', value:cls.capacity ? `${cls.capacity} students` : '—' },
            ].map(item => (
              <div key={item.label} style={{ display:'flex', justifyContent:'space-between', padding:'10px 0', borderBottom:'0.5px solid #F3F4F6' }}>
                <span style={{ fontSize:13, color:'#6B7280' }}>{item.label}</span>
                <span style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{item.value}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Classes() {
  const { isAdmin } = useAuth();
  const navigate = useNavigate();
  const [classes,   setClasses]   = useState([]);
  const [teachers,  setTeachers]  = useState([]);
  const [subjects,  setSubjects]  = useState([]);
  const [loading,   setLoading]   = useState(true);
  const [modal,     setModal]     = useState({ open: false, data: null });
  const [form,      setForm]      = useState(FORM_EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [viewClass, setViewClass] = useState(null);
  const [viewColor, setViewColor] = useState('#0B1F4A');

  const load = async () => {
    setLoading(true);
    try {
      const [cRes, tRes, sRes] = await Promise.all([classAPI.getAll(), teacherAPI.getAll(), subjectAPI.getAll()]);
      setClasses(cRes.data.data);
      setTeachers(tRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load classes'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const openAdd  = () => { setForm(FORM_EMPTY); setModal({ open: true, data: null }); };
  const openEdit = (cls) => {
    setForm({ name: cls.name||'', grade: cls.grade||'', section: cls.section||'',
      room: cls.room||'', capacity: cls.capacity||'', classTeacher: cls.classTeacher?._id||cls.classTeacher||'',
      _id: cls._id });
    setModal({ open: true, data: cls });
  };

  const handleSave = async () => {
    if (!form.name) return toast.error('Class name is required');
    setSaving(true);
    try {
      if (form._id) { await classAPI.update(form._id, form); toast.success('Class updated'); }
      else          { await classAPI.create(form);           toast.success('Class created'); }
      setModal({ open: false, data: null }); setForm(FORM_EMPTY); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving class'); }
    finally { setSaving(false); }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Classes</h2>
          <p className="text-sm text-muted mt-0.5">{classes.length} classes across all grades</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={openAdd}>+ Add Class</button>}
      </div>

      {loading ? <LoadingState /> : !classes.length ? <EmptyState icon="🏛" title="No classes yet" /> : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {classes.map((cls, i) => {
            const color = CLASS_COLORS[i % CLASS_COLORS.length];
            return (
              <div key={cls._id}
                onClick={() => { setViewClass(cls); setViewColor(color); }}
                style={{ background:'#fff', borderRadius:16, padding:'24px', boxShadow:'0 1px 4px rgba(0,0,0,0.06)', border:'1px solid #F3F4F6', cursor:'pointer', position:'relative', overflow:'hidden', transition:'all 0.2s' }}
                onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 8px 24px rgba(0,0,0,0.1)'; e.currentTarget.style.transform='translateY(-2px)'; }}
                onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform=''; }}>

                {/* Color bar bottom */}
                <div style={{ position:'absolute', bottom:0, left:0, right:0, height:4, background:color, borderRadius:'0 0 16px 16px' }}/>

                {/* Section badge */}
                <div style={{ position:'absolute', top:16, right:16, background:'#F3F4F6', borderRadius:8, padding:'3px 10px', fontSize:12, fontWeight:700, color:'#374151' }}>{cls.section}</div>

                {/* Edit + Delete buttons */}
                {isAdmin && (
                  <div style={{ position:'absolute', top:16, left:16, display:'flex', gap:6 }} onClick={e=>e.stopPropagation()}>
                    <button onClick={e=>{ e.stopPropagation(); openEdit(cls); }}
                      style={{ width:28, height:28, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}
                      title="Edit class">✎</button>
                    <button onClick={async e=>{ e.stopPropagation(); if(!window.confirm(`Delete ${cls.name} ${cls.section||''}? This cannot be undone.`)) return; try{ await classAPI.delete(cls._id); toast.success('Class deleted'); load(); }catch(err){ toast.error(err?.response?.data?.message||'Failed to delete'); } }}
                      style={{ width:28, height:28, borderRadius:8, border:'1px solid #FECACA', background:'#FEF2F2', cursor:'pointer', fontSize:13, color:'#DC2626', display:'flex', alignItems:'center', justifyContent:'center' }}
                      title="Delete class">🗑</button>
                  </div>
                )}

                {/* Grade */}
                <div style={{ fontSize:52, fontWeight:900, color:'#111827', lineHeight:1, marginBottom:4, marginTop:8 }}>{cls.grade}</div>
                <div style={{ fontSize:14, color:'#6B7280', marginBottom:20, fontWeight:500 }}>{cls.name}</div>

                {/* Stats */}
                <div style={{ display:'flex', gap:20 }}>
                  <div onClick={e=>{ e.stopPropagation(); navigate('/students'); }}
                    style={{ cursor:'pointer' }}
                    onMouseEnter={e=>e.currentTarget.style.opacity='0.7'}
                    onMouseLeave={e=>e.currentTarget.style.opacity='1'}>
                    <div style={{ fontSize:22, fontWeight:700, color:'#111827' }}>{cls.students?.length || 0}</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>Students →</div>
                  </div>
                  <div>
                    <div style={{ fontSize:14, fontWeight:600, color:'#111827' }}>{cls.classTeacher?.user?.name || '—'}</div>
                    <div style={{ fontSize:12, color:'#6B7280' }}>Class Teacher</div>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Class Detail Drawer */}
      {viewClass && (
        <ClassDrawer
          cls={viewClass}
          color={viewColor}
          onClose={() => setViewClass(null)}
          canEdit={isAdmin}
          navigate={navigate}
          onEdit={() => { openEdit(viewClass); setViewClass(null); }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal isOpen={modal.open} onClose={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}
        title={form._id ? 'Edit Class' : 'Add Class'} size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>{saving ? 'Saving…' : 'Save Class'}</button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Class Name"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Class X" /></FormGroup>
          <FormGroup label="Grade"><input type="number" className="form-input" value={form.grade} onChange={e => set('grade', e.target.value)} placeholder="10" /></FormGroup>
          <FormGroup label="Section"><input className="form-input" value={form.section} onChange={e => set('section', e.target.value)} placeholder="A" /></FormGroup>
          <FormGroup label="Room"><input className="form-input" value={form.room} onChange={e => set('room', e.target.value)} placeholder="101" /></FormGroup>
          <FormGroup label="Capacity"><input type="number" className="form-input" value={form.capacity} onChange={e => set('capacity', e.target.value)} placeholder="40" /></FormGroup>
          <FormGroup label="Class Teacher">
            <select className="form-input" value={form.classTeacher} onChange={e => set('classTeacher', e.target.value)}>
              <option value="">Select teacher</option>
              {teachers.map(t => <option key={t._id} value={t._id}>{t.user?.name}</option>)}
            </select>
          </FormGroup>
        </div>
      </Modal>
    </div>
  );
}