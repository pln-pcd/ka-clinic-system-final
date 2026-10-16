// Sample-data reset for the live project: everything patient-side in the
// database is demo data, while admin/nurse accounts are real and are never
// touched.
//
//   node --env-file=.env scripts/sample-data-reset.mjs precheck
//       Counts every collection, lists what would be wiped and what is kept,
//       and writes a full JSON backup of the wipe set to backups/ (gitignored).
//       Read-only apart from the backup file.
//
// Never touched: admins (incl. their trustedDevices), invites, otps (admin
// sign-in codes), passwordResets, settings/config, settings/analytics, and
// every Firebase Auth user that has an admins/{uid} doc.
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

// --emulator: run against the local Firebase Emulator instead (used to
// check the screens against the same data set with a demo admin login).
const EMULATOR = process.argv.includes('--emulator');
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { db, auth } = await import('../api/_lib/firebaseAdmin.js');

// Collections whose documents are all sample data and are wiped on reset.
export const WIPE_COLLECTIONS = [
  'vaccinations', 'authorizedPatients',
  'appointments', 'appointmentSlots',
  'incidents',
  'chatThreads', 'chatMessages', 'patientChatState',
  'patientNotifications', 'patientAvatars',
  'stockMovements',
  'patientSessions', 'patientTrustedDevices', 'otpVerifications',
];
// Rewritten (not deleted) on reset: stock levels and the MRN counter.
export const REWRITE_DOCS = ['inventory/*', 'settings/counters'];
export const KEEP = ['admins', 'invites', 'otps', 'passwordResets', 'settings/config', 'settings/analytics'];

// Firestore values → plain JSON (Timestamps become { _ts: ISO }).
function plain(v) {
  if (v === null || v === undefined) return v ?? null;
  if (typeof v?.toDate === 'function') return { _ts: v.toDate().toISOString() };
  if (Array.isArray(v)) return v.map(plain);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, plain(x)]));
  return v;
}

async function precheck() {
  const adminUids = new Set((await db.collection('admins').get()).docs.map(d => d.id));

  console.log('Collection counts (live):');
  const counts = {};
  for (const c of await db.listCollections()) {
    counts[c.id] = (await c.count().get()).data().count;
  }
  const rows = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  for (const [id, n] of rows) {
    const tag = WIPE_COLLECTIONS.includes(id) ? 'WIPE' : id === 'inventory' ? 'REWRITE stock' : id === 'settings' ? 'KEEP (counters doc rewritten)' : 'KEEP';
    console.log(`  ${id.padEnd(24)} ${String(n).padStart(4)}  ${tag}`);
  }

  // Auth users
  const users = [];
  let token;
  do {
    const page = await auth.listUsers(1000, token);
    users.push(...page.users);
    token = page.pageToken;
  } while (token);
  const adminUsers = users.filter(u => adminUids.has(u.uid));
  const patientUsers = users.filter(u => !adminUids.has(u.uid));
  console.log(`\nFirebase Auth: ${users.length} users — ${adminUsers.length} admin (KEEP), ${patientUsers.length} non-admin`);

  // Backup
  const backup = { project: process.env.FIREBASE_PROJECT_ID, takenAt: new Date().toISOString(), collections: {}, docs: {}, authUsers: [] };
  for (const c of WIPE_COLLECTIONS.concat(['inventory'])) {
    const snap = await db.collection(c).get();
    backup.collections[c] = snap.docs.map(d => ({ id: d.id, data: plain(d.data()) }));
  }
  const counters = await db.collection('settings').doc('counters').get();
  backup.docs['settings/counters'] = counters.exists ? plain(counters.data()) : null;
  backup.authUsers = patientUsers.map(u => ({
    uid: u.uid, email: u.email || null, providers: u.providerData.map(p => p.providerId),
    created: u.metadata.creationTime, lastSignIn: u.metadata.lastSignInTime,
  }));

  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  mkdirSync(root, { recursive: true });
  const file = join(root, `sample-data-backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`);
  writeFileSync(file, JSON.stringify(backup, null, 1));
  const total = Object.values(backup.collections).reduce((n, docs) => n + docs.length, 0);
  console.log(`\nBackup: ${file}`);
  console.log(`  ${total} documents from ${Object.keys(backup.collections).length} collections, settings/counters, ${backup.authUsers.length} non-admin auth user records`);
}

// Deletes every document in WIPE_COLLECTIONS plus the "bcc" test inventory
// item. Auth users, admins, invites, otps and settings are not touched.
// Refuses to run without a backup in backups/ and without --yes.
async function wipe() {
  const { readdirSync } = await import('node:fs');
  const root = join(dirname(fileURLToPath(import.meta.url)), '..', 'backups');
  const backups = (() => { try { return readdirSync(root).filter(f => f.startsWith('sample-data-backup-')); } catch { return []; } })();
  if (!backups.length && !EMULATOR) throw new Error('No backup in backups/. Run precheck first.');
  if (!process.argv.includes('--yes')) throw new Error('This deletes sample data. Re-run with --yes.');
  const before = {};
  for (const c of WIPE_COLLECTIONS) {
    const refs = (await db.collection(c).listDocuments());
    before[c] = refs.length;
    for (let i = 0; i < refs.length; i += 400) {
      const batch = db.batch();
      refs.slice(i, i + 400).forEach(r => batch.delete(r));
      await batch.commit();
    }
  }
  await db.collection('inventory').doc('8U7OSRc65vOYJPvbV5Td').delete();
  if (EMULATOR) {
    // The emulator's demo inventory uses other ids; start it from the same items as live.
    const inv = await db.collection('inventory').listDocuments();
    await Promise.all(inv.map(r => r.delete()));
  }
  console.log('Deleted:', JSON.stringify(before));
  console.log('Deleted inventory item "bcc" (8U7OSRc65vOYJPvbV5Td). Auth users untouched.');
}

async function seed() {
  if (!process.argv.includes('--yes')) throw new Error('This writes sample data. Re-run with --yes.');
  const { buildSampleData } = await import('./sample-data-build.mjs');
  const d = buildSampleData();
  for (const c of WIPE_COLLECTIONS) {
    const n = (await db.collection(c).count().get()).data().count;
    if (n) throw new Error(`${c} still has ${n} documents. Run wipe first.`);
  }
  const ops = [];
  const put = (col, id, data) => ops.push(b => b.set(db.collection(col).doc(id), data));
  d.records.forEach(r => put('vaccinations', r.mrn, r.vax));
  d.authorizedPatients.forEach(x => put('authorizedPatients', x.id, x.data));
  d.incidents.forEach(x => put('incidents', x.id, x.data));
  d.inventoryDocs.forEach(x => put('inventory', x.id, x.data));
  d.stockMovements.forEach(x => put('stockMovements', x.id, x.data));
  d.appointments.forEach(x => put('appointments', x.id, x.data));
  d.appointmentSlots.forEach(x => put('appointmentSlots', x.id, x.data));
  d.chatThreads.forEach(x => put('chatThreads', x.id, x.data));
  d.chatMessages.forEach(x => put('chatMessages', x.id, x.data));
  d.patientNotifications.forEach(x => put('patientNotifications', x.id, x.data));
  // The MRN counter only moves forward: a live counter already past the
  // sample's last MRN is kept, so no issued MRN can be handed out again.
  const liveCounter = (await db.collection('settings').doc('counters').get()).data();
  const counters = liveCounter && liveCounter.currentYear === d.counters.currentYear && (liveCounter.lastSequence || 0) > d.counters.lastSequence
    ? { ...d.counters, lastSequence: liveCounter.lastSequence } : d.counters;
  ops.push(b => b.set(db.collection('settings').doc('counters'), counters));
  for (let i = 0; i < ops.length; i += 400) {
    const batch = db.batch();
    ops.slice(i, i + 400).forEach(op => op(batch));
    await batch.commit();
  }
  console.log(`Seeded (today ${d.today}): ${d.records.length} records, ${d.incidents.length} pins (${d.incidents.filter(i => !i.data.mapHidden).length} visible), ${d.inventoryDocs.length} inventory items, ${d.stockMovements.length} stock movements, ${d.appointments.length} appointments, ${d.chatThreads.length} threads / ${d.chatMessages.length} messages, ${d.patientNotifications.length} notifications. MRN counter: ${d.counters.currentYear}-${d.counters.lastSequence}.`);
}

const cmd = process.argv[2];
if (cmd === 'precheck') await precheck();
else if (cmd === 'wipe') await wipe();
else if (cmd === 'seed') await seed();
else { console.error('Usage: node --env-file=.env scripts/sample-data-reset.mjs <precheck|wipe --yes|seed --yes>'); process.exit(1); }
process.exit(0);
