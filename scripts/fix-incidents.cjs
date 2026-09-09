const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const cred = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
initializeApp({ credential: cert(cred) });
const db = getFirestore();

function addDays(isoStr, days) {
  const d = new Date(isoStr + 'T08:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fixIncidents() {
  console.log('Fetching all incidents...');
  const snap = await db.collection('incidents').get();
  console.log(`Found ${snap.size} incidents to update.`);

  const todayIso = '2026-09-05';
  const docs = snap.docs;

  // Let's sort docs so completed/older ones get earlier dates, and recent ones get recent distinct dates
  // We can group by mrn or current date
  // To ensure every incident has a distinct or at most 1-2 per day date over the past 180 days:
  // 229 incidents over 180 days = ~1.2 incidents per day!
  // Let's distribute them from day -1 (yesterday 2026-09-04) back to day -175.
  
  // Create an array of 229 dates spread across 180 days
  const datePool = [];
  for (let d = 1; d <= 175; d++) {
    datePool.push(addDays(todayIso, -d));
    // on some days (every 3rd day), add a second incident
    if (d % 3 === 0 && datePool.length < docs.length) {
      datePool.push(addDays(todayIso, -d));
    }
  }
  // Fill any remainder
  while (datePool.length < docs.length) {
    const randomDay = Math.floor(Math.random() * 150) + 1;
    datePool.push(addDays(todayIso, -randomDay));
  }
  // Sort datePool descending (newest first)
  datePool.sort((a, b) => b.localeCompare(a));

  // Sort docs: docs with current date near today stay near the top, docs from months ago stay in the past
  docs.sort((a, b) => {
    const dateA = a.data().date || a.data().exposureDate || '';
    const dateB = b.data().date || b.data().exposureDate || '';
    return dateB.localeCompare(dateA);
  });

  let batch = db.batch();
  let count = 0;
  let batches = 0;

  for (let i = 0; i < docs.length; i++) {
    const docRef = docs[i].ref;
    const data = docs[i].data();
    
    const assignedDate = datePool[i];
    const exactAddress = data.address || `${data.zone ? data.zone + ', ' : ''}Brgy. ${data.barangay || 'San Juan'}, Libon, Albay`;
    
    batch.update(docRef, {
      location: exactAddress,
      address: exactAddress,
      date: assignedDate,
      exposureDate: assignedDate,
      createdAt: Timestamp.fromDate(new Date(`${assignedDate}T08:00:00`)),
    });
    count++;

    // If there's an associated vaccination record, keep its date and doses in sync
    if (data.mrn) {
      const vaxRef = db.collection('vaccinations').doc(data.mrn);
      batch.update(vaxRef, {
        date: assignedDate,
        createdAt: Timestamp.fromDate(new Date(`${assignedDate}T08:00:00`)),
      });
      count++;
    }

    if (count >= 400) {
      await batch.commit();
      batches++;
      console.log(`Committed batch #${batches}...`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    batches++;
    console.log(`Committed final batch #${batches}.`);
  }

  console.log('All incidents successfully updated with exact address and diverse dates!');
}

fixIncidents().catch(console.error);
