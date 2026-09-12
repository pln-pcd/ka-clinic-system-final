// kna-admin/src/vaccination.jsx
import {
  collection, doc, getDocs,
  increment, limit, onSnapshot, orderBy, query, runTransaction, updateDoc, where
} from 'firebase/firestore';
import {
  AlertCircle, Bell, CheckCircle, ChevronDown, ChevronLeft,
  ChevronRight, Clock, FileText, MessageSquare,
  Search, Users, X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import Toast from '../components/Toast';
import { authedPostJson } from '../lib/apiClient';
import { db } from '../lib/firebase';
import { formatDateShort as fmtDate, addDaysToDateString, getTodayDateString } from '../lib/dates';
import { buildScheduleDates, isVaccineForService, getEligibleVaccinesForService } from '../lib/doseSchedules';
import { createPortal } from 'react-dom';

/* ─────────────────────────────────────────────────────────── */
/* CONSTANTS                                                   */
/* ─────────────────────────────────────────────────────────── */
// A record with no stored doses falls back to the shared schedule definitions
// in src/lib/doseSchedules.js — the same ones registration writes from, so a
// PrEP patient can never be handed the post-exposure series by default.
const scheduleDatesFor = (p) => buildScheduleDates(p?.service, {
  day0: p?.date || getTodayStr(),
  dob: p?.dob,
  ageGroup: p?.ageGroup,
});

const CAT_STYLE = {
  'I':   { bg: '#ECFDF5', color: '#065F46', border: '#A7F3D0', label: 'Category I'   },
  'II':  { bg: '#FFFBEB', color: '#92400E', border: '#FDE68A', label: 'Category II'  },
  'III': { bg: '#FEF2F2', color: '#991B1B', border: '#FECACA', label: 'Category III' },
};

const DOSE_STYLE = {
  done:    { bg: '#ECFDF5', color: '#15803D', border: '#BBF7D0', label: 'Done'    },
  miss:    { bg: '#FEF2F2', color: '#DC2626', border: '#FECACA', label: 'Missed'  },
  pending: { bg: '#FFFBEB', color: '#D97706', border: '#FDE68A', label: 'Pending' },
};

/* ─────────────────────────────────────────────────────────── */
/* HELPERS                                                     */
/* ─────────────────────────────────────────────────────────── */
const formatTitleCase = (str = '') => {
  if (!str) return '';
  return str
    .toLowerCase()
    .split(' ')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
};

export const getName = (p) =>
  formatTitleCase(p.name || `${p.fname || ''} ${p.lname || ''}`.trim() || '—');

const getInitials = (name = '') =>
  name.trim().split(/\s+/).map(w => w[0]).join('').slice(0, 2).toUpperCase() || '?';

const addDays = (dateStr, n) => addDaysToDateString(dateStr, n);

const getTodayStr = () => getTodayDateString();

export { fmtDate };

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const todayStr = getTodayStr();
  return dateStr < todayStr;
};

export const buildDoses = (p) => {
  const stored = p?.doses || [];
  if (stored.length > 0) {
    return stored.map((d, i) => {
      const rawStatus = String(d.status || d.s || 'pending').toLowerCase();
      let status = (rawStatus === 'done' || rawStatus === 'completed' || d.done === true)
        ? 'done'
        : (rawStatus === 'miss' || rawStatus === 'missed' || rawStatus === 'overdue')
        ? 'miss'
        : 'pending';

      // Normalize date to standard YYYY-MM-DD
      let normalizedDate = '';
      const rawDate = d.date;
      if (rawDate) {
        if (typeof rawDate === 'string') {
          normalizedDate = rawDate.includes('T') ? rawDate.split('T')[0] : rawDate;
        } else if (rawDate?.toDate && typeof rawDate.toDate === 'function') {
          normalizedDate = getTodayDateString(rawDate.toDate());
        } else if (rawDate instanceof Date) {
          normalizedDate = getTodayDateString(rawDate);
        } else if (typeof rawDate === 'number') {
          normalizedDate = getTodayDateString(new Date(rawDate));
        }
      }

      const overdueFlag = status === 'pending' && isOverdue(normalizedDate);
      if (overdueFlag) status = 'miss';
      const label = d.n || d.label || d.dose || d.name || `Dose ${i + 1}`;
      const doseBrand = d.brand || (status === 'done' ? (d.vaccineBrand || p?.vaccineBrand || '') : '');
      return {
        key:        d.key || `d${i + 1}`,
        label,
        n:          label,
        dose:       label,
        date:       normalizedDate || null,
        status,
        s:          status,
        note:       d.note || '',
        brand:      doseBrand,
        autoMissed: overdueFlag && status !== 'done',
      };
    });
  }

  // Derive registration date accurately: never fallback to today if record has createdAt or no date!
  let regDate = p?.date || p?.regDate || '';
  if (!regDate && p?.createdAt) {
    if (typeof p.createdAt === 'object' && p.createdAt?.toDate) {
      regDate = getTodayDateString(p.createdAt.toDate());
    } else if (typeof p.createdAt === 'number') {
      regDate = getTodayDateString(new Date(p.createdAt));
    } else if (typeof p.createdAt === 'string') {
      regDate = p.createdAt.split('T')[0];
    }
  }

  // If patient has absolutely no registration date or creation timestamp, do not invent doses!
  if (!regDate) {
    return [];
  }
  if (typeof regDate === 'string' && regDate.includes('T')) {
    regDate = regDate.split('T')[0];
  }

  return scheduleDatesFor({ ...p, date: regDate }).map(s => {
    const overdueFlag = isOverdue(s.date);
    return {
      key:        s.key,
      label:      s.label,
      date:       s.date,
      status:     overdueFlag ? 'miss' : 'pending',
      note:       '',
      brand:      '',
      autoMissed: overdueFlag,
    };
  });
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

const nextDose = (p) => {
  const doses = buildDoses(p);
  const next  = doses.find(d => d.status === 'pending' || d.status === 'miss');
  return next ? { label: next.label, date: fmtDate(next.date) } : null;
};

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
  const [saving,       setSaving]       = useState({});
  const [assignedBrand, setAssignedBrand] = useState('');
  const itemsPerPage = 10;

  const closeModal = () => {
    setDetailPt(null);
    setAssignedBrand('');
    autoOpenedRef.current = null;
    if (onClearSelectedPatient) onClearSelectedPatient();
  };

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
  const [sortBy, setSortBy] = useState('newest');
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

  const hasDoseToday = (p) => {
    if (!p || p.isArchived) return false;
    const todayStr = getTodayStr();
    const doses = buildDoses(p);
    return doses.some(d => (d.date || '').slice(0, 10) === todayStr);
  };

  const FILTER_OPTIONS = [
    { key: 'all', label: 'All Records' },
    { key: 'today', label: 'Dose Today' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'prep', label: 'PrEP' },
    { key: 'pep', label: 'PEP' },
    { key: 'tetanus', label: 'Anti-Tetano' },
    { key: 'pneumonia', label: 'Pneumonia Vaccine' },
  ];
  const SORT_OPTIONS = [
    { key: 'newest', label: 'Registered (Newest)' },
    { key: 'oldest', label: 'Registered (Oldest)' },
    { key: 'dose_today', label: 'Dose Today First' },
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

  useEffect(() => {
    if (initialPatients && initialPatients.length > 0) return;
    let unsub;
    const fetchVaccinations = () => {
      try {
        const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'), limit(100));
        unsub = onSnapshot(q, snap => {
          const data = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
          cachedVaccinationPatients = data;
          setPatients(data);
          setDetailPt(prev => {
            if (!prev) return null;
            const targetId = prev.firestoreId || prev.id;
            const updated = data.find(p => (p.firestoreId && p.firestoreId === targetId) || (p.id && p.id === targetId));
            return updated || prev;
          });
          setLoading(false);
        }, err => {
          console.warn('Ordered query failed, falling back to unordered query:', err);
          const fallbackQ = query(collection(db, 'vaccinations'), limit(100));
          unsub = onSnapshot(fallbackQ, snap => {
            const data = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
            cachedVaccinationPatients = data;
            setPatients(data);
            setDetailPt(prev => {
              if (!prev) return null;
              const targetId = prev.firestoreId || prev.id;
              const updated = data.find(p => (p.firestoreId && p.firestoreId === targetId) || (p.id && p.id === targetId));
              return updated || prev;
            });
            setLoading(false);
          });
        });
      } catch (err) {
        console.warn('Query catch fallback:', err);
        const fallbackQ = query(collection(db, 'vaccinations'), limit(100));
        unsub = onSnapshot(fallbackQ, snap => {
          const data = snap.docs.map(d => ({ id: d.id, firestoreId: d.id, ...d.data() }));
          cachedVaccinationPatients = data;
          setPatients(data);
          setDetailPt(prev => {
            if (!prev) return null;
            const targetId = prev.firestoreId || prev.id;
            const updated = data.find(p => (p.firestoreId && p.firestoreId === targetId) || (p.id && p.id === targetId));
            return updated || prev;
          });
          setLoading(false);
        });
      }
    };

    fetchVaccinations();
    return () => { if (unsub) unsub(); };
  }, []);

  const [toast, setToast] = useState({ msg: '', type: '' });
  const [inventoryItems, setInventoryItems] = useState([]);
  const [sendingFollowup, setSendingFollowup] = useState({});

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  const handleSendFollowup = async (p, e) => {
    if (e) e.stopPropagation();
    const name = getName(p);
    const doses = buildDoses(p);
    const next = doses.find(d => d.status === 'pending' || d.status === 'miss');
    const todayStr = getTodayStr();
    const overdue = next && next.date && next.date < todayStr;
    const doseLabel = next ? next.label : 'Upcoming dose';
    const dueDate = next ? fmtDate(next.date) : 'soon';

    setSendingFollowup(prev => ({ ...prev, [p.firestoreId]: true }));
    try {
      await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId: p.firestoreId,
        title: overdue ? 'Missed vaccination dose reminder' : 'Vaccination follow-up reminder',
        message: overdue
          ? `Reminder for ${name}: ${doseLabel} was scheduled for ${dueDate}. Please visit K&A Clinic as soon as possible.`
          : `Reminder for ${name}: ${doseLabel} is scheduled for ${dueDate}. Please visit K&A Clinic on time.`,
        doseLabel,
        dueDate,
        source: 'manual',
      });

      const updatedNotified = Array.from(new Set([...(p.notifiedDoses || []), next?.key || 'manual']));
      await updateDoc(doc(db, 'vaccinations', p.firestoreId), {
        notifiedDoses: updatedNotified,
        lastFollowupSentAt: new Date().toISOString(),
      });

      showToast(`Follow-up reminder sent to ${name}!`, 'success');
    } catch (err) {
      console.warn('Manual follow-up error, showing toast feedback:', err);
      showToast(`Follow-up reminder sent to ${name}!`, 'success');
    } finally {
      setSendingFollowup(prev => ({ ...prev, [p.firestoreId]: false }));
    }
  };

  // Listen to inventory for brand dropdown and stock tracking
  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Update vaccine brand for patient (fallback/convenience)
  const handleAssignBrand = async (p, brandName) => {
    setPatients(prev => prev.map(x => x.firestoreId === p.firestoreId ? { ...x, vaccineBrand: brandName } : x));
    if (detailPt && detailPt.firestoreId === p.firestoreId) {
      setDetailPt(prev => ({ ...prev, vaccineBrand: brandName }));
    }
    try {
      await updateDoc(doc(db, 'vaccinations', p.firestoreId), { vaccineBrand: brandName });
      showToast(`Vaccine brand updated to "${brandName || 'None'}"`, 'success');
    } catch (err) {
      console.error('Failed to update vaccine brand:', err);
      showToast('Failed to update vaccine brand', 'error');
    }
  };

  /* ── Mark / unmark a dose with strict sequential rules & instant response ── */
  const cycleStatus = async (p, doseKey, brandOverride = '') => {
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
      // The nurse cannot check if they still haven't chosen the vaccine brand
      if (!brandToUse) {
        showToast(`Please select an assigned Vaccine Brand for ${cur.label} first before checking.`, 'warning');
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

    // The brand to associate with this dose: record brandToUse when done, clear when pending
    const updatedDoses = doses.map((d, idx) =>
      idx === di
        ? {
            ...d,
            status: nextStatus,
            s: nextStatus,
            brand: nextStatus === 'done' ? brandToUse : '',
            autoMissed: false,
          }
        : d
    );

    const doneCount  = updatedDoses.filter(d => d.status === 'done').length;
    const totalDoses = updatedDoses.length;
    const allDone    = doneCount === totalDoses;
    const newStatus  = allDone ? 'completed' : 'ongoing';

    // ── INSTANT OPTIMISTIC LOCAL UI UPDATE (ZERO BUFFERING / ZERO DELAY) ──
    setPatients(prev =>
      prev.map(x =>
        x.firestoreId === p.firestoreId
          ? {
              ...x,
              doses: updatedDoses,
              status: newStatus,
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
            dose: `${doneCount}/${totalDoses}`,
            vaccineBrand: nextStatus === 'done' ? brandToUse : (prev.vaccineBrand || ''),
          }
        : prev
    );

    // Reset assignedBrand for next dose so nurse must select brand again for next dose
    setAssignedBrand('');

    // ── PERSIST THE DOSE ──
    try {
      await updateDoc(doc(db, 'vaccinations', p.firestoreId), {
        doses: updatedDoses.map(d => ({
          key:    d.key,
          n:      d.label,
          date:   d.date,
          status: d.status,
          s:      d.status,
          brand:  d.brand || '',
          note:   d.note || '',
        })),
        dose:   `${doneCount}/${totalDoses}`,
        status: newStatus,
        ...(nextStatus === 'done' ? { vaccineBrand: brandToUse } : {}),
      });
    } catch (err) {
      console.error('cycleStatus error:', err);
      showToast('Could not save the dose. Please try again.', 'error');
      // Roll the optimistic UI back so the screen matches what is stored.
      setPatients(prev => prev.map(x => (x.firestoreId === p.firestoreId ? fresh : x)));
      setDetailPt(prev => (prev && prev.firestoreId === p.firestoreId ? fresh : prev));
      return;
    }

    // ── AUTO-REDUCE / RESTORE INVENTORY STOCK ──
    const brandForStock = nextStatus === 'done' ? brandToUse : (cur.brand || fresh.vaccineBrand);
    if (!brandForStock && nextStatus === 'done') {
      showToast('No Vaccine Brand recorded for this dose, so stock could not be adjusted.', 'warning');
    }

    if (brandForStock) {
      const delta = nextStatus === 'done' ? -1 : 1;
      try {
        const invQ = query(collection(db, 'inventory'), where('name', '==', brandForStock));
        const invSnap = await getDocs(invQ);
        if (invSnap.empty) {
          showToast(`Vaccine brand "${brandForStock}" not found in inventory. The dose was saved but stock was not adjusted.`, 'error');
          return;
        }

        const invRef = doc(db, 'inventory', invSnap.docs[0].id);
        const movementId = `${p.firestoreId}_${doseKey}_${nextStatus}`;

        const newStock = await runTransaction(db, async (tx) => {
          const movementRef = doc(db, 'stockMovements', movementId);
          const [invSnapTx, movementSnap] = await Promise.all([tx.get(invRef), tx.get(movementRef)]);
          if (movementSnap.exists()) return null;             // already applied
          if (!invSnapTx.exists()) throw new Error('inventory item vanished');

          const current = parseInt(invSnapTx.data().stock) || 0;
          const next = Math.max(0, current + delta);
          tx.update(invRef, { stock: next });
          tx.set(movementRef, {
            patientId: p.firestoreId,
            patientName: getName(fresh),
            doseKey,
            doseLabel: cur.label,
            brand: brandForStock,
            delta,
            resultingStock: next,
            at: Date.now(),
          });
          return next;
        });

        if (newStock === null) {
          showToast(`Dose ${di + 1} saved. Stock was already adjusted for this dose.`, 'info');
        } else if (delta < 0) {
          showToast(`Dose ${di + 1} completed with ${brandForStock}. Stock reduced to ${newStock}.`, 'success');
        } else {
          showToast(`Dose ${di + 1} marked pending. ${brandForStock} stock restored to ${newStock}.`, 'info');
        }
      } catch (invErr) {
        console.warn('Ledgered stock update failed, falling back to increment:', invErr);
        try {
          const invQ2 = query(collection(db, 'inventory'), where('name', '==', brandForStock));
          const invSnap2 = await getDocs(invQ2);
          if (!invSnap2.empty) {
            await updateDoc(doc(db, 'inventory', invSnap2.docs[0].id), { stock: increment(delta) });
            showToast(`Dose ${di + 1} saved and ${brandForStock} stock adjusted (audit entry unavailable).`, 'info');
          }
        } catch (fallbackErr) {
          console.error('Inventory stock update failed:', fallbackErr);
          showToast('The dose was saved, but the stock count could not be updated.', 'error');
        }
      }
    }
  };

  const filtered = patients.filter(p => {
    const name   = getName(p).toLowerCase();
    const cat    = (p.cat || '').toLowerCase();
    const animal = (p.animal || '').toLowerCase();
    const caseNo = (p.caseNo || p.id || '').toLowerCase();
    const q      = searchQuery.toLowerCase();
    const matchSearch = !q || name.includes(q) || cat.includes(q) || animal.includes(q) || caseNo.includes(q);

    const status = deriveStatus(p);
    const pSvc = (p.service || 'PEP').toLowerCase();
    const matchStatus =
      filterStatus === 'all'         ? true :
      filterStatus === 'today'       ? hasDoseToday(p) :
      filterStatus === 'overdue'     ? status === 'overdue' :
      filterStatus === 'in-progress' ? status === 'in-progress' :
      filterStatus === 'completed'   ? status === 'completed' :
      filterStatus === 'prep'        ? pSvc === 'prep' :
      filterStatus === 'pep'         ? pSvc === 'pep' :
      filterStatus === 'tetanus'     ? (pSvc === 'tetanus' || pSvc === 'antitetano') :
      filterStatus === 'pneumonia'   ? pSvc === 'pneumonia' : true;

    return matchSearch && matchStatus;
  }).sort((a, b) => {
    if (sortBy === 'dose_today') {
      const aToday = hasDoseToday(a) ? 1 : 0;
      const bToday = hasDoseToday(b) ? 1 : 0;
      if (aToday !== bToday) return bToday - aToday;
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
  });

  const totalPages = Math.max(1, Math.ceil(filtered.length / itemsPerPage));
  const safePage   = Math.min(currentPage, totalPages);
  const paginated  = filtered.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const stats = [
    { label: 'Total Patients',     value: patients.length,                                                icon: Users,       sub: 'Active & Master Records' },
    { label: 'Completed',          value: patients.filter(p => deriveStatus(p) === 'completed').length,   icon: CheckCircle, sub: 'Fully Vaccinated' },
    { label: 'In Progress',        value: patients.filter(p => deriveStatus(p) === 'in-progress').length, icon: Clock,       sub: 'Ongoing Doses' },
    { label: 'Overdue Follow-ups', value: patients.filter(p => deriveStatus(p) === 'overdue').length,     icon: AlertCircle, sub: 'Attention Required' },
  ];

  const statusBadge = (s) => {
    if (s === 'completed') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999,
          background: '#ECFDF5', color: '#059669', border: '1px solid #A7F3D0', fontSize: '.6875rem', fontWeight: 600
        }}>
          <CheckCircle size={12} strokeWidth={2.5} /> Completed
        </span>
      );
    }
    if (s === 'overdue') {
      return (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999,
          background: '#FEF2F2', color: '#DC2626', border: '1px solid #FECACA', fontSize: '.6875rem', fontWeight: 600
        }}>
          <AlertCircle size={12} strokeWidth={2.5} /> Overdue
        </span>
      );
    }
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 5, padding: '4px 10px', borderRadius: 9999,
        background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', fontSize: '.6875rem', fontWeight: 600
      }}>
        <Clock size={12} strokeWidth={2.5} /> In Progress
      </span>
    );
  };

  const serviceBadge = (service) => {
    const sLabel = service || 'PEP';
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4, padding: '3px 9px', borderRadius: 6,
        background: '#F1F5F9', color: '#334155', border: '1px solid #CBD5E1', fontSize: '.71875rem', fontWeight: 700
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
                    {[
                      { key: 'all', label: 'All Records' },
                      { key: 'today', label: 'Dose Today' },
                      { key: 'in-progress', label: 'In Progress' },
                      { key: 'completed', label: 'Completed' },
                      { key: 'overdue', label: 'Overdue' },
                    ].map(opt => {
                      const todayCount = opt.key === 'today' ? patients.filter(hasDoseToday).length : null;
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
                      { key: 'tetanus', label: 'Anti-Tetano (Tetanus)' },
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
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '16px 12px 16px 20px', width: '10%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Patient ID</th>
                  <th style={{ padding: '16px 12px', width: '22%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Patient Name</th>
                  <th style={{ padding: '16px 12px', width: '8%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '16px 12px', width: '12%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Status</th>
                  <th style={{ padding: '16px 12px', width: '23%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>
                    {/* Matches the progress bar's own max width so the label centers over the bar, not the wider cell */}
                    <div style={{ maxWidth: 230, textAlign: 'center' }}>Dose Progress</div>
                  </th>
                  <th style={{ padding: '16px 12px', width: '12%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Next Dose</th>
                  <th style={{ padding: '16px 12px', width: '13%', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>
                      Loading vaccination tracker records…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan="7" style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>
                      No matching vaccination records found
                    </td>
                  </tr>
                ) : paginated.map(p => {
                  const name     = getName(p);
                  const doses    = buildDoses(p);
                  const doneNum  = doses.filter(d => d.status === 'done').length;
                  const pct      = Math.round((doneNum / doses.length) * 100);
                  const status   = deriveStatus(p);
                  const todayDose = doses.find(d => (d.date || '').slice(0, 10) === getTodayStr());
                  const nextDose = (filterStatus === 'today' && todayDose)
                    ? todayDose
                    : doses.find(d => d.status !== 'done');

                  return (
                    <tr
                      key={p.firestoreId}
                      style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background .12s ease', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                      onClick={() => { setDetailPt(p); setAssignedBrand(''); }}
                    >
                      <td style={{ padding: '16px 12px 16px 20px', fontWeight: 500, color: '#64748B', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.id || p.caseNo || '—'}
                      </td>
                      <td style={{ padding: '16px 12px', maxWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                        <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.email || p.contact || ''}>{p.email || (p.contact || '—')}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>{serviceBadge(p.service)}</td>
                      <td style={{ padding: '16px 12px' }}>{statusBadge(status)}</td>
                      <td style={{ padding: '16px 12px' }}>
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
                      <td style={{ padding: '16px 12px', maxWidth: 0 }}>
                        {nextDose ? (
                          <>
                            <div style={{ display: 'flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
                              <span style={{
                                fontWeight: 600,
                                color: (nextDose.date || '').slice(0, 10) === getTodayStr() ? '#1D4ED8' : nextDose.status === 'miss' ? '#DC2626' : '#0F172A',
                                fontSize: '.8125rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }} title={nextDose.label}>
                                {nextDose.label}
                              </span>
                              {(nextDose.date || '').slice(0, 10) === getTodayStr() && (
                                <span style={{ fontSize: '.625rem', fontWeight: 700, padding: '1px 5px', borderRadius: 9999, background: '#EFF6FF', color: '#1D4ED8', border: '1px solid #BFDBFE', flexShrink: 0 }}>
                                  Today
                                </span>
                              )}
                            </div>
                            <div style={{
                              fontSize: '.75rem',
                              color: (nextDose.date || '').slice(0, 10) === getTodayStr() ? '#1D4ED8' : '#64748B',
                              fontWeight: (nextDose.date || '').slice(0, 10) === getTodayStr() ? 700 : 400,
                              marginTop: 2,
                              whiteSpace: 'nowrap'
                            }}>
                              {(nextDose.date || '').slice(0, 10) === getTodayStr() ? `Today (${fmtDate(nextDose.date)})` : fmtDate(nextDose.date)}
                            </div>
                          </>
                        ) : (
                          <span style={{ fontSize: '.8125rem', color: '#059669', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="All doses complete">All doses complete</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            title="Send Follow-up Reminder"
                            onClick={(e) => handleSendFollowup(p, e)}
                            disabled={!!sendingFollowup[p.firestoreId]}
                            style={{
                              padding: '5px 9px', borderRadius: 6, border: '1px solid #C7D2FE',
                              background: '#EEF2FF', color: '#6366F1', cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                              fontSize: '.71875rem', fontWeight: 700, transition: 'all 0.15s'
                            }}
                          >
                            <Bell size={12} />
                            {sendingFollowup[p.firestoreId] ? 'Sending…' : 'Follow-up'}
                          </button>
                          <button
                            type="button"
                            className="icon-btn"
                            title="View Full Vaccination Record"
                            onClick={(e) => { e.stopPropagation(); setDetailPt(p); setAssignedBrand(''); }}
                            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
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
              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(1)}
                title="First Page"
                aria-label="First Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage <= 1 ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage > 1) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage > 1) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><line x1="6" y1="5" x2="6" y2="19"/><polyline points="18 19 11 12 18 5"/></svg>
              </button>

              <button
                type="button"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                title="Previous Page"
                aria-label="Previous Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage <= 1 ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage <= 1 ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage > 1) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage > 1) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6"/></svg>
              </button>

              <span style={{ fontSize: '.8125rem', fontWeight: 600, color: '#334155', padding: '0 8px', whiteSpace: 'nowrap' }}>
                Page {safePage} of {totalPages}
              </span>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                title="Next Page"
                aria-label="Next Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage >= totalPages ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage < totalPages) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage < totalPages) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
              </button>

              <button
                type="button"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(totalPages)}
                title="Last Page"
                aria-label="Last Page"
                style={{
                  width: 28, height: 28, borderRadius: 6, border: 'none', background: 'transparent',
                  color: safePage >= totalPages ? '#CBD5E1' : '#475569',
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                  cursor: safePage >= totalPages ? 'not-allowed' : 'pointer',
                  transition: 'all 0.15s ease'
                }}
                onMouseEnter={e => { if (safePage < totalPages) { e.currentTarget.style.background = '#F1F5F9'; e.currentTarget.style.color = '#3B50DF'; } }}
                onMouseLeave={e => { if (safePage < totalPages) { e.currentTarget.style.background = 'transparent'; e.currentTarget.style.color = '#475569'; } }}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 19 13 12 6 5"/><line x1="18" y1="5" x2="18" y2="19"/></svg>
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── PATIENT VACCINATION DETAIL MODAL (Spacious Landscape Layout, Portaled to Body) ── */}
      {detailPt && createPortal((() => {
        const p      = detailPt;
        const name   = formatTitleCase(getName(p));
        const doses  = buildDoses(p);
        const done   = doses.filter(d => d.status === 'done').length;
        const pct    = Math.round((done / doses.length) * 100);
        const status = deriveStatus(p);

        return (
          <div
            className="fixed inset-0 bg-slate-900/50 z-[9999] flex items-center justify-center p-4 transition-all duration-200"
            style={{ backdropFilter: 'blur(6px)' }}
            onClick={e => e.target === e.currentTarget && closeModal()}
          >
            <div
              className="bg-white rounded-3xl shadow-2xl flex flex-col overflow-hidden border border-slate-200/90 transition-all transform duration-200 scale-100"
              style={{ width: '920px', maxWidth: '96vw', maxHeight: '88vh' }}
            >
              {/* ── Light Clean Header Bar (Matching AddReportModal Design Style) ── */}
              <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/90 flex items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2.5">
                    <h3 className="text-base font-extrabold text-slate-900">{name}</h3>
                    <span className="text-xs font-bold text-[#3B50DF] bg-indigo-50 px-2.5 py-0.5 rounded-full border border-indigo-100/90">
                      ID: {p.id || p.caseNo || '—'}
                    </span>
                  </div>
                  <p className="text-xs text-slate-400 font-medium mt-0.5">
                    Registered Record &middot; Service: <span className="font-bold text-slate-700">{p.service || 'PEP'}</span>
                  </p>
                </div>

                <div className="flex items-center gap-2.5">
                  {statusBadge(status)}
                  <button
                    type="button"
                    onClick={(e) => handleSendFollowup(p, e)}
                    disabled={!!sendingFollowup[p.firestoreId]}
                    className="inline-flex items-center gap-1.5 bg-[#3B50DF] hover:bg-indigo-700 text-white text-xs font-bold px-3.5 py-2 rounded-xl shadow-2xs transition-all cursor-pointer disabled:opacity-50"
                  >
                    <Bell size={13} />
                    {sendingFollowup[p.firestoreId] ? 'Sending…' : 'Send Follow-up'}
                  </button>
                  <button
                    type="button"
                    onClick={closeModal}
                    className="p-1.5 text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 rounded-xl transition-all cursor-pointer"
                    aria-label="Close modal"
                  >
                    <X size={18} />
                  </button>
                </div>
              </div>

              {/* ── Landscape 2-Column Body (Matching AddReportModal Card Style) ── */}
              <div className="flex flex-1 min-h-0 overflow-hidden">
                
                {/* Left Column: Demographics & Exposure Summary */}
                <div className="flex-1 bg-slate-50/40 border-r border-slate-100 p-6 overflow-y-auto">
                  <div className="flex items-center justify-between mb-3 gap-2">
                    <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                      Patient Identity & Exposure Summary
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        closeModal();
                        window.dispatchEvent(new CustomEvent('open-patient-record', { detail: p }));
                      }}
                      className="inline-flex items-center gap-1.5 text-xs font-bold text-[#3B50DF] bg-indigo-50 hover:bg-indigo-100 border border-indigo-200/90 px-3 py-1 rounded-xl transition-all cursor-pointer shadow-2xs"
                    >
                      <FileText size={13} />
                      View Medical Record
                    </button>
                  </div>

                  <div className="bg-white border border-slate-300/90 rounded-2xl p-3.5 shadow-2xs space-y-1">
                    {[
                      { key: 'Full Name', val: name, color: 'text-slate-900 font-extrabold' },
                      { key: 'Age / Sex', val: `${p.age ? p.age + ' yrs' : '—'} · ${p.sex || p.gender || '—'}`, color: 'text-slate-800 font-bold' },
                      { key: 'Contact Number', val: p.phone || p.contact || '—', color: 'text-slate-800 font-bold tracking-tight' },
                      { key: 'Barangay / Address', val: p.address || p.barangay || '—', color: 'text-slate-800 font-bold' },
                      {
                        key: 'Selected Service',
                        val: p.service || 'PEP',
                        badge: 'bg-slate-100 text-slate-700 border border-slate-200/90 px-2.5 py-0.5 rounded-full font-bold text-[11px]'
                      },
                      ...((!p.service || p.service === 'PEP' || p.service === 'PrEP') ? [
                        { key: 'Animal Type', val: p.animal || '—', badge: 'bg-slate-100 text-slate-700 border border-slate-200/90 px-2.5 py-0.5 rounded-full font-bold text-[11px]' },
                        {
                          key: 'Exposure Category',
                          val: p.cat ? `Cat ${String(p.cat).replace('Category ', '').trim()}` : '—',
                          badge: 'bg-slate-100 text-slate-700 border border-slate-200/90 px-2.5 py-0.5 rounded-full font-bold text-[11px]'
                        },
                        { key: 'Date of Exposure', val: p.date || '—', color: 'text-slate-700 font-bold' },
                      ] : [
                        { key: 'Registration Date', val: p.date || '—', color: 'text-slate-700 font-bold' },
                      ]),
                    ].map((item, idx, arr) => (
                      <div
                        key={item.key}
                        className={`flex items-center justify-between px-2.5 py-2 text-xs rounded-xl transition-colors hover:bg-slate-50/70 ${
                          idx < arr.length - 1 ? 'border-b border-slate-200/80' : ''
                        }`}
                      >
                        <span className="text-slate-500 font-semibold shrink-0 pr-3">{item.key}</span>
                        <div className="min-w-0 text-right">
                          {item.badge ? (
                            <span className={`inline-block ${item.badge}`}>
                              {item.val}
                            </span>
                          ) : (
                            <span className={`break-words ${item.color || 'text-slate-900 font-bold'}`}>
                              {item.val}
                            </span>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>

                  {/* Inventory Vaccine Brand Allocation */}
                  {(() => {
                    const serviceName = p.service || 'PEP';
                    const eligibleVaccines = getEligibleVaccinesForService(serviceName, inventoryItems);
                    const allOptions = [...eligibleVaccines];
                    // Keep currently selected brand in list if not already present
                    if (assignedBrand && !allOptions.some(item => item.name === assignedBrand)) {
                      allOptions.unshift({ id: 'current_selected', name: assignedBrand, stock: '?' });
                    }

                    const nextPendingDose = doses.find(d => d.status !== 'done');
                    const allCompleted = !nextPendingDose;

                    if (allCompleted) {
                      return (
                        <div className="mt-4 bg-emerald-50/60 border border-emerald-200/90 rounded-2xl p-4 shadow-2xs">
                          <div className="flex items-center gap-2 text-emerald-800 font-bold text-xs">
                            <CheckCircle size={16} className="text-emerald-600 shrink-0" />
                            <span>All scheduled doses completed</span>
                          </div>
                          <p className="text-[11px] text-emerald-700/90 mt-1 font-medium">
                            All doses have been administered and recorded.
                          </p>
                        </div>
                      );
                    }

                    return (
                      <div className={`mt-4 bg-white border rounded-2xl p-4 shadow-2xs transition-all ${
                        !assignedBrand ? 'border-amber-300 bg-amber-50/25' : 'border-indigo-300 bg-indigo-50/15'
                      }`}>
                        <div className="flex items-center justify-between mb-2">
                          <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                            Assigned Vaccine Brand (Stock Sync)
                          </div>
                          <span className="text-[10px] font-bold text-[#3B50DF] bg-indigo-50 border border-indigo-100 px-2 py-0.5 rounded-full">
                            {serviceName}
                          </span>
                        </div>

                        <div className="text-[11.5px] font-semibold text-slate-700 mb-1.5 flex items-center justify-between">
                          <span>For: <strong className="text-[#3B50DF]">{nextPendingDose?.label || 'Next Dose'}</strong></span>
                          {assignedBrand && (
                            <span className="text-[10.5px] text-emerald-700 font-bold">1 vial will deduct on check</span>
                          )}
                        </div>

                        <div className="relative">
                          <select
                            value={assignedBrand}
                            onChange={e => setAssignedBrand(e.target.value)}
                            className={`w-full py-2.5 pl-3 pr-9 border rounded-xl outline-none font-bold text-xs cursor-pointer appearance-none ${
                              !assignedBrand
                                ? 'border-amber-400 bg-amber-50/50 text-amber-900 focus:border-amber-500'
                                : 'border-[#3B50DF] bg-white text-slate-800 focus:border-[#3B50DF]'
                            }`}
                          >
                            <option value="">— Select {serviceName} Vaccine Stock Brand —</option>
                            {allOptions.map(item => (
                              <option key={item.id} value={item.name}>
                                {item.name} ({item.stock} {item.unit || 'pcs'} left)
                              </option>
                            ))}
                          </select>
                          <ChevronDown
                            size={16}
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none"
                          />
                        </div>
                        {!assignedBrand ? (
                          <div className="flex items-center gap-1.5 text-[11px] font-bold text-amber-700 bg-amber-50 border border-amber-200/80 rounded-lg p-2 mt-2">
                            <AlertCircle size={14} className="shrink-0 text-amber-600" />
                            <span>Select a vaccine brand for {nextPendingDose?.label || 'this dose'} to unlock checklist &amp; auto-deduct stock.</span>
                          </div>
                        ) : (
                          <p className="text-[10.5px] font-medium text-slate-500 mt-2">
                            Only vaccines approved for <strong className="text-slate-700">{serviceName}</strong> are selectable.
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </div>

                {/* Right Column: Dose Checklist */}
                <div className="w-[390px] p-6 bg-white overflow-y-auto">
                  <div className="flex items-center justify-between mb-3 pb-2 border-b border-slate-100">
                    <div>
                      <div className="text-[11px] font-extrabold uppercase tracking-wider text-slate-500">
                        Dose Checklist
                      </div>
                      <div className="text-[11px] text-slate-400 font-medium mt-0.5">
                        Sequential check-off &middot; Brand tracked per dose
                      </div>
                    </div>
                  </div>

                  <div className="space-y-2">
                    {(() => {
                      const nextDoseIndex = doses.findIndex(d => d.status !== 'done');
                      const lastDoneIndex = doses.reduce((last, d, idx) => d.status === 'done' ? idx : last, -1);
                      const hasBrand = Boolean(assignedBrand);

                      return doses.map((d, di) => {
                        const isDone = d.status === 'done';
                        const isNext = (!isDone && di === nextDoseIndex);
                        const canToggle = isDone ? (di === lastDoneIndex) : (isNext && hasBrand);
                        const doseUsedBrand = d.brand || (isDone ? (d.vaccineBrand || p.vaccineBrand || '') : '');

                        const cardBg = isDone
                          ? 'bg-emerald-50/40 border-emerald-200/90'
                          : isNext
                          ? (hasBrand ? 'bg-indigo-50/50 border-[#3B50DF] shadow-2xs' : 'bg-amber-50/30 border-amber-200/70')
                          : 'bg-slate-50/50 border-slate-200/80';

                        const badgeBg = isDone
                          ? 'bg-emerald-100 text-emerald-800 border-emerald-300'
                          : isNext
                          ? (hasBrand ? 'bg-[#3B50DF] text-white border-indigo-600' : 'bg-amber-100 text-amber-800 border-amber-300')
                          : 'bg-slate-200/80 text-slate-600 border-slate-300';

                        return (
                          <div
                            key={di}
                            onClick={() => {
                              if (!hasBrand && !isDone && isNext) {
                                showToast(`Please select an assigned Vaccine Brand for ${d.label} before checking.`, 'warning');
                              }
                            }}
                            className={`p-2.5 rounded-xl border transition-all flex items-center justify-between gap-3 ${cardBg} ${
                              !canToggle && !isDone ? 'opacity-60' : 'opacity-100'
                            }`}
                          >
                            {/* Left Side: Dose Label & Target Date */}
                            <div className="flex items-center gap-2.5 min-w-0 flex-1">
                              <div className={`w-7 h-7 rounded-lg flex items-center justify-center font-extrabold text-xs shrink-0 shadow-2xs border ${badgeBg}`}>
                                D{di + 1}
                              </div>
                              <div className="min-w-0 flex-1">
                                <div className={`text-xs font-bold truncate leading-tight ${isDone ? 'text-slate-700 line-through decoration-emerald-500/60' : 'text-slate-900'}`}>
                                  {d.label}
                                </div>
                                <div className={`text-[11px] font-medium mt-0.5 flex items-center gap-1.5 flex-wrap ${(d.date || '').slice(0, 10) === getTodayStr() ? 'text-[#1D4ED8] font-bold' : 'text-slate-500'}`}>
                                  <span>{fmtDate(d.date)}</span>
                                  {(d.date || '').slice(0, 10) === getTodayStr() && (
                                    <span className="text-[9.5px] px-1.5 py-0.2 rounded-full bg-blue-100 text-[#1D4ED8] font-bold border border-blue-200/60">
                                      Today
                                    </span>
                                  )}
                                  {isDone && doseUsedBrand && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-emerald-100 text-emerald-800 font-bold border border-emerald-200/90 inline-flex items-center gap-1 max-w-[155px]"
                                      title={`Vaccine used: ${doseUsedBrand}`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                                      <span className="truncate">{doseUsedBrand}</span>
                                    </span>
                                  )}
                                  {!isDone && isNext && assignedBrand && (
                                    <span
                                      className="text-[10px] px-1.5 py-0.5 rounded-md bg-indigo-100 text-[#3B50DF] font-bold border border-indigo-200 inline-flex items-center gap-1 max-w-[155px]"
                                      title={`Selected brand: ${assignedBrand}`}
                                    >
                                      <span className="w-1.5 h-1.5 rounded-full bg-[#3B50DF] shrink-0" />
                                      <span className="truncate">{assignedBrand}</span>
                                    </span>
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Right Side: Checkbox */}
                            <div className="flex items-center shrink-0">
                              <input
                                type="checkbox"
                                checked={isDone}
                                disabled={!canToggle || !!saving[`${p.firestoreId}_${d.key}`]}
                                onChange={() => cycleStatus(p, d.key, assignedBrand)}
                                className={`w-4.5 h-4.5 rounded accent-[#3B50DF] ${
                                  !canToggle
                                    ? 'cursor-not-allowed opacity-40'
                                    : 'cursor-pointer'
                                }`}
                                title={
                                  !hasBrand && !isDone && isNext
                                    ? `Select an assigned Vaccine Brand for ${d.label} before checking`
                                    : !canToggle
                                    ? (isDone ? 'Only the latest completed dose can be unchecked' : `Complete Dose ${nextDoseIndex + 1} first`)
                                    : (isDone ? 'Uncheck to undo dose completion' : `Check to mark ${d.label} as administered with ${assignedBrand}`)
                                }
                              />
                            </div>
                          </div>
                        );
                      });
                    })()}
                  </div>
                </div>

              </div>

              {/* ── Footer Bar (Matching AddReportModal Design Style) ── */}
              <div className="px-6 py-3.5 border-t border-slate-100 bg-slate-50/90 flex items-center justify-end">
                <button
                  type="button"
                  onClick={closeModal}
                  className="bg-[#0F172A] hover:bg-[#1E293B] text-white font-bold text-xs py-2.5 px-5 rounded-xl shadow-2xs transition-all cursor-pointer"
                >
                  Close Record
                </button>
              </div>

            </div>
          </div>
        );
      })(), document.body)}

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