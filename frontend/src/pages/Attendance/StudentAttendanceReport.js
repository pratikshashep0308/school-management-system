/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';
import DateRangePicker from './DateRangePicker';

const NOW   = new Date();
const FIRST = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

// eSkooly-style: P / A / L / E single-letter badges
const SC = {
  present: { letter:'P', color:'#166534', bg:'#DCFCE7' },
  absent:  { letter:'A', color:'#991B1B', bg:'#FEE2E2' },
  late:    { letter:'L', color:'#92400E', bg:'#FEF3C7' },
  leave:   { letter:'L', color:'#92400E', bg:'#FEF3C7' },
  excused: { letter:'E', color:'#5B21B6', bg:'#EDE9FE' },
  unmarked:{ letter:'—', color:'#6B7280', bg:'#F3F4F6' },
};

export default function StudentAttendanceReport() {
  const [dateFrom, setDateFrom] = useState(FIRST);
  const [dateTo,   setDateTo]   = useState(TODAY);
  const [classes,  setClasses]  = useState([]);
  const [rows,     setRows]     = useState([]);
  const [loading,  setLoading]  = useState(false);
  const [search,   setSearch]   = useState('');
  const [sortCol,  setSortCol]  = useState('date');
  const [sortDir,  setSortDir]  = useState('asc');

  useEffect(() => {
    classAPI.getAll()
      .then(r => setClasses(r.data.data || []))
      .catch(() => {});
  }, []);

  // Auto-load when classes are ready or date changes
  const load = useCallback(async (from, to) => {
    if (!classes.length) return;
    setLoading(true);
    try {
      const fromD = new Date(from); fromD.setHours(0,0,0,0);
      const toD   = new Date(to);   toD.setHours(23,59,59,999);

      // Collect all months in range
      const months = [];
      let cur = new Date(fromD.getFullYear(), fromD.getMonth(), 1);
      while (cur <= toD) {
        months.push({ month: cur.getMonth()+1, year: cur.getFullYear() });
        cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      }

      // Fetch analytics for ALL classes × ALL months in parallel
      const allFlat = [];
      await Promise.all(
        classes.map(async cls => {
          const className = `${cls.name} ${cls.section||''}`.trim();
          await Promise.all(
            months.map(async ({ month, year }) => {
              try {
                const r = await attendanceAPI.getClassAnalytics(cls._id, month, year);
                const data = r.data.data || r.data;
                (data.breakdown || []).forEach(entry => {
                  const name   = entry.student?.user?.name || entry.student?.name || '—';
                  const rollNo = entry.student?.rollNumber || entry.student?.admissionNumber || '—';
                  Object.entries(entry.days || {}).forEach(([day, status]) => {
                    const date = new Date(year, month-1, parseInt(day));
                    date.setHours(0,0,0,0);
                    if (date >= fromD && date <= toD) {
                      allFlat.push({
                        date,
                        dateStr: date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
                        day:     date.toLocaleDateString('en-IN', { weekday:'short' }),
                        id:      rollNo,
                        name,
                        class:   className,
                        status:  status.toLowerCase(),
                      });
                    }
                  });
                });
              } catch { /* skip failed */ }
            })
          );
        })
      );

      allFlat.sort((a,b) => a.date - b.date || a.class.localeCompare(b.class) || a.name.localeCompare(b.name));
      setRows(allFlat);
    } catch {
      toast.error('Failed to load attendance');
    } finally {
      setLoading(false);
    }
  }, [classes]);

  // Load when classes become available
  useEffect(() => {
    if (classes.length) load(dateFrom, dateTo);
  }, [classes]);

  const handleDateChange = (f, t) => {
    setDateFrom(f); setDateTo(t);
    load(f, t);
  };

  const handleSort = col => {
    if (sortCol===col) setSortDir(d=>d==='asc'?'desc':'asc');
    else { setSortCol(col); setSortDir('asc'); }
  };

  const filtered = rows
    .filter(r => {
      const q = search.toLowerCase();
      return !q || r.name.toLowerCase().includes(q) || r.id.toLowerCase().includes(q) ||
             r.status.toLowerCase().includes(q) || r.class.toLowerCase().includes(q);
    })
    .sort((a,b) => {
      const av = sortCol==='date' ? a.date : a[sortCol];
      const bv = sortCol==='date' ? b.date : b[sortCol];
      if (av < bv) return sortDir==='asc' ? -1 : 1;
      if (av > bv) return sortDir==='asc' ?  1 : -1;
      return 0;
    });

  const copyTable = () => {
    const txt = filtered.map(r=>`${r.dateStr}\t${r.day}\t${r.id}\t${r.name}\t${r.class}\t${r.status}`).join('\n');
    navigator.clipboard.writeText(txt).then(()=>toast.success('Copied'));
  };
  const toCSV = () => {
    const blob = new Blob(
      ['DATE,DAY,ID,NAME,CLASS,STATUS\n'+filtered.map(r=>`${r.dateStr},${r.day},${r.id},${r.name},${r.class},${r.status}`).join('\n')],
      {type:'text/csv'}
    );
    const a=document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='student-attendance.csv'; a.click();
  };

  const BTN = {padding:'5px 14px',borderRadius:6,border:'1px solid #D1D5DB',background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#374151'};
  const SI  = col => sortCol===col ? (sortDir==='asc'?'↑':'↓') : '↕';

  return (
    <div>
      <h2 style={{fontSize:20,fontWeight:800,color:'#111827',margin:'0 0 16px'}}>Students Attendance Record</h2>

      {/* Date Range Picker — auto-loads on Apply */}
      <div style={{marginBottom:16}}>
        <DateRangePicker from={dateFrom} to={dateTo} onChange={handleDateChange}/>
      </div>

      {/* Table card */}
      <div style={{background:'#fff',borderRadius:12,border:'1px solid #E5E7EB',overflow:'hidden'}}>

        {/* Toolbar */}
        <div style={{padding:'12px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:10,borderBottom:'1px solid #F3F4F6'}}>
          <div style={{display:'flex',gap:6}}>
            <button style={BTN} onClick={copyTable}>Copy</button>
            <button style={BTN} onClick={toCSV}>CSV</button>
            <button style={BTN} onClick={toCSV}>Excel</button>
            <button style={{...BTN,background:'#DC2626',color:'#fff',border:'none'}} onClick={()=>window.print()}>PDF</button>
            <button style={BTN} onClick={()=>window.print()}>Print</button>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:8}}>
            <span style={{fontSize:13,color:'#6B7280'}}>Search:</span>
            <input value={search} onChange={e=>setSearch(e.target.value)}
              style={{padding:'5px 10px',border:'1px solid #D1D5DB',borderRadius:6,fontSize:13,outline:'none',width:200}}
              placeholder="Name, ID, class, status…"/>
          </div>
        </div>

        {/* Table */}
        <div style={{overflowX:'auto'}}>
          <table style={{width:'100%',borderCollapse:'collapse',fontSize:13}}>
            <thead>
              <tr style={{background:'#F9FAFB',borderBottom:'2px solid #E5E7EB'}}>
                {[['date','DATE'],['day','DAY'],['id','ID'],['name','NAME'],['class','CLASS'],['status','STATUS']].map(([k,l])=>(
                  <th key={k} onClick={()=>handleSort(k)}
                    style={{padding:'11px 14px',textAlign:'left',fontSize:11,fontWeight:700,color:'#374151',textTransform:'uppercase',cursor:'pointer',userSelect:'none',whiteSpace:'nowrap'}}>
                    {l} <span style={{opacity:sortCol===k?1:0.3,fontSize:10}}>{SI(k)}</span>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#9CA3AF'}}>⏳ Loading attendance data…</td></tr>
              ) : filtered.length===0 ? (
                <tr><td colSpan={6} style={{textAlign:'center',padding:40,color:'#9CA3AF'}}>No data available in table</td></tr>
              ) : filtered.map((r,i)=>{
                const sc = SC[r.status] || SC.unmarked;
                return (
                  <tr key={i} style={{borderBottom:'1px solid #F3F4F6',background:i%2?'#FAFAFA':'#fff'}}
                    onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                    onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                    <td style={{padding:'9px 14px',color:'#374151',fontWeight:500,whiteSpace:'nowrap'}}>{r.dateStr}</td>
                    <td style={{padding:'9px 14px',color:'#6B7280'}}>{r.day}</td>
                    <td style={{padding:'9px 14px',fontFamily:'monospace',fontSize:12}}>{r.id}</td>
                    <td style={{padding:'9px 14px',fontWeight:600,color:'#111827'}}>{r.name}</td>
                    <td style={{padding:'9px 14px',color:'#374151'}}>{r.class}</td>
                    <td style={{padding:'9px 14px'}}>
                      <span style={{fontSize:11,fontWeight:700,padding:'2px 8px',borderRadius:4,background:sc.bg,color:sc.color,minWidth:20,display:'inline-block',textAlign:'center'}}>
                        {sc.letter}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {/* Footer */}
        <div style={{padding:'10px 16px',borderTop:'1px solid #F3F4F6',fontSize:12,color:'#6B7280',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span>Showing {filtered.length} of {rows.length} entries</span>
          {rows.length > 0 && (
            <span style={{display:'flex',gap:12}}>
              {Object.entries(SC).filter(([k])=>k!=='unmarked').map(([k,v])=>(
                <span key={k} style={{display:'flex',alignItems:'center',gap:4}}>
                  <span style={{fontSize:10,fontWeight:700,padding:'1px 6px',borderRadius:3,background:v.bg,color:v.color}}>{v.letter}</span>
                  <span style={{fontSize:11,color:'#6B7280',textTransform:'capitalize'}}>{k}</span>
                </span>
              ))}
            </span>
          )}
        </div>
      </div>
    </div>
  );
}