// Aligns existing incident records with mock patient data so they display
// on the Incident Map (Demo) under thesis study mode rules.
//
// Usage:
//   node --env-file=.env scripts/align-incidents-to-patients.mjs [--dry-run]
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const args = process.argv.slice(2);
const isDryRun = args.includes('--dry-run');

if (!getApps().length) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64 && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_BASE64 or FIRESTORE_EMULATOR_HOST');
    process.exit(1);
  }
  initializeApp(b64 ? { credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) } : { projectId: process.env.FIREBASE_PROJECT_ID || 'demo-ka-clinic' });
}

const db = getFirestore();

async function main() {
  const vaxSnap = await db.collection('vaccinations').get();
  const vaxMap = {};
  vaxSnap.docs.forEach(d => {
    vaxMap[d.id] = d.data();
  });

  const incSnap = await db.collection('incidents').get();
  console.log(`Found ${incSnap.size} incident document(s).`);

  // Sort chronologically by existing date/createdAt
  const docs = incSnap.docs.map(d => ({ ref: d.ref, id: d.id, data: d.data() }));
  docs.sort((a, b) => {
    const da = a.data.date || a.data.createdAt || '';
    const db = b.data.date || b.data.createdAt || '';
    return String(da).localeCompare(String(db));
  });

  const updates = [];
  let simCounter = 1;

  for (const item of docs) {
    const old = item.data;
    const mrn = item.id.replace(/^pin-/, '');
    const vax = vaxMap[mrn] || {};

    const month = (old.date || vax.date || new Date().toISOString()).slice(0, 7);
    const category = vax.cat === 'III' || old.category === 'Category III' ? 'Category III' : 'Category II';
    const type = old.type || (vax.animal ? `${vax.animal} ${vax.typeOfExposure || 'Bite'}` : 'Animal bite');
    // Keep existing mapHidden flag: 13 historical pins hidden, 19 recent pins active
    const isHidden = old.mapHidden === true;
    const isCompleted = vax.status === 'completed' || old.status === 'resolved' || isHidden;
    const lat = Number(old.lat ?? old.latitude ?? 13.3000);
    const lng = Number(old.lng ?? old.longitude ?? 123.4350);

    const cleanData = {
      isSimulated: true,
      simNo: simCounter++,
      type,
      category,
      month,
      lat: Number(lat.toFixed(6)),
      lng: Number(lng.toFixed(6)),
      source: 'simulation',
      status: isCompleted ? 'resolved' : 'active',
      createdAt: typeof old.createdAt === 'number' ? old.createdAt : Date.now(),
      isSeedData: true,
    };

    if (isHidden) {
      cleanData.mapHidden = true;
      cleanData.mapHiddenReason = 'patient-completed';
    }

    updates.push({ id: item.id, ref: item.ref, cleanData });
  }

  const activeCount = updates.filter(u => !u.cleanData.mapHidden).length;
  const hiddenCount = updates.filter(u => u.cleanData.mapHidden).length;

  console.log(`Prepared updates:`);
  console.log(`  Total: ${updates.length}`);
  console.log(`  Active (visible on map): ${activeCount}`);
  console.log(`  Hidden (completed patients): ${hiddenCount}`);

  if (isDryRun) {
    console.log('\nSample cleaned document (active):', updates.find(u => !u.cleanData.mapHidden));
    console.log('\nSample cleaned document (hidden):', updates.find(u => u.cleanData.mapHidden));
    console.log('\nDry run only. Re-run without --dry-run to commit changes.');
    return;
  }

  const batch = db.batch();
  for (const u of updates) {
    // Overwrite document with clean schema (removes address, barangay, etc.)
    batch.set(u.ref, u.cleanData);
  }
  await batch.commit();

  console.log(`\nSuccessfully updated all ${updates.length} incidents in Firestore.`);
  console.log(`The Incident Map should now display ${activeCount} active simulated incidents.`);
}

main().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
