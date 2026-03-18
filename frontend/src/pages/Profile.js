import React, { useState } from 'react';
import toast from 'react-hot-toast';
import { useAuth } from '../context/AuthContext';
import { authAPI } from '../utils/api';
import { Avatar, FormGroup } from '../components/ui';

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

export default function Profile() {
  const { user, updateUser } = useAuth();
  const [profileForm, setProfileForm] = useState({ name: user?.name || '', phone: user?.phone || '' });
  const [pwdForm, setPwdForm] = useState({ currentPassword: '', newPassword: '', confirmPassword: '' });
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingPwd, setSavingPwd] = useState(false);
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

  return (
    <div className="animate-fade-in max-w-2xl">
      <div className="page-header">
        <div>
          <h2 className="font-display text-2xl text-ink">My Profile</h2>
          <p className="text-sm text-muted mt-0.5">Manage your personal information and security settings</p>
        </div>
      </div>

      {/* Profile header card */}
      <div className="card p-6 mb-5">
        <div className="flex items-center gap-5">
          <div className="w-20 h-20 rounded-2xl flex items-center justify-center text-white font-bold text-3xl flex-shrink-0"
            style={{ background: avatarColor }}>
            {user?.name?.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2)}
          </div>
          <div>
            <div className="font-display text-2xl text-ink">{user?.name}</div>
            <div className="text-muted text-sm mt-0.5">{user?.email}</div>
            <div className="mt-2">
              <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-bold text-white"
                style={{ background: avatarColor }}>
                {ROLE_LABELS[user?.role] || user?.role}
              </span>
            </div>
          </div>
          <div className="ml-auto hidden sm:block text-right">
            <div className="text-xs text-muted mb-1">Member since</div>
            <div className="text-sm font-medium text-ink">
              {user?.createdAt ? new Date(user.createdAt).toLocaleDateString('en-IN', { month: 'long', year: 'numeric' }) : '2024'}
            </div>
          </div>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 mb-5 p-1 bg-warm rounded-xl w-fit">
        {['profile', 'password'].map(tab => (
          <button key={tab} onClick={() => setActiveTab(tab)}
            className={`px-5 py-2 rounded-lg text-sm font-semibold transition-all capitalize ${activeTab === tab ? 'bg-white text-ink shadow-sm' : 'text-muted hover:text-ink'}`}>
            {tab === 'profile' ? 'Personal Info' : 'Change Password'}
          </button>
        ))}
      </div>

      {activeTab === 'profile' ? (
        <div className="card p-7">
          <form onSubmit={handleProfileSave}>
            <div className="grid grid-cols-2 gap-4 mb-6">
              <FormGroup label="Full Name" className="col-span-2">
                <input className="form-input" value={profileForm.name} onChange={e => setProfileForm(p => ({ ...p, name: e.target.value }))} placeholder="Your full name" />
              </FormGroup>
              <FormGroup label="Email Address" className="col-span-2">
                <input className="form-input bg-warm cursor-not-allowed" value={user?.email || ''} readOnly />
                <p className="text-xs text-muted mt-1">Email cannot be changed. Contact admin if needed.</p>
              </FormGroup>
              <FormGroup label="Phone Number" className="col-span-2">
                <input className="form-input" value={profileForm.phone} onChange={e => setProfileForm(p => ({ ...p, phone: e.target.value }))} placeholder="9876543210" />
              </FormGroup>
              <FormGroup label="Role">
                <input className="form-input bg-warm cursor-not-allowed capitalize" value={ROLE_LABELS[user?.role] || user?.role || ''} readOnly />
              </FormGroup>
              <FormGroup label="School">
                <input className="form-input bg-warm cursor-not-allowed" value="EduCore Academy" readOnly />
              </FormGroup>
            </div>
            <div className="flex gap-3">
              <button type="submit" disabled={savingProfile} className="btn-primary">
                {savingProfile ? 'Saving…' : 'Save Changes'}
              </button>
              <button type="button" onClick={() => setProfileForm({ name: user?.name || '', phone: user?.phone || '' })} className="btn-secondary">
                Reset
              </button>
            </div>
          </form>
        </div>
      ) : (
        <div className="card p-7">
          <form onSubmit={handlePasswordChange}>
            <div className="space-y-4 mb-6">
              <FormGroup label="Current Password">
                <input type="password" className="form-input" value={pwdForm.currentPassword} onChange={e => setPwdForm(p => ({ ...p, currentPassword: e.target.value }))} placeholder="••••••••" />
              </FormGroup>
              <FormGroup label="New Password">
                <input type="password" className="form-input" value={pwdForm.newPassword} onChange={e => setPwdForm(p => ({ ...p, newPassword: e.target.value }))} placeholder="Min. 6 characters" />
              </FormGroup>
              <FormGroup label="Confirm New Password">
                <input type="password" className="form-input" value={pwdForm.confirmPassword} onChange={e => setPwdForm(p => ({ ...p, confirmPassword: e.target.value }))} placeholder="Re-enter new password" />
              </FormGroup>
            </div>

            {/* Password strength indicator */}
            {pwdForm.newPassword && (
              <div className="mb-5 p-3 rounded-xl bg-warm border border-border">
                <div className="text-xs text-muted mb-2 font-semibold">Password requirements</div>
                {[
                  { label: 'At least 6 characters', met: pwdForm.newPassword.length >= 6 },
                  { label: 'Contains a number', met: /\d/.test(pwdForm.newPassword) },
                  { label: 'Contains uppercase letter', met: /[A-Z]/.test(pwdForm.newPassword) },
                  { label: 'Passwords match', met: pwdForm.newPassword === pwdForm.confirmPassword && pwdForm.confirmPassword.length > 0 },
                ].map(req => (
                  <div key={req.label} className={`flex items-center gap-2 text-xs mt-1 ${req.met ? 'text-sage' : 'text-muted'}`}>
                    <span>{req.met ? '✓' : '○'}</span> {req.label}
                  </div>
                ))}
              </div>
            )}

            <button type="submit" disabled={savingPwd} className="btn-primary">
              {savingPwd ? 'Changing…' : 'Change Password'}
            </button>
          </form>
        </div>
      )}
    </div>
  );
}
