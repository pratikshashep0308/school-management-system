// frontend/src/components/admissions/AdmissionDetailModal.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI, StatusBadge, STATUS_CONFIG } from '../../utils/admissionUtils';
import { studentAPI, classAPI } from '../../utils/api';

const DOCS = [
  { key: 'birthCertificate',    label: 'Birth Certificate'    },
  { key: 'transferCertificate', label: 'Transfer Certificate' },
  { key: 'marksheet',           label: 'Marksheet'            },
  { key: 'aadhaarCard',         label: 'Aadhaar Card'         },
  { key: 'passportPhoto',       label: 'Passport Photo'       },
  { key: 'casteCertificate',    label: 'Caste Certificate'    },
  { key: 'medicalCertificate',  label: 'Medical Certificate'  },
  { key: 'addressProof',        label: 'Address Proof'        },
];

const STATUSES = Object.entries(STATUS_CONFIG).map(([key, cfg]) => ({ key, label: cfg.label }));

export default function AdmissionDetailModal({ id, onClose, onScheduleInterview }) {
  const [app, setApp]         = useState(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab]         = useState('details'); // details | documents | timeline | notes
  const [saving, setSaving]   = useState(false);
  const [enrolling, setEnrolling] = useState(false);
  const [classes, setClasses]     = useState([]);
  const [enrollClass, setEnrollClass] = useState('');
  const [enrollRoll, setEnrollRoll]   = useState('');
  const [showEnroll, setShowEnroll]   = useState(false);

  // Status update
  const [newStatus, setNewStatus]   = useState('');
  const [statusNote, setStatusNote] = useState('');
  const [rejReason, setRejReason]   = useState('');

  // Note
  const [note, setNote]           = useState('');
  const [isInternal, setInternal] = useState(false);

  const load = async () => {
    try {
      const res = await admissionAPI.getById(id);
      setApp(res.data.data);
      setNewStatus(res.data.data.status);
    } catch { toast.error('Failed to load application'); }
    finally { setLoading(false); }
  };

  useEffect(() => { load(); classAPI.getAll().then(r=>setClasses(r.data.data||[])).catch(()=>{}); }, [id]);

  const handleStatusUpdate = async () => {
    if (!newStatus) return;
    setSaving(true);
    try {
      await admissionAPI.updateStatus(id, { status: newStatus, notes: statusNote, rejectionReason: rejReason });
      toast.success('Status updated');
      setStatusNote(''); setRejReason('');
      load();
    } catch { toast.error('Update failed'); }
    finally { setSaving(false); }
  };

  const handleDocToggle = async (docKey, currentVal) => {
    try {
      await admissionAPI.updateDocuments(id, { [`${docKey}.submitted`]: !currentVal });
      load();
    } catch { toast.error('Update failed'); }
  };

  const handleAddNote = async () => {
    if (!note.trim()) return;
    setSaving(true);
    try {
      await admissionAPI.addNote(id, { note, isInternal });
      toast.success('Note added');
      setNote('');
      load();
    } catch { toast.error('Failed to add note'); }
    finally { setSaving(false); }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' }) : '—';
  const fmtTime = (d) => d ? new Date(d).toLocaleString('en-IN', { day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' }) : '—';

  const docsSubmitted = app ? DOCS.filter(d => app.documents?.[d.key]?.submitted).length : 0;

  const handleEnroll = async () => {
    if (!enrollClass) return toast.error('Please select a class');
    setEnrolling(true);
    try {
      // Build student payload from admission data
      // Build clean unique email from name + timestamp
      const nameParts = (app.studentName||'student').toLowerCase().split(' ');
      const cleanName = nameParts.join('');
      const uniqueEmail = cleanName + '.' + Date.now() + '@student.local';
      
      const payload = {
        name:            app.studentName,
        email:           uniqueEmail,
        phone:           app.parentPhone || '',
        password:        'Student@123',
        role:            'student',
        classId:         enrollClass,
        rollNumber:      enrollRoll || '',
        gender:          app.gender || 'other',
        parentName:      app.parentName || '',
        parentPhone:     app.parentPhone || '',
        parentEmail:     app.parentEmail || '',
        admissionNumber: `${app.applicationNumber || 'STU'}-${Date.now().toString().slice(-6)}`,
        status:          'active',
        isActive:        true,
      };
      await studentAPI.create(payload);
      // Update admission status to enrolled
      await admissionAPI.updateStatus(id, { status: 'enrolled', notes: `Enrolled in class. Roll: ${enrollRoll||'—'}` });
      toast.success(`✅ ${app.studentName} enrolled successfully!`);
      console.log('Student login:', payload.email, '/ Student@123');
      setShowEnroll(false);
      load();
    } catch (err) {
      const msg = err.response?.data?.message || err.message || 'Enrollment failed';
      console.error('Enrollment error:', err.response?.data || err);
      toast.error(msg);
    } finally { setEnrolling(false); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        {loading ? (
          <div className="p-10 text-center text-slate-400">Loading...</div>
        ) : !app ? (
          <div className="p-10 text-center text-red-400">Application not found</div>
        ) : (
          <>
            {/* Top bar */}
            <div className="flex items-start justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
              <div className="flex items-center gap-4">
                <div className="w-12 h-12 rounded-full bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-lg">
                  {app.studentName?.[0]?.toUpperCase()}
                </div>
                <div>
                  <h2 className="font-bold text-slate-800 text-lg">{app.studentName}</h2>
                  <div className="flex items-center gap-3 mt-0.5">
                    <span className="font-mono text-xs text-slate-400">{app.applicationNumber}</span>
                    <StatusBadge status={app.status} />
                    {app.priority !== 'normal' && (
                      <span className={`text-xs font-semibold ${app.priority === 'urgent' ? 'text-red-600' : 'text-orange-500'}`}>
                        {app.priority === 'urgent' ? '🔴 Urgent' : '🟠 High Priority'}
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                {!showEnroll && app.status !== 'enrolled' && (
                  <button onClick={()=>setShowEnroll(true)}
                    className="px-4 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 flex items-center gap-1">
                    🎓 Enroll as Student
                  </button>
                )}
                <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl px-2">✕</button>
              </div>
            </div>

            {/* Quick stats bar */}
            <div className="grid grid-cols-4 border-b border-slate-100 flex-shrink-0">
              {[
                { label: 'Grade',     value: `Grade ${app.applyingForClass}${app.applyingForSection ? ' – ' + app.applyingForSection : ''}` },
                { label: 'Applied',   value: fmt(app.createdAt) },
                { label: 'Documents', value: `${docsSubmitted}/${DOCS.length} submitted` },
                { label: 'Interview', value: app.interview?.completed ? `✅ Score: ${app.interview.score ?? '—'}/100` : app.interview?.scheduled ? '📅 Scheduled' : '—' },
              ].map(s => (
                <div key={s.label} className="px-5 py-3 text-center border-r border-slate-100 last:border-0">
                  <div className="text-xs text-slate-400 mb-0.5">{s.label}</div>
                  <div className="text-sm font-semibold text-slate-700">{s.value}</div>
                </div>
              ))}
            </div>

            {/* Enroll Panel */}
        {showEnroll && (
          <div className="mx-6 mb-2 mt-2 bg-emerald-50 border border-emerald-200 rounded-xl p-4">
            <div className="font-semibold text-emerald-800 text-sm mb-3">🎓 Enroll {app?.studentName} as Student</div>
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Class *</label>
                <select value={enrollClass} onChange={e=>setEnrollClass(e.target.value)}
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400">
                  <option value="">Select Class</option>
                  {classes.map(cl=><option key={cl._id} value={cl._id}>{cl.name} {cl.section||''}</option>)}
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase mb-1">Roll Number</label>
                <input value={enrollRoll} onChange={e=>setEnrollRoll(e.target.value)} placeholder="e.g. 01"
                  className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-emerald-400"/>
              </div>
            </div>
            <div className="text-xs text-emerald-700 bg-emerald-100 rounded-lg p-2 mb-3">
              Default password: <strong>Student@123</strong> — student can change after first login
            </div>
            <div className="flex gap-2">
              <button onClick={handleEnroll} disabled={enrolling}
                className="flex-1 py-2 rounded-lg bg-emerald-600 text-white text-sm font-semibold hover:bg-emerald-700 disabled:opacity-50">
                {enrolling ? 'Enrolling...' : '✓ Confirm Enrollment'}
              </button>
              <button onClick={()=>setShowEnroll(false)}
                className="px-4 py-2 rounded-lg border border-slate-200 text-slate-600 text-sm hover:bg-slate-50">
                Cancel
              </button>
            </div>
          </div>
        )}

        {/* Tabs */}
            <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
              {[
                { id: 'details',   label: '📋 Details'   },
                { id: 'documents', label: `📎 Documents (${docsSubmitted}/${DOCS.length})` },
                { id: 'status',    label: '🔄 Update Status' },
                { id: 'timeline',  label: `📜 Timeline (${app.timeline?.length || 0})` },
                { id: 'notes',     label: '💬 Notes'     },
              ].map(t => (
                <button key={t.id} onClick={() => setTab(t.id)}
                  className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                    tab === t.id ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
                  }`}>
                  {t.label}
                </button>
              ))}
            </div>

            {/* Tab content */}
            <div className="flex-1 overflow-y-auto p-6">

              {/* ── DETAILS TAB ── */}
              {tab === 'details' && (
                <div className="space-y-6">
                  <Section title="Student Information">
                    <Grid>
                      <Field label="Full Name"      value={app.studentName} />
                      <Field label="Date of Birth"  value={fmt(app.dateOfBirth)} />
                      <Field label="Gender"         value={app.gender} capitalize />
                      <Field label="Blood Group"    value={app.bloodGroup} />
                      <Field label="Nationality"    value={app.nationality} />
                      <Field label="Religion"       value={app.religion} />
                      <Field label="Category"       value={app.category?.toUpperCase()} />
                      <Field label="Mother Tongue"  value={app.motherTongue} />
                      <Field label="Aadhaar"        value={app.aadhaarNumber} />
                    </Grid>
                  </Section>

                  <Section title="Address">
                    <Grid>
                      <Field label="Street"   value={app.address?.street}  />
                      <Field label="City"     value={app.address?.city}    />
                      <Field label="State"    value={app.address?.state}   />
                      <Field label="Pincode"  value={app.address?.pincode} />
                    </Grid>
                  </Section>

                  <Section title="Academic Background">
                    <Grid>
                      <Field label="Applying for Grade"   value={`Grade ${app.applyingForClass}`} />
                      <Field label="Section Preferred"    value={app.applyingForSection} />
                      <Field label="Academic Year"        value={app.academicYear} />
                      <Field label="Previous School"      value={app.previousSchool} />
                      <Field label="Previous Class"       value={app.previousClass} />
                      <Field label="Previous Grade/CGPA"  value={app.previousGrade} />
                      <Field label="Board"                value={app.previousBoard} />
                      <Field label="TC Number"            value={app.tcNumber} />
                    </Grid>
                  </Section>

                  <Section title="Father's Details">
                    <Grid>
                      <Field label="Name"           value={app.father?.name} />
                      <Field label="Occupation"     value={app.father?.occupation} />
                      <Field label="Phone"          value={app.father?.phone} />
                      <Field label="Email"          value={app.father?.email} />
                      <Field label="Qualification"  value={app.father?.qualification} />
                      <Field label="Annual Income"  value={app.father?.income ? `₹${app.father.income.toLocaleString('en-IN')}` : null} />
                    </Grid>
                  </Section>

                  <Section title="Mother's Details">
                    <Grid>
                      <Field label="Name"           value={app.mother?.name} />
                      <Field label="Occupation"     value={app.mother?.occupation} />
                      <Field label="Phone"          value={app.mother?.phone} />
                      <Field label="Email"          value={app.mother?.email} />
                      <Field label="Qualification"  value={app.mother?.qualification} />
                    </Grid>
                  </Section>

                  {app.emergencyContact?.name && (
                    <Section title="Emergency Contact">
                      <Grid>
                        <Field label="Name"     value={app.emergencyContact.name} />
                        <Field label="Relation" value={app.emergencyContact.relation} />
                        <Field label="Phone 1"  value={app.emergencyContact.phone} />
                        <Field label="Phone 2"  value={app.emergencyContact.phone2} />
                      </Grid>
                    </Section>
                  )}

                  {(app.medical?.hasAllergies || app.medical?.hasCondition) && (
                    <Section title="Medical Information">
                      <Grid>
                        {app.medical.hasAllergies && <Field label="Allergies" value={app.medical.allergies} />}
                        {app.medical.hasCondition && <Field label="Medical Condition" value={app.medical.condition} />}
                        <Field label="Medications"  value={app.medical.medications} />
                        <Field label="Doctor Name"  value={app.medical.doctorName} />
                        <Field label="Doctor Phone" value={app.medical.doctorPhone} />
                      </Grid>
                    </Section>
                  )}

                  {app.siblings?.length > 0 && (
                    <Section title="Siblings">
                      <div className="space-y-2">
                        {app.siblings.map((sib, i) => (
                          <div key={i} className="flex gap-6 bg-slate-50 rounded-xl px-4 py-3 text-sm">
                            <span className="font-medium text-slate-700">{sib.name}</span>
                            <span className="text-slate-500">Class {sib.class}</span>
                            <span className="text-slate-400">{sib.school}</span>
                          </div>
                        ))}
                      </div>
                    </Section>
                  )}

                  <Section title="Application Meta">
                    <Grid>
                      <Field label="Source"       value={app.source?.replace('_', ' ')} capitalize />
                      <Field label="Referred By"  value={app.referredBy} />
                      <Field label="Reg. Fee Paid" value={app.registrationFee?.paid ? `Yes · ₹${app.registrationFee.amount}` : 'No'} />
                    </Grid>
                  </Section>

                  {/* Interview section */}
                  <Section title="Interview Details">
                    {app.interview?.scheduled ? (
                      <Grid>
                        <Field label="Date"        value={fmt(app.interview.date)} />
                        <Field label="Time"        value={app.interview.time} />
                        <Field label="Mode"        value={app.interview.mode?.replace('_', ' ')} capitalize />
                        <Field label="Venue"       value={app.interview.venue} />
                        <Field label="Score"       value={app.interview.score !== undefined ? `${app.interview.score}/100` : null} />
                        <Field label="Status"      value={app.interview.completed ? 'Completed' : 'Pending'} />
                        <Field label="Remarks"     value={app.interview.remarks} />
                      </Grid>
                    ) : (
                      <div className="flex items-center gap-3">
                        <p className="text-slate-400 text-sm">No interview scheduled yet.</p>
                        <button onClick={() => onScheduleInterview(app)}
                          className="px-4 py-2 rounded-xl bg-violet-600 text-white text-sm font-semibold hover:bg-violet-700">
                          📅 Schedule Interview
                        </button>
                      </div>
                    )}
                  </Section>
                </div>
              )}

              {/* ── DOCUMENTS TAB ── */}
              {tab === 'documents' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">{docsSubmitted} of {DOCS.length} documents submitted</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DOCS.map(doc => {
                      const docData  = app.documents?.[doc.key];
                      const submitted = docData?.submitted || false;
                      const fileUrl   = docData?.url || '';
                      const fileName  = docData?.fileName || '';
                      // Only treat as "has viewable file" if the url is a real,
                      // openable resource — not a legacy filename string
                      const isViewable = fileUrl && (
                        fileUrl.startsWith('data:') ||
                        fileUrl.startsWith('blob:') ||
                        /^https?:\/\//i.test(fileUrl)
                      );
                      const hasFile = isViewable;

                      const openFile = (e) => {
                        e.stopPropagation();
                        if (!fileUrl) return;

                        // Detect what kind of URL we have:
                        //   - data:    → base64 data URL (new uploads — embed preview)
                        //   - http(s)  → real remote URL (open directly)
                        //   - blob:    → in-memory blob URL (open directly)
                        //   - anything else (filename like "cert.pdf", "/path", etc)
                        //     → legacy data; the actual file was never uploaded.
                        //       Don't redirect anywhere — just inform the user.
                        const isData  = fileUrl.startsWith('data:');
                        const isHttp  = /^https?:\/\//i.test(fileUrl);
                        const isBlob  = fileUrl.startsWith('blob:');

                        if (!isData && !isHttp && !isBlob) {
                          alert(
                            `This document was marked as submitted but the actual file ` +
                            `is not available for viewing.\n\n` +
                            `Filename on record: ${fileName || fileUrl}\n\n` +
                            `Please ask the parent to re-upload the file using the ` +
                            `Edit option on this admission.`
                          );
                          return;
                        }

                        const w = window.open();
                        if (!w) {
                          alert('Could not open new tab. Please allow pop-ups for this site.');
                          return;
                        }

                        if (isData) {
                          // Embed preview so PDFs render in the new tab
                          const isImage = (docData.mimeType || '').startsWith('image/');
                          w.document.write(
                            `<title>${fileName || doc.label}</title>` +
                            `<style>body{margin:0;background:#1f2937;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;color:#fff}img,embed{max-width:100%;max-height:100vh}</style>` +
                            (isImage
                              ? `<img src="${fileUrl}" alt="${fileName || ''}"/>`
                              : `<embed src="${fileUrl}" type="${docData.mimeType || 'application/pdf'}" width="100%" height="100%" style="height:100vh"/>`)
                          );
                        } else {
                          // http(s) or blob — open directly
                          w.location.href = fileUrl;
                        }
                      };

                      return (
                        <div key={doc.key}
                          className={`flex items-center gap-3 p-4 rounded-xl border-2 transition-all ${
                            submitted
                              ? 'border-emerald-300 bg-emerald-50'
                              : 'border-slate-200 bg-slate-50 hover:border-indigo-300 cursor-pointer'
                          }`}
                          onClick={() => handleDocToggle(doc.key, submitted)}>
                          <div className={`w-6 h-6 rounded-full border-2 flex items-center justify-center flex-shrink-0 ${
                            submitted ? 'border-emerald-500 bg-emerald-500 text-white' : 'border-slate-300'
                          }`}>
                            {submitted && <span className="text-xs">✓</span>}
                          </div>
                          <div className="flex-1 min-w-0">
                            <div className={`text-sm font-medium ${submitted ? 'text-emerald-700' : 'text-slate-600'}`}>
                              {doc.label}
                            </div>
                            {hasFile && fileName && (
                              <div className="text-xs text-slate-500 mt-0.5 truncate">
                                📎 {fileName}
                              </div>
                            )}
                          </div>
                          {hasFile ? (
                            <button
                              onClick={openFile}
                              className="ml-auto text-xs px-3 py-1.5 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                              title="View uploaded file">
                              👁 View
                            </button>
                          ) : submitted ? (
                            <span className="ml-auto text-xs text-emerald-600">Received</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                  <p className="text-xs text-slate-400 mt-4">Click on a document row to toggle submitted/pending. Click <b>View</b> to open the file.</p>
                </div>
              )}

              {/* ── STATUS UPDATE TAB ── */}
              {tab === 'status' && (
                <div className="max-w-md space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">New Status</label>
                    <div className="grid grid-cols-2 gap-2">
                      {STATUSES.map(s => {
                        const cfg = STATUS_CONFIG[s.key];
                        return (
                          <button key={s.key} onClick={() => setNewStatus(s.key)}
                            className={`px-3 py-2.5 rounded-xl text-sm font-semibold border-2 transition-all text-left flex items-center gap-2 ${
                              newStatus === s.key
                                ? `${cfg.border} ${cfg.bg} ${cfg.text}`
                                : 'border-slate-200 text-slate-600 hover:border-slate-300'
                            }`}>
                            <span className={`w-2 h-2 rounded-full ${cfg.dot}`} />
                            {s.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {newStatus === 'rejected' && (
                    <div>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Rejection Reason</label>
                      <textarea rows={2} value={rejReason} onChange={e => setRejReason(e.target.value)}
                        placeholder="Reason for rejection..."
                        className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    </div>
                  )}

                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">Note (optional)</label>
                    <textarea rows={2} value={statusNote} onChange={e => setStatusNote(e.target.value)}
                      placeholder="Add a note for this status change..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                  </div>

                  <button onClick={handleStatusUpdate} disabled={saving || newStatus === app.status}
                    className="w-full py-2.5 rounded-xl bg-indigo-600 text-white font-semibold text-sm hover:bg-indigo-700 disabled:opacity-50">
                    {saving ? 'Updating...' : 'Update Status'}
                  </button>
                </div>
              )}

              {/* ── TIMELINE TAB ── */}
              {tab === 'timeline' && (
                <div className="space-y-1">
                  {!app.timeline?.length ? (
                    <p className="text-slate-400 text-sm">No activity yet</p>
                  ) : (
                    [...app.timeline].reverse().map((entry, i) => (
                      <div key={i} className="flex gap-4 pb-4">
                        <div className="flex flex-col items-center">
                          <div className="w-8 h-8 rounded-full bg-indigo-100 text-indigo-600 flex items-center justify-center text-xs font-bold flex-shrink-0">
                            {entry.byName?.[0]?.toUpperCase() || '?'}
                          </div>
                          {i < app.timeline.length - 1 && <div className="w-0.5 flex-1 bg-slate-200 mt-1" />}
                        </div>
                        <div className="flex-1 pb-2">
                          <div className="flex items-center justify-between">
                            <p className="text-sm font-semibold text-slate-700">{entry.action}</p>
                            <span className="text-xs text-slate-400">{fmtTime(entry.at)}</span>
                          </div>
                          <p className="text-xs text-slate-500 mt-0.5">by {entry.byName || 'System'}</p>
                          {entry.note && (
                            <p className="text-xs text-slate-600 bg-slate-50 rounded-lg px-3 py-2 mt-2 border border-slate-200">
                              {entry.note}
                            </p>
                          )}
                        </div>
                      </div>
                    ))
                  )}
                </div>
              )}

              {/* ── NOTES TAB ── */}
              {tab === 'notes' && (
                <div className="space-y-4">
                  {app.notes && (
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-amber-600 mb-1">General Note</p>
                      <p className="text-sm text-amber-800">{app.notes}</p>
                    </div>
                  )}
                  {app.internalNotes && (
                    <div className="bg-slate-50 border border-slate-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-slate-500 mb-1">📌 Internal Note (staff only)</p>
                      <p className="text-sm text-slate-700">{app.internalNotes}</p>
                    </div>
                  )}
                  {app.rejectionReason && (
                    <div className="bg-red-50 border border-red-200 rounded-xl p-4">
                      <p className="text-xs font-semibold text-red-500 mb-1">Rejection Reason</p>
                      <p className="text-sm text-red-700">{app.rejectionReason}</p>
                    </div>
                  )}

                  <div className="border-t border-slate-100 pt-4 space-y-3">
                    <textarea rows={3} value={note} onChange={e => setNote(e.target.value)}
                      placeholder="Add a note..."
                      className="w-full px-3 py-2 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400" />
                    <div className="flex items-center justify-between">
                      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
                        <input type="checkbox" checked={isInternal} onChange={e => setInternal(e.target.checked)}
                          className="rounded" />
                        Internal note (staff only)
                      </label>
                      <button onClick={handleAddNote} disabled={saving || !note.trim()}
                        className="px-4 py-2 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
                        {saving ? 'Adding...' : 'Add Note'}
                      </button>
                    </div>
                  </div>
                </div>
              )}

            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ── Helper sub-components ──
function Section({ title, children }) {
  return (
    <div>
      <h3 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100">{title}</h3>
      {children}
    </div>
  );
}
function Grid({ children }) {
  return <div className="grid grid-cols-2 sm:grid-cols-3 gap-x-6 gap-y-3">{children}</div>;
}
function Field({ label, value, capitalize }) {
  if (!value && value !== 0) return null;
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium text-slate-700 ${capitalize ? 'capitalize' : ''}`}>{value}</p>
    </div>
  );
}