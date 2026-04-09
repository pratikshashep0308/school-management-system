// frontend/src/pages/Fees/FeeStructurePage.js
// Fee Structure — full Add / Edit / Delete for admin users
import React, { useState } from 'react';
import { useAuth } from '../../context/AuthContext';

const BADGE_COLORS = {
  blue:  { background:'#EBF5FB', color:'#1A3A8F' },
  gold:  { background:'#FDF3E0', color:'#7C5A0F' },
  teal:  { background:'#E0F7FB', color:'#065F69' },
  green: { background:'#D1FAE5', color:'#047857' },
  red:   { background:'#FEE2E2', color:'#B91C1C' },
};

const DEFAULT_STATIONERY = [
  { id:1, grade:'Nursery',     badge:'blue',  amount:1350 },
  { id:2, grade:'Jr. KG',      badge:'gold',  amount:1450 },
  { id:3, grade:'Sr. KG',      badge:'teal',  amount:1600 },
  { id:4, grade:'LKG',         badge:'green', amount:1650 },
  { id:5, grade:'UKG',         badge:'green', amount:1650 },
  { id:6, grade:'Grade 1',     badge:'green', amount:1650 },
  { id:7, grade:'Grade 2 – 4', badge:'green', amount:1650 },
];

const DEFAULT_TUITION = [
  { id:1, grade:'Nursery',     badge:'blue',  amount:9000  },
  { id:2, grade:'Jr. KG',      badge:'gold',  amount:9000  },
  { id:3, grade:'Sr. KG',      badge:'teal',  amount:10000 },
  { id:4, grade:'LKG',         badge:'green', amount:10500 },
  { id:5, grade:'UKG',         badge:'green', amount:11000 },
  { id:6, grade:'Grade 1',     badge:'green', amount:11000 },
  { id:7, grade:'Grade 2 – 4', badge:'green', amount:12000 },
];

const DEFAULT_BUS = [
  { id:1, dist:'Nearby Village',  desc:'Within 5 km',   amount:3000 },
  { id:2, dist:'Medium Distance', desc:'5 – 15 km',      amount:4000 },
  { id:3, dist:'Far Distance',    desc:'Above 15 km',    amount:5000 },
];

const DEFAULT_EXTRAS = [
  { id:1, label:'ID Card Fee', sub:'Charged once per year', amount:120 },
];

const INP = { padding:'7px 10px', border:'1.5px solid #3B82F6', borderRadius:7, fontSize:13, boxSizing:'border-box', outline:'none', width:'100%' };

// ── Single editable table row ─────────────────────────────────────────────────
function EditRow({ row, onSave, onDelete, isAdmin }) {
  const [editing, setEditing] = useState(false);
  const [form, setForm]       = useState({ ...row });

  const save   = () => { onSave({ ...form, amount:Number(form.amount) }); setEditing(false); };
  const cancel = () => { setForm({ ...row }); setEditing(false); };

  const name  = row.grade || row.label || '—';
  const s     = BADGE_COLORS[row.badge] || BADGE_COLORS.blue;

  if (!editing) return (
    <tr onMouseEnter={e=>e.currentTarget.style.background='#F8FAFF'} onMouseLeave={e=>e.currentTarget.style.background='#fff'}
      style={{ borderBottom:'1px solid #DDE3F0', background:'#fff', transition:'background 0.12s' }}>
      <td style={{ padding:'13px 18px' }}>
        <span style={{ ...s, fontSize:12, fontWeight:700, padding:'3px 10px', borderRadius:6, display:'inline-block' }}>{name}</span>
        {(row.sub||row.desc) && <div style={{ fontSize:11, color:'#94A3B8', marginTop:2 }}>{row.sub||row.desc}</div>}
      </td>
      <td style={{ padding:'13px 18px', textAlign:'right', fontWeight:700, color:'#0B1F4A', fontSize:15 }}>
        <span style={{ fontSize:12, opacity:0.5, marginRight:2 }}>₹</span>{Number(row.amount).toLocaleString('en-IN')}
      </td>
      {isAdmin && (
        <td style={{ padding:'13px 18px', textAlign:'right', whiteSpace:'nowrap' }}>
          <button onClick={()=>setEditing(true)} style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer', marginRight:6 }}>✏️ Edit</button>
          <button onClick={()=>onDelete(row.id)} style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>🗑 Delete</button>
        </td>
      )}
    </tr>
  );

  return (
    <tr style={{ background:'#EFF6FF', borderBottom:'1px solid #BFDBFE' }}>
      <td style={{ padding:'10px 18px' }}>
        <div style={{ display:'flex', gap:8 }}>
          <input value={form.grade||form.label||''} placeholder="Grade/Name"
            onChange={e=>setForm(p=>({...p, grade:e.target.value, label:e.target.value}))}
            style={{ ...INP, flex:2 }}/>
          {(row.sub!==undefined||row.desc!==undefined) && (
            <input value={form.sub||form.desc||''} placeholder="Description"
              onChange={e=>setForm(p=>({...p, sub:e.target.value, desc:e.target.value}))}
              style={{ ...INP, flex:2 }}/>
          )}
          {row.badge !== undefined && (
            <select value={form.badge||'blue'} onChange={e=>setForm(p=>({...p,badge:e.target.value}))} style={{ ...INP, flex:1 }}>
              {Object.keys(BADGE_COLORS).map(b=><option key={b} value={b}>{b}</option>)}
            </select>
          )}
        </div>
      </td>
      <td style={{ padding:'10px 18px' }}>
        <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))}
          style={{ ...INP, width:110, textAlign:'right' }}/>
      </td>
      {isAdmin && (
        <td style={{ padding:'10px 18px', textAlign:'right', whiteSpace:'nowrap' }}>
          <button onClick={save} style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#16A34A', border:'none', padding:'5px 12px', borderRadius:6, cursor:'pointer', marginRight:6 }}>✓ Save</button>
          <button onClick={cancel} style={{ fontSize:11, fontWeight:700, color:'#6B7280', background:'#F3F4F6', border:'none', padding:'5px 10px', borderRadius:6, cursor:'pointer' }}>✕</button>
        </td>
      )}
    </tr>
  );
}

// ── Editable fee table ────────────────────────────────────────────────────────
function FeeTable({ rows, setRows, isAdmin, hasDesc=false }) {
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ grade:'', badge:'green', amount:'', desc:'' });

  const onSave   = (updated) => setRows(p=>p.map(r=>r.id===updated.id?updated:r));
  const onDelete = (id) => { if(window.confirm('Delete this row?')) setRows(p=>p.filter(r=>r.id!==id)); };
  const onAdd    = () => {
    if (!newRow.grade.trim() || !newRow.amount) return;
    setRows(p=>[...p, { ...newRow, id:Date.now(), amount:Number(newRow.amount) }]);
    setNewRow({ grade:'', badge:'green', amount:'', desc:'' });
    setAdding(false);
  };

  return (
    <div style={{ borderRadius:14, overflow:'hidden', boxShadow:'0 2px 16px rgba(11,31,74,0.08)', marginBottom:16 }}>
      <table style={{ width:'100%', borderCollapse:'collapse', background:'#fff', fontSize:14 }}>
        <thead>
          <tr style={{ background:'#0B1F4A' }}>
            <th style={{ padding:'12px 18px', textAlign:'left', color:'#fff', fontSize:11, fontWeight:700, letterSpacing:'1.2px', textTransform:'uppercase' }}>Class / Grade</th>
            <th style={{ padding:'12px 18px', textAlign:'right', color:'#fff', fontSize:11, fontWeight:700, letterSpacing:'1.2px', textTransform:'uppercase' }}>Annual Fee</th>
            {isAdmin && <th style={{ padding:'12px 18px', textAlign:'right', color:'rgba(255,255,255,0.4)', fontSize:11, fontWeight:700, textTransform:'uppercase' }}>Actions</th>}
          </tr>
        </thead>
        <tbody>
          {rows.map(row=>(
            <EditRow key={row.id} row={row} onSave={onSave} onDelete={onDelete} isAdmin={isAdmin}/>
          ))}

          {/* Inline add form */}
          {isAdmin && adding && (
            <tr style={{ background:'#F0FDF4', borderBottom:'1px solid #BBF7D0' }}>
              <td style={{ padding:'10px 18px' }}>
                <div style={{ display:'flex', gap:8 }}>
                  <input value={newRow.grade} onChange={e=>setNewRow(p=>({...p,grade:e.target.value}))}
                    placeholder="Grade or class name" style={{ ...INP, flex:2 }}/>
                  {hasDesc && <input value={newRow.desc} onChange={e=>setNewRow(p=>({...p,desc:e.target.value}))}
                    placeholder="Description" style={{ ...INP, flex:2 }}/>}
                  <select value={newRow.badge} onChange={e=>setNewRow(p=>({...p,badge:e.target.value}))} style={{ ...INP, flex:1 }}>
                    {Object.keys(BADGE_COLORS).map(b=><option key={b} value={b}>{b}</option>)}
                  </select>
                </div>
              </td>
              <td style={{ padding:'10px 18px' }}>
                <input type="number" value={newRow.amount} onChange={e=>setNewRow(p=>({...p,amount:e.target.value}))}
                  placeholder="Amount" style={{ ...INP, width:110, textAlign:'right' }}/>
              </td>
              <td style={{ padding:'10px 18px', textAlign:'right', whiteSpace:'nowrap' }}>
                <button onClick={onAdd} style={{ fontSize:11, fontWeight:700, color:'#fff', background:'#16A34A', border:'none', padding:'5px 12px', borderRadius:6, cursor:'pointer', marginRight:6 }}>✓ Add</button>
                <button onClick={()=>setAdding(false)} style={{ fontSize:11, fontWeight:700, color:'#6B7280', background:'#F3F4F6', border:'none', padding:'5px 10px', borderRadius:6, cursor:'pointer' }}>✕</button>
              </td>
            </tr>
          )}
        </tbody>
      </table>
      {isAdmin && !adding && (
        <div style={{ padding:'10px 18px', background:'#FAFAFA', borderTop:'1px solid #E5E7EB' }}>
          <button onClick={()=>setAdding(true)} style={{ fontSize:12, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1.5px dashed #22C55E', padding:'6px 14px', borderRadius:8, cursor:'pointer' }}>
            + Add Row
          </button>
        </div>
      )}
    </div>
  );
}

// ── Bus cards with edit/delete/add ────────────────────────────────────────────
function BusCards({ rows, setRows, isAdmin }) {
  const [editId, setEditId] = useState(null);
  const [form,   setForm]   = useState({});
  const [adding, setAdding] = useState(false);
  const [newRow, setNewRow] = useState({ dist:'', desc:'', amount:'' });

  const save   = () => { setRows(p=>p.map(r=>r.id===editId?{...form,amount:Number(form.amount)}:r)); setEditId(null); };
  const del    = (id) => { if(window.confirm('Delete this route?')) setRows(p=>p.filter(r=>r.id!==id)); };
  const add    = () => { if(!newRow.dist||!newRow.amount) return; setRows(p=>[...p,{...newRow,id:Date.now(),amount:Number(newRow.amount)}]); setNewRow({dist:'',desc:'',amount:''}); setAdding(false); };

  const BG  = ['#D1FAE5','#FEF3C7','#FEE2E2','#EFF6FF','#F5F3FF'];
  const COL = ['#047857','#D97706','#DC2626','#1D4ED8','#7C3AED'];

  return (
    <div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:14, marginBottom:14 }}>
        {rows.map((b,i)=>(
          <div key={b.id} style={{ background:'#fff', borderRadius:14, padding:'20px 16px', textAlign:'center', boxShadow:'0 2px 16px rgba(11,31,74,0.08)', border:`2px solid ${BG[i%BG.length]}` }}>
            {editId===b.id ? (
              <div style={{ display:'flex', flexDirection:'column', gap:8, textAlign:'left' }}>
                <input value={form.dist} onChange={e=>setForm(p=>({...p,dist:e.target.value}))} placeholder="Route name" style={INP}/>
                <input value={form.desc} onChange={e=>setForm(p=>({...p,desc:e.target.value}))} placeholder="e.g. Within 5 km" style={INP}/>
                <input type="number" value={form.amount} onChange={e=>setForm(p=>({...p,amount:e.target.value}))} placeholder="Annual fee" style={INP}/>
                <div style={{ display:'flex', gap:6 }}>
                  <button onClick={save} style={{ flex:1, fontSize:11, fontWeight:700, color:'#fff', background:'#16A34A', border:'none', padding:'6px', borderRadius:6, cursor:'pointer' }}>✓ Save</button>
                  <button onClick={()=>setEditId(null)} style={{ flex:1, fontSize:11, fontWeight:700, color:'#6B7280', background:'#F3F4F6', border:'none', padding:'6px', borderRadius:6, cursor:'pointer' }}>✕</button>
                </div>
              </div>
            ) : (
              <>
                <div style={{ fontSize:32, marginBottom:8 }}>🚌</div>
                <div style={{ fontWeight:700, fontSize:14, color:'#0B1F4A', marginBottom:2 }}>{b.dist}</div>
                <div style={{ fontSize:11, color:'#64748B', marginBottom:10 }}>{b.desc}</div>
                <div style={{ fontSize:26, fontWeight:900, color:COL[i%COL.length] }}>
                  <sup style={{ fontSize:14 }}>₹</sup>{Number(b.amount).toLocaleString('en-IN')}
                </div>
                <div style={{ fontSize:11, color:'#94A3B8', marginTop:3 }}>per year</div>
                {isAdmin && (
                  <div style={{ display:'flex', gap:6, marginTop:10, justifyContent:'center' }}>
                    <button onClick={()=>{ setEditId(b.id); setForm({...b}); }} style={{ fontSize:11, fontWeight:700, color:'#1D4ED8', background:'#EFF6FF', border:'1px solid #BFDBFE', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>✏️ Edit</button>
                    <button onClick={()=>del(b.id)} style={{ fontSize:11, fontWeight:700, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'4px 10px', borderRadius:6, cursor:'pointer' }}>🗑 Delete</button>
                  </div>
                )}
              </>
            )}
          </div>
        ))}

        {isAdmin && adding && (
          <div style={{ background:'#F0FDF4', borderRadius:14, padding:'16px', border:'2px dashed #22C55E', display:'flex', flexDirection:'column', gap:8 }}>
            <input value={newRow.dist} onChange={e=>setNewRow(p=>({...p,dist:e.target.value}))} placeholder="Route name" style={{ ...INP, border:'1.5px solid #22C55E' }}/>
            <input value={newRow.desc} onChange={e=>setNewRow(p=>({...p,desc:e.target.value}))} placeholder="e.g. Within 5 km" style={{ ...INP, border:'1.5px solid #22C55E' }}/>
            <input type="number" value={newRow.amount} onChange={e=>setNewRow(p=>({...p,amount:e.target.value}))} placeholder="Annual fee (₹)" style={{ ...INP, border:'1.5px solid #22C55E' }}/>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={add} style={{ flex:1, fontSize:12, fontWeight:700, color:'#fff', background:'#16A34A', border:'none', padding:'7px', borderRadius:6, cursor:'pointer' }}>✓ Add Route</button>
              <button onClick={()=>setAdding(false)} style={{ flex:1, fontSize:12, fontWeight:700, color:'#6B7280', background:'#F3F4F6', border:'none', padding:'7px', borderRadius:6, cursor:'pointer' }}>✕</button>
            </div>
          </div>
        )}
      </div>

      {isAdmin && !adding && (
        <button onClick={()=>setAdding(true)} style={{ fontSize:12, fontWeight:700, color:'#16A34A', background:'#F0FDF4', border:'1.5px dashed #22C55E', padding:'8px 16px', borderRadius:8, cursor:'pointer' }}>
          + Add Bus Route
        </button>
      )}
    </div>
  );
}

// ── Main ──────────────────────────────────────────────────────────────────────
export default function FeeStructurePage() {
  const { user }  = useAuth();
  const isAdmin   = ['superAdmin','schoolAdmin','accountant'].includes(user?.role);

  const [tab,        setTab]        = useState('stationery');
  const [stationery, setStationery] = useState(DEFAULT_STATIONERY);
  const [tuition,    setTuition]    = useState(DEFAULT_TUITION);
  const [bus,        setBus]        = useState(DEFAULT_BUS);
  const [extras,     setExtras]     = useState(DEFAULT_EXTRAS);
  const [estGrade,   setEstGrade]   = useState('lkg');
  const [estBus,     setEstBus]     = useState(0);

  const TABS = [
    { key:'stationery', label:'📚 Stationery' },
    { key:'tuition',    label:'🏫 School Fee' },
    { key:'bus',        label:'🚌 Bus Fee' },
    { key:'estimator',  label:'🧮 Estimator' },
  ];

  const TAB_BTN = (key) => ({
    padding:'8px 18px', borderRadius:30, border:'1.5px solid',
    fontSize:13, fontWeight:700, cursor:'pointer', transition:'all 0.2s',
    borderColor: tab===key ? '#0B1F4A' : '#DDE3F0',
    background:  tab===key ? '#0B1F4A' : '#fff',
    color:       tab===key ? '#fff'    : '#64748B',
  });

  // Estimator calc using live state
  const gradeIdx = stationery.findIndex((_,i) => i === ['nursery','jrkg','srkg','lkg','ukg','g1','g2_4'].indexOf(estGrade));
  const tuitAmt  = tuition[gradeIdx >= 0 ? gradeIdx : 0]?.amount  || 0;
  const statAmt  = stationery[gradeIdx >= 0 ? gradeIdx : 0]?.amount || 0;
  const extAmt   = extras.reduce((s,e) => s + Number(e.amount), 0);
  const busAmt   = Number(estBus);
  const total    = tuitAmt + statAmt + extAmt + busAmt;

  const SEL = { padding:'8px 12px', border:'1.5px solid #DDE3F0', borderRadius:8, fontSize:13, background:'#fff', color:'#334155', outline:'none', cursor:'pointer' };
  const NoteBox = ({ children, color='#1A56DB' }) => (
    <div style={{ background:`${color}10`, border:`1px solid ${color}30`, borderRadius:10, padding:'12px 16px', fontSize:12.5, color:'#334155', lineHeight:1.6, marginTop:14 }}>
      {children}
    </div>
  );

  return (
    <div style={{ fontFamily:"'Nunito','Segoe UI',sans-serif" }}>

      {/* Hero */}
      <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', borderRadius:16, padding:'28px 24px', textAlign:'center', marginBottom:24, position:'relative', overflow:'hidden' }}>
        <div style={{ position:'absolute', width:200, height:200, borderRadius:'50%', background:'rgba(201,149,42,0.1)', top:-60, right:-40, pointerEvents:'none' }}/>
        <div style={{ width:60, height:60, borderRadius:'50%', background:'linear-gradient(135deg,#C9952A,#E8B44A)', display:'flex', alignItems:'center', justifyContent:'center', margin:'0 auto 12px', boxShadow:'0 0 0 6px rgba(201,149,42,0.2)', position:'relative', zIndex:1 }}>
          <img src="/school-logo.jpeg" alt="School" style={{ width:'100%', height:'100%', borderRadius:'50%', objectFit:'cover' }}
            onError={e=>{e.target.style.display='none';e.target.parentElement.innerHTML='🌟';}}/>
        </div>
        <h1 style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:'clamp(16px,4vw,24px)', fontWeight:700, color:'#fff', margin:0, position:'relative', zIndex:1 }}>The Future Step School</h1>
        <div style={{ fontSize:11, color:'rgba(255,255,255,0.45)', letterSpacing:'2px', textTransform:'uppercase', marginTop:4, position:'relative', zIndex:1 }}>Bhaler · Fee Structure · 2025–26</div>
        <div style={{ width:40, height:3, background:'#C9952A', borderRadius:2, margin:'12px auto 0', position:'relative', zIndex:1 }}/>
        {isAdmin && (
          <div style={{ marginTop:12, position:'relative', zIndex:1 }}>
            <span style={{ background:'rgba(255,255,255,0.1)', border:'1px solid rgba(255,255,255,0.2)', color:'rgba(255,255,255,0.65)', fontSize:11, padding:'4px 14px', borderRadius:20, fontWeight:600 }}>
              ✏️ Admin — You can add, edit and delete entries below
            </span>
          </div>
        )}
      </div>

      {/* Tab bar */}
      <div style={{ display:'flex', gap:8, flexWrap:'wrap', marginBottom:24 }}>
        {TABS.map(t=><button key={t.key} onClick={()=>setTab(t.key)} style={TAB_BTN(t.key)}>{t.label}</button>)}
      </div>

      {/* ── STATIONERY ── */}
      {tab==='stationery' && (
        <div>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:18 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:'#EBF5FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>📚</div>
            <div>
              <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:20, fontWeight:700, color:'#0B1F4A' }}>Stationery Fee</div>
              <div style={{ fontSize:12.5, color:'#64748B', marginTop:3, lineHeight:1.5 }}>One-time annual fee covering all learning materials provided to students.</div>
            </div>
          </div>
          <div style={{ display:'flex', flexWrap:'wrap', gap:6, marginBottom:18 }}>
            {['👕 Uniform (1 set)','🩳 Sports Dress','📓 Notebooks','📗 Books'].map(c=>(
              <span key={c} style={{ background:'#EBF5FB', color:'#1A3A8F', fontSize:11.5, fontWeight:600, padding:'4px 12px', borderRadius:20 }}>{c}</span>
            ))}
          </div>
          <FeeTable rows={stationery} setRows={setStationery} isAdmin={isAdmin} />
          <div style={{ fontWeight:700, fontSize:13, color:'#374151', margin:'16px 0 10px' }}>Additional Charges</div>
          <FeeTable rows={extras} setRows={setExtras} isAdmin={isAdmin} hasDesc />
          <NoteBox>⚠️ Fee structure may be revised. Confirm at school office before payment.</NoteBox>
        </div>
      )}

      {/* ── TUITION ── */}
      {tab==='tuition' && (
        <div>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:18 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:'#FDF3E0', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🏫</div>
            <div>
              <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:20, fontWeight:700, color:'#0B1F4A' }}>School Tuition Fee</div>
              <div style={{ fontSize:12.5, color:'#64748B', marginTop:3, lineHeight:1.5 }}>Annual tuition fee for classroom education and academic activities.</div>
            </div>
          </div>
          <FeeTable rows={tuition} setRows={setTuition} isAdmin={isAdmin} />
          <NoteBox color="#047857">ℹ️ Tuition covers all regular teaching, examinations, and school activities for the full academic year.</NoteBox>
        </div>
      )}

      {/* ── BUS ── */}
      {tab==='bus' && (
        <div>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:20 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:'#E0F7FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🚌</div>
            <div>
              <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:20, fontWeight:700, color:'#0B1F4A' }}>Bus / Transport Fee</div>
              <div style={{ fontSize:12.5, color:'#64748B', marginTop:3, lineHeight:1.5 }}>Annual transport fee based on distance from school.</div>
            </div>
          </div>
          <BusCards rows={bus} setRows={setBus} isAdmin={isAdmin} />
          <NoteBox color="#0891B2">🗺️ Distance slab will be confirmed by school administration at time of admission.</NoteBox>
        </div>
      )}

      {/* ── ESTIMATOR ── */}
      {tab==='estimator' && (
        <div>
          <div style={{ display:'flex', gap:14, alignItems:'flex-start', marginBottom:20 }}>
            <div style={{ width:46, height:46, borderRadius:12, background:'#EBF5FB', display:'flex', alignItems:'center', justifyContent:'center', fontSize:22, flexShrink:0 }}>🧮</div>
            <div>
              <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:20, fontWeight:700, color:'#0B1F4A' }}>Fee Estimator</div>
              <div style={{ fontSize:12.5, color:'#64748B', marginTop:3 }}>Select class and bus option to calculate total annual fee.</div>
            </div>
          </div>

          <div style={{ background:'#fff', borderRadius:14, overflow:'hidden', boxShadow:'0 2px 16px rgba(11,31,74,0.08)' }}>
            <div style={{ background:'#0B1F4A', padding:'14px 20px', fontSize:13, fontWeight:700, color:'#fff' }}>Calculate Total Fees</div>

            {[
              { label:'📚 Stationery Fee', sel:<select value={estGrade} onChange={e=>setEstGrade(e.target.value)} style={SEL}>{stationery.map((r,i)=><option key={r.id} value={['nursery','jrkg','srkg','lkg','ukg','g1','g2_4'][i]||`g${i}`}>{r.grade}</option>)}</select>, val:`₹ ${statAmt.toLocaleString('en-IN')}` },
              { label:'🏫 Tuition Fee',    sel:null, val:`₹ ${tuitAmt.toLocaleString('en-IN')}` },
              { label:'📋 Extra Charges',  sel:null, val:`₹ ${extAmt.toLocaleString('en-IN')}` },
              { label:'🚌 Bus Fee',        sel:<select value={estBus} onChange={e=>setEstBus(e.target.value)} style={SEL}><option value={0}>No Bus</option>{bus.map(b=><option key={b.id} value={b.amount}>{b.dist} – ₹{Number(b.amount).toLocaleString('en-IN')}</option>)}</select>, val:`₹ ${busAmt.toLocaleString('en-IN')}` },
            ].map((row,i)=>(
              <div key={i} style={{ display:'grid', gridTemplateColumns:'1fr auto auto', alignItems:'center', gap:12, padding:'13px 20px', borderBottom:'1px solid #F1F5F9' }}>
                <div style={{ fontSize:13.5, color:'#334155', fontWeight:500 }}>{row.label}</div>
                <div>{row.sel||null}</div>
                <div style={{ fontSize:14, fontWeight:700, color:'#0B1F4A', textAlign:'right', minWidth:100 }}>{row.val}</div>
              </div>
            ))}

            <div style={{ background:'linear-gradient(135deg,#0B1F4A,#162D6A)', padding:'18px 20px', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
              <div style={{ fontSize:12, color:'rgba(255,255,255,0.55)', fontWeight:600, textTransform:'uppercase', letterSpacing:'0.5px' }}>Estimated Annual Total</div>
              <div style={{ fontFamily:"'Merriweather',Georgia,serif", fontSize:28, fontWeight:700, color:'#F6D57A' }}>
                <sup style={{ fontSize:14 }}>₹</sup>{total.toLocaleString('en-IN')}
              </div>
            </div>
          </div>

          <div style={{ background:'#F0F9FF', border:'1px solid #BAE6FD', borderRadius:12, padding:'14px 18px', marginTop:14 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#0284C7', marginBottom:8, textTransform:'uppercase', letterSpacing:'0.5px' }}>Monthly Equivalent</div>
            <div style={{ display:'flex', gap:20, flexWrap:'wrap' }}>
              {[10,12].map(m=>(
                <div key={m}>
                  <div style={{ fontSize:20, fontWeight:900, color:'#0B1F4A' }}>₹{Math.round(total/m).toLocaleString('en-IN')}</div>
                  <div style={{ fontSize:11, color:'#64748B' }}>per month ({m} months)</div>
                </div>
              ))}
            </div>
          </div>
          <NoteBox>ℹ️ This is an estimate. Final fees will be communicated by the school office.</NoteBox>
        </div>
      )}

      <div style={{ textAlign:'center', marginTop:24, paddingTop:16, borderTop:'1px solid #E5E7EB', fontSize:12, color:'#94A3B8' }}>
        <strong style={{ color:'#334155' }}>The Future Step School, Bhaler</strong> &nbsp;·&nbsp; Fee Structure 2025–26
      </div>
    </div>
  );
}