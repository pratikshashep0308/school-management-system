// frontend/src/pages/Students.js
// Advanced Student Module — Full digital student lifecycle
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api, { studentAPI, classAPI, attendanceAPI, examAPI, assignmentAPI, feeAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, SearchBox, LoadingState, EmptyState } from '../components/ui';
import PhoneInput from '../components/ui/PhoneInput';

// ─── QR Code (inline SVG — no external lib needed) ───────────────────────────
function QRPlaceholder({ value, size = 80 }) {
  // Simple visual placeholder — replace with qrcode.react if installed
  const hash = value.split('').reduce((a, c) => a + c.charCodeAt(0), 0);
  const cells = Array.from({ length: 7 }, (_, r) => Array.from({ length: 7 }, (_, c) => ((hash * (r + 1) * (c + 1)) % 3 === 0)));
  return (
    <div style={{ width: size, height: size, padding: 4, background: 'white', borderRadius: 8, border: '1px solid #e5e7eb' }}>
      <svg width={size - 8} height={size - 8} viewBox="0 0 7 7">
        {cells.map((row, r) => row.map((filled, c) => filled && <rect key={`${r}-${c}`} x={c} y={r} width={1} height={1} fill="#1a3a6b" />))}
      </svg>
    </div>
  );
}

// ─── Tabs ─────────────────────────────────────────────────────────────────────
const TABS = [
  { id: 'all',         label: 'All Students', icon: '👥' },
  { id: 'active',      label: 'Active',       icon: '✅' },
  { id: 'inactive',    label: 'Inactive',     icon: '⭕' },
  { id: 'alumni',      label: 'Alumni',       icon: '🎓' },
  { id: 'managelogin', label: 'Manage Login', icon: '🔑' },
];

const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];

// ─── Mini stat ring ───────────────────────────────────────────────────────────
function Ring({ pct, size = 56, stroke = 6, color }) {
  const r = (size - stroke) / 2, c = 2 * Math.PI * r;
  const col = color || (pct >= 75 ? '#4a7c59' : pct >= 50 ? '#c9a84c' : '#d4522a');
  return (
    <div className="relative" style={{ width: size, height: size }}>
      <svg className="-rotate-90" width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round" />
      </svg>
      <div className="absolute inset-0 flex items-center justify-center">
        <span className="text-xs font-bold" style={{ color: col }}>{pct}%</span>
      </div>
    </div>
  );
}

// =============================================================================
// MAIN STUDENTS PAGE
// =============================================================================
export default function Students() {
  const { isAdmin, can } = useAuth();
  const [students,     setStudents]    = useState([]);
  const [classes,      setClasses]     = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [filterClass,  setFilterClass] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [tab,          setTab]         = useState('all');
  const [viewStudent,  setViewStudent] = useState(null);  // student profile drawer
  const [addModal,     setAddModal]    = useState({ open: false, data: null });
  const [saving,       setSaving]      = useState(false);
  const [resetModal,   setResetModal]  = useState(null); // student to reset password
  const [newPassword,  setNewPassword] = useState('');
  const [resetting,    setResetting]   = useState(false);
  const [showPwd,      setShowPwd]     = useState({});

  const canManage = can(['superAdmin', 'schoolAdmin']);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [sRes, cRes] = await Promise.all([studentAPI.getAll(), classAPI.getAll()]);
      setStudents(sRes.data.data || []);
      setClasses(cRes.data.data || []);
    } catch { toast.error('Failed to load students'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { load(); }, [load]);

  // Filter
  const filtered = students.filter(s => {
    const q = search.toLowerCase();
    const matchSearch = !q || s.user?.name?.toLowerCase().includes(q) || s.admissionNumber?.toLowerCase().includes(q) || s.class?.name?.toLowerCase().includes(q);
    const matchClass  = !filterClass || s.class?._id === filterClass;
    const matchTab    = tab === 'all' || tab === 'managelogin' || (tab === 'active' && s.isActive) || (tab === 'inactive' && !s.isActive) || (tab === 'alumni' && s.status === 'alumni');
    const matchGender = !filterGender || (s.gender||'').toLowerCase() === filterGender;
    return matchSearch && matchClass && matchTab;
  });

  // Stats
  const total    = students.length;
  const active   = students.filter(s => s.isActive).length;
  const boys     = students.filter(s => s.gender === 'male').length;
  const girls    = students.filter(s => s.gender === 'female').length;

  const handleSave = async (form) => {
    setSaving(true);
    try {
      if (form._id) { await studentAPI.update(form._id, form); toast.success('Student updated'); }
      else          { await studentAPI.create(form); toast.success('Student added ✅'); }
      setAddModal({ open: false, data: null }); load();
    } catch (err) { toast.error(err.response?.data?.message || 'Error saving student'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id, name) => {
    if (!id) return toast.error('Invalid student');
    if (!window.confirm(`Delete student "${name}"?\n\nThis will permanently remove the student from the system.`)) return;
    try {
      await studentAPI.delete(id);
      toast.success(`${name} deleted successfully`);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Failed to delete';
      toast.error(msg);
      console.error('Delete error:', err);
    }
  };

  const handleResetPassword = async () => {
    if (!newPassword || newPassword.length < 6) return toast.error('Password must be at least 6 characters');
    setResetting(true);
    try {
      await studentAPI.resetPassword(resetModal._id, { password: newPassword });
      toast.success(`Password reset for ${resetModal.user?.name}`);
      setResetModal(null); setNewPassword('');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to reset password'); }
    finally { setResetting(false); }
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">Students</h2>
          <p className="text-sm text-muted">{total} enrolled · {active} active</p>
        </div>

      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit,minmax(160px,1fr))", gap:12 }}>
        {[
          { label: 'Total Students', value: total,  icon: '👥', bg: '#EFF6FF', clr: '#1D4ED8', onClick: () => { setTab('all'); setFilterGender(''); } },
          { label: 'Active',         value: active, icon: '✅', bg: '#F0FDF4', clr: '#166534', onClick: () => { setTab('active'); setFilterGender(''); } },
          { label: 'Boys',           value: boys,   icon: '👦', bg: '#EEF2FF', clr: '#3730A3', onClick: () => { setFilterGender(g=>g==='male'?'':'male'); setTab('all'); } },
          { label: 'Girls',          value: girls,  icon: '👧', bg: '#FDF2F8', clr: '#9D174D', onClick: () => { setFilterGender(g=>g==='female'?'':'female'); setTab('all'); } },
        ].map(s => (
          <div key={s.label} onClick={s.onClick}
            style={{ background: (s.label==='Boys'&&filterGender==='male')||(s.label==='Girls'&&filterGender==='female') ? s.bg : '#fff', border: (s.label==='Boys'&&filterGender==='male')||(s.label==='Girls'&&filterGender==='female') ? `2px solid ${s.clr}` : '1px solid #E5E7EB', borderRadius:16, padding:16, display:'flex', alignItems:'center', gap:12, boxShadow:'0 1px 4px rgba(0,0,0,0.06)', cursor:'pointer', transition:'box-shadow 0.15s, transform 0.15s' }}
            onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 4px 16px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-2px)'; }}
            onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform='translateY(0)'; }}>
            <div style={{ width:44, height:44, borderRadius:12, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, background:s.bg, color:s.clr }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:24, fontWeight:800, color:'#111827' }}>{s.value}</div>
              <div style={{ fontSize:12, color:'#6B7280' }}>{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline Tabs */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', background:'#F3F4F6', borderRadius:10, padding:4 }}>
        {TABS.map(t => (
          <button key={t.id} onClick={() => setTab(t.id)}
            style={{ padding:'7px 16px', borderRadius:8, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s',
              background: tab === t.id ? '#6366F1' : 'transparent',
              color:      tab === t.id ? '#fff'    : '#6B7280' }}>
            {t.icon} {t.label} ({
              t.id === 'all'         ? total :
              t.id === 'active'      ? active :
              t.id === 'inactive'    ? (total - active) :
              t.id === 'alumni'      ? students.filter(s=>s.status==='alumni').length :
              t.id === 'managelogin' ? active : 0
            })
          </button>
        ))}
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', padding:'12px 16px', background:'#F8FAFC', borderRadius:12, alignItems:'center' }}>
        <input placeholder="🔍 Search name, ID, class, parent…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none', minWidth:240 }}/>
        <select value={filterClass} onChange={e=>setFilterClass(e.target.value)}
          style={{ padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' }}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        {(search || filterClass) && (
          <button onClick={()=>{setSearch('');setFilterClass('');setFilterGender('');}}
            style={{ fontSize:12, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
            ✕ Clear
          </button>
        )}
        <div style={{ marginLeft:'auto', fontSize:12, color:'#9CA3AF', fontWeight:600 }}>{filtered.length} results</div>
      </div>

      {/* Student list table */}
      {tab !== 'managelogin' && (loading ? <LoadingState /> : !filtered.length ? (
        <div style={{ padding:'40px', textAlign:'center', color:'#9CA3AF' }}>
          <div style={{ fontSize:40, marginBottom:12 }}>👥</div>
          <div style={{ fontSize:15, fontWeight:700, color:'#374151', marginBottom:6 }}>No students found</div>
          <div style={{ fontSize:13, color:'#9CA3AF' }}>
            {filterClass || search ? 'Try clearing the filters above' : 'Enroll students from the Admissions module to see them here'}
          </div>
          {(filterClass || search) && (
            <button onClick={()=>{setSearch('');setFilterClass('');setFilterGender('');}}
              style={{ marginTop:16, padding:'8px 20px', borderRadius:8, background:'#6366F1', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#','Student','Roll No','Class','Gender','Blood','Parent','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 14px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((s, i) => {
                  const name   = s.user?.name || '—';
                  const initials = name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
                  const colors = ['#D4522A','#C9A84C','#4A7C59','#7C6AF5','#2D9CDB','#F2994A','#10B981','#8B5CF6'];
                  const bg     = colors[name.charCodeAt(0) % colors.length];
                  const statusStyle = s.status === 'active'
                    ? { bg:'#D1FAE5', color:'#065F46' }
                    : s.status === 'alumni'
                    ? { bg:'#EDE9FE', color:'#5B21B6' }
                    : { bg:'#FEE2E2', color:'#991B1B' };
                  return (
                    <tr key={s._id}
                      style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff', cursor:'pointer', transition:'background 0.1s' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}
                      onClick={()=>setViewStudent(s)}>
                      <td style={{ padding:'10px 14px', color:'#9CA3AF', fontSize:12 }}>{i+1}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
                          <div style={{ width:36, height:36, borderRadius:10, background:bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                            <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{initials}</span>
                          </div>
                          <div>
                            <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{name}</div>
                            <div style={{ fontSize:11, color:'#9CA3AF' }}>{s.admissionNumber || s.studentId || ''}</div>
                          </div>
                        </div>
                      </td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#374151' }}>{s.rollNumber || '—'}</td>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{s.class?.name} {s.class?.section||''}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{s.gender || '—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        {s.bloodGroup ? (
                          <span style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', padding:'2px 8px', borderRadius:20 }}>{s.bloodGroup}</span>
                        ) : <span style={{ color:'#D1D5DB' }}>—</span>}
                      </td>
                      <td style={{ padding:'10px 14px', color:'#6B7280', fontSize:12 }}>{s.parentName || s.fatherName || '—'}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, color:statusStyle.color, background:statusStyle.bg, padding:'3px 10px', borderRadius:20, textTransform:'capitalize' }}>
                          {s.status || 'active'}
                        </span>
                      </td>
                      <td style={{ padding:'10px 14px' }} onClick={e=>e.stopPropagation()}>
                        <div style={{ display:'flex', gap:5 }}>
                          <button onClick={()=>setViewStudent(s)}
                            style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                            👁 View
                          </button>
                          {canManage && <>
                            <button onClick={()=>setAddModal({ open:true, data:{ ...s, name:s.user?.name, email:s.user?.email, classId:s.class?._id } })}
                              style={{ fontSize:11, fontWeight:700, color:'#374151', background:'#F3F4F6', border:'1px solid #E5E7EB', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                              ✎
                            </button>
                            <button onClick={()=>handleDelete(s._id, s.user?.name)}
                              style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                              ✕
                            </button>
                          </>}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}

      {/* Manage Login Tab */}
      {tab === 'managelogin' && (
        <div className="card overflow-hidden" style={{ padding:0 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#111827' }}>🔑 Manage Student Login</div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>View credentials and reset passwords for student portal access</div>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#','Student','Class','Username (Email)','Password','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.filter(s=>s.isActive).map((s,i)=>(
                  <tr key={s._id} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                    <td style={{ padding:'11px 16px', color:'#9CA3AF' }}>{i+1}</td>
                    <td style={{ padding:'11px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:9 }}>
                        <div style={{ width:32, height:32, borderRadius:9, background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                          <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{(s.user?.name||'?')[0].toUpperCase()}</span>
                        </div>
                        <div>
                          <div style={{ fontWeight:700, color:'#111827' }}>{s.user?.name}</div>
                          <div style={{ fontSize:11, color:'#9CA3AF' }}>Roll: {s.rollNumber||'—'}</div>
                        </div>
                      </div>
                    </td>
                    <td style={{ padding:'11px 16px', color:'#374151' }}>{s.class?.name} {s.class?.section||''}</td>
                    <td style={{ padding:'11px 16px' }}>
                      <div style={{ fontFamily:'monospace', fontSize:12,
                        color: s.user?.email?.includes('@student.local') ? '#DC2626' : '#1D4ED8',
                        background: s.user?.email?.includes('@student.local') ? '#FEF2F2' : '#EFF6FF',
                        padding:'4px 10px', borderRadius:6, display:'inline-block' }}>
                        {s.user?.email||'—'}
                      </div>
                      {s.user?.email?.includes('@student.local') && (
                        <div style={{ fontSize:10, color:'#DC2626', marginTop:3 }}>⚠️ Auto-generated — reset to fix</div>
                      )}
                    </td>
                    <td style={{ padding:'11px 16px' }}>
                      <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                        <div style={{ fontFamily:'monospace', fontSize:12, color:'#374151', background:'#F3F4F6', padding:'4px 10px', borderRadius:6 }}>
                          {showPwd[s._id] ? 'Student@123' : '••••••••••'}
                        </div>
                        <button onClick={()=>setShowPwd(p=>({...p,[s._id]:!p[s._id]}))}
                          style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' }}>
                          {showPwd[s._id] ? '🙈' : '👁'}
                        </button>
                      </div>
                    </td>
                    <td style={{ padding:'11px 16px' }}>
                      <span style={{ fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5', padding:'3px 10px', borderRadius:20 }}>
                        Active
                      </span>
                    </td>
                    <td style={{ padding:'11px 16px' }}>
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                        <button onClick={()=>{ setResetModal(s); setNewPassword('Student@123'); }}
                          style={{ fontSize:11, fontWeight:700, color:'#D97706', background:'#FEF3C7', border:'1px solid #FDE68A', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                          🔑 Reset Password
                        </button>
                        {s.user?.email?.includes('@student.local') && (
                          <button onClick={async ()=>{
                            const name = s.user?.name||'student';
                            const clean = name.toLowerCase().replace(/\s+/g,'.').replace(/[^a-z0-9.]/g,'');
                            const newEmail = `${clean}@futurestepschool.in`;
                            try {
                              await api.put(`/students/${s._id}`, { email: newEmail });
                              toast.success(`Username updated to ${newEmail}`);
                              load();
                            } catch { toast.error('Failed to update username'); }
                          }}
                            style={{ fontSize:11, fontWeight:700, color:'#166534', background:'#DCFCE7', border:'1px solid #86EFAC', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                            ✏️ Fix Username
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!students.filter(s=>s.isActive).length && (
            <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>No active students found</div>
          )}
        </div>
      )}

      {/* Reset Password Modal */}
      {resetModal && (
        <div style={{ position:'fixed', inset:0, zIndex:300, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.45)', padding:16 }}>
          <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:400, boxShadow:'0 20px 60px rgba(0,0,0,0.2)' }}>
            <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <h3 style={{ fontSize:16, fontWeight:700, margin:0 }}>🔑 Reset Password</h3>
              <button onClick={()=>{setResetModal(null);setNewPassword('');}} style={{ width:28, height:28, borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:16, color:'#6B7280' }}>×</button>
            </div>
            <div style={{ padding:'20px 24px' }}>
              <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px 16px', marginBottom:16 }}>
                <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{resetModal.user?.name}</div>
                <div style={{ fontSize:12, color:'#6B7280', marginTop:2 }}>{resetModal.user?.email} · {resetModal.class?.name}</div>
              </div>
              <label style={{ fontSize:11, fontWeight:700, display:'block', marginBottom:5, color:'#374151', textTransform:'uppercase' }}>New Password</label>
              <input
                type="text"
                value={newPassword}
                onChange={e=>setNewPassword(e.target.value)}
                placeholder="Enter new password"
                style={{ width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:14, outline:'none', marginBottom:8 }}
              />
              <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
                {['Student@123','Pass@1234',`${resetModal.user?.name?.split(' ')[0]}@123`].map(p=>(
                  <button key={p} onClick={()=>setNewPassword(p)}
                    style={{ fontSize:11, color:'#6366F1', background:'#EEF2FF', border:'1px solid #C7D2FE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
                    {p}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10 }}>
              <button onClick={()=>{setResetModal(null);setNewPassword('');}}
                style={{ flex:1, padding:'10px', borderRadius:9, fontSize:13, fontWeight:700, background:'#F3F4F6', border:'none', cursor:'pointer' }}>Cancel</button>
              <button onClick={handleResetPassword} disabled={resetting}
                style={{ flex:2, padding:'10px', borderRadius:9, fontSize:13, fontWeight:700, background:resetting?'#9CA3AF':'#D97706', color:'#fff', border:'none', cursor:resetting?'not-allowed':'pointer' }}>
                {resetting ? '⏳ Resetting...' : '✓ Reset Password'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Student Profile Drawer */}
      {viewStudent && (
        <StudentProfileDrawer
          student={viewStudent}
          classes={classes}
          canManage={canManage}
          onClose={() => setViewStudent(null)}
          onEdit={() => { setAddModal({ open: true, data: { ...viewStudent, name: viewStudent.user?.name, email: viewStudent.user?.email, classId: viewStudent.class?._id } }); setViewStudent(null); }}
        />
      )}

      {/* Add / Edit Modal */}
      <StudentFormModal
        isOpen={addModal.open}
        data={addModal.data}
        classes={classes}
        saving={saving}
        onClose={() => setAddModal({ open: false, data: null })}
        onSave={handleSave}
      />
    </div>
  );
}

// =============================================================================
// STUDENT CARD
// =============================================================================
function StudentCard({ student: s, canManage, onView, onEdit, onDelete }) {
  const genderColor = s.gender === 'female' ? '#ec4899' : s.gender === 'male' ? '#3b82f6' : '#8b5cf6';
  return (
    <div className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer" onClick={onView}>
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar */}
        <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
          style={{ background: `linear-gradient(135deg, ${genderColor}cc, ${genderColor}88)` }}>
          {s.user?.name?.charAt(0)?.toUpperCase()}
        </div>
        <div className="flex-1 min-w-0">
          <p className="font-bold text-ink dark:text-white truncate">{s.user?.name}</p>
          <p className="text-xs text-muted">{s.admissionNumber}</p>
          <div className="flex items-center gap-1.5 mt-1 flex-wrap">
            {s.class && <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-50 dark:bg-blue-900/30 text-blue-600">{s.class.name} {s.class.section}</span>}
            <span className={'text-[10px] font-semibold px-2 py-0.5 rounded-full ' + (s.isActive ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500')}>{s.isActive ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
        <QRPlaceholder value={s.admissionNumber || s._id} size={40} />
      </div>

      <div className="grid grid-cols-2 gap-2 text-xs text-muted mb-3">
        {s.rollNumber && <span>🔢 Roll: <span className="text-ink dark:text-gray-200 font-medium">{s.rollNumber}</span></span>}
        {s.gender    && <span>👤 <span className="capitalize text-ink dark:text-gray-200 font-medium">{s.gender}</span></span>}
        {s.bloodGroup && <span>🩸 <span className="text-ink dark:text-gray-200 font-medium">{s.bloodGroup}</span></span>}
        {s.parentName && <span>👨‍👩‍👧 <span className="text-ink dark:text-gray-200 font-medium truncate">{s.parentName}</span></span>}
      </div>

      {canManage && (
        <div className="flex gap-2 pt-3 border-t border-border dark:border-gray-700" onClick={e => e.stopPropagation()}>
          <button onClick={onView}   className="flex-1 text-xs border border-border rounded-lg py-1.5 text-slate hover:border-accent hover:text-accent transition-all">👁 View</button>
          <button onClick={onEdit}   className="flex-1 text-xs border border-border rounded-lg py-1.5 text-slate hover:border-blue-400 hover:text-blue-600 transition-all">✎ Edit</button>
          {s.parentPhone && <button onClick={()=>{ const ph=(s.parentPhone||'').replace(/\D/g,'').replace(/^0/,'91'); window.open(`https://wa.me/${ph}?text=${encodeURIComponent('Dear Parent, this is a message from The Future Step School regarding '+s.user?.name+'.')}`, '_blank'); }} className="text-xs border border-green-200 rounded-lg px-2.5 py-1.5 text-green-600 hover:border-green-400 hover:bg-green-50 transition-all">💬</button>}
          <button onClick={onDelete} className="text-xs border border-red-200 rounded-lg px-2.5 py-1.5 text-red-400 hover:border-red-400 hover:text-red-600 transition-all">✕</button>
        </div>
      )}
    </div>
  );
}

// =============================================================================
// STUDENT PROFILE DRAWER — full detail panel
// =============================================================================
const PROFILE_TABS = [
  { id: 'overview',    label: 'Overview',    icon: '👤' },
  { id: 'academic',    label: 'Academic',    icon: '📊' },
  { id: 'attendance',  label: 'Attendance',  icon: '📅' },
  { id: 'fees',        label: 'Fees',        icon: '💰' },
  { id: 'assignments', label: 'Assignments', icon: '📚' },
  { id: 'health',      label: 'Health',      icon: '🏥' },
];

function StudentProfileDrawer({ student: s, classes, canManage, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [exams,       setExams]       = useState([]);
  const [attendance,  setAttendance]  = useState([]);
  const [fees,        setFees]        = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [eRes, aRes, fRes] = await Promise.allSettled([
          examAPI.getAll().catch(() => ({ data: { data: [] } })),
          assignmentAPI.getAll().catch(() => ({ data: { data: [] } })),
          feeAPI.getPayments({ student: s._id }).catch(() => ({ data: { data: [] } })),
        ]);
        if (eRes.status === 'fulfilled') setExams(eRes.value.data.data || []);
        if (aRes.status === 'fulfilled') setAssignments(aRes.value.data.data || []);
        if (fRes.status === 'fulfilled') setFees(fRes.value.data.data || []);
        // Mock attendance
        setAttendance(Array.from({ length: 30 }, (_, i) => ({ day: i + 1, status: Math.random() > 0.15 ? 'present' : 'absent' })));
      } catch {}
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [s._id]);

  const presentDays = attendance.filter(a => a.status === 'present').length;
  const attPct = attendance.length > 0 ? Math.round((presentDays / attendance.length) * 100) : 0;

  // Exam stats
  const examResults = exams.filter(e => e.results?.length).map(e => {
    const res = e.results?.find(r => r.student === s._id);
    return res ? { subject: e.subject?.name || 'Exam', marks: res.marksObtained, total: e.totalMarks, pct: Math.round((res.marksObtained / e.totalMarks) * 100) } : null;
  }).filter(Boolean);
  const avgPct  = examResults.length ? Math.round(examResults.reduce((s, e) => s + e.pct, 0) / examResults.length) : 0;
  const weakSub = examResults.filter(e => e.pct < 50);

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:300, background:"rgba(15,23,42,0.65)", padding:"24px 16px", overflowY:"auto", backdropFilter:"blur(2px)" }}
      onClick={onClose}
    >
      {/* Centered modal — wide layout so two-column field grids stay roomy */}
      <div
        style={{ maxWidth:1280, margin:"0 auto", background:"#fff", borderRadius:18, overflow:"hidden", boxShadow:"0 30px 80px rgba(0,0,0,0.45)", minHeight:"calc(100vh - 48px)" }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ position:"sticky", top:0, zIndex:10, background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"20px 28px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
            <div style={{ width:60, height:60, borderRadius:18, background:"#0B1F4A", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0 }}>
              <span style={{ fontSize:22, fontWeight:700, color:"#fff" }}>{(s.user?.name||"?").charAt(0).toUpperCase()}</span>
            </div>
            <div style={{ flex:1 }}>
              <div style={{ fontSize:20, fontWeight:700, color:"#111827" }}>{s.user?.name}</div>
              <div style={{ fontSize:13, color:"#6B7280", marginTop:2 }}>{s.admissionNumber} · {s.class?.name} {s.class?.section||""}</div>
              <div style={{ marginTop:6, display:"flex", gap:8 }}>
                <span style={{ fontSize:11, fontWeight:700, color: s.isActive?"#059669":"#DC2626", background: s.isActive?"#D1FAE5":"#FEE2E2", padding:"3px 10px", borderRadius:20 }}>
                  {s.isActive ? "● Active" : "● Inactive"}
                </span>
                {s.rollNumber && <span style={{ fontSize:11, fontWeight:700, color:"#374151", background:"#F3F4F6", padding:"3px 10px", borderRadius:20 }}>Roll: {s.rollNumber}</span>}
              </div>
            </div>
            <div style={{ display:"flex", gap:8 }}>
              {canManage && <button onClick={onEdit} style={{ padding:"7px 16px", borderRadius:8, fontSize:12, fontWeight:700, color:"#374151", background:"#F3F4F6", border:"1px solid #E5E7EB", cursor:"pointer" }}>✎ Edit</button>}
              <button onClick={onClose} style={{ width:34, height:34, borderRadius:8, border:"1px solid #E5E7EB", background:"#fff", cursor:"pointer", fontSize:18, color:"#6B7280", display:"flex", alignItems:"center", justifyContent:"center" }}>×</button>
            </div>
          </div>

          {/* Profile tabs */}
          <div style={{ display:"flex", gap:0, overflowX:"auto", borderTop:"1px solid #F3F4F6" }}>
            {PROFILE_TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                style={{ padding:"10px 18px", fontSize:12, fontWeight:700, border:"none", cursor:"pointer", whiteSpace:"nowrap", transition:"all 0.15s", background:"transparent",
                  color: activeTab===t.id ? "#1D4ED8" : "#6B7280",
                  borderBottom: activeTab===t.id ? "2.5px solid #1D4ED8" : "2.5px solid transparent" }}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div style={{ padding:"24px 28px", display:"flex", flexDirection:"column", gap:20 }}>
          {loadingData && <LoadingState />}

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
              {/* Quick stats */}
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <Ring pct={attPct} size={60} />
                  <p className="text-xs text-muted mt-2">Attendance</p>
                </div>
                <div className="card p-4 text-center">
                  <Ring pct={avgPct} size={60} color="#7c6af5" />
                  <p className="text-xs text-muted mt-2">Avg Score</p>
                </div>
                <div className="card p-4 text-center flex flex-col items-center justify-center">
                  <div className="text-2xl font-display text-ink dark:text-white">{fees.filter(f => f.status === 'pending').length}</div>
                  <p className="text-xs text-muted mt-1">Pending Fees</p>
                </div>
              </div>

              {/* Personal info — fed primarily from admissionSnapshot, with
                  fallbacks to top-level Student fields for older records that
                  were enrolled before the snapshot was added. */}
              {(() => {
                const snap = s.admissionSnapshot || {};

                // Friendly enum-ish labels
                const orphanLabels = {
                  orphan: 'Orphan',
                  single_parent_mother: 'Single Parent (Mother)',
                  single_parent_father: 'Single Parent (Father)',
                  not_applicable: 'Not Applicable',
                };
                const yn = v => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '—';
                const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—';
                const v = (...candidates) => {
                  for (const c of candidates) {
                    if (c !== null && c !== undefined && c !== '') return c;
                  }
                  return '—';
                };

                // Government IDs
                const govIds = (snap.governmentIds || []).filter(g => g && (g.type || g.number));

                // Custom docs
                const customDocs = (snap.customDocuments || []).filter(d => d && d.label);

                // Standard docs (whichever ones have files attached)
                const stdDocs = Object.entries(snap.documents || {})
                  .filter(([, val]) => {
                    if (!val) return false;
                    if (Array.isArray(val)) return val.length > 0;
                    if (typeof val === 'object') return val.submitted || val.url || val.data || (Array.isArray(val.files) && val.files.length);
                    return Boolean(val);
                  })
                  .map(([k]) => k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim());

                return (
                  <>
                    <Section title="Student Information">
                      <InfoGrid items={[
                        { label: 'First Name',         value: v(snap.firstName) },
                        { label: 'Middle Name',        value: v(snap.middleName) },
                        { label: 'Last Name',          value: v(snap.lastName) },
                        { label: 'Full Name',          value: v(snap.studentName, s.user?.name) },
                        { label: 'Registration No',    value: v(snap.registrationNo) },
                        { label: 'Admission No',       value: v(s.admissionNumber) },
                        { label: 'Roll Number',        value: v(s.rollNumber) },
                        { label: 'Class',              value: v(s.class?.name) },
                        { label: 'Date of Admission',  value: fmtDate(snap.dateOfAdmission || s.admissionDate) },
                        { label: 'Academic Year',      value: v(snap.academicYear) },
                        { label: 'Discount in Fee',    value: snap.discountInFee ? `${snap.discountInFee}%` : '—' },
                        { label: 'Mobile (SMS/WhatsApp)', value: v(snap.mobileForSMS) },
                        { label: 'Aadhaar Number',     value: v(snap.aadhaarNumber) },
                        { label: 'Category',           value: v(snap.category, s.category) },
                        { label: 'Non-Creamy Layer',   value: yn(snap.nonCreamyLayer) },
                        { label: 'Email',              value: v(snap.parentEmail, s.user?.email) },
                      ]} />
                    </Section>

                    <Section title="Other Information">
                      <InfoGrid items={[
                        { label: 'Date of Birth',      value: fmtDate(snap.dateOfBirth || s.dateOfBirth) },
                        { label: 'Birth Form ID / NIC', value: v(snap.birthFormId) },
                        { label: 'Gender',             value: v(snap.gender, s.gender) },
                        { label: 'Orphan Status',      value: orphanLabels[snap.orphanStudent] || v(snap.orphanStudent) },
                        { label: 'Caste',              value: v(snap.cast) },
                        { label: 'Religion',           value: v(snap.religion, s.religion) },
                        { label: 'Blood Group',        value: v(snap.bloodGroup, s.bloodGroup) },
                        { label: 'Total Siblings',     value: v(snap.totalSiblings) },
                        { label: 'Nationality',        value: v(snap.nationality, s.nationality) },
                        { label: 'Identification Mark', value: v(snap.identificationMark) },
                        { label: 'Disease (if any)',   value: v(snap.disease) },
                        { label: 'Is Disabled?',       value: yn(snap.isDisabled) },
                        { label: 'Disability %',       value: snap.disabilityPercentage ? `${snap.disabilityPercentage}%` : '—' },
                        { label: 'Disability Type',    value: v(snap.disabilityType) },
                      ]} />
                      {snap.additionalNote && (
                        <div className="mt-3 pt-3 border-t border-border dark:border-gray-700">
                          <p className="text-[10px] text-muted uppercase tracking-wide">Additional Note</p>
                          <p className="text-sm text-ink dark:text-white mt-1">{snap.additionalNote}</p>
                        </div>
                      )}
                    </Section>

                    <Section title="Parent / Guardian Information">
                      <InfoGrid items={[
                        { label: "Father's Name",       value: v(snap.fatherName) },
                        { label: "Father's Occupation", value: v(snap.fatherOccupation) },
                        { label: "Father's Phone",      value: v(snap.fatherPhone) },
                        { label: "Father's Aadhaar",    value: v(snap.fatherAadhaar) },
                        { label: "Mother's Name",       value: v(snap.motherName) },
                        { label: "Mother's Occupation", value: v(snap.motherOccupation) },
                        { label: "Mother's Phone",      value: v(snap.motherPhone) },
                        { label: "Mother's Aadhaar",    value: v(snap.motherAadhaar) },
                        { label: 'Primary Contact',     value: v(snap.parentName, s.parentName) },
                        { label: 'Contact Phone',       value: v(snap.parentPhone, s.parentPhone) },
                      ]} />
                    </Section>

                    <Section title="Address">
                      <p className="text-sm text-slate dark:text-gray-300">
                        {[
                          snap.address || s.address?.street,
                          snap.city    || s.address?.city,
                          snap.state   || s.address?.state,
                          snap.pincode || s.address?.pincode,
                        ].filter(Boolean).join(', ') || '—'}
                      </p>
                    </Section>

                    <Section title="Government IDs">
                      {govIds.length > 0 ? (
                        <InfoGrid items={govIds.map(g => ({
                          label: g.type || 'ID',
                          value: g.number || '—',
                        }))} />
                      ) : (
                        <p className="text-sm text-muted">— No Government IDs added</p>
                      )}
                    </Section>

                    <Section title="Bank Details">
                      <InfoGrid items={[
                        { label: 'Account Holder', value: v(snap.bankAccountHolder) },
                        { label: 'Bank Name',      value: v(snap.bankName) },
                        { label: 'Branch Name',    value: v(snap.bankBranchName) },
                        { label: 'IFSC Code',      value: v(snap.bankIfsc) },
                        { label: 'Account Number', value: v(snap.bankAccountNumber) },
                        { label: 'Branch Address', value: v(snap.bankBranchAddress) },
                      ]} />
                    </Section>

                    <Section title={`Documents Submitted (${stdDocs.length + customDocs.length})`}>
                      {(stdDocs.length > 0 || customDocs.length > 0) ? (
                        <div className="flex flex-wrap gap-2">
                          {stdDocs.map(d => (
                            <span key={d} className="px-2.5 py-1 text-xs font-semibold rounded-full bg-indigo-50 text-indigo-700 dark:bg-indigo-900/30 dark:text-indigo-300">
                              ✓ {d}
                            </span>
                          ))}
                          {customDocs.map(d => (
                            <span key={d.label} className="px-2.5 py-1 text-xs font-semibold rounded-full bg-emerald-50 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-300">
                              ✓ {d.label}
                            </span>
                          ))}
                        </div>
                      ) : (
                        <p className="text-sm text-muted">— No documents uploaded</p>
                      )}
                      {snap.addressProofType && (
                        <p className="mt-3 text-xs text-muted">
                          Address Proof type: <span className="font-semibold text-ink dark:text-white">
                            {snap.addressProofType === '__other__' ? (snap.addressProofTypeOther || 'Other') : snap.addressProofType}
                          </span>
                        </p>
                      )}
                    </Section>

                    {s.transportRoute && (
                      <Section title="Transport">
                        <p className="text-sm text-slate dark:text-gray-300">🚌 Route: {s.transportRoute?.routeName || s.transportRoute}</p>
                      </Section>
                    )}
                  </>
                );
              })()}
            </div>
          )}

          {/* ── ACADEMIC ── */}
          {activeTab === 'academic' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* GPA card */}
              <div className="card p-5 flex items-center gap-5">
                <Ring pct={avgPct} size={72} stroke={8} />
                <div>
                  <p className="text-3xl font-display text-ink dark:text-white">{avgPct}%</p>
                  <p className="text-sm text-muted">Overall Average</p>
                  <p className="text-xs font-semibold mt-1">
                    Grade: {avgPct >= 90 ? 'A+' : avgPct >= 80 ? 'A' : avgPct >= 70 ? 'B' : avgPct >= 60 ? 'C' : avgPct >= 50 ? 'D' : 'F'}
                  </p>
                </div>
              </div>

              {/* Weak subjects alert */}
              {weakSub.length > 0 && (
                <div className="p-4 rounded-xl bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
                  <p className="text-sm font-semibold text-red-700 dark:text-red-300 mb-2">⚠️ Needs Attention</p>
                  {weakSub.map((w, i) => (
                    <p key={i} className="text-xs text-red-600 dark:text-red-400">📌 {w.subject} — {w.pct}% (below 50%)</p>
                  ))}
                </div>
              )}

              {/* Subject bars */}
              {examResults.length > 0 ? (
                <Section title="Subject Performance">
                  {examResults.map((e, i) => (
                    <div key={i} className="mb-3">
                      <div className="flex justify-between text-xs mb-1">
                        <span className="font-medium text-ink dark:text-white">{e.subject}</span>
                        <span className="text-muted">{e.marks}/{e.total} ({e.pct}%)</span>
                      </div>
                      <div className="h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all" style={{ width: e.pct + '%', background: e.pct >= 75 ? '#4a7c59' : e.pct >= 50 ? '#c9a84c' : '#d4522a' }} />
                      </div>
                    </div>
                  ))}
                </Section>
              ) : <EmptyState icon="📊" title="No exam results yet" />}

              {/* Upcoming exams */}
              {exams.length > 0 && (
                <Section title="Upcoming Exams">
                  {exams.filter(e => new Date(e.date) >= new Date()).slice(0, 5).map(e => (
                    <div key={e._id} className="flex items-center justify-between py-2 border-b border-border dark:border-gray-700 last:border-0">
                      <div>
                        <p className="text-sm font-medium text-ink dark:text-white">{e.name}</p>
                        <p className="text-xs text-muted">{e.subject?.name}</p>
                      </div>
                      <span className="text-xs font-semibold text-accent">{new Date(e.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {activeTab === 'attendance' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div className="grid grid-cols-3 gap-3">
                <div className="card p-4 text-center">
                  <div className="text-2xl font-display text-green-600">{presentDays}</div>
                  <div className="text-xs text-muted">Present</div>
                </div>
                <div className="card p-4 text-center">
                  <div className="text-2xl font-display text-red-500">{attendance.length - presentDays}</div>
                  <div className="text-xs text-muted">Absent</div>
                </div>
                <div className="card p-4 text-center">
                  <div className={'text-2xl font-display ' + (attPct >= 75 ? 'text-green-600' : attPct >= 50 ? 'text-amber-500' : 'text-red-500')}>{attPct}%</div>
                  <div className="text-xs text-muted">Percentage</div>
                </div>
              </div>

              {attPct < 75 && (
                <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-xs text-amber-700 dark:text-amber-300">
                  ⚠️ Attendance below 75%. Minimum required: 75% for exam eligibility.
                </div>
              )}

              {/* Calendar heat-map simulation */}
              <Section title="This Month — Attendance Calendar">
                <div className="grid grid-cols-7 gap-1.5">
                  {['S','M','T','W','T','F','S'].map(d => (
                    <div key={d} className="text-center text-[10px] text-muted font-bold">{d}</div>
                  ))}
                  {Array.from({ length: 2 }, (_, i) => <div key={'pad-'+i} />)}
                  {attendance.map((a, i) => (
                    <div key={i} title={'Day ' + a.day + ': ' + a.status}
                      className={'w-7 h-7 rounded-lg flex items-center justify-center text-[10px] font-bold cursor-default ' +
                        (a.status === 'present' ? 'bg-green-100 text-green-700 dark:bg-green-900/40' : 'bg-red-100 text-red-600 dark:bg-red-900/40')}>
                      {a.day}
                    </div>
                  ))}
                </div>
              </Section>
            </div>
          )}

          {/* ── FEES ── */}
          {activeTab === 'fees' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {fees.length === 0 ? <EmptyState icon="💰" title="No fee records found" /> : (
                <>
                  <div className="grid grid-cols-2 gap-3">
                    <div className="card p-4 text-center">
                      <div className="text-xl font-display text-green-600">₹{fees.filter(f => f.status === 'paid').reduce((s, f) => s + (f.amount || 0), 0).toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">Paid</div>
                    </div>
                    <div className="card p-4 text-center">
                      <div className="text-xl font-display text-amber-500">₹{fees.filter(f => f.status !== 'paid').reduce((s, f) => s + (f.amount || 0), 0).toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">Pending</div>
                    </div>
                  </div>
                  {fees.map(f => (
                    <div key={f._id} className="card p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-ink dark:text-white">{f.feeType || 'Fee'}</p>
                        <p className="text-xs text-muted">{f.dueDate ? new Date(f.dueDate).toLocaleDateString('en-IN') : '—'}</p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-ink dark:text-white">₹{(f.amount || 0).toLocaleString('en-IN')}</p>
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (f.status === 'paid' ? 'bg-green-100 text-green-700' : f.status === 'overdue' ? 'bg-red-100 text-red-600' : 'bg-amber-100 text-amber-700')}>
                          {f.status}
                        </span>
                      </div>
                    </div>
                  ))}
                </>
              )}
            </div>
          )}

          {/* ── ASSIGNMENTS ── */}
          {activeTab === 'assignments' && (
            <div style={{ display:"flex", flexDirection:"column", gap:12 }}>
              {assignments.length === 0 ? <EmptyState icon="📚" title="No assignments" /> :
                assignments.slice(0, 10).map(a => {
                  const isOverdue = new Date(a.dueDate) < new Date();
                  return (
                    <div key={a._id} className="card p-4">
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <p className="font-semibold text-sm text-ink dark:text-white">{a.title}</p>
                          <p className="text-xs text-muted">{a.subject?.name} · {a.class?.name}</p>
                        </div>
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (isOverdue ? 'bg-red-100 text-red-600' : 'bg-green-100 text-green-700')}>
                          {isOverdue ? 'Overdue' : 'Active'}
                        </span>
                      </div>
                      <p className="text-xs text-muted mt-2">📅 Due: {a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-IN') : '—'}</p>
                    </div>
                  );
                })
              }
            </div>
          )}

          {/* ── HEALTH ── */}
          {activeTab === 'health' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <Section title="Medical Information">
                <InfoGrid items={[
                  { label: 'Blood Group',     value: s.bloodGroup || '—' },
                  { label: 'Medical Info',    value: s.medicalInfo || 'None recorded' },
                  { label: 'Emergency Contact', value: s.parentName ? `${s.parentName} (${s.parentPhone})` : '—' },
                ]} />
              </Section>
              <div className="p-4 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-sm text-blue-700 dark:text-blue-300">
                💡 To add detailed health records, update the student profile with medical information.
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// =============================================================================
// ADD / EDIT STUDENT FORM MODAL
// =============================================================================
function StudentFormModal({ isOpen, data, classes, saving, onClose, onSave }) {
  // The form mirrors `admissionSnapshot` shape so changes flow back into the same
  // place the Overview tab reads from. A few fields (name/email/phone/class/roll)
  // are also kept on the top-level Student doc, so they're saved both places.
  const EMPTY_FORM = {
    // Top-level student fields (also synced to the User doc)
    name: '', email: '', phone: '',
    admissionNumber: '', rollNumber: '',
    classId: '',
    // Section 1 — Student Information
    firstName: '', middleName: '', lastName: '',
    studentName: '',
    registrationNo: '',
    dateOfAdmission: '',
    academicYear: '',
    discountInFee: '',
    mobileForSMS: '',
    aadhaarNumber: '',
    category: '',
    nonCreamyLayer: '',
    parentEmailSnap: '',
    // Section 2 — Other Information
    dateOfBirth: '',
    birthFormId: '',
    gender: '',
    orphanStudent: '',
    cast: '',
    religion: '',
    bloodGroup: '',
    totalSiblings: '',
    nationality: '',
    identificationMark: '',
    disease: '',
    isDisabled: '',
    disabilityPercentage: '',
    disabilityType: '',
    additionalNote: '',
    // Section 3 — Parent / Guardian
    fatherName: '', fatherOccupation: '', fatherPhone: '', fatherAadhaar: '',
    motherName: '', motherOccupation: '', motherPhone: '', motherAadhaar: '',
    parentName: '', parentPhone: '',
    // Section 4 — Address
    address: { street: '', city: '', state: '', pincode: '' },
    // Section 5 — Bank Details
    bankAccountHolder: '', bankName: '', bankBranchName: '',
    bankIfsc: '', bankAccountNumber: '', bankBranchAddress: '',
    // Section 6 — Government IDs
    governmentIds: [],
    // Medical
    medicalInfo: '',
    hobbies: '',
  };

  const [form, setForm] = useState(EMPTY_FORM);
  const [activeSection, setActiveSection] = useState('student');

  // Hydrate when modal opens with a record
  useEffect(() => {
    if (data) {
      const snap = data.admissionSnapshot || {};
      setForm({
        // Top-level
        name: data.user?.name || data.name || '',
        email: data.user?.email || data.email || '',
        phone: data.user?.phone || data.phone || '',
        admissionNumber: data.admissionNumber || '',
        rollNumber: data.rollNumber || '',
        classId: data.class?._id || data.classId || '',
        // Section 1
        firstName: snap.firstName || '',
        middleName: snap.middleName || '',
        lastName: snap.lastName || '',
        studentName: snap.studentName || data.user?.name || '',
        registrationNo: snap.registrationNo || '',
        dateOfAdmission: snap.dateOfAdmission ? String(snap.dateOfAdmission).split('T')[0]
                       : data.admissionDate ? String(data.admissionDate).split('T')[0]
                       : '',
        academicYear: snap.academicYear || '',
        discountInFee: snap.discountInFee || '',
        mobileForSMS: snap.mobileForSMS || '',
        aadhaarNumber: snap.aadhaarNumber || '',
        category: snap.category || data.category || '',
        nonCreamyLayer: snap.nonCreamyLayer || '',
        parentEmailSnap: snap.parentEmail || '',
        // Section 2
        dateOfBirth: snap.dateOfBirth ? String(snap.dateOfBirth).split('T')[0]
                   : data.dateOfBirth ? String(data.dateOfBirth).split('T')[0] : '',
        birthFormId: snap.birthFormId || '',
        gender: snap.gender || data.gender || '',
        orphanStudent: snap.orphanStudent || '',
        cast: snap.cast || '',
        religion: snap.religion || data.religion || '',
        bloodGroup: snap.bloodGroup || data.bloodGroup || '',
        totalSiblings: snap.totalSiblings || '',
        nationality: snap.nationality || data.nationality || 'Indian',
        identificationMark: snap.identificationMark || '',
        disease: snap.disease || '',
        isDisabled: snap.isDisabled || '',
        disabilityPercentage: snap.disabilityPercentage || '',
        disabilityType: snap.disabilityType || '',
        additionalNote: snap.additionalNote || '',
        // Section 3
        fatherName: snap.fatherName || '',
        fatherOccupation: snap.fatherOccupation || '',
        fatherPhone: snap.fatherPhone || '',
        fatherAadhaar: snap.fatherAadhaar || '',
        motherName: snap.motherName || '',
        motherOccupation: snap.motherOccupation || '',
        motherPhone: snap.motherPhone || '',
        motherAadhaar: snap.motherAadhaar || '',
        parentName: snap.parentName || data.parentName || '',
        parentPhone: snap.parentPhone || data.parentPhone || '',
        // Section 4
        address: {
          street:  snap.address || data.address?.street  || '',
          city:    snap.city    || data.address?.city    || '',
          state:   snap.state   || data.address?.state   || '',
          pincode: snap.pincode || data.address?.pincode || '',
        },
        // Section 5
        bankAccountHolder: snap.bankAccountHolder || '',
        bankName: snap.bankName || '',
        bankBranchName: snap.bankBranchName || '',
        bankIfsc: snap.bankIfsc || '',
        bankAccountNumber: snap.bankAccountNumber || '',
        bankBranchAddress: snap.bankBranchAddress || '',
        // Section 6
        governmentIds: Array.isArray(snap.governmentIds) ? snap.governmentIds : [],
        // Medical
        medicalInfo: data.medicalInfo || '',
        hobbies: data.hobbies || snap.hobbies || '',
        _id: data._id,
      });
    } else {
      setForm(EMPTY_FORM);
    }
    setActiveSection('student');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [data, isOpen]);

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setA = (k, v) => setForm(f => ({ ...f, address: { ...f.address, [k]: v } }));

  // Government IDs helpers
  const addGovId    = () => set('governmentIds', [...(form.governmentIds || []), { type: '', number: '' }]);
  const removeGovId = (i) => set('governmentIds', (form.governmentIds || []).filter((_, idx) => idx !== i));
  const updateGovId = (i, patch) => set('governmentIds',
    (form.governmentIds || []).map((row, idx) => idx === i ? { ...row, ...patch } : row));

  // Build the payload sent to the backend. We send top-level Student fields
  // alongside a complete admissionSnapshot (Mixed field — replaces wholesale).
  const buildPayload = () => {
    const fullName = [form.firstName, form.middleName, form.lastName].filter(Boolean).join(' ').trim()
                   || form.studentName
                   || form.name;
    const snapshot = {
      // Section 1
      firstName: form.firstName, middleName: form.middleName, lastName: form.lastName,
      studentName: fullName,
      registrationNo: form.registrationNo,
      dateOfAdmission: form.dateOfAdmission || null,
      academicYear: form.academicYear,
      discountInFee: form.discountInFee,
      mobileForSMS: form.mobileForSMS,
      aadhaarNumber: form.aadhaarNumber,
      category: form.category,
      nonCreamyLayer: form.nonCreamyLayer,
      parentEmail: form.parentEmailSnap || form.email,
      // Section 2
      dateOfBirth: form.dateOfBirth || null,
      birthFormId: form.birthFormId,
      gender: form.gender,
      orphanStudent: form.orphanStudent,
      cast: form.cast,
      religion: form.religion,
      bloodGroup: form.bloodGroup,
      totalSiblings: form.totalSiblings,
      nationality: form.nationality,
      identificationMark: form.identificationMark,
      disease: form.disease,
      isDisabled: form.isDisabled,
      disabilityPercentage: form.disabilityPercentage,
      disabilityType: form.disabilityType,
      additionalNote: form.additionalNote,
      // Section 3
      fatherName: form.fatherName, fatherOccupation: form.fatherOccupation,
      fatherPhone: form.fatherPhone, fatherAadhaar: form.fatherAadhaar,
      motherName: form.motherName, motherOccupation: form.motherOccupation,
      motherPhone: form.motherPhone, motherAadhaar: form.motherAadhaar,
      parentName: form.parentName, parentPhone: form.parentPhone,
      // Section 4 (snapshot uses flat fields)
      address: form.address.street,
      city:    form.address.city,
      state:   form.address.state,
      pincode: form.address.pincode,
      // Section 5
      bankAccountHolder: form.bankAccountHolder, bankName: form.bankName,
      bankBranchName: form.bankBranchName, bankIfsc: form.bankIfsc,
      bankAccountNumber: form.bankAccountNumber, bankBranchAddress: form.bankBranchAddress,
      // Section 6
      governmentIds: (form.governmentIds || []).filter(g => g && (g.type || g.number)),
    };
    return {
      _id: form._id,
      // Top-level fields kept on the Student document
      name: fullName || form.name,
      email: form.email,
      phone: form.phone,
      admissionNumber: form.admissionNumber,
      rollNumber: form.rollNumber,
      classId: form.classId,
      gender: form.gender,
      dateOfBirth: form.dateOfBirth || null,
      bloodGroup: form.bloodGroup,
      religion: form.religion,
      nationality: form.nationality,
      parentName: form.parentName,
      parentPhone: form.parentPhone,
      parentEmail: form.parentEmailSnap || form.email,
      address: form.address,
      medicalInfo: form.medicalInfo,
      hobbies: form.hobbies,
      // The full mirror — backend treats this as Mixed, replaces wholesale
      admissionSnapshot: snapshot,
    };
  };

  const sections = [
    { id: 'student',  label: '👤 Student' },
    { id: 'other',    label: '📋 Other' },
    { id: 'guardian', label: '👨‍👩‍👧 Guardian' },
    { id: 'address',  label: '📍 Address' },
    { id: 'bank',     label: '🏦 Bank' },
    { id: 'govids',   label: '🆔 Govt IDs' },
    { id: 'medical',  label: '🏥 Medical' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form._id ? 'Edit Student Profile' : 'Add New Student'} size="xl"
      footer={<>
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(buildPayload())} disabled={saving}>
          {saving ? 'Saving…' : form._id ? 'Save Changes' : 'Add Student'}
        </button>
      </>}>

      {/* Section tabs inside modal */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-warm dark:bg-gray-800 border border-border" style={{ overflowX:'auto' }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={'flex-shrink-0 px-3 py-1.5 rounded-lg text-xs font-semibold transition-all whitespace-nowrap ' +
              (activeSection === s.id ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
            {s.label}
          </button>
        ))}
      </div>

      {/* ── Student Information ── */}
      {activeSection === 'student' && (
        <div className="grid grid-cols-3 gap-4">
          <FormGroup label="First Name *"><input className="form-input" value={form.firstName} onChange={e => set('firstName', e.target.value)} placeholder="Pratiksha" /></FormGroup>
          <FormGroup label="Middle Name"><input className="form-input" value={form.middleName} onChange={e => set('middleName', e.target.value)} placeholder="Dhanraj" /></FormGroup>
          <FormGroup label="Last Name *"><input className="form-input" value={form.lastName} onChange={e => set('lastName', e.target.value)} placeholder="Shep" /></FormGroup>
          <FormGroup label="Registration No"><input className="form-input" value={form.registrationNo} onChange={e => set('registrationNo', e.target.value)} placeholder="REG-0042" /></FormGroup>
          <FormGroup label="Admission No"><input className="form-input" value={form.admissionNumber} onChange={e => set('admissionNumber', e.target.value)} placeholder="ADM-2026-XXXX" /></FormGroup>
          <FormGroup label="Roll Number"><input className="form-input" value={form.rollNumber} onChange={e => set('rollNumber', e.target.value)} placeholder="01" /></FormGroup>
          <FormGroup label="Class">
            <select className="form-input" value={form.classId} onChange={e => set('classId', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Date of Admission"><input type="date" className="form-input" value={form.dateOfAdmission} onChange={e => set('dateOfAdmission', e.target.value)} /></FormGroup>
          <FormGroup label="Academic Year"><input className="form-input" value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="2026-27" /></FormGroup>
          <FormGroup label="Discount in Fee (%)"><input className="form-input" type="number" min="0" max="100" value={form.discountInFee} onChange={e => set('discountInFee', e.target.value)} placeholder="0" /></FormGroup>
          <FormGroup label="Mobile (SMS/WhatsApp)"><input className="form-input" value={form.mobileForSMS} onChange={e => set('mobileForSMS', e.target.value.replace(/\D/g,'').slice(0,10))} placeholder="9876543210" /></FormGroup>
          <FormGroup label="Aadhaar Number"><input className="form-input" value={form.aadhaarNumber} onChange={e => set('aadhaarNumber', e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="XXXX XXXX XXXX" /></FormGroup>
          <FormGroup label="Category">
            <select className="form-input" value={form.category} onChange={e => set('category', e.target.value)}>
              <option value="">Select</option>
              <option value="general">General (Open)</option>
              <option value="obc">OBC</option>
              <option value="sc">SC</option>
              <option value="st">ST</option>
              <option value="ews">EWS</option>
              <option value="sebc">SEBC</option>
              <option value="sbc">SBC</option>
              <option value="vjnt_a">VJ-A / DT</option>
              <option value="nt_b">NT-B</option>
              <option value="nt_c">NT-C</option>
              <option value="nt_d">NT-D</option>
              <option value="minority">Minority</option>
            </select>
          </FormGroup>
          <FormGroup label="Non-Creamy Layer">
            <select className="form-input" value={form.nonCreamyLayer} onChange={e => set('nonCreamyLayer', e.target.value)}>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </FormGroup>
          <FormGroup label="Email *" className="col-span-2"><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@school.com" /></FormGroup>
        </div>
      )}

      {/* ── Other Information ── */}
      {activeSection === 'other' && (
        <div className="grid grid-cols-3 gap-4">
          <FormGroup label="Date of Birth"><input type="date" className="form-input" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormGroup>
          <FormGroup label="Birth Form ID / NIC"><input className="form-input" value={form.birthFormId} onChange={e => set('birthFormId', e.target.value)} /></FormGroup>
          <FormGroup label="Gender">
            <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">Select</option>
              <option value="male">Male</option>
              <option value="female">Female</option>
              <option value="other">Other</option>
            </select>
          </FormGroup>
          <FormGroup label="Orphan Status">
            <select className="form-input" value={form.orphanStudent} onChange={e => set('orphanStudent', e.target.value)}>
              <option value="">Select</option>
              <option value="orphan">Orphan</option>
              <option value="single_parent_mother">Single Parent (Mother)</option>
              <option value="single_parent_father">Single Parent (Father)</option>
              <option value="not_applicable">Not Applicable</option>
            </select>
          </FormGroup>
          <FormGroup label="Caste"><input className="form-input" value={form.cast} onChange={e => set('cast', e.target.value)} /></FormGroup>
          <FormGroup label="Religion"><input className="form-input" value={form.religion} onChange={e => set('religion', e.target.value)} /></FormGroup>
          <FormGroup label="Blood Group">
            <select className="form-input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Total Siblings"><input className="form-input" type="number" min="0" value={form.totalSiblings} onChange={e => set('totalSiblings', e.target.value)} /></FormGroup>
          <FormGroup label="Nationality"><input className="form-input" value={form.nationality} onChange={e => set('nationality', e.target.value)} /></FormGroup>
          <FormGroup label="Identification Mark" className="col-span-2"><input className="form-input" value={form.identificationMark} onChange={e => set('identificationMark', e.target.value)} /></FormGroup>
          <FormGroup label="Disease (if any)"><input className="form-input" value={form.disease} onChange={e => set('disease', e.target.value)} /></FormGroup>
          <FormGroup label="Is Disabled?">
            <select className="form-input" value={form.isDisabled} onChange={e => set('isDisabled', e.target.value)}>
              <option value="">Select</option>
              <option value="yes">Yes</option>
              <option value="no">No</option>
            </select>
          </FormGroup>
          {form.isDisabled === 'yes' && <>
            <FormGroup label="Disability %"><input className="form-input" type="number" min="0" max="100" value={form.disabilityPercentage} onChange={e => set('disabilityPercentage', e.target.value)} /></FormGroup>
            <FormGroup label="Disability Type" className="col-span-2"><input className="form-input" value={form.disabilityType} onChange={e => set('disabilityType', e.target.value)} placeholder="e.g. Visual, Hearing, Locomotor" /></FormGroup>
          </>}
          <FormGroup label="Additional Note" className="col-span-3"><textarea className="form-input" rows={3} value={form.additionalNote} onChange={e => set('additionalNote', e.target.value)} style={{ resize:'vertical' }} /></FormGroup>
        </div>
      )}

      {/* ── Parent / Guardian ── */}
      {activeSection === 'guardian' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Father's Name"><input className="form-input" value={form.fatherName} onChange={e => set('fatherName', e.target.value)} /></FormGroup>
          <FormGroup label="Father's Occupation"><input className="form-input" value={form.fatherOccupation} onChange={e => set('fatherOccupation', e.target.value)} /></FormGroup>
          <FormGroup label="Father's Phone"><PhoneInput value={form.fatherPhone} onChange={v => set('fatherPhone', v)} /></FormGroup>
          <FormGroup label="Father's Aadhaar"><input className="form-input" value={form.fatherAadhaar} onChange={e => set('fatherAadhaar', e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit" /></FormGroup>
          <FormGroup label="Mother's Name"><input className="form-input" value={form.motherName} onChange={e => set('motherName', e.target.value)} /></FormGroup>
          <FormGroup label="Mother's Occupation"><input className="form-input" value={form.motherOccupation} onChange={e => set('motherOccupation', e.target.value)} /></FormGroup>
          <FormGroup label="Mother's Phone"><PhoneInput value={form.motherPhone} onChange={v => set('motherPhone', v)} /></FormGroup>
          <FormGroup label="Mother's Aadhaar"><input className="form-input" value={form.motherAadhaar} onChange={e => set('motherAadhaar', e.target.value.replace(/\D/g,'').slice(0,12))} placeholder="12-digit" /></FormGroup>
          <FormGroup label="Primary Contact Name" className="col-span-2"><input className="form-input" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Father / Mother / Guardian" /></FormGroup>
          <FormGroup label="Contact Phone"><PhoneInput value={form.parentPhone} onChange={v => set('parentPhone', v)} /></FormGroup>
          <FormGroup label="Contact Email"><input type="email" className="form-input" value={form.parentEmailSnap} onChange={e => set('parentEmailSnap', e.target.value)} placeholder="parent@email.com" /></FormGroup>
        </div>
      )}

      {/* ── Address ── */}
      {activeSection === 'address' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Street / House No" className="col-span-2"><input className="form-input" value={form.address?.street} onChange={e => setA('street', e.target.value)} placeholder="123 Main Street" /></FormGroup>
          <FormGroup label="City"><input className="form-input" value={form.address?.city} onChange={e => setA('city', e.target.value)} /></FormGroup>
          <FormGroup label="State"><input className="form-input" value={form.address?.state} onChange={e => setA('state', e.target.value)} /></FormGroup>
          <FormGroup label="Pincode"><input className="form-input" value={form.address?.pincode} onChange={e => setA('pincode', e.target.value.replace(/\D/g,'').slice(0,6))} placeholder="6-digit" /></FormGroup>
        </div>
      )}

      {/* ── Bank Details ── */}
      {activeSection === 'bank' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Account Holder Name"><input className="form-input" value={form.bankAccountHolder} onChange={e => set('bankAccountHolder', e.target.value)} /></FormGroup>
          <FormGroup label="Bank Name"><input className="form-input" value={form.bankName} onChange={e => set('bankName', e.target.value)} placeholder="State Bank of India" /></FormGroup>
          <FormGroup label="Branch Name"><input className="form-input" value={form.bankBranchName} onChange={e => set('bankBranchName', e.target.value)} /></FormGroup>
          <FormGroup label="IFSC Code"><input className="form-input" value={form.bankIfsc} onChange={e => set('bankIfsc', e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,11))} placeholder="SBIN0001234" /></FormGroup>
          <FormGroup label="Account Number"><input className="form-input" value={form.bankAccountNumber} onChange={e => set('bankAccountNumber', e.target.value.replace(/\D/g,'').slice(0,18))} /></FormGroup>
          <FormGroup label="Branch Address" className="col-span-2"><input className="form-input" value={form.bankBranchAddress} onChange={e => set('bankBranchAddress', e.target.value)} /></FormGroup>
        </div>
      )}

      {/* ── Government IDs ── */}
      {activeSection === 'govids' && (
        <div>
          {(form.governmentIds || []).length === 0 && (
            <p className="text-sm text-muted mb-3">No IDs added yet. Click "+ Add ID" below.</p>
          )}
          {(form.governmentIds || []).map((row, i) => (
            <div key={i} className="grid grid-cols-12 gap-2 mb-3 items-start">
              <div className="col-span-4">
                <input className="form-input" value={row.type || ''} onChange={e => updateGovId(i, { type: e.target.value })} placeholder="ID type (e.g. APAAR, PEN)" />
              </div>
              <div className="col-span-7">
                <input className="form-input" value={row.number || ''} onChange={e => updateGovId(i, { number: e.target.value })} placeholder="ID number" />
              </div>
              <div className="col-span-1">
                <button type="button" onClick={() => removeGovId(i)}
                  className="text-xs font-semibold text-red-600 bg-red-50 border border-red-200 rounded-md px-2 py-2 w-full">✕</button>
              </div>
            </div>
          ))}
          <button type="button" onClick={addGovId}
            className="text-sm font-semibold text-indigo-600 bg-indigo-50 border border-dashed border-indigo-300 rounded-lg px-4 py-2">
            + Add ID
          </button>
        </div>
      )}

      {/* ── Medical ── */}
      {activeSection === 'medical' && (
        <div className="space-y-4">
          <FormGroup label="Medical Conditions / Allergies">
            <textarea className="form-input" rows={4} value={form.medicalInfo} onChange={e => set('medicalInfo', e.target.value)} placeholder="Any known allergies, chronic conditions, medications…" style={{ resize: 'vertical' }} />
          </FormGroup>
          <FormGroup label="Hobbies / Interests">
            <input className="form-input" value={form.hobbies} onChange={e => set('hobbies', e.target.value)} placeholder="Cricket, Drawing…" />
          </FormGroup>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-xs text-amber-700">
            ⚕️ Medical information is confidential and only visible to school administration.
          </div>
        </div>
      )}
    </Modal>
  );
}


// ─── Shared helpers ───────────────────────────────────────────────────────────
function Section({ title, children }) {
  return (
    <div>
      <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-3">{title}</h4>
      <div className="card p-4">{children}</div>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div className="grid grid-cols-2 lg:grid-cols-3 gap-x-4 gap-y-2">
      {items.map(({ label, value }) => (
        <div key={label}>
          <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
          <p className="text-sm font-medium text-ink dark:text-white">{value || '—'}</p>
        </div>
      ))}
    </div>
  );
}