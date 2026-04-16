/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useRef, useEffect } from 'react';

const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const DAYS   = ['Su','Mo','Tu','We','Th','Fr','Sa'];

function isSameDay(a, b) {
  return a && b && a.getFullYear()===b.getFullYear() && a.getMonth()===b.getMonth() && a.getDate()===b.getDate();
}
function startOf(d) { const x=new Date(d); x.setHours(0,0,0,0); return x; }
function fmt(d) {
  if (!d) return '';
  return d.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
}
function fmtShort(d) {
  if (!d) return '';
  return `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}`;
}

function CalendarMonth({ year, month, from, to, hovered, onSelect, onHover }) {
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month+1, 0).getDate();
  const today = startOf(new Date());
  const cells = [];

  for (let i=0; i<firstDay; i++) cells.push(null);
  for (let d=1; d<=daysInMonth; d++) cells.push(new Date(year, month, d));

  return (
    <div style={{ minWidth:220 }}>
      <div style={{ textAlign:'center', fontWeight:700, fontSize:13, color:'#111827', marginBottom:10 }}>
        {MONTHS[month]} {year}
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(7,1fr)', gap:2 }}>
        {DAYS.map(d => (
          <div key={d} style={{ textAlign:'center', fontSize:11, fontWeight:700, color:'#9CA3AF', padding:'2px 0 6px' }}>{d}</div>
        ))}
        {cells.map((date, i) => {
          if (!date) return <div key={'e'+i}/>;
          const isFrom    = isSameDay(date, from);
          const isTo      = isSameDay(date, to);
          const isToday   = isSameDay(date, today);
          const inRange   = from && (to||hovered) && date > startOf(from) && date < startOf(to||hovered);
          const isEnd     = isSameDay(date, to || hovered);
          const isFuture  = date > today;

          let bg = 'transparent', color = '#374151', borderRadius = '50%', fontWeight = 400;
          if (isFrom || isTo)  { bg='#3B5BDB'; color='#fff'; fontWeight=700; }
          else if (inRange)    { bg='#EEF2FF'; borderRadius='0'; color='#3B5BDB'; }
          else if (isEnd && from) { bg='#C7D2FE'; color='#3B5BDB'; fontWeight=700; }
          if (isToday && !isFrom && !isTo) { fontWeight=700; color=color==='#374151'?'#3B5BDB':color; }

          // Range edge rounding
          let style = { textAlign:'center', fontSize:12, padding:'5px 0', cursor: isFuture?'default':'pointer',
            background:bg, borderRadius, fontWeight, color, opacity: isFuture?0.35:1, userSelect:'none',
            transition:'background 0.1s' };

          return (
            <div key={i} style={style}
              onClick={() => !isFuture && onSelect(date)}
              onMouseEnter={() => !isFuture && onHover(date)}>
              {date.getDate()}
            </div>
          );
        })}
      </div>
    </div>
  );
}

// Presets
function getPresets() {
  const today = startOf(new Date());
  const yest  = new Date(today); yest.setDate(yest.getDate()-1);
  const l7    = new Date(today); l7.setDate(l7.getDate()-6);
  const l30   = new Date(today); l30.setDate(l30.getDate()-29);
  const tm1   = new Date(today.getFullYear(), today.getMonth(), 1);
  const lm1   = new Date(today.getFullYear(), today.getMonth()-1, 1);
  const lme   = new Date(today.getFullYear(), today.getMonth(), 0);
  return [
    { label:'Today',       from: today, to: today },
    { label:'Yesterday',   from: yest,  to: yest  },
    { label:'Last 7 Days', from: l7,    to: today  },
    { label:'Last 30 Days',from: l30,   to: today  },
    { label:'This Month',  from: tm1,   to: today  },
    { label:'Last Month',  from: lm1,   to: lme    },
  ];
}

export default function DateRangePicker({ from, to, onChange }) {
  const [open,     setOpen]    = useState(false);
  const [tempFrom, setTempFrom]= useState(from ? startOf(from) : null);
  const [tempTo,   setTempTo]  = useState(to   ? startOf(to)   : null);
  const [hovered,  setHovered] = useState(null);
  const [step,     setStep]    = useState('from'); // 'from' | 'to'
  const [leftYear, setLeftYear]= useState(() => from ? from.getFullYear() : new Date().getFullYear());
  const [leftMon,  setLeftMon] = useState(() => from ? from.getMonth()    : new Date().getMonth());
  const ref = useRef(null);

  // Right calendar = left+1 month
  let rightMon  = leftMon + 1;
  let rightYear = leftYear;
  if (rightMon > 11) { rightMon = 0; rightYear++; }

  useEffect(() => {
    const handler = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  const handleSelect = (date) => {
    if (step === 'from') {
      setTempFrom(date); setTempTo(null); setHovered(null); setStep('to');
    } else {
      if (date < tempFrom) { setTempFrom(date); setTempTo(null); setStep('to'); }
      else { setTempTo(date); setStep('from'); }
    }
  };

  const handlePreset = (preset) => {
    setTempFrom(preset.from); setTempTo(preset.to); setStep('from');
    setLeftYear(preset.from.getFullYear()); setLeftMon(preset.from.getMonth());
  };

  const apply = () => {
    if (tempFrom && tempTo) {
      onChange(tempFrom, tempTo);
      setOpen(false);
    }
  };

  const cancel = () => {
    setTempFrom(from ? startOf(from) : null);
    setTempTo(to ? startOf(to) : null);
    setStep('from'); setOpen(false);
  };

  const prevMonth = () => { if(leftMon===0){setLeftMon(11);setLeftYear(y=>y-1);}else setLeftMon(m=>m-1); };
  const nextMonth = () => { if(leftMon===11){setLeftMon(0);setLeftYear(y=>y+1);}else setLeftMon(m=>m+1); };

  const displayText = (from && to)
    ? `${fmt(from)} – ${fmt(to)}`
    : 'Select date range';

  const presets = getPresets();
  const activePreset = presets.find(p => isSameDay(p.from, from) && isSameDay(p.to, to))?.label;

  return (
    <div ref={ref} style={{ position:'relative', display:'inline-block' }}>
      {/* Trigger button */}
      <div onClick={() => setOpen(o=>!o)}
        style={{ background:'#3B5BDB', borderRadius:10, padding:'10px 18px', display:'flex', alignItems:'center', gap:10, cursor:'pointer', minWidth:260 }}>
        <span style={{ fontSize:16 }}>📅</span>
        <span style={{ color:'#fff', fontWeight:600, fontSize:13, flex:1 }}>{displayText}</span>
        <span style={{ color:'#fff', fontSize:12, opacity:0.8 }}>▼</span>
      </div>

      {/* Dropdown */}
      {open && (
        <div style={{ position:'absolute', top:'calc(100% + 8px)', left:0, zIndex:1000, background:'#fff', borderRadius:12, boxShadow:'0 8px 40px rgba(0,0,0,0.18)', border:'1px solid #E5E7EB', display:'flex', minWidth:620 }}>
          
          {/* Left: Presets */}
          <div style={{ width:150, borderRight:'1px solid #F3F4F6', padding:'12px 0' }}>
            {presets.map(p => (
              <div key={p.label} onClick={() => handlePreset(p)}
                style={{ padding:'9px 18px', fontSize:13, cursor:'pointer', fontWeight: activePreset===p.label?700:400,
                  color: activePreset===p.label?'#3B5BDB':'#374151',
                  background: activePreset===p.label?'#EEF2FF':'transparent' }}>
                {p.label}
              </div>
            ))}
            <div onClick={() => {}}
              style={{ padding:'9px 18px', fontSize:13, cursor:'pointer', fontWeight:700, color:'#3B5BDB', background:'#EEF2FF' }}>
              Custom Range
            </div>
          </div>

          {/* Right: Calendars */}
          <div style={{ flex:1, padding:16 }}>
            {/* Nav */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:12 }}>
              <button onClick={prevMonth} style={{ width:28, height:28, borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:14 }}>‹</button>
              <div style={{ display:'flex', gap:32 }}>
                <span style={{ fontWeight:700, fontSize:13 }}>{MONTHS[leftMon]} {leftYear}</span>
                <span style={{ fontWeight:700, fontSize:13 }}>{MONTHS[rightMon]} {rightYear}</span>
              </div>
              <button onClick={nextMonth} style={{ width:28, height:28, borderRadius:6, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:14 }}>›</button>
            </div>

            {/* Dual calendar */}
            <div style={{ display:'flex', gap:24 }}>
              <CalendarMonth year={leftYear} month={leftMon} from={tempFrom} to={tempTo} hovered={hovered}
                onSelect={handleSelect} onHover={setHovered} />
              <CalendarMonth year={rightYear} month={rightMon} from={tempFrom} to={tempTo} hovered={hovered}
                onSelect={handleSelect} onHover={setHovered} />
            </div>

            {/* Footer */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginTop:14, paddingTop:12, borderTop:'1px solid #F3F4F6' }}>
              <span style={{ fontSize:12, color:'#6B7280' }}>
                {tempFrom && tempTo ? `${fmtShort(tempFrom)} - ${fmtShort(tempTo)}` : tempFrom ? `${fmtShort(tempFrom)} - select end date` : 'Select start date'}
              </span>
              <div style={{ display:'flex', gap:8 }}>
                <button onClick={cancel} style={{ padding:'6px 18px', borderRadius:7, border:'1px solid #E5E7EB', background:'#fff', fontSize:12, fontWeight:600, cursor:'pointer', color:'#374151' }}>
                  Cancel
                </button>
                <button onClick={apply} disabled={!tempFrom||!tempTo}
                  style={{ padding:'6px 18px', borderRadius:7, border:'none', background: tempFrom&&tempTo?'#3B5BDB':'#C7D2FE', fontSize:12, fontWeight:700, cursor: tempFrom&&tempTo?'pointer':'default', color:'#fff' }}>
                  Apply
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}