import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { attendanceAPI, classAPI, studentAPI } from '../utils/api';
import { useAuth } from '../context/AuthContext';
import { LoadingState, EmptyState, Avatar } from '../components/ui';

export default function Attendance() {
  const { isAdmin, isTeacher } = useAuth();
  const [classes, setClasses] = useState([]);
  const [students, setStudents] = useState([]);
  const [attendance, setAttendance] = useState({}); // { studentId: 'present'|'absent'|'late' }
  const [selectedClass, setSelectedClass] = useState('');
  const [date, setDate] = useState(new Date().toISOString().split('T')[0]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    classAPI.getAll().then(r => { setClasses(r.data.data); if (r.data.data.length) setSelectedClass(r.data.data[0]._id); });
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    Promise.all([
      studentAPI.getAll({ class: selectedClass }),
      attendanceAPI.getByClass(selectedClass, date),
    ]).then(([sRes, aRes]) => {
      setStudents(sRes.data.data);
      const map = {};
      aRes.data.data?.forEach(a => { map[a.student?._id || a.student] = a.status; });
      setAttendance(map);
    }).catch(() => toast.error('Failed to load data'))
      .finally(() => setLoading(false));
  }, [selectedClass, date]);

  const mark = (studentId, status) => {
    setAttendance(p => ({ ...p, [studentId]: p[studentId] === status ? undefined : status }));
  };

  const markAll = (status) => {
    const map = {};
    students.forEach(s => { map[s._id] = status; });
    setAttendance(map);
  };

  const save = async () => {
    if (!students.length) { toast.error('No students to save'); return; }
    setSaving(true);
    try {
      const attendanceData = students.map(s => ({
        studentId: s._id,
        status: attendance[s._id] || 'absent',
      }));
      await attendanceAPI.mark({ classId: selectedClass, date, attendanceData });
      toast.success('Attendance saved successfully!');
    } catch { toast.error('Failed to save attendance'); }
    finally { setSaving(false); }
  };

  const counts = { present: 0, absent: 0, late: 0, unmarked: 0 };
  students.forEach(s => {
    const st = attendance[s._id];
    if (st === 'present') counts.present++;
    else if (st === 'absent') counts.absent++;
    else if (st === 'late') counts.late++;
    else counts.unmarked++;
  });

  const canEdit = isAdmin || isTeacher;

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Attendance</h2>
          <p className="text-sm text-muted mt-0.5">Mark and track daily attendance</p>
        </div>
        {canEdit && (
          <button onClick={save} disabled={saving} className="btn-primary">
            {saving ? 'Saving…' : 'Save Attendance'}
          </button>
        )}
      </div>

      {/* Controls */}
      <div className="flex flex-wrap gap-3 mb-5 items-center">
        <select className="form-input w-auto" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
        <input type="date" className="form-input w-auto" value={date} onChange={e => setDate(e.target.value)} />
        {canEdit && (
          <div className="flex gap-2 ml-auto">
            <button onClick={() => markAll('present')} className="btn-secondary text-sage border-sage/30">✓ Mark All Present</button>
            <button onClick={() => markAll('absent')} className="btn-secondary text-accent border-accent/30">✗ Mark All Absent</button>
          </div>
        )}
      </div>

      {/* Summary bar */}
      <div className="flex gap-5 mb-5 flex-wrap">
        {[
          { label: 'Present', count: counts.present, color: 'text-sage' },
          { label: 'Absent', count: counts.absent, color: 'text-accent' },
          { label: 'Late', count: counts.late, color: 'text-gold' },
          { label: 'Unmarked', count: counts.unmarked, color: 'text-muted' },
          { label: 'Total', count: students.length, color: 'text-ink' },
        ].map(({ label, count, color }) => (
          <div key={label} className="flex items-center gap-2">
            <span className={`font-bold text-lg ${color}`}>{count}</span>
            <span className="text-sm text-muted">{label}</span>
          </div>
        ))}
      </div>

      {loading ? <LoadingState /> : !students.length ? <EmptyState icon="✓" title="No students in this class" /> : (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5 gap-3">
          {students.map(s => {
            const status = attendance[s._id];
            const borderClass = status === 'present' ? 'border-sage bg-sage/5'
              : status === 'absent' ? 'border-accent bg-accent/5'
              : status === 'late' ? 'border-gold bg-gold/5'
              : 'border-border';

            return (
              <div key={s._id} className={`card p-4 border-2 transition-all ${borderClass}`}>
                <div className="flex flex-col items-center text-center">
                  <Avatar name={s.user?.name} size="md" />
                  <div className="font-medium text-sm text-ink mt-2 leading-tight">{s.user?.name}</div>
                  <div className="text-xs text-muted mb-3">Roll {s.rollNumber || '—'}</div>
                  <div className="flex gap-1.5 w-full">
                    {['present', 'absent', 'late'].map(st => {
                      const colors = {
                        present: status === 'present' ? 'bg-sage text-white border-sage' : 'border-sage/40 text-sage',
                        absent:  status === 'absent'  ? 'bg-accent text-white border-accent' : 'border-accent/40 text-accent',
                        late:    status === 'late'    ? 'bg-gold text-white border-gold' : 'border-gold/40 text-gold',
                      };
                      const labels = { present: 'P', absent: 'A', late: 'L' };
                      return (
                        <button key={st} onClick={() => canEdit && mark(s._id, st)}
                          className={`flex-1 py-1.5 rounded-lg border text-xs font-bold transition-all ${colors[st]} ${!canEdit ? 'cursor-default' : 'cursor-pointer hover:opacity-80'}`}>
                          {labels[st]}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
