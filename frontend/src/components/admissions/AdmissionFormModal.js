// frontend/src/components/admissions/AdmissionFormModal.js
// eSkooly-style admission form: numbered sections, floating labels, 3-col grid

import PhoneInput from '../ui/PhoneInput';
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../utils/admissionUtils';
import { classAPI } from '../../utils/api';

const EMPTY = {
  // Section 1 - Student Info
  firstName:          '',
  middleName:         '',
  lastName:           '',
  studentName:        '', // kept as derived "First Middle Last"; do not edit directly
  registrationNo:     '',
  applyingForClass:   '',
  dateOfAdmission:    new Date().toISOString().split('T')[0],
  discountInFee:      '',
  mobileForSMS:       '',

  // Section 2 - Other Info
  dateOfBirth:        '',
  birthFormId:        '',
  orphanStudent:      '',
  gender:             '',
  cast:               '',
  osc:                '',
  identificationMark: '',
  previousSchool:     '',
  religion:           '',
  bloodGroup:         '',
  totalSiblings:      '',
  disease:            '',
  isDisabled:           '',
  disabilityPercentage: '',
  disabilityType:       '',
  additionalNote:     '',

  // Section 3 - Parent/Guardian Info
  fatherName:         '',
  fatherOccupation:   '',
  fatherPhone:        '',
  fatherAadhaar:      '',
  motherName:         '',
  motherOccupation:   '',
  motherPhone:        '',
  motherAadhaar:      '',
  guardianName:       '',
  guardianRelation:   '',
  guardianPhone:      '',
  parentEmail:        '',
  parentPhone:        '',
  parentName:         '',
  address:            '',
  city:               '',
  state:              '',
  pincode:            '',

  // Section 4 - Government IDs (dynamic list)
  // Each entry: { type: 'APAAR ID'|'PEN'|<any free text>, number: '' }
  governmentIds:      [],

  // Section 5 - Bank Details
  bankAccountHolder:  '',
  bankName:           '',
  bankBranchName:     '',
  bankIfsc:           '',
  bankAccountNumber:  '',
  bankBranchAddress:  '',

  // Section 5 - Previous School
  previousSchoolName: '',
  previousClass:      '',
  previousBoard:      '',
  tcNumber:           '',
  lcNumber:           '',
  previousGrade:      '',

  // Section 5 - Documents Checklist
  documents: {
    birthCertificate:    null,
    aadhaarCard:         null,
    passportPhoto:       null,
    addressProof:        null,
    transferCertificate: null,
    marksheet:           null,
    casteCertificate:    null,
    medicalCertificate:  null,
  },

  // Meta
  priority:    'normal',
  source:      'walk_in',
  notes:       '',
  aadhaarNumber:'',
  category:    '',
  nationality: 'Indian',
  academicYear:'',
};

// Floating label input
function FloatInput({ label, required, children, span }) {
  return (
    <div style={{ gridColumn: span ? `span ${span}` : undefined, position:'relative', marginBottom:4 }}>
      <div style={{ position:'absolute', top:-9, left:12, zIndex:1, fontSize:11, fontWeight:700,
        background:'linear-gradient(to bottom, #fff 60%, transparent)', padding:'0 4px',
        color: required ? '#6366F1' : '#6B7280', whiteSpace:'nowrap' }}>
        {label}{required && <span style={{ color:'#DC2626', marginLeft:3 }}>*</span>}
      </div>
      {children}
    </div>
  );
}

const INP = {
  width:'100%', padding:'12px 14px', border:'1.5px solid #E2E0F5', borderRadius:22,
  fontSize:13, outline:'none', background:'#fff', boxSizing:'border-box', fontFamily:'inherit',
  color:'#374151', transition:'border-color 0.15s',
};

const SEL = { ...INP, cursor:'pointer', appearance:'none',
  backgroundImage:`url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='12' height='12' viewBox='0 0 12 12'%3E%3Cpath fill='%236B7280' d='M6 8L1 3h10z'/%3E%3C/svg%3E")`,
  backgroundRepeat:'no-repeat', backgroundPosition:'right 14px center', paddingRight:36 };

function Section({ number, title, children }) {
  return (
    <div style={{ marginBottom:28 }}>
      <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, paddingBottom:10, borderBottom:'1.5px solid #E5E7EB' }}>
        <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
          <span style={{ fontSize:13, fontWeight:900, color:'#fff' }}>{number}</span>
        </div>
        <h3 style={{ fontSize:15, fontWeight:700, color:'#1F2937', margin:0 }}>{title}</h3>
      </div>
      <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:'20px 16px' }}>
        {children}
      </div>
    </div>
  );
}

export default function AdmissionFormModal({ initial, onClose, onSuccess }) {
  const [form,   setForm]   = useState(initial ? hydrateForm(EMPTY, initial) : EMPTY);
  const [saving,    setSaving]    = useState(false);
  const [submitted, setSubmitted] = useState(null); // holds saved application data for receipt
  const [classes,   setClasses]   = useState([]);

  useEffect(() => {
    classAPI.getAll().then(r => setClasses(r.data.data || [])).catch(() => {});
  }, []);

  useEffect(() => {
    setForm(initial ? hydrateForm(EMPTY, initial) : EMPTY);
  }, [initial]);

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));

  // Each document slot now stores an ARRAY of file objects, so users can attach
  // both sides of an Aadhaar, multiple passport photos, multi-page LCs, etc.
  // Shape per file: { fileName, mimeType, size, data (base64 dataURL), uploadedAt }
  const MAX_FILES_PER_SLOT = 5;
  const MAX_BYTES_PER_FILE = 2 * 1024 * 1024; // 2 MB

  // Add one file to a slot's array (validating size, type, and slot count).
  const addDocFile = (k, file) => {
    if (!file) return;
    const existing = Array.isArray(form.documents[k]) ? form.documents[k] : [];
    if (existing.length >= MAX_FILES_PER_SLOT) {
      toast.error(`Up to ${MAX_FILES_PER_SLOT} files per document — remove one first`);
      return;
    }
    if (file.size > MAX_BYTES_PER_FILE) {
      toast.error(`${file.name} is ${(file.size/1024/1024).toFixed(2)} MB — max 2 MB allowed`);
      return;
    }
    const allowedTypes = ['application/pdf', 'image/jpeg', 'image/jpg', 'image/png'];
    if (!allowedTypes.includes(file.type)) {
      toast.error(`${file.name}: only PDF, JPG, or PNG files are allowed`);
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setForm(f => {
        const prev = Array.isArray(f.documents[k]) ? f.documents[k] : [];
        return {
          ...f,
          documents: {
            ...f.documents,
            [k]: [
              ...prev,
              {
                fileName:   file.name,
                mimeType:   file.type,
                size:       file.size,
                data:       reader.result,
                uploadedAt: new Date().toISOString(),
              },
            ],
          },
        };
      });
      toast.success(`${file.name} attached`);
    };
    reader.onerror = () => toast.error(`Failed to read ${file.name}`);
    reader.readAsDataURL(file);
  };

  // Remove one file from a slot by index. Removing the last file clears the slot.
  const removeDocFile = (k, idx) => {
    setForm(f => {
      const prev = Array.isArray(f.documents[k]) ? f.documents[k] : [];
      const next = prev.filter((_, i) => i !== idx);
      return {
        ...f,
        documents: { ...f.documents, [k]: next.length ? next : null },
      };
    });
  };

  const handleSubmit = async () => {
    // ── TC-ADM-03 — First Name and Last Name are mandatory ──────────────────
    const firstNameTrim = (form.firstName || '').trim();
    const lastNameTrim  = (form.lastName  || '').trim();
    if (!firstNameTrim || !lastNameTrim) {
      toast.error(!firstNameTrim ? 'First Name is required' : 'Last Name is required');
      try {
        const placeholder = !firstNameTrim ? 'First Name' : 'Last Name';
        const el = document.querySelector(`input[placeholder="${placeholder}"]`);
        el?.focus();
        el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (_) {}
      return;
    }

    // ── TC-ADM-14 — Email format validation (only if provided) ──────────────
    const EMAIL_RE = /^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}$/;
    const emailFields = [
      ['parentEmail',  'Parent Email'],
      ['fatherEmail',  'Father Email'],
      ['motherEmail',  'Mother Email'],
      ['studentEmail', 'Student Email'],
    ];
    for (const [key, label] of emailFields) {
      const val = (form[key] || '').trim();
      if (val && !EMAIL_RE.test(val)) {
        toast.error(`${label} is not a valid email address`);
        return;
      }
    }

    // ── TC-ADM-13 — Phone format validation (digits, +, -, space, parens) ───
    const PHONE_RE = /^[0-9+\-\s()]{7,20}$/;
    const phoneFields = [
      ['parentPhone', 'Parent Phone'],
      ['fatherPhone', 'Father Phone'],
      ['motherPhone', 'Mother Phone'],
    ];
    for (const [key, label] of phoneFields) {
      const val = (form[key] || '').trim();
      if (val && !PHONE_RE.test(val)) {
        toast.error(`${label} must contain digits, +, -, space, or parentheses (7-20 chars)`);
        return;
      }
    }

    // ── TC-ADM-15 — Date of Birth cannot be in the future ───────────────────
    if (form.dateOfBirth) {
      const dob = new Date(form.dateOfBirth);
      if (isNaN(dob.getTime())) {
        toast.error('Invalid date of birth');
        return;
      }
      const today = new Date();
      today.setHours(23, 59, 59, 999);
      if (dob > today) {
        toast.error('Date of birth cannot be in the future');
        return;
      }
      // ── TC-ADM-16 — Soft warning if DOB > 25 years ago ────────────────────
      const yrsAgo = (Date.now() - dob.getTime()) / (1000 * 60 * 60 * 24 * 365.25);
      if (yrsAgo > 25 && !form._dobWarningAcked) {
        // Show a nicely formatted date in the warning, regardless of what
        // shape the DOB came in (raw ISO string vs YYYY-MM-DD).
        const niceDob = dob.toLocaleDateString('en-IN', { day: '2-digit', month: 'short', year: 'numeric' });
        if (!window.confirm(
          `The student appears to be over 25 years old (DOB: ${niceDob}). ` +
          `Is this correct? Click OK to continue or Cancel to fix.`
        )) {
          return;
        }
        // Mark acknowledged so we don't ask twice in the same submit
        set('_dobWarningAcked', true);
      }
    }

    // Backend still has parentName/parentPhone/parentEmail fields (now optional).
    // Populate them from father (preferred) or mother (fallback) when available
    // so primary-contact display elsewhere in the app still works.
    const primaryName  = (form.parentName  || form.fatherName  || form.motherName  || '').trim();
    const primaryPhone = (form.parentPhone || form.fatherPhone || form.motherPhone || '').trim();
    const primaryEmail = (form.parentEmail || '').trim();

    // Server-managed fields the frontend should never send back on update.
    // Sending them causes MongoDB conflicts (e.g. timeline = $push collision).
    const {
      _id, __v, school, status: _status, applicationNumber,
      processedBy, processedAt, timeline, createdAt, updatedAt,
      _dobWarningAcked, // local-only flag
      ...formData
    } = form;

    // Map fields for backend compatibility
    const payload = {
      ...formData,
      applyingForClass: form.applyingForClass || '',
      parentName:  primaryName,
      parentPhone: primaryPhone,
      parentEmail: primaryEmail,
      father: { name: form.fatherName, occupation: form.fatherOccupation, phone: form.fatherPhone, aadhaar: form.fatherAadhaar },
      mother: { name: form.motherName, occupation: form.motherOccupation, phone: form.motherPhone, aadhaar: form.motherAadhaar },
      address: { street: form.address, city: form.city, state: form.state, pincode: form.pincode },
      documents: Object.fromEntries(
        Object.entries(form.documents).map(([key, value]) => {
          if (!value || (Array.isArray(value) && value.length === 0)) {
            return [key, { submitted: false, files: [] }];
          }

          // Normalize to an array of file objects.
          // - Array (new shape): use directly
          // - Object (newly uploaded single, or pre-array legacy record): wrap
          // - String (very old legacy): wrap as { url, fileName }
          let arr;
          if (Array.isArray(value)) {
            arr = value;
          } else if (typeof value === 'object') {
            arr = [value];
          } else {
            arr = [{ url: value, fileName: value }];
          }

          // Build the per-file array the backend will store.
          const files = arr.map(f => {
            if (typeof f === 'object' && f !== null) {
              return {
                url:        f.data || f.url,        // base64 data URL or legacy URL
                fileName:   f.fileName,
                mimeType:   f.mimeType,
                size:       f.size,
                uploadedAt: f.uploadedAt,
              };
            }
            return { url: f, fileName: f };
          });

          // Keep legacy single-file fields populated from the FIRST file so the
          // detail modal (which still reads .url / .data / .fileName) keeps
          // showing something useful until it's updated to render the array.
          const first = files[0] || {};
          return [key, {
            submitted:  true,
            url:        first.url,
            fileName:   first.fileName,
            mimeType:   first.mimeType,
            size:       first.size,
            uploadedAt: first.uploadedAt,
            files,                                  // ← all files for this slot
          }];
        })
      ),
      previousSchool: form.previousSchoolName || form.previousSchool,
      previousBoard:  form.previousBoard,
      previousClass:  form.previousClass,
      tcNumber:       form.tcNumber,
      aadhaarNumber:  form.aadhaarNumber,
      category:       form.category,
    };

    setSaving(true);
    try {
      if (initial?._id) {
        await admissionAPI.update(initial._id, payload);
        toast.success('Application updated!');
        if (onSuccess) onSuccess();
      } else {
        const res = await admissionAPI.create(payload);
        toast.success('Application submitted!');
        setSubmitted({ ...payload, applicationNumber: res.data.data?.applicationNumber || 'APP-'+Date.now().toString().slice(-6), _id: res.data.data?._id });
        return;
      }
    } catch (e) {
      const status = e.response?.status;
      if (status === 404) {
        toast.error('Application not found — it may have been deleted. Please close and reload.');
      } else if (status === 409) {
        toast.error(e.response?.data?.message || 'Duplicate admission detected.');
      } else if (status === 413) {
        toast.error('Files too large. Please use smaller documents (under 2 MB each).');
      } else {
        toast.error(e.response?.data?.message || 'Failed to save. Please try again.');
      }
    } finally { setSaving(false); }
  };

  const downloadReceipt = () => {
    const app = submitted || { ...form, applicationNumber: initial?.applicationNumber || 'DRAFT' };
    const win = window.open('','_blank','width=820,height=950');
    const docsSubmitted = Object.entries(app.documents||{}).filter(([,v])=>v).map(([k])=>k.replace(/([A-Z])/g,' $1').trim());
    win.document.write(`
      <html><head><title>Admission Receipt - ${app.studentName}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family: Arial, sans-serif; padding: 30px; color: #111; font-size:13px; }
        .header { text-align:center; border-bottom:3px solid #6366F1; padding-bottom:16px; margin-bottom:20px; }
        .school-name { font-size:22px; font-weight:900; color:#1F2937; }
        .school-sub { font-size:12px; color:#6B7280; margin-top:4px; }
        .receipt-title { display:inline-block; margin-top:12px; padding:5px 20px; border:2px solid #6366F1; border-radius:6px; font-size:14px; font-weight:700; color:#6366F1; }
        .app-no { margin:14px 0; text-align:center; background:#F8F8FF; border:1px solid #E0E0FF; border-radius:8px; padding:10px; font-size:13px; color:#374151; }
        .app-no strong { color:#6366F1; font-size:15px; }
        .status-badge { display:inline-block; padding:3px 12px; border-radius:20px; font-size:12px; font-weight:700; background:#D1FAE5; color:#065F46; margin-left:10px; }
        .section { margin-bottom:16px; }
        .section-title { font-size:11px; font-weight:700; color:#6366F1; text-transform:uppercase; letter-spacing:.08em; border-bottom:1.5px solid #E5E7EB; padding-bottom:5px; margin-bottom:10px; }
        table { width:100%; border-collapse:collapse; font-size:12px; }
        td { padding:6px 10px; border-bottom:0.5px solid #F3F4F6; vertical-align:top; }
        td:first-child { color:#6B7280; width:35%; font-weight:600; }
        td:nth-child(3) { color:#6B7280; width:25%; font-weight:600; }
        .doc-grid { display:flex; flex-wrap:wrap; gap:6px; padding:6px 0; }
        .doc-badge { padding:3px 10px; border-radius:20px; font-size:11px; font-weight:700; background:#EEF2FF; color:#4338CA; }
        .footer { margin-top:32px; padding-top:14px; border-top:1.5px solid #E5E7EB; display:grid; grid-template-columns:1fr 1fr 1fr; gap:16px; font-size:12px; }
        .sign-box { text-align:center; }
        .sign-line { border-bottom:1px solid #374151; margin:24px auto 6px; width:140px; }
        .notice { margin-top:20px; padding:10px 14px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:8px; font-size:11px; color:#92400E; }
        @page { margin:12mm; size:A4; }
        @media print { body { padding:0; } }
      </style></head><body>
      <div class="header">
        <div class="school-name">The Future Step School</div>
        <div class="school-sub">Securing Future By Adaptive Learning | thefuturestepschool.in</div>
        <div class="receipt-title">Admission Application Receipt</div>
      </div>
      <div class="app-no">
        Application No: <strong>${app.applicationNumber || '—'}</strong>
        <span class="status-badge">Submitted</span>
        &nbsp;&nbsp;|&nbsp;&nbsp;
        Date: <strong>${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</strong>
      </div>

      <div class="section">
        <div class="section-title">1. Student Information</div>
        <table>
          <tr><td>Student Name</td><td><strong>${app.studentName||'—'}</strong></td><td>Class Applied</td><td><strong>${app.applyingForClass||'—'}</strong></td></tr>
          <tr><td>Date of Birth</td><td>${app.dateOfBirth?new Date(app.dateOfBirth).toLocaleDateString('en-IN'):'—'}</td><td>Gender</td><td>${app.gender||'—'}</td></tr>
          <tr><td>Blood Group</td><td>${app.bloodGroup||'—'}</td><td>Aadhaar No</td><td>${app.aadhaarNumber||'—'}</td></tr>
          <tr><td>Religion</td><td>${app.religion||'—'}</td><td>Category</td><td>${app.category||'—'}</td></tr>
          <tr><td>Caste</td><td>${app.cast||'—'}</td><td>Nationality</td><td>${app.nationality||'—'}</td></tr>
          <tr><td>Address</td><td colspan="3">${[app.address,app.city,app.state,app.pincode].filter(Boolean).join(', ')||'—'}</td></tr>
          <tr><td>Date of Admission</td><td>${app.dateOfAdmission?new Date(app.dateOfAdmission).toLocaleDateString('en-IN'):'—'}</td><td>Academic Year</td><td>${app.academicYear||'—'}</td></tr>
          <tr><td>Discount in Fee</td><td>${app.discountInFee?app.discountInFee+'%':'—'}</td><td>Mobile (SMS)</td><td>${app.mobileForSMS||'—'}</td></tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">2. Parent / Guardian Information</div>
        <table>
          <tr><td>Father's Name</td><td>${app.fatherName||'—'}</td><td>Father's Phone</td><td>${app.fatherPhone||'—'}</td></tr>
          <tr><td>Father's Occupation</td><td>${app.fatherOccupation||'—'}</td><td>Mother's Name</td><td>${app.motherName||'—'}</td></tr>
          <tr><td>Mother's Phone</td><td>${app.motherPhone||'—'}</td><td>Mother's Occupation</td><td>${app.motherOccupation||'—'}</td></tr>
          <tr><td>Primary Contact</td><td><strong>${app.parentName||'—'}</strong></td><td>Contact Phone</td><td><strong>${app.parentPhone||'—'}</strong></td></tr>
          <tr><td>Email</td><td colspan="3">${app.parentEmail||'—'}</td></tr>
        </table>
      </div>



      <div class="section">
        <div class="section-title">4. Documents Submitted (${docsSubmitted.length} / 14)</div>
        <div class="doc-grid">
          ${docsSubmitted.length
            ? docsSubmitted.map(d=>`<span class="doc-badge">✓ ${d}</span>`).join('')
            : '<span style="color:#9CA3AF;font-size:12px">No documents uploaded yet</span>'}
        </div>
      </div>

      <div class="notice">
        ⚠️ This is a preliminary application receipt. Admission is confirmed only after document verification and approval by the school administration.
      </div>

      <div class="footer">
        <div class="sign-box">
          <div style="font-weight:700;margin-bottom:4px">Prepared By</div>
          <div class="sign-line"></div>
          <div>The Future Step School</div>
        </div>
        <div class="sign-box">
          <div style="font-weight:700;margin-bottom:4px">Parent / Guardian Signature</div>
          <div class="sign-line"></div>
          <div>${app.parentName||'—'}</div>
        </div>
        <div class="sign-box">
          <div style="font-weight:700;margin-bottom:4px">Received By</div>
          <div class="sign-line"></div>
          <div>School Admin</div>
        </div>
      </div>
      </body></html>
    `);
    win.document.close();
    win.focus();
    setTimeout(()=>{ win.print(); }, 600);
  };

  const docsTotal   = Object.keys(form.documents).length;
  const docsChecked = Object.values(form.documents).filter(v => {
    if (!v) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true; // legacy single-object value counts as one uploaded file
  }).length;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(0,0,0,0.5)' }}>
      <div style={{ background:'#F8F8FF', borderRadius:20, width:'100%', maxWidth:900, maxHeight:'94vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#fff', padding:'20px 28px', borderBottom:'1px solid #E5E7EB', flexShrink:0, textAlign:'center' }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#1F2937', margin:0 }}>Admission Form</h2>

          <button onClick={onClose} style={{ position:'absolute', top:20, right:24, width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {/* Section 1 - Student Information */}
          <Section number="1" title="Student Information">
            <FloatInput label="Student Name" span={3} required>
              <div style={{ display:'flex', gap:8 }}>
                <input
                  style={{ ...INP, flex:1 }}
                  value={form.firstName}
                  onChange={e=>{
                    const firstName = e.target.value;
                    setForm(f => ({
                      ...f,
                      firstName,
                      studentName: [firstName, f.middleName, f.lastName].filter(Boolean).join(' ').trim(),
                    }));
                  }}
                  placeholder="First Name"
                  required
                />
                <input
                  style={{ ...INP, flex:1 }}
                  value={form.middleName}
                  onChange={e=>{
                    const middleName = e.target.value;
                    setForm(f => ({
                      ...f,
                      middleName,
                      studentName: [f.firstName, middleName, f.lastName].filter(Boolean).join(' ').trim(),
                    }));
                  }}
                  placeholder="Middle Name"
                />
                <input
                  style={{ ...INP, flex:1 }}
                  value={form.lastName}
                  onChange={e=>{
                    const lastName = e.target.value;
                    setForm(f => ({
                      ...f,
                      lastName,
                      studentName: [f.firstName, f.middleName, lastName].filter(Boolean).join(' ').trim(),
                    }));
                  }}
                  placeholder="Last Name"
                  required
                />
              </div>
            </FloatInput>
            <FloatInput label="Registration No">
              <input style={INP} value={form.registrationNo} onChange={e=>set('registrationNo',e.target.value)} placeholder="Registration No"/>
            </FloatInput>
            <FloatInput label="Select Class">
              <select style={SEL} value={form.applyingForClass} onChange={e=>set('applyingForClass',e.target.value)}>
                <option value="">Select Class</option>
                {classes.length > 0
                  ? classes.map(c => <option key={c._id} value={c._id}>{c.name}{c.section ? ` ${c.section}` : ''}</option>)
                  : [{v:1,l:'Class I'},{v:2,l:'Class II'},{v:3,l:'Class III'},{v:4,l:'Class IV'},{v:5,l:'Class V'},{v:6,l:'Class VI'},{v:7,l:'Class VII'},{v:8,l:'Class VIII'},{v:9,l:'Class IX'},{v:10,l:'Class X'}].map(c=><option key={c.v} value={c.v}>{c.l}</option>)
                }
              </select>
            </FloatInput>
            <FloatInput label="Date of Admission">
              <input type="date" style={INP} value={form.dateOfAdmission} onChange={e=>set('dateOfAdmission',e.target.value)}/>
            </FloatInput>
            <FloatInput label="Discount in Fee (%)">
              <input type="number" style={INP} value={form.discountInFee} onChange={e=>set('discountInFee',e.target.value)} placeholder="In %"/>
            </FloatInput>
            <FloatInput label="Mobile No. for SMS/WhatsApp">
              <PhoneInput value={form.mobileForSMS} onChange={v=>set('mobileForSMS',v)} style={{padding:'8px 0'}} />
            </FloatInput>
            <FloatInput label="Academic Year">
              <input style={INP} value={form.academicYear} onChange={e=>set('academicYear',e.target.value)} placeholder="2026-27"/>
            </FloatInput>
            <FloatInput label="Aadhaar Number">
              <input style={INP} value={form.aadhaarNumber}
                onChange={e=>{ const v=e.target.value.replace(/\D/g,'').slice(0,12); const f=v.replace(/(\d{4})(\d{4})?(\d{4})?/,(_,a,b,c)=>[a,b,c].filter(Boolean).join(' ')); set('aadhaarNumber',f); }}
                placeholder="XXXX XXXX XXXX" maxLength={14}/>
            </FloatInput>
            <FloatInput label="Category">
              <select style={SEL} value={form.category} onChange={e=>set('category',e.target.value)}>
                <option value="">Select</option>
                <option value="general">General</option>
                <option value="obc">OBC</option>
                <option value="sc">SC</option>
                <option value="st">ST</option>
                <option value="other">Other</option>
              </select>
            </FloatInput>
          </Section>

          {/* Section 2 - Other Information */}
          <Section number="2" title="Other Information">
            <FloatInput label="Date of Birth">
              <input type="date" style={INP} value={form.dateOfBirth}
                     max={new Date().toISOString().split('T')[0]}
                     onChange={e=>set('dateOfBirth',e.target.value)}/>
            </FloatInput>
            <FloatInput label="Student Birth Form ID / NIC">
              <input style={INP} value={form.birthFormId} onChange={e=>set('birthFormId',e.target.value)} placeholder="Birth Form ID / NIC"/>
            </FloatInput>
            <FloatInput label="Orphan Student">
              <select style={SEL} value={form.orphanStudent} onChange={e=>set('orphanStudent',e.target.value)}>
                <option value="">Select</option>
                <option value="orphan">Orphan</option>
                <option value="single_parent_mother">Single Parent (Mother)</option>
                <option value="single_parent_father">Single Parent (Father)</option>
                <option value="not_applicable">Not Applicable</option>
              </select>
            </FloatInput>
            <FloatInput label="Gender">
              <select style={SEL} value={form.gender} onChange={e=>set('gender',e.target.value)}>
                <option value="">Gender</option>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </FloatInput>
            <FloatInput label="Caste">
              <input style={INP} value={form.cast} onChange={e=>set('cast',e.target.value)} placeholder="Caste"/>
            </FloatInput>
            <FloatInput label="Religion">
              <select style={SEL} value={form.religion} onChange={e=>set('religion',e.target.value)}>
                <option value="">Religion</option>
                {['Hindu','Muslim','Christian','Sikh','Buddhist','Jain','Other'].map(r=><option key={r}>{r}</option>)}
              </select>
            </FloatInput>
            <FloatInput label="Any Identification Mark?">
              <input style={INP} value={form.identificationMark} onChange={e=>set('identificationMark',e.target.value)} placeholder="Any Identification Mark?"/>
            </FloatInput>

            <FloatInput label="Blood Group">
              <select style={SEL} value={form.bloodGroup} onChange={e=>set('bloodGroup',e.target.value)}>
                <option value="">Blood Group</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=><option key={b}>{b}</option>)}
              </select>
            </FloatInput>

            <FloatInput label="Total Siblings">
              <input type="number" style={INP} value={form.totalSiblings} onChange={e=>set('totalSiblings',e.target.value)} placeholder="Total Siblings"/>
            </FloatInput>
            <FloatInput label="Nationality">
              <input style={INP} value={form.nationality} onChange={e=>set('nationality',e.target.value)}/>
            </FloatInput>
            <FloatInput label="Disease (if any)">
              <input style={INP} value={form.disease} onChange={e=>set('disease',e.target.value)} placeholder="Disease If Any?"/>
            </FloatInput>
            <FloatInput label="Is Disable?">
              <select
                style={SEL}
                value={form.isDisabled}
                onChange={e=>{
                  const v = e.target.value;
                  setForm(f => ({
                    ...f,
                    isDisabled: v,
                    // Clear dependent fields when switching away from Yes
                    ...(v !== 'yes' && { disabilityPercentage: '', disabilityType: '' }),
                  }));
                }}>
                <option value="">Select</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
              </select>
            </FloatInput>
            {form.isDisabled === 'yes' && (
              <FloatInput label="Percentage of Disability">
                <input
                  type="number"
                  min="0"
                  max="100"
                  style={INP}
                  value={form.disabilityPercentage}
                  onChange={e=>{
                    // Clamp to 0–100 and strip non-digits
                    const raw = e.target.value.replace(/[^\d.]/g,'');
                    const num = raw === '' ? '' : Math.min(100, Math.max(0, Number(raw)));
                    set('disabilityPercentage', num === '' ? '' : String(num));
                  }}
                  placeholder="e.g. 40"/>
              </FloatInput>
            )}
            {form.isDisabled === 'yes' && (
              <FloatInput label="Disability Type">
                <input
                  style={INP}
                  value={form.disabilityType}
                  onChange={e=>set('disabilityType', e.target.value)}
                  placeholder="e.g. Visual, Hearing, Locomotor"/>
              </FloatInput>
            )}
            <FloatInput label="Any Additional Note" span={2}>
              <input style={INP} value={form.additionalNote} onChange={e=>set('additionalNote',e.target.value)} placeholder="Any Additional Note"/>
            </FloatInput>
          </Section>

          {/* Section 3 - Parent / Guardian */}
          <Section number="3" title="Parent / Guardian Information">
            <FloatInput label="Father's Name" span={3}>
              <input style={INP} value={form.fatherName} onChange={e=>set('fatherName',e.target.value)} placeholder="Father's Full Name"/>
            </FloatInput>
            <FloatInput label="Father's Occupation">
              <input style={INP} value={form.fatherOccupation} onChange={e=>set('fatherOccupation',e.target.value)} placeholder="Occupation"/>
            </FloatInput>
            <FloatInput label="Father's Phone">
              <PhoneInput value={form.fatherPhone} onChange={v=>set('fatherPhone',v)} style={{padding:'8px 0'}} />
            </FloatInput>
            <FloatInput label="Father's Aadhaar">
              <input style={INP} value={form.fatherAadhaar}
                onChange={e=>set('fatherAadhaar', e.target.value.replace(/\D/g,'').slice(0,12))}
                placeholder="12-digit Aadhaar number" maxLength={12} inputMode="numeric"/>
            </FloatInput>
            <FloatInput label="Mother's Name" span={3}>
              <input style={INP} value={form.motherName} onChange={e=>set('motherName',e.target.value)} placeholder="Mother's Full Name"/>
            </FloatInput>
            <FloatInput label="Mother's Occupation">
              <input style={INP} value={form.motherOccupation} onChange={e=>set('motherOccupation',e.target.value)} placeholder="Occupation"/>
            </FloatInput>
            <FloatInput label="Mother's Phone">
              <PhoneInput value={form.motherPhone} onChange={v=>set('motherPhone',v)} style={{padding:'8px 0'}} />
            </FloatInput>
            <FloatInput label="Mother's Aadhaar">
              <input style={INP} value={form.motherAadhaar}
                onChange={e=>set('motherAadhaar', e.target.value.replace(/\D/g,'').slice(0,12))}
                placeholder="12-digit Aadhaar number" maxLength={12} inputMode="numeric"/>
            </FloatInput>

            <FloatInput label="Email">
              <input type="email" style={INP} value={form.parentEmail} onChange={e=>set('parentEmail',e.target.value)} placeholder="Email Address"/>
            </FloatInput>
            <FloatInput label="Street Address" span={3}>
              <input style={INP} value={form.address} onChange={e=>set('address',e.target.value)} placeholder="House No, Street, Area"/>
            </FloatInput>
            <FloatInput label="City">
              <input style={INP} value={form.city} onChange={e=>set('city',e.target.value)} placeholder="City"/>
            </FloatInput>
            <FloatInput label="State">
              <input style={INP} value={form.state} onChange={e=>set('state',e.target.value)} placeholder="State"/>
            </FloatInput>
            <FloatInput label="Pincode">
              <input style={INP} value={form.pincode}
                onChange={e=>set('pincode', e.target.value.replace(/\D/g,'').slice(0,6))}
                placeholder="6-digit pincode" maxLength={6} inputMode="numeric"/>
            </FloatInput>
          </Section>

          {/* Section 4 - Government IDs (dynamic list) */}
          <Section number="4" title="Government IDs">
            <FloatInput span={3}>
              <div>
                {(form.governmentIds || []).length === 0 && (
                  <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:10 }}>
                    No IDs added yet. Click "+ Add ID" below to add APAAR, PEN, or any other government ID.
                  </div>
                )}

                {(form.governmentIds || []).map((row, idx) => (
                  <div key={idx} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start' }}>
                    {/* ID Type — free text, anything goes */}
                    <input
                      style={{ ...INP, flex:'0 0 240px' }}
                      value={row.type || ''}
                      onChange={e=>{
                        const v = e.target.value;
                        setForm(f => {
                          const list = [...(f.governmentIds || [])];
                          list[idx] = { ...list[idx], type: v };
                          return { ...f, governmentIds: list };
                        });
                      }}
                      placeholder="ID type"/>

                    {/* ID Number */}
                    <input
                      style={{ ...INP, flex:1 }}
                      value={row.number || ''}
                      onChange={e=>{
                        const v = e.target.value;
                        setForm(f => {
                          const list = [...(f.governmentIds || [])];
                          list[idx] = { ...list[idx], number: v };
                          return { ...f, governmentIds: list };
                        });
                      }}
                      placeholder="ID number"/>
                  </div>
                ))}

                {/* Add ID button */}
                <button type="button"
                  onClick={()=>{
                    setForm(f => ({
                      ...f,
                      governmentIds: [...(f.governmentIds || []), { type: '', number: '' }],
                    }));
                  }}
                  style={{ marginTop:6, fontSize:13, color:'#4F46E5', background:'#EEF2FF',
                           border:'1.5px dashed #C7D2FE', padding:'8px 16px', borderRadius:8,
                           cursor:'pointer', fontWeight:600 }}>
                  + Add ID
                </button>
              </div>
            </FloatInput>
          </Section>

          {/* Section 5 - Bank Details */}
          <Section number="5" title="Bank Details">
            <FloatInput label="Account Holder Name">
              <input style={INP} value={form.bankAccountHolder}
                onChange={e=>set('bankAccountHolder', e.target.value)}
                placeholder="Name as on bank account"/>
            </FloatInput>
            <FloatInput label="Bank Name">
              <input style={INP} value={form.bankName}
                onChange={e=>set('bankName', e.target.value)}
                placeholder="e.g. State Bank of India"/>
            </FloatInput>
            <FloatInput label="Branch Name">
              <input style={INP} value={form.bankBranchName}
                onChange={e=>set('bankBranchName', e.target.value)}
                placeholder="Branch name"/>
            </FloatInput>
            <FloatInput label="IFSC Code">
              <input style={INP} value={form.bankIfsc}
                onChange={e=>{
                  // IFSC is 11 chars: 4 letters + 0 + 6 alphanumeric. Force uppercase, cap at 11.
                  const v = e.target.value.toUpperCase().replace(/[^A-Z0-9]/g,'').slice(0,11);
                  set('bankIfsc', v);
                }}
                placeholder="e.g. SBIN0001234" maxLength={11}/>
            </FloatInput>
            <FloatInput label="Account Number">
              <input style={INP} value={form.bankAccountNumber}
                onChange={e=>set('bankAccountNumber', e.target.value.replace(/\D/g,'').slice(0,18))}
                placeholder="Account number" inputMode="numeric"/>
            </FloatInput>
            <FloatInput label="Branch Address" span={3}>
              <input style={INP} value={form.bankBranchAddress}
                onChange={e=>set('bankBranchAddress', e.target.value)}
                placeholder="Full branch address"/>
            </FloatInput>
          </Section>



          {/* Section 5 - Documents Checklist */}
          <div style={{ marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, paddingBottom:10, borderBottom:'1.5px solid #E5E7EB' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:900, color:'#fff' }}>6</span>
              </div>
              <h3 style={{ fontSize:15, fontWeight:700, color:'#1F2937', margin:0, flex:1 }}>Document Upload</h3>
              <div style={{ fontSize:13, fontWeight:700, color:'#10B981' }}>{docsChecked}/{docsTotal} uploaded</div>
              <div style={{ width:80, height:6, background:'#E5E7EB', borderRadius:3, overflow:'hidden' }}>
                <div style={{ height:'100%', width:`${Math.round((docsChecked/docsTotal)*100)}%`, background:'#10B981', borderRadius:3, transition:'width 0.3s' }}/>
              </div>
            </div>

            <div style={{ background:'#EEF2FF', border:'1px solid #C7D2FE', borderRadius:10, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#4338CA' }}>
              ℹ️ Upload scanned copies or photos of documents (PDF, JPG, PNG — max 2MB each)
            </div>

            <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
              {[
                ['birthCertificate',    'Birth Certificate',          '📋', false],
                ['aadhaarStudent',      'Aadhaar Card (Student)',      '🪪', false],
                ['aadhaarParent',       'Aadhaar Card (Parent)',       '🪪', false],
                ['photos',             'Passport Photos (2–4)',        '📷', false],
                ['addressProof',       'Address Proof',               '🏠', false],
                ['apaarId',            'APAAR ID',                    '🆔', false],
                ['leavingCertificate', 'Leaving Certificate (LC)',    '📄', false],
                ['transferCertificate','Transfer Certificate (TC)',   '📄', false],
                ['previousMarksheet',  'Previous Marksheet',          '📊', false],
                ['studentId',          'Student ID (previous school)','🪪', false],
                ['casteCertificate',   'Caste Certificate',           '📋', false],
                ['incomeCertificate',  'Income Certificate',          '💰', false],
                ['bankDetails',        'Bank Account Details',        '🏦', false],
                ['medicalCertificate', 'Medical Certificate',         '🏥', false],
              ].map(([key, label, icon, required]) => {
                // Normalize storage: array (new), single object (legacy), or null/empty.
                const raw = form.documents[key];
                const files = Array.isArray(raw)
                  ? raw
                  : (raw && typeof raw === 'object' ? [raw] : []);
                const hasAny = files.length > 0;
                const atLimit = files.length >= MAX_FILES_PER_SLOT;

                return (
                  <div key={key} style={{ border:`1.5px solid ${hasAny?'#10B981':'#E5E7EB'}`, borderRadius:12, padding:'12px 16px', background:hasAny?'#F0FDF4':'#fff', transition:'all 0.15s' }}>
                    {/* ── Card header ───────────────────────────────────── */}
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:hasAny?10:8 }}>
                      <span style={{ fontSize:18 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>
                          {label}
                          {required && <span style={{ color:'#6366F1', marginLeft:4 }}>*</span>}
                        </div>
                        <div style={{ fontSize:11, color: hasAny ? '#16A34A' : '#9CA3AF', marginTop:2 }}>
                          {hasAny
                            ? `${files.length} file${files.length>1?'s':''} attached`
                            : 'No file uploaded — you can attach multiple (e.g. front + back)'}
                        </div>
                      </div>
                    </div>

                    {/* ── Per-file rows: name, view, download, remove ───── */}
                    {files.map((f, idx) => {
                      const url   = (f && typeof f === 'object') ? (f.data || f.url || '') : '';
                      const mime  = (f && typeof f === 'object') ? (f.mimeType || '') : '';
                      const fname = (f && typeof f === 'object') ? (f.fileName || `File ${idx+1}`) : `File ${idx+1}`;
                      const viewable = url && (url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url));

                      return (
                        <div key={idx}
                          style={{ display:'flex', alignItems:'center', gap:6, padding:'6px 8px', marginBottom:6,
                                   background:'#fff', border:'1px solid #D1FAE5', borderRadius:8 }}>
                          <span style={{ fontSize:12, color:'#16A34A' }}>✓</span>
                          <div style={{ flex:1, minWidth:0, fontSize:12, color:'#111827',
                                        whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}
                               title={fname}>
                            {fname}
                          </div>
                          {viewable && (
                            <>
                              <button type="button" onClick={() => {
                                const w = window.open();
                                if (!w) { toast.error('Please allow pop-ups to preview the file'); return; }
                                if (url.startsWith('data:')) {
                                  const isImage = mime.startsWith('image/');
                                  w.document.write(
                                    `<title>${fname || 'Preview'}</title>` +
                                    `<style>body{margin:0;background:#1f2937;display:flex;align-items:center;justify-content:center;min-height:100vh;font-family:Arial,sans-serif;color:#fff}img,embed{max-width:100%;max-height:100vh}</style>` +
                                    (isImage
                                      ? `<img src="${url}" alt="${fname}"/>`
                                      : `<embed src="${url}" type="${mime || 'application/pdf'}" width="100%" height="100%" style="height:100vh"/>`)
                                  );
                                } else {
                                  w.location.href = url;
                                }
                              }}
                                style={{ fontSize:11, color:'#fff', background:'#6366F1', border:'1px solid #4F46E5', padding:'2px 8px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                                👁
                              </button>
                              <button type="button" onClick={() => {
                                const a = document.createElement('a');
                                a.href = url;
                                a.download = fname || 'document';
                                a.style.display = 'none';
                                document.body.appendChild(a);
                                a.click();
                                document.body.removeChild(a);
                              }}
                                style={{ fontSize:11, color:'#fff', background:'#10B981', border:'1px solid #059669', padding:'2px 8px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                                ⬇
                              </button>
                            </>
                          )}
                          <button type="button" onClick={()=>removeDocFile(key, idx)}
                            style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'2px 8px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                            ✕
                          </button>
                        </div>
                      );
                    })}

                    {/* ── Add-file input (hidden, triggered by the dashed box) ── */}
                    {!atLimit && (
                      <label style={{ display:'block', cursor:'pointer' }}>
                        <div style={{ border:`1.5px dashed ${hasAny?'#10B981':'#D1D5DB'}`, borderRadius:8, padding:'8px', textAlign:'center', fontSize:12, color:hasAny?'#16A34A':'#6B7280', background:hasAny?'#F0FDF4':'#F9FAFB', transition:'all 0.15s' }}>
                          {hasAny ? `+ Add another file (${files.length}/${MAX_FILES_PER_SLOT})` : '+ Click to upload (multiple allowed)'}
                        </div>
                        <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display:'none' }}
                          onChange={e=>{
                            const picked = Array.from(e.target.files || []);
                            // Only fit as many as the slot has room for
                            const room = MAX_FILES_PER_SLOT - files.length;
                            picked.slice(0, room).forEach(f => addDocFile(key, f));
                            if (picked.length > room) {
                              toast.error(`Only ${room} more file(s) allowed in this slot`);
                            }
                            // Reset so the same file can be picked again later
                            e.target.value = '';
                          }}/>
                      </label>
                    )}
                    {atLimit && (
                      <div style={{ fontSize:11, color:'#9CA3AF', textAlign:'center', padding:'6px 0' }}>
                        Maximum {MAX_FILES_PER_SLOT} files reached — remove one to add another
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 6 - Additional */}
          <Section number="7" title="Additional Information">
            <FloatInput label="Priority">
              <select style={SEL} value={form.priority} onChange={e=>set('priority',e.target.value)}>
                <option value="normal">⚪ Normal</option>
                <option value="high">🟠 High</option>
                <option value="urgent">🔴 Urgent</option>
              </select>
            </FloatInput>
            <FloatInput label="Source">
              <select style={SEL} value={form.source} onChange={e=>set('source',e.target.value)}>
                <option value="walk_in">🚶 Walk-in</option>
                <option value="online">🌐 Online</option>
                <option value="referral">👥 Referral</option>
                <option value="agent">🤝 Agent</option>
              </select>
            </FloatInput>
            <FloatInput label="Referred By">
              <input style={INP} value={form.referredBy||''} onChange={e=>set('referredBy',e.target.value)} placeholder="Name of referrer"/>
            </FloatInput>
            <FloatInput label="Notes" span={3}>
              <textarea style={{ ...INP, resize:'none', minHeight:70 }} value={form.notes} onChange={e=>set('notes',e.target.value)} placeholder="Any additional notes or remarks..."/>
            </FloatInput>
          </Section>

        </div>

        {/* Footer */}
        <div style={{ background:'#fff', padding:'16px 28px', borderTop:'1px solid #E5E7EB', flexShrink:0 }}>
          {submitted ? (
            /* After successful submission - show receipt options */
            <div>
              <div style={{ background:'#F0FDF4', border:'1px solid #BBF7D0', borderRadius:12, padding:'14px 18px', marginBottom:14, display:'flex', alignItems:'center', gap:12 }}>
                <div style={{ fontSize:24 }}>✅</div>
                <div>
                  <div style={{ fontWeight:700, color:'#15803D', fontSize:14 }}>Application Submitted Successfully!</div>
                  <div style={{ fontSize:12, color:'#16A34A', marginTop:2 }}>Application No: <strong>{submitted.applicationNumber}</strong></div>
                </div>
              </div>
              <div style={{ display:'flex', gap:10 }}>
                <button onClick={downloadReceipt} style={{ flex:1, padding:'12px', borderRadius:22, border:'none', fontSize:14, fontWeight:700, cursor:'pointer', background:'#6366F1', color:'#fff', display:'flex', alignItems:'center', justifyContent:'center', gap:8 }}>
                  🖨 Download / Print Receipt
                </button>
                <button onClick={()=>{ setSubmitted(null); onSuccess(); }} style={{ flex:1, padding:'12px', borderRadius:22, border:'1.5px solid #E5E7EB', fontSize:14, fontWeight:600, cursor:'pointer', color:'#6B7280', background:'#fff' }}>
                  Close
                </button>
              </div>
            </div>
          ) : (
            /* Normal footer */
            <div style={{ display:'flex', gap:12 }}>
              <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:22, border:'1.5px solid #E5E7EB', fontSize:14, fontWeight:600, cursor:'pointer', color:'#6B7280', background:'#fff' }}>
                Cancel
              </button>
              {initial?._id && (
                <button onClick={downloadReceipt} style={{ flex:1, padding:'12px', borderRadius:22, border:'1.5px solid #6366F1', fontSize:14, fontWeight:600, cursor:'pointer', color:'#6366F1', background:'#EEF2FF' }}>
                  🖨 Download Receipt
                </button>
              )}
              <button onClick={handleSubmit} disabled={saving} style={{ flex:2, padding:'12px', borderRadius:22, border:'none', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', background:saving?'#9CA3AF':'#6366F1', color:'#fff' }}>
                {saving ? '⏳ Saving...' : initial?._id ? '✓ Save Changes' : '✓ Submit Application'}
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

// ── Hydrate backend record into flat form shape ─────────────────────────────
// Backend stores nested objects: address={street,city,state,pincode},
// father={name,occupation,phone}, mother={...}. Form expects flat fields.
// Dates come back as ISO strings; <input type="date"> needs YYYY-MM-DD.
function hydrateForm(base, record) {
  if (!record) return { ...base };
  const out = { ...base };
  // Copy primitive fields directly
  for (const k of Object.keys(record)) {
    const val = record[k];
    if (val === null || val === undefined) continue;
    // Skip objects we'll flatten manually
    if (k === 'address' || k === 'father' || k === 'mother' || k === 'documents') continue;
    // Format dates: backend returns ISO, input wants YYYY-MM-DD
    if ((k === 'dateOfBirth' || k === 'dateOfAdmission') && typeof val === 'string') {
      out[k] = val.slice(0, 10);
    } else if (typeof val !== 'object' || Array.isArray(val)) {
      out[k] = val;
    }
    // Other unknown nested objects: ignore so we don't pollute string fields
  }
  // Flatten address
  if (record.address && typeof record.address === 'object') {
    out.address = record.address.street  || '';
    out.city    = record.address.city    || '';
    out.state   = record.address.state   || '';
    out.pincode = record.address.pincode || '';
  }
  // Back-fill First/Middle/Last from legacy studentName when the new fields
  // are missing (older records were saved with only `studentName`).
  if (!out.firstName && !out.middleName && !out.lastName && out.studentName) {
    const parts = String(out.studentName).trim().split(/\s+/).filter(Boolean);
    if (parts.length === 1) {
      out.firstName = parts[0];
    } else if (parts.length === 2) {
      out.firstName = parts[0];
      out.lastName  = parts[1];
    } else if (parts.length >= 3) {
      out.firstName  = parts[0];
      out.lastName   = parts[parts.length - 1];
      out.middleName = parts.slice(1, -1).join(' ');
    }
  }
  // Flatten father / mother
  if (record.father && typeof record.father === 'object') {
    out.fatherName       = record.father.name       || out.fatherName       || '';
    out.fatherOccupation = record.father.occupation || out.fatherOccupation || '';
    out.fatherPhone      = record.father.phone      || out.fatherPhone      || '';
    out.fatherAadhaar    = record.father.aadhaar    || out.fatherAadhaar    || '';
  }
  if (record.mother && typeof record.mother === 'object') {
    out.motherName       = record.mother.name       || out.motherName       || '';
    out.motherOccupation = record.mother.occupation || out.motherOccupation || '';
    out.motherPhone      = record.mother.phone      || out.motherPhone      || '';
    out.motherAadhaar    = record.mother.aadhaar    || out.motherAadhaar    || '';
  }
  // Documents — convert any saved shape into the new array form so the edit UI
  // can show all files and let the user add/remove them.
  if (record.documents && typeof record.documents === 'object') {
    out.documents = { ...base.documents };
    for (const dk of Object.keys(record.documents)) {
      const d = record.documents[dk];
      if (!d) continue;

      // Helper: turn one stored file shape into the in-form file shape.
      const toFormFile = (f) => {
        if (!f || typeof f !== 'object') return null;
        if (!f.url && !f.data && !f.fileName) return null;
        return {
          fileName:   f.fileName   || '',
          mimeType:   f.mimeType   || '',
          size:       f.size       || 0,
          data:       f.data || f.url || '',
          uploadedAt: f.uploadedAt || '',
        };
      };

      if (typeof d === 'object') {
        if (Array.isArray(d.files) && d.files.length) {
          // New shape — preserve the full list
          const arr = d.files.map(toFormFile).filter(Boolean);
          out.documents[dk] = arr.length ? arr : null;
        } else if (d.url || d.fileName || d.data) {
          // Legacy single-file shape — wrap into a 1-item array
          const single = toFormFile(d);
          out.documents[dk] = single ? [single] : null;
        } else if (d.submitted) {
          // Submitted flag but no file content stored — keep slot empty
          out.documents[dk] = null;
        }
      }
    }
  }
  return out;
}