// Deletes every document written by scripts/seed-patients.js — that is,
// every doc in the seeded collections where isSeedData == true. Real patient
// records never carry that field, so they are untouched.
//
// Usage:
//   node --env-file=.env scripts/remove-seed-data.js --dry-run   # count only
//   node --env-file=.env scripts/remove-seed-data.js --yes       # delete
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID (see
// .env.example) — the same env vars scripts/create-manager.js uses.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const COLLECTIONS = ['vaccinations', 'authorizedPatients', 'incidents'];
const BATCH_LIMIT = 400; // Firestore hard cap is 500 writes per batch.
const PAGE_SIZE = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/remove-seed-data.js');
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  return {
    dryRun: args.includes('--dry-run'),
    confirmed: args.includes('--yes'),
  };
}

// Pages through `isSeedData == true` and deletes in batches. Re-queries from
// the start each round rather than paginating with a cursor, because the
// deletes shift the result set underneath a cursor.
async function purgeCollection(db, name, dryRun) {
  const col = db.collection(name);
  let total = 0;

  for (;;) {
    const snap = await col.where('isSeedData', '==', true).limit(PAGE_SIZE).get();
    if (snap.empty) break;

    if (dryRun) {
      // Nothing is deleted, so the same page would come back forever —
      // count this page and stop paging.
      total += snap.size;
      if (snap.size < PAGE_SIZE) break;
      console.log(`  ${name}: at least ${total} seeded doc(s) (dry run stops counting here)`);
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
    console.log(`  ${name}: deleted ${total}...`);
    if (snap.size < PAGE_SIZE) break;
  }

  return total;
}

async function main() {
  const { dryRun, confirmed } = parseArgs();

  if (!dryRun && !confirmed) {
    console.error('This permanently deletes every document where isSeedData == true in:');
    console.error(`  ${COLLECTIONS.join(', ')}`);
    console.error('');
    console.error('Preview the count first:');
    console.error('  node --env-file=.env scripts/remove-seed-data.js --dry-run');
    console.error('Then confirm the deletion:');
    console.error('  node --env-file=.env scripts/remove-seed-data.js --yes');
    process.exit(1);
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const db = getFirestore(app);

  console.log(dryRun ? 'Dry run — counting seeded docs (nothing deleted).\n' : 'Deleting seeded docs...\n');

  let grand = 0;
  for (const name of COLLECTIONS) {
    const n = await purgeCollection(db, name, dryRun);
    console.log(`${name}: ${n} seeded doc(s)${dryRun ? ' found' : ' deleted'}`);
    grand += n;
  }

  console.log(`\n${dryRun ? 'Would delete' : 'Deleted'} ${grand} doc(s) total.`);
  if (dryRun) console.log('Re-run with --yes to actually delete.');
  else console.log('Records without isSeedData were not touched.');
}

main().catch(err => {
  console.error('remove-seed-data failed:', err);
  process.exit(1);
});
