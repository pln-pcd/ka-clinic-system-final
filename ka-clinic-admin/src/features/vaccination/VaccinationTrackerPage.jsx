// ka-clinic-admin/src/features/vaccination/VaccinationTrackerPage.jsx
import { collection, deleteField, doc, getDocs, limit, query, runTransaction, updateDoc, where } from 'firebase/firestore';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import StatusBadge from '../../components/StatusBadge';
import ConfirmDialog from '../../components/ConfirmDialog';
import { BTN } from '../../lib/buttons';
import IconButton from '../../components/IconButton';
import EmptyState from '../../components/EmptyState';
import { useTableReserve } from '../../components/Pager';
import {
  AlertCircle,
  AlertTriangle,
  Bell,
  Check,
  CheckCircle,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
  Clock,
  Pencil,
  FileText,
  RotateCcw,
  Search,
  Users,
  X,
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import Toast from '../../components/Toast';
import { authedPostJson } from '../../lib/adminSession';
import { logActivity } from '../../lib/activityLog';
import { auth, db, listen } from '../../lib/firebase';
import { peekLiveCollection, useLiveCollection } from '../../lib/liveStore';
import { amountText, brandAvailability, formatVials, recordDoseChange, recordTreatmentChange, vialsOf, isRigEntry, isExpired, expiryOf } from '../../lib/inventoryStock';
import { isRigItem } from '../../lib/inventoryCategories';
import { erigStatus, isCategoryIII } from '../../lib/erig';
import DatePicker from '../../components/DatePicker';
import { formatDateShort as fmtDate, getName, getTodayDateString, serviceLabel, titleCaseWords } from '../../lib/formatters';
import { getEligibleVaccinesForService, buildDoses, getTodayStr, isOverdue } from '../../lib/doseSchedules';

import { SkeletonRows } from '../../components/Skeleton';
/* ─────────────────────────────────────────────────────────── */
/* HELPERS                                                     */
/* ─────────────────────────────────────────────────────────── */
// A completed patient's incident pins leave the Incident Map, silently; the
// incident records themselves stay. Pins are linked through the patient's
// incidentIds (written when staff pin from the patient record) so the pin
// documents carry no patient identifiers. Un-doing the final dose puts them
// back. The nightly archive sweep re-applies the hide as a safety net.
async function syncIncidentPinsForCompletion(patient, completed) {
  const ids = Array.isArray(patient?.incidentIds) ? patient.incidentIds : [];
  await Promise.all(ids.map(id =>
    updateDoc(
      doc(db, 'incidents', id),
      completed
        ? { mapHidden: true, mapHiddenReason: 'patient-completed' }
        : { mapHidden: false, mapHiddenReason: deleteField() }
    ).catch(err => console.warn(`Could not update map visibility for incident ${id}:`, err))
  ));
}
// Category III products and how each finds its Inventory item: the exact
// name first, else a whole-word match (so "TT" never matches inside another
// name, and TIG / ATS never land on the ERIG item).
export const CAT3_TREATMENTS = [
  { id: 'cat3_rig', name: 'RIG (Equirab ERIG)', match: /\bequirab\b|\berig\b|\brig\b|rabies immunoglobulin/i },
  { id: 'cat3_tt', name: 'Tetanus Toxoid (TT)', match: /tetanus toxoid|\btt\b/i },
  { id: 'cat3_ats', name: 'Anti-Tetanus Serum (ATS 1500 IU)', match: /\bats\b|anti-?tetanus serum/i },
  { id: 'cat3_tig', name: 'Tetanus Immunoglobulin (TIG 250 IU)', match: /\btig\b|tetanus immunoglobulin/i },
];
export const ANTI_TETANUS_PRODUCTS = CAT3_TREATMENTS.filter(t => t.id !== 'cat3_rig').map(t => t.name);

export const isTreatmentProduct = (name) => {
  return CAT3_TREATMENTS.some(t => t.name === name);
};

export const findMatchingInventoryItem = (name, items) => {
  if (!name || !Array.isArray(items)) return null;
  const exact = items.find(i => i.name && i.name.toLowerCase() === name.toLowerCase());
  if (exact) return exact;
  const tDef = CAT3_TREATMENTS.find(t => t.name === name);
  return tDef ? items.find(i => tDef.match.test(i.name || '')) || null : null;
};

const deriveStatus = (p) => {
  const doses = buildDoses(p);
  if (doses.length === 0) return 'in-progress';
  const doneCount = doses.filter(d => d.status === 'done').length;
  if (doneCount === doses.length) return 'completed';
  const hasOverdue = doses.some(d => d.status === 'miss' || (d.status === 'pending' && isOverdue(d.date)));
  if (hasOverdue) return 'overdue';
  return 'in-progress';
};

// What staff need to know about a record at a glance, used by the STATUS
// column, the status filter and the default sort:
//   overdue (with days late) → due-today → on-schedule → completed
const STATE_RANK = { overdue: 0, 'due-today': 1, 'on-schedule': 2, completed: 3 };
// Cached per record object and day: a snapshot keeps record identity, so the
// table, filter counts and sort work each row out once instead of many times.
const rowStateCache = new WeakMap();
const rowState = (p) => {
  const hit = rowStateCache.get(p);
  const day = getTodayStr();
  if (hit && hit.day === day) return hit.value;
  const value = computeRowState(p);
  rowStateCache.set(p, { day, value });
  return value;
};
const computeRowState = (p) => {
  if (deriveStatus(p) === 'completed') return { key: 'completed', days: 0 };
  const today = getTodayStr();
  const pending = buildDoses(p).filter(d => d.status !== 'done');
  const late = pending.filter(d => (d.date || '').slice(0, 10) < today);
  if (late.length) {
    const first = late.map(d => d.date.slice(0, 10)).sort()[0];
    const days = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${first}T00:00:00Z`)) / 86400000);
    return { key: 'overdue', days };
  }
  if ((pending[0]?.date || '').slice(0, 10) === today) return { key: 'due-today', days: 0 };
  return { key: 'on-schedule', days: 0 };
};
const stateBadge = (s) => (
  s.key === 'overdue' ? <StatusBadge tone="red" label={`Overdue · ${s.days}d`} size="md" />
    : s.key === 'due-today' ? <StatusBadge tone="amber" label="Due today" size="md" />
    : s.key === 'completed' ? <StatusBadge tone="green" label="Completed" size="md" />
    : <StatusBadge tone="blue" label="On schedule" size="md" />
);

/* ─────────────────────────────────────────────────────────── */
/* COMPONENT                                                   */
/* ── Cache for instant tab switching with zero loading lag ──── */
let cachedVaccinationPatients = null;

/* ─────────────────────────────────────────────────────────── */
export default function VaccinationTrackerPage({ selectedPatientId, onClearSelectedPatient, initialPatients = [] }) {
  const [patients,     setPatients]     = useState(() => {
    if (initialPatients && initialPatients.length > 0) return initialPatients;
    if (cachedVaccinationPatients && cachedVaccinationPatients.length > 0) return cachedVaccinationPatients;
    return [];
  });
  const [loading,      setLoading]      = useState(() => {
    return !(
      (initialPatients && initialPatients.length > 0) ||
      (cachedVaccinationPatients && cachedVaccinationPatients.length > 0)
    );
  });
  const [searchQuery,  setSearchQuery]  = useState('');
  const [searchFocused,setSearchFocused]= useState(false);
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage,  setCurrentPage]  = useState(1);
  const [detailPt,     setDetailPt]     = useState(null);
  // The dose waiting for "Undo" to be confirmed: { p, key, label, brand }.
  const [undoTarget, setUndoTarget] = useState(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [saving,       setSaving]       = useState({});
  const [assignedBrand, setAssignedBrand] = useState('');
  const [treatmentDate, setTreatmentDate] = useState(() => getTodayDateString());
  const itemsPerPage = 10;

  // The next dose ticked as READY (not saved until "Confirm dose").
  const [readyKey, setReadyKey] = useState(null);
  // A late dose: also move the later doses by the same delay (staff choice,
  // on by default, shown with the new dates before Confirm dose).
  const [shiftLater, setShiftLater] = useState(true);
  useEffect(() => { setShiftLater(true); }, [readyKey]);
  const [discardAsk, setDiscardAsk] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  // Latest reminder per patient: undefined = not loaded, null = none.
  const [reminderCache, setReminderCache] = useState({});
  const reminderFetches = useRef(new Set());

  // Attending Nurse / Physician administering the dose
  const [attendingStaff, setAttendingStaff] = useState(() => auth.currentUser?.displayName || '');

  // Category III treatments (RIG and Anti-Tetanus): 1 vial each
  const [rigDraftOpen, setRigDraftOpen] = useState(false);
  // The RIG product given: an Inventory item in the RIG category. No default.
  const [rigItemId, setRigItemId] = useState('');
  const [rigDate, setRigDate] = useState(() => getTodayDateString());
  const [rigBusy, setRigBusy] = useState(false);

  const [tetanusDraftOpen, setTetanusDraftOpen] = useState(false);
  const [tetanusProduct, setTetanusProduct] = useState('');
  const [tetanusDate, setTetanusDate] = useState(() => getTodayDateString());
  const [tetanusBusy, setTetanusBusy] = useState(false);

  const [treatmentBusy, setTreatmentBusy] = useState(false);
  const [treatmentRemoveAsk, setTreatmentRemoveAsk] = useState(null);

  const closeModal = () => {
    setDetailPt(null);
    setAssignedBrand('');
    setAttendingStaff(auth.currentUser?.displayName || '');
    setReadyKey(null);
    setRigDraftOpen(false);
    setRigItemId('');
    setRigDate(getTodayDateString());
    setTetanusDraftOpen(false);
    setTetanusProduct('');
    setTetanusDate(getTodayDateString());
    autoOpenedRef.current = null;
    if (onClearSelectedPatient) onClearSelectedPatient();
  };

  // Closing with a ready-but-unconfirmed dose (or unsaved entries) asks first.
  const requestCloseModal = () => {
    if (readyKey || rigDraftOpen || tetanusDraftOpen) setDiscardAsk(true);
    else closeModal();
  };

  // Latest reminder (manual follow-up or automatic) per patient: when it
  // went out, by which channel, and whether it was acknowledged. Fetched on
  // row hover/click so the popup opens with it already in memory, then kept
  // live while the popup is open. Sorted here, so no composite index.
  const pickLatest = (snap) => snap.docs.map(d => ({ id: d.id, ...d.data() }))
    .sort((x, y) => (y.createdAt || 0) - (x.createdAt || 0))[0] || null;
  const prefetchReminder = (id) => {
    if (!id || reminderFetches.current.has(id)) return;
    reminderFetches.current.add(id);
    getDocs(query(collection(db, 'patientNotifications'), where('patientId', '==', id)))
      .then(snap => setReminderCache(c => ({ ...c, [id]: pickLatest(snap) })))
      .catch(() => setReminderCache(c => ({ ...c, [id]: null })));
  };
  const detailId = detailPt?.firestoreId || null;
  useEffect(() => {
    setReadyKey(null);
    if (!detailId) return undefined;
    prefetchReminder(detailId);
    const q = query(collection(db, 'patientNotifications'), where('patientId', '==', detailId));
    return listen(q, snap => setReminderCache(c => ({ ...c, [detailId]: pickLatest(snap) })), () => {});
  }, [detailId]);

  // Auto-select patient when opened from Overdue Dose Tracker or direct link
  const autoOpenedRef = useRef(null);
  useEffect(() => {
    if (selectedPatientId && patients.length > 0) {
      if (autoOpenedRef.current !== selectedPatientId) {
        const match = patients.find(p =>
          p.firestoreId === selectedPatientId ||
          p.id === selectedPatientId ||
          (p.name && p.name.toLowerCase() === String(selectedPatientId).toLowerCase()) ||
          getName(p).toLowerCase().includes(String(selectedPatientId).toLowerCase())
        );
        if (match) {
          autoOpenedRef.current = selectedPatientId;
          setDetailPt(match);
          setAssignedBrand('');
        }
      }
    } else {
      autoOpenedRef.current = null;
    }
  }, [selectedPatientId, patients]);

  // Filter and Sort — two independent dropdowns (filter was previously a
  // segmented tab row; converted to a dropdown to match the pattern used on
  // the Patient Records page).
  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const [sortBy, setSortBy] = useState('overdue_first');
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);
  // Dose reminders are sent by the daily server-side sweep
  // (/api/notifications?action=dose-sweep, scheduled in vercel.json), which
  // covers both the day before and the day of. This page used to run that
  // job itself in a useEffect, so reminders only went out when a staff member
  // happened to have the tracker open — and never a day ahead.


  const FILTER_OPTIONS = [
    { key: 'all', label: 'All Records' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'today', label: 'Due today' },
    { key: 'on-schedule', label: 'On schedule' },
    { key: 'completed', label: 'Completed' },
    { key: 'prep', label: 'PrEP' },
    { key: 'pep', label: 'PEP' },
    { key: 'tetanus', label: 'Anti-Tetanus' },
    { key: 'pneumonia', label: 'Pneumonia Vaccine' },
  ];
  const SORT_OPTIONS = [
    { key: 'overdue_first', label: 'Status (Overdue first)' },
    { key: 'newest', label: 'Registered (Newest)' },
    { key: 'oldest', label: 'Registered (Oldest)' },
    { key: 'name_asc', label: 'Name (A–Z)' },
    { key: 'progress_desc', label: 'Dose Progress (Highest)' },
  ];

  // Sync if dashboard passes updated patient list
  useEffect(() => {
    if (initialPatients && initialPatients.length > 0) {
      setPatients(initialPatients);
      cachedVaccinationPatients = initialPatients;
      setLoading(false);
    }
  }, [initialPatients]);

  // Without a list from the dashboard, read the shared live collection
  // (lib/liveStore.js) instead of opening a second listener on vaccinations.
  const vaxLive = useLiveCollection('vaccinations');
  const hasInitialPatients = !!(initialPatients && initialPatients.length > 0);
  useEffect(() => {
    if (hasInitialPatients || !vaxLive.loaded) return;
    const data = vaxLive.rows;
    cachedVaccinationPatients = data;
    setPatients(data);
    setDetailPt(prev => {
      if (!prev) return null;
      const targetId = prev.firestoreId || prev.id;
      const updated = data.find(p => (p.firestoreId && p.firestoreId === targetId) || (p.id && p.id === targetId));
      return updated || prev;
    });
    setLoading(false);
  }, [vaxLive, hasInitialPatients]);

  const [toast, setToast] = useState({ msg: '', type: '' });
  const [inventoryItems, setInventoryItems] = useState(() => peekLiveCollection('inventory').rows);
  // Doses with a save in progress. A second click on the same dose before
  // the first save finishes is ignored, so it cannot deduct twice.
  const dosesInFlight = useRef(new Set());
  const [sendingFollowup, setSendingFollowup] = useState({});

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  const handleSendFollowup = async (p, e) => {
    if (e) e.stopPropagation();
    if (sendingFollowup[p.firestoreId]) return;
    const name = getName(p);
    const doses = buildDoses(p);
    const next = doses.find(d => d.status === 'pending' || d.status === 'miss');
    const todayStr = getTodayStr();
    const overdue = next && next.date && next.date < todayStr;
    const doseLabel = next ? next.label : 'Upcoming dose';
    const dueDate = next ? fmtDate(next.date) : 'soon';
    const vaccineType = p.treatmentType || p.service || p.vaccineName || 'Anti-Rabies';

    setSendingFollowup(prev => ({ ...prev, [p.firestoreId]: true }));
    try {
      const res = await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId: p.firestoreId,
        title: overdue ? 'Missed vaccination dose reminder' : 'Vaccination follow-up reminder',
        message: overdue
          ? `Reminder for ${name}: ${doseLabel} (${vaccineType}) was scheduled for ${dueDate}. Please visit K&A Clinic as soon as possible.`
          : `Reminder for ${name}: ${doseLabel} (${vaccineType}) is scheduled for ${dueDate}. Please visit K&A Clinic on time.`,
        doseLabel,
        dueDate,
        vaccineType,
        source: 'manual',
      });

      if (!res?.success) {
        showToast(res?.error || 'Failed to send follow-up reminder.', 'error');
        return;
      }

      if (res?.hasEmail && !res.emailed && !res.pushSent) {
        showToast(res.emailError || 'Failed to deliver follow-up email.', 'error');
        return;
      }

      const updatedNotified = Array.from(new Set([...(p.notifiedDoses || []), next?.key || 'manual']));
      await updateDoc(doc(db, 'vaccinations', p.firestoreId), {
        notifiedDoses: updatedNotified,
        lastFollowupSentAt: new Date().toISOString(),
      });
      logActivity({ action: 'notification.send', collection: 'patientNotifications', mrn: p.firestoreId, docId: p.firestoreId,
        summary: `Sent a ${overdue ? 'missed-dose' : 'follow-up'} reminder for ${doseLabel} to MRN ${p.firestoreId}` });

      const channels = [];
      if (res.pushSent > 0) channels.push('app');
      if (res.emailed) channels.push('email');
      showToast(`Follow-up reminder sent to ${name}${channels.length ? ` via ${channels.join(' and ')}` : ''}!`, 'success');
    } catch (err) {
      console.error('Manual follow-up error:', err);
      showToast(err?.message || 'Failed to send follow-up reminder.', 'error');
    } finally {
      setSendingFollowup(prev => ({ ...prev, [p.firestoreId]: false }));
    }
  };

  // Listen to inventory for brand dropdown and stock tracking
  const invLive = useLiveCollection('inventory');
  useEffect(() => { setInventoryItems(invLive.rows); }, [invLive]);

  // Update vaccine brand for patient (fallback/convenience)
  const handleAssignBrand = async (p, brandName) => {
    setPatients(prev => prev.map(x => x.firestoreId === p.firestoreId ? { ...x, vaccineBrand: brandName } : x));
    if (detailPt && detailPt.firestoreId === p.firestoreId) {
      setDetailPt(prev => ({ ...prev, vaccineBrand: brandName }));
    }
    try {
      await updateDoc(doc(db, 'vaccinations', p.firestoreId), { vaccineBrand: brandName });
      logActivity({ action: 'case.update', collection: 'vaccinations', docId: p.firestoreId, mrn: p.firestoreId,
        summary: `Set vaccine brand for MRN ${p.firestoreId}`, changes: [{ field: 'vaccineBrand', before: p.vaccineBrand || null, after: brandName || null }] });
      showToast(`Vaccine brand updated to "${brandName || 'None'}"`, 'success');
    } catch (err) {
      console.error('Failed to update vaccine brand:', err);
      showToast('Failed to update vaccine brand', 'error');
    }
  };

  /* ── Mark / unmark a dose with strict sequential rules & instant response ── */
  const cycleStatus = async (p, doseKey, brandOverride = '') => {
    const lockKey = `${p.firestoreId}:${doseKey}`;
    if (dosesInFlight.current.has(lockKey)) return;
    dosesInFlight.current.add(lockKey);
    try {
      await cycleStatusUnlocked(p, doseKey, brandOverride);
    } finally {
      dosesInFlight.current.delete(lockKey);
    }
  };

  // Finds the inventory item a brand name refers to (doses record the item's
  // name as their brand). Uses the live inventory list, then Firestore.
  const findInventoryItemId = async (name) => {
    if (!name) return null;
    const local = inventoryItems.find(i => i.name === name);
    if (local) return local.id;
    const snap = await getDocs(query(collection(db, 'inventory'), where('name', '==', name), limit(1)));
    return snap.empty ? null : snap.docs[0].id;
  };

  const cycleStatusUnlocked = async (p, doseKey, brandOverride = '') => {
    const currentPatients = patients;
    const fresh = currentPatients.find(x => x.firestoreId === p.firestoreId) || p;
    const doses = buildDoses(fresh);
    const di = doses.findIndex(d => d.key === doseKey);
    if (di === -1) return;

    const cur = doses[di];
    const prevStatus = cur.status;
    const isCurrentlyDone = prevStatus === 'done';
    const brandToUse = brandOverride || assignedBrand;

    // ── STRICT SEQUENTIAL DOSE ENFORCEMENT & VACCINE BRAND CHECK ──
    if (!isCurrentlyDone) {
      // The nurse must enter attending staff name before giving dose
      if (!attendingStaff.trim()) {
        showToast('Please enter the Attending Nurse / Physician name first before checking.', 'warning');
        return;
      }

      // The nurse cannot check if they still haven't chosen the vaccine brand
      if (!brandToUse) {
        showToast(`Please select an assigned Vaccine Brand for ${cur.label} first before checking.`, 'warning');
        return;
      }

      // A dose cannot be given before its scheduled date.
      if ((cur.date || '').slice(0, 10) > getTodayStr()) {
        showToast(`${cur.label} is not due yet. It can be given from ${fmtDate(cur.date)}.`, 'warning');
        return;
      }

      // User wants to check Dose di -> ALL previous doses (0 .. di - 1) MUST be 'done'
      for (let k = 0; k < di; k++) {
        if (doses[k].status !== 'done') {
          showToast(`Dose ${k + 1} (${doses[k].label}) must be completed before checking Dose ${di + 1} (${cur.label}).`, 'error');
          return;
        }
      }
    } else {
      // User wants to uncheck Dose di -> ALL subsequent doses (di + 1 .. len - 1) MUST NOT be 'done'
      for (let k = di + 1; k < doses.length; k++) {
        if (doses[k].status === 'done') {
          showToast(`Please uncheck later doses (${doses[k].label}) first.`, 'error');
          return;
        }
      }
    }

    const nextStatus = isCurrentlyDone ? 'pending' : 'done';

    // Which inventory item this change moves stock on.
    const storedCur = Array.isArray(fresh.doses) ? fresh.doses[di] : null;
    let stockItemId = null;
    try {
      stockItemId = nextStatus === 'done'
        ? await findInventoryItemId(brandToUse)
        : (storedCur?.stockDeducted === false ? null : (storedCur?.stockItemId || await findInventoryItemId(cur.brand || fresh.vaccineBrand)));
    } catch (err) {
      console.error('Inventory lookup failed:', err);
    }
    if (nextStatus === 'done' && stockItemId) {
      const item = inventoryItems.find(i => i.id === stockItemId);
      if (item && isExpired(item, getTodayStr())) {
        showToast(`${item.name} expired on ${expiryOf(item)} and cannot be used. Choose another brand.`, 'error');
        return;
      }
      if (item && vialsOf(item) < 1) {
        showToast(`${brandToUse} is out of stock in Inventory. Restock it or choose another brand.`, 'error');
        return;
      }
    }

    // The brand to associate with this dose: record brandToUse when done, clear when pending
    const updatedDoses = doses.map((d, idx) =>
      idx === di
        ? {
            ...d,
            status: nextStatus,
            s: nextStatus,
            brand: nextStatus === 'done' ? brandToUse : '',
            attendingName: nextStatus === 'done' ? attendingStaff.trim() : '',
            autoMissed: false,
          }
        : d
    );

    const doneCount  = updatedDoses.filter(d => d.status === 'done').length;
    const totalDoses = updatedDoses.length;
    const allDone    = doneCount === totalDoses;
    const newStatus  = allDone ? 'completed' : 'ongoing';
    const wasCompleted = doses.length > 0 && doses.every(d => d.status === 'done');
    const completedAt  = allDone ? (wasCompleted && fresh.completedAt ? fresh.completedAt : getTodayStr()) : null;

    // ── INSTANT OPTIMISTIC LOCAL UI UPDATE ──
    setPatients(prev =>
      prev.map(x =>
        x.firestoreId === p.firestoreId
          ? {
              ...x,
              doses: updatedDoses,
              status: newStatus,
              completedAt,
              dose: `${doneCount}/${totalDoses}`,
              vaccineBrand: nextStatus === 'done' ? brandToUse : (x.vaccineBrand || ''),
            }
          : x
      )
    );
    setDetailPt(prev =>
      prev && prev.firestoreId === p.firestoreId
        ? {
            ...prev,
            doses: updatedDoses,
            status: newStatus,
            completedAt,
            dose: `${doneCount}/${totalDoses}`,
            vaccineBrand: nextStatus === 'done' ? brandToUse : (prev.vaccineBrand || ''),
          }
        : prev
    );

    // Reset assignedBrand for next dose
    setAssignedBrand('');

    let outcome;
    try {
      outcome = await recordDoseChange({ runTransaction, doc, collection, deleteField }, db, {
        patientId: p.firestoreId,
        doseKey,
        give: nextStatus === 'done',
        brand: brandToUse,
        stockItemId,
        byUid: auth.currentUser?.uid || null,
        byName: auth.currentUser?.displayName || auth.currentUser?.email || '',
        attendingName: attendingStaff.trim(),
        readDoses: saved => buildDoses(saved),
        today: getTodayStr(),
        shiftLater,
      });
    } catch (err) {
      setPatients(prev => prev.map(x => (x.firestoreId === p.firestoreId ? fresh : x)));
      setDetailPt(prev => (prev && prev.firestoreId === p.firestoreId ? fresh : prev));
      if (err?.code === 'stale') showToast('This dose was just updated elsewhere. The list has been refreshed.', 'warning');
      else if (err?.code === 'out-of-stock') showToast(`${err.message} Restock it or choose another brand before recording this dose.`, 'error');
      else if (err?.code === 'expired') showToast(`${err.message} Choose another brand.`, 'error');
      else {
        console.error('cycleStatus error:', err);
        showToast('Could not save the dose. Nothing was changed. Please try again.', 'error');
      }
      return;
    }

    if (outcome.allDone !== outcome.wasDone) syncIncidentPinsForCompletion(fresh, outcome.allDone);

    // A dose given while stock was counted in mL took part of a vial.
    const mlEraUndo = nextStatus !== 'done' && storedCur?.ml != null && storedCur?.stockDeducted !== false;
    if (mlEraUndo) {
      showToast('Dose undone. It was recorded in mL, so no vial was returned; adjust the stock in Inventory if needed.', 'info');
    } else if (outcome.before === null || !outcome.moved) {
      showToast(nextStatus === 'done'
        ? `Dose saved. "${brandToUse}" is not in Inventory, so no stock was deducted.`
        : 'Dose undone. No stock was deducted for it, so none was restored.', nextStatus === 'done' ? 'warning' : 'info');
    } else if (nextStatus === 'done') {
      const moved = outcome.shifted > 0 ? ` The next ${outcome.shifted} dose${outcome.shifted === 1 ? '' : 's'} moved ${outcome.delay} day${outcome.delay === 1 ? '' : 's'} later.` : '';
      showToast(`Dose ${di + 1} saved. ${outcome.itemName}: ${outcome.before} → ${outcome.after} vials.${moved}`, 'success');
    } else {
      showToast(`Dose ${di + 1} undone. 1 vial returned to ${outcome.itemName} (${outcome.before} → ${outcome.after} vials).`, 'info');
    }
  };

  // Saves a RIG or Anti-Tetanus entry: takes 1 vial from the product's
  // Inventory item in one transaction with the record
  // (lib/inventoryStock.js recordTreatmentChange). The entry is its own
  // field on the record, never a dose, and nothing is ticked or saved for
  // the nurse. A second click while saving does nothing; the transaction
  // also refuses a second entry of the same kind.
  const treatmentInFlight = useRef(false);
  const saveTreatment = async (p, { kind, product, date, attendingName: attName = '', setBusy, onSaved, item: chosenItem = null }) => {
    if (treatmentInFlight.current) return;
    if (!product) { showToast(`Choose the ${kind} product first.`, 'error'); return; }
    const dateToUse = date || getTodayStr();
    if (dateToUse > getTodayStr()) { showToast(`The ${kind} date can't be in the future.`, 'error'); return; }
    const item = chosenItem || findMatchingInventoryItem(product, inventoryItems);
    if (item && isExpired(item, getTodayStr())) {
      showToast(`${item.name} expired on ${expiryOf(item)} and cannot be used. Nothing was saved.`, 'error');
      return;
    }
    if (item && vialsOf(item) < 1) {
      showToast(`${item.name} is out of stock in Inventory. Nothing was saved.`, 'error');
      return;
    }
    treatmentInFlight.current = true;
    setBusy(true);
    try {
      const out = await recordTreatmentChange({ runTransaction, doc, collection, deleteField }, db, {
        patientId: p.firestoreId,
        give: true,
        kind: kind === 'RIG' ? 'rig' : 'antiTetanus',
        today: getTodayStr(),
        product,
        stockItemId: item?.id || null,
        date: dateToUse,
        byUid: auth.currentUser?.uid || null,
        byName: auth.currentUser?.displayName || auth.currentUser?.email || '',
        attendingName: attName || attendingStaff.trim() || auth.currentUser?.displayName || '',
      });
      const entry = out.entry;
      const field = kind === 'RIG' ? 'rigTreatment' : 'antiTetanusTreatment';
      const apply = x => ({
        ...x,
        [field]: entry,
        ...(kind === 'RIG' ? { rigGiven: 'Yes (ERIG)' } : {}),
        treatments: [...(Array.isArray(x.treatments) ? x.treatments : []), entry],
      });
      setDetailPt(prev => (prev && prev.firestoreId === p.firestoreId ? apply(prev) : prev));
      setPatients(prev => prev.map(x => (x.firestoreId === p.firestoreId ? apply(x) : x)));
      onSaved();
      if (out.moved) showToast(`${product} saved. 1 vial deducted: ${out.itemName} ${out.before} → ${out.after} vials.`, 'success');
      else showToast(`${product} saved. No matching item in Inventory, so no stock was deducted.`, 'warning');
    } catch (err) {
      if (['stale', 'out-of-stock', 'expired'].includes(err?.code)) {
        showToast(`${err.message} Nothing was saved.`, 'error');
      } else {
        console.error(`Save ${kind} error:`, err);
        showToast(`Could not save ${kind}. Nothing was changed. Please try again.`, 'error');
      }
    } finally {
      treatmentInFlight.current = false;
      setBusy(false);
    }
  };

  // RIG deducts from the item picked in the card's dropdown.
  const handleSaveRig = (p) => {
    if (!attendingStaff.trim()) {
      showToast('Please enter the Attending Nurse / Physician name first.', 'warning');
      return;
    }
    const item = inventoryItems.find(i => i.id === rigItemId);
    if (!item) { showToast('Choose the RIG product first.', 'error'); return; }
    return saveTreatment(p, {
      kind: 'RIG', product: item.name, item, date: rigDate, attendingName: attendingStaff.trim(), setBusy: setRigBusy,
      onSaved: () => { setRigDraftOpen(false); setRigItemId(''); setRigDate(getTodayDateString()); },
    });
  };

  const handleSaveAntiTetanus = (p) => {
    if (!attendingStaff.trim()) {
      showToast('Please enter the Attending Nurse / Physician name first.', 'warning');
      return;
    }
    return saveTreatment(p, {
      kind: 'Anti-Tetanus', product: tetanusProduct, date: tetanusDate, attendingName: attendingStaff.trim(), setBusy: setTetanusBusy,
      onSaved: () => { setTetanusDraftOpen(false); setTetanusProduct(''); setTetanusDate(getTodayDateString()); },
    });
  };

  const removeTreatment = async (p, treatment) => {
    setTreatmentBusy(true);
    try {
      const isRig = isRigEntry(treatment);
      const out = await recordTreatmentChange({ runTransaction, doc, collection, deleteField }, db, {
        patientId: p.firestoreId,
        give: false,
        kind: isRig ? 'rig' : 'antiTetanus',
        treatmentId: treatment.id,
        product: treatment.product,
        byUid: auth.currentUser?.uid || null,
        byName: auth.currentUser?.displayName || auth.currentUser?.email || '',
      });
      setDetailPt(prev => {
        if (!prev) return null;
        return {
          ...prev,
          treatments: (Array.isArray(prev.treatments) ? prev.treatments : []).filter(t => (t.id && treatment.id ? t.id !== treatment.id : t.product !== treatment.product)),
          ...(isRig ? { rigTreatment: null, rigGiven: 'No' } : { antiTetanusTreatment: null }),
        };
      });
      setPatients(prev => prev.map(x => x.firestoreId === p.firestoreId ? {
        ...x,
        treatments: (Array.isArray(x.treatments) ? x.treatments : []).filter(t => (t.id && treatment.id ? t.id !== treatment.id : t.product !== treatment.product)),
        ...(isRig ? { rigTreatment: null, rigGiven: 'No' } : { antiTetanusTreatment: null }),
      } : x));
      showToast(out.moved
        ? `${treatment.product} removed. 1 vial returned to ${out.itemName} (${out.before} → ${out.after} vials).`
        : treatment.ml != null && treatment.stockDeducted
        ? `${treatment.product} removed. It was recorded in mL, so no vial was returned; adjust the stock in Inventory if needed.`
        : `${treatment.product} removed. No stock was deducted for it, so none was restored.`, 'info');
    } catch (e) {
      if (e?.code === 'stale') showToast(`${e.message} The record has been refreshed.`, 'warning');
      else { console.error('removeTreatment error:', e); showToast('Could not remove the entry. Nothing was changed.', 'error'); }
    } finally {
      setTreatmentBusy(false);
      setTreatmentRemoveAsk(null);
    }
  };

  // Memoized: recomputed only when the records, search, filter or sort change.
  const filtered = useMemo(() => patients.filter(p => {
    // Archived records live only on the Archive page, never here.
    if (p.isArchived) return false;
    // Completed patients are hidden from the default view so they do not
    // clutter the active vaccination queue; the "Completed" filter shows them.
    const isArchivedOrCompleted = p.isArchived || p.status === 'completed' || p.status === 'archived';
    if (isArchivedOrCompleted && filterStatus !== 'completed') return false;

    const name   = getName(p).toLowerCase();
    const cat    = (p.cat || '').toLowerCase();
    const animal = (p.animal || '').toLowerCase();
    const caseNo = (p.caseNo || p.id || '').toLowerCase();
    const q      = searchQuery.toLowerCase();
    const matchSearch = !q || name.includes(q) || cat.includes(q) || animal.includes(q) || caseNo.includes(q);

    const state = rowState(p).key;
    const pSvc = (p.service || 'PEP').toLowerCase();
    const matchStatus =
      filterStatus === 'all'         ? true :
      filterStatus === 'today'       ? state === 'due-today' :
      filterStatus === 'overdue'     ? state === 'overdue' :
      filterStatus === 'on-schedule' ? state === 'on-schedule' :
      filterStatus === 'completed'   ? (isArchivedOrCompleted || state === 'completed') :
      filterStatus === 'prep'        ? pSvc === 'prep' :
      filterStatus === 'pep'         ? pSvc === 'pep' :
      filterStatus === 'tetanus'     ? (pSvc === 'tetanus' || pSvc === 'antitetano') :
      filterStatus === 'pneumonia'   ? pSvc === 'pneumonia' : true;

    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (sortBy === 'overdue_first') {
      // Overdue (most days late first), then due today, on schedule, completed.
      const sa = rowState(a), sb = rowState(b);
      if (STATE_RANK[sa.key] !== STATE_RANK[sb.key]) return STATE_RANK[sa.key] - STATE_RANK[sb.key];
      if (sa.days !== sb.days) return sb.days - sa.days;
      return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    }
    if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
    if (sortBy === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0);
    if (sortBy === 'name_asc') return getName(a).localeCompare(getName(b));
    if (sortBy === 'progress_desc') {
      const pctOf = p => { const d = buildDoses(p); return d.length ? d.filter(x => x.status === 'done').length / d.length : 0; };
      return pctOf(b) - pctOf(a);
    }
    return 0;
  }), [patients, searchQuery, filterStatus, sortBy]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage   = Math.min(currentPage, totalPages);
  const [tableAreaRef, tableReserve] = useTableReserve(74);
  const paginated  = filtered.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const stats = [
    { label: 'Total Patients',     value: patients.filter(p => !p.isArchived && p.status !== 'completed' && p.status !== 'archived').length, icon: Users,       sub: 'Active Records' },
    { label: 'Completed',          value: patients.filter(p => !p.isArchived && (p.status === 'completed' || p.status === 'archived' || deriveStatus(p) === 'completed')).length, icon: CheckCircle, sub: 'Fully Vaccinated' },
    { label: 'In Progress',        value: patients.filter(p => !p.isArchived && p.status !== 'completed' && p.status !== 'archived' && deriveStatus(p) === 'in-progress').length, icon: Clock,       sub: 'Ongoing Doses' },
    { label: 'Overdue Follow-ups', value: patients.filter(p => !p.isArchived && p.status !== 'completed' && p.status !== 'archived' && deriveStatus(p) === 'overdue').length,     icon: AlertCircle, sub: 'Attention Required' },
  ];

  const serviceBadge = (service) => {
    const sLabel = serviceLabel(service || 'PEP');
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6,
        background: '#F1F5F9', color: '#334155', border: '1px solid #CBD5E1', fontSize: '.71875rem', fontWeight: 700, whiteSpace: 'nowrap'
      }}>
        {sLabel}
      </span>
    );
  };

  return (
    <div style={{ padding: '20px 28px 36px', maxWidth: '1400px', margin: '0 auto' }}>
      <div className="space-y-5">
        
        {/* ── Summary Metric Cards ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3.5">
          {stats.map((s, i) => (
            <div
              key={i}
              className="bg-white border border-slate-200/80 rounded-xl px-3.5 py-2.5 sm:px-4 sm:py-3 flex items-center gap-3 shadow-2xs hover:shadow-xs transition-all"
            >
              <div className="w-8.5 h-8.5 rounded-lg bg-slate-100 border border-slate-200/80 text-slate-600 flex items-center justify-center shrink-0">
                <s.icon size={17} strokeWidth={2} className="text-slate-600" />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-extrabold text-slate-900 leading-none tabular-nums">{s.value}</div>
                <div className="text-xs font-bold text-slate-700 mt-1 truncate">{s.label}</div>
                <div className="text-[10.5px] font-medium text-slate-400 mt-0.5 truncate">{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Clean Table Card Container ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', position: 'relative' }}>

          {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', borderRadius: '16px 16px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA' }}>
            
            {/* Search Input Box */}
            <div style={{ position: 'relative', flex: 1, maxWidth: '24rem', minWidth: '16rem' }}>
              <Search
                style={{
                  position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                  opacity: searchFocused ? 1 : .4, color: searchFocused ? '#3B50DF' : '#0F172A',
                  pointerEvents: 'none', transition: 'all 0.15s ease'
                }}
                size={14}
              />
              <input
                type="text"
                placeholder="Search by patient name, MRN, animal, or service..."
                value={searchQuery}
                onFocus={() => setSearchFocused(true)}
                onBlur={() => setSearchFocused(false)}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{
                  width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem',
                  border: searchFocused ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                  borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none',
                  boxShadow: searchFocused ? '0 0 0 3px rgba(59,80,223,0.15)' : 'none',
                  transition: 'all 0.15s ease'
                }}
              />
            </div>

            {/* Filter and Sort — grouped together, side by side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div ref={filterMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(o => !o)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                    fontSize: '.78125rem', fontWeight: 600,
                    border: filterStatus !== 'all' ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem',
                    background: filterStatus !== 'all' ? '#EEF2FF' : '#FFFFFF',
                    color: filterStatus !== 'all' ? '#3B50DF' : '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  {filterStatus === 'all' ? 'Filter' : (FILTER_OPTIONS.find(o => o.key === filterStatus)?.label || 'Filter')}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {filterMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 215, maxHeight: '380px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                    <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Status
                    </div>
                    {FILTER_OPTIONS.slice(0, 5).map(opt => {
                      // Live count beside each status so staff see where the work is.
                      const todayCount = opt.key === 'all' ? null
                        : patients.filter(p => !p.isArchived && (opt.key === 'today' ? 'due-today' : opt.key) === rowState(p).key).length;
                      return (
                        <button key={opt.key} type="button"
                          onClick={() => { setFilterStatus(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                          style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filterStatus === opt.key ? '#EEF2FF' : 'transparent', color: filterStatus === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filterStatus === opt.key ? 700 : 500, cursor: 'pointer' }}
                        >
                          <span style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                            {opt.label}
                            {todayCount !== null && todayCount > 0 && (
                              <span style={{ fontSize: '.65625rem', fontWeight: 700, padding: '1px 6px', borderRadius: 9999, background: '#DBEAFE', color: '#1D4ED8' }}>
                                {todayCount}
                              </span>
                            )}
                          </span>
                          {filterStatus === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                        </button>
                      );
                    })}

                    <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                    <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Vaccine / Service
                    </div>
                    {[
                      { key: 'prep', label: 'PrEP (Pre-Exposure)' },
                      { key: 'pep', label: 'PEP (Post-Exposure)' },
                      { key: 'tetanus', label: 'Anti-Tetanus' },
                      { key: 'pneumonia', label: 'Pneumonia Vaccine' },
                    ].map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilterStatus(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filterStatus === opt.key ? '#EEF2FF' : 'transparent', color: filterStatus === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filterStatus === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {filterStatus === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <div ref={sortMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setSortMenuOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" y1="6" x2="20" y2="6" /><line x1="7" y1="12" x2="17" y2="12" /><line x1="10" y1="18" x2="14" y2="18" /></svg>
                  Sort by
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {sortMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 200, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
                    {SORT_OPTIONS.map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setSortBy(opt.key); setSortMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#334155', fontSize: '.78125rem', fontWeight: sortBy === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {sortBy === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            </div>

          </div>

          {/* ── Table Area ── */}
          <div ref={tableAreaRef} style={{ minHeight: tableReserve,  overflowX: 'auto' }}>
            <table className="kna-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '16px 12px 16px 20px', width: '11%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Patient ID</th>
                  <th style={{ padding: '16px 12px', width: '18%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Patient Name</th>
                  <th style={{ padding: '16px 12px', width: '10%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '16px 12px', width: '14%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Status</th>
                  <th className="kna-gap-r" style={{ padding: '16px 28px 16px 12px', width: '19%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>
                    {/* Matches the progress bar's own max width so the label centers over the bar, not the wider cell */}
                    <div style={{ maxWidth: 230, textAlign: 'center' }}>Dose Progress</div>
                  </th>
                  <th className="kna-gap-l" style={{ padding: '16px 12px 16px 16px', width: '19%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Next Dose</th>
                  <th style={{ padding: '16px 20px 16px 12px', width: '9%', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ padding: 0 }}><SkeletonRows rows={8} /></td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ padding: 0 }}><EmptyState icon={Search} title="No matching vaccination records" text="Try a different search, filter or sort." /></td>
                  </tr>
                ) : paginated.map(p => {
                  const name     = getName(p);
                  const doses    = buildDoses(p);
                  const doneNum  = doses.filter(d => d.status === 'done').length;
                  const pct      = Math.round((doneNum / doses.length) * 100);
                  const state    = rowState(p);
                  const nextDose = doses.find(d => d.status !== 'done');

                  return (
                    <tr
                      key={p.firestoreId}
                      style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background .12s ease', cursor: 'pointer' }}
                      onMouseEnter={e => { e.currentTarget.style.background = '#F8FAFC'; prefetchReminder(p.firestoreId); }}
                      onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                      onClick={() => { prefetchReminder(p.firestoreId); setDetailPt(p); setAssignedBrand(''); }}
                    >
                      <td style={{ padding: '16px 12px 16px 20px', fontWeight: 500, color: '#64748B', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.id || p.caseNo || '—'}
                      </td>
                      <td style={{ padding: '16px 12px', maxWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                        <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.email || p.contact || ''}>{p.email || (p.contact || '—')}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>{serviceBadge(p.service)}</td>
                      <td style={{ padding: '16px 12px' }}>{stateBadge(state)}</td>
                      <td className="kna-gap-r" style={{ padding: '16px 28px 16px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 230, margin: '0 auto 0 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', fontWeight: 600 }}>
                            <span style={{ color: '#64748B' }}>{doneNum}/{doses.length} Doses</span>
                            <span style={{ color: pct === 100 ? '#059669' : '#1E293B' }}>{pct}%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {doses.map((d, di) => {
                              return (
                                <button
                                  key={di}
                                  type="button"
                                  title={
                                    d.status === 'done'
                                      ? `${d.label} · Completed ${d.brand ? `(${d.brand})` : ''} · ${fmtDate(d.date)}`
                                      : `${d.label} · ${fmtDate(d.date)} · Click to open record and select vaccine brand`
                                  }
                                  onClick={e => {
                                    e.stopPropagation();
                                    setDetailPt(p);
                                    setAssignedBrand('');
                                    if (d.status !== 'done') {
                                      showToast(`Please select an assigned Vaccine Brand for ${d.label} before checking.`, 'info');
                                    }
                                  }}
                                  disabled={!!saving[`${p.firestoreId}_${d.key}`]}
                                  style={{
                                    flex: 1, height: 8, borderRadius: 9999, border: 'none',
                                    cursor: saving[`${p.firestoreId}_${d.key}`] ? 'wait' : 'pointer',
                                    background:
                                      d.status === 'done' ? '#10B981' :
                                      d.status === 'miss' ? '#EF4444' : '#CBD5E1',
                                    transition: 'all 0.15s',
                                    opacity: saving[`${p.firestoreId}_${d.key}`] ? 0.5 : 1,
                                  }}
                                />
                              );
                            })}
                          </div>
                        </div>
                      </td>
                      <td className="kna-gap-l" style={{ padding: '16px 12px 16px 16px', maxWidth: 0 }}>
                        {nextDose ? (() => {
                          const nd = (nextDose.date || '').slice(0, 10);
                          const dueToday = nd === getTodayStr();
                          const overdue = nextDose.status !== 'done' && (nextDose.status === 'miss' || (nd && nd < getTodayStr()));
                          // Two clean lines: session name, then the date (amber today,
                          // red when overdue). The state itself lives in STATUS.
                          const label = doses.length === 1 ? 'Single dose' : nextDose.label;
                          return (
                            <>
                              <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nextDose.label}>
                                {label}
                              </div>
                              <div style={{ fontSize: '.75rem', color: overdue ? '#DC2626' : dueToday ? '#B45309' : '#64748B', fontWeight: overdue || dueToday ? 600 : 400, marginTop: 2, whiteSpace: 'nowrap' }}>
                                {fmtDate(nextDose.date)}
                              </div>
                            </>
                          );
                        })() : (
                          <span style={{ fontSize: '.8125rem', color: '#059669', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="All doses complete">All doses complete</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 20px 16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                          <IconButton icon={Pencil} label="Edit doses" bordered
                            onClick={(e) => { e.stopPropagation(); setDetailPt(p); setAssignedBrand(''); }} />
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* ── Standardized Pagination Bar ── */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', borderRadius: '0 0 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
            <div style={{ fontSize: '.8125rem', color: '#475569', fontWeight: 600 }}>
              {filtered.length === 0 ? '0 of 0' : `${(safePage - 1) * itemsPerPage + 1} to ${Math.min(safePage * itemsPerPage, filtered.length)} of ${filtered.length}`}
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
              <IconButton icon={ChevronsLeft} label="First page" size={32} iconSize={16} disabled={safePage <= 1} onClick={() => setCurrentPage(1)} />

              <IconButton icon={ChevronLeft} label="Previous page" size={32} iconSize={16} disabled={safePage <= 1} onClick={() => setCurrentPage(p => Math.max(p - 1, 1))} />

              <span style={{ fontSize: '.8125rem', fontWeight: 600, color: '#334155', padding: '0 8px', whiteSpace: 'nowrap' }}>
                Page {safePage} of {totalPages}
              </span>

              <IconButton icon={ChevronRight} label="Next page" size={32} iconSize={16} disabled={safePage >= totalPages} onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))} />

              <IconButton icon={ChevronsRight} label="Last page" size={32} iconSize={16} disabled={safePage >= totalPages} onClick={() => setCurrentPage(totalPages)} />
            </div>
          </div>

        </div>
      </div>

      {/* ── PATIENT VACCINATION DETAIL MODAL ──
          Layout from the earlier design (commit 975db2d, src/pages/vaccination.jsx),
          cleaned up: one card per section, rows split by thin dividers, the
          same label/value rows on the left, D-chips shared by the status
          steps and the checklist.
          Dose flow: choose the brand → tick the next dose (ready, nothing
          saved) → "Confirm dose" saves it and deducts stock through
          recordDoseChange. Unticking a ready dose just clears it; unticking
          the latest given dose asks to undo it (stock returns). */}
      {detailPt && (() => {
        const p      = detailPt;
        const name   = titleCaseWords(getName(p));
        const doses  = buildDoses(p);
        const done   = doses.filter(d => d.status === 'done').length;
        const serviceName = p.service || 'PEP';
        const isPepRecord = serviceName === 'PEP';
        const eligibleVaccines = getEligibleVaccinesForService(serviceName, inventoryItems);
        const allOptions = [...eligibleVaccines];
        if (assignedBrand && !allOptions.some(item => item.name === assignedBrand) && !isTreatmentProduct(assignedBrand)) {
          allOptions.unshift({ id: 'current_selected', name: assignedBrand, stock: '?' });
        }
        const nextIndex = doses.findIndex(d => d.status !== 'done');
        const next = nextIndex === -1 ? null : doses[nextIndex];
        const lastDoneIndex = doses.reduce((last, d, idx) => d.status === 'done' ? idx : last, -1);
        const today = getTodayStr();
        const nextDate = (next?.date || '').slice(0, 10);
        const daysToNext = nextDate ? Math.round((Date.parse(`${nextDate}T00:00:00Z`) - Date.parse(`${today}T00:00:00Z`)) / 86400000) : null;
        const daysLabel = !next ? '' : daysToNext == null ? '' : daysToNext === 0 ? 'due today' : daysToNext < 0 ? `${-daysToNext}d overdue` : `in ${daysToNext} day${daysToNext === 1 ? '' : 's'}`;
        const daysTone = !next ? 'text-emerald-700' : daysToNext < 0 ? 'text-rose-600' : daysToNext === 0 ? 'text-slate-800' : 'text-slate-500';
        const readyDose = readyKey ? doses.find(d => d.key === readyKey) : null;
        const erig = erigStatus(p);
        const createdRaw = p.createdAt?.toDate ? p.createdAt.toDate() : (typeof p.createdAt === 'number' ? new Date(p.createdAt) : null);
        const regDate = createdRaw ? getTodayDateString(createdRaw) : String(p.date || '').slice(0, 10);

        // One state per dose, shared by the status steps and the checklist.
        const doseState = (d, di) => {
          if (d.status === 'done') return 'given';
          const dd = (d.date || '').slice(0, 10);
          if (di !== nextIndex) return 'locked';
          return dd && dd < today ? 'overdue' : dd === today ? 'today' : 'next';
        };
        const CHIP = {
          given: 'bg-emerald-50 text-emerald-700 border-emerald-200',
          overdue: 'bg-rose-50 text-rose-700 border-rose-200',
          today: 'bg-white text-slate-800 border-slate-400',
          next: 'bg-indigo-50 text-[#3B50DF] border-indigo-200',
          locked: 'bg-white text-slate-400 border-slate-200',
        };
        const Chip = ({ state, n }) => (
          <span className={`w-7 h-7 rounded-lg border text-[11px] font-bold inline-flex items-center justify-center shrink-0 ${CHIP[state]}`}>D{n}</span>
        );

        // Label/value rows, the same in both left cards.
        const Row = ({ label, children, tall }) => (
          <div className={`flex items-start justify-between gap-4 px-4 py-[7px] text-xs ${tall ? 'min-h-[50px]' : ''}`}>
            <span className="text-slate-500 font-medium shrink-0">{label}</span>
            <span className="text-slate-900 font-semibold text-right min-w-0 break-words">{children}</span>
          </div>
        );
        const cardCls = 'bg-white border border-slate-200 rounded-2xl';
        const cardHead = 'px-4 pt-3 pb-2 text-[11px] font-bold uppercase tracking-wider text-slate-500';

        // Latest reminder, prefetched on row hover/click. undefined = still
        // loading (skeleton of the same height), null = none sent.
        const rem = reminderCache[p.firestoreId];
        const remChannels = rem ? [rem.pushSent ? 'Push' : null, rem.emailed ? 'Email' : null].filter(Boolean) : [];
        const shortDate = (ms) => new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });

        return (
          <Modal onClose={requestCloseModal}>
            <div
              className="bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/90"
              style={{ width: '1040px', maxWidth: '96vw', maxHeight: 'calc(100vh - 32px)' }}
            >
              {/* ── Header ── */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between gap-4">
                <div className="min-w-0">
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-extrabold text-slate-900 truncate">{name}</h3>
                    <span className="text-xs font-bold text-[#3B50DF] bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100/90 shrink-0">
                      ID: {p.id || p.caseNo || '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Registered Record &middot; Service: <span className="font-bold text-slate-700">{serviceLabel(serviceName)}</span>
                  </p>
                </div>
                <div className="flex items-center gap-2.5 shrink-0">
                  {stateBadge(rowState(p))}
                  <button
                    type="button"
                    onClick={(e) => handleSendFollowup(p, e)}
                    disabled={!!sendingFollowup[p.firestoreId]}
                    className="inline-flex items-center gap-1.5 bg-[#3B50DF] hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Bell size={13} />
                    {sendingFollowup[p.firestoreId] ? 'Sending…' : 'Send Follow-up'}
                  </button>
                  <IconButton icon={X} label="Close modal" size={36} iconSize={18} onClick={requestCloseModal} />
                </div>
              </div>

              {/* ── Two-column body ── */}
              <div className="flex flex-1 min-h-0 overflow-y-auto bg-slate-50/40">

                {/* Left: identity + treatment status */}
                <div className="flex-1 min-w-0 px-6 py-5 flex flex-col gap-4 border-r border-slate-100">
                  <section className={cardCls}>
                    <div className="flex items-center justify-between gap-2 pr-3">
                      <h4 className={cardHead}>Patient Identity &amp; Exposure Summary</h4>
                      <button
                        type="button"
                        onClick={() => { closeModal(); window.dispatchEvent(new CustomEvent('open-patient-record', { detail: p })); }}
                        className="inline-flex items-center gap-1.5 text-xs font-semibold text-[#3B50DF] hover:bg-indigo-50 px-2 py-1 rounded-lg transition-colors cursor-pointer"
                      >
                        <FileText size={13} /> View Medical Record
                      </button>
                    </div>
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      <Row label="Full name">{name}</Row>
                      <Row label="Age / sex">{`${p.age ? p.age + ' yrs' : '—'} · ${p.sex || p.gender || '—'}`}</Row>
                      <Row label="Contact number">{p.phone || p.contact || '—'}</Row>
                      <Row label="Barangay / address">{p.address || p.barangay || '—'}</Row>
                      <Row label="Service">{serviceLabel(serviceName)}</Row>
                      {isPepRecord ? (
                        <>
                          <Row label="Animal type">{p.animal || '—'}</Row>
                          <Row label="Exposure category">{p.cat ? `Category ${String(p.cat).replace('Category ', '').trim()}` : '—'}</Row>
                          <Row label="Date of exposure">{p.date ? fmtDate(p.date) : '—'}</Row>
                        </>
                      ) : (
                        <Row label="Registration date">{regDate ? fmtDate(regDate) : '—'}</Row>
                      )}
                    </div>
                  </section>

                  <section className={`${cardCls} flex-1`}>
                    <h4 className={cardHead}>Treatment Status</h4>
                    <div className="px-4 pb-3 flex items-center gap-1.5 flex-wrap" aria-label="Dose steps">
                      {doses.map((d, di) => (
                        <span key={d.key || di} className="inline-flex items-center gap-1.5">
                          <span className="relative inline-flex" title={`${d.label} · ${doseState(d, di) === 'given' ? 'given' : fmtDate(d.date)}`}>
                            <Chip state={doseState(d, di)} n={di + 1} />
                            {d.status === 'done' && (
                              <span className="absolute -top-1 -right-1 w-3.5 h-3.5 rounded-full bg-emerald-600 text-white inline-flex items-center justify-center">
                                <Check size={9} strokeWidth={3.5} />
                              </span>
                            )}
                          </span>
                          {di < doses.length - 1 && <span aria-hidden="true" className="w-3 h-px bg-slate-300" />}
                        </span>
                      ))}
                    </div>
                    <div className="divide-y divide-slate-100 border-t border-slate-100">
                      <Row label="Doses given">{done} of {doses.length}</Row>
                      <Row label="Next due">
                        {next ? <>{fmtDate(next.date)} <span className={`font-medium ${daysTone}`}>({daysLabel})</span></> : <span className="text-emerald-700">All doses given</span>}
                      </Row>
                      <Row label="Last reminder" tall>
                        {rem === undefined ? (
                          <span className="inline-flex flex-col items-end gap-1.5" aria-label="Loading last reminder">
                            <span className="block h-3 w-28 rounded bg-slate-100 animate-pulse" />
                            <span className="block h-3 w-20 rounded bg-slate-100 animate-pulse" />
                          </span>
                        ) : rem ? (
                          <>
                            {rem.createdAt ? shortDate(rem.createdAt) : '—'} · {remChannels.length ? remChannels.join(' + ') : 'In-app'}
                            <span className={`block text-[11px] font-medium mt-0.5 ${rem.acknowledged ? 'text-emerald-700' : 'text-slate-500'}`}>
                              {rem.acknowledged ? `Acknowledged${rem.acknowledgedAt ? ` ${shortDate(rem.acknowledgedAt)}` : ''}` : 'Not acknowledged'}
                            </span>
                          </>
                        ) : <span className="font-medium text-slate-500">None sent yet</span>}
                      </Row>
                    </div>
                  </section>
                </div>

                {/* Right: attending nurse, vaccine brand, then dose checklist. Both cards size to
                    their content; the column does not stretch them. */}
                <div className="w-[440px] shrink-0 px-6 py-5 flex flex-col gap-4 self-start">
                  {/* Attending Nurse / Physician card (ABOVE Vaccine Brand) */}
                  <section className={cardCls}>
                    <div className="flex items-center justify-between pr-4">
                      <h4 className={cardHead}>Attending Nurse / Physician</h4>
                      <span className="text-[11px] font-semibold text-slate-500">Required</span>
                    </div>
                    <div className="px-4 pb-4">
                      <div className="text-xs text-slate-500 mb-1.5">
                        Staff member administering the dose or treatment
                      </div>
                      <input
                        id="tracker-attending-staff"
                        type="text"
                        maxLength={80}
                        placeholder="e.g. Maria Santos, RN"
                        value={attendingStaff}
                        onChange={e => setAttendingStaff(e.target.value)}
                        className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none font-semibold text-xs bg-white text-slate-800 focus:border-[#3B50DF]"
                      />
                    </div>
                  </section>

                  <section className={cardCls}>
                    <div className="flex items-center justify-between pr-4">
                      <h4 className={cardHead}>Vaccine Brand</h4>
                      <span className="text-[11px] font-semibold text-slate-500">{serviceLabel(serviceName)}</span>
                    </div>
                    <div className="px-4 pb-4">
                      <div className="text-xs text-slate-500 mb-1.5">
                        {next ? <>For <span className="font-semibold text-slate-900">{next.label}</span></> : 'All scheduled doses given'}
                      </div>
                      <Select
                        id="tracker-brand"
                        aria-label={`Vaccine brand for ${next?.label || 'scheduled dose'}`}
                        value={assignedBrand}
                        onChange={e => {
                          const b = e.target.value;
                          setAssignedBrand(b);
                          if (!b) setReadyKey(null);
                        }}
                        className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none font-semibold text-xs bg-white text-slate-800 focus:border-[#3B50DF]"
                      >
                        <option value="">{`Select ${serviceLabel(serviceName)} vaccine brand`}</option>
                        {allOptions.map(item => {
                          const a = brandAvailability(item, today);
                          return <option key={item.id} value={item.name} disabled={a.disabled} data-badge={a.badge} data-badge-tone={a.tone}>{item.name}</option>;
                        })}
                      </Select>

                    </div>
                  </section>

                  {/* Dose Checklist Card with Day 0 Adjunct Treatments */}
                  <section className={cardCls}>
                    <div className="px-4 pt-3.5 pb-2.5">
                      <div className="flex items-center justify-between gap-2">
                        <h4 className="text-[11px] font-bold uppercase tracking-wider text-slate-500">Dose Checklist</h4>
                        {isCategoryIII(p) && (
                          <span className="text-[10px] font-semibold text-slate-500 bg-slate-100 px-2 py-0.5 rounded-md">Category III Protocol</span>
                        )}
                      </div>
                      <p className="text-[11px] text-slate-400 mt-0.5">Tick the next dose, then Confirm dose.</p>
                    </div>

                    {/* Doses Header for Category III */}
                    {isCategoryIII(p) && (
                      <div className="px-4 py-2 bg-slate-50/60 border-t border-b border-slate-100 flex items-center justify-between">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Vaccine Regimen</span>
                        <span className="text-[10px] text-slate-400">Intradermal Sessions</span>
                      </div>
                    )}

                    <ol className={`divide-y divide-slate-100 ${isCategoryIII(p) ? '' : 'border-t border-slate-100'}`}>
                      {doses.map((d, di) => {
                        const st = doseState(d, di);
                        const isDone = st === 'given';
                        const isNext = di === nextIndex;
                        const isReady = isNext && readyKey === d.key;
                        // A dose can only be given on or after its scheduled date.
                        const notYetDue = (d.date || '').slice(0, 10) > today;
                        const canTick = isNext && !notYetDue && !!assignedBrand && !!attendingStaff.trim();
                        const canUndo = isDone && di === lastDoneIndex && !readyKey;
                        const usedBrand = d.brand || (isDone ? (d.vaccineBrand || p.vaccineBrand || '') : '');
                        const busy = !!saving[`${p.firestoreId}_${d.key}`];
                        const hint = isDone ? 'Given'
                          : isNext && notYetDue ? `Not due yet: can be given from ${fmtDate(d.date)}`
                          : isNext ? (!attendingStaff.trim() ? 'Enter attending nurse/physician first' : assignedBrand ? (isReady ? 'Untick to clear' : `Tick, then Confirm dose (${assignedBrand})`) : 'Select a brand first')
                          : `Locked until Dose ${nextIndex + 1} is given`;
                        return (
                          <li key={d.key || di}>
                            <label title={hint}
                              className={`flex items-center gap-3 px-4 py-2.5 transition-colors ${isReady ? 'bg-indigo-50/70' : ''} ${canTick ? 'cursor-pointer hover:bg-slate-50' : 'cursor-default'}`}>
                              <Chip state={st} n={di + 1} />
                              <div className="min-w-0 flex-1">
                                <div className={`text-xs font-semibold leading-5 ${st === 'locked' ? 'text-slate-400' : 'text-slate-900'}`}>{d.label}</div>
                                <div className="text-[11px] leading-4 text-slate-500 flex items-center gap-1.5 min-w-0">
                                  {isDone ? (
                                    <>
                                      <CheckCircle size={12} className="text-emerald-600 shrink-0" aria-hidden="true" />
                                      <span className="truncate"><span className="text-emerald-700 font-semibold">Given</span>{usedBrand ? ` · ${usedBrand}` : ''}{d.ml ? ` · ${d.ml} mL` : ''} · {fmtDate(d.date)}{d.dueDate ? ` (due ${fmtDate(d.dueDate)})` : ''}</span>
                                    </>
                                  ) : (
                                    <>
                                      <span className="shrink-0">{fmtDate(d.date)}</span>
                                      {st === 'overdue' && <StatusBadge status="overdue" />}
                                      {st === 'today' && <span className="shrink-0 font-semibold text-slate-700">· Due today</span>}
                                      {isNext && assignedBrand && <span className="truncate text-slate-700">· {assignedBrand}</span>}
                                    </>
                                  )}
                                </div>
                              </div>
                              {canUndo && (
                                <button type="button" disabled={busy}
                                  onClick={e => { e.preventDefault(); setUndoTarget({ p, key: d.key, label: d.label, brand: usedBrand, date: d.date, ml: d.ml, deducted: d.stockDeducted !== false }); }}
                                  className="inline-flex items-center gap-1 h-7 px-2 rounded-lg text-[11px] font-semibold text-slate-500 hover:text-slate-800 hover:bg-slate-100 transition-colors cursor-pointer disabled:opacity-50 shrink-0"
                                  title="Undo this dose (recorded by mistake)">
                                  <RotateCcw size={12} aria-hidden="true" /> Undo
                                </button>
                              )}
                              {isDone ? (
                                <span role="img" aria-label={`${d.label}: given`}
                                  className="w-[18px] h-[18px] rounded bg-emerald-50 border border-emerald-300 text-emerald-600 inline-flex items-center justify-center shrink-0">
                                  <Check size={12} strokeWidth={3} aria-hidden="true" />
                                </span>
                              ) : (
                                <input
                                  type="checkbox"
                                  checked={isReady}
                                  disabled={!canTick || busy}
                                  aria-label={`${d.label}: ${isReady ? 'ticked, not confirmed' : 'not given'}`}
                                  onChange={() => setReadyKey(isReady ? null : d.key)}
                                  className={`w-[18px] h-[18px] rounded accent-[#3B50DF] shrink-0 ${!canTick ? 'cursor-not-allowed opacity-40' : 'cursor-pointer'}`}
                                />
                              )}
                            </label>
                          </li>
                        );
                      })}
                    </ol>

                    {/* Late dose ticked: it is saved with today's date, and the
                        later doses can move by the same delay so the gaps
                        between doses stay as scheduled. Staff decide. */}
                    {(() => {
                      if (!readyDose) return null;
                      const due = (readyDose.date || '').slice(0, 10);
                      if (!due || due >= today) return null;
                      const delay = Math.round((Date.parse(`${today}T00:00:00Z`) - Date.parse(`${due}T00:00:00Z`)) / 86400000);
                      const ri = doses.findIndex(d => d.key === readyDose.key);
                      const later = doses.slice(ri + 1).filter(d => d.status !== 'done' && d.date);
                      const plus = iso => new Date(Date.parse(`${iso.slice(0, 10)}T00:00:00Z`) + delay * 86400000).toISOString().slice(0, 10);
                      return (
                        <div className="mx-4 mb-3 mt-1 rounded-xl border border-slate-200 bg-slate-50 px-3.5 py-3 text-[11.5px] text-slate-700">
                          <p>
                            <strong className="font-semibold text-slate-900">Given {delay} day{delay === 1 ? '' : 's'} late.</strong>{' '}
                            It will be saved as given today ({fmtDate(today)}); it was due {fmtDate(due)}.
                          </p>
                          {later.length > 0 && (
                            <label className="mt-2 flex items-start gap-2 cursor-pointer">
                              <input type="checkbox" checked={shiftLater} onChange={e => setShiftLater(e.target.checked)}
                                className="mt-0.5 rounded border-slate-300 accent-[#3B50DF]" />
                              <span>
                                Move the next {later.length} dose{later.length === 1 ? '' : 's'} {delay} day{delay === 1 ? '' : 's'} later, keeping the gaps between doses:
                                <span className="block mt-1 text-slate-500">
                                  {later.map(d => `${d.label}: ${fmtDate(d.date)} → ${fmtDate(plus(d.date))}`).join(' · ')}
                                </span>
                                <span className="block mt-1 text-slate-400">Confirm the new dates with the attending physician.</span>
                              </span>
                            </label>
                          )}
                        </div>
                      );
                    })()}

                    {/* Day 0 Adjunct Treatments (RIG & Anti-Tetanus) for Category III */}
                    {isCategoryIII(p) && (() => {
                      const existingRig = p.rigTreatment || (Array.isArray(p.treatments) ? p.treatments.find(isRigEntry) : null);
                      const existingTetanus = p.antiTetanusTreatment || (Array.isArray(p.treatments) ? p.treatments.find(t => !isRigEntry(t)) : null);
                      const rigItems = inventoryItems.filter(isRigItem).sort((a, b) => (a.name || '').localeCompare(b.name || ''));

                      return (
                        <div className="border-t border-slate-100 bg-slate-50/50 p-3.5 space-y-2.5">
                          <div className="text-[10px] font-bold uppercase tracking-wider text-slate-400 px-0.5">
                            Day 0 Adjunct Treatments
                          </div>

                          {/* RIG Item */}
                          <div className="p-3 rounded-xl border border-slate-200/90 bg-white transition-all shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                                <input
                                  type="checkbox"
                                  checked={Boolean(existingRig || rigDraftOpen)}
                                  onChange={() => {
                                    if (existingRig) {
                                      setTreatmentRemoveAsk({ p, treatment: existingRig });
                                    } else {
                                      setRigDraftOpen(o => !o);
                                    }
                                  }}
                                  className="w-4 h-4 rounded accent-[#3B50DF] cursor-pointer shrink-0"
                                />
                                <span className="text-xs font-bold text-slate-900 truncate">RIG</span>
                                <span className="text-[11px] font-medium text-slate-400 truncate">Rabies immunoglobulin</span>
                              </label>
                              {existingRig ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 shrink-0">
                                  <Check size={10} strokeWidth={3} /> Given
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400 shrink-0">Optional Day 0</span>
                              )}
                            </div>

                            {existingRig ? (
                              <div className="mt-2 text-xs pt-2 border-t border-slate-100 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate">
                                    {existingRig.product}{amountText(existingRig) ? ` · ${amountText(existingRig)}` : ''}
                                  </div>
                                  <div className="text-[11px] text-slate-500 mt-0.5">
                                    {fmtDate(existingRig.date)}{existingRig.attendingName || existingRig.recordedByName ? ` · ${existingRig.attendingName || existingRig.recordedByName}` : ''}
                                  </div>
                                </div>
                              </div>
                            ) : rigDraftOpen ? (
                              <div className="mt-2.5 space-y-2 pt-2 border-t border-slate-100">
                                <div>
                                  <label htmlFor="tracker-rig-product" className="block text-[10px] font-semibold text-slate-500 mb-1">Select RIG Product</label>
                                  <Select
                                    id="tracker-rig-product"
                                    aria-label="RIG product"
                                    value={rigItemId}
                                    onChange={e => setRigItemId(e.target.value)}
                                    className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg outline-none text-[11px] font-semibold bg-white text-slate-800 focus:border-[#3B50DF]"
                                  >
                                    <option value="">{rigItems.length ? 'Select RIG product' : 'No RIG item in Inventory'}</option>
                                    {rigItems.map(it => {
                                      const a = brandAvailability(it, today);
                                      return <option key={it.id} value={it.id} disabled={a.disabled} data-badge={a.badge || formatVials(it)} data-badge-tone={a.tone}>{it.name}</option>;
                                    })}
                                  </Select>
                                  {!rigItems.length && <p className="mt-1 text-[10px] text-amber-700">Add the RIG product in Inventory (category: RIG) first.</p>}
                                </div>
                                <button
                                  type="button"
                                  disabled={rigBusy || !rigItemId}
                                  onClick={() => handleSaveRig(p)}
                                  className="w-full py-1.5 px-3 bg-[#3B50DF] hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {rigBusy ? 'Saving…' : 'Save RIG'}
                                </button>
                              </div>
                            ) : null}
                          </div>

                          {/* Anti-Tetanus Item */}
                          <div className="p-3 rounded-xl border border-slate-200/90 bg-white transition-all shadow-2xs">
                            <div className="flex items-center justify-between gap-2">
                              <label className="flex items-center gap-2.5 cursor-pointer select-none min-w-0">
                                <input
                                  type="checkbox"
                                  checked={Boolean(existingTetanus || tetanusDraftOpen)}
                                  onChange={() => {
                                    if (existingTetanus) {
                                      setTreatmentRemoveAsk({ p, treatment: existingTetanus });
                                    } else {
                                      setTetanusDraftOpen(o => !o);
                                    }
                                  }}
                                  className="w-4 h-4 rounded accent-[#3B50DF] cursor-pointer shrink-0"
                                />
                                <span className="text-xs font-bold text-slate-900 truncate">Anti-Tetanus</span>
                                <span className="text-[11px] font-medium text-slate-400 shrink-0">TT / Serum</span>
                              </label>
                              {existingTetanus ? (
                                <span className="inline-flex items-center gap-1 text-[10px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200/80 shrink-0">
                                  <Check size={10} strokeWidth={3} /> Given
                                </span>
                              ) : (
                                <span className="text-[10px] font-medium text-slate-400 shrink-0">Optional Day 0</span>
                              )}
                            </div>

                            {existingTetanus ? (
                              <div className="mt-2 text-xs pt-2 border-t border-slate-100 flex items-start justify-between gap-2">
                                <div className="min-w-0">
                                  <div className="font-semibold text-slate-800 truncate">
                                    {existingTetanus.product}
                                  </div>
                                  <div className="flex items-center gap-2 text-[11px] text-slate-500 mt-0.5">
                                    {amountText(existingTetanus) && <span>{amountText(existingTetanus)} ·</span>}
                                    <span>{fmtDate(existingTetanus.date)}{existingTetanus.attendingName || existingTetanus.recordedByName ? ` · ${existingTetanus.attendingName || existingTetanus.recordedByName}` : ''}</span>
                                  </div>
                                </div>
                              </div>
                            ) : tetanusDraftOpen ? (
                              <div className="mt-2.5 space-y-2 pt-2 border-t border-slate-100">
                                <div>
                                  <label htmlFor="tracker-at-product" className="block text-[10px] font-semibold text-slate-500 mb-1">Select Product</label>
                                  <Select
                                    id="tracker-at-product"
                                    aria-label="Anti-Tetanus product"
                                    value={tetanusProduct}
                                    onChange={e => setTetanusProduct(e.target.value)}
                                    className="w-full py-1.5 px-2.5 border border-slate-300 rounded-lg outline-none text-[11px] font-semibold bg-white text-slate-800 focus:border-[#3B50DF]"
                                  >
                                    <option value="">Select product</option>
                                    {ANTI_TETANUS_PRODUCTS.map(name => {
                                      const it = findMatchingInventoryItem(name, inventoryItems);
                                      const a = it ? brandAvailability(it, today) : { disabled: false, badge: 'Not in Inventory', tone: 'amber' };
                                      return <option key={name} value={name} disabled={a.disabled} data-badge={a.badge || (it ? formatVials(it) : '')} data-badge-tone={a.tone}>{name}</option>;
                                    })}
                                  </Select>
                                </div>
                                <button
                                  type="button"
                                  disabled={tetanusBusy || !tetanusProduct}
                                  onClick={() => handleSaveAntiTetanus(p)}
                                  className="w-full py-1.5 px-3 bg-[#3B50DF] hover:bg-indigo-700 text-white font-bold text-[11px] rounded-lg shadow-2xs transition-colors cursor-pointer disabled:opacity-50"
                                >
                                  {tetanusBusy ? 'Saving…' : 'Save Anti-Tetanus'}
                                </button>
                              </div>
                            ) : null}
                          </div>
                        </div>
                      );
                    })()}
                  </section>
                </div>
              </div>

              {/* ── Footer: Close Record (left) · Confirm dose (right) ── */}
              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-between gap-3">
                <button type="button" onClick={requestCloseModal} className={BTN.outline}>Close Record</button>
                <button
                  type="button"
                  disabled={!readyDose || !assignedBrand || !attendingStaff.trim() || confirmBusy}
                  title={readyDose ? `Save ${readyDose.label} with ${assignedBrand} and deduct 1 vial` : !attendingStaff.trim() ? 'Enter attending nurse/physician first' : 'Tick the next dose first'}
                  onClick={async () => {
                    const key = readyDose.key;
                    setConfirmBusy(true);
                    try { await cycleStatus(p, key, assignedBrand); }
                    finally { setConfirmBusy(false); setReadyKey(null); }
                  }}
                  className={BTN.primary}
                >
                  <CheckCircle size={16} aria-hidden="true" />
                  {confirmBusy ? 'Saving…' : 'Confirm dose'}
                </button>
              </div>
            </div>
          </Modal>
        );
      })()}

      {discardAsk && (() => {
        // "Dose 2 (Day 7)": the ticked dose's number plus its schedule day.
        const ds = detailPt ? buildDoses(detailPt) : [];
        const i = ds.findIndex(d => d.key === readyKey);
        const day = i === -1 ? null : String(ds[i].label || '').match(/\(Day \d+\)/);
        const doseName = i === -1 ? '' : `Dose ${i + 1}${day ? ` ${day[0]}` : ''}`;
        return (
          <ConfirmDialog
            variant="danger"
            icon={AlertTriangle}
            size="compact"
            title={readyKey ? "Discard unconfirmed dose?" : "Discard unsaved entry?"}
            subtitle={[detailPt ? titleCaseWords(getName(detailPt)) : '', doseName].filter(Boolean).join(' · ')}
            message={<>It wasn't saved. <strong>No stock</strong> was deducted.</>}
            details={[
              ['Brand', readyKey ? assignedBrand : ''],
              ['Due', i === -1 ? '' : fmtDate(ds[i].date)],
              ['RIG', rigDraftOpen ? 'Entry not saved' : ''],
              ['Anti-Tetanus', tetanusDraftOpen ? 'Entry not saved' : ''],
            ]}
            confirmLabel="Discard"
            cancelLabel="Keep editing"
            onConfirm={() => { setDiscardAsk(false); closeModal(); }}
            onCancel={() => setDiscardAsk(false)}
          />
        );
      })()}

      {undoTarget && (
        <ConfirmDialog
          variant="warning"
          icon={RotateCcw}
          title="Undo this dose?"
          subtitle="Vaccination record"
          message={<><strong>{undoTarget.label}</strong> goes back to <strong>not given</strong>.</>}
          details={[
            ['Patient', titleCaseWords(getName(undoTarget.p))],
            ['Given', undoTarget.date ? fmtDate(undoTarget.date) : ''],
            ['Brand', undoTarget.brand],
            ['Stock', !undoTarget.deducted ? 'No stock was deducted for it'
              : undoTarget.ml != null ? 'Recorded in mL: no vial returned' : `+1 vial returned to ${undoTarget.brand || 'Inventory'}`],
          ]}
          note="Use this only when the dose was recorded by mistake."
          confirmLabel="Undo dose"
          busy={undoBusy}
          busyLabel="Undoing…"
          onConfirm={async () => {
            setUndoBusy(true);
            try { await cycleStatus(undoTarget.p, undoTarget.key, assignedBrand); }
            finally { setUndoBusy(false); setUndoTarget(null); }
          }}
          onCancel={() => setUndoTarget(null)}
        />
      )}

      {treatmentRemoveAsk && (
        <ConfirmDialog
          variant="warning"
          icon={RotateCcw}
          title="Remove treatment?"
          subtitle="Category III Treatment"
          message={<><strong>{treatmentRemoveAsk.treatment.product}</strong> goes back to <strong>not given</strong>.</>}
          details={[
            ['Patient', titleCaseWords(getName(treatmentRemoveAsk.p))],
            ['Product', treatmentRemoveAsk.treatment.product],
            ['Amount', amountText(treatmentRemoveAsk.treatment)],
            ['Date', treatmentRemoveAsk.treatment.date ? fmtDate(treatmentRemoveAsk.treatment.date) : ''],
            ['Stock', !treatmentRemoveAsk.treatment.stockDeducted ? 'No stock was deducted for it'
              : treatmentRemoveAsk.treatment.ml != null ? 'Recorded in mL: no vial returned'
              : `+1 vial returned to ${treatmentRemoveAsk.treatment.itemName || 'Inventory'}`],
          ]}
          note="Use this only when this treatment was recorded by mistake."
          confirmLabel="Remove treatment"
          busy={treatmentBusy}
          busyLabel="Removing…"
          onConfirm={() => removeTreatment(treatmentRemoveAsk.p, treatmentRemoveAsk.treatment)}
          onCancel={() => setTreatmentRemoveAsk(null)}
        />
      )}

      {/* ── Toast notification banner ── */}
      <Toast
        msg={toast.msg}
        type={toast.type}
        onClose={() => setToast({ msg: '', type: '' })}
      />

      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  );
}