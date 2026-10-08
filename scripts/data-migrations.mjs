// One-time data migrations and repairs for the live Firestore data. Each
// command keeps its original safety switch: most are dry runs unless given
// --yes or --apply (see each section).
//
//   node --env-file=.env scripts/data-migrations.mjs fix-incidents
//   node --env-file=.env scripts/data-migrations.mjs migrate-pep-4session [--apply]
//   node --env-file=.env scripts/data-migrations.mjs normalize-dose-schedules [--apply]
//   node --env-file=.env scripts/data-migrations.mjs restore-early-archives [--yes]
//   node --env-file=.env scripts/data-migrations.mjs purge-removed-feature-data [--yes]
//   node --env-file=.env scripts/data-migrations.mjs fix-future-completions [--yes]
//   node --env-file=.env scripts/data-migrations.mjs report-category-i          (read-only)
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';
import { dirname } from 'node:path';
import { cert, getApps, initializeApp } from 'firebase-admin/app';
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import {
  getArchiveDueDate,
  isSeriesCompleted,
  lastDoseDate,
  manilaToday,
} from '../api/_lib/patientCompletion.js';

// The three former CommonJS scripts use require() and __dirname; both are
// provided here so their code runs unchanged.
const require = createRequire(import.meta.url);
const __dirname = dirname(fileURLToPath(import.meta.url));

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs fix-incidents — give every incident a real address and spread-out dates
// (the original script, unchanged, runs inside fixIncidentsCommand)
// ══════════════════════════════════════════════════════════════════════════
async function fixIncidentsCommand() {
const path = require('path');
const fs = require('fs');

const envPath = path.resolve(__dirname, '../.env');
if (fs.existsSync(envPath)) {
  const content = fs.readFileSync(envPath, 'utf8');
  content.split('\n').forEach(line => {
    const m = line.match(/^([^#=]+)=(.*)$/);
    if (m) process.env[m[1].trim()] = m[2].trim().replace(/^["']|["']$/g, '');
  });
}

const { initializeApp, cert } = require('firebase-admin/app');
const { getFirestore, Timestamp } = require('firebase-admin/firestore');

const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
const cred = JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
initializeApp({ credential: cert(cred) });
const db = getFirestore();

function addDays(isoStr, days) {
  const d = new Date(isoStr + 'T08:00:00');
  d.setDate(d.getDate() + days);
  return d.toISOString().slice(0, 10);
}

async function fixIncidents() {
  console.log('Fetching all incidents...');
  const snap = await db.collection('incidents').get();
  console.log(`Found ${snap.size} incidents to update.`);

  const todayIso = '2026-09-05';
  const docs = snap.docs;

  // Let's sort docs so completed/older ones get earlier dates, and recent ones get recent distinct dates
  // We can group by mrn or current date
  // To ensure every incident has a distinct or at most 1-2 per day date over the past 180 days:
  // 229 incidents over 180 days = ~1.2 incidents per day!
  // Let's distribute them from day -1 (yesterday 2026-09-04) back to day -175.
  
  // Create an array of 229 dates spread across 180 days
  const datePool = [];
  for (let d = 1; d <= 175; d++) {
    datePool.push(addDays(todayIso, -d));
    // on some days (every 3rd day), add a second incident
    if (d % 3 === 0 && datePool.length < docs.length) {
      datePool.push(addDays(todayIso, -d));
    }
  }
  // Fill any remainder
  while (datePool.length < docs.length) {
    const randomDay = Math.floor(Math.random() * 150) + 1;
    datePool.push(addDays(todayIso, -randomDay));
  }
  // Sort datePool descending (newest first)
  datePool.sort((a, b) => b.localeCompare(a));

  // Sort docs: docs with current date near today stay near the top, docs from months ago stay in the past
  docs.sort((a, b) => {
    const dateA = a.data().date || a.data().exposureDate || '';
    const dateB = b.data().date || b.data().exposureDate || '';
    return dateB.localeCompare(dateA);
  });

  let batch = db.batch();
  let count = 0;
  let batches = 0;

  for (let i = 0; i < docs.length; i++) {
    const docRef = docs[i].ref;
    const data = docs[i].data();
    
    const assignedDate = datePool[i];
    const exactAddress = data.address || `${data.zone ? data.zone + ', ' : ''}Brgy. ${data.barangay || 'San Juan'}, Libon, Albay`;
    
    batch.update(docRef, {
      location: exactAddress,
      address: exactAddress,
      date: assignedDate,
      exposureDate: assignedDate,
      createdAt: Timestamp.fromDate(new Date(`${assignedDate}T08:00:00`)),
    });
    count++;

    // If there's an associated vaccination record, keep its date and doses in sync
    if (data.mrn) {
      const vaxRef = db.collection('vaccinations').doc(data.mrn);
      batch.update(vaxRef, {
        date: assignedDate,
        createdAt: Timestamp.fromDate(new Date(`${assignedDate}T08:00:00`)),
      });
      count++;
    }

    if (count >= 400) {
      await batch.commit();
      batches++;
      console.log(`Committed batch #${batches}...`);
      batch = db.batch();
      count = 0;
    }
  }

  if (count > 0) {
    await batch.commit();
    batches++;
    console.log(`Committed final batch #${batches}.`);
  }

  console.log('All incidents successfully updated with exact address and diverse dates!');
}

fixIncidents().catch(console.error);
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs migrate-pep-4session — move PEP records to the 4-session regimen
// (the original script, unchanged, runs inside migratePep4SessionCommand)
// ══════════════════════════════════════════════════════════════════════════
async function migratePep4SessionCommand() {
// Migrates every PEP record from the 5-dose intramuscular Essen series
// (Day 0/3/7/14/28) to the 4-session intradermal Thai Red Cross regimen
// (Day 0/3/7/28).
//
// Hard reset, as specified: each record is rebuilt as exactly four sessions
// anchored to its own Day 0, carrying administered status across by position.
// The Day 14 dose has no equivalent in the ID regimen — if it was already
// marked given, that status carries into Session 4 (the record's last dose)
// so a dose that was actually administered is never silently downgraded to
// pending. Any surplus fifth entry is dropped.
//
// Usage:
//   node --env-file=.env scripts/data-migrations.mjs migrate-pep-4session            # dry run, writes nothing
//   node --env-file=.env scripts/data-migrations.mjs migrate-pep-4session --apply    # performs the migration
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 in the environment (see .env).

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

const SESSIONS = [
  { key: 'd1', label: 'Session 1 (Day 0)', day: 0 },
  { key: 'd2', label: 'Session 2 (Day 3)', day: 3 },
  { key: 'd3', label: 'Session 3 (Day 7)', day: 7 },
  { key: 'd4', label: 'Session 4 (Day 28)', day: 28 },
];

function addDays(dateStr, days) {
  const [y, m, d] = String(dateStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

const isDone = (dose) => {
  const st = String(dose?.status || dose?.s || '').toLowerCase();
  return st === 'done' || st === 'completed' || dose?.done === true;
};

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Load .env first.');
    process.exit(1);
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

(async () => {
  const app = initializeApp({ credential: cert(loadServiceAccount()) });
  const db = getFirestore(app);

  const snap = await db.collection('vaccinations').get();
  const pep = snap.docs.filter(d => String(d.data().service || '').trim().toUpperCase() === 'PEP');

  console.log(`${snap.size} patient records, ${pep.length} on PEP.`);
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — nothing will be written.\n');

  let migrated = 0;
  let alreadyOk = 0;
  let carriedFromDay14 = 0;
  const writes = [];

  for (const docSnap of pep) {
    const p = docSnap.data();
    const existing = Array.isArray(p.doses) ? p.doses : [];
    const day0 = String(p.date || '').slice(0, 10) || String(existing[0]?.date || '').slice(0, 10);

    if (!day0) {
      console.log(`  SKIP ${docSnap.id} (${p.name || 'unnamed'}) — no Day 0 date on the record.`);
      continue;
    }

    if (existing.length === SESSIONS.length && existing.every((d, i) => d.key === SESSIONS[i].key && d.n === SESSIONS[i].label)) {
      alreadyOk++;
      continue;
    }

    // Position 3 is the old Day 14 dose, which the ID regimen has no slot for.
    const oldDay14Done = existing.length >= 5 && isDone(existing[3]);
    const oldDay28Done = existing.length >= 5 && isDone(existing[4]);

    const rebuilt = SESSIONS.map((s, i) => {
      // Sessions 1-3 map straight across; session 4 is "the final dose", so it
      // counts as given if either of the old trailing doses was given.
      const done = i < 3 ? isDone(existing[i]) : (oldDay28Done || oldDay14Done);
      return {
        key: s.key,
        n: s.label,
        date: addDays(day0, s.day),
        status: done ? 'done' : 'pending',
        s: done ? 'done' : 'pending',
        note: existing[i]?.note || '',
      };
    });

    if (oldDay14Done && !oldDay28Done) carriedFromDay14++;

    const doneCount = rebuilt.filter(d => d.status === 'done').length;
    const status = doneCount === rebuilt.length ? 'completed' : 'ongoing';

    console.log(
      `  ${docSnap.id} ${(p.name || '').padEnd(26)} ${existing.length}→4 doses, ` +
      `${doneCount}/4 administered, Day 0 ${day0}`,
    );

    writes.push({ ref: docSnap.ref, data: { doses: rebuilt, dose: `${doneCount}/${rebuilt.length}`, status } });
    migrated++;
  }

  if (APPLY && writes.length) {
    // Firestore caps a batch at 500 operations.
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(w => batch.update(w.ref, w.data));
      await batch.commit();
    }
  }

  console.log(`\n${migrated} record(s) ${APPLY ? 'migrated' : 'would be migrated'}.`);
  console.log(`${alreadyOk} already on the 4-session schedule.`);
  if (carriedFromDay14) {
    console.log(`${carriedFromDay14} record(s) had an administered Day 14 dose carried into Session 4.`);
  }
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  process.exit(0);
})().catch(err => {
  console.error('Migration failed:', err);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs normalize-dose-schedules — bring non-PEP records onto the shared schedules
// (the original script, unchanged, runs inside normalizeDoseSchedulesCommand)
// ══════════════════════════════════════════════════════════════════════════
async function normalizeDoseSchedulesCommand() {
// Brings every non-PEP record onto the shared schedule definitions
// (ka-clinic-admin/src/lib/doseSchedules.js) without rewriting history.
//
// Two defects in the seeded data this repairs:
//
//   1. PrEP records carry the legacy 3-dose series (Day 0/7/21) while
//      registration now writes the WHO 2-dose series (Day 0/7).
//   2. Tetanus and Hepatitis B records have a dose labelled "6 Months" dated
//      about 34 days after Day 0 — the seed script's arithmetic was wrong, so
//      the stored date contradicts its own label by five months.
//
// The governing rule: a PENDING dose is a schedule and may be corrected; an
// ADMINISTERED dose is a record of something that happened and is left exactly
// as it is. So a wrongly-dated dose that was already given keeps its date, and
// a third PrEP dose that was already given is kept rather than deleted — those
// patients really did receive it under the older protocol.
//
// Usage:
//   node --env-file=.env scripts/data-migrations.mjs normalize-dose-schedules           # dry run
//   node --env-file=.env scripts/data-migrations.mjs normalize-dose-schedules --apply

const { cert, initializeApp } = require('firebase-admin/app');
const { getFirestore } = require('firebase-admin/firestore');

const APPLY = process.argv.includes('--apply');

// Mirrors src/lib/doseSchedules.js. Kept as plain data here because this
// script runs under Node against the live database, not through Vite.
const SCHEDULES = {
  PrEP: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (Day 7)', day: 7 },
  ],
  Tetanus: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
    { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
  ],
  Hepatitis: [
    { key: 'd1', label: 'Dose 1 (Day 0)', day: 0 },
    { key: 'd2', label: 'Dose 2 (1 Month)', month: 1 },
    { key: 'd3', label: 'Dose 3 (6 Months)', month: 6 },
  ],
  Pneumonia: [
    { key: 'd1', label: 'Pneumococcal Dose', day: 0 },
  ],
};

function addDays(dStr, days) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const dt = new Date(Date.UTC(y, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + days);
  return dt.toISOString().slice(0, 10);
}

function addMonths(dStr, months) {
  const [y, m, d] = String(dStr).slice(0, 10).split('-').map(Number);
  if (!y || !m || !d) return '';
  const target = new Date(Date.UTC(y, m - 1 + months, 1));
  const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
  target.setUTCDate(Math.min(d, lastDay));
  return target.toISOString().slice(0, 10);
}

const isDone = (dose) => {
  const st = String(dose?.status || dose?.s || '').toLowerCase();
  return st === 'done' || st === 'completed' || dose?.done === true;
};

const scheduledDate = (day0, spec) =>
  typeof spec.month === 'number' ? addMonths(day0, spec.month) : addDays(day0, spec.day || 0);

(async () => {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) { console.error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set.'); process.exit(1); }
  const app = initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  const db = getFirestore(app);

  const snap = await db.collection('vaccinations').get();
  console.log(APPLY ? 'APPLYING changes.\n' : 'DRY RUN — nothing will be written.\n');

  const writes = [];
  const summary = { datesCorrected: 0, extraPending: 0, extraKept: 0, untouched: 0 };

  for (const docSnap of snap.docs) {
    const p = docSnap.data();
    const service = String(p.service || '').trim();
    const spec = SCHEDULES[service];
    if (!spec) continue;                        // PEP handled by its own migration

    const existing = Array.isArray(p.doses) ? p.doses : [];
    if (existing.length === 0) continue;
    const day0 = String(p.date || existing[0]?.date || '').slice(0, 10);
    if (!day0) continue;

    const notes = [];
    const rebuilt = [];

    spec.forEach((s, i) => {
      const old = existing[i];
      const want = scheduledDate(day0, s);
      const administered = isDone(old);

      // An administered dose keeps the date it was recorded against.
      const date = administered ? (old?.date || want) : want;
      if (!administered && old?.date && old.date !== want) {
        notes.push(`${s.label}: ${old.date} → ${want}`);
        summary.datesCorrected++;
      }

      rebuilt.push({
        key: s.key,
        n: s.label,
        date,
        status: administered ? 'done' : 'pending',
        s: administered ? 'done' : 'pending',
        note: old?.note || '',
      });
    });

    // Anything beyond the current schedule: kept only if it actually happened.
    existing.slice(spec.length).forEach((extra, idx) => {
      if (isDone(extra)) {
        rebuilt.push({
          key: extra.key || `legacy${idx + 1}`,
          n: `${extra.n || extra.label || 'Additional dose'} (legacy schedule)`,
          date: extra.date || '',
          status: 'done',
          s: 'done',
          note: extra.note || '',
        });
        notes.push(`kept administered legacy dose "${extra.n || extra.label}"`);
        summary.extraKept++;
      } else {
        notes.push(`dropped pending legacy dose "${extra.n || extra.label}"`);
        summary.extraPending++;
      }
    });

    const changed =
      rebuilt.length !== existing.length ||
      rebuilt.some((d, i) => d.date !== existing[i]?.date || d.n !== (existing[i]?.n || existing[i]?.label));

    if (!changed) { summary.untouched++; continue; }

    const doneCount = rebuilt.filter(d => d.status === 'done').length;
    console.log(`  ${docSnap.id.padEnd(9)} ${service.padEnd(10)} ${existing.length}→${rebuilt.length} doses  ${notes.join('; ')}`);
    writes.push({
      ref: docSnap.ref,
      data: {
        doses: rebuilt,
        dose: `${doneCount}/${rebuilt.length}`,
        status: doneCount === rebuilt.length ? 'completed' : 'ongoing',
      },
    });
  }

  if (APPLY && writes.length) {
    for (let i = 0; i < writes.length; i += 400) {
      const batch = db.batch();
      writes.slice(i, i + 400).forEach(w => batch.update(w.ref, w.data));
      await batch.commit();
    }
  }

  console.log(`\n${writes.length} record(s) ${APPLY ? 'updated' : 'would be updated'}; ${summary.untouched} already correct.`);
  console.log(`  pending dose dates corrected: ${summary.datesCorrected}`);
  console.log(`  pending legacy doses dropped: ${summary.extraPending}`);
  console.log(`  administered legacy doses kept: ${summary.extraKept}`);
  if (!APPLY) console.log('\nRe-run with --apply to write these changes.');
  process.exit(0);
})().catch(err => { console.error('Normalization failed:', err); process.exit(1); });
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs restore-early-archives — apply the archive-a-year-after-completion rule
// (the original script, unchanged, runs inside restoreEarlyArchivesCommand)
// ══════════════════════════════════════════════════════════════════════════
async function restoreEarlyArchivesCommand() {
// One-time migration for the "archive a year after completion" rule.
//
// Before this rule, a patient moved to the Archive the moment their dose
// series completed (and staff could archive by hand). Now a completed record
// stays on the Patients list for 365 days after its completion date and the
// nightly sweep (api/notifications.js ?action=patient-archive-sweep) archives
// it. This script brings existing data in line with that:
//
//   1. completedAt — stamped on every completed record that lacks it, using the
//      date of the final dose in its schedule (the same fallback the dashboard
//      and the sweep use, so nothing visibly changes).
//   2. Early archives — a record archived before its 365 days were up is moved
//      back to the Patients list (isArchived false, archivedAt cleared). The
//      sweep re-archives it on its real date. The legacy retentionExpiryYear
//      field is removed too; the system no longer has a retention period and
//      nothing reads it.
//
// Records the sweep itself archived (archivedBy == 'auto-365') are never
// touched. Nothing is deleted.
//
// Usage:
//   node --env-file=.env scripts/data-migrations.mjs restore-early-archives         # dry run (default)
//   node --env-file=.env scripts/data-migrations.mjs restore-early-archives --yes   # apply

const BATCH_LIMIT = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/data-migrations.mjs restore-early-archives');
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

async function main() {
  const apply = process.argv.includes('--yes');
  if (!getApps().length) initializeApp({ credential: cert(loadServiceAccount()) });
  const db = getFirestore();
  const today = manilaToday();

  const snap = await db.collection('vaccinations').get();
  const writes = [];
  let stamped = 0;
  let restored = 0;

  for (const d of snap.docs) {
    const p = d.data();
    if (!isSeriesCompleted(p)) continue;

    const patch = {};
    if (!p.completedAt) {
      patch.completedAt = lastDoseDate(p);
      stamped++;
    }
    const due = getArchiveDueDate({ ...p, ...patch });
    if (p.isArchived && p.archivedBy !== 'auto-365' && due && today < due) {
      Object.assign(patch, {
        isArchived: false,
        archivedAt: FieldValue.delete(),
        retentionExpiryYear: FieldValue.delete(),
      });
      restored++;
      console.log(`  restore ${d.id}: completed ${patch.completedAt || p.completedAt}, archive due ${due}`);
    }
    if (Object.keys(patch).length) writes.push({ ref: d.ref, patch });
  }

  console.log(`\n${snap.size} record(s) scanned (today=${today})`);
  console.log(`  completedAt to stamp:   ${stamped}`);
  console.log(`  early archives restore: ${restored}`);

  if (!apply) {
    console.log('\nDry run — nothing written. Re-run with --yes to apply.');
    return;
  }
  for (let i = 0; i < writes.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    writes.slice(i, i + BATCH_LIMIT).forEach(({ ref, patch }) => batch.update(ref, patch));
    await batch.commit();
  }
  console.log(`\nApplied ${writes.length} update(s).`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs purge-removed-feature-data — delete data left by the removed wound-photo feature
// (the original script, unchanged, runs inside purgeRemovedFeatureDataCommand)
// ══════════════════════════════════════════════════════════════════════════
async function purgeRemovedFeatureDataCommand() {
// One-time, IRREVERSIBLE purge of data left behind by the removed patient-facing
// wound-photo / symptom-monitoring feature. Two targets only:
//
//   1. `vaccinations/{mrn}.woundLog` — the array of patient-submitted wound
//      photos, recovery notes and symptom tags. The field is DELETED from each
//      document (FieldValue.delete(), not set to []) so no residue remains.
//      The vaccination record itself is never deleted — every other field
//      (doses, category, MRN, email, clinical notes) is left exactly as-is.
//   2. `symptomReports/*` — the legacy per-document symptom-check collection.
//      Never wired to any UI, but purged here if any documents exist.
//
// DELIBERATELY OUT OF SCOPE — the `incidents` collection.
// The admin dashboard's Incident Map (ka-clinic-admin/src/features/incidents/IncidentMapPage.jsx)
// is an active clinic tool, NOT leftovers from the removed patient feature.
// This script never reads, writes, or deletes anything in `incidents`.
//
// Usage:
//   node --env-file=.env scripts/data-migrations.mjs purge-removed-feature-data         # dry run (default)
//   node --env-file=.env scripts/data-migrations.mjs purge-removed-feature-data --yes   # actually delete
//
// Requires FIREBASE_SERVICE_ACCOUNT_BASE64 and FIREBASE_PROJECT_ID (see
// .env.example) — the same env vars scripts/sample-patients.js remove uses.

// Every collection this script is allowed to touch. `incidents` is absent by
// design; see the header note.
const VACCINATIONS = 'vaccinations';
const SYMPTOM_REPORTS = 'symptomReports';

const BATCH_LIMIT = 400; // Firestore hard cap is 500 writes per batch.
const PAGE_SIZE = 400;

function loadServiceAccount() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) {
    throw new Error(
      'FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/data-migrations.mjs purge-removed-feature-data'
    );
  }
  return JSON.parse(Buffer.from(b64, 'base64').toString('utf8'));
}

// Scans every vaccinations doc and strips `woundLog` from the ones that carry
// it. Reads the whole collection rather than querying, because Firestore has no
// "field exists" filter — and the collection is one doc per patient, so it is
// small enough to walk.
async function purgeWoundLogs(db, dryRun) {
  const snap = await db.collection(VACCINATIONS).get();

  const affected = snap.docs.filter(d => d.get('woundLog') !== undefined);
  const entryCount = affected.reduce((sum, d) => {
    const log = d.get('woundLog');
    return sum + (Array.isArray(log) ? log.length : 0);
  }, 0);
  const photoCount = affected.reduce((sum, d) => {
    const log = d.get('woundLog');
    return sum + (Array.isArray(log) ? log.filter(e => e && e.photoUrl).length : 0);
  }, 0);

  console.log(`  ${VACCINATIONS}: ${snap.size} record(s) scanned`);
  console.log(`  ${VACCINATIONS}: ${affected.length} record(s) carry a woundLog field`);
  console.log(`  ${VACCINATIONS}: ${entryCount} log entr(ies), ${photoCount} of them with a photo URL`);

  if (affected.length > 0) {
    console.log('  affected record ids:');
    for (const d of affected) {
      const log = d.get('woundLog');
      const n = Array.isArray(log) ? log.length : 0;
      console.log(`    - ${d.id} (${n} entr${n === 1 ? 'y' : 'ies'})`);
    }
  }

  if (dryRun || affected.length === 0) return { docs: affected.length, entries: entryCount };

  let batch = db.batch();
  let ops = 0;
  let done = 0;
  for (const d of affected) {
    batch.update(d.ref, { woundLog: FieldValue.delete() });
    ops++;
    if (ops >= BATCH_LIMIT) {
      await batch.commit();
      done += ops;
      console.log(`  ${VACCINATIONS}: cleared ${done}...`);
      batch = db.batch();
      ops = 0;
    }
  }
  if (ops > 0) {
    await batch.commit();
    done += ops;
  }
  console.log(`  ${VACCINATIONS}: cleared woundLog from ${done} record(s)`);

  return { docs: affected.length, entries: entryCount };
}

// Deletes every symptomReports doc. Re-queries from the start each round rather
// than paginating with a cursor, because the deletes shift the result set
// underneath a cursor.
async function purgeSymptomReports(db, dryRun) {
  const col = db.collection(SYMPTOM_REPORTS);
  let total = 0;

  for (;;) {
    const snap = await col.limit(PAGE_SIZE).get();
    if (snap.empty) break;

    if (dryRun) {
      // Nothing is deleted, so the same page would come back forever — count
      // this page and stop paging.
      total += snap.size;
      if (snap.size >= PAGE_SIZE) {
        console.log(`  ${SYMPTOM_REPORTS}: at least ${total} doc(s) (dry run stops counting here)`);
      }
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
    console.log(`  ${SYMPTOM_REPORTS}: deleted ${total}...`);
    if (snap.size < PAGE_SIZE) break;
  }

  console.log(`  ${SYMPTOM_REPORTS}: ${total} doc(s)${dryRun ? ' found' : ' deleted'}`);
  return total;
}

async function main() {
  const dryRun = !process.argv.slice(2).includes('--yes');

  const app = getApps().length
    ? getApps()[0]
    : initializeApp({
        credential: cert(loadServiceAccount()),
        projectId: process.env.FIREBASE_PROJECT_ID,
      });
  const db = getFirestore(app);

  if (dryRun) {
    console.log('DRY RUN — nothing will be deleted.\n');
  } else {
    console.log('LIVE RUN — this permanently deletes data.\n');
  }
  console.log(`Project: ${process.env.FIREBASE_PROJECT_ID || '(from service account)'}`);
  console.log(`In scope: ${VACCINATIONS}.woundLog, ${SYMPTOM_REPORTS}`);
  console.log('Out of scope: incidents (admin Incident Map — never touched by this script)\n');

  const wound = await purgeWoundLogs(db, dryRun);
  console.log('');
  const symptoms = await purgeSymptomReports(db, dryRun);

  console.log('\n── Summary ─────────────────────────────');
  if (dryRun) {
    console.log(`Would clear woundLog from ${wound.docs} vaccination record(s) (${wound.entries} log entries).`);
    console.log(`Would delete ${symptoms} symptomReports document(s).`);
    console.log('No vaccination record is deleted — only the woundLog field is removed.');
    console.log('\nRe-run with --yes to permanently apply this.');
  } else {
    console.log(`Cleared woundLog from ${wound.docs} vaccination record(s) (${wound.entries} log entries removed).`);
    console.log(`Deleted ${symptoms} symptomReports document(s).`);
  }
  console.log('The incidents collection was not read, written, or deleted.');
}

main().catch(err => {
  console.error('purge-removed-feature-data failed:', err);
  process.exit(1);
});
}

// ══════════════════════════════════════════════════════════════════════════
// Command dispatch: the first argument picks the command; it is removed
// from process.argv so each command sees exactly the arguments it always did.
// ══════════════════════════════════════════════════════════════════════════
// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs fix-future-completions — undo doses marked given on a future date
// ══════════════════════════════════════════════════════════════════════════
// Older sample-data generators could mark a dose "done" with a date after the
// day they ran, and mark the record completed early. The generators now apply
// scripts/seed-rules.mjs; this repairs records already in Firestore with the
// same rules, using today's date in Manila:
//   - a dose marked done with a future date goes back to pending (brand and
//     note cleared, as the tracker's Undo does);
//   - a record stays "completed" only if every dose is done on or before
//     today; otherwise it becomes "ongoing" and completedAt is removed;
//   - a completedAt in the future is replaced by the last dose date;
//   - the "x/y" dose counter is recalculated.
// Stock is not touched: these doses were written by generators, not given
// through the tracker, so no vial was deducted for them. Archived records are
// skipped. A JSON backup of every changed record is written before applying.
//
// Usage:
//   node --env-file=.env scripts/data-migrations.mjs fix-future-completions         # dry run (default)
//   node --env-file=.env scripts/data-migrations.mjs fix-future-completions --yes   # apply
async function fixFutureCompletionsCommand() {
  const apply = process.argv.includes('--yes');
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/data-migrations.mjs fix-future-completions');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  const db = getFirestore();
  const today = manilaToday();

  const dateOnly = raw => {
    if (!raw) return '';
    if (typeof raw === 'string') return raw.slice(0, 10);
    if (typeof raw?.toDate === 'function') return manilaToday(raw.toDate());
    if (typeof raw === 'number' || raw instanceof Date) return manilaToday(new Date(raw));
    return '';
  };
  const isDone = d => {
    const st = String(d?.s || d?.status || '').toLowerCase();
    return st === 'done' || st === 'completed' || d?.done === true;
  };

  const snap = await db.collection('vaccinations').get();
  const changes = [];
  for (const d of snap.docs) {
    const p = d.data();
    if (p.isArchived || !Array.isArray(p.doses) || !p.doses.length) continue;

    let dosesChanged = false;
    const doses = p.doses.map(x => {
      if (!isDone(x) || dateOnly(x.date) <= today) return x;
      dosesChanged = true;
      const y = { ...x, s: 'pending', status: 'pending', note: '' };
      if ('brand' in y) y.brand = '';
      if ('done' in y) y.done = false;
      return y;
    });
    const allDone = doses.every(x => isDone(x) && dateOnly(x.date) && dateOnly(x.date) <= today);
    const lastDate = doses.map(x => dateOnly(x.date)).filter(Boolean).sort().pop() || '';

    const patch = {};
    if (dosesChanged) {
      patch.doses = doses;
      if (p.dose !== undefined) patch.dose = `${doses.filter(isDone).length}/${doses.length}`;
    }
    if (p.status === 'completed' && !allDone) {
      patch.status = 'ongoing';
      if (p.completedAt !== undefined) patch.completedAt = FieldValue.delete();
    } else if (allDone && p.completedAt && dateOnly(p.completedAt) > today) {
      patch.completedAt = lastDate;
    }
    if (!Object.keys(patch).length) continue;

    changes.push({ ref: d.ref, id: d.id, before: p, patch });
    const reverted = p.doses.filter((x, i) => x !== doses[i]).map(x => `${x.key}@${dateOnly(x.date)}`);
    console.log(`  ${d.id} (${p.service}): ${p.status} -> ${patch.status || p.status}`
      + (reverted.length ? `, back to pending: ${reverted.join(' ')}` : '')
      + (patch.dose ? `, dose ${p.dose} -> ${patch.dose}` : ''));
  }

  console.log(`
${snap.size} record(s) scanned (today=${today}), ${changes.length} to fix.`);
  if (!apply) {
    console.log('Dry run — nothing written. Re-run with --yes to apply.');
    return;
  }
  if (!changes.length) return;

  const { writeFileSync } = await import('node:fs');
  const backup = `future-completions-backup-${Date.now()}.json`;
  writeFileSync(backup, JSON.stringify(changes.map(c => ({ id: c.id, before: c.before })), null, 2));
  console.log(`Backup of the original records: ${backup}`);

  const batch = db.batch();
  changes.forEach(({ ref, patch }) => batch.update(ref, patch));
  await batch.commit();
  console.log(`Applied ${changes.length} update(s).`);
}

// ══════════════════════════════════════════════════════════════════════════
// node --env-file=.env scripts/data-migrations.mjs report-category-i — list records still using Category I
// ══════════════════════════════════════════════════════════════════════════
// Category I is no longer used: exposure categories start at Category II.
// Clinical data is never changed automatically, so this only REPORTS the
// vaccination records and incident pins that still carry Category I (for a
// PEP patient that is a clinical judgement someone has to re-make).
// Read-only: nothing is written.
async function reportCategoryICommand() {
  const b64 = process.env.FIREBASE_SERVICE_ACCOUNT_BASE64;
  if (!b64) throw new Error('FIREBASE_SERVICE_ACCOUNT_BASE64 is not set. Run with: node --env-file=.env scripts/data-migrations.mjs report-category-i');
  if (!getApps().length) initializeApp({ credential: cert(JSON.parse(Buffer.from(b64, 'base64').toString('utf8'))) });
  const db = getFirestore();
  const isCatI = v => /^(category\s*)?i$/i.test(String(v ?? '').trim());
  const name = p => p.name || [p.fname, p.mname, p.lname].filter(Boolean).join(' ') || '(no name)';

  const vax = await db.collection('vaccinations').get();
  const vaxHits = vax.docs.map(d => ({ id: d.id, ...d.data() })).filter(p => isCatI(p.cat) || isCatI(p.category));
  console.log(`vaccinations: ${vaxHits.length} of ${vax.size} use Category I`);
  vaxHits
    .sort((a, b) => String(a.id).localeCompare(String(b.id)))
    .forEach(p => console.log(`  ${String(p.id).padEnd(10)} ${name(p).padEnd(28)} ${String(p.date || '').slice(0, 10)}  service=${p.service || '?'}${p.isArchived ? '  (archived)' : ''}`));

  const inc = await db.collection('incidents').get();
  const incHits = inc.docs.map(d => ({ id: d.id, ...d.data() })).filter(i => isCatI(i.category) || isCatI(i.cat));
  console.log('');
  console.log(`incidents: ${incHits.length} of ${inc.size} use Category I (pins carry no patient name by design)`);
  incHits.forEach(i => console.log(`  ${i.id}  ${String(i.date || '').slice(0, 10)}  ${i.barangay || i.location || ''}${i.mapHidden ? '  (hidden from map)' : ''}`));
  console.log('');
  console.log('Report only: nothing was changed.');
}

// fix-incidents wrote a real "exact address" onto every incident. The study's
// ethics rules forbid that (docs/STUDY_MODE.md), so it is refused; use
// scripts/seed-simulated-incidents.mjs instead.
const refuseFixIncidents = async () => {
  console.error('fix-incidents is disabled: the Incident Map holds simulated data only (docs/STUDY_MODE.md). Use scripts/seed-simulated-incidents.mjs.');
  process.exit(1);
};

const COMMANDS = {
  'fix-incidents': refuseFixIncidents,
  'migrate-pep-4session': migratePep4SessionCommand,
  'normalize-dose-schedules': normalizeDoseSchedulesCommand,
  'restore-early-archives': restoreEarlyArchivesCommand,
  'purge-removed-feature-data': purgeRemovedFeatureDataCommand,
  'fix-future-completions': fixFutureCompletionsCommand,
  'report-category-i': reportCategoryICommand,
};

async function runCommand() {
  const command = process.argv[2];
  if (!Object.prototype.hasOwnProperty.call(COMMANDS, command)) {
    console.error('Usage: node --env-file=.env scripts/data-migrations.mjs <fix-incidents|migrate-pep-4session|normalize-dose-schedules|restore-early-archives|purge-removed-feature-data|fix-future-completions|report-category-i> [options]');
    process.exit(1);
  }
  process.argv.splice(2, 1);
  await COMMANDS[command]();
}

await runCommand();
