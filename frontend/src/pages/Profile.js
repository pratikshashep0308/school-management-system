// frontend/src/pages/Profile.js
import PhoneInput from '../components/ui/PhoneInput';
import React, { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import { studentPortalAPI } from '../utils/studentPortalAPI';
import { FormGroup } from '../components/ui';

const ROLE_LABELS = {
  superAdmin: 'Super Administrator', schoolAdmin: 'School Administrator',
  teacher: 'Employee', student: 'Student', parent: 'Parent',
  accountant: 'Accountant', librarian: 'Librarian', transportManager: 'Transport Manager',
};

const ROLE_COLORS = {
  superAdmin: '#7c6af5', schoolAdmin: '#d4522a', teacher: '#4a7c59',
  student: '#2d9cdb', parent: '#c9a84c', accountant: '#f2994a',
  librarian: '#e91e8c', transportManager: '#00bcd4',
};

const ROLE_ICONS = {
  superAdmin: '👑', schoolAdmin: '🏫', teacher: '🎓',
  student: '🎒', parent: '👨‍👩‍👧', accountant: '💼',
  librarian: '📚', transportManager: '🚌',
};

// ── Shared branding sub-components ────────────────────────────────────────────

function SchoolLogoSmall() {
  return (
    <div style={{
      width: 28, height: 28, borderRadius: '50%',
      padding: 2, flexShrink: 0,
      background: 'linear-gradient(135deg, #5C6BC0, #3949AB)',
      boxShadow: '0 2px 8px rgba(57,73,171,0.3)',
    }}>
      <img src="/school-logo.jpeg" alt="School"
        style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
        onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='💎'; e.target.parentElement.style.display='flex'; e.target.parentElement.style.alignItems='center'; e.target.parentElement.style.justifyContent='center'; e.target.parentElement.style.fontSize='14px'; }}
      />
    </div>
  );
}

function SchoolBrandBadge() {
  return (
    <div style={{
      display: 'inline-flex', alignItems: 'center', gap: 7,
      padding: '6px 14px', borderRadius: 30,
      background: 'linear-gradient(135deg, #f0f4ff, #e8eeff)',
      border: '1.5px solid #c7d3f7',
      boxShadow: '0 1px 6px rgba(57,73,171,0.1)',
    }}>
      <SchoolLogoSmall />
      <span style={{
        fontSize: 12, fontWeight: 800,
        fontFamily: "'Merriweather', Georgia, serif",
        display: 'flex', gap: 4,
      }}>
        <span style={{ color: '#E53935' }}>The</span>
        <span style={{ color: '#43A047' }}>Future</span>
        <span style={{ color: '#7B1FA2' }}>Step</span>
        <span style={{ color: '#F57C00' }}>School</span>
      </span>
    </div>
  );
}

// ── Avatar: profile picture if available, else initials with school-logo accent
function ProfileAvatar({ name, color, size = 80, src }) {
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Main avatar circle */}
      <div style={{
        width: size, height: size, borderRadius: 20,
        background: src ? '#F3F4F6' : color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32, fontWeight: 900, color: '#fff',
        border: `3px solid ${color}40`,
        boxShadow: `0 6px 20px ${color}35`,
        position: 'relative', overflow: 'hidden',
      }}>
        {src ? (
          <img src={src} alt={name || ''}
            style={{ width:'100%', height:'100%', objectFit:'cover', display:'block' }}
            onError={e => { e.currentTarget.style.display='none'; }} />
        ) : (
          initials
        )}
        {/* Subtle diamond watermark in corner */}
        <div style={{
          position: 'absolute', bottom: -4, right: -4,
          width: 28, height: 28, borderRadius: '50%',
          padding: 2,
          background: 'linear-gradient(135deg, #5C6BC0, #3949AB)',
          border: '2px solid #fff',
          boxShadow: '0 2px 8px rgba(57,73,171,0.4)',
        }}>
          <img src="/school-logo.jpeg" alt=""
            style={{ width: '100%', height: '100%', borderRadius: '50%', objectFit: 'cover', display: 'block' }}
            onError={e => { e.target.style.display='none'; e.target.parentElement.innerHTML='💎'; e.target.parentElement.style.display='flex'; e.target.parentElement.style.alignItems='center'; e.target.parentElement.style.justifyContent='center'; e.target.parentElement.style.fontSize='11px'; }}
          />
        </div>
      </div>
    </div>
  );
}

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pwdForm,     setPwdForm]     = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd,     setSavingPwd]     = useState(false);
  const [activeTab, setActiveTab] = useState('profile');

  // Student/parent-only: fetch the full Student record so the profile page can
  // show class, parent details, address, DOB, etc. — not just the bare User row.
  // Admin/teacher accounts don't have a Student record; we skip the fetch for them.
  const isStudentOrParent = user?.role === 'student' || user?.role === 'parent';
  const [studentRec, setStudentRec] = useState(null);
  const [studentLoading, setStudentLoading] = useState(isStudentOrParent);

  useEffect(() => {
    if (!isStudentOrParent) return;
    let cancelled = false;
    studentPortalAPI.getProfile()
      .then(res => { if (!cancelled) setStudentRec(res.data?.data || null); })
      .catch(err => {
        if (!cancelled) {
          console.error('Failed to load student profile:', err);
          // Silent — the basic User info still shows. Toast would be noisy on
          // every page load if backend ever 404s.
        }
      })
      .finally(() => { if (!cancelled) setStudentLoading(false); });
    return () => { cancelled = true; };
  }, [isStudentOrParent]);

  const handleProfileSave = async (e) => {
    e.preventDefault();
    if (!profileForm.name.trim()) { toast.error('Name is required'); return; }
    setSavingProfile(true);
    try {
      const res = await authAPI.updateProfile(profileForm);
      updateUser(res.data.data);
      toast.success('Profile updated successfully');
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to update profile'); }
    finally { setSavingProfile(false); }
  };

  const handlePasswordChange = async (e) => {
    e.preventDefault();
    if (!pwdForm.currentPassword || !pwdForm.newPassword) { toast.error('All fields are required'); return; }
    if (pwdForm.newPassword !== pwdForm.confirmPassword) { toast.error('New passwords do not match'); return; }
    if (pwdForm.newPassword.length < 6) { toast.error('Password must be at least 6 characters'); return; }
    setSavingPwd(true);
    try {
      await authAPI.changePassword(pwdForm);
      toast.success('Password changed successfully');
      setPwdForm({ currentPassword: '', newPassword: '', confirmPassword: '' });
    } catch (err) { toast.error(err.response?.data?.message || 'Failed to change password'); }
    finally { setSavingPwd(false); }
  };

  const avatarColor = ROLE_COLORS[user?.role] || '#d4522a';
  const roleIcon    = ROLE_ICONS[user?.role]  || '👤';

  return (
    <div className="animate-fade-in" style={{ maxWidth: 680 }}>
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">My Profile</h2>
          <p className="text-sm text-muted mt-0.5">Manage your personal information and security settings</p>
        </div>
      </div>

      {/* ── Profile Header Card ── */}
      <div className="card p-6 mb-5" style={{ position: 'relative', overflow: 'hidden' }}>
        {/* Decorative background stripe */}
        <div style={{
          position: 'absolute', top: 0, left: 0, right: 0, height: 5,
          background: 'linear-gradient(90deg, #E53935, #43A047, #7B1FA2, #F57C00, #1565C0, #E53935)',
          backgroundSize: '300% 100%',
        }} />

        <div style={{ display: 'flex', alignItems: 'flex-start', gap: 20, paddingTop: 4, flexWrap: 'wrap' }}>
          {/* Avatar */}
          {/* Profile photo can live in several places depending on which path
              created the record. Check the Student record first (it's where the
              admission form saves it), then fall back to the User row. */}
          <ProfileAvatar
            name={user?.name}
            color={avatarColor}
            size={80}
            src={
              studentRec?.studentPhoto
              || studentRec?.photo
              || studentRec?.profilePhoto
              || studentRec?.admissionSnapshot?.studentPhoto
              || studentRec?.admissionSnapshot?.photo
              || user?.profileImage
              || user?.studentPhoto
              || user?.photo
            }
          />

          {/* Info */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "'Merriweather', Georgia, serif", fontSize: 22, fontWeight: 900, color: '#111827', lineHeight: 1.2, marginBottom: 4 }}>
              {user?.name}
            </div>
            <div style={{ fontSize: 13, color: '#6B7280', marginBottom: 10 }}>{user?.email}</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <span style={{
                display: 'inline-flex', alignItems: 'center', gap: 5,
                padding: '4px 12px', borderRadius: 20,
                background: `${avatarColor}18`, border: `1.5px solid ${avatarColor}35`,
                fontSize: 11.5, fontWeight: 800, color: avatarColor,
              }}>
                {roleIcon} {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          </div>

          {/* Right: School brand + member since */}
          <div style={{ textAlign: 'right', flexShrink: 0 }}>
            <SchoolBrandBadge />
            <div style={{ marginTop: 10 }}>
              <div style={{ fontSize: 10, color: '#9CA3AF', marginBottom: 2, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Member since</div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#374151' }}>
                {user?.createdAt
                  ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' })
                  : '2024'}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── Tabs ── */}
      <div style={{ display: 'flex', gap: 4, marginBottom: 20, padding: 4, background: '#F3F4F6', borderRadius: 12, width: 'fit-content' }}>
        {['profile', 'password'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)} style={{
            padding: '8px 22px', borderRadius: 9, fontSize: 13, fontWeight: 700,
            border: 'none', cursor: 'pointer', transition: 'all 0.15s',
            background: activeTab === tab ? '#fff' : 'transparent',
            color: activeTab === tab ? '#111827' : '#6B7280',
            boxShadow: activeTab === tab ? '0 1px 6px rgba(0,0,0,0.1)' : 'none',
          }}>
            {tab === 'profile' ? 'Personal Info' : 'Change Password'}
          </button>
        ))}
      </div>

      {/* ── Personal Info Tab ── */}
      {activeTab === 'profile' && (
        <>
          {/* Read-only Student Details — only for student/parent accounts where
              a Student record exists. Shows the data captured at admission so
              students/parents can verify what the school has on file. Edits go
              through the school admin (data correctness > self-service here). */}
          {isStudentOrParent && (
            <div className="card p-6 mb-5">
              {studentLoading ? (
                <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:'20px 0' }}>Loading student details…</div>
              ) : !studentRec ? (
                <div style={{ color:'#9CA3AF', fontSize:13, textAlign:'center', padding:'20px 0' }}>
                  No student record linked to this account. Contact the school office to set this up.
                </div>
              ) : (
                <StudentDetailsPanel rec={studentRec} />
              )}
            </div>
          )}

        <div className="card p-6">
          <form onSubmit={handleProfileSave}>
            <FormGroup label="Full Name">
              <input
                className="form-input"
                value={profileForm.name}
                onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))}
                placeholder="Your full name"
              />
            </FormGroup>
            <FormGroup label="Email Address">
              <input className="form-input" value={user?.email || ''} disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }} />
              <p style={{ fontSize: 11, color: '#9CA3AF', marginTop: 4 }}>Email cannot be changed</p>
            </FormGroup>
            <FormGroup label="Phone Number">
              <PhoneInput
                value={profileForm.phone}
                onChange={v => setProfileForm(p => ({ ...p, phone: v }))}
              />
            </FormGroup>
            <FormGroup label="Role">
              <input className="form-input" value={ROLE_LABELS[user?.role] || user?.role || ''} disabled
                style={{ opacity: 0.6, cursor: 'not-allowed' }} />
            </FormGroup>
            <button type="submit" disabled={savingProfile} className="btn-primary">
              {savingProfile ? 'Saving…' : 'Save Changes'}
            </button>
          </form>
        </div>
        </>
      )}

      {/* ── Password Tab ── */}
      {activeTab === 'password' && (
        <div className="card p-6">
          <form onSubmit={handlePasswordChange}>
            <FormGroup label="Current Password">
              <input
                type="password"
                className="form-input"
                value={pwdForm.currentPassword}
                onChange={e => setPwdForm(p => ({ ...p, currentPassword: e.target.value }))}
                placeholder="••••••••"
                autoComplete="current-password"
              />
            </FormGroup>
            <FormGroup label="New Password">
              <input
                type="password"
                className="form-input"
                value={pwdForm.newPassword}
                onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </FormGroup>
            <FormGroup label="Confirm New Password">
              <input
                type="password"
                className="form-input"
                value={pwdForm.confirmPassword}
                onChange={e => setPwdForm(p => ({ ...p, confirmPassword: e.target.value }))}
                placeholder="••••••••"
                autoComplete="new-password"
              />
            </FormGroup>
            <div style={{
              padding: '12px 14px', borderRadius: 10,
              background: '#FFF8F1', border: '1px solid #FED7AA',
              fontSize: 12, color: '#92400E', marginBottom: 16, lineHeight: 1.5,
            }}>
              🔒 Password must be at least 6 characters. Use a mix of letters, numbers and symbols for security.
            </div>
            <button type="submit" disabled={savingPwd} className="btn-primary">
              {savingPwd ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}

// ── StudentDetailsPanel ──────────────────────────────────────────────────────
// Read-only view of the full Student record. Sources data from `snapshot`
// (admission-time copy) first, then from top-level Student fields. The schema
// has `strict: false`, so values can land under varying field names depending
// on which form created the record — `pick()` handles those fallbacks.
function StudentDetailsPanel({ rec }) {
  const snap = rec.admissionSnapshot || {};
  // Pick the first non-empty value from a list of candidate paths.
  const pick = (...candidates) => {
    for (const v of candidates) {
      if (v === 0 || v === false) return v;
      if (v !== undefined && v !== null && v !== '') return v;
    }
    return null;
  };
  const fmtDate = (d) => {
    if (!d) return null;
    const date = new Date(d);
    if (isNaN(date)) return null;
    return date.toLocaleDateString('en-IN', { day:'2-digit', month:'short', year:'numeric' });
  };
  const fmtAddress = (a) => {
    if (!a) return null;
    if (typeof a === 'string') return a;
    const parts = [a.street, a.city, a.state, a.pincode, a.country].filter(p => p && typeof p === 'string');
    return parts.length ? parts.join(', ') : null;
  };

  const cls = rec.class;
  const className = cls?.name
    ? `${cls.name}${cls.section ? ' - ' + cls.section : ''}${cls.grade ? ' (Grade ' + cls.grade + ')' : ''}`
    : null;

  // Section rows: [label, value]. Null/empty values render as "—".
  const sections = [
    {
      title: '🎓 Academic',
      rows: [
        ['Admission No',     rec.admissionNumber],
        ['Roll Number',      rec.rollNumber],
        ['Class',            className],
        ['Academic Year',    pick(snap.academicYear, rec.academicYear)],
        ['Date of Admission', fmtDate(pick(snap.dateOfAdmission, rec.dateOfAdmission, rec.admissionDate))],
        ['Status',           rec.status],
      ],
    },
    {
      title: '👤 Personal',
      rows: [
        ['Date of Birth',    fmtDate(pick(snap.dateOfBirth, rec.dateOfBirth, rec.dob))],
        ['Gender',           pick(snap.gender, rec.gender)],
        ['Blood Group',      pick(snap.bloodGroup, rec.bloodGroup)],
        ['Religion',         pick(snap.religion, rec.religion)],
        ['Caste',            pick(snap.caste, rec.caste)],
        ['Category',         pick(snap.category, rec.category)],
        ['Mother Tongue',    pick(snap.motherTongue, rec.motherTongue)],
        ['Nationality',      pick(snap.nationality, rec.nationality)],
        ['Aadhaar Number',   pick(snap.aadhaarNumber, rec.aadhaarNumber)],
      ],
    },
    {
      title: '👨‍👩‍👧 Parent / Guardian',
      rows: [
        ['Father Name',      pick(snap.fatherName, rec.fatherName)],
        ['Father Phone',     pick(snap.fatherPhone, rec.fatherPhone)],
        ['Father Occupation',pick(snap.fatherOccupation, rec.fatherOccupation)],
        ['Mother Name',      pick(snap.motherName, rec.motherName)],
        ['Mother Phone',     pick(snap.motherPhone, rec.motherPhone)],
        ['Mother Occupation',pick(snap.motherOccupation, rec.motherOccupation)],
        ['Guardian Email',   pick(snap.parentEmail, rec.parentEmail)],
      ],
    },
    {
      title: '🏠 Contact',
      rows: [
        ['Mobile (SMS)',     pick(snap.smsMobile, rec.smsMobile, rec.user?.phone)],
        ['Address',          fmtAddress(pick(snap.address, rec.address))],
      ],
    },
  ];

  return (
    <div>
      <div style={{ fontFamily: "'Merriweather', Georgia, serif", fontSize:18, fontWeight:900, color:'#111827', marginBottom:4 }}>
        Student Details
      </div>
      <div style={{ fontSize:12, color:'#6B7280', marginBottom:16 }}>
        Information on file with the school. Contact the school office to update.
      </div>

      {sections.map(sec => {
        const visibleRows = sec.rows.filter(([, v]) => v !== null && v !== '');
        if (!visibleRows.length) return null;
        return (
          <div key={sec.title} style={{ marginBottom:18 }}>
            <div style={{ fontSize:12, fontWeight:800, color:'#4F46E5', textTransform:'uppercase', letterSpacing:'0.06em', marginBottom:8, paddingBottom:6, borderBottom:'1px solid #E5E7EB' }}>
              {sec.title}
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fit, minmax(220px, 1fr))', gap:'10px 24px' }}>
              {visibleRows.map(([label, value]) => (
                <div key={label}>
                  <div style={{ fontSize:11, color:'#9CA3AF', fontWeight:600, marginBottom:2 }}>{label}</div>
                  <div style={{ fontSize:13, color:'#111827', fontWeight:500, textTransform: typeof value === 'string' && value.length < 30 ? 'capitalize' : 'none' }}>
                    {String(value)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}