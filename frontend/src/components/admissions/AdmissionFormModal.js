// frontend/src/components/admissions/AdmissionFormModal.js
// eSkooly-style admission form: numbered sections, floating labels, 3-col grid

import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../utils/admissionUtils';

const EMPTY = {
  // Section 1 - Student Info
  studentName:        '',
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
  previousBoardRollNo:'',
  totalSiblings:      '',
  disease:            '',
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

  // Section 4 - Previous School
  previousSchoolName: '',
  previousClass:      '',
  previousBoard:      '',
  tcNumber:           '',
  lcNumber:           '',
  previousGrade:      '',

  // Section 5 - Documents Checklist
  documents: {
    birthCertificate:    null,
    aadhaarStudent:      null,
    aadhaarParent:       null,
    photos:              null,
    addressProof:        null,
    leavingCertificate:  null,
    transferCertificate: null,
    previousMarksheet:   null,
    casteCertificate:    null,
    incomeCertificate:   null,
    bankDetails:         null,
    medicalCertificate:  null,
    apaarId:             null,
    studentId:           null,
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
        {label}{required && '*'}
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
  const [form,   setForm]   = useState(initial ? mergeDeep(EMPTY, initial) : EMPTY);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(initial ? mergeDeep(EMPTY, initial) : EMPTY);
  }, [initial]);

  const set  = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setDoc = (k, file) => setForm(f => ({ ...f, documents: { ...f.documents, [k]: file ? file.name : null } }));

  const handleSubmit = async () => {
    if (!form.studentName)    return toast.error('Student name is required');
    if (!form.applyingForClass) return toast.error('Class is required');
    if (!form.parentName)     return toast.error('Parent/Guardian name is required');
    if (!form.parentPhone)    return toast.error('Parent phone is required');

    // Map fields for backend compatibility
    const payload = {
      ...form,
      parentEmail: form.parentEmail || `${form.parentPhone}@school.local`,
      father: { name: form.fatherName, occupation: form.fatherOccupation, phone: form.fatherPhone },
      mother: { name: form.motherName, occupation: form.motherOccupation, phone: form.motherPhone },
      address: { street: form.address, city: form.city, state: form.state, pincode: form.pincode },
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
      } else {
        await admissionAPI.create(payload);
        toast.success('Application submitted!');
      }
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save');
    } finally { setSaving(false); }
  };

  const docsTotal   = Object.keys(form.documents).length;
  const docsChecked = Object.values(form.documents).filter(Boolean).length;

  return (
    <div style={{ position:'fixed', inset:0, zIndex:50, display:'flex', alignItems:'center', justifyContent:'center', padding:16, background:'rgba(0,0,0,0.5)' }}>
      <div style={{ background:'#F8F8FF', borderRadius:20, width:'100%', maxWidth:900, maxHeight:'94vh', display:'flex', flexDirection:'column', boxShadow:'0 24px 80px rgba(0,0,0,0.2)', overflow:'hidden' }}>

        {/* Header */}
        <div style={{ background:'#fff', padding:'20px 28px', borderBottom:'1px solid #E5E7EB', flexShrink:0, textAlign:'center' }}>
          <h2 style={{ fontSize:22, fontWeight:800, color:'#1F2937', margin:0 }}>Admission Form</h2>
          <div style={{ display:'flex', justifyContent:'center', gap:16, marginTop:8, fontSize:12 }}>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:24, height:6, borderRadius:3, background:'#6366F1', display:'inline-block' }}/>
              Required*
            </span>
            <span style={{ display:'flex', alignItems:'center', gap:5 }}>
              <span style={{ width:24, height:6, borderRadius:3, background:'#D1D5DB', display:'inline-block' }}/>
              Optional
            </span>
          </div>
          <button onClick={onClose} style={{ position:'absolute', top:20, right:24, width:32, height:32, borderRadius:8, border:'1px solid #E5E7EB', background:'#fff', cursor:'pointer', fontSize:18, color:'#6B7280', display:'flex', alignItems:'center', justifyContent:'center' }}>×</button>
        </div>

        {/* Scrollable body */}
        <div style={{ flex:1, overflowY:'auto', padding:'24px 28px' }}>

          {/* Section 1 - Student Information */}
          <Section number="1" title="Student Information">
            <FloatInput label="Student Name" required>
              <input style={INP} value={form.studentName} onChange={e=>set('studentName',e.target.value)} placeholder="Name of Student"/>
            </FloatInput>
            <FloatInput label="Registration No">
              <input style={INP} value={form.registrationNo} onChange={e=>set('registrationNo',e.target.value)} placeholder="Registration No"/>
            </FloatInput>
            <FloatInput label="Select Class" required>
              <select style={SEL} value={form.applyingForClass} onChange={e=>set('applyingForClass',e.target.value)}>
                <option value="">Select Class</option>
                {['Nursery','LKG','UKG',...Array.from({length:12},(_,i)=>`Class ${i+1}`)].map(c=><option key={c} value={c}>{c}</option>)}
              </select>
            </FloatInput>
            <FloatInput label="Date of Admission" required>
              <input type="date" style={INP} value={form.dateOfAdmission} onChange={e=>set('dateOfAdmission',e.target.value)}/>
            </FloatInput>
            <FloatInput label="Discount in Fee (%)">
              <input type="number" style={INP} value={form.discountInFee} onChange={e=>set('discountInFee',e.target.value)} placeholder="In %"/>
            </FloatInput>
            <FloatInput label="Mobile No. for SMS/WhatsApp">
              <input style={INP} value={form.mobileForSMS} onChange={e=>set('mobileForSMS',e.target.value)} placeholder="+91XXXXXXXXXX"/>
            </FloatInput>
            <FloatInput label="Academic Year">
              <input style={INP} value={form.academicYear} onChange={e=>set('academicYear',e.target.value)} placeholder="2026-27"/>
            </FloatInput>
            <FloatInput label="Aadhaar Number">
              <input style={INP} value={form.aadhaarNumber} onChange={e=>set('aadhaarNumber',e.target.value)} placeholder="XXXX XXXX XXXX"/>
            </FloatInput>
            <FloatInput label="Category">
              <select style={SEL} value={form.category} onChange={e=>set('category',e.target.value)}>
                <option value="">Select</option>
                {['General','OBC','SC','ST','Other'].map(c=><option key={c}>{c}</option>)}
              </select>
            </FloatInput>
          </Section>

          {/* Section 2 - Other Information */}
          <Section number="2" title="Other Information">
            <FloatInput label="Date of Birth">
              <input type="date" style={INP} value={form.dateOfBirth} onChange={e=>set('dateOfBirth',e.target.value)}/>
            </FloatInput>
            <FloatInput label="Student Birth Form ID / NIC">
              <input style={INP} value={form.birthFormId} onChange={e=>set('birthFormId',e.target.value)} placeholder="Birth Form ID / NIC"/>
            </FloatInput>
            <FloatInput label="Orphan Student">
              <select style={SEL} value={form.orphanStudent} onChange={e=>set('orphanStudent',e.target.value)}>
                <option value="">Select</option>
                <option value="no">No</option>
                <option value="yes">Yes</option>
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
            <FloatInput label="Previous School">
              <input style={INP} value={form.previousSchool} onChange={e=>set('previousSchool',e.target.value)} placeholder="Previous School"/>
            </FloatInput>
            <FloatInput label="Blood Group">
              <select style={SEL} value={form.bloodGroup} onChange={e=>set('bloodGroup',e.target.value)}>
                <option value="">Blood Group</option>
                {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b=><option key={b}>{b}</option>)}
              </select>
            </FloatInput>
            <FloatInput label="Previous ID / Board Roll No">
              <input style={INP} value={form.previousBoardRollNo} onChange={e=>set('previousBoardRollNo',e.target.value)} placeholder="Previous ID / Board Roll No"/>
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
            <FloatInput label="Any Additional Note" span={2}>
              <input style={INP} value={form.additionalNote} onChange={e=>set('additionalNote',e.target.value)} placeholder="Any Additional Note"/>
            </FloatInput>
          </Section>

          {/* Section 3 - Parent / Guardian */}
          <Section number="3" title="Parent / Guardian Information">
            <FloatInput label="Father's Name">
              <input style={INP} value={form.fatherName} onChange={e=>set('fatherName',e.target.value)} placeholder="Father's Full Name"/>
            </FloatInput>
            <FloatInput label="Father's Occupation">
              <input style={INP} value={form.fatherOccupation} onChange={e=>set('fatherOccupation',e.target.value)} placeholder="Occupation"/>
            </FloatInput>
            <FloatInput label="Father's Phone">
              <input style={INP} value={form.fatherPhone} onChange={e=>set('fatherPhone',e.target.value)} placeholder="Phone Number"/>
            </FloatInput>
            <FloatInput label="Mother's Name">
              <input style={INP} value={form.motherName} onChange={e=>set('motherName',e.target.value)} placeholder="Mother's Full Name"/>
            </FloatInput>
            <FloatInput label="Mother's Occupation">
              <input style={INP} value={form.motherOccupation} onChange={e=>set('motherOccupation',e.target.value)} placeholder="Occupation"/>
            </FloatInput>
            <FloatInput label="Mother's Phone">
              <input style={INP} value={form.motherPhone} onChange={e=>set('motherPhone',e.target.value)} placeholder="Phone Number"/>
            </FloatInput>
            <FloatInput label="Primary Contact Name" required>
              <input style={INP} value={form.parentName} onChange={e=>set('parentName',e.target.value)} placeholder="Guardian / Parent Name"/>
            </FloatInput>
            <FloatInput label="Primary Contact Phone" required>
              <input style={INP} value={form.parentPhone} onChange={e=>set('parentPhone',e.target.value)} placeholder="Mobile Number"/>
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
              <input style={INP} value={form.pincode} onChange={e=>set('pincode',e.target.value)} placeholder="Pincode"/>
            </FloatInput>
          </Section>

          {/* Section 4 - Previous School Details */}
          <Section number="4" title="Previous School Details">
            <FloatInput label="Previous School Name">
              <input style={INP} value={form.previousSchoolName} onChange={e=>set('previousSchoolName',e.target.value)} placeholder="School Name"/>
            </FloatInput>
            <FloatInput label="Previous Class">
              <input style={INP} value={form.previousClass} onChange={e=>set('previousClass',e.target.value)} placeholder="e.g. Class 5"/>
            </FloatInput>
            <FloatInput label="Board">
              <select style={SEL} value={form.previousBoard} onChange={e=>set('previousBoard',e.target.value)}>
                <option value="">Select Board</option>
                {['CBSE','ICSE','State Board','IB','IGCSE','Other'].map(b=><option key={b}>{b}</option>)}
              </select>
            </FloatInput>
            <FloatInput label="Transfer Certificate (TC) No">
              <input style={INP} value={form.tcNumber} onChange={e=>set('tcNumber',e.target.value)} placeholder="TC Number"/>
            </FloatInput>
            <FloatInput label="Leaving Certificate (LC) No">
              <input style={INP} value={form.lcNumber} onChange={e=>set('lcNumber',e.target.value)} placeholder="LC Number"/>
            </FloatInput>
            <FloatInput label="Previous Grade / CGPA">
              <input style={INP} value={form.previousGrade} onChange={e=>set('previousGrade',e.target.value)} placeholder="e.g. A+ / 9.5"/>
            </FloatInput>
          </Section>

          {/* Section 5 - Documents Checklist */}
          <div style={{ marginBottom:28 }}>
            <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:16, paddingBottom:10, borderBottom:'1.5px solid #E5E7EB' }}>
              <div style={{ width:28, height:28, borderRadius:'50%', background:'#6366F1', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                <span style={{ fontSize:13, fontWeight:900, color:'#fff' }}>5</span>
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
                ['birthCertificate',    'Birth Certificate',          '📋', true],
                ['aadhaarStudent',      'Aadhaar Card (Student)',      '🪪', true],
                ['aadhaarParent',       'Aadhaar Card (Parent)',       '🪪', true],
                ['photos',             'Passport Photos (2–4)',        '📷', true],
                ['addressProof',       'Address Proof',               '🏠', true],
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
                const uploaded = form.documents[key];
                return (
                  <div key={key} style={{ border:`1.5px solid ${uploaded?'#10B981':'#E5E7EB'}`, borderRadius:12, padding:'12px 16px', background:uploaded?'#F0FDF4':'#fff', transition:'all 0.15s' }}>
                    <div style={{ display:'flex', alignItems:'center', gap:10, marginBottom:8 }}>
                      <span style={{ fontSize:18 }}>{icon}</span>
                      <div style={{ flex:1 }}>
                        <div style={{ fontSize:13, fontWeight:700, color:'#111827' }}>
                          {label}
                          {required && <span style={{ color:'#6366F1', marginLeft:4 }}>*</span>}
                        </div>
                        {uploaded
                          ? <div style={{ fontSize:11, color:'#16A34A', marginTop:2, display:'flex', alignItems:'center', gap:4 }}>
                              <span>✓</span> {uploaded}
                            </div>
                          : <div style={{ fontSize:11, color:'#9CA3AF', marginTop:2 }}>No file uploaded</div>
                        }
                      </div>
                      {uploaded && (
                        <button type="button" onClick={()=>setDoc(key, null)}
                          style={{ fontSize:11, color:'#DC2626', background:'#FEF2F2', border:'1px solid #FECACA', padding:'3px 8px', borderRadius:6, cursor:'pointer', flexShrink:0 }}>
                          ✕ Remove
                        </button>
                      )}
                    </div>
                    <label style={{ display:'block', cursor:'pointer' }}>
                      <div style={{ border:`1.5px dashed ${uploaded?'#10B981':'#D1D5DB'}`, borderRadius:8, padding:'8px', textAlign:'center', fontSize:12, color:uploaded?'#16A34A':'#6B7280', background:uploaded?'#F0FDF4':'#F9FAFB', transition:'all 0.15s' }}>
                        {uploaded ? '📎 Replace file' : '+ Click to upload'}
                      </div>
                      <input type="file" accept=".pdf,.jpg,.jpeg,.png" style={{ display:'none' }}
                        onChange={e=>{ if(e.target.files[0]) setDoc(key, e.target.files[0]); }}/>
                    </label>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Section 6 - Additional */}
          <Section number="6" title="Additional Information">
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
        <div style={{ background:'#fff', padding:'16px 28px', borderTop:'1px solid #E5E7EB', display:'flex', gap:12, flexShrink:0 }}>
          <button onClick={onClose} style={{ flex:1, padding:'12px', borderRadius:22, border:'1.5px solid #E5E7EB', fontSize:14, fontWeight:600, cursor:'pointer', color:'#6B7280', background:'#fff' }}>
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving} style={{ flex:2, padding:'12px', borderRadius:22, border:'none', fontSize:14, fontWeight:700, cursor:saving?'not-allowed':'pointer', background:saving?'#9CA3AF':'#6366F1', color:'#fff' }}>
            {saving ? '⏳ Saving...' : initial?._id ? '✓ Save Changes' : '✓ Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

function mergeDeep(base, override) {
  const out = { ...base };
  for (const k of Object.keys(override || {})) {
    if (override[k] !== null && typeof override[k] === 'object' && !Array.isArray(override[k]) && typeof base[k] === 'object') {
      out[k] = mergeDeep(base[k], override[k]);
    } else if (override[k] !== undefined) {
      out[k] = override[k];
    }
  }
  return out;
}