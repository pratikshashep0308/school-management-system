// frontend/src/pages/Exams/ExamTimetable.jsx
//
// Exam schedule as a grid, in the shape of the timetable module.
//
// ─── WHY DATES, NOT DAYS ─────────────────────────────────────────────────────
// The timetable module has a fixed 7-day week: Monday to Sunday, repeating. An
// exam schedule does not repeat — it runs from a start date to an end date, and
// "Tuesday" is meaningless without saying which Tuesday.
//
// So the columns are the actual DATES of the exam period, taken from the exam
// group's own start and end dates, and the rows are time slots. Everything else
// — the dark header, the period column, the add-and-edit cells — matches the
// timetable so somebody who can use one can use the other.
//
// ─── A NOTE ON THE DATA ──────────────────────────────────────────────────────
// As at 13 Aug 2026 there are no exam groups and no exam subjects. This screen
// is written against the real schemas and will be empty until an exam is
// created — which is also the first opportunity to find out whether it works.

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import toast from 'react-hot-toast';

import api from '../../utils/api';

const SLOTS = [
  { key: 'morning',   label: 'Morning',   time: '09:00 – 12:00' },
  { key: 'midday',    label: 'Midday',    time: '12:30 – 15:30' },
  { key: 'afternoon', label: 'Afternoon', time: '15:45 – 18:00' },
];

const fmtDay = (d) => d.toLocaleDateString('en-IN', { weekday: 'short' });
const fmtDate = (d) => d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
const iso = (d) => d.toISOString().slice(0, 10);

/** Which slot a paper falls in, from its start time. */
const slotFor = (startTime) => {
  if (!startTime) return 'morning';
  const h = parseInt(String(startTime).split(':')[0], 10);
  if (Number.isNaN(h)) return 'morning';
  if (h < 12) return 'morning';
  if (h < 15) return 'midday';
  return 'afternoon';
};

export default function ExamTimetable({ examGroupId }) {
  const [group, setGroup] = useState(null);
  const [papers, setPapers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const load = useCallback(async () => {
    if (!examGroupId) return;
    setLoading(true); setError(null);
    try {
      const r = await api.get(`/exams-advanced/groups/${examGroupId}`);
      // The endpoint returns the group flattened with its subjects attached —
      // { ...group, subjects } — not { group, subjects }. Read to match.
      const d = r?.data?.data ?? r?.data;
      setGroup(d || null);
      setPapers(d?.subjects || []);
    } catch (err) {
      setError(err?.response?.data?.message || err.message);
    } finally { setLoading(false); }
  }, [examGroupId]);

  useEffect(() => { load(); }, [load]);

  // Columns: every date in the exam period.
  //
  // Derived from the group's start and end dates rather than from the papers
  // themselves, so an empty day still gets a column — that is where somebody
  // clicks to schedule one, and a grid that only shows days already used cannot
  // be used to add the first paper to a new day.
  const dates = useMemo(() => {
    if (!group?.startDate) return [];
    const start = new Date(group.startDate);
    const end = group.endDate ? new Date(group.endDate) : start;
    const out = [];
    const cur = new Date(start);
    // Capped at 30: an exam period longer than a month is a data error, and an
    // unbounded loop on a bad date would hang the browser.
    while (cur <= end && out.length < 30) {
      out.push(new Date(cur));
      cur.setDate(cur.getDate() + 1);
    }
    return out;
  }, [group]);

  // date → slot → paper
  const grid = useMemo(() => {
    const g = {};
    papers.forEach((p) => {
      if (!p.date) return;
      const key = iso(new Date(p.date));
      if (!g[key]) g[key] = {};
      g[key][slotFor(p.startTime)] = p;
    });
    return g;
  }, [papers]);

  const unscheduled = papers.filter((p) => !p.date);

  if (loading) return <div style={{ padding: 40, textAlign: 'center', color: '#9CA3AF' }}>Loading…</div>;

  if (error) {
    return (
      <div style={{ background: '#FEF2F2', border: '1px solid #FECACA', color: '#B91C1C', padding: 14, borderRadius: 10, fontSize: 13 }}>
        {error}
      </div>
    );
  }

  if (!group?.startDate) {
    return (
      <div style={{ padding: 40, textAlign: 'center', color: '#6B7280', fontSize: 13 }}>
        This exam has no start date yet. Set the dates on the exam and the schedule grid appears.
      </div>
    );
  }

  return (
    <div>
      <div style={{ marginBottom: 14 }}>
        <div style={{ fontSize: 16, fontWeight: 800, color: '#0B1F4A' }}>{group.name}</div>
        <div style={{ fontSize: 12, color: '#6B7280', marginTop: 2 }}>
          {fmtDate(new Date(group.startDate))}
          {group.endDate ? ` – ${fmtDate(new Date(group.endDate))}` : ''}
          {' · '}{papers.length} paper{papers.length === 1 ? '' : 's'}
          {group.academicYear ? ` · ${group.academicYear}` : ''}
        </div>
      </div>

      <div style={{ background: '#fff', border: '1px solid #E5E7EB', borderRadius: 12, overflow: 'auto' }}>
        <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 700 }}>
          <thead>
            <tr style={{ background: '#0B1F4A' }}>
              <th style={{
                padding: '12px 14px', textAlign: 'center', color: '#94afd4', fontSize: 10,
                fontWeight: 700, textTransform: 'uppercase', width: 110,
                borderRight: '1px solid rgba(255,255,255,0.08)',
              }}>
                Session
              </th>
              {dates.map((d) => {
                const isSunday = d.getDay() === 0;
                return (
                  <th key={iso(d)} style={{
                    padding: '12px 10px', textAlign: 'center', fontSize: 11, fontWeight: 700,
                    color: isSunday ? '#94afd4' : '#E2E8F0',
                    borderRight: '1px solid rgba(255,255,255,0.08)',
                    background: '#0B1F4A', minWidth: 130,
                  }}>
                    {fmtDay(d)}
                    <div style={{ fontSize: 10, fontWeight: 500, marginTop: 2, opacity: 0.85 }}>
                      {fmtDate(d)}
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {SLOTS.map((slot) => (
              <tr key={slot.key}>
                <td style={{
                  padding: '10px 12px', textAlign: 'center', borderRight: '0.5px solid #E5E7EB',
                  borderBottom: '0.5px solid #E5E7EB', background: '#F9FAFB', verticalAlign: 'top',
                }}>
                  <div style={{ fontSize: 12, fontWeight: 700, color: '#0B1F4A' }}>{slot.label}</div>
                  <div style={{ fontSize: 10, color: '#9CA3AF', marginTop: 2 }}>{slot.time}</div>
                </td>

                {dates.map((d) => {
                  const isSunday = d.getDay() === 0;
                  const paper = grid[iso(d)]?.[slot.key];

                  return (
                    <td key={iso(d)} style={{
                      borderRight: '0.5px solid #E5E7EB', borderBottom: '0.5px solid #E5E7EB',
                      verticalAlign: 'top', background: isSunday ? '#F9FAFB' : 'transparent',
                    }}>
                      {isSunday && !paper ? (
                        <div style={{ minHeight: 72, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          <span style={{ fontSize: 10, color: '#D1D5DB' }}>Holiday</span>
                        </div>
                      ) : paper ? (
                        <div style={{ padding: '8px 10px', minHeight: 72 }}>
                          <div style={{ fontSize: 12, fontWeight: 700, color: '#111827' }}>
                            {paper.subject?.name || '(subject removed)'}
                          </div>
                          <div style={{ fontSize: 10, color: '#6B7280', marginTop: 3 }}>
                            {paper.startTime || '—'}{paper.endTime ? ` – ${paper.endTime}` : ''}
                          </div>
                          {paper.room && (
                            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                              Room {paper.room}
                            </div>
                          )}
                          {paper.invigilator && (
                            <div style={{ fontSize: 10, color: '#6B7280', marginTop: 2 }}>
                              {paper.invigilator?.name || paper.invigilator}
                            </div>
                          )}
                          {/* A locked paper has marks against it. Shown here so
                              nobody tries to move an exam that has been sat. */}
                          {paper.isLocked && (
                            <div style={{ fontSize: 9, color: '#B45309', marginTop: 4, fontWeight: 700 }}>
                              LOCKED
                            </div>
                          )}
                        </div>
                      ) : (
                        <div style={{ minHeight: 72 }} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Papers with no date yet. Listed rather than hidden: a paper missing
          from the grid is easy to overlook, and discovering it on the morning
          of the exam is the wrong time. */}
      {unscheduled.length > 0 && (
        <div style={{ marginTop: 14, background: '#FFFBEB', border: '1px solid #FDE68A', borderRadius: 10, padding: '12px 16px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: '#92400E' }}>
            {unscheduled.length} paper{unscheduled.length === 1 ? '' : 's'} not yet scheduled
          </div>
          <div style={{ fontSize: 11, color: '#92400E', marginTop: 4 }}>
            {unscheduled.map((p) => p.subject?.name || '(subject)').join(' · ')}
          </div>
        </div>
      )}
    </div>
  );
}
