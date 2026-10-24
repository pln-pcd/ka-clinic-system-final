// Adds 5 active and 3 archived sample patients to the live project.
// Every document is tagged isSeedData: true (removable with
// scripts/sample-patients.js remove). Emails use example.com, so the mailer
// never sends to them.
//
//   node --env-file=.env scripts/seed-extra-patients.mjs [--dry-run]
import { Timestamp } from 'firebase-admin/firestore';
import { buildInitialDoses } from '../ka-clinic-admin/src/lib/doseSchedules.js';
import { addDaysToDateString, getTodayDateString } from '../ka-clinic-admin/src/lib/formatters.js';

const DRY = process.argv.includes('--dry-run');
const { db } = await import('../api/_lib/firebaseAdmin.js');

const TODAY = getTodayDateString();
const STAFF = { uid: 'NPSrGHIQs4N7ULnKMhx9AzWeTZA2', name: 'Paulina Dela Cruz' };
const MARK = { isSeedData: true, sampleBatch: 'extra-2026-10' };
const ms = (d, t = '09:00') => Date.parse(`${d}T${t}:00+08:00`);

const PATIENTS = [
  // Active
  { mrn: '2026-002', name: 'Maria L. Santos', sex: 'Female', dob: '1990-03-14', barangay: 'Bonbon', zone: 'Zone 1', animal: 'Dog', source: 'Owned pet', place: 'Own residence', wound: 'Right Leg', depth: 'Superficial', cat: 'II', day0: addDaysToDateString(TODAY, -4) },
  { mrn: '2026-003', name: 'Jose R. Bautista', sex: 'Male', dob: '1985-11-02', barangay: 'Centro Poblacion', zone: 'Zone 4', animal: 'Cat', source: 'Stray animal', place: 'Public market', wound: 'Left Hand', depth: 'Deep / Penetrating', cat: 'III', day0: addDaysToDateString(TODAY, -7) },
  { mrn: '2026-004', name: 'Angelica P. Reyes', sex: 'Female', dob: '2008-06-21', barangay: 'San Isidro', zone: 'Zone 3', animal: 'Dog', source: 'Neighbor\'s pet', place: 'Neighbor\'s residence', wound: 'Left Leg', depth: 'Superficial', cat: 'II', day0: addDaysToDateString(TODAY, -1) },
  { mrn: '2026-005', name: 'Ramon C. Villanueva', sex: 'Male', dob: '1972-01-30', barangay: 'Pantao', zone: 'Zone 2', animal: 'Dog', source: 'Stray animal', place: 'Roadside', wound: 'Right Hand', depth: 'Deep / Penetrating', cat: 'III', day0: addDaysToDateString(TODAY, -10), skipFrom: 'd3' },
  { mrn: '2026-006', name: 'Kristine M. Garcia', sex: 'Female', dob: '1996-09-09', barangay: 'Macabugos', zone: 'Zone 5', animal: 'Cat', source: 'Owned pet', place: 'Own residence', wound: 'Right Arm', depth: 'Superficial', cat: 'II', day0: addDaysToDateString(TODAY, -35) },
  // Archived (completed over a year ago, auto-archived 365 days later)
  { mrn: '2025-041', name: 'Eduardo S. Mendoza', sex: 'Male', dob: '1968-04-17', barangay: 'Tinampo', zone: 'Zone 1', animal: 'Dog', source: 'Stray animal', place: 'Farm', wound: 'Left Leg', depth: 'Deep / Penetrating', cat: 'III', day0: '2025-06-09', archived: true },
  { mrn: '2025-057', name: 'Liza B. Fernandez', sex: 'Female', dob: '1993-12-05', barangay: 'Rizal', zone: 'Zone 3', animal: 'Cat', source: 'Owned pet', place: 'Own residence', wound: 'Right Hand', depth: 'Superficial', cat: 'II', day0: '2025-07-21', archived: true },
  { mrn: '2025-063', name: 'Pedro A. Castillo', sex: 'Male', dob: '2001-02-28', barangay: 'Buga', zone: 'Zone 2', animal: 'Dog', source: 'Neighbor\'s pet', place: 'School', wound: 'Left Arm', depth: 'Superficial', cat: 'II', day0: '2025-08-18', archived: true },
];

function ageOn(dob, on) {
  const [y, m, d] = dob.split('-').map(Number);
  const [ty, tm, td] = on.split('-').map(Number);
  return ty - y - (tm < m || (tm === m && td < d) ? 1 : 0);
}

function buildRecord(p, i) {
  const contact = `+63900555${String(2100 + i).padStart(4, '0')}`;
  const email = `${p.name.split(' ')[0].toLowerCase()}.${p.name.split(' ').pop().toLowerCase()}@example.com`;
  let skipping = false;
  const doses = buildInitialDoses('PEP', { day0: p.day0 }).map(d => {
    if (p.skipFrom === d.key) skipping = true;
    const given = d.date <= TODAY && !skipping;
    return given
      ? { ...d, status: 'done', s: 'done', statusText: 'Completed', done: true, brand: 'Speeda', stockDeducted: false,
          givenAt: ms(d.date), givenBy: STAFF.uid, givenByName: STAFF.name, attendingName: STAFF.name }
      : d;
  });
  const doneN = doses.filter(d => d.done).length;
  const completed = doneN === doses.length;
  const completedAt = completed ? doses[doses.length - 1].date : null;
  const createdAt = Timestamp.fromMillis(ms(p.day0, '08:30'));
  const archive = p.archived
    ? { isArchived: true, status: 'completed', archivedBy: 'auto-365', archivedReason: null,
        archivedAt: Timestamp.fromDate(new Date(`${addDaysToDateString(completedAt, 365)}T00:30:00+08:00`)) }
    : { isArchived: false, status: completed ? 'completed' : 'ongoing', archivedReason: null, archivedAt: null };

  const vax = {
    ...MARK, ...archive,
    id: p.mrn, mrn: p.mrn, name: p.name, sex: p.sex, dob: p.dob, age: String(ageOn(p.dob, p.day0)),
    contact, email, barangay: p.barangay, zone: p.zone, address: `${p.zone}, Brgy. ${p.barangay}, Libon, Albay`,
    date: p.day0, service: 'PEP', cat: p.cat, animal: p.animal, typeOfExposure: 'Bite', sourceOfExposure: p.source,
    placeOfExposure: p.place, woundLocation: p.wound, woundDepth: p.depth, woundWashed: 'Yes', numberOfBites: '1',
    woundType: '', woundImages: [], height: '', weight: '', bloodPressure: '', allergies: 'None', allergiesOther: '',
    pastVaccines: 'None', pastVaccinesOther: '', pneumoHistory: '', pneumoHistoryOther: '', lastTetanus: '',
    riskCondition: '', genericName: '', vaccineBrand: 'Speeda', notes: '', patientNote: '', reports: [], caseHistory: [],
    rigGiven: p.cat === 'III' ? 'Yes' : 'No',
    doses, dose: `${doneN}/${doses.length}`, completedAt,
    registeredBy: STAFF.uid, registeredByName: STAFF.name, registeredAt: ms(p.day0, '08:30'),
    createdAt, lastServiceStartedAt: createdAt,
  };
  const authz = { ...MARK, mrn: p.mrn, name: p.name, contact, email, authorized: true, registered: false, createdAt };
  const reg = { ...MARK, mrn: p.mrn, issuedAt: createdAt, issuedBy: STAFF.uid };
  return { vax, authz, reg };
}

const batch = db.batch();
for (const [i, p] of PATIENTS.entries()) {
  for (const col of ['vaccinations', 'authorizedPatients', 'mrnRegistry']) {
    if ((await db.collection(col).doc(p.mrn).get()).exists) throw new Error(`${col}/${p.mrn} already exists, nothing written`);
  }
  const { vax, authz, reg } = buildRecord(p, i);
  console.log(`${p.mrn}  ${p.name.padEnd(22)} ${vax.status.padEnd(9)} ${vax.dose}  archived=${vax.isArchived}${vax.archivedAt ? ' at ' + vax.archivedAt.toDate().toISOString().slice(0, 10) : ''}`);
  batch.set(db.collection('vaccinations').doc(p.mrn), vax);
  batch.set(db.collection('authorizedPatients').doc(p.mrn), authz);
  batch.set(db.collection('mrnRegistry').doc(p.mrn), reg);
}
// Keep the MRN counter ahead of the new 2026 numbers.
const counter = (await db.doc('settings/counters').get()).data() || {};
if (counter.currentYear === 2026 && (counter.lastSequence || 0) < 6) batch.set(db.doc('settings/counters'), { lastSequence: 6 }, { merge: true });

if (DRY) console.log('dry run: nothing written');
else { await batch.commit(); console.log('written'); }
process.exit(0);
