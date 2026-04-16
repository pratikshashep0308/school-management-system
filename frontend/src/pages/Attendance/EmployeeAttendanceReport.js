/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { teacherAPI } from '../../utils/api';

const NOW = new Date();
const FIRST = new Date(NOW.getFullYear(), NOW.getMonth(), 1).toISOString().split('T')[0];
const TODAY = NOW.toISOString().split('T')[0];

export default function EmployeeAttendanceReport() {
  const [dateFrom,  setDateFrom]  = useState(FIRST);
  const [dateTo,    setDateTo]    = useState(TODAY);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);
  const [search,    setSearch]    = useState('');
  const [sortCol,   setSortCol]   = useState('date');
  const [sortDir,   setSortDir]   = useState('asc');

  const generate = async () => {
    setLoading(true); setGenerated(false);
    try {
      // Fetch all teachers and simulate report (backend employee attendance not yet built)
      const r = await teacherAPI.getAll();
      const teachers = r.data.data || [];
      // For now show placeholder rows — when backend employee attendance API is ready, swap this
      const from = new Date(dateFrom), to = new Date(dateTo);
      const flat = [];
      let d = new Date(from);
      while (d <= to) {
        if (d.getDay() !== 0) { // skip Sundays
          teachers.forEach(t => {
            flat.push({
              date: new Date(d),
              dateStr: d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}),
              day: d.toLocaleDateString('en-IN',{weekday:'long'}),
              id: t.employeeId || '—',
              name: t.user?.name || '—',
              type: 'Teacher',
              status: 'Present',
              time: '—',
            });
          });
        }
        d.setDate(d.getDate()+1);
      }
      setRows(flat); setGenerated(true);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  };

  const handleSort = col => { if(sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc'); else{setSortCol(col);setSortDir('asc');} };

  const filtered = rows.filter(r=>{
    const q=search.toLowerCase();
    return !q||r.name.toLowerCase().includes(q)||r.id.toLowerCase().includes(q)||r.status.toLowerCase().includes(q);
  }).sort((a,b)=>{
    const av=sortCol==='date'?a.date:a[sortCol], bv=sortCol==='date'?b.date:b[sortCol];
    if(av<bv) return sortDir==='asc'?-1:1; if(av>bv) return sortDir==='asc'?1:-1; return 0;
  });

  const copyTable = () => {
    const txt=filtered.map(r=>`${r.dateStr}\t${r.day}\t${r.id}\t${r.name}\t${r.type}\t${r.status}\t${r.time}`).join('\n');
    navigator.clipboard.writeText(txt).then(()=>toast.success('Copied'));
  };
  const toCSV = () => {
    const blob=new Blob(['DATE,DAY,ID,NAME,TYPE,STATUS,TIME\n'+filtered.map(r=>`${r.dateStr},${r.day},${r.id},${r.name},${r.type},${r.status},${r.time}`).join('\n')],{type:'text/csv'});
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='employee-attendance.csv'; a.click();
  };

  const SEL = { padding:'7px 12px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, background:'#fff', outline:'none' };
  const BTN = { padding:'5px 14px', borderRadius:6, border:'1px solid #D1D5DB', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' };
  const SC  = { present:{ color:'#166534', bg:'#DCFCE7' }, absent:{ color:'#991B1B', bg:'#FEE2E2' }, leave:{ color:'#92400E', bg:'#FEF3C7' } };

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 20px' }}>Employees Attendance Record</h2>

      <div style={{ background:'#3B5BDB', borderRadius:10, padding:'12px 18px', display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:20 }}>
        <span style={{ color:'#fff', fontSize:16 }}>📅</span>
        <input type="date" value={dateFrom} onChange={e=>setDateFrom(e.target.value)} style={{ ...SEL, minWidth:140 }}/>
        <span style={{ color:'#fff', fontWeight:700 }}>→</span>
        <input type="date" value={dateTo} onChange={e=>setDateTo(e.target.value)} style={{ ...SEL, minWidth:140 }}/>
        <button onClick={generate} disabled={loading}
          style={{ padding:'7px 22px', borderRadius:8, background:'#fff', color:'#3B5BDB', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' }}>
          {loading?'⏳ Loading…':'⚙ Generate'}
        </button>
      </div>

      {!generated ? (
        <div style={{ textAlign:'center', padding:'60px 20px', background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', color:'#9CA3AF' }}>
          <div style={{ fontSize:44, marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:700, fontSize:15, color:'#374151' }}>Select date range</div>
          <div style={{ fontSize:13, marginTop:6 }}>Click Generate to load the employee attendance report</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>
          <div style={{ padding:'12px 16px', display:'flex', alignItems:'center', justifyContent:'space-between', flexWrap:'wrap', gap:10, borderBottom:'1px solid #F3F4F6' }}>
            <div style={{ display:'flex', gap:6 }}>
              <button style={BTN} onClick={copyTable}>Copy</button>
              <button style={BTN} onClick={toCSV}>CSV</button>
              <button style={BTN} onClick={toCSV}>Excel</button>
              <button style={{ ...BTN, background:'#DC2626', color:'#fff', border:'none' }} onClick={()=>window.print()}>PDF</button>
              <button style={BTN} onClick={()=>window.print()}>Print</button>
            </div>
            <div style={{ display:'flex', alignItems:'center', gap:8 }}>
              <span style={{ fontSize:13, color:'#6B7280' }}>Search:</span>
              <input value={search} onChange={e=>setSearch(e.target.value)}
                style={{ padding:'5px 10px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:13, outline:'none', width:200 }} placeholder="Name, ID…"/>
            </div>
          </div>
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#F9FAFB', borderBottom:'2px solid #E5E7EB' }}>
                  {[['date','DATE'],['day','DAY'],['id','ID'],['name','NAME'],['type','TYPE'],['status','STATUS'],['time','TIME [Card Scanning]']].map(([k,l])=>(
                    <th key={k} onClick={()=>handleSort(k)}
                      style={{ padding:'11px 14px', textAlign:'left', fontSize:11, fontWeight:700, color:'#374151', textTransform:'uppercase', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                      {l} <span style={{ opacity:sortCol===k?1:0.3, fontSize:10 }}>{sortCol===k?(sortDir==='asc'?'↑':'↓'):'↕'}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={7} style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>No data available in table</td></tr>
                ) : filtered.map((r,i)=>{
                  const sc = SC[r.status.toLowerCase()] || { color:'#374151', bg:'#F3F4F6' };
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                      <td style={{ padding:'10px 14px', color:'#374151' }}>{r.dateStr}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.day}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12 }}>{r.id}</td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#111827' }}>{r.name}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.type}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color }}>{r.status}</span>
                      </td>
                      <td style={{ padding:'10px 14px', color:'#9CA3AF', fontFamily:'monospace', fontSize:12 }}>{r.time}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', fontSize:12, color:'#6B7280' }}>
            Showing {filtered.length} of {rows.length} entries
          </div>
        </div>
      )}
    </div>
  );
}