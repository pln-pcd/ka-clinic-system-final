// Checks the restore clock, the archived-login gate and the 30-day
// conversation deletion against the seeded emulator, using the real server
// code (the nightly sweeps and the login check) with a simulated "today".
//
//   npm run test:archive-clock        (after npm run emulators + seed:demo)
//
// Emulator only. Every document it touches is put back exactly as it was
// before, so the demo data is unchanged afterwards.
import { FieldValue } from 'firebase-admin/firestore';
import { addDaysToDateString, getTodayDateString } from '../../ka-clinic-admin/src/lib/formatters.js';
import { connect, parseArgs } from './demo-data.mjs';

const args = parseArgs();
if (!args.flags.has('emulator')) {
  console.error('This test only runs against the emulator (--emulator --project demo-...).');
  process.exit(1);
}
const { db } = connect(args);

// Imported after connect() so the server code picks up the emulator settings.
const { runPatientArchiveSweep, deleteExpiredArchivedConversations } = await import('../../api/notifications.js');
const { isPatientRecordArchived } = await import('../../api/_lib/auth.js');

const T = getTodayDateString();
const plus = n => addDaysToDateString(T, n);
let failures = 0;
const check = (label, ok, detail = '') => {
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}${detail ? `  (${detail})` : ''}`);
  if (!ok) failures++;
};

// Snapshot everything the sweeps can write, to restore at the end.
async function snapshot() {
  const cols = ['vaccinations', 'incidents', 'chatThreads', 'chatMessages'];
  const docs = [];
  for (const c of cols) (await db.collection(c).get()).docs.forEach(d => docs.push({ ref: d.ref, data: d.data() }));
  return docs;
}
async function rollback(saved) {
  for (const c of ['vaccinations', 'incidents', 'chatThreads', 'chatMessages']) {
    const now = await db.collection(c).get();
    const keep = new Set(saved.filter(s => s.ref.parent.id === c).map(s => s.ref.path));
    for (const d of now.docs) if (!keep.has(d.ref.path)) await d.ref.delete();
  }
  for (const s of saved) await s.ref.set(s.data);
}
const archived = async mrn => (await db.collection('vaccinations').doc(mrn).get()).data()?.isArchived === true;

const saved = await snapshot();
try {
  const demo = (await db.collection('vaccinations').where('isDemo', '==', true).get()).docs.map(d => ({ id: d.id, ...d.data() }));
  const restored = demo.find(p => p.restoredAt && !p.isArchived);
  const toRestore = demo.find(p => p.isArchived);
  if (!restored || !toRestore) throw new Error('Seed the demo data first (npm run seed:demo).');

  console.log(`Today ${T}\n`);
  console.log(`1. Seeded restored record ${restored.id}, restored ${restored.restoredAt}`);
  await runPatientArchiveSweep(T);
  check('not archived by tonight\'s sweep', !(await archived(restored.id)));
  const back = addDaysToDateString(restored.restoredAt, 364);
  await runPatientArchiveSweep(back);
  check(`not archived 364 days after restore (${back})`, !(await archived(restored.id)));
  const due = addDaysToDateString(restored.restoredAt, 366);
  await runPatientArchiveSweep(due);
  check(`archived again 366 days after restore (${due})`, await archived(restored.id));

  await rollback(saved);

  console.log(`\n2. Restore archived record ${toRestore.id} today, as the Archive page does`);
  check('patient app sign-in blocked while archived', await isPatientRecordArchived(toRestore.id));
  const restoredBy = { uid: 'demo-admin-manager', name: 'Demo Manager' };
  await db.collection('vaccinations').doc(toRestore.id).update({
    isArchived: false,
    archivedAt: FieldValue.delete(),
    archivedBy: FieldValue.delete(),
    restoredAt: T,
    restoredBy,
    restoreHistory: FieldValue.arrayUnion({ restoredAt: T, restoredAtMs: Date.now(), restoredBy, previousArchivedAt: toRestore.archivedAt?.toMillis?.() ?? null }),
  });
  check('patient app sign-in allowed again after restore', !(await isPatientRecordArchived(toRestore.id)));
  const after = (await db.collection('vaccinations').doc(toRestore.id).get()).data();
  check('status and completion date unchanged', after.status === 'completed' && after.completedAt === toRestore.completedAt, `${after.status}, ${after.completedAt}`);
  for (const [label, date] of [['same day', T], ['next run', plus(1)], ['day 364', plus(364)]]) {
    await runPatientArchiveSweep(date);
    check(`not re-archived on ${label} (${date})`, !(await archived(toRestore.id)));
  }
  await runPatientArchiveSweep(plus(365));
  check(`archived on day 365 (${plus(365)})`, await archived(toRestore.id));
  const pinIds = after.incidentIds || [];
  for (const id of pinIds) {
    const pin = (await db.collection('incidents').doc(id).get()).data();
    check(`incident pin ${id} stays hidden`, pin?.mapHidden === true);
  }

  await rollback(saved);

  console.log('\n3. Archived conversations are deleted 30 days after archiving');
  const threads = (await db.collection('chatThreads').where('archived', '==', true).get()).docs.map(d => ({ id: d.id, at: d.data().archivedAt }));
  const probe = Date.now() + 20 * 86400000;
  const expected = threads.filter(t => t.at <= probe - 30 * 86400000).map(t => t.id).sort();
  const result = await deleteExpiredArchivedConversations(probe);
  const left = (await db.collection('chatThreads').where('archived', '==', true).get()).docs.map(d => d.id);
  check(`20 days from now, ${expected.length} of ${threads.length} are past 30 days and deleted`, result.deleted === expected.length && expected.every(id => !left.includes(id)), `deleted ${result.deleted}, messages ${result.messages}`);
  const orphan = [];
  for (const id of expected) if (!(await db.collection('chatMessages').where('threadId', '==', id).get()).empty) orphan.push(id);
  check('their messages are deleted too', orphan.length === 0);
} finally {
  await rollback(saved);
  console.log('\nDemo data restored to its state before the test.');
}

console.log(failures ? `\n${failures} check(s) failed.` : '\nAll checks passed.');
process.exit(failures ? 1 : 0);
