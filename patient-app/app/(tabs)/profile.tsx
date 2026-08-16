// app/(tabs)/profile.tsx
import { Ionicons } from '@expo/vector-icons';
import AsyncStorage from '@react-native-async-storage/async-storage';
import * as ImagePicker from 'expo-image-picker';
import { useRouter } from 'expo-router';
import { doc, onSnapshot } from 'firebase/firestore';
import { useEffect, useState } from 'react';
import {
  Alert,
  Image,
  ScrollView,
  StatusBar,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { auth, db, signOut } from '../../config/firebase';
import { setKeepSignedIn } from '../../config/appPrefs';
import { formatDoseDate } from '../../config/dates';
import {
  clearThisDeviceSession,
  revokeAllOtherSessions,
  revokeDeviceSession,
  watchDeviceSessions,
  type DeviceSession,
} from '../../config/deviceSessions';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../constants/scale';

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

const MEDICAL_RED = '#EF4444';
const SOFT_GRAY_BG = '#F4F6FA';

const C = {
  red: MEDICAL_RED,
  redLight: '#FFF0F1',
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

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, mrn, deviceId } = usePatientAuth();

  const [currentView, setCurrentView] = useState<ViewState>('main');
  const [devices, setDevices] = useState<DeviceSession[]>([]);
  const [devicesLoading, setDevicesLoading] = useState(true);
  const [isEditingPersonal, setIsEditingPersonal] = useState(false);
  const [personalData, setPersonalData] = useState(EMPTY_PERSONAL_DATA);
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [profileImage, setProfileImage] = useState(
    `https://ui-avatars.com/api/?name=${encodeURIComponent(user?.displayName || 'Patient')}&background=E31837&color=fff&size=128`
  );

  // Admin Dashboard's vaccinations/{mrn} doc is the source of truth for this
  // patient's demographic + PEP record — see ka-clinic-admin/src/patients.jsx vaxDoc.
  const [patientRecord, setPatientRecord] = useState<any | null>(null);
  const [recordError, setRecordError] = useState('');

  useEffect(() => {
    if (!mrn) { setPatientRecord(null); return; }
    return onSnapshot(doc(db, 'vaccinations', mrn), (snap) => {
      setRecordError('');
      if (snap.exists()) setPatientRecord(snap.data());
    }, (err) => {
      console.error('Vaccination record listener error:', err);
      setRecordError(err?.code === 'permission-denied'
        ? 'You do not have permission to view this record.'
        : 'Could not load your patient record.');
    });
  }, [mrn]);

  // Restore persistent avatar image, personal data, and push notification preference
  useEffect(() => {
    const uid = user?.uid || 'guest';
    AsyncStorage.getItem(`kna:avatar:${uid}`).then(val => {
      if (val) {
        setProfileImage(val);
      } else {
        AsyncStorage.getItem('kna:avatar:global').then(gval => {
          if (gval) setProfileImage(gval);
        });
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

    AsyncStorage.getItem(`kna:pushNotifs:${uid}`).then(val => {
      if (val !== null) setNotificationsEnabled(val === 'true');
    }).catch(() => {});
  }, [user?.uid]);

  useEffect(() => {
    if (!patientRecord) return;
    setPersonalData(prev => ({
      ...prev,
      fullName: patientRecord.name || prev.fullName,
      age: patientRecord.age || prev.age,
      gender: patientRecord.sex || prev.gender,
      address: patientRecord.address || prev.address,
      contact: patientRecord.contact || prev.contact,
      religion: patientRecord.religion || prev.religion,
      education: patientRecord.education || prev.education,
      occupation: patientRecord.occupation || prev.occupation,
      height: patientRecord.height || prev.height,
      weight: patientRecord.weight || prev.weight,
      bp: patientRecord.bp || prev.bp,
      emergencyName: patientRecord.emergencyName || prev.emergencyName,
      emergencyRel: patientRecord.emergencyRel || prev.emergencyRel,
      emergencyPhone: patientRecord.emergencyPhone || prev.emergencyPhone,
    }));
    if (patientRecord.avatarUrl) {
      setProfileImage(patientRecord.avatarUrl);
    }
  }, [patientRecord]);

  const handleSavePersonalData = async () => {
    setIsEditingPersonal(false);
    const uid = user?.uid || 'guest';
    await AsyncStorage.setItem(`kna:personalData:${uid}`, JSON.stringify(personalData)).catch(() => {});
    Alert.alert('Personal Info Saved', 'Your personal details have been updated successfully.');
  };

  const patientDoses: any[] = Array.isArray(patientRecord?.doses) ? patientRecord.doses : [];
  const doneDoseCount = patientDoses.filter(d => (d.status || d.s) === 'done').length;
  const nextPendingDose = patientDoses.find(d => (d.status || d.s) !== 'done');
  const categoryLabel = patientRecord?.cat ? `Cat. ${patientRecord.cat}` : '—';
  const dosesLabel = patientDoses.length > 0 ? `${doneDoseCount}/${patientDoses.length}` : '—';
  const nextDoseLabel = nextPendingDose ? formatDoseDate(nextPendingDose.date) : (patientDoses.length > 0 ? 'Done' : '—');

  // Live device list. Guests have no account to attach sessions to.
  useEffect(() => {
    if (!user || user.isAnonymous) { setDevices([]); setDevicesLoading(false); return; }
    setDevicesLoading(true);
    const unsub = watchDeviceSessions(
      user.uid,
      rows => { setDevices(rows); setDevicesLoading(false); },
      () => setDevicesLoading(false),
    );
    return unsub;
  }, [user?.uid]);

  const confirmLogoutDevice = (target: DeviceSession) => {
    const isThis = target.deviceId === deviceId;
    Alert.alert(
      `Sign Out ${isThis ? 'This Device' : target.label}?`,
      `Are you sure you want to sign out from ${isThis ? 'this device' : target.label}? This session will be disconnected.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out',
          style: 'destructive',
          onPress: async () => {
            if (isThis) {
              try {
                if (user?.uid) await clearThisDeviceSession(user.uid);
                await setKeepSignedIn(false);
                await signOut(auth);
              } catch (e) {
                console.log(e);
              }
              router.replace('/auth/login');
            } else {
              try {
                if (user?.uid) await revokeDeviceSession(user.uid, target.deviceId);
              } catch {
                Alert.alert('Could Not Sign Out Device', 'Please check your connection and try again.');
              }
            }
          },
        },
      ],
    );
  };

  const handleRevokeAllOthers = () => {
    const others = devices.filter(d => d.deviceId !== deviceId).length;
    if (others === 0) return;
    Alert.alert(
      'Sign out all other devices?',
      `${others} other device${others === 1 ? '' : 's'} will be signed out. This device stays signed in.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Sign Out All',
          style: 'destructive',
          onPress: async () => {
            try {
              if (user?.uid && deviceId) await revokeAllOtherSessions(user.uid, deviceId);
            } catch {
              Alert.alert('Could Not Sign Out Devices', 'Please check your connection and try again.');
            }
          },
        },
      ],
    );
  };

  const handleLogout = () => {
    Alert.alert('Sign Out', 'Are you sure you want to sign out?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Sign Out',
        style: 'destructive',
        onPress: async () => {
          try {
            if (user?.uid) await clearThisDeviceSession(user.uid);
            await setKeepSignedIn(false);
            await signOut(auth);
          } catch (e) {
            console.log(e);
          }
          router.replace('/auth/login');
        },
      },
    ]);
  };

  const handleAvatarPress = () => {
    Alert.alert('Update Profile Picture', 'Choose an option to change your profile photo:', [
      { text: 'Take Photo', onPress: () => pickImage(true) },
      { text: 'Choose from Gallery', onPress: () => pickImage(false) },
      { text: 'Cancel', style: 'cancel' },
    ]);
  };

  const pickImage = async (useCamera = false) => {
    try {
      const permissionResult = useCamera
        ? await ImagePicker.requestCameraPermissionsAsync()
        : await ImagePicker.requestMediaLibraryPermissionsAsync();

      if (permissionResult.status !== 'granted') {
        Alert.alert('Permission Required', 'Please grant permission to update your profile photo.');
        return;
      }

      const result = useCamera
        ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
        : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });

      if (!result.canceled && result.assets[0]) {
        const uri = result.assets[0].uri;
        setProfileImage(uri);
        const uid = user?.uid || 'guest';
        await AsyncStorage.setItem(`kna:avatar:${uid}`, uri).catch(() => {});
        await AsyncStorage.setItem('kna:avatar:global', uri).catch(() => {});
        if (mrn) {
          doc(db, 'vaccinations', mrn);
        }
        Alert.alert('Profile Photo Saved', 'Your profile picture has been updated and saved.');
      }
    } catch (e) {
      console.warn('Profile image error:', e);
    }
  };

  const toggleNotifications = async (value: boolean) => {
    setNotificationsEnabled(value);
    const uid = user?.uid || 'guest';
    await AsyncStorage.setItem(`kna:pushNotifs:${uid}`, value ? 'true' : 'false').catch(() => {});
    if (value) {
      Alert.alert('Push Notifications Active', 'You will receive dose schedules and appointment alerts.');
    } else {
      Alert.alert('Push Notifications Disabled', 'Notification preferences saved.');
    }
  };

  // ── Sub-components ──────────────────────────────────────────

  const SubHeader = ({ title, rightElement }: { title: string; rightElement?: React.ReactNode }) => (
    <View style={[s.subHeader, { paddingTop: insets.top + verticalScale(16) }]}>
      <TouchableOpacity onPress={() => { setCurrentView('main'); setIsEditingPersonal(false); }} style={s.backBtn}>
        <Ionicons name="chevron-back" size={26} color={C.charcoal} />
      </TouchableOpacity>
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
    <TouchableOpacity
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
    </TouchableOpacity>
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
                <TouchableOpacity
                  style={[s.editToggleBtn, isEditingPersonal && s.editToggleBtnActive]}
                  onPress={() => {
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
                </TouchableOpacity>
              }
            />

            <ScrollView contentContainerStyle={{ paddingHorizontal: scale(20), paddingBottom: verticalScale(120) + insets.bottom }} showsVerticalScrollIndicator={false}>

              {/* Basic Info */}
              <SectionLabel title="BASIC INFO" />
              <View style={s.card}>
                {isEditingPersonal ? (
                  <>
                    <View style={s.editGroup}><Text style={s.editLabel}>Full Name</Text><TextInput style={s.editInput} value={personalData.fullName} onChangeText={v => setPersonalData(p => ({...p, fullName: v}))} placeholder="Enter full name" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Age</Text><TextInput style={s.editInput} value={personalData.age} onChangeText={v => setPersonalData(p => ({...p, age: v}))} placeholder="e.g. 25" placeholderTextColor={C.muted} keyboardType="numeric" /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Date of Birth</Text><TextInput style={s.editInput} value={personalData.dob} onChangeText={v => setPersonalData(p => ({...p, dob: v}))} placeholder="MM/DD/YYYY" placeholderTextColor={C.muted} /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Gender</Text><TextInput style={s.editInput} value={personalData.gender} onChangeText={v => setPersonalData(p => ({...p, gender: v}))} placeholder="Male / Female / Other" placeholderTextColor={C.muted} /></View>
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

              {/* Physical Info */}
              <SectionLabel title="PHYSICAL INFO" />
              <View style={s.card}>
                {isEditingPersonal ? (
                  <>
                    <View style={s.editGroup}><Text style={s.editLabel}>Height (cm)</Text><TextInput style={s.editInput} value={personalData.height} onChangeText={v => setPersonalData(p => ({...p, height: v}))} placeholder="e.g. 160" placeholderTextColor={C.muted} keyboardType="numeric" /></View>
                    <View style={s.editGroup}><Text style={s.editLabel}>Weight (kg)</Text><TextInput style={s.editInput} value={personalData.weight} onChangeText={v => setPersonalData(p => ({...p, weight: v}))} placeholder="e.g. 55" placeholderTextColor={C.muted} keyboardType="numeric" /></View>
                    <View style={[s.editGroup, {borderBottomWidth:0}]}><Text style={s.editLabel}>Blood Pressure</Text><TextInput style={s.editInput} value={personalData.bp} onChangeText={v => setPersonalData(p => ({...p, bp: v}))} placeholder="e.g. 120/80" placeholderTextColor={C.muted} /></View>
                  </>
                ) : (
                  <>
                    <PreviewRow label="Height" value={personalData.height ? `${personalData.height} cm` : undefined} />
                    <PreviewRow label="Weight" value={personalData.weight ? `${personalData.weight} kg` : undefined} />
                    <PreviewRow label="Blood Pressure" value={personalData.bp} isLast />
                  </>
                )}
              </View>

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

              {isEditingPersonal && (
                <TouchableOpacity style={s.editFullBtn} onPress={handleSavePersonalData} activeOpacity={0.85}>
                  <Ionicons name="checkmark-circle-outline" size={19} color="#FFFFFF" />
                  <Text style={s.editFullBtnText}>Save Changes</Text>
                </TouchableOpacity>
              )}

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
                        <TouchableOpacity 
                          onPress={() => confirmLogoutDevice(d)} 
                          style={s.deviceRevokeBtn} 
                          activeOpacity={0.7}
                          accessibilityLabel={`Sign out ${d.label}`}
                        >
                          <Ionicons name="log-out-outline" size={19} color={C.red} />
                        </TouchableOpacity>
                      </View>
                    );
                  })}
                </View>
              )}

              {others.length > 0 && (
                <TouchableOpacity style={s.deviceRevokeAllBtn} onPress={handleRevokeAllOthers} activeOpacity={0.85}>
                  <Ionicons name="shield-outline" size={17} color={C.red} />
                  <Text style={s.deviceRevokeAllText}>
                    Sign out all other devices ({others.length})
                  </Text>
                </TouchableOpacity>
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

              {/* Data Protection Banner */}
              <View style={s.privacyNoticeCard}>
                <Ionicons name="shield-checkmark" size={24} color={MEDICAL_RED} />
                <View style={{ flex: 1 }}>
                  <Text style={s.privacyNoticeTitle}>Data Privacy Act Compliance (RA 10173)</Text>
                  <Text style={s.privacyNoticeSub}>K&A Animal Bite Center is committed to protecting your personal and sensitive health information.</Text>
                </View>
              </View>

              {/* Data Collection */}
              <SectionLabel title="1. DATA COLLECTION & MEDICAL PURPOSE" />
              <View style={s.card}>
                {[
                  { title: 'Personal Demographics', body: 'We collect your full name, age, date of birth, sex, address, and contact details to establish your official medical record.' },
                  { title: 'Clinical Incident Data', body: 'Bite incident location, exposure category (Category I, II, or III), biting animal status, and anatomical wound site are recorded to determine your PEP vaccine regimen.' },
                  { title: 'Immunization Records', body: 'All vaccine brand names, lot numbers, administration dates, and dosages are stored to ensure complete rabies prophylaxis tracking.' },
                ].map((p, i, arr) => (
                  <View key={i} style={[s.policyBlock, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={s.policyTitle}>{p.title}</Text>
                    <Text style={s.policyText}>{p.body}</Text>
                  </View>
                ))}
              </View>

              {/* Data Protection & Security */}
              <SectionLabel title="2. DATA SECURITY & ENCRYPTION" />
              <View style={s.card}>
                {[
                  { title: 'AES-256 Encryption', body: 'All patient data transmitted between the app and clinic database is encrypted using industry-standard SSL/TLS protocols and AES-256 encryption at rest.' },
                  { title: 'Strict Access Controls', body: 'Only authorized healthcare professionals and registered clinic staff have access to your medical history for clinical care purposes.' },
                  { title: 'No Commercial Sharing', body: 'Your personal data is never sold, rented, or shared with third-party advertisers or insurance companies.' },
                ].map((p, i, arr) => (
                  <View key={i} style={[s.policyBlock, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={s.policyTitle}>{p.title}</Text>
                    <Text style={s.policyText}>{p.body}</Text>
                  </View>
                ))}
              </View>

              {/* Your Rights */}
              <SectionLabel title="3. RIGHTS OF THE DATA SUBJECT" />
              <View style={s.card}>
                {[
                  { title: 'Right to Access & Rectification', body: 'You have the right to view your full immunization history and update your contact information or request corrections at any time.' },
                  { title: 'Right to Erasure / Blocking', body: 'You may request account deletion, subject to mandatory Department of Health (DOH) medical record retention regulations.' },
                ].map((p, i, arr) => (
                  <View key={i} style={[s.policyBlock, i === arr.length - 1 && { borderBottomWidth: 0 }]}>
                    <Text style={s.policyTitle}>{p.title}</Text>
                    <Text style={s.policyText}>{p.body}</Text>
                  </View>
                ))}
              </View>

              {/* Contact Information */}
              <SectionLabel title="4. DATA PRIVACY OFFICER & CONTACT" />
              <View style={s.card}>
                <View style={s.policyBlock}>
                  <Text style={s.policyTitle}>Contact DPO</Text>
                  <Text style={s.policyText}>For questions or privacy concerns, contact our Data Privacy Officer at privacy@kavaccineclinic.ph or visit K&A Animal Bite Center during clinic hours.</Text>
                </View>
                <View style={[s.policyBlock, { borderBottomWidth: 0 }]}>
                  <Text style={s.policyTitle}>National Privacy Commission (NPC)</Text>
                  <Text style={s.policyText}>You have the right to lodge a complaint with the National Privacy Commission at www.privacy.gov.ph if your data rights are violated.</Text>
                </View>
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
              <TouchableOpacity onPress={handleAvatarPress} style={s.avatarWrap} activeOpacity={0.8}>
                <Image source={{ uri: profileImage }} style={s.avatar} />
                <View style={s.cameraBadge}>
                  <Ionicons name="camera" size={12} color={C.white} />
                </View>
              </TouchableOpacity>
              <Text style={s.userName}>{personalData.fullName || user?.displayName || 'Patient User'}</Text>
              <Text style={s.userEmail}>{user?.email || 'patient@email.com'}</Text>

              <View style={s.statsRow}>
                <View style={s.statItem}>
                  <Text style={s.statNumber}>{categoryLabel}</Text>
                  <Text style={s.statLabel}>Category</Text>
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
                {!user?.isAnonymous && (
                  <ProfileItem icon="phone-portrait-outline" label="Logged-in Devices" color={C.slate} onPress={() => setCurrentView('devices')} />
                )}
                <ProfileItem icon="document-text-outline" label="Privacy Policy" color={C.slate} onPress={() => setCurrentView('privacy')} />
                <ProfileItem icon="log-out-outline" label="Sign Out" color={C.red} onPress={handleLogout} isLast />
              </View>
            </View>

            <Text style={s.versionText}><Text style={{ color: C.red, fontWeight: '900' }}>K&A</Text> Anti-Rabies Vaccine Clinic v1.0.4</Text>
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
        <TouchableOpacity
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
        </TouchableOpacity>

        {/* Tab 2: Appts */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setCurrentView('main');
            setIsEditingPersonal(false);
            router.navigate('/appt');
          }}
        >
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appts</Text>
        </TouchableOpacity>

        {/* Tab 3: Chat */}
        <TouchableOpacity
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
        </TouchableOpacity>

        {/* Tab 4: Records */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setCurrentView('main');
            setIsEditingPersonal(false);
            router.navigate('/records');
          }}
        >
          <Ionicons name="id-card-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Records</Text>
        </TouchableOpacity>

        {/* Tab 5: Account */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
        >
          <Ionicons name="person" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Account</Text>
        </TouchableOpacity>
      </View>
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
    borderWidth: 1, borderColor: '#FECDD3',
  },
  alertIcon: { marginTop: verticalScale(1) },
  alertText: { flex: 1, fontSize: moderateScale(12), color: '#9F1239', lineHeight: moderateScale(18), fontWeight: '600' },

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
    borderColor: '#FECDD3',
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
  label: { fontSize: moderateScale(11), color: '#64748B', marginTop: verticalScale(3), fontWeight: '600' },
  labelActive: { color: C.red, fontWeight: '800' },
});