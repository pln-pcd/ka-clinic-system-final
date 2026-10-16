// Slot holds (appointmentSlots) that do not belong to an active appointment.
//
//   node --env-file=.env scripts/audit-slots.mjs          list only (no changes)
//   node --env-file=.env scripts/audit-slots.mjs --fix    delete the listed holds
//
// An hour shows "Full" in the patient app when appointmentSlots/{date_time}
// exists. A hold is valid only while an appointment for that exact date and
// time is pending, confirmed, awaiting a cancellation decision or done. Any
// other hold (cancelled / declined / deleted appointment, or a booking that
// failed halfway) is an orphan and is listed; --fix removes only those.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const sa = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8') || '{}');
const app = getApps()[0] || initializeApp({ credential: cert(sa), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore(app);

const ACTIVE = ['pending', 'confirmed', 'accepted', 'cancellation_pending', 'done'];
const key = (date, time) => `${date}_${String(time).replace(/[\s:]/g, '')}`;

const [slots, appts] = await Promise.all([db.collection('appointmentSlots').get(), db.collection('appointments').get()]);
const active = new Set();
const byKey = new Map();
for (const d of appts.docs) {
  const a = d.data();
  const k = key(a.date, a.time);
  if (!byKey.has(k)) byKey.set(k, []);
  byKey.get(k).push(`${d.id}:${a.status}`);
  if (ACTIVE.includes(String(a.status || 'pending').toLowerCase())) active.add(k);
}
const orphans = slots.docs.filter(d => !active.has(d.id));
console.log(`${slots.size} slot holds, ${appts.size} appointments, ${orphans.length} orphan hold(s)`);
for (const d of orphans) {
  const s = d.data();
  console.log(JSON.stringify({ slot: d.id, date: s.date, time: s.time, createdAt: s.createdAt ? new Date(s.createdAt).toISOString() : null, appointments: byKey.get(d.id) || [] }));
}
if (process.argv.includes('--fix') && orphans.length) {
  const batch = db.batch();
  orphans.forEach(d => batch.delete(d.ref));
  await batch.commit();
  console.log(`Deleted ${orphans.length} orphan hold(s).`);
}
