// Seeds the Incident Map with SIMULATED test pins (thesis study, see
// docs/STUDY_MODE.md). Random coordinates, no address / barangay / patient,
// not linked to any record (ka-clinic-admin/src/lib/simulatedIncidents.js).
//
//   node --env-file=.env scripts/seed-simulated-incidents.mjs [--count 30] [--dry-run]
//   node --env-file=.env scripts/seed-simulated-incidents.mjs --purge-nonsimulated   (asks for --yes)
//
// Writes docs sim-001 … sim-NNN (re-running replaces them). The map only ever
// shows isSimulated == true, so any older non-simulated incident stays
// invisible; --purge-nonsimulated --yes deletes those older docs for good.
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';
import { buildSimulatedIncidents } from '../ka-clinic-admin/src/lib/simulatedIncidents.js';

const args = process.argv.slice(2);
const flag = (name) => args.includes(name);
const countArg = args.indexOf('--count');
const count = countArg !== -1 ? Math.max(1, Math.min(200, Number(args[countArg + 1]) || 30)) : 30;

if (!getApps().length) {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64 && !process.env.FIRESTORE_EMULATOR_HOST) {
    console.error('Set FIREBASE_SERVICE_ACCOUNT_BASE64 (or FIRESTORE_EMULATOR_HOST).');
    process.exit(1);
  }
  initializeApp(b64 ? { credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) } : { projectId: process.env.GCLOUD_PROJECT || 'demo-ka-clinic' });
}
const db = getFirestore();

const today = new Date(Date.now() + 8 * 3600 * 1000).toISOString().slice(0, 10);
const pins = buildSimulatedIncidents({ count, seed: count, todayIso: today, extra: { isSeedData: true } });

if (flag('--purge-nonsimulated')) {
  const snap = await db.collection('incidents').get();
  const real = snap.docs.filter(d => d.data().isSimulated !== true);
  console.log(`${real.length} non-simulated incident doc(s) found.`);
  if (!flag('--yes')) {
    console.log('Nothing deleted. Re-run with --purge-nonsimulated --yes to delete them permanently.');
    process.exit(0);
  }
  for (let i = 0; i < real.length; i += 400) {
    const batch = db.batch();
    real.slice(i, i + 400).forEach(d => batch.delete(d.ref));
    await batch.commit();
  }
  console.log(`Deleted ${real.length} non-simulated incident doc(s).`);
  process.exit(0);
}

if (flag('--dry-run')) {
  console.log(`Would write ${pins.length} simulated pins, e.g.`, pins.slice(0, 2));
  process.exit(0);
}
const batch = db.batch();
pins.forEach(p => batch.set(db.collection('incidents').doc(p.id), p.data));
await batch.commit();
console.log(`Wrote ${pins.length} simulated incident pins (sim-001 … sim-${String(pins.length).padStart(3, '0')}).`);
