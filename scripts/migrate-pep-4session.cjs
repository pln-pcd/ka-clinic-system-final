// Migrates every PEP record from the 5-dose intramuscular Essen series
// (Day 0/3/7/14/28) to the 4-session intradermal Thai Red Cross regimen
// (Day 0/3/7/28).
//
// Hard reset, as specified: each record is rebuilt as exactly four sessions
// anchored to its own Day 0, carrying administered status across by position.
// The Day 14 dose has no equivalent in the ID regimen — if it was already
// marked given, that status carries into Session 4 (the record's last dose)
// so a dose that was actually administered is never silently downgraded to
// pending. Any surplus fifth entry is dropped.
//
// Usage:
//   node scripts/migrate-pep-4session.cjs            # dry run, writes nothing
//   node scripts/migrate-pep-4session.cjs --apply    # performs the migration
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 in the environment (see .env).

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

const SESSIONS = [
  { key: 'd1', label: 'Session 1 (Day 0)', day: 0 },
  { key: 'd2', label: 'Session 2 (Day 3)', day: 3 },
  { key: 'd3', label: 'Session 3 (Day 7)', day: 7 },
  { key: 'd4', label: 'Session 4 (Day 28)', day: 28 },
];

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const isDone = (dose) => {
  const st = String(dose?.status || dose?.s || '').toLowerCase();
  return st === 'done' || st === 'completed' || dose?.done === true;
};

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Load .env first.');
    process.exit(1);
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

(async () => {
  const app = initializeApp({ credential: cert(loadServiceAccount()) });
  const db = getFirestore(app);

  const snap = await db.collection('vaccinations').get();
  const pep = snap.docs.filter(d => String(d.data().service || '').trim().toUpperCase() === 'PEP');

  console.log(`${snap.size} patient records, ${pep.length} on PEP.`);
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — nothing will be written.\n');

  let migrated = 0;
  let alreadyOk = 0;
  let carriedFromDay14 = 0;
  const writes = [];

  for (const docSnap of pep) {
    const p = docSnap.data();
    const existing = Array.isArray(p.doses) ? p.doses : [];
    const day0 = String(p.date || '').slice(0, 10) || String(existing[0]?.date || '').slice(0, 10);

    if (!day0) {
      console.log(`  SKIP ${docSnap.id} (${p.name || 'unnamed'}) — no Day 0 date on the record.`);
      continue;
    }

    if (existing.length === SESSIONS.length && existing.every((d, i) => d.key === SESSIONS[i].key && d.n === SESSIONS[i].label)) {
      alreadyOk++;
      continue;
    }

    // Position 3 is the old Day 14 dose, which the ID regimen has no slot for.
    const oldDay14Done = existing.length >= 5 && isDone(existing[3]);
    const oldDay28Done = existing.length >= 5 && isDone(existing[4]);

    const rebuilt = SESSIONS.map((s, i) => {
      // Sessions 1-3 map straight across; session 4 is "the final dose", so it
      // counts as given if either of the old trailing doses was given.
      const done = i < 3 ? isDone(existing[i]) : (oldDay28Done || oldDay14Done);
      return {
        key: s.key,
        n: s.label,
        date: addDays(day0, s.day),
        status: done ? 'done' : 'pending',
        s: done ? 'done' : 'pending',
        note: existing[i]?.note || '',
      };
    });

    if (oldDay14Done && !oldDay28Done) carriedFromDay14++;

    const doneCount = rebuilt.filter(d => d.status === 'done').length;
    const status = doneCount === rebuilt.length ? 'completed' : 'ongoing';

    console.log(
      `  ${docSnap.id} ${(p.name || '').padEnd(26)} ${existing.length}→4 doses, ` +
      `${doneCount}/4 administered, Day 0 ${day0}`,
    );

    writes.push({ ref: docSnap.ref, data: { doses: rebuilt, dose: `${doneCount}/${rebuilt.length}`, status } });
    migrated++;
  }

  if (APPLY && writes.length) {
    // Firestore caps a batch at 500 operations.
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(w => batch.update(w.ref, w.data));
      await batch.commit();
    }
  }

  console.log(`\n${migrated} record(s) ${APPLY ? 'migrated' : 'would be migrated'}.`);
  console.log(`${alreadyOk} already on the 4-session schedule.`);
  if (carriedFromDay14) {
    console.log(`${carriedFromDay14} record(s) had an administered Day 14 dose carried into Session 4.`);
  }
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
