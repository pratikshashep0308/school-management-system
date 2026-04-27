/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/StudentIDCards.js
import React, { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import { studentAPI, classAPI } from '../utils/api';

const SCHOOL = { name:'The Future Step School', address:'K V P S Sanstha Bhaler', phone:'+91 7006555543', website:'thefuturestepschool.in' };

function IDCard({ student, printMode=false }) {
  const name    = student.user?.name || student.name || '—';
  const cls     = `${student.class?.name||''} ${student.class?.section||''}`.trim();
  const rollNo  = student.rollNumber || '—';
  const admNo   = student.admissionNumber || '—';
  const blood   = student.bloodGroup || '';
  const phone   = student.parentPhone || student.user?.phone || '';
  const photo   = student.user?.profileImage;
  const initials= name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
  const colors  = ['#185FA5','#534AB7','#0F6E56','#993556','#BA7517'];
  const color   = colors[name.charCodeAt(0)%colors.length];

  const size = printMode ? { width:242, minHeight:152 } : { width:'100%', maxWidth:300 };

  return (
    <div style={{ ...size, background:'#fff', borderRadius:12, overflow:'hidden', boxShadow:'0 4px 16px rgba(0,0,0,0.12)', border:'1px solid #E5E7EB', fontFamily:'Arial,sans-serif' }}>
      {/* Header */}
      <div style={{ background:'#0B1F4A', padding:'8px 10px', display:'flex', alignItems:'center', gap:8 }}>
        <div style={{ width:32, height:32, borderRadius:6, background:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>🏫</div>
        <div>
          <div style={{ fontSize:9, fontWeight:900, color:'#fff', lineHeight:1.2 }}>{SCHOOL.name}</div>
          <div style={{ fontSize:7, color:'rgba(255,255,255,0.6)', lineHeight:1.2 }}>{SCHOOL.address}</div>
        </div>
      </div>

      {/* Body */}
      <div style={{ padding:'10px', display:'flex', gap:10, alignItems:'flex-start' }}>
        {/* Photo */}
        <div style={{ flexShrink:0 }}>
          {photo ? (
            <img src={photo} alt={name} style={{ width:56, height:66, objectFit:'cover', borderRadius:6, border:`2px solid ${color}` }}/>
          ) : (
            <div style={{ width:56, height:66, borderRadius:6, background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, fontWeight:700, color:'#fff', border:`2px solid ${color}` }}>
              {initials}
            </div>
          )}
          {blood && (
            <div style={{ textAlign:'center', marginTop:4, fontSize:8, fontWeight:900, color:'#DC2626', background:'#FEF2F2', borderRadius:4, padding:'2px 4px' }}>{blood}</div>
          )}
        </div>

        {/* Info */}
        <div style={{ flex:1, minWidth:0 }}>
          <div style={{ fontSize:12, fontWeight:900, color:'#0B1F4A', marginBottom:6, lineHeight:1.3 }}>{name}</div>
          {[
            { label:'Class',    value:cls    },
            { label:'Roll No',  value:rollNo },
            { label:'Adm. No',  value:admNo  },
            { label:'Phone',    value:phone  },
          ].map(r=>r.value&&r.value!=='—'?(
            <div key={r.label} style={{ display:'flex', gap:4, marginBottom:3 }}>
              <span style={{ fontSize:7, color:'#9CA3AF', fontWeight:700, minWidth:34, textTransform:'uppercase' }}>{r.label}:</span>
              <span style={{ fontSize:8, color:'#374151', fontWeight:600, wordBreak:'break-all' }}>{r.value}</span>
            </div>
          ):null)}
        </div>
      </div>

      {/* Footer */}
      <div style={{ background:'#0B1F4A', padding:'5px 10px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.7)' }}>{SCHOOL.phone}</span>
        <span style={{ fontSize:7, color:'rgba(255,255,255,0.5)' }}>STUDENT ID</span>
      </div>
    </div>
  );
}

export default function StudentIDCards() {
  const [classes,   setClasses]   = useState([]);
  const [classId,   setClassId]   = useState('all');
  const [students,  setStudents]  = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [search,    setSearch]    = useState('');
  const printRef = useRef(null);

  useEffect(()=>{ classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); },[]);

  useEffect(()=>{
    setLoading(true);
    const params = classId !== 'all' ? { classId } : {};
    studentAPI.getAll(params).then(r=>{ setStudents(r.data.data||[]); }).catch(()=>toast.error('Failed')).finally(()=>setLoading(false));
  },[classId]);

  const filtered = students.filter(s=>{
    const name = s.user?.name||s.name||'';
    return !search || name.toLowerCase().includes(search.toLowerCase());
  });

  const printAll = () => {
    const cards = filtered.map(s => {
      const name    = s.user?.name||'—';
      const cls     = `${s.class?.name||''} ${s.class?.section||''}`.trim();
      const initials= name.split(' ').map(w=>w[0]).join('').slice(0,2).toUpperCase();
      const colors  = ['#185FA5','#534AB7','#0F6E56','#993556','#BA7517'];
      const color   = colors[name.charCodeAt(0)%colors.length];
      return `
        <div style="width:242px;border:1px solid #E5E7EB;border-radius:10px;overflow:hidden;font-family:Arial,sans-serif;break-inside:avoid">
          <div style="background:#0B1F4A;padding:7px 10px;display:flex;align-items:center;gap:8px">
            <div style="width:30px;height:30px;border-radius:5px;background:#fff;display:flex;align-items:center;justify-content:center;font-size:16px;flex-shrink:0">🏫</div>
            <div><div style="font-size:9px;font-weight:900;color:#fff">${SCHOOL.name}</div><div style="font-size:7px;color:rgba(255,255,255,0.6)">${SCHOOL.address}</div></div>
          </div>
          <div style="padding:10px;display:flex;gap:10px">
            <div style="width:56px;height:66px;border-radius:6px;background:${color};display:flex;align-items:center;justify-content:center;font-size:20px;font-weight:700;color:#fff;flex-shrink:0">${initials}</div>
            <div>
              <div style="font-size:12px;font-weight:900;color:#0B1F4A;margin-bottom:5px">${name}</div>
              <div style="font-size:8px;color:#374151;margin-bottom:3px"><b>Class:</b> ${cls}</div>
              <div style="font-size:8px;color:#374151;margin-bottom:3px"><b>Roll No:</b> ${s.rollNumber||'—'}</div>
              <div style="font-size:8px;color:#374151;margin-bottom:3px"><b>Adm No:</b> ${s.admissionNumber||'—'}</div>
              ${s.bloodGroup?`<div style="font-size:8px;color:#DC2626;font-weight:700">Blood: ${s.bloodGroup}</div>`:''}
            </div>
          </div>
          <div style="background:#0B1F4A;padding:5px 10px;display:flex;justify-content:space-between">
            <span style="font-size:7px;color:rgba(255,255,255,0.7)">${SCHOOL.phone}</span>
            <span style="font-size:7px;color:rgba(255,255,255,0.5)">STUDENT ID</span>
          </div>
        </div>`;
    }).join('');

    const html = `<!DOCTYPE html><html><head><title>Student ID Cards</title>
    <style>*{box-sizing:border-box;margin:0;padding:0}body{padding:20px}
    .grid{display:grid;grid-template-columns:repeat(4,242px);gap:12px;justify-content:center}
    @media print{body{padding:10px}.grid{gap:8px}}</style></head>
    <body><div class="grid">${cards}</div></body></html>`;
    const w = window.open('','_blank');
    w.document.write(html);
    w.document.close();
    setTimeout(()=>w.print(),500);
  };

  const SEL = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, background:'#fff', outline:'none' };

  return (
    <div>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:20, flexWrap:'wrap', gap:10 }}>
        <div>
          <h2 style={{ fontSize:20, fontWeight:800, color:'#0B1F4A', margin:0 }}>🪪 Student ID Cards</h2>
          <p style={{ fontSize:13, color:'#9CA3AF', marginTop:4 }}>Generate and print student ID cards</p>
        </div>
        <button onClick={printAll} disabled={!filtered.length}
          style={{ padding:'10px 24px', borderRadius:10, background:'#0B1F4A', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          🖨️ Print All ({filtered.length})
        </button>
      </div>

      {/* Filters */}
      <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
        <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
          <option value="all">All Classes</option>
          {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
        </select>
        <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="🔍 Search student…" style={{ ...SEL, minWidth:200 }}/>
        <span style={{ display:'flex', alignItems:'center', fontSize:13, color:'#6B7280' }}>{filtered.length} cards</span>
      </div>

      {loading ? (
        <div style={{ textAlign:'center', padding:60, color:'#9CA3AF' }}>⏳ Loading…</div>
      ) : (
        <div ref={printRef} style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(280px,1fr))', gap:16 }}>
          {filtered.map(s=>(
            <div key={s._id}>
              <IDCard student={s}/>
              <div style={{ display:'flex', gap:6, marginTop:8, justifyContent:'center' }}>
                <button onClick={()=>{
                  const w=window.open('','_blank');
                  w.document.write(`<html><body style="display:flex;justify-content:center;padding:40px"><div id="card"></div><script>window.print()</script></body></html>`);
                  w.document.close();
                }} style={{ padding:'4px 14px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, cursor:'pointer', color:'#374151' }}>
                  🖨️ Print
                </button>
              </div>
            </div>
          ))}
          {!filtered.length && (
            <div style={{ gridColumn:'span 3', textAlign:'center', padding:60, color:'#9CA3AF' }}>
              <div style={{ fontSize:48, marginBottom:12 }}>🪪</div>
              <div style={{ fontWeight:700 }}>No students found</div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}