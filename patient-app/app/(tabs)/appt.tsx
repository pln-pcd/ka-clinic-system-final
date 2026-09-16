// kna/app/app/(tabs)/appt.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  runTransaction,
  updateDoc,
  where,
} from 'firebase/firestore';
import { useEffect, useRef, useState } from 'react';
import Animated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import {
  ActivityIndicator,
  Dimensions,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { db } from '../../config/firebase';
import { moderateScale, scale, verticalScale } from '../../constants/scale';
import { usePatientAuth } from '../../context/PatientAuthContext';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
const { width } = Dimensions.get('window');

const C = {
  red:        '#1E3A8A',
  redLight:   '#2563EB',
  redDeep:    '#172554',
  redFaint:   'rgba(30,58,138,0.07)',
  bg:         '#F5F7FA',
  white:      '#FFFFFF',
  border:     '#E8EDF3',
  charcoal:   '#0F1E2E',
  slate:      '#3D5168',
  muted:      '#8FA3B8',
  green:      '#0DAF7A',
  greenDeep:  '#09916A',
  greenFaint: 'rgba(13,175,122,0.09)',
  orange:     '#E8930A',
  orangeFaint:'rgba(232,147,10,0.1)',
  shapeBlue:  '#2C6FD4',
  blueFaint:  'rgba(44,111,212,0.07)',
  navy:       '#1A3052',
  navyFaint:  'rgba(26,48,82,0.07)',
  card:       '#FFFFFF',
  shadow:     '#1E3A5F',
};

// ─── Helpers ──────────────────────────────────────────────────────────────────
const MONTH_NAMES = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const DAY_NAMES   = ['Sun','Mon','Tue','Wed','Thu','Fri','Sat'];
const pad = (n: number) => String(n).padStart(2, '0');


const toKey = (y: number, m: number, d: number) =>
  `${y}-${pad(m + 1)}-${pad(d)}`;

const daysInMonth  = (y: number, m: number) => new Date(y, m + 1, 0).getDate();
const firstWeekday = (y: number, m: number) => new Date(y, m, 1).getDay();

const displayKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
  });
};

const shortKey = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
};

const shortKeyWithDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
};

// ─── Available slots ──────────────────────────────────────────────────────────
// The clinic only takes appointment bookings on Saturday and Sunday — mirrors
// isWeekendDate() in ka-clinic-admin/src/appts.jsx so a request made here is
// never one the Admin Dashboard's calendar would reject, and the same
// TIME_SLOTS list the admin uses when manually booking a walk-in.
const TIME_SLOTS = [
  '8:00 AM - 9:00 AM',
  '9:00 AM - 10:00 AM',
  '10:00 AM - 11:00 AM',
  '11:00 AM - 12:00 PM',
  '1:00 PM - 2:00 PM',
  '2:00 PM - 3:00 PM',
  '3:00 PM - 4:00 PM',
  '4:00 PM - 5:00 PM',
];

const isWeekendDate = (dateStr: string) => {
  if (!dateStr) return false;
  const day = new Date(`${dateStr}T00:00:00`).getDay();
  return day === 0 || day === 6;
};

// A slot is one patient per hour, identified by the (date, time) pair. Firestore
// document IDs cannot contain '/', which the time strings do not use, but they
// do contain spaces and ':' — fine in an ID, yet normalised here so the key is
// stable and URL-safe. Must stay in sync with the admin dashboard's slotId().
const slotId = (date: string, time: string) =>
  `${date}_${time.replace(/[\s:]/g, '')}`;

// ─── Types ────────────────────────────────────────────────────────────────────
type FirestoreAppt = {
  id: string;
  userId: string;
  name: string;
  date: string;
  time: string;
  type: string;
  status: 'pending' | 'confirmed' | 'accepted' | 'done' | 'cancelled' | 'cancellation_pending';
  note?: string;
  cancellationReason?: string;
  declineReason?: string;
  declinedAt?: number;
  age: string;
  gender: string;
  address: string;
  contactNumber: string;
  createdAt: number;
};

type PatientForm = {
  name: string;
  age: string;
  gender: string;
  address: string;
  contactNumber: string;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
const StatusBadge = ({ status }: { status: string }) => {
  const config = {
    pending:              { bg: C.orangeFaint, color: C.orange, icon: 'time-outline',            label: 'Pending'              },
    cancellation_pending: { bg: C.orangeFaint, color: C.orange, icon: 'alert-circle-outline',   label: 'Cancellation Pending' },
    confirmed:            { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-circle',        label: 'Confirmed'            },
    accepted:             { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-circle',        label: 'Confirmed'            },
    done:                 { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-done-circle',   label: 'Completed'            },
    cancelled:            { bg: C.redFaint,    color: C.red,    icon: 'close-circle-outline',    label: 'Cancelled'            },
  }[status] ?? { bg: C.redFaint, color: C.muted, icon: 'help-circle-outline', label: status };

  return (
    <View style={[sb.wrap, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <Text style={[sb.txt, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

// ─── Appointment Categories ───────────────────────────────────────────────────
const APPT_CATEGORIES = [
  { id: 'checkup',     label: 'Check-up',    icon: 'stethoscope' },
  { id: 'vaccination', label: 'Vaccination', icon: 'medkit'      },
] as const;

// The services a patient can request a visit for, most-requested first.
// PrEP is deliberately absent: a pre-exposure course is started by the clinic
// when the patient is registered, not booked as a visit type here.
const VACCINE_OPTIONS = [
  { id: 'Post-Exposure', label: 'Anti-Rabies (PEP)', desc: 'After an animal bite or scratch' },
  { id: 'Booster',       label: 'Booster Dose',      desc: 'Top-up for a previous course' },
  { id: 'Anti-Tetano',   label: 'Anti-Tetanus',      desc: 'Tetanus toxoid for wounds' },
  { id: 'Pneumonia',     label: 'Pneumonia',         desc: 'Pneumococcal vaccine' },
];

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const router   = useRouter();
  const { user, mrn } = usePatientAuth();
  const insets   = useSafeAreaInsets();
  const now      = new Date();
  const todayKey = toKey(now.getFullYear(), now.getMonth(), now.getDate());

  const [viewYear,  setViewYear]  = useState(now.getFullYear());
  const [viewMonth, setViewMonth] = useState(now.getMonth());

  const [selectedKey,  setSelectedKey]  = useState<string | null>(null);
  const [selectedTime, setSelectedTime] = useState<string | null>(null);
  const [showSuccess,  setShowSuccess]  = useState(false);
  const [saving,       setSaving]       = useState(false);
  const [showToast,    setShowToast]    = useState(false);
  const [showSlotModal, setShowSlotModal] = useState(false);
  // Hours already claimed by any patient on the selected date.
  const [takenTimes, setTakenTimes] = useState<string[]>([]);
  // date -> hours taken, across the month currently on screen.
  const [monthSlotCounts, setMonthSlotCounts] = useState<Record<string, number>>({});

  // ── Appointment Details & Cancellation Modals ─────────────────────────────
  const [selectedApptDetail, setSelectedApptDetail] = useState<FirestoreAppt | null>(null);
  const [cancellationReasonInput, setCancellationReasonInput] = useState('');
  // Android: KeyboardAvoidingView 'height' inside a translucent Modal fights
  // the window inset and jitters. Reanimated reads the keyboard natively and
  // lifts the sheet smoothly instead (same approach as chat.tsx). iOS keeps
  // KeyboardAvoidingView 'padding'.
  const detailKeyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  const detailKeyboardLift = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'android' ? detailKeyboard.height.value : 0,
  }));
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

  // Reason is typed inline in the details modal (no second pop-up).
  const handleRequestCancellation = async () => {
    const target = selectedApptDetail;
    if (!target) return;
    if (!cancellationReasonInput.trim()) {
      showAlert({
        type: 'warning',
        title: 'Reason Required',
        message: 'Please provide a reason for the cancellation so the clinic can review it.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      return;
    }
    setSubmittingCancellation(true);
    try {
      await updateDoc(doc(db, 'appointments', target.id), {
        status: 'cancellation_pending',
        cancellationReason: cancellationReasonInput.trim(),
        cancellationRequestedAt: Date.now(),
        updatedAt: Date.now(),
      });
      setSelectedApptDetail(null);
      setCancellationReasonInput('');
      showAlert({
        type: 'success',
        title: 'Cancellation Requested',
        message: 'Your request was sent to the clinic. The appointment stays booked until staff approve the cancellation.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } catch (e: any) {
      showAlert({
        type: 'error',
        title: 'Request Failed',
        message: e?.message || 'Could not submit the cancellation request. Please try again.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } finally {
      setSubmittingCancellation(false);
    }
  };

  // ── Patient details form modal ────────────────────────────────────────────
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [patientForm, setPatientForm] = useState<PatientForm>({
    name: '', age: '', gender: '', address: '', contactNumber: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<PatientForm>>({});
  // Whether the clinic record has already been folded into the form. The form
  // is only ever seeded, never re-written under the patient: once they have
  // typed into it, incoming record data must not clobber what they entered.
  const prefilledRef = useRef(false);

  // Auto-fill from the patient's own clinic record (`vaccinations/{mrn}` — the
  // doc the Admin Dashboard writes). Fields the record has no value for are
  // left genuinely empty so the patient fills them in themselves; nothing here
  // writes back, so opening the form never changes the stored record.
  useEffect(() => {
    if (!mrn) return;
    return onSnapshot(doc(db, 'vaccinations', mrn), (snap) => {
      if (!snap.exists() || prefilledRef.current) return;
      const r: any = snap.data() || {};
      const joinedName = r.name || [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ');
      const seeded = {
        name: (joinedName || user?.displayName || '').trim(),
        age: r.age !== undefined && r.age !== null ? String(r.age) : '',
        gender: r.sex || r.gender || '',
        address: r.address || '',
        contactNumber: r.contact || r.contactNumber || '',
      };
      // Only fill blanks — anything already typed wins.
      setPatientForm(prev => ({
        name: prev.name || seeded.name,
        age: prev.age || seeded.age,
        gender: prev.gender || seeded.gender,
        address: prev.address || seeded.address,
        contactNumber: prev.contactNumber || seeded.contactNumber,
      }));
      prefilledRef.current = true;
    }, (err) => console.error('Patient record prefill failed:', err));
  }, [mrn, user?.displayName]);
  const [apptCategory,       setApptCategory]       = useState<'checkup' | 'vaccination'>('checkup');
  const [vaccineType,        setVaccineType]        = useState<string>('');
  const [vaccineDropdownOpen,setVaccineDropdownOpen] = useState(false);

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

  const GENDER_OPTIONS = ['Male', 'Female', 'Other'];

  // ── Firestore: live appointments for this patient ─────────────────────────
  const [myAppointments, setMyAppointments] = useState<FirestoreAppt[]>([]);
  const [loadingApts,    setLoadingApts]    = useState(true);

  const [aptsError, setAptsError] = useState('');

  // Clinic-wide maintenance switch (admin portal → Settings → System). The
  // landing-page booking form already honours it; the app must too, otherwise
  // "halts public appointment booking" is only half true.
  const [maintenanceMode, setMaintenanceMode] = useState(false);
  useEffect(() => {
    return onSnapshot(doc(db, 'settings', 'config'), snap => {
      setMaintenanceMode(!!snap.data()?.system?.maintenanceMode);
    }, err => console.warn('Settings listener error:', err));
  }, []);

  useEffect(() => {
    if (!user) return;
    const q = query(
      collection(db, 'appointments'),
      where('userId', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsub = onSnapshot(q, snap => {
      setAptsError('');
      setMyAppointments(snap.docs.map(d => ({ id: d.id, ...d.data() } as FirestoreAppt)));
      setLoadingApts(false);
    }, err => {
      console.error('Appointments listener error:', err);
      setAptsError(err?.code === 'permission-denied'
        ? 'You do not have permission to view appointments. Please sign in again.'
        : 'Could not load appointments. Please check your connection.');
      setLoadingApts(false);
    });
    return () => unsub();
  }, [user]);

  const upcomingApts = myAppointments.filter(a =>
    a.status !== 'cancelled' && a.date >= todayKey
  );
  const pastApts = myAppointments.filter(a =>
    (a.status === 'confirmed' || a.status === 'accepted' || a.status === 'done') && a.date < todayKey
  );
  const cancelledApts = myAppointments.filter(a => a.status === 'cancelled');

  // Slot holds across the visible month, so the calendar can mark a weekend
  // whose every hour is gone as full rather than inviting a tap that leads to
  // an empty slot list. Keyed by date -> number of hours taken.
  useEffect(() => {
    const monthStart = toKey(viewYear, viewMonth, 1);
    const monthEnd   = toKey(viewYear, viewMonth, daysInMonth(viewYear, viewMonth));
    const q = query(
      collection(db, 'appointmentSlots'),
      where('date', '>=', monthStart),
      where('date', '<=', monthEnd),
    );
    return onSnapshot(q, snap => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const date = (d.data() as any).date;
        if (date) counts[date] = (counts[date] || 0) + 1;
      });
      setMonthSlotCounts(counts);
    }, err => {
      console.error('Month slot listener error:', err);
      setMonthSlotCounts({});
    });
  }, [viewYear, viewMonth]);

  // Which hours on the selected date are already held by someone. Read from
  // appointmentSlots (occupancy only, no patient data) because Firestore rules
  // deliberately forbid reading other patients' appointment documents.
  useEffect(() => {
    if (!selectedKey) { setTakenTimes([]); return; }
    const q = query(collection(db, 'appointmentSlots'), where('date', '==', selectedKey));
    return onSnapshot(q, snap => {
      setTakenTimes(snap.docs.map(d => (d.data() as any).time).filter(Boolean));
    }, err => {
      // Fail open on the UI: the transactional claim in handleConfirm is the
      // real guard, so a listener error must not block booking outright.
      console.error('Slot availability listener error:', err);
      setTakenTimes([]);
    });
  }, [selectedKey]);

  const slots      = selectedKey && isWeekendDate(selectedKey)
    ? TIME_SLOTS.map(time => ({ time, available: !takenTimes.includes(time) }))
    : [];
  const canConfirm = !!selectedKey && !!selectedTime && !saving
    && !takenTimes.includes(selectedTime);

  // ── Month nav ─────────────────────────────────────────────────────────────
  // Paging back past the current month only ever shows fully-disabled cells,
  // so the back arrow stops there.
  const atCurrentMonth =
    viewYear === now.getFullYear() && viewMonth === now.getMonth();

  const goToPrev = () => {
    if (atCurrentMonth) return;
    setSelectedKey(null); setSelectedTime(null);
    if (viewMonth === 0) { setViewYear(y => y - 1); setViewMonth(11); }
    else setViewMonth(m => m - 1);
  };
  const goToNext = () => {
    setSelectedKey(null); setSelectedTime(null);
    if (viewMonth === 11) { setViewYear(y => y + 1); setViewMonth(0); }
    else setViewMonth(m => m + 1);
  };

  const handleDayPress = (day: number) => {
    // Guests have no clinic record to attach an appointment to — clinic staff
    // can't act on a booking that isn't tied to a real patient.
    if (user?.isAnonymous || !mrn) {
      showAlert({
        type: 'guest',
        title: 'Guest Account',
        message: "Guest accounts can't book appointments. Please sign up with your Medical Record Number (MRN) first.",
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
    const key  = toKey(viewYear, viewMonth, day);
    const date = new Date(viewYear, viewMonth, day); date.setHours(0,0,0,0);
    const ref  = new Date(); ref.setHours(0,0,0,0);
    if (date < ref || !isWeekendDate(key)) return;
    setSelectedKey(key);
    setSelectedTime(null);
    setShowSlotModal(true);
  };

  // ── Validate patient form ─────────────────────────────────────────────────
  const validateForm = (): boolean => {
    const errors: Partial<PatientForm> = {};
    if (!patientForm.name.trim())          errors.name          = 'Full name is required';
    if (!patientForm.age.trim())           errors.age           = 'Age is required';
    else if (isNaN(Number(patientForm.age)) || Number(patientForm.age) <= 0 || Number(patientForm.age) > 120)
                                           errors.age           = 'Enter a valid age';
    if (!patientForm.gender)               errors.gender        = 'Gender is required';
    if (!patientForm.address.trim())       errors.address       = 'Address is required';
    if (!patientForm.contactNumber.trim()) errors.contactNumber = 'Contact number is required';
    else if (!/^[0-9+\-\s]{7,15}$/.test(patientForm.contactNumber.trim()))
                                           errors.contactNumber = 'Enter a valid contact number';
    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // ── Open details form (called from "Request Appointment" button) ──────────
  const handleOpenDetailsForm = () => {
    if (!canConfirm) return;
    setFormErrors({});
    setShowDetailsForm(true);
  };

  // ── Book appointment → Firestore ──────────────────────────────────────────
  const handleConfirm = async () => {
    if (!validateForm()) return;
    if (!selectedKey || !selectedTime) return;

    if (maintenanceMode) {
      showAlert({
        type: 'warning',
        title: 'Booking Temporarily Unavailable',
        message: 'The clinic has paused online appointment booking for maintenance. Please try again later or contact the clinic directly.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      return;
    }

    if (!user) {
      showAlert({
        type: 'error',
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again to continue.',
        primaryButtonText: 'Log In',
        onPrimaryPress: () => {
          hideAlert();
          router.replace('/auth/login');
        },
      });
      return;
    }
    // Firestore rules require a valid clinic MRN (patientId) to create an
    // appointment — guest sessions have no authorizedPatients record yet.
    if (!mrn) {
      showAlert({
        type: 'guest',
        title: 'Registration Required',
        message: 'Please sign in with your Medical Record Number (MRN) to book an appointment. Guest booking is not available yet — visit the clinic front desk to get registered.',
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

    setSaving(true);
    try {
      // Claim the hour first, inside a transaction. Whoever creates the slot doc
      // wins; a second patient racing for the same hour reads an existing doc and
      // aborts here, before any appointment is written. The success toast is only
      // shown after this resolves — announcing it earlier would tell the loser of
      // a race that their booking succeeded.
      const slotRef = doc(db, 'appointmentSlots', slotId(selectedKey, selectedTime));
      await runTransaction(db, async tx => {
        const existing = await tx.get(slotRef);
        if (existing.exists()) throw new Error('SLOT_TAKEN');
        tx.set(slotRef, {
          date:      selectedKey,
          time:      selectedTime,
          heldBy:    user.uid,
          createdAt: Date.now(),
        });
      });

      setShowDetailsForm(false);
      setPatientForm({ name: '', age: '', gender: '', address: '', contactNumber: '' });
      prefilledRef.current = false;
      setApptCategory('checkup');
      setVaccineType('');
      setVaccineDropdownOpen(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);

      await addDoc(collection(db, 'appointments'), {
        userId:        user.uid,
        patientUid:    user.uid,
        patientId:     mrn,
        email:         user.email || '',
        name:          patientForm.name.trim(),
        age:           patientForm.age.trim(),
        gender:        patientForm.gender,
        address:       patientForm.address.trim(),
        contactNumber: patientForm.contactNumber.trim(),
        date:          selectedKey,
        time:          selectedTime,
        type:          apptCategory === 'vaccination' ? `Vaccination – ${vaccineType}` : 'Check-up',
        status:        'pending',
        // Distinguishes an in-app booking from a walk-in the clinic keyed in and
        // from the landing page's 'online' form — the dashboard groups on this.
        source:        'app',
        note:          '',
        createdAt:     Date.now(),
      });
      setShowSuccess(true);
    } catch (e: any) {
      console.error('Booking error:', e);
      // Lost the race for this hour — someone else claimed it between the slot
      // list rendering and this write. Send the patient back to pick again;
      // the listener will already have greyed the slot out.
      if (e?.message === 'SLOT_TAKEN') {
        setSelectedTime(null);
        setShowDetailsForm(false);
        setShowSlotModal(true);
        showAlert({
          type: 'warning',
          title: 'Time Slot Taken',
          message: 'Sorry — another patient just booked this time slot. Please choose a different time.',
          primaryButtonText: 'Choose Another Time',
          onPrimaryPress: hideAlert,
        });
      } else {
        showAlert({
          type: 'error',
          title: 'Booking Failed',
          message: e?.code === 'permission-denied'
            ? 'Booking failed: you do not have permission to book. Please make sure you are signed in with a valid MRN.'
            : `Booking failed: ${e?.message || 'Unknown error. Please try again.'}`,
          primaryButtonText: 'OK',
          onPrimaryPress: hideAlert,
        });
      }
    } finally {
      setSaving(false);
    }
  };


  const handleDone = () => {
    setShowSuccess(false);
    setSelectedKey(null);
    setSelectedTime(null);
  };

  // ── Calendar cells ────────────────────────────────────────────────────────
  const total  = daysInMonth(viewYear, viewMonth);
  const start  = firstWeekday(viewYear, viewMonth);
  const cells: (number | null)[] = [
    ...Array(start).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7 !== 0) cells.push(null);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <View style={s.root}>
      <StatusBar barStyle="dark-content" translucent backgroundColor="transparent" />

      {/* ── TOP SECTION: white header matching the Logged-in Devices layout
          (profile.tsx SubHeader) — centered title, thin bottom border, no
          gradient. Appointments is a root tab, not a pushed screen, so there
          is no back chevron, just the section icon on the right. ── */}
      <View style={s.topMeshSection}>
        <View style={s.headerTop}>
          <View style={{ width: scale(46) }} />
          <View style={{ flex: 1, alignItems: 'center' }}>
            <Text style={s.headerTitle}>Appointments</Text>
            <Text style={s.headerSub}>Schedule & manage your visits</Text>
          </View>
          <View style={s.btnGlass}>
            <Ionicons name="calendar" size={22} color={C.red}/>
          </View>
        </View>
      </View>

      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: verticalScale(110) + insets.bottom, paddingTop: verticalScale(14) }}>

        {aptsError ? (
          <View style={s.hint}>
            <Ionicons name="alert-circle-outline" size={14} color={C.red}/>
            <Text style={[s.hintTxt, { color: C.red }]}>{aptsError}</Text>
          </View>
        ) : null}

        {/* ══ SECTION: Book ══ */}
        <View style={s.sectionLabel}>
          <View style={s.sectionAccent}/>
          <Text style={s.sectionLabelTxt}>Book Appointment</Text>
        </View>

        {/* Calendar */}
        <View style={s.section}>
          <View style={s.calCard}>
            <View style={s.calHeader}>
              <TouchableOpacity
                onPress={goToPrev}
                style={[s.calNavBtn, atCurrentMonth && s.calNavBtnOff]}
                disabled={atCurrentMonth}
                activeOpacity={atCurrentMonth ? 1 : 0.75}
              >
                <Ionicons name="chevron-back" size={18} color={atCurrentMonth ? '#CBD5E1' : C.charcoal}/>
              </TouchableOpacity>
              <Text style={s.calMonthTxt}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <TouchableOpacity onPress={goToNext} style={s.calNavBtn}>
                <Ionicons name="chevron-forward" size={18} color={C.charcoal}/>
              </TouchableOpacity>
            </View>

            <View style={s.calWeekRow}>
              {DAY_NAMES.map(d => (
                <View key={d} style={s.calWeekCell}>
                  <Text style={s.calWeekTxt}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={s.calGrid}>
              {cells.map((day, idx) => {
                if (day === null) return <View key={`b${idx}`} style={s.calCell}/>;
                const key        = toKey(viewYear, viewMonth, day);
                const isToday    = key === todayKey;
                const isSelected = key === selectedKey;
                const hasSlots   = isWeekendDate(key);
                const cellDate   = new Date(viewYear, viewMonth, day); cellDate.setHours(0,0,0,0);
                const refDate    = new Date(); refDate.setHours(0,0,0,0);
                const isPast     = cellDate < refDate;
                // Every hour claimed — still a clinic day, but nothing left to book.
                const isFull     = hasSlots && (monthSlotCounts[key] || 0) >= TIME_SLOTS.length;
                const tappable   = !isPast && hasSlots && !isFull;

                return (
                  <TouchableOpacity
                    key={key}
                    style={s.calCell}
                    onPress={() => tappable && handleDayPress(day)}
                    activeOpacity={tappable ? 0.75 : 1}
                    disabled={!tappable}
                  >
                    {/* Bookable dates are marked by red numerals alone — no fill,
                        so only the selected date carries a background. */}
                    <View style={[
                      s.calTile,
                      isToday && !isSelected && s.calTileToday,
                      isSelected && s.calTileSelected,
                    ]}>
                      <Text style={[
                        s.calDayTxt,
                        isPast               && s.calDayPast,
                        !isPast && !hasSlots && s.calDayNoSlot,
                        tappable && !isSelected && s.calDayOpen,
                        !isPast && isFull && !isSelected && s.calDayFull,
                        isToday && !isSelected && s.calDayToday,
                        isSelected           && s.calDaySelected,
                      ]}>
                        {day}
                      </Text>
                    </View>
                  </TouchableOpacity>
                );
              })}
            </View>

            <View style={s.legend}>
              <View style={s.legendItem}><Text style={s.legendNum}>5</Text><Text style={s.legendTxt}>Open to book</Text></View>
              <View style={s.legendItem}><Text style={[s.legendNum, s.calDayFull]}>6</Text><Text style={s.legendTxt}>Fully booked</Text></View>
              <View style={s.legendItem}><View style={s.legendToday}/><Text style={s.legendTxt}>Today</Text></View>
            </View>
          </View>
        </View>

        {/* Hint */}
        {!selectedKey && (
          <View style={s.hint}>
            <Ionicons name="hand-left-outline" size={14} color={C.muted}/>
            <Text style={s.hintTxt}>The clinic accepts appointments on Saturdays & Sundays only — tap a highlighted date to see time slots</Text>
          </View>
        )}

        {/* ══ SECTION: My Appointments ══ */}
        <View style={[s.sectionLabel, { marginTop: verticalScale(28) }]}>
          <View style={s.sectionAccent}/>
          <Text style={s.sectionLabelTxt}>My Appointments</Text>
          <View style={[s.countBadge, { backgroundColor: C.navyFaint }]}>
            <Text style={[s.countTxt, { color: C.navy }]}>{upcomingApts.length}</Text>
          </View>
        </View>

        <View style={s.section}>
          {loadingApts ? (
            <View style={s.emptyCard}>
              <ActivityIndicator color={C.navy} size="small"/>
              <Text style={s.emptyCardTxt}>Loading appointments...</Text>
            </View>
          ) : upcomingApts.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="calendar-outline" size={22} color={C.muted}/>
              <Text style={s.emptyCardTxt}>No upcoming appointments</Text>
            </View>
          ) : (
            upcomingApts.map(appt => {
              const confirmedLike = appt.status === 'confirmed' || appt.status === 'accepted' || appt.status === 'done';
              return (
              <TouchableOpacity key={appt.id} style={s.apptCard} activeOpacity={0.85} onPress={() => setSelectedApptDetail(appt)}>
                <View style={[s.apptDateBox, confirmedLike && { backgroundColor: C.greenFaint }]}>
                  <Text style={[s.apptDateNum, confirmedLike && { color: C.green }]}>
                    {new Date(appt.date + 'T00:00:00').getDate()}
                  </Text>
                  <Text style={[s.apptDateMon, confirmedLike && { color: C.green }]}>
                    {new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                  </Text>
                </View>
                <View style={s.apptInfo}>
                  <Text style={s.apptInfoTitle}>{shortKeyWithDay(appt.date)}</Text>
                  <View style={s.apptInfoRow}>
                    <Ionicons name="time-outline" size={11} color={C.muted}/>
                    <Text style={s.apptInfoSub}>{appt.time}</Text>
                  </View>
                  {appt.cancellationReason && appt.status === 'cancellation_pending' && (
                    <View style={[s.adminNoteBox, { backgroundColor: C.orangeFaint }]}>
                      <Ionicons name="alert-circle-outline" size={11} color={C.orange}/>
                      <Text style={[s.adminNoteTxt, { color: C.orange }]}>Pending Admin Approval: {appt.cancellationReason}</Text>
                    </View>
                  )}
                  {appt.note && appt.status === 'cancelled' && (
                    <View style={s.adminNoteBox}>
                      <Ionicons name="chatbubble-ellipses-outline" size={11} color={C.red}/>
                      <Text style={s.adminNoteTxt}>Clinic: {appt.note}</Text>
                    </View>
                  )}
                  {appt.note && confirmedLike && (
                    <View style={[s.adminNoteBox, { backgroundColor: C.greenFaint }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={11} color={C.green}/>
                      <Text style={[s.adminNoteTxt, { color: C.green }]}>Clinic: {appt.note}</Text>
                    </View>
                  )}
                </View>
                <View style={s.apptRight}>
                  <StatusBadge status={appt.status}/>
                  {appt.status === 'pending' && (
                    <TouchableOpacity style={s.cancelBtn} onPress={() => { setCancellationReasonInput(''); setSelectedApptDetail(appt); }}>
                      <Ionicons name="close" size={12} color={C.muted}/>
                    </TouchableOpacity>
                  )}
                </View>
              </TouchableOpacity>
              );
            })
          )}
        </View>

        {/* ══ SECTION: Past ══ */}
        {pastApts.length > 0 && (
          <>
            <View style={[s.sectionLabel, { marginTop: verticalScale(8) }]}>
              <View style={[s.sectionAccent, { backgroundColor: C.green }]}/>
              <Text style={s.sectionLabelTxt}>Past Appointments</Text>
              <View style={[s.countBadge, { backgroundColor: C.greenFaint }]}>
                <Text style={[s.countTxt, { color: C.green }]}>{pastApts.length}</Text>
              </View>
            </View>
            <View style={s.section}>
              {pastApts.map(appt => (
                <TouchableOpacity
                  key={appt.id}
                  style={[s.apptCard, { opacity: 0.7 }]}
                  activeOpacity={0.85}
                  onPress={() => setSelectedApptDetail(appt)}
                >
                  <View style={[s.apptDateBox, { backgroundColor: C.greenFaint }]}>
                    <Text style={[s.apptDateNum, { color: C.green }]}>{new Date(appt.date + 'T00:00:00').getDate()}</Text>
                    <Text style={[s.apptDateMon, { color: C.green }]}>{new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</Text>
                  </View>
                  <View style={s.apptInfo}>
                    <Text style={s.apptInfoTitle}>{shortKeyWithDay(appt.date)}</Text>
                    <View style={s.apptInfoRow}>
                      <Ionicons name="time-outline" size={11} color={C.muted}/>
                      <Text style={s.apptInfoSub}>{appt.time}</Text>
                    </View>
                  </View>
                  <View style={s.apptRight}>
                    <View style={s.doneBadge}>
                      <Ionicons name="checkmark-circle" size={12} color={C.green}/>
                      <Text style={s.doneTxt}>Done</Text>
                    </View>
                  </View>
                </TouchableOpacity>
              ))}
            </View>
          </>
        )}

        {/* ══ SECTION: Cancelled ══ */}
        {cancelledApts.length > 0 && (
          <>
            <View style={[s.sectionLabel, { marginTop: verticalScale(8) }]}>
              <View style={[s.sectionAccent, { backgroundColor: C.muted }]}/>
              <Text style={s.sectionLabelTxt}>Cancelled</Text>
              <View style={[s.countBadge, { backgroundColor: C.redFaint }]}>
                <Text style={[s.countTxt, { color: C.red }]}>{cancelledApts.length}</Text>
              </View>
            </View>
            <View style={s.section}>
              {cancelledApts.map(appt => (
                <View key={appt.id} style={{ marginBottom: verticalScale(10) }}>
                  <TouchableOpacity
                    style={[s.apptCard, { opacity: 0.9 }]}
                    activeOpacity={0.85}
                    onPress={() => setSelectedApptDetail(appt)}
                  >
                    <View style={[s.apptDateBox, { backgroundColor: C.redFaint }]}>
                      <Text style={[s.apptDateNum, { color: C.red }]}>{new Date(appt.date + 'T00:00:00').getDate()}</Text>
                      <Text style={[s.apptDateMon, { color: C.red }]}>{new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</Text>
                    </View>
                    <View style={s.apptInfo}>
                      <Text style={s.apptInfoTitle}>{shortKeyWithDay(appt.date)}</Text>
                      <View style={s.apptInfoRow}>
                        <Ionicons name="time-outline" size={11} color={C.muted}/>
                        <Text style={s.apptInfoSub}>{appt.time}</Text>
                      </View>
                      {(appt.declineReason || appt.cancellationReason) ? (
                        <View style={[s.adminNoteBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 0.5, marginTop: 4 }]}>
                          <Ionicons name="alert-circle-outline" size={11} color={C.red}/>
                          <Text style={[s.adminNoteTxt, { color: '#B91C1C', fontWeight: '600' }]} numberOfLines={2}>
                            {appt.declineReason ? `Declined: ${appt.declineReason}` : `Reason: ${appt.cancellationReason}`}
                          </Text>
                        </View>
                      ) : appt.note ? (
                        <View style={s.adminNoteBox}>
                          <Ionicons name="chatbubble-ellipses-outline" size={11} color={C.red}/>
                          <Text style={s.adminNoteTxt}>Clinic: {appt.note}</Text>
                        </View>
                      ) : null}
                    </View>
                  </TouchableOpacity>
                </View>
              ))}
            </View>
          </>
        )}

      </ScrollView>

      {/* ══ TIME SLOT MODAL ══════════════════════════════════════════════════ */}
      <Modal visible={showSlotModal} transparent animationType="fade" statusBarTranslucent>
        <View style={sm.overlay}>
          <View style={sm.card}>
            {/* Header */}
            <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
              <View style={{ flex: 1 }}>
                <Text style={sm.headerTitle}>Pick a Time Slot</Text>
                {selectedKey && <Text style={sm.headerSub}>{displayKey(selectedKey)}</Text>}
              </View>
              <TouchableOpacity onPress={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }} style={sm.closeBtn}>
                <Ionicons name="close" size={20} color={C.white}/>
              </TouchableOpacity>
            </LinearGradient>

            <View style={sm.body}>
              {/* Time grid */}
              <View style={s.timeGrid}>
                {slots.map(slot => {
                  const active   = selectedTime === slot.time;
                  const disabled = !slot.available;
                  return (
                    <TouchableOpacity
                      key={slot.time}
                      style={[s.timeChip, active && s.timeChipActive, disabled && s.timeChipOff]}
                      onPress={() => !disabled && setSelectedTime(slot.time)}
                      activeOpacity={disabled ? 1 : 0.8}
                      disabled={disabled}
                    >
                      {active && <LinearGradient colors={[C.navy, C.charcoal]} style={[StyleSheet.absoluteFillObject, { borderRadius: scale(16) }]}/>}
                      <Ionicons name={active ? 'time' : 'time-outline'} size={13} color={active ? C.white : disabled ? '#CBD5E1' : C.slate}/>
                      <Text style={[s.timeTxt, active && { color: C.white, fontWeight: '800' }, disabled && { color: '#CBD5E1', textDecorationLine: 'line-through' }]}>
                        {slot.time}
                      </Text>
                      {disabled && <View style={s.fullPill}><Text style={s.fullPillTxt}>Full</Text></View>}
                    </TouchableOpacity>
                  );
                })}
              </View>

              {/* Summary */}
              {selectedTime && (
                <>
                  <View style={sm.divider}/>
                  <View style={s.summaryCard}>
                    <View style={s.summaryHead}>
                      <View style={s.summaryHeadIcon}>
                        <Ionicons name="clipboard-outline" size={15} color={C.slate}/>
                      </View>
                      <Text style={s.summaryHeadTxt}>Summary</Text>
                    </View>
                    <View style={s.divider}/>
                    {([
                      { icon: 'calendar-outline', label: 'Date', value: displayKey(selectedKey!) },
                      { icon: 'time-outline',     label: 'Time', value: selectedTime             },
                    ] as const).map((r, i, arr) => (
                      <View key={r.label} style={[s.summaryRow, i === arr.length - 1 && { marginBottom: verticalScale(0) }]}>
                        <View style={s.summaryIcon}><Ionicons name={r.icon} size={13} color={C.slate}/></View>
                        <View style={{ flex: 1 }}>
                          <Text style={s.summaryLbl}>{r.label}</Text>
                          <Text style={s.summaryVal}>{r.value}</Text>
                        </View>
                      </View>
                    ))}
                  </View>

                  <View style={s.noteBox}>
                    <Ionicons name="information-circle" size={16} color={C.shapeBlue}/>
                    <Text style={s.noteTxt}>Your request will be reviewed by the clinic. You&apos;ll be notified once confirmed.</Text>
                  </View>
                </>
              )}

              {/* Action buttons */}
              <View style={sm.footer}>
                <TouchableOpacity style={sm.cancelBtn} onPress={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }} activeOpacity={0.8}>
                  <Text style={sm.cancelTxt}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[sm.confirmBtn, !canConfirm && { opacity: 0.4 }]}
                  onPress={() => { setShowSlotModal(false); handleOpenDetailsForm(); }}
                  activeOpacity={0.8}
                  disabled={!canConfirm}
                >
                  <Text style={sm.confirmTxt}>Next</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ PATIENT DETAILS FORM MODAL ══════════════════════════════════════ */}
      <Modal visible={showDetailsForm} transparent animationType="fade" statusBarTranslucent>
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={df.overlay}>
            <View style={df.sheet}>
              {/* Header */}
              <LinearGradient colors={[C.navy, C.charcoal]} style={df.sheetHeader}>
                <View>
                  <Text style={df.sheetTitle}>Patient Details</Text>
                  <Text style={df.sheetSub}>Fill in your info to complete the booking</Text>
                </View>
                <TouchableOpacity onPress={() => setShowDetailsForm(false)} style={df.closeBtn}>
                  <Ionicons name="close" size={20} color={C.white}/>
                </TouchableOpacity>
              </LinearGradient>

              {/* Appointment summary pill */}
              <View style={df.aptSummary}>
                <Ionicons name="calendar-outline" size={13} color={C.navy}/>
                <Text style={df.aptSummaryTxt}>
                  {selectedKey ? shortKey(selectedKey) : ''} · {selectedTime}
                </Text>
              </View>

              {/* Appointment Type */}
              <View style={[df.typeSection, { zIndex: 100 }]}>
                <Text style={df.typeSectionLabel}>Appointment For <Text style={df.required}>*</Text></Text>
                <View style={df.catRow}>
                  {APPT_CATEGORIES.map(cat => {
                    const active = apptCategory === cat.id;
                    return (
                      <TouchableOpacity
                        key={cat.id}
                        style={[df.catChip, active && df.catChipActive]}
                        onPress={() => { setApptCategory(cat.id as any); setVaccineType(''); setVaccineDropdownOpen(false); }}
                        activeOpacity={0.8}
                      >
                        <Ionicons name={cat.icon as any} size={15} color={active ? C.red : '#64748B'} />
                        <Text style={[df.catLabel, active && df.catLabelActive]}>{cat.label}</Text>
                      </TouchableOpacity>
                    );
                  })}
                </View>

                {/* Vaccine sub-dropdown */}
                {apptCategory === 'vaccination' && (
                  <View style={df.vaccineWrap}>
                    <TouchableOpacity
                      style={[df.vaccineSelector, vaccineDropdownOpen && df.vaccineSelectorOpen]}
                      onPress={() => setVaccineDropdownOpen(v => !v)}
                      activeOpacity={0.85}
                    >
                      <Ionicons name="medkit-outline" size={14} color={vaccineType ? C.navy : C.muted}/>
                      <Text style={[df.vaccineSelectorTxt, !!vaccineType && { color: C.charcoal }]}>
                        {vaccineType ? VACCINE_OPTIONS.find(v => v.id === vaccineType)?.label : 'Select vaccine type...'}
                      </Text>
                      <Ionicons name={vaccineDropdownOpen ? 'chevron-up' : 'chevron-down'} size={14} color={C.muted}/>
                    </TouchableOpacity>
                    {vaccineDropdownOpen && (
                      <View style={df.vaccineDropdown}>
                        <ScrollView style={{ maxHeight: verticalScale(180) }} nestedScrollEnabled keyboardShouldPersistTaps="handled">
                          {VACCINE_OPTIONS.map((v, i) => {
                            const sel = vaccineType === v.id;
                            return (
                              <TouchableOpacity
                                key={v.id}
                                style={[df.vaccineOption, sel && df.vaccineOptionActive, i < VACCINE_OPTIONS.length - 1 && { borderBottomWidth: 1, borderBottomColor: C.border }]}
                                onPress={() => { setVaccineType(v.id); setVaccineDropdownOpen(false); }}
                                activeOpacity={0.8}
                              >
                                <View style={{ flex: 1 }}>
                                  <Text style={[df.vaccineOptionTxt, sel && { color: C.navy, fontWeight: '700' }]}>{v.label}</Text>
                                  <Text style={df.vaccineOptionDesc}>{v.desc}</Text>
                                </View>
                                {sel && <Ionicons name="checkmark" size={14} color={C.navy}/>}
                              </TouchableOpacity>
                            );
                          })}
                        </ScrollView>
                      </View>
                    )}
                  </View>
                )}
              </View>

              {/* Tap backdrop to close floating dropdown when open */}
              {vaccineDropdownOpen && (
                <TouchableWithoutFeedback onPress={() => setVaccineDropdownOpen(false)}>
                  <View style={df.dropdownBackdrop} />
                </TouchableWithoutFeedback>
              )}

              <ScrollView
                style={[df.formScroll, { zIndex: 1 }]}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                onScrollBeginDrag={() => setVaccineDropdownOpen(false)}
              >
                {/* Full Name */}
                <View style={df.fieldWrap}>
                  <Text style={df.label}>Full Name <Text style={df.required}>*</Text></Text>
                  <TextInput
                    style={[df.input, formErrors.name && df.inputError]}
                    placeholder="e.g. Juan dela Cruz"
                    placeholderTextColor={C.muted}
                    value={patientForm.name}
                    onChangeText={v => { setPatientForm(p => ({ ...p, name: v })); setFormErrors(e => ({ ...e, name: undefined })); }}
                  />
                  {formErrors.name && <Text style={df.errorTxt}>{formErrors.name}</Text>}
                </View>

                {/* Age + Gender row */}
                <View style={df.row}>
                  <View style={[df.fieldWrap, { flex: 1, marginRight: scale(8) }]}>
                    <Text style={df.label}>Age <Text style={df.required}>*</Text></Text>
                    <TextInput
                      style={[df.input, formErrors.age && df.inputError]}
                      placeholder="e.g. 28"
                      placeholderTextColor={C.muted}
                      keyboardType="numeric"
                      value={patientForm.age}
                      onChangeText={v => { setPatientForm(p => ({ ...p, age: v })); setFormErrors(e => ({ ...e, age: undefined })); }}
                    />
                    {formErrors.age && <Text style={df.errorTxt}>{formErrors.age}</Text>}
                  </View>
                  <View style={[df.fieldWrap, { flex: 1.4 }]}>
                    <Text style={df.label}>Gender <Text style={df.required}>*</Text></Text>
                    <View style={df.genderRow}>
                      {GENDER_OPTIONS.map(g => (
                        <TouchableOpacity
                          key={g}
                          style={[df.genderChip, patientForm.gender === g && df.genderChipActive]}
                          onPress={() => { setPatientForm(p => ({ ...p, gender: g })); setFormErrors(e => ({ ...e, gender: undefined })); }}
                          activeOpacity={0.8}
                        >
                          <Text style={[df.genderTxt, patientForm.gender === g && df.genderTxtActive]}>{g}</Text>
                        </TouchableOpacity>
                      ))}
                    </View>
                    {formErrors.gender && <Text style={df.errorTxt}>{formErrors.gender}</Text>}
                  </View>
                </View>

                {/* Address */}
                <View style={df.fieldWrap}>
                  <Text style={df.label}>Address <Text style={df.required}>*</Text></Text>
                  <TextInput
                    style={[df.input, df.inputMulti, formErrors.address && df.inputError]}
                    placeholder="House no., street, barangay, city"
                    placeholderTextColor={C.muted}
                    multiline
                    numberOfLines={2}
                    value={patientForm.address}
                    onChangeText={v => { setPatientForm(p => ({ ...p, address: v })); setFormErrors(e => ({ ...e, address: undefined })); }}
                  />
                  {formErrors.address && <Text style={df.errorTxt}>{formErrors.address}</Text>}
                </View>

                {/* Contact Number */}
                <View style={df.fieldWrap}>
                  <Text style={df.label}>Contact Number <Text style={df.required}>*</Text></Text>
                  <TextInput
                    style={[df.input, formErrors.contactNumber && df.inputError]}
                    placeholder="e.g. 09171234567"
                    placeholderTextColor={C.muted}
                    keyboardType="phone-pad"
                    value={patientForm.contactNumber}
                    onChangeText={v => { setPatientForm(p => ({ ...p, contactNumber: v })); setFormErrors(e => ({ ...e, contactNumber: undefined })); }}
                  />
                  {formErrors.contactNumber && <Text style={df.errorTxt}>{formErrors.contactNumber}</Text>}
                </View>

                <View style={{ height: verticalScale(16) }}/>
              </ScrollView>

              {/* Submit */}
              <View style={df.footer}>
                <TouchableOpacity style={df.cancelBtn} onPress={() => setShowDetailsForm(false)} activeOpacity={0.8}>
                  <Text style={df.cancelTxt}>Back</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[df.submitBtn, saving && { opacity: 0.7 }]}
                  onPress={handleConfirm}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  {saving
                    ? <ActivityIndicator color={C.white} size="small"/>
                    : <Ionicons name="send" size={15} color={C.white}/>
                  }
                  <Text style={df.submitTxt}>{saving ? 'Sending...' : 'Request Appointment'}</Text>
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── Toast Banner ── */}
      {showToast && (
        <View style={ts.toast} pointerEvents="none">
          <View style={ts.toastInner}>
            <View style={ts.toastIconWrap}>
              <Ionicons name="checkmark-circle" size={20} color={C.white}/>
            </View>
            <View style={ts.toastTextWrap}>
              <Text style={ts.toastTitle}>Request Sent to Admin</Text>
              <Text style={ts.toastSub}>We&apos;ll notify you once it&apos;s confirmed.</Text>
            </View>
          </View>
        </View>
      )}

      {/* ── Success Modal ── */}
      <Modal visible={showSuccess} transparent animationType="fade" statusBarTranslucent>
        <View style={ms.overlay}>
          <View style={ms.card}>
            <View style={ms.accentTop}>
              <View style={ms.successIconCircle}>
                <Ionicons name="checkmark" size={28} color={C.green}/>
              </View>
            </View>
            <View style={ms.body}>
              <View style={ms.iconRow}>
                <View style={ms.iconWrap}>
                  <Ionicons name="send" size={14} color={C.shapeBlue}/>
                </View>
                <Text style={[ms.statusTxt, { color: C.shapeBlue }]}>Request Sent</Text>
              </View>
              <Text style={ms.title}>Appointment Requested!</Text>
              <Text style={ms.subtitle}>The clinic will review your request and confirm or suggest another time. You&apos;ll see the status update here.</Text>
              <View style={ms.divider}/>
              {selectedKey && (
                <View style={ms.detailRow}>
                  <View style={ms.detailIcon}><Ionicons name="calendar-outline" size={13} color={C.slate}/></View>
                  <View>
                    <Text style={ms.detailLbl}>Requested Date</Text>
                    <Text style={ms.detailVal}>{displayKey(selectedKey)}</Text>
                  </View>
                </View>
              )}
              {selectedTime && (
                <View style={ms.detailRow}>
                  <View style={ms.detailIcon}><Ionicons name="time-outline" size={13} color={C.slate}/></View>
                  <View>
                    <Text style={ms.detailLbl}>Requested Time</Text>
                    <Text style={ms.detailVal}>{selectedTime}</Text>
                  </View>
                </View>
              )}
              <View style={[ms.detailRow, { marginBottom: verticalScale(0) }]}>
                <View style={[ms.detailIcon, { backgroundColor: C.orangeFaint }]}><Ionicons name="hourglass-outline" size={13} color={C.orange}/></View>
                <View>
                  <Text style={ms.detailLbl}>Status</Text>
                  <Text style={[ms.detailVal, { color: C.orange }]}>Pending clinic confirmation</Text>
                </View>
              </View>
              <View style={ms.divider}/>
              <TouchableOpacity style={ms.doneBtn} onPress={handleDone} activeOpacity={0.8}>
                <Text style={ms.doneBtnTxt}>Got it!</Text>
              </TouchableOpacity>
            </View>
          </View>
        </View>
      </Modal>

      {/* ══ APPOINTMENT DETAIL MODAL ═════════════════════════════════════════ */}
      <Modal visible={!!selectedApptDetail} transparent animationType="fade" statusBarTranslucent onShow={() => setCancellationReasonInput('')}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <Animated.View style={[sm.overlay, detailKeyboardLift]}>
          <View style={sm.card}>
            <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
              <View style={{ flex: 1 }}>
                <Text style={sm.headerTitle}>Appointment Details</Text>
                {selectedApptDetail && (
                  <Text style={sm.headerSub}>{displayKey(selectedApptDetail.date)}</Text>
                )}
              </View>
              <TouchableOpacity onPress={() => setSelectedApptDetail(null)} style={sm.closeBtn}>
                <Ionicons name="close" size={20} color={C.white}/>
              </TouchableOpacity>
            </LinearGradient>

            {selectedApptDetail && (
              <>
                <ScrollView
                  style={{ flexShrink: 1 }}
                  contentContainerStyle={sm.body}
                  keyboardShouldPersistTaps="handled"
                  showsVerticalScrollIndicator={true}
                >
                  <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: verticalScale(16) }}>
                    <Text style={{ fontSize: moderateScale(16), fontWeight: '800', color: C.charcoal }}>{selectedApptDetail.type}</Text>
                    <StatusBadge status={selectedApptDetail.status} />
                  </View>

                  <View style={s.summaryCard}>
                    <View style={[s.summaryRow, { marginBottom: verticalScale(8) }]}>
                      <Ionicons name="time-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                      <Text style={{ fontSize: moderateScale(13), color: C.slate, fontWeight: '600' }}>Time: {selectedApptDetail.time}</Text>
                    </View>
                    <View style={[s.summaryRow, { marginBottom: verticalScale(8) }]}>
                      <Ionicons name="person-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                      <Text style={{ fontSize: moderateScale(13), color: C.slate, fontWeight: '600' }}>Patient: {selectedApptDetail.name} ({selectedApptDetail.age} yrs, {selectedApptDetail.gender})</Text>
                    </View>
                    <View style={[s.summaryRow, { marginBottom: verticalScale(8) }]}>
                      <Ionicons name="call-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                      <Text style={{ fontSize: moderateScale(13), color: C.slate, fontWeight: '600' }}>Contact: {selectedApptDetail.contactNumber}</Text>
                    </View>
                    {selectedApptDetail.address ? (
                      <View style={[s.summaryRow, { marginBottom: verticalScale(0) }]}>
                        <Ionicons name="location-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                        <Text style={{ fontSize: moderateScale(13), color: C.slate, fontWeight: '600' }}>Address: {selectedApptDetail.address}</Text>
                      </View>
                    ) : null}
                  </View>

                  {(selectedApptDetail.declineReason || (selectedApptDetail.status === 'cancelled' && selectedApptDetail.cancellationReason)) ? (
                    <View style={[s.noteBox, { backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, marginTop: verticalScale(12) }]}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6), marginBottom: verticalScale(4) }}>
                        <Ionicons name="close-circle" size={16} color="#DC2626" />
                        <Text style={{ fontSize: moderateScale(12), fontWeight: '800', color: '#991B1B' }}>
                          {selectedApptDetail.declineReason ? 'Reason for Decline' : 'Cancellation Reason'}
                        </Text>
                      </View>
                      <Text style={{ fontSize: moderateScale(13), color: '#7F1D1D', fontWeight: '600', lineHeight: moderateScale(18) }}>
                        {selectedApptDetail.declineReason || selectedApptDetail.cancellationReason}
                      </Text>
                    </View>
                  ) : selectedApptDetail.cancellationReason ? (
                    <View style={[s.noteBox, { backgroundColor: C.orangeFaint, marginTop: verticalScale(12) }]}>
                      <Ionicons name="alert-circle-outline" size={16} color={C.orange} />
                      <Text style={[s.noteTxt, { color: C.orange }]}>
                        Cancellation Reason: {selectedApptDetail.cancellationReason}
                      </Text>
                    </View>
                  ) : null}

                  {selectedApptDetail.note ? (
                    <View style={[s.noteBox, { marginTop: verticalScale(12) }]}>
                      <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.navy} />
                      <Text style={s.noteTxt}>Clinic Note: {selectedApptDetail.note}</Text>
                    </View>
                  ) : null}

                  {(selectedApptDetail.status === 'pending' || selectedApptDetail.status === 'confirmed' || selectedApptDetail.status === 'accepted') && (
                    <View style={{ marginTop: verticalScale(16) }}>
                      <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: C.charcoal, marginBottom: verticalScale(8) }}>
                        Reason for Cancellation <Text style={{ color: C.red }}>*</Text>
                      </Text>
                      <TextInput
                        style={[df.input, df.inputMulti, { minHeight: verticalScale(76) }]}
                        placeholder="e.g. Schedule conflict, illness, emergency..."
                        placeholderTextColor={C.muted}
                        multiline
                        numberOfLines={3}
                        value={cancellationReasonInput}
                        onChangeText={setCancellationReasonInput}
                      />
                      <Text style={{ fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(6), fontStyle: 'italic' }}>
                        Sent to the clinic for approval. The appointment stays booked until staff approve it.
                      </Text>
                    </View>
                  )}
                </ScrollView>

                <View style={sm.footer}>
                  <TouchableOpacity style={sm.cancelBtn} onPress={() => setSelectedApptDetail(null)}>
                    <Text style={sm.cancelTxt}>Close</Text>
                  </TouchableOpacity>
                  {(selectedApptDetail.status === 'pending' || selectedApptDetail.status === 'confirmed' || selectedApptDetail.status === 'accepted') && (
                    <TouchableOpacity
                      style={[sm.confirmBtn, { backgroundColor: '#EF4444' }, submittingCancellation && { opacity: 0.6 }]}
                      onPress={handleRequestCancellation}
                      disabled={submittingCancellation}
                    >
                      {submittingCancellation ? (
                        <ActivityIndicator color={C.white} size="small" />
                      ) : (
                        <Text style={sm.confirmTxt}>Request Cancellation</Text>
                      )}
                    </TouchableOpacity>
                  )}
                </View>
              </>
            )}
          </View>
        </Animated.View>
        </KeyboardAvoidingView>
      </Modal>

      {/* ── BOTTOM NAV BAR ── */}
      <View style={[nav.bar, { height: verticalScale(80) + insets.bottom, paddingBottom: verticalScale(8) + insets.bottom }]}>
        {/* Tab 1: Home */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/')}
        >
          <Ionicons name="home-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Home</Text>
        </TouchableOpacity>

        {/* Tab 2: Appts */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Appts</Text>
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

        {/* Tab 4: Account */}
        <TouchableOpacity
          style={nav.tab}
          activeOpacity={0.7}
          onPress={() => router.navigate('/profile')}
        >
          <Ionicons name="person-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Account</Text>
        </TouchableOpacity>
      </View>

      {/* Custom Alert Modal */}
      <CustomAlertModal config={alertConfig} onClose={hideAlert} />
    </View>
  );
}

// ─── Styles ───────────────────────────────────────────────────────────────────
const CELL = Math.floor((width - 40 - 32) / 7);

const sb = StyleSheet.create({
  wrap: { flexDirection: 'row', alignItems: 'center', gap: scale(4), paddingHorizontal: scale(8), paddingVertical: verticalScale(4), borderRadius: scale(8) },
  txt:  { fontSize: moderateScale(10), fontWeight: '800' },
});

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: C.bg },

  topMeshSection: {
    position: 'relative',
    paddingTop: verticalScale(66),
    paddingBottom: verticalScale(22),
    paddingHorizontal: scale(20),
    backgroundColor: C.white,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F4FA',
  },
  headerTop:   { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: scale(12) },
  btnGlass:    { width: scale(46), height: verticalScale(46), borderRadius: scale(23), backgroundColor: C.redFaint, justifyContent: 'center', alignItems: 'center' },
  headerTitle: { fontSize: moderateScale(21), fontWeight: '900', color: C.charcoal, letterSpacing: -0.4, textAlign: 'center' },
  headerSub:   { fontSize: moderateScale(13), color: C.muted, fontWeight: '500', marginTop: verticalScale(3), textAlign: 'center' },
  headerPills:  { flexDirection: 'row', gap: scale(8), marginTop: verticalScale(16) },
  headerPill:   { flexDirection: 'row', alignItems: 'center', gap: scale(5), backgroundColor: 'rgba(255,255,255,0.15)', paddingHorizontal: scale(10), paddingVertical: verticalScale(5), borderRadius: scale(20) },
  headerPillTxt:{ fontSize: moderateScale(11), color: 'rgba(255,255,255,0.9)', fontWeight: '700' },

  sectionLabel:    { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingHorizontal: scale(20), marginBottom: verticalScale(14) },
  sectionAccent:   { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: C.red },
  sectionLabelTxt: { fontSize: moderateScale(18), fontWeight: '900', color: C.charcoal, flex: 1, letterSpacing: -0.3 },
  countBadge:      { minWidth: scale(22), height: verticalScale(22), borderRadius: scale(7), justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(6) },
  countTxt:        { fontSize: moderateScale(11), fontWeight: '900' },

  section:   { paddingHorizontal: scale(20), marginBottom: verticalScale(6) },
  rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: verticalScale(14) },
  rowGap:    { flexDirection: 'row', alignItems: 'center', gap: scale(7) },
  subHeading:{ fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },

  hint:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(6), paddingVertical: verticalScale(12) },
  hintTxt: { fontSize: moderateScale(12), color: C.muted, fontWeight: '500' },

  datePill:    { backgroundColor: C.navyFaint, paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: scale(10) },
  datePillTxt: { fontSize: moderateScale(11), fontWeight: '700', color: C.navy },

  calCard:      { backgroundColor: C.white, borderRadius: scale(24), padding: scale(18), shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8 },
  calHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: verticalScale(18) },
  calNavBtn:    { width: scale(34), height: verticalScale(34), borderRadius: scale(10), backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  calNavBtnOff: { opacity: 0.45 },
  calMonthTxt:  { fontSize: moderateScale(16), fontWeight: '800', color: C.charcoal },
  calWeekRow:   { flexDirection: 'row', marginBottom: verticalScale(8) },
  // Percentage widths (not a floored pixel CELL) so 7 columns always consume
  // exactly one row — a rounded-down pixel width leaves slack that lets an
  // 8th cell creep onto the row and shifts every following week sideways.
  calWeekCell:  { width: `${100 / 7}%`, alignItems: 'center' },
  calWeekTxt:   { fontSize: moderateScale(10), fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  calGrid:      { flexDirection: 'row', flexWrap: 'wrap' },
  // Outer cell is the grid column and owns no visual styling; the inner tile
  // draws the state, so a highlight never spans the full column width.
  // CELL is a live Dimensions.get('window')-derived calculation — left as-is.
  calCell:      { width: `${100 / 7}%`, height: CELL, justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(3) },
  calTile:      { width: CELL - 8, height: CELL - 8, justifyContent: 'center', alignItems: 'center', borderRadius: scale(12) },
  calTileToday: { borderWidth: 1.5, borderColor: C.red },
  calTileSelected: { borderWidth: 2, borderColor: C.navy, backgroundColor: C.navyFaint, shadowColor: C.navy, shadowOpacity: 0.25, shadowRadius: 6, shadowOffset: { width: 0, height: 2 }, elevation: 3 },
  calDayTxt:    { fontSize: moderateScale(14), fontWeight: '600', color: C.charcoal },
  calDayPast:   { color: '#CDD5E0', fontWeight: '400' },
  calDayNoSlot: { color: '#B0BEC8' },
  calDayOpen:   { color: C.red, fontWeight: '700' },
  // Fully booked clinic day — struck through so it reads as "was available",
  // distinct from a plain closed weekday.
  calDayFull:   { color: '#B0BEC8', fontWeight: '600', textDecorationLine: 'line-through' },
  calDayToday:  { color: C.red, fontWeight: '800' },
  calDaySelected:{ color: C.navy, fontWeight: '800' },
  legend:       { flexDirection: 'row', justifyContent: 'space-around', marginTop: verticalScale(16), paddingTop: verticalScale(16), borderTopWidth: 1, borderTopColor: C.border },
  legendItem:   { flexDirection: 'row', alignItems: 'center', gap: scale(6) },
  // Legend samples the actual numeral treatment rather than an abstract swatch.
  legendNum:    { fontSize: moderateScale(13), fontWeight: '800', color: C.red },
  legendToday:  { width: scale(14), height: verticalScale(14), borderRadius: scale(5), borderWidth: 2, borderColor: C.red },
  legendTxt:    { fontSize: moderateScale(11.5), color: C.charcoal, fontWeight: '600' },

  timeGrid:     { flexDirection: 'row', flexWrap: 'wrap', gap: scale(10) },
  timeChip:     { flexDirection: 'row', alignItems: 'center', gap: scale(7), paddingHorizontal: scale(14), paddingVertical: verticalScale(12), borderRadius: scale(14), backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden', shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  timeChipActive:{ borderColor: 'transparent', shadowOpacity: 0 },
  timeChipOff:  { backgroundColor: '#F8FAFC', borderColor: '#EEF2F7', shadowOpacity: 0, elevation: 0 },
  timeTxt:      { fontSize: moderateScale(13), fontWeight: '700', color: C.charcoal },
  fullPill:     { backgroundColor: '#F1F5F9', paddingHorizontal: scale(5), paddingVertical: verticalScale(2), borderRadius: scale(5) },
  fullPillTxt:  { fontSize: moderateScale(9), fontWeight: '800', color: C.muted },

  summaryCard:    { backgroundColor: C.white, borderRadius: scale(20), padding: scale(18), shadowColor: C.shadow, shadowOffset: { width: 0, height: 3 }, shadowOpacity: 0.08, shadowRadius: 10, elevation: 5 },
  summaryHead:    { flexDirection: 'row', alignItems: 'center', gap: scale(10), marginBottom: verticalScale(14) },
  summaryHeadIcon:{ width: scale(30), height: verticalScale(30), borderRadius: scale(9), backgroundColor: C.navyFaint, justifyContent: 'center', alignItems: 'center' },
  summaryHeadTxt: { fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },
  divider:        { height: 1, backgroundColor: C.border, marginBottom: verticalScale(14) },
  summaryRow:     { flexDirection: 'row', alignItems: 'flex-start', gap: scale(12), marginBottom: verticalScale(14) },
  summaryIcon:    { width: scale(28), height: verticalScale(28), borderRadius: scale(8), backgroundColor: C.navyFaint, justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(2) },
  summaryLbl:     { fontSize: moderateScale(10), fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  summaryVal:     { fontSize: moderateScale(14), fontWeight: '700', color: C.charcoal, marginTop: verticalScale(2) },

  noteBox:     { flexDirection: 'row', alignItems: 'flex-start', gap: scale(9), backgroundColor: C.blueFaint, borderRadius: scale(14), padding: scale(13), marginTop: verticalScale(14), marginBottom: verticalScale(14), borderWidth: 1, borderColor: 'rgba(44,111,212,0.12)' },
  noteTxt:     { flex: 1, fontSize: moderateScale(12), color: C.shapeBlue, fontWeight: '500', lineHeight: moderateScale(18) },
  confirmBtn:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', height: verticalScale(58), borderRadius: scale(18), backgroundColor: C.charcoal, shadowColor: C.charcoal, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.3, shadowRadius: 10, elevation: 6 },
  confirmTxt:  { fontSize: moderateScale(15), fontWeight: '800', color: C.white, flex: 1, textAlign: 'center' },

  emptyCard:    { backgroundColor: C.white, borderRadius: scale(16), padding: scale(22), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(10), shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyCardTxt: { fontSize: moderateScale(13), color: C.muted, fontWeight: '500' },

  apptCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: scale(18), padding: scale(14), marginBottom: verticalScale(10), shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  apptDateBox:  { width: scale(48), height: verticalScale(54), borderRadius: scale(13), backgroundColor: C.redFaint, justifyContent: 'center', alignItems: 'center', marginRight: scale(14) },
  apptDateNum:  { fontSize: moderateScale(20), fontWeight: '900', color: C.red, lineHeight: moderateScale(22) },
  apptDateMon:  { fontSize: moderateScale(9), fontWeight: '700', color: C.red, textTransform: 'uppercase', letterSpacing: 0.3 },
  apptInfo:     { flex: 1 },
  apptInfoTitle:{ fontSize: moderateScale(13), fontWeight: '700', color: C.charcoal },
  apptInfoRow:  { flexDirection: 'row', alignItems: 'center', gap: scale(4), marginTop: verticalScale(4) },
  apptInfoSub:  { fontSize: moderateScale(12), color: C.muted, fontWeight: '500' },
  apptRight:    { alignItems: 'flex-end', gap: scale(6) },

  adminNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(5), backgroundColor: C.redFaint, borderRadius: scale(8), padding: scale(6), marginTop: verticalScale(5) },
  adminNoteTxt: { flex: 1, fontSize: moderateScale(10), color: C.red, fontWeight: '600', lineHeight: moderateScale(14) },

  cancelBtn:  { width: scale(26), height: verticalScale(26), borderRadius: scale(8), backgroundColor: '#F1F5F9', justifyContent: 'center', alignItems: 'center' },
  doneBadge:  { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: C.greenFaint, paddingHorizontal: scale(8), paddingVertical: verticalScale(4), borderRadius: scale(8) },
  doneTxt:    { fontSize: moderateScale(10), fontWeight: '800', color: C.green },
});

// ─── Patient Details Form styles ──────────────────────────────────────────────
const df = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(10,25,47,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(20) },
  sheet:       { backgroundColor: C.white, borderRadius: scale(28), width: '100%', maxHeight: '92%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  sheetHeader: { paddingTop: verticalScale(22), paddingBottom: verticalScale(20), paddingHorizontal: scale(22), flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  sheetTitle:  { fontSize: moderateScale(19), fontWeight: '800', color: C.white, letterSpacing: -0.3 },
  sheetSub:    { fontSize: moderateScale(12), color: 'rgba(255,255,255,0.65)', marginTop: verticalScale(2) },
  closeBtn:    { width: scale(34), height: verticalScale(34), borderRadius: scale(11), backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },

  aptSummary:    { flexDirection: 'row', alignItems: 'center', gap: scale(7), backgroundColor: C.navyFaint, marginHorizontal: scale(20), marginTop: verticalScale(14), marginBottom: verticalScale(6), paddingHorizontal: scale(14), paddingVertical: verticalScale(10), borderRadius: scale(12), borderWidth: 1, borderColor: 'rgba(26,48,82,0.12)' },
  aptSummaryTxt: { fontSize: moderateScale(12), fontWeight: '700', color: C.navy },

  formScroll:  { paddingHorizontal: scale(20), paddingTop: verticalScale(10) },
  row:         { flexDirection: 'row' },
  fieldWrap:   { marginBottom: verticalScale(14) },
  label:       { fontSize: moderateScale(12), fontWeight: '700', color: C.slate, marginBottom: verticalScale(6), textTransform: 'uppercase', letterSpacing: 0.3 },
  required:    { color: C.red },
  input:       { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: scale(13), paddingHorizontal: scale(14), paddingVertical: verticalScale(12), fontSize: moderateScale(14), color: C.charcoal, fontWeight: '500' },
  inputMulti:  { minHeight: verticalScale(64), textAlignVertical: 'top', paddingTop: verticalScale(12) },
  inputError:  { borderColor: C.red, backgroundColor: 'rgba(200,16,46,0.04)' },
  errorTxt:    { fontSize: moderateScale(11), color: C.red, fontWeight: '600', marginTop: verticalScale(4) },

  genderRow:      { flexDirection: 'row', gap: scale(6) },
  genderChip:     { flex: 1, paddingVertical: verticalScale(11), borderRadius: scale(12), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center' },
  genderChipActive:{ borderColor: C.navy, backgroundColor: C.navyFaint },
  genderTxt:      { fontSize: moderateScale(12), fontWeight: '600', color: C.muted },
  genderTxtActive:{ color: C.navy, fontWeight: '700' },

  footer:     { flexDirection: 'row', gap: scale(12), paddingHorizontal: scale(20), paddingVertical: verticalScale(14), borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white },
  cancelBtn:  { flex: 1, paddingVertical: verticalScale(12), borderRadius: scale(12), alignItems: 'center', justifyContent: 'center', borderWidth: 1, borderColor: C.border, backgroundColor: C.bg },
  cancelTxt:  { fontSize: moderateScale(13), fontWeight: '700', color: C.slate },
  submitBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), paddingVertical: verticalScale(12), borderRadius: scale(12), backgroundColor: '#334155' },
  submitTxt:  { fontSize: moderateScale(13), fontWeight: '800', color: C.white },

  typeSection:      { paddingHorizontal: scale(20), paddingTop: verticalScale(4), paddingBottom: verticalScale(8), position: 'relative', zIndex: 100 },
  typeSectionLabel: { fontSize: moderateScale(12), fontWeight: '700', color: C.slate, marginBottom: verticalScale(10), textTransform: 'uppercase', letterSpacing: 0.3 },
  typeRow:          { gap: scale(8) },
  typeCard:         { flexDirection: 'row', alignItems: 'flex-start', gap: scale(12), padding: scale(14), borderRadius: scale(16), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  typeEmoji:        { fontSize: moderateScale(22), marginTop: verticalScale(1) },
  typeLabel:        { fontSize: moderateScale(13), fontWeight: '800', color: C.charcoal },
  typeTag:          { paddingHorizontal: scale(7), paddingVertical: verticalScale(2), borderRadius: scale(6) },
  typeTagTxt:       { fontSize: moderateScale(10), fontWeight: '800' },
  typeDesc:         { fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(3), lineHeight: moderateScale(16), fontWeight: '400' },

  catRow:           { flexDirection: 'row', gap: scale(10) },
  catChip:          { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(7), paddingVertical: verticalScale(13), borderRadius: scale(14), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg },
  catChipActive:    { borderColor: C.navy, backgroundColor: C.navyFaint },
  catEmoji:         { fontSize: moderateScale(18) },
  catLabel:         { fontSize: moderateScale(13), fontWeight: '700', color: C.muted },
  catLabelActive:   { color: C.navy },

  vaccineWrap:          { marginTop: verticalScale(10), position: 'relative', zIndex: 100 },
  vaccineSelector:      { flexDirection: 'row', alignItems: 'center', gap: scale(9), backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: scale(13), paddingHorizontal: scale(14), paddingVertical: verticalScale(13) },
  vaccineSelectorOpen:  { borderColor: C.navy },
  vaccineSelectorTxt:   { flex: 1, fontSize: moderateScale(14), color: C.muted, fontWeight: '500' },
  vaccineDropdown:      {
    position: 'absolute',
    top: verticalScale(48),
    left: 0,
    right: 0,
    zIndex: 1000,
    elevation: 10,
    borderWidth: 1.5,
    borderColor: C.navy,
    borderRadius: scale(13),
    backgroundColor: C.white,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.15,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 4 },
  },
  dropdownBackdrop:     { position: 'absolute', top: 0, left: 0, right: 0, bottom: 0, zIndex: 90 },
  vaccineOption:        { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: scale(14), paddingVertical: verticalScale(13) },
  vaccineOptionActive:  { backgroundColor: C.navyFaint },
  vaccineOptionTxt:     { fontSize: moderateScale(14), color: C.slate, fontWeight: '600' },
  vaccineOptionDesc:    { fontSize: moderateScale(11), color: C.muted, marginTop: verticalScale(2) },
});

const ms = StyleSheet.create({
  overlay:   { flex: 1, backgroundColor: 'rgba(10,25,47,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(24) },
  card:      { backgroundColor: C.white, borderRadius: scale(28), width: '100%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  accentTop: { height: verticalScale(88), backgroundColor: C.greenFaint, alignItems: 'center', justifyContent: 'flex-end', borderBottomWidth: 1, borderBottomColor: 'rgba(13,175,122,0.12)' },
  successIconCircle: { width: scale(60), height: verticalScale(60), borderRadius: scale(30), backgroundColor: C.white, borderWidth: 2.5, borderColor: C.green, justifyContent: 'center', alignItems: 'center', marginBottom: verticalScale(-30), shadowColor: C.green, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.2, shadowRadius: 10, elevation: 6 },
  body:      { padding: scale(24), paddingTop: verticalScale(42) },
  iconRow:   { flexDirection: 'row', alignItems: 'center', gap: scale(7), marginBottom: verticalScale(10) },
  iconWrap:  { width: scale(26), height: verticalScale(26), borderRadius: scale(8), backgroundColor: C.blueFaint, justifyContent: 'center', alignItems: 'center' },
  statusTxt: { fontSize: moderateScale(11), fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.8 },
  title:     { fontSize: moderateScale(21), fontWeight: '800', color: C.charcoal, marginBottom: verticalScale(6), letterSpacing: -0.3 },
  subtitle:  { fontSize: moderateScale(13), color: C.muted, lineHeight: moderateScale(20), fontWeight: '400' },
  divider:   { height: 1, backgroundColor: C.border, marginVertical: verticalScale(16) },
  detailRow: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(12), marginBottom: verticalScale(12) },
  detailIcon:{ width: scale(30), height: verticalScale(30), borderRadius: scale(9), backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', marginTop: verticalScale(1) },
  detailLbl: { fontSize: moderateScale(10), fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.5 },
  detailVal: { fontSize: moderateScale(14), fontWeight: '700', color: C.charcoal, marginTop: verticalScale(2) },
  doneBtn:   { backgroundColor: C.charcoal, borderRadius: scale(14), paddingVertical: verticalScale(15), alignItems: 'center' },
  doneBtnTxt:{ fontSize: moderateScale(14), fontWeight: '700', color: C.white, letterSpacing: 0.2 },
});

const ts = StyleSheet.create({
  toast:      { position: 'absolute', top: verticalScale(60), left: scale(16), right: scale(16), zIndex: 999, borderRadius: scale(18), overflow: 'hidden', shadowColor: C.charcoal, shadowOffset: { width: 0, height: 6 }, shadowOpacity: 0.18, shadowRadius: 14, elevation: 12 },
  toastInner: { flexDirection: 'row', alignItems: 'center', gap: scale(12), backgroundColor: C.charcoal, paddingHorizontal: scale(16), paddingVertical: verticalScale(14) },
  toastIconWrap: { width: scale(36), height: verticalScale(36), borderRadius: scale(12), backgroundColor: C.green, justifyContent: 'center', alignItems: 'center' },
  toastTextWrap: { flex: 1 },
  toastTitle: { fontSize: moderateScale(14), fontWeight: '700', color: C.white },
  toastSub:   { fontSize: moderateScale(12), color: 'rgba(255,255,255,0.6)', marginTop: verticalScale(2), fontWeight: '400' },
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

const sm = StyleSheet.create({
  overlay:    { flex: 1, backgroundColor: 'rgba(10,25,47,0.6)', justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(20) },
  card:       { backgroundColor: C.white, borderRadius: scale(28), width: '100%', maxHeight: '85%', overflow: 'hidden', shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 24, shadowOffset: { width: 0, height: 12 }, elevation: 20 },
  header:     { flexDirection: 'row', alignItems: 'center', paddingHorizontal: scale(20), paddingVertical: verticalScale(18), gap: scale(12) },
  headerTitle:{ fontSize: moderateScale(17), fontWeight: '800', color: C.white, letterSpacing: -0.3 },
  headerSub:  { fontSize: moderateScale(11), color: 'rgba(255,255,255,0.6)', marginTop: verticalScale(2), fontWeight: '500' },
  closeBtn:   { width: scale(34), height: verticalScale(34), borderRadius: scale(11), backgroundColor: 'rgba(255,255,255,0.18)', justifyContent: 'center', alignItems: 'center' },
  body:       { padding: scale(20) },
  divider:    { height: 1, backgroundColor: C.border, marginVertical: verticalScale(16) },
  footer:     { flexDirection: 'row', gap: scale(10), paddingHorizontal: scale(20), paddingVertical: verticalScale(14), borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white },
  cancelBtn:  { flex: 1, paddingVertical: verticalScale(12), borderRadius: scale(12), borderWidth: 1, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center' },
  cancelTxt:  { fontSize: moderateScale(13), fontWeight: '700', color: C.slate },
  confirmBtn: { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: verticalScale(12), borderRadius: scale(12), backgroundColor: '#334155' },
  confirmTxt: { fontSize: moderateScale(13), fontWeight: '800', color: C.white },
});