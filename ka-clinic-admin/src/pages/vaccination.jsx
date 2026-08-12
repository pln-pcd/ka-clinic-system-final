// kna-admin/src/vaccination.jsx
import {
  collection, deleteDoc, doc, getDocs,
  increment, onSnapshot, orderBy, query, updateDoc, where
} from 'firebase/firestore';
import {
  AlertCircle, CheckCircle, ChevronDown, ChevronLeft,
  ChevronRight, Clock,
  Search, Users, X
} from 'lucide-react';
import React, { useEffect, useRef, useState } from 'react';
import Toast from '../components/Toast';
import { db } from '../lib/firebase';
import { formatDateShort as fmtDate } from '../lib/dates';

/* ─────────────────────────────────────────────────────────── */
/* CONSTANTS                                                   */
/* ─────────────────────────────────────────────────────────── */
const ARV_SCHEDULE = [
  { key: 'd1', label: 'Dose 1 (ARV)', day: 0  },
  { key: 'd2', label: 'Dose 2 (ARV)', day: 3  },
  { key: 'd3', label: 'Dose 3 (ARV)', day: 7  },
  { key: 'd4', label: 'Dose 4 (ARV)', day: 14 },
  { key: 'd5', label: 'Dose 5 (ARV)', day: 28 },
];

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

const addDays = (dateStr, n) => {
  if (!dateStr) return null;
  const parts = String(dateStr).split('-');
  if (parts.length === 3) {
    const y = parseInt(parts[0], 10);
    const m = parseInt(parts[1], 10) - 1;
    const d = parseInt(parts[2], 10);
    const dateObj = new Date(y, m, d);
    dateObj.setDate(dateObj.getDate() + n);
    const resY = dateObj.getFullYear();
    const resM = String(dateObj.getMonth() + 1).padStart(2, '0');
    const resD = String(dateObj.getDate()).padStart(2, '0');
    return `${resY}-${resM}-${resD}`;
  }
  const dateObj = new Date(dateStr);
  dateObj.setDate(dateObj.getDate() + n);
  return dateObj.toISOString().slice(0, 10);
};

const getTodayStr = () => {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${y}-${m}-${day}`;
};

export { fmtDate };

const isOverdue = (dateStr) => {
  if (!dateStr) return false;
  const todayStr = getTodayStr();
  return dateStr < todayStr;
};

export const buildDoses = (p) => {
  const stored = p.doses || [];
  if (stored.length > 0) {
    return stored.map((d, i) => {
      const savedStatus = d.status || d.s;
      let status = savedStatus || 'pending';
      const overdueFlag = status === 'pending' && isOverdue(d.date);
      if (overdueFlag) status = 'miss';
      return {
        key:        d.key || `d${i + 1}`,
        label:      d.n || d.label || `Dose ${i + 1}`,
        date:       d.date || null,
        status,
        note:       d.note || '',
        autoMissed: overdueFlag && status !== 'done',
      };
    });
  }
  const regDate = p.date || getTodayStr();
  return ARV_SCHEDULE.map(s => {
    const scheduledDate = addDays(regDate, s.day);
    const overdueFlag = isOverdue(scheduledDate);
    return {
      key:        s.key,
      label:      s.label,
      date:       scheduledDate,
      status:     overdueFlag ? 'miss' : 'pending',
      note:       '',
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
/* ─────────────────────────────────────────────────────────── */
export default function VaccinationTrackerPage() {
  const [patients,     setPatients]     = useState([]);
  const [loading,      setLoading]      = useState(true);
  const [searchQuery,  setSearchQuery]  = useState('');
  const [filterStatus, setFilterStatus] = useState('all');
  const [currentPage,  setCurrentPage]  = useState(1);
  const [detailPt,     setDetailPt]     = useState(null);
  const [saving,       setSaving]       = useState({});
  const [deleteTarget, setDeleteTarget] = useState(null); // { firestoreId, name }
  const [deleting,     setDeleting]     = useState(false);
  const itemsPerPage = 10;

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
  const FILTER_OPTIONS = [
    { key: 'all', label: 'All Records' },
    { key: 'in-progress', label: 'In Progress' },
    { key: 'completed', label: 'Completed' },
    { key: 'overdue', label: 'Overdue' },
  ];
  const SORT_OPTIONS = [
    { key: 'newest', label: 'Registered (Newest)' },
    { key: 'oldest', label: 'Registered (Oldest)' },
    { key: 'name_asc', label: 'Name (A–Z)' },
    { key: 'progress_desc', label: 'Dose Progress (Highest)' },
  ];

  useEffect(() => {
    let unsub;
    const fetchVaccinations = () => {
      try {
        const q = query(collection(db, 'vaccinations'), orderBy('createdAt', 'desc'));
        unsub = onSnapshot(q, snap => {
          const data = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
          setPatients(data);
          setDetailPt(prev => prev ? data.find(p => p.firestoreId === prev.firestoreId) || null : null);
          setLoading(false);
        }, err => {
          console.warn('Ordered query failed, falling back to unordered query:', err);
          const fallbackQ = query(collection(db, 'vaccinations'));
          unsub = onSnapshot(fallbackQ, snap => {
            const data = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
            setPatients(data);
            setDetailPt(prev => prev ? data.find(p => p.firestoreId === prev.firestoreId) || null : null);
            setLoading(false);
          });
        });
      } catch (err) {
        console.warn('Query catch fallback:', err);
        const fallbackQ = query(collection(db, 'vaccinations'));
        unsub = onSnapshot(fallbackQ, snap => {
          const data = snap.docs.map(d => ({ firestoreId: d.id, ...d.data() }));
          setPatients(data);
          setDetailPt(prev => prev ? data.find(p => p.firestoreId === prev.firestoreId) || null : null);
          setLoading(false);
        });
      }
    };

    fetchVaccinations();
    return () => { if (unsub) unsub(); };
  }, []);

  const [toast, setToast] = useState({ msg: '', type: '' });
  const [inventoryItems, setInventoryItems] = useState([]);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  // Listen to inventory for brand dropdown and stock tracking
  useEffect(() => {
    const q = query(collection(db, 'inventory'), orderBy('name', 'asc'));
    const unsub = onSnapshot(q, snap => {
      setInventoryItems(snap.docs.map(d => ({ id: d.id, ...d.data() })));
    });
    return () => unsub();
  }, []);

  // Update vaccine brand for patient
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
  const cycleStatus = async (p, doseKey) => {
    const currentPatients = patients;
    const fresh = currentPatients.find(x => x.firestoreId === p.firestoreId) || p;
    const doses = buildDoses(fresh);
    const di = doses.findIndex(d => d.key === doseKey);
    if (di === -1) return;

    const cur = doses[di];
    const prevStatus = cur.status;
    const isCurrentlyDone = prevStatus === 'done';

    // ── STRICT SEQUENTIAL DOSE ENFORCEMENT ──
    if (!isCurrentlyDone) {
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

    const updatedDoses = doses.map((d, idx) =>
      idx === di
        ? { ...d, status: nextStatus, s: nextStatus, autoMissed: false }
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
          ? { ...x, doses: updatedDoses, status: newStatus, dose: `${doneCount}/${totalDoses}` }
          : x
      )
    );
    if (detailPt && detailPt.firestoreId === p.firestoreId) {
      setDetailPt(prev => ({
        ...prev,
        doses: updatedDoses,
        status: newStatus,
        dose: `${doneCount}/${totalDoses}`,
      }));
    }

    // ── BACKGROUND FIREBASE DOSE UPDATE ──
    updateDoc(doc(db, 'vaccinations', p.firestoreId), {
      doses: updatedDoses.map(d => ({
        key:    d.key,
        n:      d.label,
        date:   d.date,
        status: d.status,
        s:      d.status,
        note:   d.note || '',
      })),
      dose:   `${doneCount}/${totalDoses}`,
      status: newStatus,
    }).catch(err => console.error('cycleStatus error:', err));

    // ── AUTO-REDUCE / RESTORE INVENTORY STOCK ──
    const vaccineBrand = fresh.vaccineBrand;
    if (!vaccineBrand && nextStatus === 'done') {
      showToast(`Dose marked done, but no vaccine brand is assigned to this patient. Please select a Vaccine Brand in Patient Info to track stock.`, 'warning');
      return;
    }

    if (vaccineBrand) {
      try {
        const invQ = query(collection(db, 'inventory'), where('name', '==', vaccineBrand));
        const invSnap = await getDocs(invQ);
        if (!invSnap.empty) {
          const invDoc = invSnap.docs[0];
          const currentStock = parseInt(invDoc.data().stock) || 0;
          if (!isCurrentlyDone && nextStatus === 'done') {
            const newStock = Math.max(0, currentStock - 1);
            await updateDoc(doc(db, 'inventory', invDoc.id), { stock: newStock });
            showToast(`Dose ${di + 1} completed! ${vaccineBrand} stock reduced to ${newStock}.`, 'success');
          } else if (isCurrentlyDone && nextStatus === 'pending') {
            const newStock = currentStock + 1;
            await updateDoc(doc(db, 'inventory', invDoc.id), { stock: newStock });
            showToast(`Dose ${di + 1} marked pending. ${vaccineBrand} stock restored to ${newStock}.`, 'info');
          }
        } else {
          showToast(`Vaccine brand "${vaccineBrand}" not found in inventory.`, 'error');
        }
      } catch (invErr) {
        console.warn('Inventory stock update failed:', invErr);
      }
    }
  };

  function promptDeleteVaccination(p) {
    setDeleteTarget({ firestoreId: p.firestoreId, name: formatTitleCase(getName(p)) });
  }

  async function confirmDeleteVaccination() {
    if (!deleteTarget) return;
    const { firestoreId, name } = deleteTarget;
    setDeleting(true);
    try {
      await deleteDoc(doc(db, 'vaccinations', firestoreId));
      if (detailPt?.firestoreId === firestoreId) setDetailPt(null);
      showToast(`Vaccination record for ${name} removed`, 'success');
      setDeleteTarget(null);
    } catch (err) {
      console.error('Delete vaccination record error:', err);
      showToast('Failed to remove vaccination record.', 'error');
    } finally {
      setDeleting(false);
    }
  }

  const filtered = patients.filter(p => {
    const name   = getName(p).toLowerCase();
    const cat    = (p.cat || '').toLowerCase();
    const animal = (p.animal || '').toLowerCase();
    const caseNo = (p.caseNo || p.id || '').toLowerCase();
    const q      = searchQuery.toLowerCase();
    const matchSearch = !q || name.includes(q) || cat.includes(q) || animal.includes(q) || caseNo.includes(q);

    const status = deriveStatus(p);
    const matchStatus =
      filterStatus === 'all'         ? true :
      filterStatus === 'overdue'     ? status === 'overdue' :
      filterStatus === 'in-progress' ? status === 'in-progress' :
      filterStatus === 'completed'   ? status === 'completed' : true;

    return matchSearch && matchStatus;
  }).sort((a, b) => {
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
    { label: 'Total Patients',     value: patients.length,                                                icon: Users,       sub: 'Active & Master Records', color: '#475569', tint: '#F1F5F9', border: '#E2E8F0' },
    { label: 'Completed',          value: patients.filter(p => deriveStatus(p) === 'completed').length,   icon: CheckCircle, sub: 'Fully Vaccinated',         color: '#475569', tint: '#F1F5F9', border: '#E2E8F0' },
    { label: 'In Progress',        value: patients.filter(p => deriveStatus(p) === 'in-progress').length, icon: Clock,       sub: 'Ongoing Doses',            color: '#475569', tint: '#F1F5F9', border: '#E2E8F0' },
    { label: 'Overdue Follow-ups', value: patients.filter(p => deriveStatus(p) === 'overdue').length,     icon: AlertCircle, sub: 'Attention Required',       color: '#475569', tint: '#F1F5F9', border: '#E2E8F0' },
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
        
        {/* ── Summary Metric Cards — white cards with a tinted icon chip.
             Color is reserved for the two metrics where it means something
             (green = completed, red = overdue); the two plain running
             counts stay neutral slate rather than dressing every card in
             saturated color. ── */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {stats.map((s, i) => (
            <div key={i} style={{
              background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: '1rem',
              padding: '16px 18px', display: 'flex', alignItems: 'center', gap: 14,
              boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            }}>
              <div style={{ width: 42, height: 42, borderRadius: 11, background: s.tint, border: `1px solid ${s.border}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <s.icon size={20} strokeWidth={2.1} color={s.color} />
              </div>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '1.5rem', fontWeight: 900, color: '#0F172A', lineHeight: 1, fontVariantNumeric: 'tabular-nums' }}>{s.value}</div>
                <div style={{ fontSize: '.75rem', fontWeight: 700, color: '#334155', marginTop: 3 }}>{s.label}</div>
                <div style={{ fontSize: '.6875rem', color: '#94A3B8', fontWeight: 600, marginTop: 1 }}>{s.sub}</div>
              </div>
            </div>
          ))}
        </div>

        {/* ── Main Clean Table Card Container ── */}
        <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 16, boxShadow: '0 1px 3px rgba(0,0,0,0.06), 0 1px 2px rgba(0,0,0,0.04)', overflow: 'hidden' }}>

          {/* ── Search, Filter & Action Toolbar (Above Table) ── */}
          <div style={{ padding: '16px 20px', borderBottom: '1px solid #E2E8F0', display: 'flex', flexWrap: 'wrap', alignItems: 'center', justifyContent: 'space-between', gap: 12, background: '#FAFAFA' }}>
            
            {/* Search Input Box */}
            <div style={{ position: 'relative', flex: 1, maxWidth: '24rem', minWidth: '16rem' }}>
              <Search style={{ position: 'absolute', left: 11, top: '50%', transform: 'translateY(-50%)', opacity: .4, pointerEvents: 'none' }} size={14} color="#0F172A" />
              <input
                type="text"
                placeholder="Search by patient name, MRN, animal, or service..."
                value={searchQuery}
                onChange={e => { setSearchQuery(e.target.value); setCurrentPage(1); }}
                style={{ width: '100%', padding: '8px 12px 8px 34px', fontSize: '.8125rem', border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', outline: 'none' }}
              />
            </div>

            {/* Filter and Sort — grouped together, side by side */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div ref={filterMenuRef} style={{ position: 'relative' }}>
                <button
                  type="button"
                  onClick={() => setFilterMenuOpen(o => !o)}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 6, padding: '7px 12px', fontSize: '.78125rem', fontWeight: 600, border: '1.5px solid #CBD5E1', borderRadius: '.5rem', background: '#FFFFFF', color: '#0F172A', cursor: 'pointer' }}
                >
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" /></svg>
                  Filter
                  <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="6 9 12 15 18 9" /></svg>
                </button>

                {filterMenuOpen && (
                  <div style={{ position: 'absolute', top: 'calc(100% + 6px)', left: 0, minWidth: 180, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 10, boxShadow: '0 8px 24px rgba(0,0,0,0.12)', padding: 6, zIndex: 30 }}>
                    {FILTER_OPTIONS.map(opt => (
                      <button key={opt.key} type="button"
                        onClick={() => { setFilterStatus(opt.key); setCurrentPage(1); setFilterMenuOpen(false); }}
                        style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%', textAlign: 'left', padding: '7px 8px', borderRadius: 6, border: 'none', background: 'transparent', color: '#334155', fontSize: '.78125rem', fontWeight: filterStatus === opt.key ? 700 : 500, cursor: 'pointer' }}
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
                  <th style={{ padding: '16px 12px', width: '26%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Patient Name</th>
                  <th style={{ padding: '16px 12px', width: '8%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Service</th>
                  <th style={{ padding: '16px 12px', width: '28%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>
                    {/* Matches the progress bar's own max width so the label centers over the bar, not the wider cell */}
                    <div style={{ maxWidth: 230, textAlign: 'center' }}>Dose Progress</div>
                  </th>
                  <th style={{ padding: '16px 12px', width: '13%', textAlign: 'left', fontWeight: 600, color: '#64748B' }}>Next Dose</th>
                  <th style={{ padding: '16px 12px', width: '15%', textAlign: 'center', fontWeight: 600, color: '#64748B' }}>Actions</th>
                </tr>
              </thead>

              <tbody>
                {loading ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>
                      Loading vaccination tracker records…
                    </td>
                  </tr>
                ) : paginated.length === 0 ? (
                  <tr>
                    <td colSpan="6" style={{ textAlign: 'center', padding: 36, color: '#64748B', fontWeight: 500 }}>
                      No matching vaccination records found
                    </td>
                  </tr>
                ) : paginated.map(p => {
                  const name     = getName(p);
                  const doses    = buildDoses(p);
                  const doneNum  = doses.filter(d => d.status === 'done').length;
                  const pct      = Math.round((doneNum / doses.length) * 100);
                  const nextDose = doses.find(d => d.status !== 'done');

                  return (
                    <tr
                      key={p.firestoreId}
                      style={{ borderBottom: '1px solid #F1F5F9', background: '#FFFFFF', transition: 'background .12s ease', cursor: 'pointer' }}
                      onMouseEnter={e => e.currentTarget.style.background = '#F8FAFC'}
                      onMouseLeave={e => e.currentTarget.style.background = '#FFFFFF'}
                      onClick={() => setDetailPt(p)}
                    >
                      <td style={{ padding: '16px 12px 16px 20px', fontWeight: 500, color: '#64748B', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                        {p.id || p.caseNo || '—'}
                      </td>
                      <td style={{ padding: '16px 12px', maxWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: '#0F172A', fontSize: '.8125rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={name}>{name}</div>
                        <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={p.email || p.contact || ''}>{p.email || (p.contact || '—')}</div>
                      </td>
                      <td style={{ padding: '16px 12px' }}>{serviceBadge(p.service)}</td>
                      <td style={{ padding: '16px 12px' }}>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: 5, maxWidth: 230, margin: '0 auto 0 0' }}>
                          <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '.75rem', fontWeight: 600 }}>
                            <span style={{ color: '#64748B' }}>{doneNum}/{doses.length} Doses</span>
                            <span style={{ color: pct === 100 ? '#059669' : '#1E293B' }}>{pct}%</span>
                          </div>
                          <div style={{ display: 'flex', gap: 3 }}>
                            {doses.map((d, di) => (
                              <button
                                key={di}
                                type="button"
                                title={`${d.label} · ${fmtDate(d.date)} · Click to toggle status`}
                                onClick={e => { e.stopPropagation(); cycleStatus(p, d.key); }}
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
                            ))}
                          </div>
                        </div>
                      </td>
                      <td style={{ padding: '16px 12px', maxWidth: 0 }}>
                        {nextDose ? (
                          <>
                            <div style={{ fontWeight: 600, color: nextDose.status === 'miss' ? '#DC2626' : '#0F172A', fontSize: '.8125rem', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={nextDose.label}>{nextDose.label}</div>
                            <div style={{ fontSize: '.75rem', color: '#64748B', marginTop: 2, whiteSpace: 'nowrap' }}>{fmtDate(nextDose.date)}</div>
                          </>
                        ) : (
                          <span style={{ fontSize: '.8125rem', color: '#059669', fontWeight: 600, display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title="All doses complete">All doses complete</span>
                        )}
                      </td>
                      <td style={{ padding: '16px 12px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div style={{ display: 'flex', gap: 6, justifyContent: 'center', alignItems: 'center' }}>
                          <button
                            type="button"
                            className="icon-btn"
                            title="View Full Vaccination Record"
                            onClick={(e) => { e.stopPropagation(); setDetailPt(p); }}
                            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #CBD5E1', background: '#FFFFFF', color: '#475569', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                          </button>
                          <button
                            type="button"
                            className="icon-btn danger"
                            title="Delete Vaccination Record"
                            onClick={(e) => { e.stopPropagation(); promptDeleteVaccination(p); }}
                            style={{ width: 30, height: 30, borderRadius: 6, border: '1px solid #FCA5A5', background: '#FEF2F2', color: '#DC2626', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}
                          >
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
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
          <div style={{ padding: '14px 20px', borderTop: '1px solid #E2E8F0', display: 'flex', alignItems: 'center', justifyContent: 'space-between', background: '#FAFAFA' }}>
            <div style={{ fontSize: '.75rem', color: '#64748B', fontWeight: 600 }}>
              Showing {filtered.length === 0 ? 0 : (safePage - 1) * itemsPerPage + 1}–{Math.min(safePage * itemsPerPage, filtered.length)} of {filtered.length} patients
            </div>

            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={safePage <= 1}
                onClick={() => setCurrentPage(p => Math.max(p - 1, 1))}
                style={{ opacity: safePage <= 1 ? 0.4 : 1, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600 }}
              >
                ← Previous
              </button>

              {Array.from({ length: totalPages }, (_, i) => i + 1).map(pg => (
                <button
                  key={pg}
                  type="button"
                  onClick={() => setCurrentPage(pg)}
                  style={{
                    width: 28, height: 28, borderRadius: '.375rem', border: '1px solid #CBD5E1',
                    background: safePage === pg ? '#C8151A' : '#FFFFFF',
                    color: safePage === pg ? '#FFFFFF' : '#334155',
                    fontSize: '.75rem', fontWeight: safePage === pg ? 800 : 600,
                    cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center'
                  }}
                >
                  {pg}
                </button>
              ))}

              <button
                type="button"
                className="btn btn-outline btn-sm"
                disabled={safePage >= totalPages}
                onClick={() => setCurrentPage(p => Math.min(p + 1, totalPages))}
                style={{ opacity: safePage >= totalPages ? 0.4 : 1, padding: '5px 12px', fontSize: '.75rem', fontWeight: 600 }}
              >
                Next →
              </button>
            </div>
          </div>

        </div>
      </div>

      {/* ── PATIENT VACCINATION DETAIL MODAL (Spacious Landscape Layout) ── */}
      {detailPt && (() => {
        const p      = detailPt;
        const name   = formatTitleCase(getName(p));
        const doses  = buildDoses(p);
        const done   = doses.filter(d => d.status === 'done').length;
        const pct    = Math.round((done / doses.length) * 100);
        const status = deriveStatus(p);

        return (
          <div
            className="fixed inset-0 bg-slate-900/60 z-50 flex items-center justify-center p-4"
            style={{ backdropFilter: 'blur(8px)' }}
            onClick={e => e.target === e.currentTarget && setDetailPt(null)}
          >
            <div
              className="bg-white rounded-2xl shadow-2xl flex flex-col overflow-hidden"
              style={{ width: '920px', maxWidth: '96vw', maxHeight: '88vh', border: 'none' }}
            >
              {/* ── Dark Navy Header Bar ── */}
              <div style={{
                padding: '18px 24px',
                background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 16
              }}>
                <div>
                  <div style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#FFFFFF', display: 'flex', alignItems: 'center', gap: 10 }}>
                    <span>{name}</span>
                    <span style={{ fontSize: '.71875rem', fontWeight: 700, color: 'rgba(255,255,255,0.85)', background: 'rgba(255,255,255,0.12)', padding: '2px 8px', borderRadius: 6 }}>
                      ID: {p.id || p.caseNo || '—'}
                    </span>
                  </div>
                  <div style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.65)', marginTop: 3 }}>
                    Registered Record · Service: <strong style={{ color: '#FFFFFF' }}>{p.service || 'PEP'}</strong>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                  {statusBadge(status)}
                  <button
                    type="button"
                    onClick={() => setDetailPt(null)}
                    style={{
                      width: 32, height: 32, borderRadius: 8, border: 'none',
                      background: 'rgba(255,255,255,0.12)', color: '#FFFFFF',
                      fontSize: '1rem', fontWeight: 700, cursor: 'pointer',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      transition: 'background .15s'
                    }}
                    onMouseEnter={e => e.currentTarget.style.background = 'rgba(255,255,255,0.22)'}
                    onMouseLeave={e => e.currentTarget.style.background = 'rgba(255,255,255,0.12)'}
                  >
                    ✕
                  </button>
                </div>
              </div>

              {/* ── Landscape 2-Column Body (Left: Bigger Identity Summary, Right: Compact Checklist) ── */}
              <div style={{ display: 'flex', flex: 1, minHeight: 0, overflow: 'hidden' }}>
                
                {/* Left Column: Expanded Demographics & Exposure Record */}
                <div style={{ flex: 1.35, borderRight: '1px solid #E2E8F0', padding: '24px', overflowY: 'auto', background: '#FAFAFA' }}>
                  <div style={{ fontSize: '.71875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569', marginBottom: 14 }}>
                    Patient Identity & Exposure Summary
                  </div>

                  <div style={{ background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '14px 18px', display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {[
                      ['Full Name', name],
                      ['Age / Sex', `${p.age ? p.age + ' yrs' : '—'} · ${p.sex || p.gender || '—'}`],
                      ['Contact Number', p.phone || p.contact || '—'],
                      ['Barangay / Address', p.address || p.barangay || '—'],
                      ['Selected Service', p.service || 'PEP'],
                      ...((!p.service || p.service === 'PEP' || p.service === 'PrEP') ? [
                        ['Animal Type', p.animal || '—'],
                        ['Exposure Category', p.cat ? `Cat ${String(p.cat).replace('Category ', '').trim()}` : '—'],
                        ['Date of Exposure', p.date || '—'],
                      ] : [
                        ['Registration Date', p.date || '—'],
                      ]),
                    ].map(([k, v]) => (
                      <div key={k} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '.8125rem', paddingBottom: 6, borderBottom: '1px solid #F1F5F9' }}>
                        <span style={{ color: '#64748B', fontWeight: 600 }}>{k}</span>
                        <span style={{ color: '#0F172A', fontWeight: 700, textAlign: 'right', fontSize: '.8125rem' }}>{v}</span>
                      </div>
                    ))}
                  </div>

                  {/* Inventory Vaccine Brand Allocation */}
                  <div style={{ marginTop: 16, background: '#FFFFFF', border: '1px solid #E2E8F0', borderRadius: 12, padding: '16px 18px' }}>
                    <div style={{ fontSize: '.71875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569', marginBottom: 8 }}>
                      Assigned Vaccine Brand (Stock Sync)
                    </div>
                    <div style={{ position: 'relative' }}>
                      <select
                        value={p.vaccineBrand || ''}
                        onChange={e => handleAssignBrand(p, e.target.value)}
                        style={{
                          width: '100%', padding: '9px 36px 9px 12px', fontSize: '.8125rem', fontWeight: 700,
                          border: '1.5px solid #CBD5E1', borderRadius: 8, background: '#FFFFFF', color: '#0F172A',
                          outline: 'none', cursor: 'pointer', appearance: 'none', WebkitAppearance: 'none'
                        }}
                      >
                        <option value="">— Select Vaccine Stock Brand —</option>
                        {inventoryItems.filter(i => i.category === 'Vaccine').map(item => (
                          <option key={item.id} value={item.name}>{item.name} ({item.stock} {item.unit || 'pcs'} left)</option>
                        ))}
                      </select>
                      <ChevronDown
                        size={16}
                        color="#64748B"
                        style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', pointerEvents: 'none' }}
                      />
                    </div>
                    {!p.vaccineBrand && (
                      <p style={{ fontSize: '.71875rem', color: '#D97706', fontWeight: 600, marginTop: 6 }}>
                        Select a brand to auto-deduct stock upon dose completion.
                      </p>
                    )}
                  </div>
                </div>

                {/* Right Column: Compact Sequential Dose Checklist */}
                <div style={{ width: '350px', padding: '20px 20px', overflowY: 'auto', background: '#FFFFFF' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                    <div>
                      <div style={{ fontSize: '.6875rem', fontWeight: 800, textTransform: 'uppercase', letterSpacing: '.5px', color: '#475569' }}>
                        Dose Checklist
                      </div>
                      <div style={{ fontSize: '.71875rem', color: '#64748B', marginTop: 1, fontWeight: 500 }}>
                        Sequential check-off
                      </div>
                    </div>
                    <span style={{ fontSize: '.75rem', fontWeight: 800, color: '#334155', background: '#F1F5F9', padding: '3px 10px', borderRadius: 9999, border: '1px solid #CBD5E1' }}>
                      {done}/{doses.length} ({pct}%)
                    </span>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {(() => {
                      const nextDoseIndex = doses.findIndex(d => d.status !== 'done');
                      const lastDoneIndex = doses.reduce((last, d, idx) => d.status === 'done' ? idx : last, -1);

                      return doses.map((d, di) => {
                        const isDone = d.status === 'done';
                        const isNext = (!isDone && di === nextDoseIndex);
                        const canToggle = isDone ? (di === lastDoneIndex) : isNext;

                        return (
                          <div key={di} style={{
                            padding: '10px 12px', borderRadius: 10, transition: 'all .15s ease',
                            border: isNext ? '1.5px solid #C8151A' : '1px solid #E2E8F0',
                            background: isDone ? '#F8FAFC' : isNext ? '#FFFFFF' : '#FAFAFA',
                            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                            opacity: canToggle || isDone ? 1 : 0.45
                          }}>
                            {/* Left Side: Dose Label & Target Date */}
                            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                              <div style={{
                                width: 28, height: 28, borderRadius: 6,
                                background: isDone ? '#059669' : isNext ? '#FEF2F2' : '#F1F5F9',
                                color: isDone ? '#FFFFFF' : isNext ? '#C8151A' : '#475569',
                                border: isNext ? '1px solid #FCA5A5' : '1px solid #CBD5E1',
                                display: 'flex', alignItems: 'center', justifyContent: 'center',
                                fontWeight: 800, fontSize: '.71875rem'
                              }}>
                                D{di + 1}
                              </div>
                              <div>
                                <div style={{ fontWeight: 700, color: isDone ? '#475569' : '#0F172A', fontSize: '.78125rem' }}>
                                  {d.label}
                                </div>
                                <div style={{ fontSize: '.6875rem', color: '#64748B', marginTop: 1, fontWeight: 500 }}>
                                  {fmtDate(d.date)}
                                </div>
                              </div>
                            </div>

                            {/* Right Side: Clean Right-Aligned Checkbox Only */}
                            <div style={{ display: 'flex', alignItems: 'center' }}>
                              <input
                                type="checkbox"
                                checked={isDone}
                                disabled={!canToggle || !!saving[`${p.firestoreId}_${d.key}`]}
                                onChange={() => cycleStatus(p, d.key)}
                                style={{
                                  width: 18, height: 18, borderRadius: 4, accentColor: '#C8151A',
                                  cursor: canToggle ? 'pointer' : 'not-allowed',
                                  opacity: canToggle ? 1 : 0.35
                                }}
                                title={
                                  !canToggle
                                    ? (isDone ? 'Only the latest completed dose can be unchecked' : `Complete Dose ${nextDoseIndex + 1} first`)
                                    : (isDone ? 'Uncheck to undo dose completion' : 'Check to mark dose as administered')
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

              {/* ── Footer ── */}
              <div style={{ padding: '14px 24px', background: '#FAFAFA', borderTop: '1px solid #E2E8F0', display: 'flex', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  onClick={() => setDetailPt(null)}
                  style={{ padding: '8px 24px', borderRadius: 8, background: '#C8151A', color: '#FFFFFF', fontSize: '.8125rem', fontWeight: 800, border: 'none', cursor: 'pointer' }}
                >
                  Close Record
                </button>
              </div>

            </div>
          </div>
        );
      })()}

      {/* ── Delete Confirm Modal ── */}
      {deleteTarget && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: 'rgba(26,34,64,.45)', backdropFilter: 'blur(8px)' }}
          onClick={e => { if (e.target === e.currentTarget) setDeleteTarget(null); }}
        >
          <div style={{ background: '#FFFFFF', borderRadius: '1.25rem', width: '36rem', maxWidth: '95vw', padding: '24px 28px', boxShadow: '0 24px 64px rgba(26,34,64,.22)', border: '1px solid #E2E8F0' }}>
            <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start' }}>
              <div style={{ width: 44, height: 44, borderRadius: 12, background: '#FEE2E2', border: '1px solid #FCA5A5', color: '#DC2626', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
              </div>
              <div style={{ flex: 1 }}>
                <h3 style={{ fontSize: '1.125rem', fontWeight: 900, color: '#0F172A', margin: 0 }}>Delete Vaccination Record</h3>
                <p style={{ fontSize: '.84375rem', color: '#475569', margin: '6px 0 14px', lineHeight: 1.5 }}>
                  Are you sure you want to permanently delete the vaccination record for <strong style={{ color: '#0F172A' }}>{deleteTarget.name}</strong>?
                </p>
                <div style={{ background: '#FFF1F2', border: '1px solid #FECDD3', borderRadius: '.625rem', padding: '10px 14px', fontSize: '.75rem', color: '#9F1239', fontWeight: 600, display: 'flex', gap: 8, alignItems: 'center', marginBottom: 20 }}>
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0 }}><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /><line x1="12" y1="9" x2="12" y2="13" /><line x1="12" y1="17" x2="12.01" y2="17" /></svg>
                  <span>This action is permanent and will remove the full dose schedule and tracking history immediately.</span>
                </div>
                <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10 }}>
                  <button type="button" onClick={() => setDeleteTarget(null)} style={{ padding: '9px 18px', borderRadius: 8, border: '1.5px solid #CBD5E1', background: '#FFFFFF', color: '#334155', fontSize: '.8125rem', fontWeight: 600, cursor: 'pointer' }}>Cancel</button>
                  <button
                    type="button"
                    disabled={deleting}
                    onClick={confirmDeleteVaccination}
                    style={{
                      padding: '9px 20px', borderRadius: 8, border: 'none', background: '#DC2626', color: '#FFFFFF',
                      fontSize: '.8125rem', fontWeight: 700, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7,
                      boxShadow: '0 2px 8px rgba(220,38,38,0.25)', opacity: deleting ? 0.7 : 1,
                    }}
                  >
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6" /><path d="M19 6l-1 14a2 2 0 01-2 2H8a2 2 0 01-2-2L5 6" /><path d="M10 11v6" /><path d="M14 11v6" /><path d="M9 6V4a1 1 0 011-1h4a1 1 0 011 1v2" /></svg>
                    {deleting ? 'Deleting…' : 'Delete Record'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>
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