// app/(tabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { isPreview } from '../../utils/preview';
import { resetTo } from '../../utils/navigation';
import { doc, onSnapshot } from 'firebase/firestore';
import { useCallback, useEffect, useState } from 'react';
import { useFocusedBack } from '../../utils/useFocusedBack';
import {
  AppState,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from 'react-native';
import Tap from '../../components/Tap';
import { cacheKeys, peekCache, writeCache } from '../../utils/localCache';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db, forgetTrustedDevice, signOut, API_BASE_URL } from '../../config/backend';
import { setKeepSignedIn } from '../../config/appPrefs';
import { clinicToday, doseState, exposureCategory, formatDoseDate, isPepService, serviceCopy } from '../../utils/patientRecord';
import {
  clearThisDeviceSession,
  revokeAllOtherSessions,
  revokeDeviceSession,
  watchDeviceSessions,
  type DeviceSession,
} from '../../config/deviceSessions';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../utils/scale';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
import {
  ensureNotificationPermission,
  hasNotificationPermission,
  isNotificationPermissionBlocked,
  isPushEnabledByUser,
  openNotificationSettings,
  presentLocalNotification,
  registerForPushNotifications,
  setPushEnabledByUser,
  unregisterPushNotifications,
} from '../../config/notifications';

// "3 hours ago" style stamp for the device list — absolute dates read as noise
// for something the patient checks to spot an unfamiliar session.
function relativeTime(ts?: number): string {
  if (!ts) return 'Unknown';
  const mins = Math.floor((Date.now() - ts) / 60000);
  if (mins < 1) return 'Active now';
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs} hour${hrs === 1 ? '' : 's'} ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days} day${days === 1 ? '' : 's'} ago`;
  return new Date(ts).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

const deviceIcon = (platform?: string) =>
  platform === 'ios' ? 'phone-portrait-outline'
  : platform === 'android' ? 'phone-portrait-outline'
  : platform === 'web' ? 'desktop-outline'
  : 'help-circle-outline';

const MEDICAL_RED = '#1E3A8A';
const SOFT_GRAY_BG = '#F4F6FA';

const C = {
  red: MEDICAL_RED,
  redLight: '#EFF6FF',
  charcoal: '#1E293B',
  slate: '#475569',
  muted: '#94A3B8',
  border: '#E8EDF5',
  white: '#FFFFFF',
  green: '#10B981',
  greenLight: '#ECFDF5',
  bg: SOFT_GRAY_BG,
};

type ViewState = 'main' | 'personal' | 'privacy' | 'devices';

// ── Fallback shape before the real record loads (or for guest sessions) ──────
const EMPTY_PERSONAL_DATA = {
  fullName: '',
  age: '',
  dob: '',
  gender: '',
  religion: '',
  education: '',
  address: '',
  occupation: '',
  contact: '',
  height: '',
  weight: '',
  bp: '',
  emergencyName: '',
  emergencyRel: '',
  emergencyPhone: '',
  emergencyAltPhone: '',
};

const PREVIEW_PERSONAL_DATA = {
  fullName: 'Maria L. Santos',
  age: '28',
  dob: '1998-04-12',
  gender: 'Female',
  religion: 'Roman Catholic',
  education: 'College Graduate',
  address: 'Zone 4, Poblacion, Libon, Albay',
  occupation: 'Teacher',
  contact: '0917 888 9922',
  height: '162 cm',
  weight: '54 kg',
  bp: '120/80 mmHg',
  emergencyName: 'Roberto Santos',
  emergencyRel: 'Spouse',
  emergencyPhone: '0918 777 6655',
  emergencyAltPhone: '0922 333 4411',
};

const PREVIEW_DEVICES: DeviceSession[] = [
  {
    id: 'dev-1',
    uid: 'preview',
    osVersion: '',
    createdAt: 0,
    deviceId: 'dev-curr',
    platform: 'android',
    label: 'Samsung Galaxy S23 (This Phone)',
    lastActiveAt: Date.now(),
  },
  {
    id: 'dev-2',
    uid: 'preview',
    osVersion: '',
    createdAt: 0,
    deviceId: 'dev-prev',
    platform: 'ios',
    label: 'Apple iPhone 14 Pro',
    lastActiveAt: Date.now() - 7200000,
  },
  {
    id: 'dev-3',
    uid: 'preview',
    osVersion: '',
    createdAt: 0,
    deviceId: 'dev-web',
    platform: 'web',
    label: 'Chrome Browser (Windows 11)',
    lastActiveAt: Date.now() - 86400000,
  },
];

export default function ProfileScreen() {
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const params = useLocalSearchParams();
  const { user, mrn, isGuest, deviceId } = usePatientAuth();

  const [currentView, setCurrentView] = useState<ViewState>(() => {
    if (params.subview === 'personal') return 'personal';
    if (params.subview === 'devices') return 'devices';
    return 'main';
  });
  const [devices, setDevices] = useState<DeviceSession[]>(() => (isPreview(params.preview) ? PREVIEW_DEVICES : []));
  const [devicesLoading, setDevicesLoading] = useState(!isPreview(params.preview));
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const closeAccountSection = useCallback(() => {
    setCurrentView('main');
    setIsEditingPersonal(false);
  }, []);
  useFocusedBack(useCallback(() => {
    if (currentView === 'main') return false;
    closeAccountSection();
    return true;
  }, [currentView, closeAccountSection]));
  const [personalData, setPersonalData] = useState(() => (isPreview(params.preview) ? PREVIEW_PERSONAL_DATA : EMPTY_PERSONAL_DATA));
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  // Null until the patient actually has a picture. The placeholder used to be
  // a remote initials service, which needed the network to render and turned a
  // nameless account into a meaningless "PA" monogram.
  const [profileImage, setProfileImage] = useState<string | null>(null);

  // ── Custom Alert Modal State ──────────────────────────────────────────────
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<CustomAlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };

  // Admin Dashboard's vaccinations/{mrn} doc is the source of truth for this
  // patient's demographic + PEP record — see ka-clinic-admin/src/features/patients/PatientsPage.jsx vaxDoc.
  // Last-known copy first (utils/localCache), so the profile fields render
  // filled on the first frame; the listener below keeps it current.
  const [patientRecord, setPatientRecord] = useState<any | null>(() => (mrn ? peekCache<any>(cacheKeys.vaccination(mrn)) ?? null : null));
  const [recordError, setRecordError] = useState('');

  useEffect(() => {
    if (!mrn || isGuest || user?.isAnonymous) { setPatientRecord(null); return; }
    return onSnapshot(doc(db, 'vaccinations', mrn), (snap) => {
      setRecordError('');
      if (snap.exists()) { setPatientRecord(snap.data()); writeCache(cacheKeys.vaccination(mrn), snap.data()); }
    }, (err) => {
      console.error('Vaccination record listener error:', err);
      setRecordError(err?.code === 'permission-denied'
        ? 'You do not have permission to view this record.'
        : 'Could not load your patient record.');
    });
  }, [mrn, isGuest, user?.isAnonymous]);

  // Restore persistent avatar image, personal data, and push notification preference
  useEffect(() => {
    if (isGuest || user?.isAnonymous || !user) {
      setProfileImage(null);
      setPersonalData({
        fullName: 'Guest',
        age: '—',
        dob: '—',
        gender: '—',
        religion: '',
        education: '',
        address: '',
        occupation: '',
        contact: '',
        height: '',
        weight: '',
        bp: '',
        emergencyName: '',
        emergencyRel: '',
        emergencyPhone: '',
        emergencyAltPhone: '',
      });
      return;
    }
    const uid = user.uid;
    AsyncStorage.getItem(`kna:avatar:${uid}`).then(val => {
      if (val) {
        setProfileImage(val);
      }
    }).catch(err => console.warn('Avatar restore error:', err));

    AsyncStorage.getItem(`kna:personalData:${uid}`).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          setPersonalData(prev => ({ ...prev, ...parsed }));
        } catch {}
      }
    }).catch(() => {});

  }, [user?.uid, isGuest, user?.isAnonymous]);

  // The switch shows what will actually happen: ON only when the patient wants
  // push AND the phone allows it. Re-checked on returning to the app, since
  // the permission can be changed in phone Settings while the app is away.
  useEffect(() => {
    if (!user || isGuest || user.isAnonymous) { setNotificationsEnabled(false); return; }
    const sync = async () => {
      const [wanted, allowed] = await Promise.all([isPushEnabledByUser(user.uid), hasNotificationPermission()]);
      setNotificationsEnabled(wanted && allowed);
    };
    sync();
    const sub = AppState.addEventListener('change', st => { if (st === 'active') sync(); });
    return () => sub.remove();
  }, [user?.uid, isGuest, user?.isAnonymous]);

  // The clinic record wins for anything the clinic maintains. This used to
  // merge as record-or-cached with the cached value winning, and because that
  // cache had already been seeded from AsyncStorage, a stale local copy beat a
  // newer admin correction — the listener was live but its result was dropped.
  // Local storage is now only the fallback for fields the record leaves empty.
  useEffect(() => {
    if (!patientRecord || isGuest || user?.isAnonymous) return;
    const fromRecord = (recordValue: any, cached: any) =>
      recordValue !== undefined && recordValue !== null && recordValue !== '' ? recordValue : cached;
    setPersonalData(prev => ({
      ...prev,
      fullName: fromRecord(patientRecord.name, prev.fullName),
      age: fromRecord(patientRecord.age, prev.age),
      gender: fromRecord(patientRecord.sex, prev.gender),
      address: fromRecord(patientRecord.address, prev.address),
      contact: fromRecord(patientRecord.contact, prev.contact),
      religion: patientRecord.religion || prev.religion,
      education: patientRecord.education || prev.education,
      occupation: patientRecord.occupation || prev.occupation,
      height: fromRecord(patientRecord.height, prev.height),
      weight: fromRecord(patientRecord.weight, prev.weight),
      bp: fromRecord(patientRecord.bloodPressure ?? patientRecord.bp, prev.bp),
      emergencyName: patientRecord.emergencyName || prev.emergencyName,
      emergencyRel: patientRecord.emergencyRel || prev.emergencyRel,
      emergencyPhone: patientRecord.emergencyPhone || prev.emergencyPhone,
      emergencyAltPhone: patientRecord.emergencyAltPhone || prev.emergencyAltPhone,
      dob: patientRecord.dob || prev.dob,
    }));
    if (patientRecord.avatarUrl) {
      setProfileImage(patientRecord.avatarUrl);
    }
  }, [patientRecord, isGuest, user?.isAnonymous]);

  // Clinic-synced photo (patientAvatars/{mrn}) wins over the local cache so a
  // photo set on another device shows here too.
  useEffect(() => {
    if (!mrn || isGuest || user?.isAnonymous) return;
    return onSnapshot(doc(db, 'patientAvatars', mrn), snap => {
      const url = snap.data()?.dataUrl;
      if (url) setProfileImage(url);
    }, () => {});
  }, [mrn, isGuest, user?.isAnonymous]);

  const handleSavePersonalData = async () => {
    if (isGuest || user?.isAnonymous) {
      setIsEditingPersonal(false);
      showAlert({
        type: 'guest',
        title: 'Guest Mode',
        message: 'Guest accounts cannot edit personal details. Please sign in with your Medical Record Number (MRN) or create an account to update your profile.',
        primaryButtonText: 'Sign In / Register',
        onPrimaryPress: () => {
          hideAlert();
          router.push('/auth/login');
        },
        secondaryButtonText: 'Dismiss',
        onSecondaryPress: hideAlert,
      });
      return;
    }
    setIsEditingPersonal(false);
    const uid = user?.uid || 'guest';
    await AsyncStorage.setItem(`kna:personalData:${uid}`, JSON.stringify(personalData)).catch(() => {});

    // Push the self-service fields to the clinic record so the admin portal
    // sees the same details. Name / age / gender are clinic-managed and are
    // not sent (the inputs for them are read-only).
    let synced = false;
    let syncError = '';
    if (mrn) {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const resp = await fetch(`${API_BASE_URL}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({
            action: 'update-profile',
            mrn,
            fields: {
              contact: personalData.contact,
              address: personalData.address,
              religion: personalData.religion,
              education: personalData.education,
              occupation: personalData.occupation,
              emergencyName: personalData.emergencyName,
              emergencyRel: personalData.emergencyRel,
              emergencyPhone: personalData.emergencyPhone,
              emergencyAltPhone: personalData.emergencyAltPhone,
            },
          }),
        });
        const json = await resp.json().catch(() => null);
        if (json?.success) synced = true;
        else syncError = json?.error || 'Could not sync to your clinic record.';
      } catch {
        syncError = 'Could not sync to your clinic record.';
      }
    }

    showAlert({
      type: synced || !mrn ? 'success' : 'warning',
      title: 'Personal Info Saved',
      message: synced
        ? 'Your details have been updated and shared with the clinic.'
        : syncError
          ? `Saved on this device, but: ${syncError}`
          : 'Your personal details have been updated successfully.',
      primaryButtonText: 'OK',
      onPrimaryPress: hideAlert,
    });
  };

  const todayISO = clinicToday();
  const rawDoses: any[] = (!isGuest && !user?.isAnonymous && Array.isArray(patientRecord?.doses)) ? patientRecord.doses : [];
  const doneDoseCount = rawDoses.filter(d => doseState(d, todayISO) === 'done').length;
  const nextPendingDose = rawDoses.find(d => doseState(d, todayISO) !== 'done');

  // Service stat on profile card:
  // Patient with a new active service: show the new one.
  // Patient with only completed services: show the most recent one.
  // No case yet: show "—". Guest mode: show "—".
  let serviceLabel = '—';
  if (!isGuest && !user?.isAnonymous) {
    if (patientRecord?.service) {
      serviceLabel = serviceCopy(patientRecord.service).short;
    } else if (Array.isArray(patientRecord?.caseHistory) && patientRecord.caseHistory.length > 0) {
      const mostRecent = patientRecord.caseHistory[patientRecord.caseHistory.length - 1];
      if (mostRecent?.service) {
        serviceLabel = serviceCopy(mostRecent.service).short;
      }
    }
  }

  const dosesLabel = (!isGuest && !user?.isAnonymous && rawDoses.length > 0) ? `${doneDoseCount}/${rawDoses.length}` : '—';
  const nextDoseLabel = (!isGuest && !user?.isAnonymous)
    ? (nextPendingDose ? formatDoseDate(nextPendingDose.date) : (rawDoses.length > 0 ? 'Done' : '—'))
    : '—';

  // Live device list. Guests have no account to attach sessions to.
  useEffect(() => {
    if (isPreview(params.preview)) {
      setDevices(PREVIEW_DEVICES);
      setDevicesLoading(false);
      return;
    }
    if (!user || user.isAnonymous) { setDevices([]); setDevicesLoading(false); return; }
    setDevicesLoading(true);
    const unsub = watchDeviceSessions(
      user.uid,
      rows => { setDevices(rows); setDevicesLoading(false); },
      () => setDevicesLoading(false),
      deviceId,
    );
    return unsub;
  }, [user?.uid, deviceId]);

  const confirmLogoutDevice = (target: DeviceSession) => {
    const isThis = target.deviceId === deviceId;
    showAlert({
      type: 'signout',
      title: `Sign Out ${isThis ? 'This Device' : target.label}?`,
      message: `Are you sure you want to sign out from ${isThis ? 'this device' : target.label}? This session will be disconnected.`,
      primaryButtonText: 'Sign Out',
      isDestructive: true,
      onPrimaryPress: async () => {
        hideAlert();
        if (isThis) {
          try {
            if (user?.uid) await clearThisDeviceSession(user.uid);
            await unregisterPushNotifications();
            await forgetTrustedDevice();
            await setKeepSignedIn(false);
            await AsyncStorage.removeItem('kna:avatar:global').catch(() => {});
            await AsyncStorage.removeItem('kna:avatar:guest').catch(() => {});
            await AsyncStorage.removeItem('kna:personalData:guest').catch(() => {});
            setProfileImage(null);
            await signOut(auth);
          } catch (e) {
            console.log(e);
          }
          resetTo(router, '/auth/login');
        } else {
          try {
            if (user?.uid) {
              const ids = target.associatedDeviceIds?.length ? target.associatedDeviceIds : [target.deviceId];
              await Promise.all(ids.map(id => revokeDeviceSession(user.uid, id)));
            }
          } catch {
            showAlert({
              type: 'error',
              title: 'Could Not Sign Out Device',
              message: 'Please check your connection and try again.',
              primaryButtonText: 'OK',
              onPrimaryPress: hideAlert,
            });
          }
        }
      },
      secondaryButtonText: 'Cancel',
      onSecondaryPress: hideAlert,
    });
  };

  const handleRevokeAllOthers = () => {
    const others = devices.filter(d => d.deviceId !== deviceId).length;
    if (others === 0) return;
    showAlert({
      type: 'signout',
      title: 'Sign out all devices?',
      message: `All devices, including this one, will be signed out. Sign in again to continue.`,
      primaryButtonText: 'Sign Out All',
      isDestructive: true,
      onPrimaryPress: async () => {
        hideAlert();
        try {
          if (user?.uid && deviceId) await revokeAllOtherSessions(user.uid, deviceId);
        } catch {
          showAlert({
            type: 'error',
            title: 'Could Not Sign Out Devices',
            message: 'Please check your connection and try again.',
            primaryButtonText: 'OK',
            onPrimaryPress: hideAlert,
          });
        }
      },
      secondaryButtonText: 'Cancel',
      onSecondaryPress: hideAlert,
    });
  };

  const handleLogout = () => {
    showAlert({
      type: 'signout',
      title: 'Sign Out',
      message: 'Are you sure you want to sign out of your account?',
      primaryButtonText: 'Sign Out',
      isDestructive: true,
      onPrimaryPress: async () => {
        hideAlert();
        try {
          if (user?.uid) await clearThisDeviceSession(user.uid);
          // Before signOut: needs the session, and stops this patient's
          // reminders from reaching whoever uses the phone next.
          await unregisterPushNotifications();
          await forgetTrustedDevice();
          await setKeepSignedIn(false);
          await AsyncStorage.removeItem('kna:avatar:global').catch(() => {});
          await AsyncStorage.removeItem('kna:avatar:guest').catch(() => {});
          await AsyncStorage.removeItem('kna:personalData:guest').catch(() => {});
          setProfileImage(null);
          setPersonalData({
            fullName: 'Guest',
            age: '—',
            dob: '—',
            gender: '—',
            religion: '',
            education: '',
            address: '',
            occupation: '',
            contact: '',
            height: '',
            weight: '',
            bp: '',
            emergencyName: '',
            emergencyRel: '',
            emergencyPhone: '',
            emergencyAltPhone: '',
          });
          await signOut(auth);
        } catch (e) {
          console.log(e);
        }
        resetTo(router, '/auth/login');
      },
      secondaryButtonText: 'Cancel',
      onSecondaryPress: hideAlert,
    });
  };

  const handleAvatarPress = () => {
    if (isGuest || user?.isAnonymous) {
      showAlert({
        type: 'guest',
        title: 'Guest Mode',
        message: 'Sign in with your Medical Record Number (MRN) to customize your profile photo.',
        primaryButtonText: 'Sign In / Register',
        onPrimaryPress: () => {
          hideAlert();
          router.push('/auth/login');
        },
        secondaryButtonText: 'Dismiss',
        onSecondaryPress: hideAlert,
      });
      return;
    }
    // No photo yet: open the photo picker straight away. With a photo, offer
    // Change photo / Remove photo (same as the admin app).
    if (!profileImage) {
      pickImage(false);
      return;
    }
    showAlert({
      type: 'info',
      title: 'Profile photo',
      message: 'Change your profile photo or remove it.',
      primaryButtonText: 'Change photo',
      onPrimaryPress: () => {
        hideAlert();
        pickImage(false);
      },
      secondaryButtonText: 'Remove photo',
      secondaryDestructive: true,
      onSecondaryPress: () => {
        hideAlert();
        removePhoto();
      },
    });
  };

  // Clears the photo on this phone and on the clinic record, back to the
  // person icon.
  const removePhoto = async () => {
    const uid = user?.uid || 'guest';
    let serverError = '';
    if (mrn && !isGuest && !user?.isAnonymous) {
      try {
        const idToken = await auth.currentUser?.getIdToken();
        const resp = await fetch(`${API_BASE_URL}/api/notifications`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
          body: JSON.stringify({ action: 'remove-avatar', mrn }),
        });
        const json = await resp.json().catch(() => null);
        if (!json?.success) serverError = json?.error || 'Could not remove the photo from your clinic record.';
      } catch {
        serverError = 'Could not remove the photo from your clinic record.';
      }
    }
    if (serverError) {
      showAlert({ type: 'error', title: 'Photo not removed', message: serverError, primaryButtonText: 'OK', onPrimaryPress: hideAlert });
      return;
    }
    setProfileImage(null);
    await AsyncStorage.removeItem(`kna:avatar:${uid}`).catch(() => {});
    await AsyncStorage.removeItem('kna:avatar:global').catch(() => {});
  };

  const pickImage = async (useCamera = false) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        showAlert({
          type: 'warning',
          title: 'Permission Required',
          message: 'Please grant permission to update your profile photo.',
          primaryButtonText: 'OK',
          onPrimaryPress: hideAlert,
        });
        return;
      }

      // Low quality + base64 so the photo is small enough to store inline on
      // the clinic record (api/notifications set-avatar caps it at 600 KB).
      const pickerOpts = { allowsEditing: true, aspect: [1, 1] as [number, number], quality: 0.25, base64: true };
      const result = useCamera
        ? await ImagePicker.launchCameraAsync(pickerOpts)
        : await ImagePicker.launchImageLibraryAsync(pickerOpts);

      if (!result.canceled && result.assets[0]) {
        const asset = result.assets[0];
        const uri = asset.uri;
        setProfileImage(uri);
        const uid = user?.uid;
        if (uid && !isGuest && !user?.isAnonymous) {
          await AsyncStorage.setItem(`kna:avatar:${uid}`, uri).catch(() => {});
        }

        // Sync to the clinic record so the nurse/admin portal shows the same
        // photo. Guests have no record, so this is local-only for them.
        let synced = false;
        let syncError = '';
        if (mrn && asset.base64 && !isGuest && !user?.isAnonymous) {
          try {
            const idToken = await auth.currentUser?.getIdToken();
            const mime = asset.mimeType || 'image/jpeg';
            const resp = await fetch(`${API_BASE_URL}/api/notifications`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${idToken}` },
              body: JSON.stringify({ action: 'set-avatar', mrn, imageDataUrl: `data:${mime};base64,${asset.base64}` }),
            });
            const json = await resp.json().catch(() => null);
            if (json?.success) synced = true;
            else syncError = json?.error || 'Could not sync photo to your clinic record.';
          } catch (e) {
            syncError = 'Could not sync photo to your clinic record.';
          }
        }

        showAlert({
          type: synced || !mrn ? 'success' : 'warning',
          title: 'Profile Photo Saved',
          message: synced
            ? 'Your profile picture has been updated and will also appear on your clinic record.'
            : syncError
              ? `Saved on this device, but: ${syncError}`
              : 'Your profile picture has been updated and saved.',
          primaryButtonText: 'OK',
          onPrimaryPress: hideAlert,
        });
      }
    } catch (e) {
      console.warn('Profile image error:', e);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    if (isGuest || user?.isAnonymous) {
      showAlert({
        type: 'guest',
        title: 'Guest Mode',
        message: 'Push notifications are available for registered patients only. Please sign in or register to enable dose reminders and alerts.',
        primaryButtonText: 'Sign In / Register',
        onPrimaryPress: () => {
          hideAlert();
          router.push('/auth/login');
        },
        secondaryButtonText: 'Dismiss',
        onSecondaryPress: hideAlert,
      });
      return;
    }

    const uid = user?.uid;
    if (!uid) return;

    if (value) {
      const granted = await ensureNotificationPermission(true);
      if (!granted) {
        setNotificationsEnabled(false);
        // Once the patient has refused, Android/iOS stop showing the dialog;
        // only phone Settings can turn it back on, so offer to go there.
        const blocked = await isNotificationPermissionBlocked();
        showAlert({
          type: 'warning',
          title: 'Permission Required',
          message: blocked
            ? 'Notifications are turned off for K&A Clinic in your phone settings. Open Settings, allow notifications, then come back and turn this on.'
            : 'K&A Clinic needs your permission to send dose reminders and appointment updates.',
          primaryButtonText: blocked ? 'Open Settings' : 'OK',
          onPrimaryPress: () => { hideAlert(); if (blocked) openNotificationSettings(); },
          ...(blocked ? { secondaryButtonText: 'Not Now', onSecondaryPress: hideAlert } : null),
        });
        return;
      }

      setNotificationsEnabled(true);
      await setPushEnabledByUser(uid, true);

      // Register live device token with the clinic server
      registerForPushNotifications(mrn, true).catch(() => {});

      // Immediate visual & audible proof to device tray
      await presentLocalNotification(
        'Push Notifications Active',
        'You will now receive vaccine dose schedules, reminders, and clinic alerts on this phone.',
        { type: 'enabled-confirmation' },
      );

      showAlert({
        type: 'success',
        title: 'Push Notifications Active',
        message: 'Notifications enabled! A confirmation notification was just sent to your device tray.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } else {
      setNotificationsEnabled(false);
      await setPushEnabledByUser(uid, false);
      // Detach this phone on the server too — otherwise the clinic keeps
      // pushing and the "off" switch only hid local notifications.
      await unregisterPushNotifications();
      showAlert({
        type: 'info',
        title: 'Push Notifications Disabled',
        message: 'Notification preferences saved. You will not receive alerts on this device.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    }
  };

  // ── Sub-components ──────────────────────────────────────────

  const SubHeader = ({ title, rightElement }: { title: string; rightElement?: React.ReactNode }) => (
    <View style={[s.subHeader, { paddingTop: insets.top + verticalScale(16) }]}>
      <Tap onPress={closeAccountSection} style={s.backBtn} accessibilityRole="button" accessibilityLabel="Back to Account">
        <Ionicons name="chevron-back" size={26} color={C.charcoal} />
      </Tap>
      <Text style={s.subHeaderTitle}>{title}</Text>
      <View style={s.subHeaderRight}>{rightElement}</View>
    </View>
  );

  const SectionLabel = ({ title }: { title: string }) => (
    <Text style={s.groupLabel}>{title}</Text>
  );

  // Preview row (read-only)
  const PreviewRow = ({ label, value, isLast = false }: { label: string; value?: string; isLast?: boolean }) => (
    <View style={[s.previewRow, isLast && { borderBottomWidth: 0 }]}>
      <Text style={s.previewLabel}>{label}</Text>
      <Text style={[s.previewValue, !value && { color: C.muted, fontStyle: 'italic' }]}>
        {value || 'Not set'}
      </Text>
    </View>
  );



  const ProfileItem = ({ icon, label, value, onPress, color = C.slate, isLast = false }: any) => (
    <Tap
      style={[s.item, isLast && { borderBottomWidth: 0 }]}
      onPress={onPress}
      disabled={!onPress}
      activeOpacity={0.7}
    >
      <View style={[s.iconBox, { backgroundColor: `${color}15` }]}>
        <Ionicons name={icon} size={19} color={color} />
      </View>
      <View style={{ flex: 1, marginLeft: scale(14) }}>
        <Text style={s.itemLabel}>{label}</Text>
        {value && <Text style={s.itemValue}>{value}</Text>}
      </View>
      {onPress && (
        <View style={s.chevronWrap}>
          <Ionicons name="chevron-forward" size={16} color={C.muted} />
        </View>
      )}
    </Tap>
  );

  // ── Render sections ─────────────────────────────────────────

  const renderContent = () => {
    switch (currentView) {

      // ── PERSONAL INFORMATION ───────────────────────────────
      case 'personal':
        return (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <SubHeader
              title="Personal Information"
              rightElement={
                <Tap
                  style={[s.editToggleBtn, isEditingPersonal && s.editToggleBtnActive]}
                  onPress={() => {
                    if (isGuest || user?.isAnonymous) {
                      showAlert({
                        type: 'guest',
                        title: 'Guest Mode',
                        message: 'Guest accounts cannot edit personal details. Please sign in with your Medical Record Number (MRN) or create an account to update your profile.',
                        primaryButtonText: 'Sign In / Register',
                        onPrimaryPress: () => {
                          hideAlert();
                          router.push('/auth/login');
                        },
                        secondaryButtonText: 'Dismiss',
                        onSecondaryPress: hideAlert,
                      });
                      return;
                    }
                    if (isEditingPersonal) {
                      handleSavePersonalData();
                    } else {
                      setIsEditingPersonal(true);
                    }
                  }}
                >
                  <Ionicons
                    name={isEditingPersonal ? 'checkmark' : 'pencil'}
                    size={14}
                    color={isEditingPersonal ? C.white : C.red}
                  />
                  <Text style={[s.editToggleText, isEditingPersonal && { color: C.white }]}>
                    {isEditingPersonal ? 'Save' : 'Edit'}
                  </Text>
                </Tap>
              }
            />

            <ScrollView contentContainerStyle={{ paddingHorizontal: scale(20), paddingBottom: verticalScale(120) + insets.bottom }} showsVerticalScrollIndicator={false}>

              {(isGuest || user?.isAnonymous) && (
                <View style={s.guestNoticeBanner}>
                  <Ionicons name="lock-closed" size={17} color="#3B50DF" />
                  <Text style={s.guestNoticeText}>
                    Guest Mode (View Only) — Personal information cannot be edited in guest mode. Sign in to manage your medical record.
                  </Text>
                </View>
              )}

              {/* Basic Info */}
              <SectionLabel title="BASIC INFO" />
              <View style={s.card}>
                {isEditingPersonal ? (
                  <>
                    <View style={s.editGroup}><Text style={s.editLabel}>Full Name <Text style={{ color: C.muted, fontWeight: '400' }}>(clinic-managed)</Text></Text><TextInput style={[s.editInput, { color: C.muted }]} value={personalData.fullName} editable={false} placeholder="—" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Age <Text style={{ color: C.muted, fontWeight: '400' }}>(clinic-managed)</Text></Text><TextInput style={[s.editInput, { color: C.muted }]} value={personalData.age} editable={false} placeholder="—" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Date of Birth <Text style={{ color: C.muted, fontWeight: '400' }}>(clinic-managed)</Text></Text><TextInput style={[s.editInput, { color: C.muted }]} value={personalData.dob} editable={false} placeholder="—" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Gender <Text style={{ color: C.muted, fontWeight: '400' }}>(clinic-managed)</Text></Text><TextInput style={[s.editInput, { color: C.muted }]} value={personalData.gender} editable={false} placeholder="—" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Religion</Text><TextInput style={s.editInput} value={personalData.religion} onChangeText={v => setPersonalData(p => ({...p, religion: v}))} placeholder="e.g. Roman Catholic" placeholderTextColor={C.muted} /></View>
                    <View style={[s.editGroup, {borderBottomWidth:0}]}><Text style={s.editLabel}>Educational Background</Text><TextInput style={s.editInput} value={personalData.education} onChangeText={v => setPersonalData(p => ({...p, education: v}))} placeholder="e.g. College Graduate" placeholderTextColor={C.muted} /></View>
                  </>
                ) : (
                  <>
                    <PreviewRow label="Full Name" value={personalData.fullName} />
                    <PreviewRow label="Age" value={personalData.age} />
                    <PreviewRow label="Date of Birth" value={personalData.dob} />
                    <PreviewRow label="Gender" value={personalData.gender} />
                    <PreviewRow label="Religion" value={personalData.religion} />
                    <PreviewRow label="Educational Background" value={personalData.education} isLast />
                  </>
                )}
              </View>

              {/* Contact & Address */}
              <SectionLabel title="CONTACT & ADDRESS" />
              <View style={s.card}>
                {isEditingPersonal ? (
                  <>
                    <View style={s.editGroup}><Text style={s.editLabel}>Present Address</Text><TextInput style={s.editInput} value={personalData.address} onChangeText={v => setPersonalData(p => ({...p, address: v}))} placeholder="Street, Barangay, City" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Occupation</Text><TextInput style={s.editInput} value={personalData.occupation} onChangeText={v => setPersonalData(p => ({...p, occupation: v}))} placeholder="e.g. Private Employee" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Contact Number</Text><TextInput style={s.editInput} value={personalData.contact} onChangeText={v => setPersonalData(p => ({...p, contact: v}))} placeholder="+63 9XX XXX XXXX" placeholderTextColor={C.muted} keyboardType="phone-pad" /></View>
                    <View style={[s.editGroup, {borderBottomWidth:0}]}><Text style={s.editLabel}>Email Address</Text><TextInput style={[s.editInput, {color: C.muted}]} value={user?.email || ''} editable={false} placeholderTextColor={C.muted} /></View>
                  </>
                ) : (
                  <>
                    <PreviewRow label="Present Address" value={personalData.address} />
                    <PreviewRow label="Occupation" value={personalData.occupation} />
                    <PreviewRow label="Contact Number" value={personalData.contact} />
                    <PreviewRow label="Email Address" value={user?.email || ''} isLast />
                  </>
                )}
              </View>

              {/* Physical Info: recorded by the clinic, read-only here (also while editing). */}
              <SectionLabel title="PHYSICAL INFO" />
              <View style={s.card}>
                <PreviewRow label="Height" value={personalData.height ? `${personalData.height} cm` : undefined} />
                <PreviewRow label="Weight" value={personalData.weight ? `${personalData.weight} kg` : undefined} />
                <PreviewRow label="Blood Pressure" value={personalData.bp} isLast />
              </View>
              {isEditingPersonal && (
                <Text style={{ fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(6), marginHorizontal: scale(6) }}>
                  Physical info is recorded by the clinic and can't be changed here.
                </Text>
              )}

              {/* Emergency Contact */}
              <SectionLabel title="EMERGENCY CONTACT" />
              <View style={s.card}>
                {isEditingPersonal ? (
                  <>
                    <View style={s.editGroup}><Text style={s.editLabel}>Full Name</Text><TextInput style={s.editInput} value={personalData.emergencyName} onChangeText={v => setPersonalData(p => ({...p, emergencyName: v}))} placeholder="Contact full name" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Relationship</Text><TextInput style={s.editInput} value={personalData.emergencyRel} onChangeText={v => setPersonalData(p => ({...p, emergencyRel: v}))} placeholder="e.g. Mother, Spouse" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Phone Number</Text><TextInput style={s.editInput} value={personalData.emergencyPhone} onChangeText={v => setPersonalData(p => ({...p, emergencyPhone: v}))} placeholder="+63 9XX XXX XXXX" placeholderTextColor={C.muted} keyboardType="phone-pad" /></View>
                    <View style={[s.editGroup, {borderBottomWidth:0}]}><Text style={s.editLabel}>Alternative Phone</Text><TextInput style={s.editInput} value={personalData.emergencyAltPhone} onChangeText={v => setPersonalData(p => ({...p, emergencyAltPhone: v}))} placeholder="+63 9XX XXX XXXX" placeholderTextColor={C.muted} keyboardType="phone-pad" /></View>
                  </>
                ) : (
                  <>
                    <PreviewRow label="Full Name" value={personalData.emergencyName} />
                    <PreviewRow label="Relationship" value={personalData.emergencyRel} />
                    <PreviewRow label="Phone Number" value={personalData.emergencyPhone} />
                    <PreviewRow label="Alternative Phone" value={personalData.emergencyAltPhone} isLast />
                  </>
                )}
              </View>

            </ScrollView>
          </View>
        );

      // ── LOGGED-IN DEVICES ────────────────────────────────
      case 'devices': {
        const others = devices.filter(d => d.deviceId !== deviceId);
        return (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <SubHeader title="Logged-in Devices" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: scale(20), paddingBottom: verticalScale(120) + insets.bottom }} showsVerticalScrollIndicator={false}>

              <SectionLabel title="ACTIVE SESSIONS" />

              {devicesLoading ? (
                <View style={s.card}>
                  <View style={s.deviceEmptyBox}>
                    <Text style={s.deviceEmptyText}>Loading devices…</Text>
                  </View>
                </View>
              ) : devices.length === 0 ? (
                <View style={s.card}>
                  <View style={s.deviceEmptyBox}>
                    <Ionicons name="phone-portrait-outline" size={24} color={C.muted} />
                    <Text style={s.deviceEmptyText}>No active sessions recorded</Text>
                  </View>
                </View>
              ) : (
                <View style={s.card}>
                  {devices.map((d, i) => {
                    const isThis = d.deviceId === deviceId;
                    return (
                      <View key={d.id} style={[s.deviceRow, i === devices.length - 1 && { borderBottomWidth: 0 }]}>
                        <View style={[s.iconBox, { backgroundColor: isThis ? C.greenLight : `${C.slate}10` }]}>
                          <Ionicons name={deviceIcon(d.platform) as any} size={19} color={isThis ? C.green : C.slate} />
                        </View>
                        <View style={{ flex: 1, marginLeft: scale(14) }}>
                          <View style={s.deviceLabelRow}>
                            <Text style={s.deviceLabel} numberOfLines={1}>{d.label}</Text>
                            {isThis && (
                              <View style={s.deviceCurrentPill}>
                                <Text style={s.deviceCurrentPillText}>This device</Text>
                              </View>
                            )}
                          </View>
                          <Text style={s.deviceMeta}>{relativeTime(d.lastActiveAt)}</Text>
                        </View>
                        <Tap
                          onPress={() => confirmLogoutDevice(d)} 
                          style={s.deviceRevokeBtn} 
                          activeOpacity={0.7}
                          accessibilityLabel={`Sign out ${d.label}`}
                        >
                          <Ionicons name="log-out-outline" size={19} color={C.red} />
                        </Tap>
                      </View>
                    );
                  })}
                </View>
              )}

              {others.length > 0 && (
                <Tap style={s.deviceRevokeAllBtn} onPress={handleRevokeAllOthers} activeOpacity={0.85}>
                  <Ionicons name="shield-outline" size={17} color={C.red} />
                  <Text style={s.deviceRevokeAllText}>
                    Sign out all other devices ({others.length})
                  </Text>
                </Tap>
              )}

              <View style={s.deviceNoteBox}>
                <Ionicons name="information-circle-outline" size={15} color={C.slate} />
                <Text style={s.deviceNoteText}>
                  A signed-out device is disconnected the next time it opens the app. If a phone is lost or stolen,
                  also change your password so it cannot sign in again.
                </Text>
              </View>

            </ScrollView>
          </View>
        );
      }

      case 'privacy':
        return (
          <View style={{ flex: 1, backgroundColor: C.bg }}>
            <SubHeader title="Privacy Policy & Data Notice" />
            <ScrollView contentContainerStyle={{ paddingHorizontal: scale(20), paddingBottom: verticalScale(120) + insets.bottom }} showsVerticalScrollIndicator={false}>

              {/* Data Protection & Security */}
              <SectionLabel title="DATA SECURITY & ENCRYPTION" />
              <View style={s.card}>
                {[
                  { title: 'Strict Access Controls', body: 'Only authorized healthcare professionals and registered clinic staff have access to your medical history for clinical care purposes.' },
                  { title: 'No Commercial Sharing', body: 'Your personal data is never sold, rented, or shared with third-party advertisers or insurance companies.' },
                ].map((p, i, arr) => (
                  <View key={i} style={[s.policyBlock, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={s.policyTitle}>{p.title}</Text>
                    <Text style={s.policyText}>{p.body}</Text>
                  </View>
                ))}
              </View>

              <Text style={s.versionText}>Last Updated: August 2026 · K&A Animal Bite Center & Clinic</Text>
            </ScrollView>
          </View>
        );

      // ── MAIN DASHBOARD ────────────────────────────────────
      default:
        return (
          <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: verticalScale(120) + insets.bottom }}>

            {/* Header */}
            <View style={[s.mainHeader, { paddingTop: insets.top + verticalScale(16) }]}>
              <Text style={s.mainHeaderTitle}>My Profile</Text>
            </View>

            {/* Profile card */}
            <View style={s.profileCard}>
              <Tap onPress={handleAvatarPress} style={s.avatarWrap} activeOpacity={0.8} disabled={isGuest || user?.isAnonymous}>
                {profileImage && !isGuest && !user?.isAnonymous ? (
                  <Image source={{ uri: profileImage }} style={s.avatar} />
                ) : (
                  <View style={[s.avatar, s.avatarPlaceholder]}>
                    <Ionicons name="person" size={scale(46)} color={C.white} />
                  </View>
                )}
                {!isGuest && !user?.isAnonymous && (
                  <View style={s.cameraBadge}>
                    <Ionicons name="camera" size={12} color={C.white} />
                  </View>
                )}
              </Tap>
              <Text style={s.userName}>{isGuest || user?.isAnonymous ? 'Guest' : (personalData.fullName || user?.displayName || '—')}</Text>
              {!isGuest && !user?.isAnonymous && user?.email ? <Text style={s.userEmail}>{user.email}</Text> : null}

              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statNumber} numberOfLines={1}>{serviceLabel}</Text>
                  <Text style={s.statLabel}>Service</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{dosesLabel}</Text>
                  <Text style={s.statLabel}>Doses</Text>
                </View>
                <View style={s.statDivider} />
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{nextDoseLabel}</Text>
                  <Text style={s.statLabel}>Next Dose</Text>
                </View>
              </View>
            </View>

            {/* Patient Record */}
            <View style={s.sectionWrap}>
              <Text style={s.sectionHeader}>Patient Record</Text>
              {recordError ? (
                <View style={[s.card, { padding: scale(14), flexDirection: 'row', alignItems: 'center', gap: scale(8) }]}>
                  <Ionicons name="alert-circle-outline" size={16} color={C.red} />
                  <Text style={{ color: C.red, fontSize: 12.5, flex: 1 }}>{recordError}</Text>
                </View>
              ) : (
                <View style={s.card}>
                  <ProfileItem icon="person-circle-outline" label="Personal Information" value="Name, age, address & contact" color={C.slate} onPress={() => setCurrentView('personal')} isLast />
                </View>
              )}
            </View>

            {/* Settings */}
            <View style={s.sectionWrap}>
              <Text style={s.sectionHeader}>Settings & Support</Text>
              <View style={s.card}>
                {isGuest || user?.isAnonymous ? (
                  <Tap
                    style={s.item}
                    onPress={() => {
                      showAlert({
                        type: 'guest',
                        title: 'Guest Mode',
                        message: 'Push notifications are available for registered patients only. Please sign in or register to enable dose reminders and alerts.',
                        primaryButtonText: 'Sign In / Register',
                        onPrimaryPress: () => {
                          hideAlert();
                          router.push('/auth/login');
                        },
                        secondaryButtonText: 'Dismiss',
                        onSecondaryPress: hideAlert,
                      });
                    }}
                    activeOpacity={0.7}
                  >
                    <View style={[s.iconBox, { backgroundColor: `${C.slate}10` }]}>
                      <Ionicons name="notifications-outline" size={19} color={C.slate} />
                    </View>
                    <View style={{ flex: 1, marginLeft: scale(14) }}>
                      <Text style={s.itemLabel}>Push Notifications</Text>
                      <Text style={{ fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(1) }}>Registered patients only</Text>
                    </View>
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                      <Ionicons name="lock-closed" size={14} color={C.muted} />
                      <Switch
                        value={false}
                        disabled={true}
                        trackColor={{ false: '#E2E8F0', true: C.red }}
                        thumbColor="#CBD5E1"
                        style={{ opacity: 0.55 }}
                      />
                    </View>
                  </Tap>
                ) : (
                  <View style={s.item}>
                    <View style={[s.iconBox, { backgroundColor: `${C.slate}10` }]}>
                      <Ionicons name="notifications-outline" size={19} color={C.slate} />
                    </View>
                    <Text style={[s.itemLabel, { flex: 1, marginLeft: scale(14) }]}>Push Notifications</Text>
                    <Switch
                      value={notificationsEnabled}
                      onValueChange={toggleNotifications}
                      trackColor={{ false: '#CBD5E1', true: C.red }}
                      thumbColor={C.white}
                    />
                  </View>
                )}
                {!user?.isAnonymous && !isGuest && (
                  <ProfileItem icon="phone-portrait-outline" label="Logged-in Devices" color={C.slate} onPress={() => setCurrentView('devices')} />
                )}
                <ProfileItem icon="document-text-outline" label="Privacy Policy" color={C.slate} onPress={() => setCurrentView('privacy')} isLast />
              </View>
            </View>

            {/* Sign out sits in its own card so it never reads as "one more setting". */}
            <View style={[s.sectionWrap, { marginTop: verticalScale(18) }]}>
              <View style={s.card}>
                <ProfileItem icon="log-out-outline" label="Sign Out" color={C.red} onPress={handleLogout} isLast />
              </View>
            </View>

            <Text style={s.versionText}><Text style={{ color: C.red, fontWeight: '900' }}>K&A</Text> Anti-Rabies Vaccine Clinic v1.0.13</Text>
          </ScrollView>
        );
    }
  };

  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" backgroundColor={C.bg} />
      {renderContent()}

      {/* ── BOTTOM NAV BAR ── */}
      <View style={[nav.bar, { height: verticalScale(80) + insets.bottom, paddingBottom: verticalScale(8) + insets.bottom }]}>
        {/* Tab 1: Home */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setCurrentView('main');
            setIsEditingPersonal(false);
            router.navigate('/');
          }}
        >
          <Ionicons name="home-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Home</Text>
        </Tap>

        {/* Tab 2: Appointments */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setCurrentView('main');
            setIsEditingPersonal(false);
            router.navigate('/appt');
          }}
        >
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appointments</Text>
        </Tap>

        {/* Tab 3: Chat */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setCurrentView('main');
            setIsEditingPersonal(false);
            router.navigate('/chat');
          }}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Chat</Text>
        </Tap>

        {/* Tab 4: Account */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Account</Text>
        </Tap>
      </View>

      {/* Custom Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={hideAlert} />
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: SOFT_GRAY_BG },

  // Sub-page header
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(8),
    paddingBottom: verticalScale(16),
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FA',
  },
  backBtn: { padding: scale(10), minWidth: scale(44), alignItems: 'center' },
  subHeaderTitle: { flex: 1, fontSize: moderateScale(18), fontWeight: '800', color: C.charcoal, textAlign: 'center' },
  subHeaderRight: { minWidth: scale(44), alignItems: 'flex-end', paddingRight: scale(8) },

  // Edit toggle button
  editToggleBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(7),
    borderRadius: scale(20),
    borderWidth: 1.5,
    borderColor: C.red,
    backgroundColor: C.white,
  },
  editToggleBtnActive: {
    backgroundColor: C.red,
    borderColor: C.red,
  },
  editToggleText: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: C.red,
  },

  // Main header
  mainHeader: {
    paddingHorizontal: scale(24),
    paddingBottom: verticalScale(8),
  },
  mainHeaderTitle: { fontSize: moderateScale(28), fontWeight: '900', color: C.charcoal },

  // Profile card
  profileCard: {
    marginHorizontal: scale(20),
    marginTop: verticalScale(8),
    backgroundColor: C.white,
    borderRadius: scale(28),
    padding: scale(24),
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.07,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 4 },
    elevation: 4,
  },
  avatarWrap: { marginBottom: verticalScale(14), position: 'relative' },
  avatar: { width: scale(88), height: scale(88), borderRadius: scale(44), backgroundColor: '#F1F5F9' },
  avatarPlaceholder: { backgroundColor: '#1E3A8A', alignItems: 'center', justifyContent: 'center' },
  cameraBadge: {
    position: 'absolute', bottom: 0, right: 0,
    width: scale(26), height: scale(26), borderRadius: scale(13),
    backgroundColor: C.red, borderWidth: 2, borderColor: C.white,
    alignItems: 'center', justifyContent: 'center',
  },
  userName: { fontSize: moderateScale(20), fontWeight: '800', color: C.charcoal, marginBottom: verticalScale(2) },
  userEmail: { fontSize: moderateScale(13), color: C.muted, marginBottom: verticalScale(18) },
  tagRow: { flexDirection: 'row', gap: scale(8), marginTop: 0, marginBottom: 0 },
  tag: {
    paddingHorizontal: scale(10), paddingVertical: verticalScale(5),
    borderRadius: scale(20), backgroundColor: C.redLight,
  },
  tagText: { fontSize: moderateScale(12), fontWeight: '700', color: C.red },
  statsRow: {
    flexDirection: 'row',
    borderTopWidth: 1, borderTopColor: '#F0F4FA',
    paddingTop: verticalScale(18), width: '100%',
  },
  statItem: { flex: 1, alignItems: 'center' },
  statNumber: { fontSize: moderateScale(15), fontWeight: '800', color: C.charcoal },
  statLabel: { fontSize: moderateScale(10), color: C.muted, marginTop: verticalScale(3), fontWeight: '600', textAlign: 'center' },
  statDivider: { width: 1, backgroundColor: '#F0F4FA', alignSelf: 'stretch' },

  // Section wrapper
  sectionWrap: { marginTop: verticalScale(28), paddingHorizontal: scale(20) },
  sectionHeader: {
    fontSize: moderateScale(12), fontWeight: '800', color: C.muted,
    textTransform: 'uppercase', letterSpacing: 1,
    marginBottom: verticalScale(12), marginLeft: scale(4),
  },
  groupLabel: {
    fontSize: moderateScale(11), fontWeight: '800', color: C.muted,
    textTransform: 'uppercase', letterSpacing: 0.8,
    marginTop: verticalScale(22), marginBottom: verticalScale(8), marginLeft: scale(4),
  },

  // Card
  card: {
    backgroundColor: C.white,
    borderRadius: scale(20),
    paddingHorizontal: scale(16),
    shadowColor: '#000',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },

  // Preview row (read-only)
  previewRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: verticalScale(14),
    borderBottomWidth: 1,
    borderBottomColor: '#F4F6FA',
  },
  previewLabel: { fontSize: moderateScale(13), color: C.muted, fontWeight: '600', flex: 1 },
  previewValue: { fontSize: moderateScale(14), fontWeight: '700', color: C.charcoal, flex: 1.4, textAlign: 'right' },

  // Edit field
  editGroup: { paddingVertical: verticalScale(12), borderBottomWidth: 1, borderBottomColor: '#F4F6FA' },
  editLabel: { fontSize: moderateScale(11), color: C.muted, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: verticalScale(6) },
  editInput: { fontSize: moderateScale(15), fontWeight: '600', color: C.charcoal, padding: 0, borderBottomWidth: 1.5, borderBottomColor: C.border, paddingBottom: verticalScale(4) },

  // Full edit button
  editFullBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: scale(8), marginTop: verticalScale(20), marginBottom: verticalScale(4),
    backgroundColor: C.red, borderRadius: scale(16),
    paddingVertical: verticalScale(14),
  },
  editFullBtnText: { color: C.white, fontWeight: '800', fontSize: moderateScale(15) },

  // List item
  item: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: verticalScale(14), borderBottomWidth: 1, borderBottomColor: '#F4F6FA',
  },
  iconBox: { width: scale(40), height: scale(40), borderRadius: scale(13), justifyContent: 'center', alignItems: 'center' },
  itemLabel: { fontSize: moderateScale(15), fontWeight: '700', color: C.charcoal },
  itemValue: { fontSize: moderateScale(12), color: C.muted, marginTop: verticalScale(2) },
  chevronWrap: {
    width: scale(28), height: scale(28), borderRadius: scale(8),
    backgroundColor: '#F4F6FA',
    alignItems: 'center', justifyContent: 'center',
  },

  // Dose rows
  doseRow: {
    flexDirection: 'row', alignItems: 'center',
    paddingVertical: verticalScale(14), borderBottomWidth: 1, borderBottomColor: '#F4F6FA',
    marginHorizontal: -1,
  },
  doseDot: { width: scale(12), height: scale(12), borderRadius: scale(6), marginRight: scale(14) },
  doseDotDone: { backgroundColor: C.green },
  doseDotPending: { backgroundColor: '#CBD5E1' },
  doseLabel: { fontSize: moderateScale(14), fontWeight: '700', color: C.charcoal },
  doseNote: { fontSize: moderateScale(13), fontWeight: '600', color: C.muted },
  doseDate: { fontSize: moderateScale(12), color: C.muted, marginTop: verticalScale(2) },
  doseBadge: { paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: scale(20) },
  doseBadgeDone: { backgroundColor: C.greenLight },
  doseBadgePending: { backgroundColor: C.redLight },
  doseBadgeText: { fontSize: moderateScale(11), fontWeight: '800' },

  // Info / alert boxes
  infoBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: scale(10), marginTop: verticalScale(16),
    backgroundColor: '#F8FAFC', borderRadius: scale(14), padding: scale(14),
    borderWidth: 1, borderColor: C.border,
  },
  infoText: { flex: 1, fontSize: moderateScale(12), color: C.slate, lineHeight: moderateScale(18) },
  alertBox: {
    flexDirection: 'row', alignItems: 'flex-start',
    gap: scale(10), marginTop: verticalScale(16),
    backgroundColor: C.redLight, borderRadius: scale(14), padding: scale(14),
    borderWidth: 1, borderColor: '#BFDBFE',
  },
  alertIcon: { marginTop: verticalScale(1) },
  alertText: { flex: 1, fontSize: moderateScale(12), color: '#1E3A8A', lineHeight: moderateScale(18), fontWeight: '600' },

  // Policy
  policyBlock: { paddingVertical: verticalScale(16), borderBottomWidth: 1, borderBottomColor: '#F4F6FA' },
  policyTitle: { fontSize: moderateScale(15), fontWeight: '800', color: C.charcoal, marginBottom: verticalScale(6) },
  policyText: { fontSize: moderateScale(14), color: C.slate, lineHeight: moderateScale(22) },

  // Logged-in devices
  logoutThisDeviceBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(8),
    backgroundColor: C.red,
    borderRadius: scale(14),
    height: verticalScale(48),
  },
  logoutThisDeviceText: { fontSize: moderateScale(14.5), fontWeight: '800', color: C.white },

  privacyNoticeCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    backgroundColor: C.white,
    borderRadius: scale(18),
    padding: scale(16),
    marginBottom: verticalScale(16),
    borderWidth: 1,
    borderColor: '#BFDBFE',
    shadowColor: '#0F172A',
    shadowOpacity: 0.03,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  privacyNoticeTitle: { fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },
  privacyNoticeSub: { fontSize: moderateScale(12), color: C.slate, marginTop: verticalScale(2), lineHeight: moderateScale(16) },

  deviceRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: verticalScale(14), borderBottomWidth: 1, borderBottomColor: '#F4F6FA' },
  deviceLabelRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8) },
  deviceLabel: { fontSize: moderateScale(14.5), fontWeight: '700', color: C.charcoal, flexShrink: 1 },
  deviceCurrentPill: { backgroundColor: C.greenLight, borderRadius: scale(6), paddingHorizontal: scale(7), paddingVertical: verticalScale(3) },
  deviceCurrentPillText: { fontSize: moderateScale(10.5), fontWeight: '700', color: '#047857' },
  deviceMeta: { fontSize: moderateScale(12.5), color: C.slate, marginTop: verticalScale(3) },
  // Padded to a 44pt target without drawing a button that large.
  deviceRevokeBtn: { paddingVertical: verticalScale(12), paddingHorizontal: scale(10) },
  deviceRevokeText: { fontSize: moderateScale(13), fontWeight: '700', color: C.red },
  deviceEmptyBox: { alignItems: 'center', gap: scale(8), paddingVertical: verticalScale(26) },
  deviceEmptyText: { fontSize: moderateScale(13.5), color: C.slate },
  deviceRevokeAllBtn: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8),
    backgroundColor: C.white, borderRadius: scale(14), height: verticalScale(50), marginTop: verticalScale(14),
    borderWidth: 1, borderColor: '#FBD5D8',
  },
  deviceRevokeAllText: { fontSize: moderateScale(14), fontWeight: '700', color: C.red },
  deviceNoteBox: {
    flexDirection: 'row', alignItems: 'flex-start', gap: scale(8),
    backgroundColor: '#EEF2F7', borderRadius: scale(12), padding: scale(13), marginTop: verticalScale(16),
  },
  deviceNoteText: { flex: 1, fontSize: moderateScale(12.5), color: C.slate, lineHeight: moderateScale(18) },

  guestNoticeBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    backgroundColor: '#EEF2FF',
    borderWidth: 1,
    borderColor: '#C7D2FE',
    borderRadius: scale(16),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    marginBottom: verticalScale(16),
  },
  guestNoticeText: {
    flex: 1,
    fontSize: moderateScale(12.5),
    color: '#3730A3',
    fontWeight: '600',
    lineHeight: moderateScale(17),
  },

  versionText: { textAlign: 'center', color: C.muted, fontSize: moderateScale(12), marginTop: verticalScale(32), marginBottom: verticalScale(16) },
});

const nav = StyleSheet.create({
  bar: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    height: verticalScale(80), backgroundColor: '#FFFFFF',
    flexDirection: 'row', alignItems: 'center', justifyContent: 'space-around',
    borderTopWidth: 1, borderColor: '#F1F5F9',
    paddingBottom: verticalScale(8), paddingTop: verticalScale(6),
    elevation: 20, shadowColor: '#0F172A', shadowOpacity: 0.08, shadowRadius: 12, shadowOffset: { width: 0, height: -4 },
    paddingHorizontal: scale(4),
  },
  tab: { flex: 1, justifyContent: 'center', alignItems: 'center', height: '100%' },
  label: { fontSize: moderateScale(10), color: '#64748B', marginTop: verticalScale(3), fontWeight: '600' },
  labelActive: { color: C.red, fontWeight: '800' },
});
