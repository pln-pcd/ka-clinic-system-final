// Add the five fictional overdue records requested on 2026-10-28.
// Default is a read-only preview. --apply creates only this batch, atomically,
// including matching authorizedPatients rows and the normal MRN counter.
// Re-running --apply returns the existing batch instead of adding duplicates.
// Usage: node --env-file=.env scripts/add-overdue-demo-patients.mjs --project ka-clinic-system [--apply]
import assert from 'node:assert/strict';
import { mkdirSync, writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildDoses, buildInitialDoses } from '../ka-clinic-admin/src/lib/doseSchedules.js';
import { addDaysToDateString, getTodayDateString } from '../ka-clinic-admin/src/lib/formatters.js';

const args = process.argv.slice(2);
const project = args[args.indexOf('--project') + 1];
assert(args.includes('--project') && project === process.env.FIREBASE_PROJECT_ID, 'Pass the explicit project matching FIREBASE_PROJECT_ID.');
assert(!process.env.FIRESTORE_EMULATOR_HOST, 'This command targets the connected web database; an emulator host must not be set.');
const account = JSON.parse(Buffer.from(process.env.FIREBASE_SERVICE_ACCOUNT_BASE64 || '', 'base64').toString('utf8'));
assert.equal(account.project_id, project, 'Service-account project must match the requested target.');
const apply = args.includes('--apply');
const batchId = 'overdue-demo-2026-10-28';
const today = getTodayDateString();
const year = Number(today.slice(0, 4));
const { db } = await import('../api/_lib/firebaseAdmin.js');
const { Timestamp } = await import('firebase-admin/firestore');

const people = [
  { name: 'Alina R. Marquez', dob: '1998-03-14', sex: 'Female', height: '158', weight: '54', bp: '118/76', barangay: 'San Juan', zone: 'Purok 1', animal: 'Dog', wound: 'Left Forearm', back: 6 },
  { name: 'Mateo L. Serrano', dob: '1991-07-22', sex: 'Male', height: '172', weight: '71', bp: '120/80', barangay: 'San Rafael', zone: 'Purok 2', animal: 'Cat', wound: 'Right Hand', back: 8 },
  { name: 'Celina P. Valdez', dob: '1984-01-09', sex: 'Female', height: '162', weight: '62', bp: '116/78', barangay: 'San Antonio', zone: 'Purok 3', animal: 'Dog', wound: 'Right Leg', back: 10 },
  { name: 'Rafael M. Cortez', dob: '2002-05-30', sex: 'Male', height: '175', weight: '73', bp: '122/80', barangay: 'San Isidro', zone: 'Purok 4', animal: 'Cat', wound: 'Left Hand', back: 12 },
  { name: 'Isabel T. Navarro', dob: '1975-09-18', sex: 'Female', height: '156', weight: '59', bp: '120/78', barangay: 'San Roque', zone: 'Purok 5', animal: 'Dog', wound: 'Right Forearm', back: 14 },
];

function buildRecord(person, index, mrn) {
  const date = addDaysToDateString(today, -person.back);
  const age = year - Number(person.dob.slice(0, 4)) - (today.slice(5) < person.dob.slice(5) ? 1 : 0);
  const brand = 'Speeda (PVRV Rabies Vaccine)';
  const doses = buildInitialDoses('PEP', { day0: date }).map((d, i) => ({
    ...d, status: i === 0 ? 'done' : 'pending', s: i === 0 ? 'done' : 'pending',
    done: i === 0, statusText: i === 0 ? 'Given' : 'Scheduled',
    brand: i === 0 ? brand : '', stockItemId: '', stockDeducted: false,
    note: i === 0 ? 'Fictional historical dose for dashboard demonstration; no inventory consumed.' : 'Fictional demo follow-up.',
    ...(i === 0 ? { givenAt: Date.parse(`${date}T09:00:00+08:00`), givenBy: 'demo-data', givenByName: 'Demo Clinic Staff' } : {}),
  }));
  const mark = { isSeedData: true, isDemo: true, sampleBatch: batchId, demoPurpose: 'Five complete overdue dashboard examples' };
  const email = `overdue.demo.${index + 1}.20261028@example.com`;
  const localContact = `0900000000${index + 1}`;
  const contact = `+63${localContact.slice(1)}`;
  const vax = {
    id: mrn, mrn, name: person.name, email, contact, age: String(age), sex: person.sex, dob: person.dob,
    height: person.height, weight: person.weight, bloodPressure: person.bp,
    barangay: person.barangay, zone: person.zone,
    address: `${person.zone}, Brgy. ${person.barangay}, Libon, Albay`,
    service: 'PEP', vaccineBrand: brand, genericName: 'Purified Vero Cell Rabies Vaccine', route: 'ID',
    date, typeOfExposure: 'Scratch', placeOfExposure: 'Own residence', sourceOfExposure: 'Domestic pet',
    animal: person.animal, cat: 'II', woundWashed: 'Yes', rigGiven: 'No', vaxGiven: 'Yes',
    woundLocation: person.wound, woundDepth: 'Superficial', numberOfBites: '1', woundType: 'Abrasion',
    lastTetanus: '5–10 years ago', pastVaccines: 'Complete childhood immunization; tetanus toxoid in 2020 (fictional history).',
    allergies: 'No known allergies (fictional history).',
    notes: 'FICTIONAL DEMO PATIENT — created to demonstrate overdue follow-ups. All identity, contact, exposure and vaccination details are synthetic. The phone is a placeholder and the email is a reserved example address. Historical demo doses do not consume clinic inventory.',
    hepaVariant: '', riskFactor: '', priorHepa: '', pneumoVaccine: '', riskCondition: '', priorPneumo: '',
    status: 'overdue', dose: `1/${doses.length}`, doses, isArchived: false,
    incidentIds: [], woundImages: [], notifiedDoses: [], createdAt: Timestamp.now(), updatedAt: Timestamp.now(),
    ...mark,
  };
  const authorized = { mrn, name: vax.name, email, contact, authorized: true, registered: false, uid: null, createdAt: vax.createdAt, ...mark };
  return { mrn, vax, authorized };
}

const requiredFields = ['id', 'mrn', 'name', 'email', 'contact', 'age', 'sex', 'dob', 'height', 'weight', 'bloodPressure',
  'barangay', 'zone', 'address', 'service', 'vaccineBrand', 'genericName', 'route', 'date', 'typeOfExposure', 'placeOfExposure',
  'sourceOfExposure', 'animal', 'cat', 'woundWashed', 'rigGiven', 'vaxGiven', 'woundLocation', 'woundDepth', 'numberOfBites',
  'woundType', 'lastTetanus', 'pastVaccines', 'allergies', 'notes'];

function validate(record) {
  for (const field of requiredFields) assert(String(record[field] ?? '').trim(), `${record.mrn}: missing ${field}`);
  assert.equal(record.status, 'overdue');
  assert.equal(record.isArchived, false);
  assert.equal(record.isDemo, true);
  assert.equal(record.dose, `1/${record.doses.length}`);
  assert.equal(record.doses.filter(d => d.status === 'done').length, 1);
  assert(record.doses.every(d => d.status !== 'done' || d.date <= today), 'No future doses can be recorded as given.');
  assert(buildDoses(record).some(d => d.status === 'miss'), 'The tracker must derive an overdue dose.');
  assert(record.doses.some(d => d.status !== 'done' && d.date < today), 'At least one pending dose must be in the past.');
}

const counterRef = db.doc('settings/counters');
const summarize = r => ({ mrn: r.mrn, name: r.vax.name, status: r.vax.status, progress: r.vax.dose,
  nextOverdueDose: r.vax.doses.find(d => d.status !== 'done' && d.date < today)?.date });

try {
  const result = await db.runTransaction(async tx => {
    const [counter, allPatients, allAuthorized, existing] = await Promise.all([
      tx.get(counterRef), tx.get(db.collection('vaccinations').select('mrn')),
      tx.get(db.collection('authorizedPatients').select('mrn')),
      tx.get(db.collection('vaccinations').where('sampleBatch', '==', batchId)),
    ]);
    if (!existing.empty) {
      assert.equal(existing.size, people.length, 'An incomplete existing demo batch needs manual review.');
      const records = existing.docs.map(d => ({ mrn: d.id, vax: d.data() }));
      records.forEach(r => validate(r.vax));
      return { created: false, existing: true, records };
    }
    const current = counter.data() || {};
    const reserved = new Set([...allPatients.docs, ...allAuthorized.docs].map(d => d.id));
    const sequences = [...reserved].map(id => new RegExp(`^${year}-(\\d+)$`).exec(id)).filter(Boolean).map(m => +m[1]);
    const highest = Math.max(0, Number(current.currentYear) === year ? Number(current.lastSequence) || 0 : 0, ...sequences);
    const records = people.map((p, i) => buildRecord(p, i, `${year}-${String(highest + i + 1).padStart(3, '0')}`));
    records.forEach(r => { validate(r.vax); assert(!reserved.has(r.mrn), 'MRN collision'); });
    const existingEmails = await tx.get(db.collection('authorizedPatients').where('email', 'in', records.map(r => r.vax.email)));
    assert(existingEmails.empty, 'A demo email is already linked to another record.');
    if (apply) {
      for (const r of records) {
        tx.create(db.doc(`vaccinations/${r.mrn}`), r.vax);
        tx.create(db.doc(`authorizedPatients/${r.mrn}`), r.authorized);
      }
      tx.set(counterRef, { currentYear: year, lastSequence: highest + people.length, updatedAt: new Date().toISOString() }, { merge: true });
    }
    return { created: apply, existing: false, records, previousCounter: current,
      before: { patients: allPatients.size, authorized: allAuthorized.size } };
  });
  console.log(JSON.stringify({ project, mode: apply ? 'apply' : 'preview', batch: batchId, today,
    created: result.created, existing: result.existing, before: result.before, patients: result.records.map(summarize) }, null, 2));

  if (apply) {
    const saved = await db.collection('vaccinations').where('sampleBatch', '==', batchId).get();
    assert.equal(saved.size, 5);
    for (const doc of saved.docs) {
      validate(doc.data());
      const auth = await db.doc(`authorizedPatients/${doc.id}`).get();
      assert(auth.exists && auth.data().email === doc.data().email && auth.data().sampleBatch === batchId, 'Linked patient row must match.');
    }
    const counts = await Promise.all(['vaccinations', 'authorizedPatients'].map(async name => ({ collection: name, count: (await db.collection(name).count().get()).data().count })));
    const receipts = new URL('../backups/', import.meta.url);
    mkdirSync(receipts, { recursive: true });
    const receipt = new URL(`${batchId}-addition.json`, receipts);
    // Do not overwrite the original insertion receipt on an idempotent rerun.
    if (result.created) writeFileSync(receipt, JSON.stringify({ project, batchId, addedAt: new Date().toISOString(), ...result }, null, 2));
    console.log(JSON.stringify({ verified: true, addedBatchCount: saved.size, counts, receipt: fileURLToPath(receipt) }));
  }
} finally {
  await db.terminate();
}
