// frontend/src/pages/Reports/AttendanceMonitor.jsx
//
// Attendance Monitoring — which classes have taken attendance and which have
// not, for today, recent days, and monthly periods. Part of the Reports module;
// reuses the existing attendance backend (AttendanceSubmission is the source of
// truth) via attendanceAPI.monitor* endpoints. No new attendance logic here.
//
// Sections (internal tabs, not new sidebar items):
//   • Dashboard cards (clickable → open the matching report)
//   • Daily status  • Recent days  • Monthly monitoring  • Class-wise history
//
// Exports: CSV (server) + Print/PDF (browser print of the current view).

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI } from '../../utils/api';
import { LoadingState, EmptyState } from '../../components/ui';

const CARD = { background:'#fff', border:'1px solid #E5E7EB', borderRadius:14, padding:20 };
const INP  = { padding:'8px 12px', border:'1.5px solid #E5E7EB', borderRadius:9, fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box' };
const LBL  = { display:'block', fontSize:10.5, fontWeight:700, color:'#6B7280', textTransform:'uppercase', letterSpacing:'0.05em', marginBottom:5 };
const BTN  = { padding:'8px 16px', borderRadius:9, fontSize:13, fontWeight:700, border:'none', cursor:'pointer', background:'#F97316', color:'#fff' };
const GHOST= { ...BTN, background:'#fff', color:'#374151', border:'1.5px solid #E5E7EB' };

const todayISO = () => new Date().toISOString().slice(0, 10);
const fmtDate = (iso) => iso ? new Date(iso + (iso.length === 10 ? 'T00:00:00' : '')).toLocaleDateString('en-GB', { day:'2-digit', month:'short' }) : '—';
const fmtDateTime = (d) => d ? new Date(d).toLocaleString('en-GB', { day:'2-digit', month:'short', hour:'2-digit', minute:'2-digit' }) : '—';

function TakenBadge({ taken, label }) {
  return (
    <span style={{ fontSize:11, fontWeight:800, padding:'3px 10px', borderRadius:20,
      color: taken ? '#065F46' : '#991B1B', background: taken ? '#D1FAE5' : '#FEE2E2' }}>
      {label || (taken ? 'Taken' : 'Not Taken')}
    </span>
  );
}

function Progress({ pct }) {
  const tint = pct >= 90 ? '#059669' : pct >= 60 ? '#D97706' : '#DC2626';
  return (
    <div style={{ display:'flex', alignItems:'center', gap:8, minWidth:120 }}>
      <div style={{ flex:1, background:'#F3F4F6', borderRadius:6, height:8, overflow:'hidden' }}>
        <div style={{ width:`${Math.min(pct, 100)}%`, background:tint, height:'100%' }} />
      </div>
      <span style={{ fontSize:12, fontWeight:700, color:tint, minWidth:42, textAlign:'right' }}>{pct}%</span>
    </div>
  );
}

function printView(title, headHtml, tableHtml) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Please allow pop-ups to print'); return; }
  w.document.write(`<html><head><title>${title}</title><style>
    *{font-family:Arial,Helvetica,sans-serif;} h1{font-size:18px;margin:0 0 4px;}
    .sub{color:#555;font-size:12px;margin-bottom:14px;}
    table{width:100%;border-collapse:collapse;font-size:12px;} th,td{border:1px solid #999;padding:5px 8px;text-align:left;}
    th{background:#f0f0f0;} .taken{color:#065F46;font-weight:bold;} .not{color:#991B1B;font-weight:bold;}
    @media print{.noprint{display:none;}} .noprint{margin-bottom:12px;} button{padding:6px 14px;cursor:pointer;}
  </style></head><body><div class="noprint"><button onclick="window.print()">🖨 Print / Save as PDF</button></div>
  <h1>${title}</h1><div class="sub">${headHtml}</div>${tableHtml}</body></html>`);
  w.document.close();
}

async function downloadCsv(params) {
  try {
    const res = await attendanceAPI.monitorExportCsv(params);
    const url = window.URL.createObjectURL(new Blob([res.data]));
    const a = document.createElement('a');
    a.href = url;
    a.download = `attendance-${params.report}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    window.URL.revokeObjectURL(url);
  } catch { toast.error('Export failed'); }
}

// ═══════════════════════════════════════════════════════ DASHBOARD CARDS ══════
function DashboardCards({ onOpen }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      try { const r = await attendanceAPI.monitorDashboard(); setData(r.data.data); }
      catch { toast.error('Failed to load summary'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) return <LoadingState rows={2} />;
  if (!data) return null;

  const cards = [
    { key:'total',   label:'Total Classes',            value:data.totalClasses,        tint:'#3B82F6', go:() => onOpen('daily') },
    { key:'taken',   label:'Attendance Taken Today',   value:data.takenToday,          tint:'#059669', go:() => onOpen('daily') },
    { key:'pending', label:'Attendance Pending Today', value:data.pendingToday,        tint:'#DC2626', go:() => onOpen('daily') },
    { key:'missing', label:'Classes With Missing (mo.)',value:data.classesWithMissing, tint:'#D97706', go:() => onOpen('monthly') },
    { key:'compl',   label:'Monthly Completion',       value:`${data.monthlyCompletionPct}%`, tint:'#7C3AED', go:() => onOpen('monthly') },
  ];

  return (
    <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit,minmax(180px,1fr))', gap:12, marginBottom:8 }}>
      {cards.map(c => (
        <button key={c.key} onClick={c.go}
          style={{ ...CARD, textAlign:'left', cursor:'pointer', display:'flex', flexDirection:'column', gap:4, transition:'box-shadow .15s, transform .15s' }}
          onMouseEnter={e=>{ e.currentTarget.style.boxShadow='0 8px 22px rgba(17,24,39,0.10)'; e.currentTarget.style.transform='translateY(-2px)'; }}
          onMouseLeave={e=>{ e.currentTarget.style.boxShadow='none'; e.currentTarget.style.transform='none'; }}>
          <span style={{ fontSize:28, fontWeight:900, color:c.tint, lineHeight:1 }}>{c.value}</span>
          <span style={{ fontSize:12.5, color:'#6B7280', fontWeight:600 }}>{c.label}</span>
        </button>
      ))}
      {data.nonInstructionalToday && (
        <div style={{ ...CARD, gridColumn:'1/-1', background:'#FEF9C3', border:'1px solid #FDE68A', color:'#854D0E', fontSize:13, fontWeight:600 }}>
          📅 Today is a non-instructional day (holiday / weekend / break) — attendance is not expected.
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ DAILY ═══════════
function DailyReport() {
  const [date, setDate] = useState(todayISO());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');

  const load = useCallback(async (d) => {
    setLoading(true);
    try { const r = await attendanceAPI.monitorDaily({ date:d }); setData(r.data.data); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, []);
  useEffect(() => { load(date); }, [date, load]);

  const rows = (data?.classes || []).filter(r =>
    !search || `${r.className} ${r.section} ${r.classTeacher}`.toLowerCase().includes(search.toLowerCase()));

  const print = () => {
    if (!data) return;
    const body = rows.map(r => `<tr><td>${r.className} ${r.section}</td><td>${r.totalStudents}</td>
      <td class="${r.taken?'taken':'not'}">${r.taken?'Taken':'Not Taken'}</td><td>${r.present}</td><td>${r.absent}</td>
      <td>${r.markedBy||'—'}</td><td>${r.markedAt?fmtDateTime(r.markedAt):'—'}</td></tr>`).join('');
    printView('Daily Attendance Status', `Date: ${fmtDate(data.date)} · ${data.summary.taken}/${data.summary.totalClasses} taken (${data.summary.completionPct}%)`,
      `<table><thead><tr><th>Class</th><th>Students</th><th>Status</th><th>Present</th><th>Absent</th><th>Marked By</th><th>Marked At</th></tr></thead><tbody>${body}</tbody></table>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom:16, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={LBL}>Date</label><input type="date" value={date} onChange={e=>setDate(e.target.value)} style={INP}/></div>
        <div style={{ flex:1, minWidth:160 }}><label style={LBL}>Search class / teacher</label>
          <input value={search} onChange={e=>setSearch(e.target.value)} placeholder="Search…" style={{ ...INP, width:'100%' }}/></div>
        {data && <>
          <button style={GHOST} onClick={print}>🖨 PDF</button>
          <button style={GHOST} onClick={()=>downloadCsv({ report:'daily', date })}>⬇ CSV</button>
        </>}
      </div>

      {data && (
        <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          {[['Total Classes', data.summary.totalClasses, '#3B82F6'], ['Completed', data.summary.taken, '#059669'], ['Pending', data.summary.pending, '#DC2626']].map(([l,v,t]) => (
            <div key={l} style={{ ...CARD, padding:'12px 20px', flex:1, minWidth:130 }}>
              <div style={{ fontSize:24, fontWeight:900, color:t }}>{v}</div>
              <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>{l}</div>
            </div>
          ))}
          <div style={{ ...CARD, padding:'12px 20px', flex:2, minWidth:180, display:'flex', flexDirection:'column', justifyContent:'center', gap:6 }}>
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>Completion</div>
            <Progress pct={data.summary.completionPct} />
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : !data || !rows.length ? (
        <EmptyState icon="📅" title="No classes" subtitle="No class data for this date" />
      ) : data.nonInstructional ? (
        <div style={{ ...CARD, background:'#FEF9C3', border:'1px solid #FDE68A', color:'#854D0E', marginBottom:12, fontWeight:600 }}>
          📅 {fmtDate(data.date)} is a non-instructional day{data.nonInstructionalReason ? ` (${data.nonInstructionalReason})` : ''}. Attendance is not expected.
        </div>
      ) : null}

      {!loading && rows.length > 0 && (
        <div style={{ ...CARD, overflowX:'auto', padding:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720 }}>
            <thead><tr>{['Class', 'Students', 'Status', 'Present', 'Absent', 'Marked By', 'Marked At'].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'11px 14px', borderBottom:'2px solid #E5E7EB', fontSize:11, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {rows.map(r => (
                <tr key={r.classId} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{r.className} {r.section}
                    {r.classTeacher && <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:400 }}>{r.classTeacher}</div>}</td>
                  <td style={{ padding:'10px 14px' }}>{r.totalStudents}</td>
                  <td style={{ padding:'10px 14px' }}><TakenBadge taken={r.taken} /></td>
                  <td style={{ padding:'10px 14px', color:'#059669', fontWeight:600 }}>{r.taken ? r.present : '—'}</td>
                  <td style={{ padding:'10px 14px', color:'#DC2626', fontWeight:600 }}>{r.taken ? r.absent : '—'}</td>
                  <td style={{ padding:'10px 14px' }}>{r.markedBy || '—'}</td>
                  <td style={{ padding:'10px 14px', color:'#6B7280' }}>{fmtDateTime(r.markedAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ RECENT ══════════
function RecentReport() {
  const [mode, setMode] = useState('7');
  const [range, setRange] = useState({ from:'', to:'' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = mode === 'custom' && range.from && range.to ? { from:range.from, to:range.to } : { days:mode };
      const r = await attendanceAPI.monitorRecent(params);
      setData(r.data.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [mode, range]);
  useEffect(() => { if (mode !== 'custom' || (range.from && range.to)) load(); }, [mode, range, load]);

  const print = () => {
    if (!data) return;
    const head = `<tr><th>Class</th>${data.dates.map(d=>`<th>${fmtDate(d)}</th>`).join('')}</tr>`;
    const body = data.classes.map(g => `<tr><td>${g.className} ${g.section}</td>${g.cells.map(c=>`<td class="${c.taken?'taken':'not'}">${c.taken?'✓':'✗'}</td>`).join('')}</tr>`).join('');
    printView('Recent Days Attendance', `${fmtDate(data.from)} – ${fmtDate(data.to)} · ${data.summary.completionPct}% complete`,
      `<table><thead>${head}</thead><tbody>${body}</tbody></table>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom:16, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={LBL}>Window</label>
          <select value={mode} onChange={e=>setMode(e.target.value)} style={INP}>
            <option value="7">Last 7 days</option><option value="15">Last 15 days</option>
            <option value="30">Last 30 days</option><option value="custom">Custom range</option>
          </select>
        </div>
        {mode === 'custom' && <>
          <div><label style={LBL}>From</label><input type="date" value={range.from} onChange={e=>setRange({ ...range, from:e.target.value })} style={INP}/></div>
          <div><label style={LBL}>To</label><input type="date" value={range.to} onChange={e=>setRange({ ...range, to:e.target.value })} style={INP}/></div>
        </>}
        {data && <>
          <button style={GHOST} onClick={print}>🖨 PDF</button>
          <button style={GHOST} onClick={()=>downloadCsv(mode==='custom'?{ report:'recent', from:range.from, to:range.to }:{ report:'recent', days:mode })}>⬇ CSV</button>
        </>}
      </div>

      {data && (
        <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          {[['Classes', data.summary.totalClasses, '#3B82F6'], ['Working Days', data.summary.workingDays, '#6366F1'], ['Completed', data.summary.completed, '#059669'], ['Pending', data.summary.pending, '#DC2626']].map(([l,v,t]) => (
            <div key={l} style={{ ...CARD, padding:'12px 18px', flex:1, minWidth:110 }}>
              <div style={{ fontSize:22, fontWeight:900, color:t }}>{v}</div>
              <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>{l}</div>
            </div>
          ))}
          <div style={{ ...CARD, padding:'12px 18px', flex:2, minWidth:170, display:'flex', flexDirection:'column', justifyContent:'center', gap:6 }}>
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>Overall Completion</div>
            <Progress pct={data.summary.completionPct} />
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : !data || !data.classes.length ? (
        <EmptyState icon="🗓" title="No data" subtitle="No classes or working days in this window" />
      ) : (
        <div style={{ ...CARD, overflowX:'auto', padding:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:640 }}>
            <thead><tr>
              <th style={{ textAlign:'left', padding:'11px 14px', borderBottom:'2px solid #E5E7EB', fontSize:11, color:'#6B7280', textTransform:'uppercase', position:'sticky', left:0, background:'#fff' }}>Class</th>
              {data.dates.map(d => <th key={d} style={{ textAlign:'center', padding:'11px 8px', borderBottom:'2px solid #E5E7EB', fontSize:11, color:'#6B7280' }}>{fmtDate(d)}</th>)}
            </tr></thead>
            <tbody>
              {data.classes.map(g => (
                <tr key={g.classId} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'9px 14px', fontWeight:600, position:'sticky', left:0, background:'#fff' }}>{g.className} {g.section}</td>
                  {g.cells.map(c => (
                    <td key={c.date} style={{ textAlign:'center', padding:'9px 8px' }} title={`${fmtDate(c.date)}: ${c.taken?'Taken':'Not Taken'}`}>
                      <span style={{ display:'inline-block', width:20, height:20, lineHeight:'20px', borderRadius:6, fontSize:12, fontWeight:800,
                        color: c.taken ? '#065F46' : '#991B1B', background: c.taken ? '#D1FAE5' : '#FEE2E2' }}>{c.taken ? '✓' : '✗'}</span>
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════ MONTHLY ═════════
function MonthlyReport({ onOpenClass }) {
  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try { const r = await attendanceAPI.monitorMonthly({ month, year }); setData(r.data.data); }
    catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [month, year]);
  useEffect(() => { load(); }, [load]);

  const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
  const years = [now.getFullYear(), now.getFullYear() - 1, now.getFullYear() - 2];

  const print = () => {
    if (!data) return;
    const body = data.classes.map(r => `<tr><td>${r.className} ${r.section}</td><td>${r.workingDays}</td>
      <td>${r.daysTaken}</td><td class="not">${r.daysMissing}</td><td>${r.completionPct}%</td>
      <td>${r.missingDates.map(fmtDate).join(', ')||'—'}</td></tr>`).join('');
    printView('Monthly Attendance Monitoring', `${MONTHS[month-1]} ${year} · ${data.workingDays} working days · ${data.summary.completionPct}% overall`,
      `<table><thead><tr><th>Class</th><th>Working Days</th><th>Taken</th><th>Missing</th><th>Completion</th><th>Missing Dates</th></tr></thead><tbody>${body}</tbody></table>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom:16, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div><label style={LBL}>Month</label>
          <select value={month} onChange={e=>setMonth(Number(e.target.value))} style={INP}>
            {MONTHS.map((m,i) => <option key={m} value={i+1}>{m}</option>)}
          </select></div>
        <div><label style={LBL}>Academic Year</label>
          <select value={year} onChange={e=>setYear(Number(e.target.value))} style={INP}>
            {years.map(y => <option key={y} value={y}>{y}</option>)}
          </select></div>
        {data && <>
          <button style={GHOST} onClick={print}>🖨 PDF</button>
          <button style={GHOST} onClick={()=>downloadCsv({ report:'monthly', month, year })}>⬇ CSV</button>
        </>}
      </div>

      {data && (
        <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
          {[['Classes', data.summary.totalClasses, '#3B82F6'], ['Working Days', data.workingDays, '#6366F1'], ['Fully Complete', data.summary.fullyComplete, '#059669'], ['With Missing', data.summary.withMissing, '#D97706']].map(([l,v,t]) => (
            <div key={l} style={{ ...CARD, padding:'12px 18px', flex:1, minWidth:120 }}>
              <div style={{ fontSize:22, fontWeight:900, color:t }}>{v}</div>
              <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>{l}</div>
            </div>
          ))}
          <div style={{ ...CARD, padding:'12px 18px', flex:2, minWidth:170, display:'flex', flexDirection:'column', justifyContent:'center', gap:6 }}>
            <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>Overall Completion</div>
            <Progress pct={data.summary.completionPct} />
          </div>
        </div>
      )}

      {loading ? <LoadingState /> : !data || !data.classes.length ? (
        <EmptyState icon="📆" title="No data" subtitle="No classes or working days this month" />
      ) : (
        <div style={{ ...CARD, overflowX:'auto', padding:0 }}>
          <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:720 }}>
            <thead><tr>{['Class', 'Working Days', 'Taken', 'Missing', 'Completion', 'Missing Dates', ''].map(h => (
              <th key={h} style={{ textAlign:'left', padding:'11px 14px', borderBottom:'2px solid #E5E7EB', fontSize:11, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {data.classes.map(r => (
                <tr key={r.classId} style={{ borderBottom:'1px solid #F3F4F6' }}>
                  <td style={{ padding:'10px 14px', fontWeight:600 }}>{r.className} {r.section}</td>
                  <td style={{ padding:'10px 14px' }}>{r.workingDays}</td>
                  <td style={{ padding:'10px 14px', color:'#059669', fontWeight:600 }}>{r.daysTaken}</td>
                  <td style={{ padding:'10px 14px', color:r.daysMissing?'#DC2626':'#9CA3AF', fontWeight:600 }}>{r.daysMissing}</td>
                  <td style={{ padding:'10px 14px', minWidth:130 }}><Progress pct={r.completionPct} /></td>
                  <td style={{ padding:'10px 14px', fontSize:12, color:'#6B7280', maxWidth:220 }}>
                    {r.missingDates.length ? r.missingDates.slice(0, 6).map(fmtDate).join(', ') + (r.missingDates.length > 6 ? ` +${r.missingDates.length - 6}` : '') : '—'}
                  </td>
                  <td style={{ padding:'8px 14px' }}>
                    <button onClick={()=>onOpenClass(r.classId)} style={{ ...GHOST, padding:'5px 10px', fontSize:12 }}>History →</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════ CLASS HISTORY ═══════
function ClassHistoryReport({ classes, initialClassId }) {
  const [classId, setClassId] = useState(initialClassId || '');
  const [range, setRange] = useState({ from:'', to:'' });
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    if (!classId) { setData(null); return; }
    setLoading(true);
    try {
      const params = { classId };
      if (range.from && range.to) { params.from = range.from; params.to = range.to; }
      const r = await attendanceAPI.monitorClassHistory(params);
      setData(r.data.data);
    } catch { toast.error('Failed to load'); }
    finally { setLoading(false); }
  }, [classId, range]);
  useEffect(() => { load(); }, [load]);

  return (
    <div>
      <div style={{ ...CARD, marginBottom:16, display:'flex', gap:12, alignItems:'flex-end', flexWrap:'wrap' }}>
        <div style={{ minWidth:200 }}><label style={LBL}>Class</label>
          <select value={classId} onChange={e=>setClassId(e.target.value)} style={{ ...INP, width:'100%' }}>
            <option value="">Select a class…</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
          </select></div>
        <div><label style={LBL}>From</label><input type="date" value={range.from} onChange={e=>setRange({ ...range, from:e.target.value })} style={INP}/></div>
        <div><label style={LBL}>To</label><input type="date" value={range.to} onChange={e=>setRange({ ...range, to:e.target.value })} style={INP}/></div>
      </div>

      {loading ? <LoadingState /> : !classId ? (
        <EmptyState icon="🔍" title="Class-wise history" subtitle="Choose a class to see its attendance-taking history and missing dates" />
      ) : !data ? null : (
        <>
          <div style={{ display:'flex', gap:12, marginBottom:16, flexWrap:'wrap' }}>
            {[['Working Days', data.summary.workingDays, '#6366F1'], ['Taken', data.summary.taken, '#059669'], ['Missing', data.summary.missing, '#DC2626']].map(([l,v,t]) => (
              <div key={l} style={{ ...CARD, padding:'12px 18px', flex:1, minWidth:120 }}>
                <div style={{ fontSize:22, fontWeight:900, color:t }}>{v}</div>
                <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>{l}</div>
              </div>
            ))}
            <div style={{ ...CARD, padding:'12px 18px', flex:2, minWidth:170, display:'flex', flexDirection:'column', justifyContent:'center', gap:6 }}>
              <div style={{ fontSize:12, color:'#6B7280', fontWeight:600 }}>Completion — {data.className} {data.section}</div>
              <Progress pct={data.summary.completionPct} />
            </div>
          </div>

          <div style={{ ...CARD, overflowX:'auto', padding:0 }}>
            <table style={{ width:'100%', borderCollapse:'collapse', fontSize:13, minWidth:560 }}>
              <thead><tr>{['Date', 'Status', 'Marked By', 'Marked At'].map(h => (
                <th key={h} style={{ textAlign:'left', padding:'11px 14px', borderBottom:'2px solid #E5E7EB', fontSize:11, color:'#6B7280', textTransform:'uppercase' }}>{h}</th>
              ))}</tr></thead>
              <tbody>
                {data.history.map(h => (
                  <tr key={h.date} style={{ borderBottom:'1px solid #F3F4F6' }}>
                    <td style={{ padding:'10px 14px', fontWeight:600 }}>{fmtDate(h.date)}</td>
                    <td style={{ padding:'10px 14px' }}><TakenBadge taken={h.taken} /></td>
                    <td style={{ padding:'10px 14px' }}>{h.markedBy || '—'}</td>
                    <td style={{ padding:'10px 14px', color:'#6B7280' }}>{fmtDateTime(h.markedAt)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════ MAIN ════════
export default function AttendanceMonitor({ embedded = false }) {
  const [tab, setTab] = useState('daily');
  const [classes, setClasses] = useState([]);
  const [historyClassId, setHistoryClassId] = useState('');

  useEffect(() => {
    (async () => {
      try { const r = await classAPI.getAll(); setClasses(r.data.data || []); }
      catch { /* class list is only needed for the history picker */ }
    })();
  }, []);

  const openClass = (id) => { setHistoryClassId(id); setTab('history'); };

  const TABS = [
    { key:'daily',   label:'📅 Daily Status' },
    { key:'recent',  label:'🗓 Recent Days' },
    { key:'monthly', label:'📆 Monthly' },
    { key:'history', label:'🔍 Class-wise' },
  ];

  return (
    <div className="animate-fade-in">
      {!embedded && (
        <div className="page-header" style={{ marginBottom:16 }}>
          <div>
            <h2 className="font-display text-2xl text-ink">📅 Attendance Monitoring</h2>
            <p className="text-sm text-muted mt-0.5">Track which classes have taken attendance and which are pending</p>
          </div>
        </div>
      )}

      <div style={{ marginBottom:20 }}>
        <DashboardCards onOpen={setTab} />
      </div>

      <div style={{ display:'flex', gap:4, background:'#F3F4F6', borderRadius:10, padding:4, marginBottom:20, flexWrap:'wrap' }}>
        {TABS.map(t => (
          <button key={t.key} onClick={()=>setTab(t.key)}
            style={{ padding:'8px 16px', borderRadius:8, fontSize:13, fontWeight:700, border:'none', cursor:'pointer',
              background: tab===t.key ? '#F97316' : 'transparent', color: tab===t.key ? '#fff' : '#6B7280' }}>
            {t.label}
          </button>
        ))}
      </div>

      {tab === 'daily'   && <DailyReport />}
      {tab === 'recent'  && <RecentReport />}
      {tab === 'monthly' && <MonthlyReport onOpenClass={openClass} />}
      {tab === 'history' && <ClassHistoryReport classes={classes} initialClassId={historyClassId} />}
    </div>
  );
}
