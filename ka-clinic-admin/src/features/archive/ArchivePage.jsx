// Archive page: archived patient records.
//
// Patient records (vaccinations where isArchived == true) are archived by the
// nightly sweep a year after the dose series completed (or a year after the
// latest restore), and can be restored here by any active admin.
// Archived conversations live in Messages (its Archive tab), not here.
// Every archived record is loaded (no cap), so the count always matches.

import Select from '../../components/Select';
import { ChevronRight, Clock, Eye, RotateCcw, Search, Users } from 'lucide-react';
import { useMemo, useState } from 'react';
import Pager, { PAGE_SIZE, useTableReserve } from '../../components/Pager';
import ConfirmDialog from '../../components/ConfirmDialog';
import EmptyState from '../../components/EmptyState';
import IconButton from '../../components/IconButton';
import Toast from '../../components/Toast';
import { restorePatientRecord, getCompletionDate, getCompletionYear, getRegistrationYear } from '../../lib/patientArchive';
import { formatDateMedium, getName, getTodayDateString } from '../../lib/formatters';
import { useLiveCollection } from '../../lib/liveStore';
import { useAuth } from '../../lib/adminSession';
import { ServiceBadge, globalCSS } from '../patients/shared';
import { MedicalRecordDetail } from '../patients/PatientRecordView';
import { SkeletonRows } from '../../components/Skeleton';

const FIRST_FILTER_YEAR = 2025;

const toMillis = v => (typeof v === 'number' ? v : v?.toMillis?.() ?? 0);
// Registration day: when the record was created (Manila), else its Day 0.
const registeredOn = p => {
  const c = p?.createdAt;
  const d = c?.toDate ? c.toDate() : typeof c === 'number' ? new Date(c) : null;
  return d ? getTodayDateString(d) : String(p?.date || '').slice(0, 10);
};

const card = 'bg-white rounded-2xl border border-slate-200';
const inputCls = 'w-full pl-9 pr-3 py-2 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 outline-none focus:border-[#3B50DF] focus:ring-2 focus:ring-[#3B50DF]/15 transition-colors';
const selectCls = 'py-2 px-3 text-xs rounded-xl border border-slate-300 bg-white text-slate-800 outline-none focus:border-[#3B50DF] cursor-pointer';
// Row height of the archive table, used to reserve a full page of rows.
const ROW_H = 61;

/* ── Patient Records tab ─────────────────────────────────────────────────── */

function ArchivedPatients({ canAct, onToast }) {
  // Shared live data (lib/liveStore.js): instant on return visits.
  const archivedLive = useLiveCollection('archived');
  const rows = archivedLive.rows;
  const loading = !archivedLive.loaded;
  const [search, setSearch] = useState('');
  const [yearFilter, setYearFilter] = useState(''); // '' | 'registered:2025' | 'completed:2025'
  const [sortBy, setSortBy] = useState('archived_desc');
  const [page, setPage] = useState(1);
  const [openId, setOpenId] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(false);


  const years = useMemo(() => {
    const last = Math.max(new Date().getFullYear(), ...rows.map(p => Math.max(getRegistrationYear(p) || 0, getCompletionYear(p) || 0)));
    const list = [];
    for (let y = last; y >= FIRST_FILTER_YEAR; y--) list.push(y);
    return list;
  }, [rows]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    const [basis, yearStr] = yearFilter.split(':');
    const year = Number(yearStr);
    return rows
      .filter(p => !q || getName(p).toLowerCase().includes(q) || String(p.id || p.firestoreId).toLowerCase().includes(q))
      .filter(p => !yearFilter || (basis === 'completed' ? getCompletionYear(p) : getRegistrationYear(p)) === year)
      .sort((a, b) => {
        if (sortBy === 'archived_asc') return toMillis(a.archivedAt) - toMillis(b.archivedAt);
        if (sortBy === 'completed_desc') return getCompletionDate(b).localeCompare(getCompletionDate(a));
        if (sortBy === 'name_asc') return getName(a).localeCompare(getName(b));
        if (sortBy === 'id_asc') return String(a.id || a.firestoreId).localeCompare(String(b.id || b.firestoreId));
        return toMillis(b.archivedAt) - toMillis(a.archivedAt);
      });
  }, [rows, search, yearFilter, sortBy]);

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, pages);
  const visible = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const [tableAreaRef, tableReserve] = useTableReserve(ROW_H);

  async function doRestore() {
    const p = confirm.patient;
    setBusy(true);
    try {
      await restorePatientRecord(p);
      onToast(`${getName(p)} was restored to the Patients list.`, 'success');
      setConfirm(null);
      setOpenId(null);
    } catch (err) {
      console.error('Restore failed:', err);
      onToast('Could not restore this record. Please try again.', 'error');
    } finally {
      setBusy(false);
    }
  }

  const askRestore = p => setConfirm({ patient: p });
  const confirmDialog = confirm && (
    <ConfirmDialog
      variant="neutral"
      size="compact"
      icon={RotateCcw}
      title="Restore record?"
      subtitle="Archived patient record"
      message={<>The record returns to <strong>Patients</strong> as <strong>Completed</strong>.</>}
      details={[
        ['Patient', getName(confirm.patient)],
        ['MRN', confirm.patient.id || confirm.patient.firestoreId],
        ['Completed', getCompletionDate(confirm.patient) ? formatDateMedium(getCompletionDate(confirm.patient)) : ''],
        ['App sign-in', 'Allowed again'],
      ]}
      note="Auto-archives again in 1 year."
      noteIcon={Clock}
      confirmLabel="Restore"
      busyLabel="Restoring…"
      busy={busy}
      onConfirm={doRestore}
      onCancel={() => setConfirm(null)}
    />
  );

  const open = openId && rows.find(p => p.firestoreId === openId);
  if (open) {
    return (
      <>
        <style>{globalCSS}</style>
        <div className="-mx-6 -my-5">
          <MedicalRecordDetail
            patient={open}
            records={rows}
            patients={rows}
            onBack={() => setOpenId(null)}
            onToast={onToast}
            readOnly
            onRestore={canAct ? () => askRestore(open) : undefined}
            restoring={busy}
            backLabel="Back to Archive"
          />
        </div>
        {confirmDialog}
      </>
    );
  }

  // Counts for the lifecycle strip.
  const thisYear = new Date().getFullYear();
  const archivedThisYear = rows.filter(p => {
    const ms = toMillis(p.archivedAt);
    return ms && new Date(ms).getFullYear() === thisYear;
  }).length;
  const reArchived = rows.filter(p => p.restoredAt).length;
  const lifecycle = ['Registered', 'Completed', 'Auto-archived 1 year after completion'];

  return (
    <>
      {/* Record lifecycle: how a record gets here, above the table. */}
      <div className={`${card} px-5 py-3.5 mb-4 flex items-center justify-between gap-x-6 gap-y-2.5 flex-wrap`}>
        <div className="min-w-0">
          <p className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">Record lifecycle</p>
          <ol className="flex items-center flex-wrap gap-x-1.5 gap-y-1 mt-1" aria-label="Record lifecycle">
            {lifecycle.map((step, i) => (
              <li key={step} className="flex items-center gap-1.5 text-xs font-semibold text-slate-800">
                {i > 0 && <ChevronRight size={13} className="text-slate-400" aria-hidden="true" />}
                {step}
              </li>
            ))}
          </ol>
          <p className="text-[11px] text-slate-500 mt-1">A restored record goes back to Patients and auto-archives again 1 year after the restore.</p>
        </div>
        {!loading && (
          <dl className="flex items-center gap-2.5 shrink-0">
            {[['Archived', rows.length], [`Archived in ${thisYear}`, archivedThisYear], ['Re-archived', reArchived]].map(([label, n]) => (
              <div key={label} className="rounded-xl border border-slate-200 px-3 py-1.5 text-center min-w-[92px]">
                <dt className="text-[10px] font-medium text-slate-500 uppercase tracking-wider">{label}</dt>
                <dd className="text-sm font-semibold text-slate-900 mt-0.5 tabular-nums">{n}</dd>
              </div>
            ))}
          </dl>
        )}
      </div>

      <div className={card}>
        <div className="px-5 py-4 border-b border-slate-200 flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[220px] max-w-sm">
            <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
            <input className={inputCls} placeholder="Search by name or patient ID" value={search} onChange={e => { setSearch(e.target.value); setPage(1); }} />
          </div>
          <Select className={selectCls} value={yearFilter} onChange={e => { setYearFilter(e.target.value); setPage(1); }} aria-label="Year">
            <option value="">All years</option>
            <optgroup label="Registered in">
              {years.map(y => <option key={`r${y}`} value={`registered:${y}`}>Registered {y}</option>)}
            </optgroup>
            <optgroup label="Completed in">
              {years.map(y => <option key={`c${y}`} value={`completed:${y}`}>Completed {y}</option>)}
            </optgroup>
          </Select>
          <Select className={selectCls} value={sortBy} onChange={e => setSortBy(e.target.value)} aria-label="Sort">
            <option value="archived_desc">Archived (newest)</option>
            <option value="archived_asc">Archived (oldest)</option>
            <option value="completed_desc">Completed (newest)</option>
            <option value="name_asc">Name (A to Z)</option>
            <option value="id_asc">Patient ID</option>
          </Select>
        </div>

        <div ref={tableAreaRef} className="flex flex-col" style={{ minHeight: tableReserve }}>
        {loading ? (
          <SkeletonRows rows={6} />
        ) : filtered.length === 0 ? (
          rows.length === 0
            ? <EmptyState icon={Users} title="No archived patient records" text="Records move here automatically one year after their dose series is completed." />
            : <EmptyState icon={Search} title="No matching records" text="Try another name, patient ID, or year." />
        ) : (
          <div style={{ overflowX: 'auto', flex: 1 }}>
            <table className="kna-table" style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', textAlign: 'left', fontSize: '.8125rem', tableLayout: 'fixed' }}>
              <colgroup>
                <col style={{ width: '11%' }} /><col style={{ width: '20%' }} /><col style={{ width: '12%' }} />
                <col style={{ width: '13%' }} /><col style={{ width: '13%' }} /><col style={{ width: '19%' }} /><col style={{ width: '12%' }} />
              </colgroup>
              <thead>
                <tr style={{ background: '#FAFAFA', borderBottom: '1px solid #E2E8F0', color: '#64748B', fontSize: '.6875rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '.5px' }}>
                  <th style={{ padding: '14px 16px 14px 20px' }}>Patient ID</th>
                  <th style={{ padding: '14px 16px' }}>Name</th>
                  <th style={{ padding: '14px 16px' }}>Service</th>
                  <th style={{ padding: '14px 16px' }}>Created</th>
                  <th style={{ padding: '14px 16px' }}>Completed</th>
                  <th style={{ padding: '14px 16px' }}>Archived</th>
                  <th style={{ padding: '14px 20px 14px 16px', textAlign: 'center' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {visible.map(p => {
                  const archivedMs = toMillis(p.archivedAt);
                  return (
                    <tr key={p.firestoreId} onClick={() => setOpenId(p.firestoreId)} className="cursor-pointer hover:bg-slate-50 transition-colors" style={{ borderBottom: '1px solid #F1F5F9' }}>
                      <td style={{ padding: '14px 16px 14px 20px', color: '#64748B', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{p.id || p.firestoreId}</td>
                      <td style={{ padding: '14px 16px', color: '#0F172A', fontWeight: 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }} title={getName(p)}>{getName(p)}</td>
                      <td style={{ padding: '14px 16px' }}><ServiceBadge service={p.service} /></td>
                      <td style={{ padding: '14px 16px', color: '#334155', whiteSpace: 'nowrap' }}>{registeredOn(p) ? formatDateMedium(registeredOn(p)) : '—'}</td>
                      <td style={{ padding: '14px 16px', color: '#334155', whiteSpace: 'nowrap' }}>{getCompletionDate(p) ? formatDateMedium(getCompletionDate(p)) : '—'}</td>
                      <td style={{ padding: '14px 16px', whiteSpace: 'nowrap' }}>
                        <div style={{ color: '#334155' }}>{archivedMs ? formatDateMedium(archivedMs) : '—'}</div>
                        <div style={{ fontSize: '.6875rem', color: '#64748B', marginTop: 2 }}>
                          {p.restoredAt ? `Re-archived after restore (${formatDateMedium(p.restoredAt)})` : 'Auto-archived after 1 year'}
                        </div>
                      </td>
                      <td style={{ padding: '14px 20px 14px 16px', textAlign: 'center' }} onClick={e => e.stopPropagation()}>
                        <div className="flex justify-center gap-1.5">
                          <IconButton bordered icon={Eye} label={`View ${getName(p)}`} onClick={() => setOpenId(p.firestoreId)} />
                          {canAct && <IconButton bordered icon={RotateCcw} label="Restore to Patients" onClick={() => askRestore(p)} />}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        </div>
        <Pager page={safePage} pages={pages} total={filtered.length} onPage={setPage} />
      </div>
      {confirmDialog}
    </>
  );
}

/* ── Page ────────────────────────────────────────────────────────────────── */

export default function ArchivePage() {
  const { status } = useAuth();
  const canAct = status === 'active';
  const [toast, setToast] = useState({ msg: '', type: '' });
  const showToast = (msg, type = '') => {
    setToast({ msg, type });
    setTimeout(() => setToast({ msg: '', type: '' }), 3200);
  };

  return (
    <div className="px-6 py-5 max-w-[1400px] mx-auto">
      <div className="flex items-end justify-between gap-4 flex-wrap mb-4">
        <div>
          <h2 className="text-2xl font-extrabold tracking-tight text-slate-900">Archive</h2>
          <p className="text-sm text-slate-500 mt-1">Archived patient records. Records are never deleted automatically.</p>
        </div>
      </div>

      <ArchivedPatients canAct={canAct} onToast={showToast} />

      <Toast msg={toast.msg} type={toast.type} onClose={() => setToast({ msg: '', type: '' })} />
    </div>
  );
}
