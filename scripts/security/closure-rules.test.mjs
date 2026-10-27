// Firestore rules for appointments inside a clinic closure (emulator only):
// a patient cannot cancel one, can reschedule it (clearing the closure flag
// or, from an older app, leaving it), and can never set the flag.
// Run: firebase emulators:exec --only firestore "node scripts/security/closure-rules.test.mjs"
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertFails, assertSucceeds } from '@firebase/rules-unit-testing';
import { doc, setLogLevel, updateDoc } from 'firebase/firestore';

setLogLevel('silent');
const env = await initializeTestEnvironment({ projectId: 'demo-ka-security', firestore: {
  host: '127.0.0.1', port: 8080, rules: readFileSync('ka-clinic-admin/firestore.rules', 'utf8'),
} });
const uid = 'security-a', authTime = Math.floor(Date.now() / 1000);
const base = { patientUid: uid, userId: uid, patientId: '2026-001', name: 'Simulated A', contactNumber: '0000000000', date: '2026-12-12', time: '3:00 PM - 4:00 PM', status: 'confirmed' };
await env.withSecurityRulesDisabled(async ctx => {
  const db = ctx.firestore();
  const { setDoc } = await import('firebase/firestore');
  await setDoc(doc(db, 'vaccinations/2026-001'), { authUid: uid, email: 'a@example.test', isArchived: false });
  await setDoc(doc(db, `securitySessions/${uid}_${authTime}`), { uid, authTime, mrn: '2026-001', scope: 'patient', expiresAt: Date.now() + 3600000 });
  await setDoc(doc(db, 'appointments/affected'), { ...base, affectedByClosure: true, closureId: 'c1', closureReason: 'Maintenance' });
  await setDoc(doc(db, 'appointments/affected2'), { ...base, affectedByClosure: true, closureId: 'c1', closureReason: 'Maintenance' });
  await setDoc(doc(db, 'appointments/normal'), { ...base });
  await setDoc(doc(db, 'appointments/normal2'), { ...base });
});
const db = env.authenticatedContext(uid, { email: 'a@example.test', auth_time: authTime, firebase: { sign_in_provider: 'custom' } }).firestore();
const move = { date: '2026-12-19', time: '9:00 AM - 10:00 AM', status: 'pending', previousDate: '2026-12-12', previousTime: '3:00 PM - 4:00 PM', updatedAt: Date.now() };
const cases = [
  ['cancel affected appointment is refused', assertFails(updateDoc(doc(db, 'appointments/affected'), { status: 'cancelled', updatedAt: Date.now() }))],
  ['reschedule affected, clearing flag (1.0.18+)', assertSucceeds(updateDoc(doc(db, 'appointments/affected'), { ...move, affectedByClosure: false, closureId: null, closureReason: null }))],
  ['reschedule affected, flag untouched (older app)', assertSucceeds(updateDoc(doc(db, 'appointments/affected2'), move))],
  ['patient cannot set the closure flag', assertFails(updateDoc(doc(db, 'appointments/normal'), { ...move, affectedByClosure: true }))],
  ['cancel normal appointment still allowed', assertSucceeds(updateDoc(doc(db, 'appointments/normal2'), { status: 'cancelled', updatedAt: Date.now() }))],
];
let failed = 0;
for (const [name, p] of cases) {
  try { await p; console.log(`PASS ${name}`); } catch (e) { failed++; console.log(`FAIL ${name}: ${e.message.split('\n')[0]}`); }
}
await env.cleanup();
process.exit(failed ? 1 : 0);
