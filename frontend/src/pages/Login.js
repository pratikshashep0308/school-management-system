import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const QUICK_ACCOUNTS = [
  { label: 'School Admin', email: 'admin@school.com', password: 'Admin@123', color: '#1a3a6b' },
  { label: 'Teacher', email: 'teacher@school.com', password: 'Teacher@123', color: '#16a34a' },
  { label: 'Student', email: 'student@school.com', password: 'Student@123', color: '#2563eb' },
  { label: 'Parent', email: 'parent@school.com', password: 'Parent@123', color: '#9333ea' },
  { label: 'Accountant', email: 'accountant@school.com', password: 'Admin@123', color: '#dc2626' },
  { label: 'Super Admin', email: 'superadmin@school.com', password: 'Admin@123', color: '#e87722' },
];

const FEATURES = [
  { icon: '👥', text: 'Student & Staff Management' },
  { icon: '📊', text: 'Attendance & Analytics' },
  { icon: '💰', text: 'Fee Collection & Reports' },
  { icon: '📚', text: 'Library & Transport' },
  { icon: '📝', text: 'Exams & Results' },
  { icon: '🔔', text: 'Instant Notifications' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@school.com', password: 'Admin@123' });
  const [loading, setLoading] = useState(false);
  const [showPass, setShowPass] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.email || !form.password) { toast.error('Please fill in all fields'); return; }
    setLoading(true);
    try {
      const user = await login(form.email, form.password);
      toast.success(`Welcome back, ${user.name}!`);
      navigate('/dashboard');
    } catch (err) {
      toast.error(err.response?.data?.message || 'Login failed. Please try again.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex" style={{ fontFamily: "'Nunito', 'Segoe UI', sans-serif" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Nunito:wght@400;600;700;800;900&family=Merriweather:wght@700;900&display=swap');
        :root { --tfs-navy: #1a3a6b; --tfs-navy-dk: #0d2347; --tfs-orange: #e87722; --tfs-orange-dk: #c75e0a; }
        .tfs-input-login {
          width: 100%; padding: 13px 16px;
          border: 2px solid #e2e8f0; border-radius: 14px;
          font-size: 14px; font-family: 'Nunito', sans-serif;
          outline: none; transition: all 0.2s; background: #fff;
          color: #1e293b;
        }
        .tfs-input-login:focus { border-color: var(--tfs-orange); box-shadow: 0 0 0 4px rgba(232,119,34,0.08); }
        .tfs-btn-login {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, var(--tfs-navy), var(--tfs-navy-dk));
          color: white; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 800; cursor: pointer;
          transition: all 0.2s; display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: 'Nunito', sans-serif;
          box-shadow: 0 6px 20px rgba(26,58,107,0.35);
        }
        .tfs-btn-login:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 10px 28px rgba(26,58,107,0.4); }
        .tfs-btn-login:disabled { opacity: 0.6; cursor: not-allowed; }
        .tfs-quick-btn {
          padding: 7px 13px; border-radius: 10px;
          font-size: 12px; font-weight: 700;
          border: 2px solid #e2e8f0; background: white;
          cursor: pointer; transition: all 0.18s;
          font-family: 'Nunito', sans-serif; color: #475569;
        }
        .tfs-quick-btn:hover { border-color: var(--tfs-orange); color: var(--tfs-orange); transform: translateY(-1px); }
        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-6px)} }
        .floating-badge { animation: floatBadge 3s ease-in-out infinite; }
        .floating-badge:nth-child(2) { animation-delay: 0.5s; }
        .floating-badge:nth-child(3) { animation-delay: 1s; }
        @keyframes shimmer {
          0% { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
        .dot-grid {
          background-image: radial-gradient(circle, rgba(255,255,255,0.07) 1px, transparent 1px);
          background-size: 22px 22px;
        }
        .feature-row { display: flex; align-items: center; gap: 12px; padding: 8px 0; border-bottom: 1px solid rgba(255,255,255,0.06); }
        .feature-row:last-child { border-bottom: none; }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div className="hidden lg:flex lg:w-[55%] flex-col justify-between relative overflow-hidden" style={{ background: 'linear-gradient(150deg, #0d2347 0%, #1a3a6b 50%, #1a3a6b 100%)' }}>
        <div className="dot-grid absolute inset-0" />

        {/* Orange accent blob */}
        <div className="absolute bottom-0 right-0 w-96 h-96 rounded-full opacity-20" style={{ background: 'radial-gradient(circle, #e87722 0%, transparent 70%)', transform: 'translate(30%, 30%)' }} />
        <div className="absolute top-0 left-0 w-64 h-64 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #fbbf24 0%, transparent 70%)', transform: 'translate(-30%, -30%)' }} />

        <div className="relative z-10 p-12 flex-1 flex flex-col justify-center">
          {/* Logo */}
          <div className="flex items-center gap-4 mb-12">
            <div style={{ width: 72, height: 72, borderRadius: '50%', padding: 4, background: 'linear-gradient(135deg, #e87722, #f59e0b)', boxShadow: '0 8px 32px rgba(232,119,34,0.5)', flexShrink: 0 }}>
              <img src="/school-logo.jpeg" alt="School Logo"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.target.style.display='none'; }}
              />
            </div>
            <div>
              <div className="text-white font-black text-xl leading-tight" style={{ fontFamily: 'Merriweather, Georgia, serif' }}>The Future Step School</div>
              <div className="text-sm font-bold" style={{ color: '#f59e0b' }}>K V P S Sanstha Bhaler</div>
              <div className="text-xs" style={{ color: 'rgba(255,255,255,0.5)' }}>School Management Portal</div>
            </div>
          </div>

          {/* Headline */}
          <h1 className="text-white font-black leading-tight mb-4" style={{ fontSize: '38px', fontFamily: 'Merriweather, Georgia, serif' }}>
            Your School,<br />
            <span style={{ color: '#ffd166' }}>Fully Connected.</span>
          </h1>
          <p className="mb-10 leading-relaxed text-base" style={{ color: 'rgba(255,255,255,0.6)', maxWidth: '400px' }}>
            A complete school management platform for The Future Step School — manage students, attendance, fees, exams, and more from one unified portal.
          </p>

          {/* Features list */}
          <div className="mb-10">
            {FEATURES.map(f => (
              <div key={f.text} className="feature-row">
                <div className="w-8 h-8 rounded-lg flex items-center justify-center text-sm flex-shrink-0" style={{ background: 'rgba(232,119,34,0.18)' }}>{f.icon}</div>
                <span className="text-sm font-semibold" style={{ color: 'rgba(255,255,255,0.7)' }}>{f.text}</span>
              </div>
            ))}
          </div>

          {/* Floating stat badges */}
          <div className="flex gap-4 flex-wrap">
            {[
              { icon: '👥', val: '500+', label: 'Students' },
              { icon: '🎓', val: '30+', label: 'Teachers' },
              { icon: '📊', val: '95%', label: 'Pass Rate' },
            ].map((b, i) => (
              <div key={b.label} className="floating-badge px-5 py-3 rounded-2xl flex items-center gap-3" style={{ background: 'rgba(255,255,255,0.07)', border: '1px solid rgba(255,255,255,0.1)' }}>
                <span className="text-xl">{b.icon}</span>
                <div>
                  <div className="font-black text-white text-lg leading-none">{b.val}</div>
                  <div className="text-xs" style={{ color: 'rgba(255,255,255,0.45)' }}>{b.label}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom tagline */}
        <div className="relative z-10 px-12 pb-8">
          <div className="text-xs font-semibold" style={{ color: 'rgba(255,255,255,0.2)', letterSpacing: '0.1em', textTransform: 'uppercase' }}>
            Bhaler, Nandurbar, Maharashtra • inquiry@thefuturestepschool.in
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: '#f8faff' }}>
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden flex flex-col items-center gap-3 mb-8">
            <div style={{ width: 80, height: 80, borderRadius: '50%', padding: 4, background: 'linear-gradient(135deg, #e87722, #f59e0b)', boxShadow: '0 6px 20px rgba(232,119,34,0.4)' }}>
              <img src="/school-logo.jpeg" alt="School Logo"
                style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.target.style.display='none'; }}
              />
            </div>
            <div className="text-center">
              <div className="font-black text-base" style={{ color: '#1a3a6b', fontFamily: 'Merriweather, Georgia, serif' }}>The Future Step School</div>
              <div className="text-xs font-bold" style={{ color: '#e87722' }}>K V P S Sanstha Bhaler</div>
            </div>
          </div>

          {/* Header */}
          <div className="mb-8">
            <h2 className="font-black text-3xl mb-1" style={{ color: '#1a3a6b', fontFamily: 'Merriweather, Georgia, serif' }}>Welcome back 👋</h2>
            <p className="text-sm" style={{ color: '#64748b' }}>Sign in to your school account to continue</p>
          </div>

          {/* Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@school.com"
                className="tfs-input-login"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="block text-xs font-black uppercase tracking-wider mb-1.5" style={{ color: '#94a3b8' }}>Password</label>
              <div className="relative">
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  className="tfs-input-login"
                  style={{ paddingRight: '48px' }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPass(s => !s)}
                  className="absolute right-4 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 text-sm transition-colors">
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="tfs-btn-login" style={{ marginTop: '8px' }}>
              {loading ? (
                <><div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Signing in…</>
              ) : '🔐 Sign In to Portal'}
            </button>
          </form>

          {/* Quick fill accounts */}
          <div className="mt-6 p-4 rounded-2xl border-2" style={{ background: '#f0f4ff', borderColor: '#e2e8f0' }}>
            <div className="text-xs font-black uppercase tracking-widest mb-3" style={{ color: '#94a3b8' }}>Quick Fill — Test Accounts</div>
            <div className="flex flex-wrap gap-2">
              {QUICK_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => setForm({ email: acc.email, password: acc.password })}
                  className="tfs-quick-btn"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          {/* Back to home */}
          <div className="mt-5 text-center">
            <a href="/" className="text-sm font-semibold transition-colors" style={{ color: '#94a3b8' }}>
              ← Back to School Website
            </a>
          </div>
        </div>
      </div>
    </div>
  );
}