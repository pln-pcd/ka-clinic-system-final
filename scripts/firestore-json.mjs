// Firestore <-> JSON, with types kept (Timestamp, GeoPoint, references,
// bytes), plus a Firebase Auth user export. Used for the production backup
// and for copying the emulator's sample data into production.
//
//   node --env-file=.env scripts/firestore-json.mjs export <dir>              live: every collection (and subcollection) + Auth users
//   node scripts/firestore-json.mjs export <dir> --emulator                   same, from the local emulator
//   node --env-file=.env scripts/firestore-json.mjs replace <file> --collections a,b,c --yes
//       live: deletes every document in the listed collections, then writes
//       the listed collections from <file> (an export's firestore.json).
//       Collections not listed are never read or written. Auth is never touched.
//       --docs settings/counters,…  also overwrite just these documents.
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const [cmd, target] = process.argv.slice(2);
const EMULATOR = process.argv.includes('--emulator');
if (EMULATOR) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
} else {
  delete process.env.FIRESTORE_EMULATOR_HOST;
  delete process.env.FIREBASE_AUTH_EMULATOR_HOST;
}
const { db, auth } = await import('../api/_lib/firebaseAdmin.js');
const { Timestamp, GeoPoint, DocumentReference } = await import('firebase-admin/firestore');
const where = EMULATOR ? 'emulator' : `live project ${process.env.FIREBASE_PROJECT_ID}`;

function encode(v) {
  if (v === null || v === undefined) return v ?? null;
  if (v instanceof Timestamp) return { __t: 'ts', s: v.seconds, n: v.nanoseconds };
  if (v instanceof GeoPoint) return { __t: 'geo', lat: v.latitude, lng: v.longitude };
  if (v instanceof DocumentReference) return { __t: 'ref', path: v.path };
  if (Buffer.isBuffer(v) || v instanceof Uint8Array) return { __t: 'bytes', b64: Buffer.from(v).toString('base64') };
  if (Array.isArray(v)) return v.map(encode);
  if (typeof v === 'object') return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encode(x)]));
  return v;
}
function decode(v) {
  if (v === null || v === undefined) return v ?? null;
  if (Array.isArray(v)) return v.map(decode);
  if (typeof v === 'object') {
    if (v.__t === 'ts') return new Timestamp(v.s, v.n);
    if (v.__t === 'geo') return new GeoPoint(v.lat, v.lng);
    if (v.__t === 'ref') return db.doc(v.path);
    if (v.__t === 'bytes') return Buffer.from(v.b64, 'base64');
    return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, decode(x)]));
  }
  return v;
}

async function exportAll(dir) {
  mkdirSync(dir, { recursive: true });
  const docs = {};
  const counts = {};
  async function walk(colRef) {
    const snap = await colRef.get();
    for (const d of snap.docs) {
      docs[d.ref.path] = encode(d.data());
      const top = d.ref.path.split('/')[0];
      counts[top] = (counts[top] || 0) + 1;
      for (const sub of await d.ref.listCollections()) await walk(sub);
    }
    // Subcollections under documents that exist only as parents.
    for (const ref of await colRef.listDocuments()) {
      if (docs[ref.path] === undefined) for (const sub of await ref.listCollections()) await walk(sub);
    }
  }
  for (const c of await db.listCollections()) await walk(c);
  writeFileSync(join(dir, 'firestore.json'), JSON.stringify({ source: where, takenAt: new Date().toISOString(), docs }));

  const users = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    users.push(...page.users.map(u => u.toJSON()));
    pageToken = page.pageToken;
  } while (pageToken);
  writeFileSync(join(dir, 'auth-users.json'), JSON.stringify({ source: where, takenAt: new Date().toISOString(), users }, null, 1));

  console.log(`Exported from ${where} to ${dir}`);
  console.log(`  ${Object.keys(docs).length} documents (incl. subcollections):`, JSON.stringify(counts));
  console.log(`  ${users.length} Auth users (${users.filter(u => u.passwordHash).length} with password hashes)`);
}

async function deleteAll(colRef) {
  let n = 0;
  for (;;) {
    const snap = await colRef.limit(400).get();
    if (snap.empty) return n;
    const batch = db.batch();
    for (const d of snap.docs) {
      for (const sub of await d.ref.listCollections()) n += await deleteAll(sub);
      batch.delete(d.ref);
    }
    await batch.commit();
    n += snap.size;
  }
}

async function replace(file) {
  const list = (process.argv[process.argv.indexOf('--collections') + 1] || '').split(',').map(s => s.trim()).filter(Boolean);
  if (!process.argv.includes('--collections') || !list.length) throw new Error('Pass --collections a,b,c');
  const KEEP = ['admins', 'invites', 'otps', 'passwordResets'];
  const bad = list.filter(c => KEEP.includes(c));
  if (bad.length) throw new Error(`Refusing to replace account collections: ${bad.join(', ')}`);
  if (!process.argv.includes('--yes')) throw new Error('This deletes and rewrites data. Re-run with --yes.');
  const { docs } = JSON.parse(readFileSync(file, 'utf8'));
  const report = {};
  for (const c of list) {
    const deleted = await deleteAll(db.collection(c));
    const entries = Object.entries(docs).filter(([p]) => p.split('/')[0] === c);
    for (let i = 0; i < entries.length; i += 400) {
      const batch = db.batch();
      entries.slice(i, i + 400).forEach(([p, data]) => batch.set(db.doc(p), decode(data)));
      await batch.commit();
    }
    report[c] = { deleted, written: entries.length };
  }
  const single = process.argv.includes('--docs') ? process.argv[process.argv.indexOf('--docs') + 1].split(',').filter(Boolean) : [];
  for (const p of single) {
    if (KEEP.includes(p.split('/')[0]) || p === 'settings/config') throw new Error(`Refusing to overwrite ${p}`);
    if (!docs[p]) throw new Error(`${p} is not in the file`);
    await db.doc(p).set(decode(docs[p]));
    report[p] = { deleted: 0, written: 1 };
  }
  console.log(`Replaced on ${where}:`);
  console.table(report);
}

if (cmd === 'export' && target) await exportAll(target);
else if (cmd === 'replace' && target) await replace(target);
else { console.error('Usage: firestore-json.mjs export <dir> [--emulator] | replace <file> --collections a,b --yes'); process.exit(1); }
process.exit(0);
