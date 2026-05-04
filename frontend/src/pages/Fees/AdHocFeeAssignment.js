/* eslint-disable react-hooks/exhaustive-deps */
// frontend/src/pages/Fees/AdHocFeeAssignment.js
// One-off fee assignment — pick a class (or specific students), pick a fee
// type, set amount + due date, and assign. Does NOT save to the class
// template, so future enrollments are unaffected.
//
// Use cases:
//   - Field trip fee for one class
//   - Fine for a specific student
//   - Mid-year sports fee for grades 6-10
//   - One-off lab fee, exam fee, etc.

import React, { useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';
import feeAPI from '../../utils/feeAPI';
import { classAPI, studentAPI } from '../../utils/api';
import { LoadingState } from '../../components/ui';

const INP = { width:'100%', padding:'8px 11px', border:'1.5px solid #E5E7EB', borderRadius:8, fontSize:13, boxSizing:'border-box', outline:'none', fontFamily:'inherit', background:'#fff' };
const LBL = { fontSize:11, fontWeight:700, display:'block', marginBottom:4, color:'#374151', textTransform:'uppercase', letterSpacing:'0.04em' };
const BTN_PRIMARY = { padding:'10px 22px', borderRadius:8, background:'#1D4ED8', color:'#fff', border:'none', fontSize:13, fontWeight:700, cursor:'pointer' };
const BTN_LIGHT   = { padding:'9px 14px', borderRadius:8, background:'#F3F4F6', color:'#374151', border:'1px solid #E5E7EB', fontSize:13, fontWeight:600, cursor:'pointer' };
const fmt = n => `₹${(Number(n)||0).toLocaleString('en-IN')}`;

export default function AdHocFeeAssignment() {
  const [classes,    setClasses]    = useState([]);
  const [feeTypes,   setFeeTypes]   = useState([]);
  const [students,   setStudents]   = useState([]);
  const [loading,    setLoading]    = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // Form state
  const [target,         setTarget]         = useState('class');   // 'class' | 'students'
  const [classId,        setClassId]        = useState('');
  const [studentIds,     setStudentIds]     = useState([]);        // for target=='students'
  const [feeTypeId,      setFeeTypeId]      = useState('');
  const [amount,         setAmount]         = useState('');
  const [dueDate,        setDueDate]        = useState('');
  const [lateFeePerDay,  setLateFeePerDay]  = useState(0);
  const [reason,         setReason]         = useState('');         // optional: shown as label/note

  // ── Load classes + fee types on mount ─────────────────────────────────
  useEffect(() => {
    setLoading(true);
    Promise.all([
      classAPI.getAll().catch(() => ({ data:{ data:[] } })),
      feeAPI.getFeeTypes().catch(() => ({ data:{ data:[] } })),
    ]).then(([cRes, fRes]) => {
      const cls = cRes.data.data || [];
      setClasses(cls);
      setFeeTypes(fRes.data.data || []);
      if (cls.length) setClassId(cls[0]._id);
    }).finally(() => setLoading(false));
  }, []);

  // ── Load students whenever the chosen class changes ───────────────────
  useEffect(() => {
    if (!classId) return setStudents([]);
    studentAPI.getAll({ classId }).then(r => {
      setStudents((r.data.data || []).filter(s => s.isActive !== false));
      setStudentIds([]); // reset selection on class change
    }).catch(() => setStudents([]));
  }, [classId]);

  const selectedStudentObjs = useMemo(
    () => students.filter(s => studentIds.includes(s._id)),
    [students, studentIds]
  );

  const targetCount = target === 'class'
    ? students.length
    : studentIds.length;

  const grandTotal = (Number(amount) || 0) * targetCount;

  const toggleStudent = (id) => {
    setStudentIds(prev => prev.includes(id) ? prev.filter(x => x !== id) : [...prev, id]);
  };

  const selectAll = () => setStudentIds(students.map(s => s._id));
  const clearAll  = () => setStudentIds([]);

  const handleSubmit = async () => {
    if (!classId)       return toast.error('Pick a class');
    if (!feeTypeId)     return toast.error('Pick a fee type');
    if (!Number(amount) || Number(amount) <= 0)
                        return toast.error('Enter a valid amount');
    if (!dueDate)       return toast.error('Pick a due date');
    if (target === 'students' && studentIds.length === 0)
                        return toast.error('Select at least one student');

    const baseDoc = {
      feeTypeId,
      baseAmount:    Number(amount),
      dueDate,
      lateFeePerDay: Number(lateFeePerDay) || 0,
      label:         reason || '',
    };

    setSubmitting(true);
    try {
      if (target === 'class') {
        await feeAPI.createAssignment({ ...baseDoc, classId });
        toast.success(`Fee assigned to ${students.length} student(s)`);
      } else {
        // Loop through selected students one at a time so each gets an
        // individual assignment record (matches existing /fees/assignments behavior).
        let count = 0;
        for (const sid of studentIds) {
          await feeAPI.createAssignment({ ...baseDoc, studentId: sid, classId });
          count++;
        }
        toast.success(`Fee assigned to ${count} student(s)`);
      }

      // Reset for next entry
      setAmount(''); setDueDate(''); setReason(''); setStudentIds([]);
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to assign');
    } finally { setSubmitting(false); }
  };

  if (loading) return <LoadingState />;

  if (!classes.length) {
    return (
      <div style={{ padding:30, textAlign:'center', color:'#6B7280', fontSize:13 }}>
        No classes available. Create a class first.
      </div>
    );
  }

  return (
    <div className="space-y-4">

      {/* ── Header ── */}
      <div>
        <h2 style={{ fontSize:20, fontWeight:800, color:'#111827', margin:0 }}>One-off Fee Assignment</h2>
        <p style={{ fontSize:13, color:'#6B7280', margin:'4px 0 0' }}>
          Use this for ad-hoc fees that aren't part of a class template — field trips, fines,
          mid-year additions, special charges. These won't auto-apply to future students.
        </p>
      </div>

      {/* ── Form ── */}
      <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, padding:18 }}>

        {/* Row 1: Target picker */}
        <div style={{ marginBottom:14 }}>
          <div style={LBL}>Apply to</div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setTarget('class')}
              style={{
                ...BTN_LIGHT,
                background: target==='class' ? '#1D4ED8' : '#F3F4F6',
                color:      target==='class' ? '#fff' : '#374151',
                border:     target==='class' ? '1px solid #1D4ED8' : '1px solid #E5E7EB',
                fontWeight: 700,
              }}>
              🏫 Whole class
            </button>
            <button onClick={() => setTarget('students')}
              style={{
                ...BTN_LIGHT,
                background: target==='students' ? '#1D4ED8' : '#F3F4F6',
                color:      target==='students' ? '#fff' : '#374151',
                border:     target==='students' ? '1px solid #1D4ED8' : '1px solid #E5E7EB',
                fontWeight: 700,
              }}>
              👤 Specific students
            </button>
          </div>
        </div>

        {/* Row 2: Class + Fee Type + Amount */}
        <div style={{ display:'grid', gridTemplateColumns:'1.2fr 1.4fr 1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <div style={LBL}>Class</div>
            <select style={INP} value={classId} onChange={e => setClassId(e.target.value)}>
              {classes.map(c => (
                <option key={c._id} value={c._id}>
                  {c.name} {c.section ? `— ${c.section}` : ''}
                </option>
              ))}
            </select>
          </div>
          <div>
            <div style={LBL}>Fee Type</div>
            <select style={INP} value={feeTypeId} onChange={e => setFeeTypeId(e.target.value)}>
              <option value="">— Select —</option>
              {feeTypes.map(t => (
                <option key={t._id} value={t._id}>{t.name}</option>
              ))}
            </select>
          </div>
          <div>
            <div style={LBL}>Amount per student (₹)</div>
            <input type="number" min="0" style={INP} value={amount}
              onChange={e => setAmount(e.target.value)} placeholder="0" />
          </div>
          <div>
            <div style={LBL}>Due Date</div>
            <input type="date" style={INP} value={dueDate}
              onChange={e => setDueDate(e.target.value)} />
          </div>
        </div>

        {/* Row 3: Late fee + Reason */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 3fr', gap:12 }}>
          <div>
            <div style={LBL}>Late Fee per day (₹)</div>
            <input type="number" min="0" style={INP} value={lateFeePerDay}
              onChange={e => setLateFeePerDay(e.target.value)} placeholder="0" />
          </div>
          <div>
            <div style={LBL}>Reason / Note <span style={{ color:'#9CA3AF', fontWeight:400 }}>(optional)</span></div>
            <input style={INP} value={reason}
              onChange={e => setReason(e.target.value)}
              placeholder="e.g. Annual day costume, Library fine, Picnic to Lonavla" />
          </div>
        </div>

      </div>

      {/* ── Student picker (only for target='students') ── */}
      {target === 'students' && (
        <div style={{ background:'#fff', border:'1px solid #E5E7EB', borderRadius:10, overflow:'hidden' }}>
          <div style={{ background:'#0B1F4A', color:'#fff', padding:'12px 18px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
            <div style={{ fontSize:14, fontWeight:700 }}>
              👥 Select students ({studentIds.length}/{students.length} selected)
            </div>
            <div style={{ display:'flex', gap:6 }}>
              <button onClick={selectAll}
                style={{ padding:'5px 11px', borderRadius:7, background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                Select all
              </button>
              <button onClick={clearAll}
                style={{ padding:'5px 11px', borderRadius:7, background:'rgba(255,255,255,0.15)', color:'#fff', border:'1px solid rgba(255,255,255,0.3)', fontSize:11, fontWeight:600, cursor:'pointer' }}>
                Clear
              </button>
            </div>
          </div>
          <div style={{ padding:12, maxHeight:280, overflowY:'auto' }}>
            {students.length === 0 ? (
              <div style={{ padding:18, textAlign:'center', color:'#9CA3AF', fontSize:13 }}>
                No active students in this class.
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(220px, 1fr))', gap:6 }}>
                {students.map(s => {
                  const checked = studentIds.includes(s._id);
                  return (
                    <label key={s._id}
                      style={{
                        display:'flex', alignItems:'center', gap:8,
                        padding:'8px 10px', borderRadius:7, cursor:'pointer',
                        background: checked ? '#EFF6FF' : '#F9FAFB',
                        border:     checked ? '1px solid #BFDBFE' : '1px solid #E5E7EB',
                      }}>
                      <input type="checkbox" checked={checked} onChange={() => toggleStudent(s._id)} />
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:12, fontWeight:600, color:'#111827', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>
                          {s.user?.name || '—'}
                        </div>
                        <div style={{ fontSize:10, color:'#6B7280' }}>
                          {s.admissionNumber || ''}
                        </div>
                      </div>
                    </label>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ── Summary + submit ── */}
      <div style={{ background:'#F9FAFB', border:'1px solid #E5E7EB', borderRadius:10, padding:14, display:'flex', justifyContent:'space-between', alignItems:'center', flexWrap:'wrap', gap:10 }}>
        <div style={{ fontSize:13, color:'#374151' }}>
          {targetCount === 0 ? (
            <span style={{ color:'#9CA3AF' }}>No students selected yet.</span>
          ) : (
            <>
              Will assign{' '}
              <strong style={{ color:'#1D4ED8' }}>{fmt(amount)}</strong>
              {' '}to{' '}
              <strong style={{ color:'#1D4ED8' }}>{targetCount}</strong>{' '}
              student{targetCount === 1 ? '' : 's'}{' '}
              <span style={{ color:'#6B7280' }}>·</span>{' '}
              total{' '}
              <strong style={{ color:'#16A34A' }}>{fmt(grandTotal)}</strong>
            </>
          )}
        </div>
        <button style={BTN_PRIMARY} onClick={handleSubmit} disabled={submitting || targetCount === 0}>
          {submitting ? 'Assigning…' : `Assign fee${targetCount > 1 ? 's' : ''}`}
        </button>
      </div>
    </div>
  );
}