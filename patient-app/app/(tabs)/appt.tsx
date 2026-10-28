// kna/app/app/(tabs)/appt.tsx
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter, useLocalSearchParams } from 'expo-router';
import { isPreview } from '../../utils/preview';
import { resetTo } from '../../utils/navigation';
import { clinicToday } from '../../utils/patientRecord';
import {
  collection,
  deleteDoc,
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
  Pressable,
  ScrollView,
  StatusBar,
  StyleSheet,
  Text,
  TextInput,
  TouchableWithoutFeedback,
  View,
} from 'react-native';
import Tap from '../../components/Tap';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { db, callApi } from '../../config/backend';
import { GUTTER, moderateScale, scale, verticalScale } from '../../utils/scale';
import { usePatientAuth } from '../../context/PatientAuthContext';
import CustomAlertModal, { CustomAlertConfig } from '../../components/CustomAlertModal';
import Dropdown from '../../components/Dropdown';
const { width } = Dimensions.get('window');

const C = {
  red:        '#1E3A8A',
  redLight:   '#2563EB',
  redDeep:    '#172554',
  redFaint:   'rgba(30,58,138,0.07)',
  // "red" above is the brand navy; errors and ended visits use a real red.
  danger:      '#DC2626',
  dangerFaint: 'rgba(220,38,38,0.08)',
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

const shortKeyWithDay = (key: string) => {
  const [y, m, d] = key.split('-').map(Number);
  return new Date(y, m - 1, d).toLocaleDateString('en-US', {
    weekday: 'short', month: 'short', day: 'numeric',
  });
};

// ─── Available slots ──────────────────────────────────────────────────────────
// The clinic only takes appointment bookings on Saturday and Sunday — mirrors
// isWeekendDate() in ka-clinic-admin/src/features/appointments/AppointmentsPage.jsx so a request made here is
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
  status: 'pending' | 'confirmed' | 'accepted' | 'done' | 'cancelled' | 'declined' | 'cancellation_pending';
  declinedBy?: string;
  note?: string;
  notes?: string;
  cancellationReason?: string;
  cancelReason?: string;
  cancelledAt?: number;
  cancelledBy?: string;
  declineReason?: string;
  declinedAt?: number;
  rescheduledAt?: number;
  rescheduledCount?: number;
  previousDate?: string;
  previousTime?: string;
  rescheduleHistory?: { previousDate: string; previousTime: string; newDate: string; newTime: string; rescheduledAt: number }[];
  age: string;
  gender: string;
  address: string;
  contactNumber: string;
  createdAt: number;
  affectedByClosure?: boolean;
  closureId?: string;
  closureReason?: string;
  hiddenByPatient?: boolean;
  hiddenAt?: number;
};

type PatientForm = {
  name: string;
  age: string;
  gender: string;
  address: string;
  contactNumber: string;
};

// ─── Status Badge ─────────────────────────────────────────────────────────────
// Same wording as the Admin Dashboard. A visit the clinic declined is stored
// as cancelled with a declineReason (or declinedBy): it reads "Declined by clinic".
const endedByClinic = (a: { status?: string; declineReason?: string; declinedBy?: string }) =>
  a.status === 'declined' || !!a.declineReason || !!a.declinedBy;
const isEnded = (a: { status?: string }) => a.status === 'cancelled' || a.status === 'declined';

const StatusBadge = ({ status, declined = false, affectedByClosure = false }: { status: string; declined?: boolean; affectedByClosure?: boolean }) => {
  const config = (declined ? { bg: C.dangerFaint, color: C.danger, icon: 'close-circle-outline', label: 'Declined by clinic' } : null)
    ?? (affectedByClosure ? { bg: C.orangeFaint, color: C.orange, icon: 'calendar-outline', label: 'Can be rescheduled' } : null)
    ?? {
    pending:              { bg: C.orangeFaint, color: C.orange, icon: 'time-outline',            label: 'Pending'              },
    cancellation_pending: { bg: C.orangeFaint, color: C.orange, icon: 'alert-circle-outline',   label: 'Cancellation requested' },
    confirmed:            { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-circle',        label: 'Confirmed'            },
    accepted:             { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-circle',        label: 'Confirmed'            },
    done:                 { bg: C.greenFaint,  color: C.green,  icon: 'checkmark-done-circle',   label: 'Done'                 },
    cancelled:            { bg: C.dangerFaint, color: C.danger, icon: 'close-circle-outline',    label: 'Cancelled'            },
  }[status] ?? { bg: C.redFaint, color: C.muted, icon: 'help-circle-outline', label: status };

  return (
    <View style={[sb.wrap, { backgroundColor: config.bg }]}>
      <Ionicons name={config.icon as any} size={12} color={config.color} />
      <Text style={[sb.txt, { color: config.color }]}>{config.label}</Text>
    </View>
  );
};

// ─── What the visit is for ────────────────────────────────────────────────────
// The same values as the Admin Dashboard's appointment services
// (ka-clinic-admin/src/features/appointments/AppointmentsPage.jsx
// SERVICE_TYPES), saved as-is in `type`, so a booking made here reads the same
// in the clinic's list.
// "PEP" was stored as "PEP Follow-up" before 1.0.5; apptTypeLabel shows those
// older bookings as "PEP" too.
const APPT_SERVICES = [
  { value: 'PEP',                  label: 'PEP',            desc: 'Anti-rabies dose after a bite or scratch', icon: 'medkit-outline' },
  { value: 'Anti-Tetanus Vaccine', label: 'Anti-Tetanus',   desc: 'Tetanus vaccine for a wound',              icon: 'bandage-outline' },
  { value: 'PrEP Consultation',    label: 'PrEP',           desc: 'Pre-exposure rabies protection',           icon: 'shield-checkmark-outline' },
  { value: 'Pneumococcal Vaccine', label: 'Pneumonia',      desc: 'Pneumococcal vaccine',                     icon: 'fitness-outline' },
  { value: 'General Consultation', label: 'Check-up',       desc: 'General consultation',                     icon: 'pulse-outline' },
] as const;

// What a booking was for, as shown to the patient: the option's label, or
// the stored value for anything else (older "PEP Follow-up" reads "PEP").
const LEGACY_TYPES: Record<string, string> = { 'pep follow-up': 'PEP', 'pep follow up': 'PEP', 'pep followup': 'PEP' };
const apptTypeLabel = (type?: string) => {
  const raw = String(type || '').trim();
  const v = LEGACY_TYPES[raw.toLowerCase()] || raw;
  return APPT_SERVICES.find(o => o.value === v)?.label || v || 'Appointment';
};

// Optional note the patient adds at booking (stored as `notes`, shown in the
// dashboard's Appointments view as "Patient Notes").
const NOTE_MAX = 300;

// Same Sex values as the clinic record (Male / Female).
const SEX_OPTIONS = ['Male', 'Female'] as const;
const normalizeSex = (v: unknown): string => {
  const c = String(v || '').trim().charAt(0).toUpperCase();
  return c === 'M' ? 'Male' : c === 'F' ? 'Female' : '';
};

// ─── Screen ───────────────────────────────────────────────────────────────────
export default function AppointmentsScreen() {
  const router   = useRouter();
  const params   = useLocalSearchParams<{ preview?: string }>();
  const { user, mrn } = usePatientAuth();
  const insets   = useSafeAreaInsets();
  const now      = new Date();
  // The clinic's calendar (Asia/Manila), whatever the phone's timezone.
  const todayKey = clinicToday(now);

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

  // ── Active Schedule Closures ──────────────────────────────────────────────
  const [closures, setClosures] = useState<any[]>([]);
  const [closureModal, setClosureModal] = useState<{
    visible: boolean;
    title: string;
    dateStr: string;
    slots?: string[];
    reason: string;
  } | null>(null);

  useEffect(() => {
    const q = query(collection(db, 'scheduleClosures'), where('active', '==', true));
    return onSnapshot(q, snap => {
      setClosures(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    }, err => console.warn('Patient app closures listener error:', err));
  }, []);

  const getClosureForDate = (dateKey: string) => {
    if (!dateKey) return null;
    const matches = closures.filter(c => c.startDate <= dateKey && dateKey <= (c.endDate || c.startDate));
    if (!matches.length) return null;
    const dayClosure = matches.find(c => c.type === 'day');
    if (dayClosure) return { type: 'day', closure: dayClosure, all: matches };
    const closedSlots = Array.from(new Set(matches.filter(c => c.type === 'slots').flatMap(c => c.slots || [])));
    if (closedSlots.length >= TIME_SLOTS.length) {
      return { type: 'day', closure: matches[0], all: matches, slots: closedSlots };
    }
    return { type: 'slots', closure: matches[0], all: matches, slots: closedSlots };
  };

  const jumpToNextAvailable = () => {
    setClosureModal(null);
    const check = new Date();
    for (let i = 1; i <= 60; i++) {
      const d = new Date(check);
      d.setDate(check.getDate() + i);
      const day = d.getDay();
      if (day === 0 || day === 6) {
        const k = toKey(d.getFullYear(), d.getMonth(), d.getDate());
        const cInfo = getClosureForDate(k);
        if (!cInfo || cInfo.type !== 'day') {
          setViewYear(d.getFullYear());
          setViewMonth(d.getMonth());
          setSelectedKey(k);
          setSelectedTime(null);
          setShowSlotModal(true);
          break;
        }
      }
    }
  };

  // ── Appointment Details & Modals ──────────────────────────────────────────
  const [selectedApptDetail, setSelectedApptDetail] = useState<FirestoreAppt | null>(null);

  // ── Direct Cancellation ───────────────────────────────────────────────────
  const [cancellingAppt, setCancellingAppt] = useState<FirestoreAppt | null>(null);
  const [cancelReasonInput, setCancelReasonInput] = useState('');
  const [submittingCancellation, setSubmittingCancellation] = useState(false);

  const openCancelModal = (appt: FirestoreAppt) => {
    if (appt.affectedByClosure) {
      showAlert({
        type: 'info',
        title: 'Reschedule instead',
        message: 'The clinic is closed at this time. Please reschedule your appointment to another date or time slot.',
        primaryButtonText: 'Reschedule',
        onPrimaryPress: () => { hideAlert(); openReschedule(appt); },
        secondaryButtonText: 'Not now',
        onSecondaryPress: hideAlert,
      });
      return;
    }
    if (appt.status === 'cancelled' || appt.status === 'done' || appt.date < todayKey) {
      showAlert({
        type: 'warning',
        title: 'Cannot Cancel',
        message: 'This appointment is in the past or has already concluded and cannot be cancelled.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      return;
    }
    setCancelReasonInput('');
    setCancellingAppt(appt);
  };

  const handleDirectCancel = async () => {
    const target = cancellingAppt;
    if (!target) return;
    if (target.status === 'cancelled' || target.status === 'done' || target.date < todayKey) {
      showAlert({
        type: 'warning',
        title: 'Cannot Cancel',
        message: 'This appointment cannot be cancelled.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      setCancellingAppt(null);
      return;
    }

    setSubmittingCancellation(true);
    try {
      const slotRef = doc(db, 'appointmentSlots', slotId(target.date, target.time));
      const apptRef = doc(db, 'appointments', target.id);
      await runTransaction(db, async tx => {
        const aptDoc = await tx.get(apptRef);
        if (!aptDoc.exists()) throw new Error('Appointment not found');
        const d = aptDoc.data();
        if (d.status === 'cancelled' || d.status === 'done' || d.date < todayKey) {
          throw new Error('This appointment can no longer be cancelled.');
        }
        const slotDoc = await tx.get(slotRef);
        if (slotDoc.exists()) {
          tx.delete(slotRef);
        }
        const reason = cancelReasonInput.trim();
        tx.update(apptRef, {
          status: 'cancelled',
          cancelledBy: 'patient',
          cancelledAt: Date.now(),
          cancellationReason: reason || 'Cancelled by patient',
          updatedAt: Date.now(),
        });
      });

      setCancellingAppt(null);
      setSelectedApptDetail(null);
      setCancelReasonInput('');
      showAlert({
        type: 'success',
        title: 'Appointment Cancelled',
        message: 'Your appointment has been cancelled and the time slot was freed immediately.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } catch (e: any) {
      console.error('Cancellation error:', e);
      showAlert({
        type: 'error',
        title: 'Cancellation Failed',
        message: e?.message || 'Could not cancel the appointment. Please try again.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } finally {
      setSubmittingCancellation(false);
    }
  };

  // ── Reschedule Flow ───────────────────────────────────────────────────────
  const [reschedulingAppt, setReschedulingAppt] = useState<FirestoreAppt | null>(null);
  const [rescheduleStep, setRescheduleStep] = useState<'calendar' | 'slots' | 'confirm'>('calendar');
  const [rescheduleYear, setRescheduleYear] = useState(now.getFullYear());
  const [rescheduleMonth, setRescheduleMonth] = useState(now.getMonth());
  const [rescheduleDate, setRescheduleDate] = useState<string | null>(null);
  const [rescheduleTime, setRescheduleTime] = useState<string | null>(null);
  const [rescheduleNotes, setRescheduleNotes] = useState('');
  const [rescheduleTakenTimes, setRescheduleTakenTimes] = useState<string[]>([]);
  const [rescheduleMonthSlotCounts, setRescheduleMonthSlotCounts] = useState<Record<string, number>>({});
  const [submittingReschedule, setSubmittingReschedule] = useState(false);

  const openReschedule = (appt: FirestoreAppt) => {
    if (appt.status === 'cancelled' || appt.status === 'done' || appt.date < todayKey) {
      showAlert({
        type: 'warning',
        title: 'Cannot Reschedule',
        message: 'Past or cancelled appointments cannot be rescheduled.',
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
      return;
    }
    setReschedulingAppt(appt);
    setRescheduleStep('calendar');
    setRescheduleYear(now.getFullYear());
    setRescheduleMonth(now.getMonth());
    setRescheduleDate(null);
    setRescheduleTime(null);
    setRescheduleNotes(appt.notes || '');
  };

  // Reschedule calendar month occupancy
  useEffect(() => {
    if (!reschedulingAppt) return;
    const mStart = toKey(rescheduleYear, rescheduleMonth, 1);
    const mEnd   = toKey(rescheduleYear, rescheduleMonth, daysInMonth(rescheduleYear, rescheduleMonth));
    const q = query(
      collection(db, 'appointmentSlots'),
      where('date', '>=', mStart),
      where('date', '<=', mEnd),
    );
    return onSnapshot(q, snap => {
      const counts: Record<string, number> = {};
      snap.docs.forEach(d => {
        const date = (d.data() as any).date;
        if (date) counts[date] = (counts[date] || 0) + 1;
      });
      setRescheduleMonthSlotCounts(counts);
    }, err => {
      console.error('Reschedule month slot listener error:', err);
      setRescheduleMonthSlotCounts({});
    });
  }, [reschedulingAppt, rescheduleYear, rescheduleMonth]);

  // Reschedule slot occupancy on selected date
  useEffect(() => {
    if (!rescheduleDate || !reschedulingAppt) {
      setRescheduleTakenTimes([]);
      return;
    }
    const q = query(collection(db, 'appointmentSlots'), where('date', '==', rescheduleDate));
    return onSnapshot(q, snap => {
      const times = snap.docs
        .map(d => (d.data() as any).time)
        .filter(t => Boolean(t) && !(rescheduleDate === reschedulingAppt.date && t === reschedulingAppt.time));
      setRescheduleTakenTimes(times);
    }, err => {
      console.error('Reschedule slot availability listener error:', err);
      setRescheduleTakenTimes([]);
    });
  }, [rescheduleDate, reschedulingAppt]);

  const handleSaveReschedule = async () => {
    const target = reschedulingAppt;
    if (!target || !rescheduleDate || !rescheduleTime) return;

    if (rescheduleDate === target.date && rescheduleTime === target.time) {
      showAlert({
        type: 'warning',
        title: 'Same Time Selected',
        message: 'You have chosen your current time slot. Please pick a different date or time.',
        primaryButtonText: 'Choose Another Time',
        onPrimaryPress: hideAlert,
      });
      return;
    }

    const closureCheck = getClosureForDate(rescheduleDate);
    const isTargetClosed = closureCheck && (
      closureCheck.type === 'day' ||
      (closureCheck.type === 'slots' && (closureCheck.slots || []).includes(rescheduleTime))
    );
    if (isTargetClosed) {
      showAlert({
        type: 'warning',
        title: 'Schedule Closed',
        message: `This appointment slot is closed (${closureCheck.closure?.reason || 'Clinic schedule closed'}). Please pick a different date or time.`,
        primaryButtonText: 'Pick Another Time',
        onPrimaryPress: hideAlert,
      });
      return;
    }

    setSubmittingReschedule(true);
    try {
      const oldSlotRef = doc(db, 'appointmentSlots', slotId(target.date, target.time));
      const newSlotRef = doc(db, 'appointmentSlots', slotId(rescheduleDate, rescheduleTime));
      const apptRef = doc(db, 'appointments', target.id);

      await runTransaction(db, async tx => {
        const newSlotDoc = await tx.get(newSlotRef);
        if (newSlotDoc.exists()) {
          throw new Error('SLOT_TAKEN');
        }

        const apptDoc = await tx.get(apptRef);
        if (!apptDoc.exists()) throw new Error('Appointment not found');
        const apptData = apptDoc.data();
        if (apptData.status === 'cancelled' || apptData.status === 'done') {
          throw new Error('This appointment can no longer be rescheduled.');
        }

        const oldSlotDoc = await tx.get(oldSlotRef);
        if (oldSlotDoc.exists()) {
          tx.delete(oldSlotRef);
        }

        tx.set(newSlotRef, {
          date: rescheduleDate,
          time: rescheduleTime,
          heldBy: user?.uid || target.userId,
          createdAt: Date.now(),
        });

        const historyItem = {
          previousDate: target.date,
          previousTime: target.time,
          newDate: rescheduleDate,
          newTime: rescheduleTime,
          rescheduledAt: Date.now(),
        };
        const prevCount = target.rescheduledCount || 0;
        const prevHistory = target.rescheduleHistory || [];

        tx.update(apptRef, {
          date: rescheduleDate,
          time: rescheduleTime,
          status: 'pending',
          notes: rescheduleNotes.trim().slice(0, NOTE_MAX),
          previousDate: target.date,
          previousTime: target.time,
          rescheduledAt: Date.now(),
          rescheduledCount: prevCount + 1,
          rescheduleHistory: [...prevHistory, historyItem],
          // The new date/time is open, so the closure no longer applies.
          ...(target.affectedByClosure ? { affectedByClosure: false, closureId: null, closureReason: null } : {}),
          updatedAt: Date.now(),
        });
      });

      setReschedulingAppt(null);
      setSelectedApptDetail(null);
      setRescheduleDate(null);
      setRescheduleTime(null);

      showAlert({
        type: 'success',
        title: 'Appointment Rescheduled',
        message: "Your new time is waiting for the clinic's confirmation.",
        primaryButtonText: 'OK',
        onPrimaryPress: hideAlert,
      });
    } catch (e: any) {
      console.error('Reschedule transaction error:', e);
      if (e?.message === 'SLOT_TAKEN') {
        setRescheduleTime(null);
        setRescheduleStep('slots');
        showAlert({
          type: 'warning',
          title: 'Time Slot Taken',
          message: 'That time was just taken. Please pick another.',
          primaryButtonText: 'Choose Another Time',
          onPrimaryPress: hideAlert,
        });
      } else {
        showAlert({
          type: 'error',
          title: 'Reschedule Failed',
          message: e?.message || 'Could not reschedule appointment. Please try again.',
          primaryButtonText: 'OK',
          onPrimaryPress: hideAlert,
        });
      }
    } finally {
      setSubmittingReschedule(false);
    }
  };

  const detailKeyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  const detailKeyboardLift = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'android' ? detailKeyboard.height.value : 0,
  }));

  // ── Patient details form modal ────────────────────────────────────────────
  const [showDetailsForm, setShowDetailsForm] = useState(false);
  const [patientForm, setPatientForm] = useState<PatientForm>({
    name: '', age: '', gender: '', address: '', contactNumber: '',
  });
  const [formErrors, setFormErrors] = useState<Partial<PatientForm>>({});
  // The patient's own clinic record (`vaccinations/{mrn}`), kept live. The
  // form is filled from it every time it opens (editable), so it always shows
  // this patient's current details, never a previous account's or an older
  // copy. Nothing here writes back to the record.
  const recordDefaultsRef = useRef<PatientForm>({ name: '', age: '', gender: '', address: '', contactNumber: '' });
  useEffect(() => {
    recordDefaultsRef.current = { name: (user?.displayName || '').trim(), age: '', gender: '', address: '', contactNumber: '' };
    if (!mrn) return;
    return onSnapshot(doc(db, 'vaccinations', mrn), (snap) => {
      if (!snap.exists()) return;
      const r: any = snap.data() || {};
      const joinedName = r.name || [r.firstName, r.middleName, r.lastName].filter(Boolean).join(' ');
      recordDefaultsRef.current = {
        name: (joinedName || user?.displayName || '').trim(),
        age: r.age !== undefined && r.age !== null && r.age !== '' ? String(r.age) : '',
        gender: normalizeSex(r.sex || r.gender),
        address: r.address || '',
        contactNumber: r.contact || r.contactNumber || '',
      };
    }, (err) => console.error('Patient record prefill failed:', err));
  }, [mrn, user?.displayName]);
  // What the visit is for: one of APPT_SERVICES. Nothing preselected.
  const [apptService, setApptService] = useState<string>('');
  const [patientNote, setPatientNote] = useState('');
  const [typeError,   setTypeError]   = useState('');

  // Keyboard: the sheet's bottom edge rides on top of the keyboard (Android
  // reads its height natively; iOS uses KeyboardAvoidingView 'padding').
  const formKeyboard = useAnimatedKeyboard({ isStatusBarTranslucentAndroid: true, isNavigationBarTranslucentAndroid: true });
  const formKeyboardLift = useAnimatedStyle(() => ({
    paddingBottom: Platform.OS === 'android' ? formKeyboard.height.value : 0,
  }));

  // ── Custom Alert Modal State ──────────────────────────────────────────────
  const [alertConfig, setAlertConfig] = useState<CustomAlertConfig>({
    visible: false,
    title: '',
    message: '',
  });

  const showAlert = (config: Omit<CustomAlertConfig, 'visible'>) => {
    setAlertConfig({ ...config, visible: true });
  };

  // Locally hidden appointment IDs (for instant offline removal & resilience)
  const [hiddenApptIds, setHiddenApptIds] = useState<string[]>([]);

  useEffect(() => {
    if (!user?.uid) {
      setHiddenApptIds([]);
      return;
    }
    const storageKey = `@kna_hidden_cancelled_appts_${user.uid}`;
    AsyncStorage.getItem(storageKey).then(val => {
      if (val) {
        try {
          const parsed = JSON.parse(val);
          if (Array.isArray(parsed)) setHiddenApptIds(parsed);
        } catch {}
      }
    }).catch(() => {});
  }, [user?.uid]);

  // Removes one of the patient's own cancelled appointments from the list.
  const confirmDeleteCancelled = (appt: any) => {
    showAlert({
      type: 'warning',
      title: 'Remove from your list?',
      message: `Your cancelled ${apptTypeLabel(appt.type)} appointment on ${shortKeyWithDay(appt.date)} will be removed from your list. The clinic record will not be affected.`,
      primaryButtonText: 'Remove',
      onPrimaryPress: () => {
        hideAlert();
        const id = appt.id;
        // Optimistically hide immediately from UI and device storage
        setHiddenApptIds(prev => {
          const next = prev.includes(id) ? prev : [...prev, id];
          if (user?.uid) {
            AsyncStorage.setItem(`@kna_hidden_cancelled_appts_${user.uid}`, JSON.stringify(next)).catch(() => {});
          }
          return next;
        });

        // Persist hidden status to server with admin privileges (does not delete record)
        callApi('/api/notifications', {
          action: 'hide-appointment',
          appointmentId: id,
        }).catch((apiErr: any) => {
          console.warn('API hide-appointment failed, falling back to updateDoc:', apiErr);
          updateDoc(doc(db, 'appointments', id), {
            hiddenByPatient: true,
            hiddenAt: Date.now(),
          }).catch((dbErr: any) => {
            console.warn('Direct updateDoc also failed (retained locally):', dbErr);
          });
        });
      },
      secondaryButtonText: 'Keep',
      onSecondaryPress: hideAlert,
    });
  };

  const hideAlert = () => {
    setAlertConfig(prev => ({ ...prev, visible: false }));
  };


  // ── Firestore: live appointments for this patient ─────────────────────────
  const [myAppointments, setMyAppointments] = useState<FirestoreAppt[]>([]);
  const [loadingApts,    setLoadingApts]    = useState(true);

  const [aptsError, setAptsError] = useState('');

  useEffect(() => {
    if (!user || user.isAnonymous) {
      setMyAppointments([]);
      setAptsError('');
      setLoadingApts(false);
      return;
    }
    setLoadingApts(true);
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

  const previewSampleApts: FirestoreAppt[] = [
    {
      id: 'preview-1',
      userId: user?.uid || 'preview',
      name: 'Maria Santos',
      date: '2026-10-24',
      time: '9:00 AM - 10:00 AM',
      type: 'General Consultation',
      status: 'pending',
      age: '28',
      gender: 'Female',
      address: 'Libon, Albay',
      contactNumber: '09123456789',
      createdAt: Date.now(),
    },
    {
      id: 'preview-2',
      userId: user?.uid || 'preview',
      name: 'Maria Santos',
      date: '2026-10-31',
      time: '10:00 AM - 11:00 AM',
      type: 'PEP',
      status: 'confirmed',
      age: '28',
      gender: 'Female',
      address: 'Libon, Albay',
      contactNumber: '09123456789',
      createdAt: Date.now(),
    },
    {
      id: 'preview-3',
      userId: user?.uid || 'preview',
      name: 'Maria Santos',
      date: '2026-10-18',
      time: '2:00 PM - 3:00 PM',
      type: 'Anti-Tetanus Vaccine',
      status: 'done',
      age: '28',
      gender: 'Female',
      address: 'Libon, Albay',
      contactNumber: '09123456789',
      createdAt: Date.now(),
    },
  ];

  const upcomingApts = isPreview(params.preview) && myAppointments.length === 0
    ? previewSampleApts
    : myAppointments.filter(a =>
        !isEnded(a) && a.date >= todayKey
      );
  const pastApts = myAppointments.filter(a =>
    (a.status === 'confirmed' || a.status === 'accepted' || a.status === 'done') && a.date < todayKey
  );
  const cancelledApts = myAppointments.filter(a => isEnded(a) && !a.hiddenByPatient && !hiddenApptIds.includes(a.id));

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

  const closureInfo = selectedKey ? getClosureForDate(selectedKey) : null;
  const slots      = selectedKey && isWeekendDate(selectedKey)
    ? TIME_SLOTS.map(time => {
        const isClosed = closureInfo && (
          closureInfo.type === 'day' ||
          (closureInfo.type === 'slots' && (closureInfo.slots || []).includes(time))
        );
        return {
          time,
          available: !takenTimes.includes(time) && !isClosed,
          closed: Boolean(isClosed),
          closureReason: closureInfo?.closure?.reason || 'Clinic schedule closed',
        };
      })
    : [];
  const canConfirm = !!selectedKey && !!selectedTime && !saving
    && !takenTimes.includes(selectedTime)
    && !slots.find(s => s.time === selectedTime)?.closed;

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
    if ((user?.isAnonymous || !mrn) && !isPreview(params.preview)) {
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
    if (!patientForm.gender)               errors.gender        = 'Choose Male or Female';
    if (!patientForm.address.trim())       errors.address       = 'Address is required';
    if (!patientForm.contactNumber.trim()) errors.contactNumber = 'Contact number is required';
    else if (!/^[0-9+\-\s]{7,15}$/.test(patientForm.contactNumber.trim()))
                                           errors.contactNumber = 'Enter a valid contact number';
    setFormErrors(errors);
    const tErr = !apptService ? 'Choose what the appointment is for' : '';
    setTypeError(tErr);
    return Object.keys(errors).length === 0 && !tErr;
  };

  // ── Open details form (called from "Request Appointment" button) ──────────
  const handleOpenDetailsForm = () => {
    if (!canConfirm) return;
    // Each opening starts from this patient's record, with no leftover choice
    // or errors.
    setPatientForm({ ...recordDefaultsRef.current });
    setFormErrors({});
    setTypeError('');
    setApptService('');
    setPatientNote('');
    setShowDetailsForm(true);
  };

  // ── Book appointment → Firestore ──────────────────────────────────────────
  const handleConfirm = async () => {
    if (isPreview(params.preview)) {
      setShowDetailsForm(false);
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
      setShowSuccess(true);
      return;
    }
    if (!validateForm()) return;
    if (!selectedKey || !selectedTime) return;

    if (!user) {
      showAlert({
        type: 'error',
        title: 'Session Expired',
        message: 'Your session has expired. Please log in again to continue.',
        primaryButtonText: 'Log In',
        onPrimaryPress: () => {
          hideAlert();
          resetTo(router, '/auth/login');
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
    // Double check closure before committing
    const activeClosure = selectedKey ? getClosureForDate(selectedKey) : null;
    if (activeClosure) {
      if (activeClosure.type === 'day' || (activeClosure.type === 'slots' && (activeClosure.slots || []).includes(selectedTime || ''))) {
        setSaving(false);
        setShowDetailsForm(false);
        setClosureModal({
          visible: true,
          title: 'This time is closed',
          dateStr: `${displayKey(selectedKey || '')} · ${selectedTime}`,
          slots: selectedTime ? [selectedTime] : [],
          reason: activeClosure.closure.reason,
        });
        return;
      }
    }

    try {
      // The hour and the appointment are written in ONE transaction: whoever
      // creates the slot doc wins, a second patient racing for the same hour
      // reads an existing doc and aborts before anything is written, and a
      // booking that fails can never leave a slot marked "Full" with no
      // appointment behind it (both are saved, or neither). The success
      // toast is only shown after this resolves.
      const slotRef = doc(db, 'appointmentSlots', slotId(selectedKey, selectedTime));
      const apptRef = doc(collection(db, 'appointments'));
      await runTransaction(db, async tx => {
        const existing = await tx.get(slotRef);
        if (existing.exists()) throw new Error('SLOT_TAKEN');
        tx.set(slotRef, {
          date:      selectedKey,
          time:      selectedTime,
          heldBy:    user.uid,
          createdAt: Date.now(),
        });
        tx.set(apptRef, {
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
          // The admin's own service value (APPT_SERVICES).
          type:          apptService,
          status:        'pending',
          // Distinguishes an in-app booking from a walk-in the clinic keyed in and
          // from the landing page's 'online' form — the dashboard groups on this.
          source:        'app',
          note:          '',
          ...(patientNote.trim() ? { notes: patientNote.trim().slice(0, NOTE_MAX) } : {}),
          createdAt:     Date.now(),
        });
      });

      setShowDetailsForm(false);
      setApptService('');
      setShowToast(true);
      setTimeout(() => setShowToast(false), 4000);
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

  const mainWeeks: (number | null)[][] = [];
  for (let i = 0; i < cells.length; i += 7) {
    mainWeeks.push(cells.slice(i, i + 7));
  }

  // ─────────────────────────────────────────────────────────────────────────
  const closeAppointmentDetail = () => {
    setSelectedApptDetail(null);
  };

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
          <View style={[s.hint, s.errorHint]}>
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
              <Tap
                onPress={goToPrev}
                style={[s.calNavBtn, atCurrentMonth && s.calNavBtnOff]}
                disabled={atCurrentMonth}
                activeOpacity={atCurrentMonth ? 1 : 0.75}
              >
                <Ionicons name="chevron-back" size={18} color={atCurrentMonth ? '#CBD5E1' : C.charcoal}/>
              </Tap>
              <Text style={s.calMonthTxt}>{MONTH_NAMES[viewMonth]} {viewYear}</Text>
              <Tap onPress={goToNext} style={s.calNavBtn}>
                <Ionicons name="chevron-forward" size={18} color={C.charcoal}/>
              </Tap>
            </View>

            <View style={s.calWeekRow}>
              {DAY_NAMES.map(d => (
                <View key={d} style={s.calWeekCell}>
                  <Text style={s.calWeekTxt}>{d}</Text>
                </View>
              ))}
            </View>

            <View style={s.calGrid}>
              {mainWeeks.map((week, wIdx) => (
                <View key={`mw-${wIdx}`} style={s.calGridRow}>
                  {week.map((day, dIdx) => {
                    if (day === null) return <View key={`b-${wIdx}-${dIdx}`} style={s.calCell}/>;
                    const key        = toKey(viewYear, viewMonth, day);
                    const isToday    = key === todayKey;
                    const isSelected = key === selectedKey;
                    const hasSlots   = isWeekendDate(key);
                    const isPast     = key < todayKey; // clinic calendar (Manila)
                    const cInfo      = hasSlots ? getClosureForDate(key) : null;
                    const isClosedDay = cInfo?.type === 'day';
                    const isPartiallyClosed = cInfo?.type === 'slots';
                    // Every hour claimed or closed — still a clinic day, but nothing left to book.
                    const closedCount = isClosedDay ? TIME_SLOTS.length : (cInfo?.slots?.length || 0);
                    const isFull     = hasSlots && !isClosedDay && ((monthSlotCounts[key] || 0) + closedCount >= TIME_SLOTS.length);
                    const tappable   = !isPast && hasSlots && (!isFull || isClosedDay);

                    return (
                      <Tap
                        key={key}
                        style={s.calCell}
                        onPress={() => {
                          if (isClosedDay) {
                            setClosureModal({
                              visible: true,
                              title: 'Appointments closed',
                              dateStr: displayKey(key),
                              reason: cInfo.closure.reason,
                            });
                          } else if (tappable && !isFull) {
                            handleDayPress(day);
                          }
                        }}
                        activeOpacity={tappable ? 0.75 : 1}
                        disabled={!tappable}
                      >
                        {/* Bookable dates are marked by red numerals alone — no fill,
                            so only the selected date carries a background. */}
                        <View style={[
                          s.calTile,
                          isToday && !isSelected && s.calTileToday,
                          isSelected && s.calTileSelected,
                          isClosedDay && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
                        ]}>
                          {isClosedDay && (
                            <Ionicons name="lock-closed" size={10} color="#64748B" style={{ position: 'absolute', top: 3, right: 3 }} />
                          )}
                          {isPartiallyClosed && !isClosedDay && (
                            <Ionicons name="lock-closed" size={8} color="#94A3B8" style={{ position: 'absolute', top: 3, right: 3 }} />
                          )}
                          <Text style={[
                            s.calDayTxt,
                            isPast               && s.calDayPast,
                            !isPast && !hasSlots && s.calDayNoSlot,
                            tappable && !isSelected && !isClosedDay && s.calDayOpen,
                            !isPast && isFull && !isSelected && !isClosedDay && s.calDayFull,
                            isClosedDay && { color: '#475569', fontWeight: '800' },
                            isToday && !isSelected && s.calDayToday,
                            isSelected           && s.calDaySelected,
                          ]}>
                            {day}
                          </Text>
                        </View>
                      </Tap>
                    );
                  })}
                </View>
              ))}
            </View>

            <View style={s.legend}>
              <View style={s.legendItem}><Text style={s.legendNum}>5</Text><Text style={s.legendTxt}>Open to book</Text></View>
              <View style={s.legendItem}><Text style={[s.legendNum, s.calDayFull]}>6</Text><Text style={s.legendTxt}>Fully booked</Text></View>
              <View style={s.legendItem}><Ionicons name="lock-closed" size={12} color="#64748B" /><Text style={s.legendTxt}>Closed</Text></View>
              <View style={s.legendItem}><View style={s.legendToday}/><Text style={s.legendTxt}>Today</Text></View>
            </View>
          </View>
        </View>

        {/* Hint: always visible whether modal is open or closed */}
        <View style={s.hint}>
          <Ionicons name="hand-left-outline" size={14} color={C.muted}/>
          <Text style={s.hintTxt}>Appointments are on Saturdays & Sundays. Weekdays (Mon–Fri) are for walk-ins, no booking needed. Tap a highlighted date to see time slots.</Text>
        </View>

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
            <View style={s.apptListCard} accessibilityLabel="Loading appointments">
              <View style={s.apptListItem}>
                <View style={[s.apptDateBox, { backgroundColor: '#E2E8F0' }]} />
                <View style={{ flex: 1, gap: verticalScale(8) }}>
                  <View style={{ height: verticalScale(14), width: '60%', borderRadius: scale(6), backgroundColor: '#E2E8F0' }} />
                  <View style={{ height: verticalScale(11), width: '40%', borderRadius: scale(6), backgroundColor: '#E2E8F0' }} />
                </View>
              </View>
            </View>
          ) : upcomingApts.length === 0 ? (
            <View style={s.emptyCard}>
              <Ionicons name="calendar-outline" size={28} color={C.muted}/>
              <Text style={s.emptyCardTxt}>No upcoming appointments</Text>
            </View>
          ) : (
            <View style={s.apptListCard}>
              {upcomingApts.map((appt, idx) => {
                const confirmedLike = (appt.status === 'confirmed' || appt.status === 'accepted' || appt.status === 'done') && !appt.affectedByClosure;
                // An appointment inside a clinic closure can only be moved, not
                // cancelled (firestore.rules refuses the cancel too).
                const canCancel = (appt.status === 'pending' || appt.status === 'confirmed' || appt.status === 'accepted') && !appt.affectedByClosure;
                return (
                  <View key={appt.id}>
                    <Tap style={s.apptListItem} activeOpacity={0.85} onPress={() => setSelectedApptDetail(appt)}
                      accessibilityLabel={`${apptTypeLabel(appt.type)} appointment, ${shortKeyWithDay(appt.date)}, ${appt.time}. Open details.`}>
                      <View style={[s.apptDateBox, confirmedLike && { backgroundColor: C.greenFaint }]}>
                        <Text style={[s.apptDateNum, confirmedLike && { color: C.green }]}>
                          {new Date(appt.date + 'T00:00:00').getDate()}
                        </Text>
                        <Text style={[s.apptDateMon, confirmedLike && { color: C.green }]}>
                          {new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}
                        </Text>
                      </View>
                      <View style={s.apptInfo}>
                        <View style={s.apptHeaderRow}>
                          <Text style={s.apptType}>{apptTypeLabel(appt.type)}</Text>
                          <StatusBadge status={appt.status} declined={isEnded(appt) && endedByClinic(appt)} affectedByClosure={appt.affectedByClosure}/>
                        </View>
                        <View style={s.apptInfoRow}>
                          <Ionicons name="time-outline" size={12} color={C.muted}/>
                          <Text style={s.apptInfoSub}>{shortKeyWithDay(appt.date)} · {appt.time}</Text>
                        </View>
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
                      {/* Cancel action has its own space on the right, vertically centered.
                          When not cancellable, it is hidden cleanly without leaving an empty gap. */}
                      {canCancel && (
                        <Tap
                          style={s.cancelPill}
                          hitSlop={{ top: 10, bottom: 10, left: 8, right: 8 }}
                          onPress={() => openCancelModal(appt)}
                          accessibilityRole="button"
                          accessibilityLabel="Cancel appointment"
                        >
                          <Ionicons name="close-circle-outline" size={13} color={C.navy}/>
                          <Text style={s.cancelPillTxt}>Cancel</Text>
                        </Tap>
                      )}
                    </Tap>

                    {/* Affected by schedule closure banner */}
                    {appt.affectedByClosure && (
                      <View style={s.closureCardBanner}>
                        <View style={s.closureCardHeader}>
                          <Ionicons name="alert-circle-outline" size={14} color="#64748B" />
                          <Text style={s.closureCardTitle}>Affected by schedule closure</Text>
                        </View>
                        <Text style={s.closureCardReason}>
                          {appt.closureReason || 'The clinic schedule for this time has been closed.'}
                        </Text>
                        <Text style={s.closureCardSub}>
                          Please pick another date or time slot.
                        </Text>
                        <View style={s.closureCardBtnRow}>
                          <Tap
                            style={s.closureCardRescheduleBtn}
                            onPress={() => openReschedule(appt)}
                          >
                            <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
                            <Text style={s.closureCardRescheduleTxt}>Reschedule</Text>
                          </Tap>
                        </View>
                      </View>
                    )}

                    {idx < upcomingApts.length - 1 && <View style={s.apptListDivider} />}
                  </View>
                );
              })}
            </View>
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
              <View style={s.apptListCard}>
                {pastApts.map((appt, idx) => (
                  <View key={appt.id}>
                    <Tap
                      style={[s.apptListItem, { opacity: 0.7 }]}
                      activeOpacity={0.85}
                      onPress={() => setSelectedApptDetail(appt)}
                    >
                      <View style={[s.apptDateBox, { backgroundColor: C.greenFaint }]}>
                        <Text style={[s.apptDateNum, { color: C.green }]}>{new Date(appt.date + 'T00:00:00').getDate()}</Text>
                        <Text style={[s.apptDateMon, { color: C.green }]}>{new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</Text>
                      </View>
                      <View style={s.apptInfo}>
                        <Text style={s.apptType}>{apptTypeLabel(appt.type)}</Text>
                        <View style={s.apptInfoRow}>
                          <Ionicons name="time-outline" size={12} color={C.muted}/>
                          <Text style={s.apptInfoSub}>{shortKeyWithDay(appt.date)} · {appt.time}</Text>
                        </View>
                      </View>
                      <View style={s.apptRight}>
                        <View style={s.doneBadge}>
                          <Ionicons name="checkmark-circle" size={12} color={C.green}/>
                          <Text style={s.doneTxt}>Done</Text>
                        </View>
                      </View>
                    </Tap>
                    {idx < pastApts.length - 1 && <View style={s.apptListDivider} />}
                  </View>
                ))}
              </View>
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
              <View style={s.apptListCard}>
                {cancelledApts.map((appt, idx) => (
                  <View key={appt.id}>
                    <Tap
                      style={[s.apptListItem, { opacity: 0.9 }]}
                      activeOpacity={0.85}
                      onPress={() => setSelectedApptDetail(appt)}
                    >
                      <View style={[s.apptDateBox, { backgroundColor: C.redFaint }]}>
                        <Text style={[s.apptDateNum, { color: C.red }]}>{new Date(appt.date + 'T00:00:00').getDate()}</Text>
                        <Text style={[s.apptDateMon, { color: C.red }]}>{new Date(appt.date + 'T00:00:00').toLocaleDateString('en-US', { month: 'short' })}</Text>
                      </View>
                      <View style={s.apptInfo}>
                        <Text style={s.apptType}>{apptTypeLabel(appt.type)}</Text>
                        <View style={s.apptInfoRow}>
                          <Ionicons name="time-outline" size={12} color={C.muted}/>
                          <Text style={s.apptInfoSub}>{shortKeyWithDay(appt.date)} · {appt.time}</Text>
                        </View>
                        {(appt.declineReason || appt.cancellationReason) ? (
                          <View style={[s.adminNoteBox, { backgroundColor: '#FEF2F2', borderColor: '#FECACA', borderWidth: 0.5, marginTop: 4 }]}>
                            <Ionicons name="alert-circle-outline" size={11} color={C.red}/>
                            <Text style={[s.adminNoteTxt, { color: '#B91C1C', fontWeight: '600' }]} numberOfLines={2}>
                              Reason: {appt.cancellationReason || appt.declineReason}
                            </Text>
                          </View>
                        ) : appt.note ? (
                          <View style={s.adminNoteBox}>
                            <Ionicons name="chatbubble-ellipses-outline" size={11} color={C.red}/>
                            <Text style={s.adminNoteTxt}>Clinic: {appt.note}</Text>
                          </View>
                        ) : null}
                      </View>
                      {/* firestore.rules lets a patient delete only their own cancelled appointments. */}
                      {appt.status === 'cancelled' && (
                        <Tap
                          style={s.deleteIconBtn}
                          hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                          onPress={() => confirmDeleteCancelled(appt)}
                          accessibilityRole="button"
                          accessibilityLabel="Delete cancelled appointment"
                        >
                          <Ionicons name="trash-outline" size={18} color={C.navy}/>
                        </Tap>
                      )}
                    </Tap>
                    {idx < cancelledApts.length - 1 && <View style={s.apptListDivider} />}
                  </View>
                ))}
              </View>
            </View>
          </>
        )}

      </ScrollView>

      {/* ══ TIME SLOT MODAL ══════════════════════════════════════════════════ */}
      <Modal visible={showSlotModal} transparent animationType="fade" statusBarTranslucent onRequestClose={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }}>
        <TouchableWithoutFeedback onPress={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }}>
          <View style={sm.overlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={sm.card}>
                {/* Header */}
                <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={sm.headerTitle}>Pick a Time Slot</Text>
                    {selectedKey && <Text style={sm.headerSub}>{displayKey(selectedKey)}</Text>}
                  </View>
                  <Tap onPress={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }} style={sm.closeBtn}>
                    <Ionicons name="close" size={20} color={C.white}/>
                  </Tap>
                </LinearGradient>

                <View style={sm.body}>
                  {/* Time grid (2-column balanced grid) */}
                  <View style={s.timeGrid}>
                    {slots.map(slot => {
                      const active   = selectedTime === slot.time;
                      const isClosed = slot.closed;
                      const isTaken  = !slot.available && !isClosed;
                      const disabled = !slot.available;

                      return (
                        <Tap
                          key={slot.time}
                          style={[
                            s.timeChip,
                            active && s.timeChipActive,
                            isTaken && s.timeChipOff,
                            isClosed && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' }
                          ]}
                          onPress={() => {
                            if (isClosed) {
                              setClosureModal({
                                visible: true,
                                title: 'This time is closed',
                                dateStr: `${displayKey(selectedKey || '')} · ${slot.time}`,
                                slots: [slot.time],
                                reason: slot.closureReason,
                              });
                            } else if (!isTaken) {
                              setSelectedTime(slot.time);
                            }
                          }}
                          activeOpacity={isTaken ? 1 : 0.8}
                          disabled={isTaken}
                        >
                          {active && <LinearGradient colors={[C.navy, C.charcoal]} style={[StyleSheet.absoluteFill, { borderRadius: scale(14) }]}/>}
                          <Ionicons
                            name={active ? 'time' : isClosed ? 'lock-closed' : 'time-outline'}
                            size={12}
                            color={active ? C.white : isClosed ? '#64748B' : isTaken ? '#CBD5E1' : C.slate}
                          />
                          <Text
                            numberOfLines={1}
                            adjustsFontSizeToFit
                            style={[
                              s.timeTxt,
                              active && { color: C.white, fontWeight: '800' },
                              isTaken && { color: '#CBD5E1', textDecorationLine: 'line-through' },
                              isClosed && { color: '#475569', fontWeight: '700' }
                            ]}
                          >
                            {slot.time}
                          </Text>
                          {isTaken && (
                            <View style={s.fullPill}>
                              <Text style={s.fullPillTxt}>Full</Text>
                            </View>
                          )}
                          {isClosed && (
                            <View style={[s.fullPill, { backgroundColor: '#E2E8F0' }]}>
                              <Text style={[s.fullPillTxt, { color: '#92400E' }]}>Closed</Text>
                            </View>
                          )}
                        </Tap>
                      );
                    })}
                  </View>

                  {/* Informational note */}
                  <View style={s.noteBox}>
                    <Ionicons name="information-circle" size={16} color={C.shapeBlue}/>
                    <Text style={s.noteTxt}>Your request will be reviewed by the clinic. You&apos;ll be notified once confirmed.</Text>
                  </View>

                  {/* Action buttons */}
                  <View style={sm.footer}>
                    <Tap style={sm.cancelBtn} onPress={() => { setShowSlotModal(false); setSelectedKey(null); setSelectedTime(null); }} activeOpacity={0.8}>
                      <Text style={sm.cancelTxt}>Cancel</Text>
                    </Tap>
                    <Tap
                      style={[sm.confirmBtn, !canConfirm && { opacity: 0.4 }]}
                      onPress={() => { setShowSlotModal(false); handleOpenDetailsForm(); }}
                      activeOpacity={0.8}
                      disabled={!canConfirm}
                    >
                      <Text style={sm.confirmTxt}>Next</Text>
                    </Tap>
                  </View>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ══ PATIENT DETAILS FORM MODAL ══════════════════════════════════════
          A bottom sheet: the header and the Back · Request footer stay put,
          the fields scroll between them (flexShrink lets the ScrollView take
          only the room the sheet has), and the sheet rises with the keyboard
          so every field and both buttons stay reachable on small phones. */}
      <Modal visible={showDetailsForm} transparent animationType="slide" statusBarTranslucent onRequestClose={() => setShowDetailsForm(false)}>
        <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
          <Animated.View style={[df.overlay, formKeyboardLift]}>
            <Pressable style={StyleSheet.absoluteFill} onPress={() => setShowDetailsForm(false)} accessibilityLabel="Close" />
            <View style={[df.sheet, { paddingBottom: insets.bottom }]}>
              <View style={df.grabber} />
              {/* Header */}
              <View style={df.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={df.sheetTitle}>Patient Details</Text>
                  <Text style={df.sheetSub}>Check your details, then request the visit.</Text>
                </View>
                <Pressable onPress={() => setShowDetailsForm(false)} style={df.closeBtn} hitSlop={8}
                  android_ripple={{ color: 'rgba(15,23,42,0.08)', borderless: true }} accessibilityLabel="Close">
                  <Ionicons name="close" size={20} color={C.slate}/>
                </Pressable>
              </View>

              {/* Date / time summary */}
              <View style={df.aptSummary}>
                <View style={df.aptSummaryIcon}><Ionicons name="calendar" size={18} color={C.navy}/></View>
                <View style={{ flex: 1 }}>
                  <Text style={df.aptSummaryLabel}>Your visit</Text>
                  <Text style={df.aptSummaryTxt}>
                    {selectedKey ? new Date(`${selectedKey}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' }) : ''}{selectedTime ? ` · ${selectedTime}` : ''}
                  </Text>
                </View>
              </View>

              <ScrollView
                style={df.formScroll}
                contentContainerStyle={{ paddingBottom: verticalScale(16) }}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
                automaticallyAdjustKeyboardInsets
              >
                {/* Appointment for */}
                <View style={df.section}>
                  <Text style={df.sectionLabel}>Appointment for <Text style={df.required}>*</Text></Text>
                  <Dropdown
                    value={apptService}
                    options={APPT_SERVICES}
                    onChange={v => { setApptService(v); setTypeError(''); }}
                    placeholder="Choose appointment type"
                    error={!!typeError}
                    accessibilityLabel="Appointment type"
                  />
                  {typeError ? <Text style={df.errorTxt}>{typeError}</Text> : null}
                </View>

                {/* Your details (pre-filled from your clinic record, editable) */}
                <View style={df.section}>
                  <Text style={df.sectionLabel}>Your details</Text>

                  <View style={df.fieldWrap}>
                    <Text style={df.label}>Full name <Text style={df.required}>*</Text></Text>
                    <TextInput
                      style={[df.input, formErrors.name && df.inputError]}
                      placeholder="e.g. Juan dela Cruz"
                      placeholderTextColor="#94A3B8"
                      value={patientForm.name}
                      onChangeText={v => { setPatientForm(p => ({ ...p, name: v })); setFormErrors(e => ({ ...e, name: undefined })); }}
                    />
                    {formErrors.name && <Text style={df.errorTxt}>{formErrors.name}</Text>}
                  </View>

                  <View style={df.row}>
                    <View style={[df.fieldWrap, { width: scale(96) }]}>
                      <Text style={df.label}>Age <Text style={df.required}>*</Text></Text>
                      <TextInput
                        style={[df.input, formErrors.age && df.inputError]}
                        placeholder="e.g. 28"
                        placeholderTextColor="#94A3B8"
                        keyboardType="number-pad"
                        maxLength={3}
                        value={patientForm.age}
                        onChangeText={v => { setPatientForm(p => ({ ...p, age: v.replace(/\D/g, '') })); setFormErrors(e => ({ ...e, age: undefined })); }}
                      />
                      {formErrors.age && <Text style={df.errorTxt}>{formErrors.age}</Text>}
                    </View>
                    <View style={[df.fieldWrap, { flex: 1 }]}>
                      <Text style={df.label}>Sex <Text style={df.required}>*</Text></Text>
                      <View style={df.genderRow} accessibilityRole="radiogroup">
                        {SEX_OPTIONS.map(g => {
                          const active = patientForm.gender === g;
                          return (
                            <Pressable
                              key={g}
                              onPress={() => { setPatientForm(p => ({ ...p, gender: g })); setFormErrors(e => ({ ...e, gender: undefined })); }}
                              accessibilityRole="radio"
                              accessibilityState={{ selected: active }}
                              android_ripple={{ color: 'rgba(30,58,138,0.08)' }}
                              style={({ pressed }) => [df.genderChip, active && df.genderChipActive, pressed && Platform.OS === 'ios' && { opacity: 0.85 }]}
                            >
                              <Text style={[df.genderTxt, active && df.genderTxtActive]}>{g}</Text>
                            </Pressable>
                          );
                        })}
                      </View>
                      {formErrors.gender && <Text style={df.errorTxt}>{formErrors.gender}</Text>}
                    </View>
                  </View>

                  <View style={df.fieldWrap}>
                    <Text style={df.label}>Address <Text style={df.required}>*</Text></Text>
                    <TextInput
                      style={[df.input, df.inputMulti, formErrors.address && df.inputError]}
                      placeholder="House no., street, barangay, town"
                      placeholderTextColor="#94A3B8"
                      multiline
                      numberOfLines={2}
                      value={patientForm.address}
                      onChangeText={v => { setPatientForm(p => ({ ...p, address: v })); setFormErrors(e => ({ ...e, address: undefined })); }}
                    />
                    {formErrors.address && <Text style={df.errorTxt}>{formErrors.address}</Text>}
                  </View>

                  <View style={[df.fieldWrap, { marginBottom: 0 }]}>
                    <Text style={df.label}>Contact number <Text style={df.required}>*</Text></Text>
                    <TextInput
                      style={[df.input, formErrors.contactNumber && df.inputError]}
                      placeholder="e.g. 0917 123 4567"
                      placeholderTextColor="#94A3B8"
                      keyboardType="phone-pad"
                      value={patientForm.contactNumber}
                      onChangeText={v => { setPatientForm(p => ({ ...p, contactNumber: v })); setFormErrors(e => ({ ...e, contactNumber: undefined })); }}
                    />
                    {formErrors.contactNumber && <Text style={df.errorTxt}>{formErrors.contactNumber}</Text>}
                  </View>
                </View>

                {/* Optional note for the clinic */}
                <View style={df.section}>
                  <Text style={df.sectionLabel}>Patient notes <Text style={df.optional}>(optional)</Text></Text>
                  <TextInput
                    style={[df.input, df.inputMulti, df.noteInput]}
                    placeholder="Anything the clinic should know?"
                    placeholderTextColor="#94A3B8"
                    multiline
                    maxLength={NOTE_MAX}
                    textAlignVertical="top"
                    value={patientNote}
                    onChangeText={setPatientNote}
                    accessibilityLabel="Patient notes, optional"
                  />
                  <Text style={[df.counter, patientNote.length >= NOTE_MAX && { color: C.danger }]}>{patientNote.length}/{NOTE_MAX}</Text>
                </View>
              </ScrollView>

              {/* Back (left) · Request Appointment (right) */}
              <View style={df.footer}>
                <Pressable style={df.cancelBtn} onPress={() => setShowDetailsForm(false)}
                  android_ripple={{ color: 'rgba(15,23,42,0.08)' }} accessibilityRole="button">
                  <Text style={df.cancelTxt}>Back</Text>
                </Pressable>
                <Pressable
                  style={({ pressed }) => [df.submitBtn, saving && { opacity: 0.7 }, pressed && Platform.OS === 'ios' && { opacity: 0.85 }]}
                  onPress={handleConfirm}
                  disabled={saving}
                  android_ripple={{ color: 'rgba(255,255,255,0.2)' }}
                  accessibilityRole="button"
                >
                  {saving
                    ? <ActivityIndicator color={C.white} size="small"/>
                    : <Ionicons name="send" size={15} color={C.white}/>
                  }
                  <Text style={df.submitTxt}>{saving ? 'Sending...' : 'Request Appointment'}</Text>
                </Pressable>
              </View>
            </View>
          </Animated.View>
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
      <Modal visible={showSuccess} transparent animationType="fade" statusBarTranslucent onRequestClose={handleDone}>
        <TouchableWithoutFeedback onPress={handleDone}>
          <View style={ms.overlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
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
                  <Tap style={ms.doneBtn} onPress={handleDone} activeOpacity={0.8}>
                    <Text style={ms.doneBtnTxt}>Got it!</Text>
                  </Tap>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ══ APPOINTMENT DETAIL MODAL ═════════════════════════════════════════ */}
      <Modal visible={!!selectedApptDetail} transparent animationType="fade" statusBarTranslucent onRequestClose={closeAppointmentDetail}>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <TouchableWithoutFeedback onPress={closeAppointmentDetail}>
            <Animated.View style={[sm.overlay, detailKeyboardLift]}>
              <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
                <View style={sm.card}>
                  <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
                    <View style={{ flex: 1 }}>
                      <Text style={sm.headerTitle}>Appointment Details</Text>
                      {selectedApptDetail && (
                        <Text style={sm.headerSub}>{displayKey(selectedApptDetail.date)}</Text>
                      )}
                    </View>
                    <Tap onPress={closeAppointmentDetail} style={sm.closeBtn}>
                      <Ionicons name="close" size={20} color={C.white}/>
                    </Tap>
                  </LinearGradient>

                  {selectedApptDetail && (
                    <>
                      <ScrollView
                        style={{ flexShrink: 1 }}
                        contentContainerStyle={sm.body}
                        keyboardShouldPersistTaps="handled"
                        showsVerticalScrollIndicator={true}
                      >
                        <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: scale(10), marginBottom: verticalScale(16) }}>
                          <Text style={{ flex: 1, minWidth: 0, fontSize: moderateScale(16), fontWeight: '800', color: C.charcoal }}>{apptTypeLabel(selectedApptDetail.type)}</Text>
                          <StatusBadge status={selectedApptDetail.status} declined={isEnded(selectedApptDetail) && endedByClinic(selectedApptDetail)} affectedByClosure={selectedApptDetail.affectedByClosure} />
                        </View>

                        {/* Affected by closure banner in detail view */}
                        {selectedApptDetail.affectedByClosure && (
                          <View style={[s.closureCardBanner, { marginHorizontal: 0, marginBottom: verticalScale(14) }]}>
                            <View style={s.closureCardHeader}>
                              <Ionicons name="alert-circle-outline" size={14} color="#64748B" />
                              <Text style={s.closureCardTitle}>Affected by schedule closure</Text>
                            </View>
                            <Text style={s.closureCardReason}>
                              {selectedApptDetail.closureReason || 'The clinic schedule for this time has been closed.'}
                            </Text>
                            <Text style={s.closureCardSub}>
                              Please pick another date or time slot.
                            </Text>
                            <View style={s.closureCardBtnRow}>
                              <Tap
                                style={s.closureCardRescheduleBtn}
                                onPress={() => {
                                  const target = selectedApptDetail;
                                  setSelectedApptDetail(null);
                                  openReschedule(target);
                                }}
                              >
                                <Ionicons name="calendar-outline" size={15} color="#FFFFFF" />
                                <Text style={s.closureCardRescheduleTxt}>Reschedule</Text>
                              </Tap>
                            </View>
                          </View>
                        )}

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

                        {selectedApptDetail.previousDate ? (
                          <View style={[s.noteBox, { backgroundColor: C.navyFaint, marginTop: verticalScale(12) }]}>
                            <Ionicons name="swap-horizontal" size={16} color={C.navy} />
                            <Text style={[s.noteTxt, { color: C.navy, fontWeight: '700' }]}>
                              Rescheduled from: {displayKey(selectedApptDetail.previousDate)} · {selectedApptDetail.previousTime}
                            </Text>
                          </View>
                        ) : null}

                        {selectedApptDetail.status === 'cancelled' ? (
                          <View style={[s.noteBox, { flexDirection: 'column', alignItems: 'stretch', gap: verticalScale(4), backgroundColor: '#FEF2F2', borderColor: '#FCA5A5', borderWidth: 1, marginTop: verticalScale(12) }]}>
                            <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(6) }}>
                              <Ionicons name="close-circle" size={16} color="#DC2626" />
                              <Text style={{ flexShrink: 1, fontSize: moderateScale(12), fontWeight: '800', color: '#991B1B' }}>
                                {selectedApptDetail.cancelledBy === 'patient' ? 'Cancelled by patient' : selectedApptDetail.declineReason ? 'Declined by clinic' : 'Cancelled'}
                              </Text>
                            </View>
                            {(selectedApptDetail.declineReason || selectedApptDetail.cancellationReason) ? (
                              <Text style={{ width: '100%', flexShrink: 1, fontSize: moderateScale(13), color: '#7F1D1D', fontWeight: '600', lineHeight: moderateScale(18) }}>
                                {selectedApptDetail.declineReason || selectedApptDetail.cancellationReason}
                              </Text>
                            ) : null}
                            {selectedApptDetail.cancelledAt ? (
                              <Text style={{ fontSize: moderateScale(11), color: '#991B1B', marginTop: verticalScale(2) }}>
                                Time cancelled: {new Date(selectedApptDetail.cancelledAt).toLocaleString()}
                              </Text>
                            ) : null}
                          </View>
                        ) : selectedApptDetail.cancellationReason ? (
                          <View style={[s.noteBox, { backgroundColor: C.orangeFaint, marginTop: verticalScale(12) }]}>
                            <Ionicons name="alert-circle-outline" size={16} color={C.orange} />
                            <Text style={[s.noteTxt, { color: C.orange }]}>
                              Cancellation Reason: {selectedApptDetail.cancellationReason}
                            </Text>
                          </View>
                        ) : null}

                        {selectedApptDetail.notes ? (
                          <View style={[s.noteBox, s.patientNoteBox, { marginTop: verticalScale(12) }]}>
                            <Ionicons name="create-outline" size={16} color={C.slate} />
                            <View style={{ flex: 1, minWidth: 0 }}>
                              <Text style={s.patientNoteLbl}>Your note</Text>
                              <Text style={s.patientNoteTxt}>{selectedApptDetail.notes}</Text>
                            </View>
                          </View>
                        ) : null}

                        {selectedApptDetail.note ? (
                          <View style={[s.noteBox, { marginTop: verticalScale(12) }]}>
                            <Ionicons name="chatbubble-ellipses-outline" size={16} color={C.navy} />
                            <Text style={s.noteTxt}>Clinic Note: {selectedApptDetail.note}</Text>
                          </View>
                        ) : null}
                      </ScrollView>

                      {((selectedApptDetail.status === 'pending' || selectedApptDetail.status === 'confirmed' || selectedApptDetail.status === 'accepted') && selectedApptDetail.date >= todayKey) ? (
                        <View style={sm.footer}>
                          <Tap
                            style={sm.secondaryBtn}
                            activeOpacity={0.85}
                            accessibilityRole="button"
                            onPress={() => openReschedule(selectedApptDetail)}
                          >
                            <Ionicons name="calendar-outline" size={14} color={C.navy} style={{ marginRight: scale(4) }} />
                            <Text style={sm.secondaryTxt}>Reschedule</Text>
                          </Tap>
                          {!selectedApptDetail.affectedByClosure && (
                            <Tap
                              style={[sm.confirmBtn, { flex: 1, backgroundColor: C.navy }]}
                              activeOpacity={0.85}
                              accessibilityRole="button"
                              onPress={() => openCancelModal(selectedApptDetail)}
                            >
                              <Ionicons name="close-circle-outline" size={14} color={C.white} style={{ marginRight: scale(4) }} />
                              <Text style={sm.confirmTxt}>Cancel Appointment</Text>
                            </Tap>
                          )}
                        </View>
                      ) : (
                        <View style={sm.footer}>
                          <Tap style={[sm.cancelBtn, { flex: 1 }]} onPress={() => setSelectedApptDetail(null)}>
                            <Text style={sm.cancelTxt}>Close</Text>
                          </Tap>
                        </View>
                      )}
                    </>
                  )}
                </View>
              </TouchableWithoutFeedback>
            </Animated.View>
          </TouchableWithoutFeedback>
        </KeyboardAvoidingView>
      </Modal>

      {/* ══ CANCEL CONFIRMATION MODAL ═════════════════════════════════════════ */}
      <Modal visible={!!cancellingAppt} transparent animationType="fade" statusBarTranslucent onRequestClose={() => setCancellingAppt(null)}>
        <TouchableWithoutFeedback onPress={() => setCancellingAppt(null)}>
          <View style={sm.overlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={[sm.card, { maxWidth: scale(380) }]}>
                <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={sm.headerTitle}>Cancel this appointment?</Text>
                    {cancellingAppt && (
                      <Text style={sm.headerSub}>{displayKey(cancellingAppt.date)} · {cancellingAppt.time}</Text>
                    )}
                  </View>
                  <Tap onPress={() => setCancellingAppt(null)} style={sm.closeBtn}>
                    <Ionicons name="close" size={20} color={C.white}/>
                  </Tap>
                </LinearGradient>

                <View style={sm.body}>
                  <Text style={{ fontSize: moderateScale(14), color: C.charcoal, fontWeight: '600', lineHeight: moderateScale(20), marginBottom: verticalScale(14) }}>
                    Cancel this appointment? Your time slot will be freed immediately and another patient can book it.
                  </Text>

                  <Text style={{ fontSize: moderateScale(12), fontWeight: '700', color: C.slate, marginBottom: verticalScale(6) }}>
                    Reason for cancellation (optional):
                  </Text>
                  <TextInput
                    style={[df.input, df.inputMulti, { minHeight: verticalScale(70) }]}
                    placeholder="e.g. Schedule conflict, feeling better..."
                    placeholderTextColor={C.muted}
                    multiline
                    numberOfLines={3}
                    maxLength={300}
                    value={cancelReasonInput}
                    onChangeText={setCancelReasonInput}
                  />
                  <Text style={{ fontSize: moderateScale(11), color: C.muted, textAlign: 'right', marginTop: verticalScale(4) }}>
                    {cancelReasonInput.length}/300
                  </Text>
                </View>

                <View style={sm.footer}>
                  <Tap
                    style={[sm.cancelBtn, { flex: 1 }]}
                    onPress={() => setCancellingAppt(null)}
                    disabled={submittingCancellation}
                  >
                    <Text style={sm.cancelTxt}>Keep appointment</Text>
                  </Tap>
                  <Tap
                    style={[sm.confirmBtn, { flex: 1, backgroundColor: '#DC2626' }, submittingCancellation && { opacity: 0.6 }]}
                    onPress={handleDirectCancel}
                    disabled={submittingCancellation}
                  >
                    {submittingCancellation ? (
                      <ActivityIndicator color={C.white} size="small" />
                    ) : (
                      <Text style={sm.confirmTxt}>Cancel appointment</Text>
                    )}
                  </Tap>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>

      {/* ══ RESCHEDULE MODAL ═════════════════════════════════════════════════ */}
      <Modal
        visible={!!reschedulingAppt}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => {
          if (rescheduleStep !== 'calendar' || rescheduleDate) {
            showAlert({
              type: 'warning',
              title: 'Discard Reschedule?',
              message: 'Are you sure you want to exit without saving your new appointment time?',
              primaryButtonText: 'Discard',
              onPrimaryPress: () => {
                hideAlert();
                setReschedulingAppt(null);
              },
              secondaryButtonText: 'Keep Editing',
              onSecondaryPress: hideAlert,
            });
          } else {
            setReschedulingAppt(null);
          }
        }}
      >
        <TouchableWithoutFeedback
          onPress={() => {
            if (rescheduleStep !== 'calendar' || rescheduleDate) {
              showAlert({
                type: 'warning',
                title: 'Discard Reschedule?',
                message: 'Are you sure you want to exit without saving your new appointment time?',
                primaryButtonText: 'Discard',
                onPrimaryPress: () => {
                  hideAlert();
                  setReschedulingAppt(null);
                },
                secondaryButtonText: 'Keep Editing',
                onSecondaryPress: hideAlert,
              });
            } else {
              setReschedulingAppt(null);
            }
          }}
        >
          <View style={sm.overlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={[sm.card, { maxHeight: '90%' }]}>
                {/* Header */}
                <LinearGradient colors={[C.navy, C.charcoal]} style={sm.header}>
                  <View style={{ flex: 1 }}>
                    <Text style={sm.headerTitle}>
                      {rescheduleStep === 'calendar' ? 'Reschedule Appointment' : rescheduleStep === 'slots' ? 'Pick a New Time' : 'Confirm Reschedule'}
                    </Text>
                    <Text style={sm.headerSub}>
                      {rescheduleStep === 'calendar' ? 'Select a new weekend date' : rescheduleStep === 'slots' ? (rescheduleDate ? displayKey(rescheduleDate) : '') : 'Review and confirm changes'}
                    </Text>
                  </View>
                  <Tap onPress={() => setReschedulingAppt(null)} style={sm.closeBtn}>
                    <Ionicons name="close" size={20} color={C.white}/>
                  </Tap>
                </LinearGradient>

                {/* Body depends on step */}
                {rescheduleStep === 'calendar' && (
                  <View style={sm.body}>
                    {/* Month Header */}
                    <View style={s.calHeader}>
                      <Tap
                        onPress={() => {
                          const isCurrent = rescheduleYear === now.getFullYear() && rescheduleMonth === now.getMonth();
                          if (isCurrent) return;
                          if (rescheduleMonth === 0) { setRescheduleYear(y => y - 1); setRescheduleMonth(11); }
                          else setRescheduleMonth(m => m - 1);
                        }}
                        style={[s.calNavBtn, (rescheduleYear === now.getFullYear() && rescheduleMonth === now.getMonth()) && s.calNavBtnOff]}
                        disabled={rescheduleYear === now.getFullYear() && rescheduleMonth === now.getMonth()}
                      >
                        <Ionicons name="chevron-back" size={18} color={(rescheduleYear === now.getFullYear() && rescheduleMonth === now.getMonth()) ? '#CBD5E1' : C.charcoal} />
                      </Tap>
                      <Text style={s.calMonthTxt}>
                        {MONTH_NAMES[rescheduleMonth]} {rescheduleYear}
                      </Text>
                      <Tap
                        onPress={() => {
                          if (rescheduleMonth === 11) { setRescheduleYear(y => y + 1); setRescheduleMonth(0); }
                          else setRescheduleMonth(m => m + 1);
                        }}
                        style={s.calNavBtn}
                      >
                        <Ionicons name="chevron-forward" size={18} color={C.charcoal} />
                      </Tap>
                    </View>

                    {/* Weekday labels */}
                    <View style={s.calWeekRow}>
                      {DAY_NAMES.map(d => (
                        <View key={d} style={s.calWeekCell}>
                          <Text style={s.calWeekTxt}>{d}</Text>
                        </View>
                      ))}
                    </View>

                    {/* Day Grid */}
                    <View style={s.calGrid}>
                      {(() => {
                        const rTotal = daysInMonth(rescheduleYear, rescheduleMonth);
                        const rStart = firstWeekday(rescheduleYear, rescheduleMonth);
                        const rCells: (number | null)[] = [
                          ...Array(rStart).fill(null),
                          ...Array.from({ length: rTotal }, (_, i) => i + 1),
                        ];
                        while (rCells.length % 7 !== 0) rCells.push(null);
                        const rWeeks: (number | null)[][] = [];
                        for (let i = 0; i < rCells.length; i += 7) {
                          rWeeks.push(rCells.slice(i, i + 7));
                        }

                        return rWeeks.map((week, wIdx) => (
                          <View key={`rw-${wIdx}`} style={s.calGridRow}>
                            {week.map((day, dIdx) => {
                              if (day === null) {
                                return <View key={`rempty-${wIdx}-${dIdx}`} style={s.calCell} />;
                              }
                              const key = toKey(rescheduleYear, rescheduleMonth, day);
                              const isWeekend = isWeekendDate(key);
                              const isPast = key < todayKey;
                              const isCurrentApptDate = reschedulingAppt?.date === key;
                              const cInfo = isWeekend ? getClosureForDate(key) : null;
                              const isClosedDay = cInfo?.type === 'day';
                              const isPartiallyClosed = cInfo?.type === 'slots';
                              const hoursTaken = rescheduleMonthSlotCounts[key] || 0;
                              const closedCount = isClosedDay ? TIME_SLOTS.length : (cInfo?.slots?.length || 0);
                              const isFull = isWeekend && !isClosedDay && !isCurrentApptDate && (hoursTaken + closedCount >= TIME_SLOTS.length);
                              const tappable = isWeekend && !isPast && (!isFull || isClosedDay);

                              return (
                                <Tap
                                  key={key}
                                  style={s.calCell}
                                  disabled={!tappable}
                                  onPress={() => {
                                    if (isClosedDay) {
                                      setClosureModal({
                                        visible: true,
                                        title: 'Appointments closed',
                                        dateStr: displayKey(key),
                                        reason: cInfo.closure.reason,
                                      });
                                    } else if (tappable && !isFull) {
                                      setRescheduleDate(key);
                                      setRescheduleStep('slots');
                                    }
                                  }}
                                >
                                  <View style={[
                                    s.calTile,
                                    isCurrentApptDate && { backgroundColor: C.navyFaint, borderColor: C.navy, borderWidth: 1.5 },
                                    tappable && !isCurrentApptDate && !isClosedDay && { borderColor: C.navy, borderWidth: 1 },
                                    isClosedDay && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', borderWidth: 1 },
                                  ]}>
                                    {isClosedDay && (
                                      <Ionicons name="lock-closed" size={10} color="#64748B" style={{ position: 'absolute', top: 3, right: 3 }} />
                                    )}
                                    {isPartiallyClosed && !isClosedDay && (
                                      <Ionicons name="lock-closed" size={8} color="#94A3B8" style={{ position: 'absolute', top: 3, right: 3 }} />
                                    )}
                                    <Text style={[
                                      s.calDayTxt,
                                      isPast && s.calDayPast,
                                      !isPast && !isWeekend && s.calDayNoSlot,
                                      tappable && !isClosedDay && s.calDayOpen,
                                      isFull && !isClosedDay && s.calDayFull,
                                      isClosedDay && { color: '#475569', fontWeight: '800' },
                                    ]}>
                                      {day}
                                    </Text>
                                  </View>
                                </Tap>
                              );
                            })}
                          </View>
                        ));
                      })()}
                    </View>

                    <View style={[s.legend, { marginTop: verticalScale(10), paddingTop: verticalScale(10) }]}>
                      <View style={s.legendItem}>
                        <View style={[s.calTile, { width: 14, height: 14, borderColor: C.navy, borderWidth: 1 }]} />
                        <Text style={{ fontSize: moderateScale(11), color: C.slate }}>Available</Text>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.calTile, { width: 14, height: 14, backgroundColor: '#F1F5F9', borderColor: '#CBD5E1', borderWidth: 1, justifyContent: 'center', alignItems: 'center' }]}>
                          <Ionicons name="lock-closed" size={8} color="#64748B" />
                        </View>
                        <Text style={{ fontSize: moderateScale(11), color: C.slate }}>Closed</Text>
                      </View>
                      <View style={s.legendItem}>
                        <View style={[s.calTile, { width: 14, height: 14, backgroundColor: C.navyFaint, borderColor: C.navy, borderWidth: 1 }]} />
                        <Text style={{ fontSize: moderateScale(11), color: C.slate }}>Current</Text>
                      </View>
                    </View>

                    <View style={[s.noteBox, { marginTop: verticalScale(10) }]}>
                      <Ionicons name="information-circle" size={16} color={C.shapeBlue}/>
                      <Text style={s.noteTxt}>Weekend slots only (Saturday & Sunday). Weekdays operate on walk-in basis.</Text>
                    </View>
                  </View>
                )}

                {rescheduleStep === 'slots' && (
                  <View style={sm.body}>
                    <View style={s.timeGrid}>
                      {TIME_SLOTS.map(time => {
                        const isCurrentSlot = reschedulingAppt?.date === rescheduleDate && reschedulingAppt?.time === time;
                        const isTaken = rescheduleTakenTimes.includes(time);
                        const cInfo = rescheduleDate ? getClosureForDate(rescheduleDate) : null;
                        const isClosed = Boolean(cInfo && (
                          cInfo.type === 'day' ||
                          (cInfo.type === 'slots' && (cInfo.slots || []).includes(time))
                        ));
                        const closureReason = cInfo?.closure?.reason || 'Clinic schedule closed';
                        const disabled = isTaken || isCurrentSlot;
                        const active = rescheduleTime === time;

                        return (
                          <Tap
                            key={time}
                            style={[
                              s.timeChip,
                              active && s.timeChipActive,
                              disabled && !isClosed && s.timeChipOff,
                              isClosed && { backgroundColor: '#F1F5F9', borderColor: '#CBD5E1' },
                              isCurrentSlot && { borderColor: C.navy, borderWidth: 1.5, backgroundColor: C.navyFaint },
                            ]}
                            disabled={isTaken}
                            onPress={() => {
                              if (isClosed) {
                                setClosureModal({
                                  visible: true,
                                  title: 'This time is closed',
                                  dateStr: `${displayKey(rescheduleDate || '')} · ${time}`,
                                  slots: [time],
                                  reason: closureReason,
                                });
                              } else if (!disabled) {
                                setRescheduleTime(time);
                              }
                            }}
                          >
                            {active && <LinearGradient colors={[C.navy, C.charcoal]} style={[StyleSheet.absoluteFill, { borderRadius: scale(14) }]}/>}
                            <Ionicons
                              name={active ? 'time' : isClosed ? 'lock-closed' : 'time-outline'}
                              size={12}
                              color={active ? C.white : isCurrentSlot ? C.navy : isClosed ? '#64748B' : disabled ? '#CBD5E1' : C.slate}
                            />
                            <Text
                              numberOfLines={1}
                              adjustsFontSizeToFit
                              minimumFontScale={0.7}
                              style={[
                                s.timeTxt,
                                { flexShrink: 1 },
                                active && { color: C.white, fontWeight: '800' },
                                disabled && !isCurrentSlot && !isClosed && { color: '#CBD5E1', textDecorationLine: 'line-through' },
                                isClosed && { color: '#475569', fontWeight: '700' },
                                isCurrentSlot && { color: C.navy, fontWeight: '700' },
                              ]}
                            >
                              {time}
                            </Text>
                            {isCurrentSlot ? (
                              <View style={sm.currentPill}>
                                <Text style={sm.currentPillTxt}>Current</Text>
                              </View>
                            ) : isClosed ? (
                              <View style={[s.fullPill, { backgroundColor: '#E2E8F0' }]}>
                                <Text style={[s.fullPillTxt, { color: '#92400E' }]}>Closed</Text>
                              </View>
                            ) : isTaken ? (
                              <View style={s.fullPill}>
                                <Text style={s.fullPillTxt}>Full</Text>
                              </View>
                            ) : null}
                          </Tap>
                        );
                      })}
                    </View>

                    <View style={sm.footer}>
                      <Tap style={sm.cancelBtn} onPress={() => setRescheduleStep('calendar')}>
                        <Text style={sm.cancelTxt}>Back</Text>
                      </Tap>
                      <Tap
                        style={[sm.confirmBtn, !rescheduleTime && { opacity: 0.4 }]}
                        disabled={!rescheduleTime}
                        onPress={() => setRescheduleStep('confirm')}
                      >
                        <Text style={sm.confirmTxt}>Next</Text>
                      </Tap>
                    </View>
                  </View>
                )}

                {rescheduleStep === 'confirm' && (
                  <ScrollView style={{ flexShrink: 1 }} contentContainerStyle={sm.body}>
                    <View style={s.summaryCard}>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: C.charcoal, marginBottom: verticalScale(10) }}>
                        {apptTypeLabel(reschedulingAppt?.type)}
                      </Text>

                      <View style={[s.summaryRow, { marginBottom: verticalScale(8) }]}>
                        <Ionicons name="time-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                        <Text style={{ flex: 1, fontSize: moderateScale(13), color: C.slate }}>
                          <Text style={{ fontWeight: '700' }}>Current Time: </Text>
                          {reschedulingAppt && displayKey(reschedulingAppt.date)} · {reschedulingAppt?.time}
                        </Text>
                      </View>

                      <View style={[s.summaryRow, { marginBottom: verticalScale(8) }]}>
                        <Ionicons name="calendar-outline" size={15} color={C.navy} style={{ marginRight: scale(8) }} />
                        <Text style={{ flex: 1, fontSize: moderateScale(13), color: C.navy, fontWeight: '700' }}>
                          <Text style={{ fontWeight: '800' }}>New Time: </Text>
                          {rescheduleDate && displayKey(rescheduleDate)} · {rescheduleTime}
                        </Text>
                      </View>

                      <View style={[s.summaryRow, { marginTop: verticalScale(4) }]}>
                        <Ionicons name="person-outline" size={15} color={C.slate} style={{ marginRight: scale(8) }} />
                        <Text style={{ flex: 1, fontSize: moderateScale(13), color: C.slate }}>
                          Patient: {reschedulingAppt?.name}
                        </Text>
                      </View>
                    </View>

                    <View style={{ marginTop: verticalScale(16) }}>
                      <Text style={{ fontSize: moderateScale(13), fontWeight: '700', color: C.charcoal, marginBottom: verticalScale(6) }}>
                        Notes (optional)
                      </Text>
                      <TextInput
                        style={[df.input, df.inputMulti, { minHeight: verticalScale(64) }]}
                        placeholder="Add any notes or reason for rescheduling..."
                        placeholderTextColor={C.muted}
                        multiline
                        numberOfLines={3}
                        maxLength={300}
                        value={rescheduleNotes}
                        onChangeText={setRescheduleNotes}
                      />
                      <Text style={{ fontSize: moderateScale(11), color: C.muted, textAlign: 'right', marginTop: verticalScale(4) }}>
                        {rescheduleNotes.length}/300
                      </Text>
                    </View>

                    <View style={sm.footer}>
                      <Tap style={sm.cancelBtn} onPress={() => setRescheduleStep('slots')} disabled={submittingReschedule}>
                        <Text style={sm.cancelTxt}>Back</Text>
                      </Tap>
                      <Tap
                        style={[sm.confirmBtn, { backgroundColor: C.navy }, submittingReschedule && { opacity: 0.6 }]}
                        onPress={handleSaveReschedule}
                        disabled={submittingReschedule}
                      >
                        {submittingReschedule ? (
                          <ActivityIndicator color={C.white} size="small" />
                        ) : (
                          <Text style={sm.confirmTxt}>Confirm & Save</Text>
                        )}
                      </Tap>
                    </View>
                  </ScrollView>
                )}
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
          onPress={() => router.navigate('/')}
        >
          <Ionicons name="home-outline" size={24} color="#64748B" />
          <Text style={nav.label}>Home</Text>
        </Tap>

        {/* Tab 2: Appointments */}
        <Tap
          style={nav.tab}
          activeOpacity={0.7}
        >
          <Ionicons name="calendar" size={24} color={C.red} />
          <Text style={[nav.label, nav.labelActive]}>Appointments</Text>
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

      {/* ══ SCHEDULE CLOSURE POPUP MODAL ═════════════════════════════════════ */}
      <Modal
        visible={!!closureModal}
        transparent
        animationType="fade"
        statusBarTranslucent
        onRequestClose={() => setClosureModal(null)}
      >
        <TouchableWithoutFeedback onPress={() => setClosureModal(null)}>
          <View style={sm.overlay}>
            <TouchableWithoutFeedback onPress={e => e.stopPropagation()}>
              <View style={[sm.card, { maxWidth: scale(340) }]}>
                {/* Header with lock icon */}
                <View style={{ paddingHorizontal: scale(18), paddingTop: verticalScale(18), paddingBottom: verticalScale(14), borderBottomWidth: 1, borderColor: '#F1F5F9', flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: scale(10), flex: 1 }}>
                    <View style={{ width: scale(36), height: scale(36), borderRadius: scale(10), backgroundColor: '#F1F5F9', alignItems: 'center', justifyContent: 'center' }}>
                      <Ionicons name="lock-closed-outline" size={18} color="#475569" />
                    </View>
                    <View style={{ flex: 1 }}>
                      <Text style={{ fontSize: moderateScale(15), fontWeight: '800', color: '#0F172A' }}>
                        {closureModal?.title || 'Appointments closed'}
                      </Text>
                      <Text style={{ fontSize: moderateScale(11), color: '#64748B', fontWeight: '600', marginTop: verticalScale(2) }}>
                        {closureModal?.dateStr}
                      </Text>
                    </View>
                  </View>
                  <Tap onPress={() => setClosureModal(null)} style={sm.closeBtn}>
                    <Ionicons name="close" size={18} color={C.slate} />
                  </Tap>
                </View>

                {/* Body: the clinic's reason, then what to do. Neutral colours;
                    the lock icon above is the only accent. */}
                <View style={{ padding: scale(18), paddingBottom: verticalScale(20), gap: verticalScale(10) }}>
                  <Text style={{ fontSize: moderateScale(13), color: '#334155', lineHeight: moderateScale(19) }}>
                    {closureModal?.reason}
                  </Text>
                  <Text style={{ fontSize: moderateScale(11.5), color: '#64748B', lineHeight: moderateScale(16) }}>
                    Please choose another date or time. Walk-ins are accepted <Text style={{ color: '#0F172A', fontWeight: '700' }}>Mon–Fri, 8 AM–5 PM</Text>.
                  </Text>
                </View>
              </View>
            </TouchableWithoutFeedback>
          </View>
        </TouchableWithoutFeedback>
      </Modal>
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
    paddingHorizontal: GUTTER,
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

  sectionLabel:    { flexDirection: 'row', alignItems: 'center', gap: scale(8), paddingHorizontal: GUTTER, marginBottom: verticalScale(14) },
  sectionAccent:   { width: scale(4), height: verticalScale(18), borderRadius: scale(2), backgroundColor: C.red },
  sectionLabelTxt: { fontSize: moderateScale(18), fontWeight: '900', color: C.charcoal, flex: 1, letterSpacing: -0.3 },
  countBadge:      { minWidth: scale(22), height: verticalScale(22), borderRadius: scale(7), justifyContent: 'center', alignItems: 'center', paddingHorizontal: scale(6) },
  countTxt:        { fontSize: moderateScale(11), fontWeight: '900' },

  section:   { paddingHorizontal: GUTTER, marginBottom: verticalScale(6) },
  rowBetween:{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: verticalScale(14) },
  rowGap:    { flexDirection: 'row', alignItems: 'center', gap: scale(7) },
  subHeading:{ fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },

  hint:    { flexDirection: 'row', alignItems: 'flex-start', gap: scale(10), marginHorizontal: GUTTER, marginVertical: verticalScale(12), paddingVertical: scale(14), paddingHorizontal: Math.max(14, scale(16)), backgroundColor: C.white, borderRadius: scale(14), borderWidth: 1, borderColor: C.border },
  hintTxt: { flex: 1, minWidth: 0, fontSize: moderateScale(12), lineHeight: moderateScale(18), color: C.slate, fontWeight: '500' },
  errorHint: { backgroundColor: C.navyFaint, borderColor: '#DBEAFE' },

  datePill:    { backgroundColor: C.navyFaint, paddingHorizontal: scale(10), paddingVertical: verticalScale(4), borderRadius: scale(10) },
  datePillTxt: { fontSize: moderateScale(11), fontWeight: '700', color: C.navy },

  calCard:      { backgroundColor: C.white, borderRadius: scale(24), padding: scale(18), shadowColor: C.shadow, shadowOffset: { width: 0, height: 4 }, shadowOpacity: 0.08, shadowRadius: 16, elevation: 8 },
  calHeader:    { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: verticalScale(18) },
  calNavBtn:    { width: scale(34), height: verticalScale(34), borderRadius: scale(10), backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center' },
  calNavBtnOff: { opacity: 0.45 },
  calMonthTxt:  { fontSize: moderateScale(16), fontWeight: '800', color: C.charcoal },
  calWeekRow:   { flexDirection: 'row', marginBottom: verticalScale(8) },
  calWeekCell:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  calWeekTxt:   { fontSize: moderateScale(10), fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.3 },
  calGrid:      { width: '100%' },
  calGridRow:   { flexDirection: 'row', marginBottom: verticalScale(3) },
  calCell:      { flex: 1, height: CELL, justifyContent: 'center', alignItems: 'center' },
  calTile:      { width: Math.min(CELL - 8, scale(38)), height: Math.min(CELL - 8, scale(38)), justifyContent: 'center', alignItems: 'center', borderRadius: scale(12) },
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

  timeGrid:     { flexDirection: 'row', flexWrap: 'wrap', justifyContent: 'space-between', rowGap: verticalScale(10) },
  timeChip:     { width: '48.5%', minHeight: verticalScale(48), flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(4), paddingHorizontal: scale(4), paddingVertical: verticalScale(10), borderRadius: scale(14), backgroundColor: C.white, borderWidth: 1.5, borderColor: C.border, overflow: 'hidden', shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 4, elevation: 2 },
  timeChipActive:{ borderColor: 'transparent', shadowOpacity: 0 },
  timeChipOff:  { backgroundColor: '#F8FAFC', borderColor: '#EEF2F7', shadowOpacity: 0, elevation: 0 },
  timeTxt:      { fontSize: moderateScale(11), fontWeight: '700', color: C.charcoal },
  fullPill:     { backgroundColor: '#F1F5F9', paddingHorizontal: scale(4), paddingVertical: verticalScale(2), borderRadius: scale(4), marginLeft: scale(2) },
  fullPillTxt:  { fontSize: moderateScale(8.5), fontWeight: '800', color: C.muted },

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

  // Centred empty/loading state: icon above one line of text, like the other tabs.
  emptyCard:    { backgroundColor: C.white, borderRadius: scale(16), paddingVertical: verticalScale(28), paddingHorizontal: scale(22), flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: verticalScale(8), shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  emptyCardTxt: { fontSize: moderateScale(13), color: C.muted, fontWeight: '600', textAlign: 'center' },

  apptCard:     { flexDirection: 'row', alignItems: 'center', backgroundColor: C.white, borderRadius: scale(18), padding: scale(14), marginBottom: verticalScale(10), shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4 },
  apptListCard: { backgroundColor: C.white, borderRadius: scale(18), overflow: 'hidden', shadowColor: C.shadow, shadowOffset: { width: 0, height: 2 }, shadowOpacity: 0.07, shadowRadius: 8, elevation: 4, marginBottom: verticalScale(10) },
  apptListItem: { flexDirection: 'row', alignItems: 'center', padding: scale(14) },
  apptListDivider: { height: 1, backgroundColor: C.border, marginLeft: scale(76), marginRight: scale(14) },
  apptDateBox:  { width: scale(48), height: verticalScale(54), borderRadius: scale(13), backgroundColor: C.redFaint, justifyContent: 'center', alignItems: 'center', marginRight: scale(14) },
  apptDateNum:  { fontSize: moderateScale(20), fontWeight: '900', color: C.red, lineHeight: moderateScale(22) },
  apptDateMon:  { fontSize: moderateScale(9), fontWeight: '700', color: C.red, textTransform: 'uppercase', letterSpacing: 0.3 },
  apptInfo:     { flex: 1, minWidth: 0 },
  apptHeaderRow:{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: scale(8), marginBottom: verticalScale(2) },
  apptType:     { fontSize: moderateScale(14), fontWeight: '800', color: C.charcoal },
  patientNoteBox: { backgroundColor: C.bg, borderColor: C.border },
  patientNoteLbl: { fontSize: moderateScale(11), fontWeight: '800', color: C.slate, textTransform: 'uppercase', letterSpacing: 0.4 },
  patientNoteTxt: { fontSize: moderateScale(13), color: C.charcoal, fontWeight: '500', lineHeight: moderateScale(19), marginTop: verticalScale(2) },
  apptInfoTitle:{ fontSize: moderateScale(13), fontWeight: '700', color: C.charcoal },
  apptInfoRow:  { flexDirection: 'row', alignItems: 'center', gap: scale(5), marginTop: verticalScale(4) },
  apptInfoSub:  { flexShrink: 1, fontSize: moderateScale(12), lineHeight: moderateScale(17), color: C.slate, fontWeight: '500' },
  apptRight:    { alignItems: 'flex-end', gap: scale(6) },

  adminNoteBox: { flexDirection: 'row', alignItems: 'flex-start', gap: scale(5), backgroundColor: C.redFaint, borderRadius: scale(8), padding: scale(6), marginTop: verticalScale(5) },
  adminNoteTxt: { flex: 1, fontSize: moderateScale(10), color: C.red, fontWeight: '600', lineHeight: moderateScale(14) },

  // Schedule closure banner on appointments
  // Quiet card: neutral surface and icon.
  closureCardBanner: {
    backgroundColor: '#F8FAFC',
    borderWidth: 1,
    borderColor: '#E2E8F0',
    borderRadius: scale(12),
    padding: scale(12),
    marginTop: verticalScale(8),
    marginHorizontal: scale(14),
    marginBottom: verticalScale(6),
  },
  closureCardHeader: { flexDirection: 'row', alignItems: 'center', gap: scale(6), marginBottom: verticalScale(4) },
  closureCardTitle:  { fontSize: moderateScale(12), fontWeight: '700', color: '#1E293B' },
  closureCardReason: { fontSize: moderateScale(12), fontWeight: '500', color: '#475569', marginBottom: verticalScale(4) },
  closureCardSub:    { fontSize: moderateScale(11), color: '#64748B', lineHeight: moderateScale(15), marginBottom: verticalScale(8) },
  closureCardBtnRow: { flexDirection: 'row', gap: scale(8) },
  closureCardRescheduleBtn: { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: C.navy, borderRadius: scale(10), paddingHorizontal: scale(16), paddingVertical: verticalScale(9) },
  closureCardRescheduleTxt: { fontSize: moderateScale(13), fontWeight: '700', color: '#FFFFFF' },

  // Clear, dedicated action button with 44dp+ tap target via hitSlop.
  cancelPill: { flexDirection: 'row', alignItems: 'center', gap: scale(4), paddingHorizontal: scale(10), paddingVertical: verticalScale(6), borderRadius: scale(8), borderWidth: 1, borderColor: C.border, backgroundColor: C.white, overflow: 'hidden', marginLeft: scale(10), alignSelf: 'center' },
  cancelPillTxt: { fontSize: moderateScale(11), fontWeight: '700', color: C.navy },
  deleteIconBtn: { width: scale(38), height: scale(38), alignItems: 'center', justifyContent: 'center', borderRadius: scale(10), borderWidth: 1, borderColor: C.border, backgroundColor: C.white, overflow: 'hidden', marginLeft: scale(10), alignSelf: 'center' },
  doneBadge:  { flexDirection: 'row', alignItems: 'center', gap: scale(4), backgroundColor: C.greenFaint, paddingHorizontal: scale(8), paddingVertical: verticalScale(4), borderRadius: scale(8) },
  doneTxt:    { fontSize: moderateScale(10), fontWeight: '800', color: C.green },
});

// ─── Patient Details Form styles ──────────────────────────────────────────────
const df = StyleSheet.create({
  overlay:     { flex: 1, backgroundColor: 'rgba(10,25,47,0.6)', justifyContent: 'flex-end' },
  // overflow hidden + radius: ripples stay inside the sheet's rounded corners.
  sheet:       { backgroundColor: C.white, borderTopLeftRadius: scale(28), borderTopRightRadius: scale(28), width: '100%', maxHeight: '94%', overflow: 'hidden' },
  grabber:     { alignSelf: 'center', width: scale(40), height: 4, borderRadius: 2, backgroundColor: '#CBD5E1', marginTop: verticalScale(8) },
  sheetHeader: { paddingTop: verticalScale(12), paddingBottom: verticalScale(4), paddingHorizontal: scale(20), flexDirection: 'row', alignItems: 'center', gap: scale(12) },
  sheetTitle:  { fontSize: moderateScale(19), fontWeight: '800', color: C.charcoal, letterSpacing: -0.3 },
  sheetSub:    { fontSize: moderateScale(12.5), color: C.muted, marginTop: verticalScale(2) },
  closeBtn:    { width: scale(40), height: scale(40), borderRadius: scale(20), backgroundColor: C.bg, justifyContent: 'center', alignItems: 'center', overflow: 'hidden' },

  aptSummary:      { flexDirection: 'row', alignItems: 'center', gap: scale(12), backgroundColor: C.navyFaint, marginHorizontal: scale(20), marginTop: verticalScale(12), marginBottom: verticalScale(4), paddingHorizontal: scale(14), paddingVertical: verticalScale(12), borderRadius: scale(16), borderWidth: 1, borderColor: 'rgba(26,48,82,0.12)' },
  aptSummaryIcon:  { width: scale(38), height: scale(38), borderRadius: scale(12), backgroundColor: C.white, alignItems: 'center', justifyContent: 'center' },
  aptSummaryLabel: { fontSize: moderateScale(11), fontWeight: '700', color: C.muted, textTransform: 'uppercase', letterSpacing: 0.4 },
  aptSummaryTxt:   { fontSize: moderateScale(14), fontWeight: '800', color: C.navy, marginTop: verticalScale(1) },

  formScroll:  { flexShrink: 1, paddingHorizontal: scale(20), paddingTop: verticalScale(8) },
  section:     { marginTop: verticalScale(14) },
  sectionLabel:{ fontSize: moderateScale(12), fontWeight: '800', color: C.slate, marginBottom: verticalScale(10), textTransform: 'uppercase', letterSpacing: 0.4 },
  row:         { flexDirection: 'row', gap: scale(12) },
  fieldWrap:   { marginBottom: verticalScale(14) },
  label:       { fontSize: moderateScale(12.5), fontWeight: '700', color: C.slate, marginBottom: verticalScale(6) },
  required:    { color: C.red },
  input:       { backgroundColor: C.bg, borderWidth: 1.5, borderColor: C.border, borderRadius: scale(13), paddingHorizontal: scale(14), minHeight: verticalScale(48), paddingVertical: verticalScale(10), fontSize: moderateScale(15), color: C.charcoal, fontWeight: '500' },
  inputMulti:  { minHeight: verticalScale(64), textAlignVertical: 'top', paddingTop: verticalScale(12) },
  noteInput:   { minHeight: verticalScale(96), maxHeight: verticalScale(180) },
  optional:    { color: C.muted, fontWeight: '600', textTransform: 'none', letterSpacing: 0 },
  counter:     { alignSelf: 'flex-end', fontSize: moderateScale(11), color: C.muted, fontWeight: '600', marginTop: verticalScale(5) },
  inputError:  { borderColor: C.danger, backgroundColor: C.dangerFaint },
  errorTxt:    { fontSize: moderateScale(11.5), color: C.danger, fontWeight: '600', marginTop: verticalScale(5) },

  option:          { flexDirection: 'row', alignItems: 'center', gap: scale(12), minHeight: verticalScale(56), paddingHorizontal: scale(12), paddingVertical: verticalScale(8), borderRadius: scale(14), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.white, overflow: 'hidden' },
  optionActive:    { borderColor: C.navy, backgroundColor: C.navyFaint },
  optionIcon:      { width: scale(34), height: scale(34), borderRadius: scale(10), backgroundColor: C.navyFaint, alignItems: 'center', justifyContent: 'center' },
  optionIconActive:{ backgroundColor: C.navy },
  optionLabel:     { fontSize: moderateScale(14), fontWeight: '700', color: C.charcoal },
  optionDesc:      { fontSize: moderateScale(11.5), color: C.muted, marginTop: verticalScale(1) },

  genderRow:      { flexDirection: 'row', gap: scale(8) },
  genderChip:     { flex: 1, minHeight: verticalScale(48), borderRadius: scale(13), borderWidth: 1.5, borderColor: C.border, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', overflow: 'hidden' },
  genderChipActive:{ borderColor: C.navy, backgroundColor: C.navyFaint },
  genderTxt:      { fontSize: moderateScale(14), fontWeight: '600', color: C.slate },
  genderTxtActive:{ color: C.navy, fontWeight: '800' },

  footer:     { flexDirection: 'row', gap: scale(12), paddingHorizontal: scale(20), paddingVertical: verticalScale(12), borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.white },
  cancelBtn:  { flex: 1, minHeight: verticalScale(50), borderRadius: scale(14), alignItems: 'center', justifyContent: 'center', borderWidth: 1.5, borderColor: '#CBD5E1', backgroundColor: C.white, overflow: 'hidden' },
  cancelTxt:  { fontSize: moderateScale(14), fontWeight: '700', color: C.slate },
  submitBtn:  { flex: 2, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: scale(8), minHeight: verticalScale(50), borderRadius: scale(14), backgroundColor: C.navy, overflow: 'hidden' },
  submitTxt:  { fontSize: moderateScale(14), fontWeight: '800', color: C.white },
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
  label: { fontSize: moderateScale(10), color: '#64748B', marginTop: verticalScale(3), fontWeight: '600' },
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
  secondaryBtn: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', paddingVertical: verticalScale(12), borderRadius: scale(12), borderWidth: 1.5, borderColor: C.navy, backgroundColor: C.white },
  secondaryTxt: { fontSize: moderateScale(13), fontWeight: '800', color: C.navy },
  currentPill: { backgroundColor: '#E2E8F0', paddingHorizontal: scale(4), paddingVertical: verticalScale(2), borderRadius: scale(4), marginLeft: scale(2) },
  currentPillTxt: { fontSize: moderateScale(8.5), fontWeight: '800', color: C.navy },
});
