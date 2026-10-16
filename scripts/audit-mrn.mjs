// Read-only MRN ownership audit. Changes nothing.
//
//   node --env-file=.env scripts/audit-mrn.mjs [--json out.json]
//
// One MRN belongs to one patient for life. This lists every place the live
// data breaks that rule so staff can review it before anything is fixed:
//   1. an MRN whose vaccinations and authorizedPatients docs disagree on who
//      the patient is (email, uid or name),
//   2. an email or Firebase uid linked to more than one MRN,
//   3. a record with no matching mapping (vaccinations without
//      authorizedPatients, or the other way round), or a doc whose stored
//      `mrn`/`id` field differs from its document id,
//   4. MRNs at or above the counter (the next new patient would collide),
//      and MRNs missing from mrnRegistry (issued before the registry existed).
// Output names only MRNs, masked emails and counts — no clinical fields.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { writeFileSync } from 'node:fs';

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set (run with --env-file=.env).');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

const app = getApps()[0] || initializeApp({ credential: cert(loadServiceAccount()), projectId: process.env.FIREBASE_PROJECT_ID });
const db = getFirestore(app);

const mask = (email) => {
  const e = String(email || '').trim().toLowerCase();
  if (!e.includes('@')) return e ? '(invalid email)' : '';
  const [name, domain] = e.split('@');
  return `${name.slice(0, 2)}${'*'.repeat(Math.max(name.length - 2, 3))}@${domain}`;
};
const norm = (s) => String(s || '').trim().toLowerCase();
const normName = (s) => norm(s).replace(/[^a-z]/g, '');

const [vaxSnap, authSnap, counterSnap, registrySnap] = await Promise.all([
  db.collection('vaccinations').get(),
  db.collection('authorizedPatients').get(),
  db.collection('settings').doc('counters').get(),
  db.collection('mrnRegistry').get().catch(() => ({ docs: [] })),
]);

const vax = new Map(vaxSnap.docs.map(d => [d.id, d.data()]));
const authz = new Map(authSnap.docs.map(d => [d.id, d.data()]));
const registry = new Set(registrySnap.docs.map(d => d.id));
const counter = counterSnap.exists ? counterSnap.data() : null;

const findings = { sharedMrn: [], emailMultiMrn: [], uidMultiMrn: [], missingMapping: [], idMismatch: [], counter: [], notInRegistry: [] };

// 1. Same MRN, different person.
for (const [mrn, v] of vax) {
  const a = authz.get(mrn);
  if (!a) continue;
  const reasons = [];
  if (v.email && a.email && norm(v.email) !== norm(a.email)) reasons.push(`email differs (${mask(v.email)} vs ${mask(a.email)})`);
  const vUid = v.authUid || v.uid || null;
  if (vUid && a.uid && vUid !== a.uid) reasons.push('linked uid differs');
  if (v.name && a.name && normName(v.name) !== normName(a.name)) reasons.push('name differs');
  if (reasons.length) findings.sharedMrn.push({ mrn, reasons });
}

// 2. One email / uid → several MRNs (across both collections).
const byEmail = new Map(), byUid = new Map();
const add = (map, key, mrn) => { if (!key) return; if (!map.has(key)) map.set(key, new Set()); map.get(key).add(mrn); };
for (const [mrn, a] of authz) { add(byEmail, norm(a.email), mrn); add(byUid, a.uid, mrn); }
for (const [mrn, v] of vax) { add(byEmail, norm(v.email), mrn); add(byUid, v.authUid || v.uid, mrn); }
for (const [email, set] of byEmail) if (set.size > 1) findings.emailMultiMrn.push({ email: mask(email), mrns: [...set].sort() });
for (const [uid, set] of byUid) if (set.size > 1) findings.uidMultiMrn.push({ uid: `${uid.slice(0, 6)}…`, mrns: [...set].sort() });

// 3. Missing mapping / stored id mismatch.
for (const mrn of vax.keys()) if (!authz.has(mrn)) findings.missingMapping.push({ mrn, missing: 'authorizedPatients' });
for (const mrn of authz.keys()) if (!vax.has(mrn)) findings.missingMapping.push({ mrn, missing: 'vaccinations' });
for (const [mrn, v] of vax) {
  for (const f of ['id', 'mrn']) if (v[f] && v[f] !== mrn) findings.idMismatch.push({ mrn, collection: 'vaccinations', field: f, value: v[f] });
}
for (const [mrn, a] of authz) if (a.mrn && a.mrn !== mrn) findings.idMismatch.push({ mrn, collection: 'authorizedPatients', field: 'mrn', value: a.mrn });

// 4. Counter and registry.
const allMrns = new Set([...vax.keys(), ...authz.keys()]);
if (!counter) findings.counter.push({ issue: 'settings/counters is missing — the next MRN would be computed from loaded records only' });
else {
  for (const mrn of allMrns) {
    const m = mrn.match(/^(\d{4})-(\d+)$/);
    if (!m) { findings.counter.push({ mrn, issue: 'not in YYYY-NNN format' }); continue; }
    if (Number(m[1]) === counter.currentYear && Number(m[2]) > (counter.lastSequence || 0)) {
      findings.counter.push({ mrn, issue: `sequence above counter (${counter.currentYear}-${counter.lastSequence}); a new patient could be given this MRN` });
    }
  }
}
for (const mrn of allMrns) if (!registry.has(mrn)) findings.notInRegistry.push(mrn);

const summary = {
  checkedAt: new Date().toISOString(),
  vaccinations: vax.size,
  authorizedPatients: authz.size,
  counter: counter ? `${counter.currentYear}-${String(counter.lastSequence).padStart(3, '0')}` : null,
  registry: registry.size,
  counts: Object.fromEntries(Object.entries(findings).map(([k, v]) => [k, v.length])),
};

console.log(JSON.stringify(summary, null, 2));
for (const [k, list] of Object.entries(findings)) {
  if (!list.length || k === 'notInRegistry') continue;
  console.log(`\n${k}:`);
  list.forEach(x => console.log('  ', JSON.stringify(x)));
}
if (findings.notInRegistry.length) console.log(`\nnotInRegistry: ${findings.notInRegistry.length} MRN(s) issued before mrnRegistry existed (backfill with scripts/audit-mrn.mjs --backfill-registry after review).`);

const outIdx = process.argv.indexOf('--json');
if (outIdx > -1) writeFileSync(process.argv[outIdx + 1], JSON.stringify({ summary, findings }, null, 2));

// Opt-in, additive only: records every MRN already issued in mrnRegistry so
// the generator can never hand it out again. Never edits or deletes patients.
if (process.argv.includes('--backfill-registry')) {
  const missing = findings.notInRegistry;
  for (let i = 0; i < missing.length; i += 400) {
    const batch = db.batch();
    missing.slice(i, i + 400).forEach(mrn => batch.create(db.collection('mrnRegistry').doc(mrn), { mrn, issuedAt: Date.now(), source: 'backfill' }));
    await batch.commit();
  }
  console.log(`Backfilled ${missing.length} mrnRegistry entr${missing.length === 1 ? 'y' : 'ies'}.`);
}
