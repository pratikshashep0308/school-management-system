/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Settings.js — Academic Year & School Settings
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { schoolAPI } from '../utils/api';

const INP = { width:'100%', padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10,
  fontSize:13, outline:'none', background:'#fff', color:'#111827', boxSizing:'border-box' };
const LBL = { fontSize:11, color:'#374151', marginBottom:5, display:'block', fontWeight:700, textTransform:'uppercase', letterSpacing:'0.3px' };

const BOARDS = ['CBSE','ICSE','State Board','IB','Other'];
const YEARS  = ['2023-24','2024-25','2025-26','2026-27','2027-28'];

export default function Settings() {
  const [form,    setForm]    = useState({ name:'', address:'', phone:'', email:'', website:'', principalName:'', establishedYear:'', board:'CBSE', academicYear:'2025-26', logo:'' });
  const [loading, setLoading] = useState(true);
  const [saving,  setSaving]  = useState(false);
  const [tab,     setTab]     = useState('general');

  useEffect(() => {
    schoolAPI.get().then(r => {
      const d = r.data.data || {};
      setForm({ name:d.name||'', address:d.address||'', phone:d.phone||'', email:d.email||'',
        website:d.website||'', principalName:d.principalName||'', establishedYear:d.establishedYear||'',
        board:d.board||'CBSE', academicYear:d.academicYear||'2025-26', logo:d.logo||'' });
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
        <div style={{ background:'#fff', borderRadius:16, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', padding:'16px 24px' }}>
            <div style={{ fontWeight:800, fontSize:15, color:'#fff' }}>🏫 School Information</div>
            <div style={{ fontSize:12, color:'rgba(255,255,255,0.5)', marginTop:2 }}>Basic details shown on receipts, ID cards and reports</div>
          </div>
          <div style={{ padding:24, display:'grid', gridTemplateColumns:'1fr 1fr', gap:16 }}>
            <div style={{ gridColumn:'span 2' }}>
              <label style={LBL}>School Name *</label>
              <input style={{ ...INP, fontSize:15, fontWeight:600 }} value={form.name} onChange={e=>set('name',e.target.value)} placeholder="The Future Step School"/>
            </div>
            <div>
              <label style={LBL}>Principal Name</label>
              <input style={INP} value={form.principalName} onChange={e=>set('principalName',e.target.value)} placeholder="Principal's full name"/>
            </div>
            <div>
              <label style={LBL}>Established Year</label>
              <input style={INP} type="number" value={form.establishedYear} onChange={e=>set('establishedYear',e.target.value)} placeholder="e.g. 1995"/>
            </div>
            <div>
              <label style={LBL}>Board / Affiliation</label>
              <select style={INP} value={form.board} onChange={e=>set('board',e.target.value)}>
                {BOARDS.map(b=><option key={b} value={b}>{b}</option>)}
              </select>
            </div>
            <div>
              <label style={LBL}>School Logo URL</label>
              <input style={INP} value={form.logo} onChange={e=>set('logo',e.target.value)} placeholder="https://... or leave blank"/>
            </div>
            <div style={{ gridColumn:'span 2' }}>
              <label style={LBL}>Address</label>
              <input style={INP} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="Full school address"/>
            </div>
          </div>
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

      {/* Save Button */}
      <div style={{ marginTop:20, display:'flex', justifyContent:'flex-end', gap:10 }}>
        <button onClick={()=>window.location.reload()} style={{ padding:'10px 24px', borderRadius:10, border:'1.5px solid #E5E7EB', background:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', color:'#374151' }}>
          ↺ Reset
        </button>
        <button onClick={save} disabled={saving}
          style={{ padding:'10px 32px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:saving?0.7:1 }}>
          {saving ? '⏳ Saving…' : '💾 Save Settings'}
        </button>
      </div>
    </div>
  );
}