/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/QRAttendance.js — QR Code Attendance System
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { classAPI } from '../utils/api';
import api from '../utils/api';

const NOW = new Date();

export default function QRAttendance() {
  const [classes,   setClasses]   = useState([]);
  const [classId,   setClassId]   = useState('');
  const [date,      setDate]      = useState(NOW.toISOString().split('T')[0]);
  const [qrToken,   setQRToken]   = useState('');
  const [qrData,    setQRData]    = useState(null);
  const [loading,   setLoading]   = useState(false);
  const [timeLeft,  setTimeLeft]  = useState(0);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data||[])).catch(()=>{});
  }, []);

  // Countdown timer for QR expiry
  useEffect(() => {
    if (timeLeft <= 0) return;
    const t = setInterval(() => setTimeLeft(s => s > 0 ? s-1 : 0), 1000);
    return () => clearInterval(t);
  }, [timeLeft]);

  const generateQR = async () => {
    if (!classId) return toast.error('Select a class first');
    setLoading(true);
    try {
      const r = await api.post('/attendance/qr-token', { classId, date });
      setQRToken(r.data.token);
      setQRData(r.data);
      setTimeLeft(300); // 5 minutes
      toast.success('QR code generated! Valid for 5 minutes.');
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to generate QR');
    } finally { setLoading(false); }
  };

  // Build QR code URL using Google Charts API
  const qrUrl = qrToken
    ? `https://api.qrserver.com/v1/create-qr-code/?size=250x250&data=${encodeURIComponent(JSON.stringify({ token: qrToken, action: 'mark-attendance' }))}`
    : '';

  const selectedClass = classes.find(c => c._id === classId);
  const mins = Math.floor(timeLeft / 60);
  const secs = timeLeft % 60;
  const expired = timeLeft === 0 && qrToken;

  const SEL = { padding:'10px 14px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:13, background:'#fff', outline:'none', minWidth:180 };

  return (
    <div style={{ padding:'0 0 40px', fontFamily:'Inter,sans-serif', maxWidth:700 }}>
      {/* Header */}
      <div style={{ marginBottom:24 }}>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#0B1F4A', margin:0 }}>📱 QR Attendance</h2>
        <p style={{ fontSize:13, color:'#6B7280', marginTop:4 }}>Generate QR code → students scan to mark themselves present</p>
      </div>

      {/* How it works */}
      <div style={{ background:'#EFF6FF', border:'1px solid #BFDBFE', borderRadius:12, padding:'14px 18px', marginBottom:24 }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#1D4ED8', marginBottom:8 }}>How it works:</div>
        <div style={{ display:'flex', gap:16, flexWrap:'wrap' }}>
          {[
            { step:'1', text:'Select class & date' },
            { step:'2', text:'Generate QR code' },
            { step:'3', text:'Display on projector/board' },
            { step:'4', text:'Students scan with phone → auto-marked present' },
          ].map(s => (
            <div key={s.step} style={{ display:'flex', alignItems:'center', gap:8, fontSize:12 }}>
              <div style={{ width:22, height:22, borderRadius:'50%', background:'#1D4ED8', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, flexShrink:0 }}>{s.step}</div>
              <span style={{ color:'#1D4ED8' }}>{s.text}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Controls */}
      <div style={{ background:'#fff', borderRadius:14, border:'1px solid #E5E7EB', padding:24, marginBottom:20 }}>
        <div style={{ display:'flex', gap:12, flexWrap:'wrap', alignItems:'flex-end' }}>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:5, textTransform:'uppercase' }}>Class</label>
            <select value={classId} onChange={e=>setClassId(e.target.value)} style={SEL}>
              <option value="">Select class…</option>
              {classes.map(c=><option key={c._id} value={c._id}>{c.name} {c.section||''}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize:11, fontWeight:700, color:'#6B7280', display:'block', marginBottom:5, textTransform:'uppercase' }}>Date</label>
            <input type="date" value={date} onChange={e=>setDate(e.target.value)} style={SEL}/>
          </div>
          <button onClick={generateQR} disabled={!classId||loading}
            style={{ padding:'10px 24px', borderRadius:10, background: (!classId||loading)?'#9CA3AF':'#0B1F4A', color:'#fff', border:'none',
              fontSize:13, fontWeight:700, cursor:(!classId||loading)?'not-allowed':'pointer' }}>
            {loading ? '⏳ Generating…' : '🔄 Generate QR'}
          </button>
        </div>
      </div>

      {/* QR Display */}
      {qrToken && (
        <div style={{ background:'#fff', borderRadius:14, border:`2px solid ${expired?'#DC2626':'#16A34A'}`, padding:24, textAlign:'center' }}>
          {/* Timer */}
          <div style={{ marginBottom:16 }}>
            <div style={{ fontSize:13, fontWeight:700, color: expired?'#DC2626':'#166534' }}>
              {expired ? '❌ QR Expired — Generate a new one' : `⏱ Expires in: ${mins}:${secs.toString().padStart(2,'0')}`}
            </div>
            {!expired && (
              <div style={{ height:6, background:'#E5E7EB', borderRadius:3, marginTop:8, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${(timeLeft/300)*100}%`, background:'#16A34A', borderRadius:3, transition:'width 1s linear' }}/>
              </div>
            )}
          </div>

          {/* Class info */}
          <div style={{ marginBottom:16, fontSize:14, fontWeight:700, color:'#0B1F4A' }}>
            {selectedClass?.name} {selectedClass?.section} · {new Date(date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}
          </div>

          {/* QR Code */}
          <div style={{ display:'inline-block', padding:16, border:'1px solid #E5E7EB', borderRadius:12, background:'#fff', opacity: expired?0.4:1 }}>
            <img src={qrUrl} alt="QR Code" width={250} height={250}
              style={{ display:'block', borderRadius:8 }}
              onError={e=>{ e.target.style.display='none'; }}
            />
          </div>

          <div style={{ marginTop:16, fontSize:12, color:'#6B7280' }}>
            Students scan this QR code with their phone camera to mark attendance
          </div>

          {/* Refresh button */}
          <div style={{ marginTop:16 }}>
            <button onClick={generateQR}
              style={{ padding:'8px 20px', borderRadius:9, border:'1.5px solid #0B1F4A', background:'#fff', color:'#0B1F4A', fontSize:13, fontWeight:700, cursor:'pointer' }}>
              🔄 Refresh QR
            </button>
            <button onClick={()=>{ const w=window.open('','_blank'); w.document.write(`<html><head><title>QR Attendance</title></head><body style="display:flex;flex-direction:column;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;padding:20px"><h2 style="color:#0B1F4A;margin-bottom:8px">${selectedClass?.name} ${selectedClass?.section||''}</h2><p style="color:#666;margin-bottom:20px">${new Date(date+'T00:00:00').toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</p><img src="${qrUrl}" width="350" height="350" style="border:2px solid #0B1F4A;border-radius:12px;padding:10px"/><p style="margin-top:16px;color:#666;font-size:14px">Scan to mark attendance</p></body></html>`); w.document.close(); }}
              style={{ padding:'8px 20px', borderRadius:9, border:'none', background:'#0B1F4A', color:'#fff', fontSize:13, fontWeight:700, cursor:'pointer', marginLeft:8 }}>
              🖥️ Fullscreen
            </button>
          </div>
        </div>
      )}

      {/* Instructions for students */}
      <div style={{ marginTop:20, background:'#F9FAFB', borderRadius:12, padding:'16px 20px' }}>
        <div style={{ fontWeight:700, fontSize:13, color:'#374151', marginBottom:10 }}>📋 Student Instructions</div>
        <div style={{ fontSize:12, color:'#6B7280', lineHeight:1.8 }}>
          1. Open your phone camera app<br/>
          2. Point at the QR code displayed on the board<br/>
          3. Tap the link that appears<br/>
          4. Your attendance is automatically marked as <strong>Present</strong><br/>
          5. QR code refreshes every 5 minutes — use the current one
        </div>
      </div>
    </div>
  );
}