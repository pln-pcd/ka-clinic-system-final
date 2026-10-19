// Activity Log: one append-only `activityLog` entry for every change staff
// make to clinic data. Read by Manage Staff → Activity Log (managers only).
//
// firestore.rules accept an entry only when actorUid is the signed-in user,
// actorRole is that user's live role and createdAt is the server time, and
// they refuse every update and delete, so an entry cannot be forged for
// someone else or changed later. Staff invites, revokes and deletes are
// logged by the server (api/_lib/activityLog.js) with the same shape.
//
// Entry shape:
//   actorUid, actorName, actorRole   who did it
//   action                            ACTIONS key, e.g. 'patient.create'
//   collection, docId, mrn            which record ('' when not a patient)
//   summary                           short readable line for the list —
//                                     never wound location / depth values
//   changes                           [{ field, before, after }] for the
//                                     detail view (may hold any field)
//   createdAt                         server timestamp
import { addDoc, collection, doc, getDoc, serverTimestamp } from 'firebase/firestore';
import { auth, db } from './firebase.js';

export const ACTIONS = {
  'patient.create': 'Patient registered',
  'patient.update': 'Patient record edited',
  'patient.service_add': 'Service added',
  'patient.archive': 'Record archived',
  'patient.restore': 'Record restored',
  'patient.purge': 'Record deleted',
  'patient.report': 'Clinical report changed',
  'patient.map_pin': 'Incident pinned to map',
  'dose.update': 'Dose updated',
  'treatment.update': 'RIG / Anti-Tetanus updated',
  'case.update': 'Case details changed',
  'appointment.create': 'Appointment booked',
  'appointment.confirm': 'Appointment confirmed',
  'appointment.decline': 'Appointment declined',
  'appointment.cancel': 'Appointment cancelled',
  'appointment.cancel_approve': 'Cancellation approved',
  'appointment.cancel_reject': 'Cancellation request declined',
  'appointment.reschedule': 'Appointment rescheduled',
  'appointment.update': 'Appointment updated',
  'appointment.delete': 'Appointment deleted',
  'inventory.create': 'Stock item added',
  'inventory.update': 'Stock item updated',
  'message.reply': 'Message sent to patient',
  'message.thread': 'Conversation updated',
  'notification.send': 'Follow-up sent',
  'settings.update': 'Clinic settings changed',
  'staff.invite': 'Staff invited',
  'staff.invite_cancel': 'Invite revoked',
  'staff.revoke': 'Staff access revoked',
  'staff.delete': 'Staff account deleted',
  'staff.role': 'Staff role changed',
};

export const actionLabel = (a) => ACTIONS[a] || a;

// Fields whose values never appear in a summary. They may appear in the
// before/after detail, which only managers can open.
export const SUMMARY_REDACTED = ['woundLocation', 'woundDepth', 'biteLocation'];

// Actor details, loaded once per signed-in user.
let actorCache = null;
export async function currentActor() {
  const u = auth.currentUser;
  if (!u) throw new Error('Not signed in.');
  if (actorCache?.uid === u.uid) return actorCache;
  const snap = await getDoc(doc(db, 'admins', u.uid));
  const data = snap.exists() ? snap.data() : {};
  actorCache = { uid: u.uid, name: data.name || u.displayName || u.email || 'Staff', role: data.role || '' };
  return actorCache;
}

// Values kept short so one entry stays small; arrays/objects become JSON.
const MAX_VALUE = 600;
function compact(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v === 'object' && typeof v.toDate === 'function') v = v.toDate().toISOString();
  const s = typeof v === 'string' ? v : JSON.stringify(v);
  return s.length > MAX_VALUE ? `${s.slice(0, MAX_VALUE)}…` : s;
}

/**
 * [{ field, before, after }] for the keys that actually changed. `keys`
 * limits the comparison; by default every key of `after` is compared.
 */
export function diffFields(before = {}, after = {}, keys = null) {
  const list = keys || Object.keys(after || {});
  const out = [];
  for (const field of list) {
    const b = compact(before?.[field]);
    const a = compact(after?.[field]);
    if (b !== a) out.push({ field, before: b, after: a });
  }
  return out.slice(0, 60);
}

/**
 * Writes one entry. Never throws: a failed log must not undo or block the
 * change it describes (the change is already saved), so errors are only
 * reported to the console.
 */
export async function logActivity({ action, collection: coll = '', docId = '', mrn = '', summary = '', changes = [] }) {
  try {
    const actor = await currentActor();
    await addDoc(collection(db, 'activityLog'), {
      actorUid: actor.uid,
      actorName: String(actor.name).slice(0, 120),
      actorRole: actor.role,
      action,
      collection: coll,
      docId: String(docId || ''),
      mrn: String(mrn || ''),
      summary: String(summary || actionLabel(action)).slice(0, 300),
      changes: Array.isArray(changes) ? changes : [],
      createdAt: serverTimestamp(),
    });
  } catch (err) {
    console.error('Activity log write failed:', action, err?.code || err);
  }
}
