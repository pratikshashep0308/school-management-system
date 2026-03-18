import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import toast from 'react-hot-toast';

const QUICK_ACCOUNTS = [
  { label: 'School Admin', email: 'admin@school.com', password: 'Admin@123', role: 'Admin' },
  { label: 'Teacher', email: 'teacher@school.com', password: 'Teacher@123', role: 'Teacher' },
  { label: 'Student', email: 'student@school.com', password: 'Student@123', role: 'Student' },
  { label: 'Parent', email: 'parent@school.com', password: 'Parent@123', role: 'Parent' },
  { label: 'Accountant', email: 'accountant@school.com', password: 'Admin@123', role: 'Accountant' },
  { label: 'Super Admin', email: 'superadmin@school.com', password: 'Admin@123', role: 'SuperAdmin' },
];

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [form, setForm] = useState({ email: 'admin@school.com', password: 'Admin@123' });
  const [loading, setLoading] = useState(false);

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

  const quickFill = (acc) => {
    setForm({ email: acc.email, password: acc.password });
  };

  return (
    <div className="min-h-screen grid lg:grid-cols-2 bg-ink">
      {/* Left Panel */}
      <div className="hidden lg:flex flex-col justify-center items-start p-20 relative overflow-hidden">
        <div className="absolute inset-0" style={{
          background: 'radial-gradient(ellipse at 20% 80%, rgba(212,82,42,0.25) 0%, transparent 60%), radial-gradient(ellipse at 80% 20%, rgba(201,168,76,0.15) 0%, transparent 50%)'
        }} />
        <div className="relative z-10">
          <div className="font-display text-6xl text-paper leading-none mb-6">
            Edu<span className="text-accent">Core</span>
          </div>
          <p className="text-paper/50 font-light text-base leading-relaxed max-w-sm">
            A comprehensive school management platform for the modern educational institution. Manage students, attendance, fees, exams, and more from one unified system.
          </p>
          <div className="flex flex-wrap gap-2 mt-10">
            {['Students','Attendance','Exams','Fees','Library','Transport'].map(tag => (
              <span key={tag} className="px-3 py-1.5 rounded-full border border-white/15 text-white/40 text-xs">✦ {tag}</span>
            ))}
          </div>
        </div>

        {/* Decorative grid */}
        <div className="absolute bottom-10 right-10 grid grid-cols-5 gap-2 opacity-10">
          {[...Array(25)].map((_, i) => (
            <div key={i} className="w-1.5 h-1.5 rounded-full bg-white" />
          ))}
        </div>
      </div>

      {/* Right Panel */}
      <div className="flex items-center justify-center bg-paper px-6 py-12">
        <div className="w-full max-w-sm">
          {/* Mobile logo */}
          <div className="lg:hidden font-display text-4xl text-ink mb-8 text-center">
            Edu<span className="text-accent">Core</span>
          </div>

          <h2 className="font-display text-3xl text-ink mb-1">Welcome back</h2>
          <p className="text-sm text-muted mb-8">Sign in to your account to continue</p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="form-label">Email Address</label>
              <input
                type="email"
                value={form.email}
                onChange={e => setForm(p => ({ ...p, email: e.target.value }))}
                placeholder="admin@school.com"
                className="form-input"
                autoComplete="email"
              />
            </div>
            <div>
              <label className="form-label">Password</label>
              <input
                type="password"
                value={form.password}
                onChange={e => setForm(p => ({ ...p, password: e.target.value }))}
                placeholder="••••••••"
                className="form-input"
                autoComplete="current-password"
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              className="w-full py-3.5 bg-accent text-white font-semibold rounded-xl hover:bg-accent-dark transition-all disabled:opacity-60 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {loading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full animate-spin" />
                  Signing in…
                </>
              ) : 'Sign In'}
            </button>
          </form>

          {/* Quick fill */}
          <div className="mt-6 p-4 bg-warm rounded-xl border border-border">
            <div className="text-[11px] font-semibold text-muted uppercase tracking-wide mb-3">Quick fill — test accounts</div>
            <div className="flex flex-wrap gap-1.5">
              {QUICK_ACCOUNTS.map(acc => (
                <button
                  key={acc.email}
                  onClick={() => quickFill(acc)}
                  className="px-2.5 py-1 rounded-lg border border-border bg-white text-xs text-slate hover:border-accent hover:text-accent transition-all font-medium"
                >
                  {acc.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
