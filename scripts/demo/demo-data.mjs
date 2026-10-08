// Demo data for the local Firebase Emulator: shared target checks plus the
// seed and clear commands.
//
//   npm run seed:demo          -> node scripts/demo/demo-data.mjs seed --emulator --project demo-ka-clinic
//   npm run seed:demo:clear    -> node scripts/demo/demo-data.mjs clear --emulator --project demo-ka-clinic
//
// The archive-clock test (test-archive-clock.mjs) imports the shared helpers
// from this file.
import { fileURLToPath } from 'node:url';
import { resolve as resolvePath } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getAuth } from 'firebase-admin/auth';
import { getFirestore, Timestamp, FieldPath } from 'firebase-admin/firestore';
import { buildInitialDoses } from '../../ka-clinic-admin/src/lib/doseSchedules.js';
import { addDaysToDateString, getTodayDateString } from '../../ka-clinic-admin/src/lib/formatters.js';
import { geocodeLibonAddress } from '../../ka-clinic-admin/src/lib/libonGeo.js';
import { buildSimulatedIncidents } from '../../ka-clinic-admin/src/lib/simulatedIncidents.js';
import { getArchiveDueDate, getCompletionDate } from '../../api/_lib/patientCompletion.js';

// ══════════════════════════════════════════════════════════════════════════
// Shared setup: target selection, batching, confirmation
// ══════════════════════════════════════════════════════════════════════════
// Shared setup for the demo scripts (seed, clear, archive-clock test).
//
// Target selection is always explicit and checked before anything is read
// or written:
//   --emulator --project demo-ka-clinic   Local Firebase Emulator. The project
//                                          id must start with "demo-", the
//                                          emulator-only prefix, so it can never
//                                          resolve to a real project.
//   --project <id>                         A real Firebase project, using the
//                                          service account in
//                                          FIREBASE_SERVICE_ACCOUNT_BASE64. The
//                                          account's project must equal <id>.
// The live clinic project is refused unless --allow-production is also given.

export const PRODUCTION_PROJECTS = ['ka-clinic-system'];
export const DEMO_BATCH = 'demo-v1';
export const DEMO_UID_PREFIX = 'demo-';
export const DEMO_MARK = { isDemo: true, demoBatch: DEMO_BATCH };

export function parseArgs(argv = process.argv.slice(2)) {
  const args = { flags: new Set() };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i];
    if (a === '--project') args.project = argv[++i];
    else if (a.startsWith('--project=')) args.project = a.slice('--project='.length);
    else if (a.startsWith('--')) args.flags.add(a.slice(2));
  }
  return args;
}

export function connect(args) {
  const project = (args.project || '').trim();
  if (!project) {
    throw new Error('No target project. Pass --project <id> (and --emulator for the local emulator).');
  }
  const emulator = args.flags.has('emulator');

  if (emulator) {
    if (!project.startsWith('demo-')) {
      throw new Error(`Emulator runs must use a "demo-" project id (got "${project}").`);
    }
    process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
    process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
    process.env.FIREBASE_EMULATOR_PROJECT_ID = project;
    if (!getApps().length) initializeApp({ projectId: project });
  } else {
    if (process.env.FIRESTORE_EMULATOR_HOST) {
      throw new Error('FIRESTORE_EMULATOR_HOST is set but --emulator was not passed. Refusing to guess the target.');
    }
    if (PRODUCTION_PROJECTS.includes(project) && !args.flags.has('allow-production')) {
      throw new Error(`"${project}" is the live clinic project. Refusing to run. Use the emulator, or add --allow-production if you really mean it.`);
    }
    const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
    if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set (run with node --env-file=.env).');
    const sa = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
    if (sa.project_id !== project) {
      throw new Error(`The service account belongs to "${sa.project_id}", not "${project}". Refusing to run.`);
    }
    if (!getApps().length) initializeApp({ credential: cert(sa), projectId: project });
  }

  return {
    project,
    emulator,
    db: getFirestore(),
    auth: getAuth(),
    label: emulator ? `emulator project "${project}"` : `Firebase project "${project}"`,
  };
}

export async function confirmPrompt(question) {
  const { createInterface } = await import('node:readline/promises');
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const answer = await rl.question(question);
  rl.close();
  return answer.trim();
}

export async function commitInBatches(db, ops, size = 400) {
  for (let i = 0; i < ops.length; i += size) {
    const batch = db.batch();
    ops.slice(i, i + size).forEach(op => op(batch));
    await batch.commit();
  }
}

// ══════════════════════════════════════════════════════════════════════════
// node scripts/demo/demo-data.mjs seed — write the demo data
// (the original script, unchanged, runs inside seedDemoCommand)
// ══════════════════════════════════════════════════════════════════════════
async function seedDemoCommand() {
// Demo data for testing and presenting K&A Clinic without real patient data.
//
//   npm run emulators          (terminal 1: local Firebase Emulator)
//   npm run seed:demo          (terminal 2: seeds the emulator project)
//
// Everything is written in the exact shapes the Admin Dashboard and the
// Patient App write, using the same helpers: dose schedules come from
// ka-clinic-admin/src/lib/doseSchedules.js, map coordinates from
// ka-clinic-admin/src/lib/libonGeo.js, and the archive dates are checked
// against api/_lib/patientCompletion.js (the rules the nightly sweep uses).
//
// Every document carries isDemo: true and demoBatch, every demo Auth user has
// a uid starting with "demo-", and every id is fixed, so running the seed
// again overwrites the same documents instead of adding duplicates.
// Remove it all with: npm run seed:demo:clear
//
// Dates are laid out relative to the day you run it (Asia/Manila), so the
// archived, restored and not-yet-archived groups stay correct under the
// 365-day rule whenever the seed is run. The script refuses to write if any
// record would land in the wrong group.

const T = getTodayDateString();
const day = n => addDaysToDateString(T, n);
const manilaTs = (dateStr, time = '09:00') => Timestamp.fromDate(new Date(`${dateStr}T${time}:00+08:00`));
const manilaMs = (dateStr, time = '09:00') => Date.parse(`${dateStr}T${time}:00+08:00`);

const DEMO_PASSWORD = 'DemoPass2026';
const DEMO_ADMINS = [
  { uid: 'demo-admin-manager', name: 'Demo Manager', email: 'demo.manager@example.com', role: 'manager' },
  { uid: 'demo-admin-staff', name: 'Demo Staff', email: 'demo.staff@example.com', role: 'staff' },
];
const RESTORER = { uid: 'demo-admin-manager', name: 'Demo Manager' };

/* ── Inventory: names are what doses record as `brand` ─────────────────── */
// finalStock is what should remain after every administered demo dose; the
// seed adds the doses it records on top, so the numbers always reconcile.
const INVENTORY = [
  { id: 'demo-inv-speeda',   name: 'Speeda Rabies Vaccine (PVRV)',        category: 'Vaccine', unit: 'Vials',   minStock: 10, finalStock: 42, expiry: day(420) },
  { id: 'demo-inv-rabipur',  name: 'Rabipur Rabies Vaccine (PCEC)',       category: 'Vaccine', unit: 'Vials',   minStock: 10, finalStock: 6,  expiry: day(300) },
  { id: 'demo-inv-verorab',  name: 'Verorab Rabies Vaccine (PVRV)',       category: 'Vaccine', unit: 'Vials',   minStock: 10, finalStock: 0,  expiry: day(250) },
  { id: 'demo-inv-tt',       name: 'Tetanus Toxoid (TT)',                 category: 'Vaccine', unit: 'Ampules', minStock: 10, finalStock: 35, expiry: day(380) },
  { id: 'demo-inv-prevnar',  name: 'Prevnar 20 (PCV20)',                  category: 'Vaccine', unit: 'Vials',   minStock: 8,  finalStock: 4,  expiry: day(210) },
  { id: 'demo-inv-ppsv',     name: 'Pneumovax 23 (PPSV23)',               category: 'Vaccine', unit: 'Vials',   minStock: 8,  finalStock: 0,  expiry: day(190) },
  { id: 'demo-inv-erig',     name: 'Equine Rabies Immunoglobulin (ERIG)', category: 'Vaccine', unit: 'Vials',   minStock: 5,  finalStock: 18, expiry: day(330) },
];
const BRAND = {
  speeda: INVENTORY[0].name, rabipur: INVENTORY[1].name, verorab: INVENTORY[2].name,
  tt: INVENTORY[3].name, prevnar: INVENTORY[4].name, ppsv: INVENTORY[5].name,
};

/* ── Patients ──────────────────────────────────────────────────────────── */
// group:    new | ongoing | missed | completed | archived | restored
// reg:      registration (Day 0) as an offset in days from today
// done:     number of doses given, or 'all'
// restored: for group "restored", days ago the record was restored
const P = (o) => o;
const PATIENTS = [
  // Archived: registered and completed in the first part of last year, more
  // than 365 days ago, so the nightly sweep has already archived them.
  P({ key: 'a1', first: 'Rogelio', middle: 'B.', last: 'Santander', sex: 'Male', age: 46, brgy: 'Bulusan', zone: 'Purok 2', service: 'PEP', cat: 'III', animal: 'Dog', reg: -600, done: 'all', brand: 'speeda', group: 'archived' }),
  P({ key: 'a2', first: 'Marites', middle: 'L.', last: 'Cabangon', sex: 'Female', age: 33, brgy: 'Rawis', zone: 'Purok 1', service: 'PEP', cat: 'II', animal: 'Cat', reg: -575, done: 'all', brand: 'rabipur', group: 'archived' }),
  P({ key: 'a3', first: 'Danilo', middle: 'S.', last: 'Pañares', sex: 'Male', age: 58, brgy: 'Pantao', zone: 'Sitio Proper', service: 'Tetanus', cat: '', animal: '', reg: -610, done: 'all', brand: 'tt', group: 'archived' }),
  P({ key: 'a4', first: 'Jocelyn', middle: 'R.', last: 'Dimaculangan', sex: 'Female', age: 27, brgy: 'Matacon', zone: 'Purok 4', service: 'PrEP', cat: '', animal: '', reg: -520, done: 'all', brand: 'verorab', group: 'archived' }),
  P({ key: 'a5', first: 'Teodoro', middle: 'M.', last: 'Balasbas', sex: 'Male', age: 71, brgy: 'San Isidro', zone: 'Purok 3', service: 'Pneumonia', cat: '', animal: '', reg: -480, done: 'all', brand: 'ppsv', group: 'archived' }),
  P({ key: 'a6', first: 'Rowena', middle: 'C.', last: 'Magbanua', sex: 'Female', age: 39, brgy: 'Carisac East', zone: 'Purok 5', service: 'PEP', cat: 'III', animal: 'Dog', reg: -455, done: 'all', brand: 'speeda', group: 'archived' }),
  P({ key: 'a7', first: 'Ernesto', middle: 'P.', last: 'Villareal', sex: 'Male', age: 12, brgy: 'Bonavista', zone: 'Purok 6', service: 'PEP', cat: 'II', animal: 'Dog', reg: -430, done: 'all', brand: 'rabipur', group: 'archived' }),
  P({ key: 'a8', first: 'Lourdes', middle: 'T.', last: 'Quibuyen', sex: 'Female', age: 64, brgy: 'Linao', zone: 'Purok 2', service: 'Pneumonia', cat: '', animal: '', reg: -415, done: 'all', brand: 'prevnar', group: 'archived' }),
  P({ key: 'a9', first: 'Wilfredo', middle: 'G.', last: 'Sarmiento', sex: 'Male', age: 29, brgy: 'Harigue', zone: 'Purok 1', service: 'PEP', cat: 'III', animal: 'Cat', reg: -400, done: 'all', brand: 'verorab', group: 'archived' }),

  // Restored: completed last year, archived by the sweep, then restored by
  // staff in the last few weeks. Back on the Patients list for a new year.
  P({ key: 'r1', first: 'Corazon', middle: 'D.', last: 'Lacsamana', sex: 'Female', age: 52, brgy: 'San Agustin', zone: 'Purok 3', service: 'PEP', cat: 'II', animal: 'Dog', reg: -590, done: 'all', brand: 'speeda', group: 'restored', restored: -18 }),
  P({ key: 'r2', first: 'Benjamin', middle: 'A.', last: 'Tuazon', sex: 'Male', age: 41, brgy: 'Molosbolos', zone: 'Purok 1', service: 'Tetanus', cat: '', animal: '', reg: -620, done: 'all', brand: 'tt', group: 'restored', restored: -9 }),
  P({ key: 'r3', first: 'Felisa', middle: 'N.', last: 'Arguelles', sex: 'Female', age: 35, brgy: 'Nogpo', zone: 'Purok 4', service: 'PEP', cat: 'III', animal: 'Cat', reg: -540, done: 'all', brand: 'rabipur', group: 'restored', restored: -3 }),

  // Completed late last year: still on the Patients list, not due yet.
  P({ key: 'c1', first: 'Arnel', middle: 'F.', last: 'Macaraeg', sex: 'Male', age: 24, brgy: 'Talin-talin', zone: 'Purok 2', service: 'PEP', cat: 'II', animal: 'Dog', reg: -358, done: 'all', brand: 'speeda', group: 'completed' }),
  P({ key: 'c2', first: 'Gloria', middle: 'E.', last: 'Panganiban', sex: 'Female', age: 60, brgy: 'Tambo', zone: 'Purok 1', service: 'Pneumonia', cat: '', animal: '', reg: -310, done: 'all', brand: 'prevnar', group: 'completed' }),
  P({ key: 'c3', first: 'Nestor', middle: 'J.', last: 'Ilagan', sex: 'Male', age: 37, brgy: 'Tipa-tipa', zone: 'Purok 5', service: 'PrEP', cat: '', animal: '', reg: -298, done: 'all', brand: 'rabipur', group: 'completed' }),
  // Completed this year.
  P({ key: 'c4', first: 'Herminia', middle: 'O.', last: 'Samonte', sex: 'Female', age: 44, brgy: 'Sogo', zone: 'Purok 3', service: 'Tetanus', cat: '', animal: '', reg: -330, done: 'all', brand: 'tt', group: 'completed' }),
  P({ key: 'c5', first: 'Ramil', middle: 'V.', last: 'Estrella', sex: 'Male', age: 19, brgy: 'Maroba', zone: 'Purok 2', service: 'PEP', cat: 'III', animal: 'Dog', reg: -90, done: 'all', brand: 'speeda', group: 'completed' }),
  P({ key: 'c6', first: 'Mara', middle: 'L.', last: 'Villaflor', sex: 'Female', age: 31, brgy: 'San Juan', zone: 'Zone 3', service: 'PEP', cat: 'II', animal: 'Dog', reg: -40, done: 'all', brand: 'speeda', group: 'completed', login: 'demo-patient-full', email: 'demo.patient.full@example.com' }),
  P({ key: 'c7', first: 'Joel', middle: 'K.', last: 'Mendiola', sex: 'Male', age: 55, brgy: 'Malabag', zone: 'Purok 1', service: 'Pneumonia', cat: '', animal: '', reg: -12, done: 'all', brand: 'prevnar', group: 'completed' }),
  P({ key: 'c8', first: 'Aileen', middle: 'S.', last: 'Robles', sex: 'Female', age: 26, brgy: 'Liberacion', zone: 'Purok 6', service: 'PrEP', cat: '', animal: '', reg: -20, done: 'all', brand: 'rabipur', group: 'completed' }),
  P({ key: 'c9', first: 'Crisanto', middle: 'D.', last: 'Olivar', sex: 'Male', age: 48, brgy: 'Labnig', zone: 'Purok 2', service: 'PEP', cat: 'III', animal: 'Cat', reg: -33, done: 'all', brand: 'verorab', group: 'completed' }),

  // Ongoing: doses given so far, next dose still ahead.
  P({ key: 'o1', first: 'Princess', middle: 'A.', last: 'Dumlao', sex: 'Female', age: 9, brgy: 'Cagbulos', zone: 'Purok 3', service: 'PEP', cat: 'III', animal: 'Dog', reg: -5, done: 2, brand: 'speeda', group: 'ongoing' }),
  P({ key: 'o2', first: 'Rodel', middle: 'T.', last: 'Casipit', sex: 'Male', age: 34, brgy: 'Izcala', zone: 'Purok 1', service: 'PEP', cat: 'II', animal: 'Cat', reg: -1, done: 1, brand: 'speeda', group: 'ongoing' }),
  P({ key: 'o3', first: 'Evangeline', middle: 'M.', last: 'Garces', sex: 'Female', age: 50, brgy: 'Burabod', zone: 'Purok 4', service: 'Tetanus', cat: '', animal: '', reg: -20, done: 1, brand: 'tt', group: 'ongoing' }),
  P({ key: 'o4', first: 'Isagani', middle: 'R.', last: 'Pineda', sex: 'Male', age: 23, brgy: 'Magcawayan', zone: 'Purok 2', service: 'PrEP', cat: '', animal: '', reg: -3, done: 1, brand: 'speeda', group: 'ongoing' }),
  P({ key: 'o5', first: 'Consuelo', middle: 'B.', last: 'Ferrer', sex: 'Female', age: 67, brgy: 'San Rafael', zone: 'Purok 5', service: 'PEP', cat: 'III', animal: 'Monkey', reg: -12, done: 3, brand: 'speeda', group: 'ongoing' }),
  P({ key: 'o6', first: 'Julius', middle: 'C.', last: 'Abellera', sex: 'Male', age: 15, brgy: 'Bap-bap', zone: 'Purok 1', service: 'PEP', cat: 'II', animal: 'Dog', reg: -6, done: 2, brand: 'rabipur', group: 'ongoing', emptyOptional: true }),

  // Missed: a scheduled dose date has passed without the dose being given.
  P({ key: 'm1', first: 'Lorna', middle: 'P.', last: 'Batungbakal', sex: 'Female', age: 42, brgy: 'Bambon', zone: 'Purok 2', service: 'PEP', cat: 'III', animal: 'Dog', reg: -20, done: 2, brand: 'speeda', group: 'missed' }),
  P({ key: 'm2', first: 'Antonio', middle: 'E.', last: 'Lagdameo', sex: 'Male', age: 38, brgy: 'Barbon', zone: 'Purok 3', service: 'PEP', cat: 'II', animal: 'Cat', reg: -40, done: 1, brand: 'rabipur', group: 'missed' }),
  P({ key: 'm3', first: 'Divina', middle: 'F.', last: 'Soriano', sex: 'Female', age: 57, brgy: 'Nino Jesus', zone: 'Purok 1', service: 'Tetanus', cat: '', animal: '', reg: -60, done: 1, brand: 'tt', group: 'missed' }),
  P({ key: 'm4', first: 'Reynaldo', middle: 'H.', last: 'Cuevas', sex: 'Male', age: 30, brgy: 'San Roque', zone: 'Purok 6', service: 'PEP', cat: 'III', animal: 'Dog', reg: -15, done: 1, brand: 'speeda', group: 'missed' }),

  // Newly registered: schedule set, nothing given yet.
  P({ key: 'n1', first: 'Kristine', middle: 'J.', last: 'Alcantara', sex: 'Female', age: 22, brgy: 'San Vicente', zone: 'Purok 2', service: 'PEP', cat: 'II', animal: 'Dog', reg: 0, done: 0, brand: 'speeda', group: 'new' }),
  P({ key: 'n2', first: 'Edgardo', middle: 'L.', last: 'Manalastas', sex: 'Male', age: 63, brgy: 'Santa Cruz', zone: 'Purok 3', service: 'Pneumonia', cat: '', animal: '', reg: 0, done: 0, brand: 'prevnar', group: 'new' }),
  P({ key: 'n3', first: 'Precious', middle: 'M.', last: 'Ocampo', sex: 'Female', age: 17, brgy: 'San Jose', zone: 'Purok 1', service: 'Tetanus', cat: '', animal: '', reg: 0, done: 0, brand: 'tt', group: 'new', emptyOptional: true }),
  // Patient app login with no doses recorded yet, and most optional fields
  // left empty, to test the app's empty states.
  P({ key: 'n4', first: 'Noel', middle: '', last: 'Dizon', sex: 'Male', age: 28, brgy: 'San Antonio', zone: '', service: 'PEP', cat: 'II', animal: 'Dog', reg: 0, done: 0, brand: 'speeda', group: 'new', noDoses: true, emptyOptional: true, login: 'demo-patient-new', email: 'demo.patient.new@example.com' }),
];

const DEMO_NOTES = {
  PEP: 'Wound washed at home. Advised to complete the schedule.',
  PrEP: 'Pre exposure series for animal handler work.',
  Tetanus: 'Minor laceration. Cleaned and dressed.',
  Pneumonia: 'Routine adult pneumococcal shot.',
};

function buildPatient(spec, mrn, idx) {
  const reg = day(spec.reg);
  const name = [spec.first, spec.middle, spec.last].filter(Boolean).join(' ');
  const ascii = s => s.normalize('NFD').replace(/[^\w]/g, '').toLowerCase();
  const email = spec.email || `demo.${ascii(spec.first)}.${ascii(spec.last)}@example.com`;
  const contact = spec.emptyOptional && !spec.login ? '' : `+63900555${String(100 + idx).padStart(4, '0')}`;
  const brand = BRAND[spec.brand];

  const schedule = spec.noDoses ? [] : buildInitialDoses(spec.service, { day0: reg });
  const doneN = spec.done === 'all' ? schedule.length : spec.done;
  // A record with any dose given carries the shape VaccinationTrackerPage.jsx cycleStatus
  // persists; an untouched one keeps the intake shape buildInitialDoses makes.
  const doses = doneN > 0
    ? schedule.map((d, i) => ({ key: d.key, n: d.n, date: d.date, status: i < doneN ? 'done' : 'pending', s: i < doneN ? 'done' : 'pending', brand: i < doneN ? brand : '', note: '' }))
    : schedule;
  const completed = schedule.length > 0 && doneN === schedule.length;
  const given = doses.filter(d => d.status === 'done');
  given.forEach(d => { if (d.date > T) throw new Error(`${spec.key}: dose ${d.key} given on a future date ${d.date}`); });

  const isPep = spec.service === 'PEP';
  const opt = v => (spec.emptyOptional ? '' : v);
  const vax = {
    id: mrn, mrn, name, email, contact,
    age: String(spec.age), sex: spec.sex,
    dob: '', height: opt(String(150 + (idx * 7) % 30)), weight: opt(String(45 + (idx * 5) % 35)), bloodPressure: opt('120/80'),
    barangay: spec.brgy, zone: spec.zone,
    address: `${spec.zone ? spec.zone + ', ' : ''}Brgy. ${spec.brgy}, Libon, Albay`,
    service: spec.service,
    vaccineBrand: given.length ? brand : '',
    placeOfExposure: isPep ? opt(idx % 2 ? 'Own residence' : 'Street / Roadside') : '',
    typeOfExposure: isPep ? (spec.cat === 'III' ? 'Bite' : 'Scratch') : '',
    sourceOfExposure: isPep ? opt(idx % 3 ? 'Domestic pet' : 'Stray animal') : '',
    woundWashed: 'Yes', rigGiven: isPep && spec.cat === 'III' ? 'Yes (ERIG)' : 'No', vaxGiven: given.length ? 'Yes' : 'No',
    genericName: '', route: isPep ? 'ID' : 'IM',
    animal: isPep ? spec.animal : 'Dog',
    cat: isPep ? spec.cat : '',
    date: reg,
    notes: opt(DEMO_NOTES[spec.service]),
    pastVaccines: opt('None'), allergies: opt('No known allergies'),
    woundLocation: isPep ? opt(idx % 2 ? 'Left Hand' : 'Right Leg') : '',
    woundDepth: isPep ? 'Superficial' : '', numberOfBites: isPep ? '1' : '',
    woundType: spec.service === 'Tetanus' ? 'Laceration' : '', lastTetanus: spec.service === 'Tetanus' ? 'More than 10 years ago' : '',
    hepaVariant: '', riskFactor: '', priorHepa: '',
    pneumoVaccine: spec.service === 'Pneumonia' ? (spec.brand === 'ppsv' ? 'PPSV23 (Pneumovax 23)' : 'PCV20 (Prevnar 20)') : '',
    riskCondition: spec.service === 'Pneumonia' ? 'Age ≥ 65' : '', priorPneumo: spec.service === 'Pneumonia' ? 'None' : '',
    status: completed ? 'completed' : 'ongoing',
    dose: `${doneN}/${schedule.length}`,
    doses,
    woundImages: [],
    createdAt: manilaTs(reg),
    ...DEMO_MARK,
  };
  if (completed) vax.completedAt = doses[doses.length - 1].date;

  // Archive fields exactly as the sweep and the restore action write them.
  const originalDue = completed ? getArchiveDueDate({ ...vax, restoredAt: undefined }) : '';
  if (spec.group === 'archived') {
    Object.assign(vax, { isArchived: true, archivedAt: manilaTs(originalDue, '00:30'), archivedBy: 'auto-365' });
  }
  if (spec.group === 'restored') {
    const restoredAt = day(spec.restored);
    vax.isArchived = false;
    vax.restoredAt = restoredAt;
    vax.restoredBy = RESTORER;
    vax.restoreHistory = [{ restoredAt, restoredAtMs: manilaMs(restoredAt, '10:15'), restoredBy: RESTORER, previousArchivedAt: manilaMs(originalDue, '00:30') }];
  }

  // Refuse to seed a record the real rules would put in a different place.
  const due = completed ? getArchiveDueDate(vax) : '';
  const expectArchived = spec.group === 'archived';
  const check = {
    archived: completed && originalDue <= T && getCompletionDate(vax).slice(0, 4) < T.slice(0, 4),
    restored: completed && originalDue <= day(spec.restored ?? 0) && due > T,
    completed: completed && due > T,
    ongoing: !completed && !doses.some(d => d.status !== 'done' && d.date < T),
    missed: !completed && doses.some(d => d.status !== 'done' && d.date < T),
    new: doneN === 0,
  }[spec.group];
  if (!check) throw new Error(`${spec.key} (${name}) does not fit group "${spec.group}" on ${T}. Due ${due || 'n/a'}.`);
  if (expectArchived !== Boolean(vax.isArchived)) throw new Error(`${spec.key}: archive flag mismatch`);

  return { spec, mrn, vax, email, name, contact, completed };
}

function assignMrns() {
  const seq = {};
  return PATIENTS.map(spec => {
    const year = day(spec.reg).slice(0, 4);
    seq[year] = (seq[year] || 900) + 1;
    return `${year}-${seq[year]}`;
  });
}

/* ── Appointments, conversations ───────────────────────────────────────── */
function weekend(offsetWeeks, sunday = false) {
  const d = new Date(`${T}T12:00:00Z`);
  const toSat = (6 - d.getUTCDay() + 7) % 7;
  return addDaysToDateString(T, toSat + offsetWeeks * 7 + (sunday ? 1 : 0));
}
const slotId = (date, time) => `${date}_${String(time).replace(/[\s:]/g, '')}`;

function buildAppointments(byKey) {
  const p = k => byKey[k];
  const A = [
    { id: 'demo-apt-01', who: 'n4', status: 'pending', source: 'app', date: weekend(1), time: '9:00 AM - 10:00 AM', type: 'Vaccination – Anti-Rabies (PEP)' },
    { id: 'demo-apt-02', who: 'o2', status: 'pending', source: 'online', date: weekend(0, true), time: '10:00 AM - 11:00 AM', type: 'PEP Follow-up' },
    { id: 'demo-apt-03', who: 'o1', status: 'confirmed', source: 'online', date: weekend(0), time: '8:00 AM - 9:00 AM', type: 'PEP Follow-up' },
    { id: 'demo-apt-04', who: 'o3', status: 'confirmed', source: 'online', date: weekend(1, true), time: '1:00 PM - 2:00 PM', type: 'Anti-Tetanus Vaccine' },
    { id: 'demo-apt-05', who: 'c6', status: 'done', source: 'app', date: weekend(-1), time: '9:00 AM - 10:00 AM', type: 'PEP Follow-up' },
    { id: 'demo-apt-06', who: 'c7', status: 'done', source: 'online', date: weekend(-2, true), time: '11:00 AM - 12:00 PM', type: 'Pneumococcal Vaccine' },
    { id: 'demo-apt-07', walkIn: 'Walk-in Patient Demo', status: 'confirmed', source: 'walk-in', date: weekend(0), time: '2:00 PM - 3:00 PM', type: 'Walk-in Emergency' },
    { id: 'demo-apt-08', walkIn: 'Walk-in Follow-up Demo', status: 'done', source: 'walk-in', date: weekend(-1, true), time: '10:00 AM - 11:00 AM', type: 'General Consultation' },
  ];
  return A.map(a => {
    const pt = a.who ? p(a.who) : null;
    const base = {
      name: pt ? pt.name : a.walkIn,
      contactNumber: pt ? (pt.contact || '') : '+639005550199',
      date: a.date, time: a.time, type: a.type,
      status: a.status, source: a.source,
      createdAt: manilaMs(addDaysToDateString(a.date, -5)),
      ...DEMO_MARK,
    };
    if (a.source === 'walk-in') return { id: a.id, data: { ...base, notes: '' } };
    if (a.source === 'online') return { id: a.id, data: { ...base, notes: '' } };
    return {
      id: a.id,
      data: {
        ...base,
        userId: pt.spec.login || `${pt.mrn}-no-app`, patientUid: pt.spec.login || `${pt.mrn}-no-app`, patientId: pt.mrn,
        email: pt.email, age: pt.vax.age, gender: pt.vax.sex, address: pt.vax.address, note: '',
      },
    };
  });
}

function buildThreads(byKey) {
  const T0 = manilaMs(T, '08:00');
  const H = 3600000, D = 86400000;
  const threads = [
    // Active
    { id: 'demo-thr-01', who: 'c6', status: 'pending', unread: true, resolved: false, at: T0 - 2 * H,
      msgs: [['patient', 'Hello, is it okay to have a fever after the last dose?'], ['patient', 'It is mild, about 37.8.']] },
    { id: 'demo-thr-02', who: 'o1', status: 'replied', unread: false, resolved: false, at: T0 - 20 * H,
      msgs: [['patient', 'Can my daughter come on Sunday instead of Saturday?'], ['admin', 'Yes, Sunday morning is fine. Please bring her record card.']] },
    { id: 'demo-thr-03', who: 'm1', status: 'new', unread: true, resolved: false, at: T0 - 30 * 60000,
      msgs: [['patient', 'I missed my dose last week. What should I do?']] },
    // Archived in the last 30 days (older ones are deleted automatically).
    { id: 'demo-thr-04', who: 'c5', status: 'replied', unread: false, resolved: true, archivedDaysAgo: 3, at: T0 - 5 * D,
      msgs: [['patient', 'Thank you, I finished all my doses.'], ['admin', 'Great work. Take care.']] },
    { id: 'demo-thr-05', who: 'c9', status: 'replied', unread: false, resolved: true, archivedDaysAgo: 12, at: T0 - 14 * D,
      msgs: [['patient', 'Where can I get my vaccination card?'], ['admin', 'You can view it in the app under Records.']] },
    { id: 'demo-thr-06', who: 'c1', status: 'replied', unread: false, resolved: true, archivedDaysAgo: 25, at: T0 - 27 * D,
      msgs: [['patient', 'Is the clinic open on holidays?'], ['admin', 'We are open on weekends only. Holidays may change, we will post updates.']] },
  ];
  return threads.map(t => {
    const pt = byKey[t.who];
    const lastText = t.msgs[t.msgs.length - 1][1];
    const data = {
      patientUid: pt.spec.login || `${pt.mrn}-no-app`,
      patientName: pt.name, patientMrn: pt.mrn, patientEmail: pt.email,
      status: t.status, unread: t.unread, resolved: t.resolved,
      lastMessage: lastText, lastMessageAt: t.at, createdAt: t.at - t.msgs.length * 5 * 60000,
      ...DEMO_MARK,
    };
    if (t.resolved) Object.assign(data, { closedBy: 'staff', closedAt: t.at + H });
    if (t.archivedDaysAgo) Object.assign(data, { archived: true, archivedAt: T0 - t.archivedDaysAgo * D });
    const messages = t.msgs.map(([sender, text], i) => ({
      id: `${t.id}-m${i + 1}`,
      data: {
        threadId: t.id, text, sender,
        ...(sender === 'patient' ? { senderName: pt.name } : {}),
        createdAt: data.createdAt + i * 5 * 60000,
        ...DEMO_MARK,
      },
    }));
    return { id: t.id, data, messages };
  });
}

/* ── Main ──────────────────────────────────────────────────────────────── */
async function main() {
  const args = parseArgs();
  const { db, auth, label } = connect(args);
  console.log(`Seeding demo data into ${label} (today ${T}, Asia/Manila)\n`);

  const mrns = assignMrns();
  const patients = PATIENTS.map((spec, i) => buildPatient(spec, mrns[i], i));
  const byKey = Object.fromEntries(patients.map(p => [p.spec.key, p]));

  // Incident Map pins are SIMULATED (lib/simulatedIncidents.js): random
  // coordinates, no address/barangay/patient, not linked to any record.
  const incidents = buildSimulatedIncidents({ count: 24, seed: 24, todayIso: T, extra: { ...DEMO_MARK } });

  // Inventory reconciles with the doses recorded above.
  const used = {};
  patients.forEach(p => p.vax.doses.forEach(d => { if (d.status === 'done' && d.brand) used[d.brand] = (used[d.brand] || 0) + 1; }));
  const inventory = INVENTORY.map(i => ({
    id: i.id,
    data: {
      name: i.name, category: i.category, stock: i.finalStock, minStock: i.minStock, unit: i.unit,
      expiry: i.expiry, expiryDate: i.expiry,
      status: i.finalStock <= 0 ? 'critical' : i.finalStock <= i.minStock ? 'warning' : 'in-stock',
      createdAt: manilaMs(day(-640)),
      ...DEMO_MARK,
    },
    received: i.finalStock + (used[i.name] || 0),
  }));

  const appointments = buildAppointments(byKey);
  const threads = buildThreads(byKey);

  // Auth: two demo patients and two demo admins.
  const logins = patients.filter(p => p.spec.login);
  for (const p of logins) {
    await upsertUser(auth, { uid: p.spec.login, email: p.email, password: DEMO_PASSWORD, displayName: p.name });
  }
  for (const a of DEMO_ADMINS) {
    await upsertUser(auth, { uid: a.uid, email: a.email, password: DEMO_PASSWORD, displayName: a.name });
  }

  const ops = [];
  const put = (col, id, data) => ops.push(b => b.set(db.collection(col).doc(id), data));
  patients.forEach(p => {
    put('vaccinations', p.mrn, p.vax);
    put('authorizedPatients', p.mrn, {
      mrn: p.mrn, name: p.name, email: p.email, contact: p.contact,
      authorized: true, registered: Boolean(p.spec.login), uid: p.spec.login || null,
      createdAt: p.vax.createdAt, ...DEMO_MARK,
    });
  });
  incidents.forEach(i => put('incidents', i.id, i.data));
  inventory.forEach(i => put('inventory', i.id, i.data));
  appointments.forEach(a => {
    put('appointments', a.id, a.data);
    put('appointmentSlots', slotId(a.data.date, a.data.time), { date: a.data.date, time: a.data.time, heldBy: 'demo-admin-manager', createdAt: a.data.createdAt, ...DEMO_MARK });
  });
  threads.forEach(t => {
    put('chatThreads', t.id, t.data);
    t.messages.forEach(m => put('chatMessages', m.id, m.data));
  });
  DEMO_ADMINS.forEach(a => put('admins', a.uid, {
    name: a.name, email: a.email, role: a.role, invitedBy: null, status: 'active',
    createdAt: Timestamp.now(), trustedDevices: {}, failedLoginAttempts: 0, lockedUntil: null, ...DEMO_MARK,
  }));

  await commitInBatches(db, ops);

  const count = g => patients.filter(p => p.spec.group === g).length;
  console.log('Patients');
  console.log(`  archived (Archive page only): ${count('archived')}`);
  console.log(`  restored (Patients list):     ${count('restored')}`);
  console.log(`  completed, not archived:      ${count('completed')}`);
  console.log(`  ongoing:                      ${count('ongoing')}`);
  console.log(`  missed dose:                  ${count('missed')}`);
  console.log(`  newly registered:             ${count('new')}`);
  console.log(`  total:                        ${patients.length}`);
  console.log(`Incident pins: ${incidents.length} (${incidents.filter(i => !i.data.mapHidden).length} visible on the map)`);
  console.log('Inventory (received, used by demo doses, in stock):');
  inventory.forEach(i => console.log(`  ${i.data.name.padEnd(38)} ${String(i.received).padStart(3)}  ${String(used[i.data.name] || 0).padStart(3)}  ${String(i.data.stock).padStart(3)}  ${i.data.status}`));
  console.log(`Appointments: ${appointments.length}, conversations: ${threads.length} (${threads.filter(t => t.data.archived).length} archived)`);
  console.log('\nDemo logins (password for all: ' + DEMO_PASSWORD + ')');
  logins.forEach(p => console.log(`  Patient app  MRN ${p.mrn}  ${p.name}  (${p.spec.noDoses ? 'no doses yet' : 'full dose history'})`));
  DEMO_ADMINS.forEach(a => console.log(`  Dashboard    ${a.email}  (${a.role})`));
  console.log('\nDone. Remove it all with: npm run seed:demo:clear');
}

async function upsertUser(auth, { uid, email, password, displayName }) {
  try {
    await auth.getUser(uid);
    await auth.updateUser(uid, { email, password, displayName, emailVerified: true, disabled: false });
  } catch (err) {
    if (err.code !== 'auth/user-not-found') throw err;
    await auth.createUser({ uid, email, password, displayName, emailVerified: true });
  }
}

main().catch(err => {
  console.error(`\nSeed stopped: ${err.message}`);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// node scripts/demo/demo-data.mjs clear — remove the demo data
// (the original script, unchanged, runs inside clearDemoCommand)
// ══════════════════════════════════════════════════════════════════════════
async function clearDemoCommand() {
// Removes the demo data written by the seed command, and nothing else.
//
//   npm run seed:demo:clear
//
// Deleted:
//   - every document with isDemo == true, in each collection the seed writes;
//   - chat messages belonging to demo conversations (including ones typed
//     while testing, which carry no demo marker of their own);
//   - stock audit entries (stockMovements) for demo patients' doses;
//   - sign-in and session documents keyed by a demo account's uid;
//   - Firebase Auth users whose uid starts with "demo-".
// Real records never carry isDemo and real uids never start with "demo-", so
// they are never selected. The script lists what it found and asks you to
// type DELETE before removing anything (or pass --yes for scripted runs).

const MARKED = ['vaccinations', 'authorizedPatients', 'incidents', 'inventory', 'appointments', 'appointmentSlots', 'chatThreads', 'chatMessages', 'admins'];
const PER_UID = ['patientLoginOtps', 'patientTrustedDevices', 'otps', 'patientChatState'];

async function main() {
  const args = parseArgs();
  const { db, auth, label } = connect(args);
  console.log(`Looking for demo data in ${label}\n`);

  const targets = new Map(); // path -> ref
  const add = ref => targets.set(ref.path, ref);
  const counts = {};

  for (const col of MARKED) {
    const snap = await db.collection(col).where('isDemo', '==', true).get();
    snap.docs.forEach(d => add(d.ref));
    counts[col] = snap.size;
  }

  // Messages sent during testing into demo conversations.
  const demoThreads = await db.collection('chatThreads').where('isDemo', '==', true).get();
  let extraMsgs = 0;
  for (const t of demoThreads.docs) {
    const msgs = await db.collection('chatMessages').where('threadId', '==', t.id).get();
    msgs.docs.forEach(m => { if (!targets.has(m.ref.path)) { add(m.ref); extraMsgs++; } });
  }

  // Stock audit entries written while testing doses on demo patients.
  const demoMrns = (await db.collection('vaccinations').where('isDemo', '==', true).get()).docs.map(d => d.id);
  let movements = 0;
  for (let i = 0; i < demoMrns.length; i += 30) {
    const snap = await db.collection('stockMovements').where('patientId', 'in', demoMrns.slice(i, i + 30)).get();
    snap.docs.forEach(d => { add(d.ref); movements++; });
  }

  // Demo Auth users, and documents keyed by their uid.
  const demoUsers = [];
  let pageToken;
  do {
    const page = await auth.listUsers(1000, pageToken);
    page.users.filter(u => u.uid.startsWith(DEMO_UID_PREFIX)).forEach(u => demoUsers.push(u));
    pageToken = page.pageToken;
  } while (pageToken);
  let perUid = 0;
  for (const u of demoUsers) {
    for (const col of PER_UID) {
      const ref = db.collection(col).doc(u.uid);
      if ((await ref.get()).exists) { add(ref); perUid++; }
    }
    const sessions = await db.collection('patientSessions')
      .where(FieldPath.documentId(), '>=', `${u.uid}_`)
      .where(FieldPath.documentId(), '<', `${u.uid}_`)
      .get();
    sessions.docs.forEach(d => { add(d.ref); perUid++; });
  }

  console.log('Will delete:');
  MARKED.forEach(c => console.log(`  ${c.padEnd(20)} ${counts[c]}`));
  console.log(`  ${'chatMessages (extra)'.padEnd(20)} ${extraMsgs}`);
  console.log(`  ${'stockMovements'.padEnd(20)} ${movements}`);
  console.log(`  ${'per-account docs'.padEnd(20)} ${perUid}`);
  console.log(`  ${'Auth users'.padEnd(20)} ${demoUsers.length}${demoUsers.length ? ` (${demoUsers.map(u => u.email || u.uid).join(', ')})` : ''}`);

  if (targets.size === 0 && demoUsers.length === 0) {
    console.log('\nNo demo data found. Nothing to do.');
    return;
  }

  if (!args.flags.has('yes')) {
    const answer = await confirmPrompt(`\nType DELETE to remove ${targets.size} document(s) and ${demoUsers.length} user(s) from ${label}: `);
    if (answer !== 'DELETE') {
      console.log('Cancelled. Nothing was deleted.');
      return;
    }
  }

  await commitInBatches(db, [...targets.values()].map(ref => b => b.delete(ref)));
  if (demoUsers.length) await auth.deleteUsers(demoUsers.map(u => u.uid));
  console.log(`\nDeleted ${targets.size} document(s) and ${demoUsers.length} user(s).`);
}

main().catch(err => {
  console.error(`\nClear stopped: ${err.message}`);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// Command dispatch: the first argument picks the command; it is removed
// from process.argv so each command sees exactly the arguments it always did.
// ══════════════════════════════════════════════════════════════════════════
const COMMANDS = {
  'seed': seedDemoCommand,
  'clear': clearDemoCommand,
};

async function runCommand() {
  const command = process.argv[2];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.error('Usage: node scripts/demo/demo-data.mjs <seed|clear> [options]');
    process.exit(1);
  }
  process.argv.splice(2, 1);
  await COMMANDS[command]();
}

// Other scripts import the shared helpers above; only run a command when
// this file is the one being executed.
if (process.argv[1] && fileURLToPath(import.meta.url) === resolvePath(process.argv[1])) {
  await runCommand();
}
