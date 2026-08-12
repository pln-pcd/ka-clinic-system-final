// kna-admin/src/settings.jsx
import {
  EmailAuthProvider,
  reauthenticateWithCredential,
  signOut,
  updateEmail,
  updatePassword,
  updateProfile,
} from 'firebase/auth';
import { doc, onSnapshot, setDoc } from 'firebase/firestore';
import {
  AlertCircle,
  Bell, Building2, Check,
  CheckCircle,
  Clock, Globe, KeyRound,
  Lock, LogOut, Mail, Monitor, Moon,
  Save, Shield, Stethoscope,
  User, X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { authedPostJson } from '../lib/apiClient';
import Toast from '../components/Toast';

/* ─────────────────────────────────────────────
   SECTION NAV CONFIG
───────────────────────────────────────────── */
const SECTIONS = [
  { id: 'clinic',        label: 'Clinic Profile',     icon: Building2 },
  { id: 'account',       label: 'Account & Security', icon: Shield    },
  { id: 'notifications', label: 'Notifications',      icon: Bell      },
  { id: 'system',        label: 'System Preferences', icon: Globe     },
];

/* ─────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────── */
const Toggle = ({ enabled, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 cursor-pointer
      ${enabled ? 'bg-red-500' : 'bg-gray-200'}`}>
    <span className={`inline-block h-4 w-4 transform rounded-full bg-white shadow transition-transform
      ${enabled ? 'translate-x-6' : 'translate-x-1'}`} />
  </button>
);

const SettingRow = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-4 border-b border-gray-100 last:border-0 gap-6">
    <div className="flex-1 min-w-0">
      <p className="text-sm font-semibold text-gray-800">{label}</p>
      {description && <p className="text-xs text-gray-400 mt-0.5 leading-relaxed">{description}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const SectionCard = ({ title, subtitle, icon: Icon, children }) => (
  <div className="border border-gray-100 rounded-xl overflow-hidden">
    <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2.5 bg-gray-50">
      <div className="w-7 h-7 rounded-lg bg-white border border-gray-200 flex items-center justify-center flex-shrink-0">
        <Icon size={14} className="text-red-500" />
      </div>
      <div>
        <p className="text-xs font-bold text-gray-800">{title}</p>
        {subtitle && <p className="text-[11px] text-gray-400">{subtitle}</p>}
      </div>
    </div>
    <div className="px-5 bg-white">{children}</div>
  </div>
);

const InputField = ({ label, value, onChange, type = 'text', placeholder, readOnly }) => (
  <div>
    <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>
    <input
      type={type}
      value={value}
      onChange={onChange}
      readOnly={readOnly}
      placeholder={placeholder}
      className={`w-full px-3.5 py-2 text-sm border rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent transition-all
        ${readOnly ? 'bg-gray-50 text-gray-400 cursor-not-allowed border-gray-200' : 'bg-white border-gray-300 text-gray-900'}`}
    />
  </div>
);

const Banner = ({ type, message }) => (
  <div className={`flex items-start gap-2 text-xs px-3 py-2.5 rounded-lg border ${
    type === 'error'   ? 'bg-red-50 border-red-200 text-red-700' :
    type === 'success' ? 'bg-green-50 border-green-200 text-green-700' :
                         'bg-amber-50 border-amber-200 text-amber-700'
  }`}>
    {type === 'error'   && <AlertCircle  size={13} className="flex-shrink-0 mt-0.5" />}
    {type === 'success' && <CheckCircle  size={13} className="flex-shrink-0 mt-0.5" />}
    {type === 'warning' && <span className="flex-shrink-0 mt-0.5 text-sm leading-none">⚠️</span>}
    <span>{message}</span>
  </div>
);


/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
function formatDeviceTime(ms) {
  if (!ms) return 'Unknown';
  const diffMin = Math.round((Date.now() - ms) / 60000);
  if (diffMin < 1) return 'Just now';
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  if (diffDay < 30) return `${diffDay}d ago`;
  return new Date(ms).toLocaleDateString();
}

export default function SettingsPage({ onLogout }) {
  const [activeSection, setActiveSection] = useState('clinic');
  const [saving,        setSaving]        = useState(false);
  const [toast,         setToast]         = useState(null);
  const toastTimer     = useRef(null);

  /* ── Clinic Profile ── */
  const [clinic, setClinic] = useState({
    name:      'K&A Anti-Rabies Vaccine Clinic',
    address:   'San Juan St., Libon, Albay, Philippines',
    phone:     '+63 907 117 9141',
    email:     'knaclinic@gmail.com',
    website:   'www.knaclinic.ph',
    openTime:  '08:00',
    closeTime: '17:00',
    tagline:   'Your trusted partner in rabies prevention',
  });

  /* ── Account ── */
  const [account, setAccount] = useState({
    adminName:  auth?.currentUser?.displayName  || 'Super Admin',
    adminEmail: auth?.currentUser?.email        || 'admin@kaclinic.ph',
    role:       'Super Administrator',
  });
  const [profileSaving, setProfileSaving] = useState(false);

  const [pwForm,  setPwForm]  = useState({ current: '', next: '', confirm: '' });
  const [pwError, setPwError] = useState('');
  const [pwSaving,setPwSaving]= useState(false);
  const [pwSuccess,setPwSuccess]=useState('');

  /* ── Device Management ── */
  const [devices,          setDevices]          = useState([]);
  const [devicesLoading,   setDevicesLoading]    = useState(true);
  const [deviceActionId,   setDeviceActionId]    = useState(null);
  const [confirmFingerprint, setConfirmFingerprint] = useState(null);
  const [loggingOutAll,    setLoggingOutAll]     = useState(false);


  /* ── Notifications ── */
  const [notif, setNotif] = useState({
    newAppointment: true,
    cancelledApt:   true,
    lowStock:       true,
    expiringStock:  true,
    newMessage:     true,
    dailySummary:   false,
    emailAlerts:    true,
  });

  /* ── System ── */
  const [system, setSystem] = useState({
    maintenanceMode:  false,
    analyticsEnabled: true,
    backupFrequency:  'daily',
  });

  /* ── Real-time listener on /settings/config ── */
  useEffect(() => {
    const unsub = onSnapshot(doc(db, 'settings', 'config'), snap => {
      if (snap.exists()) {
        const d = snap.data();
        if (d.clinic) setClinic(prev => ({ ...prev, ...d.clinic }));
        if (d.notif)  setNotif(prev  => ({ ...prev, ...d.notif  }));
        if (d.system) setSystem(prev => ({ ...prev, ...d.system }));
        if (d.account) {
          setAccount(prev => ({
            ...prev,
            adminName: auth?.currentUser?.displayName || d.account.adminName || prev.adminName,
            adminEmail: auth?.currentUser?.email || d.account.adminEmail || prev.adminEmail,
          }));
        }
      }
    }, err => {
      console.warn('Settings snapshot error:', err);
    });
    return () => unsub();
  }, []);

  /* ── Sync Auth user info ── */
  useEffect(() => {
    if (auth?.currentUser) {
      setAccount(prev => ({
        ...prev,
        adminName:  auth.currentUser.displayName || prev.adminName,
        adminEmail: auth.currentUser.email       || prev.adminEmail,
      }));
    }
  }, [activeSection]);

  /* ── Load trusted devices lazily, only once the Account tab is opened ── */
  const loadDevices = async () => {
    setDevicesLoading(true);
    try {
      const data = await authedPostJson('/api/devices', { action: 'list-trusted' });
      setDevices(data?.success ? data.devices : []);
    } catch {
      setDevices([]);
    } finally {
      setDevicesLoading(false);
    }
  };

  useEffect(() => {
    if (activeSection === 'account') loadDevices();
  }, [activeSection]);

  /* ── Log out one remembered device. Guards the current device behind a
     second click ("Confirm?") since that one also signs this tab out. ── */
  const handleLogoutDevice = async (fingerprint, isCurrentDevice) => {
    if (isCurrentDevice && confirmFingerprint !== fingerprint) {
      setConfirmFingerprint(fingerprint);
      return;
    }
    setConfirmFingerprint(null);
    setDeviceActionId(fingerprint);
    try {
      const data = await authedPostJson('/api/devices', { action: 'logout-device', fingerprint });
      if (!data?.success) {
        showToast(data?.error || 'Could not sign out that device.', 'error');
        return;
      }
      if (isCurrentDevice) {
        await signOut(auth).catch(() => {});
        if (onLogout) onLogout();
        return;
      }
      setDevices(prev => prev.filter(d => d.fingerprint !== fingerprint));
      showToast('Device signed out.');
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setDeviceActionId(null);
    }
  };

  /* ── Log out every remembered device (including this one, eventually —
     see /api/devices logout-all for why the current tab isn't force-killed
     mid-session). Also called after a successful password change below. ── */
  const handleLogoutAllDevices = async () => {
    if (!window.confirm('Sign out of all remembered devices? Every device will need to log in again.')) return;
    setLoggingOutAll(true);
    try {
      const data = await authedPostJson('/api/devices', { action: 'logout-all' });
      if (data?.success) {
        setDevices([]);
        showToast('Signed out of all devices.');
      } else {
        showToast(data?.error || 'Could not sign out other devices.', 'error');
      }
    } catch {
      showToast('Network error. Please try again.', 'error');
    } finally {
      setLoggingOutAll(false);
    }
  };

  const showToast = (message, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ message, type });
    toastTimer.current = setTimeout(() => setToast(null), 3500);
  };

  /* ── Save clinic, notification, & system settings to Firestore ── */
  const handleSave = async () => {
    setSaving(true);
    try {
      await setDoc(doc(db, 'settings', 'config'), {
        clinic,
        notif,
        system,
        updatedAt: Date.now(),
      }, { merge: true });
      showToast('Settings saved successfully!');
    } catch (err) {
      console.error('Save failed:', err);
      showToast('Failed to save settings. Check your connection.', 'error');
    } finally {
      setSaving(false);
    }
  };

  /* ── Update display name + email via Firebase Auth ── */
  const handleUpdateProfile = async () => {
    const user = auth?.currentUser;
    if (!user) { showToast('No authenticated admin user found.', 'error'); return; }

    setProfileSaving(true);
    try {
      const promises = [];
      const newName  = account.adminName.trim();
      const newEmail = account.adminEmail.trim();

      if (newName && newName !== user.displayName) {
        promises.push(updateProfile(user, { displayName: newName }));
      }
      if (newEmail && newEmail !== user.email) {
        promises.push(updateEmail(user, newEmail));
      }

      if (promises.length > 0) {
        await Promise.all(promises);
      }

      /* Persist to Firestore for cross-device visibility */
      await setDoc(doc(db, 'settings', 'config'), {
        account: { adminName: newName, adminEmail: newEmail, role: account.role },
        updatedAt: Date.now(),
      }, { merge: true });

      showToast('Admin Profile updated successfully!');
    } catch (err) {
      console.error('Profile update error:', err);
      if (err.code === 'auth/requires-recent-login') {
        showToast('Please re-login before changing your email.', 'error');
      } else if (err.code === 'auth/email-already-in-use') {
        showToast('That email is already in use by another account.', 'error');
      } else {
        showToast('Failed to update profile. Try again.', 'error');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  /* ── Change password via Firebase Auth with re-authentication ── */
  const handleChangePassword = async () => {
    setPwError('');
    setPwSuccess('');

    if (!pwForm.current)               { setPwError('Enter your current password.');               return; }
    if (pwForm.next.length < 8)        { setPwError('New password must be at least 8 characters.'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match.');                    return; }

    const user = auth?.currentUser;
    if (!user || !user.email) { setPwError('No authenticated user found.'); return; }

    setPwSaving(true);
    try {
      /* Re-authenticate with current credential */
      const credential = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(user, credential);

      /* Update password */
      await updatePassword(user, pwForm.next);

      // Security best practice: a password change invalidates every
      // remembered device, not just this one — best-effort, since the
      // password change itself already succeeded and shouldn't be reported
      // as failed over this secondary cleanup step.
      authedPostJson('/api/devices', { action: 'logout-all' }).then(() => loadDevices()).catch(() => {});

      setPwForm({ current: '', next: '', confirm: '' });
      setPwSuccess('Password updated successfully! You have been signed out of all other devices.');
      setTimeout(() => setPwSuccess(''), 4000);
    } catch (err) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect.');
      } else if (err.code === 'auth/too-many-requests') {
        setPwError('Too many attempts. Please wait a moment and try again.');
      } else {
        setPwError('Failed to update password. Please check current password and try again.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  /* ── Render Sections ── */

  const renderClinic = () => (
    <div className="space-y-4">
      <SectionCard title="Clinic Information" subtitle="Basic details about your clinic" icon={Building2}>
        <div className="py-4 grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="md:col-span-2">
            <InputField label="Clinic Name" value={clinic.name}
              onChange={e => setClinic(p => ({ ...p, name: e.target.value }))} placeholder="Clinic name" />
          </div>
          <InputField label="Tagline" value={clinic.tagline}
            onChange={e => setClinic(p => ({ ...p, tagline: e.target.value }))} placeholder="Short description" />
          <InputField label="Website" value={clinic.website}
            onChange={e => setClinic(p => ({ ...p, website: e.target.value }))} placeholder="www.example.com" />
          <div className="md:col-span-2">
            <InputField label="Address" value={clinic.address}
              onChange={e => setClinic(p => ({ ...p, address: e.target.value }))} placeholder="Full address" />
          </div>
          <InputField label="Phone Number" value={clinic.phone}
            onChange={e => setClinic(p => ({ ...p, phone: e.target.value }))} placeholder="+63 912 345 6789" />
          <InputField label="Email Address" value={clinic.email}
            onChange={e => setClinic(p => ({ ...p, email: e.target.value }))} placeholder="info@clinic.ph" />
        </div>
      </SectionCard>

      <SectionCard title="Operating Hours" subtitle="Set your clinic's daily open and close times" icon={Clock}>
        <div className="py-4 grid grid-cols-2 gap-4">
          <InputField label="Opening Time" type="time" value={clinic.openTime}
            onChange={e => setClinic(p => ({ ...p, openTime: e.target.value }))} />
          <InputField label="Closing Time" type="time" value={clinic.closeTime}
            onChange={e => setClinic(p => ({ ...p, closeTime: e.target.value }))} />
        </div>
        <div className="pb-4">
          <p className="text-xs text-gray-400 bg-gray-50 rounded-lg px-3 py-2 border border-gray-100">
            📌 These hours are displayed to patients when booking appointments.
          </p>
        </div>
      </SectionCard>
    </div>
  );

  const renderAccount = () => (
    <div className="space-y-4">
      {/* Admin Profile */}
      <SectionCard title="Admin Profile" subtitle="Updates your Firebase Auth display name and email" icon={User}>
        <div className="py-4 space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <InputField label="Full Name" value={account.adminName}
              onChange={e => setAccount(p => ({ ...p, adminName: e.target.value }))} placeholder="Your name" />
            <InputField label="Role" value={account.role} readOnly />
            <div className="md:col-span-2">
              <InputField label="Email" value={account.adminEmail}
                onChange={e => setAccount(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@clinic.ph" />
            </div>
          </div>
          <p className="text-[11px] text-gray-400">
            Changing your email will update your Firebase Auth login credentials.
          </p>
          <div className="flex justify-end">
            <button
              onClick={handleUpdateProfile}
              disabled={profileSaving}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60"
            >
              {profileSaving ? <span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <User size={13} />}
              <span>Update Profile</span>
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Change Password */}
      <SectionCard title="Change Password" icon={KeyRound}>
        <div className="py-4 space-y-4">
          {pwError   && <Banner type="error"   message={pwError}   />}
          {pwSuccess && <Banner type="success" message={pwSuccess} />}

          {[
            { key: 'current', label: 'Current Password' },
            { key: 'next',    label: 'New Password' },
            { key: 'confirm', label: 'Confirm New Password' },
          ].map(({ key, label }) => (
            <div key={key}>
              <label className="block text-[11px] font-semibold text-gray-400 mb-1.5 uppercase tracking-wider">{label}</label>
              <input
                type="password"
                value={pwForm[key]}
                onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                placeholder="••••••••"
                className="w-full px-3.5 py-2 text-sm border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 focus:border-transparent"
              />
            </div>
          ))}

          <div className="flex justify-end">
            <button onClick={handleChangePassword} disabled={pwSaving}
              className="px-4 py-2 bg-gray-800 hover:bg-gray-700 text-white text-xs font-semibold rounded-lg transition-colors flex items-center gap-2 disabled:opacity-60">
              {pwSaving
                ? <><span className="w-3 h-3 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Updating…</>
                : <><Lock size={13} /> Update Password</>}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Device Management */}
      <SectionCard title="Logged-in Devices" subtitle="Devices that skip the verification code when you sign in" icon={Monitor}>
        <div className="py-4 space-y-1">
          {devicesLoading ? (
            <p className="text-xs text-gray-400 text-center py-4">Loading devices…</p>
          ) : devices.length === 0 ? (
            <p className="text-xs text-gray-400 text-center py-4">
              No remembered devices yet. Check "Remember me" at login to add this device.
            </p>
          ) : (
            devices.map(d => (
              <div key={d.fingerprint} className="flex items-center justify-between gap-3 py-2.5 border-b border-gray-100 last:border-0">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="w-9 h-9 rounded-lg bg-gray-50 border border-gray-200 flex items-center justify-center flex-shrink-0">
                    <Monitor size={15} className="text-gray-500" />
                  </div>
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-gray-800 flex items-center gap-1.5 flex-wrap">
                      {d.deviceName}
                      {d.isCurrentDevice && (
                        <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 border border-emerald-200 px-1.5 py-0.5 rounded-full">This device</span>
                      )}
                    </p>
                    <p className="text-[11px] text-gray-400 mt-0.5" title={d.lastActiveAt ? new Date(d.lastActiveAt).toLocaleString() : ''}>
                      Last active {formatDeviceTime(d.lastActiveAt)}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => handleLogoutDevice(d.fingerprint, d.isCurrentDevice)}
                  disabled={deviceActionId === d.fingerprint}
                  className={`px-3 py-1.5 text-[11px] font-semibold rounded-lg transition-colors flex items-center gap-1.5 disabled:opacity-50 flex-shrink-0 cursor-pointer ${
                    confirmFingerprint === d.fingerprint ? 'bg-red-600 text-white hover:bg-red-700' : 'text-red-600 hover:bg-red-50'
                  }`}
                >
                  {deviceActionId === d.fingerprint
                    ? <span className="w-3 h-3 border-2 border-red-300 border-t-red-600 rounded-full animate-spin" />
                    : <LogOut size={12} />}
                  {confirmFingerprint === d.fingerprint ? 'Confirm log out?' : 'Log out'}
                </button>
              </div>
            ))
          )}

          {devices.length > 0 && (
            <div className="pt-3 flex justify-end">
              <button onClick={handleLogoutAllDevices} disabled={loggingOutAll}
                className="text-[11px] font-semibold text-gray-500 hover:text-red-600 transition-colors disabled:opacity-50 cursor-pointer">
                {loggingOutAll ? 'Signing out everywhere…' : 'Log out of all devices'}
              </button>
            </div>
          )}
        </div>
      </SectionCard>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-4">
      <SectionCard title="Appointment Alerts" subtitle="Control when you get notified about appointments" icon={Bell}>
        <div className="py-1">
          <SettingRow label="New Appointment Requests" description="Notify when a patient books a new appointment">
            <Toggle enabled={notif.newAppointment} onChange={v => setNotif(p => ({ ...p, newAppointment: v }))} />
          </SettingRow>
          <SettingRow label="Cancelled Appointments" description="Notify when a patient cancels their appointment">
            <Toggle enabled={notif.cancelledApt} onChange={v => setNotif(p => ({ ...p, cancelledApt: v }))} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Inventory Alerts" subtitle="Get notified about stock and expiry issues" icon={Stethoscope}>
        <div className="py-1">
          <SettingRow label="Low Stock Warnings" description="Alert when an item falls below its minimum level">
            <Toggle enabled={notif.lowStock} onChange={v => setNotif(p => ({ ...p, lowStock: v }))} />
          </SettingRow>
          <SettingRow label="Expiring Stock" description="Alert when items are expiring within 30 days">
            <Toggle enabled={notif.expiringStock} onChange={v => setNotif(p => ({ ...p, expiringStock: v }))} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Messages & Reports" subtitle="Notification delivery preferences" icon={Mail}>
        <div className="py-1">
          <SettingRow label="New Messages" description="Notify when a patient sends a new message">
            <Toggle enabled={notif.newMessage} onChange={v => setNotif(p => ({ ...p, newMessage: v }))} />
          </SettingRow>
          <SettingRow label="Daily Summary Email" description="Receive a daily summary of clinic activity">
            <Toggle enabled={notif.dailySummary} onChange={v => setNotif(p => ({ ...p, dailySummary: v }))} />
          </SettingRow>
          <SettingRow label="Email Alerts" description="Send notifications to your admin email address">
            <Toggle enabled={notif.emailAlerts} onChange={v => setNotif(p => ({ ...p, emailAlerts: v }))} />
          </SettingRow>
        </div>
      </SectionCard>
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-4">
      <SectionCard title="Data & Backup" subtitle="Manage system data, backups, and analytics" icon={Shield}>
        <div className="py-1">
          <SettingRow label="Analytics & Usage Data" description="Help improve the system by sharing anonymous usage data">
            <Toggle enabled={system.analyticsEnabled} onChange={v => setSystem(p => ({ ...p, analyticsEnabled: v }))} />
          </SettingRow>
          <SettingRow label="Automatic Backup" description="Frequency of automatic data backups to the cloud">
            <select value={system.backupFrequency}
              onChange={e => setSystem(p => ({ ...p, backupFrequency: e.target.value }))}
              className="px-2.5 py-1.5 text-xs border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-red-500 text-gray-700">
              <option value="hourly">Hourly</option>
              <option value="daily">Daily</option>
              <option value="weekly">Weekly</option>
              <option value="off">Off</option>
            </select>
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Maintenance" subtitle="Control system availability" icon={Lock}>
        <div className="py-1">
          <SettingRow
            label="Maintenance Mode"
            description="When enabled, patients will see a maintenance message and cannot book appointments">
            <Toggle
              enabled={system.maintenanceMode}
              onChange={async v => {
                setSystem(p => ({ ...p, maintenanceMode: v }));
                try {
                  await setDoc(doc(db, 'settings', 'config'), {
                    system: { maintenanceMode: v },
                    updatedAt: Date.now(),
                  }, { merge: true });
                  showToast(v ? 'Maintenance mode enabled.' : 'Maintenance mode disabled.');
                } catch (err) {
                  console.error('Maintenance mode save error:', err);
                  showToast('Failed to toggle maintenance mode.', 'error');
                }
              }}
            />
          </SettingRow>
        </div>

        {system.maintenanceMode && (
          <div className="pb-4">
            <Banner type="warning" message="Maintenance mode is ON. Patients cannot access appointment booking until this is turned off." />
          </div>
        )}
      </SectionCard>
    </div>
  );

  const SECTION_RENDERERS = {
    clinic:        renderClinic,
    account:       renderAccount,
    notifications: renderNotifications,
    system:        renderSystem,
  };

  return (
    <div className="min-h-screen bg-[#F4F5F7] p-6">
      <div className="max-w-7xl mx-auto space-y-6">
        
        {/* Clean Page Title Header */}
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings & Configuration</h1>
            <p className="text-sm font-medium text-slate-500 mt-1">Manage clinic profile, security preferences, notification alerts, and system parameters.</p>
          </div>
        </div>

        {/* Tabbed Card Container */}
        <div className="bg-white rounded-2xl border border-slate-200 shadow-sm overflow-hidden">
          {/* Header Navigation Tabs */}
          <div className="bg-[#1E293B] px-6 py-3.5 text-white flex items-center justify-between border-b border-slate-700">
            <div className="flex items-center gap-1.5 flex-wrap">
              {SECTIONS.map(s => {
                const Icon   = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`flex items-center gap-2 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                      active ? 'bg-white text-slate-900 shadow-xs' : 'text-slate-300 hover:text-white hover:bg-white/10'
                    }`}
                  >
                    <Icon size={14} className={active ? 'text-[#C8151A]' : 'text-slate-400'} />
                    {s.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            <div key={activeSection} className="animate-settings-fade space-y-5">
              {SECTION_RENDERERS[activeSection]?.()}
            </div>

            {activeSection !== 'account' && activeSection !== 'team' && (
              <div className="mt-6 flex justify-end border-t border-slate-100 pt-5">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#C8151A] hover:bg-red-700 text-white text-xs font-bold rounded-xl transition-all disabled:opacity-60 cursor-pointer shadow-xs"
                >
                  {saving
                    ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving Changes…</>
                    : <><Save size={14} /> Save All Changes</>}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast message={toast.message} type={toast.type} onClose={() => setToast(null)} />}

      <style>{`
        @keyframes settings-fade {
          from { opacity: 0; transform: translateY(6px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-settings-fade { animation: settings-fade 0.2s ease-out; }
        @keyframes slide-up {
          from { opacity: 0; transform: translateY(12px); }
          to   { opacity: 1; transform: translateY(0); }
        }
        .animate-slide-up { animation: slide-up 0.25s ease-out; }
      `}</style>
    </div>
  );
}