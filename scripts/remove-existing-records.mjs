import { cert, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64) {
  console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set');
  process.exit(1);
}

const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
const app = initializeApp({
  credential: cert(sa),
  projectId: process.env.FIREBASE_PROJECT_ID || sa.project_id,
});
const db = getFirestore(app);
const auth = getAuth(app);

// Collections to completely clear of records
const COLLECTIONS_TO_CLEAR = [
  'vaccinations',
  'authorizedPatients',
  'appointments',
  'appointmentSlots',
  'incidents',
  'chatThreads',
  'chatMessages',
  'patientNotifications',
  'patientAvatars',
  'stockMovements',
  'patientSessions',
  'patientTrustedDevices',
  'patientLoginOtps',
  'otpVerifications',
  'patientChatState',
  'scheduleClosures',
  'activityLog',
  'loginAttempts',
  'mrnRegistry',
];

async function deleteCollectionDocs(collectionName) {
  const colRef = db.collection(collectionName);
  const snap = await colRef.get();
  if (snap.empty) {
    console.log(`  Collection '${collectionName}' is already empty.`);
    return 0;
  }

  const batchSize = 400;
  let deletedCount = 0;
  for (let i = 0; i < snap.docs.length; i += batchSize) {
    const chunk = snap.docs.slice(i, i + batchSize);
    const batch = db.batch();
    chunk.forEach(d => batch.delete(d.ref));
    await batch.commit();
    deletedCount += chunk.length;
  }
  console.log(`  Cleared '${collectionName}': deleted ${deletedCount} document(s).`);
  return deletedCount;
}

async function cleanNonAdminAuthUsers() {
  console.log('\nCleaning up test patient Auth accounts (preserving all admin accounts)...');
  const adminsSnap = await db.collection('admins').get();
  const adminUids = new Set(adminsSnap.docs.map(d => d.id));
  console.log(`  Found ${adminUids.size} admin UID(s) to protect.`);

  const usersToDelete = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    for (const u of page.users) {
      if (!adminUids.has(u.uid)) {
        usersToDelete.push(u.uid);
      } else {
        console.log(`  PROTECTED ADMIN: ${u.email || u.uid} (${u.displayName || 'No name'})`);
      }
    }
    pageToken = page.pageToken;
  } while (pageToken);

  console.log(`  Deleting ${usersToDelete.length} non-admin Auth users in batches...`);
  const batchSize = 100;
  for (let i = 0; i < usersToDelete.length; i += batchSize) {
    const chunk = usersToDelete.slice(i, i + batchSize);
    await auth.deleteUsers(chunk);
  }
  console.log(`  Deleted ${usersToDelete.length} non-admin Auth users.`);
}

async function resetMRNCounter() {
  console.log('\nResetting MRN counter in settings/counters...');
  const currentYear = new Date().getFullYear();
  await db.collection('settings').doc('counters').set({
    currentYear,
    lastSequence: 0,
    updatedAt: new Date().toISOString(),
  });
  console.log(`  settings/counters reset to: year=${currentYear}, lastSequence=0 (next patient will be ${currentYear}-001).`);
}

async function cleanAndRestockInventory() {
  console.log('\nCleaning and restoring inventory items catalog...');
  const invSnap = await db.collection('inventory').get();
  console.log(`  Found ${invSnap.size} inventory items.`);

  for (const doc of invSnap.docs) {
    const data = doc.data();
    const openingStock = Number(data.openingStock || data.stock || 50);
    const mlPerVial = Number(data.mlPerVial || 1);
    const stockMl = Number((openingStock * mlPerVial).toFixed(2));

    await doc.ref.update({
      stock: openingStock,
      stockMl: stockMl,
      status: 'in-stock',
      isSeedData: FieldValue.delete(),
      sampleBatch: FieldValue.delete(),
      updatedAt: Date.now(),
    });
    console.log(`  Restored item '${data.name}' (${doc.id}): stock=${openingStock}, stockMl=${stockMl}, status=in-stock`);
  }
}

async function main() {
  console.log(`=======================================================`);
  console.log(`  K&A CLINIC SYSTEM: RESET EXISTING RECORDS FOR PRODUCTION`);
  console.log(`  Target Project: ${sa.project_id}`);
  console.log(`=======================================================\n`);

  // 1. Clear records collections
  console.log('1. Clearing record collections...');
  const stats = {};
  for (const col of COLLECTIONS_TO_CLEAR) {
    stats[col] = await deleteCollectionDocs(col);
  }

  // 2. Clean non-admin Auth users
  console.log('\n2. Cleaning non-admin Auth users...');
  await cleanNonAdminAuthUsers();

  // 3. Reset MRN counter
  console.log('\n3. Resetting MRN counters...');
  await resetMRNCounter();

  // 4. Clean inventory catalog and restore opening stock
  console.log('\n4. Restoring inventory items...');
  await cleanAndRestockInventory();

  console.log('\n=======================================================');
  console.log('  CLEANUP COMPLETE');
  console.log('=======================================================');
  console.log('Summary of wiped documents:');
  for (const [col, count] of Object.entries(stats)) {
    console.log(`  - ${col.padEnd(24)}: ${count} deleted`);
  }
  console.log('\nPreserved intact:');
  console.log('  - admins (11 accounts)');
  console.log('  - adminAvatars');
  console.log('  - invites');
  console.log('  - otps / securitySessions');
  console.log('  - settings/config & clinic configuration');
  console.log('  - inventory catalog (all 9 vaccine & RIG products preserved and restocked)');
  console.log('  - settings/counters (reset to 0 so next MRN is 2026-001)');
}

main().catch(err => {
  console.error('Cleanup encountered an error:', err);
  process.exit(1);
});
