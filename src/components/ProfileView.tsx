import React, { useState, useEffect } from 'react';
import { User, KeyRound, LogOut, CheckCircle2, ShieldCheck, Camera } from 'lucide-react';
import { api, type AuthUser } from '../services/api';

interface ProfileViewProps {
  currentUser: AuthUser;
  onUserUpdated: (user: AuthUser) => void;
  onNotify: (message: string) => void;
  onLogout: () => Promise<void>;
}

export const ProfileView: React.FC<ProfileViewProps> = ({
  currentUser,
  onUserUpdated,
  onNotify,
  onLogout,
}) => {
  const [name, setName] = useState(currentUser.name);
  const [phone, setPhone] = useState(currentUser.phone ?? '');
  const [profilePhoto, setProfilePhoto] = useState(currentUser.profilePhoto ?? '');
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileStatus, setProfileStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [passwordStatus, setPasswordStatus] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  useEffect(() => {
    setName(currentUser.name);
    setPhone(currentUser.phone ?? '');
    setProfilePhoto(currentUser.profilePhoto ?? '');
  }, [currentUser]);

  const handlePhotoUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (file.size > 400 * 1024) {
      setProfileStatus({ type: 'error', text: 'Photo must be smaller than 400 KB.' });
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      if (typeof reader.result === 'string') {
        setProfilePhoto(reader.result);
      }
    };
    reader.readAsDataURL(file);
  };

  const handleSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    setProfileStatus(null);
    if (!name.trim()) {
      setProfileStatus({ type: 'error', text: 'Full name cannot be empty.' });
      return;
    }
    setSavingProfile(true);
    try {
      const res = await api.updateProfile({
        name: name.trim(),
        phone: phone.trim(),
        profilePhoto,
      });
      onUserUpdated(res.user);
      setProfileStatus({ type: 'success', text: 'Profile updated successfully.' });
      onNotify('Profile saved');
    } catch (err) {
      setProfileStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update profile.',
      });
    } finally {
      setSavingProfile(false);
    }
  };

  const handleChangePassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordStatus(null);

    if (newPassword.length < 6) {
      setPasswordStatus({
        type: 'error',
        text: 'New password must be at least 6 characters.',
      });
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordStatus({
        type: 'error',
        text: 'New password and confirmation do not match.',
      });
      return;
    }

    setSavingPassword(true);
    try {
      const res = await api.changePassword({ currentPassword, newPassword });
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setPasswordStatus({ type: 'success', text: res.message || 'Password updated.' });
      onNotify('Password updated');
    } catch (err) {
      setPasswordStatus({
        type: 'error',
        text: err instanceof Error ? err.message : 'Unable to update password.',
      });
    } finally {
      setSavingPassword(false);
    }
  };

  const initials = currentUser.name
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((p) => p[0].toUpperCase())
    .join('');

  const memberSince = (() => {
    try {
      return new Date(currentUser.createdAt).toLocaleDateString([], {
        year: 'numeric',
        month: 'short',
        day: 'numeric',
      });
    } catch {
      return currentUser.createdAt;
    }
  })();

  return (
    <div className="space-y-6">
      <section className="pb-5 border-b border-slate-200 flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-blue-600 mb-1">
            Account &amp; Security
          </p>
          <h1 className="text-2xl font-bold text-slate-900">My Profile</h1>
          <p className="text-sm text-slate-600 mt-1">
            View your unique user ID, update profile details, or change your password.
          </p>
        </div>

        <button
          type="button"
          onClick={onLogout}
          className="inline-flex items-center gap-2 px-4 py-2.5 min-h-[40px] bg-white hover:bg-red-50 text-red-700 border border-red-200 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer"
        >
          <LogOut className="w-4 h-4" />
          <span>Logout</span>
        </button>
      </section>

      {/* Account Overview Card */}
      <section className="p-6 bg-white border border-slate-200 rounded-xl flex flex-col md:flex-row md:items-center justify-between gap-6">
        <div className="flex items-center gap-4">
          {profilePhoto ? (
            <img
              src={profilePhoto}
              alt={currentUser.name}
              referrerPolicy="no-referrer"
              className="w-16 h-16 rounded-full object-cover border border-slate-200 shrink-0"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-blue-600 text-white flex items-center justify-center text-xl font-bold shrink-0">
              {initials || 'SQ'}
            </div>
          )}
          <div>
            <h2 className="text-lg font-bold text-slate-900">{currentUser.name}</h2>
            <p className="text-xs text-slate-600 mt-0.5">{currentUser.email}</p>
            <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500 mt-1.5">
              <span className="inline-flex items-center gap-1 font-semibold text-blue-700 capitalize">
                <ShieldCheck className="w-3.5 h-3.5" />
                <span>{currentUser.role}</span>
              </span>
              <span aria-hidden="true">·</span>
              <span className="font-mono">ID: {currentUser.id}</span>
              <span aria-hidden="true">·</span>
              <span>Joined {memberSince}</span>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-2 gap-6 sm:gap-10 border-t md:border-t-0 md:border-l border-slate-200 pt-4 md:pt-0 md:pl-8">
          <div>
            <div className="text-xs text-slate-500">Mobile</div>
            <div className="font-mono text-sm font-semibold text-slate-900 mt-0.5">
              {currentUser.phone || 'Not set'}
            </div>
          </div>
          <div>
            <div className="text-xs text-slate-500">Account Status</div>
            <div className="text-sm font-semibold text-emerald-700 capitalize mt-0.5">
              {currentUser.accountStatus || 'Active'}
            </div>
          </div>
        </div>
      </section>

      {/* Edit Profile & Change Password */}
      <section className="grid grid-cols-1 lg:grid-cols-2 gap-6 items-start">
        <form
          onSubmit={handleSaveProfile}
          className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <User className="w-4 h-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Edit Profile</h3>
          </div>

          {profileStatus && (
            <div
              role="status"
              className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                profileStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {profileStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{profileStatus.text}</span>
            </div>
          )}

          <div>
            <label className="block text-xs font-semibold text-slate-700 mb-1.5">
              Profile Photo
            </label>
            <div className="flex items-center gap-3">
              <label className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-semibold bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg cursor-pointer transition-colors">
                <Camera className="w-3.5 h-3.5" />
                <span>Upload Photo</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handlePhotoUpload}
                  className="hidden"
                />
              </label>
              {profilePhoto && (
                <button
                  type="button"
                  onClick={() => setProfilePhoto('')}
                  className="text-xs font-medium text-slate-500 hover:text-red-700 cursor-pointer"
                >
                  Remove photo
                </button>
              )}
            </div>
          </div>

          <div>
            <label
              htmlFor="profile-name"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Full Name
            </label>
            <input
              id="profile-name"
              type="text"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="profile-email"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Email Address (Read-Only)
            </label>
            <input
              id="profile-email"
              type="email"
              disabled
              value={currentUser.email}
              className="w-full px-3.5 py-2.5 text-sm bg-slate-50 border border-slate-200 rounded-lg text-slate-500 cursor-not-allowed"
            />
          </div>

          <div>
            <label
              htmlFor="profile-phone"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Mobile Number
            </label>
            <input
              id="profile-phone"
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98480 12345"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={savingProfile}
            className="w-full py-2.5 min-h-[42px] bg-blue-600 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {savingProfile ? 'Saving Changes...' : 'Save Profile'}
          </button>
        </form>

        <form
          onSubmit={handleChangePassword}
          className="p-6 bg-white border border-slate-200 rounded-xl space-y-4"
        >
          <div className="flex items-center gap-2 pb-3 border-b border-slate-200">
            <KeyRound className="w-4 h-4 text-blue-600" />
            <h3 className="text-base font-bold text-slate-900">Change Password</h3>
          </div>

          {passwordStatus && (
            <div
              role="status"
              className={`p-3 rounded-lg border text-xs font-medium flex items-center gap-2 ${
                passwordStatus.type === 'success'
                  ? 'bg-emerald-50 border-emerald-200 text-emerald-800'
                  : 'bg-red-50 border-red-200 text-red-800'
              }`}
            >
              {passwordStatus.type === 'success' && <CheckCircle2 className="w-4 h-4 shrink-0" />}
              <span>{passwordStatus.text}</span>
            </div>
          )}

          <div>
            <label
              htmlFor="current-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Current Password
            </label>
            <input
              id="current-password"
              type="password"
              required
              value={currentPassword}
              onChange={(e) => setCurrentPassword(e.target.value)}
              placeholder="Enter current password"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="new-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              New Password
            </label>
            <input
              id="new-password"
              type="password"
              required
              minLength={6}
              value={newPassword}
              onChange={(e) => setNewPassword(e.target.value)}
              placeholder="Minimum 6 characters"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <div>
            <label
              htmlFor="confirm-password"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Confirm New Password
            </label>
            <input
              id="confirm-password"
              type="password"
              required
              minLength={6}
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="Re-enter new password"
              className="w-full px-3.5 py-2.5 text-sm bg-white border border-slate-300 rounded-lg focus:outline-none focus:border-blue-600"
            />
          </div>

          <button
            type="submit"
            disabled={savingPassword}
            className="w-full py-2.5 min-h-[42px] bg-slate-900 hover:bg-blue-700 disabled:opacity-60 text-white text-xs font-semibold rounded-lg transition-colors cursor-pointer"
          >
            {savingPassword ? 'Updating Password...' : 'Update Password'}
          </button>
        </form>
      </section>
    </div>
  );
};
