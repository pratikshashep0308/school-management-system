/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';
import DateRangePicker from './DateRangePicker';

const NOW   = new Date();
const FIRST = new Date(NOW.getFullYear(), NOW.getMonth(), 1);
const TODAY = new Date(NOW.getFullYear(), NOW.getMonth(), NOW.getDate());

const SC = {
  present: { color:'#166634', bg:'#DCFCE7' },
  absent:  { color:'#991B1B', bg:'#FEE2E2' },
  leave:   { color:'#92400E', bg:'#FEF3C7' },
  late:    { color:'#92400E', bg:'#FEF3C7' },
  excused: { color:'#5B21B6', bg:'#EDE9FE' },
};

export default function StudentAttendanceReport() {
  const [dateFrom,  setDateFrom]  = useState(FIRST);
  const [dateTo,    setDateTo]    = useState(TODAY);
  const [classes,   setClasses]   = useState([]);
  const [rows,      setRows]      = useState([]);
  const [loading,   setLoading]   = useState(false);
  const [generated, setGenerated] = useState(false);
  const [search,    setSearch]    = useState('');
  const [sortCol,   setSortCol]   = useState('date');
  const [sortDir,   setSortDir]   = useState('asc');

  useEffect(() => {
    classAPI.getAll()
      .then(r => setClasses(r.data.data || []))
      .catch(() => {});
  }, []);

  const generate = async () => {
    if (!classes.length) return toast.error('No classes found');
    setLoading(true); setGenerated(false);
    try {
      const from = new Date(dateFrom); from.setHours(0,0,0,0);
      const to   = new Date(dateTo);   to.setHours(23,59,59,999);

      // Collect all months in range
      const months = [];
      let cur = new Date(from.getFullYear(), from.getMonth(), 1);
      while (cur <= to) {
        months.push({ month: cur.getMonth()+1, year: cur.getFullYear() });
        cur = new Date(cur.getFullYear(), cur.getMonth()+1, 1);
      }

      // Fetch analytics for ALL classes × ALL months in parallel
      const flat = [];
      await Promise.all(
        classes.map(async cls => {
          const className = `${cls.name} ${cls.section||''}`.trim();
          await Promise.all(
            months.map(async ({ month, year }) => {
              try {
                const r    = await attendanceAPI.getClassAnalytics(cls._id, month, year);
                const data = r.data.data || r.data;
                (data.breakdown || []).forEach(entry => {
                  const name   = entry.student?.user?.name || entry.student?.name || '—';
                  const rollNo = entry.student?.rollNumber || entry.student?.admissionNumber || '—';
                  Object.entries(entry.days || {}).forEach(([day, status]) => {
                    const date = new Date(year, month-1, parseInt(day));
                    date.setHours(0,0,0,0);
                    if (date >= from && date <= to) {
                      flat.push({
                        date,
                        dateStr: date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' }),
                        day:     date.toLocaleDateString('en-IN', { weekday:'long' }),
                        id:      rollNo,
                        name,
                        class:   className,
                        status:  status.charAt(0).toUpperCase() + status.slice(1),
                      });
                    }
                  });
                });
              } catch { /* skip failed month */ }
            })
          );
        })
      );

      flat.sort((a,b) => a.date - b.date || a.class.localeCompare(b.class) || a.name.localeCompare(b.name));
      setRows(flat); setGenerated(true);
      if (!flat.length) toast('No records found for this date range', { icon:'ℹ️' });
    } catch {
      toast.error('Failed to load report');
    } finally {
      setLoading(false);
    }
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
      if (av<bv) return sortDir==='asc'?-1:1;
      if (av>bv) return sortDir==='asc'?1:-1;
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
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob); a.download = 'student-attendance.csv'; a.click();
  };

  const BTN = { padding:'5px 14px', borderRadius:6, border:'1px solid #D1D5DB', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' };
  const SI  = col => sortCol===col ? (sortDir==='asc'?'↑':'↓') : '↕';

  return (
    <div>
      <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:'0 0 20px' }}>Students Attendance Record</h2>

      {/* Controls — same layout as Employee report */}
      <div style={{ display:'flex', alignItems:'center', gap:12, flexWrap:'wrap', marginBottom:20 }}>
        <DateRangePicker
          from={dateFrom} to={dateTo}
          onChange={(f,t) => { setDateFrom(f); setDateTo(t); }}
        />
        <button onClick={generate} disabled={loading}
          style={{ padding:'10px 22px', borderRadius:9, background:'#3B5BDB', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer', opacity:loading?0.7:1 }}>
          {loading ? '⏳ Loading…' : '⚙ Generate'}
        </button>
      </div>

      {/* Empty state */}
      {!generated ? (
        <div style={{ textAlign:'center', padding:'60px 20px', background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', color:'#9CA3AF' }}>
          <div style={{ fontSize:44, marginBottom:12 }}>📊</div>
          <div style={{ fontWeight:700, fontSize:15, color:'#374151' }}>Select date range</div>
          <div style={{ fontSize:13, marginTop:6 }}>Click Generate to load the student attendance report</div>
        </div>
      ) : (
        <div style={{ background:'#fff', borderRadius:12, border:'1px solid #E5E7EB', overflow:'hidden' }}>

          {/* Toolbar */}
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
                style={{ padding:'5px 10px', border:'1px solid #D1D5DB', borderRadius:6, fontSize:13, outline:'none', width:200 }}
                placeholder="Name, ID, class, status…"/>
            </div>
          </div>

          {/* Table */}
          <div style={{ overflowX:'auto' }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13 }}>
              <thead>
                <tr style={{ background:'#0B1F4A' }}>
                  {[['date','DATE'],['day','DAY'],['id','ID'],['name','NAME'],['class','CLASS'],['status','STATUS']].map(([k,l])=>(
                    <th key={k} onClick={()=>handleSort(k)}
                      style={{ padding:'11px 14px', textAlign:'left', fontSize:10, fontWeight:700, color:'#E2E8F0', textTransform:'uppercase', cursor:'pointer', userSelect:'none', whiteSpace:'nowrap' }}>
                      {l} <span style={{ opacity:sortCol===k?1:0.3, fontSize:9 }}>{SI(k)}</span>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.length===0 ? (
                  <tr><td colSpan={6} style={{ textAlign:'center', padding:40, color:'#9CA3AF' }}>No data available in table</td></tr>
                ) : filtered.map((r,i) => {
                  const sc = SC[r.status.toLowerCase()] || { color:'#374151', bg:'#F3F4F6' };
                  return (
                    <tr key={i} style={{ borderBottom:'1px solid #F3F4F6', background:i%2?'#FAFAFA':'#fff' }}
                      onMouseEnter={e=>e.currentTarget.style.background='#F0F7FF'}
                      onMouseLeave={e=>e.currentTarget.style.background=i%2?'#FAFAFA':'#fff'}>
                      <td style={{ padding:'10px 14px', color:'#374151', fontWeight:500 }}>{r.dateStr}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.day}</td>
                      <td style={{ padding:'10px 14px', fontFamily:'monospace', fontSize:12, color:'#374151' }}>{r.id}</td>
                      <td style={{ padding:'10px 14px', fontWeight:600, color:'#111827' }}>{r.name}</td>
                      <td style={{ padding:'10px 14px', color:'#6B7280' }}>{r.class}</td>
                      <td style={{ padding:'10px 14px' }}>
                        <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:sc.bg, color:sc.color }}>{r.status}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Footer */}
          <div style={{ padding:'10px 16px', borderTop:'1px solid #F3F4F6', fontSize:12, color:'#6B7280' }}>
            Showing {filtered.length} of {rows.length} entries
          </div>
        </div>
      )}
    </div>
  );
}