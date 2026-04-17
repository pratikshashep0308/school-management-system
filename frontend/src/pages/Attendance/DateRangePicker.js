/* eslint-disable react-hooks/exhaustive-deps */
import React, { useState, useRef, useEffect } from 'react';

const MONTHS   = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
const WDAYS    = ['Su','Mo','Tu','We','Th','Fr','Sa'];

const strip = d => { if (!d) return null; const x = new Date(d); x.setHours(0,0,0,0); return x; };
const same  = (a,b) => a && b && a.getTime() === b.getTime();
const fmt   = d => d ? d.toLocaleDateString('en-IN',{day:'2-digit',month:'short',year:'numeric'}) : '';
const fmtUs = d => d ? `${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')}/${d.getFullYear()}` : '';

function Month({ y, m, from, to, hover, onDay, onHover }) {
  const first = new Date(y, m, 1).getDay();
  const dim   = new Date(y, m+1, 0).getDate();
  const today = strip(new Date());
  const cells = [];
  for (let i=0;i<first;i++) cells.push(null);
  for (let d=1;d<=dim;d++) cells.push(strip(new Date(y,m,d)));

  return (
    <div style={{width:240}}>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,34px)',marginBottom:6}}>
        {WDAYS.map(w=><div key={w} style={{textAlign:'center',fontSize:11,fontWeight:700,color:'#9CA3AF',lineHeight:'20px'}}>{w}</div>)}
      </div>
      <div style={{display:'grid',gridTemplateColumns:'repeat(7,34px)',rowGap:1}}>
        {cells.map((date,i)=>{
          if(!date) return <div key={'e'+i} style={{height:34}}/>;
          const isFuture = date > today;
          const isFrom   = same(date, from);
          const isTo     = same(date, to);
          const endRef   = to || hover;
          const inRange  = from && endRef && date > from && date < strip(endRef);
          const isHover  = hover && same(date, strip(hover)) && from && !to;
          const isToday  = same(date, today);

          // Cell background (range fill)
          let cellBg = 'transparent';
          if (inRange) cellBg = '#DBEAFE';

          // Pill left/right rounding for range edges
          let cellRadius = '0';
          const isStart = isFrom;
          const isEnd   = isTo || isHover;
          if (isStart && isEnd)  cellRadius = '50%';
          else if (isStart)      cellRadius = '50% 0 0 50%';
          else if (isEnd)        cellRadius = '0 50% 50% 0';

          // Number circle
          let numBg='transparent', numColor=isToday?'#3B5BDB':'#374151', numW=isToday?700:400;
          if (isFrom||isTo)       { numBg='#3B5BDB'; numColor='#fff'; numW=700; }
          else if (isHover)       { numBg='#93C5FD'; numColor='#1D4ED8'; numW=700; }

          return (
            <div key={i}
              style={{height:30,display:'flex',alignItems:'center',justifyContent:'center',
                background:cellBg, borderRadius:cellRadius,
                cursor:isFuture?'not-allowed':'pointer',opacity:isFuture?0.3:1}}
              onClick={()=>!isFuture&&onDay(date)}
              onMouseEnter={()=>!isFuture&&onHover(date)}>
              <div style={{width:28,height:28,display:'flex',alignItems:'center',justifyContent:'center',
                borderRadius:'50%',background:numBg,
                fontSize:12,fontWeight:numW,color:numColor}}>
                {date.getDate()}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function presets() {
  const t  = strip(new Date());
  const y  = new Date(t); y.setDate(y.getDate()-1);
  const l7 = new Date(t); l7.setDate(l7.getDate()-6);
  const l30= new Date(t); l30.setDate(l30.getDate()-29);
  const tm = new Date(t.getFullYear(),t.getMonth(),1);
  const lms= new Date(t.getFullYear(),t.getMonth()-1,1);
  const lme= new Date(t.getFullYear(),t.getMonth(),0);
  return [
    {label:'Today',       from:t,   to:t  },
    {label:'Yesterday',   from:y,   to:y  },
    {label:'Last 7 Days', from:l7,  to:t  },
    {label:'Last 30 Days',from:l30, to:t  },
    {label:'This Month',  from:tm,  to:t  },
    {label:'Last Month',  from:lms, to:lme},
  ];
}

export default function DateRangePicker({ from, to, onChange }) {
  const today = strip(new Date());
  const [open,  setOpen]  = useState(false);
  const [tFrom, setTFrom] = useState(()=>from?strip(from):null);
  const [tTo,   setTTo]   = useState(()=>to?strip(to):null);
  const [hover, setHover] = useState(null);
  const [step,  setStep]  = useState('from');
  const [lM,    setLM]    = useState(()=>from?from.getMonth():today.getMonth());
  const [lY,    setLY]    = useState(()=>from?from.getFullYear():today.getFullYear());
  const wrapRef = useRef(null);

  let rM = lM+1, rY = lY;
  if (rM>11){rM=0;rY++;}

  useEffect(()=>{
    const fn = e=>{ if(wrapRef.current&&!wrapRef.current.contains(e.target)) setOpen(false); };
    document.addEventListener('mousedown',fn);
    return ()=>document.removeEventListener('mousedown',fn);
  },[]);

  const handleDay = date => {
    if (!tFrom || tTo) {
      // Start fresh selection
      setTFrom(date); setTTo(null); setHover(null); setStep('to');
    } else {
      // Second click
      if (date < tFrom) { setTFrom(date); setTTo(null); setStep('to'); }
      else { setTTo(date); setHover(null); setStep('from'); }
    }
  };

  const handlePreset = p => {
    setTFrom(p.from); setTTo(p.to); setHover(null); setStep('from');
    setLY(p.from.getFullYear()); setLM(p.from.getMonth());
  };

  const apply = () => {
    if (tFrom && tTo) { onChange(tFrom, tTo); setOpen(false); }
  };

  const cancel = () => {
    setTFrom(from?strip(from):null); setTTo(to?strip(to):null);
    setHover(null); setStep('from'); setOpen(false);
  };

  const ps = presets();
  const activePreset = ps.find(p=>same(p.from,from)&&same(p.to,to))?.label;

  const label = (from&&to) ? `${fmt(from)} – ${fmt(to)}` : 'Select date range';
  const footerText = tFrom&&tTo ? `${fmtUs(tFrom)} - ${fmtUs(tTo)}`
                   : tFrom      ? `${fmtUs(tFrom)} - select end`
                   : 'Select start date';

  return (
    <div ref={wrapRef} style={{position:'relative',display:'inline-block',zIndex:300}}>

      {/* Trigger */}
      <div onClick={()=>setOpen(o=>!o)}
        style={{background:'#3B5BDB',borderRadius:10,padding:'10px 18px',
          display:'flex',alignItems:'center',gap:10,cursor:'pointer',
          minWidth:260,userSelect:'none'}}>
        <span style={{fontSize:15}}>📅</span>
        <span style={{color:'#fff',fontWeight:600,fontSize:13,flex:1}}>{label}</span>
        <span style={{color:'rgba(255,255,255,.7)',fontSize:10}}>▼</span>
      </div>

      {/* Panel */}
      {open && (
        <div style={{position:'absolute',top:'calc(100% + 6px)',left:0,
          background:'#fff',borderRadius:12,
          boxShadow:'0 10px 40px rgba(0,0,0,.18)',border:'1px solid #E5E7EB',
          display:'flex',overflow:'visible',width:680}}>

          {/* Presets */}
          <div style={{width:130,borderRight:'1px solid #F3F4F6',padding:'10px 0',flexShrink:0}}>
            {ps.map(p=>{
              const active = activePreset===p.label;
              return (
                <div key={p.label} onClick={()=>handlePreset(p)}
                  style={{padding:'9px 16px',fontSize:13,cursor:'pointer',
                    background:active?'#EEF2FF':'transparent',
                    color:active?'#3B5BDB':'#374151',fontWeight:active?600:400}}>
                  {p.label}
                </div>
              );
            })}
            <div style={{padding:'9px 16px',fontSize:13,cursor:'pointer',
              background:'#EEF2FF',color:'#3B5BDB',fontWeight:600}}>
              Custom Range
            </div>
          </div>

          {/* Calendars */}
          <div style={{flex:1,padding:'14px 20px',display:'flex',flexDirection:'column',gap:10}}
            onMouseLeave={()=>!tTo&&setHover(null)}>

            {/* Month nav */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between'}}>
              <button onClick={()=>{if(lM===0){setLM(11);setLY(y=>y-1);}else setLM(m=>m-1);}}
                style={{width:26,height:26,borderRadius:6,border:'1px solid #E5E7EB',
                  background:'#fff',cursor:'pointer',fontSize:15,lineHeight:'1',color:'#374151',
                  display:'flex',alignItems:'center',justifyContent:'center'}}>‹</button>
              <div style={{display:'flex',gap:80}}>
                <span style={{fontWeight:700,fontSize:13,color:'#111827',width:90,textAlign:'center'}}>
                  {MONTHS[lM]} {lY}
                </span>
                <span style={{fontWeight:700,fontSize:13,color:'#111827',width:90,textAlign:'center'}}>
                  {MONTHS[rM]} {rY}
                </span>
              </div>
              <button onClick={()=>{if(lM===11){setLM(0);setLY(y=>y+1);}else setLM(m=>m+1);}}
                style={{width:26,height:26,borderRadius:6,border:'1px solid #E5E7EB',
                  background:'#fff',cursor:'pointer',fontSize:15,lineHeight:'1',color:'#374151',
                  display:'flex',alignItems:'center',justifyContent:'center'}}>›</button>
            </div>

            {/* Two grids */}
            <div style={{display:'flex',gap:16,alignItems:'flex-start'}}>
              <Month y={lY} m={lM} from={tFrom} to={tTo} hover={hover} onDay={handleDay} onHover={setHover}/>
              <div style={{width:1,background:'#F3F4F6',alignSelf:'stretch'}}/>
              <Month y={rY} m={rM} from={tFrom} to={tTo} hover={hover} onDay={handleDay} onHover={setHover}/>
            </div>

            {/* Footer */}
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',
              paddingTop:10,borderTop:'1px solid #F3F4F6',marginTop:2}}>
              <span style={{fontSize:12,color:'#6B7280'}}>{footerText}</span>
              <div style={{display:'flex',gap:8}}>
                <button onClick={cancel}
                  style={{padding:'5px 18px',borderRadius:7,border:'1px solid #D1D5DB',
                    background:'#fff',fontSize:12,fontWeight:600,cursor:'pointer',color:'#374151'}}>
                  Cancel
                </button>
                <button onClick={apply} disabled={!tFrom||!tTo}
                  style={{padding:'5px 18px',borderRadius:7,border:'none',
                    background:tFrom&&tTo?'#3B5BDB':'#BFDBFE',
                    fontSize:12,fontWeight:700,
                    cursor:tFrom&&tTo?'pointer':'not-allowed',color:'#fff'}}>
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