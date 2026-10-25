// ka-clinic-admin/src/features/settings/SettingsPage.jsx
//
// Account & Security: profile, password and remembered devices. (The
// System tab and its maintenance-mode switch were removed; nothing reads
// that flag any more.)
//
// Removed sections, and the data they used to edit (still stored in
// settings/config and still read elsewhere, just no longer editable here):
//   Clinic Profile   settings/config.clinic: openTime/closeTime are read by
//                    the landing page booking form, and clinic.email is the
//                    fallback recipient for database backups (api/notifications.js).
//   Notifications    settings/config.notif: the dashboard bell still filters
//                    on it (AdminDashboard.jsx); missing keys count as on.
//   Data & Backup    settings/config.system.analyticsEnabled (lib/analytics.js),
//                    backupFrequency and backupRecipients (nightly backup job).
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Camera,
  Check,
  CheckCircle,
  Eye,
  EyeOff,
  Info,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Shield,
  Smartphone,
  Trash2,
  Upload,
  User,
} from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { auth, db, listen } from '../../lib/firebase';
import { authedPostJson } from '../../lib/adminSession';
import { diffFields, logActivity } from '../../lib/activityLog';
import Toast from '../../components/Toast';
import Avatar from '../../components/Avatar';
import ConfirmDialog from '../../components/ConfirmDialog';
import { compressCanvas, removeAdminAvatar, saveAdminAvatar, useAdminAvatar } from '../../lib/adminAvatars';
import ImageCropModal from '../../components/ImageCropModal';
import PasswordChecklist, { PasswordMatch } from '../../components/PasswordChecklist';
import { meetsPasswordPolicy, passwordPolicyError } from '../../lib/passwordPolicy';


/* ─────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────── */
// One card per setting group: a title, a sentence on what it does, then the
// controls. The same card style as the rest of the redesigned dashboard.
const SectionCard = ({ title, subtitle, icon: Icon, action, children }) => (
  <div className="border border-slate-200 rounded-2xl bg-white">
    <div className="px-6 py-4 border-b border-slate-100 flex items-start justify-between gap-4 flex-wrap">
      <div className="flex items-start gap-3 min-w-0">
        <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center flex-shrink-0">
          <Icon size={16} />
        </div>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          {subtitle && <p className="text-xs text-slate-500 mt-0.5 leading-relaxed">{subtitle}</p>}
        </div>
      </div>
      {action}
    </div>
    <div className="p-6">{children}</div>
  </div>
);

// A short "what this does" note inside a card.
const Helper = ({ children }) => (
  <div className="flex items-start gap-2 text-xs text-slate-600 bg-slate-50 border border-slate-200 rounded-xl px-3.5 py-2.5">
    <Info size={14} className="flex-shrink-0 mt-0.5 text-slate-400" />
    <div className="leading-relaxed">{children}</div>
  </div>
);

// Password input with a show/hide eye button.
function PasswordField({ id, label, value, onChange, autoComplete, invalid, describedBy }) {
  const [shown, setShown] = useState(false);
  return (
    <div>
      <label htmlFor={id} className="block text-xs font-semibold text-slate-600 mb-1.5">{label}</label>
      <div className="relative">
        <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        <input
          id={id}
          type={shown ? 'text' : 'password'}
          value={value}
          onChange={onChange}
          autoComplete={autoComplete}
          aria-invalid={invalid || undefined}
          aria-describedby={describedBy}
          className={`w-full pl-9 pr-11 py-2.5 text-sm rounded-xl border bg-white text-slate-900 outline-none transition-colors focus:ring-2 ${
            invalid ? 'border-rose-400 focus:border-rose-500 focus:ring-rose-500/15' : 'border-slate-300 focus:border-[#3B50DF] focus:ring-[#3B50DF]/15'}`}
        />
        <button type="button" onClick={() => setShown(s => !s)}
          aria-label={shown ? `Hide ${label.toLowerCase()}` : `Show ${label.toLowerCase()}`} aria-pressed={shown}
          className="absolute right-1.5 top-1/2 -translate-y-1/2 w-8 h-8 inline-flex items-center justify-center rounded-lg text-slate-400 hover:text-slate-700 hover:bg-slate-100 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-[#3B50DF]/40"
          style={{ lineHeight: 0 }}>
          {shown ? <EyeOff size={16} style={{ display: 'block' }} /> : <Eye size={16} style={{ display: 'block' }} />}
        </button>
      </div>
    </div>
  );
}

// One line of the live requirements checklist.
const InputField = ({ label, value, onChange, type = 'text', placeholder, readOnly, icon: Icon, hint, autoComplete }) => (
  <div>
    <label className="block text-xs font-medium text-slate-600 mb-1.5">{label}</label>
    <div className="relative">
      {Icon && <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
      <input
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        autoComplete={autoComplete}
        className={`w-full ${Icon ? 'pl-10' : 'px-3.5'} pr-3.5 py-2.5 text-xs font-medium border rounded-xl focus:outline-none transition-colors ${
          readOnly
            ? 'bg-slate-50 text-slate-500 cursor-default border-slate-200'
            : 'bg-white border-slate-300 text-slate-800 focus:border-[#3B50DF] focus:ring-2 focus:ring-[#3B50DF]/15'
        }`}
      />
    </div>
    {hint && <p className="text-[11px] text-slate-500 mt-1">{hint}</p>}
  </div>
);

const Banner = ({ type, message }) => (
  <div className={`flex items-start gap-2.5 text-xs px-3.5 py-2.5 rounded-xl border font-medium ${
    type === 'error'   ? 'bg-rose-50 border-rose-200 text-rose-700' :
    type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                         'bg-amber-50 border-amber-200 text-amber-700'
  }`}>
    {type === 'success' ? <CheckCircle size={15} className="flex-shrink-0 mt-0.5" /> : <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />}
    <span>{message}</span>
  </div>
);

const btnPrimary = 'px-4 py-2 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed cursor-pointer';
const btnSecondary = 'px-4 py-2 bg-white hover:bg-slate-50 text-slate-700 text-xs font-semibold rounded-xl transition-colors flex items-center gap-2 cursor-pointer border border-slate-300 disabled:opacity-50';
const btnDanger = 'px-3 py-1.5 text-xs font-semibold rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer';

function formatDeviceTime(ms) {
  if (!ms) return 'Unknown';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'Active just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

// One row per device name. Re-remembering a browser that lost its cookie used
// to leave a fresh entry each time, so the same "Chrome on Windows" showed up
// over and over. The row keeps every fingerprint so Sign Out clears them all.
function groupDevices(list) {
  const groups = new Map();
  (list || []).forEach(d => {
    const key = d.deviceName || 'Web browser';
    const g = groups.get(key);
    if (!g) {
      groups.set(key, { ...d, fingerprints: [d.fingerprint], currentFingerprint: d.isCurrentDevice ? d.fingerprint : null });
      return;
    }
    g.fingerprints.push(d.fingerprint);
    if (d.isCurrentDevice) { g.isCurrentDevice = true; g.currentFingerprint = d.fingerprint; g.fingerprint = d.fingerprint; }
    g.lastActiveAt = Math.max(g.lastActiveAt || 0, d.lastActiveAt || 0);
    g.expiresAt = Math.max(g.expiresAt || 0, d.expiresAt || 0);
  });
  return [...groups.values()].sort((a, b) => (b.lastActiveAt || 0) - (a.lastActiveAt || 0));
}

function formatDate(ms) {
  if (!ms) return '';
  return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
export default function SettingsPage({ onLogout }) {
  const [editingProfile, setEditingProfile] = useState(false);
  const [toast, setToast] = useState(null);
  const toastTimer = useRef(null);

  /* ── Account ── */
  const [account, setAccount] = useState({
    adminName:  auth?.currentUser?.displayName || '',
    adminEmail: auth?.currentUser?.email || '',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [pwForm,    setPwForm]    = useState({ current: '', next: '', confirm: '' });
  const [pwError,   setPwError]   = useState('');
  const [pwSaving,  setPwSaving]  = useState(false);
  const [pwSuccess, setPwSuccess] = useState('');

  /* ── Remembered devices ── */
  const [devices,            setDevices]            = useState([]);
  const [devicesLoading,     setDevicesLoading]     = useState(true);
  const [deviceActionId,     setDeviceActionId]     = useState(null);
  const [confirmFingerprint, setConfirmFingerprint] = useState(null);
  const [confirmAll,         setConfirmAll]         = useState(false);
  const [loggingOutAll,      setLoggingOutAll]      = useState(false);

  /* ── Profile photo ── */
  const myUid = auth.currentUser?.uid;
  const savedAvatar = useAdminAvatar(myUid);
  // A picked file waits in the crop step until it is saved or cancelled.
  const [cropFile, setCropFile] = useState(null);
  const [avatarSaving, setAvatarSaving] = useState(false);
  const avatarInputRef = useRef(null);
  const [photoMenuOpen, setPhotoMenuOpen] = useState(false);
  const photoMenuRef = useRef(null);
  useEffect(() => {
    if (!photoMenuOpen) return undefined;
    const onDown = e => { if (!photoMenuRef.current?.contains(e.target)) setPhotoMenuOpen(false); };
    const onKey = e => { if (e.key === 'Escape') setPhotoMenuOpen(false); };
    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKey);
    return () => { document.removeEventListener('mousedown', onDown); document.removeEventListener('keydown', onKey); };
  }, [photoMenuOpen]);

  const onPickAvatar = (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!/^image\//.test(file.type)) { showToast('Choose an image file (JPG, PNG or WebP).', 'error'); return; }
    setCropFile(file);
  };
  // Crop → compress (under 600 KB) → save.
  const saveCroppedAvatar = async (canvas) => {
    if (!myUid) return;
    setAvatarSaving(true);
    try {
      await saveAdminAvatar(myUid, compressCanvas(canvas));
      setCropFile(null);
      showToast('Profile photo updated.');
    } catch (err) {
      console.error('Avatar save failed:', err);
      showToast(err.message?.includes('too large') ? err.message : 'Could not save your photo. Please try again.', 'error');
    } finally {
      setAvatarSaving(false);
    }
  };
  const removeAvatar = async () => {
    if (!myUid) return;
    setAvatarSaving(true);
    try {
      await removeAdminAvatar(myUid);
      showToast('Profile photo removed.');
    } catch (err) {
      console.error('Avatar remove failed:', err);
      showToast('Could not remove your photo. Please try again.', 'error');
    } finally {
      setAvatarSaving(false);
    }
  };

  const showToast = (msg, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ msg, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  /* ── Live settings/config (stored profile fallback) ── */
  useEffect(() => {
    const unsub = listen(doc(db, 'settings', 'config'), snap => {
      if (!snap.exists()) return;
      const d = snap.data();
      if (d.account) {
        setAccount(prev => ({
          adminName:  auth?.currentUser?.displayName || d.account.adminName || prev.adminName,
          adminEmail: auth?.currentUser?.email || d.account.adminEmail || prev.adminEmail,
        }));
      }
    }, err => console.warn('Settings snapshot error:', err));
    return () => unsub();
  }, []);

  /* ── Load remembered devices ── */
  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      const data = await authedPostJson('/api/devices', { action: 'list-trusted' });
      setDevices(data?.success ? groupDevices(data.devices) : []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    loadDevices();
  }, []);

  // A grouped row may hold several entries; every one is signed out, this
  // browser's own entry last because that call also ends the session.
  const handleLogoutDevice = async (d) => {
    const { fingerprint, isCurrentDevice } = d;
    setDeviceActionId(fingerprint);
    try {
      const order = [...d.fingerprints.filter(fp => fp !== d.currentFingerprint), ...(d.currentFingerprint ? [d.currentFingerprint] : [])];
      for (const fp of order) {
        const data = await authedPostJson('/api/devices', { action: 'logout-device', fingerprint: fp });
        if (!data?.success) {
          showToast(data?.error || 'Could not sign out that device.', 'error');
          if (fp !== order[0]) loadDevices();
          return;
        }
      }
      if (isCurrentDevice) {
        await signOut(auth).catch(() => {});
        if (onLogout) onLogout();
        return;
      }
      setDevices(prev => prev.filter(d => d.fingerprint !== fingerprint));
      showToast('Device signed out. It will ask for a sign-in code next time.');
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setDeviceActionId(null);
      setConfirmFingerprint(null);
    }
  };

  // `silent` is used after a password change, which already explains itself.
  const logoutAllDevices = async ({ silent = false } = {}) => {
    setConfirmAll(false);
    setLoggingOutAll(true);
    try {
      const data = await authedPostJson('/api/devices', { action: 'logout-all' });
      if (data?.success) {
        setDevices([]);
        if (!silent) showToast('All remembered devices were signed out.');
      } else if (!silent) {
        showToast(data?.error || 'Could not sign out the devices.', 'error');
      }
    } catch {
      if (!silent) showToast('Network error. Please try again.', 'error');
    } finally {
      setLoggingOutAll(false);
    }
  };

  const handleUpdateProfile = async () => {
    const user = auth?.currentUser;
    if (!user) return;
    const nextName  = account.adminName.trim();
    const nextEmail = account.adminEmail.trim().toLowerCase();
    if (!nextName)  { showToast('Please enter your name.', 'error'); return; }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(nextEmail)) { showToast('Please enter a valid email address.', 'error'); return; }

    setProfileSaving(true);
    try {
      if (user.displayName !== nextName) await updateProfile(user, { displayName: nextName });
      if (user.email !== nextEmail) await updateEmail(user, nextEmail);
      await setDoc(doc(db, 'settings', 'config'), {
        account: { adminName: nextName, adminEmail: nextEmail, updatedAt: Date.now() },
      }, { merge: true });
      logActivity({ action: 'settings.update', collection: 'settings', docId: 'config',
        summary: 'Updated own staff profile', changes: diffFields({ name: user.displayName, email: user.email }, { name: nextName, email: nextEmail }) });
      showToast('Profile updated.');
      setEditingProfile(false);
    } catch (err) {
      console.error('Profile update failed:', err);
      showToast(err.code === 'auth/requires-recent-login'
        ? 'For your security, sign out and back in before changing your email.'
        : (err.message || 'Could not update your profile.'), 'error');
    } finally {
      setProfileSaving(false);
    }
  };

  const cancelProfileEdit = () => {
    setAccount({ adminName: auth?.currentUser?.displayName || '', adminEmail: auth?.currentUser?.email || '' });
    setEditingProfile(false);
  };

  const handleChangePassword = async () => {
    setPwError('');
    setPwSuccess('');
    if (!pwForm.current) { setPwError('Enter your current password.'); return; }
    const policyError = passwordPolicyError(pwForm.next);
    if (policyError) { setPwError(policyError); return; }
    if (pwForm.next === pwForm.current) { setPwError('The new password must be different from the current one.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('The two new passwords do not match.'); return; }

    setPwSaving(true);
    try {
      const user = auth.currentUser;
      await reauthenticateWithCredential(user, EmailAuthProvider.credential(user.email, pwForm.current));
      await updatePassword(user, pwForm.next);
      setPwForm({ current: '', next: '', confirm: '' });
      await logoutAllDevices({ silent: true });
      setPwSuccess('Password changed. All remembered devices were signed out and will ask for a sign-in code next time.');
    } catch (err) {
      console.error('Password change error:', err);
      setPwError(err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential'
        ? 'Your current password is incorrect.'
        : err.code === 'auth/password-does-not-meet-requirements' || err.code === 'auth/weak-password'
          ? passwordPolicyError(pwForm.next) || 'The new password does not meet the password rules.'
          : 'Could not change the password. Please try again.');
    } finally {
      setPwSaving(false);
    }
  };

  /* ── Render: Account & Security ── */
  const renderAccount = () => (
    <div className="space-y-5">
      {/* Profile */}
      <SectionCard
        title="Your Profile"
        subtitle="The name shown across the dashboard and the email you sign in with."
        icon={User}
        action={!editingProfile && (
          <button type="button" onClick={() => setEditingProfile(true)} className={btnSecondary}>Edit Profile</button>
        )}
      >
        <div className="space-y-4">
          {/* Photo: the avatar carries an edit badge. With no photo, clicking
              opens the file picker straight away; with a photo, a small menu
              offers Change photo / Remove photo. A picked photo is previewed
              on the avatar until it is saved or discarded. */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="relative" ref={photoMenuRef}>
              <button type="button" onClick={() => (savedAvatar ? setPhotoMenuOpen(o => !o) : avatarInputRef.current?.click())} disabled={avatarSaving}
                className="relative block rounded-full cursor-pointer outline-none focus-visible:ring-4 focus-visible:ring-indigo-200 disabled:cursor-wait"
                aria-haspopup={savedAvatar ? 'menu' : undefined} aria-expanded={savedAvatar ? photoMenuOpen : undefined} aria-label={savedAvatar ? 'Change profile photo' : 'Upload profile photo'}
                title="JPG, PNG or WebP. You can crop it, then it is resized to under 600 KB.">
                <Avatar src={savedAvatar} alt={account.adminName} size={64} />
                <span className="absolute -bottom-0.5 -right-0.5 w-6 h-6 rounded-full bg-[#3B50DF] text-white border-2 border-white flex items-center justify-center shadow-sm" style={{ lineHeight: 0 }}>
                  <Camera size={12} style={{ display: 'block' }} />
                </span>
              </button>
              {photoMenuOpen && savedAvatar && (
                <div role="menu" className="absolute left-0 top-[calc(100%+6px)] z-30 w-44 bg-white border border-slate-200 rounded-xl shadow-[0_12px_32px_rgba(15,23,42,0.16)] py-1">
                  <button type="button" role="menuitem" onClick={() => { setPhotoMenuOpen(false); avatarInputRef.current?.click(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-slate-700 hover:bg-indigo-50 cursor-pointer text-left">
                    <Upload size={14} /> Change photo
                  </button>
                  <button type="button" role="menuitem" onClick={() => { setPhotoMenuOpen(false); removeAvatar(); }}
                    className="w-full flex items-center gap-2 px-3 py-2 text-xs font-medium text-rose-600 hover:bg-rose-50 cursor-pointer text-left">
                    <Trash2 size={14} /> Remove photo
                  </button>
                </div>
              )}
              <input ref={avatarInputRef} type="file" accept="image/jpeg,image/png,image/webp" className="hidden" onChange={onPickAvatar} id="admin-avatar-input" />
              {cropFile && (
                <ImageCropModal
                  file={cropFile}
                  title="Crop profile photo"
                  saving={avatarSaving}
                  onCancel={() => setCropFile(null)}
                  onSave={saveCroppedAvatar}
                />
              )}
            </div>
            <div className="min-w-0">
              <p className="text-sm font-semibold text-slate-900">{account.adminName || 'Your photo'}</p>
              <p className="text-[11px] text-slate-500 mt-0.5">JPG, PNG or WebP · cropped, then resized to under 600 KB</p>
            </div>
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="Full name" value={account.adminName} icon={User} readOnly={!editingProfile}
              onChange={e => setAccount(p => ({ ...p, adminName: e.target.value }))} placeholder="Your name" autoComplete="name" />
            <InputField label="Email address" value={account.adminEmail} icon={Mail} readOnly={!editingProfile}
              onChange={e => setAccount(p => ({ ...p, adminEmail: e.target.value }))} placeholder="you@clinic.ph" autoComplete="email" />
          </div>
          {editingProfile && (
            <>
              <Helper>Changing your email changes the address you sign in with and where sign-in codes are sent. You may be asked to sign in again first.</Helper>
              <div className="flex justify-end gap-2">
                <button type="button" onClick={cancelProfileEdit} className={btnSecondary}>Cancel</button>
                <button type="button" onClick={handleUpdateProfile} disabled={profileSaving} className={btnPrimary}>
                  {profileSaving ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <Check size={13} />}
                  Save Changes
                </button>
              </div>
            </>
          )}
        </div>
      </SectionCard>

      {/* Password */}
      <SectionCard
        title="Change Password"
        subtitle="Set a new password for signing in to the admin portal."
        icon={KeyRound}
      >
        {(() => {
          // Same rules the save enforces (shared password policy).
          const strong = meetsPasswordPolicy(pwForm.next);
          const differs = !!pwForm.next && pwForm.next !== pwForm.current;
          const matches = !!pwForm.confirm && pwForm.confirm === pwForm.next;
          const ready = !!pwForm.current && strong && differs && matches;
          return (
            <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,480px)_minmax(0,1fr)] gap-6 items-start">
              <form className="space-y-4" onSubmit={e => { e.preventDefault(); if (ready && !pwSaving) handleChangePassword(); }}>
                <PasswordField id="pw-current" label="Current password" value={pwForm.current} autoComplete="current-password"
                  onChange={e => { setPwError(''); setPwSuccess(''); setPwForm(p => ({ ...p, current: e.target.value })); }} />
                <div className="border-t border-slate-100" />
                <div>
                  <PasswordField id="pw-new" label="New password" value={pwForm.next} autoComplete="new-password" describedBy="pw-rules"
                    onChange={e => { setPwError(''); setPwSuccess(''); setPwForm(p => ({ ...p, next: e.target.value })); }} />
                  <PasswordChecklist id="pw-rules" className="mt-2" password={pwForm.next} current={pwForm.current} />
                </div>
                <div>
                  <PasswordField id="pw-confirm" label="Confirm new password" value={pwForm.confirm} autoComplete="new-password" describedBy="pw-match"
                    invalid={!!pwForm.confirm && !matches}
                    onChange={e => { setPwError(''); setPwSuccess(''); setPwForm(p => ({ ...p, confirm: e.target.value })); }} />
                  <PasswordMatch id="pw-match" className="mt-1.5" password={pwForm.next} confirm={pwForm.confirm} />
                </div>

                {pwError && <Banner type="error" message={pwError} />}
                {pwSuccess && <Banner type="success" message={pwSuccess} />}

                <div className="flex items-center justify-between gap-4 flex-wrap pt-1">
                  <p className="text-xs text-slate-500 flex items-center gap-1.5">
                    <Info size={13} className="shrink-0" /> You&apos;ll be signed out of all remembered devices.
                  </p>
                  <button type="submit" disabled={!ready || pwSaving} className={btnPrimary + ' disabled:opacity-50 disabled:cursor-not-allowed'}>
                    {pwSaving
                      ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Updating…</>
                      : <><Lock size={13} /> Change Password</>}
                  </button>
                </div>
              </form>

              {/* Wide screens: tips beside the form so the card isn't empty.
                  Laptops: stacked under it. */}
              <aside className="rounded-2xl border border-slate-200 bg-slate-50/70 p-5">
                <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                  <Shield size={15} className="text-[#3B50DF]" /> Tips for a strong password
                </div>
                <ul className="mt-3 space-y-2 text-xs text-slate-600 leading-relaxed list-disc pl-4">
                  <li>Use a passphrase of three or four unrelated words.</li>
                  <li>Don&apos;t reuse a password from email or social media.</li>
                  <li>A password manager can create and remember it for you.</li>
                  <li>Never share it: clinic staff will never ask for your password.</li>
                </ul>
              </aside>
            </div>
          );
        })()}
      </SectionCard>

      {/* Remembered devices */}
      <SectionCard
        title="Remembered Devices"
        subtitle="Browsers where you ticked “Remember me” when signing in."
        icon={Monitor}
        action={devices.length > 0 && (
          <button type="button" onClick={() => setConfirmAll(true)} className={btnDanger + ' text-rose-700 bg-white hover:bg-rose-50 border border-rose-200'}>
            <LogOut size={13} /> Sign Out All Devices
          </button>
        )}
      >
        <div className="space-y-4">
          <Helper>
            A remembered device skips the emailed sign-in code for 30 days. If you lose a device or used a shared computer, sign it out here: it will need your password and a new code next time.
          </Helper>

          {devicesLoading ? (
            <p className="py-8 text-center text-xs text-slate-500">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="py-8 text-center text-xs text-slate-500">
              No remembered devices. Tick “Remember me” when you sign in to skip the code on that browser.
            </p>
          ) : (
            <div className="border border-slate-200 rounded-xl divide-y divide-slate-100">
              {devices.map(d => {
                const name = (d.deviceName || '').toLowerCase();
                const DevIcon = name.includes('phone') || name.includes('mobile') || name.includes('android') || name.includes('iphone')
                  ? Smartphone
                  : name.includes('mac') || name.includes('laptop') ? Laptop : Monitor;
                return (
                  <div key={d.fingerprint} className="flex items-center justify-between gap-4 px-4 py-3 flex-wrap">
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="w-9 h-9 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center shrink-0">
                        <DevIcon size={16} />
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-slate-900 truncate flex items-center gap-2">
                          {d.deviceName || 'Web browser'}
                          {d.isCurrentDevice && (
                            <span className="text-[10.5px] font-medium px-2 py-0.5 rounded-full bg-emerald-50 text-emerald-700 border border-emerald-200">This device</span>
                          )}
                        </p>
                        <p className="text-[11px] text-slate-500 mt-0.5">
                          Last active {formatDeviceTime(d.lastActiveAt).replace('Active just now', 'just now')}
                          {d.expiresAt ? ` · remembered until ${formatDate(d.expiresAt)}` : ''}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setConfirmFingerprint(d.fingerprint)}
                        disabled={deviceActionId === d.fingerprint}
                        className={btnDanger + ' text-rose-700 bg-white hover:bg-rose-50 border border-rose-200'}
                      >
                        <LogOut size={12} /> Sign Out
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </SectionCard>

      {confirmAll && (
        <ConfirmDialog
          variant="danger"
          icon={LogOut}
          title="Sign out all devices?"
          subtitle="Remembered devices"
          message={<>Every remembered browser is signed out, <strong>including this one</strong>.</>}
          details={[
            ['Account', account.adminEmail],
            ['Remembered devices', String(devices.length)],
          ]}
          note="Each device will ask for your password and a new sign-in code next time."
          confirmLabel="Sign out all"
          busy={loggingOutAll}
          busyLabel="Signing out…"
          onConfirm={() => logoutAllDevices()}
          onCancel={() => setConfirmAll(false)}
        />
      )}
      {confirmFingerprint && (() => {
        const d = devices.find(x => x.fingerprint === confirmFingerprint);
        if (!d) return null;
        return (
          <ConfirmDialog
            variant="danger"
            icon={LogOut}
            title="Sign out this device?"
            subtitle="Remembered device"
            message={d.isCurrentDevice
              ? <>This is <strong>the browser you are using now</strong>, so you are signed out right away.</>
              : <>This browser will <strong>no longer skip</strong> the sign-in code.</>}
            details={[
              ['Device', d.isCurrentDevice ? `${d.deviceName || 'Web browser'} (this device)` : (d.deviceName || 'Web browser')],
              ['Last active', d.lastActiveAt ? formatDeviceTime(d.lastActiveAt).replace('Active just now', 'Just now') : ''],
              ['Remembered until', formatDate(d.expiresAt)],
            ]}
            note="It will ask for your password and a new sign-in code next time."
            confirmLabel="Sign out device"
            busy={deviceActionId === d.fingerprint}
            busyLabel="Signing out…"
            onConfirm={() => handleLogoutDevice(d)}
            onCancel={() => setConfirmFingerprint(null)}
          />
        );
      })()}
    </div>
  );


  return (
    <div className="h-full overflow-y-auto bg-[#F0F4FA]">
      <div className="px-7 py-6 max-w-screen-xl mx-auto space-y-5">
        <div>
          <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings</h1>
          <p className="text-sm text-slate-500 mt-1">Your account and sign-in security.</p>
        </div>

        <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden">
          <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center gap-2">
            <Shield size={15} className="text-[#3B50DF]" />
            <h2 className="text-sm font-semibold text-slate-900">Account &amp; Security</h2>
          </div>

          <div className="p-6">
            <div className="animate-settings-fade">
              {renderAccount()}
            </div>
          </div>
        </div>
      </div>

      {toast && <Toast msg={toast.msg} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes settings-fade { from { opacity: 0; } to { opacity: 1; } }
        .animate-settings-fade { animation: settings-fade 0.2s ease-out; }
        @media (prefers-reduced-motion: reduce) { .animate-settings-fade { animation: none; } }
      `}</style>
    </div>
  );
}
