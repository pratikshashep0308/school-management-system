// frontend/src/pages/Students.js
// Advanced Student Module — Full digital student lifecycle
/* eslint-disable no-unused-vars */
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { studentAPI, classAPI, attendanceAPI, examAPI, assignmentAPI, feeAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, SearchBox, LoadingState, EmptyState } from '../components/ui';

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
    <div style={{ position:"relative", width: size, height: size }}>
      <svg style={{ transform:"rotate(-90deg)" }} width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke="#e5e7eb" strokeWidth={stroke} />
        <circle cx={size/2} cy={size/2} r={r} fill="none" stroke={col} strokeWidth={stroke}
          strokeDasharray={`${(pct/100)*c} ${c}`} strokeLinecap="round" />
      </svg>
      <div style={{ position:"absolute", inset:0, display:"flex", alignItems:"center", justifyContent:"center" }}>
        <span style={{ fontSize:11, fontWeight:700, color: col }}>{pct}%</span>
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
    <div style={{ display:"flex", flexDirection:"column", gap:20 }}>
      {/* Header */}
      <div style={{ display:"flex", alignItems:"center", justifyContent:"space-between", flexWrap:"wrap", gap:12 }}>
        <div>
          <h2 style={{ fontSize:24, fontWeight:800, color:"#111827", margin:0 }}>Students</h2>
          <p style={{ fontSize:13, color:"#6B7280", marginTop:4 }}>{total} enrolled · {active} active</p>
        </div>

      </div>

      {/* Stats row */}
      <div style={{ display:"grid", gridTemplateColumns:"repeat(auto-fit, minmax(160px, 1fr))", gap:12 }}>
        {[
          { label: 'Total Students', value: total,  icon: '👥', bg: '#EFF6FF', clr: '#1D4ED8' },
          { label: 'Active',         value: active, icon: '✅', bg: '#F0FDF4', clr: '#166534' },
          { label: 'Boys',           value: boys,   icon: '👦', bg: '#EEF2FF', clr: '#3730A3' },
          { label: 'Girls',          value: girls,  icon: '👧', bg: '#FDF2F8', clr: '#9D174D' },
        ].map(s => (
          <div key={s.label} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:16, display:"flex", alignItems:"center", gap:12, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
            <div style={{ width:44, height:44, borderRadius:12, display:"flex", alignItems:"center", justifyContent:"center", fontSize:20, background: s.bg, color: s.clr }}>{s.icon}</div>
            <div>
              <div style={{ fontSize:24, fontWeight:800, color:"#111827" }}>{s.value}</div>
              <div style={{ fontSize:12, color:"#6B7280" }}>{s.label}</div>
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
          <button onClick={()=>{setSearch('');setFilterClass('');}}
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
            <button onClick={()=>{setSearch('');setFilterClass('');}}
              style={{ marginTop:16, padding:'8px 20px', borderRadius:8, background:'#6366F1', color:'#fff', border:'none', fontSize:13, cursor:'pointer' }}>
              Clear Filters
            </button>
          )}
        </div>
      ) : (
        <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:0, overflow:"hidden", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
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
        <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, overflow:"hidden", padding:0, boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }}>
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
                      <div style={{ fontFamily:'monospace', fontSize:12, color:'#1D4ED8', background:'#EFF6FF', padding:'4px 10px', borderRadius:6, display:'inline-block' }}>
                        {s.user?.email||'—'}
                      </div>
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
                      <button onClick={()=>{ setResetModal(s); setNewPassword('Student@123'); }}
                        style={{ fontSize:11, fontWeight:700, color:'#D97706', background:'#FEF3C7', border:'1px solid #FDE68A', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                        🔑 Reset Password
                      </button>
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
    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:16, padding:20, cursor:"pointer", boxShadow:"0 1px 4px rgba(0,0,0,0.06)" }} onClick={onView} onMouseEnter={e=>e.currentTarget.style.boxShadow="0 4px 16px rgba(0,0,0,0.12)"} onMouseLeave={e=>e.currentTarget.style.boxShadow="0 1px 4px rgba(0,0,0,0.06)"}>
      <div style={{ display:"flex", alignItems:"flex-start", gap:12, marginBottom:12 }}>
        {/* Avatar */}
        <div style={{ width:56, height:56, borderRadius:14, display:"flex", alignItems:"center", justifyContent:"center", color:"#fff", fontWeight:700, fontSize:20, flexShrink:0, background: `linear-gradient(135deg, ${genderColor}cc, ${genderColor}88)` }}>
          {s.user?.name?.charAt(0)?.toUpperCase()}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <p style={{ fontWeight:700, color:"#111827", overflow:"hidden", textOverflow:"ellipsis", whiteSpace:"nowrap", margin:0 }}>{s.user?.name}</p>
          <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>{s.admissionNumber}</p>
          <div style={{ display:"flex", alignItems:"center", gap:6, marginTop:4, flexWrap:"wrap" }}>
            {s.class && <span style={{ fontSize:10, fontWeight:700, padding:"2px 8px", borderRadius:999, background:"#EFF6FF", color:"#1D4ED8" }}>{s.class.name} {s.class.section}</span>}
            <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background:s.isActive?'#D1FAE5':'#F3F4F6', color:s.isActive?'#065F46':'#6B7280' }}>{s.isActive ? 'Active' : 'Inactive'}</span>
          </div>
        </div>
        <QRPlaceholder value={s.admissionNumber || s._id} size={40} />
      </div>

      <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:8, fontSize:12, color:"#6B7280", marginBottom:12 }}>
        {s.rollNumber && <span>🔢 Roll: <span style={{ color:"#111827", fontWeight:600 }}>{s.rollNumber}</span></span>}
        {s.gender    && <span>👤 <span style={{ color:"#111827", fontWeight:600, textTransform:"capitalize" }}>{s.gender}</span></span>}
        {s.bloodGroup && <span>🩸 <span style={{ color:"#111827", fontWeight:600 }}>{s.bloodGroup}</span></span>}
        {s.parentName && <span>👨‍👩‍👧 <span style={{ color:"#111827", fontWeight:600, overflow:"hidden", textOverflow:"ellipsis" }}>{s.parentName}</span></span>}
      </div>

      {canManage && (
        <div style={{ display:"flex", gap:8, paddingTop:12, borderTop:"1px solid #F3F4F6" }} onClick={e => e.stopPropagation()}>
          <button onClick={onView} style={{ flex:1, fontSize:11, border:"1px solid #E5E7EB", borderRadius:8, padding:"6px", cursor:"pointer", color:"#374151", background:"#fff", fontWeight:600 }}>👁 View</button>
          <button onClick={onEdit} style={{ flex:1, fontSize:11, border:"1px solid #E5E7EB", borderRadius:8, padding:"6px", cursor:"pointer", color:"#1D4ED8", background:"#EFF6FF", fontWeight:600 }}>✎ Edit</button>
          <button onClick={onDelete} style={{ fontSize:11, border:"1px solid #FECACA", borderRadius:8, padding:"6px 10px", cursor:"pointer", color:"#DC2626", background:"#FEF2F2", fontWeight:600 }}>✕</button>
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
    <div style={{ position:"fixed", inset:0, zIndex:300, display:"flex" }}>
      {/* Backdrop */}
      <div style={{ flex:1, background:"rgba(0,0,0,0.5)" }} onClick={onClose} />
      {/* Drawer */}
      <div style={{ width:"100%", maxWidth:860, background:"#fff", height:"100%", overflowY:"auto", boxShadow:"-8px 0 40px rgba(0,0,0,0.15)" }}>
        {/* Drawer header */}
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
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                  <Ring pct={attPct} size={60} />
                  <p style={{ fontSize:11, color:"#9CA3AF", marginTop:8 }}>Attendance</p>
                </div>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                  <Ring pct={avgPct} size={60} color="#7c6af5" />
                  <p style={{ fontSize:11, color:"#9CA3AF", marginTop:8 }}>Avg Score</p>
                </div>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, textAlign:"center", display:"flex", flexDirection:"column", alignItems:"center", justifyContent:"center", boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
                  <div style={{ fontSize:24, fontWeight:800, color:"#111827" }}>{fees.filter(f => f.status === 'pending').length}</div>
                  <p style={{ fontSize:11, color:"#9CA3AF", marginTop:4 }}>Pending Fees</p>
                </div>
              </div>

              {/* Personal info */}
              <Section title="Personal Information">
                <InfoGrid items={[
                  { label: 'Full Name',       value: s.user?.name },
                  { label: 'Email',           value: s.user?.email },
                  { label: 'Phone',           value: s.user?.phone || '—' },
                  { label: 'Date of Birth',   value: s.dateOfBirth ? new Date(s.dateOfBirth).toLocaleDateString('en-IN') : '—' },
                  { label: 'Gender',          value: s.gender ? s.gender.charAt(0).toUpperCase()+s.gender.slice(1) : '—' },
                  { label: 'Blood Group',     value: s.bloodGroup || '—' },
                  { label: 'Admission No',    value: s.admissionNumber },
                  { label: 'Roll Number',     value: s.rollNumber || '—' },
                  { label: 'Admission Date',  value: s.admissionDate ? new Date(s.admissionDate).toLocaleDateString('en-IN') : '—' },
                  { label: 'Status',          value: s.isActive ? '✅ Active' : '⭕ Inactive' },
                ]} />
              </Section>

              {/* Address */}
              {(s.address?.city || s.address?.street) && (
                <Section title="Address">
                  <p style={{ fontSize:13, color:"#374151" }}>
                    {[s.address.street, s.address.city, s.address.state, s.address.pincode].filter(Boolean).join(', ')}
                  </p>
                </Section>
              )}

              {/* Guardian */}
              <Section title="Guardian / Parent">
                <InfoGrid items={[
                  { label: 'Name',  value: s.parentName  || '—' },
                  { label: 'Phone', value: s.parentPhone || '—' },
                  { label: 'Email', value: s.parentEmail || '—' },
                ]} />
              </Section>

              {/* Transport */}
              {s.transportRoute && (
                <Section title="Transport">
                  <p style={{ fontSize:13, color:"#374151" }}>🚌 Route: {s.transportRoute?.routeName || s.transportRoute}</p>
                </Section>
              )}
            </div>
          )}

          {/* ── ACADEMIC ── */}
          {activeTab === 'academic' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {/* GPA card */}
              <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:20, display:"flex", alignItems:"center", gap:20, boxShadow:"0 1px 3px rgba(0,0,0,0.05)" }}>
                <Ring pct={avgPct} size={72} stroke={8} />
                <div>
                  <p style={{ fontSize:30, fontWeight:800, color:"#111827", margin:0 }}>{avgPct}%</p>
                  <p style={{ fontSize:13, color:"#9CA3AF", margin:"4px 0 0" }}>Overall Average</p>
                  <p style={{ fontSize:11, fontWeight:700, marginTop:4 }}>
                    Grade: {avgPct >= 90 ? 'A+' : avgPct >= 80 ? 'A' : avgPct >= 70 ? 'B' : avgPct >= 60 ? 'C' : avgPct >= 50 ? 'D' : 'F'}
                  </p>
                </div>
              </div>

              {/* Weak subjects alert */}
              {weakSub.length > 0 && (
                <div style={{ padding:16, borderRadius:12, background:"#FEF2F2", border:"1px solid #FECACA" }}>
                  <p style={{ fontSize:13, fontWeight:700, color:"#991B1B", marginBottom:8 }}>⚠️ Needs Attention</p>
                  {weakSub.map((w, i) => (
                    <p key={i} style={{ fontSize:11, color:"#DC2626", margin:"3px 0" }}>📌 {w.subject} — {w.pct}% (below 50%)</p>
                  ))}
                </div>
              )}

              {/* Subject bars */}
              {examResults.length > 0 ? (
                <Section title="Subject Performance">
                  {examResults.map((e, i) => (
                    <div key={i} style={{ marginBottom:12 }}>
                      <div style={{ display:"flex", justifyContent:"space-between", fontSize:11, marginBottom:4 }}>
                        <span style={{ fontWeight:600, color:"#111827" }}>{e.subject}</span>
                        <span style={{ color:"#9CA3AF" }}>{e.marks}/{e.total} ({e.pct}%)</span>
                      </div>
                      <div style={{ height:8, background:"#F3F4F6", borderRadius:4, overflow:"hidden" }}>
                        <div style={{ height:"100%", borderRadius:4, transition:"width 1s", width: e.pct + '%', background: e.pct >= 75 ? '#4a7c59' : e.pct >= 50 ? '#c9a84c' : '#d4522a' }} />
                      </div>
                    </div>
                  ))}
                </Section>
              ) : <EmptyState icon="📊" title="No exam results yet" />}

              {/* Upcoming exams */}
              {exams.length > 0 && (
                <Section title="Upcoming Exams">
                  {exams.filter(e => new Date(e.date) >= new Date()).slice(0, 5).map(e => (
                    <div key={e._id} style={{ display:"flex", alignItems:"center", justifyContent:"space-between", padding:"8px 0", borderBottom:"1px solid #F3F4F6" }}>
                      <div>
                        <p style={{ fontSize:13, fontWeight:600, color:"#111827", margin:0 }}>{e.name}</p>
                        <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>{e.subject?.name}</p>
                      </div>
                      <span style={{ fontSize:11, fontWeight:700, color:"#2563EB" }}>{new Date(e.date).toLocaleDateString('en-IN', { day:'2-digit', month:'short' })}</span>
                    </div>
                  ))}
                </Section>
              )}
            </div>
          )}

          {/* ── ATTENDANCE ── */}
          {activeTab === 'attendance' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr 1fr", gap:12 }}>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                  <div style={{ fontSize:24, fontWeight:800, color:"#166534" }}>{presentDays}</div>
                  <div style={{ fontSize:11, color:"#9CA3AF" }}>Present</div>
                </div>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                  <div style={{ fontSize:24, fontWeight:800, color:"#DC2626" }}>{attendance.length - presentDays}</div>
                  <div style={{ fontSize:11, color:"#9CA3AF" }}>Absent</div>
                </div>
                <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                  <div style={{ fontSize:24, fontWeight:800, color: attPct >= 75 ? '#166534' : attPct >= 50 ? '#B45309' : '#DC2626' }}>{attPct}%</div>
                  <div style={{ fontSize:11, color:"#9CA3AF" }}>Percentage</div>
                </div>
              </div>

              {attPct < 75 && (
                <div style={{ padding:12, borderRadius:10, background:"#FFFBEB", border:"1px solid #FDE68A", fontSize:11, color:"#B45309" }}>
                  ⚠️ Attendance below 75%. Minimum required: 75% for exam eligibility.
                </div>
              )}

              {/* Calendar heat-map simulation */}
              <Section title="This Month — Attendance Calendar">
                <div style={{ display:"grid", gridTemplateColumns:"repeat(7,1fr)", gap:6 }}>
                  {['S','M','T','W','T','F','S'].map(d => (
                    <div key={d} style={{ textAlign:"center", fontSize:10, color:"#9CA3AF", fontWeight:700 }}>{d}</div>
                  ))}
                  {Array.from({ length: 2 }, (_, i) => <div key={'pad-'+i} />)}
                  {attendance.map((a, i) => (
                    <div key={i} title={'Day ' + a.day + ': ' + a.status}
                      style={{ width:28, height:28, borderRadius:8, display:'flex', alignItems:'center', justifyContent:'center', fontSize:10, fontWeight:700, cursor:'default', background: a.status === 'present' ? '#D1FAE5' : '#FEE2E2', color: a.status === 'present' ? '#065F46' : '#DC2626' }}>
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
                  <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:12 }}>
                    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:"#166534" }}>₹{fees.filter(f => f.status === 'paid').reduce((s, f) => s + (f.amount || 0), 0).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize:11, color:"#9CA3AF" }}>Paid</div>
                    </div>
                    <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, boxShadow:"0 1px 3px rgba(0,0,0,0.05)", textAlign:"center" }}>
                      <div style={{ fontSize:20, fontWeight:800, color:"#B45309" }}>₹{fees.filter(f => f.status !== 'paid').reduce((s, f) => s + (f.amount || 0), 0).toLocaleString('en-IN')}</div>
                      <div style={{ fontSize:11, color:"#9CA3AF" }}>Pending</div>
                    </div>
                  </div>
                  {fees.map(f => (
                    <div key={f._id} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16, display:"flex", alignItems:"center", justifyContent:"space-between" }}>
                      <div>
                        <p style={{ fontWeight:600, fontSize:13, color:"#111827", margin:0 }}>{f.feeType || 'Fee'}</p>
                        <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>{f.dueDate ? new Date(f.dueDate).toLocaleDateString('en-IN') : '—'}</p>
                      </div>
                      <div style={{ textAlign:"right" }}>
                        <p style={{ fontWeight:700, color:"#111827", margin:0 }}>₹{(f.amount || 0).toLocaleString('en-IN')}</p>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background: f.status === 'paid' ? '#D1FAE5' : f.status === 'overdue' ? '#FEE2E2' : '#FEF3C7', color: f.status === 'paid' ? '#065F46' : f.status === 'overdue' ? '#991B1B' : '#92400E' }}>
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
                    <div key={a._id} style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16 }}>
                      <div style={{ display:"flex", alignItems:"flex-start", justifyContent:"space-between" }}>
                        <div style={{ flex:1 }}>
                          <p style={{ fontWeight:600, fontSize:13, color:"#111827", margin:0 }}>{a.title}</p>
                          <p style={{ fontSize:11, color:"#9CA3AF", margin:"2px 0 0" }}>{a.subject?.name} · {a.class?.name}</p>
                        </div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:999, background: isOverdue ? '#FEE2E2' : '#D1FAE5', color: isOverdue ? '#991B1B' : '#065F46' }}>
                          {isOverdue ? 'Overdue' : 'Active'}
                        </span>
                      </div>
                      <p style={{ fontSize:11, color:"#9CA3AF", marginTop:8 }}>📅 Due: {a.dueDate ? new Date(a.dueDate).toLocaleDateString('en-IN') : '—'}</p>
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
              <div style={{ padding:16, borderRadius:12, background:"#EFF6FF", border:"1px solid #BFDBFE", fontSize:13, color:"#1D4ED8" }}>
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
  const [form, setForm] = useState({
    name: '', email: '', phone: '', admissionNumber: '', rollNumber: '',
    classId: '', gender: '', dateOfBirth: '', bloodGroup: '',
    parentName: '', parentPhone: '', parentEmail: '',
    address: { street: '', city: '', state: '', pincode: '' },
    medicalInfo: '', hobbies: '',
  });
  const [activeSection, setActiveSection] = useState('basic');

  useEffect(() => {
    if (data) {
      setForm({
        name: data.user?.name || data.name || '',
        email: data.user?.email || data.email || '',
        phone: data.user?.phone || data.phone || '',
        admissionNumber: data.admissionNumber || '',
        rollNumber: data.rollNumber || '',
        classId: data.class?._id || data.classId || '',
        gender: data.gender || '',
        dateOfBirth: data.dateOfBirth ? data.dateOfBirth.split('T')[0] : '',
        bloodGroup: data.bloodGroup || '',
        parentName: data.parentName || '',
        parentPhone: data.parentPhone || '',
        parentEmail: data.parentEmail || '',
        address: data.address || { street: '', city: '', state: '', pincode: '' },
        medicalInfo: data.medicalInfo || '',
        hobbies: data.hobbies || '',
        _id: data._id,
      });
    } else {
      setForm({
        name: '', email: '', phone: '', admissionNumber: '', rollNumber: '',
        classId: '', gender: '', dateOfBirth: '', bloodGroup: '',
        parentName: '', parentPhone: '', parentEmail: '',
        address: { street: '', city: '', state: '', pincode: '' },
        medicalInfo: '', hobbies: '',
      });
    }
    setActiveSection('basic');
  }, [data, isOpen]);

  const set  = (k, v)    => setForm(f => ({ ...f, [k]: v }));
  const setA = (k, v)    => setForm(f => ({ ...f, address: { ...f.address, [k]: v } }));

  const sections = [
    { id: 'basic',    label: '👤 Basic' },
    { id: 'academic', label: '🎓 Academic' },
    { id: 'guardian', label: '👨‍👩‍👧 Guardian' },
    { id: 'address',  label: '📍 Address' },
    { id: 'medical',  label: '🏥 Medical' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form._id ? 'Edit Student Profile' : 'Add New Student'} size="xl"
      footer={<>
        <button style={{ flex:1, padding:"10px", borderRadius:9, fontSize:13, fontWeight:700, background:"#F3F4F6", border:"none", cursor:"pointer", color:"#374151" }} onClick={onClose}>Cancel</button>
        <button style={{ flex:1, padding:"10px", borderRadius:9, fontSize:13, fontWeight:700, background:"#2563EB", border:"none", cursor:"pointer", color:"#fff", opacity: saving ? 0.7 : 1 }} onClick={() => onSave(form)} disabled={saving}>{saving ? 'Saving…' : form._id ? 'Save Changes' : 'Add Student'}</button>
      </>}>

      {/* Section tabs inside modal */}
      <div style={{ display:"flex", gap:4, marginBottom:20, padding:4, borderRadius:12, background:"#F3F4F6", border:"1px solid #E5E7EB" }}>
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            style={{ flex:1, padding:'6px', borderRadius:8, fontSize:12, fontWeight:700, border:'none', cursor:'pointer',
              background: activeSection === s.id ? '#fff' : 'transparent',
              color: activeSection === s.id ? '#1D4ED8' : '#6B7280',
              boxShadow: activeSection === s.id ? '0 1px 4px rgba(0,0,0,0.1)' : 'none' }}>
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'basic' && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <FormGroup label="Full Name *" style={{ gridColumn:"1/-1" }}><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.name} onChange={e => set('name', e.target.value)} placeholder="Arjun Sharma" /></FormGroup>
          <FormGroup label="Email *"><input type="email" style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@school.com" /></FormGroup>
          <FormGroup label="Phone"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="Gender">
            <select style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </FormGroup>
          <FormGroup label="Date of Birth"><input type="date" style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormGroup>
          <FormGroup label="Blood Group">
            <select style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Hobbies"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.hobbies} onChange={e => set('hobbies', e.target.value)} placeholder="Cricket, Drawing…" /></FormGroup>
        </div>
      )}

      {activeSection === 'academic' && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <FormGroup label="Admission Number *"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.admissionNumber} onChange={e => set('admissionNumber', e.target.value)} placeholder="STU-2024-001" /></FormGroup>
          <FormGroup label="Roll Number"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.rollNumber} onChange={e => set('rollNumber', e.target.value)} placeholder="01" /></FormGroup>
          <FormGroup label="Class" style={{ gridColumn:"1/-1" }}>
            <select style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.classId} onChange={e => set('classId', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
            </select>
          </FormGroup>
          {!form._id && (
            <div style={{ gridColumn:"1/-1", padding:12, borderRadius:10, background:"#EFF6FF", border:"1px solid #BFDBFE", fontSize:11, color:"#1D4ED8" }}>
              💡 Default password: <strong>Student@123</strong> — student can change after first login.
            </div>
          )}
        </div>
      )}

      {activeSection === 'guardian' && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <FormGroup label="Parent / Guardian Name" style={{ gridColumn:"1/-1" }}><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Rajesh Sharma" /></FormGroup>
          <FormGroup label="Parent Phone"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="Parent Email"><input type="email" style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.parentEmail} onChange={e => set('parentEmail', e.target.value)} placeholder="parent@email.com" /></FormGroup>
        </div>
      )}

      {activeSection === 'address' && (
        <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:16 }}>
          <FormGroup label="Street / House No" style={{ gridColumn:"1/-1" }}><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.address?.street} onChange={e => setA('street', e.target.value)} placeholder="123 Main Street" /></FormGroup>
          <FormGroup label="City"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.address?.city} onChange={e => setA('city', e.target.value)} placeholder="Pune" /></FormGroup>
          <FormGroup label="State"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.address?.state} onChange={e => setA('state', e.target.value)} placeholder="Maharashtra" /></FormGroup>
          <FormGroup label="Pincode"><input style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} value={form.address?.pincode} onChange={e => setA('pincode', e.target.value)} placeholder="411001" /></FormGroup>
        </div>
      )}

      {activeSection === 'medical' && (
        <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
          <FormGroup label="Medical Conditions / Allergies">
            <textarea style={{ width:"100%", border:"1.5px solid #E5E7EB", borderRadius:8, padding:"7px 10px", fontSize:13, outline:"none", boxSizing:"border-box", fontFamily:"inherit" }} rows={4} value={form.medicalInfo} onChange={e => set('medicalInfo', e.target.value)} placeholder="Any known allergies, chronic conditions, medications…" />
          </FormGroup>
          <div style={{ padding:12, borderRadius:10, background:"#FFFBEB", border:"1px solid #FDE68A", fontSize:11, color:"#B45309" }}>
            ⚕️ This information is confidential and only visible to school administration.
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
      <h4 style={{ fontSize:11, fontWeight:700, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.05em", marginBottom:12 }}>{title}</h4>
      <div style={{ background:"#fff", border:"1px solid #E5E7EB", borderRadius:12, padding:16 }}>{children}</div>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div style={{ display:"grid", gridTemplateColumns:"1fr 1fr", gap:"8px 16px" }}>
      {items.map(({ label, value }) => (
        <div key={label}>
          <p style={{ fontSize:10, color:"#9CA3AF", textTransform:"uppercase", letterSpacing:"0.05em", margin:0 }}>{label}</p>
          <p style={{ fontSize:13, fontWeight:500, color:"#111827", margin:"2px 0 0" }}>{value || '—'}</p>
        </div>
      ))}
    </div>
  );
}