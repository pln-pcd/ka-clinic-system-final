// One-time, IRREVERSIBLE purge of data left behind by the removed patient-facing
// wound-photo / symptom-monitoring feature. Two targets only:
//
//   1. `vaccinations/{mrn}.woundLog` — the array of patient-submitted wound
//      photos, recovery notes and symptom tags. The field is DELETED from each
//      document (FieldValue.delete(), not set to []) so no residue remains.
//      The vaccination record itself is never deleted — every other field
//      (doses, category, MRN, email, clinical notes) is left exactly as-is.
//   2. `symptomReports/*` — the legacy per-document symptom-check collection.
//      Never wired to any UI, but purged here if any documents exist.
//
// DELIBERATELY OUT OF SCOPE — the `incidents` collection.
// The admin dashboard's Incident Map (ka-clinic-admin/src/pages/incidents.jsx)
// is an active clinic tool, NOT leftovers from the removed patient feature.
// This script never reads, writes, or deletes anything in `incidents`.
//
// Usage:
//   node --env-file=.env scripts/purge-removed-feature-data.js         # dry run (default)
//   node --env-file=.env scripts/purge-removed-feature-data.js --yes   # actually delete
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID (see
// .env.example) — the same env vars scripts/remove-seed-data.js uses.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';

// Every collection this script is allowed to touch. `incidents` is absent by
// design; see the header note.
const VACCINATIONS = 'vaccinations';
const SYMPTOM_REPORTS = 'symptomReports';

const BATCH_LIMIT = 400; // Firestore hard cap is 500 writes per batch.
const PAGE_SIZE = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/purge-removed-feature-data.js'
    );
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Scans every vaccinations doc and strips `woundLog` from the ones that carry
// it. Reads the whole collection rather than querying, because Firestore has no
// "field exists" filter — and the collection is one doc per patient, so it is
// small enough to walk.
async function purgeWoundLogs(db, dryRun) {
  const snap = await db.collection(VACCINATIONS).get();

  const affected = snap.docs.filter(d => d.get('woundLog') !== undefined);
  const entryCount = affected.reduce((sum, d) => {
    const log = d.get('woundLog');
    return sum + (Array.isArray(log) ? log.length : 0);
  }, 0);
  const photoCount = affected.reduce((sum, d) => {
    const log = d.get('woundLog');
    return sum + (Array.isArray(log) ? log.filter(e => e && e.photoUrl).length : 0);
  }, 0);

  console.log(`  ${VACCINATIONS}: ${snap.size} record(s) scanned`);
  console.log(`  ${VACCINATIONS}: ${affected.length} record(s) carry a woundLog field`);
  console.log(`  ${VACCINATIONS}: ${entryCount} log entr(ies), ${photoCount} of them with a photo URL`);

  if (affected.length > 0) {
    console.log('  affected record ids:');
    for (const d of affected) {
      const log = d.get('woundLog');
      const n = Array.isArray(log) ? log.length : 0;
      console.log(`    - ${d.id} (${n} entr${n === 1 ? 'y' : 'ies'})`);
    }
  }

  if (dryRun || affected.length === 0) return { docs: affected.length, entries: entryCount };

  let batch = db.batch();
  let ops = 0;
  let done = 0;
  for (const d of affected) {
    batch.update(d.ref, { woundLog: FieldValue.delete() });
    ops++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      done += ops;
      console.log(`  ${VACCINATIONS}: cleared ${done}...`);
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
    done += ops;
  }
  console.log(`  ${VACCINATIONS}: cleared woundLog from ${done} record(s)`);

  return { docs: affected.length, entries: entryCount };
}

// Deletes every symptomReports doc. Re-queries from the start each round rather
// than paginating with a cursor, because the deletes shift the result set
// underneath a cursor.
async function purgeSymptomReports(db, dryRun) {
  const col = db.collection(SYMPTOM_REPORTS);
  let total = 0;

  for (;;) {
    const snap = await col.limit(PAGE_SIZE).get();
    if (snap.empty) break;

    if (dryRun) {
      // Nothing is deleted, so the same page would come back forever — count
      // this page and stop paging.
      total += snap.size;
      if (snap.size >= PAGE_SIZE) {
        console.log(`  ${SYMPTOM_REPORTS}: at least ${total} doc(s) (dry run stops counting here)`);
      }
      break;
    }

    let batch = db.batch();
    let ops = 0;
    for (const doc of snap.docs) {
      batch.delete(doc.ref);
      ops++;
      if (ops >= BATCH_LIMIT) {
        await batch.commit();
        batch = db.batch();
        ops = 0;
      }
    }
    if (ops > 0) await batch.commit();

    total += snap.size;
    console.log(`  ${SYMPTOM_REPORTS}: deleted ${total}...`);
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`  ${SYMPTOM_REPORTS}: ${total} doc(s)${dryRun ? ' found' : ' deleted'}`);
  return total;
}

async function main() {
  const dryRun = !process.argv.slice(2).includes('--yes');

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(loadServiceAccount()),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
  const db = getFirestore(app);

  if (dryRun) {
    console.log('DRY RUN — nothing will be deleted.\n');
  } else {
    console.log('LIVE RUN — this permanently deletes data.\n');
  }
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID || '(from service account)'}`);
  console.log(`In scope: ${VACCINATIONS}.woundLog, ${SYMPTOM_REPORTS}`);
  console.log('Out of scope: incidents (admin Incident Map — never touched by this script)\n');

  const wound = await purgeWoundLogs(db, dryRun);
  console.log('');
  const symptoms = await purgeSymptomReports(db, dryRun);

  console.log('\n── Summary ─────────────────────────────');
  if (dryRun) {
    console.log(`Would clear woundLog from ${wound.docs} vaccination record(s) (${wound.entries} log entries).`);
    console.log(`Would delete ${symptoms} symptomReports document(s).`);
    console.log('No vaccination record is deleted — only the woundLog field is removed.');
    console.log('\nRe-run with --yes to permanently apply this.');
  } else {
    console.log(`Cleared woundLog from ${wound.docs} vaccination record(s) (${wound.entries} log entries removed).`);
    console.log(`Deleted ${symptoms} symptomReports document(s).`);
  }
  console.log('The incidents collection was not read, written, or deleted.');
}

main().catch(err => {
  console.error('purge-removed-feature-data failed:', err);
  process.exit(1);
});
