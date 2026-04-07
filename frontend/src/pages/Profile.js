// frontend/src/pages/Profile.js
import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import { FormGroup } from '../components/ui';

const ROLE_LABELS = {
  superAdmin: 'Super Administrator', schoolAdmin: 'School Administrator',
  teacher: 'Teacher', student: 'Student', parent: 'Parent',
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

// ── Avatar: uses school logo as fallback when no profile image ────────────────
function ProfileAvatar({ name, color, size = 80 }) {
  const [imgError, setImgError] = useState(false);
  const initials = name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2) || 'U';

  return (
    <div style={{ position: 'relative', flexShrink: 0 }}>
      {/* Main avatar circle */}
      <div style={{
        width: size, height: size, borderRadius: 20,
        background: color,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        fontSize: size * 0.32, fontWeight: 900, color: '#fff',
        border: `3px solid ${color}40`,
        boxShadow: `0 6px 20px ${color}35`,
        position: 'relative', overflow: 'hidden',
      }}>
        {initials}
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
          <ProfileAvatar name={user?.name} color={avatarColor} size={80} />

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
              <input
                className="form-input"
                value={profileForm.phone}
                onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))}
                placeholder="Your phone number"
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