// Patients page: the registry list and the flows it opens.
import { formatTitleCase, formatDateMedium, getTodayDateString, today } from "../../lib/formatters";
import { arrayUnion, collection, doc, getDocs, limit, query, runTransaction, serverTimestamp, setDoc, updateDoc, where, writeBatch } from "firebase/firestore";
import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import { db } from "../../lib/firebase";
import { peekLiveCollection, useLiveCollection } from '../../lib/liveStore';
import { buildDoses, buildInitialDoses } from "../../lib/doseSchedules";
import { getCompletionDate, getCompletionYear, getRegistrationYear } from "../../lib/patientArchive";
import Toast from "../../components/Toast";
import IconButton from "../../components/IconButton";
import { useTableReserve } from "../../components/Pager";
import EmptyState from "../../components/EmptyState";
import { ChevronLeft, ChevronRight, ChevronsLeft, ChevronsRight, Eye, Pencil, Users } from "lucide-react";
import { trackEvent } from "../../lib/analytics";
import { geocodeLibonAddress } from '../../lib/libonGeo';
import { ExportReportModal, ServiceBadge, derivePatientStatus, globalCSS } from "./shared";
import { AddPatientModal, DuplicatePatientModal, EditPatientModal, PinMapConfirmModal, findSimilarPatients, isValidPHPhone } from "./PatientForms";
import { FollowUpModal, MedicalRecordDetail } from "./PatientRecordView";

import { SkeletonRows } from "../../components/Skeleton";
const getName = (p) => (p?.name || [p?.fname, p?.lname].filter(Boolean).join(' ') || 'Unnamed Patient');

/* ─────────────────────────── DATA ─────────────────────────── */
const AVATAR_COLORS = ['#3D5AFE', '#06B6D4', '#F59E0B', '#22C55E', '#8B5CF6', '#EF4444', '#EC4899', '#14B8A6'];

/* ─────────────────────────── ROOT APP ─────────────────────────── */
export default function App({ initialOpenAddModal = false, onAddModalClosed } = {}) {
  const [patients, setPatients] = useState(() => peekLiveCollection('vaccinations').rows.map((d, i) => ({ ...d, color: AVATAR_COLORS[i % AVATAR_COLORS.length] })));
  const [loading, setLoading] = useState(() => !peekLiveCollection('vaccinations').loaded);
  const [selected, setSelected] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [showModal, setModal] = useState(initialOpenAddModal);
  const [editPatient, setEditPatient] = useState(null);
  const [toast, setToast] = useState({ msg: '', type: '' });
  const [pinTarget, setPinTarget] = useState(null);
  const [pinning, setPinning] = useState(false);
  const [exportModal, setExportModal] = useState(false);
  const [followUpTarget, setFollowUpTarget] = useState(null);

  useEffect(() => {
    if (initialOpenAddModal) {
      setModal(true);
    }
  }, [initialOpenAddModal]);

  const handleCloseAddModal = () => {
    setModal(false);
    if (onAddModalClosed) onAddModalClosed();
  };
  // Inventory items for vaccine brand dropdown
  const [inventoryItems, setInventoryItems] = useState(() => peekLiveCollection('inventory').rows);

  async function handlePinToMap(patientToPin) {
    if (!patientToPin) return;
    setPinning(true);
    try {
      const barangayVal = patientToPin.barangay || (patientToPin.address ? (patientToPin.address.match(/Brgy\.\s*([^,]+)/)?.[1] || 'San Juan') : 'San Juan');
      const zoneVal = patientToPin.zone || (patientToPin.address ? patientToPin.address.split(',')[0].replace(/Brgy\..*/, '').trim() : 'Zone 1');
      const locationStr = patientToPin.address || `${zoneVal ? zoneVal + ', ' : ''}Brgy. ${barangayVal}, Libon, Albay`;
      const exposureTypeVal = patientToPin.service === 'PEP' ? `${patientToPin.animal || 'Dog'} Bite` : (patientToPin.service || 'Dog Bite');
      const categoryVal = patientToPin.cat ? `Category ${patientToPin.cat}` : 'Category III';
      const exposureDateVal = patientToPin.date || getTodayDateString();

      const { lat, lng } = geocodeLibonAddress(barangayVal, zoneVal);

      // ABSOLUTE ANONYMIZATION — OMIT ALL PATIENT PERSONAL IDENTIFIERS.
      // The pin and the patient's link to it are written together, so a pin
      // never exists without the record it came from (firestore.rules only
      // accepts new incidents with source 'patient_record').
      if (!patientToPin.firestoreId) throw new Error('Save the patient record before pinning.');
      if (Array.isArray(patientToPin.incidentIds) && patientToPin.incidentIds.length) throw new Error('This record already has a pin.');
      if ((patientToPin.service || 'PEP') !== 'PEP') throw new Error('Only PEP (bite) records can be pinned.');
      const incidentRef = doc(collection(db, 'incidents'));
      const batch = writeBatch(db);
      batch.set(incidentRef, {
        location: locationStr,
        address: locationStr,
        barangay: barangayVal,
        zone: zoneVal,
        type: exposureTypeVal,
        category: categoryVal,
        // The note stays generic because the pin carries no patient identifiers.
        description: 'Pinned from a patient record. No identifying details attached.',
        date: exposureDateVal,
        lat,
        lng,
        latitude: lat,
        longitude: lng,
        source: 'patient_record',
        status: 'active',
        pinnedAt: Date.now(),
        createdAt: Date.now(),
      });
      // The link lives on the patient's side only, so the pin stays
      // anonymous; it lets the pin leave the map once the case completes.
      batch.update(doc(db, 'vaccinations', patientToPin.firestoreId), { incidentIds: arrayUnion(incidentRef.id) });
      await batch.commit();

      showToast('Incident pinned to public map! ✓', 'success');
      setPinTarget(null);
    } catch (err) {
      console.error('Pin incident error:', err);
      showToast('Failed to pin incident. Please try again.', 'error');
    } finally {
      setPinning(false);
    }
  }

  // Shared live data (lib/liveStore.js): shown at once from the session
  // cache when returning to this page, then kept live.
  const vaxLive = useLiveCollection('vaccinations');
  const invLive = useLiveCollection('inventory');
  useEffect(() => {
    if (!vaxLive.loaded) return;
    const data = vaxLive.rows.map((d, i) => ({ ...d, color: AVATAR_COLORS[i % AVATAR_COLORS.length] }));
    setPatients(data);
    setSelected(prev => prev ? (data.find(p => p.firestoreId === prev.firestoreId) || prev) : null);
    setLoading(false);
  }, [vaxLive]);
  useEffect(() => { setInventoryItems(invLive.rows); }, [invLive]);

  function showToast(msg, type = '') {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 2800);
  }

  async function getAndIncrementNextMRN() {
    const year = new Date().getFullYear();
    const counterRef = doc(db, 'settings', 'counters');
    let nextSeq = 1;

    try {
      await runTransaction(db, async (transaction) => {
        const snap = await transaction.get(counterRef);
        if (!snap.exists()) {
          let highest = 0;
          patients.forEach(p => {
            if (p.id || p.mrn) {
              const raw = String(p.id || p.mrn || '');
              const match = raw.match(/(\d+)$/);
              if (match) {
                const num = parseInt(match[1], 10);
                if (!isNaN(num) && num > highest) highest = num;
              }
            }
          });
          nextSeq = highest + 1;
          transaction.set(counterRef, { currentYear: year, lastSequence: nextSeq });
        } else {
          const data = snap.data();
          let curYear = data.currentYear || year;
          let lastSeq = data.lastSequence || 0;
          if (curYear !== year) {
            curYear = year;
            lastSeq = 0;
          }
          nextSeq = lastSeq + 1;
          transaction.update(counterRef, { currentYear: curYear, lastSequence: nextSeq });
        }
      });
    } catch (err) {
      console.warn('Counter transaction failed, using local sequence fallback:', err);
      let highest = 0;
      patients.forEach(p => {
        if (p.id || p.mrn) {
          const raw = String(p.id || p.mrn || '');
          const match = raw.match(/(\d+)$/);
          if (match) {
            const num = parseInt(match[1], 10);
            if (!isNaN(num) && num > highest) highest = num;
          }
        }
      });
      nextSeq = highest + 1;
    }

    const seqStr = String(nextSeq).padStart(3, '0');
    return `${year}-${seqStr}`;
  }

  function formatE164(phone) {
    if (!phone) return '';
    let cleaned = phone.replace(/[^\d+]/g, '');
    if (cleaned.startsWith('+')) return cleaned;
    if (cleaned.startsWith('09') && cleaned.length === 11) {
      return '+63' + cleaned.slice(1);
    }
    if (cleaned.startsWith('9') && cleaned.length === 10) {
      return '+63' + cleaned;
    }
    if (cleaned.startsWith('639') && cleaned.length === 12) {
      return '+' + cleaned;
    }
    return cleaned;
  }

  // Kept as a thin wrapper so every call site reads the shared definitions.
  function generateDefaultDoses(service, baseDate) {
    return buildInitialDoses(service, { day0: baseDate });
  }


  // Set when the add form matches existing records; the modal either sends
  // the admin back to review or re-enters handleAddPatient with the check
  // skipped.
  const [dupCheck, setDupCheck] = useState(null); // { form, setSaving, matches }

  async function handleAddPatient(form, setSaving, { skipDuplicateCheck = false } = {}) {
    if (!form.fname.trim() || !form.lname.trim()) { showToast('Please fill in first and last name', 'error'); return; }
    if (!form.email.trim()) { showToast('Email is required so the patient can log in to the app', 'error'); return; }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!emailRegex.test(form.email.trim())) { showToast('Please enter a valid email address', 'error'); return; }
    if (!form.age) { showToast('Age is required', 'error'); return; }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }

    const normalEmail = form.email.toLowerCase().trim();

    // Prevent duplicate emails across patient records for patient-app uniqueness
    const existingLocal = patients.find(p => (p.email || '').toLowerCase().trim() === normalEmail);
    if (existingLocal) {
      showToast(`Email "${normalEmail}" is already registered to ${formatTitleCase(existingLocal.name)} (MRN: ${existingLocal.id || existingLocal.mrn || '—'}). Patient records require a unique email for the Patient App.`, 'error');
      return;
    }

    if (!skipDuplicateCheck) {
      const matches = findSimilarPatients(form, patients);
      if (matches.length) {
        setDupCheck({ form, setSaving, matches });
        return;
      }
    }

    if (typeof setSaving === 'function') setSaving(true);

    try {
      // Query authorizedPatients in Firestore to ensure uniqueness across entire database
      const existingEmailSnap = await getDocs(
        query(collection(db, 'authorizedPatients'), where('email', '==', normalEmail), limit(1))
      );
      if (!existingEmailSnap.empty) {
        const existingData = existingEmailSnap.docs[0].data();
        showToast(`Email "${normalEmail}" is already registered in patient records to ${existingData.name || 'another patient'} (MRN: ${existingData.mrn || existingEmailSnap.docs[0].id}). Each patient must have a unique email for the Patient App.`, 'error');
        if (typeof setSaving === 'function') setSaving(false);
        return;
      }

      const caseNo = await getAndIncrementNextMRN();
      const cleanFname = formatTitleCase(form.fname.trim());
      const cleanLname = formatTitleCase(form.lname.trim());
      const cleanMname = form.mname && form.mname.trim() ? formatTitleCase(form.mname.trim()) : '';
      const cleanSuffix = form.suffix ? form.suffix.trim() : '';
      const fullName = [cleanFname, cleanMname, cleanLname].filter(Boolean).join(' ') + (cleanSuffix ? `, ${cleanSuffix}` : '');
      const formattedContact = formatE164(form.contact || '');
      // No silent defaults: what staff did not choose is saved empty.
      const selectedBarangay = form.barangay || '';
      const enteredZone = form.zone || '';
      const baseDate = form.date || today();
      const defaultDoseArray = generateDefaultDoses(form.service || 'PEP', baseDate);

      const vaxDoc = {
        id: caseNo,
        mrn: caseNo,
        name: fullName,
        email: normalEmail,
        contact: formattedContact,
        age: form.age || '',
        sex: form.sex || '',
        dob: form.dob || '',
        height: form.height || '',
        weight: form.weight || '',
        bloodPressure: form.bloodPressure || '',
        barangay: selectedBarangay,
        zone: enteredZone,
        address: form.address || (selectedBarangay ? `${enteredZone ? enteredZone + ', ' : ''}Brgy. ${selectedBarangay}, Libon, Albay` : ''),
        service: form.service || 'PEP',
        vaccineBrand: form.vaccineBrand || '',
        placeOfExposure: form.placeOfExposure || '',
        typeOfExposure: form.typeOfExposure || '',
        sourceOfExposure: form.sourceOfExposure || '',
        woundWashed: form.woundWashed || '',
        rigGiven: form.rigGiven || '',
        vaxGiven: form.vaxGiven || '',
        genericName: form.genericName || '',
        route: form.route || '',
        animal: form.animal || '',
        cat: (form.cat || '').replace('Category ', ''),
        date: baseDate,
        notes: form.notes || '',
        pastVaccines: form.pastVaccines || '',
        allergies: form.allergies || '',
        woundLocation: form.woundLocation || '',
        woundDepth: form.woundDepth || '',
        numberOfBites: form.numberOfBites || '',
        woundType: form.woundType || '',
        lastTetanus: form.lastTetanus || '',
        hepaVariant: form.hepaVariant || '',
        riskFactor: form.riskFactor || '',
        priorHepa: form.priorHepa || '',
        pneumoVaccine: form.pneumoVaccine || '',
        riskCondition: form.riskCondition || '',
        priorPneumo: form.priorPneumo || '',
        status: 'ongoing',
        dose: `0/${defaultDoseArray.length}`,
        doses: defaultDoseArray,
        woundImages: [],
        createdAt: serverTimestamp(),
      };

      const authDoc = {
        mrn: caseNo,
        name: fullName,
        email: normalEmail,
        contact: formattedContact,
        authorized: true,
        registered: false,
        uid: null,
        createdAt: serverTimestamp(),
      };

      await Promise.all([
        setDoc(doc(db, 'vaccinations', caseNo), vaxDoc),
        setDoc(doc(db, 'authorizedPatients', caseNo), authDoc)
      ]);

      trackEvent('patient_registered');
      showToast(`${fullName} registered and authorized for app login`, 'success');
      handleCloseAddModal();
    } catch (err) {
      console.error('Add patient error:', err);
      const detail = err?.code === 'permission-denied'
        ? 'Your admin account is not authorized to write to Firestore (missing admins/{uid} record). Contact your system administrator.'
        : (err?.message || 'Please try again.');
      showToast(`Failed to register patient — ${detail}`, 'error');
    } finally {
      if (typeof setSaving === 'function') setSaving(false);
    }
  }

  async function handleEditSave(form) {
    if (!form.name || !form.name.trim()) { showToast('Please fill in the patient name', 'error'); return; }
    if (!form.age || Number(form.age) <= 0) { showToast('A valid age is required', 'error'); return; }
    if (form.contact && !isValidPHPhone(form.contact)) { showToast('Enter a valid Philippine mobile number', 'error'); return; }
    const newName = formatTitleCase(form.name.trim());
    const targetId = editPatient.firestoreId;
    const cleanEmail = (form.email || editPatient.email || '').toLowerCase().trim();

    // Prevent assigning an email already registered to another patient
    if (cleanEmail && cleanEmail !== (editPatient.email || '').toLowerCase().trim()) {
      const existingOther = patients.find(
        p => p.firestoreId !== targetId && (p.email || '').toLowerCase().trim() === cleanEmail
      );
      if (existingOther) {
        showToast(`Email "${cleanEmail}" is already registered to ${formatTitleCase(existingOther.name)} (MRN: ${existingOther.id || existingOther.mrn || '—'}). Each patient must have a unique email.`, 'error');
        return;
      }
      try {
        const existingEmailSnap = await getDocs(
          query(collection(db, 'authorizedPatients'), where('email', '==', cleanEmail), limit(1))
        );
        const mrnKey = editPatient.id || editPatient.mrn || targetId;
        if (!existingEmailSnap.empty && existingEmailSnap.docs[0].id !== mrnKey) {
          const existingData = existingEmailSnap.docs[0].data();
          showToast(`Email "${cleanEmail}" is already registered to ${existingData.name || 'another patient'} (MRN: ${existingData.mrn || existingEmailSnap.docs[0].id}). Each patient must have a unique email.`, 'error');
          return;
        }
      } catch (err) {
        console.warn('Email uniqueness check error:', err);
      }
    }

    const updatedData = {
      name: newName, age: form.age || editPatient.age, sex: form.sex || '',
      dob: form.dob || '', height: form.height || '', weight: form.weight || '', bloodPressure: form.bloodPressure || '',
      email: cleanEmail,
      address: form.address || '', contact: formatE164(form.contact || editPatient.contact || ''), service: form.service || 'PEP',
      vaccineBrand: form.vaccineBrand || '',
      animal: form.animal || '', cat: (form.cat || '').replace('Category ', ''),
      date: form.date || editPatient.date, notes: form.notes || '',
      pastVaccines: form.pastVaccines || '', allergies: form.allergies || '',
      woundLocation: form.woundLocation || '', woundDepth: form.woundDepth || '', numberOfBites: form.numberOfBites || '',
      woundType: form.woundType || '', lastTetanus: form.lastTetanus || '',
      hepaVariant: form.hepaVariant || '', riskFactor: form.riskFactor || '', priorHepa: form.priorHepa || '',
      pneumoVaccine: form.pneumoVaccine || '', riskCondition: form.riskCondition || '', priorPneumo: form.priorPneumo || '',
    };
    setEditPatient(null);
    showToast('Patient info updated', 'success');
    const mrnKey = editPatient.id || editPatient.mrn || targetId;
    updateDoc(doc(db, 'vaccinations', targetId), updatedData).catch(err => {
      console.error('Edit patient error:', err);
      showToast('Failed to update patient.', 'error');
    });
    if (mrnKey) {
      setDoc(doc(db, 'authorizedPatients', mrnKey), { email: cleanEmail, name: newName }, { merge: true }).catch(() => {});
    }
  }

  // ── One-time (but safe to re-run) sync: back-fills authorizedPatients for
  // any existing patient record that predates that collection — e.g. data
  // added before the Patient App's MRN-based login existed. Idempotent: only
  // creates docs that are missing, never touches already-authorized/registered
  // patients. Only patients whose Firestore doc ID already looks like a real
  // MRN ("<year>-<seq>") can be synced — irregular IDs are reported, not guessed.
  const [syncingAuth, setSyncingAuth] = useState(false);

  async function handleSyncAuthorizedPatients() {
    if (syncingAuth) return;
    setSyncingAuth(true);
    try {
      const authSnap = await getDocs(collection(db, 'authorizedPatients'));
      const alreadyLinked = new Set(authSnap.docs.map(d => d.id));
      const mrnPattern = /^\d{4}-\d{3,}$/;

      let created = 0;
      let skippedNoEmail = 0;
      let skippedIrregularId = 0;

      for (const p of patients) {
        const mrn = p.firestoreId;
        if (!mrn || alreadyLinked.has(mrn)) continue;
        if (!mrnPattern.test(mrn)) { skippedIrregularId++; continue; }
        const email = (p.email || '').toLowerCase().trim();
        if (!email) { skippedNoEmail++; continue; }

        await setDoc(doc(db, 'authorizedPatients', mrn), {
          mrn,
          name: getName(p),
          email,
          contact: p.contact || '',
          authorized: true,
          registered: false,
          uid: null,
          createdAt: serverTimestamp(),
        });
        created++;
      }

      const parts = [`${created} patient(s) linked for app login`];
      if (skippedNoEmail) parts.push(`${skippedNoEmail} skipped (no email on file)`);
      if (skippedIrregularId) parts.push(`${skippedIrregularId} skipped (irregular record ID, needs manual review)`);
      showToast(parts.join(' — '), created > 0 ? 'success' : 'info');
    } catch (err) {
      console.error('Sync authorizedPatients error:', err);
      showToast('Failed to sync patients for app login.', 'error');
    } finally {
      setSyncingAuth(false);
    }
  }

  // These hooks must run on every render regardless of which view is shown
  // below — declaring them after the `if (selected) return` branch violates
  // the Rules of Hooks (React calls a different number of hooks depending on
  // whether a row is selected), which is what made clicking a row to view its
  // record crash/fail silently instead of opening the detail view.
  const [selectedRows, setSelectedRows] = useState(new Set());
  const [sortBy, setSortBy] = useState('newest');
  // { basis: 'registered' | 'completed', year } or null for every year.
  const [yearFilter, setYearFilter] = useState(null);
  const [yearMenuOpen, setYearMenuOpen] = useState(false);
  const yearMenuRef = useRef(null);
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  const [searchFocused, setSearchFocused] = useState(false);
  const [debouncedSearch, setDebouncedSearch] = useState('');
  useEffect(() => {
    const timer = setTimeout(() => setDebouncedSearch(search), 300);
    return () => clearTimeout(timer);
  }, [search]);

  const [filterMenuOpen, setFilterMenuOpen] = useState(false);
  const filterMenuRef = useRef(null);
  const [sortMenuOpen, setSortMenuOpen] = useState(false);
  const sortMenuRef = useRef(null);
  useEffect(() => {
    const handler = e => {
      if (filterMenuRef.current && !filterMenuRef.current.contains(e.target)) setFilterMenuOpen(false);
      if (sortMenuRef.current && !sortMenuRef.current.contains(e.target)) setSortMenuOpen(false);
      if (yearMenuRef.current && !yearMenuRef.current.contains(e.target)) setYearMenuOpen(false);
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, []);

  // Before the early return below, so the hook order never changes.
  const [tableAreaRef, tableReserve] = useTableReserve(56);

  // Memoized (declared above the `if (selected)` early return, like every hook): recomputed only when the records, filters, search or sort change.
  const processedPatients = useMemo(() => patients
    .filter(p => {
      const liveStatus = derivePatientStatus(p);
      // Completed records stay here until the nightly sweep archives them a
      // year after completion (or after their latest restore). Archived
      // records live only on the Archive page.
      return !p.isArchived;
    })
    .filter(p => {
      if (!yearFilter) return true;
      const y = yearFilter.basis === 'completed' ? getCompletionYear(p) : getRegistrationYear(p);
      return y === yearFilter.year;
    })
    .filter(p => {
      if (filter === 'all') return true;
      const liveStatus = derivePatientStatus(p);
      const isOverdue = liveStatus !== 'completed' && (liveStatus === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
      if (filter === 'ongoing') return liveStatus !== 'completed' && !isOverdue;
      if (filter === 'overdue') return isOverdue;
      if (filter === 'completed') return liveStatus === 'completed';

      const pSvc = (p.service || 'PEP').toLowerCase();
      if (filter === 'prep') return pSvc === 'prep';
      if (filter === 'pep') return pSvc === 'pep';
      if (filter === 'tetanus' || filter === 'antitetano') return pSvc === 'tetanus';
      if (filter === 'pneumonia') return pSvc === 'pneumonia';

      return liveStatus === filter;
    })
    .filter(p => {
      if (!debouncedSearch) return true;
      const q = debouncedSearch.toLowerCase();
      return (
        p.name?.toLowerCase().includes(q) ||
        p.id?.toLowerCase().includes(q) ||
        p.mrn?.toLowerCase().includes(q) ||
        p.email?.toLowerCase().includes(q) ||
        p.contact?.includes(q) ||
        p.barangay?.toLowerCase().includes(q) ||
        p.address?.toLowerCase().includes(q)
      );
    })
    .sort((a, b) => {
      if (sortBy === 'newest') return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0) || (b.id || '').localeCompare(a.id || '');
      if (sortBy === 'oldest') return (a.createdAt?.seconds || 0) - (b.createdAt?.seconds || 0) || (a.id || '').localeCompare(b.id || '');
      if (sortBy === 'completed_recent') {
        // Completed records first, most recently completed on top; the rest
        // keep newest-registered order underneath.
        const ca = getCompletionDate(a), cb = getCompletionDate(b);
        if (ca || cb) return (cb || '').localeCompare(ca || '');
        return (b.createdAt?.seconds || 0) - (a.createdAt?.seconds || 0);
      }
      if (sortBy === 'name_asc') return (a.name || '').localeCompare(b.name || '');
      if (sortBy === 'mrn_asc') return (a.id || '').localeCompare(b.id || '');
      return 0;
    }), [patients, yearFilter, filter, debouncedSearch, sortBy]);

  if (selected) {
    const livePatient = patients.find(p => p.firestoreId === selected.firestoreId) || selected;
    return (
      <>
        <style>{globalCSS}</style>
        <MedicalRecordDetail
          patient={livePatient} records={patients} patients={patients}
          onBack={() => setSelected(null)}
          onToast={showToast}
          onPinMap={p => setPinTarget(p)}
          onExport={p => setExportModal(p)}
          onEdit={p => setEditPatient(p)}
        />
        {editPatient && (
          <EditPatientModal
            patient={editPatient}
            onClose={() => setEditPatient(null)}
            onSave={handleEditSave}
            inventoryItems={inventoryItems}
          />
        )}
        {exportModal && (
          <ExportReportModal
            patients={patients}
            initialPatient={typeof exportModal === 'object' ? exportModal : livePatient}
            onClose={() => setExportModal(false)}
            onToast={showToast}
          />
        )}
        {pinTarget && (
          <PinMapConfirmModal
            patient={pinTarget}
            saving={pinning}
            onConfirm={() => handlePinToMap(pinTarget)}
            onCancel={() => setPinTarget(null)}
          />
        )}
        <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
      </>
    );
  }

  // "All / Ongoing / Completed" used to be separate tab buttons; folded into
  // the same "Sort by" dropdown as the order options below (still two
  // distinct pieces of state — filter vs sortBy — just one trigger UI).
  const FILTER_OPTIONS = [
    { key: 'all', label: 'All Records' },
    { key: 'ongoing', label: 'Ongoing' },
    { key: 'overdue', label: 'Overdue' },
    { key: 'completed', label: 'Completed' },
    { key: 'prep', label: 'PrEP' },
    { key: 'pep', label: 'PEP' },
    { key: 'tetanus', label: 'Anti-Tetanus' },
    { key: 'pneumonia', label: 'Pneumonia Vaccine' },
  ];
  const SORT_OPTIONS = [
    { key: 'newest', label: 'Registered (Newest)' },
    { key: 'oldest', label: 'Registered (Oldest)' },
    { key: 'completed_recent', label: 'Completed (Most Recent)' },
    { key: 'name_asc', label: 'Name (A–Z)' },
    { key: 'mrn_asc', label: 'Patient ID' },
  ];

  // Year filter starts at 2025 (the clinic's first year on the system) and
  // runs to whichever is later: this year or the latest year in the data.
  const FIRST_FILTER_YEAR = 2025;
  const lastFilterYear = Math.max(
    new Date().getFullYear(),
    ...patients.map(p => Math.max(getRegistrationYear(p) || 0, getCompletionYear(p) || 0))
  );
  const YEAR_OPTIONS = [];
  for (let y = lastFilterYear; y >= FIRST_FILTER_YEAR; y--) YEAR_OPTIONS.push(y);

  const totalCount = patients.length;

  // Process filtering and sorting
  const totalItems = processedPatients.length;
  const totalPages = Math.ceil(totalItems / itemsPerPage) || 1;
  const safePage = Math.min(currentPage, totalPages);
  const paginatedPatients = processedPatients.slice((safePage - 1) * itemsPerPage, safePage * itemsPerPage);

  const isAllSelected = paginatedPatients.length > 0 && paginatedPatients.every(p => selectedRows.has(p.firestoreId || p.id));

  const toggleSelectAll = () => {
    if (isAllSelected) {
      setSelectedRows(new Set());
    } else {
      const next = new Set(selectedRows);
      paginatedPatients.forEach(p => next.add(p.firestoreId || p.id));
      setSelectedRows(next);
    }
  };

  const toggleRow = (id) => {
    const next = new Set(selectedRows);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedRows(next);
  };

  return (
    <>
      <style>{globalCSS}</style>
      <div style={{ padding: '20px 28px 36px', maxWidth: '1400px', margin: '0 auto' }}>

        {/* ── Main Clean Table Card Container ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', position: 'relative' }}>

          {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', borderRadius: '16px 16px 0 0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA' }}>
            
            {/* Search */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap', flex: 1, minWidth: 280 }}>
              <div style={{ position: 'relative', flex: 1, maxWidth: '22rem', minWidth: '16rem' }}>
                <svg
                  style={{
                    position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)',
                    opacity: searchFocused ? 1 : .4, stroke: searchFocused ? '#3B50DF' : '#0F172A',
                    pointerEvents: 'none', transition: 'all 0.15s ease'
                  }}
                  width="14" height="14" viewBox="0 0 24 24" fill="none" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"
                >
                  <circle cx="11" cy="11" r="8" /><line x1="21" y1="21" x2="16.65" y2="16.65" />
                </svg>
                <input
                  type="text"
                  placeholder="Search by name, email, MRN, contact..."
                  value={search}
                  onFocus={() => setSearchFocused(true)}
                  onBlur={() => setSearchFocused(false)}
                  onChange={e => { setSearch(e.target.value); setCurrentPage(1); }}
                  style={{
                    width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem',
                    border: searchFocused ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none',
                    boxShadow: searchFocused ? '0 0 0 3.5px rgba(59,80,223,0.18)' : 'none',
                    transition: 'all 0.15s ease'
                  }}
                />
              </div>
              <div ref={filterMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(o => !o)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                    fontSize: '.78125rem', fontWeight: 600,
                    border: filter !== 'all' ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem',
                    background: filter !== 'all' ? '#EEF2FF' : '#FFFFFF',
                    color: filter !== 'all' ? '#3B50DF' : '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  {filter === 'all' ? 'Filter' : (FILTER_OPTIONS.find(o => o.key === filter)?.label || 'Filter')}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {filterMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 205, maxHeight: '380px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                    <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Status
                    </div>
                    {[
                      { key: 'all', label: 'All Records' },
                      { key: 'ongoing', label: 'Ongoing' },
                      { key: 'overdue', label: 'Overdue' },
                      { key: 'completed', label: 'Completed' },
                    ].map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilter(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filter === opt.key ? '#EEF2FF' : 'transparent', color: filter === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filter === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {filter === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}

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
                        onClick={() => { setFilter(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: filter === opt.key ? '#EEF2FF' : 'transparent', color: filter === opt.key ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: filter === opt.key ? 700 : 500, cursor: 'pointer' }}
                      >
                        {opt.label}
                        {filter === opt.key && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Year — by registration year or by completion year, 2025 onward */}
              <div ref={yearMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setYearMenuOpen(o => !o)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px',
                    fontSize: '.78125rem', fontWeight: 600,
                    border: yearFilter ? '1.5px solid #3B50DF' : '1.5px solid #CBD5E1',
                    borderRadius: '.5rem',
                    background: yearFilter ? '#EEF2FF' : '#FFFFFF',
                    color: yearFilter ? '#3B50DF' : '#0F172A',
                    cursor: 'pointer'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" /><line x1="16" y1="2" x2="16" y2="6" /><line x1="8" y1="2" x2="8" y2="6" /><line x1="3" y1="10" x2="21" y2="10" /></svg>
                  {yearFilter ? `${yearFilter.basis === 'completed' ? 'Completed' : 'Registered'} ${yearFilter.year}` : 'Year'}
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {yearMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 190, maxHeight: '380px', overflowY: 'auto', background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
                    <button type="button"
                      onClick={() => { setYearFilter(null); setCurrentPage(1); setYearMenuOpen(false); }}
                      style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: !yearFilter ? '#EEF2FF' : 'transparent', color: !yearFilter ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: 600, cursor: 'pointer' }}
                    >
                      All Years
                      {!yearFilter && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                    </button>
                    {[
                      { basis: 'registered', title: 'Registered in' },
                      { basis: 'completed', title: 'Completed in' },
                    ].map(group => (
                      <Fragment key={group.basis}>
                        <div style={{ margin: '4px 0', borderTop: '1px solid #F1F5F9' }} />
                        <div style={{ padding: '4px 8px 2px', fontSize: '.6875rem', fontWeight: 700, color: '#94A3B8', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                          {group.title}
                        </div>
                        {YEAR_OPTIONS.map(y => {
                          const on = yearFilter?.basis === group.basis && yearFilter?.year === y;
                          return (
                            <button key={y} type="button"
                              onClick={() => { setYearFilter({ basis: group.basis, year: y }); setCurrentPage(1); setYearMenuOpen(false); }}
                              style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '6px 8px', borderRadius: 6, border: 'none', background: on ? '#EEF2FF' : 'transparent', color: on ? '#3B50DF' : '#334155', fontSize: '.78125rem', fontWeight: 600, cursor: 'pointer' }}
                            >
                              {y}
                              {on && <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>}
                            </button>
                          );
                        })}
                      </Fragment>
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
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 190, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 50 }}>
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

            {/* Export and Add — kept on the right */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              {/* Export Clinic Report Button */}
              <button
                  type="button"
                  className="btn btn-outline btn-sm"
                  onClick={() => setExportModal(true)}
                  style={{
                    display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: '.78125rem', fontWeight: 600,
                    padding: '7px 14px', background: '#FFFFFF', border: '1.5px solid #CBD5E1', color: '#0F172A',
                    borderRadius: '.5rem', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
                  Export Clinic Report
                </button>

              {/* Add Patient Button — Royal Blue (#3B50DF) */}
              <button
                  type="button"
                  className="btn"
                  onClick={() => setModal(true)}
                  style={{
                    background: '#3B50DF', color: '#FFFFFF', border: 'none', padding: '7px 16px', borderRadius: '.5rem',
                    fontWeight: 700, fontSize: '.78125rem', display: 'inline-flex', alignItems: 'center', gap: 6,
                    boxShadow: '0 2px 8px rgba(59,80,223,0.25)', cursor: 'pointer', transition: 'all 0.15s ease'
                  }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.8" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><line x1="5" y1="12" x2="19" y2="12"/></svg>
                  Add Patient
                </button>
            </div>

          </div>

          {/* ── Table Area ── */}
          <div ref={tableAreaRef} style={{ minHeight: tableReserve,  overflowX: 'auto' }}>
            {/* Fixed layout with explicit column widths and one shared cell
                padding. "Submitted On" used to clip: it printed the long
                "September 5, 2026" form, nowrap, into a 10% column that is
                ~76px wide at laptop sizes. It now uses the compact
                "Sep 5, 2026" form in a wider column, and the table scrolls
                sideways below 1040px instead of crushing any column. */}
            <table className="kna-table" style={{ width: '100%', minWidth: 920, borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '11%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '22%' }} />
                <col style={{ width: '14%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '11%' }} />
                <col style={{ width: '9%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '14px 16px 14px 20px', fontWeight: 600, color: '#64748B' }}>Patient ID</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: '#64748B' }}>Name</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: '#64748B' }}>Email</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: '#64748B' }}>Status</th>
                  <th style={{ padding: '14px 16px', fontWeight: 600, color: '#64748B', whiteSpace: 'nowrap' }}>Submitted On</th>
                  <th style={{ padding: '14px 20px 14px 16px', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={7} style={{ padding: 0 }}><SkeletonRows rows={8} /></td></tr>
                ) : paginatedPatients.length === 0 ? (
                  <tr><td colSpan={7} style={{ padding: 0 }}><EmptyState icon={Users} title="No patient records found" text="Try a different search, filter or year." /></td></tr>
                ) : (
                  paginatedPatients.map(p => {
                    const rowId = p.firestoreId || p.id;
                    const isSelectedRow = selectedRows.has(rowId);
                    const liveStatus = derivePatientStatus(p);
                    // Table-only refinement of "ongoing" — doesn't touch derivePatientStatus
                    // itself (that would also change what the Filter dropdown and the
                    // detail-view badge treat as "ongoing"), just reuses VaccinationTrackerPage.jsx's
                    // real dose-schedule logic to flag rows that need attention.
                    const isOverdue = liveStatus !== 'completed' && (liveStatus === 'overdue' || p.status === 'overdue' || buildDoses(p).some(d => d.status === 'miss'));
                    const formattedName = formatTitleCase(p.name);

                    return (
                      <tr
                        key={rowId}
                        onClick={() => setSelected(p)}
                        style={{
                          height: 56,
                          borderBottom: '1px solid #F1F5F9',
                          background: isSelectedRow ? '#FEF2F2' : '#FFFFFF',
                          transition: 'background .12s ease',
                          cursor: 'pointer'
                        }}
                        onMouseEnter={e => { if (!isSelectedRow) e.currentTarget.style.background = '#F8FAFC'; }}
                        onMouseLeave={e => { if (!isSelectedRow) e.currentTarget.style.background = '#FFFFFF'; }}
                      >
                        <td style={{ padding: '14px 16px 14px 20px', fontWeight: 500, color: '#64748B', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                          {p.id || p.mrn}
                        </td>
                        <td style={{ padding: '14px 16px', fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={formattedName}>
                          {formattedName}
                        </td>
                        <td style={{ padding: '14px 16px', color: '#334155', fontWeight: 400, fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={p.email || '—'}>
                          {p.email || '—'}
                        </td>
                        <td style={{ padding: '14px 16px' }}>
                          <ServiceBadge service={p.service} />
                        </td>
                        <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                          <span style={{
                            display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                            padding: '4px 10px', borderRadius: '9999px', fontSize: '.6875rem', fontWeight: 600,
                            whiteSpace: 'nowrap',
                            background: liveStatus === 'completed' ? '#ECFDF5' : isOverdue ? '#FEF2F2' : '#EFF6FF',
                            color: liveStatus === 'completed' ? '#059669' : isOverdue ? '#DC2626' : '#1D4ED8',
                            border: liveStatus === 'completed' ? '1px solid #A7F3D0' : isOverdue ? '1px solid #FCA5A5' : '1px solid #BFDBFE'
                          }}>
                            {liveStatus === 'completed' ? 'Completed' : isOverdue ? 'Overdue' : 'Ongoing'}
                          </span>
                        </td>
                        <td style={{ padding: '14px 16px', color: '#64748B', fontWeight: 400, fontSize: '.8125rem', whiteSpace: 'nowrap' }}>
                          {formatDateMedium(p.date)}
                        </td>
                        <td style={{ padding: '14px 20px 14px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                          <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                            <IconButton icon={Eye} label="View patient record" bordered onClick={() => setSelected(p)} />
                            <IconButton icon={Pencil} label="Edit patient" bordered onClick={() => setEditPatient(p)} />
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          {/* ── Pagination Footer ── */}
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', borderRadius: '0 0 16px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
            <div style={{ fontSize: '.8125rem', color: '#475569', fontWeight: 600 }}>
              {totalItems === 0 ? '0 of 0' : `${(safePage - 1) * itemsPerPage + 1} to ${Math.min(safePage * itemsPerPage, totalItems)} of ${totalItems}`}
              {selectedRows.size > 0 && <span style={{ marginLeft: 10, color: '#7C3AED', fontWeight: 800 }}>({selectedRows.size} selected)</span>}
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

      {showModal && <AddPatientModal onClose={handleCloseAddModal} onAdd={handleAddPatient} inventoryItems={inventoryItems} onToast={showToast} />}
      {dupCheck && (
        <DuplicatePatientModal
          form={dupCheck.form}
          matches={dupCheck.matches}
          onCancel={() => setDupCheck(null)}
          onProceed={() => {
            const { form, setSaving } = dupCheck;
            setDupCheck(null);
            handleAddPatient(form, setSaving, { skipDuplicateCheck: true });
          }}
        />
      )}
      {editPatient && <EditPatientModal patient={editPatient} onClose={() => setEditPatient(null)} onSave={handleEditSave} inventoryItems={inventoryItems} />}
      {followUpTarget && (
        <FollowUpModal
          patient={followUpTarget}
          onClose={() => setFollowUpTarget(null)}
          onToast={showToast}
        />
      )}

      {exportModal && <ExportReportModal patients={patients} initialPatient={typeof exportModal === 'object' ? exportModal : null} onClose={() => setExportModal(false)} onToast={showToast} />}

      {/* Pin Map Confirmation Modal */}
      {pinTarget && (
        <PinMapConfirmModal
          patient={pinTarget}
          saving={pinning}
          onConfirm={() => handlePinToMap(pinTarget)}
          onCancel={() => setPinTarget(null)}
        />
      )}

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
    </>
  );
}
