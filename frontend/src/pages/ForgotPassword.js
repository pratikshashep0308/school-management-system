// frontend/src/pages/ForgotPassword.js
import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import api from '../utils/api';
import toast from 'react-hot-toast';

export default function ForgotPassword() {
  const [email,   setEmail]   = useState('');
  const [sent,    setSent]    = useState(false);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return toast.error('Enter your email');
    setLoading(true);
    try {
      await api.post('/auth/forgot-password', { email });
      setSent(true);
      toast.success('Reset link sent! Check your email.');
    } catch (err) {
      toast.error(err?.response?.data?.message || 'Failed to send reset email');
    } finally { setLoading(false); }
  };

  return (
    <div style={{ minHeight:'100vh', background:'linear-gradient(135deg,#0B1F4A 0%,#1D3A7A 100%)', display:'flex', alignItems:'center', justifyContent:'center', padding:16 }}>
      <div style={{ background:'#fff', borderRadius:20, width:'100%', maxWidth:420, padding:40, boxShadow:'0 24px 64px rgba(0,0,0,0.3)' }}>
        {/* Logo */}
        <div style={{ textAlign:'center', marginBottom:28 }}>
          <div style={{ width:60, height:60, borderRadius:16, background:'#0B1F4A', display:'flex', alignItems:'center', justifyContent:'center', fontSize:28, margin:'0 auto 12px' }}>🏫</div>
          <h1 style={{ fontSize:22, fontWeight:900, color:'#0B1F4A', margin:0 }}>Forgot Password</h1>
          <p style={{ fontSize:13, color:'#9CA3AF', marginTop:6 }}>Enter your email to receive a reset link</p>
        </div>

        {sent ? (
          <div style={{ textAlign:'center' }}>
            <div style={{ fontSize:56, marginBottom:16 }}>📧</div>
            <h3 style={{ fontWeight:700, color:'#166534', fontSize:16, marginBottom:8 }}>Email Sent!</h3>
            <p style={{ fontSize:13, color:'#6B7280', marginBottom:24, lineHeight:1.6 }}>
              We've sent a password reset link to <strong>{email}</strong>. Check your inbox and spam folder.
            </p>
            <p style={{ fontSize:12, color:'#9CA3AF', marginBottom:20 }}>Link expires in 10 minutes.</p>
            <Link to="/login" style={{ display:'block', padding:'11px', borderRadius:10, background:'#0B1F4A', color:'#fff', textDecoration:'none', fontWeight:700, fontSize:14, textAlign:'center' }}>
              ← Back to Login
            </Link>
          </div>
        ) : (
          <form onSubmit={submit}>
            <div style={{ marginBottom:20 }}>
              <label style={{ fontSize:12, fontWeight:700, color:'#374151', display:'block', marginBottom:6 }}>Email Address</label>
              <input
                type="email" value={email} onChange={e=>setEmail(e.target.value)}
                placeholder="your@email.com" required
                style={{ width:'100%', padding:'12px 14px', border:'1.5px solid #E5E7EB', borderRadius:10, fontSize:14, outline:'none', boxSizing:'border-box' }}
                onFocus={e=>e.target.style.borderColor='#3B5BDB'}
                onBlur={e=>e.target.style.borderColor='#E5E7EB'}
              />
            </div>
            <button type="submit" disabled={loading}
              style={{ width:'100%', padding:13, borderRadius:10, background:loading?'#93C5FD':'#0B1F4A', color:'#fff', border:'none', fontSize:14, fontWeight:700, cursor:loading?'not-allowed':'pointer', marginBottom:16 }}>
              {loading ? '⏳ Sending…' : '📧 Send Reset Link'}
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