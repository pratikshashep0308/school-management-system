import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, ActionBtn, SearchBox, LoadingState, EmptyState } from '../components/ui';

const COLS = '40px 2fr 1fr 1fr 1fr 100px';
const FORM_EMPTY = { name: '', email: '', phone: '', employeeId: '', qualification: '', experience: '', designation: '' };

// ── Teacher Detail Drawer ─────────────────────────────────────────────────────
function TeacherDrawer({ teacher: t, onClose, onEdit, canEdit }) {
  if (!t) return null;
  const initials = (t.user?.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
  const colors = ['#D4522A','#185FA5','#534AB7','#0F6E56','#993556'];
  const bg = colors[(t.user?.name||'').charCodeAt(0) % colors.length];

  const InfoRow = ({ icon, label, value }) => (
    <div style={{ display:'flex', alignItems:'center', gap:14, padding:'12px 0', borderBottom:'0.5px solid #F3F4F6' }}>
      <div style={{ width:38, height:38, borderRadius:10, background:'#F3F4F6', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>{icon}</div>
      <div>
        <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.05em' }}>{label}</div>
        <div style={{ fontSize:14, fontWeight:600, color:'#111827', marginTop:2 }}>{value || '—'}</div>
      </div>
    </div>
  );

  return (
    <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex' }}>
      <div style={{ flex:1, background:'rgba(0,0,0,0.5)' }} onClick={onClose}/>
      <div style={{ width:'100%', maxWidth:600, background:'#fff', height:'100%', overflowY:'auto', boxShadow:'-8px 0 40px rgba(0,0,0,0.18)', display:'flex', flexDirection:'column' }}>
        {/* Header */}
        <div style={{ background:'#0B1F4A', padding:'24px 28px' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.4)', textTransform:'uppercase', letterSpacing:'0.08em' }}>Teacher Profile</div>
            <div style={{ display:'flex', gap:8 }}>
              {canEdit && (
                <button onClick={onEdit} style={{ padding:'7px 18px', borderRadius:8, border:'1px solid rgba(255,255,255,0.25)', background:'rgba(255,255,255,0.1)', cursor:'pointer', fontSize:12, fontWeight:700, color:'#fff' }}>✎ Edit</button>
              )}
              <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.08)', cursor:'pointer', fontSize:18, color:'#fff', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
            </div>
          </div>
          <div style={{ display:'flex', alignItems:'center', gap:20 }}>
            <div style={{ width:72, height:72, borderRadius:20, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, fontSize:28, fontWeight:700, color:'#fff' }}>
              {initials}
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:22, fontWeight:700, color:'#fff', marginBottom:4 }}>{t.user?.name}</div>
              <div style={{ fontSize:13, color:'rgba(255,255,255,0.55)' }}>{t.designation || 'Teacher'} · {t.employeeId || '—'}</div>
              <div style={{ display:'flex', gap:8, marginTop:10, flexWrap:'wrap' }}>
                <span style={{ fontSize:11, fontWeight:700, color: t.isActive ? '#4ADE80' : '#F87171', background: t.isActive ? 'rgba(74,222,128,0.15)' : 'rgba(248,113,113,0.15)', padding:'4px 12px', borderRadius:20 }}>
                  {t.isActive ? '● Active' : '● Inactive'}
                </span>
                {t.subjects?.length > 0 && (
                  <span style={{ fontSize:11, fontWeight:700, color:'rgba(255,255,255,0.6)', background:'rgba(255,255,255,0.1)', padding:'4px 12px', borderRadius:20 }}>
                    {t.subjects.map(s=>s.name).join(', ')}
                  </span>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* Details */}
        <div style={{ padding:'24px 28px', flex:1 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:12 }}>Contact Information</div>
          <InfoRow icon="📧" label="Email" value={t.user?.email} />
          <InfoRow icon="📞" label="Phone" value={t.user?.phone} />

          <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', margin:'20px 0 8px' }}>Professional Details</div>
          <InfoRow icon="🪪" label="Employee ID" value={t.employeeId} />
          <InfoRow icon="🏷️" label="Designation" value={t.designation} />
          <InfoRow icon="🎓" label="Qualification" value={t.qualification} />
          <InfoRow icon="📅" label="Experience" value={t.experience ? `${t.experience} years` : null} />

          {t.subjects?.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', margin:'20px 0 10px' }}>Subjects</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {t.subjects.map(s => (
                  <span key={s._id} style={{ fontSize:12, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 12px', borderRadius:20 }}>
                    {s.name}
                  </span>
                ))}
              </div>
            </>
          )}

          {t.classes?.length > 0 && (
            <>
              <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.06em', margin:'20px 0 10px' }}>Classes</div>
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {t.classes.map(c => (
                  <span key={c._id} style={{ fontSize:12, fontWeight:700, color:'#059669', background:'#ECFDF5', border:'1px solid #A7F3D0', padding:'4px 12px', borderRadius:20 }}>
                    {c.name} {c.section||''}
                  </span>
                ))}
              </div>
            </>
          )}

          <div style={{ marginTop:24, padding:'14px 16px', background:'#F8FAFC', borderRadius:12, border:'1px solid #E5E7EB' }}>
            <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:600 }}>Login Email</div>
            <div style={{ fontFamily:'monospace', fontSize:12, color:'#1D4ED8', marginTop:4 }}>{t.user?.email}</div>
            <div style={{ fontSize:11, color:'#9CA3AF', marginTop:6 }}>Default password: <strong>Teacher@123</strong></div>
          </div>
        </div>
      </div>
    </div>
  );
}

export default function Teachers() {
  const { isAdmin } = useAuth();
  const [teachers,    setTeachers]    = useState([]);
  const [subjects,    setSubjects]    = useState([]);
  const [loading,     setLoading]     = useState(true);
  const [search,      setSearch]      = useState('');
  const [modal,       setModal]       = useState({ open: false, data: null });
  const [form,        setForm]        = useState(FORM_EMPTY);
  const [saving,      setSaving]      = useState(false);
  const [viewTeacher, setViewTeacher] = useState(null);

  const load = async () => {
    setLoading(true);
    try {
      const [tRes, sRes] = await Promise.all([teacherAPI.getAll(), subjectAPI.getAll()]);
      setTeachers(tRes.data.data);
      setSubjects(sRes.data.data);
    } catch { toast.error('Failed to load teachers'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); }, []);

  const filtered = teachers.filter(t => {
    const q = search.toLowerCase();
    return !q || t.user?.name?.toLowerCase().includes(q) || t.employeeId?.toLowerCase().includes(q);
  });

  const openAdd = () => {
    setForm(FORM_EMPTY);
    setModal({ open: true, data: null });
  };

  const openEdit = (t) => {
    setForm({
      _id:           t._id,
      name:          t.user?.name        || '',
      email:         t.user?.email       || '',
      phone:         t.user?.phone       || '',
      employeeId:    t.employeeId        || '',
      qualification: t.qualification     || '',
      experience:    t.experience        || '',
      designation:   t.designation       || '',
    });
    setModal({ open: true, data: t });
  };

  const handleSave = async () => {
    if (!form.name?.trim())  return toast.error('Teacher name is required');
    if (!form.email?.trim()) return toast.error('Email is required');
    setSaving(true);
    try {
      if (form._id) {
        await teacherAPI.update(form._id, form);
        toast.success('Teacher updated');
      } else {
        await teacherAPI.create(form);
        toast.success('Teacher added successfully');
      }
      setModal({ open: false, data: null });
      setForm(FORM_EMPTY);
      load();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Error saving teacher');
    } finally {
      setSaving(false);
    }
  };

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Teachers</h2>
          <p className="text-sm text-muted mt-0.5">{teachers.length} staff members</p>
        </div>
        {isAdmin && <button className="btn-primary" onClick={openAdd}>+ Add Teacher</button>}
      </div>

      <div className="flex gap-3 mb-5">
        <SearchBox value={search} onChange={setSearch} placeholder="Search by name or employee ID…" />
      </div>

      {loading ? <LoadingState /> : (
        <div className="card overflow-hidden">
          {/* Table header */}
          <div style={{ background:'#0B1F4A' }}>
            <div className="grid gap-4 px-5 py-3" style={{ gridTemplateColumns: COLS }}>
              {['#', 'Teacher', 'Employee ID', 'Subjects', 'Status', 'Actions'].map(h => (
                <div key={h} style={{ fontSize:10, fontWeight:700, color:'#94afd4', textTransform:'uppercase', letterSpacing:'0.05em' }}>{h}</div>
              ))}
            </div>
          </div>

          {!filtered.length ? <EmptyState icon="🎓" title="No teachers found" /> : (
            filtered.map((t, i) => {
              const initials = (t.user?.name || '?').split(' ').map(w => w[0]).join('').slice(0,2).toUpperCase();
              const colors = ['#D4522A','#185FA5','#534AB7','#0F6E56','#993556'];
              const bg = colors[(t.user?.name||'').charCodeAt(0) % colors.length];
              return (
                <div key={t._id}
                  className="grid gap-4 px-5 py-3 border-t border-border items-center transition-colors"
                  style={{ gridTemplateColumns: COLS, cursor:'pointer' }}
                  onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                  onMouseLeave={e=>e.currentTarget.style.background=''}
                  onClick={() => setViewTeacher(t)}>
                  <div className="text-muted text-sm">{i + 1}</div>
                  <div className="flex items-center gap-2.5">
                    <div style={{ width:36, height:36, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                      <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{initials}</span>
                    </div>
                    <div>
                      <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{t.user?.name}</div>
                      <div style={{ fontSize:11, color:'#9CA3AF' }}>{t.user?.email}</div>
                    </div>
                  </div>
                  <div className="text-xs text-slate font-mono">{t.employeeId || '—'}</div>
                  <div className="text-sm text-slate truncate">{t.subjects?.map(s => s.name).join(', ') || '—'}</div>
                  <Badge status={t.isActive ? 'active' : 'inactive'} />
                  <div className="flex gap-1.5" onClick={e => e.stopPropagation()}>
                    <button onClick={() => setViewTeacher(t)}
                      style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                      👁 View
                    </button>
                    {isAdmin && <ActionBtn icon="✎" title="Edit" onClick={() => openEdit(t)} />}
                  </div>
                </div>
              );
            })
          )}
        </div>
      )}

      {/* Teacher Detail Drawer */}
      {viewTeacher && (
        <TeacherDrawer
          teacher={viewTeacher}
          onClose={() => setViewTeacher(null)}
          canEdit={isAdmin}
          onEdit={() => { openEdit(viewTeacher); setViewTeacher(null); }}
        />
      )}

      {/* Add/Edit Modal */}
      <Modal
        isOpen={modal.open}
        onClose={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}
        title={form._id ? 'Edit Teacher' : 'Add New Teacher'}
        size="md"
        footer={<>
          <button className="btn-secondary" onClick={() => { setModal({ open: false, data: null }); setForm(FORM_EMPTY); }}>Cancel</button>
          <button className="btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving…' : form._id ? 'Save Changes' : 'Add Teacher'}
          </button>
        </>}>
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Full Name *" className="col-span-2">
            <input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Mr. Rajesh Sharma" />
          </FormGroup>
          <FormGroup label="Email *">
            <input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="teacher@school.com" />
          </FormGroup>
          <FormGroup label="Phone">
            <input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" />
          </FormGroup>
          <FormGroup label="Employee ID">
            <input className="form-input" value={form.employeeId} onChange={e => set('employeeId', e.target.value)} placeholder="EMP-042" />
          </FormGroup>
          <FormGroup label="Designation">
            <input className="form-input" value={form.designation} onChange={e => set('designation', e.target.value)} placeholder="Senior Teacher" />
          </FormGroup>
          <FormGroup label="Qualification">
            <input className="form-input" value={form.qualification} onChange={e => set('qualification', e.target.value)} placeholder="M.Sc Mathematics" />
          </FormGroup>
          <FormGroup label="Experience (years)">
            <input type="number" className="form-input" value={form.experience} onChange={e => set('experience', e.target.value)} placeholder="5" min="0" />
          </FormGroup>
          {!form._id && (
            <div className="col-span-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-xs text-blue-700 dark:text-blue-300">
              💡 Default password: <strong>Teacher@123</strong> — teacher can change after first login.
            </div>
          )}
        </div>
      </Modal>
    </div>
  );
}