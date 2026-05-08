// frontend/src/components/admissions/AdmissionDetailModal.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI, StatusBadge, STATUS_CONFIG } from '../../utils/admissionUtils';
import { studentAPI, classAPI } from '../../utils/api';

// Keys MUST match AdmissionFormModal.js — the form writes these keys into
// admission.documents and this modal reads them back. If they drift, uploads
// appear "missing" here even though they were saved successfully.
const DOCS = [
  { key: 'birthCertificate',     label: 'Birth Certificate'           },
  { key: 'aadhaarStudent',       label: 'Aadhaar Card (Student)'      },
  { key: 'aadhaarParent',        label: 'Aadhaar Card (Parent)'       },
  { key: 'photos',               label: 'Passport Photos (2–4)'       },
  { key: 'addressProof',         label: 'Address Proof'               },
  { key: 'apaarId',              label: 'APAAR ID'                    },
  { key: 'leavingCertificate',   label: 'Leaving Certificate (LC)'    },
  { key: 'transferCertificate',  label: 'Transfer Certificate (TC)'   },
  { key: 'previousMarksheet',    label: 'Previous Marksheet'          },
  { key: 'studentId',            label: 'Student ID (previous school)'},
  { key: 'casteCertificate',     label: 'Caste Certificate'           },
  { key: 'incomeCertificate',    label: 'Income Certificate'          },
  { key: 'bankDetails',          label: 'Bank Account Details'        },
  { key: 'medicalCertificate',   label: 'Medical Certificate'         },
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

  // Resolve applyingForClass to a friendly label.
  // Form can store the class ID (24-hex Mongo id) OR a free-text class name.
  const formatClass = (raw) => {
    if (!raw) return '—';
    const isObjectId = typeof raw === 'string' && /^[0-9a-fA-F]{24}$/.test(raw);
    if (isObjectId) {
      const cls = classes.find(c => c._id === raw);
      if (cls) return `${cls.name}${cls.section ? ' ' + cls.section : ''}`;
      // Class not found (deleted or still loading) — don't show the raw ID
      return classes.length === 0 ? '—' : 'Unknown class';
    }
    // Free text — display as-is
    return raw;
  };

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

  // Standard checklist docs that have been submitted
  const stdDocsSubmitted = app
    ? DOCS.filter(d => {
        const dd = app.documents?.[d.key];
        return dd && (dd.submitted || dd.data || dd.url);
      }).length
    : 0;
  // Custom docs that have at least one file
  const customDocsSubmitted = app && Array.isArray(app.customDocuments)
    ? app.customDocuments.filter(d => Array.isArray(d?.files) && d.files.length > 0).length
    : 0;
  const customDocsTotal = app && Array.isArray(app.customDocuments) ? app.customDocuments.length : 0;
  // Combined counts shown in tab strip / stat row
  const docsSubmitted = stdDocsSubmitted + customDocsSubmitted;
  const docsTotal     = DOCS.length + customDocsTotal;

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
                  <button onClick={()=>{
                    // Pre-fill the class with whatever the applicant applied for
                    // (if it's a real class ID that matches our class list).
                    const applied = app.applyingForClass || '';
                    const isObjectId = /^[0-9a-fA-F]{24}$/.test(applied);
                    if (isObjectId && classes.find(c => c._id === applied)) {
                      setEnrollClass(applied);
                    } else if (applied) {
                      // Try matching by name (case-insensitive) for free-text values
                      const match = classes.find(c =>
                        (c.name || '').toLowerCase() === applied.toLowerCase() ||
                        `${c.name} ${c.section||''}`.trim().toLowerCase() === applied.toLowerCase()
                      );
                      if (match) setEnrollClass(match._id);
                    }
                    setShowEnroll(true);
                  }}
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
                { label: 'Grade',     value: formatClass(app.applyingForClass) },
                { label: 'Applied',   value: fmt(app.createdAt) },
                { label: 'Documents', value: `${docsSubmitted}/${docsTotal} submitted` },
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
            <div className="text-xs text-emerald-700 bg-emerald-100/70 rounded-lg p-2 mb-3">
              ℹ️ Confirm the class assignment below — pre-filled from the application. You can change it before enrolling.
            </div>
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
                { id: 'documents', label: `📎 Documents (${docsSubmitted}/${docsTotal})` },
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
              {/* Section order MATCHES the admission form exactly:
                  1. Student Information
                  2. Other Information
                  3. Parent / Guardian Information   (includes Address as a sub-block)
                  4. Government IDs
                  5. Bank Details
                  6. Additional Information          (Previous School + meta + notes merged)
                  7. Interview Details               (kept at the end as it's admin-only) */}
              {tab === 'details' && (() => {
                // Friendly enum-ish labels
                const orphanLabels = {
                  orphan: 'Orphan',
                  single_parent_mother: 'Single Parent (Mother)',
                  single_parent_father: 'Single Parent (Father)',
                  not_applicable: 'Not Applicable',
                };
                const yn = v => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '';

                // Father / mother data — form stores both nested AND flat depending on
                // when the record was saved, so fall back across both shapes.
                const fatherName       = app.father?.name        || app.fatherName        || '';
                const fatherOccupation = app.father?.occupation  || app.fatherOccupation  || '';
                const fatherPhone      = app.father?.phone       || app.fatherPhone       || '';
                const fatherAadhaar    = app.father?.aadhaar     || app.fatherAadhaar     || '';
                const motherName       = app.mother?.name        || app.motherName        || '';
                const motherOccupation = app.mother?.occupation  || app.motherOccupation  || '';
                const motherPhone      = app.mother?.phone       || app.motherPhone       || '';
                const motherAadhaar    = app.mother?.aadhaar     || app.motherAadhaar     || '';

                const govIds = (app.governmentIds || []).filter(g => g && (g.type || g.number));

                return (
                <div className="space-y-6">
                  {/* 1 ─────────────────────────────────────────────── */}
                  <Section title="1. Student Information">
                    <Grid>
                      <Field label="First Name"            value={app.firstName} />
                      <Field label="Middle Name"           value={app.middleName} />
                      <Field label="Last Name"             value={app.lastName} />
                      <Field label="Full Name"             value={app.studentName} />
                      <Field label="Registration No"       value={app.registrationNo} />
                      <Field label="Application No"        value={app.applicationNumber} />
                      <Field label="Applying for Grade"    value={formatClass(app.applyingForClass)} />
                      <Field label="Section Preferred"     value={app.applyingForSection} />
                      <Field label="Date of Admission"     value={fmt(app.dateOfAdmission)} />
                      <Field label="Academic Year"         value={app.academicYear} />
                      <Field label="Discount in Fee"       value={app.discountInFee ? `${app.discountInFee}%` : ''} />
                      <Field label="Mobile (SMS/WhatsApp)" value={app.mobileForSMS} />
                      <Field label="Aadhaar Number"        value={app.aadhaarNumber} />
                      <Field label="Category"              value={app.category} capitalize />
                      <Field label="Non-Creamy Layer"      value={yn(app.nonCreamyLayer)} />
                      <Field label="Email"                 value={app.parentEmail || app.email} />
                    </Grid>
                  </Section>

                  {/* 2 ─────────────────────────────────────────────── */}
                  <Section title="2. Other Information">
                    <Grid>
                      <Field label="Date of Birth"         value={fmt(app.dateOfBirth)} />
                      <Field label="Birth Form ID / NIC"   value={app.birthFormId} />
                      <Field label="Gender"                value={app.gender} capitalize />
                      <Field label="Orphan Status"         value={orphanLabels[app.orphanStudent] || app.orphanStudent} />
                      <Field label="Caste"                 value={app.cast} />
                      <Field label="Religion"              value={app.religion} />
                      <Field label="Blood Group"           value={app.bloodGroup} />
                      <Field label="Total Siblings"        value={app.totalSiblings} />
                      <Field label="Nationality"           value={app.nationality} />
                      <Field label="Identification Mark"   value={app.identificationMark} />
                      <Field label="Disease (if any)"      value={app.disease} />
                      <Field label="Is Disabled?"          value={yn(app.isDisabled)} />
                      <Field label="Disability %"          value={app.disabilityPercentage ? `${app.disabilityPercentage}%` : ''} />
                      <Field label="Disability Type"       value={app.disabilityType} />
                    </Grid>
                    <div className="mt-3 pt-3 border-t border-slate-200 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-3">
                      <div>
                        <p className="text-xs text-slate-400 mb-0.5">Address Proof Type</p>
                        <p className={`text-sm font-medium ${app.addressProofType ? 'text-slate-700' : 'text-slate-300'}`}>
                          {app.addressProofType
                            ? (app.addressProofType === '__other__' ? (app.addressProofTypeOther || 'Other') : app.addressProofType)
                            : '—'}
                        </p>
                      </div>
                      <div className="sm:col-span-2">
                        <p className="text-xs text-slate-400 mb-0.5">Additional Note</p>
                        <p className={`text-sm ${app.additionalNote ? 'text-slate-700' : 'text-slate-300'}`}>
                          {app.additionalNote || '—'}
                        </p>
                      </div>
                    </div>
                  </Section>

                  {/* 3 ─────────────────────────────────────────────── */}
                  <Section title="3. Parent / Guardian Information">
                    <Grid>
                      <Field label="Father's Name"         value={fatherName} />
                      <Field label="Father's Occupation"   value={fatherOccupation} />
                      <Field label="Father's Phone"        value={fatherPhone} />
                      <Field label="Father's Aadhaar"      value={fatherAadhaar} />
                      <Field label="Mother's Name"         value={motherName} />
                      <Field label="Mother's Occupation"   value={motherOccupation} />
                      <Field label="Mother's Phone"        value={motherPhone} />
                      <Field label="Mother's Aadhaar"      value={motherAadhaar} />
                      <Field label="Guardian's Name"       value={app.guardianName     || app.guardian?.name} />
                      <Field label="Guardian's Relation"   value={app.guardianRelation || app.guardian?.relation} />
                      <Field label="Guardian's Phone"      value={app.guardianPhone    || app.guardian?.phone} />
                      <Field label="Primary Contact"       value={app.parentName} />
                      <Field label="Contact Phone"         value={app.parentPhone} />
                    </Grid>
                    {/* Address as a sub-block at the bottom of this section, like in the form */}
                    <div className="mt-4 pt-3 border-t border-slate-200">
                      <p className="text-xs font-bold text-slate-500 uppercase tracking-wide mb-2">Address</p>
                      <Grid>
                        <Field label="Street"   value={app.address?.street  || app.address}  />
                        <Field label="City"     value={app.address?.city    || app.city}     />
                        <Field label="State"    value={app.address?.state   || app.state}    />
                        <Field label="Pincode"  value={app.address?.pincode || app.pincode}  />
                      </Grid>
                    </div>
                  </Section>

                  {/* 4 ─────────────────────────────────────────────── */}
                  <Section title="4. Government IDs">
                    {govIds.length > 0 ? (
                      <Grid>
                        {govIds.map((g, i) => (
                          <Field key={i} label={g.type || `ID ${i+1}`} value={g.number} />
                        ))}
                      </Grid>
                    ) : (
                      <p className="text-sm text-slate-400">— No Government IDs added</p>
                    )}
                  </Section>

                  {/* 5 ─────────────────────────────────────────────── */}
                  <Section title="5. Bank Details">
                    <Grid>
                      <Field label="Account Holder"  value={app.bankAccountHolder} />
                      <Field label="Bank Name"       value={app.bankName} />
                      <Field label="Branch Name"     value={app.bankBranchName} />
                      <Field label="IFSC Code"       value={app.bankIfsc} />
                      <Field label="Account Number"  value={app.bankAccountNumber} />
                      <Field label="Branch Address"  value={app.bankBranchAddress} />
                    </Grid>
                  </Section>

                  {/* 6 ─────────────────────────────────────────────── */}
                  {/* Mirrors form's "Additional Information" — Previous-school + meta in one block */}
                  <Section title="6. Additional Information">
                    <Grid>
                      <Field label="Previous School"     value={app.previousSchool} />
                      <Field label="Previous Class"      value={app.previousClass} />
                      <Field label="Previous Grade/CGPA" value={app.previousGrade} />
                      <Field label="Board"               value={app.previousBoard} />
                      <Field label="TC Number"           value={app.tcNumber} />
                      <Field label="Source"              value={app.source?.replace('_', ' ')} capitalize />
                      <Field label="Priority"            value={app.priority} capitalize />
                      <Field label="Referred By"         value={app.referredBy} />
                      <Field label="Reg. Fee Paid"       value={app.registrationFee?.paid ? `Yes · ₹${app.registrationFee.amount}` : 'No'} />
                    </Grid>
                  </Section>

                  {/* 7 ─────────────────────────────────────────────── */}
                  {/* Interview kept at the end — not part of the parent-visible form */}
                  <Section title="7. Interview Details">
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
                );
              })()}


              {/* ── DOCUMENTS TAB ── */}
              {tab === 'documents' && (
                <div>
                  <p className="text-sm text-slate-500 mb-4">{docsSubmitted} of {docsTotal} documents submitted</p>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {DOCS.map(doc => {
                      const docData  = app.documents?.[doc.key];
                      const submitted = docData?.submitted || !!docData?.data || !!docData?.url || false;
                      // Form writes the base64 under `data`; older records may use `url`
                      const fileUrl   = docData?.data || docData?.url || '';
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

                      // Download file to user's computer
                      const downloadFile = (e) => {
                        e.stopPropagation();
                        if (!fileUrl) return;
                        // Pick a reasonable filename: original uploaded name, or a sensible default
                        const downloadName = fileName ||
                          `${doc.label.replace(/\s+/g, '_')}_${app.studentName || 'document'}`;
                        const a = document.createElement('a');
                        a.href = fileUrl;
                        a.download = downloadName;
                        a.style.display = 'none';
                        document.body.appendChild(a);
                        a.click();
                        document.body.removeChild(a);
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
                            {fileName && (
                              <div className="text-xs text-slate-500 mt-0.5 truncate">
                                📎 {fileName}
                                {!hasFile && <span className="text-amber-600 ml-1">(file not stored)</span>}
                              </div>
                            )}
                          </div>
                          {hasFile ? (
                            <div className="ml-auto flex items-center gap-1.5 flex-shrink-0">
                              <button
                                onClick={openFile}
                                className="text-xs px-2.5 py-1.5 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                title="Open file in new tab">
                                👁 View
                              </button>
                              <button
                                onClick={downloadFile}
                                className="text-xs px-2.5 py-1.5 rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                title="Download file to your computer">
                                ⬇ Download
                              </button>
                            </div>
                          ) : submitted ? (
                            <span className="ml-auto text-xs text-emerald-600">Received</span>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>

                  {/* Custom documents — admin-defined extra slots beyond the standard checklist */}
                  {Array.isArray(app.customDocuments) && app.customDocuments.length > 0 && (
                    <div className="mt-6">
                      <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3 pb-2 border-b border-slate-100">
                        Custom Documents ({app.customDocuments.filter(d => d?.files?.length > 0).length}/{app.customDocuments.length})
                      </h4>
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        {app.customDocuments.map((cd, idx) => {
                          const file = Array.isArray(cd?.files) && cd.files[0];
                          const fileUrl  = file?.data || file?.url || '';
                          const fileMime = file?.mimeType || file?.type || '';
                          const fileName = file?.fileName || file?.name || cd?.label || 'document';
                          const hasFile  = fileUrl && (fileUrl.startsWith('data:') || fileUrl.startsWith('blob:') || /^https?:\/\//i.test(fileUrl));
                          const fileCount = (cd?.files || []).length;

                          const openCustom = (e) => {
                            e.stopPropagation();
                            if (!hasFile) return;
                            const w = window.open();
                            if (!w) { alert('Could not open new tab. Please allow pop-ups for this site.'); return; }
                            // For data: URLs Chrome blocks top-level navigation.
                            // Embed the file in a wrapper so PDFs/images render.
                            if (fileUrl.startsWith('data:')) {
                              const isImage = fileMime.startsWith('image/');
                              w.document.write(
                                `<title>${fileName}</title>` +
                                `<style>body{margin:0;background:#1f2937;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;color:#fff}img,embed{max-width:100%;max-height:100vh}</style>` +
                                (isImage
                                  ? `<img src="${fileUrl}" alt="${fileName}"/>`
                                  : `<embed src="${fileUrl}" type="${fileMime || 'application/pdf'}" width="100%" height="100%" style="height:100vh"/>`)
                              );
                            } else {
                              w.location.href = fileUrl;
                            }
                          };

                          const downloadCustom = (e) => {
                            e.stopPropagation();
                            if (!hasFile) return;
                            const a = document.createElement('a');
                            a.href = fileUrl;
                            a.download = fileName;
                            a.style.display = 'none';
                            document.body.appendChild(a);
                            a.click();
                            document.body.removeChild(a);
                          };

                          return (
                            <div key={idx} className={`rounded-xl border px-4 py-3 flex items-center gap-3 ${
                              fileCount > 0 ? 'border-emerald-200 bg-emerald-50/40' : 'border-slate-200 bg-white'
                            }`}>
                              <div className={`w-9 h-9 rounded-lg flex items-center justify-center text-sm font-bold flex-shrink-0 ${
                                fileCount > 0 ? 'bg-emerald-500 text-white' : 'bg-slate-100 text-slate-400'
                              }`}>
                                {fileCount > 0 ? '✓' : '○'}
                              </div>
                              <div className="flex-1 min-w-0">
                                <p className="text-sm font-semibold text-slate-700 truncate">{cd?.label || `Custom doc ${idx + 1}`}</p>
                                <p className="text-xs text-slate-400 mt-0.5">
                                  {fileCount > 0 ? `${fileCount} file${fileCount > 1 ? 's' : ''} uploaded` : 'No file'}
                                </p>
                              </div>
                              {hasFile && (
                                <div className="flex gap-1.5 flex-shrink-0">
                                  <button onClick={openCustom}
                                    className="text-xs px-2.5 py-1.5 rounded-md font-semibold bg-indigo-600 text-white hover:bg-indigo-700"
                                    title="Open file in new tab">
                                    👁 View
                                  </button>
                                  <button onClick={downloadCustom}
                                    className="text-xs px-2.5 py-1.5 rounded-md font-semibold bg-emerald-600 text-white hover:bg-emerald-700"
                                    title="Download file">
                                    ⬇ Download
                                  </button>
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <p className="text-xs text-slate-400 mt-4">Click on a document row to toggle submitted/pending. <b>👁 View</b> opens the file in a new tab. <b>⬇ Download</b> saves it to your computer.</p>
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
  // Always render, even when empty -- so the panel layout stays predictable
  // and the user can confirm a field exists rather than wondering if it was hidden.
  const display = (value === null || value === undefined || value === '') ? '—' : value;
  const isEmpty = display === '—';
  return (
    <div>
      <p className="text-xs text-slate-400 mb-0.5">{label}</p>
      <p className={`text-sm font-medium ${isEmpty ? 'text-slate-300' : 'text-slate-700'} ${capitalize ? 'capitalize' : ''}`}>{display}</p>
    </div>
  );
}