// app/(tabs)/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  collection,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  updateDoc,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Animated as RNAnimated,
  Dimensions,
  Image,
  Keyboard,
  KeyboardAvoidingView,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import MapViewContainer from '../../components/map/MapViewContainer';
import { LIBON_MAP_VIEW, getSeverityStyle } from '../../components/map/mapTheme';
import { formatDoseDate } from '../../config/dates';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import * as Sharing from 'expo-sharing';
import ViewShot from 'react-native-view-shot';
import { db } from '../../config/firebase';
import {
  acknowledgeNotification,
  ensureNotificationPermission,
  presentLocalNotification,
  registerForPushNotifications,
} from '../../config/notifications';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../constants/scale';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

const CLOUDINARY_CLOUD_NAME = 'dg14fztnu';
const CLOUDINARY_UPLOAD_PRESET = 'rabies_app';
const CLOUDINARY_UPLOAD_URL = `https://api.cloudinary.com/v1_1/${CLOUDINARY_CLOUD_NAME}/image/upload`;

const MEDICAL_RED = '#EF4444';
const SOFT_GRAY_BG = '#EEF2F6';

const C = {
  red: MEDICAL_RED,
  redLight: '#FF4D65',
  redDeep: '#B8102C',
  white: '#FFFFFF',
  charcoal: '#1E293B',
  slate: '#475569',
  muted: '#94A3B8',
  green: '#10B981',
  border: '#E2E8F0',
  cardBg: '#FFFFFF',
  softRed: '#FFF1F3',
};

type VaccineDose = { id: string; dose: number; label: string; date: string; rawDate: string | null; done: boolean; missed: boolean; vaccineType?: 'Pre-Exposure' | 'Post-Exposure'; };
type NextDoseNotif = { id: string; doseLabel: string; doseDate: string; message: string; sentAt: string; };
// Matches ka-clinic-admin/src/incidents.jsx's actual write shape — there is
// no `title` field on the real doc, so this no longer assumes one.
type Incident = { id: string; location?: string; barangay?: string; type?: string; category?: string; description?: string; date?: string; latitude: number; longitude: number; status?: 'active' | 'resolved'; };
// Written to the SAME `vaccinations/{mrn}.woundLog` array the Admin
// Dashboard's Wound / Clinical Log reads/writes (ka-clinic-admin/src/patients.jsx
// WoundLog component) — {id, note, date, by, createdAt}, plus an app-only
// `photoUrl`/`symptoms` the admin UI just ignores rather than a separate collection.
type LogEntry = { id: string; type: 'wound' | 'note'; note: string; photoUrl: string | null; symptoms: string[]; by: string; time: string; date: string; createdAt: number; };
// Full raw `vaccinations/{mrn}` doc, kept alongside the derived `vaccineSchedule`
// so the vaccination card and wound-log read-modify-write ops have real fields.
type PatientRecord = { [key: string]: any };

type AppNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'dose' | 'map' | 'wound' | 'system' | 'appointment' | 'followup';
  // Only clinic-sent follow-ups carry these: the Firestore doc id the
  // acknowledgement is recorded against, and whether it already happened.
  notificationId?: string;
  acknowledged?: boolean;
};

// A follow-up the clinic sent (api/notifications.js action send-followup),
// mirrored from the `patientNotifications` collection.
type ClinicNotification = {
  id: string;
  title: string;
  message: string;
  createdAt?: number;
  acknowledged?: boolean;
};

// Subset of the `appointments` doc this screen needs to announce a decision.
// The Admin Dashboard writes 'confirmed' (and 'accepted' as a legacy alias)
// from ka-clinic-admin/src/appts.jsx handleQuickAction.
type ApptUpdate = {
  id: string;
  date: string;
  time: string;
  type?: string;
  status: string;
  note?: string;
  updatedAt?: number;
};

const CONFIRMED_STATUSES = ['confirmed', 'accepted'];

// "2026-08-08" → "Sat, Aug 8" for notification copy; falls back to the raw
// string if the date is missing or malformed rather than rendering "Invalid Date".
function formatApptDate(ds?: string | null): string {
  if (!ds) return '';
  const parts = String(ds).split('-');
  if (parts.length !== 3) return String(ds);
  const [y, m, d] = parts.map(Number);
  const date = new Date(y, m - 1, d);
  if (isNaN(date.getTime())) return String(ds);
  return date.toLocaleDateString('en-US', { weekday: 'short', month: 'short', day: 'numeric' });
}

const SYMPTOMS_LIST = ['Redness', 'Swelling', 'Discharge', 'Bleeding', 'Itching', 'Pain', 'Warmth', 'Fever', 'Numbness', 'Pus'];

const DEFAULT_RECORD_DOSES = [
  { id: 'd1', label: '1st Dose (Day 0)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/04/26', provider: 'K&A Main Clinic / RN S. Santos' },
  { id: 'd2', label: '2nd Dose (Day 3)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/07/26', provider: 'K&A Main Clinic / RN S. Santos' },
  { id: 'd3', label: '3rd Dose (Day 7)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/11/26', provider: 'K&A Main Clinic / RN S. Santos' },
  { id: 'd4', label: '4th Dose (Day 14)', vaccineBrand: 'Speeda ARV (Lot #2026-08A)', dosage: '0.5 mL (IM)', date: '08/18/26', provider: 'K&A Main Clinic / RN' },
  { id: 'd5', label: 'RIG (Immunoglobulin)', vaccineBrand: 'ERIG (Equine Rabies)', dosage: '20 IU/kg (Infiltration)', date: '08/04/26', provider: 'K&A Emergency Unit' },
];

// Guests get the standard PEP schedule's shape — dose labels only, no brand,
// dosage, lot or date — so the card and tracker show the real row structure
// while making it obvious nothing has been administered yet. `blankRow: true`
// tells the renderers to print '—' instead of falling back to sample values.
const GUEST_PLACEHOLDER_DOSES = [
  { id: 'g1', label: '1st Dose (Day 0)',    done: false, blankRow: true },
  { id: 'g2', label: '2nd Dose (Day 3)',    done: false, blankRow: true },
  { id: 'g3', label: '3rd Dose (Day 7)',    done: false, blankRow: true },
  { id: 'g4', label: '4th Dose (Day 14)',   done: false, blankRow: true },
  { id: 'g5', label: 'RIG (Immunoglobulin)', done: false, blankRow: true },
];

async function uploadToCloudinary(localUri: string): Promise<string> {
  const formData = new FormData();
  formData.append('file', { uri: localUri, type: 'image/jpeg', name: `wound_${Date.now()}.jpg` } as any);
  formData.append('upload_preset', CLOUDINARY_UPLOAD_PRESET);
  const res = await fetch(CLOUDINARY_UPLOAD_URL, { method: 'POST', body: formData });
  if (!res.ok) throw new Error(`Cloudinary error: ${await res.text()}`);
  const data = await res.json();
  return data.secure_url as string;
}

const NotifSwipeToDeleteRow = ({ children, onDelete }: { children: React.ReactNode; onDelete: () => void }) => {
  const translateX = useRef(new RNAnimated.Value(0)).current;
  const isOpen = useRef(false);

  const snapOpen = () => {
    RNAnimated.spring(translateX, { toValue: -76, useNativeDriver: true, bounciness: 2 }).start();
    isOpen.current = true;
  };
  const snapClose = () => {
    RNAnimated.spring(translateX, { toValue: 0, useNativeDriver: true, bounciness: 2 }).start();
    isOpen.current = false;
  };

  const panResponder = useRef(
    PanResponder.create({
      onStartShouldSetPanResponder: () => false,
      onStartShouldSetPanResponderCapture: () => false,
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6 && Math.abs(g.dx) > Math.abs(g.dy),
      onPanResponderGrant: () => { translateX.stopAnimation(); },
      onPanResponderMove: (_, g) => {
        const base = isOpen.current ? -76 : 0;
        translateX.setValue(Math.min(0, Math.max(base + g.dx, -76)));
      },
      onPanResponderRelease: (_, g) => {
        if (g.dx < -25 || g.vx < -0.3) {
          snapOpen();
        } else {
          snapClose();
        }
      },
    })
  ).current;

  return (
    <View style={{ marginBottom: verticalScale(1), position: 'relative', overflow: 'hidden', borderRadius: scale(12) }}>
      <View style={{ position: 'absolute', right: 0, top: 0, bottom: 0, width: scale(76), backgroundColor: '#EF4444', justifyContent: 'center', alignItems: 'center' }}>
        <TouchableOpacity
          onPress={() => {
            snapClose();
            onDelete();
          }}
          style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#FFFFFF', marginTop: verticalScale(2) }}>Delete</Text>
        </TouchableOpacity>
      </View>
      <RNAnimated.View style={{ transform: [{ translateX }], backgroundColor: '#FFFFFF' }} {...panResponder.panHandlers}>
        {children}
      </RNAnimated.View>
    </View>
  );
};

export default function RabiesRecoveryApp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string }>();
  const { user, mrn, loading: authLoading } = usePatientAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Home' | 'Records'>('Home');

  useEffect(() => {
    if (params?.tab === 'Records') {
      setActiveTab('Records');
    } else if (params?.tab === 'Home') {
      setActiveTab('Home');
    }
  }, [params?.tab]);

  const userName = (() => {
    const name = user?.displayName || (user?.email ? user.email.split('@')[0] : '');
    return user?.isAnonymous || !name ? 'Guest Patient' : name;
  })();

  const [vaccineSchedule, setVaccineSchedule] = useState<VaccineDose[]>([]);
  const [patientRecord, setPatientRecord] = useState<PatientRecord | null>(null);
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [incidentsError, setIncidentsError] = useState('');

  // Notification State — derived from real data below (dose reminders, chat
  // replies); dismiss state persists to AsyncStorage per-patient so a cleared
  // notification stays cleared across app restarts, not just this session.
  const [dismissedNotifIds, setDismissedNotifIds] = useState<string[]>([]);
  const dismissedNotifsKey = `dismissedNotifs:${mrn || user?.uid || 'guest'}`;
  useEffect(() => {
    AsyncStorage.getItem(dismissedNotifsKey)
      .then(raw => setDismissedNotifIds(raw ? JSON.parse(raw) : []))
      .catch(() => setDismissedNotifIds([]));
  }, [dismissedNotifsKey]);
  const [readNotifIds, setReadNotifIds] = useState<string[]>([]);
  const [showNotifPanel, setShowNotifPanel] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'unread'>('all');
  const [chatThread, setChatThread] = useState<any | null>(null);
  // Appointments the clinic has accepted, newest decision first.
  const [confirmedAppts, setConfirmedAppts] = useState<ApptUpdate[]>([]);
  // Appointment ids already announced. `null` until the first snapshot lands so
  // the initial batch seeds the baseline instead of firing a burst of banners.
  const seenConfirmedIds = useRef<Set<string> | null>(null);
  const mainScrollViewRef = useRef<ScrollView>(null);

  const [clinicNotifs, setClinicNotifs] = useState<ClinicNotification[]>([]);
  // Ids acknowledged this session — keeps the button responsive immediately
  // rather than waiting for the Firestore round-trip.
  const [ackedIds, setAckedIds] = useState<string[]>([]);

  // Next Dose Notification State
  const [nextDoseNotif, setNextDoseNotif] = useState<NextDoseNotif | null>(null);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // 3D Landscape Card Flip State
  const flipAnim = useSharedValue(0);
  const [isFlippedState, setIsFlippedState] = useState(false);
  const [showEnlargeModal, setShowEnlargeModal] = useState(false);
  const [enlargeFlipped, setEnlargeFlipped] = useState(false);
  const cardFrontShotRef = useRef<ViewShot>(null);
  const cardBackShotRef = useRef<ViewShot>(null);
  const modalCardFrontShotRef = useRef<ViewShot>(null);
  const modalCardBackShotRef = useRef<ViewShot>(null);
  const [exportingCard, setExportingCard] = useState(false);

  const toggleCardFlip = () => {
    const nextVal = isFlippedState ? 0 : 1;
    setIsFlippedState(!isFlippedState);
    flipAnim.value = withTiming(nextVal, {
      duration: 450,
      easing: Easing.bezier(0.4, 0.0, 0.2, 1),
    });
  };

  const frontAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [0, 180]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
    };
  });

  const backAnimatedStyle = useAnimatedStyle(() => {
    const rotateY = interpolate(flipAnim.value, [0, 1], [180, 360]);
    return {
      transform: [{ perspective: 1200 }, { rotateY: `${rotateY}deg` }],
      backfaceVisibility: 'hidden',
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
    };
  });

  const handleExportFrontCard = async () => {
    if (exportingCard) return;
    const isBack = showEnlargeModal ? enlargeFlipped : isFlippedState;
    let targetRef = isBack ? cardBackShotRef : cardFrontShotRef;
    if (showEnlargeModal) {
      targetRef = isBack ? modalCardBackShotRef : modalCardFrontShotRef;
    }
    if (!targetRef.current?.capture) {
      Alert.alert('Export Unavailable', 'The card is still loading. Please try again in a moment.');
      return;
    }
    setExportingCard(true);
    try {
      const uri = await targetRef.current.capture();
      const canShare = await Sharing.isAvailableAsync();
      if (canShare) {
        await Sharing.shareAsync(uri, {
          mimeType: 'image/png',
          dialogTitle: isBack ? 'History of Exposure Record Card' : 'Anti-Rabies Vaccination Record Card',
        });
      } else {
        Alert.alert('Card Exported', `Image saved to photos: ${uri}`);
      }
    } catch (err: any) {
      Alert.alert('Export Failed', err?.message || 'Could not export record card.');
    } finally {
      setExportingCard(false);
    }
  };

  // The vaccination card lives inline in this Home feed. Other screens can
  // still deep-link to it with ?tab=Records, which just scrolls it into view.
  const { tab: tabParam } = useLocalSearchParams<{ tab?: string }>();

  useEffect(() => {
    if (tabParam === 'Records') {
      mainScrollViewRef.current?.scrollTo({ y: 340, animated: true });
    }
  }, [tabParam]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [logsError, setLogsError] = useState('');

  const [showWoundModal, setShowWoundModal] = useState(false);
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  const [description, setDescription] = useState('');
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);

  const [viewingLog, setViewingLog] = useState<LogEntry | null>(null);
  const [editingLog, setEditingLog] = useState<LogEntry | null>(null);
  const [editDesc, setEditDesc] = useState('');
  const [editSymptoms, setEditSymptoms] = useState<string[]>([]);

  useEffect(() => {
    if (!authLoading && !user) router.replace('/auth/login');
  }, [authLoading, user]);

  // Raise the OS permission prompt once the patient is signed in, rather than
  // at the moment the first appointment is confirmed — a prompt appearing then
  // would swallow the very banner it was asked for.
  useEffect(() => {
    if (user) ensureNotificationPermission();
  }, [user?.uid]);

  // Register this device for clinic-sent push notifications. Needs the MRN so
  // the server can attach the token to the right vaccination record; guests
  // have no MRN and are skipped.
  useEffect(() => {
    if (user && mrn) registerForPushNotifications(mrn);
  }, [user?.uid, mrn]);

  // Reads the same `vaccinations/{mrn}` doc the Admin Dashboard's Vaccination
  // Tracker writes to (see ka-clinic-admin/src/vaccination.jsx cycleStatus) —
  // guest sessions have no MRN, so no vaccination record exists for them.
  useEffect(() => {
    if (!mrn) { setVaccineSchedule([]); setNextDoseNotif(null); setPatientRecord(null); return; }
    const vaccineRef = doc(db, 'vaccinations', mrn);
    return onSnapshot(vaccineRef, (snap) => {
      if (!snap.exists()) { setVaccineSchedule([]); setNextDoseNotif(null); setPatientRecord(null); return; }
      const data: any = snap.data();
      setPatientRecord(data);
      const rawDoses: any[] = Array.isArray(data.doses) ? data.doses : [];
      if (rawDoses.length === 0) { setVaccineSchedule([]); setNextDoseNotif(null); return; }

      const vaccineType: 'Pre-Exposure' | 'Post-Exposure' = data.service === 'PrEP' ? 'Pre-Exposure' : 'Post-Exposure';
      const todayISO = new Date().toISOString().slice(0, 10);
      setVaccineSchedule(rawDoses.map((d, i) => {
        const rawStatus = d.status || d.s || 'pending';
        const rawDate: string | null = d.date || null;
        return {
          id: d.key || `d${i + 1}`,
          dose: i + 1,
          label: d.n || d.label || `Dose ${i + 1}`,
          date: formatDoseDate(d.date),
          rawDate,
          done: rawStatus === 'done',
          missed: rawStatus === 'miss' || (rawStatus !== 'done' && !!rawDate && rawDate < todayISO),
          vaccineType,
        };
      }));

      const next = rawDoses.find(d => (d.status || d.s) !== 'done');
      setNextDoseNotif(next ? {
        id: next.key || 'next',
        doseLabel: next.n || next.label || 'Next Dose',
        doseDate: formatDoseDate(next.date),
        message: `Scheduled visit for ${next.n || next.label || 'your next dose'} at K&A Main Clinic.`,
        sentAt: formatDoseDate(new Date().toISOString().slice(0, 10)),
      } : {
        id: 'complete',
        doseLabel: 'All Doses Completed',
        doseDate: 'Completed',
        message: 'You have completed your full vaccination protocol.',
        sentAt: formatDoseDate(new Date().toISOString().slice(0, 10)),
      });
    }, (err) => {
      console.error('Vaccination listener error:', err);
    });
  }, [mrn]);

  useEffect(() => {
    // Same top-level `incidents` collection ka-clinic-admin/src/incidents.jsx
    // pins to the Admin Dashboard's Incident Map. Resolved incidents are kept
    // (greyed, per the shared legend) so this map plots exactly what staff see
    // on the dashboard. Older docs carry `lat`/`lng` instead of the newer
    // `latitude`/`longitude`, so both spellings are accepted.
    const q = query(collection(db, 'incidents'), orderBy('pinnedAt', 'desc'));
    return onSnapshot(q, (snapshot) => {
      setIncidentsError('');
      setIncidents(
        snapshot.docs
          .map(d => {
            const data = d.data() as any;
            return {
              ...data,
              id: d.id,
              latitude: data.latitude ?? data.lat,
              longitude: data.longitude ?? data.lng,
            } as Incident;
          })
          .filter(inc => typeof inc.latitude === 'number' && typeof inc.longitude === 'number')
      );
    }, (err) => {
      console.error('Incidents listener error:', err);
      setIncidentsError(err?.code === 'permission-denied'
        ? 'Incident map is unavailable right now.'
        : 'Could not load nearby incidents.');
    });
  }, []);

  // Recovery Monitoring entries live in the SAME `vaccinations/{mrn}.woundLog`
  // array the Admin Dashboard's Wound / Clinical Log reads/writes (see
  // ka-clinic-admin/src/patients.jsx WoundLog component) — one shared log
  // per patient instead of a separate app-only collection, so a nurse's
  // clinical note and a patient's wound photo show up in the same place.
  useEffect(() => {
    if (!mrn) { setLogs([]); setLogsError(''); return; }
    if (!patientRecord) { setLogs([]); return; }
    const raw: any[] = Array.isArray(patientRecord.woundLog) ? patientRecord.woundLog : [];
    const sorted = [...raw].sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
    setLogsError('');
    setLogs(sorted.map((entry, i) => {
      const createdDate = new Date(entry.createdAt || Date.now());
      return {
        id: entry.id || `log${i}`,
        type: entry.type || (entry.photoUrl ? 'wound' : 'note'),
        note: entry.note || '',
        photoUrl: entry.photoUrl || null,
        symptoms: Array.isArray(entry.symptoms) ? entry.symptoms : [],
        by: entry.by || 'Patient',
        time: createdDate.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
        date: entry.date || createdDate.toLocaleDateString([], { month: 'short', day: 'numeric' }),
        createdAt: entry.createdAt || 0,
      };
    }));
  }, [patientRecord, mrn]);

  // Clinic-sent follow-ups (manual "Send Follow-up" from the dashboard, and
  // the automatic due-dose sweep). Delivered as push when the app is closed;
  // this listener is what surfaces them in the in-app notification centre and
  // carries the id the "I received this" button acknowledges.
  useEffect(() => {
    if (!mrn) { setClinicNotifs([]); return; }
    const q = query(
      collection(db, 'patientNotifications'),
      where('patientId', '==', mrn),
      orderBy('createdAt', 'desc'),
      limit(20),
    );
    return onSnapshot(q, (snap) => {
      setClinicNotifs(snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ClinicNotification)));
    }, () => setClinicNotifs([]));
  }, [mrn]);

  // Read-only peek at this patient's most recent escalated admin thread
  // (chatThreads is now one doc per escalation, not one per patient — see
  // app/(tabs)/chat.tsx startEscalation) purely to surface an "admin
  // replied" notification here.
  useEffect(() => {
    if (!user) { setChatThread(null); return; }
    const q = query(collection(db, 'chatThreads'), where('patientUid', '==', user.uid), orderBy('lastMessageAt', 'desc'), limit(1));
    return onSnapshot(q, (snap) => {
      setChatThread(snap.empty ? null : snap.docs[0].data());
    }, () => setChatThread(null));
  }, [user?.uid]);

  // Watches this patient's own appointment docs so an admin decision made in
  // the dashboard surfaces here without a refresh. Mirrors the query in
  // app/(tabs)/appt.tsx, which the Firestore rules scope to `userId`.
  useEffect(() => {
    if (!user) {
      setConfirmedAppts([]);
      seenConfirmedIds.current = null;
      return;
    }
    const q = query(collection(db, 'appointments'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const confirmed = snap.docs
        .map(d => ({ id: d.id, ...(d.data() as any) } as ApptUpdate))
        .filter(a => CONFIRMED_STATUSES.includes(a.status))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      // First snapshot only seeds the baseline — otherwise every appointment
      // the patient already knew about would re-fire a banner on each launch.
      if (seenConfirmedIds.current === null) {
        seenConfirmedIds.current = new Set(confirmed.map(a => a.id));
      } else {
        confirmed
          .filter(a => !seenConfirmedIds.current!.has(a.id))
          .forEach(a => {
            seenConfirmedIds.current!.add(a.id);
            presentLocalNotification(
              'Appointment Confirmed',
              `K&A Clinic accepted your ${formatApptDate(a.date)} appointment${a.time ? ` at ${a.time}` : ''}.`,
              { appointmentId: a.id, screen: 'appt' },
            );
          });
      }
      setConfirmedAppts(confirmed);
    }, (err) => {
      console.error('Appointment notification listener error:', err);
      setConfirmedAppts([]);
    });
  }, [user?.uid]);

  // ── Notifications: derived from real, already-fetched data ───────────────
  const notifications: AppNotification[] = (() => {
    const list: AppNotification[] = [];
    clinicNotifs.forEach(c => {
      list.push({
        id: `clinic-${c.id}`,
        notificationId: c.id,
        title: c.title || 'Message from K&A Clinic',
        message: c.message || '',
        time: c.createdAt ? new Date(c.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric' }) : '',
        unread: true,
        type: 'followup',
        acknowledged: !!c.acknowledged || ackedIds.includes(c.id),
      });
    });
    if (nextDoseNotif && nextDoseNotif.id !== 'complete') {
      list.push({
        id: `dose-${nextDoseNotif.id}`,
        title: 'Upcoming Vaccination Dose',
        message: `Your ${nextDoseNotif.doseLabel} is scheduled for ${nextDoseNotif.doseDate} at K&A Clinic.`,
        time: nextDoseNotif.doseDate,
        unread: true,
        type: 'dose',
      });
    }
    confirmedAppts.slice(0, 3).forEach(a => {
      list.push({
        id: `appt-${a.id}`,
        title: 'Appointment Confirmed',
        message: `K&A Clinic accepted your ${a.type || 'appointment'} on ${formatApptDate(a.date)}${a.time ? ` at ${a.time}` : ''}.${a.note ? ` Clinic: ${a.note}` : ''}`,
        time: formatApptDate(a.date),
        unread: true,
        type: 'appointment',
      });
    });
    if (chatThread?.lastMessage && chatThread?.status === 'replied') {
      list.push({
        id: `chat-${chatThread.lastMessageAt || 'latest'}`,
        title: 'New Message from K&A Clinic',
        message: chatThread.lastMessage,
        time: chatThread.lastMessageAt ? new Date(chatThread.lastMessageAt).toLocaleString() : '',
        unread: true,
        type: 'system',
      });
    }
    incidents.slice(0, 1).forEach(inc => {
      list.push({
        id: `incident-${inc.id}`,
        title: 'Geospatial Rabies Advisory',
        message: `${inc.type || 'Bite incident'}${inc.category ? ` (${inc.category})` : ''} reported near ${inc.location || 'your area'}.`,
        time: '',
        unread: false,
        type: 'map',
      });
    });
    return list
      .filter(n => !dismissedNotifIds.includes(n.id))
      .map(n => ({ ...n, unread: n.unread && !readNotifIds.includes(n.id) }));
  })();



  const unreadCount = notifications.filter(n => n.unread).length;

  const markAllNotifsRead = () => {
    setReadNotifIds(prev => Array.from(new Set([...prev, ...notifications.map(n => n.id)])));
  };

  const clearNotifs = () => {
    const next = Array.from(new Set([...dismissedNotifIds, ...notifications.map(n => n.id)]));
    setDismissedNotifIds(next);
    AsyncStorage.setItem(dismissedNotifsKey, JSON.stringify(next)).catch(() => {});
  };

  // Confirms receipt back to the clinic. Optimistic: the button flips to its
  // confirmed state right away and only reverts if the request actually fails.
  const confirmReceipt = async (notificationId?: string) => {
    if (!notificationId || ackedIds.includes(notificationId)) return;
    setAckedIds(prev => [...prev, notificationId]);
    const ok = await acknowledgeNotification(notificationId);
    if (!ok) setAckedIds(prev => prev.filter(x => x !== notificationId));
  };

  const deleteNotification = (id: string) => {
    const next = Array.from(new Set([...dismissedNotifIds, id]));
    setDismissedNotifIds(next);
    AsyncStorage.setItem(dismissedNotifsKey, JSON.stringify(next)).catch(() => {});
  };

  const handleMediaAction = async (useCamera: boolean) => {
    const { status } = useCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (status !== 'granted') return Alert.alert('Permission Denied');
    const result = useCamera
      ? await ImagePicker.launchCameraAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ allowsEditing: true, aspect: [1, 1], quality: 0.7 });
    if (!result.canceled) {
      setSelectedImage(result.assets[0].uri);
      setShowWoundModal(true);
    }
  };

  const saveLog = async () => {
    if (!mrn) { Alert.alert('No linked patient record', 'Recovery entries need a clinic MRN on your account.'); return; }
    if (!selectedImage && !description.trim() && symptoms.length === 0) {
      Alert.alert('Nothing to save', 'Add a photo, a note, or a symptom before saving.');
      return;
    }
    setUploading(true);
    let photoUrl: string | null = null;
    if (selectedImage) {
      try {
        photoUrl = await uploadToCloudinary(selectedImage);
      } catch (e) {
        // Previously this only warned and saved the entry anyway, so a failed
        // upload silently produced a photo entry with no photo — the clinic
        // would see a note where the patient believed they had sent an image.
        console.warn('Cloudinary upload failed:', e);
        setUploading(false);
        Alert.alert(
          'Photo upload failed',
          'Your photo could not be uploaded, so nothing was saved. Check your connection and try again.'
        );
        return;
      }
    }
    try {
      const composedNote = symptoms.length
        ? `Symptoms: ${symptoms.join(', ')}.${description.trim() ? ' ' + description.trim() : ''}`
        : description.trim();
      const entry = {
        id: Date.now().toString(),
        type: selectedImage ? 'wound' : 'note',
        note: composedNote,
        photoUrl,
        symptoms: [...symptoms],
        by: 'Patient (App)',
        date: formatDoseDate(new Date().toISOString().slice(0, 10)),
        createdAt: Date.now(),
      };
      // Re-read the document rather than appending to the copy in local state.
      // Staff add entries to the same array from the dashboard, so a stale
      // local copy would drop whatever they added since this screen loaded —
      // and the security rule rejects a shrinking woundLog outright.
      const ref = doc(db, 'vaccinations', mrn);
      const fresh = await getDoc(ref);
      const existing: any[] = Array.isArray(fresh.data()?.woundLog) ? fresh.data()!.woundLog : [];
      await updateDoc(ref, { woundLog: [...existing, entry] });
      closeModal();
    } catch (e: any) {
      Alert.alert('Could not save entry', e?.code === 'permission-denied'
        ? 'You do not have permission to save recovery entries.'
        : (e?.message || 'Please try again.'));
    } finally {
      setUploading(false);
    }
  };

  const closeModal = () => {
    setShowWoundModal(false);
    setSelectedImage(null);
    setDescription('');
    setSymptoms([]);
  };

  const toggleSymptom = (sym: string) =>
    setSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);

  const deleteLog = (id: string) =>
    Alert.alert('Delete Entry', 'Remove this log entry?', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: async () => {
        if (!mrn) return;
        try {
          const existing: any[] = Array.isArray(patientRecord?.woundLog) ? patientRecord!.woundLog : [];
          await updateDoc(doc(db, 'vaccinations', mrn), { woundLog: existing.filter(e => e.id !== id) });
          setViewingLog(null);
        } catch (e: any) {
          Alert.alert('Could not delete entry', e?.message || 'Please try again.');
        }
      } },
    ]);

  const openEdit = (log: LogEntry) => {
    setViewingLog(null);
    setEditingLog(log);
    setEditDesc(log.note);
    setEditSymptoms([...log.symptoms]);
  };

  const saveEdit = async () => {
    if (!editingLog || !mrn) return;
    try {
      const composedNote = editSymptoms.length
        ? `Symptoms: ${editSymptoms.join(', ')}.${editDesc.trim() ? ' ' + editDesc.trim() : ''}`
        : editDesc.trim();
      const existing: any[] = Array.isArray(patientRecord?.woundLog) ? patientRecord!.woundLog : [];
      const updated = existing.map(e => e.id === editingLog.id ? { ...e, note: composedNote, symptoms: [...editSymptoms] } : e);
      await updateDoc(doc(db, 'vaccinations', mrn), { woundLog: updated });
      setEditingLog(null);
    } catch (e: any) {
      Alert.alert('Could not save changes', e?.message || 'Please try again.');
    }
  };

  const toggleEditSym = (sym: string) =>
    setEditSymptoms(prev => prev.includes(sym) ? prev.filter(s => s !== sym) : [...prev, sym]);

  if (authLoading) return <View style={s.loader}><ActivityIndicator size="large" color={C.red} /></View>;

  const completedDoses = vaccineSchedule.filter(d => d.done).length;
  const progress = vaccineSchedule.length > 0 ? (completedDoses / vaccineSchedule.length) * 100 : 0;
  const vaccineType = vaccineSchedule[0]?.vaccineType ?? 'Post-Exposure';

  // Real regimen label — derived from the same `service`/dose-count data the
  // Admin Dashboard's Vaccination Tracker uses, not a hardcoded placeholder.
  const protocolLabel = patientRecord?.service === 'PrEP'
    ? `Pre-Exposure Prophylaxis${vaccineSchedule.length ? ` · ${vaccineSchedule.length}-Dose Series` : ''}`
    : vaccineSchedule.length > 0
      ? `Post-Exposure ARV Protocol · ${vaccineSchedule.length}-Dose Series`
      : 'Post-Exposure Prophylaxis Protocol';

  const displayedNotifications = notifFilter === 'unread' ? notifications.filter(n => n.unread) : notifications;

  // Real patient-record fields for the Vaccination Card — mirrors the exact
  // field names ka-clinic-admin/src/patients.jsx writes to `vaccinations/{mrn}`.
  // Guests have no clinic record at all, so the card shows blanks rather than
  // the sample-data placeholders used while a real patient's record is loading.
  const isGuest = !!user?.isAnonymous;
  const pr = patientRecord || {};
  // Guests have no clinical record — show a dash instead of the sample-data
  // placeholder a loading real patient record would otherwise fall back to.
  const blank = (val: any, sample: string) => val || (isGuest ? '—' : sample);
  const catValue = String(pr.cat || '').replace(/Category\s*/i, '').trim().toUpperCase();

  const fullName = pr.name || (isGuest ? '' : user?.displayName || 'Dela Cruz, Juan Manuel');
  const isCommaFormat = fullName.includes(',');
  const nameParts = isCommaFormat ? fullName.split(',').map((str: string) => str.trim()) : fullName.trim().split(' ');

  const lastNameVal = pr.lastName || (isGuest ? '—' : (isCommaFormat ? nameParts[0] : (nameParts.length > 1 ? nameParts[nameParts.length - 1] : 'Dela Cruz')));
  const firstNameVal = pr.firstName || (isGuest ? '—' : (isCommaFormat ? nameParts[1] : nameParts[0]) || 'Juan');
  const middleNameVal = pr.middleName || (isGuest ? '' : (nameParts.length > 2 ? nameParts[2] : 'Manuel'));
  const miVal = middleNameVal ? middleNameVal.charAt(0).toUpperCase() + '.' : (isGuest ? '—' : 'M.');
  const dobVal = pr.dob || (isGuest ? '—' : '04/12/1995');
  const mrnVal = mrn ? `MRN-${mrn}` : (pr.id ? `MRN-${pr.id}` : (isGuest ? 'No MRN (Guest)' : 'MRN-2026-8842'));
  const purposeVal = pr.service === 'PrEP' ? 'Pre-Exposure Prophylaxis (PrEP)' : (isGuest ? '—' : 'Post-Exposure Prophylaxis (PEP)');
  const catVal = pr.cat ? `Category ${pr.cat}` : (catValue ? `Category ${catValue}` : (isGuest ? '—' : 'Category II (Moderate Risk)'));
  const doseList = (Array.isArray(pr.doses) && pr.doses.length > 0)
    ? pr.doses
    : (vaccineSchedule.length > 0 ? vaccineSchedule : (isGuest ? GUEST_PLACEHOLDER_DOSES : DEFAULT_RECORD_DOSES));

  // Progress tracker shows the same placeholder rows for guests, all unchecked.
  const trackerDoses: any[] = vaccineSchedule.length > 0
    ? vaccineSchedule
    : (isGuest ? GUEST_PLACEHOLDER_DOSES : vaccineSchedule);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView ref={mainScrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>

        {/* ── TOP SECTION: EXACT GRADIENT (#FF7171 to #9B2020) ── */}
        <View style={s.topMeshSection}>
          <LinearGradient
            colors={['#FF7171', '#9B2020']}
            style={StyleSheet.absoluteFillObject}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          />

          {/* Direct Home Greeting Header */}
          <View style={s.topBarDirect}>
            <View style={{ flex: 1, paddingRight: scale(12) }}>
              <Text style={s.hiText}>Hello, {userName || 'Guest Patient'}</Text>
              <Text style={s.feelingText}>How are you feeling today?</Text>
            </View>
            <TouchableOpacity style={s.notifBtnGlass} onPress={() => setShowNotifPanel(true)} activeOpacity={0.8}>
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
              {unreadCount > 0 && <View style={s.notifDotGlass} />}
            </TouchableOpacity>
          </View>
        </View>

        {/* ── MAIN CONTENT CONTAINER ── */}
        <View style={s.mainContentContainer}>
          <>
              {/* Harmonious Clean Next Dose Protocol Card */}
              <TouchableOpacity 
                style={s.nextDoseNavyCard} 
                activeOpacity={0.9}
                onPress={() => setShowProgressModal(true)}
              >
                <View style={s.nextDoseNavyDecor} pointerEvents="none" />

                <View style={s.nextDoseNavyIconBox} pointerEvents="none">
                  <Ionicons name="calendar-outline" size={22} color="#475569" />
                </View>

                <View style={{ flex: 1 }} pointerEvents="none">
                  {vaccineSchedule.length > 0 && (
                    <View style={s.nextDoseNavyPillRow}>
                      <Text style={s.nextDoseProgressBadge}>
                        {completedDoses}/{vaccineSchedule.length} Doses Completed
                      </Text>
                    </View>
                  )}
                  <Text style={s.nextDoseNavyDose}>
                    {nextDoseNotif?.doseLabel ?? (isGuest ? 'No Dose Record' : 'Day 07 (3rd Dose)')}
                  </Text>
                  {(nextDoseNotif || !isGuest) && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(5), marginTop: verticalScale(2) }}>
                      <Ionicons name="time-outline" size={13} color="#64748B" />
                      <Text style={s.nextDoseNavyDate}>
                        {nextDoseNotif?.doseDate ?? 'Mar 8, 2026'}
                      </Text>
                    </View>
                  )}
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(4), marginTop: verticalScale(5) }}>
                    <Text style={s.tapProgressHintNavy}>
                      {isGuest ? 'Sign up to track your doses' : 'Tap to view protocol tracker'}
                    </Text>
                    <Ionicons name="arrow-forward" size={11} color="#475569" />
                  </View>
                </View>

                <View style={s.nextDoseArrowBox} pointerEvents="none">
                  <Ionicons name="chevron-forward" size={18} color="#475569" />
                </View>
              </TouchableOpacity>

              {/* ── OFFICIAL VACCINATION RECORD CARD (3D FLIP) ── */}
              <View style={s.cdcOfficialCardContainer}>
                <TouchableOpacity activeOpacity={0.96} onPress={toggleCardFlip} style={{ width: '100%', height: '100%' }}>

                  {/* FRONT SIDE (LANDSCAPE) */}
                  <Animated.View style={[s.cdcOfficialCardPaper, frontAnimatedStyle]}>
                    <ViewShot ref={cardFrontShotRef} options={{ format: 'png', quality: 1 }} style={{ flex: 1 }}>
                    <View style={s.cdcHeaderBlock}>
                      <View style={s.cdcHeaderTitleRow}>
                        <Image source={require('../../assets/logo-white-nobg.png')} style={s.knAClinicLogoHeader} resizeMode="contain" />
                        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={s.cdcClinicHeaderTitle}>K&A ANIMAL BITE CENTER & CLINIC</Text>
                          <Text style={s.cdcCardTitle}>ANTI-RABIES VACCINATION RECORD CARD</Text>
                          <Text style={s.cdcCardSubtext}>Official Prophylaxis & Immunization Record</Text>
                        </View>
                      </View>
                    </View>

                    <View style={s.cdcRuleDivider} />

                    {/* Patient Demographics */}
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Last Name</Text>
                        <Text style={s.cdcFieldValue}>{lastNameVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>First Name</Text>
                        <Text style={s.cdcFieldValue}>{firstNameVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 0.6 }]}>
                        <Text style={s.cdcFieldLabel}>MI</Text>
                        <Text style={s.cdcFieldValue}>{miVal}</Text>
                      </View>
                    </View>

                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Date of birth</Text>
                        <Text style={s.cdcFieldValue}>{dobVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 2 }]}>
                        <Text style={s.cdcFieldLabel}>Patient number (MRN)</Text>
                        <Text style={s.cdcFieldValue}>{mrnVal}</Text>
                      </View>
                    </View>

                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                        <Text style={s.cdcFieldLabel}>Vaccination Purpose</Text>
                        <Text style={s.cdcFieldValue}>{purposeVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Category</Text>
                        <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{catVal}</Text>
                      </View>
                    </View>

                    {/* Official Vaccination Schedule Table (3 Columns: Dose, Vaccine/Dosage, Date) */}
                    <View style={s.cdcTableContainer}>
                      <View style={s.cdcTableHeaderRow}>
                        <Text style={[s.cdcTableCellHeader, { flex: 1.1 }]}>Dose</Text>
                        <Text style={[s.cdcTableCellHeader, { flex: 2.1 }]}>Vaccine / Dosage</Text>
                        <Text style={[s.cdcTableCellHeader, { flex: 1.1, borderRightWidth: 0 }]}>Date</Text>
                      </View>

                      {doseList.map((d: any, idx: number) => {
                        const brandStr = d.vaccineBrand || d.b || pr.vaccineBrand || 'Speeda ARV';
                        const dosageStr = d.dosage || pr.route || '0.5 mL';
                        const lotStr = d.lot || 'Lot #2026-08A';
                        // Guest placeholder rows carry a label but no clinical data.
                        const vaccineCell = d.blankRow ? '—' : `${brandStr} (${dosageStr}) · ${lotStr}`;
                        const dateCell = d.blankRow
                          ? '—'
                          : (d.date ? formatDoseDate(d.date) : (pr.date ? formatDoseDate(pr.date) : '08/04/26'));
                        return (
                          <View key={d.id || d.key || idx} style={[s.cdcTableRow, idx % 2 === 1 && s.cdcTableRowAlt]}>
                            <Text style={[s.cdcTableCell, { flex: 1.1, fontWeight: '700', color: '#0F172A' }]} numberOfLines={1}>
                              {d.label || d.n || d.name || `Dose ${idx + 1}`}
                            </Text>
                            <Text style={[s.cdcTableCell, { flex: 2.1, fontWeight: '600' }]} numberOfLines={1}>
                              {vaccineCell}
                            </Text>
                            <Text style={[s.cdcTableCell, { flex: 1.1, borderRightWidth: 0 }]} numberOfLines={1}>
                              {dateCell}
                            </Text>
                          </View>
                        );
                      })}
                    </View>

                    </ViewShot>
                  </Animated.View>

                  {/* BACK SIDE (LANDSCAPE) */}
                  <Animated.View style={[s.cdcOfficialCardPaper, backAnimatedStyle]}>
                    <ViewShot ref={cardBackShotRef} options={{ format: 'png', quality: 1 }} style={{ flex: 1 }}>
                    <View style={s.cdcHeaderBlock}>
                      <View style={s.cdcHeaderTitleRow}>
                        <Image source={require('../../assets/logo-white-nobg.png')} style={s.knAClinicLogoHeader} resizeMode="contain" />
                        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={s.cdcClinicHeaderTitle}>K&A ANIMAL BITE CENTER & CLINIC</Text>
                          <Text style={s.cdcCardTitle}>HISTORY OF EXPOSURE & CLINICAL RECORD</Text>
                          <Text style={s.cdcCardSubtext}>Clinical Exposure History & Medical Profile</Text>
                        </View>
                      </View>
                    </View>

                    <View style={s.cdcRuleDivider} />

                    {/* Incident & Exposure Profile Fields */}
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Date</Text>
                        <Text style={s.cdcFieldValue}>{pr.date ? formatDoseDate(pr.date) : (isGuest ? '—' : formatDoseDate(pr.date))}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Type</Text>
                        <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{blank(pr.typeOfExposure, 'Bite / Scratch')}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Source Animal</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.sourceOfExposure || pr.animal, 'Stray animal')}</Text>
                      </View>
                    </View>
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 2 }]}>
                        <Text style={s.cdcFieldLabel}>Location / Place of Exposure</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.placeOfExposure || pr.address, 'San Juan')}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Category</Text>
                        <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{blank(pr.category, 'Category II')}</Text>
                      </View>
                    </View>

                    {/* Patient Clinical Profile Fields */}
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Age / Sex</Text>
                        <Text style={s.cdcFieldValue}>{pr.age ? `${pr.age} yrs • ${pr.sex}` : (isGuest ? '—' : '21 yrs • Female')}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Tetanus History</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.lastTetanus || pr.tetanusStatus, 'Unknown')}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Known Allergies</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.allergies, 'None')}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Contact Number</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.contact, '+639074452442')}</Text>
                      </View>
                    </View>

                    {/* Attending Notes Sub-Box */}
                    <View style={s.attendingNotesBox}>
                      <Text style={s.cdcFieldLabel}>Attending Physician / Clinical Protocol Notes</Text>
                      <Text style={s.attendingNotesTxt}>
                        {blank(pr.notes || pr.clinicalNotes, 'Patient started on PEP protocol. 10-day animal observation active for source animal.')}
                      </Text>
                    </View>
                    </ViewShot>
                  </Animated.View>
                </TouchableOpacity>
              </View>

              {/* Standalone Plain Text & Enlarge Button BELOW Card (NO CARD BOX ON TEXT) */}
              <View style={s.cardExternalControlsRow}>
                <TouchableOpacity onPress={toggleCardFlip} activeOpacity={0.7} style={{ paddingVertical: verticalScale(4) }}>
                  <Text style={s.plainHintTxt}>
                    {isFlippedState ? 'Showing Back (Exposure Record) · Tap to Flip' : 'Showing Front (Vaccination Card) · Tap to Flip'}
                  </Text>
                </TouchableOpacity>

                <TouchableOpacity style={s.enlargeCardBtn} onPress={() => setShowEnlargeModal(true)} activeOpacity={0.85}>
                  <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
                  <Text style={s.enlargeCardBtnTxt}>Enlarge Card</Text>
                </TouchableOpacity>
              </View>

              {/* ── RECOVERY MONITORING ── */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionAccent} />
                  <Text style={s.sectionTitle}>Recovery Monitoring</Text>
                </View>

                {/* One Single Unified Action Card Container */}
                <View style={s.unifiedActionCard}>
                  {/* Take Photo */}
                  <TouchableOpacity 
                    style={s.unifiedActionItem} 
                    onPress={() => handleMediaAction(true)} 
                    activeOpacity={0.85}
                  >
                    <View style={s.hubIconBoxCameraSolid}>
                      <Ionicons name="camera" size={20} color="#FFFFFF" />
                    </View>
                    <Text style={s.hubTitleCol} numberOfLines={1}>Take Photo</Text>
                    <Text style={s.hubDescCol} numberOfLines={1}>Camera</Text>
                  </TouchableOpacity>

                  {/* Vertical Divider */}
                  <View style={s.unifiedCardDivider} />

                  {/* Upload Photo */}
                  <TouchableOpacity 
                    style={s.unifiedActionItem} 
                    onPress={() => handleMediaAction(false)} 
                    activeOpacity={0.85}
                  >
                    <View style={s.hubIconBoxGallerySolid}>
                      <Ionicons name="image" size={20} color="#FFFFFF" />
                    </View>
                    <Text style={s.hubTitleCol} numberOfLines={1}>Upload Photo</Text>
                    <Text style={s.hubDescCol} numberOfLines={1}>Gallery</Text>
                  </TouchableOpacity>

                  {/* Vertical Divider */}
                  <View style={s.unifiedCardDivider} />

                  {/* Add Recovery Note */}
                  <TouchableOpacity 
                    style={s.unifiedActionItem} 
                    onPress={() => { setSelectedImage(null); setShowWoundModal(true); }} 
                    activeOpacity={0.85}
                  >
                    <View style={s.hubIconBoxNoteSolid}>
                      <Ionicons name="document-text" size={20} color="#FFFFFF" />
                    </View>
                    <Text style={s.hubTitleCol} numberOfLines={1}>Add Note</Text>
                    <Text style={s.hubDescCol} numberOfLines={1}>Log progress</Text>
                  </TouchableOpacity>
                </View>
              </View>

              {/* ── RECOVERY TIMELINE ── */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionAccent} />
                  <Text style={s.sectionTitle}>Recovery Timeline</Text>

                  {logs.length > 0 && (
                    <TouchableOpacity 
                      style={s.seeAllLinkBtn} 
                      onPress={() => router.push('/recovery-timeline')}
                      activeOpacity={0.8}
                    >
                      <Text style={s.seeAllLinkText}>See All</Text>
                      <Ionicons name="chevron-forward" size={14} color="#E31837" />
                    </TouchableOpacity>
                  )}
                </View>

                {logsError ? (
                  <View style={s.emptyState}>
                    <Ionicons name="alert-circle-outline" size={28} color={C.red} />
                    <Text style={s.emptyTitle}>{logsError}</Text>
                  </View>
                ) : logs.length === 0 ? (
                  <View style={s.emptyState}>
                    <PawIllustration />
                    <Text style={s.emptyTitle}>No Entries Yet</Text>
                    <Text style={s.emptySubText}>Tap above to log your first wound photo or note!</Text>
                  </View>
                ) : (
                  <View style={s.timelineContainerSimple}>
                    {/* Display maximum of 4 most recent entries on Home dashboard */}
                    {logs.slice(0, 4).map((log, idx) => (
                      <TouchableOpacity
                        key={log.id}
                        style={[s.timelineRowSimple, idx === Math.min(logs.length, 4) - 1 && s.timelineRowSimpleLast]}
                        onPress={() => setViewingLog(log)}
                        activeOpacity={0.6}
                      >
                        {/* Icon badge */}
                        <View style={s.timelineRowIconBox}>
                          <Ionicons
                            name={log.type === 'wound' ? 'camera-outline' : 'document-text-outline'}
                            size={scale(24)}
                            color={C.slate}
                          />
                        </View>

                        {/* Date/Time as Title + note preview */}
                        <View style={{ flex: 1 }}>
                          <Text style={s.timelineRowTitle} numberOfLines={1}>
                            {log.date} · {log.time}
                          </Text>
                          {log.note ? (
                            <Text style={s.timelineRowSnippet} numberOfLines={1}>{log.note}</Text>
                          ) : log.photoUrl ? (
                            <Text style={s.timelineRowSnippetPhoto}>Wound photo attached</Text>
                          ) : (
                            <Text style={s.timelineRowSnippetEmpty}>No additional text</Text>
                          )}
                        </View>

                        <Ionicons name="chevron-forward" size={scale(22)} color="#C4CDD8" />
                      </TouchableOpacity>
                    ))}

                  </View>
                )}

                {/* View All Button when > 4 entries — sits below the card, not inside it */}
                {logs.length > 4 && (
                  <TouchableOpacity
                    style={s.seeAllFooterBtn}
                    onPress={() => router.push('/recovery-timeline')}
                    activeOpacity={0.85}
                  >
                    <Text style={s.seeAllFooterText}>View All {logs.length} Log Entries</Text>
                    <Ionicons name="chevron-forward" size={14} color="#E31837" />
                  </TouchableOpacity>
                )}
              </View>

              {/* ── INCIDENT MAP ── */}
              <View style={s.section}>
                <View style={s.sectionHeader}>
                  <View style={s.sectionAccent} />
                  <Text style={s.sectionTitle}>Incident Map</Text>
                </View>

                {incidentsError ? (
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), paddingHorizontal: scale(20), marginBottom: verticalScale(10) }}>
                    <Ionicons name="alert-circle-outline" size={14} color={C.red} />
                    <Text style={{ color: C.red, fontSize: moderateScale(12) }}>{incidentsError}</Text>
                  </View>
                ) : null}

                <View style={s.elevatedMapFrame}>
                  <MapViewContainer
                    view={LIBON_MAP_VIEW}
                    markers={incidents.map(inc => ({
                      id: inc.id,
                      latitude: inc.latitude,
                      longitude: inc.longitude,
                      title: inc.location || 'Libon, Albay',
                      category: inc.category,
                      status: inc.status || 'active',
                      date: inc.date,
                    }))}
                  />
                </View>

                {/* Case list — same `incidents` collection/dataset as the map
                    above, mirroring the Admin Dashboard's incident sidebar. */}
                {incidents.length === 0 ? (
                  <View style={s.emptyState}>
                    <Ionicons name="shield-checkmark-outline" size={28} color="#94A3B8" />
                    <Text style={s.emptyTitle}>No Reported Cases</Text>
                    <Text style={s.emptySubText}>Bite incidents reported in your area will appear here.</Text>
                  </View>
                ) : (
                  <View style={s.timelineContainerSimple}>
                    {incidents.map((inc, idx) => {
                      const sev = getSeverityStyle(inc.category, inc.status);
                      return (
                        <View
                          key={inc.id}
                          style={[s.caseRow, idx === incidents.length - 1 && s.timelineRowSimpleLast]}
                        >
                          <View style={[s.caseStatusDot, { backgroundColor: sev.dotColor }]} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.timelineRowTitle} numberOfLines={1}>
                              {inc.location || inc.barangay || 'Libon, Albay'}
                            </Text>
                            <Text style={s.timelineRowSnippet} numberOfLines={1}>
                              {(inc.category || inc.type || 'Bite incident')}{inc.date ? ` · ${inc.date}` : ''}
                            </Text>
                          </View>
                        </View>
                      );
                    })}
                  </View>
                )}
              </View>
          </>
        </View>

      </ScrollView>

      {/* ── PROGRESS TRACKER POP-UP BANNER MODAL ── */}
      <Modal visible={showProgressModal} animationType="slide" transparent>
        <View style={s.centeredOverlay}>
          <View style={s.progressBannerSheet}>
            {/* Dark Navy / Midnight Header (matching reference modal) */}
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.trackerDarkHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.trackerDarkHeaderTitle}>{protocolLabel}</Text>
                <Text style={s.trackerDarkHeaderSub}>
                  {isGuest && vaccineSchedule.length === 0
                    ? 'No dose record — sign up to start tracking'
                    : `${completedDoses} of ${vaccineSchedule.length || 5} Doses Completed · ${Math.round(progress)}% Immunized`}
                </Text>
              </View>
              <TouchableOpacity
                onPress={() => setShowProgressModal(false)}
                style={s.trackerDarkCloseBtn}
                activeOpacity={0.8}
              >
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            {/* Enhanced Dose Timeline List */}
            <ScrollView style={s.trackerTimelineScroll} showsVerticalScrollIndicator={false}>
              <View style={s.iosNotesDoseList}>
                {trackerDoses.map((d: any, i: number) => {
                  // Guest placeholder rows are all plain "Upcoming" — nothing is
                  // actually scheduled, so none of them is the next dose.
                  const isNext = !d.blankRow && !d.done && trackerDoses.findIndex((x: any) => !x.done) === i;
                  const isLast = i === trackerDoses.length - 1;
                  const isMissed = d.missed;

                  return (
                    <View
                      key={d.id}
                      style={[
                        s.iosNotesDoseRow,
                        isNext && s.iosNotesDoseRowNext,
                        isLast && s.iosNotesDoseRowLast,
                      ]}
                    >
                      {/* Left status icon indicator */}
                      <View style={s.iosNotesStatusBox}>
                        {d.done ? (
                          <Ionicons name="checkmark-circle" size={scale(20)} color="#10B981" />
                        ) : isMissed ? (
                          <Ionicons name="alert-circle" size={scale(20)} color="#EF4444" />
                        ) : isNext ? (
                          <Ionicons name="time" size={scale(20)} color="#2563EB" />
                        ) : (
                          <Ionicons name="ellipse-outline" size={scale(20)} color="#CBD5E1" />
                        )}
                      </View>

                      {/* Dose Title & Secondary Status Date Info */}
                      <View style={{ flex: 1 }}>
                        <Text style={[s.iosNotesDoseTitle, isNext && s.iosNotesDoseTitleNext]}>
                          {d.label}
                        </Text>
                        <Text style={[
                          s.iosNotesDoseSubtitle,
                          d.done && { color: '#059669', fontWeight: '600' },
                          isNext && { color: '#2563EB', fontWeight: '700' },
                          isMissed && { color: '#DC2626', fontWeight: '700' },
                        ]}>
                          {d.blankRow ? 'Not yet scheduled' : d.done ? `Administered · ${d.date}` : isNext ? `Scheduled · ${d.date}` : isMissed ? `Overdue · ${d.date}` : `Scheduled · ${d.date}`}
                        </Text>
                      </View>

                      {/* Right Status Badge */}
                      <View style={[
                        s.doseStatusBadge,
                        d.done ? s.doseStatusBadgeDone : isNext ? s.doseStatusBadgeNext : isMissed ? s.doseStatusBadgeMissed : s.doseStatusBadgeUpcoming
                      ]}>
                        <Text style={[
                          s.doseStatusText,
                          d.done ? s.doseStatusTextDone : isNext ? s.doseStatusTextNext : isMissed ? s.doseStatusTextMissed : s.doseStatusTextUpcoming
                        ]}>
                          {d.done ? 'Completed' : isNext ? 'Next Up' : isMissed ? 'Overdue' : 'Upcoming'}
                        </Text>
                      </View>
                    </View>
                  );
                })}
              </View>
            </ScrollView>

            {/* Footer */}
            <View style={s.trackerFooter}>
              <TouchableOpacity style={s.trackerFooterCloseBtn} onPress={() => setShowProgressModal(false)} activeOpacity={0.85}>
                <Text style={s.trackerFooterCloseText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── NOTIFICATION PANEL MODAL ── */}
      <Modal visible={showNotifPanel} animationType="slide" transparent>
        <View style={s.centeredOverlay}>
          <View style={s.notifPanelSheet}>
            <View style={s.popupHeader}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(8) }}>
                <Ionicons name="notifications" size={22} color={MEDICAL_RED} />
                <Text style={s.popupTitle}>Notifications</Text>
                {unreadCount > 0 && (
                  <View style={s.notifCountPill}>
                    <Text style={s.notifCountPillText}>{unreadCount} New</Text>
                  </View>
                )}
              </View>
              <TouchableOpacity onPress={() => setShowNotifPanel(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={C.slate} />
              </TouchableOpacity>
            </View>

            {/* Filter Row */}
            <View style={s.notifFilterRow}>
              <TouchableOpacity 
                style={[s.notifFilterTab, notifFilter === 'all' && s.notifFilterTabActive]} 
                onPress={() => setNotifFilter('all')}
              >
                <Text style={[s.notifFilterTabText, notifFilter === 'all' && s.notifFilterTabTextActive]}>All ({notifications.length})</Text>
              </TouchableOpacity>
              <TouchableOpacity 
                style={[s.notifFilterTab, notifFilter === 'unread' && s.notifFilterTabActive]} 
                onPress={() => setNotifFilter('unread')}
              >
                <Text style={[s.notifFilterTabText, notifFilter === 'unread' && s.notifFilterTabTextActive]}>Unread ({unreadCount})</Text>
              </TouchableOpacity>
              <View style={{ flex: 1 }} />
              <TouchableOpacity onPress={markAllNotifsRead}>
                <Text style={s.notifActionLink}>Mark all read</Text>
              </TouchableOpacity>
            </View>

            <ScrollView style={{ maxHeight: verticalScale(340) }} showsVerticalScrollIndicator={false}>
              {displayedNotifications.length === 0 ? (
                <View style={s.emptyNotifBox}>
                  <Ionicons name="notifications-off-outline" size={32} color={C.muted} />
                  <Text style={s.emptyNotifText}>No notifications to show</Text>
                </View>
              ) : (
                displayedNotifications.map(n => (
                  <NotifSwipeToDeleteRow key={n.id} onDelete={() => deleteNotification(n.id)}>
                    <TouchableOpacity 
                      style={s.notifItem}
                      activeOpacity={0.8}
                      onPress={() => {
                        setReadNotifIds(prev => Array.from(new Set([...prev, n.id])));
                        if (n.type === 'appointment') {
                          setShowNotifPanel(false);
                          router.push('/(tabs)/appt');
                        }
                      }}
                    >
                      <View style={[s.notifIconBox, n.type === 'dose' ? { backgroundColor: '#EFF6FF' } : n.type === 'appointment' ? { backgroundColor: '#ECFDF5' } : n.type === 'followup' ? { backgroundColor: '#FEF2F2' } : { backgroundColor: '#F8FAFC' }]}>
                        <Ionicons
                          name={n.type === 'dose' ? 'calendar' : n.type === 'map' ? 'alert-circle' : n.type === 'appointment' ? 'checkmark-circle' : n.type === 'followup' ? 'notifications' : 'medkit'}
                          size={18}
                          color={n.type === 'dose' ? '#2563EB' : n.type === 'appointment' ? '#059669' : n.type === 'followup' ? MEDICAL_RED : '#64748B'}
                        />
                      </View>
                      <View style={{ flex: 1 }}>
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' }}>
                          <Text style={s.notifItemTitle}>{n.title}</Text>
                          <Text style={s.notifItemTime}>{n.time}</Text>
                        </View>
                        <Text style={s.notifItemMsg}>{n.message}</Text>

                        {/* Clinic follow-ups only: confirm receipt back to the
                            clinic — the in-app twin of the email's button. */}
                        {n.type === 'followup' && (
                          n.acknowledged ? (
                            <View style={s.ackConfirmedRow}>
                              <Ionicons name="checkmark-circle" size={14} color="#059669" />
                              <Text style={s.ackConfirmedText}>Receipt confirmed</Text>
                            </View>
                          ) : (
                            <TouchableOpacity
                              style={s.ackBtn}
                              activeOpacity={0.85}
                              onPress={() => confirmReceipt(n.notificationId)}
                            >
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                              <Text style={s.ackBtnText}>I received this</Text>
                            </TouchableOpacity>
                          )
                        )}
                      </View>
                      {n.unread && <View style={s.notifUnreadDot} />}
                    </TouchableOpacity>
                  </NotifSwipeToDeleteRow>
                ))
              )}
            </ScrollView>

            <View style={s.notifFooterRow}>
              <TouchableOpacity onPress={clearNotifs}>
                <Text style={s.clearNotifText}>Clear Notifications</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.closeNotifBtn} onPress={() => setShowNotifPanel(false)}>
                <Text style={s.closeNotifBtnText}>Close</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── VIEW LOG MODAL ── */}
      <Modal visible={!!viewingLog} animationType="fade" transparent>
        <View style={s.centeredOverlay}>
          <View style={[s.centeredSheet, { padding: 0, maxHeight: '90%', overflow: 'hidden' }]}>
            {/* Dark Navy / Blue Header */}
            <LinearGradient
              colors={['#0F172A', '#1E293B']}
              start={{ x: 0, y: 0 }}
              end={{ x: 1, y: 1 }}
              style={s.modalBlueHeader}
            >
              <View style={{ flex: 1 }}>
                <Text style={s.modalBlueHeaderTitle}>{viewingLog?.date} · {viewingLog?.time}</Text>
                <Text style={s.modalBlueHeaderSub}>
                  {viewingLog?.type === 'wound' ? 'Wound Photo Update' : 'Recovery Note'}
                </Text>
              </View>
              <TouchableOpacity onPress={() => setViewingLog(null)} style={s.modalBlueCloseBtn} activeOpacity={0.8}>
                <Ionicons name="close" size={18} color="#FFFFFF" />
              </TouchableOpacity>
            </LinearGradient>

            <View style={{ padding: scale(20) }}>
              {/* Matches the recovery-timeline popup: the sheet's own maxHeight
                  bounds the overall popup, so this cap only needs to scroll long
                  notes rather than compete with the square photo for space.
                  resizeMode="contain" keeps the whole photo visible — "cover"
                  was cropping it. */}
              <ScrollView showsVerticalScrollIndicator={false} style={{ maxHeight: verticalScale(560) }}>
                {viewingLog?.photoUrl && (
                  <Image source={{ uri: viewingLog.photoUrl }} style={s.detailImageLarge} resizeMode="contain" />
                )}

                {viewingLog?.note ? (
                  <Text style={s.detailNoteText}>{viewingLog.note}</Text>
                ) : null}

                {(viewingLog?.symptoms?.length ?? 0) > 0 && (
                  <View style={s.symptomsWrap}>
                    <Text style={s.symptomsTitle}>Symptoms Logged</Text>
                    <View style={s.chipsRow}>
                      {viewingLog!.symptoms.map(sym => (
                        <View key={sym} style={s.symptomChip}>
                          <Text style={s.symptomChipText}>{sym}</Text>
                        </View>
                      ))}
                    </View>
                  </View>
                )}
              </ScrollView>

              <View style={s.modalFooterRow}>
                <TouchableOpacity
                  style={s.modalDeleteBtn}
                  onPress={() => viewingLog && deleteLog(viewingLog.id)}
                >
                  <Ionicons name="trash-outline" size={16} color="#64748B" />
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.modalEditBtn}
                  onPress={() => viewingLog && openEdit(viewingLog)}
                >
                  <Ionicons name="create-outline" size={15} color="#334155" />
                  <Text style={s.modalEditText}>Edit</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ── EDIT LOG MODAL ── */}
      <Modal visible={!!editingLog} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.centeredOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[s.centeredSheet, { padding: 0 }]}>
                  {/* Dark Navy / Blue Header */}
                  <LinearGradient
                    colors={['#0F172A', '#1E293B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.modalBlueHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalBlueHeaderTitle}>Edit Log Entry</Text>
                      <Text style={s.modalBlueHeaderSub}>Update symptoms or details</Text>
                    </View>
                    <TouchableOpacity onPress={() => setEditingLog(null)} style={s.modalBlueCloseBtn} activeOpacity={0.8}>
                      <Ionicons name="close" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </LinearGradient>

                  <View style={{ padding: scale(20) }}>
                    {editingLog?.photoUrl && <Image source={{ uri: editingLog.photoUrl }} style={s.popupImage} />}
                    <Text style={s.fieldLabel}>Symptoms</Text>
                    <View style={s.chipGroup}>
                      {SYMPTOMS_LIST.map(sym => (
                        <TouchableOpacity key={sym} style={[s.chip, editSymptoms.includes(sym) && s.chipActive]} onPress={() => toggleEditSym(sym)}>
                          <Text style={[s.chipText, editSymptoms.includes(sym) && s.chipTextActive]}>{sym}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 8 }]}>Details</Text>
                    <TextInput style={s.textArea} placeholder="Add details..." multiline value={editDesc} onChangeText={setEditDesc} />
                    <View style={s.modalActions}>
                      <TouchableOpacity style={s.cancelBtn} onPress={() => setEditingLog(null)}>
                        <Text style={s.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={s.saveBtn} onPress={saveEdit}>
                        <Text style={s.saveBtnText}>Save Changes</Text>
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── NEW LOG MODAL ── */}
      <Modal visible={showWoundModal} animationType="fade" transparent>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : 'height'} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
            <View style={s.centeredOverlay}>
              <TouchableWithoutFeedback onPress={() => {}}>
                <View style={[s.centeredSheet, { padding: 0 }]}>
                  {/* Dark Navy / Blue Header */}
                  <LinearGradient
                    colors={['#0F172A', '#1E293B']}
                    start={{ x: 0, y: 0 }}
                    end={{ x: 1, y: 1 }}
                    style={s.modalBlueHeader}
                  >
                    <View style={{ flex: 1 }}>
                      <Text style={s.modalBlueHeaderTitle}>New Log Entry</Text>
                      <Text style={s.modalBlueHeaderSub}>Record symptoms or wound updates</Text>
                    </View>
                    <TouchableOpacity onPress={closeModal} style={s.modalBlueCloseBtn} activeOpacity={0.8}>
                      <Ionicons name="close" size={18} color="#FFFFFF" />
                    </TouchableOpacity>
                  </LinearGradient>

                  <View style={{ padding: scale(20) }}>
                    {selectedImage && <Image source={{ uri: selectedImage }} style={s.popupImage} />}
                    <Text style={s.fieldLabel}>Symptoms</Text>
                    <View style={s.chipGroup}>
                      {SYMPTOMS_LIST.map(sym => (
                        <TouchableOpacity key={sym} style={[s.chip, symptoms.includes(sym) && s.chipActive]} onPress={() => toggleSymptom(sym)}>
                          <Text style={[s.chipText, symptoms.includes(sym) && s.chipTextActive]}>{sym}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    <Text style={[s.fieldLabel, { marginTop: 8 }]}>Details</Text>
                    <TextInput style={s.textArea} placeholder="Add details..." multiline value={description} onChangeText={setDescription} />
                    <View style={s.modalActions}>
                      <TouchableOpacity style={s.cancelBtn} onPress={closeModal}>
                        <Text style={s.cancelBtnText}>Cancel</Text>
                      </TouchableOpacity>
                      <TouchableOpacity style={[s.saveBtn, uploading && { opacity: 0.6 }]} onPress={saveLog} disabled={uploading}>
                        {uploading
                          ? <ActivityIndicator color="#FFF" size="small" />
                          : <Text style={s.saveBtnText}>Save Entry</Text>}
                      </TouchableOpacity>
                    </View>
                  </View>
                </View>
              </TouchableWithoutFeedback>
            </View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── ENLARGE CARD POPUP MODAL (Matching Reference UI) ── */}
      <Modal visible={showEnlargeModal} animationType="slide" transparent statusBarTranslucent>
        <View style={s.enlargeModalOverlay}>
          <View style={s.enlargeModalCard}>
            
            {/* Enlarged Card Display Container (90° Rotated Landscape Card matching reference photo) */}
            <View style={s.enlargeCardContainer}>
              <TouchableOpacity activeOpacity={0.96} onPress={() => setEnlargeFlipped(!enlargeFlipped)} style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
                {enlargeFlipped ? (
                  /* Back side rotated landscape card */
                  <ViewShot ref={modalCardBackShotRef} options={{ format: 'png', quality: 1 }} style={s.cdcOfficialCardPaperPopup}>
                    <View style={s.cdcHeaderBlock}>
                      <View style={s.cdcHeaderTitleRow}>
                        <Image source={require('../../assets/logo-white-nobg.png')} style={s.knAClinicLogoHeaderPopupBack} resizeMode="contain" />
                        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={s.cdcClinicHeaderTitlePopupBack}>K&A ANIMAL BITE CENTER & CLINIC</Text>
                          <Text style={s.cdcCardTitlePopupBack}>HISTORY OF EXPOSURE & CLINICAL RECORD</Text>
                          <Text style={s.cdcCardSubtextPopupBack}>Clinical Exposure History & Medical Profile</Text>
                        </View>
                      </View>
                    </View>

                    <View style={s.cdcRuleDividerPopupBack} />

                    {/* Incident & Exposure Profile Fields */}
                    <View style={{ gap: scale(3), marginTop: verticalScale(-4) }}>
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Date</Text>
                          <Text style={s.cdcFieldValuePopup}>{pr.date ? formatDoseDate(pr.date) : (isGuest ? '—' : formatDoseDate(pr.date))}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Type</Text>
                          <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{blank(pr.typeOfExposure, 'Bite / Scratch')}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Source Animal</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.sourceOfExposure || pr.animal, 'Stray animal')}</Text>
                        </View>
                      </View>
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Location / Place of Exposure</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.placeOfExposure || pr.address, 'San Juan')}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Category</Text>
                          <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{blank(pr.category, 'Category II')}</Text>
                        </View>
                      </View>

                      {/* Patient Clinical Profile Fields */}
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Age / Sex</Text>
                          <Text style={s.cdcFieldValuePopup}>{pr.age ? `${pr.age} yrs • ${pr.sex}` : (isGuest ? '—' : '21 yrs • Female')}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Tetanus History</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.lastTetanus || pr.tetanusStatus, 'Unknown')}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Known Allergies</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.allergies, 'None')}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Contact Number</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.contact, '+639074452442')}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Attending Notes Sub-Box */}
                    <View style={s.attendingNotesBox}>
                      <Text style={s.cdcFieldLabelPopup}>Attending Physician / Clinical Protocol Notes</Text>
                      <Text style={s.attendingNotesTxtPopup}>
                        {blank(pr.notes || pr.clinicalNotes, 'Patient started on PEP protocol. 10-day animal observation active for source animal.')}
                      </Text>
                    </View>
                  </ViewShot>
                ) : (
                  /* Front side rotated landscape card */
                  <ViewShot ref={modalCardFrontShotRef} options={{ format: 'png', quality: 1 }} style={s.cdcOfficialCardPaperPopup}>
                    <View style={s.cdcHeaderBlock}>
                      <View style={s.cdcHeaderTitleRow}>
                        <Image source={require('../../assets/logo-white-nobg.png')} style={s.knAClinicLogoHeaderPopup} resizeMode="contain" />
                        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={s.cdcClinicHeaderTitlePopup}>K&A ANIMAL BITE CENTER & CLINIC</Text>
                          <Text style={s.cdcCardTitlePopup}>ANTI-RABIES VACCINATION RECORD CARD</Text>
                          <Text style={s.cdcCardSubtextPopup}>Official Prophylaxis & Immunization Record</Text>
                        </View>
                      </View>
                    </View>
                    <View style={s.cdcRuleDividerPopup} />
                    <View style={s.cdcFieldsRowPopup}>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabelPopup}>Last Name</Text>
                        <Text style={s.cdcFieldValuePopup}>{lastNameVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabelPopup}>First Name</Text>
                        <Text style={s.cdcFieldValuePopup}>{firstNameVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 0.6 }]}>
                        <Text style={s.cdcFieldLabelPopup}>MI</Text>
                        <Text style={s.cdcFieldValuePopup}>{miVal}</Text>
                      </View>
                    </View>
                    <View style={s.cdcFieldsRowPopup}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabelPopup}>Date of birth</Text>
                        <Text style={s.cdcFieldValuePopup}>{dobVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 2 }]}>
                        <Text style={s.cdcFieldLabelPopup}>Patient number (MRN)</Text>
                        <Text style={s.cdcFieldValuePopup}>{mrnVal}</Text>
                      </View>
                    </View>
                    <View style={s.cdcFieldsRowPopup}>
                      <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                        <Text style={s.cdcFieldLabelPopup}>Vaccination Purpose</Text>
                        <Text style={s.cdcFieldValuePopup}>{purposeVal}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                        <Text style={s.cdcFieldLabelPopup}>Exposure Category</Text>
                        <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{catVal}</Text>
                      </View>
                    </View>
                    <View style={s.cdcTableContainerPopup}>
                      <View style={s.cdcTableHeaderRow}>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 1.1 }]}>Dose</Text>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 2.1 }]}>Vaccine / Dosage</Text>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 1.1, borderRightWidth: 0 }]}>Date</Text>
                      </View>
                      {doseList.map((d: any, idx: number) => {
                        const brandStr = d.vaccineBrand || d.b || pr.vaccineBrand || 'Speeda ARV';
                        const dosageStr = d.dosage || pr.route || '0.5 mL';
                        const lotStr = d.lot || 'Lot #2026-08A';
                        // Guest placeholder rows carry a label but no clinical data.
                        const vaccineCell = d.blankRow ? '—' : `${brandStr} (${dosageStr}) · ${lotStr}`;
                        const dateCell = d.blankRow
                          ? '—'
                          : (d.date ? formatDoseDate(d.date) : (pr.date ? formatDoseDate(pr.date) : '08/04/26'));
                        return (
                          <View key={d.id || d.key || idx} style={[s.cdcTableRow, idx % 2 === 1 && s.cdcTableRowAlt]}>
                            <Text style={[s.cdcTableCellPopup, { flex: 1.1, fontWeight: '700', color: '#0F172A' }]} numberOfLines={1}>
                              {d.label || d.n || d.name || `Dose ${idx + 1}`}
                            </Text>
                            <Text style={[s.cdcTableCellPopup, { flex: 2.1, fontWeight: '600' }]} numberOfLines={1}>
                              {vaccineCell}
                            </Text>
                            <Text style={[s.cdcTableCellPopup, { flex: 1.1, borderRightWidth: 0 }]} numberOfLines={1}>
                              {dateCell}
                            </Text>
                          </View>
                        );
                      })}
                    </View>
                  </ViewShot>
                )}
              </TouchableOpacity>
            </View>

            {/* Action Buttons Row matching user screenshot */}
            <View style={s.enlargeModalActionsRow}>
              {/* Show Back ID / Show Front ID Button */}
              <TouchableOpacity 
                style={s.enlargePillBtn} 
                onPress={() => setEnlargeFlipped(!enlargeFlipped)}
                activeOpacity={0.8}
              >
                <Text style={s.enlargePillBtnTxt}>
                  {enlargeFlipped ? 'Show Front ID' : 'Show Back ID'}
                </Text>
                <Ionicons name="swap-horizontal" size={16} color="#2563EB" />
              </TouchableOpacity>

              {/* Export Button (exports current active side to photos) */}
              <TouchableOpacity 
                style={[s.enlargePillBtn, exportingCard && { opacity: 0.6 }]} 
                onPress={handleExportFrontCard}
                activeOpacity={0.8}
                disabled={exportingCard}
              >
                {exportingCard ? (
                  <ActivityIndicator size="small" color="#2563EB" />
                ) : (
                  <>
                    <Text style={s.enlargePillBtnTxt}>Export</Text>
                    <Ionicons name="download-outline" size={16} color="#2563EB" />
                  </>
                )}
              </TouchableOpacity>
            </View>

            {/* Close Button */}
            <TouchableOpacity 
              style={s.enlargeCloseBtn} 
              onPress={() => setShowEnlargeModal(false)}
              activeOpacity={0.8}
            >
              <Text style={s.enlargeCloseBtnTxt}>Close</Text>
            </TouchableOpacity>

          </View>
        </View>
      </Modal>

      {/* ── BOTTOM NAV BAR ── */}
      <View style={[nav.bar, { height: verticalScale(80) + insets.bottom, paddingBottom: verticalScale(8) + insets.bottom }]}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab('Home');
            mainScrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }}
        >
          <Ionicons name={activeTab === 'Home' ? "home" : "home-outline"} size={24} color={activeTab === 'Home' ? C.red : "#64748B"} />
          <Text style={[nav.label, activeTab === 'Home' && nav.labelActive]}>Home</Text>
        </TouchableOpacity>

        {/* Tab 2: Appts */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/appt')}
        >
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appts</Text>
        </TouchableOpacity>

        {/* Tab 3: Chat */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/chat')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Chat</Text>
        </TouchableOpacity>

        {/* Tab 4: Records */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/records')}
        >
          <Ionicons name="id-card-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Records</Text>
        </TouchableOpacity>

        {/* Tab 5: Account */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/profile')}
        >
          <Ionicons name="person-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Account</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function PawIllustration() {
  return (
    <View style={styles.pawWrap}>
      <Ionicons name="paw" size={40} color={C.muted} />
    </View>
  );
}

const styles = StyleSheet.create({
  pawWrap: { marginBottom: verticalScale(8), alignItems: 'center' },
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

const s = StyleSheet.create({
  root:   { flex: 1, backgroundColor: SOFT_GRAY_BG },
  loader: { flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: SOFT_GRAY_BG },
  mainContentContainer: {
    paddingHorizontal: scale(20),
    marginTop: verticalScale(-52),
    zIndex: 10,
  },

  topMeshSection: {
    position: 'relative',
    paddingTop: verticalScale(68),
    paddingBottom: verticalScale(82),
    paddingHorizontal: scale(24),
    borderBottomLeftRadius: scale(36),
    borderBottomRightRadius: scale(36),
    overflow: 'hidden',
  },

  topBarDirect: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  textBlurGlowWrap: {
    backgroundColor: 'rgba(255, 255, 255, 0.14)',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(8),
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.25)',
  },
  hiText:        { color: 'rgba(255, 255, 255, 0.92)', fontSize: moderateScale(16), fontWeight: '700', letterSpacing: 0.3 },
  feelingText:   { color: '#FFFFFF', fontSize: moderateScale(23.5), fontWeight: '900', marginTop: verticalScale(3), letterSpacing: -0.4 },

  notifBtnGlass: {
    width: scale(44), height: verticalScale(44),
    backgroundColor: 'rgba(255, 255, 255, 0.22)',
    borderRadius: scale(22), // FULLY CIRCULAR
    justifyContent: 'center', alignItems: 'center',
    borderWidth: 1, borderColor: 'rgba(255, 255, 255, 0.35)',
    shadowColor: '#000', shadowOpacity: 0.12, shadowRadius: 8, shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  notifDotGlass: {
    position: 'absolute', top: verticalScale(9), right: scale(9),
    width: scale(8), height: verticalScale(8), borderRadius: scale(4), // FULLY CIRCULAR
    backgroundColor: '#FFD700',
    borderWidth: 1.5, borderColor: '#7F1D1D',
  },

  cardOverlapContainer: {
    paddingHorizontal: scale(20),
    marginTop: verticalScale(8),
    zIndex: 10,
  },
  nextDoseNavyCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    borderRadius: scale(22),
    padding: scale(16),
    marginBottom: verticalScale(16),
    overflow: 'hidden',
    backgroundColor: '#FFFFFF',
  },
  nextDoseNavyDecor: {
    position: 'absolute',
    width: scale(160),
    height: verticalScale(160),
    borderRadius: scale(80),
    backgroundColor: 'rgba(227, 24, 55, 0.03)',
    top: verticalScale(-60),
    right: scale(-40),
  },
  nextDoseNavyIconBox: {
    width: scale(48),
    height: verticalScale(48),
    borderRadius: scale(16),
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FECDD3',
    justifyContent: 'center',
    alignItems: 'center',
    flexShrink: 0,
  },
  nextDoseNavyPillRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: verticalScale(6),
  },
  nextDoseNavyPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    backgroundColor: '#FFF1F3',
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(3.5),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#FECDD3',
  },
  nextDoseNavyPillDot: {
    width: scale(6),
    height: verticalScale(6),
    borderRadius: scale(3),
    backgroundColor: '#E31837',
  },
  nextDoseNavyPillText: {
    fontSize: moderateScale(9.5),
    fontWeight: '800',
    color: '#E31837',
    letterSpacing: 0.8,
  },
  nextDoseProgressBadge: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#475569',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(2),
    borderRadius: scale(6),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  nextDoseNavyDose: {
    fontSize: moderateScale(16.5),
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  nextDoseNavyDate: {
    fontSize: moderateScale(12),
    color: '#64748B',
    fontWeight: '500',
  },
  tapProgressHintNavy: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#E31837',
    marginTop: verticalScale(6),
  },
  nextDoseArrowBox: {
    width: scale(30),
    height: verticalScale(30),
    borderRadius: scale(15),
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },

  // ELEGANT OFFICIAL VACCINATION CARD STYLES (REDESIGNED)
  vaxCardContainer: {
    marginBottom: verticalScale(20),
  },
  paperVaccineCard: {
    minHeight: 420,
    borderRadius: scale(24),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(226, 232, 240, 0.9)',
    shadowColor: '#0F172A',
    shadowOpacity: 0.08,
    shadowRadius: 16,
    shadowOffset: { width: 0, height: 6 },
    elevation: 4,
    overflow: 'hidden',
  },
  cardBody: {
    padding: scale(20),
    flex: 1,
    justifyContent: 'space-between',
  },
  patientIdentityBlock: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  patientAvatarBox: {
    width: scale(42),
    height: verticalScale(42),
    borderRadius: scale(12),
    backgroundColor: '#EFF6FF',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#DBEAFE',
  },
  patientLabel: {
    fontSize: moderateScale(10),
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  patientInfoName: {
    fontSize: moderateScale(17),
    fontWeight: '700',
    color: '#0F172A',
    marginTop: verticalScale(1),
  },
  rightHeaderStack: {
    alignItems: 'flex-end',
    gap: scale(6),
  },
  pageBadge: {
    backgroundColor: '#F1F5F9',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(3),
    borderRadius: scale(8),
  },
  pageBadgeTxt: {
    fontSize: moderateScale(10.5),
    fontWeight: '700',
    color: '#64748B',
  },
  mrnChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: scale(8),
  },
  mrnChipText: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#334155',
  },
  cardDivider: {
    height: verticalScale(1),
    backgroundColor: '#F1F5F9',
    marginVertical: verticalScale(14),
  },
  exposureSection: {
    marginBottom: verticalScale(12),
  },
  sectionHeaderRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    marginBottom: verticalScale(10),
  },
  paperSectionTitle: {
    fontSize: moderateScale(12.5),
    fontWeight: '600',
    color: '#475569',
  },
  exposureGrid2x2: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(10),
  },
  neutralFieldCell: {
    width: '48%',
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: scale(12),
    paddingHorizontal: scale(12),
    paddingVertical: verticalScale(10),
  },
  fieldLabelRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    marginBottom: verticalScale(3),
  },
  neutralFieldLabel: {
    fontSize: moderateScale(9.5),
    fontWeight: '600',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  neutralFieldValue: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#0F172A',
  },
  riskTriageSubCard: {
    backgroundColor: '#FAFAFA',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: scale(14),
    padding: scale(12),
    marginTop: verticalScale(2),
    marginBottom: verticalScale(14),
    alignItems: 'center',
  },
  riskTriageTitle: {
    fontSize: moderateScale(10.5),
    fontWeight: '600',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.5,
    marginBottom: verticalScale(8),
  },
  catPillsRow: {
    flexDirection: 'row',
    gap: scale(12),
    marginBottom: verticalScale(8),
  },
  catNumberBox: {
    width: scale(36),
    height: verticalScale(36),
    borderRadius: scale(10),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1.5,
  },
  catBoxInactive: {
    backgroundColor: '#F1F5F9',
    borderColor: '#E2E8F0',
  },
  catBoxGreen: {
    backgroundColor: '#10B981',
    borderColor: '#059669',
  },
  catBoxAmber: {
    backgroundColor: '#F59E0B',
    borderColor: '#D97706',
  },
  catBoxRed: {
    backgroundColor: '#EF4444',
    borderColor: '#DC2626',
  },
  catNumberTxt: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#94A3B8',
  },
  catNumberTxtActive: {
    color: '#FFFFFF',
    fontWeight: '900',
  },
  riskBadgePill: {
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(5),
    borderRadius: scale(20),
    borderWidth: 1,
  },
  riskBadgeGreen: { backgroundColor: '#ECFDF5', borderColor: '#A7F3D0' },
  riskBadgeAmber: { backgroundColor: '#FFFBEB', borderColor: '#FDE68A' },
  riskBadgeRed:   { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5' },
  riskBadgeTxt:   { fontSize: moderateScale(12.5), fontWeight: '800' },
  txtGreen:       { color: '#047857' },
  txtAmber:       { color: '#B45309' },
  txtRed:         { color: '#B91C1C' },
  paperFooterFlipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    borderRadius: scale(12),
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(10),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  paperFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(7),
  },
  paperFooterFlipText: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#2563EB',
  },
  exportButtonsRow: {
    flexDirection: 'row',
    gap: scale(10),
    marginTop: verticalScale(12),
  },
  exportPrimaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    backgroundColor: '#1E3A5F',
    paddingVertical: verticalScale(12),
    borderRadius: scale(14),
    shadowColor: '#1E3A5F',
    shadowOpacity: 0.15,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  exportPrimaryBtnText: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#FFFFFF',
  },
  exportSecondaryBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#CBD5E1',
    paddingVertical: verticalScale(12),
    borderRadius: scale(14),
  },
  exportSecondaryBtnText: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#334155',
  },
  backTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  categoryRefPill: {
    backgroundColor: '#FEF3C7',
    borderWidth: 1,
    borderColor: '#FDE68A',
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(2),
    borderRadius: scale(6),
  },
  categoryRefPillTxt: {
    fontSize: moderateScale(9.5),
    fontWeight: '800',
    color: '#B45309',
  },
  progressCountBadge: {
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4),
    borderRadius: scale(8),
  },
  progressCountBadgeTxt: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#1D4ED8',
  },
  stepperTimelineContainer: {
    marginVertical: verticalScale(4),
    paddingLeft: scale(4),
  },
  stepperNodeRow: {
    flexDirection: 'row',
    minHeight: 50,
  },
  stepperSpineCol: {
    width: scale(28),
    alignItems: 'center',
  },
  stepperNodeDot: {
    width: scale(22),
    height: verticalScale(22),
    borderRadius: scale(11),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  nodeDone: { backgroundColor: '#10B981' },
  nodeMissed: { backgroundColor: '#EF4444' },
  nodeUpcoming: { backgroundColor: '#EFF6FF', borderWidth: 2, borderColor: '#2563EB' },
  nodeUpcomingInnerDot: { width: scale(8), height: verticalScale(8), borderRadius: scale(4), backgroundColor: '#2563EB' },
  nodeScheduled: { backgroundColor: '#FFFFFF', borderWidth: 2, borderColor: '#CBD5E1' },
  stepperLine: {
    width: scale(2),
    flex: 1,
    marginVertical: verticalScale(2),
  },
  stepperLineActive: { backgroundColor: '#10B981' },
  stepperLineInactive: { backgroundColor: '#E2E8F0' },
  stepperContentCol: {
    flex: 1,
    paddingLeft: scale(10),
    paddingBottom: verticalScale(14),
  },
  stepperHeaderLine: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  stepperDoseLabel: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#0F172A',
  },
  doseStatusPill: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: scale(6),
  },
  doseStatusPillTxt: {
    fontSize: moderateScale(10),
    fontWeight: '700',
  },
  stepperDateTxt: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#475569',
    marginTop: verticalScale(2),
  },
  stepperVaccineSubTxt: {
    fontSize: moderateScale(11),
    color: '#94A3B8',
    marginTop: verticalScale(1),
  },
  clinicalNoteCallout: {
    flexDirection: 'row',
    gap: scale(8),
    backgroundColor: '#F0F9FF',
    borderRadius: scale(14),
    padding: scale(10),
    borderWidth: 1,
    borderColor: '#BAE6FD',
    marginBottom: verticalScale(12),
  },
  clinicalNoteTxt: {
    flex: 1,
    fontSize: moderateScale(11),
    color: '#0369A1',
    lineHeight: moderateScale(16),
  },
  clinicalNoteKey: {
    fontWeight: '800',
    color: '#0284C7',
  },
  emptyScheduleBox: {
    alignItems: 'center',
    gap: scale(8),
    paddingVertical: verticalScale(28),
    backgroundColor: '#F8FAFC',
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginBottom: verticalScale(12),
  },
  emptyScheduleText: {
    fontSize: moderateScale(13),
    color: '#64748B',
    fontWeight: '600',
  },

  section: { marginTop: verticalScale(24) },
  sectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(14), gap: scale(8) },
  sectionAccent: { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: MEDICAL_RED },
  sectionTitle: { fontSize: moderateScale(18), fontWeight: '900', color: C.charcoal, flex: 1 },
  countBadge: { backgroundColor: C.softRed, borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: verticalScale(2) },
  countText: { fontSize: moderateScale(11), fontWeight: '800', color: MEDICAL_RED },

  unifiedActionCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
    borderRadius: scale(20),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    paddingVertical: verticalScale(16),
    paddingHorizontal: scale(8),
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 3 },
    elevation: 2,
  },
  unifiedActionItem: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: scale(4),
  },
  unifiedCardDivider: {
    width: scale(1),
    height: verticalScale(48),
    backgroundColor: '#F1F5F9',
  },

  hubIconBoxCameraSolid: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: scale(14),
    backgroundColor: '#E31837',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(8),
    shadowColor: '#E31837',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubIconBoxGallerySolid: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: scale(14),
    backgroundColor: '#0284C7',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(8),
    shadowColor: '#0284C7',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubIconBoxNoteSolid: {
    width: scale(40),
    height: verticalScale(40),
    borderRadius: scale(14),
    backgroundColor: '#7C3AED',
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: verticalScale(8),
    shadowColor: '#7C3AED',
    shadowOpacity: 0.22,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 3 },
    elevation: 3,
  },
  hubTitleCol: { fontSize: moderateScale(12.5), fontWeight: '800', color: '#0F172A', textAlign: 'center', letterSpacing: -0.2 },
  hubDescCol:  { fontSize: moderateScale(10.5), fontWeight: '600', color: '#475569', textAlign: 'center', marginTop: verticalScale(2) },

  emptyState: { alignItems: 'center', padding: scale(24), backgroundColor: '#FFF', borderRadius: scale(20), borderWidth: 1, borderColor: C.border },
  emptyTitle: { fontSize: moderateScale(15), fontWeight: '800', color: C.charcoal },
  emptySubText: { fontSize: moderateScale(12), color: C.muted, textAlign: 'center', marginTop: verticalScale(4) },

  timelineContainerSimple: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
  },
  timelineRowSimple: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(16),
    gap: scale(14),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  timelineRowSimpleLast: { borderBottomWidth: 0 },
  timelineRowIconBox: {
    // Square — scale() on both axes so the box doesn't render oval.
    width: scale(44),
    height: scale(44),
    borderRadius: scale(12),
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    backgroundColor: SOFT_GRAY_BG,
    borderColor: C.border,
  },
  timelineRowTitle: {
    fontSize: moderateScale(15.5),
    fontWeight: '800',
    color: '#0F172A',
  },
  timelineRowSnippet: { fontSize: moderateScale(13.5), color: '#64748B', marginTop: verticalScale(3), fontWeight: '500' },
  timelineRowSnippetPhoto: { fontSize: moderateScale(13.5), color: '#E31837', marginTop: verticalScale(3), fontWeight: '600' },
  timelineRowSnippetEmpty: { fontSize: moderateScale(13.5), color: '#94A3B8', marginTop: verticalScale(3), fontWeight: '500', fontStyle: 'italic' },
  timelineRowDateTime: {
    fontSize: moderateScale(11.5),
    fontWeight: '500',
    color: '#64748B',
    marginTop: verticalScale(2),
  },
  seeAllLinkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    marginLeft: 'auto',
    paddingVertical: verticalScale(4),
    paddingHorizontal: scale(8),
  },
  seeAllLinkText: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#E31837',
  },
  seeAllFooterBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FECDD3',
    paddingVertical: verticalScale(11),
    borderRadius: scale(14),
    marginTop: verticalScale(10),
  },
  seeAllFooterText: {
    fontSize: moderateScale(12.5),
    fontWeight: '800',
    color: '#E31837',
  },

  timelineContainer: { gap: scale(12) },
  timelineItem: { flexDirection: 'row', gap: scale(12) },
  timelineLeft: { alignItems: 'center', width: scale(24) },
  timelineDot: { width: scale(24), height: verticalScale(24), borderRadius: scale(12), justifyContent: 'center', alignItems: 'center', zIndex: 2 },
  timelineConnector: { flex: 1, width: scale(2), backgroundColor: C.border, marginTop: verticalScale(4) },
  timelineContent: { flex: 1, backgroundColor: '#FFF', padding: scale(14), borderRadius: scale(18), borderWidth: 1, borderColor: C.border, gap: scale(8) },
  timelineHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  timelineType: { fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },
  timelineTime: { fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(1) },
  timelineThumb: { width: '100%', height: verticalScale(140), borderRadius: scale(12) },
  timelineDesc: { fontSize: moderateScale(13), color: C.slate, lineHeight: moderateScale(18) },
  inlineChipRow: { flexDirection: 'row', gap: scale(4), flexWrap: 'wrap' },
  inlineChip: { backgroundColor: C.softRed, borderRadius: scale(6), paddingHorizontal: scale(7), paddingVertical: verticalScale(2) },
  inlineChipText: { fontSize: moderateScale(10), color: C.red, fontWeight: '700' },
  inlineChipMore: { fontSize: moderateScale(10), color: C.muted, fontWeight: '700', alignSelf: 'center' },
  logActions: { flexDirection: 'row', gap: scale(6), alignItems: 'center' },
  logActionBtn: { width: scale(30), height: verticalScale(30), borderRadius: scale(10), backgroundColor: SOFT_GRAY_BG, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  logActionDanger: { backgroundColor: '#FFF1F3', borderColor: '#FECDD3' },

  // Taller map frame (380px) so satellite view and incident pins are spacious and readable.
  elevatedMapFrame: { height: verticalScale(380), borderRadius: scale(22), overflow: 'hidden', elevation: 4, marginBottom: verticalScale(14) },
  caseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    gap: scale(12),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#E2E8F0',
  },
  caseStatusDot: { width: scale(8), height: verticalScale(8), borderRadius: scale(4) },
  caseStatusDotActive: { backgroundColor: '#E31837' },
  caseStatusDotResolved: { backgroundColor: '#94A3B8' },
  caseStatusPill: { paddingHorizontal: scale(9), paddingVertical: verticalScale(4), borderRadius: scale(20), borderWidth: 1 },
  caseStatusPillActive: { backgroundColor: '#FFF1F3', borderColor: '#FECDD3' },
  caseStatusPillResolved: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  caseStatusPillText: { fontSize: moderateScale(10.5), fontWeight: '800' },
  caseStatusPillTextActive: { color: '#E31837' },
  caseStatusPillTextResolved: { color: '#64748B' },

  // MODAL OVERLAY & SHEETS
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  centeredSheet: { width: '100%', backgroundColor: '#FFF', borderRadius: scale(28), padding: scale(22), elevation: 10 },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) },
  popupTitle: { fontSize: moderateScale(19), fontWeight: '900', color: C.charcoal, letterSpacing: -0.3 },
  popupTitleIconBox: { width: scale(30), height: verticalScale(30), borderRadius: scale(10), backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { width: scale(30), height: verticalScale(30), borderRadius: scale(15), backgroundColor: SOFT_GRAY_BG, justifyContent: 'center', alignItems: 'center' },
  popupImage: { width: '100%', height: verticalScale(185), borderRadius: scale(16), marginBottom: verticalScale(14) },
  fieldLabel: { fontSize: moderateScale(11.5), fontWeight: '800', color: C.slate, textTransform: 'uppercase', letterSpacing: 0.5 },
  fieldValue: { fontSize: moderateScale(11.5), fontWeight: '600', color: C.charcoal, marginTop: verticalScale(3) },
  chipGroup: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(8), marginTop: verticalScale(8) },
  chip: { paddingHorizontal: scale(11), paddingVertical: verticalScale(6), borderRadius: scale(10), backgroundColor: SOFT_GRAY_BG, borderWidth: 1, borderColor: C.border },
  chipActive: { backgroundColor: '#F1F5F9', borderColor: '#334155' },
  chipText: { fontSize: moderateScale(11.5), color: C.slate, fontWeight: '700' },
  chipTextActive: { fontSize: moderateScale(11.5), color: '#0F172A', fontWeight: '800' },
  textArea: { backgroundColor: SOFT_GRAY_BG, borderRadius: scale(14), padding: scale(12), height: verticalScale(86), fontSize: moderateScale(11.5), color: C.charcoal, borderWidth: 1, borderColor: C.border, marginTop: verticalScale(8), lineHeight: moderateScale(17) },
  modalActions: { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(18) },
  cancelBtn: { flex: 1, height: verticalScale(38), borderRadius: scale(12), backgroundColor: SOFT_GRAY_BG, justifyContent: 'center', alignItems: 'center', borderWidth: 1, borderColor: C.border },
  cancelBtnText: { fontSize: moderateScale(12.5), fontWeight: '800', color: C.slate },
  saveBtn: { flex: 1, height: verticalScale(38), borderRadius: scale(12), backgroundColor: MEDICAL_RED, justifyContent: 'center', alignItems: 'center' },
  saveBtnText: { fontSize: moderateScale(12.5), fontWeight: '800', color: '#FFF' },

  // PROGRESS BANNER MODAL
  // Sheet has no padding of its own so the gradient hero can bleed edge-to-edge;
  // each section below supplies its own inset instead.
  progressBannerSheet: { width: '100%', backgroundColor: '#FFF', borderRadius: scale(28), overflow: 'hidden', elevation: 10 },
  trackerDarkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(18),
    borderTopLeftRadius: scale(28),
    borderTopRightRadius: scale(28),
    gap: scale(12),
  },
  trackerDarkHeaderTitle: {
    fontSize: moderateScale(17),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  trackerDarkHeaderSub: {
    fontSize: moderateScale(12),
    color: '#94A3B8',
    marginTop: verticalScale(3),
    fontWeight: '500',
  },
  trackerDarkCloseBtn: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: scale(16),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalTopAccentStripe: {
    height: verticalScale(4),
    backgroundColor: MEDICAL_RED,
    width: '100%',
  },

  trackerHero: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(16),
    position: 'relative',
    backgroundColor: '#FFFFFF',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  trackerHeroTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: scale(12),
    marginBottom: verticalScale(14),
  },
  trackerTitleRow: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
  },
  trackerIconBadge: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: scale(10),
    backgroundColor: '#FFF1F3',
    borderWidth: 1,
    borderColor: '#FECDD3',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerMetricIconBox: {
    width: scale(38),
    height: verticalScale(38),
    borderRadius: scale(12),
    backgroundColor: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerHeroTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#0F172A',
    lineHeight: moderateScale(21),
    letterSpacing: -0.3,
  },
  trackerCloseBtn: {
    width: scale(32),
    height: verticalScale(32),
    borderRadius: scale(16),
    backgroundColor: '#F1F5F9',
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosNotesDoseList: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(8),
    paddingBottom: verticalScale(8),
  },
  iosNotesDoseRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    paddingVertical: verticalScale(13),
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    borderRadius: scale(12),
    paddingHorizontal: scale(6),
  },
  iosNotesDoseRowNext: {
    backgroundColor: '#F8FAFC',
  },
  iosNotesDoseRowLast: {
    borderBottomWidth: 0,
  },
  iosNotesStatusBox: {
    // Square icon box — both dimensions use scale() so the checkmark circle
    // stays circular instead of squashing (scale() and verticalScale() use
    // different ratios, which turned this into a slightly oval box).
    // Must stay LARGER than the scale(20) icons it holds, or the glyph's
    // edges get clipped — that was the "cut off" checkmarks.
    width: scale(26),
    height: scale(26),
    justifyContent: 'center',
    alignItems: 'center',
  },
  iosNotesDoseTitle: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#0F172A',
  },
  iosNotesDoseTitleNext: {
    color: '#1E40AF',
    fontWeight: '800',
  },
  iosNotesDoseTitleDone: {
    color: '#0F172A',
  },
  iosNotesDoseSubtitle: {
    fontSize: moderateScale(11.5),
    fontWeight: '500',
    color: '#64748B',
    marginTop: verticalScale(2),
  },
  doseStatusBadge: {
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(4),
    borderRadius: scale(8),
    borderWidth: 1,
  },
  doseStatusBadgeDone: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  doseStatusBadgeNext: {
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
  },
  doseStatusBadgeMissed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
  },
  doseStatusBadgeUpcoming: {
    backgroundColor: '#F8FAFC',
    borderColor: '#E2E8F0',
  },
  doseStatusText: {
    fontSize: moderateScale(10.5),
    fontWeight: '800',
  },
  doseStatusTextDone: {
    color: '#047857',
  },
  doseStatusTextNext: {
    color: '#1D4ED8',
  },
  doseStatusTextMissed: {
    color: '#B91C1C',
  },
  doseStatusTextUpcoming: {
    color: '#64748B',
    fontWeight: '700',
  },
  trackerFooterCloseBtn: {
    flex: 1,
    height: verticalScale(40),
    borderRadius: scale(12),
    backgroundColor: '#475569',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerFooterCloseText: {
    fontSize: moderateScale(13),
    fontWeight: '800',
    color: '#FFFFFF',
  },
  trackerHeroMetricCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: '#F8FAFC',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(12),
    borderRadius: scale(16),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  trackerHeroCount: {
    fontSize: moderateScale(24),
    fontWeight: '900',
    color: '#0F172A',
  },
  trackerHeroCountTotal: {
    fontSize: moderateScale(14),
    fontWeight: '700',
    color: '#64748B',
  },
  trackerHeroSubtext: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#64748B',
    marginTop: verticalScale(1),
  },
  trackerPctPill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    backgroundColor: '#F0F9FF',
    paddingHorizontal: scale(11),
    paddingVertical: verticalScale(6),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#BAE6FD',
  },
  trackerPctPillDone: {
    backgroundColor: '#ECFDF5',
    borderColor: '#A7F3D0',
  },
  trackerHeroPct: {
    fontSize: moderateScale(12),
    fontWeight: '800',
    color: '#0284C7',
  },
  trackerHeroPctDone: {
    color: '#047857',
  },
  trackerHeroBarBase: {
    height: verticalScale(8),
    borderRadius: scale(4),
    backgroundColor: '#E2E8F0',
    overflow: 'hidden',
  },
  trackerHeroBarFill: {
    height: '100%',
    borderRadius: scale(4),
  },

  trackerTimelineScroll: {
    maxHeight: 340,
  },
  modalDoseStepsContainer: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(18),
    paddingBottom: verticalScale(8),
  },
  trackerStepRow: {
    flexDirection: 'row',
    gap: scale(12),
    alignItems: 'stretch',
  },
  trackerRail: {
    width: scale(28),
    alignItems: 'center',
  },
  modalDoseDot: {
    width: scale(28),
    height: verticalScale(28),
    borderRadius: scale(14),
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 2,
  },
  modalDoseDone: {
    backgroundColor: '#10B981',
  },
  modalDoseNext: {
    backgroundColor: MEDICAL_RED,
    borderWidth: 3,
    borderColor: '#FFE4E6',
  },
  modalDoseMissed: {
    backgroundColor: '#EF4444',
  },
  modalDosePending: {
    backgroundColor: '#FFFFFF',
    borderWidth: 2,
    borderColor: '#CBD5E1',
  },
  modalDoseNumPending: {
    color: '#64748B',
    fontSize: moderateScale(11.5),
    fontWeight: '800',
  },
  trackerConnector: {
    flex: 1,
    width: scale(2),
    backgroundColor: '#E2E8F0',
    marginVertical: verticalScale(3),
    borderRadius: scale(1),
  },
  trackerConnectorDone: {
    backgroundColor: '#10B981',
  },
  trackerConnectorActive: {
    backgroundColor: '#FECDD3',
  },

  trackerStepCard: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    backgroundColor: '#FFFFFF',
    paddingHorizontal: scale(14),
    paddingVertical: verticalScale(12),
    borderRadius: scale(14),
    marginBottom: verticalScale(12),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderLeftWidth: 3.5,
    borderLeftColor: '#CBD5E1',
  },
  trackerStepCardDone: {
    backgroundColor: '#FFFFFF',
    borderColor: '#E2E8F0',
    borderLeftColor: '#10B981',
  },
  trackerStepCardNext: {
    backgroundColor: '#FFF1F3',
    borderColor: '#FECDD3',
    borderLeftColor: MEDICAL_RED,
  },
  trackerStepCardMissed: {
    backgroundColor: '#FEF2F2',
    borderColor: '#FCA5A5',
    borderLeftColor: '#EF4444',
  },

  modalDoseLabel: {
    fontSize: moderateScale(13.5),
    fontWeight: '800',
    color: C.charcoal,
  },
  modalDoseLabelDone: {
    color: '#065F46',
  },
  doseCardDateRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    marginTop: verticalScale(3),
  },
  modalDoseDate: {
    fontSize: moderateScale(11.5),
    color: C.slate,
    fontWeight: '500',
  },
  modalDoseDateDone: {
    color: '#047857',
    fontWeight: '600',
  },
  modalDoseDateNext: {
    color: '#B91C1C',
    fontWeight: '700',
  },

  modalStatusPill: {
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(4.5),
    borderRadius: scale(8),
  },
  modalStatusDone: {
    backgroundColor: '#DCFCE7',
  },
  modalStatusNext: {
    backgroundColor: MEDICAL_RED,
  },
  modalStatusMissed: {
    backgroundColor: '#FEE2E2',
  },
  modalStatusUpcoming: {
    backgroundColor: '#E2E8F0',
  },
  modalStatusText: {
    fontSize: moderateScale(9),
    fontWeight: '900',
    letterSpacing: 0.5,
  },
  modalStatusTextDone: {
    color: '#15803D',
  },
  modalStatusTextNext: {
    color: '#FFFFFF',
  },
  modalStatusTextMissed: {
    color: '#B91C1C',
  },
  modalStatusTextUpcoming: {
    color: '#475569',
  },

  trackerFooter: {
    paddingHorizontal: scale(20),
    paddingTop: verticalScale(14),
    paddingBottom: verticalScale(20),
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  progressModalNote: {
    flexDirection: 'row',
    gap: scale(10),
    backgroundColor: '#F0F9FF',
    borderRadius: scale(14),
    padding: scale(12),
    marginBottom: verticalScale(14),
    borderWidth: 1,
    borderColor: '#BAE6FD',
    alignItems: 'flex-start',
  },
  progressModalNoteIcon: {
    width: scale(28),
    height: verticalScale(28),
    borderRadius: scale(8),
    backgroundColor: '#E0F2FE',
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: verticalScale(1),
  },
  progressModalNoteText: {
    flex: 1,
    fontSize: moderateScale(11.5),
    color: '#0C4A6E',
    lineHeight: moderateScale(16.5),
  },

  // NOTIFICATION PANEL MODAL
  notifPanelSheet: { width: '100%', backgroundColor: '#FFF', borderRadius: scale(28), padding: scale(20), elevation: 10 },
  notifCountPill: { backgroundColor: '#FEE2E2', borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: verticalScale(2) },
  notifCountPillText: { fontSize: moderateScale(11), fontWeight: '800', color: MEDICAL_RED },
  notifFilterRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: verticalScale(14), borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: verticalScale(10) },
  notifFilterTab: { paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: scale(10), backgroundColor: SOFT_GRAY_BG },
  notifFilterTabActive: { backgroundColor: C.softRed },
  notifFilterTabText: { fontSize: moderateScale(12), fontWeight: '600', color: C.slate },
  notifFilterTabTextActive: { color: MEDICAL_RED, fontWeight: '800' },
  notifActionLink: { fontSize: moderateScale(12), fontWeight: '800', color: '#0284C7' },
  notifItem: {
    flexDirection: 'row',
    gap: scale(10),
    paddingVertical: verticalScale(12),
    paddingHorizontal: scale(12),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    alignItems: 'flex-start',
  },
  notifItemUnread: {},
  notifIconBox: { width: scale(36), height: verticalScale(36), borderRadius: scale(12), justifyContent: 'center', alignItems: 'center' },
  notifItemTitle: { fontSize: moderateScale(13), fontWeight: '800', color: C.charcoal },
  notifItemTime: { fontSize: moderateScale(10), color: C.muted, fontWeight: '600' },
  notifItemMsg: { fontSize: moderateScale(12), color: C.slate, marginTop: verticalScale(2), lineHeight: moderateScale(16) },
  ackBtn: {
    flexDirection: 'row', alignItems: 'center', alignSelf: 'flex-start', gap: scale(5),
    marginTop: verticalScale(8), paddingVertical: verticalScale(6), paddingHorizontal: scale(12),
    borderRadius: moderateScale(8), backgroundColor: MEDICAL_RED,
  },
  ackBtnText: { fontSize: moderateScale(11.5), fontWeight: '700', color: '#FFFFFF' },
  ackConfirmedRow: {
    flexDirection: 'row', alignItems: 'center', gap: scale(5), marginTop: verticalScale(8),
  },
  ackConfirmedText: { fontSize: moderateScale(11.5), fontWeight: '600', color: '#059669' },
  notifUnreadDot: { width: scale(8), height: verticalScale(8), borderRadius: scale(4), backgroundColor: '#EF4444', marginTop: verticalScale(4) },
  emptyNotifBox: { alignItems: 'center', padding: scale(30) },
  emptyNotifText: { fontSize: moderateScale(13), color: C.muted, marginTop: verticalScale(6), fontWeight: '600' },
  notifFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: verticalScale(14), paddingTop: verticalScale(10), borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  clearNotifText: { fontSize: moderateScale(12.5), fontWeight: '700', color: C.muted },
  closeNotifBtn: { paddingHorizontal: scale(16), paddingVertical: verticalScale(8), backgroundColor: SOFT_GRAY_BG, borderRadius: scale(10) },
  closeNotifBtnText: { fontSize: moderateScale(13), fontWeight: '700', color: C.slate },
  modalBlueHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(11),
    borderTopLeftRadius: scale(28),
    borderTopRightRadius: scale(28),
    gap: scale(12),
  },
  modalBlueHeaderTitle: {
    fontSize: moderateScale(14),
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.3,
  },
  modalBlueHeaderSub: {
    fontSize: moderateScale(10.5),
    color: '#94A3B8',
    marginTop: verticalScale(1),
    fontWeight: '500',
  },
  modalBlueCloseBtn: {
    // Square — scale() on both axes so the circle doesn't render oval.
    width: scale(28),
    height: scale(28),
    borderRadius: scale(14),
    backgroundColor: 'rgba(255,255,255,0.15)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: verticalScale(14) },
  modalDateTitle: { fontSize: moderateScale(19), fontWeight: '800', color: '#0F172A' },
  modalTypeSub: { fontSize: moderateScale(12), color: '#64748B', marginTop: verticalScale(2), fontWeight: '500' },
  modalCloseBtn: { width: scale(30), height: verticalScale(30), borderRadius: scale(15), backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  detailImageLarge: { width: '100%', aspectRatio: 1, borderRadius: scale(14), marginBottom: verticalScale(12), backgroundColor: '#F1F5F9' },
  detailNoteText: { fontSize: moderateScale(14), color: '#0F172A', lineHeight: moderateScale(20), marginBottom: verticalScale(12) },
  symptomsWrap: { marginBottom: verticalScale(12) },
  symptomsTitle: { fontSize: moderateScale(11.5), fontWeight: '700', color: '#64748B', marginBottom: verticalScale(6) },
  chipsRow: { flexDirection: 'row', flexWrap: 'wrap', gap: scale(6) },
  symptomChip: { backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', paddingHorizontal: scale(8), paddingVertical: verticalScale(4), borderRadius: scale(6) },
  symptomChipText: { fontSize: moderateScale(10.5), fontWeight: '700', color: '#334155' },
  modalFooterRow: { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(10) },
  modalDeleteBtn: {
    alignItems: 'center',
    justifyContent: 'center',
    width: scale(38),
    height: verticalScale(38),
    borderRadius: scale(10),
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalEditBtn: {
    // Takes the width the removed Close button used to occupy.
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(5),
    height: verticalScale(38),
    paddingHorizontal: scale(14),
    borderRadius: scale(10),
    backgroundColor: '#F1F5F9',
    borderWidth: 1,
    borderColor: '#E2E8F0',
  },
  modalEditText: { fontSize: moderateScale(12), fontWeight: '700', color: '#334155' },

  // CDC OFFICIAL CARD STYLES
  recordsHeaderTitle: {
    fontSize: moderateScale(16),
    fontWeight: '800',
    color: '#0F172A',
  },
  certifiedBadgePill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#ECFDF5',
    borderWidth: 1,
    borderColor: '#A7F3D0',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(4),
    borderRadius: scale(20),
  },
  certifiedBadgeTxt: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    color: '#047857',
  },

  // CDC OFFICIAL CARD PAPER STYLING (COMPACT 250px INLINE CARD)
  cdcOfficialCardContainer: {
    // Hugs the actual content height (header + 3 field rows + a 5-row dose
    // table): 520 fit everything but left a large empty gap below the table
    // since the front/back panes are position:absolute-filled for the flip
    // animation and can't size to their own content. 300 was too tight once
    // seen on-device — sized up for a visibly bigger card while still
    // matching the content height (no re-introduced dead space).
    width: '100%',
    height: verticalScale(360),
    marginTop: verticalScale(4),
    marginBottom: verticalScale(8),
  },
  cdcOfficialCardPaper: {
    position: 'absolute',
    top: verticalScale(0),
    left: scale(0),
    right: scale(0),
    bottom: verticalScale(0),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: scale(10),
    // No shadow/elevation: during the 3D flip Android draws the elevation
    // shadow for BOTH faces, so the backfaceVisibility-hidden pane's shadow
    // bleeds through and smears across the card mid-rotation. The border
    // alone defines the card edge.
    justifyContent: 'space-between',
  },
  cdcHeaderBlock: {
    marginBottom: verticalScale(3),
  },
  cdcHeaderTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(6),
    marginBottom: verticalScale(2),
  },
  cdcClinicHeaderTitle: {
    fontSize: moderateScale(9.5),
    fontWeight: '900',
    color: '#E31837',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: verticalScale(1),
    textAlign: 'center',
  },
  knAClinicLogoHeader: {
    width: scale(44),
    height: verticalScale(44),
    marginRight: scale(6),
  },
  cdcCardTitle: {
    fontSize: moderateScale(11),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.1,
    lineHeight: moderateScale(14),
    marginVertical: verticalScale(1.5),
    textAlign: 'center',
  },
  cdcCardSubtext: {
    fontSize: moderateScale(8.5),
    color: '#475569',
    lineHeight: moderateScale(10.5),
    textAlign: 'center',
  },
  cdcCardSubtextSpanish: {
    fontSize: moderateScale(7.5),
    color: '#64748B',
    fontStyle: 'italic',
    lineHeight: moderateScale(9),
    marginTop: verticalScale(1),
  },
  cdcRuleDivider: {
    height: verticalScale(1),
    backgroundColor: '#1E3A5F',
    marginVertical: verticalScale(3),
  },
  cardSectionTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(3),
    marginBottom: verticalScale(2),
    marginTop: verticalScale(1),
  },
  cardSectionTitleTxt: {
    fontSize: moderateScale(8),
    fontWeight: '900',
    color: '#1E3A5F',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
  },
  cdcFieldsRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: verticalScale(3),
    gap: scale(6),
  },
  cdcFieldBox: {
    justifyContent: 'flex-end',
  },
  cdcFieldLabel: {
    fontSize: moderateScale(8),
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.2,
  },
  cdcFieldValue: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#0F172A',
    marginTop: verticalScale(2),
  },

  // RICH OFFICIAL TABLE STYLES
  cdcTableContainer: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: scale(5),
    overflow: 'hidden',
    marginTop: verticalScale(4),
  },
  cdcTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#1E3A5F',
    borderBottomWidth: 1,
    borderBottomColor: '#0F172A',
  },
  cdcTableCellHeader: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3.5),
    fontSize: moderateScale(9),
    fontWeight: '900',
    color: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cdcTableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
  },
  cdcTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  cdcTableCell: {
    // Row padding/size carries most of the work of filling the card's fixed
    // height — 5 dose rows means every dp here is multiplied by five, so these
    // values are tuned to land just under the container's interior height.
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3.5),
    fontSize: moderateScale(9.5),
    color: '#334155',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  backSectionCardBox: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: scale(8),
    padding: scale(6),
  },
  backHeaderBarRed: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#DC2626',
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    borderRadius: scale(4),
    marginBottom: verticalScale(4),
  },
  backHeaderBarNavy: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#1E3A5F',
    paddingHorizontal: scale(7),
    paddingVertical: verticalScale(3),
    borderRadius: scale(4),
    marginBottom: verticalScale(4),
  },
  backHeaderBarTxt: {
    fontSize: moderateScale(9),
    fontWeight: '900',
    color: '#FFFFFF',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  attendingNotesBox: {
    marginTop: verticalScale(5),
    backgroundColor: '#F0F9FF',
    borderWidth: 1,
    borderColor: '#BAE6FD',
    borderRadius: scale(6),
    padding: scale(5),
  },
  attendingNotesTxt: {
    fontSize: moderateScale(10.5),
    fontWeight: '700',
    color: '#1E3A5F',
    fontStyle: 'italic',
    marginTop: verticalScale(2),
  },
  cdcFooterStampRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(4),
    marginTop: verticalScale(4),
    paddingTop: verticalScale(3),
  },
  cdcFooterStampTxt: {
    fontSize: moderateScale(8.5),
    fontWeight: '800',
    color: '#059669',
    letterSpacing: 0.5,
  },

  // COMPLETE PATIENT MEDICAL RECORD
  completeRecordSection: {
    gap: scale(14),
  },
  completeRecordTitle: {
    fontSize: moderateScale(15),
    fontWeight: '800',
    color: '#0F172A',
  },
  recordDetailCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    padding: scale(16),
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  recordDetailHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(8),
    marginBottom: verticalScale(12),
    paddingBottom: verticalScale(8),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  recordDetailCardTitle: {
    fontSize: moderateScale(13.5),
    fontWeight: '800',
    color: '#0F172A',
  },
  recordDetailGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: scale(12),
  },
  recordDetailCell: {
    width: '47%',
  },
  recordDetailLabel: {
    fontSize: moderateScale(9.5),
    fontWeight: '700',
    color: '#64748B',
    letterSpacing: 0.4,
  },
  recordDetailVal: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#0F172A',
    marginTop: verticalScale(2),
  },
  recordsExportRow: {
    marginTop: verticalScale(4),
  },
  cardFlipFooterRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: verticalScale(14),
    paddingTop: verticalScale(10),
    borderTopWidth: 1,
    borderTopColor: '#E2E8F0',
  },
  cardFlipFooterLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
  },
  cardFlipFooterTxt: {
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    color: '#2563EB',
  },
  cardPageNumTxt: {
    fontSize: moderateScale(10.5),
    fontWeight: '800',
    color: '#64748B',
    backgroundColor: '#F1F5F9',
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(2),
    borderRadius: scale(8),
  },

  // ENLARGE CARD POPUP STYLES (MATCHING REFERENCE UI)
  cardExternalControlsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: verticalScale(8),
    marginBottom: verticalScale(4),
    gap: scale(8),
  },
  plainHintTxt: {
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    color: '#2563EB',
  },
  enlargeCardBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    backgroundColor: '#1E3A5F',
    paddingHorizontal: scale(10),
    paddingVertical: verticalScale(6),
    borderRadius: scale(18),
  },
  enlargeCardBtnTxt: {
    fontSize: moderateScale(11),
    fontWeight: '800',
    color: '#FFFFFF',
  },
  enlargeModalOverlay: {
    flex: 1,
    backgroundColor: 'rgba(15, 23, 42, 0.65)',
    justifyContent: 'center',
    alignItems: 'center',
    paddingHorizontal: scale(4),
  },
  enlargeModalCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(24),
    padding: scale(12),
    width: '98%',
    maxWidth: 520,
    maxHeight: '94%',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOpacity: 0.25,
    shadowRadius: 20,
    shadowOffset: { width: 0, height: 10 },
    elevation: 20,
  },
  enlargeCardContainer: {
    // Card is rotated -90deg (see cdcOfficialCardPaperPopup): its rendered
    // width becomes the visual height on screen, so this container must be
    // taller than that rotated width or the container's overflow:hidden
    // clips the card's edge (text bleeding off-screen was this container
    // being shorter than the rotated card's actual footprint).
    width: '100%',
    // Must exceed the rotated card's visual height, which is its *width*
    // (scale(580) ≈ 418dp) since the card is rotated -90deg. scale() and
    // verticalScale() use different ratios, so this is not the same number.
    height: verticalScale(700),
    justifyContent: 'center',
    alignItems: 'center',
    borderRadius: scale(18),
    overflow: 'visible',
  },
  cdcOfficialCardPaperPopup: {
    width: scale(580),
    height: verticalScale(430),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: scale(14),
    justifyContent: 'space-between',
    overflow: 'hidden',
    transform: [{ rotate: '-90deg' }],
  },
  cdcClinicHeaderTitlePopup: {
    fontSize: moderateScale(10.5),
    fontWeight: '900',
    color: '#E31837',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: verticalScale(1),
    textAlign: 'center',
  },
  knAClinicLogoHeaderPopup: {
    width: scale(52),
    height: verticalScale(52),
    marginRight: scale(8),
  },
  cdcCardTitlePopup: {
    fontSize: moderateScale(13.5),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.1,
    lineHeight: moderateScale(17),
    marginVertical: verticalScale(1),
    textAlign: 'center',
  },
  cdcCardSubtextPopup: {
    fontSize: moderateScale(10),
    color: '#475569',
    lineHeight: moderateScale(12),
    textAlign: 'center',
  },
  cdcRuleDividerPopup: {
    height: verticalScale(1.5),
    backgroundColor: '#1E3A5F',
    marginVertical: verticalScale(5),
  },
  cdcClinicHeaderTitlePopupBack: {
    fontSize: moderateScale(10.5),
    fontWeight: '900',
    color: '#E31837',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
    marginBottom: verticalScale(1),
    textAlign: 'center',
  },
  knAClinicLogoHeaderPopupBack: {
    width: scale(52),
    height: verticalScale(52),
    marginRight: scale(8),
  },
  cdcCardTitlePopupBack: {
    fontSize: moderateScale(13.5),
    fontWeight: '900',
    color: '#0F172A',
    letterSpacing: 0.1,
    lineHeight: moderateScale(17),
    marginVertical: verticalScale(1),
    textAlign: 'center',
  },
  cdcCardSubtextPopupBack: {
    fontSize: moderateScale(10),
    color: '#475569',
    lineHeight: moderateScale(12),
    textAlign: 'center',
  },
  cdcRuleDividerPopupBack: {
    height: verticalScale(1.5),
    backgroundColor: '#1E3A5F',
    marginTop: verticalScale(-21),
    marginBottom: verticalScale(2),
  },
  backCleanSectionHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(4),
    marginTop: verticalScale(2),
    marginBottom: verticalScale(1),
    paddingBottom: verticalScale(1),
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  backCleanSectionTitle: {
    fontSize: moderateScale(8.5),
    fontWeight: '900',
    color: '#1E3A5F',
    letterSpacing: 0.4,
    textTransform: 'uppercase',
  },
  backCleanSectionHeaderPopup: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(5),
    marginTop: verticalScale(3),
    marginBottom: verticalScale(2),
    paddingBottom: verticalScale(2),
    borderBottomWidth: 1,
    borderBottomColor: '#CBD5E1',
  },
  backCleanSectionTitlePopup: {
    fontSize: moderateScale(10),
    fontWeight: '900',
    color: '#1E3A5F',
    letterSpacing: 0.5,
    textTransform: 'uppercase',
  },
  cdcFieldsRowPopup: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#E2E8F0',
    paddingVertical: verticalScale(3),
    gap: scale(8),
  },
  cdcFieldLabelPopup: {
    fontSize: moderateScale(9.5),
    fontWeight: '700',
    color: '#64748B',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  cdcFieldValuePopup: {
    fontSize: moderateScale(13),
    fontWeight: '800',
    color: '#0F172A',
    marginTop: verticalScale(1),
  },
  cdcTableContainerPopup: {
    width: '100%',
    borderWidth: 1,
    borderColor: '#1E3A5F',
    borderRadius: scale(6),
    overflow: 'hidden',
    marginTop: verticalScale(5),
  },
  cdcTableCellHeaderPopup: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(5),
    fontSize: moderateScale(10),
    fontWeight: '900',
    color: '#FFFFFF',
    borderRightWidth: 1,
    borderRightColor: '#334155',
    textTransform: 'uppercase',
    letterSpacing: 0.4,
  },
  cdcTableCellPopup: {
    paddingHorizontal: scale(8),
    paddingVertical: verticalScale(4.5),
    fontSize: moderateScale(11),
    color: '#334155',
    borderRightWidth: 1,
    borderRightColor: '#CBD5E1',
  },
  attendingNotesTxtPopup: {
    fontSize: moderateScale(11),
    fontWeight: '700',
    color: '#1E3A5F',
    fontStyle: 'italic',
    marginTop: verticalScale(2),
    lineHeight: moderateScale(14),
  },
  enlargeModalActionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: scale(12),
    marginTop: verticalScale(18),
    marginBottom: verticalScale(12),
    width: '100%',
  },
  enlargePillBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(6),
    backgroundColor: '#E8F0FE',
    borderRadius: scale(20),
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(9),
  },
  enlargePillBtnTxt: {
    fontSize: moderateScale(13),
    fontWeight: '700',
    color: '#1A73E8',
  },
  enlargeCloseBtn: {
    paddingHorizontal: scale(16),
    paddingVertical: verticalScale(6),
    backgroundColor: '#F1F5F9',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    marginTop: verticalScale(2),
  },
  enlargeCloseBtnTxt: {
    fontSize: moderateScale(12),
    fontWeight: '600',
    color: '#5F6368',
  },
});
