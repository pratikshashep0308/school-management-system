// frontend/src/pages/Exams/DashboardViews.jsx
//
// Dashboard-centric views for the Exam module hub. These are the sections the
// Exam Dashboard's Action Center opens. Everything here reads and writes REAL
// data through the existing /exams-adv API — no mock data, no duplicate APIs.
//
//   • ExamDashboardHome  — live quick statistics + Action Center cards
//   • MarksEntryView     — enter/update marks against a real ExamSubject
//   • ResultsView        — consolidated results + publish (Result Card / Sheet)
//   • ReportsView        — exam analytics from live results
//   • DateSheetView      — printable date sheet from real exam subjects
//   • AwardListView      — printable blank award list from real students
//
// All of these are used from Exams.js. They deliberately reuse the advanced
// exam backend (ExamGroup / ExamSubject / ExamMark) so a mark entered here
// flows straight into results, publishing and reports.

import React, { useEffect, useState, useCallback } from 'react';
import toast from 'react-hot-toast';
import examAdvAPI from '../../utils/examAPI';
import { LoadingState, EmptyState } from '../../components/ui';

// ── shared style tokens (match the rest of the module) ───────────────────────
const CARD = { background: '#fff', border: '1px solid #E5E7EB', borderRadius: 14, padding: 20 };
const INP  = { width: '100%', padding: '9px 12px', border: '1.5px solid #E5E7EB', borderRadius: 9, fontSize: 13, outline: 'none', background: '#fff', boxSizing: 'border-box' };
const LBL  = { display: 'block', fontSize: 10.5, fontWeight: 700, color: '#6B7280', textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 5 };
const BTN  = { padding: '9px 18px', borderRadius: 9, fontSize: 13, fontWeight: 700, border: 'none', cursor: 'pointer', background: '#1D4ED8', color: '#fff' };
const BTN_GHOST = { ...BTN, background: '#fff', color: '#374151', border: '1.5px solid #E5E7EB' };

const COMPONENT_KEYS = ['theory', 'practical', 'internal', 'project', 'oral', 'assignment'];

// A small helper to open printable HTML in a new window (reused by date sheet,
// award list and result card). Mirrors the timetable module's print approach so
// the two feel consistent and no PDF CDN is needed.
function printHtml(title, bodyHtml) {
  const w = window.open('', '_blank');
  if (!w) { toast.error('Please allow pop-ups to print'); return; }
  w.document.write(`<html><head><title>${title}</title><style>
    *{font-family:Arial,Helvetica,sans-serif;}
    h1{font-size:20px;margin:0 0 4px;} .sub{color:#555;font-size:12px;margin-bottom:16px;}
    table{width:100%;border-collapse:collapse;font-size:12px;margin-top:8px;}
    th,td{border:1px solid #999;padding:6px 8px;text-align:left;}
    th{background:#f0f0f0;} @media print{.noprint{display:none;}}
    .noprint{margin-bottom:12px;} button{padding:6px 14px;cursor:pointer;}
  </style></head><body>
    <div class="noprint"><button onclick="window.print()">🖨 Print</button></div>
    ${bodyHtml}
  </body></html>`);
  w.document.close();
}

// ═══════════════════════════════════════════════════════════ DASHBOARD HOME ══
// Live quick statistics (from /exams-adv/dashboard) plus the Action Center. The
// Action Center cards are passed a `go` callback so clicking one switches the
// hub to that section — real navigation, never dummy.
export function ExamDashboardHome({ stats, loading, actions, go, isAdmin }) {
  const STat = ({ label, value, tint }) => (
    <div style={{ ...CARD, padding: 18, display: 'flex', flexDirection: 'column', gap: 4 }}>
      <div style={{ fontSize: 28, fontWeight: 900, color: tint || '#111827', lineHeight: 1 }}>{value ?? '—'}</div>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{label}</div>
    </div>
  );

  return (
    <div>
      {/* Quick statistics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(150px,1fr))', gap: 12, marginBottom: 26 }}>
        {loading ? <LoadingState /> : <>
          <STat label="Total Exams"        value={stats.totalExams}        tint="#1D4ED8" />
          <STat label="Upcoming Exams"      value={stats.upcoming}          tint="#D97706" />
          <STat label="Completed Exams"     value={stats.completed}         tint="#059669" />
          <STat label="Marks Pending"       value={stats.pendingResultEntry} tint="#DC2626" />
          <STat label="Published Results"   value={stats.published}         tint="#7C3AED" />
          <STat label="Students Appearing"  value={stats.studentsAppearing} tint="#0891B2" />
        </>}
      </div>

      {/* Action Center */}
      <div style={{ fontSize: 13, fontWeight: 800, color: '#374151', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 12 }}>
        Exam Action Center
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(220px,1fr))', gap: 14 }}>
        {actions.filter(a => !a.adminOnly || isAdmin).map(a => (
          <button key={a.key} onClick={() => go(a.key)}
            style={{ ...CARD, textAlign: 'left', cursor: 'pointer', display: 'flex', gap: 14, alignItems: 'flex-start', transition: 'box-shadow .15s, transform .15s' }}
            onMouseEnter={e => { e.currentTarget.style.boxShadow = '0 8px 22px rgba(17,24,39,0.10)'; e.currentTarget.style.transform = 'translateY(-2px)'; }}
            onMouseLeave={e => { e.currentTarget.style.boxShadow = 'none'; e.currentTarget.style.transform = 'none'; }}>
            <div style={{ width: 42, height: 42, borderRadius: 11, background: a.tint + '18', color: a.tint, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, flexShrink: 0 }}>{a.icon}</div>
            <div>
              <div style={{ fontWeight: 700, fontSize: 14, color: '#111827', marginBottom: 3 }}>{a.label}</div>
              <div style={{ fontSize: 12, color: '#6B7280', lineHeight: 1.4 }}>{a.desc}</div>
            </div>
          </button>
        ))}
      </div>
    </div>
  );
}

// ════════════════════════════════════════════════════════════ MARKS ENTRY ═══
// Real marks entry. Pick an exam group → a subject/paper → enter marks per
// component for each active student → save draft or publish. Writes through
// POST /exams-adv/subjects/:id/marks (the existing endpoint).
export function MarksEntryView({ groups }) {
  const [groupId, setGroupId]     = useState('');
  const [subjects, setSubjects]   = useState([]);
  const [subjectId, setSubjectId] = useState('');
  const [payload, setPayload]     = useState(null);   // { examSubject, maxMarks, students }
  const [rows, setRows]           = useState([]);       // editable row state
  const [loading, setLoading]     = useState(false);
  const [saving, setSaving]       = useState(false);

  // Which components this paper actually uses (enabled only).
  const activeComponents = payload?.examSubject?.components
    ? COMPONENT_KEYS.filter(k => payload.examSubject.components[k]?.enabled)
    : ['theory'];

  const loadSubjects = useCallback(async (gid) => {
    if (!gid) { setSubjects([]); return; }
    try {
      const res = await examAdvAPI.getGroup(gid);
      setSubjects(res.data.data?.subjects || []);
    } catch { toast.error('Failed to load exam papers'); }
  }, []);

  const loadMarks = useCallback(async (sid) => {
    if (!sid) { setPayload(null); setRows([]); return; }
    setLoading(true);
    try {
      const res = await examAdvAPI.getMarks(sid);
      const d = res.data.data;
      setPayload(d);
      setRows((d.students || []).map(s => ({
        studentId:  s.student,
        name:       s.name,
        rollNumber: s.rollNumber,
        marks:      s.mark?.marks || {},
        graceMarks: s.mark?.graceMarks || 0,
        isAbsent:   s.mark?.isAbsent || false,
        remarks:    s.mark?.remarks || '',
      })));
    } catch { toast.error('Failed to load marks'); }
    finally { setLoading(false); }
  }, []);

  const setRow = (i, patch) => setRows(rs => rs.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  const setComp = (i, key, val) =>
    setRows(rs => rs.map((r, idx) => idx === i ? { ...r, marks: { ...r.marks, [key]: val === '' ? '' : Number(val) } } : r));

  const save = async (publish) => {
    if (!subjectId || !rows.length) return;
    setSaving(true);
    try {
      const marks = rows.map(r => ({
        studentId:  r.studentId,
        marks:      r.marks,
        graceMarks: Number(r.graceMarks || 0),
        isAbsent:   !!r.isAbsent,
        remarks:    r.remarks || '',
      }));
      const res = await examAdvAPI.saveMarks(subjectId, { marks, publish });
      toast.success(res.data.message || (publish ? 'Marks published' : 'Draft saved'));
      loadMarks(subjectId);
    } catch (e) {
      const errs = e.response?.data?.errors;
      toast.error(errs?.length ? errs.join(' · ') : (e.response?.data?.message || 'Failed to save marks'));
    } finally { setSaving(false); }
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 18, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div>
          <label style={LBL}>Examination</label>
          <select style={INP} value={groupId}
            onChange={e => { setGroupId(e.target.value); setSubjectId(''); setPayload(null); setRows([]); loadSubjects(e.target.value); }}>
            <option value="">Select an exam…</option>
            {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        </div>
        <div>
          <label style={LBL}>Subject / Paper</label>
          <select style={INP} value={subjectId} disabled={!groupId}
            onChange={e => { setSubjectId(e.target.value); loadMarks(e.target.value); }}>
            <option value="">Select a paper…</option>
            {subjects.map(s => (
              <option key={s._id} value={s._id}>
                {s.subject?.name} — {s.class?.name} {s.class?.section || ''}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading ? <LoadingState /> : !payload ? (
        <EmptyState icon="📝" title="Enter marks" subtitle="Choose an exam and a subject paper to begin entering student marks" />
      ) : !rows.length ? (
        <EmptyState icon="👥" title="No students" subtitle="This class has no active students to enter marks for" />
      ) : (
        <div style={CARD}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12, flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontWeight: 700, fontSize: 15 }}>
              {payload.examSubject?.subject?.name} · {payload.examSubject?.class?.name} {payload.examSubject?.class?.section || ''}
              <span style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}> · max {payload.maxMarks}</span>
            </div>
            {payload.examSubject?.isLocked &&
              <span style={{ fontSize: 11, fontWeight: 800, color: '#B91C1C', background: '#FEE2E2', padding: '3px 10px', borderRadius: 20 }}>🔒 Locked</span>}
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 620 }}>
              <thead>
                <tr>
                  {['Roll', 'Student', ...activeComponents.map(c => c[0].toUpperCase() + c.slice(1)), 'Grace', 'Absent', 'Remarks'].map(h => (
                    <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((r, i) => (
                  <tr key={r.studentId} style={{ borderBottom: '1px solid #F3F4F6' }}>
                    <td style={{ padding: '6px 10px', color: '#6B7280' }}>{r.rollNumber || '—'}</td>
                    <td style={{ padding: '6px 10px', fontWeight: 600 }}>{r.name}</td>
                    {activeComponents.map(c => (
                      <td key={c} style={{ padding: '4px 6px' }}>
                        <input type="number" min="0" disabled={r.isAbsent}
                          value={r.marks[c] ?? ''} onChange={e => setComp(i, c, e.target.value)}
                          style={{ ...INP, width: 74, padding: '6px 8px' }} />
                      </td>
                    ))}
                    <td style={{ padding: '4px 6px' }}>
                      <input type="number" min="0" value={r.graceMarks || ''}
                        onChange={e => setRow(i, { graceMarks: e.target.value })}
                        style={{ ...INP, width: 64, padding: '6px 8px' }} />
                    </td>
                    <td style={{ padding: '4px 6px', textAlign: 'center' }}>
                      <input type="checkbox" checked={r.isAbsent}
                        onChange={e => setRow(i, { isAbsent: e.target.checked })} />
                    </td>
                    <td style={{ padding: '4px 6px' }}>
                      <input value={r.remarks} onChange={e => setRow(i, { remarks: e.target.value })}
                        style={{ ...INP, minWidth: 120, padding: '6px 8px' }} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {!payload.examSubject?.isLocked && (
            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button style={BTN_GHOST} disabled={saving} onClick={() => save(false)}>{saving ? 'Saving…' : '💾 Save Draft'}</button>
              <button style={BTN} disabled={saving} onClick={() => save(true)}>{saving ? 'Publishing…' : '✅ Save & Publish'}</button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════ RESULTS (CARD/SHEET) ═
// Consolidated results for an exam group, ranked, from GET
// /exams-adv/groups/:id/results. Admins can publish/unpublish the whole exam.
// A single student's row prints as a Result Card; the whole table is the
// Result Sheet.
export function ResultsView({ groups, isAdmin }) {
  const [groupId, setGroupId]   = useState('');
  const [results, setResults]   = useState([]);
  const [group, setGroup]       = useState(null);
  const [loading, setLoading]   = useState(false);
  const [publishing, setPublishing] = useState(false);

  const load = useCallback(async (gid) => {
    if (!gid) { setResults([]); setGroup(null); return; }
    setLoading(true);
    try {
      const [rRes, gRes] = await Promise.all([
        examAdvAPI.getResults(gid),
        examAdvAPI.getGroup(gid),
      ]);
      setResults(rRes.data.data || []);
      setGroup(gRes.data.data || null);
    } catch { toast.error('Failed to load results'); }
    finally { setLoading(false); }
  }, []);

  const publish = async (flag) => {
    setPublishing(true);
    try {
      await examAdvAPI.publish(groupId, flag);
      toast.success(flag ? 'Results published' : 'Results unpublished');
      load(groupId);
    } catch (e) { toast.error(e.response?.data?.message || 'Failed'); }
    finally { setPublishing(false); }
  };

  const printSheet = () => {
    if (!results.length) return;
    const rows = results.map(r => `<tr>
      <td>${r.rank ?? '—'}</td><td>${r.student?.rollNumber || '—'}</td>
      <td>${r.student?.user?.name || '—'}</td>
      <td>${r.totalObtained ?? '—'} / ${r.totalMax ?? '—'}</td>
      <td>${r.percentage != null ? r.percentage + '%' : '—'}</td>
      <td>${r.grade || '—'}</td><td>${r.isPass ? 'PASS' : 'FAIL'}</td>
    </tr>`).join('');
    printHtml(`Result Sheet — ${group?.name || ''}`, `
      <h1>Result Sheet</h1><div class="sub">${group?.name || ''}</div>
      <table><thead><tr><th>Rank</th><th>Roll</th><th>Student</th><th>Marks</th><th>%</th><th>Grade</th><th>Result</th></tr></thead>
      <tbody>${rows}</tbody></table>`);
  };

  const printCard = (r) => {
    const subj = (r.subjects || []).map(s => `<tr>
      <td>${s.examSubject?.subject?.name || '—'}</td>
      <td>${s.obtained ?? '—'} / ${s.maxMarks ?? '—'}</td>
      <td>${s.grade || '—'}</td><td>${s.isPass ? 'Pass' : 'Fail'}</td></tr>`).join('');
    printHtml(`Result Card — ${r.student?.user?.name || ''}`, `
      <h1>Result Card</h1><div class="sub">${group?.name || ''}</div>
      <p><b>Student:</b> ${r.student?.user?.name || '—'} &nbsp; <b>Roll:</b> ${r.student?.rollNumber || '—'}
         &nbsp; <b>Class:</b> ${r.student?.class?.name || ''} ${r.student?.class?.section || ''}</p>
      <table><thead><tr><th>Subject</th><th>Marks</th><th>Grade</th><th>Result</th></tr></thead><tbody>${subj}</tbody></table>
      <p style="margin-top:14px;"><b>Total:</b> ${r.totalObtained ?? '—'} / ${r.totalMax ?? '—'}
         &nbsp; <b>Percentage:</b> ${r.percentage != null ? r.percentage + '%' : '—'}
         &nbsp; <b>Grade:</b> ${r.grade || '—'} &nbsp; <b>Rank:</b> ${r.rank ?? '—'}
         &nbsp; <b>Result:</b> ${r.isPass ? 'PASS' : 'FAIL'}</p>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={LBL}>Examination</label>
          <select style={INP} value={groupId} onChange={e => { setGroupId(e.target.value); load(e.target.value); }}>
            <option value="">Select an exam…</option>
            {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        </div>
        {results.length > 0 && <button style={BTN_GHOST} onClick={printSheet}>📄 Print Result Sheet</button>}
        {isAdmin && group && (
          group.status === 'published'
            ? <button style={BTN_GHOST} disabled={publishing} onClick={() => publish(false)}>{publishing ? '…' : '↩ Unpublish'}</button>
            : <button style={BTN} disabled={publishing || !results.length} onClick={() => publish(true)}>{publishing ? '…' : '🏆 Publish Results'}</button>
        )}
      </div>

      {loading ? <LoadingState /> : !groupId ? (
        <EmptyState icon="🏆" title="Results" subtitle="Choose an exam to view ranked results and print result cards or sheets" />
      ) : !results.length ? (
        <EmptyState icon="📊" title="No results yet" subtitle="No marks have been entered for this exam. Enter marks first." />
      ) : (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 640 }}>
            <thead>
              <tr>{['Rank', 'Roll', 'Student', 'Marks', '%', 'Grade', 'Result', ''].map(h => (
                <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
              ))}</tr>
            </thead>
            <tbody>
              {results.map(r => (
                <tr key={r.student?._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '7px 10px', fontWeight: 800 }}>{r.rank ?? '—'}</td>
                  <td style={{ padding: '7px 10px', color: '#6B7280' }}>{r.student?.rollNumber || '—'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{r.student?.user?.name || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>{r.totalObtained ?? '—'} / {r.totalMax ?? '—'}</td>
                  <td style={{ padding: '7px 10px' }}>{r.percentage != null ? r.percentage + '%' : '—'}</td>
                  <td style={{ padding: '7px 10px' }}>{r.grade || '—'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 700, color: r.isPass ? '#059669' : '#DC2626' }}>{r.isPass ? 'PASS' : 'FAIL'}</td>
                  <td style={{ padding: '5px 10px' }}>
                    <button style={{ ...BTN_GHOST, padding: '5px 10px', fontSize: 12 }} onClick={() => printCard(r)}>🎓 Card</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════ REPORTS ═
// Exam analytics computed from live results: pass %, average, highest/lowest,
// grade distribution. All derived from the same /results endpoint.
export function ReportsView({ groups }) {
  const [groupId, setGroupId] = useState('');
  const [results, setResults] = useState([]);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (gid) => {
    if (!gid) { setResults([]); return; }
    setLoading(true);
    try { const r = await examAdvAPI.getResults(gid); setResults(r.data.data || []); }
    catch { toast.error('Failed to load report'); }
    finally { setLoading(false); }
  }, []);

  const total   = results.length;
  const passed  = results.filter(r => r.isPass).length;
  const passPct = total ? Math.round((passed / total) * 1000) / 10 : 0;
  const pcts    = results.map(r => r.percentage).filter(p => p != null);
  const avg     = pcts.length ? Math.round((pcts.reduce((a, b) => a + b, 0) / pcts.length) * 10) / 10 : 0;
  const high    = pcts.length ? Math.max(...pcts) : 0;
  const low     = pcts.length ? Math.min(...pcts) : 0;
  const grades  = results.reduce((m, r) => { const g = r.grade || '—'; m[g] = (m[g] || 0) + 1; return m; }, {});

  const Metric = ({ label, value, tint }) => (
    <div style={{ ...CARD, padding: 16 }}>
      <div style={{ fontSize: 26, fontWeight: 900, color: tint }}>{value}</div>
      <div style={{ fontSize: 12, color: '#6B7280', fontWeight: 600 }}>{label}</div>
    </div>
  );

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 18 }}>
        <label style={LBL}>Examination</label>
        <select style={{ ...INP, maxWidth: 360 }} value={groupId} onChange={e => { setGroupId(e.target.value); load(e.target.value); }}>
          <option value="">Select an exam…</option>
          {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
        </select>
      </div>

      {loading ? <LoadingState /> : !groupId ? (
        <EmptyState icon="📊" title="Exam reports" subtitle="Choose an exam to see pass rate, averages and grade distribution" />
      ) : !results.length ? (
        <EmptyState icon="📉" title="No data" subtitle="No marks recorded for this exam yet" />
      ) : (
        <>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(140px,1fr))', gap: 12, marginBottom: 18 }}>
            <Metric label="Students"    value={total}          tint="#1D4ED8" />
            <Metric label="Pass Rate"   value={passPct + '%'}  tint="#059669" />
            <Metric label="Average %"   value={avg + '%'}      tint="#7C3AED" />
            <Metric label="Highest %"   value={high + '%'}     tint="#0891B2" />
            <Metric label="Lowest %"    value={low + '%'}      tint="#DC2626" />
          </div>
          <div style={CARD}>
            <div style={{ fontWeight: 700, marginBottom: 12 }}>Grade Distribution</div>
            {Object.entries(grades).sort().map(([g, n]) => (
              <div key={g} style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 8 }}>
                <div style={{ width: 40, fontWeight: 700 }}>{g}</div>
                <div style={{ flex: 1, background: '#F3F4F6', borderRadius: 6, height: 22, overflow: 'hidden' }}>
                  <div style={{ width: `${(n / total) * 100}%`, background: '#1D4ED8', height: '100%' }} />
                </div>
                <div style={{ width: 40, textAlign: 'right', color: '#6B7280' }}>{n}</div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════ DATE SHEET ═══
// Printable date sheet for an exam: every scheduled subject with its date and
// time, from the real ExamSubject records of the chosen group.
export function DateSheetView({ groups }) {
  const [groupId, setGroupId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [group, setGroup] = useState(null);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async (gid) => {
    if (!gid) { setSubjects([]); setGroup(null); return; }
    setLoading(true);
    try {
      const res = await examAdvAPI.getGroup(gid);
      setGroup(res.data.data || null);
      setSubjects(res.data.data?.subjects || []);
    } catch { toast.error('Failed to load date sheet'); }
    finally { setLoading(false); }
  }, []);

  const fmt = d => d ? new Date(d).toLocaleDateString('en-GB', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' }) : '—';

  const print = () => {
    if (!subjects.length) return;
    const rows = [...subjects].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).map(s => `<tr>
      <td>${fmt(s.date)}</td><td>${s.subject?.name || '—'}</td>
      <td>${s.class?.name || ''} ${s.class?.section || ''}</td>
      <td>${s.startTime || '—'}${s.endTime ? '–' + s.endTime : ''}</td>
      <td>${s.room || '—'}</td></tr>`).join('');
    printHtml(`Date Sheet — ${group?.name || ''}`, `
      <h1>Date Sheet</h1><div class="sub">${group?.name || ''}</div>
      <table><thead><tr><th>Date</th><th>Subject</th><th>Class</th><th>Time</th><th>Room</th></tr></thead>
      <tbody>${rows}</tbody></table>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 220 }}>
          <label style={LBL}>Examination</label>
          <select style={INP} value={groupId} onChange={e => { setGroupId(e.target.value); load(e.target.value); }}>
            <option value="">Select an exam…</option>
            {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        </div>
        {subjects.length > 0 && <button style={BTN} onClick={print}>🖨 Print Date Sheet</button>}
      </div>

      {loading ? <LoadingState /> : !groupId ? (
        <EmptyState icon="📅" title="Date sheet" subtitle="Choose an exam to view and print its date sheet" />
      ) : !subjects.length ? (
        <EmptyState icon="🗓" title="No papers scheduled" subtitle="Add subjects to this exam to build a date sheet" />
      ) : (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 560 }}>
            <thead><tr>{['Date', 'Subject', 'Class', 'Time', 'Room'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {[...subjects].sort((a, b) => new Date(a.date || 0) - new Date(b.date || 0)).map(s => (
                <tr key={s._id} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '7px 10px' }}>{fmt(s.date)}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{s.subject?.name || '—'}</td>
                  <td style={{ padding: '7px 10px' }}>{s.class?.name} {s.class?.section || ''}</td>
                  <td style={{ padding: '7px 10px' }}>{s.startTime || '—'}{s.endTime ? '–' + s.endTime : ''}</td>
                  <td style={{ padding: '7px 10px' }}>{s.room || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// ═════════════════════════════════════════════════════════════ AWARD LIST ═══
// Printable BLANK award list: the real students of a chosen class listed with
// empty mark columns, for manual entry during marking. Students come from the
// live studentAPI via the marks endpoint of any paper for that class — but to
// keep it independent of a specific paper we load the class list directly.
export function AwardListView({ groups }) {
  const [groupId, setGroupId] = useState('');
  const [subjectId, setSubjectId] = useState('');
  const [subjects, setSubjects] = useState([]);
  const [students, setStudents] = useState([]);
  const [meta, setMeta] = useState(null);
  const [loading, setLoading] = useState(false);

  const loadSubjects = useCallback(async (gid) => {
    if (!gid) { setSubjects([]); return; }
    try { const r = await examAdvAPI.getGroup(gid); setSubjects(r.data.data?.subjects || []); }
    catch { toast.error('Failed to load papers'); }
  }, []);

  const loadStudents = useCallback(async (sid) => {
    if (!sid) { setStudents([]); setMeta(null); return; }
    setLoading(true);
    try {
      const r = await examAdvAPI.getMarks(sid);   // returns the class roster
      setStudents(r.data.data?.students || []);
      setMeta(r.data.data?.examSubject || null);
    } catch { toast.error('Failed to load student list'); }
    finally { setLoading(false); }
  }, []);

  const print = () => {
    if (!students.length) return;
    const rows = students.map((s, i) => `<tr>
      <td>${i + 1}</td><td>${s.rollNumber || ''}</td><td>${s.name}</td>
      <td style="width:80px"></td><td style="width:80px"></td><td style="width:120px"></td></tr>`).join('');
    printHtml(`Award List — ${meta?.subject?.name || ''}`, `
      <h1>Blank Award List</h1>
      <div class="sub">${meta?.subject?.name || ''} — ${meta?.class?.name || ''} ${meta?.class?.section || ''}</div>
      <table><thead><tr><th>#</th><th>Roll</th><th>Student</th><th>Marks</th><th>Grace</th><th>Signature</th></tr></thead>
      <tbody>${rows}</tbody></table>`);
  };

  return (
    <div>
      <div style={{ ...CARD, marginBottom: 18, display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={LBL}>Examination</label>
          <select style={INP} value={groupId} onChange={e => { setGroupId(e.target.value); setSubjectId(''); setStudents([]); loadSubjects(e.target.value); }}>
            <option value="">Select an exam…</option>
            {groups.map(g => <option key={g._id} value={g._id}>{g.name}</option>)}
          </select>
        </div>
        <div style={{ flex: 1, minWidth: 200 }}>
          <label style={LBL}>Subject / Class</label>
          <select style={INP} value={subjectId} disabled={!groupId} onChange={e => { setSubjectId(e.target.value); loadStudents(e.target.value); }}>
            <option value="">Select a paper…</option>
            {subjects.map(s => <option key={s._id} value={s._id}>{s.subject?.name} — {s.class?.name} {s.class?.section || ''}</option>)}
          </select>
        </div>
        {students.length > 0 && <button style={BTN} onClick={print}>🖨 Print Award List</button>}
      </div>

      {loading ? <LoadingState /> : !students.length ? (
        <EmptyState icon="📋" title="Blank award list" subtitle="Choose an exam and paper to generate a printable blank award list" />
      ) : (
        <div style={{ ...CARD, overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
            <thead><tr>{['#', 'Roll', 'Student', 'Marks', 'Grace', 'Signature'].map(h => (
              <th key={h} style={{ textAlign: 'left', padding: '8px 10px', borderBottom: '2px solid #E5E7EB', fontSize: 11, color: '#6B7280', textTransform: 'uppercase' }}>{h}</th>
            ))}</tr></thead>
            <tbody>
              {students.map((s, i) => (
                <tr key={s.student} style={{ borderBottom: '1px solid #F3F4F6' }}>
                  <td style={{ padding: '7px 10px' }}>{i + 1}</td>
                  <td style={{ padding: '7px 10px', color: '#6B7280' }}>{s.rollNumber || '—'}</td>
                  <td style={{ padding: '7px 10px', fontWeight: 600 }}>{s.name}</td>
                  <td style={{ padding: '7px 10px', color: '#D1D5DB' }}>________</td>
                  <td style={{ padding: '7px 10px', color: '#D1D5DB' }}>____</td>
                  <td style={{ padding: '7px 10px', color: '#D1D5DB' }}>____________</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}