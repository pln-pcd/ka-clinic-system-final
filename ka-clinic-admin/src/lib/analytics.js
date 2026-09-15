// Anonymous system analytics — gated by Settings → System → "Anonymous
// System Analytics" (settings/config.system.analyticsEnabled).
//
// What is recorded: per-day counters of *what happened* (a page was opened,
// an appointment was confirmed, a patient was registered), never *who did it*
// — no admin uid, email, patient name or MRN goes in. Stored on
// settings/analytics as { days: { 'YYYY-MM-DD': { event: count } } }, which
// the existing settings/{docId} admin-write rule already covers.
//
// When the toggle is off nothing is written and nothing is queued.
import { doc, increment, onSnapshot, setDoc } from 'firebase/firestore';
import { db } from './firebase';

let enabled = false;
let listening = false;

function ensureListener() {
  if (listening) return;
  listening = true;
  onSnapshot(doc(db, 'settings', 'config'), snap => {
    enabled = !!snap.data()?.system?.analyticsEnabled;
  }, () => { enabled = false; });
}

function todayKey() {
  const d = new Date();
  return [d.getFullYear(), String(d.getMonth() + 1).padStart(2, '0'), String(d.getDate()).padStart(2, '0')].join('-');
}

// Fire-and-forget. Safe to call anywhere; a failed write is swallowed because
// telemetry must never break the action it is attached to.
export function trackEvent(name) {
  ensureListener();
  if (!enabled || !name) return;
  const key = String(name).replace(/[^a-zA-Z0-9_-]/g, '_');
  setDoc(doc(db, 'settings', 'analytics'), {
    days: { [todayKey()]: { [key]: increment(1) } },
    updatedAt: Date.now(),
  }, { merge: true }).catch(() => {});
}

// Call once at app start so the enabled flag is live before the first event.
export function initAnalytics() {
  ensureListener();
}
