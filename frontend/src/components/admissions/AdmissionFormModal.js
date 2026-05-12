// frontend/src/components/admissions/AdmissionFormModal.js
// eSkooly-style admission form: numbered sections, floating labels, 3-col grid

import PhoneInput from '../ui/PhoneInput';
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../utils/admissionUtils';
import { classAPI } from '../../utils/api';

const EMPTY = {
  // Section 1 - Student Info
  // Profile photo: base64 data URL ("data:image/jpeg;base64,...") so it can be
  // stored alongside the rest of the admission record without external uploads.
  studentPhoto:       '',
  firstName:          '',
  middleName:         '',
  lastName:           '',
  studentName:        '', // kept as derived "First Middle Last"; do not edit directly
  registrationNo:     '',
  applyingForClass:   '',
  dateOfAdmission:    new Date().toISOString().split('T')[0],
  discountInFee:      '',
  mobileForSMS:       '',

  // Section 1b - Portal Login (admin-defined)
  // Admin sets these explicitly so the student/parent knows their credentials
  // up-front rather than relying on auto-generated ones.
  loginEmail:         '',
  loginPassword:      '',

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
  // Custom documents — user-named slots, same multi-file behavior
  // Each entry: { label: 'Bonafide Certificate', files: [{ fileName, ... }] }
  customDocuments: [],

  // The kind of address proof attached (light bill, ration card, etc.)
  addressProofType: '',
  addressProofTypeOther: '',  // when user picks "Other"

  // Meta
  priority:    'normal',
  source:      'walk_in',
  notes:       '',
  aadhaarNumber:'',
  category:    '',
  nonCreamyLayer: '',  // 'yes' | 'no'
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

  // ── Custom documents (user-defined slots) ──────────────────────────────────
  // Same per-file rules apply: 2 MB cap, type whitelist, max 5 files per slot.
  const addCustomDocSlot = () => {
    setForm(f => ({
      ...f,
      customDocuments: [...(f.customDocuments || []), { label: '', files: [] }],
    }));
  };

  const setCustomDocLabel = (rowIdx, label) => {
    setForm(f => {
      const list = [...(f.customDocuments || [])];
      list[rowIdx] = { ...list[rowIdx], label };
      return { ...f, customDocuments: list };
    });
  };

  const removeCustomDocSlot = (rowIdx) => {
    setForm(f => ({
      ...f,
      customDocuments: (f.customDocuments || []).filter((_, i) => i !== rowIdx),
    }));
  };

  const addCustomDocFile = (rowIdx, file) => {
    if (!file) return;
    const row = (form.customDocuments || [])[rowIdx];
    const existing = row && Array.isArray(row.files) ? row.files : [];
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
        const list = [...(f.customDocuments || [])];
        const cur  = list[rowIdx] || { label: '', files: [] };
        list[rowIdx] = {
          ...cur,
          files: [
            ...(cur.files || []),
            {
              fileName:   file.name,
              mimeType:   file.type,
              size:       file.size,
              data:       reader.result,
              uploadedAt: new Date().toISOString(),
            },
          ],
        };
        return { ...f, customDocuments: list };
      });
      toast.success(`${file.name} attached`);
    };
    reader.onerror = () => toast.error(`Failed to read ${file.name}`);
    reader.readAsDataURL(file);
  };

  const removeCustomDocFile = (rowIdx, fileIdx) => {
    setForm(f => {
      const list = [...(f.customDocuments || [])];
      const cur  = list[rowIdx];
      if (!cur) return f;
      list[rowIdx] = { ...cur, files: (cur.files || []).filter((_, i) => i !== fileIdx) };
      return { ...f, customDocuments: list };
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
      // Profile photo: send under BOTH names so it persists regardless of which
      // field the schema declares. The Admission schema has a `photo` field, but
      // strict:false also stores `studentPhoto`. Without this explicit mapping,
      // edits sometimes fail to update the photo because `record.photo` (loaded
      // on hydrate) lingers in formData and overrides the new studentPhoto.
      studentPhoto: form.studentPhoto || '',
      photo:        form.studentPhoto || '',
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
      // Custom (user-named) documents — strip empty rows & normalize shape
      customDocuments: (form.customDocuments || [])
        .filter(r => r && (r.label || (r.files && r.files.length)))
        .map(r => ({
          label: (r.label || '').trim(),
          files: (r.files || []).map(f => ({
            url:        f.data || f.url,
            fileName:   f.fileName,
            mimeType:   f.mimeType,
            size:       f.size,
            uploadedAt: f.uploadedAt,
          })),
        })),
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

    // ── Lookups & label maps ───────────────────────────────────────────────
    const classObj = classes.find(c => c._id === app.applyingForClass);
    const classDisplay = classObj
      ? `${classObj.name}${classObj.section ? ' ' + classObj.section : ''}`
      : (app.applyingForClass || '');

    const orphanLabels = {
      orphan: 'Orphan',
      single_parent_mother: 'Single Parent (Mother)',
      single_parent_father: 'Single Parent (Father)',
      not_applicable: 'Not Applicable',
    };
    const yesNo = v => v === 'yes' ? 'Yes' : v === 'no' ? 'No' : '';

    // ── Helpers ────────────────────────────────────────────────────────────
    const fmtDate = d => d ? new Date(d).toLocaleDateString('en-IN',{day:'numeric',month:'short',year:'numeric'}) : '—';
    const esc = v => (v === null || v === undefined || v === '')
      ? '—'
      : String(v).replace(/[&<>]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;'}[c]));

    // ── Documents ──────────────────────────────────────────────────────────
    const stdDocsList = Object.entries(app.documents||{}).map(([k, v]) => {
      const filled = v && (Array.isArray(v) ? v.length > 0
        : typeof v === 'object' ? (v.submitted || v.url || v.data || (Array.isArray(v.files) && v.files.length))
        : Boolean(v));
      const niceName = k.replace(/([A-Z])/g,' $1').replace(/^./, c => c.toUpperCase()).trim();
      return { name: niceName, filled };
    });
    const customDocsList = (app.customDocuments || [])
      .filter(r => r && r.label)
      .map(r => ({ name: r.label, filled: Array.isArray(r.files) && r.files.length > 0 }));
    const allDocs = [...stdDocsList, ...customDocsList];
    const filledCount = allDocs.filter(d => d.filled).length;

    // ── Government IDs ─────────────────────────────────────────────────────
    const govIds = (app.governmentIds || []).filter(r => r && (r.type || r.number));

    win.document.write(`
      <html><head><title>Admission Receipt - ${esc(app.studentName)}</title>
      <style>
        * { box-sizing:border-box; margin:0; padding:0; }
        body { font-family: Arial, sans-serif; padding: 22px; color: #111; font-size:11px; }
        .header { text-align:center; border-bottom:3px solid #6366F1; padding-bottom:12px; margin-bottom:14px; }
        .school-name { font-size:20px; font-weight:900; color:#1F2937; }
        .school-sub { font-size:10px; color:#6B7280; margin-top:2px; }
        .receipt-title { display:inline-block; margin-top:8px; padding:4px 14px; border:2px solid #6366F1; border-radius:6px; font-size:12px; font-weight:700; color:#6366F1; }
        .app-no { margin:10px 0; text-align:center; background:#F8F8FF; border:1px solid #E0E0FF; border-radius:8px; padding:7px; font-size:11px; color:#374151; }
        .app-no strong { color:#6366F1; font-size:13px; }
        .status-badge { display:inline-block; padding:2px 9px; border-radius:20px; font-size:10px; font-weight:700; background:#D1FAE5; color:#065F46; margin-left:6px; }
        .section { margin-bottom:12px; page-break-inside:avoid; }
        .section-title { font-size:10px; font-weight:700; color:#6366F1; text-transform:uppercase; letter-spacing:.08em; border-bottom:1.5px solid #E5E7EB; padding-bottom:4px; margin-bottom:7px; }
        table { width:100%; border-collapse:collapse; font-size:10.5px; }
        td { padding:4px 8px; border-bottom:0.5px solid #F3F4F6; vertical-align:top; }
        td.lbl { color:#6B7280; width:22%; font-weight:600; }
        td.val { color:#111827; }
        .doc-grid { display:flex; flex-wrap:wrap; gap:4px; padding:3px 0; }
        .doc-badge { padding:3px 8px; border-radius:20px; font-size:9.5px; font-weight:700; background:#EEF2FF; color:#4338CA; }
        .doc-badge.missing { background:#F3F4F6; color:#9CA3AF; }
        .footer { margin-top:18px; padding-top:10px; border-top:1.5px solid #E5E7EB; display:grid; grid-template-columns:1fr 1fr 1fr; gap:12px; font-size:10px; }
        .sign-box { text-align:center; }
        .sign-line { border-bottom:1px solid #374151; margin:18px auto 4px; width:120px; }
        .notice { margin-top:12px; padding:7px 10px; background:#FFFBEB; border:1px solid #FDE68A; border-radius:7px; font-size:9.5px; color:#92400E; }
        @page { margin:9mm; size:A4; }
        @media print { body { padding:0; } }
      </style></head><body>

      <div class="header">
        <div class="school-name">The Future Step School</div>
        <div class="school-sub">Securing Future By Adaptive Learning | thefuturestepschool.in</div>
        <div class="receipt-title">Admission Application Receipt</div>
      </div>

      <div class="app-no">
        Application No: <strong>${esc(app.applicationNumber)}</strong>
        <span class="status-badge">${esc((app.status||'submitted').toUpperCase())}</span>
        &nbsp;|&nbsp;
        Date: <strong>${new Date().toLocaleDateString('en-IN',{day:'numeric',month:'long',year:'numeric'})}</strong>
      </div>

      <div class="section">
        <div class="section-title">1. Student Information</div>
        <table>
          <tr>
            <td class="lbl">First Name</td><td class="val">${esc(app.firstName)}</td>
            <td class="lbl">Middle Name</td><td class="val">${esc(app.middleName)}</td>
          </tr>
          <tr>
            <td class="lbl">Last Name</td><td class="val">${esc(app.lastName)}</td>
            <td class="lbl">Full Name</td><td class="val"><strong>${esc(app.studentName)}</strong></td>
          </tr>
          <tr>
            <td class="lbl">Class Applied</td><td class="val">${esc(classDisplay)}</td>
            <td class="lbl">Registration No</td><td class="val">${esc(app.registrationNo)}</td>
          </tr>
          <tr>
            <td class="lbl">Date of Admission</td><td class="val">${fmtDate(app.dateOfAdmission)}</td>
            <td class="lbl">Academic Year</td><td class="val">${esc(app.academicYear)}</td>
          </tr>
          <tr>
            <td class="lbl">Discount in Fee</td><td class="val">${app.discountInFee ? esc(app.discountInFee)+'%' : '—'}</td>
            <td class="lbl">Mobile (SMS/WhatsApp)</td><td class="val">${esc(app.mobileForSMS)}</td>
          </tr>
          <tr>
            <td class="lbl">Aadhaar Number</td><td class="val">${esc(app.aadhaarNumber)}</td>
            <td class="lbl">Category</td><td class="val">${esc(app.category)}</td>
          </tr>
          <tr>
            <td class="lbl">Non-Creamy Layer</td><td class="val">${esc(yesNo(app.nonCreamyLayer))}</td>
            <td class="lbl">Email</td><td class="val">${esc(app.parentEmail || app.studentEmail)}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">2. Other Information</div>
        <table>
          <tr>
            <td class="lbl">Date of Birth</td><td class="val">${fmtDate(app.dateOfBirth)}</td>
            <td class="lbl">Birth Form ID / NIC</td><td class="val">${esc(app.birthFormId)}</td>
          </tr>
          <tr>
            <td class="lbl">Gender</td><td class="val">${esc(app.gender)}</td>
            <td class="lbl">Orphan Status</td><td class="val">${esc(orphanLabels[app.orphanStudent] || app.orphanStudent)}</td>
          </tr>
          <tr>
            <td class="lbl">Caste</td><td class="val">${esc(app.cast)}</td>
            <td class="lbl">Religion</td><td class="val">${esc(app.religion)}</td>
          </tr>
          <tr>
            <td class="lbl">Blood Group</td><td class="val">${esc(app.bloodGroup)}</td>
            <td class="lbl">Total Siblings</td><td class="val">${esc(app.totalSiblings)}</td>
          </tr>
          <tr>
            <td class="lbl">Nationality</td><td class="val">${esc(app.nationality)}</td>
            <td class="lbl">Identification Mark</td><td class="val">${esc(app.identificationMark)}</td>
          </tr>
          <tr>
            <td class="lbl">Disease (if any)</td><td class="val">${esc(app.disease)}</td>
            <td class="lbl">Is Disabled?</td><td class="val">${esc(yesNo(app.isDisabled))}</td>
          </tr>
          <tr>
            <td class="lbl">Disability %</td><td class="val">${app.disabilityPercentage ? esc(app.disabilityPercentage)+'%' : '—'}</td>
            <td class="lbl">Disability Type</td><td class="val">${esc(app.disabilityType)}</td>
          </tr>
          <tr>
            <td class="lbl">Additional Note</td>
            <td class="val" colspan="3">${esc(app.additionalNote)}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">3. Parent / Guardian Information</div>
        <table>
          <tr>
            <td class="lbl">Father's Name</td><td class="val">${esc(app.fatherName)}</td>
            <td class="lbl">Father's Occupation</td><td class="val">${esc(app.fatherOccupation)}</td>
          </tr>
          <tr>
            <td class="lbl">Father's Phone</td><td class="val">${esc(app.fatherPhone)}</td>
            <td class="lbl">Father's Aadhaar</td><td class="val">${esc(app.fatherAadhaar)}</td>
          </tr>
          <tr>
            <td class="lbl">Mother's Name</td><td class="val">${esc(app.motherName)}</td>
            <td class="lbl">Mother's Occupation</td><td class="val">${esc(app.motherOccupation)}</td>
          </tr>
          <tr>
            <td class="lbl">Mother's Phone</td><td class="val">${esc(app.motherPhone)}</td>
            <td class="lbl">Mother's Aadhaar</td><td class="val">${esc(app.motherAadhaar)}</td>
          </tr>
          <tr>
            <td class="lbl">Primary Contact</td><td class="val"><strong>${esc(app.parentName)}</strong></td>
            <td class="lbl">Contact Phone</td><td class="val"><strong>${esc(app.parentPhone)}</strong></td>
          </tr>
          <tr>
            <td class="lbl">Email</td>
            <td class="val" colspan="3">${esc(app.parentEmail)}</td>
          </tr>
          <tr>
            <td class="lbl">Address</td>
            <td class="val" colspan="3">${esc([app.address,app.city,app.state,app.pincode].filter(Boolean).join(', '))}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">4. Government IDs</div>
        ${govIds.length ? `
        <table>
          ${govIds.map(g => `
            <tr>
              <td class="lbl">${esc(g.type)}</td>
              <td class="val" colspan="3">${esc(g.number)}</td>
            </tr>`).join('')}
        </table>` : `<div style="font-size:10.5px;color:#9CA3AF;padding:4px 0">No Government IDs added</div>`}
      </div>

      <div class="section">
        <div class="section-title">5. Bank Details</div>
        <table>
          <tr>
            <td class="lbl">Account Holder</td><td class="val">${esc(app.bankAccountHolder)}</td>
            <td class="lbl">Bank Name</td><td class="val">${esc(app.bankName)}</td>
          </tr>
          <tr>
            <td class="lbl">Branch Name</td><td class="val">${esc(app.bankBranchName)}</td>
            <td class="lbl">IFSC Code</td><td class="val">${esc(app.bankIfsc)}</td>
          </tr>
          <tr>
            <td class="lbl">Account Number</td><td class="val">${esc(app.bankAccountNumber)}</td>
            <td class="lbl">Branch Address</td><td class="val">${esc(app.bankBranchAddress)}</td>
          </tr>
        </table>
      </div>

      <div class="section">
        <div class="section-title">6. Documents Submitted (${filledCount} / ${allDocs.length})</div>
        <div class="doc-grid">
          ${allDocs.length
            ? allDocs.map(d => `<span class="doc-badge${d.filled ? '' : ' missing'}">${d.filled ? '✓' : '○'} ${esc(d.name)}</span>`).join('')
            : '<span style="color:#9CA3AF;font-size:10.5px">No documents in checklist</span>'}
        </div>
        ${app.addressProofType ? `
          <div style="margin-top:6px;font-size:10px;color:#6B7280">
            Address Proof type: <strong style="color:#374151">${esc(app.addressProofType === '__other__' ? (app.addressProofTypeOther || 'Other') : app.addressProofType)}</strong>
          </div>` : ''}
      </div>

      <div class="section">
        <div class="section-title">7. Additional Information</div>
        <table>
          <tr>
            <td class="lbl">Priority</td><td class="val">${esc(app.priority)}</td>
            <td class="lbl">Source</td><td class="val">${esc(app.source)}</td>
          </tr>
          <tr>
            <td class="lbl">Referred By</td><td class="val">${esc(app.referredBy)}</td>
            <td class="lbl">Notes</td><td class="val">${esc(app.notes)}</td>
          </tr>
        </table>
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
          <div>${esc(app.parentName)}</div>
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

  // Counter shows fixed slots + each non-empty custom slot.
  const customNonEmpty = (form.customDocuments || []).filter(r => r && Array.isArray(r.files) && r.files.length > 0).length;
  const docsTotal   = Object.keys(form.documents).length + (form.customDocuments || []).length;
  const docsChecked = Object.values(form.documents).filter(v => {
    if (!v) return false;
    if (Array.isArray(v)) return v.length > 0;
    return true; // legacy single-object value counts as one uploaded file
  }).length + customNonEmpty;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'flex-start', justifyContent:'center', padding:8, background:'rgba(0,0,0,0.5)', overflowY:'auto' }}>
      <div style={{ background:'#F8F8FF', borderRadius:20, width:'100%', maxWidth:1400, minHeight:'calc(100vh - 16px)', margin:'4px 0', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#fff', padding:'20px 28px', borderBottom:'1px solid #E5E7EB', flexShrink:0, textAlign:'center' }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#1F2937', margin:0 }}>Admission Form</h2>

          <button onClick={onClose} style={{ position:'absolute', top:20, right:24, width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {/* Section 1 - Student Information */}
          <Section number="1" title="Student Information">
            {/* Profile photo upload — sits at the top of Section 1 so admins can attach
                a face photo while filling the application. Stored as base64 inline. */}
            <FloatInput label="Profile Photo" span={3}>
              <div style={{ display:'flex', alignItems:'center', gap:14 }}>
                {/* Live preview circle (or placeholder initials) */}
                <div style={{
                  width:84, height:84, borderRadius:'50%', overflow:'hidden', flexShrink:0,
                  border:'2px solid #E5E7EB', background:'#F9FAFB',
                  display:'flex', alignItems:'center', justifyContent:'center',
                }}>
                  {form.studentPhoto ? (
                    <img src={form.studentPhoto} alt="Student" style={{ width:'100%', height:'100%', objectFit:'cover' }} />
                  ) : (
                    <span style={{ fontSize:24, fontWeight:700, color:'#9CA3AF' }}>
                      {(form.firstName || form.studentName || '?').charAt(0).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* Buttons: choose / remove */}
                <div style={{ display:'flex', flexDirection:'column', gap:6, flex:1 }}>
                  <label style={{
                    display:'inline-block', alignSelf:'flex-start',
                    padding:'8px 16px', borderRadius:8, fontSize:12, fontWeight:700,
                    color:'#fff', background:'#6366F1', cursor:'pointer',
                  }}>
                    {form.studentPhoto ? '🔄 Change Photo' : '📷 Upload Photo'}
                    <input
                      type="file"
                      accept="image/*"
                      style={{ display:'none' }}
                      onChange={async (e) => {
                        const file = e.target.files?.[0];
                        if (!file) return;
                        if (file.size > 2 * 1024 * 1024) {
                          alert('Photo must be under 2 MB. Please pick a smaller one.');
                          return;
                        }
                        const reader = new FileReader();
                        reader.onload = () => setForm(f => ({ ...f, studentPhoto: reader.result }));
                        reader.readAsDataURL(file);
                        // Reset so the same file can be re-selected later if needed
                        e.target.value = '';
                      }}
                    />
                  </label>
                  {form.studentPhoto && (
                    <button type="button"
                      onClick={() => setForm(f => ({ ...f, studentPhoto: '' }))}
                      style={{
                        alignSelf:'flex-start', padding:'4px 12px', borderRadius:6,
                        fontSize:11, fontWeight:600, color:'#DC2626',
                        background:'transparent', border:'1px solid #FECACA', cursor:'pointer',
                      }}>
                      Remove
                    </button>
                  )}
                  <p style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>JPG / PNG, under 2 MB. Square photos look best.</p>
                </div>
              </div>
            </FloatInput>

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
              {(() => {
                const KNOWN_CATEGORIES = [
                  { v: 'general', l: 'General (Open)' },
                  { v: 'obc',     l: 'OBC (Other Backward Class)' },
                  { v: 'sc',      l: 'SC (Scheduled Caste)' },
                  { v: 'st',      l: 'ST (Scheduled Tribe)' },
                  { v: 'ews',     l: 'EWS (Economically Weaker Section)' },
                  { v: 'sebc',    l: 'SEBC (Maratha — Maharashtra)' },
                  { v: 'sbc',     l: 'SBC (Special Backward Class)' },
                  { v: 'vjnt_a',  l: 'VJ-A / DT (Vimukta Jati / Denotified)' },
                  { v: 'nt_b',    l: 'NT-B (Nomadic Tribe B)' },
                  { v: 'nt_c',    l: 'NT-C (Nomadic Tribe C)' },
                  { v: 'nt_d',    l: 'NT-D (Nomadic Tribe D)' },
                  { v: 'minority', l: 'Minority' },
                ];
                const knownVals = KNOWN_CATEGORIES.map(c => c.v);
                // Show textbox when EITHER user just picked Other (categoryOtherSelected flag),
                // OR the saved value is free-text not in our known list.
                const isOther = form.categoryOtherSelected || (form.category && !knownVals.includes(form.category));
                const dropdownValue = isOther ? '__other__' : (form.category || '');
                const updateCategory = (newVal, otherFlag = false) => {
                  setForm(f => ({
                    ...f,
                    category: newVal,
                    categoryOtherSelected: otherFlag,
                  }));
                };
                return (
                  <div style={{ display:'flex', gap:8 }}>
                    <select
                      style={{ ...SEL, flex: isOther ? '0 0 50%' : 1 }}
                      value={dropdownValue}
                      onChange={e=>{
                        const v = e.target.value;
                        if (v === '__other__') {
                          // User picked Other — flag it & blank the value so textbox is empty
                          updateCategory('', true);
                        } else {
                          updateCategory(v, false);
                        }
                      }}>
                      <option value="">Select</option>
                      {KNOWN_CATEGORIES.map(c => <option key={c.v} value={c.v}>{c.l}</option>)}
                      <option value="__other__">Other (specify)</option>
                    </select>
                    {isOther && (
                      <input
                        style={{ ...INP, flex:1 }}
                        value={form.category || ''}
                        onChange={e=>{
                          // Keep the Other flag on; only update the typed value
                          setForm(f => ({ ...f, category: e.target.value, categoryOtherSelected: true }));
                        }}
                        placeholder="Specify category"/>
                    )}
                  </div>
                );
              })()}
            </FloatInput>
            {/* Non-Creamy Layer — always visible */}
            <FloatInput label="Non-Creamy Layer">
              <select style={SEL} value={form.nonCreamyLayer} onChange={e=>set('nonCreamyLayer', e.target.value)}>
                <option value="">Select</option>
                <option value="yes">Yes</option>
                <option value="no">No</option>
              </select>
            </FloatInput>
          </Section>

          {/* Section 1b - Portal Login Credentials (Admin-defined) */}
          <Section number="1b" title="🔐 Portal Login Credentials">
            <div style={{ gridColumn:'1 / -1', background:'#FEF3C7', border:'1px solid #FDE68A', borderRadius:8, padding:'10px 14px', marginBottom:8, fontSize:12, color:'#92400E' }}>
              <strong>📌 Important:</strong> Set the username and password the student/parent will use to log in to the portal.
              You'll share these credentials with them. If left blank, the system will auto-generate them.
            </div>
            <FloatInput label="Login Username / Email">
              <input style={INP} value={form.loginEmail}
                onChange={e=>set('loginEmail', e.target.value.toLowerCase().trim())}
                placeholder="e.g. pratiksha2026 or student.name@school.in"
                autoComplete="off" />
            </FloatInput>
            <FloatInput label="Login Password">
              <input type="text" style={INP} value={form.loginPassword}
                onChange={e=>set('loginPassword', e.target.value)}
                placeholder="At least 6 characters"
                autoComplete="off" />
            </FloatInput>
            <div style={{ gridColumn:'1 / -1', fontSize:11, color:'#6B7280', marginTop:-4 }}>
              The student can also log in with their admission number or roll number once enrolled.
            </div>
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

                {(form.governmentIds || []).map((row, idx) => {
                  // Known list — anything not in this list is treated as "Other"
                  // so editing existing records still works for legacy free-text values.
                  const KNOWN_TYPES = [
                    'APAAR ID',
                    'PEN (Permanent Education Number)',
                    'Aadhaar Number',
                    'UDISE+ Student ID',
                    'Samagra ID',
                    'Ration Card',
                    'Passport',
                    'Caste Certificate ID',
                    'Income Certificate ID',
                    'Domicile Certificate ID',
                    'EWS Certificate ID',
                  ];
                  // "Other" is active when EITHER the user just picked it (otherSelected flag),
                  // OR the saved type is some free-text value not in the known list.
                  const isOther = row.otherSelected || (row.type && !KNOWN_TYPES.includes(row.type));
                  const dropdownValue = isOther ? '__other__' : (row.type || '');

                  return (
                    <div key={idx} style={{ display:'flex', gap:8, marginBottom:8, alignItems:'flex-start', flexWrap:'wrap' }}>
                      {/* ID Type dropdown */}
                      <select
                        style={{ ...SEL, flex:'0 0 240px' }}
                        value={dropdownValue}
                        onChange={e=>{
                          const v = e.target.value;
                          setForm(f => {
                            const list = [...(f.governmentIds || [])];
                            if (v === '__other__') {
                              // User picked "Other" — flag it & clear type so textbox is empty
                              list[idx] = { ...list[idx], type: '', otherSelected: true };
                            } else {
                              // Picked a known type (or cleared back to empty) — drop the flag
                              list[idx] = { ...list[idx], type: v, otherSelected: false };
                            }
                            return { ...f, governmentIds: list };
                          });
                        }}>
                        <option value="">Select ID type</option>
                        {KNOWN_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
                        <option value="__other__">Other (specify)</option>
                      </select>

                      {/* If "Other" picked, free-text label input appears */}
                      {isOther && (
                        <input
                          style={{ ...INP, flex:'0 0 200px' }}
                          value={row.type || ''}
                          onChange={e=>{
                            const v = e.target.value;
                            setForm(f => {
                              const list = [...(f.governmentIds || [])];
                              list[idx] = { ...list[idx], type: v };
                              return { ...f, governmentIds: list };
                            });
                          }}
                          placeholder="ID name"/>
                      )}

                      {/* ID Number */}
                      <input
                        style={{ ...INP, flex:1, minWidth:160 }}
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
                  );
                })}

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
                          {/* Show selected proof type next to the label, if set */}
                          {key === 'addressProof' && form.addressProofType && (
                            <span style={{ fontSize:11, fontWeight:500, color:'#4F46E5', marginLeft:6 }}>
                              — {form.addressProofType === '__other__'
                                  ? (form.addressProofTypeOther || 'Other')
                                  : form.addressProofType}
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize:11, color: hasAny ? '#16A34A' : '#9CA3AF', marginTop:2 }}>
                          {hasAny
                            ? `${files.length} file${files.length>1?'s':''} attached`
                            : 'No file uploaded — you can attach multiple (e.g. front + back)'}
                        </div>
                      </div>
                    </div>

                    {/* ── Address Proof: type-of-proof dropdown ─────────── */}
                    {key === 'addressProof' && (
                      <div style={{ display:'flex', gap:8, marginBottom:10, alignItems:'center' }}>
                        <span style={{ fontSize:11, color:'#6B7280', flexShrink:0 }}>Type:</span>
                        <select
                          style={{ ...SEL, flex: form.addressProofType === '__other__' ? '0 0 50%' : 1, padding:'6px 10px', fontSize:12 }}
                          value={form.addressProofType}
                          onChange={e=>{
                            const v = e.target.value;
                            setForm(f => ({
                              ...f,
                              addressProofType: v,
                              // Drop the custom label whenever the user picks a known type
                              ...(v !== '__other__' && { addressProofTypeOther: '' }),
                            }));
                          }}>
                          <option value="">Select type</option>
                          <option value="Light Bill">Light / Electricity Bill</option>
                          <option value="Water Bill">Water Bill</option>
                          <option value="Gas Bill">Gas Bill</option>
                          <option value="Telephone Bill">Telephone / Internet Bill</option>
                          <option value="Property Tax Receipt">Property Tax Receipt</option>
                          <option value="Rent Agreement">Rent Agreement</option>
                          <option value="Ration Card">Ration Card</option>
                          <option value="Aadhaar Address">Aadhaar (Address Page)</option>
                          <option value="Voter ID">Voter ID</option>
                          <option value="Passport">Passport</option>
                          <option value="Driving License">Driving License</option>
                          <option value="Bank Statement">Bank Statement / Passbook</option>
                          <option value="__other__">Other (specify)</option>
                        </select>
                        {form.addressProofType === '__other__' && (
                          <input
                            style={{ ...INP, flex:1, padding:'6px 10px', fontSize:12 }}
                            value={form.addressProofTypeOther}
                            onChange={e=>set('addressProofTypeOther', e.target.value)}
                            placeholder="Specify type"/>
                        )}
                      </div>
                    )}

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

            {/* ── Custom (user-named) documents ─────────────────────────────── */}
            <div style={{ marginTop:24 }}>
              <div style={{ fontSize:13, fontWeight:700, color:'#374151', marginBottom:10 }}>
                Other documents
                <span style={{ fontWeight:400, color:'#6B7280', marginLeft:6 }}>
                  — for any document not listed above
                </span>
              </div>

              {(form.customDocuments || []).length === 0 && (
                <div style={{ fontSize:12, color:'#9CA3AF', marginBottom:10 }}>
                  No custom documents yet. Click "+ Add custom document" to add one (e.g. Bonafide Certificate, NOC, Sports Certificate).
                </div>
              )}

              <div style={{ display:'grid', gridTemplateColumns:'repeat(2,1fr)', gap:12 }}>
                {(form.customDocuments || []).map((slot, rowIdx) => {
                  const files   = Array.isArray(slot.files) ? slot.files : [];
                  const hasAny  = files.length > 0;
                  const atLimit = files.length >= MAX_FILES_PER_SLOT;

                  return (
                    <div key={rowIdx} style={{ border:`1.5px solid ${hasAny?'#10B981':'#E5E7EB'}`, borderRadius:12, padding:'12px 16px', background:hasAny?'#F0FDF4':'#fff', transition:'all 0.15s' }}>
                      {/* Row header — label input + remove-row button */}
                      <div style={{ display:'flex', alignItems:'center', gap:8, marginBottom:hasAny?10:8 }}>
                        <span style={{ fontSize:18 }}>📎</span>
                        <input
                          style={{ ...INP, flex:1, fontWeight:600 }}
                          value={slot.label || ''}
                          onChange={e=>setCustomDocLabel(rowIdx, e.target.value)}
                          placeholder="Document name (e.g. Bonafide Certificate)"/>
                        <button type="button" onClick={()=>removeCustomDocSlot(rowIdx)}
                          title="Remove this document"
                          style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'6px 10px', borderRadius:6, cursor:'pointer', flexShrink:0, fontWeight:600 }}>
                          ✕
                        </button>
                      </div>

                      <div style={{ fontSize:11, color: hasAny ? '#16A34A' : '#9CA3AF', marginBottom:8 }}>
                        {hasAny
                          ? `${files.length} file${files.length>1?'s':''} attached`
                          : 'No file uploaded — you can attach multiple'}
                      </div>

                      {/* Per-file rows */}
                      {files.map((f, fIdx) => {
                        const url   = (f && typeof f === 'object') ? (f.data || f.url || '') : '';
                        const mime  = (f && typeof f === 'object') ? (f.mimeType || '') : '';
                        const fname = (f && typeof f === 'object') ? (f.fileName || `File ${fIdx+1}`) : `File ${fIdx+1}`;
                        const viewable = url && (url.startsWith('data:') || url.startsWith('blob:') || /^https?:\/\//i.test(url));

                        return (
                          <div key={fIdx}
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
                            <button type="button" onClick={()=>removeCustomDocFile(rowIdx, fIdx)}
                              style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'2px 8px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                              ✕
                            </button>
                          </div>
                        );
                      })}

                      {/* Add-file area */}
                      {!atLimit && (
                        <label style={{ display:'block', cursor:'pointer' }}>
                          <div style={{ border:`1.5px dashed ${hasAny?'#10B981':'#D1D5DB'}`, borderRadius:8, padding:'8px', textAlign:'center', fontSize:12, color:hasAny?'#16A34A':'#6B7280', background:hasAny?'#F0FDF4':'#F9FAFB', transition:'all 0.15s' }}>
                            {hasAny ? `+ Add another file (${files.length}/${MAX_FILES_PER_SLOT})` : '+ Click to upload (multiple allowed)'}
                          </div>
                          <input type="file" accept=".pdf,.jpg,.jpeg,.png" multiple style={{ display:'none' }}
                            onChange={e=>{
                              const picked = Array.from(e.target.files || []);
                              const room = MAX_FILES_PER_SLOT - files.length;
                              picked.slice(0, room).forEach(f => addCustomDocFile(rowIdx, f));
                              if (picked.length > room) {
                                toast.error(`Only ${room} more file(s) allowed in this slot`);
                              }
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

              <button type="button" onClick={addCustomDocSlot}
                style={{ marginTop:12, fontSize:13, color:'#4F46E5', background:'#EEF2FF',
                         border:'1.5px dashed #C7D2FE', padding:'10px 18px', borderRadius:8,
                         cursor:'pointer', fontWeight:600 }}>
                + Add custom document
              </button>
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
  // Photo can come back under different field names depending on which form/import
  // wrote the record. The form input only knows about `studentPhoto`, so map
  // alternates into it during hydration.
  if (!out.studentPhoto) {
    out.studentPhoto = record.photo || record.profilePhoto || '';
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
  // Custom (user-named) documents — load saved rows back into the form shape
  if (Array.isArray(record.customDocuments)) {
    out.customDocuments = record.customDocuments.map(r => ({
      label: r?.label || '',
      files: Array.isArray(r?.files) ? r.files.map(f => ({
        fileName:   f?.fileName   || '',
        mimeType:   f?.mimeType   || '',
        size:       f?.size       || 0,
        data:       f?.data || f?.url || '',
        uploadedAt: f?.uploadedAt || '',
      })) : [],
    }));
  }
  return out;
}