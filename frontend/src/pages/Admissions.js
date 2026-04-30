// frontend/src/pages/Admissions.js
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { admissionAPI } from '../utils/admissionUtils';
import { studentAPI, classAPI } from '../utils/api';
import AdmissionDetailModal from '../components/admissions/AdmissionDetailModal';
import AdmissionFormModal   from '../components/admissions/AdmissionFormModal';

const fmt = n => (n||0).toLocaleString('en-IN');

const STATUS_META = {
  pending:             { label:'Pending',      color:'#D97706', bg:'#FEF3C7', border:'#FDE68A' },
  under_review:        { label:'Under Review', color:'#2563EB', bg:'#DBEAFE', border:'#BFDBFE' },
  approved:            { label:'Approved',     color:'#059669', bg:'#D1FAE5', border:'#A7F3D0' },
  rejected:            { label:'Rejected',     color:'#DC2626', bg:'#FEE2E2', border:'#FECACA' },
  enrolled:            { label:'Enrolled',     color:'#0D9488', bg:'#CCFBF1', border:'#99F6E4' },
  waitlisted:          { label:'Waitlisted',   color:'#EA580C', bg:'#FFEDD5', border:'#FED7AA' },
};

function KPICard({ label, value, sub, color, bg, onClick, active }) {
  return (
    <div onClick={onClick} style={{
      background: bg, border:`2px solid ${active ? color : 'transparent'}`,
      borderRadius:14, padding:'14px 16px', cursor:onClick?'pointer':'default',
      transition:'all 0.15s', flex:'1 1 0', minWidth:100,
    }}>
      <div style={{ fontSize:22, fontWeight:900, color }}>{value}</div>
      <div style={{ fontSize:11, fontWeight:700, color, marginTop:2 }}>{label}</div>
      {sub && <div style={{ fontSize:10, color:'#9CA3AF', marginTop:2 }}>{sub}</div>}
    </div>
  );
}

function EnrollModal({ app, onClose, onSuccess }) {
  const [classes,     setClasses]    = React.useState([]);
  const [enrollClass, setEnrollClass]= React.useState('');
  const [enrollRoll,  setEnrollRoll] = React.useState('');
  const [enrolling,   setEnrolling]  = React.useState(false);

  React.useEffect(()=>{
    classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{});
  },[]);

  const handleEnroll = async () => {
    if (!enrollClass) return toast.error('Please select a class');
    setEnrolling(true);
    try {
      const nameParts = (app.studentName||'student').toLowerCase().split(' ');
      const email = nameParts.join('') + Date.now() + '@student.local';
      await studentAPI.create({
        name:            app.studentName,
        email:           email,
        phone:           app.parentPhone || '',
        password:        'Student@123',
        classId:         enrollClass,
        rollNumber:      enrollRoll || '',
        gender:          app.gender || 'other',
        parentName:      app.parentName || '',
        parentPhone:     app.parentPhone || '',
        admissionNumber: (app.applicationNumber||'ADM') + '-' + Date.now().toString().slice(-4),
        status:          'active',
        isActive:        true,
      });
      await admissionAPI.updateStatus(app._id, { status: 'enrolled' });
      toast.success('✅ ' + app.studentName + ' enrolled! Email: ' + email + ' | Password: Student@123');
      onSuccess();
    } catch(err) {
      const msg = err.response?.data?.message || err.message || 'Enrollment failed';
      console.error('Enroll error:', err.response?.data || err);
      toast.error(msg);
    } finally { setEnrolling(false); }
  };

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', background:'rgba(0,0,0,0.5)', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:440, boxShadow:'0 20px 60px rgba(0,0,0,0.2)', overflow:'hidden' }}>
        <div style={{ padding:'18px 24px', borderBottom:'1px solid #E5E7EB', display:'flex', justifyContent:'space-between', alignItems:'center', background:'#F0FDF4' }}>
          <div>
            <div style={{ fontWeight:700, fontSize:16, color:'#065F46' }}>🎓 Enroll as Student</div>
            <div style={{ fontSize:13, color:'#059669', marginTop:2 }}>{app.studentName}</div>
          </div>
          <button onClick={onClose} style={{ width:30, height:30, borderRadius:8, border:'1px solid #D1FAE5', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280' }}>×</button>
        </div>
        <div style={{ padding:'20px 24px' }}>
          <div style={{ background:'#F8FAFC', borderRadius:10, padding:'12px', marginBottom:16, fontSize:12, color:'#374151' }}>
            <div><strong>Application:</strong> {app.applicationNumber}</div>
            <div><strong>Class Applied:</strong> {app.applyingForClass || '—'}</div>
            <div><strong>Parent:</strong> {app.parentName} · {app.parentPhone}</div>
          </div>
          <div style={{ marginBottom:12 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', display:'block', marginBottom:5 }}>Assign to Class *</label>
            <select value={enrollClass} onChange={e=>setEnrollClass(e.target.value)}
              style={{ width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:14, outline:'none', background:'#fff' }}>
              <option value="">Select Class</option>
              {classes.map(cl=><option key={cl._id} value={cl._id}>{cl.name} {cl.section||''}</option>)}
            </select>
          </div>
          <div style={{ marginBottom:16 }}>
            <label style={{ fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', display:'block', marginBottom:5 }}>Roll Number</label>
            <input value={enrollRoll} onChange={e=>setEnrollRoll(e.target.value)} placeholder="e.g. 01"
              style={{ width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:14, outline:'none' }}/>
          </div>
          <div style={{ background:'#FFFBEB', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 12px', fontSize:12, color:'#92400E', marginBottom:16 }}>
            Default password: <strong>Student@123</strong> — student can change after first login
          </div>
        </div>
        <div style={{ padding:'14px 24px', borderTop:'1px solid #E5E7EB', display:'flex', gap:10 }}>
          <button onClick={onClose}
            style={{ flex:1, padding:'11px', borderRadius:9, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:600, cursor:'pointer', color:'#6B7280' }}>
            Cancel
          </button>
          <button onClick={handleEnroll} disabled={enrolling}
            style={{ flex:2, padding:'11px', borderRadius:9, border:'none', background:enrolling?'#9CA3AF':'#059669', color:'#fff', fontSize:13, fontWeight:700, cursor:enrolling?'not-allowed':'pointer' }}>
            {enrolling ? '⏳ Enrolling...' : '✓ Confirm Enrollment'}
          </button>
        </div>
      </div>
    </div>
  );
}

function AppRow({ app, onView, onEdit, onDelete, onDownload, onStatusChange, onEnroll, isAdmin, canEdit, classes }) {
  const daysAgo = app.createdAt ? Math.floor((Date.now()-new Date(app.createdAt))/(1000*60*60*24)) : 0;
  return (
    <tr style={{ borderBottom:'0.5px solid #F3F4F6', cursor:'pointer', transition:'background 0.1s' }}
      onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'}
      onMouseLeave={e=>e.currentTarget.style.background='#fff'}
      onClick={onView}>
      <td style={{ padding:'12px 16px' }}>
        <div style={{ display:'flex', alignItems:'center', gap:10 }}>
          <div style={{ width:38, height:38, borderRadius:10, background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
            <span style={{ fontSize:15, fontWeight:700, color:'#fff' }}>{(app.studentName||'?')[0].toUpperCase()}</span>
          </div>
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#111827' }}>{app.studentName}</div>
            <div style={{ fontSize:11, color:'#9CA3AF', fontFamily:'monospace' }}>{app.applicationNumber}</div>
            <div style={{ marginTop:3 }}>
              {(()=>{
                const sm = STATUS_META[app.status]||STATUS_META.pending;
                return <span style={{ fontSize:10, fontWeight:700, color:sm.color, background:sm.bg, border:`1px solid ${sm.border}`, padding:'2px 8px', borderRadius:20 }}>{sm.label}</span>;
              })()}
            </div>
          </div>
        </div>
      </td>
      <td style={{ padding:'12px 16px' }}>
        <span style={{ fontWeight:700, fontSize:13, color:'#374151' }}>
          {(() => {
            const cls = classes.find(c => c._id === app.applyingForClass);
            if (cls) return `${cls.name}${cls.section ? ' ' + cls.section : ''}`;
            if (app.applyingForClass) return app.applyingForClass;
            return '—';
          })()}
        </span>
        {app.applyingForSection && <span style={{ color:'#9CA3AF' }}> – {app.applyingForSection}</span>}
      </td>
      <td style={{ padding:'12px 16px' }}>
        <div style={{ fontSize:13, fontWeight:600, color:'#374151' }}>{app.parentName||'—'}</div>
        <div style={{ fontSize:11, color:'#9CA3AF' }}>{app.parentPhone||''}</div>
      </td>

      <td style={{ padding:'12px 16px' }}>
        <div style={{ fontSize:12, color:'#6B7280' }}>
          {app.createdAt ? new Date(app.createdAt).toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '—'}
        </div>
        {daysAgo > 0 && <div style={{ fontSize:10, color:'#9CA3AF' }}>{daysAgo}d ago</div>}
      </td>

      <td style={{ padding:'12px 16px' }} onClick={e=>e.stopPropagation()}>
        <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
          <button onClick={onView}
            style={{ fontSize:11, fontWeight:700, color:'#6366F1', background:'#EEF2FF', border:'1px solid #C7D2FE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
            👁 View
          </button>
          <button onClick={()=>onDownload(app)}
            style={{ fontSize:11, fontWeight:700, color:'#059669', background:'#F0FDF4', border:'1px solid #BBF7D0', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
            ⬇ Download
          </button>
          {isAdmin && app.status==='pending' && (
            <button onClick={()=>onStatusChange(app._id,'approved')}
              style={{ fontSize:11, fontWeight:700, color:'#059669', background:'#D1FAE5', border:'1px solid #6EE7B7', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
              ✓ Approve
            </button>
          )}
          {canEdit && app.status!=='enrolled' && (
            <button onClick={()=>onEnroll(app)}
              style={{ fontSize:11, fontWeight:700, color:'#0D9488', background:'#CCFBF1', border:'1px solid #5EEAD4', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
              🎓 Enroll
            </button>
          )}
          {isAdmin && <>
            <button onClick={()=>onEdit(app)}
              style={{ fontSize:11, fontWeight:700, color:'#374151', background:'#F3F4F6', border:'1px solid #E5E7EB', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
              ✎
            </button>
            <button onClick={()=>onDelete(app._id, app.studentName)}
              style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>
              ✕
            </button>
          </>}
        </div>
      </td>
    </tr>
  );
}

export default function Admissions() {
  const { isAdmin, user } = useAuth();
  const isTeacher = user?.role === 'teacher';
  const canEdit = isAdmin || isTeacher;
  const [applications, setApplications] = useState([]);
  const [stats,        setStats]        = useState(null);
  const [loading,      setLoading]      = useState(true);
  const [total,        setTotal]        = useState(0);
  const [search,       setSearch]       = useState('');
  const [statusFilter, setStatus]       = useState('');
  const [classFilter,  setClass]        = useState('');
  const [priorityFilter,setPriority]    = useState('');
  const [page,         setPage]         = useState(1);
  const [detailId,     setDetailId]     = useState(null);
  const [formModal,    setFormModal]    = useState({ open:false, data:null });
  const [enrollModal,  setEnrollModal]  = useState({ open:false, data:null });
  const [classes,      setClasses]      = useState([]);
  const limit = 20;

  const downloadReceipt = (app) => {
    const win = window.open('','_blank','width=820,height=950');
    const docsSubmitted = Object.entries(app.documents||{}).filter(([,v])=>v).map(([k])=>k.replace(/([A-Z])/g,' $1').trim());
    win.document.write(`
      <html><head><title>Admission Receipt - ${app.studentName}</title>
      <style>
        *{box-sizing:border-box;margin:0;padding:0}
        body{font-family:Arial,sans-serif;padding:30px;color:#111;font-size:13px}
        .header{text-align:center;border-bottom:3px solid #6366F1;padding-bottom:16px;margin-bottom:20px}
        .school-name{font-size:22px;font-weight:900;color:#1F2937}
        .school-sub{font-size:12px;color:#6B7280;margin-top:4px}
        .receipt-title{display:inline-block;margin-top:12px;padding:5px 20px;border:2px solid #6366F1;border-radius:6px;font-size:14px;font-weight:700;color:#6366F1}
        .app-no{margin:14px 0;text-align:center;background:#F8F8FF;border:1px solid #E0E0FF;border-radius:8px;padding:10px;font-size:13px}
        .app-no strong{color:#6366F1;font-size:15px}
        .section{margin-bottom:16px}
        .section-title{font-size:11px;font-weight:700;color:#6366F1;text-transform:uppercase;letter-spacing:.08em;border-bottom:1.5px solid #E5E7EB;padding-bottom:5px;margin-bottom:10px}
        table{width:100%;border-collapse:collapse;font-size:12px}
        td{padding:6px 10px;border-bottom:0.5px solid #F3F4F6;vertical-align:top}
        td:first-child,td:nth-child(3){color:#6B7280;font-weight:600;width:25%}
        .doc-grid{display:flex;flex-wrap:wrap;gap:6px;padding:6px 0}
        .doc-badge{padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;background:#EEF2FF;color:#4338CA}
        .footer{margin-top:32px;padding-top:14px;border-top:1.5px solid #E5E7EB;display:grid;grid-template-columns:1fr 1fr 1fr;gap:16px;font-size:12px}
        .sign-box{text-align:center}
        .sign-line{border-bottom:1px solid #374151;margin:24px auto 6px;width:140px}
        .notice{margin-top:20px;padding:10px 14px;background:#FFFBEB;border:1px solid #FDE68A;border-radius:8px;font-size:11px;color:#92400E}
        @page{margin:12mm;size:A4}
      </style></head><body>
      <div class="header">
        <div class="school-name">The Future Step School</div>
        <div class="school-sub">Securing Future By Adaptive Learning</div>
        <div class="receipt-title">Admission Application Receipt</div>
      </div>
      <div class="app-no">
        Application No: <strong>${app.applicationNumber||'—'}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Date: <strong>${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</strong>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Status: <strong>${app.status?.replace(/_/g,' ')?.toUpperCase()||'PENDING'}</strong>
      </div>
      <div class="section">
        <div class="section-title">1. Student Information</div>
        <table>
          <tr><td>Student Name</td><td><strong>${app.studentName||'—'}</strong></td><td>Class Applied</td><td><strong>${app.applyingForClass||'—'}</strong></td></tr>
          <tr><td>Date of Birth</td><td>${app.dateOfBirth?new Date(app.dateOfBirth).toLocaleDateString('en-IN'):'—'}</td><td>Gender</td><td>${app.gender||'—'}</td></tr>
          <tr><td>Blood Group</td><td>${app.bloodGroup||'—'}</td><td>Aadhaar No</td><td>${app.aadhaarNumber||'—'}</td></tr>
          <tr><td>Religion</td><td>${app.religion||'—'}</td><td>Category</td><td>${app.category||'—'}</td></tr>
          <tr><td>Address</td><td colspan="3">${[app.address?.street||app.address,app.address?.city||app.city,app.address?.state||app.state,app.address?.pincode||app.pincode].filter(Boolean).join(', ')||'—'}</td></tr>
          <tr><td>Date of Admission</td><td>${app.dateOfAdmission?new Date(app.dateOfAdmission).toLocaleDateString('en-IN'):'—'}</td><td>Academic Year</td><td>${app.academicYear||'—'}</td></tr>
        </table>
      </div>
      <div class="section">
        <div class="section-title">2. Parent / Guardian Information</div>
        <table>
          <tr><td>Father's Name</td><td>${app.father?.name||app.fatherName||'—'}</td><td>Father's Phone</td><td>${app.father?.phone||app.fatherPhone||'—'}</td></tr>
          <tr><td>Mother's Name</td><td>${app.mother?.name||app.motherName||'—'}</td><td>Mother's Phone</td><td>${app.mother?.phone||app.motherPhone||'—'}</td></tr>
          <tr><td>Primary Contact</td><td><strong>${app.parentName||'—'}</strong></td><td>Contact Phone</td><td><strong>${app.parentPhone||'—'}</strong></td></tr>
          <tr><td>Email</td><td colspan="3">${app.parentEmail||'—'}</td></tr>
        </table>
      </div>
      <div class="section">
        <div class="section-title">3. Previous School</div>
        <table>
          <tr><td>School Name</td><td>${app.previousSchool||'—'}</td><td>Board</td><td>${app.previousBoard||'—'}</td></tr>
          <tr><td>Previous Class</td><td>${app.previousClass||'—'}</td><td>TC Number</td><td>${app.tcNumber||'—'}</td></tr>
        </table>
      </div>
      <div class="section">
        <div class="section-title">4. Documents Submitted (${docsSubmitted.length}/14)</div>
        <div class="doc-grid">
          ${docsSubmitted.length?docsSubmitted.map(d=>`<span class="doc-badge">✓ ${d}</span>`).join(''):'<span style="color:#9CA3AF">No documents uploaded yet</span>'}
        </div>
      </div>
      <div class="notice">⚠️ This is a preliminary receipt. Admission confirmed only after document verification and approval by school administration.</div>
      <div class="footer">
        <div class="sign-box"><div style="font-weight:700;margin-bottom:4px">Prepared By</div><div class="sign-line"></div><div>The Future Step School</div></div>
        <div class="sign-box"><div style="font-weight:700;margin-bottom:4px">Parent / Guardian</div><div class="sign-line"></div><div>${app.parentName||'—'}</div></div>
        <div class="sign-box"><div style="font-weight:700;margin-bottom:4px">Received By</div><div class="sign-line"></div><div>School Admin</div></div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(()=>win.print(),600);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = { page, limit };
      if (search)         params.search = search;
      if (statusFilter)   params.status = statusFilter;
      if (classFilter)    params.applyingForClass = classFilter;
      if (priorityFilter) params.priority = priorityFilter;
      const [res, statsRes] = await Promise.all([
        admissionAPI.getAll(params),
        admissionAPI.getStats(),
      ]);
      setApplications(res.data.data);
      setTotal(res.data.total);
      setStats(statsRes.data.data);
    } catch { toast.error('Failed to load admissions'); }
    finally { setLoading(false); }
  }, [search, statusFilter, classFilter, priorityFilter, page]);

  useEffect(() => { classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); }, []);
  useEffect(() => { load(); }, [load]);
  useEffect(() => { setPage(1); }, [search, statusFilter, classFilter, priorityFilter]);

  const handleStatusChange = async (id, status) => {
    try {
      await admissionAPI.updateStatus(id, { status });
      toast.success(`Status updated to ${status}`);
      load();
    } catch { toast.error('Failed to update status'); }
  };

  const handleDelete = async (id, name) => {
    if (!window.confirm(`Delete application for ${name}?`)) return;
    try { await admissionAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Delete failed'); }
  };

  const s = stats?.status || {};
  const convRate = s.conversionRate || 0;
  const pipeline = [
    { key:'',                    label:`All (${s.total||0})` },
    { key:'pending',             label:`Pending (${s.pending||0})` },
    { key:'under_review',        label:`Review (${s.under_review||0})` },
    { key:'approved',            label:`Approved (${s.approved||0})` },
    { key:'enrolled',            label:`Enrolled (${s.enrolled||0})` },
    { key:'rejected',            label:`Rejected (${s.rejected||0})` },
    { key:'waitlisted',          label:`Waitlisted (${s.waitlisted||0})` },
  ];

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:12, background:'#fff', outline:'none' };

  return (
    <div className="animate-fade-in">
      {/* ── Header ── */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:12 }}>
        <div>
          <h1 className="font-display text-3xl text-ink">🎓 Admissions</h1>
          <p className="text-sm text-muted mt-1">{fmt(total)} applications · {s.enrolled||0} enrolled · {convRate}% conversion rate</p>
        </div>
        {isAdmin && (
          <button onClick={()=>setFormModal({open:true,data:null})}
            style={{ padding:'10px 22px', borderRadius:10, background:'#6366F1', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer' }}>
            + New Application
          </button>
        )}
      </div>

      {/* ── KPI Cards ── */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
        {[
          { label:'Total',       value:s.total||0,       color:'#374151', bg:'#F9FAFB', sub:null },
          { label:'Pending',     value:s.pending||0,     color:'#D97706', bg:'#FEF3C7', sub:'awaiting review' },
          { label:'Under Review',value:s.under_review||0,color:'#2563EB', bg:'#DBEAFE', sub:'being assessed' },
          { label:'Approved',    value:s.approved||0,    color:'#059669', bg:'#D1FAE5', sub:'ready to enroll' },
          { label:'Enrolled',    value:s.enrolled||0,    color:'#0D9488', bg:'#CCFBF1', sub:'admitted' },
          { label:'Rejected',    value:s.rejected||0,    color:'#DC2626', bg:'#FEE2E2', sub:null },
          { label:'Conversion',  value:`${convRate}%`,   color:'#6366F1', bg:'#EEF2FF', sub:'approval rate' },
        ].map(k=>(
          <KPICard key={k.label} {...k}
            active={statusFilter===(k.label==='Total'?'':k.label.toLowerCase().replace(' ','_'))}
            onClick={()=>{
              if(k.label==='Total'||k.label==='Conversion') setStatus('');
              else setStatus(Object.keys(STATUS_META).find(key=>STATUS_META[key].label===k.label)||'');
            }}/>
        ))}
      </div>

      {/* ── Analytics Row ── */}
      {stats && (
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:14, marginBottom:20 }}>
          {/* Monthly trend */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Monthly Trend</div>
            {!(stats.monthly||[]).length ? (
              <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'16px 0' }}>No data yet</div>
            ) : (
              <div style={{ display:'flex', alignItems:'flex-end', gap:4, height:60 }}>
                {(stats.monthly||[]).map((m,i)=>{
                  const max = Math.max(...(stats.monthly||[]).map(x=>x.count),1);
                  const h = Math.max(4, Math.round((m.count/max)*100));
                  return (
                    <div key={i} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
                      <div style={{ width:'100%', height:`${h}%`, background:'#6366F1', borderRadius:3, minHeight:4 }} title={`${m.label}: ${m.count}`}/>
                      <span style={{ fontSize:9, color:'#9CA3AF' }}>{m.label}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* By Class */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>By Class</div>
            {!(stats.byClass||[]).length ? (
              <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'16px 0' }}>No data yet</div>
            ) : (stats.byClass||[]).slice(0,5).map((c,i)=>{
              const max = Math.max(...(stats.byClass||[]).map(x=>x.count),1);
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:6 }}>
                  <span style={{ fontSize:11, color:'#6B7280', minWidth:60 }}>{isNaN(c.class)?c.class:`Class ${c.class}`}</span>
                  <div style={{ flex:1, height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${(c.count/max)*100}%`, background:'#6366F1', borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:'#374151', minWidth:16 }}>{c.count}</span>
                </div>
              );
            })}
          </div>

          {/* By Source */}
          <div className="card" style={{ padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#9CA3AF', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:12 }}>Source</div>
            {!(stats.bySource||[]).length ? (
              <div style={{ fontSize:12, color:'#9CA3AF', textAlign:'center', padding:'16px 0' }}>No data yet</div>
            ) : (stats.bySource||[]).map((src,i)=>{
              const icons = { online:'🌐', walk_in:'🚶', referral:'👥', agent:'🤝' };
              const srcTotal = (stats.bySource||[]).reduce((a,b)=>a+b.count,0);
              const pct = srcTotal > 0 ? Math.round((src.count/srcTotal)*100) : 0;
              return (
                <div key={i} style={{ display:'flex', alignItems:'center', gap:8, marginBottom:8 }}>
                  <span style={{ fontSize:14 }}>{icons[src.source]||'📌'}</span>
                  <span style={{ fontSize:12, color:'#6B7280', flex:1, textTransform:'capitalize' }}>{(src.source||'').replace('_',' ')}</span>
                  <div style={{ width:50, height:6, background:'#F3F4F6', borderRadius:3, overflow:'hidden' }}>
                    <div style={{ height:'100%', width:`${pct}%`, background:'#0D9488', borderRadius:3 }}/>
                  </div>
                  <span style={{ fontSize:11, fontWeight:700, color:'#374151', minWidth:20 }}>{src.count}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* ── Pipeline tabs ── */}
      <div style={{ display:'flex', gap:4, flexWrap:'wrap', marginBottom:14, background:'#F3F4F6', borderRadius:10, padding:4 }}>
        {pipeline.map(p=>(
          <button key={p.key} onClick={()=>setStatus(p.key)}
            style={{ padding:'7px 14px', borderRadius:8, fontSize:12, fontWeight:700, border:'none', cursor:'pointer', whiteSpace:'nowrap', transition:'all 0.15s',
              background:statusFilter===p.key?'#6366F1':'transparent',
              color:statusFilter===p.key?'#fff':'#6B7280' }}>
            {p.label}
          </button>
        ))}
      </div>

      {/* ── Filters ── */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:14, padding:'12px 16px', background:'#F8FAFC', borderRadius:12, alignItems:'center' }}>
        <input placeholder="🔍 Search name, App#, parent, phone…" value={search} onChange={e=>setSearch(e.target.value)}
          style={{ ...SEL, minWidth:260 }}/>
        <select value={classFilter} onChange={e=>setClass(e.target.value)} style={SEL}>
          <option value="">All Classes</option>
          {Array.from({length:12},(_,i)=>i+1).map(n=><option key={n} value={n}>Class {n}</option>)}
        </select>
        <select value={priorityFilter} onChange={e=>setPriority(e.target.value)} style={SEL}>
          <option value="">All Priority</option>
          <option value="urgent">🔴 Urgent</option>
          <option value="high">🟠 High</option>
          <option value="normal">⚪ Normal</option>
        </select>
        {(search||statusFilter||classFilter||priorityFilter) && (
          <button onClick={()=>{setSearch('');setStatus('');setClass('');setPriority('');}}
            style={{ fontSize:12, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'6px 12px', borderRadius:8, cursor:'pointer', fontWeight:600 }}>
            ✕ Clear all
          </button>
        )}
        <div style={{ marginLeft:'auto', fontSize:12, color:'#9CA3AF', fontWeight:600 }}>
          {fmt(total)} results
        </div>
      </div>

      {/* ── Table ── */}
      {loading ? (
        <div style={{ padding:48, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading...</div>
      ) : applications.length > 0 && (
        <div className="card" style={{ padding:0, overflow:'hidden' }}>
          {(true) && (
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {['Applicant','Class','Parent / Contact','Applied','Actions'].map(h=>(
                    <th key={h} style={{ padding:'11px 16px', textAlign:'left', color:'#E2E8F0', fontSize:10, fontWeight:700, textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {applications.map(app=>(
                  <AppRow key={app._id} app={app} isAdmin={isAdmin} canEdit={canEdit} classes={classes}
                    onView={()=>setDetailId(app._id)}
                    onEdit={(a)=>setFormModal({open:true,data:a})}
                    onDelete={handleDelete}
                    onDownload={(a)=>downloadReceipt(a)}
                    onStatusChange={handleStatusChange}
                    onEnroll={(a)=>setEnrollModal({open:true,data:a})}/>
                ))}
              </tbody>
            </table>
          </div>
          )}

          {/* Pagination */}
        {total > limit && (
          <div style={{ padding:'12px 16px', borderTop:'0.5px solid #F3F4F6', display:'flex', justifyContent:'space-between', alignItems:'center', fontSize:12, color:'#6B7280' }}>
            <span>Showing {(page-1)*limit+1}–{Math.min(page*limit,total)} of {fmt(total)}</span>
            <div style={{ display:'flex', gap:6 }}>
              <button disabled={page===1} onClick={()=>setPage(p=>p-1)}
                style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:page===1?'not-allowed':'pointer', color:page===1?'#D1D5DB':'#374151' }}>← Prev</button>
              {[...Array(Math.min(5,Math.ceil(total/limit)))].map((_,i)=>(
                <button key={i} onClick={()=>setPage(i+1)}
                  style={{ padding:'6px 12px', borderRadius:7, border:'1px solid', borderColor:page===i+1?'#6366F1':'#E5E7EB', background:page===i+1?'#6366F1':'#fff', color:page===i+1?'#fff':'#374151', cursor:'pointer', fontWeight:page===i+1?700:400 }}>
                  {i+1}
                </button>
              ))}
              <button disabled={page>=Math.ceil(total/limit)} onClick={()=>setPage(p=>p+1)}
                style={{ padding:'6px 14px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', cursor:page>=Math.ceil(total/limit)?'not-allowed':'pointer', color:page>=Math.ceil(total/limit)?'#D1D5DB':'#374151' }}>Next →</button>
            </div>
          </div>
          )}
        </div>
      )}

      {/* ── Modals ── */}
      {detailId && (
        <AdmissionDetailModal id={detailId}
          onClose={()=>{setDetailId(null);load();}}/>
      )}
      {formModal.open && (
        <AdmissionFormModal initial={formModal.data}
          onClose={()=>setFormModal({open:false,data:null})}
          onSuccess={()=>{setFormModal({open:false,data:null});load();}}/>
      )}

      {enrollModal.open && enrollModal.data && (
        <EnrollModal
          app={enrollModal.data}
          onClose={()=>setEnrollModal({open:false,data:null})}
          onSuccess={()=>{ setEnrollModal({open:false,data:null}); load(); }}
        />
      )}

    </div>
  );
}