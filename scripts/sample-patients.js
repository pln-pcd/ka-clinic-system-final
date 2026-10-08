// Synthetic sample patients for a real Firebase project (not the emulator):
// seed them, and remove them again. Every seeded document carries
// isSeedData: true, which is what the remove command selects on.
//
//   node --env-file=.env scripts/sample-patients.js seed [--count 100] [--dry-run] [--no-incidents]
//   node --env-file=.env scripts/sample-patients.js remove --dry-run | --yes
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore, Timestamp } from 'firebase-admin/firestore';
import { enforceDoseTimeline } from './seed-rules.mjs';
import { buildSimulatedIncidents } from '../ka-clinic-admin/src/lib/simulatedIncidents.js';

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/sample-patients.js seed — insert synthetic PEP patient records
// (the original script, unchanged, runs inside seedSamplePatientsCommand)
// ══════════════════════════════════════════════════════════════════════════
async function seedSamplePatientsCommand() {
// One-time seed script: inserts 100 synthetic PEP patient records into
// Firestore for demo/testing. Every record is tagged `isSeedData: true` so
// scripts/sample-patients.js remove can wipe them without touching real patients.
//
// Usage:
//   node --env-file=.env scripts/sample-patients.js seed [--count 100] [--dry-run]
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID in the
// environment (same vars as scripts/admin-tools.mjs create-manager — see .env.example).
//
// Field names mirror exactly what ka-clinic-admin/src/features/patients/PatientsPage.jsx
// handleAddPatient() writes to `vaccinations/{mrn}` and
// `authorizedPatients/{mrn}`, and what handlePinToMap() writes to
// `incidents`. No new schema is invented.

/* ─────────────────────────── CONFIG ─────────────────────────── */

const DEFAULT_COUNT = 100;
const BATCH_LIMIT = 400; // Firestore hard cap is 500 writes/batch; each
                         // patient costs 3 writes, so we commit well under.

/* ─────────────── LIBON GEODATA (mirrors patients.jsx) ─────────────── */
// Copied verbatim from ka-clinic-admin/src/lib/libonGeo.js
// LIBON_BARANGAYS / LIBON_BARANGAY_COORDS so generated pins land inside
// Libon, Albay and match the Incident Map's own barangay dictionary.
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

// Poblacion zones are their own barangays in the LIBON_BARANGAYS list, so
// they never take a second "Zone N" prefix in the address string.
const isPoblacionZone = (b) => /^Zone \d+$/.test(b);
const ZONES = ['Zone 1', 'Zone 2', 'Zone 3', 'Zone 4', 'Zone 5', 'Zone 6', 'Zone 7'];

// Same deterministic jitter patients.jsx uses, so a seeded record placed at
// a barangay lands on the same pin the live app would compute for it.
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

/* ─────────────────────── NAME POOLS (Bicol / Albay) ─────────────────────── */

const FIRST_NAMES_M = [
  'Jose', 'Juan', 'Mark', 'Angelo', 'Ramon', 'Ricardo', 'Nestor', 'Efren',
  'Rolando', 'Danilo', 'Joel', 'Arnel', 'Reynaldo', 'Christian', 'Jayson',
  'Emmanuel', 'Rodel', 'Noel', 'Ariel', 'Benjamin', 'Rogelio', 'Michael',
  'Kevin', 'Jomar', 'Renato', 'Alberto', 'Dante', 'Elmer', 'Gerardo', 'Bryan',
];
const FIRST_NAMES_F = [
  'Maria', 'Ana', 'Rosario', 'Cristina', 'Jocelyn', 'Marilyn', 'Analyn',
  'Grace', 'Jenelyn', 'Rowena', 'Lourdes', 'Teresita', 'Divina', 'Mylene',
  'Aileen', 'Catherine', 'Josephine', 'Nenita', 'Corazon', 'Erlinda',
  'Charmaine', 'Sheila', 'Rhea', 'Jessa', 'Kristine', 'Marites', 'Elena',
  'Editha', 'Precious', 'Angelica',
];
const LAST_NAMES = [
  'Nuñez', 'Bonaobra', 'Berina', 'Bragais', 'Bonifacio', 'Salazar', 'Nacario',
  'Barcelona', 'Bonagua', 'Bordado', 'Loterte', 'Bermas', 'Balicanta',
  'Bagasbas', 'Bellen', 'Boncodin', 'Malacas', 'Rebosura', 'Ballesteros',
  'Buenaflor', 'Cabrera', 'Delos Santos', 'Dela Cruz', 'Escobar', 'Firmalo',
  'Gonzales', 'Imperial', 'Lorenzo', 'Marbella', 'Nieva', 'Ojeda', 'Padua',
  'Quinto', 'Rañola', 'Sarte', 'Tibayan', 'Ulanday', 'Villanueva', 'Zamora',
  'Almonte', 'Bataller', 'Competente', 'Dominguez', 'Escuadro', 'Llaguno',
];
const SUFFIXES = ['', '', '', '', '', '', '', '', 'Jr.', 'Sr.', 'III'];

/* ───────────────────── CLINICAL VALUE POOLS ───────────────────── */
// Every literal below is an option that already exists in the Register New
// Patient wizard's own <select> lists in patients.jsx — nothing invented.

const TYPE_OF_EXPOSURE = weighted([
  ['Bite', 78], ['Scratch', 22],
]);
const ANIMALS = weighted([
  ['Dog', 74], ['Cat', 20], ['Monkey', 2], ['Bat', 2], ['Rat', 1], ['Other', 1],
]);
const SOURCE_OF_EXPOSURE = weighted([
  ['Stray animal', 45], ['Domestic pet', 42], ['Unknown source', 9], ['Wild animal', 4],
]);
// Realistic PEP skew: most Category II, a solid minority III (Category I is no longer used).
const CATEGORIES = weighted([
  ['Category II', 63], ['Category III', 37],
]);
const WOUND_DEPTH = weighted([
  ['Superficial', 55], ['Deep / Penetrating', 25], ['Multiple', 14], ['Unknown', 6],
]);
const WOUND_TYPE = weighted([
  ['Laceration', 46], ['Puncture', 34], ['Abrasion', 15], ['Crush injury', 3], ['Other', 2],
]);
const LAST_TETANUS = weighted([
  ['Unknown', 40], ['More than 10 years ago', 22], ['5–10 years ago', 18],
  ['Less than 5 years ago', 12], ['Never vaccinated', 8],
]);
const WOUND_LOCATIONS = [
  'Right Hand', 'Left Hand', 'Right Forearm', 'Left Forearm', 'Right Leg',
  'Left Leg', 'Right Calf', 'Left Calf', 'Right Ankle', 'Left Ankle',
  'Right Thigh', 'Left Thigh', 'Right Foot', 'Left Foot', 'Right Index Finger',
];
const ROUTES = weighted([['IM', 70], ['ID', 30]]);
// "bcc" is the placeholder brand already used elsewhere in the app; the
// others match the generic names the wizard suggests.
const VACCINE_BRANDS = weighted([
  ['bcc', 60], ['Verorab', 18], ['Speeda', 12], ['Vaxirab', 10],
]);
const GENERIC_NAMES = weighted([
  ['Purified Chick Embryo Cell Rabies Vaccine', 62],
  ['Purified Vero Cell Rabies Vaccine', 38],
]);
const ALLERGIES = weighted([
  ['', 74], ['None known', 8], ['Penicillin', 6], ['Seafood', 5],
  ['Aspirin', 3], ['Sulfa drugs', 2], ['Dust / pollen', 2],
]);
const PAST_VACCINES = weighted([
  ['', 68], ['None', 12], ['Tetanus toxoid (2023)', 8],
  ['Anti-rabies (2022, incomplete)', 6], ['COVID-19 primary series', 6],
]);
const SEXES = ['Male', 'Female'];
const BITE_COUNTS = weighted([[1, 62], [2, 22], [3, 10], [4, 6]]);

/* ─────────────────────────── RNG HELPERS ─────────────────────────── */

const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const chance = (p) => Math.random() < p;

// Expands [[value, weight], ...] into a flat pool so `pick()` respects the
// weights without needing a separate weighted-pick function at call sites.
function weighted(pairs) {
  const out = [];
  for (const [value, weight] of pairs) {
    for (let i = 0; i < weight; i++) out.push(value);
  }
  return out;
}

const pad = (n, w = 2) => String(n).padStart(w, '0');
const toISODate = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
const addDays = (isoStr, n) => {
  const [y, m, d] = isoStr.split('-').map(Number);
  const dt = new Date(y, m - 1, d);
  dt.setDate(dt.getDate() + n);
  return toISODate(dt);
};
const daysBetween = (aIso, bIso) => {
  const [ay, am, ad] = aIso.split('-').map(Number);
  const [by, bm, bd] = bIso.split('-').map(Number);
  return Math.round((Date.UTC(by, bm - 1, bd) - Date.UTC(ay, am - 1, ad)) / 86400000);
};

// PH mobile prefixes actually in service (Globe/Smart/DITO/Sun).
const PH_PREFIXES = [
  '0905', '0906', '0915', '0916', '0917', '0926', '0927', '0935', '0936',
  '0945', '0955', '0956', '0965', '0966', '0967', '0975', '0976', '0977',
  '0994', '0995', '0996', '0997', '0998', '0999', '0918', '0919', '0920',
];
const randomPHMobile = () => pick(PH_PREFIXES) + String(randInt(0, 9999999)).padStart(7, '0');

// patients.jsx formatE164() — stored contact is E.164, not the raw 09XXXXXXXXX.
function formatE164(phone) {
  if (!phone) return '';
  const cleaned = phone.replace(/[^\d+]/g, '');
  if (cleaned.startsWith('+')) return cleaned;
  if (cleaned.startsWith('09') && cleaned.length === 11) return '+63' + cleaned.slice(1);
  if (cleaned.startsWith('9') && cleaned.length === 10) return '+63' + cleaned;
  if (cleaned.startsWith('639') && cleaned.length === 12) return '+' + cleaned;
  return cleaned;
}

const slug = (s) => s.toLowerCase().normalize('NFD').replace(/\p{M}/gu, '').replace(/[^a-z]/g, '');

/* ─────────────────────── DOSE SCHEDULE BUILDER ─────────────────────── */
// Standard ARV Day 0/3/7/14/28 series. Dose objects use the canonical
// { n, date, s } shape that patients.jsx VaccineModal writes and
// vaccination.jsx buildDoses() reads; `label`/`status` aliases are included
// too because the registration path also writes those keys.
const ARV_SCHEDULE = [
  { key: 'd1', n: 'Dose 1 (Day 0)',  day: 0  },
  { key: 'd2', n: 'Dose 2 (Day 3)',  day: 3  },
  { key: 'd3', n: 'Dose 3 (Day 7)',  day: 7  },
  { key: 'd4', n: 'Dose 4 (Day 14)', day: 14 },
  { key: 'd5', n: 'Dose 5 (Day 28)', day: 28 },
];

function buildDoses(exposureDate, dosesDone, todayIso) {
  return ARV_SCHEDULE.map((s, i) => {
    const date = addDays(exposureDate, s.day);
    let status;
    if (i < dosesDone) {
      status = 'done';
    } else if (date < todayIso) {
      // Scheduled date already passed but never administered — the tracker
      // renders this as an overdue/missed dose.
      status = 'miss';
    } else {
      status = 'pending';
    }
    return {
      key: s.key,
      n: s.n,
      label: s.n,
      date,
      s: status,
      status,
      note: '',
    };
  });
}

/* ─────────────────────── RECORD GENERATOR ─────────────────────── */

function generatePatient(mrn, todayIso, usedEmails) {
  const sex = pick(SEXES);
  const fname = pick(sex === 'Male' ? FIRST_NAMES_M : FIRST_NAMES_F);
  const lname = pick(LAST_NAMES);
  const mnameInitial = chance(0.75) ? pick('ABCDEFGHIJKLMNOPRSTV'.split('')) : '';
  const suffix = sex === 'Male' ? pick(SUFFIXES) : '';
  const fullName =
    [fname, mnameInitial ? `${mnameInitial}.` : '', lname].filter(Boolean).join(' ') +
    (suffix ? `, ${suffix}` : '');

  // Age mix: children bitten most often, then working adults, then elderly.
  const ageBand = Math.random();
  const age = ageBand < 0.32 ? randInt(2, 14)
            : ageBand < 0.80 ? randInt(15, 59)
            : randInt(60, 88);

  const barangay = pick(LIBON_BARANGAYS);
  const zone = isPoblacionZone(barangay) ? '' : (chance(0.55) ? pick(ZONES) : '');
  const address = `${zone ? zone + ', ' : ''}Brgy. ${barangay}, Libon, Albay`;
  const { lat, lng } = geocodeLibonAddress(barangay, zone || barangay);

  // Exposure date spread across the last 6 months (~183 days).
  const exposureDate = addDays(todayIso, -randInt(0, 183));
  const daysSinceExposure = daysBetween(exposureDate, todayIso);

  // Dose progress is capped by how many doses could physically have been
  // given by now, so a bite from 2 days ago never shows 5/5 completed.
  const maxPossible = ARV_SCHEDULE.filter(s => s.day <= daysSinceExposure).length;
  let dosesDone;
  if (maxPossible === 0) {
    dosesDone = 0;
  } else if (maxPossible < 5) {
    // Mid-window patients: usually on track, sometimes one behind.
    dosesDone = chance(0.72) ? maxPossible : Math.max(0, maxPossible - randInt(1, 2));
  } else {
    // Full window elapsed: most finished, some dropped off mid-series.
    const r = Math.random();
    dosesDone = r < 0.62 ? 5 : r < 0.90 ? randInt(2, 4) : randInt(0, 1);
  }

  const doses = buildDoses(exposureDate, dosesDone, todayIso);
  // Matches derivePatientStatus() in patients.jsx: 'completed' only when
  // every dose is done, otherwise 'ongoing'.
  const status = dosesDone === ARV_SCHEDULE.length ? 'completed' : 'ongoing';

  const typeOfExposure = pick(TYPE_OF_EXPOSURE);
  const animal = pick(ANIMALS);
  const category = pick(CATEGORIES);
  const catShort = category.replace('Category ', '');

  // Clearly-fake mailbox: name + digits on gmail.com, deduped so two
  // seeded patients never collide on the app-login email.
  let email;
  let guard = 0;
  do {
    email = `${slug(fname)}.${slug(lname)}${randInt(10, 9999)}@gmail.com`;
    guard++;
  } while (usedEmails.has(email) && guard < 50);
  usedEmails.add(email);

  const contactRaw = randomPHMobile();

  return {
    mrn,
    // Anonymized fields the incident pin needs, carried alongside.
    _map: { lat, lng, barangay, zone: zone || barangay, category, animal, exposureDate },
    vax: {
      id: mrn,
      mrn,
      name: fullName,
      email,
      contact: formatE164(contactRaw),
      age: String(age),
      sex,
      barangay,
      zone: zone || barangay,
      address,
      service: 'PEP',
      vaccineBrand: pick(VACCINE_BRANDS),
      placeOfExposure: `Brgy. ${barangay}, Libon`,
      typeOfExposure,
      sourceOfExposure: pick(SOURCE_OF_EXPOSURE),
      woundWashed: chance(0.86) ? 'Yes' : 'No',
      rigGiven: category === 'Category III' ? 'Yes (ERIG)' : 'No',
      vaxGiven: dosesDone > 0 ? 'Yes' : 'No',
      genericName: pick(GENERIC_NAMES),
      route: pick(ROUTES),
      animal,
      cat: catShort,
      date: exposureDate,
      notes: '',
      pastVaccines: pick(PAST_VACCINES),
      allergies: pick(ALLERGIES),
      woundLocation: pick(WOUND_LOCATIONS),
      woundDepth: pick(WOUND_DEPTH),
      numberOfBites: String(pick(BITE_COUNTS)),
      woundType: pick(WOUND_TYPE),
      lastTetanus: pick(LAST_TETANUS),
      hepaVariant: '',
      riskFactor: '',
      priorHepa: '',
      pneumoVaccine: '',
      riskCondition: '',
      priorPneumo: '',
      status,
      doses,
      woundImages: [],
      createdAt: Timestamp.fromDate(new Date(`${exposureDate}T08:00:00`)),
      isSeedData: true,
    },
    auth: {
      mrn,
      name: fullName,
      email,
      contact: formatE164(contactRaw),
      authorized: true,
      registered: false,
      uid: null,
      createdAt: Timestamp.fromDate(new Date(`${exposureDate}T08:00:00`)),
      isSeedData: true,
    },
  };
}

/* ─────────────────────────── FIREBASE ─────────────────────────── */

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/sample-patients.js seed');
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

function parseArgs() {
  const args = process.argv.slice(2);
  const out = { count: DEFAULT_COUNT, dryRun: false, pinIncidents: true };
  for (let i = 0; i < args.length; i++) {
    if (args[i] === '--dry-run') out.dryRun = true;
    else if (args[i] === '--no-incidents') out.pinIncidents = false;
    else if (args[i] === '--count') { out.count = parseInt(args[++i], 10) || DEFAULT_COUNT; }
  }
  return out;
}

// Reserves `count` MRNs in one transaction against settings/counters — the
// same counter doc patients.jsx getAndIncrementNextMRN() uses — so seeded
// MRNs can never collide with MRNs the live app hands out later.
async function reserveMRNBlock(db, count) {
  const year = new Date().getFullYear();
  const counterRef = db.collection('settings').doc('counters');

  const startSeq = await db.runTransaction(async (tx) => {
    const snap = await tx.get(counterRef);
    if (!snap.exists) {
      tx.set(counterRef, { currentYear: year, lastSequence: count });
      return 1;
    }
    const data = snap.data() || {};
    const curYear = data.currentYear || year;
    const lastSeq = curYear !== year ? 0 : (data.lastSequence || 0);
    tx.update(counterRef, { currentYear: year, lastSequence: lastSeq + count });
    return lastSeq + 1;
  });

  const mrns = [];
  for (let i = 0; i < count; i++) {
    mrns.push(`${year}-${String(startSeq + i).padStart(3, '0')}`);
  }
  return mrns;
}

async function main() {
  const { count, dryRun, pinIncidents } = parseArgs();
  const todayIso = toISODate(new Date());

  if (dryRun) {
    // Dry run never touches Firestore — no credentials, no MRN reservation.
    console.log(`Dry run — generating ${count} record(s), nothing will be written.\n`);
    const usedEmails = new Set();
    const year = new Date().getFullYear();
    const sample = generatePatient(`${year}-001`, todayIso, usedEmails);
    console.log(JSON.stringify(sample.vax, null, 2));
    console.log('\nDry run complete. Re-run without --dry-run to write to Firestore.');
    return;
  }

  const app = getApps().length ? getApps()[0] : initializeApp({
    credential: cert(loadServiceAccount()),
    projectId: process.env.FIREBASE_PROJECT_ID,
  });
  const db = getFirestore(app);

  console.log(`Reserving ${count} MRN(s) from settings/counters...`);
  const mrns = await reserveMRNBlock(db, count);
  console.log(`Reserved ${mrns[0]} .. ${mrns[mrns.length - 1]}\n`);

  const usedEmails = new Set();
  const records = mrns.map(mrn => {
    const rec = generatePatient(mrn, todayIso, usedEmails);
    return { ...rec, vax: enforceDoseTimeline(rec.vax, todayIso) };
  });

  let batch = db.batch();
  let opsInBatch = 0;
  let written = 0;

  const flush = async () => {
    if (opsInBatch === 0) return;
    await batch.commit();
    batch = db.batch();
    opsInBatch = 0;
  };

  for (const rec of records) {
    batch.set(db.collection('vaccinations').doc(rec.mrn), rec.vax);
    batch.set(db.collection('authorizedPatients').doc(rec.mrn), rec.auth);
    opsInBatch += 2;

    written++;
    if (opsInBatch >= BATCH_LIMIT) {
      await flush();
      console.log(`Seeded ${written}/${count}...`);
    } else if (written % 10 === 0) {
      console.log(`Seeded ${written}/${count}...`);
    }
  }

  // Incident Map pins are SIMULATED (lib/simulatedIncidents.js): random
  // coordinates, no address/barangay/patient, not linked to any record.
  let pinned = 0;
  if (pinIncidents) {
    const today = new Date().toISOString().slice(0, 10);
    for (const pin of buildSimulatedIncidents({ count: 35, seed: 35, todayIso: today, extra: { isSeedData: true } })) {
      batch.set(db.collection('incidents').doc(pin.id), pin.data);
      opsInBatch += 1;
      pinned += 1;
      if (opsInBatch >= BATCH_LIMIT) await flush();
    }
  }

  await flush();

  const completed = records.filter(r => r.vax.status === 'completed').length;
  console.log(`\nDone. ${written} patient record(s) written.`);
  console.log(`  vaccinations/       ${written} docs`);
  console.log(`  authorizedPatients/ ${written} docs`);
  console.log(`  status: ${completed} completed, ${written - completed} ongoing`);
  console.log(`  incidents/          ${pinned} simulated pins`);
  console.log(`\nAll seeded docs carry isSeedData: true.`);
  console.log(`Remove them later with: node --env-file=.env scripts/sample-patients.js remove`);
}

main().catch(err => {
  console.error('seed-patients failed:', err);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/sample-patients.js remove — delete every isSeedData document
// (the original script, unchanged, runs inside removeSamplePatientsCommand)
// ══════════════════════════════════════════════════════════════════════════
async function removeSamplePatientsCommand() {
// Deletes every document written by scripts/sample-patients.js seed — that is,
// every doc in the seeded collections where isSeedData == true. Real patient
// records never carry that field, so they are untouched.
//
// Usage:
//   node --env-file=.env scripts/sample-patients.js remove --dry-run   # count only
//   node --env-file=.env scripts/sample-patients.js remove --yes       # delete
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID (see
// .env.example) — the same env vars scripts/admin-tools.mjs create-manager uses.

const COLLECTIONS = ['vaccinations', 'authorizedPatients', 'incidents'];
const BATCH_LIMIT = 400; // Firestore hard cap is 500 writes per batch.
const PAGE_SIZE = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/sample-patients.js remove');
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
    console.error('  node --env-file=.env scripts/sample-patients.js remove --dry-run');
    console.error('Then confirm the deletion:');
    console.error('  node --env-file=.env scripts/sample-patients.js remove --yes');
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
}

// ══════════════════════════════════════════════════════════════════════════
// Command dispatch: the first argument picks the command; it is removed
// from process.argv so each command sees exactly the arguments it always did.
// ══════════════════════════════════════════════════════════════════════════
const COMMANDS = {
  'seed': seedSamplePatientsCommand,
  'remove': removeSamplePatientsCommand,
};

async function runCommand() {
  const command = process.argv[2];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.error('Usage: node --env-file=.env scripts/sample-patients.js <seed|remove> [options]');
    process.exit(1);
  }
  process.argv.splice(2, 1);
  await COMMANDS[command]();
}

await runCommand();
