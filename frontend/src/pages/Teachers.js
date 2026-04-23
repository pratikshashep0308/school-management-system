/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Teachers.js — eSkooly-style Employees module
import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI, subjectAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState } from '../components/ui';
import PhoneInput from '../components/ui/PhoneInput';

const ROLES = ['Teacher','Principal','Vice Principal','Accountant','Librarian','Transport Manager','Admin Staff','Peon','Security'];
const GENDERS = ['Male','Female','Other'];
const BLOOD_GROUPS = ['A+','A-','B+','B-','AB+','AB-','O+','O-'];
const RELIGIONS = ['Hindu','Muslim','Christian','Sikh','Jain','Buddhist','Other'];

const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
  fontSize:13, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' };
const LBL = { fontSize:11, color:'#6B7280', marginBottom:4, display:'block', fontWeight:600 };

const AVATAR_COLORS = ['#185FA5','#534AB7','#0F6E56','#D4522A','#993556','#B45309','#0369A1','#1D6F42','#7C3AED'];
function avatarBg(name) {
  let hash = 0;
  for (let i=0; i<(name||'').length; i++) hash = (name||'').charCodeAt(i) + ((hash<<5)-hash);
  return AVATAR_COLORS[Math.abs(hash) % AVATAR_COLORS.length];
}
function initials(name) { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

// ── Employee Card ─────────────────────────────────────────────────────────────
function EmployeeCard({ t, onView, onEdit, onDelete, isAdmin }) {
  const name = t.user?.name || '—';
  const bg   = avatarBg(name);
  return (
    <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:14,
      padding:'20px 16px', display:'flex', flexDirection:'column', alignItems:'center', gap:8,
      boxShadow:'0 1px 4px rgba(0,0,0,0.06)', transition:'all 0.15s', cursor:'pointer' }}
      onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 6px 20px rgba(0,0,0,0.12)'; e.currentTarget.style.transform='translateY(-3px)'; }}
      onMouseLeave={e=>{ e.currentTarget.style.boxShadow='0 1px 4px rgba(0,0,0,0.06)'; e.currentTarget.style.transform=''; }}
      onClick={()=>onView(t)}>
      {/* Avatar */}
      <div style={{ width:70, height:70, borderRadius:'50%', background:bg,
        display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:700, color:'#fff' }}>
        {t.user?.profileImage
          ? <img src={t.user.profileImage} alt={name} style={{ width:70, height:70, borderRadius:'50%', objectFit:'cover' }}/>
          : initials(name)}
      </div>
      <div style={{ textAlign:'center' }}>
        <div style={{ fontWeight:700, fontSize:14, color:'#111827' }}>{name}</div>
        <div style={{ fontSize:12, color:'#9CA3AF', marginTop:2 }}>{t.designation || 'Teacher'}</div>
      </div>
      {/* Action buttons */}
      <div style={{ display:'flex', gap:6, marginTop:4 }} onClick={e=>e.stopPropagation()}>
        <button onClick={()=>onView(t)} title="View"
          style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#EFF6FF', color:'#3B5BDB', cursor:'pointer', fontSize:14 }}>🔍</button>
        {isAdmin && (
          <button onClick={()=>onEdit(t)} title="Edit"
            style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#F0FDF4', color:'#16A34A', cursor:'pointer', fontSize:14 }}>✎</button>
        )}
        {isAdmin && (
          <button onClick={()=>onDelete(t)} title="Delete"
            style={{ width:30, height:30, borderRadius:'50%', border:'none', background:'#FEF2F2', color:'#DC2626', cursor:'pointer', fontSize:14 }}>🗑</button>
        )}
      </div>
    </div>
  );
}

// ── Employee Detail Modal ─────────────────────────────────────────────────────
function ViewModal({ t, onClose, onEdit, isAdmin }) {
  if (!t) return null;
  const name = t.user?.name || '—';
  const bg   = avatarBg(name);
  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:560, maxHeight:'90vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        <div style={{ background:'#0B1F4A', padding:'20px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div style={{ display:'flex', alignItems:'center', gap:14 }}>
            <div style={{ width:56, height:56, borderRadius:'50%', background:bg, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'#fff' }}>
              {initials(name)}
            </div>
            <div>
              <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>{name}</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.6)' }}>{t.designation||'Teacher'} · {t.employeeId||'—'}</div>
            </div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            {isAdmin && <button onClick={onEdit} style={{ padding:'6px 16px', borderRadius:8, border:'1px solid rgba(255,255,255,0.3)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:12, fontWeight:600 }}>✎ Edit</button>}
            <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
          </div>
        </div>
        <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          {[
            { label:'Email',       val:t.user?.email },
            { label:'Phone',       val:t.user?.phone },
            { label:'Employee ID', val:t.employeeId },
            { label:'Designation', val:t.designation },
            { label:'Salary',      val:t.salary?`₹${Number(t.salary).toLocaleString('en-IN')}`:null },
            { label:'Experience',  val:t.experience?`${t.experience} years`:null },
            { label:'Qualification',val:t.qualification },
            { label:'Joining Date',val:t.joiningDate?new Date(t.joiningDate).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}):null },
            { label:'Address',     val:t.address },
            { label:'Status',      val:t.isActive?'Active':'Inactive' },
          ].map(row=>(
            <div key={row.label} style={{ background:'#F8FAFC', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>{row.label}</div>
              <div style={{ fontSize:13, fontWeight:600, color:'#111827' }}>{row.val||'—'}</div>
            </div>
          ))}
          {t.subjects?.length>0 && (
            <div style={{ gridColumn:'span 2', background:'#F8FAFC', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:8 }}>Subjects</div>
              <div style={{ display:'flex', gap:6, flexWrap:'wrap' }}>
                {t.subjects.map(s=><span key={s._id} style={{ fontSize:12, fontWeight:600, color:'#1D4ED8', background:'#EFF6FF', padding:'3px 10px', borderRadius:20 }}>{s.name}</span>)}
              </div>
            </div>
          )}
          <div style={{ gridColumn:'span 2', background:'#FFF7ED', borderRadius:10, padding:'10px 14px', border:'1px solid #FED7AA' }}>
            <div style={{ fontSize:10, color:'#92400E', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>Login Credentials</div>
            <div style={{ fontSize:12, color:'#374151' }}>Email: <b>{t.user?.email}</b></div>
            <div style={{ fontSize:12, color:'#374151', marginTop:2 }}>Default Password: <b>Teacher@123</b></div>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Add/Edit Modal ────────────────────────────────────────────────────────────
function EditModal({ open, onClose, onSave, initial }) {
  const [form, setForm] = useState(initial);
  const [saving, setSaving] = useState(false);
  useEffect(()=>setForm(initial),[initial]);
  if (!open) return null;
  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name?.trim())  return toast.error('Name is required');
    if (!form.email?.trim()) return toast.error('Email is required');
    setSaving(true);
    await onSave(form);
    setSaving(false);
  };

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,0.5)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000, padding:16 }}
      onClick={e=>e.target===e.currentTarget&&onClose()}>
      <div style={{ background:'#fff', borderRadius:16, width:'100%', maxWidth:680, maxHeight:'92vh', overflowY:'auto', boxShadow:'0 20px 60px rgba(0,0,0,0.3)' }}>
        {/* Header */}
        <div style={{ background:'#0B1F4A', padding:'18px 24px', borderRadius:'16px 16px 0 0', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontWeight:800, fontSize:16, color:'#fff' }}>{form._id?'Edit Employee':'New Staff'}</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>
              <span style={{ marginRight:12 }}>● Required</span><span>○ Optional</span>
            </div>
          </div>
          <button onClick={onClose} style={{ width:32, height:32, borderRadius:8, border:'1px solid rgba(255,255,255,0.2)', background:'rgba(255,255,255,0.1)', color:'#fff', cursor:'pointer', fontSize:18 }}>×</button>
        </div>

        <div style={{ padding:24, display:'flex', flexDirection:'column', gap:20 }}>
          {/* Section 1: Basic Information */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'#0B1F4A', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>1</div>
              Basic Information
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <div style={{ gridColumn:'span 1' }}>
                <label style={LBL}>Employee Name <span style={{ color:'red' }}>*</span></label>
                <input style={INP} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="Name of Employee"/>
              </div>
              <div>
                <label style={LBL}>Mobile No <span style={{ color:'#9CA3AF', fontSize:10 }}>(SMS/WhatsApp)</span></label>
                <PhoneInput value={form.phone} onChange={v=>set('phone',v)}/>
              </div>
              <div>
                <label style={LBL}>Employee Role <span style={{ color:'red' }}>*</span></label>
                <select style={INP} value={form.designation} onChange={e=>set('designation',e.target.value)}>
                  <option value="">Select*</option>
                  {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Email Address <span style={{ color:'red' }}>*</span></label>
                <input style={INP} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="email@school.com"/>
              </div>
              <div>
                <label style={LBL}>Date of Joining</label>
                <input style={INP} type="date" value={form.joiningDate} onChange={e=>set('joiningDate',e.target.value)}/>
              </div>
              <div>
                <label style={LBL}>Monthly Salary <span style={{ color:'red' }}>*</span></label>
                <input style={INP} type="number" value={form.salary} onChange={e=>set('salary',e.target.value)} placeholder="Monthly Salary"/>
              </div>
            </div>
          </div>

          {/* Section 2: Other Information */}
          <div>
            <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:14, display:'flex', alignItems:'center', gap:8 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'#6B7280', color:'#fff', fontSize:11, fontWeight:700, display:'flex', alignItems:'center', justifyContent:'center' }}>2</div>
              Other Information
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12 }}>
              <div>
                <label style={LBL}>Father / Husband Name</label>
                <input style={INP} value={form.fatherName||''} onChange={e=>set('fatherName',e.target.value)} placeholder="Father / Husband Name"/>
              </div>
              <div>
                <label style={LBL}>Gender</label>
                <select style={INP} value={form.gender||''} onChange={e=>set('gender',e.target.value)}>
                  <option value="">Select</option>
                  {GENDERS.map(g=><option key={g} value={g}>{g}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Experience (years)</label>
                <input style={INP} type="number" value={form.experience||''} onChange={e=>set('experience',e.target.value)} placeholder="Experience"/>
              </div>
              <div>
                <label style={LBL}>Employee ID</label>
                <input style={INP} value={form.employeeId||''} onChange={e=>set('employeeId',e.target.value)} placeholder="EMP-001"/>
              </div>
              <div>
                <label style={LBL}>Religion</label>
                <select style={INP} value={form.religion||''} onChange={e=>set('religion',e.target.value)}>
                  <option value="">Select</option>
                  {RELIGIONS.map(r=><option key={r} value={r}>{r}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Education / Qualification</label>
                <input style={INP} value={form.qualification||''} onChange={e=>set('qualification',e.target.value)} placeholder="Education"/>
              </div>
              <div>
                <label style={LBL}>Blood Group</label>
                <select style={INP} value={form.bloodGroup||''} onChange={e=>set('bloodGroup',e.target.value)}>
                  <option value="">Select</option>
                  {BLOOD_GROUPS.map(b=><option key={b} value={b}>{b}</option>)}
                </select>
              </div>
              <div>
                <label style={LBL}>Date of Birth</label>
                <input style={INP} type="date" value={form.dateOfBirth||''} onChange={e=>set('dateOfBirth',e.target.value)}/>
              </div>
              <div style={{ gridColumn:'span 1' }}>
                <label style={LBL}>National ID</label>
                <input style={INP} value={form.nationalId||''} onChange={e=>set('nationalId',e.target.value)} placeholder="National ID"/>
              </div>
              <div style={{ gridColumn:'span 3' }}>
                <label style={LBL}>Home Address</label>
                <input style={INP} value={form.address||''} onChange={e=>set('address',e.target.value)} placeholder="Home Address"/>
              </div>
            </div>
          </div>

          {!form._id && (
            <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:10, padding:'10px 16px', fontSize:12, color:'#1D4ED8' }}>
              💡 Default login password: <strong>Teacher@123</strong> — employee can change after first login.
            </div>
          )}

          {/* Actions */}
          <div style={{ display:'flex', gap:10, justifyContent:'center', paddingTop:4 }}>
            <button onClick={()=>{ setForm(initial); }} style={{ padding:'10px 28px', borderRadius:24, border:'1px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
              ↺ Reset
            </button>
            <button onClick={save} disabled={saving} style={{ padding:'10px 32px', borderRadius:24, border:'none', background:'#3B5BDB', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
              {saving?'⏳ Saving…':'✔ Submit'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Job Letter ────────────────────────────────────────────────────────────────
function JobLetterTab({ teachers, schoolName }) {
  const [search,   setSearch]   = useState('');
  const [showDrop, setShowDrop] = useState(false);
  const [selected, setSelected] = useState(null);

  const filtered = teachers.filter(t => {
    const name = t.user?.name||'';
    return !search || name.toLowerCase().includes(search.toLowerCase()) || (t.employeeId||'').toLowerCase().includes(search.toLowerCase());
  });

  const printLetter = () => {
    if (!selected) return;
    const t    = selected;
    const name = t.user?.name || '—';
    const html = `<html><head><title>Job Letter</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:30px;color:#111}
      .header{text-align:center;border-bottom:2px solid #0B1F4A;padding-bottom:16px;margin-bottom:20px}
      .header h1{color:#0B1F4A;font-size:22px} .header p{font-size:12px;color:#666;margin:2px 0}
      .title{text-align:center;font-size:18px;font-weight:bold;color:#3B5BDB;margin:16px 0;text-decoration:underline}
      .main{display:grid;grid-template-columns:140px 1fr 1fr;gap:20px;margin-bottom:20px;align-items:start}
      .avatar{width:120px;height:120px;border-radius:50%;background:#0B1F4A;display:flex;align-items:center;justify-content:center;font-size:40px;font-weight:bold;color:#fff;margin:0 auto}
      .info-col{display:flex;flex-direction:column;gap:10px}
      .info-row{font-size:12px} .info-row .lbl{font-size:10px;color:#999;margin-bottom:2px} .info-row .val{font-weight:bold}
      .qr-section{text-align:center;border:1px solid #eee;padding:12px;border-radius:8px}
      .qr-section p{font-size:10px;color:#666;margin-top:6px}
      .extra-grid{display:grid;grid-template-columns:1fr 1fr 1fr 1fr 1fr 1fr;gap:10px;margin-bottom:20px}
      .extra-row{font-size:12px} .extra-row .lbl{font-size:10px;color:#999;margin-bottom:2px}
      .rules{border-top:1px solid #eee;padding-top:14px;margin-top:14px}
      .rules h3{color:#DC2626;font-size:13px;margin-bottom:8px}
      .rules p,.rules li{font-size:11px;color:#444;margin-bottom:4px}
      .rules ul{padding-left:20px}
      .footer{display:grid;grid-template-columns:1fr 1fr;gap:40px;margin-top:40px;text-align:center}
      .footer div{border-top:1px solid #999;padding-top:6px;font-size:11px;color:#666}
    </style></head><body>
    <div class="header">
      <h1>${schoolName||'School'}</h1>
      <p>Securing Future By Adaptive Learning</p>
    </div>
    <div class="title">Job Letter</div>
    <div class="main">
      <div><div class="avatar">${name[0]||'?'}</div><div style="text-align:center;font-weight:bold;margin-top:8px;font-size:14px">${name}</div></div>
      <div class="info-col">
        <div class="info-row"><div class="lbl">Serial No</div><div class="val">→ ${t.employeeId||'—'}</div></div>
        <div class="info-row"><div class="lbl">Registration/ID</div><div class="val">→ ${t.employeeId||'—'}</div></div>
        <div class="info-row"><div class="lbl">Employee Role</div><div class="val">→ ${t.designation||'Teacher'}</div></div>
        <div class="info-row"><div class="lbl">Name of Employee</div><div class="val">→ ${name}</div></div>
        <div class="info-row"><div class="lbl">Father / Husband Name</div><div class="val">→ ${t.fatherName||'—'}</div></div>
      </div>
      <div class="info-col">
        <div class="info-row"><div class="lbl">National ID</div><div class="val">${t.nationalId||'—'}</div></div>
        <div class="info-row"><div class="lbl">Date of Joining</div><div class="val">${t.joiningDate?new Date(t.joiningDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'—'}</div></div>
        <div class="info-row"><div class="lbl">Monthly Salary</div><div class="val">₹ ${t.salary?Number(t.salary).toLocaleString('en-IN'):'—'}</div></div>
        <div class="info-row"><div class="lbl">Username</div><div class="val">${t.user?.email||'—'}</div></div>
        <div class="info-row"><div class="lbl">Password</div><div class="val">${t.user?.email?.split('@')[0]||'—'}</div></div>
      </div>
    </div>
    <div class="extra-grid">
      <div class="extra-row"><div class="lbl">Date of Birth</div><div>${t.dateOfBirth?new Date(t.dateOfBirth).toLocaleDateString('en-IN'):'—'}</div></div>
      <div class="extra-row"><div class="lbl">Education</div><div>${t.qualification||'—'}</div></div>
      <div class="extra-row"><div class="lbl">Blood Group</div><div>${t.bloodGroup||'—'}</div></div>
      <div class="extra-row"><div class="lbl">Mobile No</div><div>${t.user?.phone||'—'}</div></div>
      <div class="extra-row"><div class="lbl">Experience</div><div>${t.experience?t.experience+' years':'—'}</div></div>
      <div class="extra-row"><div class="lbl">Email Address</div><div>${t.user?.email||'—'}</div></div>
      <div class="extra-row"><div class="lbl">Gender</div><div>${t.gender||'—'}</div></div>
      <div class="extra-row"><div class="lbl">Religion</div><div>${t.religion||'—'}</div></div>
    </div>
    <div class="extra-row"><div class="lbl">Home Address</div><div>${t.address||'—'}</div></div>
    <div class="rules">
      <h3>Rules And Regulations:</h3>
      <p>The school rules have been established in partnership with the community over a long period of time. They reflect the school community's expectations in terms of acceptable standards of behaviour, dress and personal presentation in the widest sense. Students are expected to abide by all school rules at all times.</p>
      <ul>
        <li>To attend school regularly</li>
        <li>To respect the right of others to learn</li>
        <li>To respect their peers and colleagues regardless of ethnicity, religion or gender</li>
        <li>To respect the property and equipment of the school and others</li>
        <li>To carry out reasonable instructions to the best of their ability</li>
        <li>To conduct themselves in a courteous and appropriate manner in school and in public</li>
        <li>To keep the school environment and the local community free from litter</li>
        <li>To observe the uniform code of the school</li>
      </ul>
    </div>
    <div class="footer">
      <div>Signature of Authority...............</div>
      <div>Institute Stamp.....................<br>${schoolName||'School'}</div>
    </div>
    </body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  return (
    <div>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>Employees &nbsp;|&nbsp; 🏠 - Job Letter</div>

      {!selected ? (
        /* Search */
        <div style={{ maxWidth:500, margin:'0 auto' }}>
          <div style={{ position:'relative' }}>
            <div style={{ display:'flex', border:'1.5px solid #E5E7EB', borderRadius:10, background:'#fff', overflow:'hidden' }}>
              <input value={search} onChange={e=>{ setSearch(e.target.value); setShowDrop(true); }}
                onFocus={()=>setShowDrop(true)}
                placeholder="Search Employee" style={{ flex:1, padding:'11px 14px', border:'none', outline:'none', fontSize:13 }}/>
              <div style={{ padding:'0 14px', display:'flex', alignItems:'center', color:'#9CA3AF' }}>🔍</div>
            </div>
            {showDrop && filtered.length>0 && (
              <div style={{ position:'absolute', top:'calc(100% + 4px)', left:0, right:0, background:'#fff',
                border:'1px solid #E5E7EB', borderRadius:10, boxShadow:'0 8px 24px rgba(0,0,0,0.12)', zIndex:100 }}>
                {filtered.map(t=>(
                  <div key={t._id} onClick={()=>{ setSelected(t); setShowDrop(false); setSearch(t.user?.name||''); }}
                    style={{ padding:'10px 16px', cursor:'pointer', fontSize:13, borderBottom:'1px solid #F3F4F6' }}
                    onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                    onMouseLeave={e=>e.currentTarget.style.background=''}>
                    {t.employeeId} - {t.user?.name} - {t.designation||'Teacher'}
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      ) : (
        /* Job Letter Preview */
        <div style={{ maxWidth:700, margin:'0 auto' }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16, flexWrap:'wrap', gap:8 }}>
            <button onClick={()=>{setSelected(null);setSearch('');}}
              style={{ padding:'6px 16px', borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:13 }}>← Back</button>
            <button onClick={printLetter}
              style={{ padding:'8px 20px', borderRadius:24, border:'none', background:'#3B5BDB', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', display:'flex', alignItems:'center', gap:6 }}>
              🖨️ Print Job Letter
            </button>
          </div>

          <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:24, boxShadow:'0 4px 16px rgba(0,0,0,0.06)' }}>
            <div style={{ display:'flex', alignItems:'center', gap:20, marginBottom:20 }}>
              <div style={{ width:80, height:80, borderRadius:'50%', background:avatarBg(selected.user?.name||''), display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, fontWeight:700, color:'#fff', flexShrink:0 }}>
                {initials(selected.user?.name||'')}
              </div>
              <div>
                <div style={{ fontSize:20, fontWeight:800, color:'#0B1F4A' }}>{selected.user?.name||'—'}</div>
                <div style={{ fontSize:13, color:'#6B7280', marginTop:3 }}>{selected.designation||'Teacher'}</div>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12 }}>
              {[
                { label:'Registration/ID', val:selected.employeeId||'—' },
                { label:'Employee Role',   val:selected.designation||'Teacher' },
                { label:'Date of Joining', val:selected.joiningDate?new Date(selected.joiningDate).toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'}):'—' },
                { label:'Account Status',  val:'✅ Active' },
                { label:'Portal URL',      val:`${window.location.origin}/login` },
                { label:'Username',        val:selected.user?.email||'—' },
                { label:'Password',        val:'Teacher@123' },
                { label:'Monthly Salary',  val:selected.salary?`₹${Number(selected.salary).toLocaleString('en-IN')}`:'—' },
              ].map(r=>(
                <div key={r.label} style={{ background:'#F8FAFC', borderRadius:8, padding:'10px 14px' }}>
                  <div style={{ fontSize:10, color:'#9CA3AF', fontWeight:700, textTransform:'uppercase', marginBottom:4 }}>{r.label}</div>
                  <div style={{ fontSize:13, fontWeight:600, color:'#111827', display:'flex', alignItems:'center', gap:6 }}>
                    <span style={{ color:'#3B5BDB', fontSize:11 }}>↳</span> {r.val}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Manage Login Tab ──────────────────────────────────────────────────────────
function ManageLoginTab({ teachers }) {
  const [search, setSearch]   = useState('');
  const [role,   setRole]     = useState('');
  const [show,   setShow]     = useState({});

  const printTable = (rows) => {
    const html = `<html><head><title>Staff Login — The Future Step School</title>
    <style>
      *{box-sizing:border-box;margin:0;padding:0}
      body{font-family:Arial,sans-serif;padding:24px;color:#111}
      h2{font-size:20px;margin-bottom:4px;color:#0B1F4A}
      p{font-size:12px;color:#666;margin-bottom:16px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#0B1F4A;color:#fff;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase}
      td{padding:8px 12px;border-bottom:1px solid #eee}
      tr:nth-child(even) td{background:#f9f9f9}
      .footer{margin-top:24px;display:flex;justify-content:space-between;font-size:11px;color:#999}
    </style></head><body>
    <h2>The Future Step School</h2>
    <p>Staff Login Details — ${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p>
    <table>
      <thead><tr><th>ID</th><th>Staff Name</th><th>Role</th><th>Username</th><th>Password</th></tr></thead>
      <tbody>
        ${rows.map(t=>`<tr>
          <td style="font-family:monospace;font-size:12px">${t.employeeId||'—'}</td>
          <td style="font-weight:bold">${t.user?.name||'—'}</td>
          <td>${t.designation||'Teacher'}</td>
          <td style="font-size:12px">${t.user?.email||'—'}</td>
          <td style="font-family:monospace;font-size:12px">Teacher@123</td>
        </tr>`).join('')}
      </tbody>
    </table>
    <div class="footer">
      <span>Total: ${rows.length} staff members</span>
      <span>Printed: ${new Date().toLocaleString('en-IN')}</span>
    </div>
    </body></html>`;
    const w = window.open('','_blank','width=900,height=600');
    w.document.write(html);
    w.document.close();
    w.print();
  };

  const filtered = teachers.filter(t => {
    const name = t.user?.name||'';
    const q    = search.toLowerCase();
    const matchSearch = !q || name.toLowerCase().includes(q) || (t.employeeId||'').toLowerCase().includes(q);
    const matchRole   = !role || (t.designation||'').toLowerCase().includes(role.toLowerCase());
    return matchSearch && matchRole;
  });

  const copy = (text) => { navigator.clipboard.writeText(text).then(()=>toast.success('Copied!')); };

  const BTN = { padding:'4px 10px', borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:11 };

  return (
    <div>
      <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>Employees &nbsp;|&nbsp; 🏠 - Staff Login</div>
      <div style={{ display:'flex', gap:12, marginBottom:20, flexWrap:'wrap' }}>
        {/* Search panel */}
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, padding:16, minWidth:240 }}>
          <div style={{ fontWeight:700, fontSize:14, marginBottom:12, display:'flex', alignItems:'center', gap:6 }}>🔍 Search</div>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Employee"
            style={{ ...INP, marginBottom:10 }}/>
          <select value={role} onChange={e=>setRole(e.target.value)} style={INP}>
            <option value="">Select*</option>
            {ROLES.map(r=><option key={r} value={r}>{r}</option>)}
          </select>
          <button onClick={()=>{ setSearch(''); setRole(''); }}
            style={{ marginTop:10, width:'100%', padding:'8px', borderRadius:8, border:'1px solid #E5E7EB', background:'#F9FAFB', cursor:'pointer', fontSize:12, color:'#6B7280' }}>
            or, Reload All
          </button>
        </div>

        {/* Table */}
        <div style={{ flex:1, background:'#fff', border:'1px solid #E5E7EB', borderRadius:12, overflow:'hidden' }}>
          <div style={{ padding:'10px 14px', borderBottom:'1px solid #F3F4F6', display:'flex', gap:6, flexWrap:'wrap' }}>
            {[
              { label:'Copy',  fn:()=>{ copy(filtered.map(t=>`${t.employeeId}\t${t.user?.name}\t${t.designation||''}\t${t.user?.email||''}`).join('\n')); }},
              { label:'CSV',   fn:()=>{ const blob=new Blob(['ID,Name,Role,Username\n'+filtered.map(t=>`${t.employeeId||''},${t.user?.name||''},${t.designation||''},${t.user?.email||''}`).join('\n')],{type:'text/csv'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='employees.csv';a.click(); }},
              { label:'Excel', fn:()=>{ const blob=new Blob(['ID,Name,Role,Username\n'+filtered.map(t=>`${t.employeeId||''},${t.user?.name||''},${t.designation||''},${t.user?.email||''}`).join('\n')],{type:'text/csv'}); const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download='employees.xls';a.click(); }},
              { label:'PDF',   fn:()=>printTable(filtered) },
              { label:'Print', fn:()=>printTable(filtered) },
            ].map(b=>(
              <button key={b.label} style={BTN} onClick={()=>b.fn()}>
                {b.label}
              </button>
            ))}
            <div style={{ marginLeft:'auto', display:'flex', alignItems:'center', gap:6 }}>
              <span style={{ fontSize:12, color:'#6B7280' }}>Search:</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                style={{ padding:'4px 8px', border:'1px solid #E5E7EB', borderRadius:6, fontSize:12, outline:'none', width:140 }}/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {['ID','Staff Name','Role','Username','Password','Actions'].map(h=>(
                    <th key={h} style={{ padding:'9px 12px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', whiteSpace:'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((t,i)=>{
                  const username = t.user?.email||'—';
                  const password = 'Teacher@123';
                  const shown    = show[t._id];
                  return (
                    <tr key={t._id} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}>
                      <td style={{ padding:'9px 12px', fontFamily:'monospace', fontSize:12 }}>{t.employeeId||'—'}</td>
                      <td style={{ padding:'9px 12px', fontWeight:600 }}>{t.user?.name||'—'}</td>
                      <td style={{ padding:'9px 12px', color:'#6B7280' }}>{t.designation||'Teacher'}</td>
                      <td style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'4px 10px', maxWidth:220 }}>
                          <span style={{ fontSize:12, flex:1, fontFamily:'monospace' }}>{username}</span>
                          <button onClick={()=>copy(username)} style={{ ...BTN, padding:'2px 6px', border:'none', background:'transparent' }} title="Copy">📋</button>
                        </div>
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:6, background:'#F8FAFC', border:'1px solid #E5E7EB', borderRadius:8, padding:'4px 10px', maxWidth:180 }}>
                          <span style={{ fontSize:12, flex:1, fontFamily:'monospace' }}>{shown ? password : '•'.repeat(12)}</span>
                          <button onClick={()=>setShow(s=>({...s,[t._id]:!s[t._id]}))} style={{ ...BTN, padding:'2px 6px', border:'none', background:'transparent' }}>
                            {shown?'🙈':'👁️'}
                          </button>
                          <button onClick={()=>copy(password)} style={{ ...BTN, padding:'2px 6px', border:'none', background:'transparent' }}>📋</button>
                        </div>
                      </td>
                      <td style={{ padding:'9px 12px' }}>
                        <div style={{ display:'flex', gap:6 }}>
                          <button onClick={()=>copy(`Username: ${username}\nPassword: ${password}`)}
                            style={{ ...BTN, background:'#EFF6FF', color:'#1D4ED8', border:'none' }}>📋</button>
                          <button style={{ ...BTN, background:'#F0FDF4', color:'#16A34A', border:'none' }}>✉️</button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'8px 14px', borderTop:'1px solid #F3F4F6', fontSize:12, color:'#6B7280' }}>
            Showing 1 to {filtered.length} of {filtered.length} entries
          </div>
        </div>
      </div>
    </div>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────
const EMPTY_FORM = { name:'', email:'', phone:'', employeeId:'', designation:'', salary:'',
  joiningDate:new Date().toISOString().split('T')[0], qualification:'', experience:'',
  fatherName:'', gender:'', religion:'', bloodGroup:'', dateOfBirth:'', nationalId:'', address:'' };

export default function Teachers() {
  const { isAdmin } = useAuth();
  const [tab,        setTab]       = useState('all');
  const [teachers,   setTeachers]  = useState([]);
  const [loading,    setLoading]   = useState(true);
  const [search,     setSearch]    = useState('');
  const [editOpen,   setEditOpen]  = useState(false);
  const [editForm,   setEditForm]  = useState(EMPTY_FORM);
  const [viewT,      setViewT]     = useState(null);
  const schoolName = 'The Future Step School';

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const r = await teacherAPI.getAll();
      setTeachers(r.data.data || []);
    } catch { toast.error('Failed to load employees'); }
    finally { setLoading(false); }
  }, []);

  useEffect(()=>{ load(); },[load]);

  const filtered = teachers.filter(t => {
    const q = search.toLowerCase();
    return !q || (t.user?.name||'').toLowerCase().includes(q) || (t.employeeId||'').toLowerCase().includes(q) || (t.designation||'').toLowerCase().includes(q);
  });

  const openAdd = () => { setEditForm(EMPTY_FORM); setEditOpen(true); };
  const openEdit = (t) => {
    setEditForm({
      _id:t._id, name:t.user?.name||'', email:t.user?.email||'', phone:t.user?.phone||'',
      employeeId:t.employeeId||'', designation:t.designation||'', salary:t.salary||'',
      joiningDate:t.joiningDate?t.joiningDate.split('T')[0]:new Date().toISOString().split('T')[0],
      qualification:t.qualification||'', experience:t.experience||'',
      fatherName:t.fatherName||'', gender:t.gender||'', religion:t.religion||'',
      bloodGroup:t.bloodGroup||'', dateOfBirth:t.dateOfBirth?t.dateOfBirth.split('T')[0]:'',
      nationalId:t.nationalId||'', address:t.address||'',
    });
    setEditOpen(true);
  };

  const handleSave = async (form) => {
    try {
      if (form._id) {
        await teacherAPI.update(form._id, form);
        toast.success('Employee updated!');
      } else {
        await teacherAPI.create(form);
        toast.success('Employee added!');
      }
      setEditOpen(false); load();
    } catch (e) { toast.error(e?.response?.data?.message||'Error saving'); throw e; }
  };

  const handleDelete = async (t) => {
    if (!window.confirm(`Delete ${t.user?.name}?`)) return;
    try { await teacherAPI.delete(t._id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const TABS = [
    { key:'all',    label:'All Employees' },
    { key:'add',    label:'Add New',       hide: !isAdmin },
    { key:'job',    label:'Job Letter' },
    { key:'login',  label:'Manage Login',  hide: !isAdmin },
  ];

  return (
    <div style={{ padding:'20px 28px', fontFamily:'Inter,sans-serif', minHeight:'100vh', background:'#F9FAFB' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>Employees</h1>
          <p style={{ fontSize:12, color:'#9CA3AF', margin:'3px 0 0' }}>{teachers.length} staff members</p>
        </div>
        {tab==='all' && isAdmin && (
          <button onClick={openAdd}
            style={{ padding:'9px 20px', borderRadius:10, background:'#3B5BDB', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
            + Add New
          </button>
        )}
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', borderBottom:'2px solid #E5E7EB', marginBottom:24, gap:0 }}>
        {TABS.filter(t=>!t.hide).map(t=>(
          <button key={t.key} onClick={()=>{ setTab(t.key); if(t.key==='add') openAdd(); }}
            style={{ padding:'9px 20px', border:'none', background:'transparent', fontSize:13, fontWeight:600, cursor:'pointer',
              color:tab===t.key?'#0B1F4A':'#9CA3AF',
              borderBottom:tab===t.key?'2px solid #0B1F4A':'2px solid transparent',
              marginBottom:'-2px' }}>
            {t.label}
          </button>
        ))}
      </div>

      {/* ── All Employees Tab ── */}
      {tab==='all' && (
        <>
          {/* Breadcrumb + Search */}
          <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:16 }}>Employees &nbsp;|&nbsp; 🏠 - All Employees</div>
          <div style={{ display:'flex', gap:12, alignItems:'center', marginBottom:20, flexWrap:'wrap' }}>
            <div style={{ flex:1, maxWidth:360, display:'flex', border:'1.5px solid #E5E7EB', borderRadius:10, background:'#fff', overflow:'hidden' }}>
              <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search Employee"
                style={{ flex:1, padding:'9px 14px', border:'none', outline:'none', fontSize:13 }}/>
              <div style={{ padding:'0 12px', display:'flex', alignItems:'center', color:'#9CA3AF' }}>🔍</div>
            </div>
            <button onClick={()=>setSearch('')} style={{ padding:'9px 20px', borderRadius:10, background:'#3B5BDB', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              ↻ All
            </button>
          </div>

          {loading ? <LoadingState/> : (
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(160px,1fr))', gap:14 }}>
              {filtered.map(t=>(
                <EmployeeCard key={t._id} t={t} isAdmin={isAdmin}
                  onView={setViewT} onEdit={openEdit} onDelete={handleDelete}/>
              ))}
              {/* Add New card */}
              {isAdmin && (
                <div onClick={openAdd}
                  style={{ background:'#fff', border:'2px dashed #BFDBFE', borderRadius:14, padding:'20px 16px',
                    display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', gap:8,
                    cursor:'pointer', minHeight:160, transition:'all 0.15s' }}
                  onMouseEnter={e=>e.currentTarget.style.borderColor='#3B5BDB'}
                  onMouseLeave={e=>e.currentTarget.style.borderColor='#BFDBFE'}>
                  <div style={{ fontSize:28, color:'#3B5BDB' }}>+</div>
                  <div style={{ fontSize:13, fontWeight:700, color:'#3B5BDB' }}>Add New</div>
                </div>
              )}
              {!filtered.length && !loading && (
                <EmptyState icon="👤" title="No employees found"/>
              )}
            </div>
          )}
        </>
      )}

      {/* ── Job Letter Tab ── */}
      {tab==='job' && <JobLetterTab teachers={teachers} schoolName={schoolName}/>}

      {/* ── Manage Login Tab ── */}
      {tab==='login' && <ManageLoginTab teachers={teachers}/>}

      {/* View Modal */}
      {viewT && (
        <ViewModal t={viewT} isAdmin={isAdmin} onClose={()=>setViewT(null)}
          onEdit={()=>{ openEdit(viewT); setViewT(null); }}/>
      )}

      {/* Add/Edit Modal */}
      <EditModal open={editOpen} onClose={()=>setEditOpen(false)}
        initial={editForm} onSave={handleSave}/>
    </div>
  );
}