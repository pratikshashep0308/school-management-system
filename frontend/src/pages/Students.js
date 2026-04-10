// frontend/src/pages/Students.js
// Advanced Student Module — Full digital student lifecycle
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { studentAPI, classAPI, attendanceAPI, examAPI, assignmentAPI, feeAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, Badge, Avatar, SearchBox, LoadingState, EmptyState } from '../components/ui';
import api from '../utils/api';

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
  { id: 'all',      label: 'All Students', icon: '👥' },
  { id: 'active',   label: 'Active',       icon: '✅' },
  { id: 'inactive', label: 'Inactive',     icon: '⭕' },
  { id: 'alumni',   label: 'Alumni',       icon: '🎓' },
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
  const [tab,          setTab]         = useState('all');
  const [viewStudent,  setViewStudent] = useState(null);  // student profile drawer
  const [addModal,     setAddModal]    = useState({ open: false, data: null });
  const [saving,       setSaving]      = useState(false);

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
    const matchTab    = tab === 'all' || (tab === 'active' && s.isActive) || (tab === 'inactive' && !s.isActive) || (tab === 'alumni' && s.status === 'alumni');
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
    if (!window.confirm(`Deactivate ${name}?`)) return;
    try { await studentAPI.delete(id); toast.success('Student deactivated'); load(); }
    catch { toast.error('Failed to deactivate'); }
  };

  return (
    <div className="animate-fade-in space-y-5">
      {/* Header */}
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink dark:text-white">Students</h2>
          <p className="text-sm text-muted">{total} enrolled · {active} active</p>
        </div>
        {canManage && (
          <button className="btn-primary" onClick={() => setAddModal({ open: true, data: null })}>+ Add Student</button>
        )}
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
        {[
          { label: 'Total Students', value: total,  icon: '👥', color: 'bg-blue-50 dark:bg-blue-900/20 text-blue-600' },
          { label: 'Active',         value: active, icon: '✅', color: 'bg-green-50 dark:bg-green-900/20 text-green-600' },
          { label: 'Boys',           value: boys,   icon: '👦', color: 'bg-indigo-50 dark:bg-indigo-900/20 text-indigo-600' },
          { label: 'Girls',          value: girls,  icon: '👧', color: 'bg-pink-50 dark:bg-pink-900/20 text-pink-600' },
        ].map(s => (
          <div key={s.label} className="card p-4 flex items-center gap-3">
            <div className={'w-11 h-11 rounded-xl flex items-center justify-center text-xl ' + s.color}>{s.icon}</div>
            <div>
              <div className="text-2xl font-display text-ink dark:text-white">{s.value}</div>
              <div className="text-xs text-muted">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 items-center">
        <SearchBox value={search} onChange={setSearch} placeholder="Search name, ID, class…" />
        <select className="form-input w-44" value={filterClass} onChange={e => setFilterClass(e.target.value)}>
          <option value="">All Classes</option>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
        <div className="flex gap-1 p-1 rounded-xl bg-warm dark:bg-gray-800 border border-border">
          {TABS.map(t => (
            <button key={t.id} onClick={() => setTab(t.id)}
              className={'px-3 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
                (tab === t.id ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
              {t.icon} {t.label}
            </button>
          ))}
        </div>
      </div>

      {/* Student list table */}
      {loading ? <LoadingState /> : !filtered.length ? (
        <EmptyState icon="👤" title="No students found" subtitle="Try adjusting your search or filters" />
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
    <div className="fixed inset-0 z-[300] flex">
      {/* Backdrop */}
      <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={onClose} />
      {/* Drawer */}
      <div className="w-full max-w-2xl bg-white dark:bg-gray-900 h-full overflow-y-auto shadow-2xl">
        {/* Drawer header */}
        <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b border-border dark:border-gray-700 px-6 py-4">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 flex items-center justify-center text-white font-bold text-2xl">
              {s.user?.name?.charAt(0)}
            </div>
            <div className="flex-1">
              <h2 className="font-bold text-xl text-ink dark:text-white">{s.user?.name}</h2>
              <p className="text-sm text-muted">{s.admissionNumber} · {s.class?.name} {s.class?.section}</p>
            </div>
            <QRPlaceholder value={s.admissionNumber || s._id} size={52} />
            <div className="flex gap-2">
              {canManage && <button onClick={onEdit} className="text-xs border border-border px-3 py-1.5 rounded-lg hover:border-accent hover:text-accent transition-all">✎ Edit</button>}
              <button onClick={onClose} className="w-8 h-8 flex items-center justify-center rounded-lg border border-border text-muted hover:border-accent hover:text-accent text-lg">×</button>
            </div>
          </div>

          {/* Profile tabs */}
          <div className="flex gap-1 mt-4 overflow-x-auto pb-1">
            {PROFILE_TABS.map(t => (
              <button key={t.id} onClick={() => setActiveTab(t.id)}
                className={'flex items-center gap-1 px-3 py-1.5 rounded-xl text-xs font-semibold transition-all whitespace-nowrap ' +
                  (activeTab === t.id ? 'bg-accent text-white' : 'text-muted hover:text-ink dark:hover:text-white hover:bg-warm dark:hover:bg-gray-800')}>
                {t.icon} {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="p-6 space-y-5">
          {loadingData && <LoadingState />}

          {/* ── OVERVIEW ── */}
          {activeTab === 'overview' && (
            <div className="space-y-5">
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
                  <p className="text-sm text-slate dark:text-gray-300">
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
                  <p className="text-sm text-slate dark:text-gray-300">🚌 Route: {s.transportRoute?.routeName || s.transportRoute}</p>
                </Section>
              )}
            </div>
          )}

          {/* ── ACADEMIC ── */}
          {activeTab === 'academic' && (
            <div className="space-y-4">
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
            <div className="space-y-4">
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
            <div className="space-y-4">
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
            <div className="space-y-3">
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
            <div className="space-y-4">
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
        <button className="btn-secondary" onClick={onClose}>Cancel</button>
        <button className="btn-primary" onClick={() => onSave(form)} disabled={saving}>{saving ? 'Saving…' : form._id ? 'Save Changes' : 'Add Student'}</button>
      </>}>

      {/* Section tabs inside modal */}
      <div className="flex gap-1 mb-5 p-1 rounded-xl bg-warm dark:bg-gray-800 border border-border">
        {sections.map(s => (
          <button key={s.id} onClick={() => setActiveSection(s.id)}
            className={'flex-1 py-1.5 rounded-lg text-xs font-semibold transition-all ' +
              (activeSection === s.id ? 'bg-white dark:bg-gray-700 shadow text-accent' : 'text-muted hover:text-ink dark:hover:text-white')}>
            {s.label}
          </button>
        ))}
      </div>

      {activeSection === 'basic' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Full Name *" className="col-span-2"><input className="form-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Arjun Sharma" /></FormGroup>
          <FormGroup label="Email *"><input type="email" className="form-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="student@school.com" /></FormGroup>
          <FormGroup label="Phone"><input className="form-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="Gender">
            <select className="form-input" value={form.gender} onChange={e => set('gender', e.target.value)}>
              <option value="">Select gender</option>
              <option value="male">Male</option><option value="female">Female</option><option value="other">Other</option>
            </select>
          </FormGroup>
          <FormGroup label="Date of Birth"><input type="date" className="form-input" value={form.dateOfBirth} onChange={e => set('dateOfBirth', e.target.value)} /></FormGroup>
          <FormGroup label="Blood Group">
            <select className="form-input" value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
              <option value="">Select</option>
              {BLOOD_GROUPS.map(b => <option key={b}>{b}</option>)}
            </select>
          </FormGroup>
          <FormGroup label="Hobbies"><input className="form-input" value={form.hobbies} onChange={e => set('hobbies', e.target.value)} placeholder="Cricket, Drawing…" /></FormGroup>
        </div>
      )}

      {activeSection === 'academic' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Admission Number *"><input className="form-input" value={form.admissionNumber} onChange={e => set('admissionNumber', e.target.value)} placeholder="STU-2024-001" /></FormGroup>
          <FormGroup label="Roll Number"><input className="form-input" value={form.rollNumber} onChange={e => set('rollNumber', e.target.value)} placeholder="01" /></FormGroup>
          <FormGroup label="Class" className="col-span-2">
            <select className="form-input" value={form.classId} onChange={e => set('classId', e.target.value)}>
              <option value="">Select class</option>
              {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
            </select>
          </FormGroup>
          {!form._id && (
            <div className="col-span-2 p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-xs text-blue-700 dark:text-blue-300">
              💡 Default password: <strong>Student@123</strong> — student can change after first login.
            </div>
          )}
        </div>
      )}

      {activeSection === 'guardian' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Parent / Guardian Name" className="col-span-2"><input className="form-input" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Rajesh Sharma" /></FormGroup>
          <FormGroup label="Parent Phone"><input className="form-input" value={form.parentPhone} onChange={e => set('parentPhone', e.target.value)} placeholder="9876543210" /></FormGroup>
          <FormGroup label="Parent Email"><input type="email" className="form-input" value={form.parentEmail} onChange={e => set('parentEmail', e.target.value)} placeholder="parent@email.com" /></FormGroup>
        </div>
      )}

      {activeSection === 'address' && (
        <div className="grid grid-cols-2 gap-4">
          <FormGroup label="Street / House No" className="col-span-2"><input className="form-input" value={form.address?.street} onChange={e => setA('street', e.target.value)} placeholder="123 Main Street" /></FormGroup>
          <FormGroup label="City"><input className="form-input" value={form.address?.city} onChange={e => setA('city', e.target.value)} placeholder="Pune" /></FormGroup>
          <FormGroup label="State"><input className="form-input" value={form.address?.state} onChange={e => setA('state', e.target.value)} placeholder="Maharashtra" /></FormGroup>
          <FormGroup label="Pincode"><input className="form-input" value={form.address?.pincode} onChange={e => setA('pincode', e.target.value)} placeholder="411001" /></FormGroup>
        </div>
      )}

      {activeSection === 'medical' && (
        <div className="space-y-4">
          <FormGroup label="Medical Conditions / Allergies">
            <textarea className="form-input" rows={4} value={form.medicalInfo} onChange={e => set('medicalInfo', e.target.value)} placeholder="Any known allergies, chronic conditions, medications…" style={{ resize: 'vertical' }} />
          </FormGroup>
          <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-xs text-amber-700">
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
      <h4 className="text-xs font-bold text-muted uppercase tracking-wide mb-3">{title}</h4>
      <div className="card p-4">{children}</div>
    </div>
  );
}

function InfoGrid({ items }) {
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {items.map(({ label, value }) => (
        <div key={label}>
          <p className="text-[10px] text-muted uppercase tracking-wide">{label}</p>
          <p className="text-sm font-medium text-ink dark:text-white">{value || '—'}</p>
        </div>
      ))}
    </div>
  );
}