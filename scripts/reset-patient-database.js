// Reset all patient records (seeded and manual), related patient collections,
// and reset settings/counters so MRN starts fresh from 2026-001.
//
// Usage:
//   node --env-file=.env scripts/reset-patient-database.js --dry-run
//   node --env-file=.env scripts/reset-patient-database.js --yes
//
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const PATIENT_COLLECTIONS = [
  'vaccinations',
  'authorizedPatients',
  'incidents',
  'patientNotifications',
  'otpVerifications',
  'appointments'
];

const BATCH_LIMIT = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/reset-patient-database.js');
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

async function wipeCollection(db, name, dryRun) {
  const col = db.collection(name);
  const snap = await col.get();
  const count = snap.size;

  if (count === 0) {
    console.log(`  ${name}: 0 docs (already empty)`);
    return 0;
  }

  if (dryRun) {
    console.log(`  ${name}: ${count} docs would be deleted`);
    return count;
  }

  let batch = db.batch();
  let ops = 0;
  let deleted = 0;

  for (const doc of snap.docs) {
    batch.delete(doc.ref);
    ops++;
    deleted++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
  }

  console.log(`  ${name}: ${deleted} docs deleted`);
  return deleted;
}

async function purgeNonAdminAuthUsers(auth, db, dryRun) {
  const adminSnap = await db.collection('admins').get();
  const adminUids = new Set(adminSnap.docs.map(d => d.id));

  const list = await auth.listUsers(500);
  const nonAdminUsers = list.users.filter(u => !adminUids.has(u.uid));

  if (nonAdminUsers.length === 0) {
    console.log('  Firebase Auth: 0 non-admin patient accounts to clean');
    return 0;
  }

  if (dryRun) {
    console.log(`  Firebase Auth: ${nonAdminUsers.length} non-admin user/guest account(s) would be deleted (Admins preserved: ${adminUids.size})`);
    for (const u of nonAdminUsers) {
      console.log(`    - ${u.email || '(anonymous guest)'} [${u.uid}]`);
    }
    return nonAdminUsers.length;
  }

  let deleted = 0;
  for (const u of nonAdminUsers) {
    await auth.deleteUser(u.uid);
    deleted++;
  }
  console.log(`  Firebase Auth: ${deleted} non-admin patient/guest account(s) deleted (All ${adminUids.size} admin accounts preserved)`);
  return deleted;
}

async function main() {
  const { dryRun, confirmed } = parseArgs();

  if (!dryRun && !confirmed) {
    console.log('Use --dry-run to preview or --yes to execute:');
    console.log('  node --env-file=.env scripts/reset-patient-database.js --dry-run');
    console.log('  node --env-file=.env scripts/reset-patient-database.js --yes');
    process.exit(1);
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const db = getFirestore(app);
  const { getAuth } = await import('firebase-admin/auth');
  const auth = getAuth(app);

  console.log(dryRun ? '=== DRY RUN: INSPECTING COLLECTIONS ===' : '=== WIPING PATIENT COLLECTIONS & RESETTING COUNTER ===');

  let grandTotal = 0;
  for (const colName of PATIENT_COLLECTIONS) {
    const deleted = await wipeCollection(db, colName, dryRun);
    grandTotal += deleted;
  }

  console.log('\n--- Firebase Authentication (Patients & Guests) ---');
  await purgeNonAdminAuthUsers(auth, db, dryRun);

  // Counter check & reset
  const counterRef = db.collection('settings').doc('counters');
  const counterSnap = await counterRef.get();
  const currentCounter = counterSnap.exists ? counterSnap.data() : null;

  console.log('\n--- Settings / Counters Status ---');
  console.log('Current counter data:', currentCounter || '(none)');

  const currentYear = new Date().getFullYear();
  if (dryRun) {
    console.log(`Would reset settings/counters to: { currentYear: ${currentYear}, lastSequence: 0 }`);
    console.log(`Next patient added will start with MRN: ${currentYear}-001`);
  } else {
    await counterRef.set({
      currentYear,
      lastSequence: 0,
      updatedAt: new Date().toISOString(),
    });
    console.log(`Successfully reset settings/counters to: { currentYear: ${currentYear}, lastSequence: 0 }`);
    console.log(`Next patient added will start with MRN: ${currentYear}-001`);
  }

  console.log(`\nDone! Total Firestore records ${dryRun ? 'inspected' : 'removed'}: ${grandTotal}`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
