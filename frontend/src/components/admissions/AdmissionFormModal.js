// frontend/src/components/admissions/AdmissionFormModal.js
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { admissionAPI } from '../../pages/Admissions';

const EMPTY = {
  studentName: '', dateOfBirth: '', gender: '', bloodGroup: '',
  nationality: 'Indian', religion: '', category: '', motherTongue: '', aadhaarNumber: '',
  address: { street: '', city: '', state: '', pincode: '' },
  applyingForClass: '', applyingForSection: '', academicYear: '',
  previousSchool: '', previousClass: '', previousGrade: '', previousBoard: '', tcNumber: '',
  father: { name: '', occupation: '', phone: '', email: '', qualification: '', income: '' },
  mother: { name: '', occupation: '', phone: '', email: '', qualification: '' },
  emergencyContact: { name: '', relation: '', phone: '', phone2: '' },
  medical: { hasAllergies: false, allergies: '', hasCondition: false, condition: '', medications: '', doctorName: '', doctorPhone: '' },
  parentName: '', parentEmail: '', parentPhone: '',
  source: 'online', referredBy: '',
  notes: '', priority: 'normal',
  registrationFee: { amount: '', paid: false }
};

const TABS = ['Student', 'Academic', 'Parents', 'Medical', 'Other'];

export default function AdmissionFormModal({ initial, onClose, onSuccess }) {
  const [form, setForm]   = useState(initial ? mergeDeep(EMPTY, initial) : EMPTY);
  const [tab, setTab]     = useState('Student');
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (initial) setForm(mergeDeep(EMPTY, initial));
    else setForm(EMPTY);
  }, [initial]);

  const set = (k, v) => setForm(f => ({ ...f, [k]: v }));
  const setNested = (parent, k, v) => setForm(f => ({ ...f, [parent]: { ...f[parent], [k]: v } }));

  const handleSubmit = async () => {
    if (!form.studentName)      return toast.error('Student name is required');
    if (!form.applyingForClass) return toast.error('Class is required');
    if (!form.parentName)       return toast.error('Parent name is required');
    if (!form.parentEmail)      return toast.error('Parent email is required');
    if (!form.parentPhone)      return toast.error('Parent phone is required');

    setSaving(true);
    try {
      if (initial?._id) {
        await admissionAPI.update(initial._id, form);
        toast.success('Application updated');
      } else {
        await admissionAPI.create(form);
        toast.success('Application created');
      }
      onSuccess();
    } catch (e) {
      toast.error(e.response?.data?.message || 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
      <div className="bg-white rounded-2xl shadow-2xl w-full max-w-3xl max-h-[92vh] flex flex-col overflow-hidden">

        {/* Header */}
        <div className="flex items-center justify-between px-6 py-5 border-b border-slate-100 flex-shrink-0">
          <h2 className="font-bold text-slate-800 text-lg">
            {initial?._id ? 'Edit Application' : 'New Admission Application'}
          </h2>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600 text-xl px-2">✕</button>
        </div>

        {/* Tabs */}
        <div className="flex gap-1 px-6 pt-4 flex-shrink-0">
          {TABS.map(t => (
            <button key={t} onClick={() => setTab(t)}
              className={`px-4 py-2 rounded-lg text-xs font-semibold transition-all ${
                tab === t ? 'bg-indigo-600 text-white' : 'text-slate-500 hover:bg-slate-100'
              }`}>
              {t}
            </button>
          ))}
        </div>

        {/* Form Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">

          {tab === 'Student' && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <F label="Student Full Name *">
                  <input className={inp} value={form.studentName} onChange={e => set('studentName', e.target.value)} placeholder="Arjun Sharma" />
                </F>
                <F label="Date of Birth">
                  <input type="date" className={inp} value={form.dateOfBirth?.split?.('T')?.[0] || form.dateOfBirth || ''} onChange={e => set('dateOfBirth', e.target.value)} />
                </F>
                <F label="Gender">
                  <select className={inp} value={form.gender} onChange={e => set('gender', e.target.value)}>
                    <option value="">Select</option>
                    <option value="male">Male</option>
                    <option value="female">Female</option>
                    <option value="other">Other</option>
                  </select>
                </F>
                <F label="Blood Group">
                  <select className={inp} value={form.bloodGroup} onChange={e => set('bloodGroup', e.target.value)}>
                    <option value="">Select</option>
                    {['A+','A-','B+','B-','AB+','AB-','O+','O-'].map(b => <option key={b}>{b}</option>)}
                  </select>
                </F>
                <F label="Nationality">
                  <input className={inp} value={form.nationality} onChange={e => set('nationality', e.target.value)} />
                </F>
                <F label="Religion">
                  <input className={inp} value={form.religion} onChange={e => set('religion', e.target.value)} />
                </F>
                <F label="Category">
                  <select className={inp} value={form.category} onChange={e => set('category', e.target.value)}>
                    <option value="">Select</option>
                    {['general','obc','sc','st','other'].map(c => <option key={c} value={c}>{c.toUpperCase()}</option>)}
                  </select>
                </F>
                <F label="Mother Tongue">
                  <input className={inp} value={form.motherTongue} onChange={e => set('motherTongue', e.target.value)} />
                </F>
                <F label="Aadhaar Number">
                  <input className={inp} value={form.aadhaarNumber} onChange={e => set('aadhaarNumber', e.target.value)} placeholder="XXXX XXXX XXXX" />
                </F>
              </div>
              <div className="grid grid-cols-2 gap-4 pt-2 border-t border-slate-100">
                <F label="Street Address" className="col-span-2">
                  <input className={inp} value={form.address.street} onChange={e => setNested('address', 'street', e.target.value)} />
                </F>
                <F label="City"><input className={inp} value={form.address.city} onChange={e => setNested('address', 'city', e.target.value)} /></F>
                <F label="State"><input className={inp} value={form.address.state} onChange={e => setNested('address', 'state', e.target.value)} /></F>
                <F label="Pincode"><input className={inp} value={form.address.pincode} onChange={e => setNested('address', 'pincode', e.target.value)} /></F>
              </div>
            </div>
          )}

          {tab === 'Academic' && (
            <div className="grid grid-cols-2 gap-4">
              <F label="Applying for Grade *">
                <select className={inp} value={form.applyingForClass} onChange={e => set('applyingForClass', e.target.value)}>
                  <option value="">Select grade</option>
                  {[...Array(12)].map((_, i) => <option key={i+1} value={i+1}>Grade {i+1}</option>)}
                </select>
              </F>
              <F label="Preferred Section">
                <input className={inp} value={form.applyingForSection} onChange={e => set('applyingForSection', e.target.value)} placeholder="A / B / C" />
              </F>
              <F label="Academic Year">
                <input className={inp} value={form.academicYear} onChange={e => set('academicYear', e.target.value)} placeholder="2026-27" />
              </F>
              <F label="Previous School">
                <input className={inp} value={form.previousSchool} onChange={e => set('previousSchool', e.target.value)} />
              </F>
              <F label="Previous Class">
                <input type="number" className={inp} value={form.previousClass} onChange={e => set('previousClass', e.target.value)} />
              </F>
              <F label="Previous Grade/CGPA">
                <input className={inp} value={form.previousGrade} onChange={e => set('previousGrade', e.target.value)} placeholder="A+ / 9.5" />
              </F>
              <F label="Board">
                <select className={inp} value={form.previousBoard} onChange={e => set('previousBoard', e.target.value)}>
                  <option value="">Select</option>
                  {['CBSE','ICSE','State Board','IB','IGCSE','Other'].map(b => <option key={b}>{b}</option>)}
                </select>
              </F>
              <F label="TC Number">
                <input className={inp} value={form.tcNumber} onChange={e => set('tcNumber', e.target.value)} />
              </F>
            </div>
          )}

          {tab === 'Parents' && (
            <div className="space-y-5">
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Father's Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Name *"><input className={inp} value={form.father.name} onChange={e => setNested('father','name',e.target.value)} /></F>
                  <F label="Occupation"><input className={inp} value={form.father.occupation} onChange={e => setNested('father','occupation',e.target.value)} /></F>
                  <F label="Phone"><input className={inp} value={form.father.phone} onChange={e => setNested('father','phone',e.target.value)} /></F>
                  <F label="Email"><input type="email" className={inp} value={form.father.email} onChange={e => setNested('father','email',e.target.value)} /></F>
                  <F label="Qualification"><input className={inp} value={form.father.qualification} onChange={e => setNested('father','qualification',e.target.value)} /></F>
                  <F label="Annual Income (₹)"><input type="number" className={inp} value={form.father.income} onChange={e => setNested('father','income',e.target.value)} /></F>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Mother's Details</h4>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Name"><input className={inp} value={form.mother.name} onChange={e => setNested('mother','name',e.target.value)} /></F>
                  <F label="Occupation"><input className={inp} value={form.mother.occupation} onChange={e => setNested('mother','occupation',e.target.value)} /></F>
                  <F label="Phone"><input className={inp} value={form.mother.phone} onChange={e => setNested('mother','phone',e.target.value)} /></F>
                  <F label="Email"><input type="email" className={inp} value={form.mother.email} onChange={e => setNested('mother','email',e.target.value)} /></F>
                  <F label="Qualification"><input className={inp} value={form.mother.qualification} onChange={e => setNested('mother','qualification',e.target.value)} /></F>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Primary Contact (for system) *</h4>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Contact Name *"><input className={inp} value={form.parentName} onChange={e => set('parentName',e.target.value)} /></F>
                  <F label="Contact Phone *"><input className={inp} value={form.parentPhone} onChange={e => set('parentPhone',e.target.value)} /></F>
                  <F label="Contact Email *"><input type="email" className={inp} value={form.parentEmail} onChange={e => set('parentEmail',e.target.value)} /></F>
                </div>
              </div>
              <div>
                <h4 className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-3">Emergency Contact</h4>
                <div className="grid grid-cols-2 gap-4">
                  <F label="Name"><input className={inp} value={form.emergencyContact.name} onChange={e => setNested('emergencyContact','name',e.target.value)} /></F>
                  <F label="Relation"><input className={inp} value={form.emergencyContact.relation} onChange={e => setNested('emergencyContact','relation',e.target.value)} /></F>
                  <F label="Phone 1"><input className={inp} value={form.emergencyContact.phone} onChange={e => setNested('emergencyContact','phone',e.target.value)} /></F>
                  <F label="Phone 2"><input className={inp} value={form.emergencyContact.phone2} onChange={e => setNested('emergencyContact','phone2',e.target.value)} /></F>
                </div>
              </div>
            </div>
          )}

          {tab === 'Medical' && (
            <div className="space-y-4">
              <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={form.medical.hasAllergies} onChange={e => setNested('medical','hasAllergies',e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">Student has allergies</span>
              </label>
              {form.medical.hasAllergies && (
                <F label="Allergies details">
                  <textarea className={`${inp} resize-none`} rows={2} value={form.medical.allergies} onChange={e => setNested('medical','allergies',e.target.value)} placeholder="Describe allergies..." />
                </F>
              )}
              <label className="flex items-center gap-3 p-4 rounded-xl border border-slate-200 cursor-pointer hover:bg-slate-50">
                <input type="checkbox" checked={form.medical.hasCondition} onChange={e => setNested('medical','hasCondition',e.target.checked)} className="w-4 h-4" />
                <span className="text-sm font-medium text-slate-700">Student has a medical condition</span>
              </label>
              {form.medical.hasCondition && (
                <div className="grid grid-cols-2 gap-4">
                  <F label="Condition"><textarea className={`${inp} resize-none`} rows={2} value={form.medical.condition} onChange={e => setNested('medical','condition',e.target.value)} /></F>
                  <F label="Medications"><input className={inp} value={form.medical.medications} onChange={e => setNested('medical','medications',e.target.value)} /></F>
                  <F label="Doctor Name"><input className={inp} value={form.medical.doctorName} onChange={e => setNested('medical','doctorName',e.target.value)} /></F>
                  <F label="Doctor Phone"><input className={inp} value={form.medical.doctorPhone} onChange={e => setNested('medical','doctorPhone',e.target.value)} /></F>
                </div>
              )}
            </div>
          )}

          {tab === 'Other' && (
            <div className="grid grid-cols-2 gap-4">
              <F label="Priority">
                <select className={inp} value={form.priority} onChange={e => set('priority', e.target.value)}>
                  <option value="normal">⚪ Normal</option>
                  <option value="high">🟠 High</option>
                  <option value="urgent">🔴 Urgent</option>
                </select>
              </F>
              <F label="Source">
                <select className={inp} value={form.source} onChange={e => set('source', e.target.value)}>
                  {[['online','🌐 Online'],['walk_in','🚶 Walk-in'],['referral','👥 Referral'],['agent','🤝 Agent']].map(([v,l]) => <option key={v} value={v}>{l}</option>)}
                </select>
              </F>
              <F label="Referred By">
                <input className={inp} value={form.referredBy} onChange={e => set('referredBy', e.target.value)} />
              </F>
              <F label="Registration Fee (₹)">
                <input type="number" className={inp} value={form.registrationFee?.amount || ''} onChange={e => setForm(f => ({ ...f, registrationFee: { ...f.registrationFee, amount: e.target.value } }))} />
              </F>
              <F label="Notes" className="col-span-2">
                <textarea className={`${inp} resize-none`} rows={3} value={form.notes} onChange={e => set('notes', e.target.value)} placeholder="Any additional notes..." />
              </F>
            </div>
          )}

        </div>

        {/* Footer */}
        <div className="px-6 py-4 border-t border-slate-100 flex gap-3 flex-shrink-0">
          <button onClick={onClose} className="flex-1 py-2.5 rounded-xl border border-slate-200 text-slate-600 text-sm font-medium hover:bg-slate-50">
            Cancel
          </button>
          <button onClick={handleSubmit} disabled={saving}
            className="flex-1 py-2.5 rounded-xl bg-indigo-600 text-white text-sm font-semibold hover:bg-indigo-700 disabled:opacity-50">
            {saving ? 'Saving...' : initial?._id ? 'Save Changes' : '✓ Submit Application'}
          </button>
        </div>
      </div>
    </div>
  );
}

function F({ label, children, className = '' }) {
  return (
    <div className={className}>
      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1.5">{label}</label>
      {children}
    </div>
  );
}

const inp = "w-full px-3 py-2.5 rounded-xl border border-slate-200 text-sm bg-slate-50 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:bg-white transition-colors";

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
