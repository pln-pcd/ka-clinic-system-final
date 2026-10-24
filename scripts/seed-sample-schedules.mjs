// Adds sample weekend appointments for the patients from
// scripts/seed-extra-patients.mjs, plus a walk-in. Every document is tagged
// isSeedData: true (removable with scripts/sample-patients.js remove).
//
//   node --env-file=.env scripts/seed-sample-schedules.mjs [--dry-run]
import { addDaysToDateString, getTodayDateString } from '../ka-clinic-admin/src/lib/formatters.js';
import { isWeekendDate } from '../ka-clinic-admin/src/lib/clinicDays.js';

const DRY = process.argv.includes('--dry-run');
const { db } = await import('../api/_lib/firebaseAdmin.js');

const TODAY = getTodayDateString();
const MARK = { isSeedData: true, sampleBatch: 'schedules-2026-10' };
const ms = (d, t = '09:30') => Date.parse(`${d}T${t}:00+08:00`);

// The next n weekend days after today (today excluded).
const weekends = [];
for (let d = addDaysToDateString(TODAY, 1); weekends.length < 4; d = addDaysToDateString(d, 1)) {
  if (isWeekendDate(d)) weekends.push(d);
}
const [w1, w2, w3, w4] = weekends;

const PLAN = [
  { mrn: '2026-002', date: w1, time: '9:00 AM - 10:00 AM', status: 'confirmed', source: 'app' },
  { mrn: '2026-004', date: w1, time: '10:00 AM - 11:00 AM', status: 'pending', source: 'app' },
  { mrn: '2026-005', date: w1, time: '1:00 PM - 2:00 PM', status: 'pending', source: 'online', notes: 'Missed my Day 7 dose, coming in to catch up.' },
  { walkIn: 'Walk-in: Mario Santos', date: w1, time: '3:00 PM - 4:00 PM', status: 'confirmed', source: 'walk-in', type: 'General Consultation' },
  { mrn: '2026-003', date: w2, time: '8:00 AM - 9:00 AM', status: 'confirmed', source: 'online' },
  { mrn: '2026-006', date: w2, time: '11:00 AM - 12:00 PM', status: 'pending', source: 'app', type: 'General Consultation', notes: 'Follow-up check after completing doses.' },
  { mrn: '2026-002', date: w3, time: '2:00 PM - 3:00 PM', status: 'pending', source: 'app' },
  { mrn: '2026-004', date: w4, time: '9:00 AM - 10:00 AM', status: 'confirmed', source: 'online' },
];

const slotId = (date, time) => `${date}_${String(time).replace(/[\s:]/g, '')}`;
const batch = db.batch();
for (const [k, a] of PLAN.entries()) {
  if (!isWeekendDate(a.date)) throw new Error(`not a weekend: ${a.date}`);
  const slotRef = db.collection('appointmentSlots').doc(slotId(a.date, a.time));
  if ((await slotRef.get()).exists) throw new Error(`slot already taken: ${a.date} ${a.time}, nothing written`);

  const createdAt = ms(addDaysToDateString(TODAY, -2)) + k;
  const data = {
    date: a.date, time: a.time, status: a.status, source: a.source,
    notes: a.notes || '', note: '', createdAt, ...MARK,
  };
  if (a.walkIn) {
    Object.assign(data, { name: a.walkIn, contactNumber: '+639005519900', type: a.type });
  } else {
    const p = (await db.collection('vaccinations').doc(a.mrn).get()).data();
    if (!p) throw new Error(`patient ${a.mrn} not found, nothing written`);
    Object.assign(data, {
      name: p.name, contactNumber: p.contact, email: p.email, age: p.age, gender: p.sex, address: p.address,
      type: a.type || 'PEP', patientId: a.mrn, userId: `${a.mrn}-no-app`, patientUid: `${a.mrn}-no-app`,
    });
  }
  console.log(`${a.date}  ${a.time.padEnd(20)} ${a.status.padEnd(9)} ${data.name}`);
  batch.set(db.collection('appointments').doc(`sample-apt-${String(k + 1).padStart(2, '0')}`), data);
  batch.set(slotRef, { date: a.date, time: a.time, heldBy: data.patientUid || 'clinic', createdAt, ...MARK });
}

if (DRY) console.log('dry run: nothing written');
else { await batch.commit(); console.log('written'); }
process.exit(0);
