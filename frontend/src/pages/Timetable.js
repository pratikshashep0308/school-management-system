// frontend/src/pages/Timetable.js
// Complete timetable module: grid view + create/edit modal + substitute + auto-gen
// Replaces the existing Timetable.js

import React, { useEffect, useState, useCallback, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { timetableAPI, classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { LoadingState, EmptyState, Modal } from '../components/ui';

// ─── Constants ────────────────────────────────────────────────────────────────
const DAYS = ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
const PERIOD_TIMES = [
  { period: 1, start: '09:00', end: '09:45' },
  { period: 2, start: '09:45', end: '10:30' },
  { period: 3, start: '10:30', end: '11:15' },
  { period: 4, start: '11:15', end: '12:00' },
  { period: 5, start: '12:00', end: '12:45' },
  { period: 6, start: '12:45', end: '13:30' },
  { period: 7, start: '13:30', end: '14:15' },
  { period: 8, start: '14:15', end: '15:00' },
];

const SUBJECT_COLORS = [
  '#3B82F6','#10B981','#F97316','#8B5CF6',
  '#EF4444','#06B6D4','#F59E0B','#EC4899',
  '#6366F1','#14B8A6','#84CC16','#A855F7',
];

const DAY_COLORS = {
  Monday:'#D4522A', Tuesday:'#C9A84C', Wednesday:'#4A7C59',
  Thursday:'#7C6AF5', Friday:'#2D9CDB', Saturday:'#F2994A',
};

const TYPE_STYLES = {
  break:    { bg: '#FEF3C7', border: '#F59E0B', label: '☕ Break',  text: '#92400E' },
  lunch:    { bg: '#D1FAE5', border: '#10B981', label: '🍽 Lunch',  text: '#065F46' },
  free:     { bg: '#F3F4F6', border: '#D1D5DB', label: '—',         text: '#9CA3AF' },
  assembly: { bg: '#EDE9FE', border: '#8B5CF6', label: '🎓 Assembly', text: '#5B21B6' },
};

// ─── Utility ──────────────────────────────────────────────────────────────────
function buildColorMap(subjects) {
  const map = {};
  subjects.forEach((s, i) => { map[s._id] = SUBJECT_COLORS[i % SUBJECT_COLORS.length]; });
  return map;
}

// ─── Period Cell ──────────────────────────────────────────────────────────────
function PeriodCell({ period, color, onEdit, canEdit, onSubstitute }) {
  if (!period) {
    return (
      <div
        onClick={canEdit ? onEdit : undefined}
        style={{
          minHeight: 72, borderRadius: 8, background: '#F9FAFB',
          border: '1.5px dashed #E5E7EB', display: 'flex', alignItems: 'center',
          justifyContent: 'center', cursor: canEdit ? 'pointer' : 'default',
          color: '#D1D5DB', fontSize: 18, transition: 'all 0.15s',
        }}
        onMouseEnter={e => { if (canEdit) { e.currentTarget.style.borderColor = '#3B82F6'; e.currentTarget.style.color = '#3B82F6'; } }}
        onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#D1D5DB'; }}
      >
        {canEdit ? '+' : '—'}
      </div>
    );
  }

  const typeStyle = TYPE_STYLES[period.type];
  if (typeStyle) {
    return (
      <div style={{
        minHeight: 72, borderRadius: 8, background: typeStyle.bg,
        border: `1.5px solid ${typeStyle.border}`, display: 'flex',
        alignItems: 'center', justifyContent: 'center',
        color: typeStyle.text, fontWeight: 700, fontSize: 12,
      }}>
        {typeStyle.label}
      </div>
    );
  }

  const subjectName = period.subject?.name || '—';
  const teacherName = period.substitute?.teacher
    ? period.substitute.teacher.user?.name
    : period.teacher?.user?.name;
  const isSubstitute = !!period.substitute?.teacher;

  return (
    <div
      onClick={canEdit ? onEdit : undefined}
      style={{
        minHeight: 72, borderRadius: 8, padding: '8px 10px',
        background: color ? `${color}18` : '#F0F9FF',
        border: `1.5px solid ${color || '#3B82F6'}`,
        borderLeft: `4px solid ${color || '#3B82F6'}`,
        cursor: canEdit ? 'pointer' : 'default',
        position: 'relative', transition: 'all 0.15s',
      }}
      onMouseEnter={e => { if (canEdit) e.currentTarget.style.transform = 'scale(1.02)'; }}
      onMouseLeave={e => { e.currentTarget.style.transform = ''; }}
    >
      {isSubstitute && (
        <span style={{
          position: 'absolute', top: 4, right: 4,
          background: '#FEF3C7', color: '#92400E', fontSize: 9,
          padding: '1px 5px', borderRadius: 4, fontWeight: 800,
        }}>SUB</span>
      )}
      <div style={{ fontSize: 12, fontWeight: 700, color: color || '#1D4ED8', lineHeight: 1.2, marginBottom: 3 }}>
        {subjectName}
      </div>
      {teacherName && (
        <div style={{ fontSize: 11, color: '#6B7280' }}>
          {isSubstitute ? `🔄 ${teacherName}` : teacherName.split(' ').slice(-1)[0]}
        </div>
      )}
      {period.room && (
        <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>Rm {period.room}</div>
      )}
      {canEdit && onSubstitute && period.teacher && !period.substitute?.teacher && (
        <button
          onClick={e => { e.stopPropagation(); onSubstitute(period); }}
          style={{
            position: 'absolute', bottom: 3, right: 4, background: 'none',
            border: '1px solid #D1D5DB', borderRadius: 4,
            fontSize: 9, padding: '1px 5px', cursor: 'pointer', color: '#6B7280',
          }}
        >
          Sub
        </button>
      )}
    </div>
  );
}

// ─── Timetable Grid ───────────────────────────────────────────────────────────
function TimetableGrid({ timetable, colorMap, canEdit, onEditPeriod, onSubstitute }) {
  const ttMap = {};
  DAYS.forEach(d => { ttMap[d] = {}; });
  (timetable?.schedule || []).forEach(ds => {
    (ds.periods || []).forEach(p => { ttMap[ds.day][p.periodNumber] = p; });
  });

  return (
    <div style={{ overflowX: 'auto' }}>
      <table style={{ width: '100%', borderCollapse: 'separate', borderSpacing: 4, minWidth: 900 }}>
        <thead>
          <tr>
            <th style={{ width: 100, padding: '8px 12px', textAlign: 'left', background: '#F1F5F9', borderRadius: 8, fontSize: 11, fontWeight: 700, color: '#6B7280' }}>
              Day
            </th>
            {PERIOD_TIMES.map(pt => (
              <th key={pt.period} style={{
                padding: '8px 6px', textAlign: 'center',
                background: '#F1F5F9', borderRadius: 8,
                fontSize: 11, fontWeight: 700, color: '#374151',
              }}>
                <div>P{pt.period}</div>
                <div style={{ fontSize: 9, color: '#9CA3AF', fontWeight: 400 }}>{pt.start}</div>
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {DAYS.map(day => (
            <tr key={day}>
              <td style={{ padding: '4px 8px', verticalAlign: 'middle' }}>
                <div style={{ fontWeight: 800, color: DAY_COLORS[day], fontSize: 12 }}>
                  {day.slice(0, 3).toUpperCase()}
                </div>
                <div style={{ fontSize: 10, color: '#9CA3AF' }}>{day}</div>
              </td>
              {PERIOD_TIMES.map(pt => {
                const period = ttMap[day]?.[pt.period];
                const color  = period?.subject ? colorMap[period.subject._id] || colorMap[period.subject] : null;
                return (
                  <td key={pt.period} style={{ padding: 2, verticalAlign: 'top', minWidth: 110 }}>
                    <PeriodCell
                      period={period}
                      color={color}
                      canEdit={canEdit}
                      onEdit={() => onEditPeriod && onEditPeriod(day, pt.period, period)}
                      onSubstitute={p => onSubstitute && onSubstitute(day, pt.period, p, timetable._id)}
                    />
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Period Edit Modal ────────────────────────────────────────────────────────
function PeriodEditModal({ isOpen, onClose, day, periodNumber, period, subjects, teachers, onSave }) {
  const pt = PERIOD_TIMES.find(p => p.period === periodNumber) || {};
  const [subjectId,  setSubjectId]  = useState(period?.subject?._id || period?.subject || '');
  const [teacherId,  setTeacherId]  = useState(period?.teacher?._id || period?.teacher || '');
  const [room,       setRoom]       = useState(period?.room || '');
  const [type,       setType]       = useState(period?.type || 'lecture');
  const [startTime,  setStartTime]  = useState(period?.startTime || pt.start || '09:00');
  const [endTime,    setEndTime]    = useState(period?.endTime   || pt.end   || '09:45');

  useEffect(() => {
    setSubjectId(period?.subject?._id || period?.subject || '');
    setTeacherId(period?.teacher?._id || period?.teacher || '');
    setRoom(period?.room || '');
    setType(period?.type || 'lecture');
    setStartTime(period?.startTime || pt.start || '09:00');
    setEndTime(period?.endTime || pt.end || '09:45');
  }, [period, periodNumber]);

  const handleSave = () => {
    if (type === 'lecture' && !subjectId) return toast.error('Select a subject');
    onSave({
      periodNumber,
      subject:   type === 'lecture' || type === 'lab' ? subjectId : undefined,
      teacher:   type === 'lecture' || type === 'lab' ? teacherId : undefined,
      startTime, endTime, room, type,
    });
    onClose();
  };

  const INPUT = { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`${day} — Period ${periodNumber} (${startTime}–${endTime})`} size="md"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} className="btn-primary">Save Period</button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Type</label>
          <select value={type} onChange={e => setType(e.target.value)} style={INPUT}>
            <option value="lecture">Lecture</option>
            <option value="lab">Lab / Practical</option>
            <option value="break">Break</option>
            <option value="lunch">Lunch</option>
            <option value="free">Free Period</option>
            <option value="assembly">Assembly</option>
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Room</label>
          <input value={room} onChange={e => setRoom(e.target.value)} placeholder="e.g. 101, Lab A" style={INPUT} />
        </div>
        {(type === 'lecture' || type === 'lab') && (
          <>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Subject *</label>
              <select value={subjectId} onChange={e => setSubjectId(e.target.value)} style={INPUT}>
                <option value="">— Select Subject —</option>
                {subjects.map(s => <option key={s._id} value={s._id}>{s.name}</option>)}
              </select>
            </div>
            <div>
              <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Teacher</label>
              <select value={teacherId} onChange={e => setTeacherId(e.target.value)} style={INPUT}>
                <option value="">— Select Teacher —</option>
                {teachers.map(t => <option key={t._id} value={t._id}>{t.user?.name}</option>)}
              </select>
            </div>
          </>
        )}
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Start Time</label>
          <input type="time" value={startTime} onChange={e => setStartTime(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>End Time</label>
          <input type="time" value={endTime} onChange={e => setEndTime(e.target.value)} style={INPUT} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Auto Generate Modal ──────────────────────────────────────────────────────
function AutoGenModal({ isOpen, onClose, subjects, teachers, classId, onGenerated }) {
  const [config, setConfig] = useState({
    periodsPerDay: 8, startTime: '09:00', periodDuration: 45,
    breakAfterPeriod: 4, lunchAfterPeriod: 5,
    breakDuration: 15, lunchDuration: 30,
    workingDays: ['Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'],
    label: 'Auto Generated', version: 'auto-v1',
  });
  const [subjectConfig, setSubjectConfig] = useState(
    subjects.map(s => ({ subjectId: s._id, teacherId: '', periodsPerWeek: 5, color: '' }))
  );
  const [generating, setGenerating] = useState(false);

  const INPUT = { width: '100%', padding: '7px 10px', border: '1px solid #E5E7EB', borderRadius: 7, fontSize: 12, boxSizing: 'border-box' };

  const toggleDay = (day) => {
    setConfig(prev => ({
      ...prev,
      workingDays: prev.workingDays.includes(day)
        ? prev.workingDays.filter(d => d !== day)
        : [...prev.workingDays, day],
    }));
  };

  const handleGenerate = async () => {
    // Validate: class must be selected
    if (!classId) {
      toast.error('Please select a class first before generating');
      return;
    }

    // Validate: at least one subject has a teacher assigned
    const validSubjects = subjectConfig.filter(s => s.subjectId && s.teacherId);
    if (!validSubjects.length) {
      toast.error('Please assign a teacher to at least one subject');
      return;
    }

    // Warn if some subjects have no teacher
    const missingTeacher = subjectConfig.filter(s => s.subjectId && !s.teacherId);
    if (missingTeacher.length) {
      toast(`${missingTeacher.length} subject(s) skipped — no teacher assigned`, { icon: '⚠️' });
    }

    setGenerating(true);
    try {
      const r = await timetableAPI.autoGenerate({
        classId,
        subjects: validSubjects,
        ...config,
      });
      if (r.data.hasConflicts) {
        toast(`Generated with ${r.data.conflicts.length} conflict(s) — review the timetable`, { icon: '⚠️' });
      } else {
        toast.success('Timetable auto-generated!');
      }
      onGenerated(r.data.data);
      onClose();
    } catch (err) {
      const msg = err.response?.data?.message || 'Auto-generation failed';
      toast.error(msg);
      console.error('Auto-generate error:', err.response?.data);
    } finally {
      setGenerating(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="⚡ Auto-Generate Timetable" size="xl"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleGenerate} disabled={generating} className="btn-primary">
            {generating ? '⏳ Generating…' : '⚡ Generate'}
          </button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Label</label>
          <input value={config.label} onChange={e => setConfig(p => ({ ...p, label: e.target.value }))} style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Start Time</label>
          <input type="time" value={config.startTime} onChange={e => setConfig(p => ({ ...p, startTime: e.target.value }))} style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Periods / Day</label>
          <input type="number" min={4} max={10} value={config.periodsPerDay} onChange={e => setConfig(p => ({ ...p, periodsPerDay: +e.target.value }))} style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Period Duration (min)</label>
          <input type="number" min={30} max={90} value={config.periodDuration} onChange={e => setConfig(p => ({ ...p, periodDuration: +e.target.value }))} style={INPUT} />
        </div>
      </div>

      <div style={{ marginTop: 14 }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Working Days</label>
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {DAYS.map(d => (
            <button key={d} type="button"
              onClick={() => toggleDay(d)}
              style={{
                padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: 'pointer',
                background: config.workingDays.includes(d) ? '#1D4ED8' : 'transparent',
                color: config.workingDays.includes(d) ? '#fff' : '#374151',
                border: `1px solid ${config.workingDays.includes(d) ? '#1D4ED8' : '#E5E7EB'}`,
              }}
            >
              {d.slice(0, 3)}
            </button>
          ))}
        </div>
      </div>

      <div style={{ marginTop: 16 }}>
        <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 8 }}>Subject → Teacher → Periods / Week</label>
        <div style={{ maxHeight: 240, overflowY: 'auto' }}>
          {subjectConfig.map((sc, i) => {
            const sub = subjects.find(s => s._id === sc.subjectId);
            return (
              <div key={sc.subjectId} style={{ display: 'grid', gridTemplateColumns: '1.5fr 1.5fr 0.7fr', gap: 8, marginBottom: 8, alignItems: 'center' }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#374151' }}>{sub?.name}</div>
                <select value={sc.teacherId} onChange={e => setSubjectConfig(prev => prev.map((x, idx) => idx === i ? { ...x, teacherId: e.target.value } : x))} style={INPUT}>
                  <option value="">Select Teacher</option>
                  {teachers.map(t => <option key={t._id} value={t._id}>{t.user?.name}</option>)}
                </select>
                <input type="number" min={1} max={12} value={sc.periodsPerWeek}
                  onChange={e => setSubjectConfig(prev => prev.map((x, idx) => idx === i ? { ...x, periodsPerWeek: +e.target.value } : x))}
                  style={{ ...INPUT, textAlign: 'center' }} placeholder="Periods/wk" />
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}

// ─── Substitute Modal ─────────────────────────────────────────────────────────
function SubstituteModal({ isOpen, onClose, teachers, timetableId, day, periodNumber, period, onSaved }) {
  const [substituteId, setSubstituteId] = useState('');
  const [reason,       setReason]       = useState('Teacher absent');
  const [date,         setDate]         = useState('');
  const [saving,       setSaving]       = useState(false);

  const INPUT = { width: '100%', padding: '8px 10px', border: '1px solid #E5E7EB', borderRadius: 8, fontSize: 13, boxSizing: 'border-box' };

  const handleSave = async () => {
    if (!substituteId) return toast.error('Select a substitute teacher');
    setSaving(true);
    try {
      const r = await timetableAPI.assignSubstitute(timetableId, {
        day, periodId: period?._id, substituteTeacherId: substituteId, reason, date,
      });
      toast.success('Substitute assigned');
      onSaved(r.data.data);
      onClose();
    } catch (err) {
      toast.error(err.response?.data?.message || 'Failed to assign substitute');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title={`🔄 Substitute — ${day} Period ${periodNumber}`} size="sm"
      footer={
        <>
          <button onClick={onClose} className="btn-secondary">Cancel</button>
          <button onClick={handleSave} disabled={saving} className="btn-primary">{saving ? '⏳' : 'Assign'}</button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Original Teacher</label>
          <div style={{ fontSize: 13, color: '#374151', padding: '8px 10px', background: '#F3F4F6', borderRadius: 8 }}>
            {period?.teacher?.user?.name || '—'}
          </div>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Substitute Teacher *</label>
          <select value={substituteId} onChange={e => setSubstituteId(e.target.value)} style={INPUT}>
            <option value="">— Select —</option>
            {teachers.filter(t => t._id !== (period?.teacher?._id || period?.teacher)).map(t => (
              <option key={t._id} value={t._id}>{t.user?.name}</option>
            ))}
          </select>
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Reason</label>
          <input value={reason} onChange={e => setReason(e.target.value)} style={INPUT} />
        </div>
        <div>
          <label style={{ fontSize: 12, fontWeight: 700, display: 'block', marginBottom: 5 }}>Date (optional)</label>
          <input type="date" value={date} onChange={e => setDate(e.target.value)} style={INPUT} />
        </div>
      </div>
    </Modal>
  );
}

// ─── Version Switcher ─────────────────────────────────────────────────────────
function VersionPanel({ versions, activeId, classId, onSwitch, onRefresh }) {
  const [switching, setSwitching] = useState(null);

  const handleSwitch = async (id) => {
    setSwitching(id);
    try {
      await timetableAPI.activate(id);
      toast.success('Version activated');
      onSwitch(id);
      onRefresh();
    } catch {
      toast.error('Failed to switch version');
    } finally {
      setSwitching(null);
    }
  };

  return (
    <div style={{ marginBottom: 16 }}>
      <div style={{ fontSize: 11, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', marginBottom: 8 }}>Versions</div>
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {versions.map(v => (
          <button key={v._id} onClick={() => !v.isActive && handleSwitch(v._id)}
            disabled={switching === v._id}
            style={{
              padding: '5px 14px', borderRadius: 20, fontSize: 12, fontWeight: 700,
              cursor: v.isActive ? 'default' : 'pointer',
              background: v.isActive ? '#1D4ED8' : 'transparent',
              color: v.isActive ? '#fff' : '#374151',
              border: `1.5px solid ${v.isActive ? '#1D4ED8' : '#E5E7EB'}`,
              opacity: switching === v._id ? 0.6 : 1,
            }}
          >
            {v.isActive ? '✓ ' : ''}{v.label || v.version}
            {v.isAutoGenerated && <span style={{ fontSize: 9, marginLeft: 4, opacity: 0.7 }}>AUTO</span>}
          </button>
        ))}
      </div>
    </div>
  );
}

// ─── MAIN COMPONENT ───────────────────────────────────────────────────────────
export default function Timetable() {
  const { user } = useAuth();
  const isAdmin  = ['superAdmin','schoolAdmin'].includes(user?.role);
  const isTeacher = user?.role === 'teacher';

  const [classes,    setClasses]    = useState([]);
  const [subjects,   setSubjects]   = useState([]);
  const [teachers,   setTeachers]   = useState([]);
  const [timetable,  setTimetable]  = useState(null);
  const [versions,   setVersions]   = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading,    setLoading]    = useState(false);
  const [conflicts,  setConflicts]  = useState([]);
  const [saving,     setSaving]     = useState(false);

  // Draft — the timetable being edited (array of day schedules)
  const [draft, setDraft] = useState(null);
  const [isDirty, setIsDirty] = useState(false);

  // Modals
  const [editModal,  setEditModal]  = useState(null);  // { day, periodNumber, period }
  const [subModal,   setSubModal]   = useState(null);  // { day, periodNumber, period, timetableId }
  const [autoModal,  setAutoModal]  = useState(false);
  const [showVersions, setShowVersions] = useState(false);

  const colorMap = buildColorMap(subjects);

  // ── Load data ───────────────────────────────────────────────────────────────
  useEffect(() => {
    Promise.all([
      classAPI.getAll(),
      subjectAPI.getAll(),
      teacherAPI.getAll(),
    ]).then(([c, s, t]) => {
      setClasses(c.data.data || []);
      setSubjects(s.data.data || []);
      setTeachers(t.data.data || []);
      if (!selectedClass && (c.data.data || []).length) {
        setSelectedClass(c.data.data[0]._id);
      }
    }).catch(() => toast.error('Failed to load school data'));
  }, []);

  // ── Load timetable when class changes ───────────────────────────────────────
  const loadTimetable = useCallback(async (classId) => {
    if (!classId) return;
    setLoading(true);
    setTimetable(null);
    setDraft(null);
    setIsDirty(false);
    setConflicts([]);
    try {
      const r = await timetableAPI.getClass(classId);
      setTimetable(r.data.data);
      setDraft(JSON.parse(JSON.stringify(r.data.data.schedule)));
    } catch (err) {
      if (err.response?.status === 404) {
        setTimetable(null);
        // Initialize empty draft
        setDraft(DAYS.map(day => ({ day, periods: [] })));
      } else {
        toast.error('Failed to load timetable');
      }
    } finally {
      setLoading(false);
    }

    // Load versions
    try {
      const vr = await timetableAPI.getVersions(classId);
      setVersions(vr.data.data || []);
    } catch { setVersions([]); }
  }, []);

  useEffect(() => {
    if (selectedClass) loadTimetable(selectedClass);
  }, [selectedClass, loadTimetable]);

  // ── Edit a period in the draft ───────────────────────────────────────────────
  const handlePeriodSave = (day, periodNumber, periodData) => {
    setDraft(prev => prev.map(ds => {
      if (ds.day !== day) return ds;
      const existing = ds.periods.find(p => p.periodNumber === periodNumber);
      let newPeriods;
      if (existing) {
        newPeriods = ds.periods.map(p => p.periodNumber === periodNumber ? { ...p, ...periodData } : p);
      } else {
        newPeriods = [...ds.periods, { ...periodData, periodNumber }];
      }
      return { ...ds, periods: newPeriods.sort((a, b) => a.periodNumber - b.periodNumber) };
    }));
    setIsDirty(true);
  };

  // ── Validate draft ───────────────────────────────────────────────────────────
  const handleValidate = async () => {
    if (!draft) return;
    try {
      const r = await timetableAPI.validate({ classId: selectedClass, schedule: draft, excludeId: timetable?._id });
      if (r.data.valid) {
        toast.success('No conflicts — timetable is valid ✓');
        setConflicts([]);
      } else {
        setConflicts(r.data.conflicts);
        toast.error(`${r.data.conflicts.length} conflict(s) found`);
      }
    } catch {
      toast.error('Validation failed');
    }
  };

  // ── Save draft ───────────────────────────────────────────────────────────────
  const handleSave = async () => {
    if (!draft) return;
    setSaving(true);
    try {
      let r;
      if (timetable?._id) {
        r = await timetableAPI.update(timetable._id, { schedule: draft });
      } else {
        r = await timetableAPI.create({
          class: selectedClass,
          schedule: draft,
          version: 'v1', label: 'Main Timetable',
        });
      }
      setTimetable(r.data.data);
      setDraft(JSON.parse(JSON.stringify(r.data.data.schedule)));
      setIsDirty(false);
      setConflicts([]);
      toast.success('Timetable saved');
      loadTimetable(selectedClass);
    } catch (err) {
      const errData = err.response?.data;
      if (errData?.conflicts) {
        setConflicts(errData.conflicts);
        toast.error(`${errData.conflicts.length} conflict(s) — fix before saving`);
      } else {
        toast.error(errData?.message || 'Save failed');
      }
    } finally {
      setSaving(false);
    }
  };

  // ── Export ───────────────────────────────────────────────────────────────────
  const handleExport = async () => {
    if (!timetable?._id) return toast.error('Save timetable first');
    try {
      const token = localStorage.getItem('token');
      const url   = `${process.env.REACT_APP_API_URL || 'http://localhost:5000/api'}/timetable/export/${timetable._id}?format=pdf`;
      const res   = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      const blob  = await res.blob();
      const link  = document.createElement('a');
      link.href   = URL.createObjectURL(blob);
      link.download = `timetable-${timetable._id}.pdf`;
      link.click();
      URL.revokeObjectURL(link.href);
      toast.success('PDF downloaded');
    } catch {
      toast.error('Export failed');
    }
  };

  // ── Teacher view ─────────────────────────────────────────────────────────────
  const [teacherView, setTeacherView] = useState(null);

  useEffect(() => {
    if (!isTeacher) return;
    // Find this teacher's record and load their timetable view
    teacherAPI.getMyProfile()
      .then(r => {
        const tid = r.data.data?._id;
        if (tid) return timetableAPI.getTeacher(tid);
      })
      .then(r => { if (r) setTeacherView(r.data.data); })
      .catch(() => {});
  }, [isTeacher]);

  // ─── Teacher View ─────────────────────────────────────────────────────────────
  if (isTeacher) {
    return (
      <div className="animate-fade-in">
        <div className="page-header">
          <div>
            <h2 className="font-display text-2xl text-ink">My Timetable</h2>
            <p className="text-sm text-muted mt-0.5">Your weekly teaching schedule</p>
          </div>
        </div>
        {!teacherView ? (
          <LoadingState />
        ) : (
          <div className="card">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-warm">
                  <th className="table-th text-left px-4 py-3 w-28">Day</th>
                  {PERIOD_TIMES.map(pt => (
                    <th key={pt.period} className="table-th px-3 py-3 text-center">
                      <div>P{pt.period}</div>
                      <div className="text-[10px] text-muted normal-case font-normal">{pt.start}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {DAYS.map(day => {
                  const slots = (teacherView[day] || []);
                  const slotMap = {};
                  slots.forEach(s => { slotMap[s.periodNumber] = s; });
                  return (
                    <tr key={day} className="border-t border-border">
                      <td className="px-4 py-3">
                        <div className="font-bold text-xs" style={{ color: DAY_COLORS[day] }}>{day.slice(0,3).toUpperCase()}</div>
                        <div className="text-xs text-muted">{day}</div>
                      </td>
                      {PERIOD_TIMES.map(pt => {
                        const slot = slotMap[pt.period];
                        return (
                          <td key={pt.period} className="px-2 py-2 min-w-[110px]">
                            {slot ? (
                              <div className="rounded-lg p-2 text-xs" style={{
                                background: slot.isSubstitute ? '#FEF3C7' : `${DAY_COLORS[day]}15`,
                                borderLeft: `3px solid ${slot.isSubstitute ? '#F59E0B' : DAY_COLORS[day]}`,
                              }}>
                                <div className="font-bold text-ink">{slot.subject?.name || '—'}</div>
                                <div className="text-muted">{slot.className}</div>
                                {slot.isSubstitute && <div className="text-[10px] font-bold text-amber-600">SUB</div>}
                              </div>
                            ) : (
                              <div className="rounded-lg p-2 text-xs bg-warm/50 text-muted text-center">—</div>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    );
  }

  // ─── Admin / Student / Parent View ───────────────────────────────────────────
  return (
    <div className="animate-fade-in">
      {/* Header */}
      <div className="page-header" style={{ flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h2 className="font-display text-2xl text-ink">🗓 Timetable</h2>
          <p className="text-sm text-muted mt-0.5">
            {isAdmin ? 'Create and manage class schedules' : 'Weekly class schedule'}
          </p>
        </div>
        <div style={{ display: 'flex', gap: 10, alignItems: 'center', flexWrap: 'wrap' }}>
          <select className="form-input w-auto" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
            <option value="">— Select Class —</option>
            {classes.map(c => <option key={c._id} value={c._id}>{c.name} {c.section || ''}</option>)}
          </select>
          {isAdmin && (
            <>
              {versions.length > 0 && (
                <button className="btn-secondary" onClick={() => setShowVersions(v => !v)} style={{ fontSize: 12 }}>
                  📋 Versions ({versions.length})
                </button>
              )}
              <button className="btn-secondary" onClick={() => setAutoModal(true)} style={{ fontSize: 12 }}>
                ⚡ Auto-Generate
              </button>
              {timetable && (
                <button className="btn-secondary" onClick={handleExport} style={{ fontSize: 12 }}>
                  ⬇ PDF
                </button>
              )}
              {isDirty && (
                <>
                  <button className="btn-secondary" onClick={handleValidate} style={{ fontSize: 12, borderColor: '#F59E0B', color: '#92400E' }}>
                    ✓ Validate
                  </button>
                  <button className="btn-primary" onClick={handleSave} disabled={saving} style={{ fontSize: 12 }}>
                    {saving ? '⏳ Saving…' : '💾 Save'}
                  </button>
                </>
              )}
            </>
          )}
        </div>
      </div>

      {/* Conflicts */}
      {conflicts.length > 0 && (
        <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', borderRadius: 10, padding: '12px 16px', marginBottom: 16 }}>
          <div style={{ fontWeight: 700, color: '#DC2626', fontSize: 13, marginBottom: 8 }}>
            ⚠️ {conflicts.length} Conflict{conflicts.length > 1 ? 's' : ''} Detected
          </div>
          {conflicts.map((c, i) => (
            <div key={i} style={{ fontSize: 12, color: '#7F1D1D', marginBottom: 4 }}>• {c}</div>
          ))}
        </div>
      )}

      {/* Versions panel */}
      {showVersions && isAdmin && versions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }}>
          <VersionPanel
            versions={versions}
            classId={selectedClass}
            onSwitch={() => {}}
            onRefresh={() => loadTimetable(selectedClass)}
          />
        </div>
      )}

      {/* Color legend */}
      {subjects.length > 0 && (
        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', marginBottom: 14 }}>
          {subjects.map(s => (
            <span key={s._id} style={{
              fontSize: 11, fontWeight: 600, padding: '3px 10px', borderRadius: 20,
              background: `${colorMap[s._id]}20`, color: colorMap[s._id],
              border: `1px solid ${colorMap[s._id]}40`,
            }}>
              {s.name}
            </span>
          ))}
        </div>
      )}

      {/* Grid */}
      {loading ? (
        <LoadingState />
      ) : !selectedClass ? (
        <EmptyState icon="🗓" title="Select a class" subtitle="Choose a class to view or edit its timetable" />
      ) : (
        <div className="card" style={{ padding: 16 }}>
          {!draft ? (
            <EmptyState icon="📅" title="No timetable yet"
              subtitle={isAdmin ? "Click 'Auto-Generate' to create one, or click the + cells to build manually" : "Timetable hasn't been set up for this class"}
            />
          ) : (
            <TimetableGrid
              timetable={{ schedule: draft }}
              colorMap={colorMap}
              canEdit={isAdmin}
              onEditPeriod={(day, periodNumber, period) => setEditModal({ day, periodNumber, period })}
              onSubstitute={(day, periodNumber, period, timetableId) =>
                setSubModal({ day, periodNumber, period, timetableId: timetable?._id })
              }
            />
          )}
        </div>
      )}

      {/* Period Edit Modal */}
      {editModal && (
        <PeriodEditModal
          isOpen={!!editModal}
          onClose={() => setEditModal(null)}
          day={editModal.day}
          periodNumber={editModal.periodNumber}
          period={editModal.period}
          subjects={subjects}
          teachers={teachers}
          onSave={(data) => handlePeriodSave(editModal.day, editModal.periodNumber, data)}
        />
      )}

      {/* Substitute Modal */}
      {subModal && timetable && (
        <SubstituteModal
          isOpen={!!subModal}
          onClose={() => setSubModal(null)}
          teachers={teachers}
          timetableId={subModal.timetableId}
          day={subModal.day}
          periodNumber={subModal.periodNumber}
          period={subModal.period}
          onSaved={(updated) => { setTimetable(updated); setDraft(JSON.parse(JSON.stringify(updated.schedule))); }}
        />
      )}

      {/* Auto-generate Modal */}
      {autoModal && (
        <AutoGenModal
          isOpen={autoModal}
          onClose={() => setAutoModal(false)}
          subjects={subjects}
          teachers={teachers}
          classId={selectedClass}
          onGenerated={(tt) => { setTimetable(tt); setDraft(JSON.parse(JSON.stringify(tt.schedule))); setIsDirty(false); loadTimetable(selectedClass); }}
        />
      )}
    </div>
  );
}