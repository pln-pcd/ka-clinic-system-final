// Adds 15 sample patients with every field the Register wizard asks for
// filled in: 6 PEP (Category III ones with RIG and Anti-Tetanus given),
// 4 Pneumonia, 3 Tetanus and 2 PrEP. MRNs are the next free 2026 numbers
// (after the counter and anything already in mrnRegistry/vaccinations), and
// the counter is moved past them. Every document is tagged isSeedData: true
// (removable with scripts/sample-patients.js remove). Emails use
// example.com, so the mailer never sends to them.
//
//   node --env-file=.env scripts/seed-more-patients.mjs [--dry-run]
import { Timestamp } from 'firebase-admin/firestore';
import { buildInitialDoses } from '../ka-clinic-admin/src/lib/doseSchedules.js';
import { addDaysToDateString, getTodayDateString } from '../ka-clinic-admin/src/lib/formatters.js';
import { LIBON_BARANGAYS, libonAddress } from '../ka-clinic-admin/src/lib/libonGeo.js';

const DRY = process.argv.includes('--dry-run');
const { db } = await import('../api/_lib/firebaseAdmin.js');

const TODAY = getTodayDateString();
const YEAR = TODAY.slice(0, 4);
const STAFF = { uid: 'NPSrGHIQs4N7ULnKMhx9AzWeTZA2', name: 'Paulina Dela Cruz' };
const MARK = { isSeedData: true, sampleBatch: 'more-2026-10' };
const ms = (d, t = '09:00') => Date.parse(`${d}T${t}:00+08:00`);
const ago = n => addDaysToDateString(TODAY, -n);

const VACCINE = {
  PEP: { brand: 'Speeda', generic: 'Purified Vero Cell Rabies Vaccine' },
  PrEP: { brand: 'Speeda', generic: 'Purified Vero Cell Rabies Vaccine' },
  Tetanus: { brand: 'Tetanus Toxoid', generic: 'Tetanus Toxoid (Adsorbed)' },
  PCV20: { brand: 'Prevnar 20', generic: 'Pneumococcal 20-valent Conjugate Vaccine' },
  PPSV23: { brand: 'Pneumovax 23', generic: 'Pneumococcal Polysaccharide Vaccine, 23-valent' },
};

const PATIENTS = [
  // PEP
  { name: 'Mark Anthony D. Rosales', sex: 'Male', dob: '1994-05-11', barangay: 'San Isidro', zone: 'Purok 2', service: 'PEP', day0: ago(2),
    cat: 'III', animal: 'Dog', typeOfExposure: 'Bite', source: 'Stray animal', place: 'Street / Roadside', wound: 'Right Leg', depth: 'Deep / Penetrating', bites: '2',
    pastVaccines: 'None', allergies: 'None', notes: 'Unprovoked bite while walking home. Dog not located for observation.', vitals: ['168', '70', '120/80'] },
  { name: 'Shiela Mae V. Navarro', sex: 'Female', dob: '2003-08-27', barangay: 'Pantao', zone: 'Purok 4', service: 'PEP', day0: ago(5),
    cat: 'II', animal: 'Cat', typeOfExposure: 'Scratch', source: 'Owned pet', place: 'Own residence', wound: 'Left Arm', depth: 'Superficial', bites: '1',
    pastVaccines: 'None', allergies: 'None', notes: 'Scratched by own cat during feeding. Cat vaccinated last year.', vitals: ['155', '48', '110/70'] },
  { name: 'Romeo B. Aguilar', sex: 'Male', dob: '1961-02-03', barangay: 'Rawis', zone: 'Purok 1', service: 'PEP', day0: ago(9),
    cat: 'III', animal: 'Dog', typeOfExposure: 'Bite', source: "Neighbor's pet", place: "Neighbor's residence", wound: 'Left Hand', depth: 'Deep / Penetrating', bites: '1',
    pastVaccines: 'Completed PEP (over 3 years ago)', allergies: 'None', notes: 'Hypertensive, on maintenance amlodipine. Dog under 14-day observation.', vitals: ['165', '74', '140/90'] },
  { name: 'Jasmine T. Ocampo', sex: 'Female', dob: '2014-12-19', barangay: 'Linao', zone: 'Purok 3', service: 'PEP', day0: ago(40),
    cat: 'II', animal: 'Dog', typeOfExposure: 'Bite', source: 'Owned pet', place: 'Own residence', wound: 'Right Leg', depth: 'Superficial', bites: '1',
    pastVaccines: 'None', allergies: 'Others', allergiesOther: 'Amoxicillin (rash)', notes: 'Minor accompanied by mother. Puppy is healthy after observation.', vitals: ['138', '32', '100/60'] },
  { name: 'Alvin P. Soriano', sex: 'Male', dob: '1988-07-08', barangay: 'Nogpo', zone: 'Purok 5', service: 'PEP', day0: TODAY,
    cat: 'II', animal: 'Cat', typeOfExposure: 'Bite', source: 'Stray animal', place: 'Workplace', wound: 'Right Hand', depth: 'Superficial', bites: '1',
    pastVaccines: 'None', allergies: 'None', notes: 'Bitten by stray cat at the warehouse. Wound washed with soap for 15 minutes.', vitals: ['172', '78', '118/76'] },
  { name: 'Cecilia R. Manalo', sex: 'Female', dob: '1979-10-30', barangay: 'Santa Cruz', zone: 'Purok 2', service: 'PEP', day0: ago(12),
    cat: 'III', animal: 'Dog', typeOfExposure: 'Bite', source: 'Stray animal', place: 'Farm', wound: 'Left Leg', depth: 'Deep / Penetrating', bites: '3',
    pastVaccines: 'Tetanus Toxoid only', allergies: 'None', notes: 'Multiple bites on the calf. Dog killed by neighbors; head not submitted.', vitals: ['158', '60', '130/80'] },
  // Pneumonia
  { name: 'Leonardo G. Pascual', sex: 'Male', dob: '1953-04-22', barangay: 'San Vicente', zone: 'Purok 1', service: 'Pneumonia', day0: ago(3), pneumo: 'PCV20',
    pneumoHistory: 'None', riskCondition: 'Age ≥ 65', allergies: 'None', notes: 'Senior citizen. Advised by family physician to get pneumococcal vaccine.', vitals: ['163', '62', '130/85'] },
  { name: 'Teresita M. Domingo', sex: 'Female', dob: '1958-09-15', barangay: 'Burabod', zone: 'Purok 3', service: 'Pneumonia', day0: ago(16), pneumo: 'PPSV23',
    pneumoHistory: 'PCV13', riskCondition: 'Diabetes', allergies: 'None', notes: 'Type 2 diabetic on metformin. Received PCV13 in 2021.', vitals: ['150', '58', '128/82'] },
  { name: 'Ernesto C. Villareal', sex: 'Male', dob: '1970-01-09', barangay: 'Harigue', zone: 'Purok 2', service: 'Pneumonia', day0: ago(1), pneumo: 'PCV20',
    pneumoHistory: 'None', riskCondition: 'Asthma / COPD', allergies: 'Others', allergiesOther: 'Seafood (shrimp)', notes: 'COPD, former smoker (quit 2019). Uses salbutamol inhaler as needed.', vitals: ['170', '66', '124/80'] },
  { name: 'Natividad L. Robles', sex: 'Female', dob: '1949-06-02', barangay: 'Molosbolos', zone: 'Purok 4', service: 'Pneumonia', day0: TODAY, pneumo: 'PCV20',
    pneumoHistory: 'PPSV23', riskCondition: 'Heart disease', allergies: 'None', notes: 'History of heart failure, on furosemide. Last PPSV23 in 2019.', vitals: ['148', '52', '135/85'] },
  // Tetanus
  { name: 'Dennis A. Fajardo', sex: 'Male', dob: '1991-03-25', barangay: 'Caguscos', zone: 'Purok 1', service: 'Tetanus', day0: ago(45),
    pastVaccines: 'None', allergies: 'None', woundType: 'Puncture', lastTetanus: 'More than 10 years ago', notes: 'Stepped on a rusty nail at a construction site.', vitals: ['175', '80', '120/80'] },
  { name: 'Gloria S. Mercado', sex: 'Female', dob: '1984-11-11', barangay: 'Bulusan', zone: 'Purok 5', service: 'Tetanus', day0: ago(6),
    pastVaccines: 'None', allergies: 'None', woundType: 'Laceration', lastTetanus: 'Unknown', notes: 'Cut on the left palm from a kitchen knife. Wound sutured at RHU.', vitals: ['157', '55', '115/75'] },
  { name: 'Rogelio F. Cruz', sex: 'Male', dob: '1966-08-19', barangay: 'Tambo', zone: 'Purok 3', service: 'Tetanus', day0: ago(20),
    pastVaccines: 'Tetanus Toxoid only', allergies: 'None', woundType: 'Abrasion', lastTetanus: '5–10 years ago', notes: 'Abrasions on both knees from a motorcycle fall.', vitals: ['166', '72', '130/80'] },
  // PrEP
  { name: 'Patricia Anne G. Lim', sex: 'Female', dob: '1999-02-14', barangay: 'San Agustin', zone: 'Purok 2', service: 'PrEP', day0: ago(4),
    pastVaccines: 'None', allergies: 'None', notes: 'Veterinary assistant at an animal clinic. Employer requires PrEP.', vitals: ['160', '52', '110/70'] },
  { name: 'Joshua M. Belmonte', sex: 'Male', dob: '2006-05-05', barangay: 'Talin-talin', zone: 'Purok 1', service: 'PrEP', day0: ago(21),
    pastVaccines: 'None', allergies: 'None', notes: 'Agriculture student handling farm animals during practicum.', vitals: ['171', '63', '118/72'] },
];

for (const p of PATIENTS) {
  if (!LIBON_BARANGAYS.includes(p.barangay)) throw new Error(`${p.name}: ${p.barangay} is not in LIBON_BARANGAYS`);
}

function ageOn(dob, on) {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

// RIG and Anti-Tetanus as recordTreatmentChange (lib/inventoryStock.js)
// saves them, without a stock deduction.
function treatment(kind, product, date) {
  return {
    id: `${ms(date, '09:30')}_seed${kind === 'rig' ? 'r' : 't'}`, kind, product, stockItemId: '', itemName: '', vials: 1, date,
    stockDeducted: false, recordedAt: ms(date, '09:30'), recordedBy: STAFF.uid, recordedByName: STAFF.name, attendingName: STAFF.name,
  };
}

function buildRecord(p, i, mrn) {
  const contact = `+63917555${String(3100 + i).padStart(4, '0')}`;
  const [first, ...rest] = p.name.split(' ');
  const email = `${first.toLowerCase()}.${rest.pop().toLowerCase()}@example.com`;
  const vaccine = VACCINE[p.pneumo || p.service];
  const isPep = p.service === 'PEP';
  const pep = v => (isPep ? v : '');

  // Doses on or before today are given (today's at 9 AM if already past).
  const doses = buildInitialDoses(p.service, { day0: p.day0 }).map(d => (d.date < TODAY
    ? { ...d, status: 'done', s: 'done', statusText: 'Completed', done: true, brand: vaccine.brand, stockDeducted: false,
        givenAt: ms(d.date), givenBy: STAFF.uid, givenByName: STAFF.name, attendingName: STAFF.name }
    : d));
  const doneN = doses.filter(d => d.done).length;
  const completed = doneN === doses.length;
  const createdAt = Timestamp.fromMillis(ms(p.day0, '08:30'));

  const treatments = isPep && p.cat === 'III'
    ? [treatment('rig', 'Equine Rabies Immunoglobulin (ERIG)', p.day0), treatment('antiTetanus', 'Tetanus Toxoid', p.day0)]
    : [];
  const [height, weight, bloodPressure] = p.vitals;

  const vax = {
    ...MARK,
    id: mrn, mrn, name: p.name, sex: p.sex, dob: p.dob, age: String(ageOn(p.dob, p.day0)),
    contact, email, height, weight, bloodPressure,
    barangay: p.barangay, zone: p.zone, address: libonAddress(p.barangay, p.zone),
    date: p.day0, service: p.service, vaccineBrand: vaccine.brand, genericName: vaccine.generic,
    cat: pep(p.cat), animal: pep(p.animal), typeOfExposure: pep(p.typeOfExposure), sourceOfExposure: pep(p.source),
    placeOfExposure: pep(p.place), woundLocation: pep(p.wound), woundDepth: pep(p.depth), woundWashed: pep('Yes'), numberOfBites: pep(p.bites),
    pastVaccines: p.pastVaccines || '', pastVaccinesOther: '',
    allergies: p.allergies, allergiesOther: p.allergiesOther || '',
    woundType: p.woundType || '', lastTetanus: p.lastTetanus || '',
    pneumoHistory: p.pneumoHistory || '', pneumoHistoryOther: '', riskCondition: p.riskCondition || '',
    notes: p.notes, patientNote: completed ? 'Vaccination complete. Keep this card for your records.' : 'Please come back on your next scheduled date.',
    woundImages: [], reports: [], caseHistory: [],
    treatments,
    ...(treatments.length ? { rigTreatment: treatments[0], antiTetanusTreatment: treatments[1], rigGiven: 'Yes (ERIG)' } : isPep ? { rigGiven: 'No' } : {}),
    doses, dose: `${doneN}/${doses.length}`, status: completed ? 'completed' : 'ongoing',
    completedAt: completed ? doses[doses.length - 1].date : null,
    isArchived: false, archivedAt: null, archivedReason: null,
    registeredBy: STAFF.uid, registeredByName: STAFF.name, registeredAt: ms(p.day0, '08:30'),
    createdAt, lastServiceStartedAt: createdAt,
  };
  const authz = { ...MARK, mrn, name: p.name, contact, email, authorized: true, registered: false, createdAt };
  const reg = { ...MARK, mrn, issuedAt: createdAt, issuedBy: STAFF.uid };
  return { vax, authz, reg };
}

// Next free MRNs: past the counter and past every number already used.
const counterRef = db.doc('settings/counters');
const counter = (await counterRef.get()).data() || {};
const seqOf = id => (id.startsWith(`${YEAR}-`) ? Number(id.slice(5)) || 0 : 0);
const used = [
  ...(await db.collection('mrnRegistry').listDocuments()),
  ...(await db.collection('vaccinations').listDocuments()),
].map(r => seqOf(r.id));
let seq = Math.max(Number(counter.currentYear) === Number(YEAR) ? counter.lastSequence || 0 : 0, ...used, 0);

const batch = db.batch();
for (const [i, p] of PATIENTS.entries()) {
  const mrn = `${YEAR}-${String(++seq).padStart(3, '0')}`;
  const { vax, authz, reg } = buildRecord(p, i, mrn);
  console.log(`${mrn}  ${p.name.padEnd(26)} ${p.service.padEnd(9)} ${vax.status.padEnd(9)} ${vax.dose}  ${p.barangay}`);
  batch.set(db.collection('vaccinations').doc(mrn), vax);
  batch.set(db.collection('authorizedPatients').doc(mrn), authz);
  batch.set(db.collection('mrnRegistry').doc(mrn), reg);
}
batch.set(counterRef, { currentYear: Number(YEAR), lastSequence: seq }, { merge: true });

if (DRY) console.log(`dry run: nothing written (counter would be ${seq})`);
else { await batch.commit(); console.log(`written, counter now ${seq}`); }
process.exit(0);
