/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Settings.js — Academic Year & School Settings
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { schoolAPI, adminAPI } from '../utils/api';

const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
  fontSize:13, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' };
const LBL = { fontSize:11, color:'#374151', marginBottom:5, display:'block', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px' };

const BOARDS = ['CBSE','ICSE','State Board','IB','Other'];
const YEARS  = ['2023-24','2024-25','2025-26','2026-27','2027-28'];

export default function Settings() {
  const [form,    setForm]    = useState({ name:'', address:'', phone:'', email:'', website:'', principalName:'', establishedYear:'', board:'State Board', academicYear:'2025-26', logo:'', country:'India', status:'Active' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState('general');

  // ── Admin management state ──
  const [admins,      setAdmins]      = useState([]);
  const [adminsLoad,  setAdminsLoad]  = useState(false);
  const [newAdmin,    setNewAdmin]    = useState({ name:'', email:'', phone:'', password:'' });
  const [creating,    setCreating]    = useState(false);

  const loadAdmins = async () => {
    setAdminsLoad(true);
    try {
      const r = await adminAPI.getAll();
      setAdmins(r.data.data || []);
    } catch { toast.error('Failed to load admins'); }
    finally { setAdminsLoad(false); }
  };

  useEffect(() => { if (tab === 'admins') loadAdmins(); }, [tab]);

  const setNA = (k,v) => setNewAdmin(a=>({...a,[k]:v}));

  const createAdmin = async () => {
    if (!newAdmin.name.trim())  return toast.error('Name is required');
    if (!newAdmin.email.trim()) return toast.error('Email is required');
    if ((newAdmin.password||'').length < 6) return toast.error('Password must be at least 6 characters');
    setCreating(true);
    try {
      await adminAPI.create(newAdmin);
      toast.success('Admin created successfully!');
      setNewAdmin({ name:'', email:'', phone:'', password:'' });
      loadAdmins();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to create admin'); }
    finally { setCreating(false); }
  };

  const toggleAdminStatus = async (a) => {
    try {
      await adminAPI.setStatus(a._id, !a.isActive);
      toast.success(a.isActive ? 'Admin deactivated' : 'Admin activated');
      loadAdmins();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to update status'); }
  };

  const editAdmin = async (a) => {
    const name  = window.prompt('Full name:', a.name || '');
    if (name === null) return;
    const email = window.prompt('Email:', a.email || '');
    if (email === null) return;
    const phone = window.prompt('Mobile:', a.phone || '');
    if (phone === null) return;
    try {
      await adminAPI.update(a._id, { name, email, phone });
      toast.success('Admin updated');
      loadAdmins();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to update admin'); }
  };

  const deleteAdmin = async (a) => {
    if (!window.confirm(`Delete admin "${a.name}"? This cannot be undone.`)) return;
    try {
      await adminAPI.delete(a._id);
      toast.success('Admin deleted');
      loadAdmins();
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to delete admin'); }
  };

  const resetAdminPassword = async (a) => {
    const pwd = window.prompt(`Enter a new password for ${a.name} (min 6 chars):`);
    if (pwd === null) return;
    if (pwd.length < 6) return toast.error('Password must be at least 6 characters');
    try {
      await adminAPI.resetPassword(a._id, pwd);
      toast.success('Password reset successfully');
    } catch(e) { toast.error(e?.response?.data?.message || 'Failed to reset password'); }
  };

  useEffect(() => {
    schoolAPI.get().then(r => {
      const d = r.data.data || {};
      // Load every field (fall back to '' so inputs stay controlled)
      const keys = ['name','shortName','schoolCode','udiseCode','affiliationNumber','board','medium','schoolType','establishedYear',
        'principalName','vicePrincipal','chairman','trustName','registrationNumber',
        'phone','altMobile','landline','email','website',
        'address','area','city','district','state','country','pincode',
        'logo','banner','principalSignature','stamp','favicon',
        'academicYear','currentSession','workingDays','weeklyOff','timeZone',
        'gstNumber','panNumber','registrationCertNumber','recognitionNumber',
        'smsSenderId','emailSenderName','whatsappNumber','emergencyContact',
        'currency','language','dateFormat','timeFormat',
        'facebook','instagram','youtube','linkedin','twitter',
        'googleMapsUrl','latitude','longitude','status'];
      const loaded = {};
      keys.forEach(k => { loaded[k] = d[k] ?? ''; });
      if (!loaded.board) loaded.board = 'State Board';
      if (!loaded.academicYear) loaded.academicYear = '2025-26';
      if (!loaded.country) loaded.country = 'India';
      if (!loaded.status) loaded.status = 'Active';
      setForm(loaded);
    }).catch(()=>toast.error('Failed to load settings')).finally(()=>setLoading(false));
  }, []);

  const set = (k,v) => setForm(f=>({...f,[k]:v}));

  const save = async () => {
    if (!form.name?.trim()) return toast.error('School name is required');
    setSaving(true);
    try {
      await schoolAPI.update(form);
      toast.success('Settings saved successfully!');
    } catch(e) { toast.error(e?.response?.data?.message||'Failed to save'); }
    finally { setSaving(false); }
  };

  const TABS = [
    { key:'general',  icon:'🏫', label:'General' },
    { key:'academic', icon:'📅', label:'Academic Year' },
    { key:'contact',  icon:'📞', label:'Contact & Info' },
    { key:'print',    icon:'🖨️', label:'Print Settings' },
    { key:'admins',   icon:'👤', label:'Admins' },
  ];

  if (loading) return <div style={{ padding:40, textAlign:'center', color:'#9CA3AF' }}>⏳ Loading settings…</div>;

  return (
    <div style={{ padding:'24px 28px', fontFamily:'Inter,sans-serif', maxWidth:900 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>⚙️ School Settings</h1>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Manage your school profile, academic year and print preferences</p>
      </div>

      {/* Tabs */}
      <div style={{ display:'flex', gap:4, background:'#F3F4F6', padding:4, borderRadius:12, marginBottom:24, width:'fit-content' }}>
        {TABS.map(t=>(
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 18px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
              background:tab===t.key?'#fff':'transparent', color:tab===t.key?'#0B1F4A':'#6B7280',
              boxShadow:tab===t.key?'0 2px 8px rgba(0,0,0,0.08)':'none' }}>
            {t.icon} {t.label}
          </button>
        ))}
      </div>

      {/* ── General Tab ── */}
      {tab==='general' && (
        <div style={{ display:'flex', flexDirection:'column', gap:16 }}>
          {[
            { icon:'🏫', title:'Basic Information', fields:[
              { k:'name', l:'School Name *', span:2, big:true },
              { k:'shortName', l:'Short Name' },
              { k:'schoolCode', l:'School Code' },
              { k:'udiseCode', l:'UDISE Code' },
              { k:'affiliationNumber', l:'Affiliation Number' },
              { k:'board', l:'Board', type:'select', opts:['CBSE','ICSE','State Board','IB','IGCSE','Other'] },
              { k:'medium', l:'Medium of Instruction' },
              { k:'schoolType', l:'School Type', type:'select', opts:['','Private','Government','Semi-Government'] },
              { k:'establishedYear', l:'Established Year', type:'number' },
            ]},
            { icon:'👔', title:'Management Details', fields:[
              { k:'principalName', l:'Principal Name' },
              { k:'vicePrincipal', l:'Vice Principal' },
              { k:'chairman', l:'Chairman / Director' },
              { k:'trustName', l:'Trust / Society Name' },
              { k:'registrationNumber', l:'School Registration Number', span:2 },
            ]},
            { icon:'📞', title:'Contact Information', fields:[
              { k:'phone', l:'Mobile Number' },
              { k:'altMobile', l:'Alternate Mobile' },
              { k:'landline', l:'Landline Number' },
              { k:'email', l:'Email Address' },
              { k:'website', l:'Website URL', span:2 },
            ]},
            { icon:'📍', title:'Address', fields:[
              { k:'address', l:'Full Address', span:2 },
              { k:'area', l:'Area / Locality' },
              { k:'city', l:'City' },
              { k:'district', l:'District' },
              { k:'state', l:'State' },
              { k:'country', l:'Country' },
              { k:'pincode', l:'PIN Code' },
            ]},
            { icon:'🎨', title:'Branding (image URLs)', fields:[
              { k:'logo', l:'School Logo URL', span:2 },
              { k:'banner', l:'School Banner URL', span:2 },
              { k:'principalSignature', l:'Principal Signature URL' },
              { k:'stamp', l:'School Stamp URL' },
              { k:'favicon', l:'Favicon URL', span:2 },
            ]},
            { icon:'📅', title:'Academic Information', fields:[
              { k:'academicYear', l:'Academic Year', type:'select', opts:YEARS },
              { k:'currentSession', l:'Current Session' },
              { k:'workingDays', l:'Working Days' },
              { k:'weeklyOff', l:'Weekly Off' },
              { k:'timeZone', l:'Time Zone' },
            ]},
            { icon:'📄', title:'Identity & Documents', fields:[
              { k:'gstNumber', l:'GST Number' },
              { k:'panNumber', l:'PAN Number' },
              { k:'registrationCertNumber', l:'Registration Certificate Number' },
              { k:'recognitionNumber', l:'Recognition Number' },
            ]},
            { icon:'💬', title:'Communication', fields:[
              { k:'smsSenderId', l:'SMS Sender ID' },
              { k:'emailSenderName', l:'Email Sender Name' },
              { k:'whatsappNumber', l:'WhatsApp Number' },
              { k:'emergencyContact', l:'Emergency Contact Number' },
            ]},
            { icon:'🌐', title:'Currency & Regional', fields:[
              { k:'currency', l:'Currency' },
              { k:'language', l:'Language' },
              { k:'dateFormat', l:'Date Format' },
              { k:'timeFormat', l:'Time Format', type:'select', opts:['12h','24h'] },
            ]},
            { icon:'📱', title:'Social Media', fields:[
              { k:'facebook', l:'Facebook' },
              { k:'instagram', l:'Instagram' },
              { k:'youtube', l:'YouTube' },
              { k:'linkedin', l:'LinkedIn' },
              { k:'twitter', l:'X (Twitter)', span:2 },
            ]},
            { icon:'🗺️', title:'Location', fields:[
              { k:'googleMapsUrl', l:'Google Maps URL', span:2 },
              { k:'latitude', l:'Latitude' },
              { k:'longitude', l:'Longitude' },
            ]},
            { icon:'⚡', title:'Status', fields:[
              { k:'status', l:'School Status', type:'select', opts:['Active','Inactive'] },
            ]},
          ].map(sec=>(
            <div key={sec.title} style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
              <div style={{ background:'#0B1F4A', padding:'13px 20px', fontWeight:800, fontSize:14, color:'#fff' }}>{sec.icon} {sec.title}</div>
              <div style={{ padding:20, display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
                {sec.fields.map(f=>(
                  <div key={f.k} style={{ gridColumn: f.span===2 ? 'span 2' : 'auto' }}>
                    <label style={LBL}>{f.l}</label>
                    {f.type==='select' ? (
                      <select style={INP} value={form[f.k]||''} onChange={e=>set(f.k,e.target.value)}>
                        {f.opts.map(o=><option key={o} value={o}>{o || '— Select —'}</option>)}
                      </select>
                    ) : (
                      <input style={f.big ? { ...INP, fontSize:15, fontWeight:600 } : INP}
                        type={f.type||'text'} value={form[f.k]||''} onChange={e=>set(f.k,e.target.value)} />
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── Academic Year Tab ── */}
      {tab==='academic' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 24px' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>📅 Academic Year Settings</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Set the current academic year — used in all reports and receipts</div>
          </div>
          <div style={{ padding:24 }}>
            {/* Current year display */}
            <div style={{ background:'#F0FDF4', border:'2px solid #86EFAC', borderRadius:14, padding:20, marginBottom:24, display:'flex', alignItems:'center', gap:16 }}>
              <div style={{ fontSize:40 }}>📅</div>
              <div>
                <div style={{ fontSize:13, color:'#166534', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.5px' }}>Current Academic Year</div>
                <div style={{ fontSize:32, fontWeight:900, color:'#0B1F4A', marginTop:4 }}>{form.academicYear || '2025-26'}</div>
              </div>
            </div>

            <div style={{ marginBottom:20 }}>
              <label style={LBL}>Select Academic Year</label>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(140px,1fr))', gap:10 }}>
                {YEARS.map(y=>(
                  <button key={y} onClick={()=>set('academicYear',y)}
                    style={{ padding:'14px', borderRadius:12, border:`2px solid ${form.academicYear===y?'#0B1F4A':'#E5E7EB'}`,
                      background:form.academicYear===y?'#0B1F4A':'#fff', color:form.academicYear===y?'#fff':'#374151',
                      fontSize:14, fontWeight:700, cursor:'pointer', transition:'all 0.15s' }}>
                    {y}
                    {form.academicYear===y && <div style={{ fontSize:10, marginTop:3, opacity:0.8 }}>● Active</div>}
                  </button>
                ))}
              </div>
            </div>

            <div style={{ background:'#FFF7ED', border:'1px solid #FED7AA', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#92400E' }}>
              ⚠️ Changing the academic year affects how fees, attendance and reports are grouped. Make sure all previous year data is finalized before switching.
            </div>
          </div>
        </div>
      )}

      {/* ── Contact Tab ── */}
      {tab==='contact' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 24px' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>📞 Contact Information</div>
          </div>
          <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div>
              <label style={LBL}>Phone Number</label>
              <input style={INP} value={form.phone} onChange={e=>set('phone',e.target.value)} placeholder="+91 7006555543"/>
            </div>
            <div>
              <label style={LBL}>Email Address</label>
              <input style={INP} type="email" value={form.email} onChange={e=>set('email',e.target.value)} placeholder="school@example.com"/>
            </div>
            <div style={{ gridColumn:'span 2' }}>
              <label style={LBL}>Website</label>
              <input style={INP} value={form.website} onChange={e=>set('website',e.target.value)} placeholder="https://yourschool.com"/>
            </div>
          </div>
        </div>
      )}

      {/* ── Print Settings Tab ── */}
      {tab==='print' && (
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 24px' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>🖨️ Print & Receipt Settings</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>These details appear on all printed receipts and documents</div>
          </div>
          <div style={{ padding:24 }}>
            {/* Preview */}
            <div style={{ border:'2px dashed #E5E7EB', borderRadius:14, padding:20, marginBottom:20, background:'#FAFAFA' }}>
              <div style={{ textAlign:'center', borderBottom:'2px solid #0B1F4A', paddingBottom:12, marginBottom:12 }}>
                {form.logo && <img src={form.logo} alt="logo" style={{ width:48, height:48, borderRadius:'50%', objectFit:'cover', margin:'0 auto 8px', display:'block' }} onError={e=>e.target.style.display='none'}/>}
                <div style={{ fontWeight:900, fontSize:16, color:'#0B1F4A' }}>{form.name || 'School Name'}</div>
                {form.address && <div style={{ fontSize:11, color:'#6B7280', marginTop:2 }}>{form.address}</div>}
                {form.phone && <div style={{ fontSize:11, color:'#6B7280' }}>{form.phone} {form.email && `· ${form.email}`}</div>}
              </div>
              <div style={{ textAlign:'center', fontSize:12, color:'#9CA3AF' }}>← Receipt / Document Header Preview →</div>
            </div>
            <div style={{ background:'#EFF6FF', borderRadius:10, padding:'12px 16px', fontSize:12, color:'#1D4ED8' }}>
              💡 Update your school name, address and phone in the <strong>General</strong> and <strong>Contact</strong> tabs to change this preview.
            </div>
          </div>
        </div>
      )}

      {/* ── Admins Tab ── */}
      {tab==='admins' && (
        <div style={{ display:'grid', gap:20 }}>
          {/* Add new admin */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ background:'#0B1F4A', padding:'16px 24px' }}>
              <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>➕ Add New Admin</div>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>New admins can log in with the email and password you set here</div>
            </div>
            <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
              <div>
                <label style={LBL}>Full Name *</label>
                <input style={INP} value={newAdmin.name} onChange={e=>setNA('name',e.target.value)} placeholder="Admin's full name"/>
              </div>
              <div>
                <label style={LBL}>Phone</label>
                <input style={INP} value={newAdmin.phone} onChange={e=>setNA('phone',e.target.value)} placeholder="+91 XXXXXXXXXX"/>
              </div>
              <div>
                <label style={LBL}>Email *</label>
                <input style={INP} type="email" value={newAdmin.email} onChange={e=>setNA('email',e.target.value)} placeholder="admin@example.com"/>
              </div>
              <div>
                <label style={LBL}>Password *</label>
                <div style={{ display:'flex', gap:6 }}>
                  <input style={{ ...INP, flex:1 }} type="text" value={newAdmin.password} onChange={e=>setNA('password',e.target.value)} placeholder="Min 6 characters"/>
                  <button type="button" onClick={()=>{
                      const chars='ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789@#$';
                      let p=''; for(let i=0;i<12;i++) p+=chars[Math.floor(Math.random()*chars.length)];
                      setNA('password',p);
                    }}
                    style={{ padding:'0 14px', borderRadius:10, border:'1.5px solid #0B1F4A', background:'#fff', color:'#0B1F4A', fontSize:12, fontWeight:700, cursor:'pointer', whiteSpace:'nowrap' }}>
                    🎲 Generate
                  </button>
                </div>
              </div>
              <div style={{ gridColumn:'span 2', display:'flex', justifyContent:'flex-end' }}>
                <button onClick={createAdmin} disabled={creating}
                  style={{ padding:'10px 28px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:creating?0.7:1 }}>
                  {creating ? '⏳ Creating…' : '➕ Create Admin'}
                </button>
              </div>
            </div>
          </div>

          {/* Existing admins list */}
          <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
            <div style={{ background:'#0B1F4A', padding:'16px 24px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>👥 Admin Accounts</div>
              <button onClick={loadAdmins} style={{ background:'rgba(255,255,255,0.15)', color:'#fff', border:'none', borderRadius:8, padding:'6px 14px', fontSize:12, fontWeight:700, cursor:'pointer' }}>↻ Refresh</button>
            </div>
            <div style={{ padding:24 }}>
              {adminsLoad ? (
                <div style={{ textAlign:'center', color:'#9CA3AF', padding:20 }}>⏳ Loading…</div>
              ) : admins.length === 0 ? (
                <div style={{ textAlign:'center', color:'#9CA3AF', padding:20 }}>No admins found</div>
              ) : (
                <div style={{ display:'grid', gap:10 }}>
                  {admins.map(a=>(
                    <div key={a._id} style={{ display:'flex', alignItems:'center', gap:14, padding:'14px 16px', border:'1px solid #E5E7EB', borderRadius:12, background:a.isActive?'#fff':'#FEF2F2' }}>
                      <div style={{ width:40, height:40, borderRadius:'50%', background:'#0B1F4A', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontWeight:800, fontSize:15, flexShrink:0 }}>
                        {a.name?.[0]?.toUpperCase() || 'A'}
                      </div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:14, color:'#0B1F4A' }}>
                          {a.name}
                          <span style={{ marginLeft:8, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:a.role==='superAdmin'?'#FEF3C7':'#DBEAFE', color:a.role==='superAdmin'?'#92400E':'#1D4ED8' }}>
                            {a.role==='superAdmin'?'SUPER ADMIN':'ADMIN'}
                          </span>
                          {!a.isActive && <span style={{ marginLeft:6, fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'#FEE2E2', color:'#B91C1C' }}>INACTIVE</span>}
                        </div>
                        <div style={{ fontSize:12, color:'#6B7280', marginTop:2, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{a.email}{a.phone?` · ${a.phone}`:''}</div>
                      </div>
                      <button onClick={()=>editAdmin(a)} style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:'#374151', flexShrink:0 }}>
                        ✎ Edit
                      </button>
                      <button onClick={()=>resetAdminPassword(a)} style={{ padding:'7px 12px', borderRadius:8, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:700, cursor:'pointer', color:'#374151', flexShrink:0 }}>
                        🔑 Reset
                      </button>
                      <button onClick={()=>toggleAdminStatus(a)} style={{ padding:'7px 12px', borderRadius:8, border:'none', background:a.isActive?'#FEE2E2':'#DCFCE7', fontSize:12, fontWeight:700, cursor:'pointer', color:a.isActive?'#B91C1C':'#166534', flexShrink:0 }}>
                        {a.isActive?'Deactivate':'Activate'}
                      </button>
                      <button onClick={()=>deleteAdmin(a)} style={{ padding:'7px 12px', borderRadius:8, border:'none', background:'#FEF2F2', fontSize:12, fontWeight:700, cursor:'pointer', color:'#DC2626', flexShrink:0 }}>
                        🗑 Delete
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Save Button — only for school-settings tabs */}
      {tab!=='admins' && (
      <div style={{ marginTop:20, display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={()=>window.location.reload()} style={{ padding:'10px 24px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
          ↺ Reset
        </button>
        <button onClick={save} disabled={saving}
          style={{ padding:'10px 32px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>
      )}
    </div>
  );
}