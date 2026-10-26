// Manage Staff → Activity Log (managers only). Every change staff make to
// clinic data, newest first, read from the append-only `activityLog`
// collection (lib/activityLog.js writes it; firestore.rules let only a
// manager read it and nobody edit or delete it).
//
// Filters by staff member, action, date range and MRN run in Firestore
// (indexed in firestore.indexes.json), 25 entries per page with cursors, so
// the view stays fast however long the log grows. Search narrows the page
// that is loaded. A row opens the full entry with before/after values.
//
// With no filter set the log shows today's entries only (clinic time) and
// rolls over to the new day at midnight on its own. Nothing is deleted:
// earlier days stay reachable through any filter (dates, staff, action, MRN),
// which searches the whole history.
import { collection, getDocs, limit, orderBy, query, startAfter, Timestamp, where } from 'firebase/firestore';
import { History, RefreshCw, Search, X } from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';
import DatePicker from '../../components/DatePicker';
import EmptyState from '../../components/EmptyState';
import IconButton from '../../components/IconButton';
import Modal from '../../components/Modal';
import Select from '../../components/Select';
import { SkeletonRows } from '../../components/Skeleton';
import { ACTIONS, actionLabel } from '../../lib/activityLog';
import { BTN, BTN_SM } from '../../lib/buttons';
import { db } from '../../lib/firebase';
import { getTodayDateString } from '../../lib/formatters';

const PAGE = 25;
const FIELD = 'w-full bg-white border border-slate-300 px-3 py-2 rounded-xl text-xs font-semibold text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-[#3B50DF] focus:ring-1 focus:ring-[#3B50DF] transition-all';
const pagerBtn = 'px-3 py-1.5 rounded-lg text-xs font-semibold text-slate-700 bg-white border border-slate-300 hover:bg-slate-50 transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed';

// Dates are the clinic's (Asia/Manila, UTC+8, no daylight saving).
const manilaStart = (ymd) => Timestamp.fromDate(new Date(`${ymd}T00:00:00+08:00`));
const manilaNextDay = (ymd) => Timestamp.fromMillis(new Date(`${ymd}T00:00:00+08:00`).getTime() + 86400000);

function formatWhen(ts) {
  const d = ts?.toDate ? ts.toDate() : null;
  if (!d) return 'Just now';
  return d.toLocaleString('en-US', { timeZone: 'Asia/Manila', month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' });
}
const roleText = (r) => (r === 'manager' ? 'Manager' : (r === 'staff' || r === 'nurse') ? 'Nurse' : r || '—');

export default function ActivityLogPanel({ staff = [] }) {
  const [filters, setFilters] = useState({ actor: '', action: '', from: '', to: '', mrn: '' });
  const [search, setSearch] = useState('');
  const [rows, setRows] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  // cursors[i] is the last doc of page i; page 0 starts at the top.
  const [cursors, setCursors] = useState([]);
  const [page, setPage] = useState(0);
  const [hasNext, setHasNext] = useState(false);
  const [detail, setDetail] = useState(null);
  const [reloadKey, setReloadKey] = useState(0);

  // Today in clinic time. Moves forward at midnight so the unfiltered view
  // clears and starts the new day without a reload.
  const [today, setToday] = useState(() => getTodayDateString());
  useEffect(() => {
    const msToMidnight = manilaNextDay(today).toMillis() - Date.now();
    const timer = setTimeout(() => {
      setToday(getTodayDateString());
      setPage(0);
      setCursors([]);
    }, Math.max(1000, msToMidnight + 1000));
    return () => clearTimeout(timer);
  }, [today]);

  const setFilter = (k, v) => { setFilters(f => ({ ...f, [k]: v })); setPage(0); setCursors([]); };

  // Any Firestore filter searches the full history; with none, today only.
  const todayOnly = !Object.values(filters).some(v => String(v).trim());

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    setError('');
    const c = [];
    if (filters.actor) c.push(where('actorUid', '==', filters.actor));
    if (filters.action) c.push(where('action', '==', filters.action));
    if (filters.mrn.trim()) c.push(where('mrn', '==', filters.mrn.trim().toUpperCase()));
    const from = todayOnly ? today : filters.from;
    const to = todayOnly ? today : filters.to;
    if (from) c.push(where('createdAt', '>=', manilaStart(from)));
    if (to) c.push(where('createdAt', '<', manilaNextDay(to)));
    c.push(orderBy('createdAt', 'desc'));
    if (page > 0 && cursors[page - 1]) c.push(startAfter(cursors[page - 1]));
    c.push(limit(PAGE + 1));
    getDocs(query(collection(db, 'activityLog'), ...c)).then(snap => {
      if (cancelled) return;
      const docs = snap.docs.slice(0, PAGE);
      setRows(docs.map(d => ({ id: d.id, ...d.data() })));
      setHasNext(snap.docs.length > PAGE);
      if (docs.length) setCursors(prev => { const next = prev.slice(0, page); next[page] = docs[docs.length - 1]; return next; });
      setLoading(false);
    }).catch(err => {
      if (cancelled) return;
      console.error('Activity log load failed:', err);
      setError(err?.code === 'permission-denied' ? 'Only managers can view the Activity Log.' : 'Could not load the Activity Log. Please try again.');
      setRows([]);
      setLoading(false);
    });
    return () => { cancelled = true; };
    // cursors is read, not watched: it is written by this effect.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filters, page, reloadKey, todayOnly, today]);

  const shown = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return rows;
    return rows.filter(r => [r.summary, r.actorName, r.mrn, r.docId, actionLabel(r.action)].some(v => String(v || '').toLowerCase().includes(q)));
  }, [rows, search]);

  const anyFilter = Object.values(filters).some(Boolean) || search;
  const staffOptions = staff.slice().sort((a, b) => (a.name || a.email || '').localeCompare(b.name || b.email || ''));

  return (
    <div className="bg-white rounded-3xl border border-slate-200/80 shadow-2xs overflow-hidden">
      <div className="px-6 py-4 border-b border-slate-200 bg-slate-50/60 space-y-3">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <p className="text-xs text-slate-500">
            Every change staff make to patient records, doses, appointments, stock and staff accounts. Entries can't be edited or deleted.
            {todayOnly && <span className="block mt-0.5 font-semibold text-slate-600">Showing today's activity. Use the filters to see earlier days.</span>}
          </p>
          <div className="flex items-center gap-2 shrink-0">
            {anyFilter && (
              <button type="button" className={BTN_SM.outline} onClick={() => { setFilters({ actor: '', action: '', from: '', to: '', mrn: '' }); setSearch(''); setPage(0); setCursors([]); }}>
                Clear filters
              </button>
            )}
            <IconButton bordered icon={RefreshCw} label="Refresh" size={34} iconSize={15} onClick={() => { setPage(0); setCursors([]); setReloadKey(k => k + 1); }} />
          </div>
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-6 gap-2.5">
          <Select value={filters.actor} onChange={e => setFilter('actor', e.target.value)} className={FIELD} aria-label="Staff member">
            <option value="">All staff</option>
            {staffOptions.map(s => <option key={s.uid} value={s.uid}>{s.name || s.email}</option>)}
          </Select>
          <Select value={filters.action} onChange={e => setFilter('action', e.target.value)} className={FIELD} aria-label="Action">
            <option value="">All actions</option>
            {Object.entries(ACTIONS).map(([k, label]) => <option key={k} value={k}>{label}</option>)}
          </Select>
          <DatePicker value={filters.from} onChange={e => setFilter('from', e.target.value)} max={filters.to || undefined} placeholder="From date" className={FIELD} aria-label="From date" clearable />
          <DatePicker value={filters.to} onChange={e => setFilter('to', e.target.value)} min={filters.from || undefined} placeholder="To date" className={FIELD} aria-label="To date" clearable />
          <input value={filters.mrn} onChange={e => setFilter('mrn', e.target.value)} placeholder="MRN, e.g. 2026-014" className={FIELD} aria-label="MRN" />
          <div className="relative">
            <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none" />
            <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search this page…" className={`${FIELD} pl-9 pr-8`} aria-label="Search loaded entries" />
            {search && <IconButton icon={X} label="Clear search" size={28} iconSize={14} className="absolute right-1 top-1/2 -translate-y-1/2" onClick={() => setSearch('')} />}
          </div>
        </div>
      </div>

      <div className="flex flex-col" style={{ minHeight: 420 }}>
        {loading ? (
          <SkeletonRows rows={8} />
        ) : error ? (
          <EmptyState icon={History} title="Activity Log unavailable" text={error} />
        ) : shown.length === 0 ? (
          <EmptyState icon={History} title="No entries" text={anyFilter ? 'No entries match these filters.' : 'No staff activity yet today. Use the filters to see earlier days.'} />
        ) : (
          <div className="overflow-x-auto flex-1">
            <table className="kna-table w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50 border-b border-slate-200">
                  {['When', 'Staff', 'Action', 'Record', 'Summary'].map(h => (
                    <th key={h} className="px-5 py-3 text-[11px] font-extrabold text-slate-500 uppercase tracking-wider whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {shown.map(r => (
                  <tr key={r.id} onClick={() => setDetail(r)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setDetail(r); } }}
                    tabIndex={0} role="button" aria-label={`Open entry: ${r.summary}`}
                    className="hover:bg-slate-50/80 cursor-pointer outline-none focus-visible:bg-indigo-50/60 transition-colors">
                    <td className="px-5 py-3 text-xs font-semibold text-slate-500 whitespace-nowrap">{formatWhen(r.createdAt)}</td>
                    <td className="px-5 py-3">
                      <span className="block text-sm font-bold text-slate-900 whitespace-nowrap">{r.actorName || '—'}</span>
                      <span className="text-[11px] text-slate-400 font-medium">{roleText(r.actorRole)}</span>
                    </td>
                    <td className="px-5 py-3">
                      <span className="inline-block text-[11px] font-bold leading-4 px-2 py-0.5 rounded-md bg-slate-100 text-slate-700 border border-slate-300 whitespace-nowrap">{actionLabel(r.action)}</span>
                    </td>
                    <td className="px-5 py-3 text-xs font-semibold text-slate-600 whitespace-nowrap">{r.mrn ? `MRN ${r.mrn}` : (r.collection || '—')}</td>
                    <td className="px-5 py-3 text-xs text-slate-700 min-w-[260px]">{r.summary}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {!loading && !error && (rows.length > 0 || page > 0) && (
        <div className="px-5 py-3 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-600">
          <span>Page {page + 1}{search ? ` · ${shown.length} of ${rows.length} shown` : ''}</span>
          <div className="flex items-center gap-1.5">
            <button type="button" className={pagerBtn} disabled={page === 0} onClick={() => setPage(p => p - 1)}>Newer</button>
            <button type="button" className={pagerBtn} disabled={!hasNext} onClick={() => setPage(p => p + 1)}>Older</button>
          </div>
        </div>
      )}

      {detail && (
        <Modal onClose={() => setDetail(null)}>
          <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-[720px] max-h-[calc(100vh-32px)] flex flex-col overflow-hidden" onClick={e => e.stopPropagation()}>
            <div className="px-6 py-4 border-b border-slate-100 bg-slate-50/80 flex items-center justify-between gap-3 shrink-0">
              <div className="min-w-0">
                <h3 className="text-base font-bold text-slate-900">{actionLabel(detail.action)}</h3>
                <p className="text-xs text-slate-500 mt-0.5">{formatWhen(detail.createdAt)}</p>
              </div>
              <IconButton icon={X} label="Close" size={36} iconSize={18} onClick={() => setDetail(null)} />
            </div>
            <div className="px-6 py-5 overflow-y-auto flex-1 min-h-0 space-y-5">
              <dl className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
                {[
                  ['Staff', `${detail.actorName || '—'} (${roleText(detail.actorRole)})`],
                  ['Staff UID', detail.actorUid],
                  ['Record', [detail.collection, detail.docId].filter(Boolean).join(' / ') || '—'],
                  ['MRN', detail.mrn || '—'],
                ].map(([k, v]) => (
                  <div key={k}>
                    <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">{k}</dt>
                    <dd className="mt-0.5 text-sm font-medium text-slate-900 break-all">{v}</dd>
                  </div>
                ))}
                <div className="sm:col-span-2">
                  <dt className="text-[11px] font-bold uppercase tracking-wide text-slate-500">Summary</dt>
                  <dd className="mt-0.5 text-sm font-medium text-slate-900 whitespace-pre-wrap break-words">{detail.summary}</dd>
                </div>
              </dl>
              <div>
                <h4 className="text-[11px] font-bold uppercase tracking-wide text-slate-500 mb-2">Changed fields</h4>
                {Array.isArray(detail.changes) && detail.changes.length ? (
                  <div className="border border-slate-200 rounded-xl overflow-hidden">
                    <table className="w-full text-left text-xs">
                      <thead>
                        <tr className="bg-slate-50 border-b border-slate-200">
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider w-1/4">Field</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider">Before</th>
                          <th className="px-3 py-2 font-extrabold text-slate-500 uppercase tracking-wider">After</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {detail.changes.map((c, i) => (
                          <tr key={i} className="align-top">
                            <td className="px-3 py-2 font-semibold text-slate-700 break-all">{c.field}</td>
                            <td className="px-3 py-2 text-slate-600 whitespace-pre-wrap break-all">{c.before ?? <span className="text-slate-400">—</span>}</td>
                            <td className="px-3 py-2 text-slate-900 whitespace-pre-wrap break-all">{c.after ?? <span className="text-slate-400">—</span>}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                ) : <p className="text-xs text-slate-400">No field values recorded for this action.</p>}
              </div>
            </div>
            <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex justify-end shrink-0">
              <button type="button" onClick={() => setDetail(null)} className={BTN.outline}>Close</button>
            </div>
          </div>
        </Modal>
      )}
    </div>
  );
}
