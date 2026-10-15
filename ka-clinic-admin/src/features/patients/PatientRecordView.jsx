// One patient's medical record: the record view, dose reports (add, confirm,
// view) and the follow-up notification modal.
import { authedPostJson } from "../../lib/adminSession";
import Modal from '../../components/Modal';
import useDiscardGuard from '../../components/useDiscardGuard';
import IconButton from '../../components/IconButton';
import Select from '../../components/Select';
import StatusBadge from '../../components/StatusBadge';
import EmptyState from '../../components/EmptyState';
import { CalendarDays, Download, Eye, History, Plus, Syringe } from 'lucide-react';
import { formatTitleCase, formatDateLong as fmtDate, formatDateMedium, getTodayDateString, formatServiceType, serviceLabel } from "../../lib/formatters";
import { collection, doc, getDoc, query, updateDoc } from "firebase/firestore";
import { useEffect, useState } from "react";
import { FieldError, FormErrorNote, useFieldErrors } from "../../components/FormValidation";
import { BTN } from "../../lib/buttons";
import { db, listen } from "../../lib/firebase";
import { buildDoses } from "../../lib/doseSchedules";
import { getCompletionDate, getRestoreDate, restorePatientRecord, showsRestoredLabel } from "../../lib/patientArchive";
import { serviceFields, serviceFieldRows, showsTreatments } from "../../lib/serviceFields";
import { erigStatus, erigStatusLabel } from "../../lib/erig";
import { MAP_STUDY_MODE } from "../../lib/studyMode";
import { ExportReportModal, ServiceBadge, X, derivePatientStatus } from "./shared";
import Avatar from "../../components/Avatar";

/* ─────────────────────────── HELPERS ─────────────────────────── */

/* ─────────────────────────── RABIES / BITE INCIDENT CHECK ─────────────────────────── */
export function isRabiesOrBiteIncident(patient) {
  if (!patient) return false;
  const s = (patient.service || '').trim().toLowerCase();

  // Explicit non-rabies services
  if (s.includes('tetanus') || s.includes('hepa') || s.includes('pneumo')) {
    return false;
  }

  // Has explicit biting / animal exposure data
  const hasBiteData = Boolean(
    patient.animal ||
    (patient.typeOfExposure && patient.typeOfExposure.toLowerCase().includes('bite')) ||
    patient.numberOfBites ||
    patient.woundLocation ||
    patient.placeOfExposure
  );
  if (hasBiteData) return true;

  // Rabies services: PEP (Post-Exposure Prophylaxis) and PrEP (Pre-Exposure Prophylaxis)
  if (s === 'pep' || s === 'prep' || s.includes('pep') || s.includes('prep') || s.includes('rabies')) {
    return true;
  }

  return false;
}

/* ─────────────────────────── RECORD VIEW BUILDING BLOCKS ─────────────────────────── */
// Label + value pair. A missing value shows an em dash rather than a guess —
// the record view previously filled gaps with plausible defaults ("Female",
// "Rabipur", "10:00 am"), which put data on screen that nobody entered.
// size 'lg': the General Information card, larger text at normal weight.
function InfoField({ label, value, full = false, size = 'sm' }) {
  const lg = size === 'lg';
  return (
    <div className={full ? 'col-span-2 min-w-0' : 'min-w-0'}>
      <span className={`${lg ? 'text-[11px]' : 'text-[10px]'} font-medium text-slate-500 uppercase tracking-wider block`}>{label}</span>
      <span className={`${lg ? 'text-sm font-normal' : 'text-xs font-medium'} text-slate-900 mt-1 block break-words`}>{value || '—'}</span>
    </div>
  );
}

function SectionTitle({ title, subtitle, action }) {
  return (
    <div className="flex items-start justify-between gap-2 mb-4">
      <div>
        <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
        {subtitle && <p className="text-[11px] text-slate-500 mt-0.5">{subtitle}</p>}
      </div>
      {action}
    </div>
  );
}

/* ─────────────────────────── MEDICAL RECORD DETAIL (DOC-CENTER LAYOUT + DOSE SCHEDULE) ─────────────────────────── */
// readOnly: opened from the Archive page. Every edit path (Edit Record, Add
// Report, pin to map) is hidden and a Restore button is offered instead.
export function MedicalRecordDetail({ patient, records, patients, onBack, onToast, onEdit, onPinMap, readOnly = false, onRestore, restoring = false, backLabel = 'Back to Patients List', onAddAnotherService }) {
  const [patientApts, setPatientApts] = useState([]);
  const [aptsLoading, setAptsLoading] = useState(true);
  const [aptTab, setAptTab] = useState('all'); // 'all' | 'upcoming' | 'completed'
  const [showAddReportModal, setShowAddReportModal] = useState(false);
  const [viewingReport, setViewingReport] = useState(null);
  const [showExportModal, setShowExportModal] = useState(false);
  const [viewingCase, setViewingCase] = useState(null);
  // A previous case exported from its pop-up: { caseData, index }.
  const [exportingCase, setExportingCase] = useState(null);

  // Profile photo lives on patientAvatars/{mrn} (set from the patient app), fetched
  // only here so list views never pull image data.
  const [avatarDataUrl, setAvatarDataUrl] = useState(null);
  useEffect(() => {
    const mrn = patient?.id || patient?.mrn;
    setAvatarDataUrl(null);
    if (!db || !mrn) return;
    let cancelled = false;
    getDoc(doc(db, 'patientAvatars', mrn))
      .then(snap => { if (!cancelled && snap.exists()) setAvatarDataUrl(snap.data()?.dataUrl || null); })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [patient?.id, patient?.mrn]);

  // Matched by document id only. The old name fallback could open a
  // different patient who happens to share a name.
  const r = records.find(x => x.firestoreId === patient.firestoreId);
  const rec = r || { doses: [], reports: [], address: '—', date: patient.date, id: patient.id, age: patient.age, animal: patient.animal, cat: patient.cat };
  const reportsList = r?.reports || patient.reports || [];

  // Sync patient appointments real-time from Firestore /appointments
  useEffect(() => {
    if (!db) { setAptsLoading(false); return; }
    try {
      const q = query(collection(db, 'appointments'));
      const unsub = listen(q, (snap) => {
        const list = snap.docs.map(d => ({ id: d.id, ...d.data() }));
        const pEmail = (patient.email || '').toLowerCase().trim();
        const pName = (patient.name || '').toLowerCase().trim();
        const pMrn = (patient.id || '').toLowerCase().trim();
        const pId = (patient.firestoreId || '').toLowerCase().trim();

        const filtered = list.filter(a => {
          const aEmail = (a.email || '').toLowerCase().trim();
          const aName = (a.name || a.patient || '').toLowerCase().trim();
          const aMrn = (a.mrn || a.patientId || '').toLowerCase().trim();
          return (pEmail && aEmail && aEmail === pEmail) ||
                 (pName && aName && aName === pName) ||
                 (pMrn && aMrn && aMrn === pMrn) ||
                 (pId && aMrn && aMrn === pId);
        });
        setPatientApts(filtered);
        setAptsLoading(false);
      }, (err) => {
        console.error('Error fetching patient appointments:', err);
        setAptsLoading(false);
      });
      return () => unsub();
    } catch (e) {
      console.error(e);
      setAptsLoading(false);
    }
  }, [patient]);

  // Save new clinical report with BP, Vitals & Nurse Notes to Firestore
  async function handleSaveReport(newReport) {
    if (!patient.firestoreId) {
      onToast('Cannot save report — patient has no Firestore ID', 'error');
      return;
    }
    try {
      const updatedReports = [newReport, ...reportsList];
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), { reports: updatedReports });
      onToast('Clinical report saved successfully', 'success');
      setShowAddReportModal(false);
    } catch (err) {
      console.error('handleSaveReport error:', err);
      onToast('Failed to save clinical report', 'error');
    }
  }

  // Delete clinical report
  async function handleDeleteReport(reportId) {
    if (!patient.firestoreId) return;
    try {
      const updatedReports = reportsList.filter(rep => rep.id !== reportId);
      await updateDoc(doc(db, 'vaccinations', patient.firestoreId), { reports: updatedReports });
      onToast('Report deleted', 'success');
    } catch (err) {
      console.error(err);
      onToast('Failed to delete report', 'error');
    }
  }

  // Archiving is automatic — the nightly sweep moves a record to the Archive
  // a full year after its completion date (lib/patientArchive.js). There
  // is deliberately no manual Archive button.
  const liveStatus = derivePatientStatus(rec);
  const isCompletedOrArchived = liveStatus === 'completed' || patient.isArchived;

  const filteredApts = patientApts.filter(a => {
    const st = (a.status || '').toLowerCase();
    if (aptTab === 'upcoming') return st !== 'completed' && st !== 'done';
    if (aptTab === 'completed') return st === 'completed' || st === 'done';
    return true;
  });

  const patientPhoto = avatarDataUrl || patient.photoUrl || patient.avatarUrl || patient.profileImage || patient.imageUrl || patient.photo || patient.image || rec.photoUrl || rec.avatarUrl;

  // Same status rules as the Patients table, so the list and the record
  // never disagree about a patient.
  const completedOn = liveStatus === 'completed' ? getCompletionDate({ ...rec, ...patient }) : '';
  // Same rule as the Patients table (lib/patientArchive.js).
  const restoredOn = showsRestoredLabel({ ...rec, ...patient }) ? getRestoreDate({ ...rec, ...patient }) : '';
  const isOverdue = liveStatus !== 'completed' && (liveStatus === 'overdue' || buildDoses(rec).some(d => d.status === 'miss'));
  const statusKey = liveStatus === 'completed' ? 'completed' : isOverdue ? 'overdue' : 'ongoing';

  // One card style for the whole record: white, one hairline border, no
  // rings or hover lift. Colour is reserved for the single accent (#3B50DF)
  // and for states that need attention (missed doses, overdue).
  const card = 'bg-white rounded-2xl border border-slate-200';
  const btnSecondary = 'px-3.5 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer flex items-center gap-2';

  return (
    <div style={{ padding: '20px 24px 36px', maxWidth: '1600px', margin: '0 auto' }}>

      {/* ── TOP ACTION BAR ── */}
      <div className="flex items-center justify-between gap-4 mb-4 flex-wrap">
        <button onClick={onBack} className={btnSecondary}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="15 18 9 12 15 6" /></svg>
          {backLabel}
        </button>

        <div className="flex items-center gap-2.5">
          {/* A completed case's pins are hidden from the map, so pinning one
              would silently do nothing — offer it only while the case is open. */}
          {/* Pins are manual only: one per PEP record, while the case is open.
              A record that already has a pin, or is completed, can't pin again. */}
          {/* Study mode (docs/STUDY_MODE.md): real patient records never
              become map data, so the pin action is not offered at all. */}
          {!readOnly && !MAP_STUDY_MODE && isRabiesOrBiteIncident(patient) && (() => {
            const pinned = Array.isArray(patient.incidentIds) && patient.incidentIds.length > 0;
            const blocked = pinned || isCompletedOrArchived;
            return (
              <button className={btnSecondary + (blocked ? ' opacity-50 cursor-not-allowed' : '')}
                onClick={blocked ? undefined : () => onPinMap?.(patient)} disabled={blocked}
                title={pinned ? 'This record is already pinned on the Incident Map' : isCompletedOrArchived ? 'Completed cases are not shown on the map' : 'Pin this exposure to the Incident Map'}>
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 10c0 6-8 12-8 12s-8-6-8-12a8 8 0 0 1 16 0Z"/><circle cx="12" cy="10" r="3"/></svg>
                {pinned ? 'Pinned to map' : 'Pin Incident Map'}
              </button>
            );
          })()}
          <button className={btnSecondary} onClick={() => setShowExportModal(true)}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
            Export Patient Record
          </button>
          {(isCompletedOrArchived || readOnly) && (
            <button
              className="px-3.5 py-2 rounded-xl text-xs font-semibold text-white bg-emerald-600 hover:bg-emerald-700 transition-colors cursor-pointer flex items-center gap-1.5"
              onClick={async () => {
                try {
                  if (patient.isArchived) {
                    await restorePatientRecord(patient);
                    onToast?.('Record restored from archive', 'success');
                  }
                } catch (e) {
                  console.warn('Auto restore error:', e);
                }
                if (onAddAnotherService) {
                  onAddAnotherService(patient);
                } else {
                  window.dispatchEvent(new CustomEvent('open-add-patient-modal', { detail: patient }));
                }
              }}
              title="Add another vaccination service for this patient (reuses MRN)"
            >
              <Plus size={14} />
              Add Another Service
            </button>
          )}
          {readOnly ? (
            onRestore && (
              <button
                className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#3B50DF] hover:bg-[#2F40B5] transition-colors cursor-pointer flex items-center gap-2 disabled:opacity-60 disabled:cursor-not-allowed"
                onClick={onRestore}
                disabled={restoring}
              >
                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><polyline points="1 4 1 10 7 10" /><path d="M3.51 15a9 9 0 1 0 2.13-9.36L1 10" /></svg>
                {restoring ? 'Restoring…' : 'Restore Record'}
              </button>
            )
          ) : (
            <button
              className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#3B50DF] hover:bg-[#2F40B5] transition-colors cursor-pointer flex items-center gap-2"
              onClick={() => onEdit?.(r || patient)}
            >
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              Edit Record
            </button>
          )}
        </div>
      </div>

      {patient.isArchived && (
        <p className="mb-4 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-[11px] text-slate-600">
          Archived record: read-only, and patient app sign-in is off. Restore it to bring it back to the Patients list.
        </p>
      )}

      {/* ── IDENTITY HEADER: who this is, their status and IDs, in one line ── */}
      <div className={`${card} px-6 py-4 mb-4 flex items-center gap-4 flex-wrap`}>
        <Avatar src={patientPhoto} alt={patient.name} size={56} />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="text-lg font-semibold text-slate-900 leading-tight truncate">{patient.name}</h2>
            <StatusBadge status={statusKey} size="md" />
            <ServiceBadge service={rec.service || patient.service} />
            {restoredOn && (
              <span
                className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-xs font-semibold bg-sky-50 text-sky-700 border border-sky-200"
                title={`Restored on ${formatDateMedium(restoredOn)}${patient.restoredBy?.name ? ` by ${patient.restoredBy.name}` : ''}${Array.isArray(patient.restoreHistory) && patient.restoreHistory.length > 1
                  ? ` · earlier restores: ${patient.restoreHistory.slice(0, -1).map(h => `${formatDateMedium(h.restoredAt)}${h.restoredBy?.name ? ` (${h.restoredBy.name})` : ''}`).join(', ')}`
                  : ''}`}
              >
                Restored: {formatDateMedium(restoredOn)}
              </span>
            )}
          </div>
          <p className="text-xs text-slate-500 mt-1 truncate">
            {patient.email || 'No email registered'}
            {completedOn && <span className="text-slate-400"> · Completed on {formatDateMedium(completedOn)}</span>}
          </p>
        </div>
        <div className="flex items-center gap-2.5 shrink-0">
          <div className="rounded-xl border border-slate-200 px-3 py-1.5 text-center min-w-[92px]">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">Patient ID</span>
            <span className="text-xs font-semibold text-slate-900 mt-0.5 block">{rec.id || patient.id || '—'}</span>
          </div>
          <div className="rounded-xl border border-slate-200 px-3 py-1.5 text-center min-w-[92px]">
            <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">Appointments</span>
            <span className="text-xs font-semibold text-slate-900 mt-0.5 block">{patientApts.length}</span>
          </div>
        </div>
      </div>

      {/* ── CLINICAL (wider) · GENERAL INFORMATION ── */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4">

        {/* Medical History (& Exposure for PEP) — its own card, key facts
            first. Only the fields this service asks (lib/serviceFields.js);
            "—" means asked but left empty. */}
        <div className={`lg:col-span-7 ${card} p-6`}>
          {(() => {
            const merged = { ...patient, ...rec };
            const cfg = serviceFields(merged.service);
            const isPepCard = cfg.exposure.length > 0;
            const rows = [...serviceFieldRows(merged, 'exposure'), ...serviceFieldRows(merged, 'history', { exclude: ['notes'] })];
            const factKeys = isPepCard ? ['cat', 'animal', 'allergies'] : [...new Set([cfg.history[0], 'allergies'])].filter(k => k && k !== 'notes');
            const facts = factKeys.map(k => rows.find(r => r.key === k)).filter(Boolean);
            const rest = rows.filter(r => !factKeys.includes(r.key));
            const allergies = merged.allergies;
            const hasAllergy = Boolean(allergies) && !/^(none|no known allergies|n\/?a|unknown|—)$/i.test(String(allergies).trim());
            const warnOf = k => (k === 'cat' ? String(merged.cat || '').includes('III') : k === 'allergies' ? hasAllergy : false);
            const fact = (key, label, value, warn) => (
              <div key={key} className={`rounded-xl border px-3.5 py-3 ${warn ? 'border-amber-200 bg-amber-50' : 'border-slate-200 bg-slate-50'}`}>
                <span className={`text-[10px] font-medium uppercase tracking-wider block ${warn ? 'text-amber-700' : 'text-slate-500'}`}>{label}</span>
                <span className={`text-sm font-semibold mt-1 block break-words ${value ? (warn ? 'text-amber-900' : 'text-slate-900') : 'text-slate-400'}`}>{value || '—'}</span>
              </div>
            );
            const treatments = Array.isArray(merged.treatments) ? merged.treatments : [];
            const s = erigStatus(merged);
            const showTreat = showsTreatments(merged);
            return (
              <>
                <SectionTitle title={isPepCard ? 'Medical History & Exposure' : 'Medical History'} />
                <div className={`grid grid-cols-1 ${facts.length === 3 ? 'sm:grid-cols-3' : 'sm:grid-cols-2'} gap-3 mb-5`}>
                  {facts.map(r => fact(r.key, r.label, r.value, warnOf(r.key)))}
                </div>
                {(rest.length > 0 || showTreat) && (
                  <div className="grid grid-cols-3 gap-x-4 gap-y-3.5">
                    {rest.map(r => <InfoField key={r.key} label={r.label} value={r.value} />)}
                    {showTreat && (
                      <div className="col-span-3 min-w-0">
                        <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block">Category III Treatments</span>
                        {treatments.length > 0 ? (
                          <div className="mt-1.5 flex flex-wrap gap-2">
                            {treatments.map((t, idx) => (
                              <span key={t.id || idx} className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-indigo-50 border border-indigo-100 text-xs font-semibold text-slate-800">
                                <span className="text-[#3B50DF] font-bold">{t.product}</span>
                                <span className="text-slate-500">· {t.ml ?? t.mg ?? 0} mL</span>
                                <span className="text-slate-400">· {formatDateMedium(t.date)}</span>
                              </span>
                            ))}
                          </div>
                        ) : s.given ? (
                          <span className="text-xs font-medium mt-1 block text-slate-900">
                            {erigStatusLabel(merged, formatDateMedium)}
                          </span>
                        ) : (
                          <span className="text-xs font-medium mt-1 block text-amber-700">Required (Category III), not yet recorded</span>
                        )}
                      </div>
                    )}
                  </div>
                )}
                <div className="pt-4 mt-4 border-t border-slate-100">
                  <span className="text-[10px] font-medium text-slate-500 uppercase tracking-wider block mb-1.5">Doctor / Nurse Remarks</span>
                  <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 px-3 py-2.5 rounded-lg border border-slate-200">
                    {merged.notes || 'No clinical remarks recorded.'}
                  </p>
                </div>
              </>
            );
          })()}
        </div>

        {/* General Information */}
        <div className={`lg:col-span-5 ${card} p-6`}>
          <SectionTitle
            title="General Information"
            action={!readOnly && (
              <button
                onClick={() => onEdit?.(r || patient)}
                className="p-1 rounded-md text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer"
                title="Edit patient info"
              >
                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 00-2 2v14a2 2 0 002 2h14a2 2 0 002-2v-7" /><path d="M18.5 2.5a2.121 2.121 0 013 3L12 15l-4 1 1-4 9.5-9.5z" /></svg>
              </button>
            )}
          />
          <div className="grid grid-cols-2 gap-x-4 gap-y-4">
            <InfoField size="lg" label="Sex" value={rec.sex || patient.sex} />
            <InfoField size="lg" label="Birth Date / Age" value={[rec.dob ? fmtDate(rec.dob) : '', rec.age ? `${rec.age} yrs old` : ''].filter(Boolean).join(' · ')} />
            <InfoField size="lg" label="Height / Weight" value={[rec.height ? `${rec.height} cm` : '', rec.weight ? `${rec.weight} kg` : ''].filter(Boolean).join(' · ')} />
            <InfoField size="lg" label="Blood Pressure" value={rec.bloodPressure} />
            <InfoField size="lg" label="Mobile Number" value={rec.contact || patient.contact} />
            <InfoField size="lg" label="Registration Date" value={rec.date ? fmtDate(rec.date) : ''} />
            <InfoField size="lg" label="Address" value={rec.address && rec.address !== '—' ? rec.address : ''} full />
            {(rec.emergencyName || rec.emergencyPhone || rec.guardian || rec.emergencyContact) && (
              <InfoField size="lg"
                label="Emergency Contact"
                full
                value={rec.emergencyName
                  ? `${rec.emergencyName}${rec.emergencyRel ? ` (${rec.emergencyRel})` : ''}${rec.emergencyPhone ? ` · ${rec.emergencyPhone}` : ''}`
                  : (rec.guardian || rec.emergencyContact)}
              />
            )}
          </div>
        </div>
      </div>

      {/* ── MIDDLE ROW: DOSES & APPOINTMENTS ──
          Side by side, stretched to equal height, sized comfortably for appointment table rows. */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 mb-4 items-stretch">

        {/* Vaccination Doses: summary row + compact timeline */}
        <div className={`lg:col-span-6 ${card} p-5 flex flex-col`} style={{ minHeight: 400, maxHeight: 560 }}>
          <SectionTitle
            title="Vaccination Doses"
            subtitle={`${serviceLabel(rec.service || patient.service || 'PEP')} protocol · dose schedule`}
          />
          {(() => {
            const dosesList = (Array.isArray(patient?.doses) && patient.doses.length > 0)
              ? patient.doses
              : (Array.isArray(rec?.doses) && rec.doses.length > 0)
              ? rec.doses
              : [];

            if (dosesList.length === 0) {
              return <EmptyState icon={Syringe} title="No doses recorded yet" text="Doses appear here once the vaccination schedule is recorded." minHeight={180} className="!py-4" />;
            }

            const normalizedDoses = dosesList.map((d, i) => {
              const rawSt = String(d.s || d.status || 'pending').toLowerCase();
              const isDone = rawSt === 'done' || rawSt === 'completed' || d.done === true;
              const isMiss = rawSt === 'miss' || rawSt === 'missed' || rawSt === 'overdue' || (!isDone && d.date && d.date < getTodayDateString());
              const label = d.n || d.label || d.dose || d.name || `Dose ${i + 1}`;
              return { ...d, label, isDone, isMiss };
            });
            const given = normalizedDoses.filter(d => d.isDone).length;
            const nextDoseIndex = normalizedDoses.findIndex(d => !d.isDone && !d.isMiss);
            const nextOpen = normalizedDoses.find(d => !d.isDone);

            return (
              <>
                <div className="flex items-center gap-x-3 gap-y-1 flex-wrap text-xs text-slate-500 mb-3 -mt-1">
                  <ServiceBadge service={rec.service || patient.service || 'PEP'} />
                  <span><strong className="font-semibold text-slate-900 tabular-nums">{given} of {normalizedDoses.length}</strong> given</span>
                  <span className="text-slate-300">·</span>
                  <span>Next due <strong className={`font-semibold ${nextOpen?.isMiss ? 'text-rose-600' : 'text-slate-900'}`}>{nextOpen ? (nextOpen.date ? formatDateMedium(nextOpen.date) : 'Not scheduled') : 'Complete'}</strong></span>
                </div>
                <ol className="relative overflow-y-auto min-h-0 pr-1 flex-1" aria-label="Dose timeline">
                  {normalizedDoses.map((d, i) => {
                    const isNext = i === nextDoseIndex;
                    const tone = d.isDone
                      ? { dot: 'bg-slate-700 text-white border-slate-700', tag: 'text-slate-600', label: 'Given' }
                      : d.isMiss
                      ? { dot: 'bg-white text-rose-600 border-rose-300', tag: 'text-rose-700', label: 'Missed' }
                      : isNext
                      ? { dot: 'bg-[#3B50DF] text-white border-[#3B50DF]', tag: 'text-[#3B50DF]', label: 'Next due' }
                      : { dot: 'bg-white text-slate-500 border-slate-300', tag: 'text-slate-500', label: 'Scheduled' };
                    return (
                      <li key={i} className={`relative flex items-center gap-3 py-1.5 px-2 rounded-lg ${isNext ? 'bg-indigo-50/60' : ''}`}>
                        {i < normalizedDoses.length - 1 && <span aria-hidden="true" className="absolute left-[19px] top-1/2 h-full w-px bg-slate-200" />}
                        <span className={`relative z-[1] w-6 h-6 rounded-full flex items-center justify-center text-[11px] font-semibold shrink-0 border ${tone.dot}`}>
                          {d.isDone ? (
                            <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
                          ) : <span>{i + 1}</span>}
                        </span>
                        <div className="min-w-0 flex-1">
                          <p className="text-xs font-medium truncate leading-tight text-slate-900">{d.label}</p>
                          <p className="text-[11px] text-slate-500 mt-0.5">
                            {d.date ? formatDateMedium(d.date) : 'Not scheduled'}
                            {/* Brand given, per dose (Vaccination Tracker); old doses fall back to the record-level brand. */}
                            {d.isDone && (d.brand || d.vaccineBrand || rec.vaccineBrand || patient.vaccineBrand) && (
                              <span className="text-slate-400"> · {d.brand || d.vaccineBrand || rec.vaccineBrand || patient.vaccineBrand}</span>
                            )}
                          </p>
                        </div>
                        <span className={`text-[11px] font-medium shrink-0 ${tone.tag}`}>{tone.label}</span>
                      </li>
                    );
                  })}
                </ol>
              </>
            );
          })()}
        </div>

        {/* Appointments: tabs when there are some; an empty state if not. Sized to
            show about six visits before the list scrolls. */}
        <div className={`lg:col-span-6 ${card} flex flex-col overflow-hidden`} style={{ minHeight: 400, maxHeight: 560 }}>
          <div className="px-5 pt-5 flex items-start justify-between gap-2 flex-wrap shrink-0">
            <SectionTitle title="Appointments" subtitle={`Booked for ${patient.name}`} />
            {patientApts.length > 0 && (
              <div className="flex items-center gap-0.5 bg-slate-100 p-0.5 rounded-lg text-[11px]">
                {[['all', 'All'], ['upcoming', 'Upcoming'], ['completed', 'Completed']].map(([key, label]) => (
                  <button
                    key={key}
                    onClick={() => setAptTab(key)}
                    className={`px-2.5 py-1 rounded-md font-medium transition-colors cursor-pointer ${
                      aptTab === key ? 'bg-white text-slate-900 shadow-sm' : 'text-slate-500 hover:text-slate-900'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>

          <div className="overflow-auto flex-1 min-h-0">
            {aptsLoading ? (
              <div className="py-8 text-center text-xs text-slate-500">Loading appointments…</div>
            ) : patientApts.length === 0 ? (
              <EmptyState icon={CalendarDays} title="No appointments yet" text="Visits booked for this patient appear here." minHeight={200} className="!py-6" />
            ) : filteredApts.length === 0 ? (
              <EmptyState icon={CalendarDays} title={aptTab === 'upcoming' ? 'No upcoming appointments' : 'No completed appointments'} minHeight={180} className="!py-6" />
            ) : (
              <table className="kna-table w-full text-left border-collapse">
                <thead>
                  <tr className="border-y border-slate-100 text-[10.5px] font-medium text-slate-500 uppercase tracking-wider sticky top-0 z-10">
                    <th className="px-6 py-3 bg-slate-50">Date</th>
                    <th className="px-4 py-3 bg-slate-50">Type</th>
                    <th className="px-4 py-3 bg-slate-50">Time</th>
                    <th className="px-6 py-3 bg-slate-50">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-[13px] text-slate-700">
                  {filteredApts.map((apt) => {
                    return (
                      <tr key={apt.id}>
                        <td className="px-6 py-3.5 font-medium text-slate-900 whitespace-nowrap">{apt.date ? formatDateMedium(apt.date) : '—'}</td>
                        <td className="px-4 py-3.5 truncate max-w-[180px]">{formatServiceType(apt.type || apt.purpose, '—')}</td>
                        <td className="px-4 py-3.5 text-slate-600 whitespace-nowrap">{apt.time || '—'}</td>
                        <td className="px-6 py-3.5">
                          <StatusBadge status={apt.status || 'pending'} />
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        </div>
      </div>

      {/* ── CLINICAL REPORTS ── */}
      <div className={`${card} p-6 flex flex-col`} style={{ minHeight: 240 }}>
        <div className="flex items-start justify-between gap-2 flex-wrap mb-4">
          <SectionTitle title="Clinical Reports & Nurse Notes" subtitle="Logged vitals, wound assessments, and doctor/nurse notes" />
          {!readOnly && <button
            onClick={() => setShowAddReportModal(true)}
            className="px-4 py-2 rounded-xl text-xs font-semibold text-white bg-[#3B50DF] hover:bg-[#2F40B5] transition-colors cursor-pointer flex items-center gap-1.5"
          >
            + Add Report
          </button>}
        </div>

        {reportsList.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center py-12 text-center rounded-xl border border-dashed border-slate-200">
            <p className="text-sm font-medium text-slate-700">No clinical reports logged</p>
            <p className="text-xs text-slate-500 mt-0.5">Use + Add Report to log BP, vitals, injection route and observations.</p>
          </div>
        ) : (
          <div className="rounded-xl border border-slate-200 divide-y divide-slate-200 overflow-hidden">
            {reportsList.map((rep, idx) => (
              <div
                key={rep.id || idx}
                onClick={() => setViewingReport(rep)}
                className="flex items-center gap-4 px-4 py-3 bg-white hover:bg-slate-50 transition-colors cursor-pointer"
              >
                <div className="w-[96px] shrink-0">
                  <p className="text-[11px] font-medium text-slate-900 tabular-nums leading-tight">{formatDateMedium(rep.date || rep.createdAt)}</p>
                  <p className="text-[10.5px] text-slate-500 mt-0.5 truncate">{rep.author || '—'}</p>
                </div>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-slate-900 truncate">{rep.title || 'Clinical Assessment'}</p>
                  <p className="text-[11px] text-slate-500 truncate mt-0.5">
                    {rep.notes ? rep.notes : (rep.injectionSite || rep.woundCondition || 'No notes recorded')}
                  </p>
                </div>
                <div className="hidden md:flex items-center gap-4 shrink-0 text-[11px] text-slate-600 tabular-nums">
                  {rep.bp && <span><span className="text-slate-400">BP</span> {rep.bp}</span>}
                  {rep.pulse && <span><span className="text-slate-400">Pulse</span> {rep.pulse}</span>}
                  {rep.temp && <span><span className="text-slate-400">Temp</span> {rep.temp}°C</span>}
                </div>
                <button
                  onClick={e => { e.stopPropagation(); setViewingReport(rep); }}
                  className="p-1.5 rounded-lg text-slate-400 hover:text-[#3B50DF] hover:bg-indigo-50 transition-colors cursor-pointer shrink-0"
                  title="View full report"
                >
                  <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" /><circle cx="12" cy="12" r="3" /></svg>
                </button>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ── PREVIOUS SERVICES (RETURNING PATIENT PRIOR CASES) ── */}
      {(() => {
        const historyList = (Array.isArray(patient?.caseHistory) && patient.caseHistory.length > 0)
          ? patient.caseHistory
          : (Array.isArray(rec?.caseHistory) && rec.caseHistory.length > 0)
          ? rec.caseHistory
          : [];
        if (historyList.length === 0) return null;

        return (
          <div className={`${card} p-6 mt-4 flex flex-col`}>
            <SectionTitle
              title="Previous Services"
              subtitle={`Earlier cases registered under this patient's MRN (${patient.id || patient.mrn || '—'})`}
            />
            <div className="rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead className="bg-slate-50 text-[10.5px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                  <tr>
                    <th className="px-4 py-3">Service</th>
                    <th className="px-3.5 py-3">Date</th>
                    <th className="px-3.5 py-3">Doses Given</th>
                    <th className="px-3.5 py-3">RIG / Anti-Tetanus</th>
                    <th className="px-3.5 py-3">Completion Date</th>
                    <th className="px-3.5 py-3">Status</th>
                    <th className="px-4 py-3 text-center">Action</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 text-slate-700">
                  {historyList.map((hist, hIdx) => {
                    const hDoses = Array.isArray(hist.doses) ? hist.doses : [];
                    const hDone = hDoses.filter(d => d.s === 'done' || d.status === 'done' || d.done).length;
                    const hTreatments = Array.isArray(hist.treatments) ? hist.treatments : [];
                    const doseDatesSummary = hDoses
                      .filter(d => d.date)
                      .map((d, i) => `D${i + 1}: ${formatDateMedium(d.date)}`)
                      .join(' · ');

                    return (
                      <tr key={hIdx} className="hover:bg-slate-50/80 transition-colors">
                        <td className="px-4 py-3 whitespace-nowrap">
                          <div className="flex items-center gap-2">
                            <ServiceBadge service={hist.service || 'PEP'} />
                            <span className="font-semibold text-slate-900">{serviceLabel(hist.service)}</span>
                          </div>
                          {/* Exposure category only for services that ask it (PEP). */}
                          {serviceFields(hist.service).exposure.includes('cat') && (
                            <span className="block mt-0.5 text-[10.5px] text-slate-500">{hist.cat ? `Category ${hist.cat}` : 'Category —'}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                          {hist.date ? formatDateMedium(hist.date) : '—'}
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap" title={doseDatesSummary || undefined}>
                          <span className="font-semibold text-slate-900">{hDone} of {hDoses.length}</span>
                          {doseDatesSummary && (
                            <span className="block text-[10px] text-slate-400 truncate max-w-[160px]">{doseDatesSummary}</span>
                          )}
                        </td>
                        <td className="px-3.5 py-3">
                          {hTreatments.length ? (
                            <span className="font-medium text-slate-800">
                              {hTreatments.map(t => `${t.product} (${t.ml ?? t.mg ?? 0} mL)`).join(', ')}
                            </span>
                          ) : showsTreatments(hist) ? (
                            <span className="text-slate-400">None</span>
                          ) : null}
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap text-slate-600">
                          {hist.completedAt || hist.closedAt ? formatDateMedium(hist.completedAt || hist.closedAt) : '—'}
                        </td>
                        <td className="px-3.5 py-3 whitespace-nowrap">
                          <StatusBadge status={hist.status || 'completed'} size="sm" />
                        </td>
                        <td className="px-4 py-3 text-center whitespace-nowrap">
                          <button
                            type="button"
                            onClick={() => setViewingCase({ caseData: hist, index: hIdx })}
                            className="px-2.5 py-1 text-xs font-semibold rounded-lg border border-slate-200 text-slate-700 bg-white hover:bg-slate-50 hover:text-[#3B50DF] hover:border-indigo-200 transition-colors cursor-pointer inline-flex items-center gap-1"
                          >
                            <Eye size={12} /> View Record
                          </button>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        );
      })()}

      {/* ── MODAL 1: ENHANCED ADD REPORT POP-UP CARD ── */}
      {showAddReportModal && (
        <AddReportModal
          patient={patient}
          doses={(Array.isArray(patient?.doses) && patient.doses.length > 0) ? patient.doses : (rec.doses || [])}
          existingReports={reportsList}
          onClose={() => setShowAddReportModal(false)}
          onSave={handleSaveReport}
        />
      )}

      {/* ── MODAL 2: VIEW REPORT DETAIL MODAL ── */}
      {viewingReport && (
        <ViewReportModal
          report={viewingReport}
          patientName={patient.name}
          onClose={() => setViewingReport(null)}
        />
      )}

      {/* ── MODAL 3: EXPORT PATIENT RECORD MODAL (WITH LIVE PREVIEW AUTO-BOUND TO THIS PATIENT) ── */}
      {showExportModal && (
        <ExportReportModal
          patients={patients || records}
          initialPatient={{
            ...patient,
            ...(r || {}),
            doses: (Array.isArray(patient?.doses) && patient.doses.length > 0)
              ? patient.doses
              : (Array.isArray(r?.doses) && r.doses.length > 0)
              ? r.doses
              : (rec?.doses || [])
          }}
          onClose={() => setShowExportModal(false)}
          onToast={onToast}
        />
      )}

      {/* ── MODAL 4: VIEW PREVIOUS CASE RECORD MODAL ── */}
      {viewingCase && (
        <ViewPreviousCaseModal
          caseData={viewingCase.caseData}
          index={viewingCase.index}
          patientName={patient.name}
          mrn={patient.id || patient.mrn || '—'}
          onClose={() => setViewingCase(null)}
          onExport={() => setExportingCase(viewingCase)}
        />
      )}

      {/* ── MODAL 5: EXPORT ONE PREVIOUS CASE (its own snapshot, not the active case) ── */}
      {exportingCase && (
        <ExportReportModal
          patients={patients || records}
          initialPatient={historicalCaseRecord({ ...patient, ...(r || {}) }, exportingCase.caseData, exportingCase.index)}
          onClose={() => setExportingCase(null)}
          onToast={onToast}
        />
      )}
    </div>
  );
}

/* ─────────────────────────── HISTORICAL CASE RECORD ─────────────────────────── */
// The clinical part of a case: everything a previous-case snapshot holds. A
// historical export takes these from the snapshot only, so nothing from the
// active case can leak into it; a key the old snapshot never saved stays empty.
const CASE_ARRAY_KEYS = ['doses', 'treatments', 'woundImages', 'reports'];
const CASE_KEYS = [
  'service', 'date', 'status', 'completedAt', 'closedAt',
  'cat', 'animal', 'placeOfExposure', 'typeOfExposure', 'sourceOfExposure',
  'woundLocation', 'woundDepth', 'woundWashed', 'numberOfBites', 'vaccineBrand',
  'erig', 'rigGiven', 'rigTreatment', 'antiTetanusTreatment', 'notes', 'pastVaccines', 'pastVaccinesOther', 'allergies',
  'woundType', 'lastTetanus', 'pneumoHistory', 'pneumoHistoryOther', 'riskCondition',
  'height', 'weight', 'bloodPressure', ...CASE_ARRAY_KEYS,
];

/** A previous case as a record the export dialog can render: identity from the patient, the case from its snapshot. */
export function historicalCaseRecord(patient, caseData, index) {
  const caseFields = Object.fromEntries(CASE_KEYS.map(k => [
    k, caseData?.[k] ?? (CASE_ARRAY_KEYS.includes(k) ? [] : k === 'erig' ? null : ''),
  ]));
  return {
    // Identity: who the patient is does not change between cases.
    name: patient.name, email: patient.email, contact: patient.contact,
    age: patient.age, sex: patient.sex, dob: patient.dob,
    address: patient.address, barangay: patient.barangay, zone: patient.zone,
    emergencyName: patient.emergencyName, emergencyRel: patient.emergencyRel, emergencyPhone: patient.emergencyPhone,
    guardian: patient.guardian, emergencyContact: patient.emergencyContact,
    id: patient.id || patient.mrn, mrn: patient.mrn || patient.id,
    ...caseFields,
    service: caseData?.service || 'PEP',
    status: caseData?.status || 'completed',
    caseHistory: [],
    isHistoricalCase: true,
    historicalIndex: index + 1,
  };
}

// Dose / treatment staff: the tracker saves givenByName / recordedByName;
// older entries may carry administeredBy or staff.
const doseStaff = d => d?.givenByName || d?.administeredBy || d?.staff || '';
const treatmentStaff = t => t?.recordedByName || t?.staff || t?.administeredBy || '';
const amountMl = x => (x?.ml ?? x?.mg) != null && (x?.ml ?? x?.mg) !== '' ? `${x.ml ?? x.mg} mL` : '';

/* ─────────────────────────── VIEW PREVIOUS CASE MODAL ─────────────────────────── */
function ViewPreviousCaseModal({ caseData, index, patientName, mrn, onClose, onExport }) {
  if (!caseData) return null;
  const doses = Array.isArray(caseData.doses) ? caseData.doses : [];
  const treatments = Array.isArray(caseData.treatments) ? caseData.treatments : [];
  const cfg = serviceFields(caseData.service);
  // Only the fields this case's service asks (lib/serviceFields.js).
  const rows = [...serviceFieldRows(caseData, 'exposure'), ...serviceFieldRows(caseData, 'history', { exclude: ['notes'] })];
  const doneOf = d => d.s === 'done' || d.status === 'done' || d.done === true;

  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-2xl shadow-2xl border border-slate-200 overflow-hidden max-w-3xl w-full m-auto flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between bg-slate-50">
          <div>
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs font-bold text-slate-700 bg-white px-2 py-0.5 rounded-md border border-slate-200">
                Case #{index + 1}
              </span>
              <ServiceBadge service={caseData.service || 'PEP'} />
              <h3 className="text-base font-bold text-slate-900">{patientName}</h3>
            </div>
            <p className="text-xs text-slate-500 mt-0.5">
              MRN: {mrn} · Registration: {formatDateMedium(caseData.date)}
              {caseData.completedAt && ` · Completed: ${formatDateMedium(caseData.completedAt)}`}
            </p>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition-colors cursor-pointer">
            <X size={18} />
          </button>
        </div>

        {/* Read-only banner */}
        <div className="px-6 py-2.5 bg-slate-100/80 border-b border-slate-200 text-[11px] font-semibold text-slate-600 flex items-center justify-between">
          <span className="flex items-center gap-1.5 text-slate-700">
            <Eye size={13} className="text-[#3B50DF]" />
            Historical Case Record · Read-Only Snapshot
          </span>
          <StatusBadge status={caseData.status || 'completed'} size="sm" />
        </div>

        {/* Content */}
        <div className="p-6 overflow-y-auto space-y-5">
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">{cfg.exposure.length ? 'Exposure & Case Details' : 'Case Details'}</h4>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 bg-slate-50 p-3.5 rounded-xl border border-slate-200 text-xs">
              <div>
                <span className="text-[10px] uppercase font-semibold text-slate-400 block">Service</span>
                <span className="font-semibold text-slate-800">{serviceLabel(caseData.service || 'PEP')}</span>
              </div>
              {rows.map(r => (
                <div key={r.key} className="min-w-0">
                  <span className="text-[10px] uppercase font-semibold text-slate-400 block">{r.label}</span>
                  <span className="font-semibold text-slate-800 break-words">{r.value || '—'}</span>
                </div>
              ))}
            </div>
          </div>

          {/* Doses Table */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Vaccine Dose Schedule</h4>
            {doses.length === 0 ? (
              <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-200">No doses recorded for this case.</p>
            ) : (
              <div className="rounded-xl border border-slate-200 overflow-hidden overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead className="bg-slate-50 text-[10.5px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                    <tr>
                      <th className="px-3.5 py-2.5">Dose</th>
                      <th className="px-3.5 py-2.5">Scheduled Date</th>
                      <th className="px-3.5 py-2.5">Status</th>
                      <th className="px-3.5 py-2.5">Vaccine</th>
                      <th className="px-3.5 py-2.5">Amount Given</th>
                      <th className="px-3.5 py-2.5">Administered By</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-slate-700">
                    {doses.map((d, i) => {
                      const isDone = doneOf(d);
                      return (
                        <tr key={i} className={i % 2 ? 'bg-slate-50/50' : 'bg-white'}>
                          <td className="px-3.5 py-2.5 font-semibold text-slate-900">{d.n || d.label || `Dose ${i + 1}`}</td>
                          <td className="px-3.5 py-2.5">{d.date ? formatDateMedium(d.date) : '—'}</td>
                          <td className="px-3.5 py-2.5">
                            <span className={`inline-flex px-2 py-0.5 rounded-full text-[10px] font-bold ${isDone ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-slate-100 text-slate-600'}`}>
                              {isDone ? 'Given' : 'Pending'}
                            </span>
                          </td>
                          {/* Brand given, per dose; an old dose falls back to the case's brand. */}
                          <td className="px-3.5 py-2.5">{isDone ? (d.brand || d.vaccineBrand || caseData.vaccineBrand || '—') : '—'}</td>
                          <td className="px-3.5 py-2.5 font-medium">{amountMl(d) || '—'}</td>
                          <td className="px-3.5 py-2.5 text-slate-500">{doseStaff(d) || '—'}</td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>

          {/* Treatments: only when the case recorded some, or a PEP Category III case */}
          {showsTreatments(caseData) && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Category III Treatments (RIG / Anti-Tetanus)</h4>
              {treatments.length === 0 ? (
                <p className="text-xs text-slate-500 italic bg-slate-50 p-3 rounded-lg border border-slate-200">No RIG / Anti-Tetanus entries recorded for this case.</p>
              ) : (
                <div className="rounded-xl border border-slate-200 overflow-hidden">
                  <table className="w-full text-left border-collapse text-xs">
                    <thead className="bg-slate-50 text-[10.5px] uppercase font-semibold text-slate-500 border-b border-slate-200">
                      <tr>
                        <th className="px-3.5 py-2.5">Product</th>
                        <th className="px-3.5 py-2.5">Amount Given</th>
                        <th className="px-3.5 py-2.5">Date Given</th>
                        <th className="px-3.5 py-2.5">Administered By</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100 text-slate-700">
                      {treatments.map((t, idx) => (
                        <tr key={idx} className="bg-white">
                          <td className="px-3.5 py-2.5 font-semibold text-[#3B50DF]">{t.product}</td>
                          <td className="px-3.5 py-2.5 font-medium">{amountMl(t) || '—'}</td>
                          <td className="px-3.5 py-2.5">{t.date ? formatDateMedium(t.date) : '—'}</td>
                          <td className="px-3.5 py-2.5 text-slate-500">{treatmentStaff(t) || '—'}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* Clinical reports logged during this case (kept with its snapshot) */}
          {Array.isArray(caseData.reports) && caseData.reports.length > 0 && (
            <div>
              <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-2">Clinical Reports & Nurse Notes</h4>
              <ul className="rounded-xl border border-slate-200 divide-y divide-slate-100 text-xs">
                {caseData.reports.map((rep, i) => (
                  <li key={rep.id || i} className="px-3.5 py-2.5 flex gap-4">
                    <span className="w-[92px] shrink-0 text-slate-500 tabular-nums">{formatDateMedium(rep.date || rep.createdAt)}</span>
                    <span className="min-w-0 flex-1">
                      <span className="font-semibold text-slate-900">{rep.title || 'Clinical Assessment'}</span>
                      {(rep.notes || rep.injectionSite || rep.woundCondition) && <span className="block text-slate-600 mt-0.5">{rep.notes || rep.injectionSite || rep.woundCondition}</span>}
                    </span>
                    <span className="shrink-0 text-slate-500">{rep.author || '—'}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* Clinical Remarks */}
          <div>
            <h4 className="text-xs font-bold text-slate-800 uppercase tracking-wider mb-1.5">Clinical Remarks & Notes</h4>
            <p className="text-xs text-slate-700 leading-relaxed bg-slate-50 px-3.5 py-2.5 rounded-lg border border-slate-200">
              {caseData.notes || 'No clinical remarks recorded for this case.'}
            </p>
          </div>
        </div>

        {/* Footer: the pop-up stays read-only; Export only renders this snapshot. */}
        <div className="px-6 py-3 border-t border-slate-200 bg-slate-50 flex justify-end gap-2">
          {onExport && (
            <button onClick={onExport} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer inline-flex items-center gap-1.5"
              title="Export this case's medical record (from its saved snapshot)">
              <Download size={13} aria-hidden="true" /> Export
            </button>
          )}
          <button onClick={onClose} className="px-4 py-2 rounded-xl text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-100 transition-colors cursor-pointer">
            Close
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── VITALS ASSESSMENT ───────────────────────────
   Adult reference ranges, used only to surface a reading for a second look
   before it is written to the patient's record. Advisory, never blocking —
   an out-of-range value is often exactly what the nurse means to record. */

function assessVitals({ bp, pulse, temp, woundCondition, adverseEvent }) {
  const flags = [];

  const bpMatch = /^\s*(\d{2,3})\s*\/\s*(\d{2,3})\s*$/.exec(bp || '');
  if (bp && !bpMatch) {
    flags.push({ level: 'warn', field: 'Blood pressure', text: 'Not in systolic/diastolic format (e.g. 120/80)' });
  } else if (bpMatch) {
    const sys = Number(bpMatch[1]), dia = Number(bpMatch[2]);
    if (sys >= 180 || dia >= 120) flags.push({ level: 'high', field: 'Blood pressure', text: 'Hypertensive crisis range — escalate to attending physician' });
    else if (sys >= 140 || dia >= 90) flags.push({ level: 'high', field: 'Blood pressure', text: 'Stage 2 hypertension range (≥140/90)' });
    else if (sys < 90 || dia < 60) flags.push({ level: 'warn', field: 'Blood pressure', text: 'Below normal (<90/60)' });
    else if (sys >= 130 || dia >= 80) flags.push({ level: 'warn', field: 'Blood pressure', text: 'Above normal (≥130/80)' });
  }

  const p = parseFloat(pulse);
  if (pulse && Number.isNaN(p)) {
    flags.push({ level: 'warn', field: 'Pulse', text: 'Not a number' });
  } else if (!Number.isNaN(p)) {
    if (p > 120) flags.push({ level: 'high', field: 'Pulse', text: 'Marked tachycardia (>120 bpm)' });
    else if (p < 50) flags.push({ level: 'high', field: 'Pulse', text: 'Marked bradycardia (<50 bpm)' });
    else if (p > 100) flags.push({ level: 'warn', field: 'Pulse', text: 'Tachycardia (>100 bpm)' });
    else if (p < 60) flags.push({ level: 'warn', field: 'Pulse', text: 'Bradycardia (<60 bpm)' });
  }

  const t = parseFloat(temp);
  if (temp && Number.isNaN(t)) {
    flags.push({ level: 'warn', field: 'Temperature', text: 'Not a number' });
  } else if (!Number.isNaN(t)) {
    if (t >= 39) flags.push({ level: 'high', field: 'Temperature', text: 'High fever (≥39 °C)' });
    else if (t < 35) flags.push({ level: 'high', field: 'Temperature', text: 'Hypothermia (<35 °C)' });
    else if (t >= 37.5) flags.push({ level: 'warn', field: 'Temperature', text: 'Febrile (≥37.5 °C)' });
  }

  if (adverseEvent === 'Severe Reaction (Requires MD Review)') {
    flags.push({ level: 'high', field: 'Adverse event', text: 'Severe reaction logged — requires MD review' });
  }
  if (woundCondition === 'Infected / Purulent Drainage') {
    flags.push({ level: 'high', field: 'Wound condition', text: 'Infected with purulent drainage' });
  }

  return flags;
}

/* ─────────────────────────── CONFIRM REPORT CARD ───────────────────────────
   Review step between the Add Report form and the write to Firestore. A
   clinical report is part of the patient's permanent record, so the whole
   entry is shown back before it is committed. */

function ConfirmReportCard({ patient, report, saving, onBack, onConfirm }) {
  const flags = assessVitals(report);
  const highCount = flags.filter(f => f.level === 'high').length;

  const vitals = [
    { label: 'BP (mmHg)', value: report.bp },
    { label: 'Pulse (bpm)', value: report.pulse },
    { label: 'Temp (°C)', value: report.temp },
    { label: 'Weight (kg)', value: report.weight }
  ];

  const details = [
    { label: 'Where the shot was given', value: report.injectionSite },
    { label: 'Wound condition', value: report.woundCondition },
    { label: 'Adverse event', value: report.adverseEvent },
    { label: 'Attending', value: report.author }
  ];

  return (
    <Modal onClose={onBack} dismissible={!saving}>
      {/* Landscape card. The old portrait card capped its height but clipped
          overflow without scrolling, so on a laptop screen the Confirm button
          fell below the fold and could not be reached. Now: two columns so
          the content is short, a body that scrolls if it still has to, and a
          footer that is always visible. */}
      <div
        className="bg-white rounded-2xl shadow-2xl w-full max-w-4xl border border-slate-200 m-auto flex flex-col overflow-hidden"
        style={{ maxHeight: 'calc(100vh - 128px)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-semibold text-slate-900">Confirm Clinical Report</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Review before this is written to {patient.name}&rsquo;s permanent record
            </p>
          </div>
          <IconButton icon={X} label="Back to edit" size={36} iconSize={16} onClick={onBack} disabled={saving} />
        </div>

        <div className="flex-1 min-h-0 overflow-y-auto p-6 grid grid-cols-1 md:grid-cols-2 gap-6 text-xs text-slate-700">
          {/* Left column: what, when, the numbers */}
          <div className="space-y-5">
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <p className="text-[13px] font-semibold text-slate-900 leading-snug">{report.title}</p>
              <p className="text-[11px] text-slate-500 mt-1">
                {patient.name} &middot; {fmtDate(report.date)}
              </p>
            </div>

            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Vitals</p>
              <div className="grid grid-cols-2 gap-2.5">
                {vitals.map(v => (
                  <div key={v.label} className="rounded-lg border border-slate-200 px-3 py-2">
                    <p className="text-[10px] text-slate-500">{v.label}</p>
                    <p className="text-[13px] font-semibold text-slate-900 mt-0.5 tabular-nums">{v.value || '—'}</p>
                  </div>
                ))}
              </div>
            </div>

            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Administration</p>
              <div className="rounded-lg border border-slate-200 divide-y divide-slate-200">
                {details.map(d => (
                  <div key={d.label} className="flex items-start justify-between gap-4 px-3 py-2">
                    <span className="text-[11px] text-slate-500 shrink-0">{d.label}</span>
                    <span className="text-[11.5px] font-medium text-slate-800 text-right">{d.value || '—'}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right column: notes and anything that needs a second look */}
          <div className="space-y-5">
            <div>
              <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">Observations &amp; notes</p>
              <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2.5 min-h-[88px]">
                {report.notes
                  ? <p className="text-[11.5px] text-slate-700 leading-relaxed whitespace-pre-wrap">{report.notes}</p>
                  : <p className="text-[11.5px] text-slate-400">No notes recorded for this entry.</p>}
              </div>
            </div>

            {flags.length === 0 ? (
              <div className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2.5">
                <p className="text-[11.5px] font-medium text-emerald-800">
                  All recorded vitals fall within normal adult ranges.
                </p>
              </div>
            ) : (
              <div>
                <p className="text-[10.5px] font-semibold uppercase tracking-wider text-slate-400 mb-2">
                  Needs a second look ({flags.length})
                </p>
                <div className="space-y-1.5">
                  {flags.map((f, i) => {
                    const high = f.level === 'high';
                    return (
                      <div
                        key={i}
                        className={`rounded-lg border px-3 py-2 ${high ? 'border-red-200 bg-red-50' : 'border-amber-200 bg-amber-50'}`}
                      >
                        <p className={`text-[11.5px] font-medium ${high ? 'text-red-800' : 'text-amber-800'}`}>
                          {f.field}: {f.text}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <p className="text-[10.5px] text-slate-500 mt-2">
                  {highCount > 0
                    ? 'These readings are unusual. Confirm they are correct — the report saves exactly as shown.'
                    : 'Advisory only. The report saves exactly as shown.'}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-between gap-3 flex-shrink-0">
          <button
            type="button"
            onClick={onBack}
            disabled={saving}
            className={BTN.outline}
          >
            Back to edit
          </button>
          <button
            type="button"
            onClick={onConfirm}
            disabled={saving}
            className={BTN.primary}
          >
            {saving ? 'Saving…' : 'Confirm & Save'}
          </button>
        </div>
      </div>
    </Modal>
  );
}

/* Report stages. doseIndex ties a stage to its position in the patient's dose
   schedule so a stage can be closed off once that dose is finished. */

const REPORT_STAGES = [
  { value: 'Dose 1 (Day 0) Initial Assessment', doseIndex: 0 },
  { value: 'Dose 2 (Day 3) Follow-up', doseIndex: 1 },
  { value: 'Dose 3 (Day 7) Assessment', doseIndex: 2 },
  { value: 'Dose 4 (Day 14) Follow-up', doseIndex: 3 },
  { value: 'Dose 5 (Day 28) Completion', doseIndex: 4 },
  { value: 'Wound Inspection & RIG Admin', doseIndex: null },
  { value: 'General Consultation & Booster', doseIndex: null }
];

const INJECTION_SITES = ['Right arm', 'Left arm', 'Right thigh', 'Left thigh', 'Around the wound', 'Other'];

/* ─────────────────────────── ENHANCED ADD REPORT POP-UP CARD ─────────────────────────── */
const REPORT_RULES = {
  reportType: f => (f.reportType ? '' : 'Choose the report stage'),
  injectionSite: f => (f.injectionSite ? '' : 'Choose where the shot was given'),
  injectionSiteOther: f => (f.injectionSite === 'Other' && !f.injectionSiteOther.trim() ? 'Type where the shot was given' : ''),
  author: f => (f.author.trim() ? '' : 'Enter the attending doctor or nurse'),
};

function AddReportModal({ patient, doses = [], existingReports = [], onClose, onSave }) {
  // A stage closes once its dose is finished or a report for it already exists,
  // so the same visit cannot be logged twice.
  const stages = REPORT_STAGES.map(s => {
    const alreadyLogged = existingReports.some(rep => rep.title === s.value);
    const dose = s.doseIndex !== null ? doses[s.doseIndex] : null;
    const doseDone = !!dose && (dose.s || dose.status) === 'done';
    return {
      ...s,
      disabled: alreadyLogged || doseDone,
      reason: alreadyLogged ? 'already logged' : doseDone ? 'dose completed' : ''
    };
  });
  const firstOpen = stages.find(s => !s.disabled);

  // Everything starts blank: vitals are measured, not assumed.
  const [reportType, setReportType] = useState('');
  const [bp, setBp] = useState('');
  const [pulse, setPulse] = useState('');
  const [temp, setTemp] = useState('');
  const [weight, setWeight] = useState('');
  const [woundCondition, setWoundCondition] = useState('');
  const [injectionSite, setInjectionSite] = useState('');
  const [injectionSiteOther, setInjectionSiteOther] = useState('');
  const [adverseEvent, setAdverseEvent] = useState('');
  const [author, setAuthor] = useState('');
  const [notes, setNotes] = useState('');

  const resolvedSite = injectionSite === 'Other' ? injectionSiteOther.trim() : injectionSite;
  // Submitting the form no longer writes straight to Firestore — it stages the
  // entry for the confirm card, which owns the actual save.
  const [pending, setPending] = useState(null);
  const [saving, setSaving] = useState(false);
  const [requestClose, discardDialog] = useDiscardGuard(
    { reportType, bp, pulse, temp, weight, woundCondition, injectionSite, injectionSiteOther, adverseEvent, author, notes }, onClose);

  // Inline checks (FormValidation): message under the field, focus the first.
  const reportForm = { reportType, injectionSite, injectionSiteOther, author };
  const v = useFieldErrors(REPORT_RULES, reportForm, 'rep');
  const reportFields = ['reportType', 'injectionSite', 'injectionSiteOther', 'author'];

  function handleSubmit(e) {
    e.preventDefault();
    if (!v.validate(reportFields)) return;
    setPending({
      id: 'rep-' + Date.now(),
      title: reportType,
      bp: bp.trim(),
      pulse: pulse.trim(),
      temp: temp.trim(),
      weight: weight.trim(),
      woundCondition,
      injectionSite: resolvedSite,
      adverseEvent,
      notes: notes.trim(),
      author: author.trim(),
      date: getTodayDateString(),
      createdAt: Date.now()
    });
  }

  async function handleConfirm() {
    if (saving) return;
    setSaving(true);
    try {
      await onSave(pending);
      setPending(null);
      onClose();
    } catch (err) {
      console.error('handleConfirm error:', err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
    <Modal onClose={requestClose}>
      {discardDialog}
      <div
        className="bg-white rounded-3xl shadow-2xl w-full max-w-xl overflow-hidden border border-slate-200 m-auto flex flex-col"
        style={{ maxHeight: 'calc(100vh - 128px)', transition: 'all 0.4s cubic-bezier(0.22,1,0.36,1)' }}
        onClick={e => e.stopPropagation()}
      >
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between flex-shrink-0">
          <div>
            <h3 className="text-sm font-bold text-slate-900">Add Clinical Report / Dose Vitals</h3>
            <p className="text-[11px] text-slate-400 font-normal mt-0.5">Log vitals, injection route, and clinical observations for {patient.name}</p>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={requestClose} />
        </div>

        <form onSubmit={handleSubmit} noValidate className="kna-form-body text-xs font-semibold text-slate-700 overflow-y-auto flex-1">
          {/* Report Stage / Type Dropdown */}
          <div>
            <label htmlFor="rep-reportType" className="block mb-1.5 text-slate-500">Report Stage / Assessment Type <span className="text-rose-600">*</span></label>
            <Select
              {...v.field('reportType', { withBlur: false })}
              value={reportType}
              onChange={e => setReportType(e.target.value)}
              className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
            >
              <option value="">{firstOpen ? 'Select report stage' : 'No stage available to log'}</option>
              {stages.map(s => (
                <option key={s.value} value={s.value} disabled={s.disabled}>
                  {s.value}{s.reason ? ` — ${s.reason}` : ''}
                </option>
              ))}
            </Select>
            <FieldError v={v} name="reportType" />
          </div>

          {/* Vitals Grid (4 Inputs) */}
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            <div>
              <label className="block mb-1 text-slate-500">BP (mmHg)</label>
              <input type="text" value={bp} onChange={e => setBp(e.target.value)} placeholder="e.g. 120/80" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Pulse (bpm)</label>
              <input type="text" value={pulse} onChange={e => setPulse(e.target.value)} placeholder="e.g. 78" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Temp (°C)</label>
              <input type="text" value={temp} onChange={e => setTemp(e.target.value)} placeholder="e.g. 36.6" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
            <div>
              <label className="block mb-1 text-slate-500">Weight (kg)</label>
              <input type="text" value={weight} onChange={e => setWeight(e.target.value)} placeholder="e.g. 60" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
            </div>
          </div>

          {/* Injection Site & Wound Condition Dropdowns */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label htmlFor="rep-injectionSite" className="block mb-1.5 text-slate-500">Where the shot was given <span className="text-rose-600">*</span></label>
              <Select
                {...v.field('injectionSite', { withBlur: false })}
                value={injectionSite}
                onChange={e => setInjectionSite(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                <option value="">Select site</option>
                {INJECTION_SITES.map(site => (
                  <option key={site} value={site}>{site}</option>
                ))}
              </Select>
              <FieldError v={v} name="injectionSite" />
              {injectionSite === 'Other' && (
                <>
                  <input
                    type="text"
                    {...v.field('injectionSiteOther')}
                    aria-label="Where the shot was given"
                    value={injectionSiteOther}
                    onChange={e => setInjectionSiteOther(e.target.value)}
                    autoFocus
                    placeholder="Type where the shot was given"
                    className="w-full mt-2 py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]"
                  />
                  <FieldError v={v} name="injectionSiteOther" />
                </>
              )}
            </div>

            <div>
              <label className="block mb-1.5 text-slate-500">Wound Condition</label>
              <Select
                value={woundCondition}
                onChange={e => setWoundCondition(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                <option value="">Select condition</option>
                <option value="Clean / Healing Well">Clean / Healing Well</option>
                <option value="Slight Erythema (Redness)">Slight Erythema (Redness)</option>
                <option value="Swollen / Inflamed">Swollen / Inflamed</option>
                <option value="Infected / Purulent Drainage">Infected / Purulent Drainage</option>
                <option value="No Active Wound / Intact Skin">No Active Wound / Intact Skin</option>
              </Select>
            </div>
          </div>

          {/* Adverse Event Dropdown & Attending */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block mb-1.5 text-slate-500">Adverse Event / Reaction</label>
              <Select
                value={adverseEvent}
                onChange={e => setAdverseEvent(e.target.value)}
                className="w-full py-2.5 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF] bg-white font-medium text-slate-800"
              >
                <option value="">Select reaction</option>
                <option value="None / Normal Response">None / Normal Response</option>
                <option value="Mild Local Pain & Swelling">Mild Local Pain & Swelling</option>
                <option value="Low-grade Fever / Fatigue">Low-grade Fever / Fatigue</option>
                <option value="Mild Skin Rash / Allergy">Mild Skin Rash / Allergy</option>
                <option value="Severe Reaction (Requires MD Review)">Severe Reaction (Requires MD Review)</option>
              </Select>
            </div>

            <div>
              <label htmlFor="rep-author" className="block mb-1.5 text-slate-500">Attending Doctor / Nurse <span className="text-rose-600">*</span></label>
              <input type="text" {...v.field('author')} value={author} onChange={e => setAuthor(e.target.value)} placeholder="Name of doctor or nurse" className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]" />
              <FieldError v={v} name="author" />
            </div>
          </div>

          {/* Clinical Notes & Observations */}
          <div>
            <label className="block mb-1 text-slate-500">Doctor / Nurse Observations & Notes</label>
            <textarea
              value={notes}
              onChange={e => setNotes(e.target.value)}
              rows={3}
              placeholder="Record clinical observations, wound dressing details, prescription recommendations, or patient instructions..."
              className="w-full py-2 px-3 border border-slate-300 rounded-xl outline-none focus:border-[#3B50DF]"
            />
          </div>

          {v.count(reportFields) > 0 && <FormErrorNote count={v.count(reportFields)} className="self-end" />}
          <div className="pt-3 flex gap-3">
            <button type="button" onClick={requestClose} className={`${BTN.outline} flex-1`}>Cancel</button>
            <button type="submit" className={`${BTN.primary} flex-1`}>Review &amp; Save</button>
          </div>
        </form>
      </div>
    </Modal>

    {pending && (
      <ConfirmReportCard
        patient={patient}
        report={pending}
        saving={saving}
        onBack={() => setPending(null)}
        onConfirm={handleConfirm}
      />
    )}
    </>
  );
}

/* ─────────────────────────── VIEW REPORT MODAL ─────────────────────────── */
function ViewReportModal({ report, patientName, onClose }) {
  return (
    <Modal onClose={onClose}>
      <div className="bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden border border-slate-200" onClick={e => e.stopPropagation()}>
        <div className="px-6 py-4 border-b border-slate-100 bg-slate-50 flex items-center justify-between">
          <h3 className="text-sm font-bold text-slate-900">{report.title || 'Clinical Report'}</h3>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={onClose} />
        </div>
        <div className="p-6 space-y-4 text-xs font-medium text-slate-700">
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-100 space-y-2">
            <p className="text-slate-500"><strong className="text-slate-800">Patient:</strong> {patientName}</p>
            <p className="text-slate-500"><strong className="text-slate-800">Date:</strong> {fmtDate(report.date || report.createdAt)}</p>
            <p className="text-slate-500"><strong className="text-slate-800">Attending:</strong> {report.author || 'Clinical Nurse'}</p>
          </div>

          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="p-2.5 bg-indigo-50/70 border border-indigo-100 rounded-2xl">
              <span className="text-[10px] font-bold text-indigo-400 uppercase tracking-wider block">BP</span>
              <span className="text-xs font-extrabold text-[#3B50DF] mt-0.5 block">{report.bp || '—'}</span>
            </div>
            <div className="p-2.5 bg-emerald-50/70 border border-emerald-100 rounded-2xl">
              <span className="text-[10px] font-bold text-emerald-500 uppercase tracking-wider block">Weight</span>
              <span className="text-xs font-extrabold text-emerald-700 mt-0.5 block">{report.weight ? `${report.weight} kg` : '—'}</span>
            </div>
            <div className="p-2.5 bg-amber-50/70 border border-amber-100 rounded-2xl">
              <span className="text-[10px] font-bold text-amber-500 uppercase tracking-wider block">Temp</span>
              <span className="text-xs font-extrabold text-amber-700 mt-0.5 block">{report.temp ? `${report.temp} °C` : '—'}</span>
            </div>
          </div>

          <div>
            <span className="block font-bold text-slate-800 mb-1">Clinical Notes & Observations:</span>
            <p className="text-slate-600 leading-relaxed bg-slate-50 p-3 rounded-2xl border border-slate-100 whitespace-pre-wrap">
              {report.notes || 'No detailed clinical notes attached.'}
            </p>
          </div>

          <button onClick={onClose} className="w-full py-2.5 rounded-xl bg-slate-900 text-white font-bold cursor-pointer hover:bg-slate-800">Close Report</button>
        </div>
      </div>
    </Modal>
  );
}

/* ─────────────────────────── FOLLOW-UP NOTIFICATION MODAL ─────────────────────────── */
// Manual send. The same /api/notifications send-followup action also backs the
// automatic due-dose sweep, so both paths produce identical patient-facing
// notifications and identical acknowledgement tracking.
export function FollowUpModal({ patient, onClose, onToast }) {
  const PRESETS = [
    { key: 'due', label: 'Dose due reminder', text: 'Your next anti-rabies vaccine dose is due. Please visit K&A Clinic on your scheduled date to stay on track with your treatment.' },
    { key: 'missed', label: 'Missed dose follow-up', text: 'Our records show you missed a scheduled dose. Please visit K&A Clinic as soon as possible so your treatment schedule can be adjusted safely.' },
    { key: 'checkup', label: 'Wound check-up', text: 'Please come in for a follow-up wound assessment at K&A Clinic. Bring your patient record with you.' },
    { key: 'custom', label: 'Custom message', text: '' },
  ];
  const [preset, setPreset] = useState('due');
  const [message, setMessage] = useState(PRESETS[0].text);
  const [sending, setSending] = useState(false);
  // The toast renders under the modal's portal, so a send needs its own
  // confirmation inside the card.
  const [sentTo, setSentTo] = useState('');
  const [sentSuccess, setSentSuccess] = useState(null);
  // Only an edited, unsent message is worth asking about.
  const [requestClose, discardDialog] = useDiscardGuard({ preset, message }, onClose, { enabled: !sentSuccess && !sending });

  const pickPreset = (key) => {
    setPreset(key);
    const found = PRESETS.find(x => x.key === key);
    if (found && found.key !== 'custom') setMessage(found.text);
    if (found && found.key === 'custom') setMessage('');
  };

  async function send() {
    if (!message.trim()) { onToast('Enter a message to send.', 'error'); return; }
    setSending(true);
    try {
      const result = await authedPostJson('/api/notifications', {
        action: 'send-followup',
        patientId: patient.firestoreId || patient.id,
        title: 'Follow-up reminder',
        message: message.trim(),
        source: 'manual',
      });
      if (!result?.success) {
        onToast(result?.error || 'Failed to send follow-up.', 'error');
        setSending(false);
        return;
      }
      const parts = [];
      if (result.pushSent > 0) parts.push('app notification');
      if (result.emailed) parts.push('email');
      
      setSentSuccess({
        message: parts.length
          ? `Follow-up notification sent successfully to ${formatTitleCase(patient.name)} via ${parts.join(' and ')}.`
          : `Follow-up notification logged for ${formatTitleCase(patient.name)}.`,
        channels: parts
      });
      onToast(
        parts.length
          ? `Follow-up sent via ${parts.join(' and ')} to ${formatTitleCase(patient.name)}`
          : `Notification saved for ${formatTitleCase(patient.name)}`,
        'success'
      );
    } catch (err) {
      console.error('Follow-up send error:', err);
      onToast('Failed to send follow-up.', 'error');
    } finally {
      setSending(false);
    }
  }

  return (
    <Modal onClose={requestClose}>
      {discardDialog}
      <div className="w-full max-w-[560px] bg-white rounded-2xl shadow-2xl border border-slate-200 flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
        <div style={{ background: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)', padding: '18px 24px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div>
            <h3 style={{ fontSize: '1.0625rem', fontWeight: 800, color: '#FFFFFF', margin: 0 }}>Send Follow-up</h3>
            <p style={{ fontSize: '.75rem', color: 'rgba(255,255,255,0.65)', margin: '3px 0 0' }}>
              Notifies {formatTitleCase(patient.name)} in the app and by email
            </p>
          </div>
          <IconButton icon={X} label="Close" size={36} iconSize={16} onClick={requestClose} />
        </div>

        {sentSuccess ? (
          <div style={{ padding: '32px 24px', textAlign: 'center' }}>
            <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#DCFCE7', border: '2px solid #86EFAC', color: '#16A34A', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 16px' }}>
              <svg width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>
            </div>
            <h4 style={{ fontSize: '1.125rem', fontWeight: 800, color: '#0F172A', marginBottom: 8 }}>
              Follow-up Sent to Patient!
            </h4>
            <div style={{ background: '#F0FDF4', border: '1px solid #BBF7D0', borderRadius: 12, padding: '14px 18px', maxWidth: 460, margin: '0 auto 18px', textAlign: 'left' }}>
              <p style={{ fontSize: '.875rem', color: '#15803D', fontWeight: 700, margin: 0, display: 'flex', alignItems: 'center', gap: 6 }}>
                <span>✓</span> Delivered to {formatTitleCase(patient.name)}
              </p>
              <p style={{ fontSize: '.75rem', color: '#166534', margin: '4px 0 0', lineHeight: 1.4 }}>
                {sentSuccess.message}
              </p>
            </div>
            <p style={{ fontSize: '.75rem', color: '#64748B', maxWidth: 420, margin: '0 auto 24px', lineHeight: 1.4 }}>
              The patient has received this reminder on their registered channels and can acknowledge it directly in the app.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={onClose}
              style={{ padding: '9px 32px', fontSize: '.875rem', fontWeight: 700, borderRadius: 10 }}
            >
              Done
            </button>
          </div>
        ) : (
          <div style={{ padding: 24 }}>
            <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted-2)', marginBottom: 8 }}>Message Template</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, marginBottom: 16 }}>
              {PRESETS.map(x => (
                <button key={x.key} type="button" onClick={() => pickPreset(x.key)}
                  style={{
                    padding: '10px 12px', borderRadius: 'var(--r-lg)', textAlign: 'left',
                    border: `1px solid ${preset === x.key ? '#7C3AED' : 'var(--border)'}`,
                    background: 'var(--bg)', boxShadow: preset === x.key ? '0 0 0 3px rgba(200,21,26,0.08)' : 'none',
                    cursor: 'pointer', fontFamily: 'inherit',
                    fontSize: '.78125rem', fontWeight: 600, color: 'var(--text)',
                  }}
                >
                  {x.label}
                </button>
              ))}
            </div>

            <div style={{ fontSize: '.625rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '.5px', color: 'var(--muted-2)', marginBottom: 8 }}>Message</div>
            <textarea
              value={message}
              onChange={e => { setMessage(e.target.value); setPreset('custom'); }}
              rows={4}
              placeholder="Write the follow-up message the patient will receive…"
              style={{ width: '100%', padding: '10px 12px', fontSize: '.8125rem', border: '1.5px solid var(--border-2)', borderRadius: 'var(--r-md)', background: '#fff', color: 'var(--text)', outline: 'none', fontFamily: 'inherit', resize: 'vertical' }}
            />

            <div style={{ background: '#EFF6FF', border: '1px solid #BFDBFE', borderRadius: '.625rem', padding: '10px 14px', marginTop: 14, fontSize: '.75rem', color: '#1D4ED8', lineHeight: 1.5 }}>
              The patient gets a push notification in the app and an email
              {patient.email ? ` at ${patient.email}` : ' (no email on file — app only)'}.
              Both include a button to confirm they received it.
            </div>

            <div className="modal-footer" style={{ marginTop: 18, justifyContent: 'space-between' }}>
              <button className={BTN.outline} onClick={requestClose} disabled={sending}>Cancel</button>
              <button className={BTN.primary} onClick={send} disabled={sending}>
                {sending ? 'Sending…' : 'Send Follow-up'}
              </button>
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
