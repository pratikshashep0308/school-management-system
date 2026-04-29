import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';

// ── Scroll-triggered counter animation ──
function CountUp({ end, suffix = '', duration = 2000 }) {
  const [count, setCount] = useState(0);
  const ref = useRef(null);
  const started = useRef(false);

  useEffect(() => {
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting && !started.current) {
        started.current = true;
        const step = end / (duration / 16);
        let current = 0;
        const timer = setInterval(() => {
          current = Math.min(current + step, end);
          setCount(Math.floor(current));
          if (current >= end) clearInterval(timer);
        }, 16);
      }
    }, { threshold: 0.3 });
    if (ref.current) observer.observe(ref.current);
    return () => observer.disconnect();
  }, [end, duration]);

  return <span ref={ref}>{count.toLocaleString()}{suffix}</span>;
}

// ── Admission public form ──
function AdmissionForm() {
  const [form, setForm] = useState({ name: '', dob: '', grade: '', parentName: '', phone: '', email: '', prevSchool: '' });
  const [submitted, setSubmitted] = useState(false);
  const [loading, setLoading] = useState(false);
  const set = (k, v) => setForm(p => ({ ...p, [k]: v }));

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!form.name || !form.parentName || !form.phone || !form.email || !form.grade) return;
    setLoading(true);
    try {
      const res = await fetch(`${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/admissions/public`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) setSubmitted(true);
    } catch { setSubmitted(true); }
    finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold mb-3" style={{ color: 'var(--tfs-navy)' }}>Application Submitted!</h3>
        <p className="text-slate-500 max-w-sm mx-auto">Thank you for applying to The Future Step School. Our admissions team will contact you within 2–3 working days.</p>
        <button onClick={() => setSubmitted(false)} className="mt-6 px-6 py-2.5 text-white rounded-full font-semibold transition-all" style={{ background: 'var(--tfs-orange)' }}>
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Student's Full Name *</label>
        <input className="tfs-input" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Rahul Patil" required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Date of Birth</label>
        <input type="date" className="tfs-input" value={form.dob} onChange={e => set('dob', e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Applying for Class *</label>
        <select className="tfs-input" value={form.grade} onChange={e => set('grade', e.target.value)} required>
          <option value="">Select Grade</option>
          <option value="LKG">LKG</option>
          <option value="UKG">UKG</option>
          {[1,2,3,4,5,6,7,8,9,10].map(g => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Parent / Guardian Name *</label>
        <input className="tfs-input" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Suresh Patil" required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number *</label>
        <input className="tfs-input" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address *</label>
        <input type="email" className="tfs-input" value={form.email} onChange={e => set('email', e.target.value)} placeholder="parent@email.com" required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Previous School (if any)</label>
        <input className="tfs-input" value={form.prevSchool} onChange={e => set('prevSchool', e.target.value)} placeholder="Previous school name" />
      </div>
      <div className="md:col-span-2">
        <button type="submit" disabled={loading} className="w-full py-4 text-white font-bold rounded-xl transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-base" style={{ background: 'var(--tfs-navy)' }}>
          {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block animate-spin" />Submitting…</> : 'Submit Application →'}
        </button>
      </div>
    </form>
  );
}

// ── News ticker item ──
function NewsTicker() {
  const news = [
    'Welcome to The Future Step School.',
    'Secure your children\'s future with The Future Step School.',
    'Admission open for LKG, UKG & Grade 1!',
    'Registration Start — Hurry Up!!!',
    'CCTV monitored classrooms for student safety.',
    'School transport available for all routes.',
  ];
  const [idx, setIdx] = useState(0);
  useEffect(() => {
    const t = setInterval(() => setIdx(i => (i + 1) % news.length), 3000);
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-center gap-3 overflow-hidden">
      <span className="text-sm text-white/80 transition-all duration-500 animate-pulse">{news[idx]}</span>
    </div>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [activeSlide, setActiveSlide] = useState(0);

  const slides = [
    { bg: 'linear-gradient(135deg, #1a3a6b 0%, #0d2347 100%)', title: 'Admissions Open', sub: 'LKG, UKG & Grade 1', icon: '🎓' },
    { bg: 'linear-gradient(135deg, #e87722 0%, #c75e0a 100%)', title: 'Digital Classrooms', sub: 'Future-Ready Learning', icon: '💻' },
    { bg: 'linear-gradient(135deg, #2d6a4f 0%, #1b4332 100%)', title: 'Safe Campus', sub: 'CCTV Monitored 24/7', icon: '🛡' },
    { bg: 'linear-gradient(135deg, #1a3a6b 0%, #e87722 100%)', title: 'Sports & Activities', sub: 'Holistic Development', icon: '⚽' },
  ];

  useEffect(() => {
    const t = setInterval(() => setActiveSlide(i => (i + 1) % slides.length), 4000);
    return () => clearInterval(t);
  }, []);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const facilities = [
    { icon: '🚌', name: 'School Transport', desc: 'Safe and secure transport service covering all major routes.' },
    { icon: '🛝', name: 'Playground', desc: 'State-of-the-art safety measures for worry-free play.' },
    { icon: '💻', name: 'Digital Classroom', desc: 'All teaching materials and communication conducted online.' },
    { icon: '📹', name: 'CCTV Monitoring', desc: 'Classrooms equipped with cameras for complete safety.' },
  ];

  const academics = [
    { icon: '💻', name: 'Digital Classrooms' },
    { icon: '🧠', name: 'Adaptive Learning' },
    { icon: '💃', name: 'Athletic & Dance' },
    { icon: '🗣', name: 'Language & Speaking' },
    { icon: '📜', name: 'History' },
    { icon: '🌍', name: 'General Knowledge' },
  ];

  return (
    <div className="tfs-root font-sans text-slate-800 overflow-x-hidden">
      <style>{`
        :root {
          --tfs-navy: #1a3a6b;
          --tfs-navy-dark: #0d2347;
          --tfs-orange: #e87722;
          --tfs-orange-dark: #c75e0a;
          --tfs-light: #f5f8ff;
          --tfs-cream: #fffdf8;
        }
        .tfs-root { font-family: 'Segoe UI', 'Nunito', system-ui, sans-serif; }
        .tfs-serif { font-family: Georgia, 'Times New Roman', serif; }
        .tfs-navy-bg { background-color: var(--tfs-navy); }
        .tfs-orange-bg { background-color: var(--tfs-orange); }
        .tfs-navy-text { color: var(--tfs-navy); }
        .tfs-orange-text { color: var(--tfs-orange); }
        .tfs-input {
          width: 100%;
          padding: 12px 16px;
          border: 2px solid #e2e8f0;
          border-radius: 12px;
          font-size: 14px;
          outline: none;
          transition: border-color 0.2s;
          background: white;
        }
        .tfs-input:focus { border-color: var(--tfs-orange); }
        .tfs-card { transition: all 0.3s ease; }
        .tfs-card:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(26,58,107,0.12); }
        @keyframes tfsFloat { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-8px)} }
        .tfs-float { animation: tfsFloat 3.5s ease-in-out infinite; }
        @keyframes tfsFadeUp { from{opacity:0;transform:translateY(20px)} to{opacity:1;transform:translateY(0)} }
        .tfs-fade { animation: tfsFadeUp 0.7s ease forwards; }
        @keyframes tickerScroll {
          0% { transform: translateX(100%); }
          100% { transform: translateX(-100%); }
        }
        .ticker-inner { animation: tickerScroll 20s linear infinite; white-space: nowrap; }
        .slide-transition { transition: all 0.6s ease; }
        .tfs-section-label {
          display: inline-block;
          padding: 4px 14px;
          border-radius: 20px;
          font-size: 11px;
          font-weight: 700;
          letter-spacing: 0.1em;
          text-transform: uppercase;
          background: rgba(232,119,34,0.12);
          color: var(--tfs-orange);
          margin-bottom: 14px;
        }
        .tfs-btn-primary {
          background: var(--tfs-orange);
          color: white;
          padding: 14px 32px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 15px;
          border: none;
          cursor: pointer;
          transition: all 0.2s;
          display: inline-block;
        }
        .tfs-btn-primary:hover { background: var(--tfs-orange-dark); transform: translateY(-2px); }
        .tfs-btn-outline {
          background: transparent;
          color: white;
          padding: 14px 32px;
          border-radius: 50px;
          font-weight: 700;
          font-size: 15px;
          border: 2px solid rgba(255,255,255,0.4);
          cursor: pointer;
          transition: all 0.2s;
        }
        .tfs-btn-outline:hover { background: rgba(255,255,255,0.15); }
        .dot-pattern {
          background-image: radial-gradient(circle, rgba(255,255,255,0.06) 1px, transparent 1px);
          background-size: 24px 24px;
        }
        .wave-divider {
          position: absolute;
          bottom: -1px;
          left: 0;
          right: 0;
          overflow: hidden;
          line-height: 0;
        }
      `}</style>

      {/* ── TOP INFO BAR ── */}
      <div className="tfs-orange-bg text-white text-xs py-2 px-4 hidden md:block">
        <div className="max-w-7xl mx-auto flex justify-between items-center">
          <div className="flex items-center gap-6">
            <span>📞 +91 706555543 / +91 9404820296</span>
            <span>✉️ inquiry@thefuturestepschool.in</span>
          </div>
          <div className="flex items-center gap-4">
            <span>📍 Bhaler, Nandurbar, Maharashtra – 425412</span>
          </div>
        </div>
      </div>

      {/* ── NAVBAR ── */}
      <nav className={`sticky top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'shadow-lg' : ''}`} style={{ background: 'var(--tfs-navy)' }}>
        <div className="max-w-7xl mx-auto px-6 h-18 py-3 flex items-center justify-between">
          {/* Logo */}
          <div className="flex items-center gap-3">
            <div style={{ width: 48, height: 48, borderRadius: '50%', padding: 3, background: 'linear-gradient(135deg, #e87722, #f59e0b)', boxShadow: '0 4px 12px rgba(232,119,34,0.4)', flexShrink: 0 }}>
              <img src="/school-logo.jpeg" alt="School Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display='none'; }} />
            </div>
            <div>
              <div style={{ fontFamily: "'Georgia', 'Times New Roman', serif", fontWeight: 900, fontSize: 13.5, fontStyle: 'italic', lineHeight: 1.15, display: 'flex', flexWrap: 'wrap' }}>
                {['#E53935','#F57C00','#43A047',null,'#43A047','#1565C0','#7B1FA2','#E53935','#43A047','#0097A7',null,'#43A047','#E53935','#7B1FA2','#F57C00',null,'#43A047','#1565C0','#7B1FA2','#E53935','#F57C00','#1565C0'].map((color, i) => {
                  const ch = 'The Future Step School'[i];
                  if (!ch) return null;
                  if (ch === ' ') return <span key={i} style={{ width:4 }}>&nbsp;</span>;
                  return <span key={i} style={{ color }}>{ch}</span>;
                })}
              </div>
              <div className="text-xs leading-tight" style={{ color: 'rgba(255,255,255,0.4)', marginTop: 1, letterSpacing: '0.04em' }}>K V P S Sanstha Bhaler</div>
            </div>
          </div>

          {/* Desktop Nav */}
          <div className="hidden md:flex items-center gap-1">
            {[
              { label: 'Home', id: 'hero' },
              { label: 'About Us', id: 'about' },
              { label: 'Facilities', id: 'facilities' },
              { label: 'Academics', id: 'academics' },
              { label: 'Admissions', id: 'admissions' },
              { label: 'Contact', id: 'contact' },
            ].map(item => (
              <button key={item.label} onClick={() => scrollTo(item.id)}
                className="text-sm font-semibold text-white/80 hover:text-white px-4 py-2 rounded-lg hover:bg-white/10 transition-all">
                {item.label}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className="hidden md:flex items-center gap-2 px-5 py-2.5 rounded-full text-sm font-bold text-white transition-all" style={{ background: 'var(--tfs-orange)' }}>
              🔐 Portal Login
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className="md:hidden text-white p-2">
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} />
              </svg>
            </button>
          </div>
        </div>

        {/* Mobile Menu */}
        {menuOpen && (
          <div className="md:hidden border-t border-white/10 px-6 py-4 space-y-2" style={{ background: 'var(--tfs-navy-dark)' }}>
            {['Home', 'About Us', 'Facilities', 'Academics', 'Admissions', 'Contact'].map(item => (
              <button key={item} onClick={() => scrollTo(item.toLowerCase().replace(' ', '-'))} className="block w-full text-left text-sm font-semibold text-white/80 py-2.5 hover:text-white border-b border-white/5">{item}</button>
            ))}
            <button onClick={() => navigate('/login')} className="w-full mt-2 px-5 py-3 text-white rounded-full text-sm font-bold" style={{ background: 'var(--tfs-orange)' }}>Login to Portal</button>
          </div>
        )}
      </nav>

      {/* ── NEWS TICKER ── */}
      <div className="bg-yellow-50 border-b border-yellow-200 py-2.5 px-4 overflow-hidden">
        <div className="max-w-7xl mx-auto flex items-center gap-3">
          <span className="text-xs font-bold px-3 py-1 rounded text-white flex-shrink-0" style={{ background: 'var(--tfs-navy)' }}>📢 Latest News</span>
          <div className="overflow-hidden flex-1">
            <div className="ticker-inner text-sm font-medium" style={{ color: 'var(--tfs-navy)' }}>
              ✦ Welcome to The Future Step School &nbsp;&nbsp;&nbsp; ✦ Secure your children's future with The Future Step School &nbsp;&nbsp;&nbsp; ✦ Admission open for LKG, UKG & Grade 1 &nbsp;&nbsp;&nbsp; ✦ Registration Start — Hurry Up!!! &nbsp;&nbsp;&nbsp;
            </div>
          </div>
        </div>
      </div>

      {/* ── HERO CAROUSEL ── */}
      <section id="hero" className="relative overflow-hidden" style={{ minHeight: '75vh' }}>
        <div className="slide-transition dot-pattern w-full h-full absolute inset-0 flex items-center justify-center" style={{ background: slides[activeSlide].bg }}>
        </div>
        <div className="relative z-10 max-w-7xl mx-auto px-6 py-20 flex flex-col md:flex-row items-center gap-12 min-h-[75vh]">
          <div className="flex-1 tfs-fade">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-white/30 bg-white/10 text-white text-xs font-bold uppercase tracking-widest mb-6">
              <span className="w-2 h-2 rounded-full bg-yellow-300 animate-pulse" />
              Admissions Open 2025–26
            </div>
            <h1 className="tfs-serif text-4xl md:text-6xl leading-tight mb-5 font-bold">
              <span style={{ color: '#EF5350' }}>The </span>
              <span style={{ color: '#66BB6A' }}>Future </span>
              <span style={{ color: '#CE93D8' }}>Step</span><br />
              <span style={{ color: '#FFB74D' }}>School</span>
            </h1>
            <p className="text-white/75 text-lg leading-relaxed max-w-xl mb-8">
              Nurturing young minds with quality education, digital classrooms, and a safe environment. Shaping the responsible citizens of tomorrow.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => scrollTo('admissions')} className="tfs-btn-primary">
                Apply for Admission →
              </button>
              <button onClick={() => scrollTo('about')} className="tfs-btn-outline">
                Explore School
              </button>
            </div>
            {/* Badges */}
            <div className="flex flex-wrap gap-3 mt-10">
              {[
                { icon: '🏫', text: 'Est. School', sub: 'Bhaler, Nandurbar' },
                { icon: '📹', text: 'CCTV Campus', sub: 'Safe & Secure' },
                { icon: '💻', text: 'Digital Classes', sub: 'Smart Learning' },
              ].map(b => (
                <div key={b.text} className="flex items-center gap-2.5 px-4 py-2.5 rounded-2xl bg-white/12 border border-white/15">
                  <span className="text-xl">{b.icon}</span>
                  <div>
                    <div className="text-white font-bold text-xs">{b.text}</div>
                    <div className="text-white/55 text-xs">{b.sub}</div>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Slide visual */}
          <div className="flex-shrink-0 tfs-float hidden md:block">
            <div className="w-72 h-72 rounded-full bg-white/10 border-2 border-white/20 flex items-center justify-center" style={{ fontSize: '120px' }}>
              {slides[activeSlide].icon}
            </div>
          </div>
        </div>

        {/* Slide dots */}
        <div className="absolute bottom-6 left-1/2 -translate-x-1/2 flex gap-2 z-10">
          {slides.map((_, i) => (
            <button key={i} onClick={() => setActiveSlide(i)}
              className={`rounded-full transition-all ${i === activeSlide ? 'w-8 h-3 bg-white' : 'w-3 h-3 bg-white/40'}`} />
          ))}
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section style={{ background: 'var(--tfs-orange)' }}>
        <div className="max-w-7xl mx-auto px-6 py-7 grid grid-cols-2 md:grid-cols-4 gap-6 text-white text-center">
          {[
            { value: 500, suffix: '+', label: 'Students Enrolled' },
            { value: 30, suffix: '+', label: 'Qualified Teachers' },
            { value: 6, suffix: '', label: 'Years of Service' },
            { value: 95, suffix: '%', label: 'Pass Rate' },
          ].map(s => (
            <div key={s.label}>
              <div className="tfs-serif text-4xl font-bold text-white"><CountUp end={s.value} suffix={s.suffix} /></div>
              <div className="text-white/80 text-sm mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="py-24" style={{ background: 'var(--tfs-cream)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="tfs-section-label">About Us</div>
              <h2 className="tfs-serif text-4xl md:text-5xl font-bold leading-tight mb-6" style={{ color: 'var(--tfs-navy)' }}>
                Adaptive and Fun<br />Learning for Kids
              </h2>
              <p className="text-slate-600 leading-relaxed mb-5">
                Adaptive and fun learning for kids is an exciting educational approach that caters to young learners' individual needs and preferences. At The Future Step School we combine personalized content, interactive activities, and engaging challenges to create a positive and enjoyable learning environment.
              </p>
              <p className="text-slate-600 leading-relaxed mb-8">
                Children explore topics through games, collaborate on projects, and receive real-time feedback — making education not only effective but also delightful! Our experienced faculty and modern infrastructure are designed to unlock every child's potential.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Location', value: 'Bhaler, Nandurbar' },
                  { label: 'Medium', value: 'Semi-English' },
                  { label: 'Classes', value: 'LKG – Grade 10' },
                  { label: 'Campus', value: 'CCTV Monitored' },
                ].map(({ label, value }) => (
                  <div key={label} className="p-4 bg-white rounded-2xl border border-slate-100 shadow-sm">
                    <div className="text-xs text-slate-400 font-bold uppercase tracking-wide">{label}</div>
                    <div className="font-bold text-base mt-1" style={{ color: 'var(--tfs-navy)' }}>{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="rounded-3xl overflow-hidden aspect-[4/3] flex items-center justify-center relative dot-pattern" style={{ background: 'var(--tfs-navy)' }}>
                <div className="relative z-10 text-center text-white p-8">
                  <div className="text-8xl mb-4 tfs-float">🏫</div>
                  <div className="tfs-serif text-2xl font-bold" style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                    <span style={{ color: '#E53935' }}>The</span>
                    <span style={{ color: '#388E3C' }}>Future</span>
                    <span style={{ color: '#7B1FA2' }}>Step</span>
                    <span style={{ color: '#F57C00' }}>School</span>
                  </div>
                  <div className="text-white/60 mt-2 text-sm">Smt. K.P. Patil School Compound<br />Shindgavhan Road, Bhaler</div>
                  <div className="mt-5 flex flex-wrap gap-2 justify-center">
                    {['Digital Classrooms', 'CCTV Monitored', 'Safe Transport'].map(tag => (
                      <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white/80 border border-white/20">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Floating card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl p-5 shadow-2xl border border-slate-100">
                <div className="tfs-serif text-3xl font-bold" style={{ color: 'var(--tfs-navy)' }}>95%</div>
                <div className="text-slate-500 text-sm mt-1">Exam Pass Rate</div>
                <div className="flex items-center gap-1 mt-2">
                  {[...Array(5)].map((_, i) => <span key={i} className="text-yellow-400 text-sm">★</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── FACILITIES ── */}
      <section id="facilities" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="tfs-section-label">Campus Life</div>
            <h2 className="tfs-serif text-4xl font-bold mb-3" style={{ color: 'var(--tfs-navy)' }}>School Facilities</h2>
            <p className="text-slate-500 max-w-xl mx-auto">Our campus is built to provide a safe, modern, and enriching environment for every child.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-4 gap-6">
            {facilities.map((f, i) => (
              <div key={f.name} className="tfs-card p-7 rounded-3xl border-2 border-slate-100 hover:border-orange-200 text-center cursor-default" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="w-16 h-16 rounded-2xl flex items-center justify-center text-4xl mx-auto mb-5" style={{ background: 'rgba(26,58,107,0.07)' }}>{f.icon}</div>
                <h3 className="font-bold text-base mb-2" style={{ color: 'var(--tfs-navy)' }}>{f.name}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── SPORTS ── */}
      <section className="py-20 dot-pattern" style={{ background: 'var(--tfs-navy)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-14 items-center">
            <div>
              <div className="inline-block px-3 py-1 rounded-full text-xs font-bold uppercase tracking-widest mb-5 bg-white/10 text-white/80">Sports Facilities</div>
              <h2 className="tfs-serif text-3xl md:text-4xl font-bold text-white mb-5">Arenas for Growth &amp; Camaraderie</h2>
              <p className="text-white/70 leading-relaxed mb-5">
                Sports facilities at The Future Step School are not just physical spaces; they are arenas for growth, camaraderie, and personal development. Students are encouraged to explore their interests, challenge themselves, and build lifelong healthy habits.
              </p>
              <p className="text-white/70 leading-relaxed mb-7">
                Beyond the physical benefits, engagement in sports fosters valuable life skills such as resilience, discipline, and sportsmanship — preparing students for success both on and off the field.
              </p>
              <div className="flex flex-wrap gap-3">
                {['Basketball', 'Cricket', 'Athletics', 'Kabaddi', 'Yoga', 'Martial Arts'].map(sport => (
                  <span key={sport} className="px-4 py-2 rounded-full text-sm font-semibold border border-white/20 text-white/80 bg-white/8">{sport}</span>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              {[
                { emoji: '🏏', label: 'Cricket Ground' },
                { emoji: '🏀', label: 'Basketball Court' },
                { emoji: '🤸', label: 'Gymnastics' },
                { emoji: '🧘', label: 'Yoga & Fitness' },
              ].map(s => (
                <div key={s.label} className="tfs-card aspect-square rounded-3xl flex flex-col items-center justify-center gap-3 border border-white/10 bg-white/5 hover:bg-white/12 cursor-default">
                  <span className="text-5xl">{s.emoji}</span>
                  <span className="text-white/80 text-sm font-semibold">{s.label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* ── ACADEMICS ── */}
      <section id="academics" className="py-24" style={{ background: 'var(--tfs-light)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="tfs-section-label">School Academics</div>
            <h2 className="tfs-serif text-4xl font-bold mb-3" style={{ color: 'var(--tfs-navy)' }}>Information on Subjects &amp; Approach</h2>
            <p className="text-slate-500 max-w-xl mx-auto">A holistic curriculum designed to spark curiosity and build confident, capable learners.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-5">
            {academics.map((a, i) => (
              <div key={a.name} className="tfs-card text-center p-6 bg-white rounded-2xl border border-slate-100 shadow-sm hover:shadow-md cursor-default">
                <div className="text-4xl mb-3">{a.icon}</div>
                <div className="text-sm font-bold" style={{ color: 'var(--tfs-navy)' }}>{a.name}</div>
              </div>
            ))}
          </div>

          {/* Teacher section */}
          <div className="mt-20 grid md:grid-cols-2 gap-14 items-center">
            <div className="rounded-3xl overflow-hidden bg-gradient-to-br from-orange-50 to-orange-100 flex items-center justify-center p-12 text-center">
              <div>
                <div className="text-8xl mb-4">👩‍🏫</div>
                <div className="font-bold text-lg" style={{ color: 'var(--tfs-navy)' }}>Dedicated Teacher Staff</div>
                <div className="text-slate-500 text-sm mt-2">30+ Qualified Educators</div>
              </div>
            </div>
            <div>
              <div className="tfs-section-label">Supportive Teacher Staff</div>
              <h2 className="tfs-serif text-3xl font-bold leading-tight mb-5" style={{ color: 'var(--tfs-navy)' }}>Passionate About Education</h2>
              <p className="text-slate-600 leading-relaxed mb-5">
                Good school teacher staff is essential for creating a positive and effective learning environment. At The Future Step School, our staff is passionate about education and genuinely cares about the success and well-being of every student.
              </p>
              <p className="text-slate-600 leading-relaxed">
                They inspire and motivate students to learn, fostering a love for learning that extends beyond the classroom — shaping not just students, but future citizens.
              </p>
              <div className="mt-7 flex flex-wrap gap-3">
                {['Passionate', 'Experienced', 'Caring', 'Dedicated'].map(tag => (
                  <span key={tag} className="px-4 py-2 text-sm font-bold rounded-full border-2 border-orange-200" style={{ color: 'var(--tfs-orange)' }}>{tag}</span>
                ))}
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── RESPONSIBLE CITIZEN ── */}
      <section className="py-20 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="rounded-3xl p-10 md:p-16 text-center dot-pattern" style={{ background: 'var(--tfs-navy)' }}>
            <div className="text-6xl mb-5">🌏</div>
            <h2 className="tfs-serif text-3xl md:text-4xl font-bold text-white mb-5">Responsible Citizen / Human Being</h2>
            <p className="text-white/70 leading-relaxed max-w-3xl mx-auto">
              At The Future Step School, teaching kids to be responsible citizens and human beings is an essential part of our curriculum. We believe responsible citizens are those who care about themselves, others, and the environment — acting in ways that reflect their values and principles. Our school plays a vital role in fostering responsibility, humanity, and integrity among students.
            </p>
            <button onClick={() => scrollTo('admissions')} className="tfs-btn-primary mt-8 inline-block">
              Enroll Your Child Today →
            </button>
          </div>
        </div>
      </section>

      {/* ── ADMISSIONS ── */}
      <section id="admissions" className="py-24" style={{ background: 'var(--tfs-cream)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <div className="tfs-section-label">Admissions 2025–26</div>
              <h2 className="tfs-serif text-4xl font-bold leading-tight mb-6" style={{ color: 'var(--tfs-navy)' }}>Begin Your Child's<br />Journey With Us</h2>
              <p className="text-slate-600 leading-relaxed mb-8">
                Admissions to The Future Step School are open for LKG, UKG & Grade 1. We welcome students with a passion for learning and a desire to grow. Secure your child's future today!
              </p>
              <div className="space-y-5">
                {[
                  { step: '01', title: 'Submit Application', desc: 'Fill out the form with student and parent details.' },
                  { step: '02', title: 'Document Verification', desc: 'Submit required documents within 5 working days.' },
                  { step: '03', title: 'Interaction Session', desc: 'Brief meeting with the admissions coordinator.' },
                  { step: '04', title: 'Confirmation', desc: 'Receive admission confirmation and fee structure.' },
                ].map(step => (
                  <div key={step.step} className="flex gap-4 items-start">
                    <div className="w-10 h-10 rounded-full text-white font-bold text-sm flex items-center justify-center flex-shrink-0" style={{ background: 'var(--tfs-orange)' }}>{step.step}</div>
                    <div>
                      <div className="font-bold" style={{ color: 'var(--tfs-navy)' }}>{step.title}</div>
                      <div className="text-slate-500 text-sm">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-8 p-5 rounded-2xl border-2 border-orange-200 bg-orange-50">
                <div className="font-bold text-sm mb-1" style={{ color: 'var(--tfs-orange)' }}>📞 Contact for Admissions</div>
                <div className="text-slate-600 text-sm">+91 706555543 &nbsp;|&nbsp; +91 9404820296 &nbsp;|&nbsp; +91 9764773692</div>
              </div>
            </div>
            <div className="bg-white rounded-3xl p-8 border border-slate-100 shadow-lg">
              <h3 className="tfs-serif text-2xl font-bold mb-6" style={{ color: 'var(--tfs-navy)' }}>Online Admission Form</h3>
              <AdmissionForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="py-24 dot-pattern" style={{ background: 'var(--tfs-navy)' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="tfs-serif text-4xl font-bold text-white mb-3">Get In Touch</h2>
            <p className="text-white/50">We're here to answer all your questions about admissions and school life.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: '📍', title: 'Address', lines: ['Smt. K. P. Patil School Compound', 'Shindgavhan Road, A/P Bhaler', 'Tal/Dist. Nandurbar, M.S. – 425412'] },
              { icon: '📞', title: 'Phone', lines: ['+91 706555543', '+91 9404820296', '+91 9764773692'] },
              { icon: '✉️', title: 'Email', lines: ['inquiry@thefuturestepschool.in'] },
            ].map(c => (
              <div key={c.title} className="text-center p-8 rounded-3xl bg-white/5 border border-white/10 tfs-card">
                <div className="text-4xl mb-4">{c.icon}</div>
                <div className="font-bold text-white mb-3">{c.title}</div>
                {c.lines.map(l => <div key={l} className="text-white/60 text-sm leading-relaxed">{l}</div>)}
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <button onClick={() => navigate('/login')} className="tfs-btn-primary text-lg px-10 py-4">
              🔐 Access School Portal →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="text-white py-14" style={{ background: '#07152b' }}>
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-2">
              <div className="flex items-center gap-3 mb-4">
                <div style={{ width: 52, height: 52, borderRadius: '50%', padding: 3, background: 'linear-gradient(135deg, #e87722, #f59e0b)', flexShrink: 0 }}>
                  <img src="/school-logo.jpeg" alt="School Logo" style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }} onError={e => { e.target.style.display='none'; }} />
                </div>
                <div>
                  <div className="font-bold text-lg" style={{ display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                    <span style={{ color: '#EF9A9A' }}>The</span>
                    <span style={{ color: '#A5D6A7' }}>Future</span>
                    <span style={{ color: '#CE93D8' }}>Step</span>
                    <span style={{ color: '#FFCC80' }}>School</span>
                  </div>
                  <div className="text-xs" style={{ color: 'var(--tfs-orange)' }}>Bhaler, Nandurbar</div>
                </div>
              </div>
              <p className="text-white/50 text-sm leading-relaxed max-w-xs">
                Nurturing curious minds and building confident futures. A safe, digital, and holistic learning environment for every child.
              </p>
            </div>
            <div>
              <div className="font-bold text-white/80 mb-4 uppercase text-xs tracking-wider">Quick Links</div>
              <div className="space-y-2">
                {['Home', 'About Us', 'Facilities', 'Academics', 'Admissions', 'Contact'].map(l => (
                  <div key={l}><button className="text-white/50 text-sm hover:text-white transition-colors">{l}</button></div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-bold text-white/80 mb-4 uppercase text-xs tracking-wider">Portal Access</div>
              <div className="space-y-2">
                {['Staff Login', 'Student Login', 'Parent Login', 'Admission Form'].map(l => (
                  <div key={l}><button onClick={() => navigate('/login')} className="text-white/50 text-sm hover:text-white transition-colors">{l}</button></div>
                ))}
              </div>
              <div className="mt-6">
                <a href="https://thefuturestepschool.in/form.html" className="inline-flex items-center gap-2 px-4 py-2.5 rounded-full text-sm font-bold text-white" style={{ background: 'var(--tfs-orange)' }}>
                  📝 Admission Form
                </a>
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-white/30 text-sm">© 2025 <span style={{ color: "#EF9A9A" }}>The</span> <span style={{ color: "#A5D6A7" }}>Future</span> <span style={{ color: "#CE93D8" }}>Step</span> <span style={{ color: "#FFCC80" }}>School</span>. All rights reserved.</div>
            <div className="flex gap-5 text-white/30 text-xs">
              <a href="https://thefuturestepschool.in/about.html" className="hover:text-white">About Us</a>
              <a href="https://thefuturestepschool.in/contact.html" className="hover:text-white">Contact</a>
              <span>inquiry@thefuturestepschool.in</span>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}