// frontend/src/pages/Login.js
import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const QUICK_ACCOUNTS = [
  { label: 'School Admin', email: 'admin@school.com',      password: 'Admin@123',   color: '#1a3a6b' },
  { label: 'Teacher',      email: 'teacher@school.com',    password: 'Teacher@123', color: '#16a34a' },
  { label: 'Student',      email: 'student@school.com',    password: 'Student@123', color: '#2563eb' },
  { label: 'Parent',       email: 'parent@school.com',     password: 'Parent@123',  color: '#9333ea' },
  { label: 'Accountant',   email: 'accountant@school.com', password: 'Admin@123',   color: '#dc2626' },
  { label: 'Super Admin',  email: 'superadmin@school.com', password: 'Admin@123',   color: '#e87722' },
];

const FEATURES = [
  { icon: '👥', text: 'Student & Staff Management' },
  { icon: '📊', text: 'Attendance & Analytics' },
  { icon: '💰', text: 'Fee Collection & Reports' },
  { icon: '📚', text: 'Library & Transport' },
  { icon: '📝', text: 'Exams & Results' },
  { icon: '🔔', text: 'Instant Notifications' },
];

// ── Rainbow school name — styled like SchoolName.jpeg ─────────────────────────
function RainbowName({ size = 'md' }) {
  const configs = {
    sm:   { fontSizes: [13, 13, 13, 13], spacing: 3 },
    md:   { fontSizes: [18, 18, 18, 18], spacing: 4 },
    lg:   { fontSizes: [26, 26, 26, 26], spacing: 5 },
    hero: { fontSizes: [32, 32, 32, 32], spacing: 6 },
  };
  const cfg = configs[size] || configs.md;
  const words = [
    { text: 'The',    color: '#E53935' },
    { text: 'Future', color: '#43A047' },
    { text: 'Step',   color: '#7B1FA2' },
    { text: 'School', color: '#F57C00' },
  ];

  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: cfg.spacing, alignItems: 'baseline' }}>
      {words.map((w, i) => (
        <span key={i} style={{
          fontSize: cfg.fontSizes[i],
          fontWeight: 900,
          color: w.color,
          fontFamily: "'Merriweather', Georgia, serif",
          lineHeight: 1.1,
          letterSpacing: '-0.5px',
        }}>
          {w.text}
        </span>
      ))}
    </div>
  );
}

// ── School logo pill ──────────────────────────────────────────────────────────
function LogoBadge({ size = 80, ring = '#5C6BC0', shadow = 'rgba(57,73,171,0.45)' }) {
  return (
    <div style={{
      width: size, height: size,
      borderRadius: '50%',
      padding: Math.round(size * 0.04),
      background: `linear-gradient(135deg, ${ring}, #283593)`,
      boxShadow: `0 8px 32px ${shadow}`,
      flexShrink: 0,
    }}>
      <img
        src="/school-logo.jpeg"
        alt="The Future Step School"
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        onError={e => {
          e.target.style.display = 'none';
          e.target.parentElement.style.display = 'flex';
          e.target.parentElement.style.alignItems = 'center';
          e.target.parentElement.style.justifyContent = 'center';
          e.target.parentElement.style.fontSize = `${Math.round(size * 0.45)}px`;
          e.target.parentElement.innerHTML = '💎';
        }}
      />
    </div>
  );
}

export default function Login() {
  const { login } = useAuth();
  const navigate  = useNavigate();
  const [form,     setForm]     = useState({ email: 'admin@school.com', password: 'Admin@123' });
  const [loading,  setLoading]  = useState(false);
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
        :root { --tfs-navy: #1a3a6b; --tfs-navy-dk: #0d2347; --tfs-orange: #e87722; }

        .tfs-input {
          width: 100%; padding: 13px 16px;
          border: 2px solid #e2e8f0; border-radius: 14px;
          font-size: 14px; font-family: 'Nunito', sans-serif;
          outline: none; transition: all 0.2s; background: #fff; color: #1e293b;
          box-sizing: border-box;
        }
        .tfs-input:focus { border-color: #3949AB; box-shadow: 0 0 0 4px rgba(57,73,171,0.10); }

        .tfs-btn {
          width: 100%; padding: 14px;
          background: linear-gradient(135deg, #1a3a6b, #0d2347);
          color: white; border: none; border-radius: 14px;
          font-size: 15px; font-weight: 800; cursor: pointer; transition: all 0.2s;
          display: flex; align-items: center; justify-content: center; gap: 8px;
          font-family: 'Nunito', sans-serif;
          box-shadow: 0 6px 20px rgba(26,58,107,0.35);
        }
        .tfs-btn:hover:not(:disabled) { transform: translateY(-2px); box-shadow: 0 12px 28px rgba(26,58,107,0.42); }
        .tfs-btn:disabled { opacity: 0.6; cursor: not-allowed; }

        .tfs-quick {
          padding: 7px 13px; border-radius: 10px; font-size: 12px; font-weight: 700;
          border: 2px solid #e2e8f0; background: white; cursor: pointer;
          transition: all 0.18s; font-family: 'Nunito', sans-serif; color: #475569;
        }
        .tfs-quick:hover { border-color: #3949AB; color: #3949AB; transform: translateY(-1px); }

        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        .floating-badge { animation: floatBadge 3s ease-in-out infinite; }
        .floating-badge:nth-child(2) { animation-delay: 0.6s; }
        .floating-badge:nth-child(3) { animation-delay: 1.2s; }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }
      `}</style>

      {/* ── LEFT PANEL ── */}
      <div
        className="hidden lg:flex lg:w-[54%] flex-col justify-between relative overflow-hidden"
        style={{ background: 'linear-gradient(150deg, #06112b 0%, #0d2050 50%, #112460 100%)' }}
      >
        {/* Background decorations */}
        <div style={{ position: 'absolute', inset: 0, backgroundImage: 'radial-gradient(circle, rgba(255,255,255,0.04) 1px, transparent 1px)', backgroundSize: '28px 28px' }} />
        <div style={{ position: 'absolute', bottom: '-60px', right: '-60px', width: 400, height: 400, borderRadius: '50%', background: 'radial-gradient(circle, rgba(57,73,171,0.25) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '-60px', left: '-60px', width: 280, height: 280, borderRadius: '50%', background: 'radial-gradient(circle, rgba(92,107,192,0.15) 0%, transparent 70%)' }} />

        {/* Top: Logo + School name */}
        <div className="relative z-10" style={{ padding: '44px 48px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 36 }}>
            <LogoBadge size={76} />
            <div>
              <RainbowName size="lg" />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                K V P S Sanstha Bhaler
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', lineHeight: 1.7, maxWidth: 360, marginBottom: 36 }}>
            A complete school management platform — manage students, attendance, fees, exams, and more from one unified portal.
          </div>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FEATURES.map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(255,255,255,0.07)',
                  border: '1px solid rgba(255,255,255,0.1)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{f.icon}</div>
                <span style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', fontWeight: 600 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: floating stat badges */}
        <div className="relative z-10" style={{ padding: '0 48px 48px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            {[
              { icon: '👥', val: '500+', label: 'Students' },
              { icon: '🎓', val: '30+',  label: 'Teachers' },
              { icon: '📊', val: '95%',  label: 'Pass Rate' },
            ].map((b, i) => (
              <div key={b.label} className="floating-badge" style={{
                padding: '12px 20px', borderRadius: 18,
                background: 'rgba(255,255,255,0.06)',
                border: '1px solid rgba(255,255,255,0.1)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 20 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 900, color: '#fff', fontSize: 18, lineHeight: 1 }}>{b.val}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.4)', marginTop: 2 }}>{b.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.18)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
            Bhaler, Nandurbar, Maharashtra · inquiry@thefuturestepschool.in
          </div>
        </div>
      </div>

      {/* ── RIGHT PANEL ── */}
      <div className="flex-1 flex items-center justify-center px-6 py-12" style={{ background: '#f7f9ff' }}>
        <div className="w-full max-w-sm">

          {/* Mobile: Logo + name */}
          <div className="lg:hidden flex flex-col items-center gap-4 mb-8">
            <LogoBadge size={84} />
            <div className="text-center">
              <RainbowName size="md" />
              <div style={{ fontSize: 11, color: '#94A3B8', marginTop: 4, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase' }}>
                K V P S Sanstha Bhaler
              </div>
            </div>
          </div>

          {/* Welcome heading */}
          <div style={{ marginBottom: 28 }}>
            <h2 style={{ fontSize: 26, fontWeight: 900, color: '#1a3a6b', fontFamily: 'Merriweather, Georgia, serif', margin: '0 0 6px' }}>
              Welcome back 👋
            </h2>
            <p style={{ fontSize: 13, color: '#64748b', margin: 0 }}>
              Sign in to your school account to continue
            </p>
          </div>

          {/* Login form */}
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6 }}>
                Email Address
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@school.com"
                className="tfs-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6 }}>
                Password
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                  placeholder="••••••••"
                  className="tfs-input"
                  style={{ paddingRight: 48 }}
                  autoComplete="current-password"
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#94a3b8',
                }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} className="tfs-btn" style={{ marginTop: 4 }}>
              {loading ? (
                <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
              ) : '🔐 Sign In to Portal'}
            </button>
          </form>

          {/* Quick accounts */}
          <div style={{
            marginTop: 22, padding: '14px 16px',
            borderRadius: 16, border: '2px solid #e8edf5',
            background: '#f0f4ff',
          }}>
            <div style={{ fontSize: 10, fontWeight: 900, textTransform: 'uppercase', letterSpacing: '0.1em', color: '#94a3b8', marginBottom: 10 }}>
              Quick Fill — Test Accounts
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {QUICK_ACCOUNTS.map(acc => (
                <button key={acc.email} className="tfs-quick" onClick={() => setForm({ email: acc.email, password: acc.password })}>
                  {acc.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <a href="/" style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8', textDecoration: 'none' }}>
              ← Back to School Website
            </a>
          </div>
        </div>
      </div>

      <style>{`
        @keyframes spin { to { transform: rotate(360deg); } }
      `}</style>
    </div>
  );
}