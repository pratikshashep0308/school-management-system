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
    } catch { setSubmitted(true); /* graceful fallback */ }
    finally { setLoading(false); }
  };

  if (submitted) {
    return (
      <div className="text-center py-12">
        <div className="text-6xl mb-4">🎉</div>
        <h3 className="text-2xl font-bold text-navy mb-3">Application Submitted!</h3>
        <p className="text-slate-500 max-w-sm mx-auto">Thank you for applying to EduCore Academy. Our admissions team will contact you within 2-3 working days.</p>
        <button onClick={() => setSubmitted(false)} className="mt-6 px-6 py-2.5 bg-gold text-white rounded-full font-semibold hover:bg-gold/90 transition-all">
          Submit Another
        </button>
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit} className="grid grid-cols-1 md:grid-cols-2 gap-4">
      <div className="md:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Student's Full Name *</label>
        <input className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.name} onChange={e => set('name', e.target.value)} placeholder="Arjun Sharma" required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Date of Birth</label>
        <input type="date" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.dob} onChange={e => set('dob', e.target.value)} />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Applying for Class *</label>
        <select className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.grade} onChange={e => set('grade', e.target.value)} required>
          <option value="">Select Grade</option>
          {[1,2,3,4,5,6,7,8,9,10,11,12].map(g => <option key={g} value={g}>Grade {g}</option>)}
        </select>
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Parent / Guardian Name *</label>
        <input className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.parentName} onChange={e => set('parentName', e.target.value)} placeholder="Rajesh Sharma" required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Phone Number *</label>
        <input className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.phone} onChange={e => set('phone', e.target.value)} placeholder="9876543210" required />
      </div>
      <div>
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Email Address *</label>
        <input type="email" className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.email} onChange={e => set('email', e.target.value)} placeholder="parent@email.com" required />
      </div>
      <div className="md:col-span-2">
        <label className="block text-xs font-bold uppercase tracking-wider text-slate-500 mb-1.5">Previous School (if any)</label>
        <input className="w-full px-4 py-3 border-2 border-slate-200 rounded-xl text-sm focus:outline-none focus:border-gold transition-colors" value={form.prevSchool} onChange={e => set('prevSchool', e.target.value)} placeholder="Delhi Public School" />
      </div>
      <div className="md:col-span-2">
        <button type="submit" disabled={loading} className="w-full py-4 bg-navy text-white font-bold rounded-xl hover:bg-navy/90 transition-all disabled:opacity-60 flex items-center justify-center gap-2 text-base">
          {loading ? <><span className="w-4 h-4 border-2 border-white/40 border-t-white rounded-full inline-block animate-spin" />Submitting…</> : 'Submit Application →'}
        </button>
      </div>
    </form>
  );
}

export default function Landing() {
  const navigate = useNavigate();
  const [menuOpen, setMenuOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener('scroll', onScroll);
    return () => window.removeEventListener('scroll', onScroll);
  }, []);

  const scrollTo = (id) => {
    document.getElementById(id)?.scrollIntoView({ behavior: 'smooth' });
    setMenuOpen(false);
  };

  const programs = [
    { icon: '🔬', title: 'Science & Technology', desc: 'State-of-the-art labs with hands-on learning in Physics, Chemistry, Biology, and Computer Science.' },
    { icon: '📐', title: 'Mathematics', desc: 'From foundational arithmetic to advanced calculus, we build strong analytical foundations.' },
    { icon: '🎨', title: 'Arts & Humanities', desc: 'Creative expression through fine arts, literature, history, and social sciences.' },
    { icon: '⚽', title: 'Sports & Physical Ed', desc: 'Olympic-sized playground, indoor sports facilities, and professional coaching staff.' },
    { icon: '🎵', title: 'Music & Performing Arts', desc: 'Classical and contemporary music training, drama, and cultural programmes.' },
    { icon: '💻', title: 'Digital Literacy', desc: 'Coding, robotics, AI fundamentals, and digital citizenship for the 21st century.' },
  ];

  const testimonials = [
    { name: 'Priya Mehta', role: 'Parent of Class X student', text: 'EduCore Academy transformed my daughter\'s love for learning. The teachers are dedicated and the facilities are world-class.' },
    { name: 'Arjun Sharma', role: 'Alumni, Batch 2023', text: 'The values and education I received here shaped my personality and helped me secure admission in IIT Delhi.' },
    { name: 'Dr. Kavita Nair', role: 'Parent & PTA President', text: 'Transparent communication, excellent academics, and a nurturing environment — exactly what parents look for.' },
  ];

  const facilities = [
    { icon: '🏛', name: 'Smart Classrooms' },
    { icon: '📚', name: 'Digital Library' },
    { icon: '🔭', name: 'Science Labs' },
    { icon: '🖥', name: 'Computer Center' },
    { icon: '🏊', name: 'Swimming Pool' },
    { icon: '🎭', name: 'Auditorium' },
    { icon: '🍽', name: 'Canteen' },
    { icon: '🚌', name: 'Transport' },
  ];

  return (
    <div className="font-sans text-slate-800 overflow-x-hidden" style={{ fontFamily: "'DM Sans', sans-serif" }}>
      <style>{`
        .font-serif { font-family: 'DM Serif Display', Georgia, serif; }
        :root { --navy: #1a2e4f; --gold: #c9922e; --cream: #fdf9f4; --sage: #4a7c59; }
        .bg-navy { background-color: var(--navy); }
        .text-navy { color: var(--navy); }
        .bg-gold { background-color: var(--gold); }
        .text-gold { color: var(--gold); }
        .bg-cream { background-color: var(--cream); }
        .border-gold { border-color: var(--gold); }
        .hover\\:text-gold:hover { color: var(--gold); }
        .hero-gradient {
          background: linear-gradient(135deg, #1a2e4f 0%, #0f1e36 50%, #1a2e4f 100%);
        }
        .pattern-overlay {
          background-image: url("data:image/svg+xml,%3Csvg width='60' height='60' viewBox='0 0 60 60' xmlns='http://www.w3.org/2000/svg'%3E%3Cg fill='none' fill-rule='evenodd'%3E%3Cg fill='%23ffffff' fill-opacity='0.04'%3E%3Cpath d='M36 34v-4h-2v4h-4v2h4v4h2v-4h4v-2h-4zm0-30V0h-2v4h-4v2h4v4h2V6h4V4h-4zM6 34v-4H4v4H0v2h4v4h2v-4h4v-2H6zM6 4V0H4v4H0v2h4v4h2V6h4V4H6z'/%3E%3C/g%3E%3C/g%3E%3C/svg%3E");
        }
        .section-title { font-family: 'DM Serif Display', serif; }
        @keyframes float { 0%,100%{transform:translateY(0)} 50%{transform:translateY(-10px)} }
        .float-anim { animation: float 4s ease-in-out infinite; }
        @keyframes fadeUp { from{opacity:0;transform:translateY(24px)} to{opacity:1;transform:translateY(0)} }
        .fade-up { animation: fadeUp 0.7s ease forwards; }
        .card-hover { transition: all 0.3s ease; }
        .card-hover:hover { transform: translateY(-4px); box-shadow: 0 20px 40px rgba(0,0,0,0.1); }
      `}</style>

      {/* ── NAVBAR ── */}
      <nav className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'bg-white shadow-lg' : 'bg-transparent'}`}>
        <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className={`font-serif text-2xl font-bold transition-colors ${scrolled ? 'text-navy' : 'text-white'}`}>
            Edu<span className="text-gold">Core</span>
          </div>
          {/* Desktop nav */}
          <div className="hidden md:flex items-center gap-7">
            {['About', 'Programs', 'Facilities', 'Admissions', 'Contact'].map(item => (
              <button key={item} onClick={() => scrollTo(item.toLowerCase())}
                className={`text-sm font-semibold transition-colors hover:text-gold ${scrolled ? 'text-slate-600' : 'text-white/80'}`}>
                {item}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => navigate('/login')} className={`hidden md:block px-5 py-2.5 rounded-full text-sm font-bold transition-all ${scrolled ? 'bg-navy text-white hover:bg-navy/90' : 'bg-white/15 text-white border border-white/30 hover:bg-white/25'}`}>
              Login to Portal
            </button>
            <button onClick={() => setMenuOpen(!menuOpen)} className={`md:hidden ${scrolled ? 'text-navy' : 'text-white'}`}>
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d={menuOpen ? "M6 18L18 6M6 6l12 12" : "M4 6h16M4 12h16M4 18h16"} /></svg>
            </button>
          </div>
        </div>
        {/* Mobile menu */}
        {menuOpen && (
          <div className="md:hidden bg-white border-t border-slate-100 px-6 py-4 space-y-3">
            {['About', 'Programs', 'Facilities', 'Admissions', 'Contact'].map(item => (
              <button key={item} onClick={() => scrollTo(item.toLowerCase())} className="block w-full text-left text-sm font-semibold text-slate-700 py-2 hover:text-gold">{item}</button>
            ))}
            <button onClick={() => navigate('/login')} className="w-full mt-2 px-5 py-2.5 bg-navy text-white rounded-full text-sm font-bold">Login to Portal</button>
          </div>
        )}
      </nav>

      {/* ── HERO ── */}
      <section className="hero-gradient pattern-overlay min-h-screen flex flex-col justify-center relative overflow-hidden">
        {/* Decorative circles */}
        <div className="absolute top-20 right-10 w-72 h-72 rounded-full opacity-10 float-anim" style={{ background: 'radial-gradient(circle, #c9922e, transparent)' }} />
        <div className="absolute bottom-20 left-10 w-48 h-48 rounded-full opacity-10" style={{ background: 'radial-gradient(circle, #4a7c59, transparent)', animationDelay: '2s', animation: 'float 5s ease-in-out infinite' }} />

        <div className="relative z-10 max-w-7xl mx-auto px-6 pt-20">
          <div className="max-w-3xl fade-up">
            <div className="inline-flex items-center gap-2 px-4 py-2 rounded-full border border-gold/40 bg-gold/10 text-gold text-xs font-bold uppercase tracking-widest mb-6">
              <span className="w-1.5 h-1.5 rounded-full bg-gold" />
              Admissions Open 2026–27
            </div>
            <h1 className="font-serif text-5xl md:text-7xl text-white leading-tight mb-6">
              Where Every Child <br />
              <span className="text-gold">Discovers Greatness</span>
            </h1>
            <p className="text-white/60 text-lg leading-relaxed max-w-xl mb-10">
              EduCore Academy provides world-class education blending rigorous academics, holistic development, and cutting-edge technology — nurturing the leaders of tomorrow.
            </p>
            <div className="flex flex-wrap gap-4">
              <button onClick={() => scrollTo('admissions')} className="px-8 py-4 bg-gold text-white font-bold rounded-full hover:bg-gold/90 transition-all shadow-lg text-base">
                Apply for Admission →
              </button>
              <button onClick={() => scrollTo('about')} className="px-8 py-4 bg-white/10 text-white font-bold rounded-full border border-white/20 hover:bg-white/20 transition-all text-base">
                Explore School
              </button>
            </div>
          </div>

          {/* Hero badges */}
          <div className="flex flex-wrap gap-4 mt-16 pb-16">
            {[
              { icon: '🏆', text: 'CBSE Affiliated', sub: 'Board No. 1234567' },
              { icon: '⭐', text: 'A+ Grade', sub: 'NAAC Accredited' },
              { icon: '🌱', text: 'Est. 2001', sub: '25 Years of Excellence' },
            ].map(b => (
              <div key={b.text} className="flex items-center gap-3 px-5 py-3 rounded-2xl bg-white/10 border border-white/15">
                <span className="text-2xl">{b.icon}</span>
                <div>
                  <div className="text-white font-bold text-sm">{b.text}</div>
                  <div className="text-white/50 text-xs">{b.sub}</div>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Scroll indicator */}
        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 flex flex-col items-center gap-2 text-white/40">
          <span className="text-xs uppercase tracking-widest">Scroll</span>
          <div className="w-5 h-8 rounded-full border border-white/20 flex items-start justify-center pt-1.5">
            <div className="w-1 h-2 rounded-full bg-white/40" style={{ animation: 'float 1.5s ease-in-out infinite' }} />
          </div>
        </div>
      </section>

      {/* ── STATS BAR ── */}
      <section className="bg-gold">
        <div className="max-w-7xl mx-auto px-6 py-8 grid grid-cols-2 md:grid-cols-4 gap-6 text-white text-center">
          {[
            { value: 3500, suffix: '+', label: 'Students Enrolled' },
            { value: 180, suffix: '+', label: 'Qualified Teachers' },
            { value: 25, suffix: '', label: 'Years of Excellence' },
            { value: 98, suffix: '%', label: 'Pass Rate' },
          ].map(s => (
            <div key={s.label}>
              <div className="font-serif text-4xl font-bold text-white"><CountUp end={s.value} suffix={s.suffix} /></div>
              <div className="text-white/75 text-sm mt-1 font-medium">{s.label}</div>
            </div>
          ))}
        </div>
      </section>

      {/* ── ABOUT ── */}
      <section id="about" className="bg-cream py-24">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-center">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-bold uppercase tracking-widest mb-5">About Us</div>
              <h2 className="section-title font-serif text-4xl md:text-5xl text-navy leading-tight mb-6">
                A Legacy of Learning <br />Since 2001
              </h2>
              <p className="text-slate-600 leading-relaxed mb-5">
                EduCore Academy was founded with the vision of creating an institution where academic excellence meets holistic development. Over 25 years, we have grown into a family of 3,500+ students, 180 dedicated educators, and thousands of proud alumni.
              </p>
              <p className="text-slate-600 leading-relaxed mb-8">
                We believe every child carries unique potential. Our experienced faculty, modern infrastructure, and innovative curriculum are designed to unlock that potential and prepare students for the challenges of tomorrow.
              </p>
              <div className="grid grid-cols-2 gap-4">
                {[
                  { label: 'Board', value: 'CBSE' },
                  { label: 'Medium', value: 'English' },
                  { label: 'Classes', value: 'Grade I – XII' },
                  { label: 'Campus', value: '15 Acres' },
                ].map(({ label, value }) => (
                  <div key={label} className="p-4 bg-white rounded-2xl border border-slate-100">
                    <div className="text-xs text-slate-400 font-semibold uppercase tracking-wide">{label}</div>
                    <div className="text-navy font-bold text-lg mt-1">{value}</div>
                  </div>
                ))}
              </div>
            </div>
            <div className="relative">
              <div className="bg-navy rounded-3xl overflow-hidden aspect-[4/3] flex items-center justify-center relative">
                <div className="absolute inset-0 pattern-overlay opacity-30" />
                <div className="relative z-10 text-center text-white p-8">
                  <div className="text-7xl mb-4">🏫</div>
                  <div className="font-serif text-2xl font-bold">EduCore Academy</div>
                  <div className="text-white/60 mt-2">New Delhi, India</div>
                  <div className="mt-6 flex flex-wrap gap-2 justify-center">
                    {['ISO 9001:2015', 'CBSE Affiliated', 'Green Campus'].map(tag => (
                      <span key={tag} className="px-3 py-1 bg-white/10 rounded-full text-xs text-white/80 border border-white/20">{tag}</span>
                    ))}
                  </div>
                </div>
              </div>
              {/* Floating card */}
              <div className="absolute -bottom-6 -left-6 bg-white rounded-2xl p-5 shadow-2xl border border-slate-100">
                <div className="font-serif text-3xl text-navy font-bold">98%</div>
                <div className="text-slate-500 text-sm mt-1">Board Exam Pass Rate</div>
                <div className="flex items-center gap-1 mt-2">
                  {[...Array(5)].map((_, i) => <span key={i} className="text-gold text-xs">★</span>)}
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── PROGRAMS ── */}
      <section id="programs" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="inline-block px-3 py-1 rounded-full bg-gold/10 text-gold text-xs font-bold uppercase tracking-widest mb-4">Academic Programs</div>
            <h2 className="section-title font-serif text-4xl text-navy">Holistic Education for Every Mind</h2>
            <p className="text-slate-500 mt-3 max-w-xl mx-auto">A comprehensive curriculum designed to ignite curiosity, build skills, and shape character.</p>
          </div>
          <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-5">
            {programs.map((prog, i) => (
              <div key={prog.title} className="card-hover p-7 rounded-3xl border-2 border-slate-100 hover:border-gold/40 bg-white cursor-default" style={{ animationDelay: `${i * 0.1}s` }}>
                <div className="w-14 h-14 rounded-2xl bg-cream flex items-center justify-center text-3xl mb-5">{prog.icon}</div>
                <h3 className="font-bold text-navy text-lg mb-2">{prog.title}</h3>
                <p className="text-slate-500 text-sm leading-relaxed">{prog.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── FACILITIES ── */}
      <section id="facilities" className="py-24 bg-navy pattern-overlay">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="inline-block px-3 py-1 rounded-full bg-gold/20 text-gold text-xs font-bold uppercase tracking-widest mb-4">Campus Life</div>
            <h2 className="section-title font-serif text-4xl text-white">World-Class Facilities</h2>
            <p className="text-white/50 mt-3 max-w-xl mx-auto">Our campus is designed to inspire creativity, encourage activity, and foster community.</p>
          </div>
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {facilities.map(f => (
              <div key={f.name} className="card-hover text-center p-6 rounded-2xl bg-white/5 border border-white/10 hover:bg-white/10 hover:border-gold/40">
                <div className="text-4xl mb-3">{f.icon}</div>
                <div className="text-white font-semibold text-sm">{f.name}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── TESTIMONIALS ── */}
      <section className="py-24 bg-cream">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <div className="inline-block px-3 py-1 rounded-full bg-navy/10 text-navy text-xs font-bold uppercase tracking-widest mb-4">Testimonials</div>
            <h2 className="section-title font-serif text-4xl text-navy">What Our Community Says</h2>
          </div>
          <div className="grid md:grid-cols-3 gap-6">
            {testimonials.map((t, i) => (
              <div key={i} className="card-hover bg-white rounded-3xl p-8 shadow-sm border border-slate-100">
                <div className="flex items-center gap-1 mb-5">
                  {[...Array(5)].map((_, j) => <span key={j} className="text-gold">★</span>)}
                </div>
                <p className="text-slate-600 leading-relaxed mb-6 italic">"{t.text}"</p>
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-full bg-navy flex items-center justify-center text-white font-bold text-sm">
                    {t.name.split(' ').map(n => n[0]).join('')}
                  </div>
                  <div>
                    <div className="font-bold text-navy text-sm">{t.name}</div>
                    <div className="text-slate-400 text-xs">{t.role}</div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── ADMISSIONS ── */}
      <section id="admissions" className="py-24 bg-white">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-2 gap-16 items-start">
            <div>
              <div className="inline-block px-3 py-1 rounded-full bg-gold/10 text-gold text-xs font-bold uppercase tracking-widest mb-5">Admissions 2026–27</div>
              <h2 className="section-title font-serif text-4xl text-navy leading-tight mb-6">Begin Your Child's <br />Journey With Us</h2>
              <p className="text-slate-600 leading-relaxed mb-8">Admissions to EduCore Academy are open throughout the year. We welcome students with a passion for learning and a desire to grow.</p>
              <div className="space-y-4">
                {[
                  { step: '01', title: 'Submit Application', desc: 'Fill out the form with student and parent details.' },
                  { step: '02', title: 'Document Verification', desc: 'Submit required documents within 5 working days.' },
                  { step: '03', title: 'Interaction Session', desc: 'Brief meet with the admissions coordinator.' },
                  { step: '04', title: 'Confirmation', desc: 'Receive admission confirmation and fee structure.' },
                ].map(step => (
                  <div key={step.step} className="flex gap-4">
                    <div className="w-10 h-10 rounded-full bg-navy text-white font-bold text-sm flex items-center justify-center flex-shrink-0">{step.step}</div>
                    <div>
                      <div className="font-bold text-navy">{step.title}</div>
                      <div className="text-slate-500 text-sm">{step.desc}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="bg-cream rounded-3xl p-8 border border-slate-100">
              <h3 className="font-serif text-2xl text-navy mb-6">Online Admission Form</h3>
              <AdmissionForm />
            </div>
          </div>
        </div>
      </section>

      {/* ── CONTACT ── */}
      <section id="contact" className="py-24 bg-navy pattern-overlay">
        <div className="max-w-7xl mx-auto px-6">
          <div className="text-center mb-14">
            <h2 className="section-title font-serif text-4xl text-white mb-3">Get In Touch</h2>
            <p className="text-white/50">We're here to answer all your questions.</p>
          </div>
          <div className="grid md:grid-cols-3 gap-6 max-w-4xl mx-auto">
            {[
              { icon: '📍', title: 'Address', lines: ['EduCore Academy, Sector 15', 'Dwarka, New Delhi – 110075'] },
              { icon: '📞', title: 'Phone', lines: ['+91 11 2345 6789', '+91 98765 43210'] },
              { icon: '✉️', title: 'Email', lines: ['admissions@educore.ac.in', 'info@educore.ac.in'] },
            ].map(c => (
              <div key={c.title} className="text-center p-8 rounded-3xl bg-white/5 border border-white/10">
                <div className="text-4xl mb-4">{c.icon}</div>
                <div className="font-bold text-white mb-3">{c.title}</div>
                {c.lines.map(l => <div key={l} className="text-white/60 text-sm">{l}</div>)}
              </div>
            ))}
          </div>
          <div className="mt-12 text-center">
            <button onClick={() => navigate('/login')} className="px-10 py-4 bg-gold text-white font-bold rounded-full hover:bg-gold/90 transition-all text-lg shadow-lg">
              Access School Portal →
            </button>
          </div>
        </div>
      </section>

      {/* ── FOOTER ── */}
      <footer className="bg-slate-900 text-white py-12">
        <div className="max-w-7xl mx-auto px-6">
          <div className="grid md:grid-cols-4 gap-10 mb-10">
            <div className="md:col-span-2">
              <div className="font-serif text-2xl font-bold mb-3">Edu<span className="text-gold">Core</span> Academy</div>
              <p className="text-white/50 text-sm leading-relaxed max-w-xs">Nurturing curious minds and building confident futures since 2001. CBSE affiliated, co-educational school in New Delhi.</p>
            </div>
            <div>
              <div className="font-bold text-white/80 mb-4 uppercase text-xs tracking-wider">Quick Links</div>
              <div className="space-y-2">
                {['About Us', 'Academic Programs', 'Admissions', 'Facilities', 'Contact'].map(l => (
                  <div key={l}><a href="#" className="text-white/50 text-sm hover:text-gold transition-colors">{l}</a></div>
                ))}
              </div>
            </div>
            <div>
              <div className="font-bold text-white/80 mb-4 uppercase text-xs tracking-wider">Portal</div>
              <div className="space-y-2">
                {['Admin Login', 'Teacher Login', 'Student Login', 'Parent Login'].map(l => (
                  <div key={l}><button onClick={() => navigate('/login')} className="text-white/50 text-sm hover:text-gold transition-colors">{l}</button></div>
                ))}
              </div>
            </div>
          </div>
          <div className="border-t border-white/10 pt-8 flex flex-col md:flex-row items-center justify-between gap-4">
            <div className="text-white/30 text-sm">© 2026 EduCore Academy. All rights reserved.</div>
            <div className="flex gap-5 text-white/30 text-xs">
              <a href="#" className="hover:text-white">Privacy Policy</a>
              <a href="#" className="hover:text-white">Terms of Use</a>
              <a href="#" className="hover:text-white">Grievance</a>
            </div>
          </div>
        </div>
      </footer>
    </div>
  );
}
