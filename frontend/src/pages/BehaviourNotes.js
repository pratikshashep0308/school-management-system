// Behaviour Notes — standalone module (mirrors the Homework page pattern).
// Staff can browse every student's daily behavioural notes, filter by date,
// class and category, search by name, and add a note for any student.
import React, { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import { behaviouralNoteAPI, classAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';

const CATS = [
  { key: 'general',  label: 'General',  bg: '#EEF2FF', color: '#3730A3', border: '#C7D2FE' },
  { key: 'positive', label: 'Positive', bg: '#DCFCE7', color: '#166534', border: '#86EFAC' },
  { key: 'concern',  label: 'Concern',  bg: '#FEE2E2', color: '#B91C1C', border: '#FCA5A5' },
];
const catStyle = (k) => CATS.find(c => c.key === k) || CATS[0];

const INP = {
  width: '100%', padding: '9px 12px', borderRadius: 10,
  border: '1.5px solid #E5E7EB', fontSize: 13, outline: 'none', boxSizing: 'border-box',
};

export default function BehaviourNotes() {
  const { user } = useAuth();
  const isStaff = ['teacher', 'schoolAdmin', 'superAdmin'].includes(user?.role);

  const [notes,   setNotes]   = useState([]);
  const [classes, setClasses] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [fDate,     setFDate]     = useState('');
  const [fClass,    setFClass]    = useState('');
  const [fCategory, setFCategory] = useState('');
  const [search,    setSearch]    = useState('');

  // Add-note modal
  const [showModal, setShowModal] = useState(false);
  const [students,  setStudents]  = useState([]);
  const [form,      setForm]      = useState({ studentId: '', note: '', category: 'general' });
  const [saving,    setSaving]    = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = {};
      if (fDate)     params.date     = fDate;
      if (fClass)    params.classId  = fClass;
      if (fCategory) params.category = fCategory;
      const r = await behaviouralNoteAPI.getAll(params);
      setNotes(r.data?.data || []);
    } catch {
      toast.error('Failed to load behaviour notes');
    } finally { setLoading(false); }
  }, [fDate, fClass, fCategory]);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data?.data || [])).catch(() => {});
    studentAPI.getAll().then(r => setStudents(r.data?.data || [])).catch(() => {});
  }, []);

  const save = async () => {
    if (!form.studentId) { toast.error('Please select a student'); return; }
    if (!form.note.trim()) { toast.error('Note cannot be empty'); return; }
    setSaving(true);
    try {
      await behaviouralNoteAPI.save({
        studentId: form.studentId,
        note: form.note.trim(),
        category: form.category,
      });
      toast.success('Behaviour note saved');
      setShowModal(false);
      setForm({ studentId: '', note: '', category: 'general' });
      load();
    } catch (e) {
      toast.error(e?.response?.data?.message || 'Failed to save note');
    } finally { setSaving(false); }
  };

  const remove = async (id) => {
    if (!window.confirm('Delete this behaviour note?')) return;
    try { await behaviouralNoteAPI.delete(id); toast.success('Deleted'); load(); }
    catch { toast.error('Failed to delete'); }
  };

  const studentName = (n) => n.student?.user?.name || n.student?.name || 'Student';
  const className   = (n) => {
    const c = n.student?.class;
    return c ? `${c.name || ''} ${c.section || ''}`.trim() : '—';
  };

  // Client-side search across name / class / note text
  const q = search.trim().toLowerCase();
  const filtered = !q ? notes : notes.filter(n =>
    [studentName(n), className(n), n.note, n.createdByName]
      .filter(Boolean).join(' ').toLowerCase().includes(q)
  );

  // Quick counts by category
  const counts = CATS.reduce((acc, c) => {
    acc[c.key] = notes.filter(n => (n.category || 'general') === c.key).length;
    return acc;
  }, {});

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 24, fontWeight: 800, color: '#0B1F4A', margin: 0 }}>📝 Behaviour Notes</h1>
          <p style={{ fontSize: 13, color: '#6B7280', margin: '4px 0 0' }}>Daily behavioural remarks for each student</p>
        </div>
        {isStaff && (
          <button onClick={() => setShowModal(true)}
            style={{ padding: '10px 20px', borderRadius: 10, background: '#0B1F4A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
            + Add Note
          </button>
        )}
      </div>

      {/* Summary tiles */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(140px, 1fr))', gap: 12 }}>
        {CATS.map(c => (
          <div key={c.key} style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, textAlign: 'center' }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: c.color }}>{counts[c.key] || 0}</div>
            <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>{c.label}</div>
          </div>
        ))}
        <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, textAlign: 'center' }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#0B1F4A' }}>{notes.length}</div>
          <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>Total</div>
        </div>
      </div>

      {/* Filters */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 16, display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, alignItems: 'end' }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Date</label>
          <input type="date" style={INP} value={fDate} onChange={e => setFDate(e.target.value)} />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Class</label>
          <select style={INP} value={fClass} onChange={e => setFClass(e.target.value)}>
            <option value="">All Classes</option>
            {classes.map(c => (
              <option key={c._id} value={c._id}>{`${c.name || ''} ${c.section || ''}`.trim()}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Category</label>
          <select style={INP} value={fCategory} onChange={e => setFCategory(e.target.value)}>
            <option value="">All</option>
            {CATS.map(c => <option key={c.key} value={c.key}>{c.label}</option>)}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Search</label>
          <input style={INP} value={search} onChange={e => setSearch(e.target.value)} placeholder="Student, class, note…" />
        </div>
        <button onClick={() => { setFDate(''); setFClass(''); setFCategory(''); setSearch(''); }}
          style={{ padding: '9px 16px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
          Clear
        </button>
      </div>

      {/* Notes table */}
      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 16, overflow: 'hidden' }}>
        <div style={{ background: '#0B1F4A', padding: '12px 18px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span style={{ color: '#fff', fontWeight: 800, fontSize: 14 }}>📋 Notes</span>
          <span style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12 }}>{filtered.length} records</span>
        </div>

        {loading ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>⏳ Loading…</div>
        ) : filtered.length === 0 ? (
          <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>
            <div style={{ fontSize: 36 }}>📝</div>
            <div style={{ marginTop: 8, fontSize: 13 }}>No behaviour notes found.</div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
              <thead>
                <tr style={{ background: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                  {['Date', 'Student', 'Class', 'Category', 'Note', 'Written By', ''].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '10px 16px', fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', whiteSpace: 'nowrap' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filtered.map((n, i) => {
                  const cs = catStyle(n.category);
                  return (
                    <tr key={n._id || i} style={{ borderBottom: '1px solid #F3F4F6', background: i % 2 ? '#FAFAFA' : '#fff' }}>
                      <td style={{ padding: '12px 16px', whiteSpace: 'nowrap', color: '#374151' }}>
                        {n.date ? new Date(n.date).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—'}
                      </td>
                      <td style={{ padding: '12px 16px', fontWeight: 700, color: '#0B1F4A', whiteSpace: 'nowrap' }}>
                        {studentName(n)}
                        {n.student?.rollNumber && (
                          <div style={{ fontSize: 10, color: '#9CA3AF', fontWeight: 400 }}>Roll: {n.student.rollNumber}</div>
                        )}
                      </td>
                      <td style={{ padding: '12px 16px', color: '#6B7280', whiteSpace: 'nowrap' }}>{className(n)}</td>
                      <td style={{ padding: '12px 16px' }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: cs.bg, color: cs.color, textTransform: 'uppercase', whiteSpace: 'nowrap' }}>
                          {cs.label}
                        </span>
                      </td>
                      <td style={{ padding: '12px 16px', color: '#374151', maxWidth: 380, whiteSpace: 'pre-wrap' }}>{n.note}</td>
                      <td style={{ padding: '12px 16px', color: '#9CA3AF', fontSize: 12, whiteSpace: 'nowrap' }}>{n.createdByName || '—'}</td>
                      <td style={{ padding: '12px 16px' }}>
                        {isStaff && (
                          <button onClick={() => remove(n._id)}
                            style={{ padding: '4px 10px', borderRadius: 6, border: 'none', background: '#FEF2F2', color: '#DC2626', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                            🗑
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add-note modal */}
      {showModal && (
        <div onClick={() => setShowModal(false)}
          style={{ position: 'fixed', inset: 0, zIndex: 400, background: 'rgba(0,0,0,0.45)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', overflowY: 'auto', padding: 16 }}>
          <div onClick={e => e.stopPropagation()}
            style={{ background: '#fff', borderRadius: 16, width: '100%', maxWidth: 520, marginTop: 40, overflow: 'hidden' }}>
            <div style={{ background: '#0B1F4A', padding: '16px 22px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ color: '#fff', fontWeight: 800, fontSize: 15 }}>📝 Add Behaviour Note</span>
              <button onClick={() => setShowModal(false)}
                style={{ background: 'rgba(255,255,255,0.15)', color: '#fff', border: 'none', borderRadius: 8, width: 30, height: 30, cursor: 'pointer', fontSize: 16 }}>×</button>
            </div>

            <div style={{ padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Student *</label>
                <select style={INP} value={form.studentId} onChange={e => setForm(f => ({ ...f, studentId: e.target.value }))}>
                  <option value="">Select a student…</option>
                  {students.map(s => {
                    const nm = s.user?.name || s.name || 'Student';
                    const cl = s.class ? `${s.class.name || ''} ${s.class.section || ''}`.trim() : '';
                    return <option key={s._id} value={s._id}>{nm}{cl ? ` — ${cl}` : ''}</option>;
                  })}
                </select>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 6 }}>Category</label>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  {CATS.map(c => (
                    <button key={c.key} onClick={() => setForm(f => ({ ...f, category: c.key }))}
                      style={{
                        fontSize: 11, fontWeight: 700, padding: '6px 14px', borderRadius: 20, cursor: 'pointer',
                        border: form.category === c.key ? `1.5px solid ${c.color}` : '1.5px solid #E5E7EB',
                        background: form.category === c.key ? c.bg : '#fff',
                        color: form.category === c.key ? c.color : '#6B7280',
                      }}>
                      {c.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label style={{ fontSize: 10, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', display: 'block', marginBottom: 4 }}>Note *</label>
                <textarea rows={4} style={{ ...INP, resize: 'vertical', fontFamily: 'inherit' }}
                  value={form.note} onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
                  placeholder="Write today's behavioural remark for this student…" />
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>
                <button onClick={() => setShowModal(false)}
                  style={{ padding: '10px 20px', borderRadius: 10, border: '1px solid #E5E7EB', background: '#fff', color: '#374151', fontSize: 13, fontWeight: 700, cursor: 'pointer' }}>
                  Cancel
                </button>
                <button onClick={save} disabled={saving}
                  style={{ padding: '10px 24px', borderRadius: 10, background: '#0B1F4A', color: '#fff', border: 'none', fontSize: 13, fontWeight: 700, cursor: 'pointer', opacity: saving ? 0.7 : 1 }}>
                  {saving ? '⏳ Saving…' : '+ Save Note'}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}