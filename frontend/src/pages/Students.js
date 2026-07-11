// frontend/src/pages/Students.js
// Advanced Student Module — Full digital student lifecycle
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import api, { studentAPI, classAPI, examAPI, assignmentAPI, feeAPI, attendanceAPI } from '../utils/api';
import { admissionAPI } from '../utils/admissionUtils';
import { useAuth } from '../context/AuthContext';
import { Modal, FormGroup, LoadingState, EmptyState } from '../components/ui';
import PhoneInput from '../components/ui/PhoneInput';
import AdmissionFormModal from '../components/admissions/AdmissionFormModal';
import BehaviouralNotes from '../components/BehaviouralNotes';
import RollNumberEditor from '../components/RollNumberEditor';

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
  { id: 'all',           label: 'All Students',          icon: '👥' },
  { id: 'active',        label: 'Active',                icon: '✅' },
  { id: 'inactive',      label: 'Inactive',              icon: '⭕' },
  { id: 'alumni',        label: 'Alumni',                icon: '🎓' },
  { id: 'managelogin',   label: 'Manage Student Login',  icon: '🔑' },
  { id: 'manageparents', label: 'Manage Parent Login',   icon: '👨‍👩‍👧' },
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
  const { can } = useAuth();
  const [students,     setStudents]    = useState([]);
  const [classes,      setClasses]     = useState([]);
  const [loading,      setLoading]     = useState(true);
  const [search,       setSearch]      = useState('');
  const [filterClass,  setFilterClass] = useState('');
  const [filterGender, setFilterGender] = useState('');
  const [tab,          setTab]         = useState('all');
  const [viewStudent,  setViewStudent] = useState(null);  // student profile drawer
  const [addModal,     setAddModal]    = useState({ open: false, data: null });
  const [editAdmission, setEditAdmission] = useState(null); // admission record loaded for AdmissionFormModal
  const [loadingAdm,   setLoadingAdm]  = useState(false);
  const [saving,       setSaving]      = useState(false);
  const [resetModal,   setResetModal]  = useState(null); // student to reset password
  const [newPassword,  setNewPassword] = useState('');
  const [resetting,    setResetting]   = useState(false);
  const [showPwd,      setShowPwd]     = useState({});
  // Track passwords set during THIS browser session so the admin can see what
  // they just assigned without needing to remember it. Passwords are bcrypt-hashed
  // in the DB and not retrievable — so for any student whose password we didn't
  // set here, we can only show "unknown". Stored in sessionStorage (not local)
  // so it clears on browser close — keeps things less risky.
  const [knownPwd, setKnownPwd] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('knownStudentPwds') || '{}'); }
    catch { return {}; }
  });
  const rememberPwd = (studentId, pwd) => {
    setKnownPwd(prev => {
      const next = { ...prev, [studentId]: pwd };
      try { sessionStorage.setItem('knownStudentPwds', JSON.stringify(next)); } catch {}
      return next;
    });
  };

  const canManage = can(['superAdmin', 'schoolAdmin']);

  /**
   * Open the comprehensive AdmissionFormModal for editing a student.
   *
   * Why this exists: the Students page formerly opened a smaller tabbed modal
   * (StudentFormModal). The user asked for a single edit experience, so we now
   * load the matching Admission record and reuse the AdmissionFormModal — same
   * form used in the Admissions page.
   *
   * Match rule: admission.applicationNumber matches student.admissionNumber as
   * a prefix (at enrollment, admNo can be `${applicationNumber}-<timestamp>`).
   * If no admission is found, fall back to constructing a synthetic record from
   * the student's data (e.g. for students created manually without admission).
   */
  const openEditFromStudent = useCallback(async (s) => {
    if (!s?.admissionNumber) {
      toast.error('No admission record linked to this student.');
      return;
    }
    setLoadingAdm(true);
    try {
      // student.admissionNumber may be `<applicationNumber>-<timestamp>` (set at
      // enrollment) or sometimes just the applicationNumber. Strip a trailing
      // `-NNNNNN` suffix so the search matches the admission's applicationNumber.
      const appNumGuess = s.admissionNumber.replace(/-\d{1,6}$/, '');

      // Search by the (likely) applicationNumber prefix
      const res = await admissionAPI.getAll({ search: appNumGuess });
      const list = res.data?.data || [];

      // Match preference order:
      //   1. Exact applicationNumber match (most reliable)
      //   2. Stripped-suffix match (covers enrolled-with-timestamp case)
      //   3. Original admissionNumber starts with returned applicationNumber
      let adm = list.find(a => a.applicationNumber === s.admissionNumber)
             || list.find(a => a.applicationNumber === appNumGuess)
             || list.find(a => s.admissionNumber.startsWith(a.applicationNumber));

      if (!adm) {
        // No admission found — refuse to silently create a new one. This avoids
        // accidentally producing duplicate admissions when a search/lookup fails.
        toast.error('No matching admission record found for this student. Please contact admin.');
        console.error('No admission match for student', { admissionNumber: s.admissionNumber, appNumGuess, candidates: list.map(a => a.applicationNumber) });
        return;
      }

      setEditAdmission(adm);
    } catch (err) {
      console.error('Failed to load admission:', err);
      toast.error('Could not load admission record.');
    } finally {
      setLoadingAdm(false);
    }
  }, []);

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
    const matchTab    = tab === 'all' || tab === 'managelogin' || tab === 'manageparents' || (tab === 'active' && s.isActive) || (tab === 'inactive' && !s.isActive) || (tab === 'alumni' && s.status === 'alumni');
    const matchGender = !filterGender || (s.gender||'').toLowerCase() === filterGender;
    return matchSearch && matchClass && matchTab && matchGender;
  });

  // Stats
  const total    = students.length;
  const active   = students.filter(s => s.isActive).length;
  const boys     = students.filter(s => s.gender === 'male').length;
  const girls    = students.filter(s => s.gender === 'female').length;

  const handleSave = async (form) => {
    setSaving(true);
    try {
      // Strip _id from body (it lives in the URL).
      const { _id, ...body } = form;

      // ── Defensive cleanup ─────────────────────────────────────────────────
      // Two known sources of "Resource not found with id of [object Object]":
      //
      // 1. ObjectId-typed fields receiving a populated subdoc instead of a string.
      const toIdStr = (v) => {
        if (v === null || v === undefined || v === '') return v;
        if (typeof v === 'string') return v;
        if (typeof v === 'object') return v._id ? String(v._id) : String(v);
        return String(v);
      };
      ['classId','class','parentId','parent','school','user','transportRoute'].forEach(k => {
        if (k in body) body[k] = toIdStr(body[k]);
      });

      // 2. address.{street|city|state|pincode} can become NESTED objects when an
      //    older record had snap.address as an object and hydration assigned the
      //    whole object to the `street` slot. Force every part to a clean string.
      const flatStr = (v) => {
        if (v === null || v === undefined) return '';
        if (typeof v === 'string' || typeof v === 'number') return String(v);
        if (typeof v === 'object') {
          // Recursively try common nested shapes
          return flatStr(v.street ?? v.line1 ?? v.text ?? v.value ?? '');
        }
        return '';
      };
      if (body.address && typeof body.address === 'object') {
        body.address = {
          street:  flatStr(body.address.street),
          city:    flatStr(body.address.city),
          state:   flatStr(body.address.state),
          pincode: flatStr(body.address.pincode),
        };
      }
      // Also clean snapshot.address if it slipped through as an object
      if (body.admissionSnapshot && typeof body.admissionSnapshot === 'object') {
        const snap = body.admissionSnapshot;
        if (snap.address && typeof snap.address === 'object') {
          // Migrate: store flat string at snapshot level, since the receipt and
          // detail modal already handle both flat and nested shapes.
          snap.address = flatStr(snap.address);
        }
        ['city','state','pincode'].forEach(k => {
          if (snap[k] !== undefined) snap[k] = flatStr(snap[k]);
        });
      }

      console.log('[Save Student] PUT body keys:', Object.keys(body));

      if (_id) { await studentAPI.update(_id, body); toast.success('Student updated'); }
      else     { await studentAPI.create(body); toast.success('Student added ✅'); }
      setAddModal({ open: false, data: null }); load();
    } catch (err) {
      console.error('Save failed:', err.response?.data || err);
      toast.error(err.response?.data?.message || 'Error saving student');
    }
    finally { setSaving(false); }
  };

  // eslint-disable-next-line no-unused-vars

  // eslint-disable-next-line no-unused-vars
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
      // Remember this password so the table column shows the truth, not a guess.
      rememberPwd(resetModal._id, newPassword);
      toast.success(`Password reset for ${resetModal.user?.name}`);
      setResetModal(null); setNewPassword('');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to reset password'); }
    finally { setResetting(false); }
  };

  // Bulk reset every active student's password to Student@123.
  // Runs sequentially (not Promise.all) so one bad response doesn't tank the
  // whole batch — and so we can show a live progress count.
  const [bulkResetting, setBulkResetting] = useState(false);
  const [bulkProgress,  setBulkProgress]  = useState({ done: 0, total: 0 });
  const handleBulkReset = async () => {
    const active = students.filter(s => s.isActive);
    if (!active.length) return toast.error('No active students to reset');
    if (!window.confirm(
      `Reset password for all ${active.length} active students to "Student@123"?\n\n` +
      `Any password each student set themselves will be overwritten.\n` +
      `This cannot be undone.`
    )) return;

    setBulkResetting(true);
    setBulkProgress({ done: 0, total: active.length });
    let ok = 0, failed = 0;
    for (const s of active) {
      try {
        await studentAPI.resetPassword(s._id, { password: 'Student@123' });
        rememberPwd(s._id, 'Student@123');
        ok++;
      } catch (err) {
        console.error('Bulk reset failed for', s.user?.name, err);
        failed++;
      }
      setBulkProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBulkResetting(false);
    if (failed === 0) {
      toast.success(`Reset ${ok} student passwords to Student@123`);
    } else {
      toast.error(`${ok} reset, ${failed} failed — check console for details`);
    }
  };

  // ── Parent login state ──────────────────────────────────────────────────────
  // Mirrors the student-side knownPwd: we only know a parent's password if we
  // created the account in this session. sessionStorage so it survives refresh
  // but not browser close.
  const [knownParentPwd, setKnownParentPwd] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('knownParentPwds') || '{}'); }
    catch { return {}; }
  });
  const rememberParentPwd = (studentId, pwd) => {
    setKnownParentPwd(prev => {
      const next = { ...prev, [studentId]: pwd };
      try { sessionStorage.setItem('knownParentPwds', JSON.stringify(next)); } catch {}
      return next;
    });
  };
  const [bulkLinking, setBulkLinking] = useState(false);
  const [bulkLinkProgress, setBulkLinkProgress] = useState({ done: 0, total: 0 });
  const [linkingParent, setLinkingParent] = useState({}); // {studentId: bool}

  // Parent email resolver — checks all the places it might live across older
  // and newer records (Student.parentEmail, admissionSnapshot, father/mother).
  const getParentEmail = (s) => (
    s.parentEmail
    || s.admissionSnapshot?.parentEmail
    || s.admissionSnapshot?.fatherEmail
    || s.admissionSnapshot?.motherEmail
    || ''
  );

  // Create or link a single parent account for a student.
  const linkParentForStudent = async (s) => {
    const parentEmail = getParentEmail(s);
    if (!parentEmail) {
      toast.error(`No parent email on file for ${s.user?.name}. Edit student to add one.`);
      return null;
    }
    setLinkingParent(p => ({ ...p, [s._id]: true }));
    try {
      const res = await studentAPI.linkParent(s._id, {
        parentEmail,
        parentName:  s.parentName || s.admissionSnapshot?.parentName || s.admissionSnapshot?.fatherName || '',
        parentPhone: s.parentPhone || s.admissionSnapshot?.parentPhone || '',
      });
      const acct = res.data?.parentAccount;
      if (acct?.isNew && acct?.defaultPassword) {
        rememberParentPwd(s._id, acct.defaultPassword);
      } else if (!acct?.isNew) {
        // Existing parent account — we don't know the password; clear any stale
        // value in case we previously had something cached.
        rememberParentPwd(s._id, null);
      }
      load(); // refresh so parentId on the student shows up next render
      return acct;
    } catch (err) {
      toast.error(err.response?.data?.message || `Failed to link parent for ${s.user?.name}`);
      return null;
    } finally {
      setLinkingParent(p => { const n = { ...p }; delete n[s._id]; return n; });
    }
  };

  // Bulk: create/link parents for every active student that has an email.
  const handleBulkLinkParents = async () => {
    const eligible = students.filter(s => s.isActive && getParentEmail(s) && !(s.parentId || s.parent));
    if (!eligible.length) {
      toast.error('No students need a new parent link (all already linked, or missing parent email).');
      return;
    }
    if (!window.confirm(
      `Create / link parent accounts for ${eligible.length} student(s)?\n\n` +
      `New parent accounts get the default password "Parent@123".\n` +
      `Existing parent accounts (same email already in system) are linked without changing their password.`
    )) return;

    setBulkLinking(true);
    setBulkLinkProgress({ done: 0, total: eligible.length });
    let ok = 0, failed = 0;
    for (const s of eligible) {
      const acct = await linkParentForStudent(s);
      if (acct) ok++; else failed++;
      setBulkLinkProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBulkLinking(false);
    if (failed === 0) toast.success(`Linked ${ok} parent account(s)`);
    else toast.error(`${ok} linked, ${failed} failed — check console`);
  };

  // Bulk: reset every linked parent account's password to Parent@123.
  const handleBulkResetParents = async () => {
    const eligible = students.filter(s => s.isActive && (s.parentId || s.parent));
    if (!eligible.length) {
      toast.error('No linked parent accounts to reset. Create / link parents first.');
      return;
    }
    if (!window.confirm(
      `Reset password for ${eligible.length} linked parent account(s) to "Parent@123"?\n\n` +
      `Any password each parent set themselves will be overwritten.`
    )) return;

    setBulkLinking(true);
    setBulkLinkProgress({ done: 0, total: eligible.length });
    let ok = 0, failed = 0;
    for (const s of eligible) {
      try {
        await studentAPI.resetParentPassword(s._id, { password: 'Parent@123' });
        rememberParentPwd(s._id, 'Parent@123');
        ok++;
      } catch (err) {
        console.error('Parent reset failed for', s.user?.name, err);
        failed++;
      }
      setBulkLinkProgress(p => ({ ...p, done: p.done + 1 }));
    }
    setBulkLinking(false);
    if (failed === 0) toast.success(`Reset ${ok} parent password(s) to Parent@123`);
    else toast.error(`${ok} reset, ${failed} failed — check console`);
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
              t.id === 'all'           ? total :
              t.id === 'active'        ? active :
              t.id === 'inactive'      ? (total - active) :
              t.id === 'alumni'        ? students.filter(s=>s.status==='alumni').length :
              t.id === 'managelogin'   ? active :
              t.id === 'manageparents' ? active : 0
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
      {tab !== 'managelogin' && tab !== 'manageparents' && (loading ? <LoadingState /> : !filtered.length ? (
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
                  // Profile photo: check top-level Student fields and snapshot
                  // under multiple possible keys (saved code wrote to `studentPhoto`,
                  // schema declared `photo`, legacy imports used `profilePhoto`).
                  const photo  = s.studentPhoto || s.photo || s.profilePhoto
                                 || s.admissionSnapshot?.studentPhoto || s.admissionSnapshot?.photo || '';
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
                          <div style={{ width:36, height:36, borderRadius:10, background:photo ? '#F3F4F6' : bg, display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0, overflow:'hidden' }}>
                            {photo ? (
                              <img src={photo} alt={name} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                            ) : (
                              <span style={{ fontSize:13, fontWeight:700, color:'#fff' }}>{initials}</span>
                            )}
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
                          {canManage && (
                            <button onClick={()=>openEditFromStudent(s)} disabled={loadingAdm}
                              style={{ fontSize:11, fontWeight:700, color:'#374151', background:'#F3F4F6', border:'1px solid #E5E7EB', padding:'4px 10px', borderRadius:6, cursor: loadingAdm ? 'wait' : 'pointer' }}>
                              {loadingAdm ? '⏳' : '✎'}
                            </button>
                          )}
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
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#111827' }}>🔑 Manage Student Login</div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>View credentials and reset passwords for student portal access</div>
            </div>
            {/* Bulk reset — useful right after import or when admin needs every
                student on a known default. Shows a live progress count while running. */}
            <button
              onClick={handleBulkReset}
              disabled={bulkResetting}
              style={{
                fontSize:12, fontWeight:700,
                color: bulkResetting ? '#9CA3AF' : '#fff',
                background: bulkResetting ? '#E5E7EB' : '#DC2626',
                border: 'none',
                padding: '8px 14px', borderRadius: 8,
                cursor: bulkResetting ? 'wait' : 'pointer',
                whiteSpace: 'nowrap',
              }}
            >
              {bulkResetting
                ? `Resetting… ${bulkProgress.done}/${bulkProgress.total}`
                : '🔄 Reset all to Student@123'}
            </button>
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
                      {(() => {
                        const known = knownPwd[s._id];
                        const isVisible = showPwd[s._id];
                        // We can't truly know an old password (bcrypt is one-way).
                        // If we don't have one saved from this session, say so.
                        if (!known) {
                          return (
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ fontFamily:'monospace', fontSize:11, color:'#9CA3AF', background:'#F9FAFB', padding:'4px 10px', borderRadius:6, fontStyle:'italic' }}>
                                unknown — reset to set
                              </div>
                            </div>
                          );
                        }
                        return (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ fontFamily:'monospace', fontSize:12, color:'#374151', background:'#F3F4F6', padding:'4px 10px', borderRadius:6 }}>
                              {isVisible ? known : '••••••••••'}
                            </div>
                            <button onClick={()=>setShowPwd(p=>({...p,[s._id]:!p[s._id]}))}
                              style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' }}>
                              {isVisible ? '🙈' : '👁'}
                            </button>
                          </div>
                        );
                      })()}
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

      {/* ──────────────────────────────────────────────────────────────────────
          Manage Parent Login Tab
          One row per active student. Each row shows whether a parent User
          exists, the parent email, the password (only if we set it this
          session), and action buttons to create-or-link / reset.
          ────────────────────────────────────────────────────────────────────── */}
      {tab === 'manageparents' && (
        <div className="card overflow-hidden" style={{ padding:0 }}>
          <div style={{ padding:'14px 20px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center', gap:12, flexWrap:'wrap' }}>
            <div>
              <div style={{ fontWeight:700, fontSize:15, color:'#111827' }}>👨‍👩‍👧 Manage Parent Login</div>
              <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>Create parent accounts and reset their passwords. Parents can see their child's attendance, fees, and report card.</div>
            </div>
            <div style={{ display:'flex', gap:8, flexWrap:'wrap' }}>
              <button
                onClick={handleBulkLinkParents}
                disabled={bulkLinking}
                style={{
                  fontSize:12, fontWeight:700,
                  color: bulkLinking ? '#9CA3AF' : '#fff',
                  background: bulkLinking ? '#E5E7EB' : '#1D4ED8',
                  border:'none', padding:'8px 14px', borderRadius:8,
                  cursor: bulkLinking ? 'wait' : 'pointer',
                  whiteSpace:'nowrap',
                }}>
                {bulkLinking
                  ? `Working… ${bulkLinkProgress.done}/${bulkLinkProgress.total}`
                  : '➕ Create / Link All'}
              </button>
              <button
                onClick={handleBulkResetParents}
                disabled={bulkLinking}
                style={{
                  fontSize:12, fontWeight:700,
                  color: bulkLinking ? '#9CA3AF' : '#fff',
                  background: bulkLinking ? '#E5E7EB' : '#DC2626',
                  border:'none', padding:'8px 14px', borderRadius:8,
                  cursor: bulkLinking ? 'wait' : 'pointer',
                  whiteSpace:'nowrap',
                }}>
                {bulkLinking
                  ? `Working… ${bulkLinkProgress.done}/${bulkLinkProgress.total}`
                  : '🔄 Reset all to Parent@123'}
              </button>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['#','Student','Class','Parent Email','Password','Status','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {students.filter(s=>s.isActive).map((s,i)=>{
                  const parentEmail   = getParentEmail(s);
                  const hasParentUser = !!(s.parentId || s.parent);
                  const isLinking     = !!linkingParent[s._id];
                  const known         = knownParentPwd[s._id];
                  const copy = (text, label) => {
                    if (!text) return;
                    navigator.clipboard?.writeText(text).then(
                      () => toast.success(`${label} copied`),
                      () => toast.error('Could not copy')
                    );
                  };
                  return (
                    <tr key={s._id} style={{ borderBottom:'0.5px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'11px 16px', color:'#9CA3AF' }}>{i+1}</td>
                      <td style={{ padding:'11px 16px' }}>
                        <div style={{ fontWeight:700, color:'#111827' }}>{s.user?.name}</div>
                        <div style={{ fontSize:11, color:'#9CA3AF' }}>Roll: {s.rollNumber || s.admissionNumber}</div>
                      </td>
                      <td style={{ padding:'11px 16px', color:'#374151' }}>{s.class?.name || '—'}</td>
                      <td style={{ padding:'11px 16px' }}>
                        {parentEmail ? (
                          <div style={{ fontFamily:'monospace', fontSize:12, color:'#1D4ED8', background:'#EFF6FF', padding:'4px 10px', borderRadius:6, display:'inline-block' }}>
                            {parentEmail}
                          </div>
                        ) : (
                          <div style={{ fontSize:11, color:'#DC2626', fontStyle:'italic' }}>
                            ⚠️ No email — edit student first
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'11px 16px' }}>
                        {!hasParentUser ? (
                          <div style={{ fontFamily:'monospace', fontSize:11, color:'#9CA3AF', background:'#F9FAFB', padding:'4px 10px', borderRadius:6, fontStyle:'italic', display:'inline-block' }}>
                            no account yet
                          </div>
                        ) : known ? (
                          <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                            <div style={{ fontFamily:'monospace', fontSize:12, color:'#374151', background:'#F3F4F6', padding:'4px 10px', borderRadius:6 }}>
                              {showPwd['p_'+s._id] ? known : '••••••••••'}
                            </div>
                            <button onClick={()=>setShowPwd(p=>({...p,['p_'+s._id]:!p['p_'+s._id]}))}
                              style={{ fontSize:11, color:'#6B7280', background:'none', border:'none', cursor:'pointer' }}>
                              {showPwd['p_'+s._id] ? '🙈' : '👁'}
                            </button>
                          </div>
                        ) : (
                          <div style={{ fontFamily:'monospace', fontSize:11, color:'#9CA3AF', background:'#F9FAFB', padding:'4px 10px', borderRadius:6, fontStyle:'italic', display:'inline-block' }}>
                            unknown — reset to set
                          </div>
                        )}
                      </td>
                      <td style={{ padding:'11px 16px' }}>
                        {hasParentUser ? (
                          <span style={{ fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5', padding:'3px 10px', borderRadius:20 }}>
                            Linked
                          </span>
                        ) : (
                          <span style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FEF3C7', padding:'3px 10px', borderRadius:20 }}>
                            Not linked
                          </span>
                        )}
                      </td>
                      <td style={{ padding:'11px 16px' }}>
                        <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                          {!hasParentUser ? (
                            <button
                              onClick={() => linkParentForStudent(s)}
                              disabled={!parentEmail || isLinking}
                              style={{ fontSize:11, fontWeight:700,
                                color: (!parentEmail||isLinking) ? '#9CA3AF' : '#fff',
                                background: (!parentEmail||isLinking) ? '#E5E7EB' : '#1D4ED8',
                                border:'none', padding:'5px 12px', borderRadius:7,
                                cursor: (!parentEmail||isLinking) ? 'not-allowed' : 'pointer' }}>
                              {isLinking ? 'Creating…' : '➕ Create Login'}
                            </button>
                          ) : (
                            <>
                              <button
                                onClick={async () => {
                                  try {
                                    await studentAPI.resetParentPassword(s._id, { password: 'Parent@123' });
                                    rememberParentPwd(s._id, 'Parent@123');
                                    toast.success(`Reset to Parent@123`);
                                  } catch (err) {
                                    toast.error(err.response?.data?.message || 'Failed to reset');
                                  }
                                }}
                                style={{ fontSize:11, fontWeight:700, color:'#D97706', background:'#FEF3C7', border:'1px solid #FDE68A', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                                🔑 Reset Password
                              </button>
                              {known && (
                                <button
                                  onClick={() => copy(`Email: ${parentEmail}\nPassword: ${known}`, 'Credentials')}
                                  style={{ fontSize:11, fontWeight:700, color:'#065F46', background:'#D1FAE5', border:'1px solid #86EFAC', padding:'5px 12px', borderRadius:7, cursor:'pointer' }}>
                                  📋 Copy Both
                                </button>
                              )}
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
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
          knownPassword={knownPwd[viewStudent._id]}
          onClose={() => setViewStudent(null)}
          onEdit={() => { openEditFromStudent(viewStudent); setViewStudent(null); }}
        />
      )}

      {/* ── Edit Modal ── reuses the AdmissionFormModal so the experience matches
          the Admissions page. The backend's Admission→Student mirror keeps the
          Student record in sync after save. */}
      {editAdmission && (
        <AdmissionFormModal
          isOpen={true}
          initial={editAdmission}
          onClose={() => setEditAdmission(null)}
          onSuccess={() => { setEditAdmission(null); load(); toast.success('Student updated'); }}
        />
      )}

      {/* New-student "Add" still uses the lightweight tabbed form below
          (StudentFormModal). Edit always goes through AdmissionFormModal above. */}
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
// eslint-disable-next-line no-unused-vars
function StudentCard({ student: s, canManage, onView, onEdit, onDelete }) {
  const genderColor = s.gender === 'female' ? '#ec4899' : s.gender === 'male' ? '#3b82f6' : '#8b5cf6';
  return (
    <div className="card p-5 hover:shadow-md hover:-translate-y-0.5 transition-all cursor-pointer" onClick={onView}>
      <div className="flex items-start gap-3 mb-3">
        {/* Avatar — photo if uploaded, else first-letter circle */}
        {(() => {
          const photo = s.studentPhoto || s.photo || s.profilePhoto
                        || s.admissionSnapshot?.studentPhoto || s.admissionSnapshot?.photo || '';
          if (photo) {
            return (
              <div className="w-14 h-14 rounded-2xl overflow-hidden flex-shrink-0 bg-warm">
                <img src={photo} alt={s.user?.name || ''} className="w-full h-full object-cover" />
              </div>
            );
          }
          return (
            <div className="w-14 h-14 rounded-2xl flex items-center justify-center text-white font-bold text-xl flex-shrink-0"
              style={{ background: `linear-gradient(135deg, ${genderColor}cc, ${genderColor}88)` }}>
              {s.user?.name?.charAt(0)?.toUpperCase()}
            </div>
          );
        })()}
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

function StudentProfileDrawer({ student: s, classes, canManage, knownPassword, onClose, onEdit }) {
  const [activeTab, setActiveTab] = useState('overview');
  const [exams,       setExams]       = useState([]);
  const [attendance,  setAttendance]  = useState([]);
  const [attSummary,  setAttSummary]  = useState({ total:0, present:0, absent:0, percentage:0 });
  const [fees,        setFees]        = useState([]);
  const [feeSummary,  setFeeSummary]  = useState({ total: 0, paid: 0, pending: 0 });
  const [feeHistory,  setFeeHistory]  = useState([]);
  const [assignments, setAssignments] = useState([]);
  const [loadingData, setLoadingData] = useState(false);
  // Track newly-linked parent account info — backend returns whether a new
  // account was created (with default password) vs. linking to an existing
  // account (where we shouldn't reveal a password we don't know).
  const [parentLink, setParentLink] = useState(null); // { email, isNew, defaultPassword? }
  const [linkingParent, setLinkingParent] = useState(false);

  useEffect(() => {
    const fetchData = async () => {
      setLoadingData(true);
      try {
        const [eRes, aRes, fRes] = await Promise.allSettled([
          examAPI.getAll().catch(() => ({ data: { data: [] } })),
          assignmentAPI.getAll().catch(() => ({ data: { data: [] } })),
          feeAPI.getStudentFee(s._id).catch(() => ({ data: {} })),
        ]);
        if (eRes.status === 'fulfilled') setExams(eRes.value.data.data || []);
        if (aRes.status === 'fulfilled') setAssignments(aRes.value.data.data || []);
        if (fRes.status === 'fulfilled') {
          const ledger      = fRes.value.data?.data || null;
          const assigns     = fRes.value.data?.assignments || [];

          // Build a unified fee list from FeeAssignments (per fee type)
          let feeList = assigns.map(a => ({
            _id:     a._id,
            feeType: a.feeType?.name || 'Fee',
            dueDate: a.dueDate,
            amount:  a.finalAmount || 0,
            paid:    a.paidAmount || 0,
            pending: a.pendingAmount != null ? a.pendingAmount : Math.max(0, (a.finalAmount || 0) - (a.paidAmount || 0)),
            status:  a.status || 'pending',
          }));

          // If no assignments but the ledger has payment history, show those payments
          if (feeList.length === 0 && ledger?.paymentHistory?.length) {
            feeList = ledger.paymentHistory
              .slice()
              .sort((a, b) => new Date(b.paidOn) - new Date(a.paidOn))
              .map(p => ({
                _id:     p._id || p.receiptNumber,
                feeType: p.periodLabel || (p.month ? `Fee — ${p.month} ${p.year || ''}`.trim() : 'Fee Payment'),
                dueDate: p.paidOn,
                amount:  p.amount || 0,
                paid:    p.amount || 0,
                pending: 0,
                status:  'paid',
              }));
          }

          // Totals: prefer ledger figures when present, else sum the assignments
          const totalFromLedger = ledger?.totalFees;
          const paidFromLedger  = ledger?.paidAmount;
          const assignTotal = feeList.reduce((s2, f) => s2 + (f.amount || 0), 0);
          const assignPaid  = feeList.reduce((s2, f) => s2 + (f.paid  || 0), 0);

          const total = (totalFromLedger != null ? totalFromLedger : assignTotal) || 0;
          const paid  = (paidFromLedger  != null ? paidFromLedger  : assignPaid)  || 0;
          const pending = Math.max(0, total - paid);

          setFees(feeList);
          setFeeSummary({ total, paid, pending });

          // ── Build a full payment history (all individual payments) ──
          const history = [];
          // From the ledger's paymentHistory
          (ledger?.paymentHistory || []).forEach(p => {
            history.push({
              _id:     p._id || p.receiptNumber || Math.random().toString(36),
              date:    p.paidOn,
              amount:  p.amount || 0,
              method:  p.method || 'cash',
              receipt: p.receiptNumber || '',
              label:   p.periodLabel || (p.month ? `${p.month} ${p.year || ''}`.trim() : ''),
              remarks: p.remarks || '',
              by:      p.collectedBy?.name || '',
            });
          });
          // From each assignment's own payments array
          assigns.forEach(a => {
            (a.payments || []).forEach(p => {
              history.push({
                _id:     p._id || p.receiptNumber || Math.random().toString(36),
                date:    p.paidOn,
                amount:  p.amount || 0,
                method:  p.method || 'cash',
                receipt: p.receiptNumber || '',
                label:   a.feeType?.name || 'Fee',
                remarks: p.remarks || '',
                by:      p.collectedBy?.name || '',
              });
            });
          });
          history.sort((x, y) => new Date(y.date) - new Date(x.date));
          setFeeHistory(history);
        }
        // ── Real attendance for the current month ──
        try {
          const now = new Date();
          const month = now.getMonth() + 1;   // 1-based
          const year  = now.getFullYear();
          const attRes = await attendanceAPI.getByStudent(s._id, { month, year });
          const sum = attRes.data?.summary || { total:0, present:0, absent:0, percentage:0 };
          const calMap = attRes.data?.calendar || {};   // { 'YYYY-MM-DD': 'present'|'absent'|... }
          setAttSummary(sum);

          // Build a day-by-day array for this month (only days that have a record)
          const daysInMonth = new Date(year, month, 0).getDate();
          const cal = [];
          for (let d = 1; d <= daysInMonth; d++) {
            const key = `${year}-${String(month).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
            cal.push({ day: d, status: calMap[key] || null }); // null = not marked
          }
          setAttendance(cal);
        } catch {
          setAttSummary({ total:0, present:0, absent:0, percentage:0 });
          setAttendance([]);
        }
      } catch {}
      finally { setLoadingData(false); }
    };
    fetchData();
  }, [s._id]);

  // Create-or-link a parent User for this student. Uses the parent email/name
  // already on the student record; if the email is missing, the admin needs
  // to add it via the Edit form first.
  const handleLinkParent = async () => {
    const parentEmail = s.parentEmail || s.admissionSnapshot?.parentEmail
      || s.admissionSnapshot?.fatherEmail || s.admissionSnapshot?.motherEmail || '';
    if (!parentEmail) {
      toast.error('No parent email on file. Edit the student first to add one.');
      return;
    }
    setLinkingParent(true);
    try {
      const res = await studentAPI.linkParent(s._id, {
        parentEmail,
        parentName:  s.parentName || s.admissionSnapshot?.parentName || s.admissionSnapshot?.fatherName || '',
        parentPhone: s.parentPhone || s.admissionSnapshot?.parentPhone || '',
      });
      setParentLink(res.data?.parentAccount || null);
      toast.success(res.data?.message || 'Parent linked');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to link parent');
    } finally {
      setLinkingParent(false);
    }
  };

  const presentDays = attSummary.present || 0;
  const attPct = attSummary.percentage || 0;

  // Exam stats
  const examResults = exams.filter(e => e.results?.length).map(e => {
    const res = e.results?.find(r => r.student === s._id);
    return res ? { subject: e.subject?.name || 'Exam', marks: res.marksObtained, total: e.totalMarks, pct: Math.round((res.marksObtained / e.totalMarks) * 100) } : null;
  }).filter(Boolean);
  const avgPct  = examResults.length ? Math.round(examResults.reduce((s, e) => s + e.pct, 0) / examResults.length) : 0;
  const weakSub = examResults.filter(e => e.pct < 50);

  return (
    <div
      style={{ position:"fixed", inset:0, zIndex:300, background:"#fff", padding:0, overflowY:"auto" }}
      onClick={onClose}
    >
      {/* Full-screen modal — always covers the viewport, grows with content. */}
      <div
        style={{ maxWidth:"none", width:"100%", margin:0, background:"#fff", borderRadius:0, boxShadow:"none", minHeight:"100vh", paddingBottom:40 }}
        onClick={e => e.stopPropagation()}
      >
        {/* Modal header */}
        <div style={{ position:"sticky", top:0, zIndex:10, background:"#fff", borderBottom:"1px solid #E5E7EB", padding:"20px 28px 0" }}>
          <div style={{ display:"flex", alignItems:"center", gap:16, marginBottom:16 }}>
            {(() => {
              const photo = s.studentPhoto || s.photo || s.profilePhoto
                            || s.admissionSnapshot?.studentPhoto || s.admissionSnapshot?.photo || '';
              return (
                <div style={{ width:60, height:60, borderRadius:18, background: photo ? "#F3F4F6" : "#0B1F4A", display:"flex", alignItems:"center", justifyContent:"center", flexShrink:0, overflow:"hidden" }}>
                  {photo ? (
                    <img src={photo} alt={s.user?.name || ''} style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <span style={{ fontSize:22, fontWeight:700, color:"#fff" }}>{(s.user?.name||"?").charAt(0).toUpperCase()}</span>
                  )}
                </div>
              );
            })()}
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
                  <div className="text-2xl font-display text-ink dark:text-white">₹{feeSummary.pending.toLocaleString('en-IN')}</div>
                  <p className="text-xs text-muted mt-1">Pending Fees</p>
                </div>
              </div>

              {/* Login credentials — admin-only view so the school can share
                  these with the student/parent. Username is the student's email
                  (primary login). Admission number is shown as an alternate login
                  for students who can't remember a generated email. Password is
                  the bootstrap default until the student changes it. */}
              {canManage && (() => {
                const admNo = s.admissionNumber || s.rollNumber || '';
                const email = s.user?.email || '';
                const isAutoEmail = email.includes('@student.local');
                const copy = (text, label) => {
                  if (!text) return;
                  navigator.clipboard?.writeText(text).then(
                    () => toast.success(`${label} copied`),
                    () => toast.error('Could not copy')
                  );
                };
                return (
                  <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:12, padding:'14px 16px' }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:'#92400E', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        🔑 Login Credentials
                      </div>
                      <span style={{ fontSize:10, color:'#92400E', fontStyle:'italic' }}>Share with student / parent</span>
                    </div>
                    <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                      {/* Primary username = email */}
                      <div>
                        <div style={{ fontSize:10, color:'#92400E', fontWeight:700, marginBottom:3 }}>
                          USERNAME / EMAIL{isAutoEmail ? ' (auto-generated)' : ''}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ flex:1, fontFamily:'monospace', fontSize:12, fontWeight:700, color: isAutoEmail?'#6B7280':'#0B1F4A', background:'#fff', border:'1px solid #FDE68A', padding:'7px 10px', borderRadius:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                            {email || '— not assigned —'}
                          </div>
                          <button onClick={() => copy(email, 'Email')} disabled={!email}
                            style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FDE68A', border:'1px solid #FCD34D', padding:'7px 10px', borderRadius:6, cursor: email?'pointer':'not-allowed', opacity: email?1:0.5 }}>
                            📋 Copy
                          </button>
                        </div>
                      </div>
                      {/* Password — show known value if we set it in this session,
                          else say so honestly. Bcrypt is one-way, so we can't reveal
                          an old password — admin should reset to set a new one. */}
                      <div>
                        <div style={{ fontSize:10, color:'#92400E', fontWeight:700, marginBottom:3 }}>
                          PASSWORD {knownPassword ? '(set this session)' : '(unknown — reset to set)'}
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ flex:1, fontFamily:'monospace', fontSize:13, fontWeight:700, color: knownPassword?'#0B1F4A':'#9CA3AF', background:'#fff', border:'1px solid #FDE68A', padding:'7px 10px', borderRadius:6, fontStyle: knownPassword?'normal':'italic' }}>
                            {knownPassword || 'reset password to assign one'}
                          </div>
                          <button onClick={() => copy(knownPassword, 'Password')} disabled={!knownPassword}
                            style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FDE68A', border:'1px solid #FCD34D', padding:'7px 10px', borderRadius:6, cursor: knownPassword?'pointer':'not-allowed', opacity: knownPassword?1:0.5 }}>
                            📋 Copy
                          </button>
                        </div>
                      </div>
                    </div>
                    {/* Admission number as alternate login option */}
                    {admNo && (
                      <div style={{ marginTop:10 }}>
                        <div style={{ fontSize:10, color:'#92400E', fontWeight:700, marginBottom:3 }}>ADMISSION NO (alternate login)</div>
                        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                          <div style={{ flex:1, fontFamily:'monospace', fontSize:13, color:'#0B1F4A', background:'#fff', border:'1px solid #FDE68A', padding:'6px 10px', borderRadius:6 }}>
                            {admNo}
                          </div>
                          <button onClick={() => copy(admNo, 'Admission No')}
                            style={{ fontSize:11, fontWeight:700, color:'#92400E', background:'#FDE68A', border:'1px solid #FCD34D', padding:'6px 10px', borderRadius:6, cursor:'pointer' }}>
                            📋 Copy
                          </button>
                        </div>
                      </div>
                    )}
                    <div style={{ marginTop:10, fontSize:11, color:'#92400E', lineHeight:1.5 }}>
                      Student should log in at <strong>https://school-management-system-eight-nu.vercel.app/login</strong> using the email + password above. We recommend they change the password after first login.
                    </div>
                  </div>
                );
              })()}

              {/* Parent login — Most parents won't have a User account because
                  enrollment historically skipped that step. The 'Create / Link
                  Parent Login' button calls /students/:id/link-parent which
                  either creates a new parent User (with default Parent@123) or
                  links to an existing one with the same email. Reveals the
                  default password only when a NEW account is created. */}
              {canManage && (() => {
                const parentEmail = s.parentEmail
                  || s.admissionSnapshot?.parentEmail
                  || s.admissionSnapshot?.fatherEmail
                  || s.admissionSnapshot?.motherEmail
                  || '';
                const hasParentUser = !!(s.parentId || s.parent || parentLink);
                const copy = (text, label) => {
                  if (!text) return;
                  navigator.clipboard?.writeText(text).then(
                    () => toast.success(`${label} copied`),
                    () => toast.error('Could not copy')
                  );
                };
                return (
                  <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 16px', marginTop:12 }}>
                    <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:10 }}>
                      <div style={{ fontSize:12, fontWeight:800, color:'#1E40AF', textTransform:'uppercase', letterSpacing:'0.05em' }}>
                        👨‍👩‍👧 Parent Login
                      </div>
                      {!hasParentUser && parentEmail && (
                        <button onClick={handleLinkParent} disabled={linkingParent}
                          style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#1D4ED8', border:'none', padding:'6px 12px', borderRadius:6, cursor: linkingParent?'wait':'pointer' }}>
                          {linkingParent ? 'Creating…' : '+ Create / Link Parent Login'}
                        </button>
                      )}
                    </div>

                    {!parentEmail ? (
                      <div style={{ fontSize:12, color:'#1E40AF', fontStyle:'italic' }}>
                        No parent email on file. Edit the student to add a parent email first, then come back here to create their login.
                      </div>
                    ) : !hasParentUser ? (
                      <div style={{ fontSize:12, color:'#1E40AF', lineHeight:1.5 }}>
                        No parent account yet for <strong>{parentEmail}</strong>. Click the button above to create one — default password will be <code style={{ background:'#fff', padding:'1px 5px', borderRadius:4, fontFamily:'monospace' }}>Parent@123</code>.
                      </div>
                    ) : (
                      <>
                        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                          <div>
                            <div style={{ fontSize:10, color:'#1E40AF', fontWeight:700, marginBottom:3 }}>PARENT EMAIL</div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ flex:1, fontFamily:'monospace', fontSize:12, fontWeight:700, color:'#0B1F4A', background:'#fff', border:'1px solid #BFDBFE', padding:'7px 10px', borderRadius:6, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                                {parentLink?.email || parentEmail}
                              </div>
                              <button onClick={() => copy(parentLink?.email || parentEmail, 'Parent Email')}
                                style={{ fontSize:11, fontWeight:700, color:'#1E40AF', background:'#DBEAFE', border:'1px solid #BFDBFE', padding:'7px 10px', borderRadius:6, cursor:'pointer' }}>
                                📋 Copy
                              </button>
                            </div>
                          </div>
                          <div>
                            <div style={{ fontSize:10, color:'#1E40AF', fontWeight:700, marginBottom:3 }}>
                              PASSWORD {parentLink?.isNew ? '(default)' : '(existing)'}
                            </div>
                            <div style={{ display:'flex', alignItems:'center', gap:6 }}>
                              <div style={{ flex:1, fontFamily:'monospace', fontSize:13, fontWeight:700, color: parentLink?.defaultPassword ? '#0B1F4A' : '#9CA3AF', background:'#fff', border:'1px solid #BFDBFE', padding:'7px 10px', borderRadius:6, fontStyle: parentLink?.defaultPassword ? 'normal' : 'italic' }}>
                                {parentLink?.defaultPassword || 'unknown — parent uses existing password'}
                              </div>
                              {parentLink?.defaultPassword && (
                                <button onClick={() => copy(parentLink.defaultPassword, 'Password')}
                                  style={{ fontSize:11, fontWeight:700, color:'#1E40AF', background:'#DBEAFE', border:'1px solid #BFDBFE', padding:'7px 10px', borderRadius:6, cursor:'pointer' }}>
                                  📋 Copy
                                </button>
                              )}
                            </div>
                          </div>
                        </div>
                        <div style={{ marginTop:10, fontSize:11, color:'#1E40AF', lineHeight:1.5 }}>
                          Parent should log in at <strong>https://school-management-system-eight-nu.vercel.app/login</strong>. They'll see their child's attendance, fees, and report card.
                        </div>
                      </>
                    )}
                  </div>
                );
              })()}

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
                // Keep name + url so the view button can open them.
                const stdDocs = Object.entries(snap.documents || {})
                  .map(([k, val]) => {
                    let url = '';
                    let hasFile = false;
                    if (val) {
                      if (Array.isArray(val) && val.length > 0) {
                        url = val[0]?.data || val[0]?.url || '';
                        hasFile = true;
                      } else if (typeof val === 'object') {
                        if (Array.isArray(val.files) && val.files.length) {
                          url = val.files[0]?.data || val.files[0]?.url || '';
                          hasFile = true;
                        } else if (val.data || val.url) {
                          url = val.data || val.url;
                          hasFile = true;
                        } else if (val.submitted) {
                          hasFile = true;
                        }
                      } else {
                        hasFile = Boolean(val);
                      }
                    }
                    return hasFile ? {
                      key: k,
                      name: k.replace(/([A-Z])/g, ' $1').replace(/^./, c => c.toUpperCase()).trim(),
                      url,
                    } : null;
                  })
                  .filter(Boolean);

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
                      {(() => {
                        // Address shape varies a lot historically:
                        //  · old admission saves: snap.address = "anand nagar" (string), with snap.city/state/pincode flat
                        //  · newer student-edit saves: snap.address = "anand nagar" (string), still flat siblings
                        //  · still older saves:  snap.address = { street, city, state, pincode } (object)
                        //  · top-level student doc: s.address = { street, city, state, pincode } (object)
                        // We coerce whatever each piece resolves to into a string so we never
                        // render `[object Object]` even if a nested object slipped through.
                        const toStr = v => {
                          if (v === null || v === undefined) return '';
                          if (typeof v === 'string' || typeof v === 'number') return String(v);
                          // It's an object — try common nested shape, else give up to ''
                          if (typeof v === 'object') return v.street || v.text || '';
                          return '';
                        };
                        const snapAddrIsObj = snap.address && typeof snap.address === 'object';
                        const street  = toStr(snapAddrIsObj ? snap.address.street  : (snap.address  || s.address?.street));
                        const city    = toStr(snapAddrIsObj ? snap.address.city    : (snap.city     || s.address?.city));
                        const state   = toStr(snapAddrIsObj ? snap.address.state   : (snap.state    || s.address?.state));
                        const pincode = toStr(snapAddrIsObj ? snap.address.pincode : (snap.pincode  || s.address?.pincode));
                        const joined  = [street, city, state, pincode].filter(Boolean).join(', ');
                        return (
                          <p className="text-sm text-slate dark:text-gray-300">
                            {joined || '—'}
                          </p>
                        );
                      })()}
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
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                          {stdDocs.map(d => {
                            const hasViewable = d.url && (
                              d.url.startsWith('data:') ||
                              d.url.startsWith('blob:') ||
                              /^https?:\/\//i.test(d.url)
                            );
                            const open = () => {
                              if (!hasViewable) return;
                              openFileInNewTab(d.url, d.name);
                            };
                            const dl = () => {
                              if (!hasViewable) return;
                              downloadFileFromUrl(d.url, d.fileName || `${d.name}.${(d.url.split(';')[0].split('/')[1] || 'pdf').split('+')[0]}`);
                            };
                            return (
                              <div key={d.key} className="border border-emerald-200 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-900/20 rounded-xl px-3 py-2 flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 bg-emerald-500 text-white">✓</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-ink dark:text-white truncate">{d.name}</p>
                                  <p className="text-[10px] text-muted">{hasViewable ? 'File uploaded' : 'Marked submitted'}</p>
                                </div>
                                {hasViewable && (
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={open} className="text-[10px] px-2 py-1 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
                                      👁 View
                                    </button>
                                    <button onClick={dl} className="text-[10px] px-2 py-1 rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                                      ⬇ Download
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
                          {customDocs.map((d, idx) => {
                            const file = Array.isArray(d.files) && d.files[0];
                            const url  = file?.data || file?.url || '';
                            const hasViewable = url && (
                              url.startsWith('data:') ||
                              url.startsWith('blob:') ||
                              /^https?:\/\//i.test(url)
                            );
                            const open = () => {
                              if (!hasViewable) return;
                              openFileInNewTab(url, d.label);
                            };
                            const dl = () => {
                              if (!hasViewable) return;
                              const name = file?.fileName || file?.name || `${d.label}.${(url.split(';')[0].split('/')[1] || 'pdf').split('+')[0]}`;
                              downloadFileFromUrl(url, name);
                            };
                            return (
                              <div key={`custom-${idx}`} className="border border-emerald-200 dark:border-emerald-700 bg-emerald-50/40 dark:bg-emerald-900/20 rounded-xl px-3 py-2 flex items-center gap-2.5">
                                <div className="w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 bg-emerald-500 text-white">✓</div>
                                <div className="flex-1 min-w-0">
                                  <p className="text-xs font-semibold text-ink dark:text-white truncate">{d.label}</p>
                                  <p className="text-[10px] text-muted">{(d.files || []).length} file{(d.files || []).length === 1 ? '' : 's'}</p>
                                </div>
                                {hasViewable && (
                                  <div className="flex gap-1 flex-shrink-0">
                                    <button onClick={open} className="text-[10px] px-2 py-1 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700">
                                      👁 View
                                    </button>
                                    <button onClick={dl} className="text-[10px] px-2 py-1 rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-700">
                                      ⬇ Download
                                    </button>
                                  </div>
                                )}
                              </div>
                            );
                          })}
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

              {/* Roll No — admin can set/edit */}
              <RollNumberEditor studentId={s._id} initialValue={s.rollNumber} canEdit={!!canManage} onSaved={(r) => { s.rollNumber = r; }} />

              {/* Behavioural Notes for Today */}
              <BehaviouralNotes studentId={s._id} canEdit={!!canManage} />
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
                  <div className="text-2xl font-display text-red-500">{attSummary.absent || 0}</div>
                  <div className="text-xs text-muted">Absent</div>
                </div>
                <div className="card p-4 text-center">
                  <div className={'text-2xl font-display ' + (attPct >= 75 ? 'text-green-600' : attPct >= 50 ? 'text-amber-500' : 'text-red-500')}>{attPct}%</div>
                  <div className="text-xs text-muted">Percentage</div>
                </div>
              </div>

              {attSummary.total === 0 ? (
                <EmptyState icon="🗓️" title="No attendance marked this month" />
              ) : (
                <>
                  {attPct < 75 && (
                    <div className="p-3 rounded-xl bg-amber-50 dark:bg-amber-900/20 border border-amber-200 text-xs text-amber-700 dark:text-amber-300">
                      ⚠️ Attendance below 75%. Minimum required: 75% for exam eligibility.
                    </div>
                  )}

                  {/* Real attendance calendar for the current month */}
                  <Section title={'This Month — ' + new Date().toLocaleDateString('en-IN', { month:'long', year:'numeric' })}>
                    <div style={{ display:'grid', gridTemplateColumns:'repeat(7, 40px)', gap:6, justifyContent:'start' }}>
                      {['S','M','T','W','T','F','S'].map((d,i) => (
                        <div key={'h'+i} className="text-center text-[10px] text-muted font-bold pb-1">{d}</div>
                      ))}
                      {(() => {
                        const now = new Date();
                        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1).getDay(); // 0=Sun
                        return Array.from({ length: firstDay }, (_, i) => <div key={'pad-'+i} />);
                      })()}
                      {attendance.map((a, i) => {
                        const cls = a.status === 'present' || a.status === 'late'
                          ? 'bg-green-100 text-green-700 dark:bg-green-900/40'
                          : a.status === 'absent'
                            ? 'bg-red-100 text-red-600 dark:bg-red-900/40'
                            : a.status === 'excused'
                              ? 'bg-blue-100 text-blue-600 dark:bg-blue-900/40'
                              : 'bg-gray-50 text-gray-300 dark:bg-gray-800/40 dark:text-gray-600';
                        return (
                          <div key={i} title={a.status ? ('Day ' + a.day + ': ' + a.status) : ('Day ' + a.day + ': not marked')}
                            style={{ width:40, height:40 }}
                            className={'rounded-lg flex items-center justify-center text-xs font-bold cursor-default ' + cls}>
                            {a.day}
                          </div>
                        );
                      })}
                    </div>
                    <div className="flex flex-wrap gap-3 mt-3 text-[10px] text-muted">
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-green-100 inline-block" />Present</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-red-100 inline-block" />Absent</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-blue-100 inline-block" />Excused</span>
                      <span className="flex items-center gap-1"><span className="w-3 h-3 rounded bg-gray-100 inline-block" />Not marked</span>
                    </div>
                  </Section>
                </>
              )}
            </div>
          )}

          {/* ── FEES ── */}
          {activeTab === 'fees' && (
            <div style={{ display:"flex", flexDirection:"column", gap:16 }}>
              {fees.length === 0 && feeSummary.total === 0 ? <EmptyState icon="💰" title="No fee records found" /> : (
                <>
                  <div className="grid grid-cols-3 gap-3">
                    <div className="card p-4 text-center">
                      <div className="text-xl font-display text-ink dark:text-white">₹{feeSummary.total.toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">Total</div>
                    </div>
                    <div className="card p-4 text-center">
                      <div className="text-xl font-display text-green-600">₹{feeSummary.paid.toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">Paid</div>
                    </div>
                    <div className="card p-4 text-center">
                      <div className="text-xl font-display text-amber-500">₹{feeSummary.pending.toLocaleString('en-IN')}</div>
                      <div className="text-xs text-muted">Pending</div>
                    </div>
                  </div>
                  {fees.map(f => (
                    <div key={f._id} className="card p-4 flex items-center justify-between">
                      <div>
                        <p className="font-medium text-sm text-ink dark:text-white">{f.feeType || 'Fee'}</p>
                        <p className="text-xs text-muted">
                          {f.dueDate ? `Due ${new Date(f.dueDate).toLocaleDateString('en-IN')}` : '—'}
                          {f.pending > 0 && f.paid > 0 ? ` · ₹${f.paid.toLocaleString('en-IN')} paid` : ''}
                        </p>
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-ink dark:text-white">₹{(f.amount || 0).toLocaleString('en-IN')}</p>
                        {f.pending > 0 && (
                          <p className="text-[11px] text-amber-600">₹{f.pending.toLocaleString('en-IN')} due</p>
                        )}
                        <span className={'text-[10px] font-bold px-2 py-0.5 rounded-full ' + (f.status === 'paid' ? 'bg-green-100 text-green-700' : f.status === 'overdue' ? 'bg-red-100 text-red-600' : f.status === 'partial' ? 'bg-blue-100 text-blue-700' : 'bg-amber-100 text-amber-700')}>
                          {f.status}
                        </span>
                      </div>
                    </div>
                  ))}

                  {/* ── Payment History ── */}
                  {feeHistory.length > 0 && (
                    <div className="mt-2">
                      <p className="text-xs font-bold text-muted uppercase tracking-wide mb-2">Payment History</p>
                      <div className="flex flex-col gap-2">
                        {feeHistory.map(h => (
                          <div key={h._id} className="card p-3 flex items-center justify-between">
                            <div className="min-w-0">
                              <p className="font-medium text-sm text-ink dark:text-white">
                                ₹{(h.amount || 0).toLocaleString('en-IN')}
                                <span className="ml-2 text-[10px] font-bold px-2 py-0.5 rounded-full bg-gray-100 text-gray-600 uppercase">{h.method}</span>
                              </p>
                              <p className="text-xs text-muted truncate">
                                {h.date ? new Date(h.date).toLocaleDateString('en-IN', { day:'numeric', month:'short', year:'numeric' }) : '—'}
                                {h.label ? ` · ${h.label}` : ''}
                                {h.receipt ? ` · #${h.receipt}` : ''}
                                {h.by ? ` · by ${h.by}` : ''}
                              </p>
                            </div>
                            <div className="text-green-600 text-lg flex-shrink-0 ml-3">✓</div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
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
    studentPhoto: '',                         // base64 data URL
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
    // Documents — same shape as admission record
    documents: {
      birthCertificate: null, aadhaarCard: null, passportPhoto: null,
      addressProof: null, transferCertificate: null, marksheet: null,
      casteCertificate: null, medicalCertificate: null,
    },
    customDocuments: [],            // [{ label, files: [...] }]
    addressProofType: '',
    addressProofTypeOther: '',
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
        studentPhoto: snap.studentPhoto || snap.photo || snap.profilePhoto
                       || data.studentPhoto || data.photo || data.profilePhoto || '',
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
        // Documents — copy from admissionSnapshot if present
        documents: {
          birthCertificate:    snap.documents?.birthCertificate    || null,
          aadhaarCard:         snap.documents?.aadhaarCard         || null,
          passportPhoto:       snap.documents?.passportPhoto       || null,
          addressProof:        snap.documents?.addressProof        || null,
          transferCertificate: snap.documents?.transferCertificate || null,
          marksheet:           snap.documents?.marksheet           || null,
          casteCertificate:    snap.documents?.casteCertificate    || null,
          medicalCertificate:  snap.documents?.medicalCertificate  || null,
        },
        customDocuments:       Array.isArray(snap.customDocuments) ? snap.customDocuments : [],
        addressProofType:      snap.addressProofType      || '',
        addressProofTypeOther: snap.addressProofTypeOther || '',
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
      studentPhoto: form.studentPhoto,
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
      // Section 7 — Documents (admission record format)
      documents: form.documents,
      customDocuments: (form.customDocuments || []).filter(d => d && (d.label || (d.files && d.files.length))),
      addressProofType: form.addressProofType,
      addressProofTypeOther: form.addressProofTypeOther,
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
      // Profile photo: send under BOTH names so backend persists regardless of
      // which field the schema/code reads. Without this mirror, the photo on
      // edit was sometimes silently dropped.
      studentPhoto: form.studentPhoto || '',
      photo:        form.studentPhoto || '',
      // The full mirror — backend treats this as Mixed, replaces wholesale
      admissionSnapshot: snapshot,
    };
  };

  const sections = [
    { id: 'student',   label: '👤 Student' },
    { id: 'other',     label: '📋 Other' },
    { id: 'guardian',  label: '👨‍👩‍👧 Guardian' },
    { id: 'address',   label: '📍 Address' },
    { id: 'bank',      label: '🏦 Bank' },
    { id: 'govids',    label: '🆔 Govt IDs' },
    { id: 'documents', label: '📎 Documents' },
    { id: 'medical',   label: '🏥 Medical' },
  ];

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={form._id ? 'Edit Student Profile' : 'Add New Student'} size="full"
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

      {/* Fixed-height tab body — keeps the modal a stable size across tabs.
          Tall content scrolls within this container; short content leaves
          empty space rather than collapsing the modal. */}
      <div style={{ minHeight: 600, maxHeight: 'calc(96vh - 240px)', overflowY: 'auto', paddingRight: 4 }}>

      {/* ── Student Information ── */}
      {activeSection === 'student' && (
        <div className="grid grid-cols-3 gap-4">
          {/* Profile photo upload — first row, spans full width */}
          <FormGroup label="Profile Photo" className="col-span-3">
            <div className="flex items-center gap-4">
              <div className="w-20 h-20 rounded-full overflow-hidden flex-shrink-0 border-2 border-border bg-warm dark:bg-gray-800 flex items-center justify-center">
                {form.studentPhoto ? (
                  <img src={form.studentPhoto} alt="Student" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-muted">
                    {(form.firstName || form.name || '?').charAt(0).toUpperCase()}
                  </span>
                )}
              </div>
              <div className="flex flex-col gap-1.5 flex-1">
                <label className="inline-flex items-center self-start px-4 py-2 rounded-lg text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 cursor-pointer">
                  {form.studentPhoto ? '🔄 Change Photo' : '📷 Upload Photo'}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={async (e) => {
                      const file = e.target.files?.[0];
                      if (!file) return;
                      if (file.size > 2 * 1024 * 1024) {
                        alert('Photo must be under 2 MB. Please pick a smaller one.');
                        return;
                      }
                      const reader = new FileReader();
                      reader.onload = () => set('studentPhoto', reader.result);
                      reader.readAsDataURL(file);
                      e.target.value = '';
                    }}
                  />
                </label>
                {form.studentPhoto && (
                  <button type="button" onClick={() => set('studentPhoto', '')}
                    className="self-start px-3 py-1 rounded-md text-[11px] font-semibold text-red-600 border border-red-200 bg-transparent hover:bg-red-50">
                    Remove
                  </button>
                )}
                <p className="text-[11px] text-muted">JPG / PNG, under 2 MB. Square photos look best.</p>
              </div>
            </div>
          </FormGroup>

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

      {/* ── Documents ── */}
      {activeSection === 'documents' && (
        <div className="space-y-4">
          {(() => {
            // Standard doc list — keys must match what admission form uses
            const STANDARD_DOCS = [
              { key: 'birthCertificate',    label: 'Birth Certificate' },
              { key: 'aadhaarCard',         label: 'Aadhaar Card' },
              { key: 'passportPhoto',       label: 'Passport-size Photos' },
              { key: 'addressProof',        label: 'Address Proof' },
              { key: 'transferCertificate', label: 'Transfer Certificate' },
              { key: 'marksheet',           label: 'Previous Marksheet' },
              { key: 'casteCertificate',    label: 'Caste Certificate' },
              { key: 'medicalCertificate',  label: 'Medical Certificate' },
            ];

            // Read files for a doc slot (handles legacy + new shapes)
            const readFiles = (val) => {
              if (!val) return [];
              if (Array.isArray(val)) return val;
              if (typeof val === 'object' && val.files) return val.files;
              if (typeof val === 'object' && (val.url || val.data)) return [val];
              return [];
            };

            // 2 MB per file ceiling — keeps payload manageable
            const MAX_BYTES = 2 * 1024 * 1024;
            const handleStandardUpload = (key, fileList) => {
              const arr = Array.from(fileList || []);
              const tooBig = arr.find(f => f.size > MAX_BYTES);
              if (tooBig) { alert(`"${tooBig.name}" is over 2 MB. Please pick a smaller file.`); return; }
              Promise.all(arr.map(file => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve({
                  data: reader.result, fileName: file.name,
                  mimeType: file.type, size: file.size,
                  uploadedAt: new Date().toISOString(),
                });
                reader.readAsDataURL(file);
              }))).then(newFiles => {
                set('documents', { ...form.documents, [key]: [...readFiles(form.documents[key]), ...newFiles] });
              });
            };
            const removeStandardFile = (key, idx) => {
              const files = readFiles(form.documents[key]);
              files.splice(idx, 1);
              set('documents', { ...form.documents, [key]: files.length ? files : null });
            };

            const handleCustomUpload = (idx, fileList) => {
              const arr = Array.from(fileList || []);
              const tooBig = arr.find(f => f.size > MAX_BYTES);
              if (tooBig) { alert(`"${tooBig.name}" is over 2 MB.`); return; }
              Promise.all(arr.map(file => new Promise((resolve) => {
                const reader = new FileReader();
                reader.onload = () => resolve({
                  data: reader.result, fileName: file.name,
                  mimeType: file.type, size: file.size,
                  uploadedAt: new Date().toISOString(),
                });
                reader.readAsDataURL(file);
              }))).then(newFiles => {
                const next = [...(form.customDocuments || [])];
                next[idx] = { ...(next[idx] || { label: '', files: [] }), files: [...(next[idx]?.files || []), ...newFiles] };
                set('customDocuments', next);
              });
            };
            const updateCustomLabel = (idx, label) => {
              const next = [...(form.customDocuments || [])];
              next[idx] = { ...(next[idx] || { files: [] }), label };
              set('customDocuments', next);
            };
            const removeCustomFile = (idx, fileIdx) => {
              const next = [...(form.customDocuments || [])];
              if (next[idx]) {
                next[idx].files = (next[idx].files || []).filter((_, i) => i !== fileIdx);
              }
              set('customDocuments', next);
            };
            const addCustomDoc = () => {
              set('customDocuments', [...(form.customDocuments || []), { label: '', files: [] }]);
            };
            const removeCustomDoc = (idx) => {
              set('customDocuments', (form.customDocuments || []).filter((_, i) => i !== idx));
            };

            const filledStdCount = STANDARD_DOCS.filter(d => readFiles(form.documents[d.key]).length > 0).length;
            const filledCustomCount = (form.customDocuments || []).filter(d => (d.files || []).length > 0).length;

            return (
              <>
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-semibold text-ink dark:text-white">Document Checklist</p>
                    <p className="text-xs text-muted">{filledStdCount + filledCustomCount} of {STANDARD_DOCS.length + (form.customDocuments || []).length} uploaded</p>
                  </div>
                </div>

                {/* Standard documents */}
                <div className="space-y-2">
                  {STANDARD_DOCS.map(({ key, label }) => {
                    const files = readFiles(form.documents[key]);
                    const filled = files.length > 0;
                    return (
                      <div key={key} className={`rounded-xl border-2 p-3 ${filled ? 'border-emerald-300 bg-emerald-50/40 dark:bg-emerald-900/10' : 'border-border bg-warm/40 dark:bg-gray-800/40'}`}>
                        <div className="flex items-center gap-3">
                          <div className={`w-7 h-7 rounded-lg flex items-center justify-center text-xs font-bold flex-shrink-0 ${filled ? 'bg-emerald-500 text-white' : 'bg-slate-200 text-slate-400 dark:bg-gray-700'}`}>
                            {filled ? '✓' : '○'}
                          </div>
                          <div className="flex-1 min-w-0">
                            <p className="text-sm font-semibold text-ink dark:text-white">{label}</p>
                            <p className="text-[11px] text-muted">{filled ? `${files.length} file${files.length === 1 ? '' : 's'}` : 'No file uploaded'}</p>
                          </div>
                          <label className="text-[11px] font-bold px-3 py-1.5 rounded-md cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700">
                            📎 Upload
                            <input type="file" multiple accept=".pdf,image/*" className="hidden"
                              onChange={e => { handleStandardUpload(key, e.target.files); e.target.value=''; }} />
                          </label>
                        </div>
                        {filled && (
                          <div className="mt-2 pt-2 border-t border-emerald-200 dark:border-emerald-800 space-y-1">
                            {files.map((f, fi) => (
                              <div key={fi} className="flex items-center gap-2 text-xs">
                                <span className="flex-1 truncate text-slate dark:text-gray-300">📄 {f.fileName || `File ${fi + 1}`}</span>
                                {(f.data || f.url) && (
                                  <a href={f.data || f.url} target="_blank" rel="noopener noreferrer"
                                    className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200">View</a>
                                )}
                                <button type="button" onClick={() => removeStandardFile(key, fi)}
                                  className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200">✕</button>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* Address proof type */}
                <FormGroup label="Address Proof Type">
                  <select className="form-input" value={form.addressProofType} onChange={e => set('addressProofType', e.target.value)}>
                    <option value="">-- Select --</option>
                    <option value="light_bill">Electricity Bill</option>
                    <option value="ration_card">Ration Card</option>
                    <option value="rent_agreement">Rent Agreement</option>
                    <option value="passport">Passport</option>
                    <option value="voter_id">Voter ID</option>
                    <option value="driving_license">Driving License</option>
                    <option value="__other__">Other</option>
                  </select>
                </FormGroup>
                {form.addressProofType === '__other__' && (
                  <FormGroup label="Specify Other Address Proof">
                    <input className="form-input" value={form.addressProofTypeOther} onChange={e => set('addressProofTypeOther', e.target.value)} placeholder="e.g. Property Tax receipt" />
                  </FormGroup>
                )}

                {/* Custom Documents */}
                <div className="pt-4 border-t border-border">
                  <div className="flex items-center justify-between mb-3">
                    <p className="text-sm font-semibold text-ink dark:text-white">Custom Documents</p>
                    <button type="button" onClick={addCustomDoc}
                      className="text-xs font-bold px-3 py-1.5 rounded-md bg-emerald-600 text-white hover:bg-emerald-700">+ Add Document</button>
                  </div>
                  {(!form.customDocuments || form.customDocuments.length === 0) ? (
                    <p className="text-xs text-muted">No custom documents added yet.</p>
                  ) : (
                    <div className="space-y-3">
                      {form.customDocuments.map((doc, idx) => (
                        <div key={idx} className="rounded-xl border-2 border-border bg-warm/30 dark:bg-gray-800/30 p-3">
                          <div className="flex items-center gap-2 mb-2">
                            <input className="form-input flex-1 text-sm"
                              value={doc?.label || ''}
                              onChange={e => updateCustomLabel(idx, e.target.value)}
                              placeholder="Document name (e.g. Bonafide Certificate)" />
                            <label className="text-[11px] font-bold px-3 py-1.5 rounded-md cursor-pointer bg-indigo-600 text-white hover:bg-indigo-700">
                              📎 Upload
                              <input type="file" multiple accept=".pdf,image/*" className="hidden"
                                onChange={e => { handleCustomUpload(idx, e.target.files); e.target.value=''; }} />
                            </label>
                            <button type="button" onClick={() => removeCustomDoc(idx)}
                              className="text-xs font-bold px-2.5 py-1.5 rounded-md bg-red-100 text-red-600 hover:bg-red-200">✕</button>
                          </div>
                          {(doc?.files || []).length > 0 && (
                            <div className="space-y-1 pt-2 border-t border-border">
                              {doc.files.map((f, fi) => (
                                <div key={fi} className="flex items-center gap-2 text-xs">
                                  <span className="flex-1 truncate text-slate dark:text-gray-300">📄 {f.fileName || `File ${fi + 1}`}</span>
                                  {(f.data || f.url) && (
                                    <a href={f.data || f.url} target="_blank" rel="noopener noreferrer"
                                      className="px-2 py-0.5 rounded bg-indigo-100 text-indigo-700 font-semibold hover:bg-indigo-200">View</a>
                                  )}
                                  <button type="button" onClick={() => removeCustomFile(idx, fi)}
                                    className="px-2 py-0.5 rounded bg-red-100 text-red-700 font-semibold hover:bg-red-200">✕</button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  )}
                </div>

                <div className="p-3 rounded-xl bg-blue-50 dark:bg-blue-900/20 border border-blue-200 text-xs text-blue-700">
                  ℹ️ Files are stored as base64 inline. Keep each file under 2 MB for best performance. PDF and images supported.
                </div>
              </>
            );
          })()}
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

      </div>
    </Modal>
  );
}


// ─── Shared helpers ───────────────────────────────────────────────────────────

/**
 * Open a file URL in a new tab. Handles three cases:
 *   1. http(s):// URL  →  just open it directly.
 *   2. data: URL      →  Chrome blocks navigating top-level tabs to data: URLs
 *                        (security mitigation), which is why earlier code
 *                        landed on a blank page. Convert to a Blob and use
 *                        the resulting blob: URL, which is allowed.
 *   3. blob: URL      →  open directly.
 *
 * Falls back gracefully if the browser refuses popups (returns null window).
 */
function openFileInNewTab(url, suggestedName) {
  if (!url) return;

  // Case 1 & 3 — http(s) and existing blob URLs
  if (/^https?:\/\//i.test(url) || url.startsWith('blob:')) {
    window.open(url, '_blank', 'noopener,noreferrer');
    return;
  }

  // Case 2 — data: URL → convert to Blob → blob: URL → open
  if (url.startsWith('data:')) {
    try {
      // Parse the data URL: "data:[<mediatype>][;base64],<data>"
      const match = /^data:([^;,]+)?(;base64)?,(.*)$/i.exec(url);
      if (!match) {
        window.open(url, '_blank');
        return;
      }
      const mime    = match[1] || 'application/octet-stream';
      const isB64   = !!match[2];
      const payload = match[3];

      let bytes;
      if (isB64) {
        const binary = atob(payload);
        bytes = new Uint8Array(binary.length);
        for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
      } else {
        bytes = new TextEncoder().encode(decodeURIComponent(payload));
      }

      const blob    = new Blob([bytes], { type: mime });
      const blobUrl = URL.createObjectURL(blob);

      // Open immediately. Don't revoke synchronously — give the new tab time to
      // load. Revoke after a generous delay (1 minute is overkill, but cheap).
      window.open(blobUrl, '_blank', 'noopener,noreferrer');
      setTimeout(() => URL.revokeObjectURL(blobUrl), 60_000);
    } catch (err) {
      console.error('openFileInNewTab failed:', err);
      // Last-ditch fallback — let the browser try
      window.open(url, '_blank');
    }
    return;
  }

  // Unknown shape — try anyway
  window.open(url, '_blank');
}

/**
 * Download a file URL to the user's computer. Handles data: URLs (most common
 * in this app since uploads are stored as base64), blob: URLs, and remote URLs.
 * Triggers a real browser download via a temporary <a download> element.
 */
function downloadFileFromUrl(url, suggestedName) {
  if (!url) return;
  try {
    const a = document.createElement('a');
    a.style.display = 'none';
    a.href = url;
    a.download = suggestedName || 'document';
    // Some browsers refuse to download cross-origin URLs without rel=noopener
    a.rel = 'noopener';
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
  } catch (err) {
    console.error('downloadFileFromUrl failed:', err);
    // Fallback: open in a tab so the user can save it manually
    openFileInNewTab(url, suggestedName);
  }
}

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