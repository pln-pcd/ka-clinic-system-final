// A patient record's path to the Archive and back: when its dose series
// counts as completed, when it is due to be archived (365 days after
// completion or the latest restore), and the Archive page's restore and
// delete writes.
import { logActivity } from './activityLog.js';
import { addDaysToDateString, getTodayDateString } from './formatters.js';
import {
  arrayUnion,
  collection,
  deleteField,
  doc,
  getDocs,
  query,
  updateDoc,
  where,
  writeBatch,
} from 'firebase/firestore';
import { auth, db } from './firebase.js';

// ══════════════════════════════════════════════════════════════════════════
// Completion and the archive clock
// ══════════════════════════════════════════════════════════════════════════
// When a patient's dose series counts as finished, when it finished, and when
// the record is due to leave the Patients list for the Archive.
//
// A completed record stays on the main Patients list for ARCHIVE_AFTER_DAYS
// after its completion date (or after its latest restore, if later), then
// the nightly sweep
// (api/notifications.js ?action=patient-archive-sweep) archives it. The
// server keeps its own copy of these rules in api/_lib/patientCompletion.js —
// the two must stay in step, or the list and the sweep will disagree about
// which records are due.


export const ARCHIVE_AFTER_DAYS = 365;

const isDoneDose = d => {
  const st = String(d?.s || d?.status || '').toLowerCase();
  return st === 'done' || st === 'completed' || d?.done === true;
};

// YYYY-MM-DD from a date string, Timestamp, Date or millis; '' if unreadable.
// A non-ISO string ("June 26, 2025") is parsed rather than sliced.
const toDateOnly = raw => {
  if (!raw) return '';
  if (typeof raw === 'string') {
    if (/^\d{4}-\d{2}-\d{2}/.test(raw)) return raw.slice(0, 10);
    const t = Date.parse(raw);
    return Number.isNaN(t) ? '' : getTodayDateString(new Date(t));
  }
  if (typeof raw?.toDate === 'function') return getTodayDateString(raw.toDate());
  if (typeof raw === 'number' || raw instanceof Date) return getTodayDateString(new Date(raw));
  return '';
};

/** Every scheduled dose is marked done (or staff set the record completed). */
export function isSeriesCompleted(p) {
  if (!p) return false;
  if (p.status === 'completed' || p.status === 'archived' || p.isArchived) return true;
  const doses = p.doses || [];
  return doses.length > 0 && doses.every(isDoneDose);
}

/**
 * YYYY-MM-DD the series finished, or '' if it hasn't.
 * completedAt is written when the last dose is marked done. Records completed
 * before that field existed fall back to the date of the final dose in their
 * schedule, which is what the one-time backfill wrote for them too.
 */
export function getCompletionDate(p) {
  if (!isSeriesCompleted(p)) return '';
  const stamped = p.completedAt ? toDateOnly(p.completedAt) : '';
  if (stamped) return stamped;
  const dates = (p.doses || []).map(d => toDateOnly(d.date)).filter(Boolean).sort();
  return dates[dates.length - 1] || toDateOnly(p.date);
}

/** YYYY-MM-DD of the latest restore from the Archive, or ''. */
export function getRestoreDate(p) {
  return toDateOnly(p?.restoredAt);
}

/**
 * The "Restored: <date>" note on the Patients table and the record header:
 * shown whenever the record has been restored from the Archive, including
 * while a new service registered on it is ongoing or completed. It leaves
 * the Patients list only with the record itself (re-archived); restoring it
 * again shows the newest date, and earlier restores stay in restoreHistory.
 * The Restored filter and sort use this same rule.
 *
 * restoredLabelHidden (written briefly by an earlier version when a new
 * service started) is ignored, so those records show the note again.
 */
export function showsRestoredLabel(p) {
  return Boolean(getRestoreDate(p));
}

/**
 * When the one-year stay on the Patients list starts: the completion date,
 * or the latest restore if that is later. Restoring an archived record
 * restarts the year, so it cannot be re-archived early.
 */
export function getArchiveClockStart(p) {
  const done = getCompletionDate(p);
  if (!done) return '';
  const restored = getRestoreDate(p);
  return restored && restored > done ? restored : done;
}

/** YYYY-MM-DD the record becomes due for archiving, or '' if not completed. */
export function getArchiveDueDate(p) {
  const start = getArchiveClockStart(p);
  return start ? addDaysToDateString(start, ARCHIVE_AFTER_DAYS) : '';
}

/** Year the patient registered (their record's Day 0), for the year filter. */
export function getRegistrationYear(p) {
  const d = toDateOnly(p?.date) || toDateOnly(p?.createdAt);
  return d ? Number(d.slice(0, 4)) : null;
}

export function getCompletionYear(p) {
  const d = getCompletionDate(p);
  return d ? Number(d.slice(0, 4)) : null;
}

// ══════════════════════════════════════════════════════════════════════════
// Archive page actions
// ══════════════════════════════════════════════════════════════════════════
// Writes behind the Archive page's two actions.
//
// Patient records: archived automatically by the nightly sweep a year after
// completion, and restorable here. Restore keeps status and completedAt as
// they are (the record still reads "Completed on <original date>") and
// records restoredAt, which restarts the one-year stay on the Patients list
// (getArchiveClockStart above). Incident pins are left
// alone, so a completed record stays off the map after restore. Sign-in to
// the patient app unlocks by itself because the server checks isArchived
// live on every attempt.
//
// Conversations: archived manually from Messages (never automatically),
// never restored. Staff can delete one permanently here; the nightly job
// deletes any archived longer than 30 days.


const toMillis = v => (typeof v === 'number' ? v : v?.toMillis?.() ?? null);

export async function restorePatientRecord(patient) {
  const id = patient?.firestoreId || patient?.id;
  if (!id) throw new Error('This record has no id.');
  const u = auth.currentUser;
  const restoredBy = { uid: u?.uid || null, name: u?.displayName || u?.email || 'Admin' };
  const restoredAt = getTodayDateString();
  await updateDoc(doc(db, 'vaccinations', id), {
    isArchived: false,
    archivedAt: deleteField(),
    archivedBy: deleteField(),
    restoredAt,
    restoredBy,
    restoredLabelHidden: deleteField(),
    restoreHistory: arrayUnion({
      restoredAt,
      restoredAtMs: Date.now(),
      restoredBy,
      previousArchivedAt: toMillis(patient.archivedAt),
    }),
  });
  logActivity({ action: 'patient.restore', collection: 'vaccinations', docId: id, mrn: id,
    summary: `Restored archived record MRN ${id}`, changes: [{ field: 'isArchived', before: 'true', after: 'false' }] });
  return restoredAt;
}

// Permanently removes an archived conversation and every message in it.
export async function deleteArchivedConversation(threadId) {
  if (!threadId) throw new Error('This conversation has no id.');
  const msgs = await getDocs(query(collection(db, 'chatMessages'), where('threadId', '==', threadId)));
  const refs = [...msgs.docs.map(d => d.ref), doc(db, 'chatThreads', threadId)];
  for (let i = 0; i < refs.length; i += 450) {
    const batch = writeBatch(db);
    refs.slice(i, i + 450).forEach(r => batch.delete(r));
    await batch.commit();
  }
  logActivity({ action: 'message.thread', collection: 'chatThreads', docId: threadId,
    summary: `Deleted an archived conversation and its ${refs.length - 1} message(s)` });
}
