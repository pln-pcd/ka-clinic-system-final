// Consistency check for the clinic data (read-only).
//
//   node --env-file=.env scripts/verify-sample-data.mjs            live project
//   node scripts/verify-sample-data.mjs --emulator                 local emulator
//   ... --json <file>   also writes the expected screen numbers to <file>
//
// 1. Integrity rules on the data itself (pins, archive dates, dose strings,
//    Category I / DTaP / infants / future completions, stock vs doses,
//    exposure types, RIG values).
// 2. The numbers each screen should show, computed with the app's own dose
//    logic (buildDoses) and the same filters the screens use. The browser
//    check compares these with what the screens actually display.
import { writeFileSync } from 'node:fs';

const args = process.argv.slice(2);
if (args.includes('--emulator')) {
  process.env.FIRESTORE_EMULATOR_HOST ||= '127.0.0.1:8080';
  process.env.FIREBASE_AUTH_EMULATOR_HOST ||= '127.0.0.1:9099';
}
const { db } = await import('../api/_lib/firebaseAdmin.js');
const { buildDoses } = await import('../ka-clinic-admin/src/lib/doseSchedules.js');
const { addDaysToDateString, getTodayDateString } = await import('../ka-clinic-admin/src/lib/formatters.js');
const { getArchiveClockStart } = await import('../api/_lib/patientCompletion.js');

const T = getTodayDateString();
const all = async c => (await db.collection(c).get()).docs.map(d => ({ _id: d.id, ...d.data() }));
const [vax, incidents, inventory, movements, appts, threads] = await Promise.all(
  ['vaccinations', 'incidents', 'inventory', 'stockMovements', 'appointments', 'chatThreads'].map(all));
const dayOf = v => {
  if (!v) return '';
  if (typeof v === 'string') return v.slice(0, 10);
  if (typeof v?.toDate === 'function') return getTodayDateString(v.toDate());
  if (typeof v === 'number') return getTodayDateString(new Date(v));
  return '';
};

const results = [];
const check = (name, problems) => results.push({ name, ok: problems.length === 0, detail: problems.length ? problems.slice(0, 4).join('; ') + (problems.length > 4 ? ` (+${problems.length - 4} more)` : '') : '' });

// Status as the Tracker derives it (from the same buildDoses the app uses).
const trackerStatus = p => {
  const doses = buildDoses(p);
  if (!doses.length) return 'in-progress';
  if (doses.every(d => d.status === 'done')) return 'completed';
  if (doses.some(d => d.status === 'miss' || (d.status === 'pending' && d.date < T))) return 'overdue';
  return 'in-progress';
};

/* ── Integrity ── */
check('Dose progress string matches the doses given', vax.flatMap(p => {
  const d = p.doses || [];
  const done = d.filter(x => x.status === 'done').length;
  return p.dose === `${done}/${d.length}` ? [] : [`${p._id}: "${p.dose}" vs ${done}/${d.length}`];
}));
check('No dose marked given after today', vax.flatMap(p => (p.doses || []).filter(d => d.status === 'done' && d.date > T).map(d => `${p._id} ${d.key} ${d.date}`)));
check('Completed only when every dose is given; completedAt = last dose date, never future', vax.flatMap(p => {
  const d = p.doses || [];
  const allDone = d.length > 0 && d.every(x => x.status === 'done');
  const out = [];
  if ((p.status === 'completed') !== allDone) out.push(`${p._id}: status ${p.status}, allDone ${allDone}`);
  if (allDone && p.completedAt !== d[d.length - 1].date) out.push(`${p._id}: completedAt ${p.completedAt} vs last dose ${d[d.length - 1].date}`);
  if (p.completedAt && p.completedAt > T) out.push(`${p._id}: completedAt in the future`);
  if (!allDone && p.completedAt) out.push(`${p._id}: completedAt on an unfinished record`);
  return out;
}));
check('No Category I anywhere', [
  ...vax.filter(p => /^(category\s*)?i$/i.test(String(p.cat || '').trim())).map(p => `record ${p._id}`),
  ...incidents.filter(i => /^(category\s*)?i$/i.test(String(i.category || '').trim())).map(i => `pin ${i._id}`),
]);
check('PEP records are Category II or III; bat = III; every Category III has ERIG', vax.filter(p => p.service === 'PEP').flatMap(p => {
  const out = [];
  if (!['II', 'III'].includes(p.cat)) out.push(`${p._id}: cat "${p.cat}"`);
  if (p.cat === 'III' && !/ERIG/.test(p.rigGiven || '')) out.push(`${p._id}: Category III without ERIG`);
  if (/bat/i.test(p.animal || '') && p.cat !== 'III') out.push(`${p._id}: bat exposure is Category ${p.cat}, must be III`);
  return out;
}));
check('Type of exposure is Bite or Scratch; RIG is No or ERIG; no HRIG stock', [
  ...vax.filter(p => p.service === 'PEP' && !['Bite', 'Scratch'].includes(p.typeOfExposure)).map(p => `${p._id}: exposure "${p.typeOfExposure || ''}"`),
  ...vax.filter(p => p.rigGiven && !['No', 'Yes (ERIG)'].includes(p.rigGiven)).map(p => `${p._id}: RIG "${p.rigGiven}"`),
  ...inventory.filter(i => /hrig|human rabies immunoglobulin/i.test(i.name || '')).map(i => `inventory ${i._id}: ${i.name}`),
]);
check('No DTaP service, no infants (under 1 year)', vax.flatMap(p => {
  const out = [];
  if (/dtap/i.test(p.service || '')) out.push(`${p._id}: DTaP`);
  if (!(Number(p.age) >= 1)) out.push(`${p._id}: age "${p.age}"`);
  return out;
}));
check('Archived: archivedBy "auto-365", archivedAt = clock start + 365 days', vax.filter(p => p.isArchived).flatMap(p => {
  const out = [];
  if (p.archivedBy !== 'auto-365') out.push(`${p._id}: archivedBy ${p.archivedBy}`);
  const expected = addDaysToDateString(getArchiveClockStart(p), 365);
  if (dayOf(p.archivedAt) !== expected) out.push(`${p._id}: archivedAt ${dayOf(p.archivedAt)} vs ${expected}`);
  if (p.status !== 'completed') out.push(`${p._id}: archived but not completed`);
  return out;
}));
check('No completed record is past its archive date but still active', vax.filter(p => !p.isArchived && p.status === 'completed').flatMap(p => {
  const due = addDaysToDateString(getArchiveClockStart(p), 365);
  return due <= T ? [`${p._id}: due ${due}`] : [];
}));

// Pins
const linked = new Map();
const pinProblems = [];
vax.forEach(p => {
  const ids = p.incidentIds || [];
  if (ids.length > 1) pinProblems.push(`${p._id}: ${ids.length} pins`);
  ids.forEach(id => { if (linked.has(id)) pinProblems.push(`pin ${id} linked twice`); linked.set(id, p); });
});
incidents.forEach(i => {
  const p = linked.get(i._id);
  if (!p) { pinProblems.push(`orphan pin ${i._id}`); return; }
  if (p.service !== 'PEP') pinProblems.push(`${i._id}: linked to ${p.service} record ${p._id}`);
  if (i.category !== `Category ${p.cat}`) pinProblems.push(`${i._id}: ${i.category} vs record Category ${p.cat}`);
  const done = trackerStatus(p) === 'completed';
  if (done && !(i.mapHidden === true && i.mapHiddenReason === 'patient-completed')) pinProblems.push(`${i._id}: record ${p._id} completed but pin visible`);
  if (!done && i.mapHidden === true) pinProblems.push(`${i._id}: record ${p._id} ongoing but pin hidden`);
});
[...linked.keys()].forEach(id => { if (!incidents.some(i => i._id === id)) pinProblems.push(`record ${linked.get(id)._id} links missing pin ${id}`); });
check('Pins: one per PEP record, visible only while ongoing, no orphans', pinProblems);

// Stock
const stockProblems = [];
inventory.forEach(it => {
  const mv = movements.filter(m => m.itemId === it._id);
  if (!mv.length) return; // untracked items (no movements)
  const net = mv.reduce((n, m) => n + (m.direction === 'receive' ? m.qty : m.direction === 'restore' ? m.qty : -m.qty), 0);
  if (net !== Number(it.stock)) stockProblems.push(`${it.name}: stock ${it.stock} vs movements ${net}`);
  const opening = mv.filter(m => m.direction === 'receive').reduce((n, m) => n + m.qty, 0);
  const given = vax.reduce((n, p) => n + (p.doses || []).filter(d => d.status === 'done' && d.stockItemId === it._id).length, 0)
    + vax.filter(p => p.cat === 'III' && /ERIG/.test(p.rigGiven || '') && (p.doses || [])[0]?.status === 'done' && /ERIG/.test(it.name)).length;
  if (opening - given !== Number(it.stock)) stockProblems.push(`${it.name}: opening ${opening} − given ${given} ≠ stock ${it.stock}`);
});
check('Inventory stock = opening stock − doses given', stockProblems);
check('Appointments on weekends only', appts.filter(a => ![0, 6].includes(new Date(`${a.date}T12:00:00Z`).getUTCDay())).map(a => `${a._id} ${a.date}`));

/* ── Expected screen numbers ── */
const active = vax.filter(p => !p.isArchived);
const monthPrefix = T.slice(0, 7);
const expected = {
  today: T,
  dashboard: {
    totalPatients: active.length,
    todayAppointments: appts.filter(a => a.date === T && ['confirmed', 'accepted', 'pending'].includes(String(a.status || 'pending'))).length,
    unreadMessages: threads.filter(t => t.unread === true).length,
    lowStock: inventory.filter(d => (d.quantity ?? d.stock ?? 0) < 10 || d.status === 'critical' || d.status === 'warning').length,
  },
  tracker: {
    total: active.filter(p => p.status !== 'completed' && p.status !== 'archived').length,
    completed: active.filter(p => p.status === 'completed' || p.status === 'archived' || trackerStatus(p) === 'completed').length,
    inProgress: active.filter(p => p.status !== 'completed' && p.status !== 'archived' && trackerStatus(p) === 'in-progress').length,
    overdue: active.filter(p => p.status !== 'completed' && p.status !== 'archived' && trackerStatus(p) === 'overdue').length,
  },
  patientsList: active.length,
  archiveList: vax.filter(p => p.isArchived).length,
  incidentMap: incidents.filter(i => i.mapHidden !== true).length,
  exportMonthly: vax.filter(p => String(p.date || '').startsWith(monthPrefix)).length,
  exportAllTime: vax.length,
};

console.log(`\nData checks (${args.includes('--emulator') ? 'emulator' : 'live'}, today ${T})`);
console.log('─'.repeat(96));
results.forEach(r => console.log(`${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${r.ok ? '' : `\n      ${r.detail}`}`));
console.log('─'.repeat(96));
console.log('Expected screen numbers:', JSON.stringify(expected, null, 1));
const jsonAt = args.indexOf('--json');
if (jsonAt !== -1) writeFileSync(args[jsonAt + 1], JSON.stringify({ expected, results }, null, 1));
process.exit(results.every(r => r.ok) ? 0 : 1);
