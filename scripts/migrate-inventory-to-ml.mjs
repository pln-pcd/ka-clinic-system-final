// scripts/migrate-inventory-to-ml.mjs
// Migrates Firestore inventory collection from mg to mL:
// 1. Sets realistic mlPerVial for all existing inventory items
// 2. Calculates stockMl pool (vials * mlPerVial)
// 3. Removes mgPerVial, doseOptionsMg, and stockMg fields

import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldValue } from 'firebase-admin/firestore';

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
if (!b64 && !process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set in .env');
  process.exit(1);
}

if (!getApps().length) {
  initializeApp(b64 ? { credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) } : { projectId: 'demo-ka-clinic' });
}

const db = getFirestore();

// Plausible typical vial sizes in mL
const MOCK_ML_PER_VIAL = [
  { match: /speeda/i, mlPerVial: 0.5 },
  { match: /rabipur/i, mlPerVial: 1.0 },
  { match: /verorab/i, mlPerVial: 0.5 },
  { match: /equirab|erig/i, mlPerVial: 5.0 },
  { match: /tetanus toxoid|\btt\b/i, mlPerVial: 0.5 },
  { match: /ats|anti-tetanus serum/i, mlPerVial: 1.0 },
  { match: /tig|tetanus immunoglobulin/i, mlPerVial: 1.0 },
  { match: /prevnar|pcv/i, mlPerVial: 0.5 },
  { match: /pneumovax|ppsv/i, mlPerVial: 0.5 },
  { match: /engerix|hepa/i, mlPerVial: 1.0 },
  { match: /fluquadri|flu/i, mlPerVial: 0.5 },
];

function getMlPerVialForName(name = '') {
  for (const entry of MOCK_ML_PER_VIAL) {
    if (entry.match.test(name)) return entry.mlPerVial;
  }
  return 1.0; // default plausible vial size
}

async function run() {
  console.log('Starting Inventory mL migration...');
  const snap = await db.collection('inventory').get();
  console.log(`Found ${snap.size} inventory items.`);

  const batch = db.batch();
  const summaryTable = [];

  for (const doc of snap.docs) {
    const data = doc.data();
    const name = data.name || '';
    const mlPerVial = getMlPerVialForName(name);
    const stockVials = parseInt(data.stock, 10) || 0;
    const stockMl = Math.round(stockVials * mlPerVial * 100) / 100;
    const minStockVials = parseInt(data.minStock, 10) || 10;
    const minStockMl = Math.round(minStockVials * mlPerVial * 100) / 100;

    let status = 'in-stock';
    if (stockMl <= 0) status = 'out-of-stock';
    else if (stockMl <= minStockMl) status = 'low-stock';

    summaryTable.push({
      id: doc.id,
      name,
      vials: stockVials,
      mlPerVial: `${mlPerVial} mL`,
      stockMl: `${stockMl} mL`,
      minStock: `${minStockVials} vials (${minStockMl} mL)`,
      status,
    });

    batch.update(doc.ref, {
      mlPerVial,
      stockMl,
      status,
      mgPerVial: FieldValue.delete(),
      doseOptionsMg: FieldValue.delete(),
      stockMg: FieldValue.delete(),
      updatedAt: Date.now(),
    });
  }

  await batch.commit();
  console.log('Migration committed successfully! Values set:');
  console.table(summaryTable);
}

run().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
