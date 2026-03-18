import React, { useEffect, useState } from 'react';
import toast from 'react-hot-toast';
import { timetableAPI, classAPI, subjectAPI, teacherAPI } from '../utils/api';
import { LoadingState, EmptyState } from '../components/ui';

const DAYS = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const PERIODS = [1, 2, 3, 4, 5, 6, 7, 8];
const TIMES = ['9:00','9:45','10:30','11:15','12:00','12:45','1:30','2:15'];

export default function Timetable() {
  const [classes, setClasses] = useState([]);
  const [subjects, setSubjects] = useState([]);
  const [teachers, setTeachers] = useState([]);
  const [timetable, setTimetable] = useState([]);
  const [selectedClass, setSelectedClass] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    Promise.all([classAPI.getAll(), subjectAPI.getAll(), teacherAPI.getAll()])
      .then(([c, s, t]) => {
        setClasses(c.data.data);
        setSubjects(s.data.data);
        setTeachers(t.data.data);
        if (c.data.data.length) setSelectedClass(c.data.data[0]._id);
      });
  }, []);

  useEffect(() => {
    if (!selectedClass) return;
    setLoading(true);
    timetableAPI.get(selectedClass)
      .then(r => setTimetable(r.data.data))
      .catch(() => toast.error('Failed to load timetable'))
      .finally(() => setLoading(false));
  }, [selectedClass]);

  // Build a lookup: { day: { periodNumber: periodData } }
  const ttMap = {};
  DAYS.forEach(d => { ttMap[d] = {}; });
  timetable.forEach(tt => {
    tt.periods?.forEach(p => { ttMap[tt.day][p.periodNumber] = p; });
  });

  const DAY_COLORS = { Monday:'#d4522a', Tuesday:'#c9a84c', Wednesday:'#4a7c59', Thursday:'#7c6af5', Friday:'#2d9cdb', Saturday:'#f2994a' };

  return (
    <div className="animate-fade-in">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">Timetable</h2>
          <p className="text-sm text-muted mt-0.5">View weekly class schedules</p>
        </div>
        <select className="form-input w-auto" value={selectedClass} onChange={e => setSelectedClass(e.target.value)}>
          {classes.map(c => <option key={c._id} value={c._id}>{c.name} — {c.section}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !timetable.length ? (
        <EmptyState icon="🗓" title="No timetable set" subtitle="Timetable for this class hasn't been configured yet" />
      ) : (
        <div className="card overflow-x-auto">
          <table className="w-full text-sm min-w-[700px]">
            <thead>
              <tr className="bg-warm">
                <th className="text-left px-4 py-3 table-th w-28">Day</th>
                {PERIODS.map((p, i) => (
                  <th key={p} className="text-left px-3 py-3 table-th">
                    <div>Period {p}</div>
                    <div className="text-[10px] text-muted normal-case font-normal">{TIMES[i]}</div>
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {DAYS.map(day => (
                <tr key={day} className="border-t border-border hover:bg-warm/40 transition-colors">
                  <td className="px-4 py-3">
                    <div className="font-semibold text-ink text-xs" style={{ color: DAY_COLORS[day] }}>{day.slice(0,3).toUpperCase()}</div>
                    <div className="text-xs text-muted">{day}</div>
                  </td>
                  {PERIODS.map(p => {
                    const period = ttMap[day]?.[p];
                    return (
                      <td key={p} className="px-3 py-3 min-w-[110px]">
                        {period ? (
                          <div className="rounded-lg p-2 text-xs" style={{ background: `${DAY_COLORS[day]}15`, borderLeft: `3px solid ${DAY_COLORS[day]}` }}>
                            <div className="font-semibold text-ink">{period.subject?.name}</div>
                            <div className="text-muted mt-0.5">{period.teacher?.user?.name?.split(' ').pop()}</div>
                            {period.room && <div className="text-muted">Rm {period.room}</div>}
                          </div>
                        ) : (
                          <div className="rounded-lg p-2 text-xs bg-warm/50 text-muted text-center">—</div>
                        )}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
