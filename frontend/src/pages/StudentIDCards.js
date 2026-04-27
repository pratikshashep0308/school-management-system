/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/StudentIDCards.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { studentAPI, classAPI } from '../utils/api';

const SCHOOL = {
  name:    'The Future Step School',
  address: 'K V P S Sanstha Bhaler',
  phone:   '+91 7006555543',
  website: 'thefuturestepschool.in'
};

const COLORS = ['#185FA5','#534AB7','#0F6E56','#993556','#BA7517','#0369A1','#7C3AED'];
function cardColor(name) { return COLORS[(name||'').charCodeAt(0) % COLORS.length]; }
function initials(name)  { return (name||'?').split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase(); }

// ── Single card HTML string (for print) ──────────────────────────────────────
function cardHTML(s) {
  const name  = s.user?.name || '—';
  const cls   = `${s.class?.name||''} ${s.class?.section||''}`.trim() || '—';
  const color = cardColor(name);
  const ini   = initials(name);
  const photo = s.user?.profileImage;
  const avatar = photo
    ? `<img src="${photo}" style="width:56px;height:68px;object-fit:cover;border-radius:6px;border:2px solid ${color}" />`
    : `<div style="width:56px;height:68px;border-radius:6px;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;border:2px solid ${color}">${ini}</div>`;

  return `
  <div style="width:252px;background:#fff;border-radius:10px;overflow:hidden;font-family:Arial,sans-serif;border:1px solid #ddd;page-break-inside:avoid;break-inside:avoid">
    <div style="background:#0B1F4A;padding:7px 10px;display:flex;align-items:center;gap:8px">
      <div style="width:30px;height:30px;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏫</div>
      <div>
        <div style="font-size:9px;font-weight:900;color:#fff;line-height:1.2">${SCHOOL.name}</div>
        <div style="font-size:7px;color:rgba(255,255,255,0.6);line-height:1.2">${SCHOOL.address}</div>
      </div>
    </div>
    <div style="padding:10px;display:flex;gap:10px;align-items:flex-start">
      <div style="flex-shrink:0">
        ${avatar}
        ${s.bloodGroup ? `<div style="text-align:center;margin-top:4px;font-size:8px;font-weight:900;color:#DC2626;background:#FEF2F2;border-radius:4px;padding:2px 4px">${s.bloodGroup}</div>` : ''}
      </div>
      <div style="flex:1;min-width:0">
        <div style="font-size:12px;font-weight:900;color:#0B1F4A;margin-bottom:5px;line-height:1.3">${name}</div>
        <div style="font-size:8px;color:#374151;margin-bottom:3px"><span style="color:#9CA3AF;font-weight:700;text-transform:uppercase;min-width:34px;display:inline-block">CLASS:</span> ${cls}</div>
        <div style="font-size:8px;color:#374151;margin-bottom:3px"><span style="color:#9CA3AF;font-weight:700;text-transform:uppercase;min-width:34px;display:inline-block">ROLL:</span> ${s.rollNumber||'—'}</div>
        <div style="font-size:8px;color:#374151;margin-bottom:3px"><span style="color:#9CA3AF;font-weight:700;text-transform:uppercase;min-width:34px;display:inline-block">ADM:</span> ${s.admissionNumber||'—'}</div>
        ${s.parentPhone||s.user?.phone ? `<div style="font-size:8px;color:#374151"><span style="color:#9CA3AF;font-weight:700;text-transform:uppercase;min-width:34px;display:inline-block">PH:</span> ${s.parentPhone||s.user?.phone}</div>` : ''}
      </div>
    </div>
    <div style="background:#0B1F4A;padding:5px 10px;display:flex;justify-content:space-between;align-items:center">
      <span style="font-size:7px;color:rgba(255,255,255,0.7)">${SCHOOL.phone}</span>
      <span style="font-size:7px;color:rgba(255,255,255,0.5);letter-spacing:0.5px">STUDENT ID</span>
    </div>
  </div>`;
}

// ── Print all cards ───────────────────────────────────────────────────────────
function printCards(students) {
  if (!students.length) return toast.error('No students to print');
  const cardsHTML = students.map(s => cardHTML(s)).join('');
  const html = `<!DOCTYPE html>
<html><head><title>Student ID Cards — ${SCHOOL.name}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { font-family:Arial,sans-serif; padding:20px; background:#f5f5f5; }
  .grid { display:grid; grid-template-columns:repeat(4,252px); gap:12px; justify-content:center; }
  h2 { text-align:center; color:#0B1F4A; margin-bottom:16px; font-size:16px; }
  p  { text-align:center; color:#666; font-size:12px; margin-bottom:16px; }
  @media print {
    body { background:#fff; padding:10px; }
    .grid { gap:8px; }
    .no-print { display:none; }
  }
</style></head>
<body>
  <div class="no-print" style="text-align:center;margin-bottom:16px">
    <button onclick="window.print()" style="padding:10px 28px;background:#0B1F4A;color:#fff;border:none;border-radius:8px;font-size:14px;font-weight:700;cursor:pointer">🖨️ Print ID Cards</button>
    <button onclick="window.close()" style="padding:10px 20px;background:#f0f0f0;color:#333;border:none;border-radius:8px;font-size:14px;margin-left:10px;cursor:pointer">✕ Close</button>
  </div>
  <h2>${SCHOOL.name}</h2>
  <p>Student ID Cards · Total: ${students.length}</p>
  <div class="grid">${cardsHTML}</div>
</body></html>`;

  const w = window.open('', '_blank', 'width=1100,height=800');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── Print single card ─────────────────────────────────────────────────────────
function printSingle(student) {
  const html = `<!DOCTYPE html>
<html><head><title>ID Card — ${student.user?.name}</title>
<style>
  * { box-sizing:border-box; margin:0; padding:0; }
  body { display:flex; flex-direction:column; align-items:center; justify-content:center; min-height:100vh; background:#f5f5f5; padding:20px; }
  .no-print { margin-bottom:16px; display:flex; gap:10px; }
  @media print { .no-print { display:none; } body { background:#fff; } }
</style></head>
<body>
  <div class="no-print">
    <button onclick="window.print()" style="padding:9px 22px;background:#0B1F4A;color:#fff;border:none;border-radius:8px;font-size:13px;font-weight:700;cursor:pointer">🖨️ Print</button>
    <button onclick="window.close()" style="padding:9px 16px;background:#f0f0f0;color:#333;border:none;border-radius:8px;font-size:13px;cursor:pointer">✕ Close</button>
  </div>
  ${cardHTML(student)}
</body></html>`;

  const w = window.open('', '_blank', 'width=400,height=400');
  w.document.open();
  w.document.write(html);
  w.document.close();
}

// ── Card Preview Component ────────────────────────────────────────────────────
function IDCardPreview({ student }) {
  const name  = student.user?.name || '—';
  const cls   = `${student.class?.name||''} ${student.class?.section||''}`.trim() || '—';
  const color = cardColor(name);
  const photo = student.user?.profileImage;

  return (
    <div style={{ width:'100%', maxWidth:280, background:'#fff', borderRadius:10, overflow:'hidden',
      boxShadow:'0 4px 16px rgba(0,0,0,0.1)', border:'1px solid #E5E7EB', fontFamily:'Arial,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#0B1F4A', padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:30, height:30, borderRadius:5, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:16, flexShrink:0 }}>🏫</div>
        <div>
          <div style={{ fontSize:9, fontWeight:900, color:'#fff', lineHeight:1.2 }}>{SCHOOL.name}</div>
          <div style={{ fontSize:7, color:'rgba(255,255,255,0.6)', lineHeight:1.2 }}>{SCHOOL.address}</div>
        </div>
      </div>
      {/* Body */}
      <div style={{ padding:10, display:'flex', gap:10, alignItems:'flex-start' }}>
        <div style={{ flexShrink:0 }}>
          {photo
            ? <img src={photo} alt={name} style={{ width:56, height:68, objectFit:'cover', borderRadius:6, border:`2px solid ${color}` }}/>
            : <div style={{ width:56, height:68, borderRadius:6, background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'#fff', border:`2px solid ${color}` }}>{initials(name)}</div>
          }
          {student.bloodGroup && <div style={{ textAlign:'center', marginTop:4, fontSize:8, fontWeight:900, color:'#DC2626', background:'#FEF2F2', borderRadius:4, padding:'2px 4px' }}>{student.bloodGroup}</div>}
        </div>
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:900, color:'#0B1F4A', marginBottom:5, lineHeight:1.3 }}>{name}</div>
          {[
            { l:'Class',  v:cls },
            { l:'Roll',   v:student.rollNumber||'—' },
            { l:'Adm',    v:student.admissionNumber||'—' },
            { l:'Ph',     v:student.parentPhone||student.user?.phone||'' },
          ].filter(r=>r.v&&r.v!=='—').map(r=>(
            <div key={r.l} style={{ display:'flex', gap:4, marginBottom:3 }}>
              <span style={{ fontSize:7, color:'#9CA3AF', fontWeight:700, minWidth:30, textTransform:'uppercase' }}>{r.l}:</span>
              <span style={{ fontSize:8, color:'#374151', fontWeight:600 }}>{r.v}</span>
            </div>
          ))}
        </div>
      </div>
      {/* Footer */}
      <div style={{ background:'#0B1F4A', padding:'5px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.7)' }}>{SCHOOL.phone}</span>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.5)', letterSpacing:'0.5px' }}>STUDENT ID</span>
      </div>
    </div>
  );
}

// ── Main Page ─────────────────────────────────────────────────────────────────
export default function StudentIDCards() {
  const [classes,  setClasses]  = useState([]);
  const [classId,  setClassId]  = useState('all');
  const [students, setStudents] = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');

  useEffect(() => { classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); }, []);

  useEffect(() => {
    setLoading(true);
    const params = classId !== 'all' ? { class: classId } : {};
    studentAPI.getAll(params)
      .then(r => setStudents(r.data.data||[]))
      .catch(() => toast.error('Failed to load students'))
      .finally(() => setLoading(false));
  }, [classId]);

  const filtered = students.filter(s => {
    const name = s.user?.name || s.name || '';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div style={{ padding:'0 0 40px' }}>
      {/* Header */}
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#0B1F4A', margin:0 }}>🪪 Student ID Cards</h2>
          <p style={{ fontSize:13, color:'#9CA3AF', marginTop:4 }}>Generate and print student ID cards</p>
        </div>
        <button onClick={() => printCards(filtered)} disabled={!filtered.length || loading}
          style={{ padding:'10px 24px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none',
            fontSize:13, fontWeight:700, cursor:'pointer', opacity:(!filtered.length||loading)?0.5:1 }}>
          🖨️ Print All ({filtered.length})
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:24, alignItems:'center' }}>
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="all">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)}
          placeholder="🔍 Search student…" style={{ ...SEL, minWidth:200 }}/>
        <span style={{ fontSize:13, color:'#6B7280' }}>{filtered.length} cards</span>
      </div>

      {/* Cards Grid */}
      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading…</div>
      ) : !filtered.length ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>
          <div style={{ fontSize:48, marginBottom:12 }}>🪪</div>
          <div style={{ fontWeight:700, fontSize:16 }}>No students found</div>
        </div>
      ) : (
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(260px,1fr))', gap:20 }}>
          {filtered.map(s => (
            <div key={s._id}>
              <IDCardPreview student={s}/>
              <div style={{ display:'flex', gap:6, marginTop:10, justifyContent:'center' }}>
                <button onClick={() => printSingle(s)}
                  style={{ padding:'5px 16px', borderRadius:7, border:'1.5px solid #0B1F4A', background:'#fff',
                    fontSize:12, fontWeight:700, cursor:'pointer', color:'#0B1F4A' }}>
                  🖨️ Print
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}