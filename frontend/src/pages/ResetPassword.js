// frontend/src/pages/ResetPassword.js
import React, { useState } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ResetPassword() {
  const { token }   = useParams();
  const navigate    = useNavigate();
  const [password,  setPassword]  = useState('');
  const [confirm,   setConfirm]   = useState('');
  const [show,      setShow]      = useState(false);
  const [loading,   setLoading]   = useState(false);
  const [done,      setDone]      = useState(false);

  const strength = (p) => {
    let s = 0;
    if (p.length >= 8)      s++;
    if (/[A-Z]/.test(p))    s++;
    if (/[0-9]/.test(p))    s++;
    if (/[^A-Za-z0-9]/.test(p)) s++;
    return s;
  };

  const strengthLabel = ['', 'Weak', 'Fair', 'Good', 'Strong'];
  const strengthColor = ['', '#DC2626', '#D97706', '#16A34A', '#0891B2'];
  const s = strength(password);

  const submit = async (e) => {
    e.preventDefault();
    if (password.length < 6) return toast.error('Password must be at least 6 characters');
    if (password !== confirm) return toast.error('Passwords do not match');
    setLoading(true);
    try {
      await api.put(`/auth/reset-password/${token}`, { password });
      setDone(true);
      toast.success('Password reset successfully!');
      setTimeout(() => navigate('/login'), 2500);
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Invalid or expired reset link');
    } finally { setLoading(false); }
  };

  const INP = { width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:14, outline:'none', boxSizing:'border-box' };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0B1F4A 0%,#1D3A7A 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:420, padding:40, boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 12px' }}>🔐</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>Reset Password</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', marginTop:6 }}>Enter your new password below</p>
        </div>

        {done ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>✅</div>
            <h3 style={{ fontWeight:700, color:'#166534', fontSize:16, marginBottom:8 }}>Password Reset!</h3>
            <p style={{ fontSize:13, color:'#6B7280', marginBottom:24 }}>Redirecting to login page…</p>
            <Link to="/login" style={{ display:'block', padding:11, borderRadius:10, background:'#0B1F4A', color:'#fff', textDecoration:'none', fontWeight:700, fontSize:14 }}>
              Go to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            {/* New Password */}
            <div style={{ marginBottom:16 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>New Password</label>
              <div style={{ position:'relative' }}>
                <input type={show?'text':'password'} value={password} onChange={e=>setPassword(e.target.value)}
                  placeholder="Min 6 characters" required style={{ ...INP, paddingRight:44 }}
                  onFocus={e=>e.target.style.borderColor='#3B5BDB'} onBlur={e=>e.target.style.borderColor='#E5E7EB'}/>
                <button type="button" onClick={()=>setShow(s=>!s)}
                  style={{ position:'absolute', right:12, top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:16 }}>
                  {show ? '🙈' : '👁️'}
                </button>
              </div>
              {/* Strength bar */}
              {password && (
                <div style={{ marginTop:8 }}>
                  <div style={{ display:'flex', gap:4, marginBottom:4 }}>
                    {[1,2,3,4].map(i => (
                      <div key={i} style={{ flex:1, height:4, borderRadius:2, background: i<=s ? strengthColor[s] : '#E5E7EB', transition:'background 0.3s' }}/>
                    ))}
                  </div>
                  <span style={{ fontSize:11, color:strengthColor[s], fontWeight:700 }}>{strengthLabel[s]}</span>
                </div>
              )}
            </div>

            {/* Confirm */}
            <div style={{ marginBottom:24 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Confirm Password</label>
              <input type={show?'text':'password'} value={confirm} onChange={e=>setConfirm(e.target.value)}
                placeholder="Repeat new password" required
                style={{ ...INP, borderColor: confirm && confirm!==password ? '#EF4444' : '#E5E7EB' }}
                onFocus={e=>e.target.style.borderColor='#3B5BDB'} onBlur={e=>e.target.style.borderColor= confirm && confirm!==password?'#EF4444':'#E5E7EB'}/>
              {confirm && confirm !== password && (
                <p style={{ fontSize:11, color:'#EF4444', marginTop:4 }}>⚠ Passwords do not match</p>
              )}
            </div>

            <button type="submit" disabled={loading || password !== confirm}
              style={{ width:'100%', padding:13, borderRadius:10, background:loading?'#93C5FD':'#0B1F4A', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:'pointer', marginBottom:16, opacity: password!==confirm?0.6:1 }}>
              {loading ? '⏳ Resetting…' : '🔐 Reset Password'}
            </button>
            <div style={{ textAlign:'center' }}>
              <Link to="/login" style={{ fontSize:13, color:'#6B7280', textDecoration:'none' }}>← Back to Login</Link>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}