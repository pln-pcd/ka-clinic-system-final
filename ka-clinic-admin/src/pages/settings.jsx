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
  Bell,
  Building2,
  Check,
  CheckCircle,
  Clock,
  Globe,
  KeyRound,
  Laptop,
  Lock,
  LogOut,
  Mail,
  Monitor,
  Phone,
  Save,
  Shield,
  ShieldCheck,
  Smartphone,
  Stethoscope,
  Trash2,
  User,
  X,
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import { auth, db } from '../lib/firebase';
import { authedPostJson } from '../lib/apiClient';
import Toast from '../components/Toast';

/* ─────────────────────────────────────────────
   SECTION NAV CONFIG
───────────────────────────────────────────── */
const SECTIONS = [
  { id: 'clinic',        label: 'Clinic Profile',     icon: Building2, desc: 'Clinic details & operating hours' },
  { id: 'account',       label: 'Account & Security', icon: Shield,    desc: 'Profile credentials & trusted devices' },
  { id: 'notifications', label: 'Notifications',      icon: Bell,      desc: 'Alerts, email & system notices' },
  { id: 'system',        label: 'System Preferences', icon: Globe,     desc: 'Backups, maintenance & data controls' },
];

/* ─────────────────────────────────────────────
   SHARED COMPONENTS
───────────────────────────────────────────── */
const Toggle = ({ enabled, onChange }) => (
  <button
    type="button"
    onClick={() => onChange(!enabled)}
    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors focus:outline-none flex-shrink-0 cursor-pointer ${
      enabled ? 'bg-[#3B50DF]' : 'bg-slate-200'
    }`}
  >
    <span
      className={`inline-block h-4 w-4 transform rounded-full bg-white shadow-xs transition-transform ${
        enabled ? 'translate-x-6' : 'translate-x-1'
      }`}
    />
  </button>
);

const SettingRow = ({ label, description, children }) => (
  <div className="flex items-center justify-between py-4 border-b border-slate-100 last:border-0 gap-6">
    <div className="flex-1 min-w-0">
      <p className="text-xs font-bold text-slate-800">{label}</p>
      {description && <p className="text-[11px] text-slate-400 mt-0.5 leading-relaxed font-normal">{description}</p>}
    </div>
    <div className="flex-shrink-0">{children}</div>
  </div>
);

const SectionCard = ({ title, subtitle, icon: Icon, children }) => (
  <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
    <div className="px-6 py-3.5 border-b border-slate-100 flex items-center gap-2.5 bg-slate-50/70">
      <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
        <Icon size={16} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-900">{title}</p>
        {subtitle && <p className="text-[11px] text-slate-400 font-normal">{subtitle}</p>}
      </div>
    </div>
    <div className="p-6 bg-white">{children}</div>
  </div>
);

const InputField = ({ label, value, onChange, type = 'text', placeholder, readOnly, icon: Icon }) => (
  <div>
    <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
    <div className="relative">
      {Icon && <Icon className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />}
      <input
        type={type}
        value={value}
        onChange={onChange}
        readOnly={readOnly}
        placeholder={placeholder}
        className={`w-full ${Icon ? 'pl-10' : 'px-3.5'} py-2.5 text-xs font-medium border rounded-xl focus:outline-none transition-all ${
          readOnly
            ? 'bg-slate-50 text-slate-400 cursor-not-allowed border-slate-200'
            : 'bg-white border-slate-300 text-slate-800 focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF]'
        }`}
      />
    </div>
  </div>
);

const Banner = ({ type, message }) => (
  <div className={`flex items-start gap-2.5 text-xs px-3.5 py-2.5 rounded-xl border font-medium ${
    type === 'error'   ? 'bg-rose-50 border-rose-200 text-rose-700' :
    type === 'success' ? 'bg-emerald-50 border-emerald-200 text-emerald-700' :
                         'bg-amber-50 border-amber-200 text-amber-700'
  }`}>
    {type === 'error'   && <AlertCircle size={15} className="flex-shrink-0 mt-0.5" />}
    {type === 'success' && <CheckCircle size={15} className="flex-shrink-0 mt-0.5" />}
    {type === 'warning' && <AlertCircle size={15} className="flex-shrink-0 mt-0.5 text-amber-600" />}
    <span>{message}</span>
  </div>
);

/* ══════════════════════════════════════════
   MAIN COMPONENT
══════════════════════════════════════════ */
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

  /* ── Load trusted devices ── */
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

  /* ── Log out one remembered device ── */
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

  /* ── Log out every remembered device ── */
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

  const showToast = (text, type = 'success') => {
    clearTimeout(toastTimer.current);
    setToast({ text, type });
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

  /* ── Update display name + email ── */
  const handleUpdateProfile = async () => {
    const user = auth?.currentUser;
    if (!user) return;
    const nextName  = account.adminName.trim();
    const nextEmail = account.adminEmail.trim().toLowerCase();
    if (!nextName)  { showToast('Please provide a name.', 'error'); return; }
    if (!nextEmail) { showToast('Please provide a valid email.', 'error'); return; }

    setProfileSaving(true);
    try {
      if (user.displayName !== nextName) {
        await updateProfile(user, { displayName: nextName });
      }
      if (user.email !== nextEmail) {
        await updateEmail(user, nextEmail);
      }
      await setDoc(doc(db, 'settings', 'config'), {
        account: { adminName: nextName, adminEmail: nextEmail, updatedAt: Date.now() },
      }, { merge: true });
      showToast('Profile updated successfully.');
    } catch (err) {
      console.error('Profile update failed:', err);
      if (err.code === 'auth/requires-recent-login') {
        showToast('Please re-login before updating your email.', 'error');
      } else {
        showToast(err.message || 'Failed to update profile.', 'error');
      }
    } finally {
      setProfileSaving(false);
    }
  };

  /* ── Change password ── */
  const handleChangePassword = async () => {
    setPwError('');
    setPwSuccess('');
    if (!pwForm.current) { setPwError('Enter current password'); return; }
    if (pwForm.next.length < 8) { setPwError('New password must be at least 8 characters'); return; }
    if (pwForm.next !== pwForm.confirm) { setPwError('Passwords do not match'); return; }

    setPwSaving(true);
    try {
      const user = auth.currentUser;
      const cred = EmailAuthProvider.credential(user.email, pwForm.current);
      await reauthenticateWithCredential(user, cred);
      await updatePassword(user, pwForm.next);
      setPwSuccess('Password updated successfully.');
      setPwForm({ current: '', next: '', confirm: '' });
      await handleLogoutAllDevices();
    } catch (err) {
      console.error('Password change error:', err);
      if (err.code === 'auth/wrong-password' || err.code === 'auth/invalid-credential') {
        setPwError('Current password is incorrect.');
      } else {
        setPwError('Failed to update password. Please verify current password.');
      }
    } finally {
      setPwSaving(false);
    }
  };

  /* ── Render Sections ── */

  const renderClinic = () => (
    <div className="space-y-6">
      <SectionCard title="Clinic Information" subtitle="Official details and public contact info for K&A Clinic" icon={Building2}>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          <div className="md:col-span-2">
            <InputField label="CLINIC NAME" value={clinic.name}
              onChange={e => setClinic(p => ({ ...p, name: e.target.value }))} placeholder="Clinic name" icon={Building2} />
          </div>
          <InputField label="TAGLINE" value={clinic.tagline}
            onChange={e => setClinic(p => ({ ...p, tagline: e.target.value }))} placeholder="Short description" />
          <InputField label="WEBSITE" value={clinic.website}
            onChange={e => setClinic(p => ({ ...p, website: e.target.value }))} placeholder="www.example.com" icon={Globe} />
          <div className="md:col-span-2">
            <InputField label="CLINICAL ADDRESS" value={clinic.address}
              onChange={e => setClinic(p => ({ ...p, address: e.target.value }))} placeholder="Full address" />
          </div>
          <InputField label="PHONE NUMBER" value={clinic.phone}
            onChange={e => setClinic(p => ({ ...p, phone: e.target.value }))} placeholder="+63 912 345 6789" icon={Phone} />
          <InputField label="EMAIL ADDRESS" value={clinic.email}
            onChange={e => setClinic(p => ({ ...p, email: e.target.value }))} placeholder="info@clinic.ph" icon={Mail} />
        </div>
      </SectionCard>

      <SectionCard title="Operating Hours" subtitle="Set your clinic's daily opening and closing hours" icon={Clock}>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-5">
          <InputField label="OPENING TIME" type="time" value={clinic.openTime}
            onChange={e => setClinic(p => ({ ...p, openTime: e.target.value }))} icon={Clock} />
          <InputField label="CLOSING TIME" type="time" value={clinic.closeTime}
            onChange={e => setClinic(p => ({ ...p, closeTime: e.target.value }))} icon={Clock} />
        </div>
        <div className="mt-4">
          <p className="text-xs text-slate-500 bg-indigo-50/60 rounded-xl p-3 border border-indigo-100 flex items-center gap-2">
            <Clock size={14} className="text-[#3B50DF] shrink-0" />
            <span>These operating hours are automatically applied across patient appointment booking slots.</span>
          </p>
        </div>
      </SectionCard>
    </div>
  );

  const renderAccount = () => (
    <div className="space-y-6">
      {/* Admin Profile */}
      <SectionCard title="Administrator Profile" subtitle="Firebase authentication credentials and account role" icon={User}>
        <div className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
            <InputField label="FULL NAME" value={account.adminName}
              onChange={e => setAccount(p => ({ ...p, adminName: e.target.value }))} placeholder="Your name" icon={User} />
            <InputField label="ASSIGNED ROLE" value={account.role} readOnly icon={ShieldCheck} />
            <div className="md:col-span-2">
              <InputField label="EMAIL ADDRESS" value={account.adminEmail}
                onChange={e => setAccount(p => ({ ...p, adminEmail: e.target.value }))} placeholder="admin@clinic.ph" icon={Mail} />
            </div>
          </div>
          <p className="text-[11px] text-slate-400 font-normal">
            Modifying your email address updates your primary login credentials across the administrative portal.
          </p>
          <div className="flex justify-end pt-2">
            <button
              onClick={handleUpdateProfile}
              disabled={profileSaving}
              className="px-4 py-2 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {profileSaving ? <span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> : <User size={13} />}
              <span>Update Profile</span>
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Change Password */}
      <SectionCard title="Change Security Password" subtitle="Update authentication password for this administrator account" icon={KeyRound}>
        <div className="space-y-4">
          {pwError   && <Banner type="error"   message={pwError}   />}
          {pwSuccess && <Banner type="success" message={pwSuccess} />}

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            {[
              { key: 'current', label: 'CURRENT PASSWORD' },
              { key: 'next',    label: 'NEW PASSWORD (MIN 8 CHARS)' },
              { key: 'confirm', label: 'CONFIRM NEW PASSWORD' },
            ].map(({ key, label }) => (
              <div key={key}>
                <label className="block text-xs font-semibold text-slate-500 mb-1.5">{label}</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2 pointer-events-none" />
                  <input
                    type="password"
                    value={pwForm[key]}
                    onChange={e => setPwForm(p => ({ ...p, [key]: e.target.value }))}
                    placeholder="••••••••"
                    className="w-full pl-10 pr-3.5 py-2.5 text-xs font-medium border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF] transition-all"
                  />
                </div>
              </div>
            ))}
          </div>

          <div className="flex justify-end pt-2">
            <button
              onClick={handleChangePassword}
              disabled={pwSaving}
              className="px-4 py-2 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-xs font-bold rounded-xl transition-all flex items-center gap-2 disabled:opacity-50 cursor-pointer shadow-xs"
            >
              {pwSaving
                ? <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Updating…</>
                : <><Lock size={13} /> Update Password</>}
            </button>
          </div>
        </div>
      </SectionCard>

      {/* Device Management Table Card */}
      <div className="border border-slate-200/80 rounded-2xl overflow-hidden bg-white shadow-2xs">
        <div className="px-6 py-4 border-b border-slate-100 flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-slate-50/70">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-indigo-50 text-[#3B50DF] border border-indigo-100/90 flex items-center justify-center flex-shrink-0 shadow-2xs">
              <Monitor size={16} />
            </div>
            <div>
              <p className="text-xs font-bold text-slate-900">Active &amp; Trusted Devices</p>
              <p className="text-[11px] text-slate-400 font-normal">Devices remembered to skip two-step verification</p>
            </div>
          </div>
          {devices.length > 0 && (
            <button
              onClick={handleLogoutAllDevices}
              disabled={loggingOutAll}
              className="px-3 py-1.5 text-xs font-bold text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200 rounded-xl transition-colors disabled:opacity-50 cursor-pointer shadow-2xs flex items-center gap-1.5"
            >
              <Trash2 size={13} />
              {loggingOutAll ? 'Signing out all…' : 'Sign Out All Devices'}
            </button>
          )}
        </div>

        {/* Big Structured Table */}
        <div className="overflow-x-auto">
          {devicesLoading ? (
            <div className="py-12 text-center text-xs font-semibold text-slate-400">Loading trusted sessions…</div>
          ) : devices.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">
              No remembered devices found. Checking "Remember me" at login registers your device here.
            </div>
          ) : (
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Device &amp; Browser</th>
                  <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Session State</th>
                  <th className="px-6 py-3.5 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Last Activity</th>
                  <th className="px-6 py-3.5 text-right text-[11px] font-extrabold text-slate-500 uppercase tracking-wider">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {devices.map(d => (
                  <tr key={d.fingerprint} className="hover:bg-slate-50/80 transition-colors">
                    <td className="px-6 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className="w-9 h-9 rounded-xl bg-slate-100 border border-slate-200 text-slate-600 flex items-center justify-center shrink-0">
                          {d.deviceName?.toLowerCase().includes('phone') || d.deviceName?.toLowerCase().includes('mobile') ? (
                            <Smartphone size={16} />
                          ) : d.deviceName?.toLowerCase().includes('mac') || d.deviceName?.toLowerCase().includes('laptop') ? (
                            <Laptop size={16} />
                          ) : (
                            <Monitor size={16} />
                          )}
                        </div>
                        <div>
                          <span className="text-xs font-bold text-slate-900 block">{d.deviceName || 'Web Browser Session'}</span>
                          <span className="text-[10px] text-slate-400 font-mono">{d.fingerprint?.slice(0, 16)}…</span>
                        </div>
                      </div>
                    </td>

                    <td className="px-6 py-3.5">
                      {d.isCurrentDevice ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Check size={11} strokeWidth={2.5} /> Current Session
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-bold bg-slate-100 text-slate-600 border border-slate-200">
                          Trusted Device
                        </span>
                      )}
                    </td>

                    <td className="px-6 py-3.5 text-xs font-semibold text-slate-500">
                      {formatDeviceTime(d.lastActiveAt)}
                    </td>

                    <td className="px-6 py-3.5 text-right">
                      <button
                        onClick={() => handleLogoutDevice(d.fingerprint, d.isCurrentDevice)}
                        disabled={deviceActionId === d.fingerprint}
                        className={`px-3 py-1.5 text-xs font-bold rounded-lg transition-colors inline-flex items-center gap-1.5 disabled:opacity-50 cursor-pointer ${
                          confirmFingerprint === d.fingerprint
                            ? 'bg-rose-600 text-white hover:bg-rose-700'
                            : 'text-rose-600 bg-rose-50 hover:bg-rose-100 border border-rose-200'
                        }`}
                      >
                        {deviceActionId === d.fingerprint ? (
                          <span className="w-3 h-3 border-2 border-rose-300 border-t-rose-600 rounded-full animate-spin" />
                        ) : (
                          <LogOut size={12} />
                        )}
                        <span>{confirmFingerprint === d.fingerprint ? 'Confirm Sign Out?' : 'Sign Out'}</span>
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );

  const renderNotifications = () => (
    <div className="space-y-6">
      <SectionCard title="Appointment Alerts" subtitle="Configure automated notifications for patient bookings" icon={Bell}>
        <div className="py-1">
          <SettingRow label="New Appointment Bookings" description="Receive instant notifications whenever a patient schedules a visit">
            <Toggle enabled={notif.newAppointment} onChange={v => setNotif(p => ({ ...p, newAppointment: v }))} />
          </SettingRow>
          <SettingRow label="Cancelled Appointments" description="Notify clinic desk when an appointment is cancelled or rescheduled">
            <Toggle enabled={notif.cancelledApt} onChange={v => setNotif(p => ({ ...p, cancelledApt: v }))} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Inventory & Stock Alerts" subtitle="Proactive monitoring for vaccine quantities and expiration dates" icon={Stethoscope}>
        <div className="py-1">
          <SettingRow label="Low Stock Warnings" description="Alert when biological vials or consumables fall below reorder thresholds">
            <Toggle enabled={notif.lowStock} onChange={v => setNotif(p => ({ ...p, lowStock: v }))} />
          </SettingRow>
          <SettingRow label="Expiring Stock Warnings" description="Receive alerts for vaccines and medicines reaching expiry within 30 days">
            <Toggle enabled={notif.expiringStock} onChange={v => setNotif(p => ({ ...p, expiringStock: v }))} />
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="Messaging & Delivery Preferences" subtitle="Channels and automated summaries for staff communication" icon={Mail}>
        <div className="py-1">
          <SettingRow label="Patient Messages" description="Notify staff when an inquiry or follow-up note is received">
            <Toggle enabled={notif.newMessage} onChange={v => setNotif(p => ({ ...p, newMessage: v }))} />
          </SettingRow>
          <SettingRow label="Daily Clinic Summary" description="Send an end-of-day digest covering completed doses and appointments">
            <Toggle enabled={notif.dailySummary} onChange={v => setNotif(p => ({ ...p, dailySummary: v }))} />
          </SettingRow>
          <SettingRow label="Email Notifications" description="Forward critical security and operational notices to administrator email">
            <Toggle enabled={notif.emailAlerts} onChange={v => setNotif(p => ({ ...p, emailAlerts: v }))} />
          </SettingRow>
        </div>
      </SectionCard>
    </div>
  );

  const renderSystem = () => (
    <div className="space-y-6">
      <SectionCard title="Data & Backup Configuration" subtitle="Cloud persistence, analytics tracking, and archive schedule" icon={Shield}>
        <div className="py-1">
          <SettingRow label="Anonymous System Analytics" description="Help improve clinical performance via aggregated system telemetry">
            <Toggle enabled={system.analyticsEnabled} onChange={v => setSystem(p => ({ ...p, analyticsEnabled: v }))} />
          </SettingRow>
          <SettingRow label="Automated Database Backup" description="Frequency of cloud snapshots and clinical registry archives">
            <select
              value={system.backupFrequency}
              onChange={e => setSystem(p => ({ ...p, backupFrequency: e.target.value }))}
              className="px-3 py-1.5 text-xs font-semibold border border-slate-300 rounded-xl bg-white text-slate-800 focus:outline-none focus:border-[#3B50DF] cursor-pointer"
            >
              <option value="hourly">Hourly Snapshots</option>
              <option value="daily">Daily Backup (Recommended)</option>
              <option value="weekly">Weekly Archive</option>
              <option value="off">Manual Only</option>
            </select>
          </SettingRow>
        </div>
      </SectionCard>

      <SectionCard title="System Availability & Maintenance" subtitle="Portal operational switch and maintenance mode override" icon={Lock}>
        <div className="py-1">
          <SettingRow
            label="Maintenance Mode"
            description="Temporarily halts public appointment booking while maintenance is active"
          >
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
          <div className="mt-4">
            <Banner type="warning" message="Maintenance mode is active. Patients cannot access appointment scheduling until disabled." />
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
    <div className="h-full overflow-y-auto bg-[#F0F4FA]">
      <div className="px-7 py-6 max-w-screen-2xl mx-auto space-y-6">
        
        {/* ── Clean Page Title Header ── */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-extrabold tracking-tight text-slate-900">Settings &amp; Configuration</h1>
            <p className="text-sm text-slate-500 mt-1">Manage clinic profile, security preferences, notification alerts, and system parameters.</p>
          </div>
          {activeSection !== 'account' && (
            <button
              onClick={handleSave}
              disabled={saving}
              className="flex items-center justify-center gap-2 px-5 py-2.5 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-xs font-bold rounded-xl shadow-xs transition-all disabled:opacity-50 cursor-pointer shrink-0"
            >
              {saving ? (
                <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving Changes…</>
              ) : (
                <><Save size={14} /> Save All Changes</>
              )}
            </button>
          )}
        </div>

        {/* ── Main Tabbed Container Card ── */}
        <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
          
          {/* Header Navigation Tabs Bar */}
          <div className="px-6 py-3.5 border-b border-slate-200 bg-slate-50/60 flex items-center justify-between overflow-x-auto">
            <div className="flex items-center gap-1.5 bg-slate-200/60 p-1 rounded-xl">
              {SECTIONS.map(s => {
                const Icon   = s.icon;
                const active = activeSection === s.id;
                return (
                  <button
                    key={s.id}
                    onClick={() => setActiveSection(s.id)}
                    className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                      active
                        ? 'bg-white text-slate-900 shadow-xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Icon size={14} className={active ? 'text-[#3B50DF]' : 'text-slate-400'} />
                    <span>{s.label}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="p-6">
            <div key={activeSection} className="animate-settings-fade">
              {SECTION_RENDERERS[activeSection]?.()}
            </div>

            {activeSection !== 'account' && (
              <div className="mt-8 flex justify-end border-t border-slate-100 pt-5">
                <button
                  onClick={handleSave}
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2.5 bg-[#3B50DF] hover:bg-[#2F40B5] text-white text-xs font-bold rounded-xl transition-all disabled:opacity-50 cursor-pointer shadow-xs"
                >
                  {saving ? (
                    <><span className="w-3.5 h-3.5 border-2 border-white/40 border-t-white rounded-full animate-spin" /> Saving Changes…</>
                  ) : (
                    <><Save size={14} /> Save All Changes</>
                  )}
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {toast && <Toast text={toast.text} type={toast.type} onClose={() => setToast(null)} />}

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