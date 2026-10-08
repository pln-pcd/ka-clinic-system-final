// app/(tabs)/index.tsx
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { resetTo } from '../../utils/navigation';
import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  where,
} from 'firebase/firestore';
import React, { useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  InteractionManager,
  Animated as RNAnimated,
  Dimensions,
  Image,
  Modal,
  PanResponder,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TouchableWithoutFeedback,
  UIManager,
  View,
} from 'react-native';
import Tap from '../../components/Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { formatDoseDate, protocolLabel as buildProtocolLabel, serviceCopy, EMPTY, doseStatus, isPepService, clinicToday, displayPatientId, doseBrand, doseState, exposureCategory, exposureTypeLabel, splitName } from '../../utils/patientRecord';
import Animated, {
  Easing,
  interpolate,
  useAnimatedStyle,
  useSharedValue,
  withTiming,
} from 'react-native-reanimated';
import { saveImageToGallery } from '../../utils/saveImage';
import ViewShot from 'react-native-view-shot';
import { db } from '../../config/backend';
import {
  acknowledgeNotification,
  ensureNotificationPermission,
} from '../../config/notifications';
import { usePatientAuth } from '../../context/PatientAuthContext';
import { moderateScale, scale, verticalScale } from '../../utils/scale';
import { cacheKeys, peekCache, writeCache } from '../../utils/localCache';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';

if (Platform.OS === 'android' && UIManager.setLayoutAnimationEnabledExperimental) {
  UIManager.setLayoutAnimationEnabledExperimental(true);
}

const { width } = Dimensions.get('window');

const MEDICAL_RED = '#1E3A8A';
const SOFT_GRAY_BG = '#EEF2F6';

const C = {
  red: MEDICAL_RED,
  redLight: '#2563EB',
  redDeep: '#172554',
  white: '#FFFFFF',
  charcoal: '#1E293B',
  slate: '#475569',
  muted: '#94A3B8',
  green: '#10B981',
  border: '#E2E8F0',
  cardBg: '#FFFFFF',
  softRed: '#EFF6FF',
};

type VaccineDose = { id: string; dose: number; label: string; date: string; rawDate: string | null; done: boolean; missed: boolean; vaccineType?: string; };
type NextDoseNotif = { id: string; doseLabel: string; doseDate: string; message: string; sentAt: string; };
// Full raw `vaccinations/{mrn}` doc, kept alongside the derived `vaccineSchedule`
// so the vaccination card has real fields to render.
type PatientRecord = { [key: string]: any };

type AppNotification = {
  id: string;
  title: string;
  message: string;
  time: string;
  unread: boolean;
  type: 'dose' | 'system' | 'appointment' | 'followup';
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
// from ka-clinic-admin/src/features/appointments/AppointmentsPage.jsx handleQuickAction.
type ApptUpdate = {
  id: string;
  date: string;
  time: string;
  type?: string;
  status: string;
  note?: string;
  declineReason?: string;
  cancellationReason?: string;
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

// Guests get the standard PEP schedule's shape (Day 0, 3, 7, 28, the same
// labels the dashboard generates) — dose labels only, no brand,
// dosage, lot or date — so the card and tracker show the real row structure
// while making it obvious nothing has been administered yet. `blankRow: true`
// tells the renderers to print '—' instead of falling back to sample values.
const GUEST_PLACEHOLDER_DOSES = [
  { id: 'g1', label: 'Session 1 (Day 0)',  done: false, blankRow: true },
  { id: 'g2', label: 'Session 2 (Day 3)',  done: false, blankRow: true },
  { id: 'g3', label: 'Session 3 (Day 7)',  done: false, blankRow: true },
  { id: 'g4', label: 'Session 4 (Day 28)', done: false, blankRow: true },
];

// The vaccination record → the dose rows and next-dose summary Home shows.
// Pure, so it can seed state on the first render from the cached record.
function deriveVaccination(data: PatientRecord | null): { record: PatientRecord | null; schedule: VaccineDose[]; next: NextDoseNotif | null } {
  if (!data) return { record: null, schedule: [], next: null };
  const rawDoses: any[] = Array.isArray(data.doses) ? data.doses : [];
  if (rawDoses.length === 0) return { record: data, schedule: [], next: null };
  const vaccineType = serviceCopy(data.service).short;
  const todayISO = clinicToday();
  const schedule = rawDoses.map((d, i) => {
    const state = doseState(d, todayISO);
    const st = doseStatus(d, todayISO);
    return {
      id: d.key || `d${i + 1}`,
      dose: i + 1,
      label: d.n || d.label || `Dose ${i + 1}`,
      date: formatDoseDate(d.date),
      rawDate: d.date || null,
      done: state === 'done',
      missed: state === 'missed',
      status: st.status,
      statusLabel: st.label,
      vaccineType,
    } as VaccineDose;
  });
  const n = rawDoses.find(d => doseState(d, todayISO) !== 'done');
  const next: NextDoseNotif = n ? {
    id: n.key || 'next',
    doseLabel: n.n || n.label || 'Next Dose',
    doseDate: formatDoseDate(n.date),
    message: `Scheduled visit for ${n.n || n.label || 'your next dose'} at K&A Main Clinic.`,
    sentAt: formatDoseDate(todayISO),
  } : {
    id: 'complete',
    doseLabel: 'All Doses Completed',
    doseDate: 'Completed',
    message: 'You have completed your full vaccination protocol.',
    sentAt: formatDoseDate(todayISO),
  };
  return { record: data, schedule, next };
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
        <Tap
          onPress={() => {
            snapClose();
            onDelete();
          }}
          style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}
        >
          <Ionicons name="trash-outline" size={18} color="#FFFFFF" />
          <Text style={{ fontSize: moderateScale(10), fontWeight: '700', color: '#FFFFFF', marginTop: verticalScale(2) }}>Delete</Text>
        </Tap>
      </View>
      <RNAnimated.View style={{ transform: [{ translateX }], backgroundColor: '#FFFFFF' }} {...panResponder.panHandlers}>
        {children}
      </RNAnimated.View>
    </View>
  );
};

export default function RabiesRecoveryApp() {
  const router = useRouter();
  const params = useLocalSearchParams<{ tab?: string; t?: string }>();
  const { user, mrn, isGuest, mrnLoading, loading: authLoading } = usePatientAuth();
  const insets = useSafeAreaInsets();

  const [activeTab, setActiveTab] = useState<'Home' | 'Records'>('Home');

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

  // Seeded from the last-known record (utils/localCache) on the very first
  // render, so the cards appear with data instead of filling in afterwards.
  const [initialDerived] = useState(() => deriveVaccination(mrn ? peekCache<PatientRecord>(cacheKeys.vaccination(mrn)) ?? null : null));
  const [vaccineSchedule, setVaccineSchedule] = useState<VaccineDose[]>(initialDerived.schedule);
  const [patientRecord, setPatientRecord] = useState<PatientRecord | null>(initialDerived.record);
  // True once the live record (or a cached copy) has been applied for this
  // MRN; until then the next-dose card shows a same-size skeleton.
  const [recordReady, setRecordReady] = useState(!!initialDerived.record);

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
  // Appointments the clinic has declined or cancelled.
  const [declinedAppts, setDeclinedAppts] = useState<ApptUpdate[]>([]);
  // Appointment ids already announced. `null` until the first snapshot lands so
  // the initial batch seeds the baseline instead of firing a burst of banners.
  const mainScrollViewRef = useRef<ScrollView>(null);

  const [clinicNotifs, setClinicNotifs] = useState<ClinicNotification[]>([]);
  // Ids acknowledged this session — keeps the button responsive immediately
  // rather than waiting for the Firestore round-trip.
  const [ackedIds, setAckedIds] = useState<string[]>([]);

  // Next Dose Notification State
  const [nextDoseNotif, setNextDoseNotif] = useState<NextDoseNotif | null>(initialDerived.next);
  const [showProgressModal, setShowProgressModal] = useState(false);

  // 3D Landscape Card Flip State
  const flipAnim = useSharedValue(0);
  const [isFlippedState, setIsFlippedState] = useState(false);
  const [showEnlargeModal, setShowEnlargeModal] = useState(false);
  const [enlargeFlipped, setEnlargeFlipped] = useState(false);
  const cardFrontShotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const cardBackShotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const modalCardFrontShotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
  const modalCardBackShotRef = useRef<React.ComponentRef<typeof ViewShot>>(null);
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

  // Each face is laid out at its natural height (header, fields and however
  // many dose rows there are) and measured; the card's height follows the
  // face being shown and eases between the two during the flip, so neither
  // side carries an empty band under its content.
  const frontH = useSharedValue(0);
  const backH = useSharedValue(0);
  const cardHeightStyle = useAnimatedStyle(() => {
    const f = frontH.value, b = backH.value;
    if (!f) return { opacity: 0 };
    return { opacity: 1, height: interpolate(flipAnim.value, [0, 1], [f, b || f]) };
  });

  const handleExportFrontCard = async () => {
    if (exportingCard) return;
    if (isGuest || user?.isAnonymous || !mrn) {
      showAlert({
        type: 'guest',
        title: 'Guest Mode',
        message: 'Guest accounts cannot export personalized medical cards. Sign in or register with your Medical Record Number (MRN) to access and export your official record card.',
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
    const isBack = showEnlargeModal ? enlargeFlipped : isFlippedState;
    let targetRef = isBack ? cardBackShotRef : cardFrontShotRef;
    if (showEnlargeModal) {
      targetRef = isBack ? modalCardBackShotRef : modalCardFrontShotRef;
    }
    if (!targetRef.current?.capture) {
      showAlert({
        type: 'warning',
        title: 'Export Unavailable',
        message: 'The card is still loading. Please try again in a moment.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      return;
    }
    setExportingCard(true);
    try {
      const uri = await targetRef.current.capture();
      await saveImageToGallery(uri);
      showAlert({
        type: 'success',
        title: 'Card Saved',
        message: `${isBack ? 'History of Exposure Record Card' : 'Anti-Rabies Vaccination Record Card'} saved to your photo gallery.`,
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } catch (err: any) {
      showAlert({
        type: 'error',
        title: 'Export Failed',
        message: err?.message || 'Could not export record card.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } finally {
      setExportingCard(false);
    }
  };

  // The vaccination card lives inline in this Home feed. Other screens (and
  // KAI's "Open my vaccination card" button) deep-link to it with
  // ?tab=Records, which scrolls it into view; t makes a repeat tap count.
  const tabParam = params?.tab;
  useEffect(() => {
    if (tabParam === 'Records') {
      mainScrollViewRef.current?.scrollTo({ y: 340, animated: true });
    }
  }, [tabParam, params?.t]);

  useEffect(() => {
    if (!authLoading && !user) resetTo(router, '/auth/login');
  }, [authLoading, user]);

  // Raise the OS permission prompt once the patient is signed in, rather than
  // at the moment the first appointment is confirmed — a prompt appearing then
  // would swallow the very banner it was asked for.
  // Deferred until after the first render settles so it never competes with
  // Home appearing. Push token registration itself lives in
  // app/(tabs)/_layout.tsx (it used to run here as well, twice per launch).
  useEffect(() => {
    if (!user) return undefined;
    const task = InteractionManager.runAfterInteractions(() => { ensureNotificationPermission(); });
    return () => task.cancel();
  }, [user?.uid]);

  // Reads the same `vaccinations/{mrn}` doc the Admin Dashboard's Vaccination
  // Tracker writes to (see ka-clinic-admin/src/features/vaccination/VaccinationTrackerPage.jsx cycleStatus) —
  // guest sessions have no MRN, so no vaccination record exists for them.
  const applyVaccinationRecord = (data: PatientRecord | null) => {
    const d = deriveVaccination(data);
    setPatientRecord(d.record);
    setVaccineSchedule(d.schedule);
    setNextDoseNotif(d.next);
    setRecordReady(true);
  };

  // The last-known record (utils/localCache) is shown first; the live
  // listener then replaces it and refreshes the cache.
  useEffect(() => {
    if (!mrn) { setVaccineSchedule([]); setNextDoseNotif(null); setPatientRecord(null); setRecordReady(false); return; }
    const cacheKey = cacheKeys.vaccination(mrn);
    const cached = peekCache<PatientRecord>(cacheKey);
    if (cached) applyVaccinationRecord(cached);
    const vaccineRef = doc(db, 'vaccinations', mrn);
    return onSnapshot(vaccineRef, (snap) => {
      if (!snap.exists()) { applyVaccinationRecord(null); writeCache(cacheKey, null); return; }
      const data: any = snap.data();
      applyVaccinationRecord(data);
      writeCache(cacheKey, data);
    }, (err) => {
      console.error('Vaccination listener error:', err);
      setRecordReady(true);
    });
  }, [mrn]);

  // Clinic-sent follow-ups (manual "Send Follow-up" from the dashboard, and
  // the automatic due-dose sweep). Delivered as push when the app is closed;
  // this listener is what surfaces them in the in-app notification centre and
  // carries the id the "Got it" button acknowledges.
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
      setDeclinedAppts([]);
      return;
    }
    const q = query(collection(db, 'appointments'), where('userId', '==', user.uid));
    return onSnapshot(q, (snap) => {
      const allAppts = snap.docs.map(d => ({ id: d.id, ...(d.data() as any) } as ApptUpdate));
      const confirmed = allAppts
        .filter(a => CONFIRMED_STATUSES.includes(a.status))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      const declined = allAppts
        .filter(a => a.status === 'cancelled' && (a.declineReason || a.cancellationReason))
        .sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));

      // No local banner here: the dashboard's approve/decline goes through
      // /api/notifications, which pushes to this phone. A local notification on
      // top of that showed the same news twice while the app was open.
      setConfirmedAppts(confirmed);
      setDeclinedAppts(declined);
    }, (err) => {
      console.error('Appointment notification listener error:', err);
      setConfirmedAppts([]);
      setDeclinedAppts([]);
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
    declinedAppts.slice(0, 3).forEach(a => {
      const reason = a.declineReason || a.cancellationReason;
      list.push({
        id: `declined-${a.id}`,
        title: 'Appointment Declined',
        message: `Your ${a.type || 'appointment'} on ${formatApptDate(a.date)} was declined.${reason ? ` Reason: ${reason}` : ''}`,
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

  const completedDoses = vaccineSchedule.filter(d => d.done).length;
  const progress = vaccineSchedule.length > 0 ? (completedDoses / vaccineSchedule.length) * 100 : 0;
  const vaccineType = vaccineSchedule[0]?.vaccineType ?? serviceCopy(patientRecord?.service).short;

  // Real regimen label — derived from the same `service`/dose-count data the
  // Admin Dashboard's Vaccination Tracker uses, not a hardcoded placeholder.
  const vaccineCopy = serviceCopy(patientRecord?.service);
  const protocolLabel = buildProtocolLabel(patientRecord?.service, vaccineSchedule.length);

  const displayedNotifications = notifFilter === 'unread' ? notifications.filter(n => n.unread) : notifications;

  // Real patient-record fields for the Vaccination Card — mirrors the exact
  // field names ka-clinic-admin/src/features/patients/PatientsPage.jsx writes to `vaccinations/{mrn}`.
  // Guests have no clinic record at all, so the card shows blanks rather than
  // the sample-data placeholders used while a real patient's record is loading.
  const pr = patientRecord || {};
  // Guests have no clinical record — show a dash instead of the sample-data
  // placeholder a loading real patient record would otherwise fall back to.
  // Every field is the clinic's recorded value or "—" — never a sample value.
  const blank = (val: any) => val || EMPTY;
  const catValue = exposureCategory(pr.cat, pr.animal || pr.sourceOfExposure);
  // Exposure details (date, type, animal, category) exist only on PEP records;
  // other services hide them instead of showing dashes. Guests see the PEP
  // card shape.
  const showExposure = isGuest ? !pr.service : isPepService(pr.service);
  // Rabies courses (PEP, PrEP) keep the anti-rabies card title; other services
  // get a plain vaccination record title.
  const svcKey = serviceCopy(pr.service).short;
  const cardTitle = (isGuest && !pr.service) || svcKey === 'PEP' || svcKey === 'PrEP'
    ? 'ANTI-RABIES VACCINATION RECORD CARD' : 'VACCINATION RECORD CARD';

  const nameSplit = splitName(pr.name || (isGuest ? '' : user?.displayName || ''));
  const lastNameVal = pr.lastName || nameSplit.last || EMPTY;
  const firstNameVal = pr.firstName || nameSplit.first || EMPTY;
  const middleNameVal = pr.middleName || nameSplit.middle;
  const miVal = middleNameVal ? middleNameVal.charAt(0).toUpperCase() + '.' : EMPTY;
  const dobVal = pr.dob ? formatDoseDate(pr.dob) : EMPTY;
  const mrnVal = isGuest && !mrn ? 'No Patient ID (Guest)' : displayPatientId(mrn, pr);
  const purposeVal = pr.service ? serviceCopy(pr.service).long : EMPTY;
  const catVal = catValue ? `Category ${catValue}` : EMPTY;
  // A real patient with no doses yet sees one empty row, never demo doses.
  const NO_DOSES_ROW = [{ id: 'none', label: 'No doses recorded yet', blankRow: true }];
  const doseList: any[] = (Array.isArray(pr.doses) && pr.doses.length > 0)
    ? pr.doses
    : (isGuest ? GUEST_PLACEHOLDER_DOSES : NO_DOSES_ROW);
  const today = clinicToday();

  // Progress tracker shows the same placeholder rows for guests, all unchecked.
  const trackerDoses: any[] = vaccineSchedule.length > 0
    ? vaccineSchedule
    : (isGuest ? GUEST_PLACEHOLDER_DOSES : vaccineSchedule);

  return (
    <View style={s.root}>
      <StatusBar barStyle="light-content" translucent backgroundColor="transparent" />

      <ScrollView ref={mainScrollViewRef} showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 110 + insets.bottom }}>

        {/* ── TOP SECTION: NAVY BLUE GRADIENT ── */}
        <View style={s.topMeshSection}>
          <LinearGradient
            colors={['#1E3A8A', '#0F172A']}
            style={StyleSheet.absoluteFill}
            start={{ x: 0, y: 0 }} end={{ x: 0, y: 1 }}
          />

          {/* Direct Home Greeting Header */}
          <View style={s.topBarDirect}>
            <View style={{ flex: 1, paddingRight: scale(12) }}>
              <Text style={s.hiText}>Hello, {userName || 'Guest Patient'}</Text>
              <Text style={s.feelingText}>How are you feeling today?</Text>
            </View>
            <Tap style={s.notifBtnGlass} onPress={() => setShowNotifPanel(true)} activeOpacity={0.8}>
              <Ionicons name="notifications" size={20} color="#FFFFFF" />
              {unreadCount > 0 && <View style={s.notifDotGlass} />}
            </Tap>
          </View>
        </View>

        {/* ── MAIN CONTENT CONTAINER ── */}
        <View style={s.mainContentContainer}>
          <>
              {/* Harmonious Clean Next Dose Protocol Card */}
              <Tap
                style={s.nextDoseNavyCard} 
                activeOpacity={0.9}
                pressScale
                onPress={() => setShowProgressModal(true)}
              >
                <View style={s.nextDoseNavyDecor} pointerEvents="none" />

                <View style={s.nextDoseNavyIconBox} pointerEvents="none">
                  <Ionicons name="calendar-outline" size={22} color="#475569" />
                </View>

                {/* While the record is on its way, a skeleton with the same
                    rows (pill, title, date, hint) holds the card's height. */}
                {!isGuest && !recordReady && (mrnLoading || !!mrn) ? (
                  <View style={{ flex: 1 }} pointerEvents="none" accessibilityLabel="Loading your next dose">
                    <View style={[s.skel, { width: scale(120), height: verticalScale(16), marginBottom: verticalScale(6) }]} />
                    <View style={[s.skel, { width: '70%', height: verticalScale(18) }]} />
                    <View style={[s.skel, { width: scale(90), height: verticalScale(13), marginTop: verticalScale(6) }]} />
                    <View style={[s.skel, { width: scale(150), height: verticalScale(11), marginTop: verticalScale(8) }]} />
                  </View>
                ) : (
                <View style={{ flex: 1 }} pointerEvents="none">
                  {vaccineSchedule.length > 0 && (
                    <View style={s.nextDoseNavyPillRow}>
                      <Text style={s.nextDoseProgressBadge}>
                        {completedDoses}/{vaccineSchedule.length} Doses Completed
                      </Text>
                    </View>
                  )}
                  <Text style={s.nextDoseNavyDose}>
                    {nextDoseNotif?.doseLabel ?? (isGuest ? 'No Dose Record' : 'No doses scheduled yet')}
                  </Text>
                  {nextDoseNotif && (
                    <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(5), marginTop: verticalScale(2) }}>
                      <Ionicons name="time-outline" size={13} color="#64748B" />
                      <Text style={s.nextDoseNavyDate}>
                        {nextDoseNotif.doseDate}
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
                )}

                <View style={s.nextDoseArrowBox} pointerEvents="none">
                  <Ionicons name="chevron-forward" size={18} color="#475569" />
                </View>
              </Tap>

              {/* ── OFFICIAL VACCINATION RECORD CARD (3D FLIP) ── */}
              <Animated.View style={[s.cdcOfficialCardContainer, cardHeightStyle]}>
                <Tap activeOpacity={0.96} onPress={toggleCardFlip} style={{ width: '100%', height: '100%', borderRadius: scale(14) }}
                  accessibilityRole="button" accessibilityLabel={isFlippedState ? 'Vaccination card, back side. Tap to show the front.' : 'Vaccination card, front side. Tap to show the back.'}>

                  {/* FRONT SIDE (LANDSCAPE) */}
                  <Animated.View style={[s.cdcOfficialCardPaper, frontAnimatedStyle]}
                    onLayout={e => { const h = e.nativeEvent.layout.height; frontH.set(frontH.get() ? withTiming(h, { duration: 220 }) : h); }}>
                    <ViewShot ref={cardFrontShotRef} options={{ format: 'png', quality: 1 }} style={{ backgroundColor: '#FFFFFF' }}>
                    <View style={s.cdcHeaderBlock}>
                      <View style={s.cdcHeaderTitleRow}>
                        <Image source={require('../../assets/logo-white-nobg.png')} style={s.knAClinicLogoHeader} resizeMode="contain" />
                        <View style={{ justifyContent: 'center', alignItems: 'center' }}>
                          <Text style={s.cdcClinicHeaderTitle}>K&A ANIMAL BITE CENTER & CLINIC</Text>
                          <Text style={s.cdcCardTitle}>{cardTitle}</Text>
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
                      {showExposure && (
                        <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                          <Text style={s.cdcFieldLabel}>Exposure Category</Text>
                          <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{catVal}</Text>
                        </View>
                      )}
                    </View>

                    {/* Official Vaccination Schedule Table (3 Columns: Dose, Vaccine/Dosage, Date) */}
                    <View style={s.cdcTableContainer}>
                      <View style={s.cdcTableHeaderRow}>
                        <Text style={[s.cdcTableCellHeader, { flex: 1.1 }]}>Dose</Text>
                        <Text style={[s.cdcTableCellHeader, { flex: 2.1 }]}>Vaccine / Dosage</Text>
                        <Text style={[s.cdcTableCellHeader, { flex: 1.1, borderRightWidth: 0 }]}>Date</Text>
                      </View>

                      {doseList.map((d: any, idx: number) => {
                        // Placeholder rows carry a label but no clinical data. A
                        // real row shows only what the clinic recorded: the brand
                        // given for that dose, plus route and lot when present.
                        const state = doseState(d, today);
                        const brandStr = doseBrand(d, pr, state);
                        const extras = [d.dosage || pr.route, d.lot].filter(Boolean).join(' · ');
                        const vaccineCell = d.blankRow || brandStr === EMPTY ? EMPTY : (extras ? `${brandStr} (${extras})` : brandStr);
                        const dateCell = d.blankRow ? EMPTY : (d.date ? formatDoseDate(d.date) : EMPTY);
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
                  <Animated.View style={[s.cdcOfficialCardPaper, backAnimatedStyle]}
                    onLayout={e => { const h = e.nativeEvent.layout.height; backH.set(backH.get() ? withTiming(h, { duration: 220 }) : h); }}>
                    <ViewShot ref={cardBackShotRef} options={{ format: 'png', quality: 1 }} style={{ backgroundColor: '#FFFFFF' }}>
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

                    {/* Incident & Exposure Profile Fields (PEP only) */}
                    {showExposure && (
                    <>
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Date</Text>
                        <Text style={s.cdcFieldValue}>{pr.date ? formatDoseDate(pr.date) : EMPTY}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Type</Text>
                        <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{exposureTypeLabel(pr.typeOfExposure)}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Source Animal</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.sourceOfExposure || pr.animal)}</Text>
                      </View>
                    </View>
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Exposure Category</Text>
                        <Text style={[s.cdcFieldValue, { color: MEDICAL_RED }]}>{catVal}</Text>
                      </View>
                    </View>
                    </>
                    )}

                    {/* Patient Clinical Profile Fields */}
                    <View style={s.cdcFieldsRow}>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Age / Sex</Text>
                        <Text style={s.cdcFieldValue}>{pr.age ? `${pr.age} yrs • ${pr.sex || EMPTY}` : EMPTY}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Tetanus History</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.lastTetanus || pr.tetanusStatus)}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                        <Text style={s.cdcFieldLabel}>Known Allergies</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.allergies)}</Text>
                      </View>
                      <View style={[s.cdcFieldBox, { flex: 1 }]}>
                        <Text style={s.cdcFieldLabel}>Contact Number</Text>
                        <Text style={s.cdcFieldValue}>{blank(pr.contact)}</Text>
                      </View>
                    </View>

                    {/* Attending Notes Sub-Box */}
                    <View style={s.attendingNotesBox}>
                      <Text style={s.cdcFieldLabel}>Attending Physician / Clinical Protocol Notes</Text>
                      <Text style={s.attendingNotesTxt}>
                        {blank(pr.notes || pr.clinicalNotes)}
                      </Text>
                    </View>
                    </ViewShot>
                  </Animated.View>
                </Tap>
              </Animated.View>

              {/* Standalone Plain Text & Enlarge Button BELOW Card (NO CARD BOX ON TEXT) */}
              <View style={s.cardExternalControlsRow}>
                <Tap onPress={toggleCardFlip} activeOpacity={0.7} style={{ paddingVertical: verticalScale(4) }}>
                  <Text style={s.plainHintTxt}>
                    {isFlippedState ? 'Showing Back (Exposure Record) · Tap to Flip' : 'Showing Front (Vaccination Card) · Tap to Flip'}
                  </Text>
                </Tap>

                <Tap style={s.enlargeCardBtn} onPress={() => setShowEnlargeModal(true)} activeOpacity={0.85}>
                  <Ionicons name="expand-outline" size={13} color="#FFFFFF" />
                  <Text style={s.enlargeCardBtnTxt}>Enlarge Card</Text>
                </Tap>
              </View>

              {/* ══ COMPREHENSIVE CASE & INCIDENT DETAILS TABLE ══ */}
              <View style={s.recordsSection}>
                <View style={s.recordsSectionHeader}>
                  <View style={s.recordsSectionAccent} />
                  <Text style={s.recordsSectionTitle}>Case & Incident Record</Text>
                </View>

                <View style={s.recordsTableCard}>
                  <View style={s.recordsTableHeaderRow}>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.2 }]}>RECORD FIELD</Text>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.8 }]}>DETAILS</Text>
                  </View>

                  {showExposure && (
                  <>
                  <View style={s.recordsTableRow}>
                    <Text style={[s.recordsTableCellLabel, { flex: 1.2 }]}>Exposure Date</Text>
                    <Text style={[s.recordsTableCellValue, { flex: 1.8 }]}>
                      {pr.date || pr.exposureDate ? formatDoseDate(pr.date || pr.exposureDate) : EMPTY}
                    </Text>
                  </View>
                  <View style={[s.recordsTableRow, s.recordsTableRowAlt]}>
                    <Text style={[s.recordsTableCellLabel, { flex: 1.2 }]}>Exposure Category</Text>
                    <Text style={[s.recordsTableCellValue, { flex: 1.8, color: '#3B50DF', fontWeight: '700' }]}>{catVal}</Text>
                  </View>
                  <View style={s.recordsTableRow}>
                    <Text style={[s.recordsTableCellLabel, { flex: 1.2 }]}>Biting Animal</Text>
                    <Text style={[s.recordsTableCellValue, { flex: 1.8 }]}>{pr.animal || pr.sourceOfExposure || EMPTY}</Text>
                  </View>
                  </>
                  )}
                  <View style={[s.recordsTableRow, s.recordsTableRowAlt]}>
                    <Text style={[s.recordsTableCellLabel, { flex: 1.2 }]}>Known Allergies</Text>
                    <Text style={[s.recordsTableCellValue, { flex: 1.8 }]}>{pr.allergies || EMPTY}</Text>
                  </View>
                  <View style={[s.recordsTableRow, { borderBottomWidth: 0 }]}>
                    <Text style={[s.recordsTableCellLabel, { flex: 1.2 }]}>Attending ABTC</Text>
                    <Text style={[s.recordsTableCellValue, { flex: 1.8, fontWeight: '700', color: '#1E293B' }]}>K&A Animal Bite Center</Text>
                  </View>
                </View>
              </View>

              {/* ══ VACCINATION SCHEDULE TABLE — heading follows the record ══ */}
              <View style={s.recordsSection}>
                <View style={s.recordsSectionHeader}>
                  <View style={s.recordsSectionAccent} />
                  <Text style={s.recordsSectionTitle}>{vaccineCopy.timelineTitle}</Text>
                </View>

                <View style={s.recordsTableCard}>
                  {/* Table Header Row */}
                  <View style={s.recordsTableHeaderRow}>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.1 }]}>DOSE</Text>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.4 }]}>VACCINE</Text>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.1 }]}>DOSAGE</Text>
                    <Text style={[s.recordsTableHeaderCell, { flex: 1.0 }]}>DATE</Text>
                    <Text style={[s.recordsTableHeaderCell, { flex: 0.9, textAlign: 'center' }]}>STATUS</Text>
                  </View>

                  {doseList.map((d: any, idx: number) => {
                    const state = doseState(d, today);
                    const st = doseStatus(d, today);
                    const vaccineName = d.blankRow ? EMPTY : doseBrand(d, pr, state);
                    const dosageVal = d.blankRow ? EMPTY : (d.dosage || pr.route || EMPTY);
                    const dateVal = d.date ? formatDoseDate(d.date) : EMPTY;
                    const isAlt = idx % 2 === 1;
                    const isLast = idx === doseList.length - 1;

                    return (
                      <View key={d.id || idx} style={[s.recordsTableRow, isAlt && s.recordsTableRowAlt, isLast && { borderBottomWidth: 0 }]}>
                        <Text style={[s.recordsTableCellValue, { flex: 1.1, fontWeight: '700', color: '#1E293B' }]} numberOfLines={1}>
                          {d.label || d.n || `Dose ${idx + 1}`}
                        </Text>
                        <Text style={[s.recordsTableCellValue, { flex: 1.4 }]} numberOfLines={1}>
                          {vaccineName}
                        </Text>
                        <Text style={[s.recordsTableCellValue, { flex: 1.1 }]} numberOfLines={1}>
                          {dosageVal}
                        </Text>
                        <Text style={[s.recordsTableCellValue, { flex: 1.0 }]} numberOfLines={1}>
                          {dateVal}
                        </Text>
                        <View style={{ flex: 0.9, alignItems: 'center', justifyContent: 'center' }}>
                          <View style={[s.recordsMiniBadge, st.status === 'given' ? s.recordsMiniBadgeDone : st.status === 'overdue' ? s.recordsMiniBadgeMissed : st.status === 'due_today' ? s.recordsMiniBadgeToday : s.recordsMiniBadgePending]}>
                            <Text numberOfLines={1} adjustsFontSizeToFit minimumFontScale={0.75} style={[s.recordsMiniBadgeTxt, st.status === 'given' ? s.recordsMiniBadgeTxtDone : st.status === 'overdue' ? s.recordsMiniBadgeTxtMissed : st.status === 'due_today' ? s.recordsMiniBadgeTxtToday : s.recordsMiniBadgeTxtPending]}>
                              {d.blankRow ? EMPTY : st.label}
                            </Text>
                          </View>
                        </View>
                      </View>
                    );
                  })}
                </View>
              </View>
          </>
        </View>

      </ScrollView>

      {/* ── PROGRESS TRACKER POP-UP MODAL (STYLE: WEB ADD REPORT POP CARD) ── */}
      <Modal visible={showProgressModal} animationType="fade" transparent onRequestClose={() => setShowProgressModal(false)}>
        <TouchableWithoutFeedback onPress={() => setShowProgressModal(false)}>
          <View style={s.centeredOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={s.progressBannerSheet}>
            {/* Clean Slate-50 Header matching Web Pop Card */}
            <View style={s.trackerWebHeader}>
              <View style={{ flex: 1, paddingRight: scale(10) }}>
                <Text style={s.trackerWebHeaderTitle}>{protocolLabel}</Text>
                <Text style={s.trackerWebHeaderSub}>
                  {isGuest && vaccineSchedule.length === 0
                    ? 'No dose record — sign up to start tracking'
                    : `${completedDoses} of ${vaccineSchedule.length || trackerDoses.length} Doses Completed · ${Math.round(progress)}% Immunized`}
                </Text>
              </View>
              <Tap
                onPress={() => setShowProgressModal(false)}
                style={s.trackerWebCloseBtn}
                activeOpacity={0.7}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
              >
                <Ionicons name="close" size={18} color="#94A3B8" />
              </Tap>
            </View>

            {/* Dose timeline — a vertical list: one row per dose, read top to
                bottom like the schedule itself. Doses are fixed by the regimen
                (Day 0/3/7/…) from the exposure date, so there is nothing here
                to book; only clinic staff mark one administered. */}
            <ScrollView
              showsVerticalScrollIndicator={false}
              contentContainerStyle={s.trackerLaneContent}
              style={s.trackerLane}
            >
              {trackerDoses.map((d: any, i: number) => {
                const isNext = !d.blankRow && !d.done && trackerDoses.findIndex((x: any) => !x.done) === i;
                const isMissed = d.missed;
                const isLast = i === trackerDoses.length - 1;

                return (
                  <View key={d.id} style={[s.doseLaneCard, !isLast && s.doseLaneCardGap,
                    d.done && s.doseLaneCardDone,
                    isNext && s.doseLaneCardNext,
                    isMissed && s.doseLaneCardMissed,
                  ]}>
                    <View style={s.doseLaneIcon}>
                      {d.done ? (
                        <Ionicons name="checkmark-circle" size={scale(22)} color="#10B981" />
                      ) : isMissed ? (
                        <Ionicons name="alert-circle" size={scale(22)} color="#EF4444" />
                      ) : isNext ? (
                        <Ionicons name="time" size={scale(22)} color="#2563EB" />
                      ) : (
                        <Ionicons name="ellipse-outline" size={scale(22)} color="#CBD5E1" />
                      )}
                    </View>

                    <View style={s.doseLaneBody}>
                      <Text style={[s.doseLaneTitle, isNext && s.doseLaneTitleNext]} numberOfLines={1}>
                        {d.label}
                      </Text>
                      <Text style={[
                        s.doseLaneDate,
                        d.done && { color: '#059669' },
                        isNext && { color: '#2563EB' },
                        isMissed && { color: '#DC2626' },
                      ]} numberOfLines={1}>
                        {d.blankRow ? 'Not scheduled' : d.date}
                      </Text>
                    </View>

                    <View style={[
                      s.doseLaneBadge,
                      d.done ? s.doseStatusBadgeDone : isMissed ? s.doseStatusBadgeMissed : d.status === 'due_today' ? s.doseStatusBadgeToday : isNext ? s.doseStatusBadgeNext : s.doseStatusBadgeUpcoming,
                    ]}>
                      <Text style={[
                        s.doseStatusText,
                        d.done ? s.doseStatusTextDone : isMissed ? s.doseStatusTextMissed : d.status === 'due_today' ? s.doseStatusTextToday : isNext ? s.doseStatusTextNext : s.doseStatusTextUpcoming,
                      ]}>
                        {d.blankRow ? EMPTY : (d.statusLabel || 'Upcoming')}
                      </Text>
                    </View>
                  </View>
                );
              })}
            </ScrollView>

            <View style={s.trackerWebFooter}>
              <Text style={s.trackerFooterNote} numberOfLines={2}>
                Dose dates follow your regimen automatically. Clinic staff record each dose when it is given.
              </Text>
              <Tap
                style={s.trackerCloseAction}
                onPress={() => setShowProgressModal(false)}
                activeOpacity={0.85}
              >
                <Text style={s.trackerCloseActionText}>Close</Text>
              </Tap>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>

      {/* ── NOTIFICATION PANEL MODAL ── */}
      <Modal visible={showNotifPanel} animationType="slide" transparent>
        <TouchableWithoutFeedback onPress={() => setShowNotifPanel(false)}>
          <View style={s.centeredOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
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
              <Tap onPress={() => setShowNotifPanel(false)} style={s.closeBtn}>
                <Ionicons name="close" size={20} color={C.slate} />
              </Tap>
            </View>

            {/* Filter Row */}
            <View style={s.notifFilterRow}>
              <Tap
                style={[s.notifFilterTab, notifFilter === 'all' && s.notifFilterTabActive]} 
                onPress={() => setNotifFilter('all')}
              >
                <Text style={[s.notifFilterTabText, notifFilter === 'all' && s.notifFilterTabTextActive]}>All ({notifications.length})</Text>
              </Tap>
              <Tap
                style={[s.notifFilterTab, notifFilter === 'unread' && s.notifFilterTabActive]} 
                onPress={() => setNotifFilter('unread')}
              >
                <Text style={[s.notifFilterTabText, notifFilter === 'unread' && s.notifFilterTabTextActive]}>Unread ({unreadCount})</Text>
              </Tap>
              <View style={{ flex: 1 }} />
              <Tap onPress={markAllNotifsRead}>
                <Text style={s.notifActionLink}>Mark all read</Text>
              </Tap>
            </View>

            <ScrollView style={{ maxHeight: verticalScale(400) }} showsVerticalScrollIndicator={false}>
              {displayedNotifications.length === 0 ? (
                <View style={s.emptyNotifBox}>
                  <Ionicons name="notifications-off-outline" size={32} color={C.muted} />
                  <Text style={s.emptyNotifText}>No notifications to show</Text>
                </View>
              ) : (
                displayedNotifications.map(n => (
                  <NotifSwipeToDeleteRow key={n.id} onDelete={() => deleteNotification(n.id)}>
                    <Tap
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
                          name={n.type === 'dose' ? 'calendar' : n.type === 'appointment' ? 'checkmark-circle' : n.type === 'followup' ? 'notifications' : 'medkit'}
                          size={21}
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
                              <Text style={s.ackConfirmedText}>Acknowledged</Text>
                            </View>
                          ) : (
                            <Tap
                              style={s.ackBtn}
                              activeOpacity={0.85}
                              onPress={() => confirmReceipt(n.notificationId)}
                            >
                              <Ionicons name="checkmark" size={14} color="#FFFFFF" />
                              <Text style={s.ackBtnText}>Got it</Text>
                            </Tap>
                          )
                        )}
                      </View>
                      {n.unread && <View style={s.notifUnreadDot} />}
                    </Tap>
                  </NotifSwipeToDeleteRow>
                ))
              )}
            </ScrollView>

            <View style={s.notifFooterRow}>
              <Tap onPress={clearNotifs}>
                <Text style={s.clearNotifText}>Clear Notifications</Text>
              </Tap>
              <Tap style={s.closeNotifBtn} onPress={() => setShowNotifPanel(false)}>
                <Text style={s.closeNotifBtnText}>Close</Text>
              </Tap>
            </View>
          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>

      {/* ── ENLARGE CARD POPUP MODAL (Matching Reference UI) ── */}
      <Modal visible={showEnlargeModal} animationType="slide" transparent statusBarTranslucent>
        <TouchableWithoutFeedback onPress={() => setShowEnlargeModal(false)}>
          <View style={s.enlargeModalOverlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={s.enlargeModalCard}>
            
            {/* Enlarged Card Display Container (90° Rotated Landscape Card matching reference photo) */}
            <View style={s.enlargeCardContainer}>
              <Tap activeOpacity={0.96} onPress={() => setEnlargeFlipped(!enlargeFlipped)} style={{ width: '100%', height: '100%', justifyContent: 'center', alignItems: 'center' }}>
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
                      {showExposure && (
                      <>
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Date</Text>
                          <Text style={s.cdcFieldValuePopup}>{pr.date ? formatDoseDate(pr.date) : EMPTY}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Type</Text>
                          <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{exposureTypeLabel(pr.typeOfExposure)}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Source Animal</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.sourceOfExposure || pr.animal)}</Text>
                        </View>
                      </View>
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Category</Text>
                          <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{catVal}</Text>
                        </View>
                      </View>
                      </>
                      )}

                      {/* Patient Clinical Profile Fields */}
                      <View style={s.cdcFieldsRowPopup}>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Age / Sex</Text>
                          <Text style={s.cdcFieldValuePopup}>{pr.age ? `${pr.age} yrs • ${pr.sex || EMPTY}` : EMPTY}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Tetanus History</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.lastTetanus || pr.tetanusStatus)}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1.2 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Known Allergies</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.allergies)}</Text>
                        </View>
                        <View style={[s.cdcFieldBox, { flex: 1 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Contact Number</Text>
                          <Text style={s.cdcFieldValuePopup}>{blank(pr.contact)}</Text>
                        </View>
                      </View>
                    </View>

                    {/* Attending Notes Sub-Box */}
                    <View style={s.attendingNotesBox}>
                      <Text style={s.cdcFieldLabelPopup}>Attending Physician / Clinical Protocol Notes</Text>
                      <Text style={s.attendingNotesTxtPopup}>
                        {blank(pr.notes || pr.clinicalNotes)}
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
                          <Text style={s.cdcCardTitlePopup}>{cardTitle}</Text>
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
                      {showExposure && (
                        <View style={[s.cdcFieldBox, { flex: 1.5 }]}>
                          <Text style={s.cdcFieldLabelPopup}>Exposure Category</Text>
                          <Text style={[s.cdcFieldValuePopup, { color: MEDICAL_RED }]}>{catVal}</Text>
                        </View>
                      )}
                    </View>
                    <View style={s.cdcTableContainerPopup}>
                      <View style={s.cdcTableHeaderRow}>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 1.1 }]}>Dose</Text>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 2.1 }]}>Vaccine / Dosage</Text>
                        <Text style={[s.cdcTableCellHeaderPopup, { flex: 1.1, borderRightWidth: 0 }]}>Date</Text>
                      </View>
                      {doseList.map((d: any, idx: number) => {
                        // Placeholder rows carry a label but no clinical data. A
                        // real row shows only what the clinic recorded: the brand
                        // given for that dose, plus route and lot when present.
                        const state = doseState(d, today);
                        const brandStr = doseBrand(d, pr, state);
                        const extras = [d.dosage || pr.route, d.lot].filter(Boolean).join(' · ');
                        const vaccineCell = d.blankRow || brandStr === EMPTY ? EMPTY : (extras ? `${brandStr} (${extras})` : brandStr);
                        const dateCell = d.blankRow ? EMPTY : (d.date ? formatDoseDate(d.date) : EMPTY);
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
              </Tap>
            </View>

            {/* Action Buttons Row matching user screenshot */}
            <View style={s.enlargeModalActionsRow}>
              {/* Show Back ID / Show Front ID Button */}
              <Tap
                style={s.enlargePillBtn} 
                onPress={() => setEnlargeFlipped(!enlargeFlipped)}
                activeOpacity={0.8}
              >
                <Text style={s.enlargePillBtnTxt}>
                  {enlargeFlipped ? 'Show Front ID' : 'Show Back ID'}
                </Text>
                <Ionicons name="swap-horizontal" size={16} color="#2563EB" />
              </Tap>

              {/* Export Button (exports current active side to photos) */}
              <Tap
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
              </Tap>
            </View>

            {/* Close Button */}
            <Tap
              style={s.enlargeCloseBtn} 
              onPress={() => setShowEnlargeModal(false)}
              activeOpacity={0.8}
            >
              <Text style={s.enlargeCloseBtnTxt}>Close</Text>
            </Tap>

          </View>
        </TouchableWithoutFeedback>
      </View>
    </TouchableWithoutFeedback>
  </Modal>

      {/* ── BOTTOM NAV BAR ── */}
      <View style={[nav.bar, { height: verticalScale(80) + insets.bottom, paddingBottom: verticalScale(8) + insets.bottom }]}>
        {/* Tab 1: Home */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => {
            setActiveTab('Home');
            mainScrollViewRef.current?.scrollTo({ y: 0, animated: true });
          }}
        >
          <Ionicons name={activeTab === 'Home' ? "home" : "home-outline"} size={24} color={activeTab === 'Home' ? C.red : "#64748B"} />
          <Text style={[nav.label, activeTab === 'Home' && nav.labelActive]}>Home</Text>
        </Tap>

        {/* Tab 2: Appts */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/appt')}
        >
          <Ionicons name="calendar-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Appts</Text>
        </Tap>

        {/* Tab 3: Chat */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/chat')}
        >
          <Ionicons name="chatbubble-ellipses-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Chat</Text>
        </Tap>

        {/* Tab 4: Account */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/profile')}
        >
          <Ionicons name="person-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Account</Text>
        </Tap>
      </View>

      {/* Custom Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={hideAlert} />
    </View>
  );
}

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
    borderWidth: 1.5, borderColor: '#1E3A8A',
  },

  cardOverlapContainer: {
    paddingHorizontal: scale(20),
    marginTop: verticalScale(8),
    zIndex: 10,
  },
  skel: { backgroundColor: '#E2E8F0', borderRadius: scale(6) },
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
    backgroundColor: 'rgba(30, 58, 138, 0.04)',
    top: verticalScale(-60),
    right: scale(-40),
  },
  nextDoseNavyIconBox: {
    width: scale(48),
    height: verticalScale(48),
    borderRadius: scale(16),
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
    backgroundColor: '#EFF6FF',
    alignSelf: 'flex-start',
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(3.5),
    borderRadius: scale(999),
    borderWidth: 1,
    borderColor: '#BFDBFE',
  },
  nextDoseNavyPillDot: {
    width: scale(6),
    height: verticalScale(6),
    borderRadius: scale(3),
    backgroundColor: MEDICAL_RED,
  },
  nextDoseNavyPillText: {
    fontSize: moderateScale(9.5),
    fontWeight: '800',
    color: MEDICAL_RED,
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
    color: MEDICAL_RED,
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

  countBadge: { backgroundColor: C.softRed, borderRadius: scale(10), paddingHorizontal: scale(8), paddingVertical: verticalScale(2) },
  countText: { fontSize: moderateScale(11), fontWeight: '800', color: MEDICAL_RED },




  timelineRowDateTime: {
    fontSize: moderateScale(11.5),
    fontWeight: '500',
    color: '#64748B',
    marginTop: verticalScale(2),
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
  logActionDanger: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },

  // Taller map frame (380px) so satellite view and incident pins are spacious and readable.
  caseStatusDotActive: { backgroundColor: MEDICAL_RED },
  caseStatusDotResolved: { backgroundColor: '#94A3B8' },
  caseStatusPill: { paddingHorizontal: scale(9), paddingVertical: verticalScale(4), borderRadius: scale(20), borderWidth: 1 },
  caseStatusPillActive: { backgroundColor: '#EFF6FF', borderColor: '#BFDBFE' },
  caseStatusPillResolved: { backgroundColor: '#F1F5F9', borderColor: '#E2E8F0' },
  caseStatusPillText: { fontSize: moderateScale(10.5), fontWeight: '800' },
  caseStatusPillTextActive: { color: MEDICAL_RED },
  caseStatusPillTextResolved: { color: '#64748B' },

  // MODAL OVERLAY & SHEETS
  centeredOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'center', alignItems: 'center', padding: scale(20) },
  popupHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) },
  popupTitle: { fontSize: moderateScale(19), fontWeight: '900', color: C.charcoal, letterSpacing: -0.3 },
  popupTitleIconBox: { width: scale(30), height: verticalScale(30), borderRadius: scale(10), backgroundColor: '#F1F5F9', borderWidth: 1, borderColor: '#E2E8F0', justifyContent: 'center', alignItems: 'center' },
  closeBtn: { width: scale(30), height: verticalScale(30), borderRadius: scale(15), backgroundColor: SOFT_GRAY_BG, justifyContent: 'center', alignItems: 'center' },
  fieldValue: { fontSize: moderateScale(11.5), fontWeight: '600', color: C.charcoal, marginTop: verticalScale(3) },

  // PROGRESS POP-UP CARD (MATCHING WEB ADD REPORT MODAL)
  progressBannerSheet: {
    width: '100%',
    // Landscape card: wide enough for the dose lane to read across.
    maxWidth: scale(720),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(24),
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    shadowColor: '#0F172A',
    shadowOpacity: 0.16,
    shadowRadius: 24,
    shadowOffset: { width: 0, height: 10 },
    elevation: 12,
  },
  trackerWebHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: scale(20),
    paddingVertical: verticalScale(14),
    backgroundColor: '#F8FAFC',
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
  },
  trackerWebHeaderTitle: {
    fontSize: moderateScale(15),
    fontWeight: '800',
    color: '#0F172A',
    letterSpacing: -0.2,
  },
  trackerWebHeaderSub: {
    fontSize: moderateScale(11.5),
    color: '#64748B',
    marginTop: verticalScale(2),
    fontWeight: '400',
  },
  trackerWebCloseBtn: {
    width: scale(30),
    height: scale(30),
    borderRadius: scale(8),
    backgroundColor: 'transparent',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerLane: {
    maxHeight: verticalScale(300),
  },
  trackerLaneContent: {
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(14),
  },
  doseLaneCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(12),
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    backgroundColor: '#FFFFFF',
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(14),
  },
  doseLaneCardGap: { marginBottom: verticalScale(8) },
  doseLaneCardDone: { borderColor: '#A7F3D0', backgroundColor: '#F0FDF4' },
  doseLaneCardNext: { borderColor: '#BFDBFE', backgroundColor: '#EFF6FF' },
  doseLaneCardMissed: { borderColor: '#FECACA', backgroundColor: '#FEF2F2' },
  doseLaneIcon: { width: scale(26), justifyContent: 'center', alignItems: 'center' },
  doseLaneBody: { flex: 1, gap: verticalScale(2) },
  doseLaneTitle: {
    fontSize: moderateScale(12.5),
    fontWeight: '700',
    color: '#0F172A',
  },
  doseLaneTitleNext: { color: '#1E40AF', fontWeight: '800' },
  doseLaneDate: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#64748B',
  },
  doseLaneBadge: {
    paddingHorizontal: scale(9),
    paddingVertical: verticalScale(3),
    borderRadius: scale(999),
  },
  trackerFooterNote: {
    flex: 1,
    fontSize: moderateScale(10.5),
    color: '#64748B',
    lineHeight: moderateScale(14),
    paddingRight: scale(10),
  },
  trackerCloseAction: {
    paddingHorizontal: scale(22),
    height: verticalScale(38),
    borderRadius: scale(12),
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerCloseActionText: {
    color: '#FFFFFF',
    fontWeight: '800',
    fontSize: moderateScale(12.5),
  },
  trackerWebFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: scale(10),
    paddingHorizontal: scale(18),
    paddingVertical: verticalScale(14),
    borderTopWidth: 1,
    borderTopColor: '#F1F5F9',
    backgroundColor: '#FFFFFF',
  },
  trackerWebCancelBtn: {
    flex: 1,
    height: verticalScale(42),
    borderRadius: scale(12),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    backgroundColor: '#FFFFFF',
    justifyContent: 'center',
    alignItems: 'center',
  },
  trackerWebCancelText: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#334155',
  },
  trackerWebPrimaryBtn: {
    flex: 1,
    height: verticalScale(42),
    borderRadius: scale(12),
    backgroundColor: '#1E3A8A',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#1E3A8A',
    shadowOpacity: 0.25,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  trackerWebPrimaryText: {
    fontSize: moderateScale(13.5),
    fontWeight: '700',
    color: '#FFFFFF',
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
    backgroundColor: '#EFF6FF',
    borderWidth: 1,
    borderColor: '#BFDBFE',
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
  doseStatusBadgeToday: {
    backgroundColor: '#FFFBEB',
    borderColor: '#FDE68A',
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
  doseStatusTextToday: {
    color: '#B45309',
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
    backgroundColor: '#BFDBFE',
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
    backgroundColor: '#EFF6FF',
    borderColor: '#BFDBFE',
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
  notifPanelSheet: { 
    width: '100%', 
    maxWidth: 420, 
    backgroundColor: '#FFF', 
    borderRadius: scale(32), 
    padding: scale(22), 
    elevation: 12,
    shadowColor: '#0F172A',
    shadowOpacity: 0.18,
    shadowRadius: 28,
    shadowOffset: { width: 0, height: 10 },
  },
  notifCountPill: { backgroundColor: '#EFF6FF', borderRadius: scale(10), paddingHorizontal: scale(10), paddingVertical: verticalScale(3) },
  notifCountPillText: { fontSize: moderateScale(11.5), fontWeight: '800', color: MEDICAL_RED },
  notifFilterRow: { flexDirection: 'row', alignItems: 'center', gap: scale(8), marginBottom: verticalScale(14), borderBottomWidth: 1, borderBottomColor: '#F1F5F9', paddingBottom: verticalScale(10) },
  notifFilterTab: { paddingHorizontal: scale(12), paddingVertical: verticalScale(6), borderRadius: scale(12), backgroundColor: SOFT_GRAY_BG },
  notifFilterTabActive: { backgroundColor: C.softRed },
  notifFilterTabText: { fontSize: moderateScale(12.5), fontWeight: '600', color: C.slate },
  notifFilterTabTextActive: { color: MEDICAL_RED, fontWeight: '800' },
  notifActionLink: { fontSize: moderateScale(12.5), fontWeight: '800', color: '#0284C7' },
  notifItem: {
    flexDirection: 'row',
    gap: scale(12),
    paddingVertical: verticalScale(14),
    paddingHorizontal: scale(14),
    backgroundColor: '#FFFFFF',
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: '#F1F5F9',
    alignItems: 'flex-start',
  },
  notifItemUnread: {},
  notifIconBox: { width: scale(42), height: verticalScale(42), borderRadius: scale(14), justifyContent: 'center', alignItems: 'center' },
  notifItemTitle: { fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },
  notifItemTime: { fontSize: moderateScale(11), color: C.muted, fontWeight: '600' },
  notifItemMsg: { fontSize: moderateScale(12.8), color: C.slate, marginTop: verticalScale(3), lineHeight: moderateScale(17.5) },
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
  notifUnreadDot: { width: scale(8), height: verticalScale(8), borderRadius: scale(4), backgroundColor: '#1E3A8A', marginTop: verticalScale(4) },
  emptyNotifBox: { alignItems: 'center', padding: scale(30) },
  emptyNotifText: { fontSize: moderateScale(13), color: C.muted, marginTop: verticalScale(6), fontWeight: '600' },
  notifFooterRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: verticalScale(14), paddingTop: verticalScale(10), borderTopWidth: 1, borderTopColor: '#F1F5F9' },
  clearNotifText: { fontSize: moderateScale(12.5), fontWeight: '700', color: C.muted },
  closeNotifBtn: { paddingHorizontal: scale(16), paddingVertical: verticalScale(8), backgroundColor: SOFT_GRAY_BG, borderRadius: scale(10) },
  closeNotifBtnText: { fontSize: moderateScale(13), fontWeight: '700', color: C.slate },
  modalHeaderRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: verticalScale(14) },
  modalDateTitle: { fontSize: moderateScale(19), fontWeight: '800', color: '#0F172A' },
  modalTypeSub: { fontSize: moderateScale(12), color: '#64748B', marginTop: verticalScale(2), fontWeight: '500' },
  modalCloseBtn: { width: scale(30), height: verticalScale(30), borderRadius: scale(15), backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },

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
    // Height comes from the measured faces (cardHeightStyle). This is only
    // the first frame's size, before the faces report their height.
    width: '100%',
    height: verticalScale(300),
    marginTop: verticalScale(4),
    marginBottom: verticalScale(8),
  },
  cdcOfficialCardPaper: {
    // Absolute for the flip, but no `bottom`: each face takes its content
    // height, which cardHeightStyle then gives the container.
    position: 'absolute',
    top: verticalScale(0),
    left: scale(0),
    right: scale(0),
    backgroundColor: '#FFFFFF',
    borderRadius: scale(14),
    borderWidth: 1,
    borderColor: '#CBD5E1',
    padding: scale(10),
    // No shadow/elevation: during the 3D flip Android draws the elevation
    // shadow for BOTH faces, so the backfaceVisibility-hidden pane's shadow
    // bleeds through and smears across the card mid-rotation. The border
    // alone defines the card edge.
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
    color: MEDICAL_RED,
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
    // The card sizes to its rows (see cardHeightStyle), so these only set
    // how roomy each dose row is.
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
    backgroundColor: '#1E3A8A',
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
    color: MEDICAL_RED,
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
    color: MEDICAL_RED,
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

  // ══ MEDICAL RECORDS INLINE CARD STYLES ══
  recordsSection: { marginTop: verticalScale(20), width: '100%' },
  recordsSectionHeader: { flexDirection: 'row', alignItems: 'center', marginBottom: verticalScale(10), gap: scale(8) },
  recordsSectionAccent: { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: '#3B50DF' },
  recordsSectionTitle: { fontSize: moderateScale(17), fontWeight: '900', color: C.charcoal, flex: 1 },

  recordsTableCard: {
    backgroundColor: '#FFFFFF',
    borderRadius: scale(16),
    borderWidth: 1,
    borderColor: '#E2E8F0',
    overflow: 'hidden',
    shadowColor: '#0F172A',
    shadowOpacity: 0.04,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  recordsTableHeaderRow: {
    flexDirection: 'row',
    backgroundColor: '#0F172A',
    paddingVertical: verticalScale(10),
    paddingHorizontal: scale(10),
    alignItems: 'center',
  },
  recordsTableHeaderCell: {
    fontSize: moderateScale(10),
    fontWeight: '800',
    color: '#94A3B8',
    letterSpacing: 0.5,
  },
  recordsTableRow: {
    flexDirection: 'row',
    paddingVertical: verticalScale(11),
    paddingHorizontal: scale(10),
    borderBottomWidth: 1,
    borderBottomColor: '#F1F5F9',
    alignItems: 'center',
    backgroundColor: '#FFFFFF',
  },
  recordsTableRowAlt: {
    backgroundColor: '#F8FAFC',
  },
  recordsTableCellLabel: {
    fontSize: moderateScale(11.5),
    fontWeight: '700',
    color: '#475569',
  },
  recordsTableCellValue: {
    fontSize: moderateScale(11),
    fontWeight: '600',
    color: '#1E293B',
  },
  recordsMiniBadge: {
    paddingHorizontal: scale(6),
    paddingVertical: verticalScale(3),
    borderRadius: scale(6),
  },
  recordsMiniBadgeDone: {
    backgroundColor: '#ECFDF5',
  },
  recordsMiniBadgePending: {
    backgroundColor: '#EFF6FF',
  },
  recordsMiniBadgeTxt: {
    fontSize: moderateScale(9.5),
    fontWeight: '800',
  },
  recordsMiniBadgeTxtDone: {
    color: '#059669',
  },
  recordsMiniBadgeTxtPending: {
    color: '#3B50DF',
  },
  recordsMiniBadgeToday: {
    backgroundColor: '#FFFBEB',
  },
  recordsMiniBadgeTxtToday: {
    color: '#B45309',
  },
  recordsMiniBadgeMissed: {
    backgroundColor: '#FEF2F2',
  },
  recordsMiniBadgeTxtMissed: {
    color: '#DC2626',
  },
});
