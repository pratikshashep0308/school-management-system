// frontend/src/pages/Login.js
import React, { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const FEATURES = [
  { icon: '👥', text: 'Student & Staff Management' },
  { icon: '📊', text: 'Attendance & Analytics' },
  { icon: '💰', text: 'Fee Collection & Reports' },
  { icon: '📚', text: 'Library & Transport' },
  { icon: '📝', text: 'Exams & Results' },
  { icon: '🔔', text: 'Instant Notifications' },
];

// ── Exact letter colors from SchoolName.jpeg ────────────────────────────────
const SCHOOL_LETTER_COLORS = [
  '#E53935','#F57C00','#43A047',null,
  '#43A047','#1565C0','#7B1FA2','#E53935','#43A047','#0097A7',null,
  '#43A047','#E53935','#7B1FA2','#F57C00',null,
  '#43A047','#1565C0','#7B1FA2','#E53935','#F57C00','#1565C0',
];
const SCHOOL_NAME_TEXT = 'The Future Step School';

// ── Floating education symbols for the animated login background ──────────────
const EDU_SYMBOLS = [
  { ch: 'A',  top: '9%',  left: '12%', size: 44, color: '#93c5fd', anim: 'eduFloat', dur: '7s',  delay: '0s',   rot: '-8deg' },
  { ch: 'क',  top: '15%', left: '78%', size: 52, color: '#fca5a5', anim: 'eduDrift', dur: '9s',  delay: '0.6s', rot: '6deg'  },
  { ch: '+',  top: '30%', left: '34%', size: 40, color: '#fcd34d', anim: 'eduFloat', dur: '6s',  delay: '1.2s', rot: '0deg'  },
  { ch: '7',  top: '24%', left: '58%', size: 46, color: '#6ee7b7', anim: 'eduDrift', dur: '8s',  delay: '0.3s', rot: '10deg' },
  { ch: '×',  top: '46%', left: '82%', size: 42, color: '#c4b5fd', anim: 'eduFloat', dur: '7.5s',delay: '0.9s', rot: '-6deg' },
  { ch: 'ग',  top: '52%', left: '18%', size: 50, color: '#7dd3fc', anim: 'eduDrift', dur: '9.5s',delay: '1.5s', rot: '4deg'  },
  { ch: '÷',  top: '64%', left: '46%', size: 40, color: '#f9a8d4', anim: 'eduFloat', dur: '6.5s',delay: '0.5s', rot: '8deg'  },
  { ch: 'B',  top: '70%', left: '74%', size: 44, color: '#fdba74', anim: 'eduDrift', dur: '8.5s',delay: '1.0s', rot: '-10deg'},
  { ch: '=',  top: '80%', left: '28%', size: 40, color: '#a7f3d0', anim: 'eduFloat', dur: '7s',  delay: '0.7s', rot: '0deg'  },
  { ch: 'ब',  top: '82%', left: '60%', size: 48, color: '#fca5a5', anim: 'eduDrift', dur: '9s',  delay: '1.3s', rot: '6deg'  },
  { ch: '3',  top: '38%', left: '10%', size: 42, color: '#93c5fd', anim: 'eduFloat', dur: '6.8s',delay: '0.4s', rot: '-4deg' },
  { ch: 'π',  top: '10%', left: '46%', size: 44, color: '#c4b5fd', anim: 'eduDrift', dur: '8.2s',delay: '1.1s', rot: '8deg'  },
  { ch: '−',  top: '58%', left: '66%', size: 44, color: '#fcd34d', anim: 'eduFloat', dur: '7.2s',delay: '0.2s', rot: '0deg'  },
  { ch: 'अ',  top: '40%', left: '52%', size: 46, color: '#6ee7b7', anim: 'eduDrift', dur: '9.2s',delay: '0.8s', rot: '-6deg' },
];

// Rising symbols that float upward and fade
const EDU_RISERS = [
  { ch: '√',  left: '22%', size: 34, color: 'rgba(147,197,253,0.8)', dur: '11s', delay: '0s'   },
  { ch: '%',  left: '48%', size: 32, color: 'rgba(252,211,77,0.8)',  dur: '13s', delay: '3s'   },
  { ch: 'ॐ',  left: '68%', size: 34, color: 'rgba(196,181,253,0.8)', dur: '12s', delay: '6s'   },
  { ch: '9',  left: '84%', size: 32, color: 'rgba(110,231,183,0.8)', dur: '14s', delay: '1.5s' },
];

function RainbowName({ size = 'lg' }) {
  const heights = { sm:34, md:44, lg:56, xl:64 };
  const h = heights[size] || 56;
  return (
    <img src="/app-logo.png" alt="The Future Step School"
      style={{ height:h, width:'auto', maxWidth:360, display:'block', objectFit:'contain',
               background:'#fff', padding:'8px 14px', borderRadius:10 }} />
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
  const [form,     setForm]     = useState({ email: '', password: '' });     
  const [loading,  setLoading]  = useState(false);
  const [showPass, setShowPass] = useState(false);
  const [errors, setErrors] = useState({});

  const handleSubmit = async (e) => {
    e.preventDefault();
    // Inline per-field validation
    const newErrors = {};
    if (!form.email)    newErrors.email    = 'Email is required';
    if (!form.password) newErrors.password = 'Password is required';
    if (Object.keys(newErrors).length) {
      setErrors(newErrors);
      return;
    }
    setErrors({});
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

        @keyframes floatBadge { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-7px)} }
        .floating-badge { animation: floatBadge 3s ease-in-out infinite; }
        .floating-badge:nth-child(2) { animation-delay: 0.6s; }
        .floating-badge:nth-child(3) { animation-delay: 1.2s; }

        @keyframes shimmer {
          0%   { background-position: -200% center; }
          100% { background-position: 200% center; }
        }

        /* ── Education / floating symbols animations ── */
        @keyframes eduFloat {
          0%,100% { transform: translateY(0) rotate(var(--rot,0deg)); }
          50%     { transform: translateY(-22px) rotate(var(--rot,0deg)); }
        }
        @keyframes eduDrift {
          0%   { transform: translate(0,0) rotate(var(--rot,0deg)); }
          50%  { transform: translate(18px,-14px) rotate(calc(var(--rot,0deg) + 8deg)); }
          100% { transform: translate(0,0) rotate(var(--rot,0deg)); }
        }
        @keyframes eduRise {
          0%   { transform: translateY(30px); opacity: 0; }
          15%  { opacity: 0.9; }
          85%  { opacity: 0.9; }
          100% { transform: translateY(-60px); opacity: 0; }
        }
        @keyframes eduPulse {
          0%,100% { opacity: 0.35; transform: scale(1); }
          50%     { opacity: 0.9; transform: scale(1.12); }
        }
        .edu-scene { position: absolute; inset: 0; overflow: hidden; z-index: 0; pointer-events: none; }
        .edu-sym {
          position: absolute; font-weight: 800;
          font-family: 'Nunito','Segoe UI',sans-serif;
          text-shadow: 0 2px 10px rgba(0,0,0,0.25);
          filter: blur(2.5px);
          will-change: transform;
        }
      `}</style>
      {/* keep old space class harmless */}
      <span style={{ display: 'none' }} className="tfs-space tfs-planet tfs-orbit-wrap tfs-orbit-ring tfs-moon tfs-star" />

      {/* ── LEFT PANEL ── */}
      <div
        className="hidden lg:flex lg:w-[54%] flex-col justify-between relative overflow-hidden"
        style={{ background: 'radial-gradient(ellipse at 25% 15%, #1e3a8a 0%, #14245e 40%, #0a1638 70%, #060d24 100%)' }}
      >
        {/* Background glow decorations */}
        <div style={{ position: 'absolute', bottom: '-80px', right: '-80px', width: 420, height: 420, borderRadius: '50%', background: 'radial-gradient(circle, rgba(99,102,241,0.28) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '-70px', left: '-70px', width: 300, height: 300, borderRadius: '50%', background: 'radial-gradient(circle, rgba(56,189,248,0.20) 0%, transparent 70%)' }} />
        <div style={{ position: 'absolute', top: '45%', right: '30%', width: 220, height: 220, borderRadius: '50%', background: 'radial-gradient(circle, rgba(168,85,247,0.16) 0%, transparent 70%)' }} />

        {/* ── Animated education scene ── */}
        <div className="edu-scene" aria-hidden="true">
          {EDU_SYMBOLS.map((s, i) => (
            <span
              key={i}
              className="edu-sym"
              style={{
                top: s.top, left: s.left,
                fontSize: s.size, color: s.color,
                ['--rot']: s.rot,
                animation: `${s.anim} ${s.dur} ease-in-out infinite`,
                animationDelay: s.delay,
                opacity: 0.85,
              }}
            >{s.ch}</span>
          ))}
          {EDU_RISERS.map((s, i) => (
            <span
              key={`r${i}`}
              className="edu-sym"
              style={{
                bottom: 0, left: s.left,
                fontSize: s.size, color: s.color,
                animation: `eduRise ${s.dur} linear infinite`,
                animationDelay: s.delay,
              }}
            >{s.ch}</span>
          ))}
        </div>

        {/* Top: Logo + School name */}
        <div className="relative z-10" style={{ padding: '44px 48px 0' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 18, marginBottom: 36 }}>
            <LogoBadge size={76} />
            <div>
              <RainbowName size="lg" />
              <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.35)', marginTop: 5, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
                
              </div>
            </div>
          </div>

          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.92)', lineHeight: 1.7, maxWidth: 360, marginBottom: 36 }}>
            A complete school management platform — manage students, attendance, fees, exams, and more from one unified portal.
          </div>

          {/* Feature list */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            {FEATURES.map(f => (
              <div key={f.text} style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{
                  width: 34, height: 34, borderRadius: 10,
                  background: 'rgba(255,255,255,0.18)',
                  border: '1px solid rgba(255,255,255,0.28)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  fontSize: 16, flexShrink: 0,
                }}>{f.icon}</div>
                <span style={{ fontSize: 13, color: '#ffffff', fontWeight: 600 }}>{f.text}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Bottom: floating stat badges */}
        <div className="relative z-10" style={{ padding: '0 48px 48px' }}>
          <div style={{ display: 'flex', gap: 14, flexWrap: 'wrap', marginBottom: 28 }}>
            {[
              { icon: '👥', val: '500+', label: 'Students' },
              { icon: '🎓', val: '30+',  label: 'Employees' },
              { icon: '📊', val: '95%',  label: 'Pass Rate' },
            ].map((b, i) => (
              <div key={b.label} className="floating-badge" style={{
                padding: '12px 20px', borderRadius: 18,
                background: 'rgba(255,255,255,0.16)',
                border: '1px solid rgba(255,255,255,0.28)',
                display: 'flex', alignItems: 'center', gap: 12,
              }}>
                <span style={{ fontSize: 20 }}>{b.icon}</span>
                <div>
                  <div style={{ fontWeight: 900, color: '#fff', fontSize: 18, lineHeight: 1 }}>{b.val}</div>
                  <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.85)', marginTop: 2 }}>{b.label}</div>
                </div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10.5, color: 'rgba(255,255,255,0.75)', fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase' }}>
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
          <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }} noValidate>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6 }}>
                Email Address <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>
              </label>
              <input
                type="email"
                value={form.email}
                onChange={e => { setForm(p => ({ ...p, email: e.target.value })); setErrors(x => ({ ...x, email: '' })); }}
                placeholder="admin@school.com"
                className="tfs-input"
                style={errors.email ? { borderColor: '#DC2626' } : {}}
                autoComplete="email"
                required
                aria-required="true"
                aria-invalid={!!errors.email}
              />
              {errors.email && (
                <div style={{ color: '#DC2626', fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                  {errors.email}
                </div>
              )}
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#94a3b8', marginBottom: 6 }}>
                Password <span style={{ color: '#DC2626', marginLeft: 2 }}>*</span>
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPass ? 'text' : 'password'}
                  value={form.password}
                  onChange={e => { setForm(p => ({ ...p, password: e.target.value })); setErrors(x => ({ ...x, password: '' })); }}
                  placeholder="••••••••"
                  className="tfs-input"
                  style={{ paddingRight: 48, ...(errors.password ? { borderColor: '#DC2626' } : {}) }}
                  autoComplete="current-password"
                  required
                  aria-required="true"
                  aria-invalid={!!errors.password}
                />
                <button type="button" onClick={() => setShowPass(s => !s)} style={{
                  position: 'absolute', right: 14, top: '50%', transform: 'translateY(-50%)',
                  background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#94a3b8',
                }}>
                  {showPass ? '🙈' : '👁'}
                </button>
              </div>
              {errors.password && (
                <div style={{ color: '#DC2626', fontSize: 12, marginTop: 4, fontWeight: 600 }}>
                  {errors.password}
                </div>
              )}
            </div>

            <button type="submit" disabled={loading} className="tfs-btn" style={{ marginTop: 4 }}>
              {loading ? (
                <><div style={{ width: 16, height: 16, border: '2px solid rgba(255,255,255,0.4)', borderTopColor: '#fff', borderRadius: '50%', animation: 'spin 0.7s linear infinite' }} /> Signing in…</>
              ) : '🔐 Sign In to Portal'}
            </button>
            <div style={{ textAlign:'center', marginTop:12 }}>
              <a href="/forgot-password" style={{ fontSize:13, color:'#6366F1', textDecoration:'none', fontWeight:600 }}>
                🔑 Forgot password?
              </a>
            </div>
          </form>

          

          <div style={{ marginTop: 18, textAlign: 'center' }}>
            <a href="/home" style={{ fontSize: 12.5, fontWeight: 600, color: '#94a3b8', textDecoration: 'none' }}>
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