// Server copy of ka-clinic-admin/src/lib/patientArchive.js (its completion section) — the rules for
// when a dose series is complete, when it completed, and when the record is
// due for archiving. Kept as a separate file because serverless functions
// only bundle what lives under api/. Change both together, or the Patients
// list and the nightly archive sweep will disagree.

export const ARCHIVE_AFTER_DAYS = 365;

const TZ = 'Asia/Manila';

export function manilaToday(d = new Date()) {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(d);
}

function addDays(dStr, days) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + days, 12));
  return utc.toISOString().slice(0, 10);
}

const isDoneDose = d => {
  const st = String(d?.s || d?.status || '').toLowerCase();
  return st === 'done' || st === 'completed' || d?.done === true;
};

const toDateOnly = raw => {
  if (!raw) return '';
  if (typeof raw === 'string') return raw.slice(0, 10);
  if (typeof raw?.toDate === 'function') return manilaToday(raw.toDate());
  if (typeof raw === 'number' || raw instanceof Date) return manilaToday(new Date(raw));
  return '';
};

export function isSeriesCompleted(p) {
  if (!p) return false;
  if (p.status === 'completed' || p.status === 'archived' || p.isArchived) return true;
  const doses = p.doses || [];
  return doses.length > 0 && doses.every(isDoneDose);
}

/** Final dose's date — the fallback for records completed before completedAt existed. */
export function lastDoseDate(p) {
  const dates = (p.doses || []).map(d => toDateOnly(d.date)).filter(Boolean).sort();
  return dates[dates.length - 1] || toDateOnly(p.date);
}

export function getCompletionDate(p) {
  if (!isSeriesCompleted(p)) return '';
  return p.completedAt ? toDateOnly(p.completedAt) : lastDoseDate(p);
}

/** The one-year clock starts at completion, or at the latest restore if later. */
export function getArchiveClockStart(p) {
  const done = getCompletionDate(p);
  if (!done) return '';
  const restored = toDateOnly(p?.restoredAt);
  return restored && restored > done ? restored : done;
}

export function getArchiveDueDate(p) {
  const start = getArchiveClockStart(p);
  return start ? addDays(start, ARCHIVE_AFTER_DAYS) : '';
}
