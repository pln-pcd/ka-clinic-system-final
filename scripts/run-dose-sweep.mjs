// Runs the daily dose-reminder sweep (api/notifications.js, action
// dose-sweep) from your machine, exactly as the Vercel cron would, without
// deploying.
//
//   npm run sweep:doses:emulator              emulator, seeds a test patient, real run (emails are only logged)
//   npm run sweep:doses:emulator -- --dry-run emulator, list who would be reminded
//   npm run sweep:doses:dry                   LIVE data, dry run: lists who WOULD be emailed, sends nothing
//   node --env-file=.env scripts/run-dose-sweep.mjs --send     LIVE data, really sends (asks nothing — be sure)
//
// Options:
//   --emulator        use the local Firebase Emulator (127.0.0.1:8080), project demo-ka-clinic
//   --seed            (emulator only) create/refresh vaccinations/sweep-test-patient with one
//                     dose due tomorrow and one due today (Manila time)
//   --dry-run         report only: nothing is written, emailed or pushed
//   --today=YYYY-MM-DD  run as if that were today's date in Manila
//
// Against live data the script refuses to run without --dry-run or --send.
const args = process.argv.slice(2);
const has = f => args.includes(f);
const opt = name => (args.find(a => a.startsWith(`--${name}=`)) || '').split('=')[1] || '';

const emulator = has('--emulator');
const dryRun = has('--dry-run');
if (emulator) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
  process.env.FIREBASE_EMULATOR_PROJECT_ID ||= 'demo-ka-clinic';
} else if (process.env.FIRESTORE_EMULATOR_HOST) {
  console.error('FIRESTORE_EMULATOR_HOST is set but --emulator was not passed. Refusing to guess the target.');
  process.exit(1);
} else if (!dryRun && !has('--send')) {
  console.error('Live data: pass --dry-run to preview, or --send to really send reminders.');
  process.exit(1);
}

process.env.CRON_SECRET ||= 'local-sweep-secret';

const { db } = await import('../api/_lib/firebaseAdmin.js');
const { manilaToday } = await import('../api/_lib/patientCompletion.js');
const { default: handler } = await import('../api/notifications.js');

const addDays = (iso, n) => {
  const [y, m, d] = iso.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + n, 12)).toISOString().slice(0, 10);
};

const today = opt('today') || manilaToday();

if (has('--seed')) {
  if (!emulator) {
    console.error('--seed only works with --emulator.');
    process.exit(1);
  }
  await db.collection('vaccinations').doc('sweep-test-patient').set({
    id: '2026-TEST',
    name: 'Sweep Test Patient',
    email: 'sweep.test@example.com',
    pushTokens: [],
    service: 'PEP',
    status: 'ongoing',
    isArchived: false,
    date: addDays(today, -3),
    doses: [
      { key: 'd1', n: 'Session 1 (Day 0)', date: addDays(today, -3), s: 'done', status: 'done', note: '' },
      { key: 'd2', n: 'Session 2 (Day 3)', date: today, s: 'pending', status: 'pending', note: '' },
      { key: 'd3', n: 'Session 3 (Day 7)', date: addDays(today, 1), s: 'pending', status: 'pending', note: '' },
      { key: 'd4', n: 'Session 4 (Day 28)', date: addDays(today, 25), s: 'pending', status: 'pending', note: '' },
    ],
    notifiedDoses: [],
    createdAt: Date.now(),
  });
  console.log(`Seeded vaccinations/sweep-test-patient: d2 due today (${today}), d3 due tomorrow (${addDays(today, 1)}).`);
}

// Minimal stand-ins for Vercel's request/response objects.
const req = {
  method: 'GET',
  url: '/api/notifications',
  query: { action: 'dose-sweep', ...(dryRun ? { dryRun: '1' } : {}), ...(opt('today') ? { today: opt('today') } : {}) },
  body: {},
  headers: { authorization: `Bearer ${process.env.CRON_SECRET}`, host: 'localhost:5199', 'x-forwarded-proto': 'http' },
};
const res = {
  statusCode: 200,
  status(code) { this.statusCode = code; return this; },
  json(body) { console.log(`\nHTTP ${this.statusCode}`); console.log(JSON.stringify(body, null, 2)); return this; },
  send(body) { console.log(`\nHTTP ${this.statusCode}`, body); return this; },
  setHeader() {},
};

console.log(`Target: ${emulator ? 'EMULATOR (demo-ka-clinic)' : `LIVE (${process.env.FIREBASE_PROJECT_ID})`} · ${dryRun ? 'dry run' : 'real run'} · today=${today}`);
await handler(req, res);

if (emulator && !dryRun && has('--seed')) {
  const after = (await db.collection('vaccinations').doc('sweep-test-patient').get()).data();
  const notes = await db.collection('patientNotifications').where('patientId', '==', 'sweep-test-patient').get();
  console.log('\nnotifiedDoses now:', after.notifiedDoses);
  console.log(`patientNotifications for the test patient: ${notes.size}`);
  notes.forEach(n => {
    const d = n.data();
    console.log(`  ${d.source}: "${d.title}" emailed=${d.emailed} emailError=${d.emailError} pushSent=${d.pushSent}`);
  });
}
process.exit(0);
