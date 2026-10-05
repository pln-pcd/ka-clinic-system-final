// Start a real Firebase project over with clean data: wipe every patient
// record and counter so MRNs restart at 2026-001, then seed 350 patients and
// the vaccine inventory.
//
//   node --env-file=.env scripts/fresh-clinic-data.js reset --dry-run | --yes
//   node --env-file=.env scripts/fresh-clinic-data.js seed  --dry-run | --yes
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { enforceDoseTimeline } from './seed-rules.mjs';

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/fresh-clinic-data.js reset — delete all patient records and reset counters
// (the original script, unchanged, runs inside resetPatientDatabaseCommand)
// ══════════════════════════════════════════════════════════════════════════
async function resetPatientDatabaseCommand() {
// Reset all patient records (seeded and manual), related patient collections,
// and reset settings/counters so MRN starts fresh from 2026-001.
//
// Usage:
//   node --env-file=.env scripts/fresh-clinic-data.js reset --dry-run
//   node --env-file=.env scripts/fresh-clinic-data.js reset --yes
//

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
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/fresh-clinic-data.js reset');
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
    console.log('  node --env-file=.env scripts/fresh-clinic-data.js reset --dry-run');
    console.log('  node --env-file=.env scripts/fresh-clinic-data.js reset --yes');
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
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/fresh-clinic-data.js seed — seed 350 patients and the vaccine inventory
// (the original script, unchanged, runs inside seedClinicDataCommand)
// ══════════════════════════════════════════════════════════════════════════
async function seedClinicDataCommand() {
// Seed 350 patients (190 Completed, 150 Ongoing, 10 Overdue) starting at 2026-001
// and seed clinic vaccine inventory (Rabies, Anti-Tetanus, Pneumonia, RIG, Hepa B, Flu).
//
// Usage:
//   node --env-file=.env scripts/fresh-clinic-data.js seed --dry-run
//   node --env-file=.env scripts/fresh-clinic-data.js seed --yes
//

const TOTAL_COUNT = 350;
const COMPLETED_COUNT = 190;
const ONGOING_COUNT = 150;
const OVERDUE_COUNT = 10; // 190 + 150 + 10 = 350

const BATCH_LIMIT = 300;

/* ───────────────────── LIBON GEODATA ───────────────────── */
const LIBON_BARANGAYS = [
  'San Juan', 'San Rafael', 'Matacon', 'Bulusan', 'Bonavista', 'Carisac East',
  'Carisac West', 'Rawis', 'Pantao', 'Bap-bap', 'Bambon', 'Barbon', 'Burabod',
  'Cagbulos', 'Harigue', 'Liberacion', 'Izcala', 'Labnig', 'Linao', 'Magcawayan',
  'Malabag', 'Maroba', 'Molosbolos', 'Nino Jesus', 'Nogpo', 'San Agustin',
  'San Antonio', 'San Isidro', 'San Jose', 'San Roque', 'San Vicente', 'Santa Cruz',
  'Sogo', 'Talin-talin', 'Tambo', 'Tipa-tipa', 'Zone 1', 'Zone 2', 'Zone 3',
  'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7', 'Zone 8', 'Zone 9', 'Zone 10', 'Zone 11'
];

const LIBON_BARANGAY_COORDS = {
  'San Juan':       { lat: 13.3000, lng: 123.4350 },
  'San Rafael':     { lat: 13.2920, lng: 123.4280 },
  'Matacon':        { lat: 13.2850, lng: 123.4210 },
  'Bulusan':        { lat: 13.3150, lng: 123.4420 },
  'Bonavista':      { lat: 13.3210, lng: 123.4500 },
  'Carisac East':   { lat: 13.3100, lng: 123.4600 },
  'Carisac West':   { lat: 13.3080, lng: 123.4520 },
  'Rawis':          { lat: 13.3320, lng: 123.4650 },
  'Pantao':         { lat: 13.3450, lng: 123.4750 },
  'Bap-bap':        { lat: 13.2750, lng: 123.4100 },
  'Bambon':         { lat: 13.2980, lng: 123.4250 },
  'Barbon':         { lat: 13.2820, lng: 123.4310 },
  'Burabod':        { lat: 13.3040, lng: 123.4400 },
  'Cagbulos':       { lat: 13.3120, lng: 123.4310 },
  'Harigue':        { lat: 13.3180, lng: 123.4220 },
  'Liberacion':     { lat: 13.3010, lng: 123.4370 },
  'Izcala':         { lat: 13.2900, lng: 123.4480 },
  'Labnig':         { lat: 13.3250, lng: 123.4380 },
  'Linao':          { lat: 13.3300, lng: 123.4420 },
  'Magcawayan':     { lat: 13.3350, lng: 123.4550 },
  'Malabag':        { lat: 13.2950, lng: 123.4500 },
  'Maroba':         { lat: 13.2880, lng: 123.4600 },
  'Molosbolos':     { lat: 13.3060, lng: 123.4680 },
  'Nino Jesus':     { lat: 13.2990, lng: 123.4290 },
  'Nogpo':          { lat: 13.3400, lng: 123.4600 },
  'San Agustin':    { lat: 13.3050, lng: 123.4200 },
  'San Antonio':    { lat: 13.3100, lng: 123.4150 },
  'San Isidro':     { lat: 13.2920, lng: 123.4390 },
  'San Jose':       { lat: 13.2960, lng: 123.4440 },
  'San Roque':      { lat: 13.3020, lng: 123.4460 },
  'San Vicente':    { lat: 13.3080, lng: 123.4410 },
  'Santa Cruz':     { lat: 13.3150, lng: 123.4510 },
  'Sogo':           { lat: 13.3220, lng: 123.4620 },
  'Talin-talin':    { lat: 13.3280, lng: 123.4710 },
  'Tambo':          { lat: 13.3360, lng: 123.4800 },
  'Tipa-tipa':      { lat: 13.3420, lng: 123.4880 },
  'Zone 1':         { lat: 13.3005, lng: 123.4355 },
  'Zone 2':         { lat: 13.3015, lng: 123.4365 },
  'Zone 3':         { lat: 13.3025, lng: 123.4375 },
  'Zone 4':         { lat: 13.3035, lng: 123.4385 },
  'Zone 5':         { lat: 13.3045, lng: 123.4395 },
  'Zone 6':         { lat: 13.2995, lng: 123.4345 },
  'Zone 7':         { lat: 13.2985, lng: 123.4335 },
  'Zone 8':         { lat: 13.2975, lng: 123.4325 },
  'Zone 9':         { lat: 13.2965, lng: 123.4315 },
  'Zone 10':        { lat: 13.2955, lng: 123.4305 },
  'Zone 11':        { lat: 13.2945, lng: 123.4295 },
};

const ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7'];
const isPoblacionZone = (b) => /^Zone \d+$/.test(b);

function getHashOffset(str) {
  if (!str) return { latOffset: 0, lngOffset: 0 };
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    hash = (hash << 5) - hash + str.charCodeAt(i);
    hash |= 0;
  }
  const latOffset = ((Math.abs(hash) % 30) - 15) * 0.0001;
  const lngOffset = ((Math.abs(hash * 31) % 30) - 15) * 0.0001;
  return { latOffset, lngOffset };
}

function geocodeLibonAddress(barangay, zone) {
  const base = LIBON_BARANGAY_COORDS[barangay] || { lat: 13.3000, lng: 123.4350 };
  const { latOffset, lngOffset } = getHashOffset(zone || barangay);
  return {
    lat: +(base.lat + latOffset).toFixed(6),
    lng: +(base.lng + lngOffset).toFixed(6),
  };
}

/* ───────────────────── NAMES & POOLS ───────────────────── */
const FIRST_NAMES_M = [
  'Juan', 'Jose', 'Mark', 'John', 'Paul', 'Ramon', 'Eduardo', 'Antonio',
  'Francisco', 'Manuel', 'Ricardo', 'Rolando', 'Danilo', 'Joel', 'Arnel',
  'Reynaldo', 'Christian', 'Jayson', 'Emmanuel', 'Rodel', 'Noel', 'Ariel',
  'Benjamin', 'Rogelio', 'Michael', 'Kevin', 'Jomar', 'Renato', 'Alberto',
  'Dante', 'Elmer', 'Gerardo', 'Bryan', 'Gabriel', 'Carlos', 'Angelo'
];

const FIRST_NAMES_F = [
  'Maria', 'Ana', 'Rosario', 'Cristina', 'Jocelyn', 'Marilyn', 'Analyn',
  'Grace', 'Jenelyn', 'Rowena', 'Lourdes', 'Teresita', 'Divina', 'Mylene',
  'Aileen', 'Catherine', 'Josephine', 'Nenita', 'Corazon', 'Erlinda',
  'Charmaine', 'Sheila', 'Rhea', 'Jessa', 'Kristine', 'Marites', 'Elena',
  'Editha', 'Precious', 'Angelica', 'Camille', 'Bea', 'Patricia'
];

const LAST_NAMES = [
  'Nuñez', 'Bonaobra', 'Berina', 'Bragais', 'Bonifacio', 'Salazar', 'Nacario',
  'Barcelona', 'Bonagua', 'Bordado', 'Loterte', 'Bermas', 'Balicanta',
  'Bagasbas', 'Bellen', 'Boncodin', 'Malacas', 'Rebosura', 'Ballesteros',
  'Buenaflor', 'Cabrera', 'Delos Santos', 'Dela Cruz', 'Escobar', 'Firmalo',
  'Gonzales', 'Imperial', 'Lorenzo', 'Marbella', 'Nieva', 'Ojeda', 'Padua',
  'Quinto', 'Rañola', 'Sarte', 'Tibayan', 'Ulanday', 'Villanueva', 'Zamora',
  'Almonte', 'Bataller', 'Competente', 'Dominguez', 'Escuadro', 'Llaguno',
  'Albaytar', 'Balisacan', 'Cerillo', 'Dato', 'Encinares', 'Flores'
];

const SUFFIXES = ['', '', '', '', '', '', '', '', 'Jr.', 'Sr.', 'III'];

const SERVICES = [
  { key: 'PEP', weight: 65 },
  { key: 'PrEP', weight: 12 },
  { key: 'Tetanus', weight: 10 },
  { key: 'Pneumonia', weight: 7 },
  { key: 'Hepatitis', weight: 6 },
];

const VACCINE_BRANDS_BY_SERVICE = {
  PEP: ['Verorab', 'Rabipur', 'Speeda'],
  PrEP: ['Verorab', 'Rabipur'],
  Tetanus: ['Tetanus Toxoid (TT)', 'Anti-Tetanus Serum (ATS)', 'Tetanus Immunoglobulin (TIG)'],
  Pneumonia: ['Pneumovax 23 (PPSV23)', 'Prevnar 20 (PCV20)'],
  Hepatitis: ['Engerix-B (Hepatitis B)', 'FluQuadri / Vaxigrip Tetra'],
};

const ANIMALS = ['Dog', 'Dog', 'Dog', 'Cat', 'Cat', 'Monkey', 'Bat'];
const TYPE_OF_EXPOSURE = ['Bite', 'Bite', 'Bite', 'Scratch'];
const CATEGORIES = ['Category II', 'Category II', 'Category III']; // Category I is no longer used
const WOUND_DEPTH = ['Superficial', 'Deep / Penetrating', 'Multiple'];
const WOUND_TYPE = ['Laceration', 'Puncture', 'Abrasion'];
const WOUND_LOCATIONS = [
  'Right Hand', 'Left Hand', 'Right Forearm', 'Left Forearm', 'Right Leg',
  'Left Leg', 'Right Calf', 'Left Calf', 'Right Ankle', 'Left Ankle',
  'Right Foot', 'Left Foot'
];

/* ───────────────────── HELPERS ───────────────────── */
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

function pickWeighted(items) {
  const total = items.reduce((sum, item) => sum + item.weight, 0);
  let r = Math.random() * total;
  for (const item of items) {
    if (r < item.weight) return item.key;
    r -= item.weight;
  }
  return items[0].key;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (isoStr, n) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toISODate(dt);
};

const PH_PREFIXES = ['0905', '0915', '0917', '0926', '0927', '0935', '0945', '0956', '0966', '0977', '0995', '0918', '0919', '0920'];
const randomPHMobile = () => '+63' + pick(PH_PREFIXES).slice(1) + String(randInt(1000000, 9999999));
const slug = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');

/* ───────────────────── DOSE SCHEDULE BUILDERS ───────────────────── */
const SCHEDULES = {
  PEP: [
    { key: 'd1', n: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', n: 'Dose 2 (Day 3)', day: 3 },
    { key: 'd3', n: 'Dose 3 (Day 7)', day: 7 },
    { key: 'd4', n: 'Dose 4 (Day 14)', day: 14 },
    { key: 'd5', n: 'Dose 5 (Day 28)', day: 28 },
  ],
  PrEP: [
    { key: 'd1', n: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', n: 'Dose 2 (Day 7)', day: 7 },
    { key: 'd3', n: 'Dose 3 (Day 21)', day: 21 },
  ],
  Tetanus: [
    { key: 'd1', n: 'Dose 1 (Initial)', day: 0 },
    { key: 'd2', n: 'Dose 2 (1 Month)', day: 30 },
    { key: 'd3', n: 'Dose 3 (6 Months)', day: 180 },
  ],
  Pneumonia: [
    { key: 'd1', n: 'Dose 1 (Primary)', day: 0 },
  ],
  Hepatitis: [
    { key: 'd1', n: 'Dose 1 (Initial)', day: 0 },
    { key: 'd2', n: 'Dose 2 (1 Month)', day: 30 },
    { key: 'd3', n: 'Dose 3 (6 Months)', day: 180 },
  ],
};

function buildScheduleForPatient(service, mode, todayIso, regDate) {
  const schedDef = SCHEDULES[service] || SCHEDULES.PEP;

  if (mode === 'completed') {
    // Registered in August 2026. All doses completed on or before Sep 4, 2026.
    const doses = schedDef.map(s => {
      let dIso = addDays(regDate, s.day);
      if (dIso > '2026-09-04') {
        dIso = '2026-09-04';
      }
      return {
        key: s.key,
        n: s.n,
        label: s.n,
        date: dIso,
        s: 'done',
        status: 'done',
        note: 'Administered at K&A Clinic',
      };
    });
    return { regDate, doses, status: 'completed' };
  }

  if (mode === 'ongoing') {
    // Registered in late August or September 2026. Active in treatment.
    // Doses due on or before today (Sep 5) are done; future doses are pending.
    const doses = schedDef.map((s, i) => {
      const scheduledDate = addDays(regDate, s.day);
      const isPastOrToday = scheduledDate <= todayIso;
      const status = isPastOrToday ? 'done' : 'pending';
      return {
        key: s.key,
        n: s.n,
        label: s.n,
        date: scheduledDate,
        s: status,
        status,
        note: isPastOrToday ? 'Administered' : '',
      };
    });
    // Ensure at least one dose is pending so patient is ongoing
    if (doses.every(d => d.status === 'done') && doses.length > 1) {
      doses[doses.length - 1].status = 'pending';
      doses[doses.length - 1].s = 'pending';
      doses[doses.length - 1].note = '';
      doses[doses.length - 1].date = addDays(todayIso, 7);
    }
    return { regDate, doses, status: 'ongoing' };
  }

  if (mode === 'overdue') {
    // Registered in late August. Day 0 (and Day 3 if applicable) done.
    // Follow-up dose scheduled in the past is missed.
    const doses = schedDef.map((s, i) => {
      const scheduledDate = addDays(regDate, s.day);
      let status;
      if (i === 0) {
        status = 'done'; // Day 0 given
      } else if (i === 1 || (i === 2 && scheduledDate < todayIso)) {
        status = 'miss'; // Missed follow-up dose
      } else if (scheduledDate <= todayIso) {
        status = 'miss';
      } else {
        status = 'pending';
      }
      return {
        key: s.key,
        n: s.n,
        label: s.n,
        date: scheduledDate,
        s: status,
        status,
        note: status === 'miss' ? 'Overdue - Patient contacted' : (status === 'done' ? 'Administered' : ''),
      };
    });
    if (!doses.some(d => d.status === 'miss')) {
      const missIdx = Math.min(1, doses.length - 1);
      doses[missIdx].status = 'miss';
      doses[missIdx].s = 'miss';
      doses[missIdx].date = addDays(todayIso, -3);
      doses[missIdx].note = 'Overdue - Patient contacted';
    }
    return { regDate, doses, status: 'ongoing' };
  }

  throw new Error(`Unknown mode: ${mode}`);
}

/* ───────────────────── PATIENT FACTORY ───────────────────── */
function createPatientRecord(mrn, mode, todayIso, regDate, timeStr, usedEmails) {
  const sex = pick(['Male', 'Female']);
  const fname = pick(sex === 'Male' ? FIRST_NAMES_M : FIRST_NAMES_F);
  const lname = pick(LAST_NAMES);
  const mInitial = chance(0.8) ? pick('ABCDEFGHIJKLMNOPRSTV'.split('')) + '.' : '';
  const suffix = sex === 'Male' && chance(0.12) ? pick(SUFFIXES) : '';
  const fullName = [fname, mInitial, lname].filter(Boolean).join(' ') + (suffix ? `, ${suffix}` : '');

  const age = randInt(3, 76);
  const barangay = pick(LIBON_BARANGAYS);
  const zone = isPoblacionZone(barangay) ? '' : (chance(0.6) ? pick(ZONES) : '');
  const address = `${zone ? zone + ', ' : ''}Brgy. ${barangay}, Libon, Albay`;
  const { lat, lng } = geocodeLibonAddress(barangay, zone || barangay);

  const service = (mode === 'overdue') ? pick(['PEP', 'PEP', 'Tetanus']) : pickWeighted(SERVICES);
  const brandList = VACCINE_BRANDS_BY_SERVICE[service] || VACCINE_BRANDS_BY_SERVICE.PEP;
  const vaccineBrand = pick(brandList);

  const { doses, status } = buildScheduleForPatient(service, mode, todayIso, regDate);

  const category = (service === 'PEP' || service === 'PrEP') ? pick(CATEGORIES) : '';
  const animal = (service === 'PEP') ? pick(ANIMALS) : '';
  const typeOfExposure = (service === 'PEP') ? pick(TYPE_OF_EXPOSURE) : (service === 'Tetanus' ? 'Puncture wound' : 'Preventive');

  let email;
  let guard = 0;
  do {
    email = `${slug(fname)}.${slug(lname)}${randInt(10, 9999)}@gmail.com`;
    guard++;
  } while (usedEmails.has(email) && guard < 100);
  usedEmails.add(email);

  const contact = randomPHMobile();
  const createdTimestamp = Timestamp.fromDate(new Date(`${regDate}T${timeStr}`));
  const exposureDate = chance(0.35) ? addDays(regDate, -1) : regDate;

  return {
    mrn,
    service,
    mode,
    vax: {
      id: mrn,
      mrn,
      name: fullName,
      email,
      contact,
      age: String(age),
      sex,
      barangay,
      zone: zone || barangay,
      address,
      service,
      vaccineBrand,
      placeOfExposure: `Brgy. ${barangay}, Libon`,
      typeOfExposure,
      sourceOfExposure: service === 'PEP' ? (chance(0.6) ? 'Stray animal' : 'Domestic pet') : 'N/A',
      woundWashed: service === 'PEP' ? (chance(0.85) ? 'Yes' : 'No') : 'No',
      rigGiven: category === 'Category III' ? 'Yes (ERIG)' : 'No',
      vaxGiven: 'Yes',
      genericName: service === 'PEP' ? 'Purified Vero Cell Rabies Vaccine' : service === 'Tetanus' ? 'Tetanus Toxoid' : vaccineBrand,
      route: 'IM',
      animal: animal || 'N/A',
      cat: category ? category.replace('Category ', '') : '',
      date: regDate,
      notes: mode === 'overdue' ? 'Follow-up SMS and email reminder dispatched.' : '',
      pastVaccines: chance(0.3) ? 'Tetanus toxoid' : 'None',
      allergies: chance(0.08) ? 'Penicillin' : 'None known',
      woundLocation: pick(WOUND_LOCATIONS),
      woundDepth: pick(WOUND_DEPTH),
      numberOfBites: String(randInt(1, 3)),
      woundType: pick(WOUND_TYPE),
      lastTetanus: 'Unknown',
      hepaVariant: '',
      riskFactor: '',
      priorHepa: '',
      pneumoVaccine: '',
      riskCondition: '',
      priorPneumo: '',
      status: mode === 'overdue' ? 'overdue' : status,
      doses,
      woundImages: [],
      createdAt: createdTimestamp,
      isSeedData: true,
    },
    auth: {
      mrn,
      name: fullName,
      email,
      contact,
      authorized: true,
      registered: false,
      uid: null,
      createdAt: createdTimestamp,
      isSeedData: true,
    },
    incident: service === 'PEP' ? {
      mrn,
      patientName: fullName,
      animal: animal || 'Dog',
      category: category || 'Category II',
      barangay,
      zone: zone || barangay,
      address,
      lat,
      lng,
      exposureDate,
      date: exposureDate,
      createdAt: Timestamp.fromDate(new Date(`${exposureDate}T${timeStr}`)),
      isSeedData: true,
    } : null,
  };
}

/* ───────────────────── INCIDENT PINS ───────────────────── */
// Only ~35 PEP cases become map pins (not every one), picked round-robin
// across barangays so the map shows spread rather than one crowded zone.
// Each pin gets a small deterministic jitter (about ±120 m) so pins from the
// same barangay/zone never sit on identical coordinates.
const MAX_INCIDENT_PINS = 35;
function limitIncidentPins(patients) {
  const byBarangay = new Map();
  patients.forEach(p => {
    if (!p.incident) return;
    const key = p.incident.barangay || '';
    if (!byBarangay.has(key)) byBarangay.set(key, []);
    byBarangay.get(key).push(p);
  });
  const queues = [...byBarangay.values()];
  const keep = new Set();
  while (keep.size < MAX_INCIDENT_PINS && queues.some(q => q.length)) {
    for (const q of queues) {
      if (q.length && keep.size < MAX_INCIDENT_PINS) keep.add(q.shift());
    }
  }
  let seed = 7;
  const rand = () => { seed = (seed * 16807) % 2147483647; return seed / 2147483647; };
  const seen = new Set();
  patients.forEach(p => {
    if (!p.incident) return;
    if (!keep.has(p)) { p.incident = null; return; }
    let lat, lng;
    do {
      lat = +(p.incident.lat + (rand() - 0.5) * 0.0022).toFixed(6);
      lng = +(p.incident.lng + (rand() - 0.5) * 0.0022).toFixed(6);
    } while (seen.has(`${lat},${lng}`));
    seen.add(`${lat},${lng}`);
    p.incident.lat = lat;
    p.incident.lng = lng;
  });
}

/* ───────────────────── INVENTORY SEED DATA ───────────────────── */
const INVENTORY_ITEMS = [
  // Rabies Vaccines
  {
    name: 'Verorab (PVRV Rabies Vaccine)',
    category: 'Vaccine',
    stock: 300,
    minStock: 30,
    unit: 'Vials',
    expiry: '2027-11-30',
    expiryDate: '2027-11-30',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'Rabipur (PCEC Rabies Vaccine)',
    category: 'Vaccine',
    stock: 250,
    minStock: 25,
    unit: 'Vials',
    expiry: '2027-08-15',
    expiryDate: '2027-08-15',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'Speeda (PVRV Rabies Vaccine)',
    category: 'Vaccine',
    stock: 200,
    minStock: 20,
    unit: 'Vials',
    expiry: '2027-06-20',
    expiryDate: '2027-06-20',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },

  // Anti-Tetanus Vaccines & Serums
  {
    name: 'Tetanus Toxoid (TT)',
    category: 'Vaccine',
    stock: 250,
    minStock: 30,
    unit: 'Ampoules',
    expiry: '2028-02-14',
    expiryDate: '2028-02-14',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'Anti-Tetanus Serum (ATS 1500 IU)',
    category: 'Vaccine',
    stock: 180,
    minStock: 25,
    unit: 'Ampoules',
    expiry: '2027-10-10',
    expiryDate: '2027-10-10',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'Tetanus Immunoglobulin (TIG 250 IU)',
    category: 'Vaccine',
    stock: 120,
    minStock: 20,
    unit: 'Vials',
    expiry: '2027-12-05',
    expiryDate: '2027-12-05',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },

  // Pneumonia Vaccines
  {
    name: 'Pneumovax 23 (PPSV23)',
    category: 'Vaccine',
    stock: 150,
    minStock: 20,
    unit: 'Vials',
    expiry: '2028-04-30',
    expiryDate: '2028-04-30',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'Prevnar 20 (PCV20)',
    category: 'Vaccine',
    stock: 130,
    minStock: 15,
    unit: 'Vials',
    expiry: '2027-09-25',
    expiryDate: '2027-09-25',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },

  // Rabies Immunoglobulins (RIG)
  {
    name: 'Equirab (ERIG - Equine Rabies Immunoglobulin)',
    category: 'Rig',
    stock: 100,
    minStock: 15,
    unit: 'Vials',
    expiry: '2027-04-12',
    expiryDate: '2027-04-12',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },

  // Other Related Vaccines
  {
    name: 'Engerix-B (Hepatitis B Adult 20mcg)',
    category: 'Vaccine',
    stock: 160,
    minStock: 20,
    unit: 'Vials',
    expiry: '2028-01-20',
    expiryDate: '2028-01-20',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
  {
    name: 'FluQuadri (Quadrivalent Influenza Vaccine)',
    category: 'Vaccine',
    stock: 140,
    minStock: 20,
    unit: 'Vials',
    expiry: '2027-03-31',
    expiryDate: '2027-03-31',
    status: 'in-stock',
    createdAt: Date.now(),
    isSeedData: true,
  },
];

/* ───────────────────── MAIN EXECUTION ───────────────────── */
function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 not set in .env');
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function main() {
  const args = process.argv.slice(2);
  const dryRun = args.includes('--dry-run');
  const confirmed = args.includes('--yes');

  if (!dryRun && !confirmed) {
    console.log('Please run with --dry-run or --yes:');
    console.log('  node --env-file=.env scripts/fresh-clinic-data.js seed --dry-run');
    console.log('  node --env-file=.env scripts/fresh-clinic-data.js seed --yes');
    process.exit(1);
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const db = getFirestore(app);

  const todayIso = toISODate(new Date());
  const year = new Date().getFullYear(); // 2026

  console.log(`\n=== GENERATING 350 PATIENTS (STARTING AUGUST 2026, MRN ${year}-001) ===`);
  console.log(`Plan:`);
  console.log(`  - 190 Completed patients (Registered Aug 1 – Aug 21, 2026)`);
  console.log(`  - 150 Ongoing patients (Registered Aug 22 – Sep 5, 2026)`);
  console.log(`  -  10 Overdue patients (Registered mid-late Aug, missed dose)`);
  console.log(`  - 12 Clinical Inventory items (Rabies, Anti-Tetanus, Pneumonia, RIG, Hepa, Flu)\n`);

  const usedEmails = new Set();
  const patients = [];

  // 10 overdue patients evenly distributed across the 160 active registry records (MRNs 191..350)
  const overdueIndices = new Set([205, 220, 235, 250, 265, 280, 295, 310, 325, 340]);

  for (let i = 1; i <= TOTAL_COUNT; i++) {
    const seqStr = String(i).padStart(3, '0');
    const mrn = `${year}-${seqStr}`;

    let mode;
    let dayOffset;

    if (i <= COMPLETED_COUNT) {
      // 1..190: Completed records
      // Spread across August 1 to August 21 (21 days)
      mode = 'completed';
      dayOffset = Math.min(20, Math.floor(((i - 1) / COMPLETED_COUNT) * 21));
    } else {
      // 191..350: 160 records (150 ongoing + 10 overdue)
      // Spread across August 22 to September 5 (15 days: day offset 21 to 35)
      const rel = i - (COMPLETED_COUNT + 1); // 0..159
      dayOffset = 21 + Math.min(14, Math.floor((rel / 160) * 15));
      if (overdueIndices.has(i)) {
        mode = 'overdue';
      } else {
        mode = 'ongoing';
      }
    }

    // Start with August 1, 2026 (Month 7 in 0-indexed Date)
    const regDt = new Date(2026, 7, 1 + dayOffset);
    const regDate = toISODate(regDt);

    // Realistic clinic operating hours with varied timestamps (08:00 to 16:45)
    const hour = 8 + ((i * 3) % 9);
    const min = ((i * 17) % 60);
    const sec = ((i * 31) % 60);
    const timeStr = `${pad(hour)}:${pad(min)}:${pad(sec)}`;

    const rec = createPatientRecord(mrn, mode, todayIso, regDate, timeStr, usedEmails);
    rec.vax = enforceDoseTimeline(rec.vax, todayIso);
    patients.push(rec);
  }

  limitIncidentPins(patients);

  const completed = patients.filter(p => p.mode === 'completed').length;
  const ongoing = patients.filter(p => p.mode === 'ongoing').length;
  const overdue = patients.filter(p => p.mode === 'overdue').length;
  const incidentsCount = patients.filter(p => p.incident !== null).length;

  console.log(`Generated records:`);
  console.log(`  - MRN Range: ${patients[0].mrn} (${patients[0].vax.date}) to ${patients[patients.length - 1].mrn} (${patients[patients.length - 1].vax.date})`);
  console.log(`  - Completed: ${completed}`);
  console.log(`  - Ongoing: ${ongoing}`);
  console.log(`  - Overdue: ${overdue}`);
  console.log(`  - Map Incidents to pin: ${incidentsCount}`);
  console.log(`  - Inventory items to seed: ${INVENTORY_ITEMS.length}`);

  if (dryRun) {
    console.log('\n[Dry Run complete. No writes were executed. Run with --yes to commit to Firestore.]');
    return;
  }

  console.log('\nWiping existing patient records, authorizations, and incidents...');
  for (const colName of ['vaccinations', 'authorizedPatients', 'incidents']) {
    const snap = await db.collection(colName).get();
    let b = db.batch();
    let bOps = 0;
    for (const doc of snap.docs) {
      b.delete(doc.ref);
      bOps++;
      if (bOps >= BATCH_LIMIT) {
        await b.commit();
        b = db.batch();
        bOps = 0;
      }
    }
    if (bOps > 0) await b.commit();
    console.log(`  Cleared ${snap.size} docs from ${colName}`);
  }

  console.log('\nWriting new records to Firestore...');

  let batch = db.batch();
  let ops = 0;
  let batchesCommitted = 0;

  async function commitBatchIfNeeded() {
    ops++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      batchesCommitted++;
      console.log(`  Committed batch #${batchesCommitted} (${ops} operations)...`);
      batch = db.batch();
      ops = 0;
    }
  }

  // 1. Write Patients (`vaccinations` & `authorizedPatients` & `incidents`)
  for (const p of patients) {
    batch.set(db.collection('vaccinations').doc(p.mrn), p.vax);
    await commitBatchIfNeeded();

    batch.set(db.collection('authorizedPatients').doc(p.mrn), p.auth);
    await commitBatchIfNeeded();

    if (p.incident) {
      const incRef = db.collection('incidents').doc();
      batch.set(incRef, p.incident);
      await commitBatchIfNeeded();
    }
  }

  // 2. Write Clinic Inventory Items (only if missing)
  const invSnap = await db.collection('inventory').get();
  const existingNames = new Set(invSnap.docs.map(d => d.data().name?.toLowerCase().trim()));
  let invAdded = 0;
  for (const item of INVENTORY_ITEMS) {
    if (!existingNames.has(item.name.toLowerCase().trim())) {
      const invRef = db.collection('inventory').doc();
      batch.set(invRef, item);
      await commitBatchIfNeeded();
      invAdded++;
    }
  }
  console.log(`  Inventory items added: ${invAdded} (existing preserved: ${existingNames.size})`);

  // 3. Update settings/counters to 350 so next real patient is 2026-351
  const counterRef = db.collection('settings').doc('counters');
  batch.set(counterRef, {
    currentYear: year,
    lastSequence: TOTAL_COUNT,
    updatedAt: new Date().toISOString(),
  });
  await commitBatchIfNeeded();

  if (ops > 0) {
    await batch.commit();
    batchesCommitted++;
    console.log(`  Committed final batch #${batchesCommitted} (${ops} operations)...`);
  }

  console.log(`\nAll 350 patients and 12 vaccine inventory items successfully seeded!`);
  console.log(`Counter settings/counters updated to: lastSequence: ${TOTAL_COUNT}`);
  console.log(`Next patient registered in clinic will be: ${year}-${String(TOTAL_COUNT + 1).padStart(3, '0')}`);
}

main().catch(err => {
  console.error('Seed error:', err);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// Command dispatch: the first argument picks the command; it is removed
// from process.argv so each command sees exactly the arguments it always did.
// ══════════════════════════════════════════════════════════════════════════
const COMMANDS = {
  'reset': resetPatientDatabaseCommand,
  'seed': seedClinicDataCommand,
};

async function runCommand() {
  const command = process.argv[2];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.error('Usage: node --env-file=.env scripts/fresh-clinic-data.js <reset|seed> [options]');
    process.exit(1);
  }
  process.argv.splice(2, 1);
  await COMMANDS[command]();
}

await runCommand();
